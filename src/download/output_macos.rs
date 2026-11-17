use super::{
    contract::{MediaKind, VerifiedFacts},
    runtime::hash,
};
use serde::{Deserialize, Serialize};
use std::{
    ffi::{CStr, CString},
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    os::unix::{
        ffi::OsStrExt,
        fs::{MetadataExt, OpenOptionsExt, PermissionsExt},
        io::{AsRawFd, FromRawFd},
    },
    path::{Path, PathBuf},
    sync::Arc,
};

fn path_cstring(path: &Path) -> Result<CString, std::io::Error> {
    CString::new(path.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "path contains NUL"))
}

pub fn move_no_replace(source: &Path, destination: &Path) -> Result<(), std::io::Error> {
    let source = path_cstring(source)?;
    let destination = path_cstring(destination)?;
    if unsafe { libc::renamex_np(source.as_ptr(), destination.as_ptr(), libc::RENAME_EXCL) } == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

fn same_file(left: &fs::Metadata, right: &fs::Metadata) -> bool {
    left.dev() == right.dev() && left.ino() == right.ino()
}

fn open_regular(path: &Path) -> Result<File, String> {
    let before = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if !super::is_plain_file(&before) || before.nlink() != 1 {
        return Err("File is not a regular non-symlink file".into());
    }
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)
        .map_err(|error| error.to_string())?;
    let opened = file.metadata().map_err(|error| error.to_string())?;
    if !opened.is_file() || opened.nlink() != 1 || !same_file(&before, &opened) {
        return Err("File identity changed while opening".into());
    }
    Ok(file)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VerifiedMedia {
    pub path: PathBuf,
    pub bytes: u64,
    pub sha256: String,
    pub kind: MediaKind,
    pub facts: VerifiedFacts,
    #[serde(skip)]
    pub identity_guard: Option<Arc<File>>,
}

pub fn verify_data(path: &Path, workspace: &Path) -> Result<VerifiedMedia, String> {
    let mut file = open_regular(path)?;
    let before = file.metadata().map_err(|error| error.to_string())?;
    let canonical = path.canonicalize().map_err(|error| error.to_string())?;
    if before.len() == 0
        || !canonical.starts_with(
            workspace
                .canonicalize()
                .map_err(|error| error.to_string())?,
        )
    {
        return Err("Final media is not one owned, nonempty regular file".into());
    }
    let sha256 = hash(&mut file)?;
    let after = file.metadata().map_err(|error| error.to_string())?;
    let current = fs::symlink_metadata(&canonical).map_err(|error| error.to_string())?;
    if !same_file(&before, &after)
        || !same_file(&after, &current)
        || before.len() != after.len()
        || before.mtime() != after.mtime()
        || before.mtime_nsec() != after.mtime_nsec()
        || before.ctime() != after.ctime()
        || before.ctime_nsec() != after.ctime_nsec()
    {
        return Err("Final media changed while being verified".into());
    }
    Ok(VerifiedMedia {
        path: canonical,
        bytes: after.len(),
        sha256,
        kind: MediaKind::Data,
        facts: VerifiedFacts::default(),
        identity_guard: Some(Arc::new(file)),
    })
}

fn stat_at(directory: &File, name: &CStr) -> std::io::Result<libc::stat> {
    let mut metadata = std::mem::MaybeUninit::uninit();
    if unsafe {
        libc::fstatat(
            directory.as_raw_fd(),
            name.as_ptr(),
            metadata.as_mut_ptr(),
            libc::AT_SYMLINK_NOFOLLOW,
        )
    } != 0
    {
        return Err(std::io::Error::last_os_error());
    }
    Ok(unsafe { metadata.assume_init() })
}

fn matches_stat(metadata: &fs::Metadata, current: &libc::stat) -> bool {
    metadata.dev() == current.st_dev as u64 && metadata.ino() == current.st_ino
}

fn open_at(directory: &File, name: &CStr, flags: i32, mode: libc::mode_t) -> std::io::Result<File> {
    let descriptor = unsafe {
        libc::openat(
            directory.as_raw_fd(),
            name.as_ptr(),
            flags | libc::O_NOFOLLOW | libc::O_CLOEXEC,
            mode as libc::c_int,
        )
    };
    if descriptor < 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(unsafe { File::from_raw_fd(descriptor) })
}

fn clone_file(source: &File, destination: &File, name: &CStr) -> std::io::Result<()> {
    if unsafe {
        libc::fclonefileat(
            source.as_raw_fd(),
            destination.as_raw_fd(),
            name.as_ptr(),
            0,
        )
    } == 0
    {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

pub(crate) fn probe_input(media: &VerifiedMedia, destination: &Path) -> Result<PathBuf, String> {
    let source = media.identity_guard.as_ref().ok_or("Missing guarded media identity")?;
    let directory = File::open(destination).map_err(|error| error.to_string())?;
    match clone_file(source, &directory, c"media") {
        Ok(()) => {}
        Err(error) if clone_unavailable(&error) => {
            let mut input = source.try_clone().map_err(|error| error.to_string())?;
            input.seek(SeekFrom::Start(0)).map_err(|error| error.to_string())?;
            let mut output = open_at(&directory, c"media", libc::O_RDWR | libc::O_CREAT | libc::O_EXCL, 0o600)
                .map_err(|error| error.to_string())?;
            copy_file_data(&mut input, &mut output).map_err(|error| error.to_string())?;
        }
        Err(error) => return Err(format!("E_MEDIA_UNVERIFIED: probe snapshot: {error}")),
    }
    let path = destination.join("media");
    let mut snapshot = open_regular(&path)?;
    if snapshot.metadata().map_err(|error| error.to_string())?.len() != media.bytes
        || hash(&mut snapshot)? != media.sha256
    {
        return Err("E_MEDIA_UNVERIFIED: probe snapshot differs from verified media".into());
    }
    Ok(path)
}

fn rename_file(
    source: &File,
    source_name: &CStr,
    destination: &File,
    destination_name: &CStr,
) -> std::io::Result<()> {
    if unsafe {
        libc::renameatx_np(
            source.as_raw_fd(),
            source_name.as_ptr(),
            destination.as_raw_fd(),
            destination_name.as_ptr(),
            libc::RENAME_EXCL,
        )
    } == 0
    {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

fn clone_unavailable(error: &std::io::Error) -> bool {
    matches!(
        error.raw_os_error(),
        Some(libc::ENOTSUP | libc::EXDEV | libc::ENOSYS)
    )
}

fn copy_file_data(input: &mut File, output: &mut File) -> std::io::Result<u64> {
    match std::io::copy(&mut *input, &mut *output) {
        Ok(bytes) => return Ok(bytes),
        Err(error) if clone_unavailable(&error) => {}
        Err(error) => return Err(error),
    }
    input.seek(SeekFrom::Start(0))?;
    output.set_len(0)?;
    output.seek(SeekFrom::Start(0))?;
    let mut buffer = [0u8; 65536];
    let mut copied = 0u64;
    loop {
        let count = match input.read(&mut buffer) {
            Ok(count) => count,
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error),
        };
        if count == 0 {
            return Ok(copied);
        }
        output.write_all(&buffer[..count])?;
        copied += count as u64;
    }
}

fn sync_file(file: &mut File) -> std::io::Result<()> {
    file.flush()?;
    match file.sync_all() {
        Ok(()) => Ok(()),
        Err(error) if clone_unavailable(&error) => {
            if unsafe { libc::fsync(file.as_raw_fd()) } == 0 {
                Ok(())
            } else {
                Err(std::io::Error::last_os_error())
            }
        }
        Err(error) => Err(error),
    }
}

fn outcome_uncertain(error: &std::io::Error) -> bool {
    matches!(
        error.raw_os_error(),
        Some(
            libc::EIO
                | libc::ETIMEDOUT
                | libc::ESTALE
                | libc::ECONNRESET
                | libc::ENOTCONN
                | libc::ENETDOWN
                | libc::ENXIO
                | libc::EINTR
        )
    )
}

fn check_private_directory(directory: &File) -> Result<(), String> {
    let metadata = directory.metadata().map_err(|error| error.to_string())?;
    if !metadata.is_dir()
        || metadata.uid() != unsafe { libc::geteuid() }
        || metadata.mode() & 0o7777 != 0o700
    {
        return Err(format!(
            "Destination staging directory is not owned and private (0700): uid={}, effective_uid={}, mode={:04o}",
            metadata.uid(),
            unsafe { libc::geteuid() },
            metadata.mode() & 0o7777
        ));
    }
    unsafe extern "C" {
        fn acl_get_fd_np(fd: libc::c_int, kind: libc::c_int) -> *mut libc::c_void;
        fn acl_get_entry(
            acl: *mut libc::c_void,
            entry_id: libc::c_int,
            entry: *mut *mut libc::c_void,
        ) -> libc::c_int;
        fn acl_free(acl: *mut libc::c_void) -> libc::c_int;
    }
    let acl = unsafe { acl_get_fd_np(directory.as_raw_fd(), 0x100) };
    if acl.is_null() {
        let error = std::io::Error::last_os_error();
        if matches!(error.raw_os_error(), Some(libc::ENOTSUP | libc::ENOENT)) {
            return Ok(());
        }
        return Err(format!("Destination staging ACL unavailable: {error}"));
    }
    let mut entry = std::ptr::null_mut();
    let result = unsafe { acl_get_entry(acl, 0, &mut entry) };
    let error = std::io::Error::last_os_error();
    unsafe {
        acl_free(acl);
    }
    if result == -1 && error.raw_os_error() == Some(libc::ENOENT) {
        Ok(())
    } else {
        Err("Destination staging directory has an ACL or unverifiable access permissions".into())
    }
}

fn confirm_directory_unlinked(directory: &File) -> Result<(), String> {
    if unsafe {
        libc::mkdirat(
            directory.as_raw_fd(),
            c".ameow-removal-proof".as_ptr(),
            0o700,
        )
    } != 0
    {
        let error = std::io::Error::last_os_error();
        if error.kind() == std::io::ErrorKind::NotFound {
            return Ok(());
        }
        return Err(format!(
            "Destination staging directory removal cannot be confirmed: {error}"
        ));
    }
    Err(
        "Destination staging directory remains writable through its identity; cleanup retained"
            .into(),
    )
}

struct PrivateStage {
    name: CString,
    path: PathBuf,
    directory: Option<File>,
    file: Option<File>,
    published: bool,
    uncertain: bool,
}

impl PrivateStage {
    fn directory(&self) -> Result<&File, String> {
        self.directory.as_ref().ok_or_else(|| {
            "Destination private staging identity unavailable; cleanup retained".into()
        })
    }

    fn verify_source(&mut self, bytes: u64, digest: &str) -> Result<(), String> {
        check_private_directory(self.directory()?)?;
        let current = stat_at(self.directory()?, c"media")
            .map_err(|error| format!("Destination private staging identity: {error}"))?;
        let file = self
            .file
            .as_mut()
            .ok_or("Destination private staging file unavailable")?;
        let before = file.metadata().map_err(|error| error.to_string())?;
        if !matches_stat(&before, &current)
            || !before.is_file()
            || before.nlink() != 1
            || before.len() != bytes
        {
            return Err("Destination private staging file identity changed".into());
        }
        file.seek(SeekFrom::Start(0))
            .map_err(|error| error.to_string())?;
        if hash(&mut *file)? != digest {
            return Err("Destination private staged integrity mismatch".into());
        }
        let after = file.metadata().map_err(|error| error.to_string())?;
        if before.len() != after.len()
            || before.mtime() != after.mtime()
            || before.mtime_nsec() != after.mtime_nsec()
            || before.ctime() != after.ctime()
            || before.ctime_nsec() != after.ctime_nsec()
            || !matches_stat(
                &after,
                &stat_at(self.directory()?, c"media").map_err(|error| error.to_string())?,
            )
        {
            return Err("Destination private staging changed during verification".into());
        }
        Ok(())
    }

    fn remove_empty(&self, parent: &File) -> Result<(), String> {
        if self.uncertain {
            return Err(
                "Destination staging operation outcome is uncertain; cleanup retained".into(),
            );
        }
        let directory = self.directory()?;
        match stat_at(directory, c"media") {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {},
            Ok(_) => return Err("Destination private staged file retained; exact named-file removal cannot be established".into()),
            Err(error) => return Err(format!("Destination private staging cleanup retained: {error}")),
        }
        if !self.published
            && let Some(file) = &self.file
            && file.metadata().map_err(|error| error.to_string())?.nlink() != 0
        {
            return Err("Destination private staged file remains linked; cleanup retained".into());
        }
        let metadata = directory.metadata().map_err(|error| error.to_string())?;
        match stat_at(parent, &self.name) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return confirm_directory_unlinked(directory);
            }
            Ok(current) if matches_stat(&metadata, &current) => {}
            _ => {
                return Err(
                    "Destination private directory identity changed; cleanup retained".into(),
                );
            }
        }
        if unsafe { libc::unlinkat(parent.as_raw_fd(), self.name.as_ptr(), libc::AT_REMOVEDIR) }
            != 0
        {
            return Err(format!(
                "Destination empty staging directory cleanup retained: {}",
                std::io::Error::last_os_error()
            ));
        }
        confirm_directory_unlinked(directory)
    }
}

#[must_use = "Owned stages require explicit cleanup or successful publication"]
pub struct DestinationStage {
    pub path: PathBuf,
    pub extension: String,
    file: Option<File>,
    expected: Option<(u64, String)>,
    unverified: Option<(PathBuf, Option<File>)>,
    directory: File,
    publication_name: Option<CString>,
    private: Option<PrivateStage>,
}

impl DestinationStage {
    pub fn create(media: &VerifiedMedia, destination: &Path, _job: u64) -> Result<Self, String> {
        let extension = media
            .facts
            .extension
            .as_deref()
            .or_else(|| media.path.extension().and_then(|value| value.to_str()))
            .filter(|value| {
                !value.is_empty()
                    && value.len() < 12
                    && value.bytes().all(|byte| byte.is_ascii_alphanumeric())
            })
            .unwrap_or(if media.kind == MediaKind::Video { "video" } else { "image" })
            .to_owned();
        let directory = File::open(destination).map_err(|error| error.to_string())?;
        if !directory
            .metadata()
            .map_err(|error| error.to_string())?
            .is_dir()
        {
            return Err("Destination is not a directory".into());
        }
        let file = tempfile::tempfile_in(destination)
            .map_err(|error| format!("Destination anonymous staging: {error}"))?;
        if !same_file(
            &directory.metadata().map_err(|error| error.to_string())?,
            &fs::metadata(destination).map_err(|error| error.to_string())?,
        ) {
            return Err("Destination directory changed during staging creation".into());
        }
        Ok(Self {
            path: PathBuf::new(),
            extension,
            file: Some(file),
            expected: None,
            unverified: None,
            directory,
            publication_name: None,
            private: None,
        })
    }

    pub fn fill(&mut self, media: &VerifiedMedia) -> Result<(), String> {
        if self.private.is_some() || self.unverified.is_some() {
            return Err(
                "Destination publication resources must be settled before refilling".into(),
            );
        }
        let output = self
            .file
            .as_mut()
            .ok_or("Destination staging handle unavailable")?;
        self.expected = None;
        output.set_len(0).map_err(|error| error.to_string())?;
        output
            .seek(SeekFrom::Start(0))
            .map_err(|error| error.to_string())?;
        let mut input = match &media.identity_guard {
            Some(file) => file.try_clone().map_err(|error| error.to_string())?,
            None => open_regular(&media.path)?,
        };
        input
            .seek(SeekFrom::Start(0))
            .map_err(|error| error.to_string())?;
        let bytes = copy_file_data(&mut input, output)
            .map_err(|error| format!("Destination stage copy: {error}"))?;
        sync_file(output).map_err(|error| format!("Destination stage sync: {error}"))?;
        output
            .seek(SeekFrom::Start(0))
            .map_err(|error| error.to_string())?;
        if bytes != media.bytes || hash(&mut *output)? != media.sha256 {
            return Err("Destination staged integrity mismatch".into());
        }
        self.expected = Some((bytes, media.sha256.clone()));
        Ok(())
    }

    pub fn owned_path(&self) -> Option<&Path> {
        self.unverified
            .as_ref()
            .map(|(path, _)| path.as_path())
            .or_else(|| self.private.as_ref().map(|stage| stage.path.as_path()))
    }

    pub fn cleanup(&mut self) -> Result<(), String> {
        if let Some((path, guard)) = &self.unverified {
            let guard = guard
                .as_ref()
                .ok_or("Published file identity unavailable; cleanup retained")?;
            let missing = if let Some(name) = &self.publication_name {
                match stat_at(&self.directory, name) {
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => true,
                    Ok(_) => false,
                    Err(error) => return Err(format!("Published file cleanup retained: {error}")),
                }
            } else {
                match fs::symlink_metadata(path) {
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => true,
                    Ok(_) => false,
                    Err(error) => return Err(format!("Published file cleanup retained: {error}")),
                }
            };
            if !missing || guard.metadata().map_err(|error| error.to_string())?.nlink() != 0 {
                return Err(
                    "Unverified published file retained; exact removal cannot be established"
                        .into(),
                );
            }
            self.unverified = None;
            self.publication_name = None;
        }
        if let Some(stage) = &self.private {
            stage.remove_empty(&self.directory)?;
        }
        self.private = None;
        self.file.take();
        self.expected = None;
        Ok(())
    }

    fn prepare_private(
        &mut self,
        destination: &Path,
        bytes: u64,
        digest: &str,
    ) -> Result<(), String> {
        if self.private.is_some() {
            return self.private.as_mut().unwrap().verify_source(bytes, digest);
        }
        use ring::rand::SecureRandom;
        for _ in 0..128 {
            let mut random = [0u8; 16];
            ring::rand::SystemRandom::new()
                .fill(&mut random)
                .map_err(|_| "Destination staging random name unavailable")?;
            let name = format!(
                ".ameow-stage-{}",
                random
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect::<String>()
            );
            let name = CString::new(name).map_err(|_| "Destination stage name contains NUL")?;
            self.private = Some(PrivateStage {
                path: destination.join(std::ffi::OsStr::from_bytes(name.to_bytes())),
                name,
                directory: None,
                file: None,
                published: false,
                uncertain: false,
            });
            let stage = self.private.as_mut().unwrap();
            if unsafe { libc::mkdirat(self.directory.as_raw_fd(), stage.name.as_ptr(), 0o700) } != 0
            {
                let error = std::io::Error::last_os_error();
                stage.uncertain = outcome_uncertain(&error);
                if !stage.uncertain {
                    self.private = None;
                }
                if error.kind() == std::io::ErrorKind::AlreadyExists {
                    continue;
                }
                return Err(format!("Destination private staging directory: {error}"));
            }
            stage.directory = Some(
                open_at(
                    &self.directory,
                    &stage.name,
                    libc::O_RDONLY | libc::O_DIRECTORY,
                    0,
                )
                .map_err(|error| format!("Destination private directory open: {error}"))?,
            );
            let directory = stage.directory()?;
            directory
                .set_permissions(fs::Permissions::from_mode(0o700))
                .map_err(|error| format!("Destination private directory permissions: {error}"))?;
            check_private_directory(directory)?;
            if !matches_stat(
                &directory.metadata().map_err(|error| error.to_string())?,
                &stat_at(&self.directory, &stage.name).map_err(|error| error.to_string())?,
            ) {
                return Err("Destination private staging directory identity changed".into());
            }
            match open_at(
                directory,
                c"media",
                libc::O_RDWR | libc::O_CREAT | libc::O_EXCL,
                0o600,
            ) {
                Ok(file) => stage.file = Some(file),
                Err(error) => {
                    stage.uncertain = outcome_uncertain(&error);
                    return Err(format!("Destination private staged file creation: {error}"));
                }
            }
            let input = self
                .file
                .as_mut()
                .ok_or("Destination anonymous staging handle unavailable")?;
            input
                .seek(SeekFrom::Start(0))
                .map_err(|error| error.to_string())?;
            let output = stage.file.as_mut().unwrap();
            copy_file_data(input, output)
                .map_err(|error| format!("Destination private stage copy: {error}"))?;
            sync_file(output)
                .map_err(|error| format!("Destination private stage sync: {error}"))?;
            return stage.verify_source(bytes, digest);
        }
        Err("Destination private staging collision bound exceeded".into())
    }

    pub fn publish(&mut self, destination: &Path, base: &str) -> Result<PathBuf, String> {
        self.publish_using(destination, base, clone_file, rename_file)
    }

    fn publish_using(
        &mut self,
        destination: &Path,
        base: &str,
        mut clone: impl FnMut(&File, &File, &CStr) -> std::io::Result<()>,
        mut rename: impl FnMut(&File, &CStr, &File, &CStr) -> std::io::Result<()>,
    ) -> Result<PathBuf, String> {
        if self.unverified.is_some() {
            return Err("Unverified publication must be cleaned up first".into());
        }
        let (expected_bytes, expected_hash) = self
            .expected
            .clone()
            .ok_or("Destination stage is not verified")?;
        let file = self
            .file
            .as_mut()
            .ok_or("Destination staging handle unavailable")?;
        file.seek(SeekFrom::Start(0))
            .map_err(|error| error.to_string())?;
        if file.metadata().map_err(|error| error.to_string())?.len() != expected_bytes
            || hash(&mut *file)? != expected_hash
        {
            return Err("Destination stage changed after verification".into());
        }
        if !same_file(
            &self
                .directory
                .metadata()
                .map_err(|error| error.to_string())?,
            &fs::metadata(destination).map_err(|error| error.to_string())?,
        ) {
            return Err("Destination directory identity changed".into());
        }
        let safe = safe_filename(base);
        let mut fallback = self.private.is_some();
        for collision in 0..10000 {
            let suffix = if collision == 0 {
                String::new()
            } else {
                format!(" ({collision})")
            };
            let name = format!("{safe}{suffix}.{}", self.extension);
            let name_c =
                CString::new(name.as_bytes()).map_err(|_| "Final filename contains NUL")?;
            if !fallback {
                match clone(self.file.as_ref().unwrap(), &self.directory, &name_c) {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(error) if clone_unavailable(&error) => fallback = true,
                    Err(error) => {
                        if outcome_uncertain(&error) {
                            self.unverified = Some((destination.join(&name), None));
                            self.publication_name = Some(name_c);
                        }
                        return Err(format!("Destination atomic no-replace clone: {error}"));
                    }
                }
            }
            if fallback {
                self.prepare_private(destination, expected_bytes, &expected_hash)?;
                let stage = self.private.as_mut().unwrap();
                stage.verify_source(expected_bytes, &expected_hash)?;
                let guard = stage
                    .file
                    .as_ref()
                    .unwrap()
                    .try_clone()
                    .map_err(|error| error.to_string())?;
                self.unverified = Some((destination.join(&name), Some(guard)));
                self.publication_name = Some(name_c.clone());
                match rename(stage.directory()?, c"media", &self.directory, &name_c) {
                    Ok(()) => stage.published = true,
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                        stage.verify_source(expected_bytes, &expected_hash)?;
                        self.unverified = None;
                        self.publication_name = None;
                        continue;
                    }
                    Err(error) => {
                        stage.uncertain = outcome_uncertain(&error);
                        if !stage.uncertain {
                            self.unverified = None;
                            self.publication_name = None;
                        }
                        return Err(format!("Destination atomic no-replace rename: {error}"));
                    }
                }
            } else {
                self.unverified = Some((destination.join(&name), None));
                self.publication_name = Some(name_c.clone());
            }
            let final_path = destination.join(&name);
            let mut guard =
                open_at(&self.directory, &name_c, libc::O_RDONLY, 0).map_err(|error| {
                    format!("Published file identity unavailable; cleanup retained: {error}")
                })?;
            let before = guard.metadata().map_err(|error| error.to_string())?;
            if let Some(stage) = &self.private {
                if !same_file(
                    &before,
                    &stage
                        .file
                        .as_ref()
                        .unwrap()
                        .metadata()
                        .map_err(|error| error.to_string())?,
                ) {
                    return Err("Published file is not the verified private staged object; cleanup retained".into());
                }
            }
            self.unverified.as_mut().unwrap().1 =
                Some(guard.try_clone().map_err(|error| error.to_string())?);
            let verified = before.is_file()
                && before.nlink() == 1
                && before.len() == expected_bytes
                && hash(&mut guard)? == expected_hash;
            let after = guard.metadata().map_err(|error| error.to_string())?;
            let current = fs::symlink_metadata(&final_path).map_err(|error| error.to_string())?;
            if !verified
                || !same_file(&before, &after)
                || !same_file(&after, &current)
                || !matches_stat(
                    &after,
                    &stat_at(&self.directory, &name_c).map_err(|error| error.to_string())?,
                )
                || !same_file(
                    &self
                        .directory
                        .metadata()
                        .map_err(|error| error.to_string())?,
                    &fs::metadata(destination).map_err(|error| error.to_string())?,
                )
                || before.len() != after.len()
                || before.mtime() != after.mtime()
                || before.mtime_nsec() != after.mtime_nsec()
                || before.ctime() != after.ctime()
                || before.ctime_nsec() != after.ctime_nsec()
            {
                return Err(
                    "Published file failed integrity verification; cleanup retained".into(),
                );
            }
            if let Some(stage) = &self.private {
                stage.remove_empty(&self.directory)?;
            }
            self.private = None;
            self.unverified = None;
            self.publication_name = None;
            self.file.take();
            self.expected = None;
            self.path = final_path.clone();
            return Ok(final_path);
        }
        Err("Destination collision bound exceeded".into())
    }
}

pub fn safe_filename(name: &str) -> String {
    let name: String = name
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
            {
                '_'
            } else {
                character
            }
        })
        .take(80)
        .collect();
    let name = name.trim().trim_end_matches(['.', ' ']);
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if name.is_empty() {
        "media".into()
    } else if matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.as_bytes()[3].is_ascii_digit())
    {
        format!("_{name}")
    } else {
        name.into()
    }
}

pub fn media_basename(title: &str, fallback: &str, facts: &VerifiedFacts) -> String {
    let title = title.trim().trim_end_matches(['.', ' ']);
    let name = safe_filename(if title.is_empty() { fallback } else { title });
    let resolution = match (facts.video_width, facts.video_height) {
        (Some(width), Some(height)) if width > 0 && height > 0 => format!("[{width}x{height}]"),
        _ => String::new(),
    };
    let name: String = name.chars().take(80 - resolution.len()).collect();
    format!("{}{resolution}", name.trim_end_matches(['.', ' ']))
}
pub fn collection_directory(destination: &Path, title: &str) -> Result<PathBuf, String> {
    let name = safe_filename(title);
    for collision in 0..10000 {
        let suffix = if collision == 0 {
            String::new()
        } else {
            format!(" ({collision})")
        };
        let path = destination.join(format!("{name}{suffix}"));
        match fs::create_dir(&path) {
            Ok(()) => return Ok(path),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("E_STORAGE: Collection directory: {error}")),
        }
    }
    Err("E_STORAGE: Collection directory collision bound exceeded".into())
}

#[cfg(test)]
#[path = "output_macos_tests.rs"]
mod tests;
