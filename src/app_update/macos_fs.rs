use std::{
    ffi::{CStr, CString, OsStr, OsString},
    fs::File,
    os::{fd::{AsRawFd, FromRawFd}, macos::fs::MetadataExt as MacMetadataExt, unix::{ffi::{OsStrExt, OsStringExt}, fs::MetadataExt}},
    path::{Component, Path},
};

const O_NOFOLLOW: i32 = 0x0000_0100;
const O_NONBLOCK: i32 = 0x0000_0004;
const O_DIRECTORY: i32 = 0x0010_0000;
const O_CLOEXEC: i32 = 0x0100_0000;
const MAX_ENTRIES: usize = 16_384;

unsafe extern "C" {
    fn openat(fd: i32, path: *const std::ffi::c_char, flags: i32, ...) -> i32;
}

fn child(parent: &File, name: &OsStr, access: i32) -> Result<File, String> {
    let bytes = name.as_bytes();
    if bytes.is_empty() || bytes == b"." || bytes == b".." || bytes.contains(&b'/') {
        return Err("E_APP_UPDATE_PATH".into());
    }
    let name = CString::new(bytes).map_err(|_| "E_APP_UPDATE_PATH")?;
    let flags = O_NOFOLLOW | O_CLOEXEC | access;
    let fd = unsafe { openat(parent.as_raw_fd(), name.as_ptr(), flags) };
    if fd < 0 {
        return Err(format!("E_APP_UPDATE_PATH_OPEN: {}", std::io::Error::last_os_error()));
    }
    Ok(unsafe { File::from_raw_fd(fd) })
}

pub(super) fn directory(path: &Path) -> Result<File, String> {
    let mut components = path.components();
    if components.next() != Some(Component::RootDir) { return Err("E_APP_UPDATE_PATH".into()); }
    let mut current = File::open("/").map_err(|error| error.to_string())?;
    let mut components = components.peekable();
    while let Some(component) = components.next() {
        match component {
            Component::Normal(name) => {
                let access = if components.peek().is_some() { libc::O_SEARCH } else { O_DIRECTORY };
                current = child(&current, name, access)?;
            }
            _ => return Err("E_APP_UPDATE_PATH".into()),
        }
    }
    Ok(current)
}

pub(super) fn child_directory(parent: &File, name: &OsStr) -> Result<File, String> {
    child(parent, name, O_DIRECTORY)
}

pub(super) fn child_regular_file(parent: &File, name: &OsStr) -> Result<File, String> {
    let file = child(parent, name, O_NONBLOCK)?;
    let metadata = file.metadata().map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.nlink() != 1 { return Err("E_APP_UPDATE_FILE_TYPE".into()); }
    Ok(file)
}

pub(super) fn regular_file(path: &Path) -> Result<File, String> {
    let parent = directory(path.parent().ok_or("E_APP_UPDATE_PATH")?)?;
    child_regular_file(&parent, path.file_name().ok_or("E_APP_UPDATE_PATH")?)
}

pub(super) fn child_metadata(parent: &File, name: &OsStr) -> Result<libc::stat, String> {
    let name = CString::new(name.as_bytes()).map_err(|_| "E_APP_UPDATE_PATH")?;
    let mut metadata = std::mem::MaybeUninit::<libc::stat>::uninit();
    if unsafe { libc::fstatat(parent.as_raw_fd(), name.as_ptr(), metadata.as_mut_ptr(), libc::AT_SYMLINK_NOFOLLOW) } != 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    Ok(unsafe { metadata.assume_init() })
}

pub(super) fn child_link(parent: &File, name: &OsStr) -> Result<OsString, String> {
    let name = CString::new(name.as_bytes()).map_err(|_| "E_APP_UPDATE_PATH")?;
    let mut target = [0u8; 4097];
    let length = unsafe { libc::readlinkat(parent.as_raw_fd(), name.as_ptr(), target.as_mut_ptr().cast(), target.len()) };
    if length < 0 { return Err(std::io::Error::last_os_error().to_string()); }
    if length as usize >= target.len() { return Err("E_APP_UPDATE_BUNDLE_PATH".into()); }
    Ok(OsString::from_vec(target[..length as usize].to_vec()))
}

pub(super) fn entries(directory: &File) -> Result<Vec<OsString>, String> {
    struct DirectoryStream(*mut libc::DIR);
    impl Drop for DirectoryStream {
        fn drop(&mut self) { unsafe { libc::closedir(self.0); } }
    }
    let duplicate = unsafe { libc::fcntl(directory.as_raw_fd(), libc::F_DUPFD_CLOEXEC, 3) };
    if duplicate < 0 { return Err(std::io::Error::last_os_error().to_string()); }
    let stream = unsafe { libc::fdopendir(duplicate) };
    if stream.is_null() {
        let error = std::io::Error::last_os_error();
        unsafe { libc::close(duplicate); }
        return Err(error.to_string());
    }
    let stream = DirectoryStream(stream);
    let mut names = Vec::new();
    loop {
        unsafe { *libc::__error() = 0; }
        let entry = unsafe { libc::readdir(stream.0) };
        if entry.is_null() {
            let error = std::io::Error::last_os_error();
            if error.raw_os_error() == Some(0) { break; }
            return Err(error.to_string());
        }
        let name = unsafe { CStr::from_ptr((*entry).d_name.as_ptr()) }.to_bytes();
        if name == b"." || name == b".." { continue; }
        if names.len() >= MAX_ENTRIES { return Err("E_APP_UPDATE_BUNDLE_SIZE".into()); }
        names.push(OsString::from_vec(name.to_vec()));
    }
    Ok(names)
}

pub(super) fn check_removable_tree(root: &Path) -> Result<(), String> {
    const RESTRICTED: u32 = 0x0000_0002 | 0x0000_0004 | 0x0002_0000 | 0x0004_0000
        | 0x0008_0000 | 0x0010_0000;
    fn visit(directory: &File, device: u64, count: &mut usize, user: u32, depth: usize) -> Result<(), String> {
        if depth > 256 { return Err("E_APP_UPDATE_BUNDLE_SIZE".into()); }
        let metadata = directory.metadata().map_err(|error| error.to_string())?;
        if metadata.dev() != device || metadata.st_flags() & RESTRICTED != 0 {
            return Err("E_APP_UPDATE_BUNDLE_IMMUTABLE".into());
        }
        if unsafe { libc::faccessat(directory.as_raw_fd(), c".".as_ptr(), libc::W_OK | libc::X_OK, libc::AT_EACCESS) } != 0 {
            let error = std::io::Error::last_os_error();
            return if error.kind() == std::io::ErrorKind::PermissionDenied {
                Err("E_APP_UPDATE_AUTHORIZATION_REQUIRED".into())
            } else { Err(format!("E_APP_UPDATE_PERMISSION_CHECK: {error}")) };
        }
        for name in entries(directory)? {
            *count += 1;
            if *count > MAX_ENTRIES { return Err("E_APP_UPDATE_BUNDLE_SIZE".into()); }
            let entry_metadata = child_metadata(directory, &name)?;
            if entry_metadata.st_dev as u64 != device || entry_metadata.st_flags & RESTRICTED != 0 {
                return Err("E_APP_UPDATE_BUNDLE_IMMUTABLE".into());
            }
            if metadata.mode() & 0o1000 != 0 && metadata.uid() != user && entry_metadata.st_uid != user {
                return Err("E_APP_UPDATE_AUTHORIZATION_REQUIRED".into());
            }
            match entry_metadata.st_mode & libc::S_IFMT {
                libc::S_IFREG | libc::S_IFLNK => {}
                libc::S_IFDIR => {
                    let child = child_directory(directory, &name)?;
                    let opened = child.metadata().map_err(|error| error.to_string())?;
                    if opened.dev() != device || opened.ino() != entry_metadata.st_ino {
                        return Err("E_APP_UPDATE_BUNDLE_CHANGED".into());
                    }
                    visit(&child, device, count, user, depth + 1)?;
                }
                _ => return Err("E_APP_UPDATE_BUNDLE_TYPE".into()),
            }
        }
        Ok(())
    }
    let directory = directory(root)?;
    let metadata = directory.metadata().map_err(|error| error.to_string())?;
    visit(&directory, metadata.dev(), &mut 1, unsafe { libc::geteuid() }, 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, os::unix::fs::symlink};

    #[test]
    fn anchored_open_rejects_symbolic_links_and_hard_links() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().canonicalize().unwrap();
        let actual = root.join("actual");
        fs::create_dir(&actual).unwrap();
        fs::write(actual.join("archive"), b"data").unwrap();
        symlink(&actual, root.join("redirect")).unwrap();
        assert!(directory(&root.join("redirect")).is_err());
        assert!(regular_file(&root.join("redirect/archive")).is_err());
        symlink(actual.join("archive"), root.join("file-link")).unwrap();
        assert!(regular_file(&root.join("file-link")).is_err());
        fs::hard_link(actual.join("archive"), root.join("hard-link")).unwrap();
        assert!(regular_file(&root.join("hard-link")).is_err());
        fs::remove_file(root.join("hard-link")).unwrap();
        assert!(regular_file(&actual.join("archive")).is_ok());
    }

    #[test]
    fn open_directory_stays_bound_after_its_path_is_replaced() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().canonicalize().unwrap();
        let original = root.join("original");
        let moved = root.join("moved");
        let replacement = root.join("replacement");
        fs::create_dir(&original).unwrap();
        fs::create_dir(&replacement).unwrap();
        fs::create_dir(original.join("child")).unwrap();
        let parent = directory(&original).unwrap();
        fs::rename(&original, &moved).unwrap();
        symlink(&replacement, &original).unwrap();
        assert!(directory(&original).is_err());
        assert!(child_directory(&parent, OsStr::new("child")).is_ok());
        assert!(!replacement.join("child").exists());
    }

    #[test]
    fn opening_a_fifo_as_a_regular_file_does_not_wait_for_a_writer() {
        unsafe extern "C" { fn mkfifo(path: *const std::ffi::c_char, mode: u16) -> i32; }
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().canonicalize().unwrap();
        let fifo = root.join("archive");
        let path = CString::new(fifo.as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { mkfifo(path.as_ptr(), 0o600) }, 0);
        assert_eq!(regular_file(&fifo).unwrap_err(), "E_APP_UPDATE_FILE_TYPE");
    }

    #[test]
    fn traversal_uses_search_permission_without_granting_directory_reads() {
        use std::os::unix::fs::PermissionsExt;
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().canonicalize().unwrap();
        let ancestor = root.join("preserved");
        let nested = ancestor.join("Ameow.app/Contents/MacOS");
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("ameow-updater"), b"preserved helper").unwrap();
        fs::set_permissions(&ancestor, fs::Permissions::from_mode(0o111)).unwrap();
        let file = regular_file(&nested.join("ameow-updater"));
        let readable_ancestor = directory(&ancestor);
        fs::set_permissions(&ancestor, fs::Permissions::from_mode(0o000)).unwrap();
        let denied = regular_file(&nested.join("ameow-updater"));
        fs::set_permissions(&ancestor, fs::Permissions::from_mode(0o700)).unwrap();
        assert_eq!(file.unwrap().metadata().unwrap().len(), 16);
        assert!(readable_ancestor.is_err());
        assert!(denied.is_err());
    }

    #[test]
    fn cleanup_preflight_checks_nested_permissions_without_following_links() {
        use std::os::unix::fs::PermissionsExt;
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().canonicalize().unwrap();
        let bundle = root.join("Ameow.app");
        let nested = bundle.join("Contents");
        let outside = root.join("outside");
        fs::create_dir_all(&nested).unwrap();
        fs::create_dir(&outside).unwrap();
        fs::write(outside.join("sentinel"), b"untouched").unwrap();
        symlink(&outside, bundle.join("link")).unwrap();
        check_removable_tree(&bundle).unwrap();
        fs::set_permissions(&nested, fs::Permissions::from_mode(0o555)).unwrap();
        let result = check_removable_tree(&bundle);
        fs::set_permissions(&nested, fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(result.unwrap_err(), "E_APP_UPDATE_AUTHORIZATION_REQUIRED");
        assert_eq!(fs::read(outside.join("sentinel")).unwrap(), b"untouched");
    }
}
