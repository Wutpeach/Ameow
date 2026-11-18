//! Same-user local byte transport. Framing and request limits belong to the caller.
use std::{io, path::Path};

#[cfg(target_os = "windows")]
mod platform {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::{
        ffi::OsStr,
        io::{Read, Write},
        mem,
        os::windows::{
            ffi::OsStrExt,
            io::{AsRawHandle, FromRawHandle, OwnedHandle},
        },
        ptr,
        sync::Mutex,
    };
    use windows_sys::Win32::{
        Foundation::{
            ERROR_BROKEN_PIPE, ERROR_INSUFFICIENT_BUFFER, ERROR_NO_DATA, ERROR_PIPE_BUSY,
            ERROR_PIPE_CONNECTED, ERROR_PIPE_LISTENING, GENERIC_READ, GENERIC_WRITE, GetLastError,
            HANDLE, INVALID_HANDLE_VALUE, LocalFree,
        },
        Security::{
            Authorization::{
                ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
            },
            GetTokenInformation, SECURITY_ATTRIBUTES, TOKEN_QUERY, TOKEN_USER, TokenUser,
        },
        Storage::FileSystem::{
            CreateFileW, FILE_FLAG_FIRST_PIPE_INSTANCE, OPEN_EXISTING, PIPE_ACCESS_DUPLEX,
            ReadFile, WriteFile,
        },
        System::{
            Pipes::{
                ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe,
                GetNamedPipeServerProcessId, PIPE_NOWAIT, PIPE_REJECT_REMOTE_CLIENTS,
                PIPE_UNLIMITED_INSTANCES, SetNamedPipeHandleState, WaitNamedPipeW,
            },
            Threading::{
                GetCurrentProcess, OpenProcess, OpenProcessToken, PROCESS_QUERY_LIMITED_INFORMATION,
            },
        },
    };

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(Some(0)).collect()
    }
    fn current_sid() -> io::Result<String> {
        process_sid(unsafe { GetCurrentProcess() })
    }
    fn process_sid(process: HANDLE) -> io::Result<String> {
        unsafe {
            let mut token: HANDLE = ptr::null_mut();
            if OpenProcessToken(process, TOKEN_QUERY, &mut token) == 0 {
                return Err(io::Error::last_os_error());
            }
            let token = OwnedHandle::from_raw_handle(token);
            let mut size = 0;
            GetTokenInformation(
                token.as_raw_handle(),
                TokenUser,
                ptr::null_mut(),
                0,
                &mut size,
            );
            if GetLastError() != ERROR_INSUFFICIENT_BUFFER || size == 0 {
                return Err(io::Error::last_os_error());
            }
            // u64 provides the alignment required by TOKEN_USER.
            let mut data = vec![0u64; (size as usize).div_ceil(mem::size_of::<u64>())];
            if GetTokenInformation(
                token.as_raw_handle(),
                TokenUser,
                data.as_mut_ptr().cast(),
                size,
                &mut size,
            ) == 0
            {
                return Err(io::Error::last_os_error());
            }
            let sid = (*(data.as_ptr().cast::<TOKEN_USER>())).User.Sid;
            let mut text = ptr::null_mut();
            if ConvertSidToStringSidW(sid, &mut text) == 0 {
                return Err(io::Error::last_os_error());
            }
            let mut len = 0;
            while *text.add(len) != 0 {
                len += 1;
            }
            let result = String::from_utf16(std::slice::from_raw_parts(text, len))
                .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid user SID"));
            LocalFree(text.cast());
            result
        }
    }
    fn address(root: &Path, sid: &str) -> Vec<u16> {
        let mut hash = Sha256::new();
        hash.update(sid.as_bytes());
        for c in root.as_os_str().encode_wide() {
            hash.update(c.to_le_bytes());
        }
        wide(&format!(r"\\.\pipe\Ameow.Control.{:x}", hash.finalize()))
    }
    fn make_pipe(name: &[u16], sid: &str, first: bool) -> io::Result<OwnedHandle> {
        unsafe {
            // A protected DACL allows only the token user; no inherited or broad ACEs.
            let descriptor_text = wide(&format!("D:P(A;;GA;;;{sid})"));
            let mut descriptor = ptr::null_mut();
            if ConvertStringSecurityDescriptorToSecurityDescriptorW(
                descriptor_text.as_ptr(),
                1,
                &mut descriptor,
                ptr::null_mut(),
            ) == 0
            {
                return Err(io::Error::last_os_error());
            }
            let attributes = SECURITY_ATTRIBUTES {
                nLength: mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
                lpSecurityDescriptor: descriptor,
                bInheritHandle: 0,
            };
            let handle = CreateNamedPipeW(
                name.as_ptr(),
                PIPE_ACCESS_DUPLEX
                    | if first {
                        FILE_FLAG_FIRST_PIPE_INSTANCE
                    } else {
                        0
                    },
                PIPE_NOWAIT | PIPE_REJECT_REMOTE_CLIENTS,
                PIPE_UNLIMITED_INSTANCES,
                65536,
                65536,
                0,
                &attributes,
            );
            let error = if handle == INVALID_HANDLE_VALUE {
                Some(io::Error::last_os_error())
            } else {
                None
            };
            LocalFree(descriptor);
            if let Some(error) = error {
                return Err(error);
            }
            Ok(OwnedHandle::from_raw_handle(handle))
        }
    }
    pub struct Listener {
        name: Vec<u16>,
        sid: String,
        pending: Mutex<OwnedHandle>,
    }
    pub struct Stream(OwnedHandle);
    impl Listener {
        pub fn bind(root: &Path) -> io::Result<Self> {
            let sid = current_sid()?;
            let name = address(root, &sid);
            let pending = make_pipe(&name, &sid, true)?;
            Ok(Self {
                name,
                sid,
                pending: Mutex::new(pending),
            })
        }
        pub fn accept(&self) -> io::Result<Option<Stream>> {
            let mut pending = self
                .pending
                .lock()
                .map_err(|_| io::Error::other("pipe listener lock poisoned"))?;
            let success = unsafe { ConnectNamedPipe(pending.as_raw_handle(), ptr::null_mut()) };
            if success == 0 {
                let code = unsafe { GetLastError() };
                if code == ERROR_PIPE_LISTENING {
                    return Ok(None);
                }
                if code == ERROR_NO_DATA {
                    if unsafe { DisconnectNamedPipe(pending.as_raw_handle()) } == 0 {
                        return Err(io::Error::last_os_error());
                    }
                    return Ok(None);
                }
                if code != ERROR_PIPE_CONNECTED {
                    return Err(io::Error::from_raw_os_error(code as i32));
                }
            }
            let next = make_pipe(&self.name, &self.sid, false)?;
            Ok(Some(Stream(mem::replace(&mut *pending, next))))
        }
    }
    pub fn connect(root: &Path) -> io::Result<Stream> {
        let sid = current_sid()?;
        let name = address(root, &sid);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
        unsafe {
            let handle = loop {
                let handle = CreateFileW(
                    name.as_ptr(),
                    GENERIC_READ | GENERIC_WRITE,
                    0,
                    ptr::null(),
                    OPEN_EXISTING,
                    0,
                    ptr::null_mut(),
                );
                if handle != INVALID_HANDLE_VALUE {
                    break handle;
                }
                let error = io::Error::last_os_error();
                if GetLastError() != ERROR_PIPE_BUSY {
                    return Err(error);
                }
                if std::time::Instant::now() >= deadline {
                    return Err(io::Error::new(
                        io::ErrorKind::TimedOut,
                        "Desktop control pipe is busy",
                    ));
                }
                WaitNamedPipeW(name.as_ptr(), 50);
            };
            let handle = OwnedHandle::from_raw_handle(handle);
            let mut pid = 0;
            if GetNamedPipeServerProcessId(handle.as_raw_handle(), &mut pid) == 0 {
                return Err(io::Error::last_os_error());
            }
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if process.is_null() {
                return Err(io::Error::last_os_error());
            }
            let process = OwnedHandle::from_raw_handle(process);
            if process_sid(process.as_raw_handle())? != sid {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "Desktop control server user mismatch",
                ));
            }
            let mode = PIPE_NOWAIT;
            if SetNamedPipeHandleState(handle.as_raw_handle(), &mode, ptr::null(), ptr::null()) == 0
            {
                let error = io::Error::last_os_error();
                return Err(error);
            }
            Ok(Stream(handle))
        }
    }
    impl Read for Stream {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            if buf.is_empty() {
                return Ok(0);
            }
            let mut count = 0;
            let ok = unsafe {
                ReadFile(
                    self.0.as_raw_handle(),
                    buf.as_mut_ptr(),
                    buf.len().min(u32::MAX as usize) as u32,
                    &mut count,
                    ptr::null_mut(),
                )
            };
            if ok != 0 {
                return Ok(count as usize);
            }
            match unsafe { GetLastError() } {
                ERROR_NO_DATA | ERROR_PIPE_LISTENING => Err(io::ErrorKind::WouldBlock.into()),
                ERROR_BROKEN_PIPE => Ok(0),
                code => Err(io::Error::from_raw_os_error(code as i32)),
            }
        }
    }
    impl Write for Stream {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            if buf.is_empty() {
                return Ok(0);
            }
            let mut count = 0;
            let ok = unsafe {
                WriteFile(
                    self.0.as_raw_handle(),
                    buf.as_ptr(),
                    buf.len().min(u32::MAX as usize) as u32,
                    &mut count,
                    ptr::null_mut(),
                )
            };
            if ok != 0 && count != 0 {
                return Ok(count as usize);
            }
            if ok != 0 || unsafe { GetLastError() } == ERROR_NO_DATA {
                return Err(io::ErrorKind::WouldBlock.into());
            }
            Err(io::Error::last_os_error())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    #[cfg(test)]
    #[test]
    fn pipe_dacl_rejects_anonymous_current_thread() {
        use windows_sys::Win32::{
            Security::{ImpersonateAnonymousToken, RevertToSelf},
            System::Threading::GetCurrentThread,
        };
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap();
        let listener = Listener::bind(&root).unwrap();
        let name = address(&root, &current_sid().unwrap());
        struct Revert;
        impl Drop for Revert {
            fn drop(&mut self) {
                assert_ne!(unsafe { RevertToSelf() }, 0);
            }
        }
        assert_ne!(unsafe { ImpersonateAnonymousToken(GetCurrentThread()) }, 0);
        let revert = Revert;
        let handle = unsafe {
            CreateFileW(
                name.as_ptr(),
                GENERIC_READ | GENERIC_WRITE,
                0,
                ptr::null(),
                OPEN_EXISTING,
                0,
                ptr::null_mut(),
            )
        };
        let error = io::Error::last_os_error();
        drop(revert);
        if handle != INVALID_HANDLE_VALUE {
            drop(unsafe { OwnedHandle::from_raw_handle(handle) });
            panic!("anonymous client connected");
        }
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
        drop(listener);
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::{
        fs::{self, DirBuilder, File, OpenOptions},
        io::{Read, Write},
        os::unix::{
            ffi::OsStrExt,
            fs::{DirBuilderExt, FileTypeExt, MetadataExt, OpenOptionsExt, PermissionsExt},
            io::AsRawFd,
            net::{UnixListener, UnixStream},
        },
        path::PathBuf,
    };

    fn directory(root: &Path) -> PathBuf {
        let uid = unsafe { libc::geteuid() };
        let digest = Sha256::digest(root.as_os_str().as_bytes());
        let digest = format!("{digest:x}");
        // Darwin's sockaddr_un has only 104 bytes; TMPDIR may be long.
        PathBuf::from("/tmp").join(format!("ameow-control-{uid}-{}", &digest[..32]))
    }
    fn check_directory(path: &Path) -> io::Result<()> {
        let m = fs::symlink_metadata(path)?;
        if !m.is_dir() || m.uid() != unsafe { libc::geteuid() } || m.mode() & 0o777 != 0o700 {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "unsafe control directory",
            ));
        }
        Ok(())
    }
    fn check_peer(stream: &UnixStream) -> io::Result<()> {
        let (mut uid, mut gid) = (0, 0);
        if unsafe { libc::getpeereid(stream.as_raw_fd(), &mut uid, &mut gid) } != 0 {
            return Err(io::Error::last_os_error());
        }
        if uid != unsafe { libc::geteuid() } {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "control peer user mismatch",
            ));
        }
        Ok(())
    }
    fn checked_socket(path: &Path) -> io::Result<fs::Metadata> {
        let metadata = fs::symlink_metadata(path)?;
        if !metadata.file_type().is_socket()
            || metadata.uid() != unsafe { libc::geteuid() }
            || metadata.mode() & 0o777 != 0o600
        {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "unsafe control socket",
            ));
        }
        Ok(metadata)
    }
    pub struct Listener {
        socket: UnixListener,
        path: PathBuf,
        device: u64,
        inode: u64,
        _lock: File,
    }
    pub struct Stream(UnixStream);
    impl Listener {
        pub fn bind(root: &Path) -> io::Result<Self> {
            let dir = directory(root);
            match DirBuilder::new().mode(0o700).create(&dir) {
                Ok(()) => {}
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {}
                Err(e) => return Err(e),
            }
            check_directory(&dir)?;
            let lock = OpenOptions::new()
                .read(true)
                .write(true)
                .create(true)
                .truncate(false)
                .mode(0o600)
                .custom_flags(libc::O_NOFOLLOW)
                .open(dir.join("owner.lock"))?;
            let lock_meta = lock.metadata()?;
            if !lock_meta.is_file()
                || lock_meta.uid() != unsafe { libc::geteuid() }
                || lock_meta.mode() & 0o777 != 0o600
            {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "unsafe control lock",
                ));
            }
            lock.try_lock().map_err(|e| match e {
                fs::TryLockError::WouldBlock => io::Error::from(io::ErrorKind::AddrInUse),
                fs::TryLockError::Error(e) => e,
            })?;
            let path = dir.join("control.sock");
            match fs::symlink_metadata(&path) {
                Ok(metadata)
                    if metadata.file_type().is_socket()
                        && metadata.uid() == unsafe { libc::geteuid() } =>
                {
                    fs::remove_file(&path)?
                }
                Ok(_) => {
                    return Err(io::Error::new(
                        io::ErrorKind::PermissionDenied,
                        "unsafe stale control socket",
                    ));
                }
                Err(e) if e.kind() == io::ErrorKind::NotFound => {}
                Err(e) => return Err(e),
            }
            let socket = UnixListener::bind(&path)?;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
            socket.set_nonblocking(true)?;
            let m = checked_socket(&path)?;
            Ok(Self {
                socket,
                path,
                device: m.dev(),
                inode: m.ino(),
                _lock: lock,
            })
        }
        pub fn accept(&self) -> io::Result<Option<Stream>> {
            match self.socket.accept() {
                Ok((stream, _)) => {
                    check_peer(&stream)?;
                    stream.set_nonblocking(true)?;
                    Ok(Some(Stream(stream)))
                }
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => Ok(None),
                Err(e) => Err(e),
            }
        }
    }
    impl Drop for Listener {
        fn drop(&mut self) {
            if checked_socket(&self.path)
                .is_ok_and(|m| m.dev() == self.device && m.ino() == self.inode)
            {
                let _ = fs::remove_file(&self.path);
            }
        }
    }
    pub fn connect(root: &Path) -> io::Result<Stream> {
        let dir = directory(root);
        check_directory(&dir)?;
        let path = dir.join("control.sock");
        checked_socket(&path)?;
        let stream = UnixStream::connect(path)?;
        check_peer(&stream)?;
        stream.set_nonblocking(true)?;
        Ok(Stream(stream))
    }
    impl Read for Stream {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            self.0.read(buf)
        }
    }
    impl Write for Stream {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            self.0.write(buf)
        }
        fn flush(&mut self) -> io::Result<()> {
            self.0.flush()
        }
    }
}

pub use platform::{Listener, connect};

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        time::{Duration, Instant},
    };
    #[test]
    fn local_round_trip_and_exclusive_listener() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap();
        let listener = Listener::bind(&root).unwrap();
        assert!(Listener::bind(&root).is_err());
        let mut client = connect(&root).unwrap();
        let deadline = Instant::now() + Duration::from_secs(3);
        let mut server = loop {
            if let Some(stream) = listener.accept().unwrap() {
                break stream;
            }
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(2));
        };
        client.write_all(b"a").unwrap();
        let mut buf = [0];
        loop {
            match server.read(&mut buf) {
                Ok(1) => break,
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => {}
                other => panic!("{other:?}"),
            }
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(2));
        }
        assert_eq!(buf, *b"a");
        server.write_all(b"b").unwrap();
        loop {
            match client.read(&mut buf) {
                Ok(1) => break,
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => {}
                other => panic!("{other:?}"),
            }
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(2));
        }
        assert_eq!(buf, *b"b");
    }
}
