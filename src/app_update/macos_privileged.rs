use super::{Release, Trust, macos, macos_fs, macos_transaction::{fingerprint, readonly_fingerprint}, package, store::{atomic_json, read_json}};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::{fd::{AsRawFd, FromRawFd}, unix::{fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt}, net::UnixStream, process::CommandExt}},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::Duration,
};

const ROOT: &str = "/private/var/db/io.github.wutpeach.ameow-updater";
pub(super) const MARKER: &str = "macos-privileged.json";
const MAX_MESSAGE: usize = 32768;
const GATES: &str = "/private/var/db/io.github.wutpeach.ameow-update-gates";

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub(super) struct ProcessIdentity {
    pid: u32,
    uid: u32,
    gid: u32,
    started_seconds: u64,
    started_micros: u64,
    executable: PathBuf,
    parent: u32,
}

impl ProcessIdentity {
    pub(super) fn capture(pid: u32) -> Result<Self, String> {
        if pid <= 1 || pid > i32::MAX as u32 { return Err("E_APP_UPDATE_PROCESS_IDENTITY".into()); }
        let info = process_info(pid as i32).map_err(|error| format!("E_APP_UPDATE_PROCESS_IDENTITY: {error}"))?;
        let mut path = [0u8; 4096];
        let length = unsafe { libc::proc_pidpath(pid as i32, path.as_mut_ptr().cast(), path.len() as u32) };
        if length <= 0 {
            return Err(format!("E_APP_UPDATE_PROCESS_IDENTITY: pid={pid} proc_pidpath={length} errno={:?}", std::io::Error::last_os_error().raw_os_error()));
        }
        use std::os::unix::ffi::OsStrExt;
        let path = std::ffi::CStr::from_bytes_until_nul(&path)
            .map_err(|_| format!("E_APP_UPDATE_PROCESS_IDENTITY: pid={pid} proc_pidpath=unterminated"))?;
        Ok(Self { pid, uid: info.pbi_uid, gid: info.pbi_gid,
            started_seconds: info.pbi_start_tvsec, started_micros: info.pbi_start_tvusec,
            executable: PathBuf::from(std::ffi::OsStr::from_bytes(path.to_bytes())), parent: info.pbi_ppid })
    }

    pub(super) fn alive(&self) -> Result<bool, String> {
        if !super::macos_helper::process_alive(self.pid as i32)? { return Ok(false); }
        match Self::capture(self.pid) {
            Ok(current) => Ok(current.pid == self.pid && current.started_seconds == self.started_seconds
                && current.started_micros == self.started_micros),
            Err(_) if !super::macos_helper::process_alive(self.pid as i32)? => Ok(false),
            Err(error) => Err(error),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Marker {
    pub(super) token: String,
    pub(super) target: PathBuf,
    pub(super) release: Release,
    pub(super) recovery_helper: PathBuf,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, PartialEq)]
enum RootStage { Prepared, Swapping, Swapped, Confirmed, Accepted, Restoring, Restored }

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct RootJournal {
    schema: u32,
    token: String,
    target: PathBuf,
    updates: PathBuf,
    release: Release,
    owner: ProcessIdentity,
    trial: Option<ProcessIdentity>,
    stage: RootStage,
    original_hash: String,
    backup_hash: String,
    candidate_hash: String,
    target_device: u64,
    original_inode: u64,
    candidate_inode: u64,
    code: PathBuf,
}

struct Storage { base: PathBuf, owner: u32 }

fn no_acl(file: &File) -> Result<(), String> {
    unsafe extern "C" {
        fn acl_get_fd_np(fd: libc::c_int, kind: libc::c_int) -> *mut std::ffi::c_void;
        fn acl_free(acl: *mut std::ffi::c_void) -> i32;
    }
    let acl = unsafe { acl_get_fd_np(file.as_raw_fd(), 0x100) };
    if !acl.is_null() {
        unsafe { acl_free(acl); }
        return Err("E_APP_UPDATE_PRIVILEGED_ACL".into());
    }
    let error = std::io::Error::last_os_error();
    if error.raw_os_error() != Some(libc::ENOENT) {
        return Err(format!("E_APP_UPDATE_PRIVILEGED_ACL: {error}"));
    }
    Ok(())
}

fn protected_directory(path: &Path, owner: u32, private: bool) -> Result<File, String> {
    let directory = macos_fs::directory(path)?;
    let metadata = directory.metadata().map_err(|error| error.to_string())?;
    if metadata.uid() != owner || metadata.mode() & 0o022 != 0
        || private && metadata.mode() & 0o777 != 0o700 {
        return Err("E_APP_UPDATE_PRIVILEGED_DIRECTORY".into());
    }
    no_acl(&directory)?;
    Ok(directory)
}

fn create_private(path: &Path, owner: u32) -> Result<(), String> {
    match fs::DirBuilder::new().mode(0o700).create(path) {
        Ok(()) => macos_fs::directory(path.parent().ok_or("E_APP_UPDATE_PATH")?)?.sync_all().map_err(|error| error.to_string())?,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {},
        Err(error) => return Err(error.to_string()),
    }
    protected_directory(path, owner, true)?;
    Ok(())
}

fn protected_tree(root: &Path, owner: u32) -> Result<(), String> {
    fn visit(directory: &File, root: &Path, relative: &Path, owner: u32, count: &mut usize) -> Result<(), String> {
        for name in macos_fs::entries(directory)? {
            *count += 1;
            if *count > 16384 { return Err("E_APP_UPDATE_BUNDLE_SIZE".into()); }
            let metadata = macos_fs::child_metadata(directory, &name)?;
            if metadata.st_uid != owner || metadata.st_mode & libc::S_IFMT != libc::S_IFLNK && metadata.st_mode & 0o022 != 0 {
                return Err("E_APP_UPDATE_PRIVILEGED_SOURCE".into());
            }
            match metadata.st_mode & libc::S_IFMT {
                libc::S_IFDIR => {
                    let child = macos_fs::child_directory(directory, &name)?;
                    no_acl(&child)?;
                    visit(&child, root, &relative.join(name), owner, count)?;
                }
                libc::S_IFREG => { no_acl(&macos_fs::child_regular_file(directory, &name)?)?; }
                libc::S_IFLNK => {
                    let path = root.join(relative).join(name);
                    if !path.canonicalize().map_err(|_| "E_APP_UPDATE_PRIVILEGED_SOURCE")?.starts_with(root) {
                        return Err("E_APP_UPDATE_PRIVILEGED_SOURCE".into());
                    }
                }
                _ => return Err("E_APP_UPDATE_PRIVILEGED_SOURCE".into()),
            }
        }
        Ok(())
    }
    let directory = protected_directory(root, owner, false)?;
    visit(&directory, root, Path::new(""), owner, &mut 0)
}

fn sync_tree(root: &Path) -> Result<(), String> {
    fn visit(directory: &File) -> Result<(), String> {
        for name in macos_fs::entries(directory)? {
            let metadata = macos_fs::child_metadata(directory, &name)?;
            match metadata.st_mode & libc::S_IFMT {
                libc::S_IFDIR => visit(&macos_fs::child_directory(directory, &name)?)?,
                libc::S_IFREG => macos_fs::child_regular_file(directory, &name)?.sync_all().map_err(|error| error.to_string())?,
                libc::S_IFLNK => {},
                _ => return Err("E_APP_UPDATE_BUNDLE_TYPE".into()),
            }
        }
        directory.sync_all().map_err(|error| error.to_string())
    }
    visit(&macos_fs::directory(root)?)
}

fn candidate_permissions(root: &Path) -> Result<(), String> {
    fn visit(directory: &File) -> Result<(), String> {
        for name in macos_fs::entries(directory)? {
            let metadata = macos_fs::child_metadata(directory, &name)?;
            match metadata.st_mode & libc::S_IFMT {
                libc::S_IFDIR => visit(&macos_fs::child_directory(directory, &name)?)?,
                libc::S_IFREG => {
                    let file = macos_fs::child_regular_file(directory, &name)?;
                    file.set_permissions(fs::Permissions::from_mode(if metadata.st_mode & 0o111 != 0 { 0o755 } else { 0o644 }))
                        .map_err(|error| error.to_string())?;
                }
                libc::S_IFLNK => {},
                _ => return Err("E_APP_UPDATE_BUNDLE_TYPE".into()),
            }
        }
        directory.set_permissions(fs::Permissions::from_mode(0o755)).map_err(|error| error.to_string())
    }
    visit(&macos_fs::directory(root)?)
}

impl Storage {
    fn production(uid: u32) -> Result<Self, String> {
        if unsafe { libc::geteuid() } != 0 || uid == 0 { return Err("E_APP_UPDATE_PRIVILEGED_IDENTITY".into()); }
        for path in ["/", "/private", "/private/var", "/private/var/db"] { protected_directory(Path::new(path), 0, false)?; }
        create_private(Path::new(ROOT), 0)?;
        let base = Path::new(ROOT).join(uid.to_string());
        create_private(&base, 0)?;
        Ok(Self { base, owner: 0 })
    }

    fn transaction(&self, token: &str) -> Result<PathBuf, String> {
        package::unhex(token, 32)?;
        protected_directory(&self.base, self.owner, true)?;
        Ok(self.base.join(token))
    }

    fn prepare(&self, target: &Path, updates: &Path, release: &Release, code: &Path,
        owner: ProcessIdentity, trust: &Trust) -> Result<Transaction, String> {
        protected_tree(code, self.owner)?;
        let (original_hash, frozen_hash) = require_backup_identity(target, code)?;
        let mut random = [0u8; 32];
        ring::rand::SecureRandom::fill(&ring::rand::SystemRandom::new(), &mut random).map_err(|_| "E_APP_UPDATE_RANDOM")?;
        let token: String = random.iter().map(|byte| format!("{byte:02x}")).collect();
        let path = self.transaction(&token)?;
        create_private(&path, self.owner)?;
        let input = updates.join("versions").join(&release.version);
        super::Version::parse(&release.version)?;
        let mut envelope = Vec::new();
        macos_fs::regular_file(&input.join("manifest.json"))?.take(16385).read_to_end(&mut envelope).map_err(|error| error.to_string())?;
        let (signed, manifest) = trust.verify(&envelope, None)?;
        if manifest.version != release.version || manifest.sequence != release.sequence
            || package::hash(signed.payload.as_bytes()) != release.manifest_hash {
            return Err("E_APP_UPDATE_RELEASE_IDENTITY".into());
        }
        manifest.newer_than(&macos::plist_value(code, "CFBundleShortVersionString")?)?;
        let mut archive = OpenOptions::new().read(true).write(true).create_new(true).mode(0o600)
            .open(path.join("package.zip")).map_err(|error| error.to_string())?;
        let mut source = macos_fs::regular_file(&input.join("package.zip"))?.take(package::MAX_PACKAGE + 1);
        let copied = std::io::copy(&mut source, &mut archive).map_err(|error| error.to_string())?;
        if copied != manifest.package_bytes { return Err("E_APP_UPDATE_PACKAGE_SIZE".into()); }
        archive.sync_all().map_err(|error| error.to_string())?;
        let payload = path.join("payload");
        create_private(&payload, self.owner)?;
        macos::extract(&mut archive, &payload, &manifest, None)?;
        let candidate = payload.join("Ameow.app");
        candidate_permissions(&candidate)?;
        protected_tree(&candidate, self.owner)?;
        macos::verify_codesign_against(code, &candidate, &manifest)?;
        let backup_parent = path.join("backup");
        create_private(&backup_parent, self.owner)?;
        let backup = backup_parent.join("Ameow.app");
        let status = Command::new("/usr/bin/ditto").args(["--noacl", "--noextattr"]).arg(code).arg(&backup)
            .status().map_err(|error| error.to_string())?;
        if !status.success() { return Err("E_APP_UPDATE_PRIVILEGED_BACKUP".into()); }
        protected_tree(&backup, self.owner)?;
        if fingerprint(&backup)? != frozen_hash || fingerprint(target)? != original_hash
            || readonly_fingerprint(target)? != frozen_hash {
            return Err("E_APP_UPDATE_PRIVILEGED_BACKUP_IDENTITY".into());
        }
        sync_tree(&backup)?;
        sync_tree(&candidate)?;
        sync_tree(code)?;
        let original = macos_fs::directory(target)?.metadata().map_err(|error| error.to_string())?;
        let staged = macos_fs::directory(&candidate)?.metadata().map_err(|error| error.to_string())?;
        if original.dev() != staged.dev() { return Err("E_APP_UPDATE_PRIVILEGED_VOLUME".into()); }
        let code = if self.owner == 0 {
            protected_directory(Path::new(GATES), 0, false)?;
            let durable = Path::new(GATES).join(format!("code-{token}"));
            if durable.try_exists().map_err(|error| error.to_string())? { return Err("E_APP_UPDATE_PRIVILEGED_SOURCE".into()); }
            fs::rename(code.parent().ok_or("E_APP_UPDATE_PRIVILEGED_SOURCE")?, &durable).map_err(|error| error.to_string())?;
            macos_fs::directory(Path::new(GATES))?.sync_all().map_err(|error| error.to_string())?;
            durable.join("Ameow.app")
        } else { code.to_path_buf() };
        let journal = RootJournal { schema: 1, token, target: target.into(), updates: updates.into(),
            release: release.clone(), owner, trial: None, stage: RootStage::Prepared,
            original_hash, backup_hash: frozen_hash, candidate_hash: fingerprint(&candidate)?,
            target_device: original.dev(), original_inode: original.ino(), candidate_inode: staged.ino(), code };
        let transaction = Transaction { path, journal, storage_owner: self.owner, relaunched: None };
        transaction.persist()?;
        Ok(transaction)
    }

    fn load(&self, token: &str) -> Result<Transaction, String> {
        let path = self.transaction(token)?;
        protected_directory(&path, self.owner, true)?;
        let journal: RootJournal = read_json(&path.join("journal.json"))?;
        if journal.schema != 1 || journal.token != token { return Err("E_APP_UPDATE_PRIVILEGED_JOURNAL".into()); }
        Ok(Transaction { path, journal, storage_owner: self.owner, relaunched: None })
    }

    fn interrupted(&self, target: &Path, updates: &Path) -> Result<Option<Transaction>, String> {
        let entries = fs::read_dir(&self.base).map_err(|error| error.to_string())?.take(130)
            .collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
        if entries.len() >= 130 { return Err("E_APP_UPDATE_PRIVILEGED_STORAGE_LIMIT".into()); }
        let mut interrupted = None;
        for entry in entries {
            let name = entry.file_name();
            let Some(token) = name.to_str().filter(|name| name.len() == 64) else { continue; };
            if !entry.path().join("journal.json").exists() { continue; }
            let previous = self.load(token)?;
            if previous.journal.target == target && !matches!(outcome(&previous), Outcome::Accepted | Outcome::Restored) {
                if interrupted.is_some() || previous.journal.updates != updates { return Err("E_APP_UPDATE_PRIVILEGED_JOURNAL".into()); }
                interrupted = Some(previous);
            }
        }
        Ok(interrupted)
    }
}

struct Transaction { path: PathBuf, journal: RootJournal, storage_owner: u32, relaunched: Option<ProcessIdentity> }

impl Transaction {
    fn candidate(&self) -> PathBuf { self.path.join("payload/Ameow.app") }
    fn backup(&self) -> PathBuf { self.path.join("backup/Ameow.app") }
    fn persist(&self) -> Result<(), String> {
        protected_directory(&self.path, self.storage_owner, true)?;
        atomic_json(&self.path.join("journal.json"), &self.journal)?;
        macos_fs::directory(&self.path)?.sync_all().map_err(|error| error.to_string())
    }

    fn target_hash(&self) -> Result<Option<String>, String> {
        match fs::symlink_metadata(&self.journal.target) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error.to_string()),
            Ok(metadata) if metadata.is_dir() => fingerprint(&self.journal.target).map(Some),
            _ => Err("E_APP_UPDATE_PRIVILEGED_TARGET_CHANGED".into()),
        }
    }

    fn original_installed(&self) -> Result<bool, String> {
        Ok(self.target_hash()?.is_some_and(|hash| hash == self.journal.original_hash || hash == self.journal.backup_hash))
    }

    fn require_quiescent(&self) -> Result<(), String> {
        if self.journal.owner.alive()? || self.journal.trial.as_ref().map(ProcessIdentity::alive).transpose()?.unwrap_or(false) {
            return Err("E_APP_UPDATE_PRIVILEGED_PROCESS_ACTIVE".into());
        }
        if self.storage_owner == 0 && running_executables(&[
            self.journal.target.join("Contents/MacOS/ameow"), self.journal.target.join("Contents/MacOS/ameow-updater"),
        ])? { return Err("E_APP_UPDATE_PRIVILEGED_PROCESS_ACTIVE".into()); }
        Ok(())
    }

    fn swap(&mut self) -> Result<(), String> {
        self.require_quiescent()?;
        if self.journal.stage != RootStage::Prepared || self.target_hash()?.as_deref() != Some(self.journal.original_hash.as_str())
            || fingerprint(&self.candidate())? != self.journal.candidate_hash {
            return Err("E_APP_UPDATE_PRIVILEGED_TARGET_CHANGED".into());
        }
        self.journal.stage = RootStage::Swapping;
        self.persist()?;
        let original = macos_fs::directory(&self.journal.target)?.metadata().map_err(|error| error.to_string())?;
        if original.dev() != self.journal.target_device || original.ino() != self.journal.original_inode {
            return Err("E_APP_UPDATE_PRIVILEGED_TARGET_CHANGED".into());
        }
        macos::exchange(&self.journal.target, &self.candidate())?;
        if self.target_hash()?.as_deref() != Some(self.journal.candidate_hash.as_str()) {
            return Err("E_APP_UPDATE_PRIVILEGED_TARGET_CHANGED".into());
        }
        self.journal.stage = RootStage::Swapped;
        self.persist()
    }

    fn register_trial(&mut self, pid: u32, supervisor: u32) -> Result<(), String> {
        if self.journal.stage != RootStage::Swapped || self.journal.trial.is_some() { return Err("E_APP_UPDATE_PRIVILEGED_STAGE".into()); }
        let trial = ProcessIdentity::capture(pid)?;
        if trial.uid != self.journal.owner.uid || trial.parent != supervisor || trial.executable != self.journal.target.join("Contents/MacOS/ameow")
            || super::macos_authorization::process_cdhash(pid)? != disk_hash(&trial.executable)? {
            return Err("E_APP_UPDATE_PRIVILEGED_PROCESS_IDENTITY".into());
        }
        self.journal.trial = Some(trial);
        self.persist()
    }

    fn register_relaunch(&mut self, pid: u32, supervisor: u32) -> Result<(), String> {
        if !matches!(self.journal.stage, RootStage::Accepted | RootStage::Restored) {
            return Err("E_APP_UPDATE_PRIVILEGED_STAGE".into());
        }
        let process = ProcessIdentity::capture(pid)?;
        if process.uid != self.journal.owner.uid || process.parent != supervisor
            || process.executable != self.journal.target.join("Contents/MacOS/ameow")
            || super::macos_authorization::process_cdhash(pid)? != disk_hash(&process.executable)? {
            return Err("E_APP_UPDATE_PRIVILEGED_PROCESS_IDENTITY".into());
        }
        self.relaunched = Some(process);
        self.require_ready_to_finish()
    }

    fn require_ready_to_finish(&self) -> Result<(), String> {
        let valid = match self.journal.stage {
            RootStage::Accepted => self.target_hash()?.as_deref() == Some(self.journal.candidate_hash.as_str()),
            RootStage::Restored => self.original_installed()?,
            _ => false,
        };
        if !valid { return Err("E_APP_UPDATE_PRIVILEGED_STAGE".into()); }
        let process = self.relaunched.as_ref().or_else(||
            (self.journal.stage == RootStage::Accepted).then_some(self.journal.trial.as_ref()).flatten())
            .ok_or("E_APP_UPDATE_RECOVERY_NOT_READY")?;
        if !process.alive()? || process.executable != self.journal.target.join("Contents/MacOS/ameow")
            || super::macos_authorization::process_cdhash(process.pid)? != disk_hash(&process.executable)? {
            return Err("E_APP_UPDATE_RECOVERY_NOT_READY".into());
        }
        Ok(())
    }

    fn confirm(&mut self) -> Result<(), String> {
        if self.journal.stage != RootStage::Swapped || self.journal.trial.as_ref().is_none_or(|trial| !trial.alive().unwrap_or(false))
            || self.target_hash()?.as_deref() != Some(self.journal.candidate_hash.as_str()) {
            return Err("E_APP_UPDATE_PRIVILEGED_STAGE".into());
        }
        self.journal.stage = RootStage::Confirmed;
        self.persist()
    }

    fn accept(&mut self) -> Result<(), String> {
        if self.journal.stage != RootStage::Confirmed || self.journal.trial.as_ref().is_none_or(|trial| !trial.alive().unwrap_or(false))
            || self.target_hash()?.as_deref() != Some(self.journal.candidate_hash.as_str()) {
            return Err("E_APP_UPDATE_PRIVILEGED_STAGE".into());
        }
        self.journal.stage = RootStage::Accepted;
        self.persist()
    }

    fn rollback(&mut self) -> Result<(), String> {
        if self.journal.stage == RootStage::Accepted { return Err("E_APP_UPDATE_PRIVILEGED_COMMITTED".into()); }
        self.require_quiescent()?;
        if self.original_installed()? {
            self.journal.stage = RootStage::Restored;
            return self.persist();
        }
        protected_tree(&self.backup(), self.storage_owner)?;
        if fingerprint(&self.backup())? != self.journal.backup_hash { return Err("E_APP_UPDATE_PRIVILEGED_BACKUP".into()); }
        let metadata = fs::symlink_metadata(&self.journal.target);
        if let Ok(metadata) = &metadata {
            if !metadata.is_dir() || metadata.dev() != self.journal.target_device || metadata.ino() != self.journal.candidate_inode {
                return Err("E_APP_UPDATE_PRIVILEGED_TARGET_CHANGED".into());
            }
        }
        self.journal.stage = RootStage::Restoring;
        self.persist()?;
        match metadata {
            Ok(_) => macos::exchange(&self.journal.target, &self.backup())?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => macos::restore_missing(&self.backup(), &self.journal.target)?,
            Err(error) => return Err(error.to_string()),
        }
        if self.target_hash()?.as_deref() != Some(self.journal.backup_hash.as_str()) {
            return Err("E_APP_UPDATE_PRIVILEGED_BACKUP".into());
        }
        self.journal.stage = RootStage::Restored;
        self.persist()
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Request {
    source: PathBuf,
    target: PathBuf,
    updates: PathBuf,
    owner: u32,
    release: Option<Release>,
    recovery: Option<String>,
    args: Vec<String>,
}

#[derive(Deserialize, Serialize)]
pub(super) enum Operation { Swap, Trial(u32), Relaunch(u32), Confirm, Accept, Restore, Finish, Status, Complete }

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
pub(super) enum Outcome { Prepared, Pending, Accepted, Restored }

#[derive(Deserialize, Serialize)]
struct Supervisor {
    marker: Marker,
    updates: PathBuf,
    args: Vec<String>,
    recovery: bool,
}

pub(super) struct Client { pipe: File }

pub(super) fn marker(updates: &Path) -> Result<Option<Marker>, String> {
    match fs::symlink_metadata(updates.join(MARKER)) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
        Ok(_) => {
            let value: Marker = read_json(&updates.join(MARKER))?;
            package::unhex(&value.token, 32)?;
            Ok(Some(value))
        }
    }
}

fn index_path(target: &Path, uid: u32) -> PathBuf {
    gate_path(target).with_extension(format!("{uid}.json"))
}

fn read_index(path: &Path, uid: u32) -> Result<Option<Marker>, String> {
    let mut file = match macos_fs::regular_file(path) {
        Ok(file) => file,
        Err(_) if fs::symlink_metadata(path).is_err_and(|error| error.kind() == std::io::ErrorKind::NotFound) => return Ok(None),
        Err(error) => return Err(error),
    };
    let metadata = file.metadata().map_err(|error| error.to_string())?;
    if metadata.uid() != uid || metadata.mode() & 0o222 != 0 { return Err("E_APP_UPDATE_PRIVILEGED_INDEX".into()); }
    no_acl(&file)?;
    let mut bytes = Vec::new();
    Read::by_ref(&mut file).take(65537).read_to_end(&mut bytes).map_err(|error| error.to_string())?;
    if bytes.len() > 65536 { return Err("E_APP_UPDATE_PRIVILEGED_INDEX".into()); }
    let value: Marker = serde_json::from_slice(&bytes).map_err(|_| "E_APP_UPDATE_PRIVILEGED_INDEX")?;
    package::unhex(&value.token, 32)?;
    Ok(Some(value))
}

fn publish_index(directory: &Path, path: &Path, value: &Marker) -> Result<(), String> {
    let mut file = tempfile::NamedTempFile::new_in(directory).map_err(|error| error.to_string())?;
    serde_json::to_writer(file.as_file_mut(), value).map_err(|error| error.to_string())?;
    file.as_file().set_permissions(fs::Permissions::from_mode(0o444)).map_err(|error| error.to_string())?;
    file.as_file().sync_all().map_err(|error| error.to_string())?;
    file.persist(path).map_err(|error| error.to_string())?;
    macos_fs::directory(directory)?.sync_all().map_err(|error| error.to_string())
}

pub(super) fn root_marker(target: &Path) -> Result<Option<Marker>, String> {
    if existing_gate(target)?.is_some()
        && let Some(value) = read_index(&index_path(target, unsafe { libc::geteuid() }), 0)? {
        if value.target != target { return Err("E_APP_UPDATE_PRIVILEGED_INDEX".into()); }
        return Ok(Some(value));
    }
    Ok(None)
}

pub(super) fn recovery_marker(updates: &Path, target: &Path) -> Result<Option<Marker>, String> {
    if let Some(value) = root_marker(target)? { return Ok(Some(value)); }
    marker(updates)
}

impl Client {
    pub(super) fn prepare(source: &Path, updates: &Path, release: Option<Release>, recovery: Option<Marker>, args: Vec<String>) -> Result<Self, String> {
        let target = recovery.as_ref().map_or_else(|| source.to_path_buf(), |value| value.target.clone());
        let mut pipe = super::macos_authorization::launch(source)?;
        let mut line = Vec::new();
        for _ in 0..1024 {
            let mut byte = [0];
            pipe.read_exact(&mut byte).map_err(|error| format!("E_APP_UPDATE_AUTHORIZATION_BOOTSTRAP: {error}"))?;
            if byte[0] == b'\n' { break; }
            line.push(byte[0]);
        }
        if !line.starts_with(b"BOOTSTRAP /private/tmp/ameow-privileged-code.") {
            return Err("E_APP_UPDATE_AUTHORIZATION_BOOTSTRAP".into());
        }
        write_message(&mut pipe, &Request { source: source.into(), target, updates: updates.into(),
            owner: std::process::id(), release, recovery: recovery.map(|value| value.token), args })?;
        let result: Result<Marker, String> = read_message(&mut pipe)?;
        let marker = result?;
        super::macos_lease::promote_for_process(&marker.target)?;
        atomic_json(&updates.join(MARKER), &marker)?;
        macos_fs::directory(updates)?.sync_all().map_err(|error| error.to_string())?;
        Ok(Self { pipe })
    }

    pub(super) fn go(&mut self) -> Result<(), String> {
        self.pipe.write_all(b"GO\n").and_then(|_| self.pipe.flush())
            .map_err(|error| format!("E_APP_UPDATE_PRIVILEGED_PIPE: {error}"))
    }
}

pub(super) fn gate_path(target: &Path) -> PathBuf {
    use std::os::unix::ffi::OsStrExt;
    Path::new(GATES).join(package::hash(target.as_os_str().as_bytes()))
}

pub(super) fn existing_gate(target: &Path) -> Result<Option<File>, String> {
    let path = gate_path(target);
    match fs::symlink_metadata(GATES) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
        Ok(_) => {},
    }
    protected_directory(Path::new(GATES), 0, false)?;
    let file = match macos_fs::regular_file(&path) {
        Ok(file) => file,
        Err(_) if fs::symlink_metadata(&path).is_err_and(|error| error.kind() == std::io::ErrorKind::NotFound) => return Ok(None),
        Err(error) => return Err(error),
    };
    let metadata = file.metadata().map_err(|error| error.to_string())?;
    if metadata.uid() != 0 || metadata.mode() & 0o222 != 0 { return Err("E_APP_UPDATE_PRIVILEGED_GATE".into()); }
    no_acl(&file)?;
    Ok(Some(file))
}

fn create_gate(target: &Path) -> Result<File, String> {
    match fs::DirBuilder::new().mode(0o755).create(GATES) {
        Ok(()) => {
            let directory = macos_fs::directory(Path::new(GATES))?;
            directory.set_permissions(fs::Permissions::from_mode(0o755)).map_err(|error| error.to_string())?;
            directory.sync_all().map_err(|error| error.to_string())?;
            macos_fs::directory(Path::new("/private/var/db"))?.sync_all().map_err(|error| error.to_string())?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {},
        Err(error) => return Err(error.to_string()),
    }
    protected_directory(Path::new(GATES), 0, false)?;
    match OpenOptions::new().write(true).create_new(true).mode(0o444).open(gate_path(target)) {
        Ok(file) => {
            file.set_permissions(fs::Permissions::from_mode(0o444)).map_err(|error| error.to_string())?;
            file.sync_all().map_err(|error| error.to_string())?;
            macos_fs::directory(Path::new(GATES))?.sync_all().map_err(|error| error.to_string())?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {},
        Err(error) => return Err(error.to_string()),
    }
    existing_gate(target)?.ok_or_else(|| "E_APP_UPDATE_PRIVILEGED_GATE".into())
}

fn lock_gate(file: &File) -> Result<(), String> {
    loop {
        if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } == 0 { return Ok(()); }
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() != Some(libc::EWOULDBLOCK) { return Err(format!("E_APP_UPDATE_PRIVILEGED_GATE: {error}")); }
        std::thread::sleep(Duration::from_millis(40));
    }
}

fn disk_hash(executable: &Path) -> Result<String, String> {
    macos_fs::regular_file(executable)?;
    let output = Command::new("/usr/bin/codesign").args(["--display", "--verbose=4", "--arch", "arm64"])
        .arg(executable).output().map_err(|error| error.to_string())?;
    if !output.status.success() { return Err("E_APP_UPDATE_RUNNING_IDENTITY".into()); }
    String::from_utf8_lossy(&output.stderr).lines().find_map(|line| line.strip_prefix("CDHash="))
        .map(str::to_owned).ok_or_else(|| "E_APP_UPDATE_RUNNING_IDENTITY".into())
}

fn user_home(uid: u32) -> Result<PathBuf, String> {
    let mut entry = std::mem::MaybeUninit::<libc::passwd>::uninit();
    let mut buffer = vec![0u8; 65536];
    let mut result = std::ptr::null_mut();
    let status = unsafe { libc::getpwuid_r(uid, entry.as_mut_ptr(), buffer.as_mut_ptr().cast(), buffer.len(), &mut result) };
    if status != 0 || result.is_null() { return Err("E_APP_UPDATE_PRIVILEGED_USER".into()); }
    let entry = unsafe { entry.assume_init() };
    use std::os::unix::ffi::OsStrExt;
    let home = unsafe { std::ffi::CStr::from_ptr(entry.pw_dir) };
    Ok(PathBuf::from(std::ffi::OsStr::from_bytes(home.to_bytes())))
}

fn user_groups(uid: u32, gid: u32) -> Result<Vec<libc::gid_t>, String> {
    let mut entry = std::mem::MaybeUninit::<libc::passwd>::uninit();
    let mut buffer = vec![0u8; 65536];
    let mut result = std::ptr::null_mut();
    if unsafe { libc::getpwuid_r(uid, entry.as_mut_ptr(), buffer.as_mut_ptr().cast(), buffer.len(), &mut result) } != 0 || result.is_null() {
        return Err("E_APP_UPDATE_PRIVILEGED_USER".into());
    }
    let entry = unsafe { entry.assume_init() };
    let mut groups = vec![0i32; 1024];
    let mut count = groups.len() as i32;
    if unsafe { libc::getgrouplist(entry.pw_name, gid as i32, groups.as_mut_ptr(), &mut count) } < 0 || !(1..=1024).contains(&count) {
        return Err("E_APP_UPDATE_PRIVILEGED_GROUPS".into());
    }
    groups[..count as usize].iter().map(|group| (*group).try_into().map_err(|_| "E_APP_UPDATE_PRIVILEGED_GROUPS".into())).collect()
}

fn running_executables(targets: &[PathBuf]) -> Result<bool, String> {
    let estimate = unsafe { libc::proc_listallpids(std::ptr::null_mut(), 0) };
    if !(1..=32768).contains(&estimate) {
        return Err(format!("E_APP_UPDATE_PROCESS_TABLE: proc_listallpids=estimate returned={estimate} errno={:?}",
            (estimate <= 0).then(|| std::io::Error::last_os_error().raw_os_error()).flatten()));
    }
    let mut pids = vec![0i32; estimate as usize + 256];
    let count = unsafe { libc::proc_listallpids(pids.as_mut_ptr().cast(), (pids.len() * std::mem::size_of::<i32>()) as i32) };
    if count <= 0 || count as usize >= pids.len() {
        return Err(format!("E_APP_UPDATE_PROCESS_TABLE: proc_listallpids=list returned={count} capacity={} errno={:?}",
            pids.len(), (count <= 0).then(|| std::io::Error::last_os_error().raw_os_error()).flatten()));
    }
    for pid in pids.into_iter().take(count as usize).filter(|pid| *pid > 1) {
        if executable_is_running(pid, targets)? { return Ok(true); }
    }
    Ok(false)
}

fn executable_is_running(pid: i32, targets: &[PathBuf]) -> Result<bool, String> {
    use std::os::unix::ffi::OsStrExt;
    let mut bytes = [0u8; 4096];
    let length = unsafe { libc::proc_pidpath(pid, bytes.as_mut_ptr().cast(), bytes.len() as u32) };
    if length > 0 {
        let path = std::ffi::CStr::from_bytes_until_nul(&bytes)
            .map_err(|_| format!("E_APP_UPDATE_PROCESS_IDENTITY: pid={pid} proc_pidpath=unterminated"))?;
        return Ok(targets.iter().any(|target| target.as_os_str().as_bytes() == path.to_bytes()));
    }
    let path_error = std::io::Error::last_os_error().raw_os_error();
    let mut name = [0u8; 1024];
    let named = unsafe { libc::proc_name(pid, name.as_mut_ptr().cast(), name.len() as u32) };
    let name_error = (named <= 0).then(|| std::io::Error::last_os_error().raw_os_error()).flatten();
    if named > 0 {
        let name_value = std::ffi::CStr::from_bytes_until_nul(&name)
            .map_err(|_| format!("E_APP_UPDATE_PROCESS_IDENTITY: pid={pid} proc_name=unterminated"))?;
        if !could_be_target_name(name_value.to_bytes(), 32, targets) {
            return Ok(false);
        }
    }
    unresolved_executable(pid, targets, process_info(pid),
        &format!("proc_pidpath={length} errno={path_error:?} proc_name={named} errno={name_error:?}"),
        || super::macos_helper::process_alive(pid), || confirmed_zombie(pid))
}

fn process_info(pid: i32) -> Result<libc::proc_bsdinfo, String> {
    let mut info = std::mem::MaybeUninit::<libc::proc_bsdinfo>::uninit();
    let size = std::mem::size_of::<libc::proc_bsdinfo>() as i32;
    let length = unsafe { libc::proc_pidinfo(pid, libc::PROC_PIDTBSDINFO, 0, info.as_mut_ptr().cast(), size) };
    if length != size {
        let error = (length <= 0).then(|| std::io::Error::last_os_error().raw_os_error()).flatten();
        return Err(format!("pid={pid} proc_pidinfo={length}/{size} errno={error:?}"));
    }
    let info = unsafe { info.assume_init() };
    if info.pbi_pid != pid as u32 {
        return Err(format!("pid={pid} proc_pidinfo=identity returned_pid={}", info.pbi_pid));
    }
    Ok(info)
}

fn could_be_target_name(name: &[u8], capacity: usize, targets: &[PathBuf]) -> bool {
    use std::os::unix::ffi::OsStrExt;
    name.is_empty() || targets.iter().any(|target| target.file_name().is_some_and(|value|
        value.as_bytes() == name || name.len() + 1 >= capacity && value.as_bytes().starts_with(name)))
}

fn unresolved_executable(
    pid: i32, targets: &[PathBuf], info: Result<libc::proc_bsdinfo, String>, diagnostics: &str,
    alive: impl FnOnce() -> Result<bool, String>, zombie: impl FnOnce() -> Result<bool, String>,
) -> Result<bool, String> {
    if !alive().map_err(|error| format!("E_APP_UPDATE_PRIVILEGED_PROCESS_UNKNOWN: pid={pid} {diagnostics}; {error}"))? { return Ok(false); }
    let detail = match info {
        Ok(info) => {
            if info.pbi_status == libc::SZOMB { return Ok(false); }
            let name = if info.pbi_name[0] != 0 { &info.pbi_name[..] } else { &info.pbi_comm[..] };
            let bytes = name.iter().map(|byte| *byte as u8).collect::<Vec<_>>();
            if let Ok(value) = std::ffi::CStr::from_bytes_until_nul(&bytes)
                && !could_be_target_name(value.to_bytes(), bytes.len(), targets) { return Ok(false); }
            format!("proc_pidinfo=ok uid={} status={}", info.pbi_uid, info.pbi_status)
        }
        Err(error) => {
            match zombie() {
                Ok(true) => return Ok(false),
                Ok(false) => error,
                Err(status_error) => format!("{error}; {status_error}"),
            }
        }
    };
    Err(format!("E_APP_UPDATE_PRIVILEGED_PROCESS_UNKNOWN: pid={pid} {diagnostics}; {detail}"))
}

fn zombie_record(bytes: &[u8], pid: i32) -> bool {
    if bytes.len() > 128 || !bytes.is_ascii() { return false; }
    let Ok(text) = std::str::from_utf8(bytes) else { return false; };
    let mut fields = text.split_whitespace();
    fields.next().and_then(|field| field.parse::<i32>().ok()) == Some(pid)
        && fields.next().and_then(|state| state.strip_prefix('Z')).is_some_and(|flags|
            flags.bytes().all(|byte| matches!(byte, b'+' | b's' | b'<' | b'N' | b'L' | b'X' | b'E')))
        && fields.next().is_none()
}

fn confirmed_zombie(pid: i32) -> Result<bool, String> {
    let result = Command::new("/bin/ps").args(["-p", &pid.to_string(), "-o", "pid=,state="])
        .env("LC_ALL", "C").stdin(Stdio::null()).output()
        .map_err(|error| format!("E_APP_UPDATE_PRIVILEGED_PROCESS_UNKNOWN: pid={pid} ps={error}"))?;
    Ok(result.status.success() && result.stderr.is_empty() && zombie_record(&result.stdout, pid))
}

fn allowed_target(target: &Path, home: &Path) -> bool {
    target.extension().is_some_and(|extension| extension == "app")
        && (target.parent() == Some(Path::new("/Applications")) || target.parent() == Some(home.join("Applications").as_path()))
}

fn require_backup_identity(target: &Path, frozen: &Path) -> Result<(String, String), String> {
    let original = fingerprint(target)?;
    let snapshot = fingerprint(frozen)?;
    if readonly_fingerprint(target)? != snapshot { return Err("E_APP_UPDATE_PRIVILEGED_BACKUP_IDENTITY".into()); }
    Ok((original, snapshot))
}

fn validate_request(request: &Request, code: &Path) -> Result<ProcessIdentity, String> {
    let owner = ProcessIdentity::capture(request.owner)?;
    let real_uid = unsafe { libc::getuid() };
    if owner.uid == 0 || owner.uid != real_uid {
        return Err(format!("E_APP_UPDATE_PRIVILEGED_IDENTITY: caller={}, real={real_uid}, effective={}", owner.uid, unsafe { libc::geteuid() }));
    }
    let image = owner.executable.file_name().and_then(|name| name.to_str()).ok_or("E_APP_UPDATE_PROCESS_IDENTITY")?;
    if !matches!(image, "ameow" | "ameow-updater") || owner.executable != request.source.join("Contents/MacOS").join(image)
        || super::macos_authorization::process_cdhash(owner.pid)? != disk_hash(&code.join("Contents/MacOS").join(image))? {
        return Err("E_APP_UPDATE_PRIVILEGED_IDENTITY".into());
    }
    let home = user_home(owner.uid)?;
    if !allowed_target(&request.target, &home) {
        return Err("E_APP_UPDATE_PRIVILEGED_TARGET_POLICY".into());
    }
    macos_fs::directory(request.target.parent().ok_or("E_APP_UPDATE_PRIVILEGED_TARGET_POLICY")?)?;
    if request.recovery.is_none() {
        if image != "ameow" { return Err("E_APP_UPDATE_PRIVILEGED_DRAIN_OWNER".into()); }
        if request.source != request.target { return Err("E_APP_UPDATE_PRIVILEGED_TARGET_POLICY".into()); }
        macos_fs::directory(&request.target)?;
        let status = Command::new("/usr/bin/codesign").args(["--verify", "--deep", "--strict", "--all-architectures"])
            .arg(&request.target).status().map_err(|error| error.to_string())?;
        if !status.success() || disk_hash(&request.target.join("Contents/MacOS").join(image))?
            != super::macos_authorization::process_cdhash(owner.pid)? {
            return Err("E_APP_UPDATE_PRIVILEGED_IDENTITY".into());
        }
    }
    if macos::plist_value(code, "CFBundleIdentifier")? != "io.github.wutpeach.ameow" {
        return Err("E_APP_UPDATE_BUNDLE_IDENTITY".into());
    }
    let updates = macos_fs::directory(&request.updates)?;
    let metadata = updates.metadata().map_err(|error| error.to_string())?;
    if metadata.uid() != owner.uid || metadata.mode() & 0o022 != 0 { return Err("E_APP_UPDATE_PRIVILEGED_UPDATES".into()); }
    #[cfg(not(all(feature = "app-update-fixture", debug_assertions)))]
    {
        let expected = home.join("Library/Application Support/AmeowNative/Updates");
        if request.updates != expected { return Err("E_APP_UPDATE_PRIVILEGED_UPDATES".into()); }
    }
    Ok(owner)
}

fn outcome(transaction: &Transaction) -> Outcome {
    match transaction.journal.stage { RootStage::Prepared => Outcome::Prepared, RootStage::Accepted => Outcome::Accepted, RootStage::Restored => Outcome::Restored, _ => Outcome::Pending }
}

pub(super) fn worker(code: &Path) -> Result<(), String> {
    if unsafe { libc::geteuid() } != 0 { return Err("E_APP_UPDATE_PRIVILEGED_IDENTITY".into()); }
    let parent = code.parent().ok_or("E_APP_UPDATE_PRIVILEGED_SOURCE")?;
    if parent.parent() != Some(Path::new("/private/tmp")) || !parent.file_name().is_some_and(|name| name.to_string_lossy().starts_with("ameow-privileged-code."))
        || code.file_name().is_none_or(|name| name != "Ameow.app")
        || std::env::current_exe().map_err(|error| error.to_string())? != code.join("Contents/MacOS/ameow-updater") {
        return Err("E_APP_UPDATE_PRIVILEGED_SOURCE".into());
    }
    protected_directory(parent, 0, false)?;
    protected_tree(code, 0)?;
    let request: Request = read_message(&mut std::io::stdin().lock())?;
    let mut recovering = request.recovery.is_some();
    let prepared: Result<(Transaction, ProcessIdentity, File, File), String> = (|| {
        let owner = validate_request(&request, code)?;
        let storage = Storage::production(owner.uid)?;
        let running = super::store::exclusive(&storage.base.join("worker.lock"))?;
        let gate = create_gate(&request.target)?;
        let transaction = if let Some(token) = &request.recovery {
            let transaction = storage.load(token)?;
            if transaction.journal.target != request.target || transaction.journal.updates != request.updates
                || transaction.journal.owner.uid != owner.uid { return Err("E_APP_UPDATE_PRIVILEGED_JOURNAL".into()); }
            transaction
        } else {
            let release = request.release.as_ref().ok_or("E_APP_UPDATE_NOT_READY")?;
            #[cfg(all(feature = "app-update-fixture", debug_assertions))]
            let trust = Trust::fixture();
            #[cfg(not(all(feature = "app-update-fixture", debug_assertions)))]
            let trust = Trust::production()?;
            if let Some(previous) = storage.interrupted(&request.target, &request.updates)? {
                recovering = true;
                previous
            } else {
                storage.prepare(&request.target, &request.updates, release, code, owner.clone(), &trust)?
            }
        };
        Ok((transaction, owner, gate, running))
    })();
    let (mut transaction, owner, gate, _running) = match prepared {
        Ok(prepared) => prepared,
        Err(error) => { write_message(&mut std::io::stdout().lock(), &Result::<Marker, String>::Err(error.clone()))?; return Err(error); }
    };
    let marker = Marker { token: transaction.journal.token.clone(), target: request.target.clone(),
        release: transaction.journal.release.clone(), recovery_helper: transaction.journal.code.join("Contents/MacOS/ameow-updater") };
    let started = (|| {
        publish_index(Path::new(GATES), &index_path(&request.target, owner.uid), &marker)?;
        start_supervisor(supervisor_bundle(code, &transaction, recovering), &request, &owner, &gate, marker.clone(), recovering)
    })();
    let (mut root, mut child) = match started {
        Ok(value) => value,
        Err(error) => {
            write_message(&mut std::io::stdout().lock(), &Result::<Marker, String>::Err(error.clone()))?;
            return Err(error);
        }
    };
    let activation = (|| {
        write_message(&mut std::io::stdout().lock(), &Ok::<_, String>(&marker))?;
        let mut go = [0u8; 3];
        std::io::stdin().read_exact(&mut go).map_err(|error| format!("E_APP_UPDATE_PRIVILEGED_HANDOFF: {error}"))?;
        if &go != b"GO\n" { return Err("E_APP_UPDATE_PRIVILEGED_HANDOFF".into()); }
        while owner.alive()? { std::thread::sleep(Duration::from_millis(40)); }
        lock_gate(&gate)
    })();
    let delivered = write_message(&mut root, &activation);
    drop(gate);
    let result = match (activation, delivered) {
        (Err(error), _) | (_, Err(error)) => Err(error),
        (Ok(()), Ok(())) => serve_operations(&mut transaction, child.id(), &mut root, settle_worker),
    };
    drop(root);
    let waited = child.wait().map_err(|error| format!("E_APP_UPDATE_PRIVILEGED_SUPERVISOR_WAIT: {error}"))?;
    result?;
    if !waited.success() { return Err(format!("E_APP_UPDATE_PRIVILEGED_SUPERVISOR_EXIT: {waited}")); }
    Ok(())
}

fn supervisor_bundle<'bundle>(bootstrap: &'bundle Path, transaction: &'bundle Transaction, recovering: bool) -> &'bundle Path {
    if recovering { bootstrap } else { &transaction.journal.code }
}

fn start_supervisor(
    code: &Path, request: &Request, owner: &ProcessIdentity, gate: &File, marker: Marker, recovery: bool,
) -> Result<(UnixStream, std::process::Child), String> {
    let (mut root, user) = UnixStream::pair().map_err(|error| error.to_string())?;
    let descriptor = user.as_raw_fd();
    protected_tree(code, 0)?;
    let mut command = Command::new(code.join("Contents/MacOS/ameow-updater"));
    command.arg("--privileged-supervisor").arg(descriptor.to_string()).arg(&request.target)
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(all(feature = "app-update-fixture", debug_assertions))]
    command.env("AMEOW_UPDATE_FIXTURE_ROOT", &request.updates);
    let uid = owner.uid;
    let gid = owner.gid;
    let groups = user_groups(uid, gid)?;
    unsafe { command.pre_exec(move || {
        if libc::setgroups(groups.len() as i32, groups.as_ptr()) != 0 || libc::setgid(gid) != 0 || libc::setuid(uid) != 0
            || libc::fcntl(descriptor, libc::F_SETFD, 0) != 0 {
            return Err(std::io::Error::last_os_error());
        }
        Ok(())
    }); }
    let mut child = super::macos_lease::spawn_with_lease(&mut command, gate)?;
    drop(user);
    let started = (|| {
        write_message(&mut root, &Supervisor { marker, updates: request.updates.clone(), args: request.args.clone(), recovery })?;
        let initialized: Result<(), String> = read_message(&mut root)?;
        initialized
    })();
    if let Err(error) = started {
        drop(root);
        let waited = child.wait().map_err(|wait_error| format!("{error}; E_APP_UPDATE_PRIVILEGED_SUPERVISOR_WAIT: {wait_error}"))?;
        return Err(format!("{error}; supervisor={waited}"));
    }
    Ok((root, child))
}

fn serve_operations(
    transaction: &mut Transaction, supervisor: u32, root: &mut UnixStream,
    mut settle: impl FnMut(&mut Transaction) -> Result<(), String>,
) -> Result<(), String> {
    let mut completing = false;
    let result = (|| { loop {
        let operation: Operation = read_message(root)?;
        if matches!(operation, Operation::Complete) {
            completing = true;
            let result = settle(transaction).map(|_| outcome(transaction));
            write_message(root, &result)?;
            return result.map(|_| ());
        }
        let result = (|| { match operation {
            Operation::Swap => transaction.swap(),
            Operation::Trial(pid) => transaction.register_trial(pid, supervisor),
            Operation::Relaunch(pid) => transaction.register_relaunch(pid, supervisor),
            Operation::Confirm => transaction.confirm(),
            Operation::Accept => transaction.accept(),
            Operation::Restore => transaction.rollback(),
            Operation::Finish => {
                transaction.require_ready_to_finish()?;
                {
                    let path = index_path(&transaction.journal.target, transaction.journal.owner.uid);
                    let value = read_index(&path, 0)?.ok_or("E_APP_UPDATE_PRIVILEGED_INDEX")?;
                    if value.token != transaction.journal.token { return Err("E_APP_UPDATE_PRIVILEGED_INDEX".into()); }
                    fs::remove_file(path).map_err(|error| error.to_string())?;
                    macos_fs::directory(Path::new(GATES))?.sync_all().map_err(|error| error.to_string())
                }
            }
            Operation::Status => Ok(()),
            Operation::Complete => unreachable!(),
        } })().map(|_| outcome(transaction));
        write_message(root, &result)?;
    } })();
    if !completing && let Err(error) = result {
        return match settle(transaction) {
            Ok(()) => Err(error),
            Err(recovery) => Err(format!("{error}; E_APP_UPDATE_PRIVILEGED_SETTLEMENT: {recovery}")),
        };
    }
    result
}

fn settle_worker(transaction: &mut Transaction) -> Result<(), String> {
    if matches!(outcome(transaction), Outcome::Prepared | Outcome::Pending) {
        let gate = existing_gate(&transaction.journal.target)?.ok_or("E_APP_UPDATE_PRIVILEGED_GATE")?;
        lock_gate(&gate)?;
        transaction.rollback()?;
    }
    Ok(())
}

pub(super) struct Remote { pipe: UnixStream }

impl Remote {
    pub(super) fn new(pipe: UnixStream) -> Self { Self { pipe } }

    pub(super) fn call(&mut self, operation: Operation) -> Result<Outcome, String> {
        write_message(&mut self.pipe, &operation)?;
        let result: Result<Outcome, String> = read_message(&mut self.pipe)?;
        result
    }
}

pub(super) fn supervisor(descriptor: i32, target: &Path) -> Result<(), String> {
    if unsafe { libc::geteuid() } == 0 || descriptor < 3 { return Err("E_APP_UPDATE_PRIVILEGED_IDENTITY".into()); }
    let pipe = unsafe { UnixStream::from_raw_fd(descriptor) };
    if unsafe { libc::fcntl(descriptor, libc::F_SETFD, libc::FD_CLOEXEC) } != 0 { return Err("E_APP_UPDATE_PRIVILEGED_PIPE".into()); }
    let mut remote = Remote::new(pipe);
    let config: Supervisor = read_message(&mut remote.pipe)?;
    let initialized: Result<super::Install, String> = (|| {
        if config.marker.target != target { return Err("E_APP_UPDATE_PRIVILEGED_IDENTITY".into()); }
        #[cfg(all(feature = "app-update-fixture", debug_assertions))]
        if std::env::var_os("AMEOW_UPDATE_FIXTURE_ROOT").as_deref() != Some(config.updates.as_os_str()) {
            return Err("E_APP_UPDATE_FIXTURE_ROOT_IDENTITY".into());
        }
        #[cfg(all(feature = "app-update-fixture", debug_assertions))]
        let install = super::Install::fixture(config.updates.clone())?;
        #[cfg(not(all(feature = "app-update-fixture", debug_assertions)))]
        let install = super::Install::production(config.updates.clone())?;
        Ok(install)
    })();
    write_message(&mut remote.pipe, &initialized.as_ref().map(|_| ()).map_err(Clone::clone))?;
    let install = initialized?;
    supervise_worker(&install, &config, &mut remote, || super::macos_lease::adopt_for_target(target))
}

fn supervise_worker(
    install: &super::Install, config: &Supervisor, remote: &mut Remote,
    lease: impl FnOnce() -> Result<File, String>,
) -> Result<(), String> {
    let activation = (|| {
        let result: Result<(), String> = read_message(&mut remote.pipe)?;
        result
    })();
    if let Err(error) = activation { return super::macos_helper::record_result(install, Err(error)); }
    let result = (|| {
        let lease = lease()?;
        let _running = super::store::exclusive(&install.root.join("running.lock"))?;
        let args = config.args.iter().map(std::ffi::OsString::from).collect::<Vec<_>>();
        super::macos_helper::privileged(install, &config.marker, &args, &lease, remote, config.recovery)
    })();
    let completion = remote.call(Operation::Complete).map(|_| ());
    let result = match (result, completion) {
        (Err(error), Err(completion)) => Err(format!("{error}; E_APP_UPDATE_PRIVILEGED_COMPLETION: {completion}")),
        (Err(error), _) | (_, Err(error)) => Err(error),
        _ => Ok(()),
    };
    super::macos_helper::record_result(install, result)
}

pub(super) fn write_message(file: &mut impl Write, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    if bytes.len() > MAX_MESSAGE { return Err("E_APP_UPDATE_PRIVILEGED_MESSAGE_SIZE".into()); }
    file.write_all(&(bytes.len() as u32).to_be_bytes()).and_then(|_| file.write_all(&bytes))
        .and_then(|_| file.flush()).map_err(|error| format!("E_APP_UPDATE_PRIVILEGED_PIPE: {error}"))
}

pub(super) fn read_message<T: serde::de::DeserializeOwned>(file: &mut impl Read) -> Result<T, String> {
    let mut size = [0u8; 4];
    file.read_exact(&mut size).map_err(|error| format!("E_APP_UPDATE_PRIVILEGED_PIPE: {error}"))?;
    let size = u32::from_be_bytes(size) as usize;
    if size == 0 || size > MAX_MESSAGE { return Err("E_APP_UPDATE_PRIVILEGED_MESSAGE_SIZE".into()); }
    let mut bytes = vec![0u8; size];
    file.read_exact(&mut bytes).map_err(|error| format!("E_APP_UPDATE_PRIVILEGED_PIPE: {error}"))?;
    serde_json::from_slice(&bytes).map_err(|error| format!("E_APP_UPDATE_PRIVILEGED_MESSAGE: {error}"))
}

#[cfg(test)]
#[path = "macos_privileged_tests.rs"]
mod tests;
