use objc2::{
    msg_send,
    rc::{Retained, autoreleasepool},
    runtime::{AnyClass, AnyObject},
};
use objc2_foundation::NSString;
use std::{
    fs::{self, File, OpenOptions},
    io,
    os::unix::{
        fs::{OpenOptionsExt, PermissionsExt},
        net::UnixDatagram,
    },
    path::{Path, PathBuf},
};

#[link(name = "ServiceManagement", kind = "framework")]
unsafe extern "C" {}

const O_NOFOLLOW: i32 = 0x100;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StartupState {
    Disabled,
    Enabled,
    Stale,
    RequiresApproval,
}

fn state_from_status(status: isize) -> Result<StartupState, String> {
    match status {
        0 => Ok(StartupState::Disabled),
        1 => Ok(StartupState::Enabled),
        2 => Ok(StartupState::RequiresApproval),
        3 => Ok(StartupState::Stale),
        _ => Err(format!(
            "E_STARTUP_STATUS: unknown macOS login item status {status}"
        )),
    }
}

fn current_app_bundle() -> Result<PathBuf, String> {
    let bundle_class =
        AnyClass::get(c"NSBundle").ok_or("E_STARTUP_BUNDLE: NSBundle is unavailable")?;
    let bundle: Retained<AnyObject> = unsafe { msg_send![bundle_class, mainBundle] };
    let path: Option<Retained<NSString>> = unsafe { msg_send![&*bundle, bundlePath] };
    let executable: Option<Retained<NSString>> = unsafe { msg_send![&*bundle, executablePath] };
    let identifier: Option<Retained<NSString>> = unsafe { msg_send![&*bundle, bundleIdentifier] };
    let path = path
        .map(|value| PathBuf::from(value.to_string()))
        .ok_or("E_STARTUP_BUNDLE: missing bundle path")?;
    if path.extension().is_none_or(|extension| extension != "app")
        || !path.join("Contents/Info.plist").is_file()
        || identifier.is_none_or(|value| value.is_empty())
    {
        return Err(
            "E_STARTUP_BUNDLE: launch the installed Ameow.app to manage login startup".into(),
        );
    }
    let path = fs::canonicalize(path).map_err(|error| format!("E_STARTUP_BUNDLE: {error}"))?;
    let executable = executable
        .map(|value| PathBuf::from(value.to_string()))
        .ok_or("E_STARTUP_BUNDLE: missing bundle executable")?;
    let actual = std::env::current_exe()
        .and_then(fs::canonicalize)
        .map_err(|error| format!("E_STARTUP_BUNDLE: {error}"))?;
    if fs::canonicalize(executable).map_err(|error| format!("E_STARTUP_BUNDLE: {error}"))? != actual
        || !actual.starts_with(path.join("Contents/MacOS"))
    {
        return Err(
            "E_STARTUP_BUNDLE: current executable does not belong to the application bundle".into(),
        );
    }
    Ok(path)
}

fn app_service() -> Result<Retained<AnyObject>, String> {
    current_app_bundle()?;
    let class = AnyClass::get(c"SMAppService")
        .ok_or("E_STARTUP_UNAVAILABLE: login startup requires macOS 13 or later")?;
    let service: Option<Retained<AnyObject>> = unsafe { msg_send![class, mainAppService] };
    service
        .ok_or("E_STARTUP_SERVICE: the macOS main application login service is unavailable".into())
}

fn service_state(service: &AnyObject) -> Result<StartupState, String> {
    let status: isize = unsafe { msg_send![service, status] };
    state_from_status(status)
}

fn service_error(action: &str, error: Option<Retained<AnyObject>>) -> String {
    match error {
        Some(error) => {
            let domain: Retained<NSString> = unsafe { msg_send![&*error, domain] };
            let code: isize = unsafe { msg_send![&*error, code] };
            let description: Retained<NSString> =
                unsafe { msg_send![&*error, localizedDescription] };
            format!("E_STARTUP_{action}: {domain} ({code}): {description}")
        }
        None => format!("E_STARTUP_{action}: macOS did not accept the login item change"),
    }
}

pub fn read() -> Result<StartupState, String> {
    autoreleasepool(|_| service_state(&*app_service()?))
}

pub fn set_enabled(enabled: bool) -> Result<StartupState, String> {
    autoreleasepool(|_| {
        let service = app_service()?;
        let before = service_state(&service)?;
        if (!enabled && before == StartupState::Disabled)
            || (enabled && before == StartupState::Enabled)
        {
            return Ok(before);
        }
        let mut error: Option<Retained<AnyObject>> = None;
        let success: bool = unsafe {
            if enabled {
                msg_send![&*service, registerAndReturnError: &mut error]
            } else {
                msg_send![&*service, unregisterAndReturnError: &mut error]
            }
        };
        let after = service_state(&service)?;
        if enabled && after == StartupState::RequiresApproval {
            let class = AnyClass::get(c"SMAppService").ok_or("E_STARTUP_SERVICE")?;
            let _: () = unsafe { msg_send![class, openSystemSettingsLoginItems] };
            return Ok(after);
        }
        if !success {
            return Err(service_error(
                if enabled { "REGISTER" } else { "UNREGISTER" },
                error,
            ));
        }
        if (enabled && after != StartupState::Enabled)
            || (!enabled && after != StartupState::Disabled)
        {
            return Err(format!(
                "E_STARTUP_VERIFY: macOS reported {after:?} after changing login startup"
            ));
        }
        Ok(after)
    })
}

pub enum InstanceAcquire {
    Primary(InstanceGuard),
    Duplicate,
}

pub struct InstanceGuard {
    socket: UnixDatagram,
    socket_path: PathBuf,
    _lock: File,
}

fn prepare_instance_directory(home: &Path) -> Result<PathBuf, String> {
    let root = home.join("Library/Application Support/AmeowNative");
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let metadata = fs::symlink_metadata(&root).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("E_INSTANCE_DIRECTORY: native data root must be a real directory".into());
    }
    let directory = root.join("instance");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    if fs::symlink_metadata(&directory)
        .map_err(|error| error.to_string())?
        .file_type()
        .is_symlink()
    {
        return Err("E_INSTANCE_DIRECTORY: symbolic link rejected".into());
    }
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))
        .map_err(|error| error.to_string())?;
    Ok(directory)
}

impl InstanceGuard {
    pub fn acquire_with_restore(restore: bool) -> Result<InstanceAcquire, String> {
        let home = std::env::var_os("HOME").ok_or("E_INSTANCE_HOME")?;
        let directory = prepare_instance_directory(Path::new(&home))?;
        Self::acquire_at(directory, restore)
    }

    fn acquire_at(directory: PathBuf, restore: bool) -> Result<InstanceAcquire, String> {
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .mode(0o600)
            .custom_flags(O_NOFOLLOW)
            .open(directory.join("owner.lock"))
            .map_err(|error| error.to_string())?;
        let socket_path = directory.join("restore.sock");
        match lock.try_lock() {
            Ok(()) => {}
            Err(fs::TryLockError::WouldBlock) => {
                if restore {
                    let sender = UnixDatagram::unbound().map_err(|error| error.to_string())?;
                    sender
                        .send_to(b"restore", &socket_path)
                        .map_err(|error| format!("E_INSTANCE_RESTORE: {error}"))?;
                }
                return Ok(InstanceAcquire::Duplicate);
            }
            Err(error) => return Err(error.to_string()),
        }
        match fs::remove_file(&socket_path) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
        let socket = UnixDatagram::bind(&socket_path).map_err(|error| error.to_string())?;
        socket
            .set_nonblocking(true)
            .map_err(|error| error.to_string())?;
        Ok(InstanceAcquire::Primary(Self {
            socket,
            socket_path,
            _lock: lock,
        }))
    }

    pub fn take_restore_request(&self) -> Result<bool, String> {
        let mut request = [0u8; 64];
        let mut restore = false;
        loop {
            match self.socket.recv(&mut request) {
                Ok(count) => restore |= &request[..count] == b"restore",
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => return Ok(restore),
                Err(error) => return Err(error.to_string()),
            }
        }
    }
}

impl Drop for InstanceGuard {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.socket_path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duplicate_signals_restore_and_owner_can_restart() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().to_path_buf();
        let InstanceAcquire::Primary(owner) =
            InstanceGuard::acquire_at(path.clone(), false).unwrap()
        else {
            panic!("primary");
        };
        assert!(!owner.take_restore_request().unwrap());
        assert!(matches!(
            InstanceGuard::acquire_at(path.clone(), false).unwrap(),
            InstanceAcquire::Duplicate
        ));
        assert!(!owner.take_restore_request().unwrap());
        assert!(matches!(
            InstanceGuard::acquire_at(path.clone(), true).unwrap(),
            InstanceAcquire::Duplicate
        ));
        assert!(owner.take_restore_request().unwrap());
        assert!(!owner.take_restore_request().unwrap());
        drop(owner);
        assert!(matches!(
            InstanceGuard::acquire_at(path, false).unwrap(),
            InstanceAcquire::Primary(_)
        ));
    }

    #[test]
    fn login_status_preserves_approval_and_rejects_unknown_values() {
        assert_eq!(state_from_status(0).unwrap(), StartupState::Disabled);
        assert_eq!(state_from_status(1).unwrap(), StartupState::Enabled);
        assert_eq!(
            state_from_status(2).unwrap(),
            StartupState::RequiresApproval
        );
        assert_eq!(state_from_status(3).unwrap(), StartupState::Stale);
        assert!(state_from_status(4).is_err());
        assert!(state_from_status(-1).is_err());
    }

    #[test]
    fn unbundled_executable_cannot_change_login_items() {
        assert!(current_app_bundle().is_err());
        assert!(read().unwrap_err().starts_with("E_STARTUP_BUNDLE:"));
        assert!(
            set_enabled(true)
                .unwrap_err()
                .starts_with("E_STARTUP_BUNDLE:")
        );
        assert!(
            set_enabled(false)
                .unwrap_err()
                .starts_with("E_STARTUP_BUNDLE:")
        );
    }

    #[test]
    fn native_instance_state_preserves_existing_electron_data() {
        let home = tempfile::Builder::new()
            .prefix("ameow-home-")
            .tempdir_in("/tmp")
            .unwrap();
        let legacy = home.path().join("Library/Application Support/Ameow");
        fs::create_dir_all(&legacy).unwrap();
        fs::write(legacy.join("existing-user-data"), b"Electron user data").unwrap();
        let directory = prepare_instance_directory(home.path()).unwrap();
        assert_eq!(
            directory,
            home.path()
                .join("Library/Application Support/AmeowNative/instance")
        );
        let InstanceAcquire::Primary(owner) = InstanceGuard::acquire_at(directory, false).unwrap()
        else {
            panic!("primary");
        };
        assert_eq!(
            fs::read(legacy.join("existing-user-data")).unwrap(),
            b"Electron user data"
        );
        assert!(!legacy.join("instance").exists());
        drop(owner);
    }

    #[test]
    fn native_root_cannot_redirect_instance_writes_into_electron_data() {
        let home = tempfile::tempdir().unwrap();
        let support = home.path().join("Library/Application Support");
        let legacy = support.join("Ameow");
        fs::create_dir_all(&legacy).unwrap();
        fs::write(legacy.join("existing-user-data"), b"Electron user data").unwrap();
        std::os::unix::fs::symlink(&legacy, support.join("AmeowNative")).unwrap();
        assert!(prepare_instance_directory(home.path()).is_err());
        assert_eq!(
            fs::read(legacy.join("existing-user-data")).unwrap(),
            b"Electron user data"
        );
        assert!(!legacy.join("instance").exists());
    }
}
