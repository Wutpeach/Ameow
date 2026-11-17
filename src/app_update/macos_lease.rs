use super::store::{exclusive, plain};
use std::{
    fs::{self, File},
    os::{fd::{AsRawFd, FromRawFd}, unix::{fs::MetadataExt, process::CommandExt}},
    path::{Path, PathBuf},
    process::{Child, Command},
    sync::{Mutex, OnceLock},
};

const LEASE_ENV: &str = "AMEOW_UPDATE_LEASE_FD";
static PROCESS_LEASE: OnceLock<Mutex<Option<(PathBuf, File)>>> = OnceLock::new();

unsafe extern "C" {
    fn fcntl(fd: i32, command: i32, ...) -> i32;
    fn flock(fd: i32, operation: i32) -> i32;
}

fn inherited_file(descriptor: i32) -> Result<File, String> {
    if descriptor < 3 || unsafe { fcntl(descriptor, 1) } < 0 {
        return Err("E_APP_UPDATE_LEASE_FD".into());
    }
    Ok(unsafe { File::from_raw_fd(descriptor) })
}

fn adopt(path: &Path, descriptor: i32) -> Result<File, String> {
    adopt_file(path, inherited_file(descriptor)?)
}

fn adopt_file(path: &Path, file: File) -> Result<File, String> {
    plain(path)?;
    let expected = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    let actual = file.metadata().map_err(|e| e.to_string())?;
    if !expected.is_file() || !actual.is_file() || expected.dev() != actual.dev()
        || expected.ino() != actual.ino() {
        return Err("E_APP_UPDATE_LEASE_IDENTITY".into());
    }
    if unsafe { flock(file.as_raw_fd(), 2 | 4) } != 0
        || unsafe { fcntl(file.as_raw_fd(), 2, 1) } != 0 {
        return Err(format!("E_APP_UPDATE_LEASE: {}", std::io::Error::last_os_error()));
    }
    Ok(file)
}

pub(super) fn acquire_for_process(root: &Path) -> Result<(), String> {
    let mut slot = PROCESS_LEASE.get_or_init(|| Mutex::new(None)).lock()
        .map_err(|_| "E_APP_UPDATE_LEASE")?;
    let (path, gate) = process_gate(root)?;
    if let Some((existing, _)) = slot.as_ref() {
        return if *existing == path { Ok(()) } else { Err("E_APP_UPDATE_LEASE_IDENTITY".into()) };
    }
    let file = match std::env::var(LEASE_ENV) {
        Ok(value) => adopt(&path, value.parse().map_err(|_| "E_APP_UPDATE_LEASE_FD")?)?,
        Err(std::env::VarError::NotPresent) => match gate {
            Some(file) => lock(file)?,
            None => exclusive(&path)?,
        },
        Err(_) => return Err("E_APP_UPDATE_LEASE_FD".into()),
    };
    *slot = Some((path, file));
    Ok(())
}

pub(super) fn acquire_for_helper(root: &Path) -> Result<File, String> {
    let (path, gate) = process_gate(root)?;
    match gate { Some(file) => lock(file), None => exclusive(&path) }
}

fn process_gate(root: &Path) -> Result<(PathBuf, Option<File>), String> {
    if let Ok(bundle) = super::macos::current_bundle()
        && let Some(file) = super::macos_privileged::existing_gate(&bundle)? {
        return Ok((super::macos_privileged::gate_path(&bundle), Some(file)));
    }
    Ok((root.join("app-instance.lock"), None))
}

fn lock(file: File) -> Result<File, String> {
    if unsafe { flock(file.as_raw_fd(), 2 | 4) } != 0 {
        return Err(format!("E_APP_UPDATE_LEASE: {}", std::io::Error::last_os_error()));
    }
    Ok(file)
}

pub(super) fn adopt_for_target(target: &Path) -> Result<File, String> {
    let descriptor = std::env::var(LEASE_ENV).map_err(|_| "E_APP_UPDATE_LEASE_FD")?
        .parse().map_err(|_| "E_APP_UPDATE_LEASE_FD")?;
    let file = inherited_file(descriptor)?;
    super::macos_privileged::existing_gate(target)?.ok_or("E_APP_UPDATE_PRIVILEGED_GATE")?;
    adopt_file(&super::macos_privileged::gate_path(target), file)
}

pub(super) fn promote_for_process(target: &Path) -> Result<(), String> {
    let mut slot = PROCESS_LEASE.get_or_init(|| Mutex::new(None)).lock().map_err(|_| "E_APP_UPDATE_LEASE")?;
    let path = super::macos_privileged::gate_path(target);
    if slot.as_ref().is_some_and(|(existing, _)| *existing == path) { return Ok(()); }
    let file = super::macos_privileged::existing_gate(target)?.ok_or("E_APP_UPDATE_PRIVILEGED_GATE")?;
    *slot = Some((path, lock(file)?));
    Ok(())
}

pub(super) fn spawn_with_lease(command: &mut Command, lease: &File) -> Result<Child, String> {
    let inherited = lease.try_clone().map_err(|e| e.to_string())?;
    let descriptor = inherited.as_raw_fd();
    if descriptor < 3 { return Err("E_APP_UPDATE_LEASE_FD".into()); }
    command.env(LEASE_ENV, descriptor.to_string());
    unsafe {
        command.pre_exec(move || {
            if fcntl(descriptor, 2, 0) != 0 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    let child = command.spawn().map_err(|e| format!("E_APP_UPDATE_SPAWN: {e}"));
    drop(inherited);
    child
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::time::{Duration, Instant};

    #[test]
    fn read_only_gate_descriptors_still_hold_an_exclusive_process_lease() {
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("read-only-gate");
        fs::write(&path, b"").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o444)).unwrap();
        let lease = lock(File::open(&path).unwrap()).unwrap();
        assert!(lock(File::open(&path).unwrap()).is_err());
        drop(lease);
        assert!(lock(File::open(&path).unwrap()).is_ok());
    }

    #[test]
    #[ignore]
    fn lease_child() {
        let root = std::env::var_os("AMEOW_LEASE_TEST_ROOT").map(std::path::PathBuf::from).unwrap();
        let descriptor = std::env::var(LEASE_ENV).unwrap().parse().unwrap();
        let _lease = adopt(&root.join("app-instance.lock"), descriptor).unwrap();
        fs::write(root.join("child-ready"), b"ready").unwrap();
        while !root.join("child-stop").exists() { std::thread::sleep(Duration::from_millis(10)); }
    }

    #[test]
    fn inherited_lease_outlives_the_helper_and_blocks_replacement() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap();
        let lease = acquire_for_helper(&root).unwrap();
        let module = module_path!().split_once("::").map_or(module_path!(), |(_, path)| path);
        let name = format!("{module}::lease_child");
        let mut command = Command::new(std::env::current_exe().unwrap());
        command.args(["--exact", &name, "--ignored"]).env("AMEOW_LEASE_TEST_ROOT", &root);
        let mut child = spawn_with_lease(&mut command, &lease).unwrap();
        let deadline = Instant::now() + Duration::from_secs(10);
        while !root.join("child-ready").exists() {
            assert!(Instant::now() < deadline);
            assert!(child.try_wait().unwrap().is_none());
            std::thread::sleep(Duration::from_millis(10));
        }
        drop(lease);
        assert!(acquire_for_helper(&root).is_err());
        fs::write(root.join("child-stop"), b"stop").unwrap();
        assert!(child.wait().unwrap().success());
        assert!(acquire_for_helper(&root).is_ok());
    }

    #[test]
    fn unrelated_concurrent_children_do_not_inherit_the_lease() {
        unsafe extern "C" {
            fn read(fd: i32, buffer: *mut std::ffi::c_void, size: usize) -> isize;
            fn write(fd: i32, buffer: *const std::ffi::c_void, size: usize) -> isize;
        }
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap();
        let lease = acquire_for_helper(&root).unwrap();
        let (mut parent_signal, child_signal) = std::os::unix::net::UnixStream::pair().unwrap();
        let module = module_path!().split_once("::").map_or(module_path!(), |(_, path)| path);
        let name = format!("{module}::lease_child");
        let mut command = Command::new(std::env::current_exe().unwrap());
        command.args(["--exact", &name, "--ignored"]).env("AMEOW_LEASE_TEST_ROOT", &root);
        unsafe {
            command.pre_exec(move || {
                let mut signal = [1u8];
                if write(child_signal.as_raw_fd(), signal.as_ptr().cast(), 1) != 1
                    || read(child_signal.as_raw_fd(), signal.as_mut_ptr().cast(), 1) != 1 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
        let task = std::thread::spawn(move || {
            let mut child = spawn_with_lease(&mut command, &lease).unwrap();
            drop(lease);
            child.wait().unwrap()
        });
        let mut signal = [0u8; 1];
        parent_signal.read_exact(&mut signal).unwrap();
        let mut unrelated = Command::new("/bin/sleep").arg("10").spawn().unwrap();
        parent_signal.write_all(&signal).unwrap();
        let deadline = Instant::now() + Duration::from_secs(10);
        while !root.join("child-ready").exists() {
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(10));
        }
        fs::write(root.join("child-stop"), b"stop").unwrap();
        assert!(task.join().unwrap().success());
        let released = acquire_for_helper(&root).is_ok();
        let _ = unrelated.kill();
        let _ = unrelated.wait();
        assert!(released);
    }
}
