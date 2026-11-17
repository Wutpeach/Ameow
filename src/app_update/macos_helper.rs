use super::{
    Install, Release,
    launcher::{Ready, Ticket},
    macos, macos_lease,
    macos_transaction::{Journal, Placement, Stage},
    session::OwnerReady,
    store::{atomic_json, exclusive, plain, read_json},
};
use std::{
    ffi::{CStr, OsString},
    fs::{self, File},
    io::{BufRead, Read, Write},
    os::{macos::fs::MetadataExt as MacMetadataExt, unix::{ffi::OsStrExt, fs::{MetadataExt, PermissionsExt}}},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

unsafe extern "C" {
    fn getppid() -> i32;
    fn geteuid() -> u32;
    fn kill(pid: i32, signal: i32) -> i32;
    fn proc_pidpath(pid: i32, buffer: *mut std::ffi::c_void, length: u32) -> i32;
}

pub(super) fn process_alive(pid: i32) -> Result<bool, String> {
    if pid <= 1 { return Err("E_APP_UPDATE_PARENT".into()); }
    if unsafe { kill(pid, 0) } == 0 { return Ok(true); }
    let error = std::io::Error::last_os_error();
    match error.raw_os_error() {
        Some(3) => Ok(false),
        Some(1) => Ok(true),
        _ => Err(format!("E_APP_UPDATE_PARENT: {error}")),
    }
}

fn parent_for_bundle(bundle: &Path) -> Result<i32, String> {
    let pid = unsafe { getppid() };
    if pid <= 1 { return Err("E_APP_UPDATE_PARENT".into()); }
    let mut buffer = [0u8; 4096];
    if unsafe { proc_pidpath(pid, buffer.as_mut_ptr().cast(), buffer.len() as u32) } <= 0 {
        return Err(format!("E_APP_UPDATE_PARENT: {}", std::io::Error::last_os_error()));
    }
    let bytes = CStr::from_bytes_until_nul(&buffer).map_err(|_| "E_APP_UPDATE_PARENT")?.to_bytes();
    let parent = PathBuf::from(std::ffi::OsStr::from_bytes(bytes)).canonicalize().map_err(|e| e.to_string())?;
    let expected = bundle.join("Contents/MacOS/ameow").canonicalize().map_err(|e| e.to_string())?;
    if parent != expected { return Err("E_APP_UPDATE_PARENT".into()); }
    Ok(pid)
}

fn wait_for_parent(pid: i32) -> Result<(), String> {
    while process_alive(pid)? { std::thread::sleep(Duration::from_millis(50)); }
    Ok(())
}

fn wait_for_lease(root: &Path) -> Result<File, String> {
    let deadline = Instant::now() + Duration::from_secs(60);
    loop {
        match macos_lease::acquire_for_helper(root) {
            Ok(lease) => return Ok(lease),
            Err(error) if Instant::now() < deadline && error.starts_with("E_APP_UPDATE_LOCK:") => {
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(error) => return Err(error),
        }
    }
}

fn selected(install: &Install) -> Result<Release, String> {
    install.state()?.pending.ok_or_else(|| "E_APP_UPDATE_NOT_READY".into())
}

fn begin_trial(install: &Install, release: &Release) -> Result<(), String> {
    let _lock = install.lock()?;
    let mut state = install.load()?;
    if state.trial.is_some() || state.pending.as_ref().map(|item| &item.manifest_hash) != Some(&release.manifest_hash) {
        return Err("E_APP_UPDATE_TRIAL_CHANGED".into());
    }
    state.pending = None;
    state.trial = Some(release.clone());
    install.save(&state)
}

fn committed(install: &Install, release: &Release) -> Result<(), String> {
    let _lock = install.lock()?;
    let mut state = install.load()?;
    if state.current.as_ref().is_some_and(|item| item.manifest_hash == release.manifest_hash)
        && state.trial.is_none() { return Ok(()); }
    if state.trial.as_ref().map(|item| &item.manifest_hash) != Some(&release.manifest_hash) {
        return Err("E_APP_UPDATE_TRIAL_CHANGED".into());
    }
    state.previous = state.current.take();
    state.current = Some(release.clone());
    state.pending = None;
    state.trial = None;
    state.last_error = None;
    install.save(&state)
}

fn rolled_back(install: &Install, release: &Release, attempted: bool) -> Result<(), String> {
    let _lock = install.lock()?;
    let mut state = install.load()?;
    if state.trial.as_ref().is_some_and(|item| item.manifest_hash != release.manifest_hash) {
        return Err("E_APP_UPDATE_TRIAL_CHANGED".into());
    }
    if attempted {
        state.trial = None;
        state.pending = None;
        if state.current.as_ref().is_some_and(|item| item.manifest_hash == release.manifest_hash) {
            state.current = state.previous.take();
        }
        if !state.failed.contains(&release.manifest_hash) { state.failed.push(release.manifest_hash.clone()); }
        if state.failed.len() > 32 { state.failed.remove(0); }
        state.last_error = Some(format!("E_APP_UPDATE_ROLLED_BACK: {} did not become Ready", release.version));
    } else if state.trial.is_some() {
        state.pending = state.trial.take();
    }
    install.save(&state)
}

fn release_for_journal(install: &Install, journal: &Journal) -> Result<Release, String> {
    let state = install.state()?;
    [&state.trial, &state.pending, &state.current].into_iter().flatten()
        .find(|item| item.manifest_hash == journal.manifest_hash).cloned()
        .ok_or_else(|| "E_APP_UPDATE_JOURNAL_IDENTITY".into())
}

fn random_nonce() -> Result<String, String> {
    let mut random = [0u8; 32];
    ring::rand::SecureRandom::fill(&ring::rand::SystemRandom::new(), &mut random)
        .map_err(|_| "E_APP_UPDATE_RANDOM")?;
    Ok(random.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn start_app(bundle: &Path, args: &[OsString], lease: &File, session: Option<&Path>) -> Result<Child, String> {
    let mut command = Command::new(bundle.join("Contents/MacOS/ameow"));
    command.args(args).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    if let Some(session) = session { command.env("AMEOW_LAUNCH_SESSION", session); }
    else { command.env_remove("AMEOW_LAUNCH_SESSION"); }
    macos_lease::spawn_with_lease(&mut command, lease)
}

struct Trial {
    child: Child,
    boot: tempfile::TempDir,
    ticket: Ticket,
}

fn valid_ready(ready: &Ready, ticket: &Ticket, child: u32) -> bool {
    ready.nonce == ticket.nonce && ready.version == ticket.version && ready.pid == child
}

fn valid_owner_ready(ready: &OwnerReady, ticket: &Ticket, child: u32) -> bool {
    ready.nonce == ticket.nonce && ready.version == ticket.version
        && ready.pid == child && ready.sequence > 0
}

#[derive(Default)]
struct ReadyTracker {
    first: Option<Instant>,
    sequence: Option<u64>,
    progress: Option<Instant>,
}

impl ReadyTracker {
    fn observe(&mut self, sequence: Option<u64>, now: Instant) -> bool {
        let Some(sequence) = sequence else {
            *self = Self::default();
            return false;
        };
        let stalled = self.progress.is_some_and(|at| now.saturating_duration_since(at) > Duration::from_millis(500));
        if self.sequence.is_none_or(|previous| sequence > previous) {
            if stalled { self.first = None; }
            let first = *self.first.get_or_insert(now);
            let continued = self.sequence.is_some();
            self.sequence = Some(sequence);
            self.progress = Some(now);
            continued && now.saturating_duration_since(first) >= Duration::from_millis(800)
        } else {
            if stalled { self.first = None; }
            false
        }
    }
}

impl Trial {
    fn accept(&self) -> Result<(), String> {
        atomic_json(&self.boot.path().join("accepted.json"), &self.ticket.nonce)
    }
    fn commit(&self) -> Result<(), String> {
        atomic_json(&self.boot.path().join("committed.json"), &self.ticket.nonce)
    }
    fn abort_and_wait(&mut self) -> Result<(), String> {
        atomic_json(&self.boot.path().join("abort.json"), &self.ticket.nonce)?;
        while self.child.try_wait().map_err(|e| e.to_string())?.is_none() {
            std::thread::sleep(Duration::from_millis(40));
        }
        Ok(())
    }
    fn wait_for_current_owner(&mut self) -> Result<(), String> {
        let path = self.boot.path().join("owner-ready.json");
        let first: OwnerReady = read_json(&path)?;
        if !valid_owner_ready(&first, &self.ticket, self.child.id()) {
            return Err("E_APP_UPDATE_OWNER_NOT_READY".into());
        }
        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            if self.child.try_wait().map_err(|e| e.to_string())?.is_some() {
                return Err("E_APP_UPDATE_READY_EXIT".into());
            }
            if read_json::<OwnerReady>(&path).is_ok_and(|value|
                valid_owner_ready(&value, &self.ticket, self.child.id()) && value.sequence > first.sequence) {
                return Ok(());
            }
            if Instant::now() >= deadline { return Err("E_APP_UPDATE_OWNER_NOT_READY".into()); }
            std::thread::sleep(Duration::from_millis(40));
        }
    }
    fn wait_for_acknowledgement(&mut self, name: &str) -> Result<(), String> {
        let deadline = Instant::now() + Duration::from_secs(if cfg!(test) { 2 } else { 10 });
        loop {
            if self.child.try_wait().map_err(|e| e.to_string())?.is_some() {
                return Err("E_APP_UPDATE_ACCEPTANCE_EXIT".into());
            }
            if read_json::<String>(&self.boot.path().join(name))
                .is_ok_and(|nonce| nonce == self.ticket.nonce)
                && self.child.try_wait().map_err(|e| e.to_string())?.is_none() {
                return Ok(());
            }
            if Instant::now() >= deadline { return Err("E_APP_UPDATE_ACCEPTANCE_TIMEOUT".into()); }
            std::thread::sleep(Duration::from_millis(40));
        }
    }
}

struct TrialError {
    error: String,
    child_started: bool,
}

fn wait_trial(
    install: &Install,
    bundle: &Path,
    release: &Release,
    args: &[OsString],
    lease: &File,
) -> Result<Option<Trial>, TrialError> {
    wait_trial_registered(install, bundle, release, args, lease, None, |_| Ok(()))
}

fn wait_trial_registered(
    install: &Install, bundle: &Path, release: &Release, args: &[OsString], lease: &File,
    privileged: Option<String>, register: impl FnMut(u32) -> Result<(), String>,
) -> Result<Option<Trial>, TrialError> {
    wait_ready(install, bundle, &release.version, args, lease, privileged, false, register)
}

fn wait_ready(
    install: &Install, bundle: &Path, version: &str, args: &[OsString], lease: &File,
    privileged: Option<String>, relaunch: bool, mut register: impl FnMut(u32) -> Result<(), String>,
) -> Result<Option<Trial>, TrialError> {
    let before_start = |error: String| TrialError { error, child_started: false };
    let after_start = |error: String| TrialError { error, child_started: true };
    #[cfg(all(feature = "app-update-fixture", debug_assertions))]
    if std::env::var_os("AMEOW_UPDATE_TEST_FAIL_AT").is_some_and(|value| value == "trial-bootstrap") {
        return Err(before_start("E_APP_UPDATE_TEST_TRIAL_BOOTSTRAP".into()));
    }
    let boot = tempfile::Builder::new().prefix("boot-").tempdir_in(&install.root)
        .map_err(|error| before_start(error.to_string()))?;
    let ticket = Ticket {
        nonce: random_nonce().map_err(&before_start)?, version: version.into(), install: install.root.clone(),
        bundle: Some(bundle.to_path_buf()), supervisor: Some(std::process::id()),
        privileged,
    };
    atomic_json(&boot.path().join("ticket.json"), &ticket).map_err(&before_start)?;
    if relaunch { atomic_json(&boot.path().join("relaunch.json"), &ticket.nonce).map_err(&before_start)?; }
    let mut child = match start_app(bundle, args, lease, Some(boot.path())) {
        Ok(child) => child,
        Err(error) => return Err(before_start(format!("E_APP_UPDATE_START: {error}"))),
    };
    if let Err(error) = register(child.id()) {
        atomic_json(&boot.path().join("abort.json"), &ticket.nonce).map_err(&after_start)?;
        child.wait().map_err(|error| after_start(error.to_string()))?;
        return Err(after_start(error));
    }
    let deadline = Instant::now() + Duration::from_secs(if cfg!(test) { 5 } else if cfg!(all(feature = "app-update-fixture", debug_assertions)) { 8 } else { 60 });
    let mut readiness = ReadyTracker::default();
    let mut abort = false;
    loop {
        if child.try_wait().map_err(|error| after_start(error.to_string()))?.is_some() { return Ok(None); }
        if !abort {
            let ready: Result<Ready, _> = read_json(&boot.path().join("ready.json"));
            let owner: Result<OwnerReady, _> = read_json(&boot.path().join("owner-ready.json"));
            let sequence = if ready.is_ok_and(|value| valid_ready(&value, &ticket, child.id())) {
                owner.ok().filter(|value| valid_owner_ready(value, &ticket, child.id())).map(|value| value.sequence)
            } else {
                None
            };
            if readiness.observe(sequence, Instant::now())
                && child.try_wait().map_err(|error| after_start(error.to_string()))?.is_none() {
                return Ok(Some(Trial { child, boot, ticket }));
            }
            if Instant::now() >= deadline {
                atomic_json(&boot.path().join("abort.json"), &ticket.nonce).map_err(&after_start)?;
                abort = true;
            }
        }
        std::thread::sleep(Duration::from_millis(40));
    }
}

fn ready_relaunch(
    install: &Install, bundle: &Path, args: &[OsString], lease: &File,
    mut register: impl FnMut(u32) -> Result<(), String>,
) -> Result<Trial, String> {
    let version = macos::plist_value(bundle, "CFBundleShortVersionString")?;
    let mut trial = wait_ready(install, bundle, &version, args, lease, None, true, |_| Ok(()))
        .map_err(|failure| failure.error)?.ok_or("E_APP_UPDATE_RECOVERY_NOT_READY")?;
    let result = (|| {
        trial.wait_for_acknowledgement("relaunch-ack.json")?;
        trial.wait_for_current_owner()?;
        register(trial.child.id())?;
        atomic_json(&trial.boot.path().join("finalized.json"), &trial.ticket.nonce)?;
        trial.wait_for_acknowledgement("final-ack.json")
    })();
    if let Err(error) = result {
        trial.abort_and_wait()?;
        return Err(format!("E_APP_UPDATE_RECOVERY_NOT_READY: {error}"));
    }
    Ok(trial)
}

fn finish_local_relaunch(
    install: &Install, journal: &Journal, bundle: &Path, args: &[OsString], lease: &File,
) -> Result<(), String> {
    let _ready = ready_relaunch(install, bundle, args, lease, |_| Ok(()))?;
    journal.finish(&install.root)
}

fn create_stage(parent: &Path) -> Result<tempfile::TempDir, String> {
    tempfile::Builder::new().prefix(".ameow-update-")
        .permissions(fs::Permissions::from_mode(0o700))
        .tempdir_in(parent)
        .map_err(|error| if error.kind() == std::io::ErrorKind::PermissionDenied {
            "E_APP_UPDATE_AUTHORIZATION_REQUIRED".to_string()
        } else { format!("E_APP_UPDATE_STAGE: {error}") })
}

fn check_bundle_permissions(bundle: &Path, parent: &Path) -> Result<(), String> {
    const IMMUTABLE_OR_APPEND: u32 = 0x0000_0002 | 0x0000_0004 | 0x0002_0000 | 0x0004_0000;
    const SYSTEM_NO_UNLINK: u32 = 0x0010_0000;
    let bundle_metadata = fs::symlink_metadata(bundle).map_err(|e| e.to_string())?;
    let parent_metadata = fs::symlink_metadata(parent).map_err(|e| e.to_string())?;
    if !bundle_metadata.is_dir() || !parent_metadata.is_dir() { return Err("E_APP_UPDATE_BUNDLE_IDENTITY".into()); }
    if bundle_metadata.st_flags() & (IMMUTABLE_OR_APPEND | SYSTEM_NO_UNLINK) != 0
        || parent_metadata.st_flags() & IMMUTABLE_OR_APPEND != 0 {
        return Err("E_APP_UPDATE_BUNDLE_IMMUTABLE".into());
    }
    let user = unsafe { geteuid() };
    if parent_metadata.mode() & 0o1000 != 0 && parent_metadata.uid() != user && bundle_metadata.uid() != user {
        return Err("E_APP_UPDATE_AUTHORIZATION_REQUIRED".into());
    }
    super::macos_fs::check_removable_tree(bundle)
}

pub(super) fn needs_authorization(bundle: &Path) -> Result<bool, String> {
    let parent = bundle.parent().ok_or("E_APP_UPDATE_BUNDLE_IDENTITY")?;
    let directory = super::macos_fs::directory(parent)?;
    if unsafe { libc::faccessat(std::os::fd::AsRawFd::as_raw_fd(&directory), c".".as_ptr(), libc::W_OK | libc::X_OK, libc::AT_EACCESS) } != 0 {
        let error = std::io::Error::last_os_error();
        if error.kind() == std::io::ErrorKind::PermissionDenied { return Ok(true); }
        return Err(format!("E_APP_UPDATE_PERMISSION_CHECK: {error}"));
    }
    match check_bundle_permissions(bundle, parent) {
        Ok(()) => Ok(false),
        Err(error) if error == "E_APP_UPDATE_AUTHORIZATION_REQUIRED" => Ok(true),
        Err(error) => Err(error),
    }
}

fn check_exchange(stage: &tempfile::TempDir) -> Result<(), String> {
    let parent = stage.path().parent().ok_or("E_APP_UPDATE_STAGE")?;
    let probe = tempfile::Builder::new().prefix(".ameow-swap-probe-")
        .permissions(fs::Permissions::from_mode(0o700))
        .tempdir_in(parent).map_err(|error| {
            if error.kind() == std::io::ErrorKind::PermissionDenied {
                "E_APP_UPDATE_AUTHORIZATION_REQUIRED".to_string()
            } else { format!("E_APP_UPDATE_STAGE: {error}") }
        })?;
    let other = stage.path().join(".exchange-probe");
    fs::create_dir(&other).map_err(|e| format!("E_APP_UPDATE_STAGE: {e}"))?;
    macos::exchange(probe.path(), &other)?;
    macos::exchange(probe.path(), &other)?;
    fs::remove_dir(other).map_err(|e| format!("E_APP_UPDATE_STAGE: {e}"))
}

fn sync_staged_bundle(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() { return Ok(()); }
    if metadata.is_dir() {
        for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
            sync_staged_bundle(&entry.map_err(|e| e.to_string())?.path())?;
        }
    } else if !metadata.is_file() {
        return Err("E_APP_UPDATE_BUNDLE_TYPE".into());
    }
    File::open(path).and_then(|file| file.sync_all())
        .map_err(|e| format!("E_APP_UPDATE_STAGE_SYNC: {e}"))
}

const RECOVERY_HELPER: &str = "ameow-updater-recovery";

fn cache_recovery_helper(install: &Install, bundle: &Path) -> Result<(), String> {
    let source = bundle.join("Contents/MacOS/ameow-updater");
    plain(&source)?;
    if std::env::current_exe().map_err(|e| e.to_string())?.canonicalize().map_err(|e| e.to_string())?
        != source.canonicalize().map_err(|e| e.to_string())? {
        return Err("E_APP_UPDATE_RECOVERY_HELPER_IDENTITY".into());
    }
    let mut input = super::macos_fs::regular_file(&source)?;
    let metadata = input.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.nlink() != 1 {
        return Err("E_APP_UPDATE_RECOVERY_HELPER_IDENTITY".into());
    }
    let mut copy = tempfile::NamedTempFile::new_in(&install.root).map_err(|e| e.to_string())?;
    std::io::copy(&mut input, copy.as_file_mut()).map_err(|e| e.to_string())?;
    copy.as_file().set_permissions(fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    copy.as_file().sync_all().map_err(|e| e.to_string())?;
    copy.persist(install.root.join(RECOVERY_HELPER)).map_err(|e| e.to_string())?;
    File::open(&install.root).and_then(|directory| directory.sync_all()).map_err(|e| e.to_string())
}

fn prepare(install: &Install, bundle: &Path) -> Result<(Journal, Release), String> {
    if Journal::load(&install.root, bundle)?.is_some() { return Err("E_APP_UPDATE_RECOVERY_REQUIRED".into()); }
    let release = selected(install)?;
    let mut archive = install.verify_release(&release)?;
    let manifest = install.release_manifest(&release)?;
    let parent = bundle.parent().ok_or("E_APP_UPDATE_BUNDLE_IDENTITY")?;
    check_bundle_permissions(bundle, parent)?;
    let stage = create_stage(parent)?;
    check_exchange(&stage)?;
    let destination = stage.path().join("Ameow.app");
    let source = install.release_dir(&release.version)?.join("Ameow.app");
    let status = Command::new("/usr/bin/ditto").arg(&source).arg(&destination).status().map_err(|e| e.to_string())?;
    if !status.success() { return Err("E_APP_UPDATE_STAGE_COPY".into()); }
    macos::verify(&mut archive, stage.path(), &manifest)?;
    macos::verify_codesign(&destination, &manifest)?;
    sync_staged_bundle(&destination)?;
    File::open(stage.path()).and_then(|directory| directory.sync_all()).map_err(|e| e.to_string())?;
    File::open(parent).and_then(|directory| directory.sync_all()).map_err(|e| e.to_string())?;
    cache_recovery_helper(install, bundle)?;
    let staging = stage.keep();
    let mut journal = match Journal::create(&install.root, bundle, &destination, release.manifest_hash.clone()) {
        Ok(journal) => journal,
        Err(error) => {
            if !Journal::exists(&install.root)? { fs::remove_dir_all(staging).map_err(|e| e.to_string())?; }
            return Err(error);
        }
    };
    #[cfg(all(feature = "app-update-fixture", debug_assertions))]
    if let Some(path) = std::env::var_os("AMEOW_UPDATE_TEST_HOLD_BEFORE_ARM").map(PathBuf::from) {
        fs::write(path.join("prepared"), b"prepared").map_err(|e| e.to_string())?;
        while !path.join("release").exists() { std::thread::sleep(Duration::from_millis(20)); }
    }
    if let Err(error) = journal.arm(&install.root) {
        if let Ok(Some(mut saved)) = Journal::load(&install.root, bundle)
            && saved.rollback(&install.root).is_ok() {
            let _ = saved.finish(&install.root);
        }
        return Err(error);
    }
    Ok((journal, release))
}

fn rollback_and_relaunch(
    install: &Install, journal: &mut Journal, release: &Release,
    attempted: bool, args: &[OsString], lease: &File,
) -> Result<(), String> {
    journal.rollback(&install.root)?;
    rolled_back(install, release, attempted)?;
    let bundle = journal.installed.clone();
    finish_local_relaunch(install, journal, &bundle, args, lease)
}

fn rollback_unaccepted(
    install: &Install, journal: &mut Journal, release: &Release,
    args: &[OsString], lease: &File,
) -> Result<(), String> {
    if journal.stage == Stage::Confirmed { journal.revoke_unaccepted_confirmation(&install.root)?; }
    rollback_and_relaunch(install, journal, release, true, args, lease)
}

fn apply(install: &Install, bundle: &Path, parent: i32, args: &[OsString]) -> Result<(), String> {
    let (mut journal, release) = prepare(install, bundle)?;
    if let Err(error) = writeln!(std::io::stdout(), "READY").and_then(|_| std::io::stdout().flush()) {
        journal.rollback(&install.root)?;
        journal.finish(&install.root)?;
        return Err(error.to_string());
    }
    let mut instruction = String::new();
    if let Err(error) = std::io::stdin().lock().take(16).read_line(&mut instruction) {
        journal.rollback(&install.root)?;
        journal.finish(&install.root)?;
        return Err(error.to_string());
    }
    if instruction != "GO\n" {
        journal.rollback(&install.root)?;
        return journal.finish(&install.root);
    }
    wait_for_parent(parent)?;
    let lease = wait_for_lease(&install.root)?;
    let verified = (|| {
        let mut archive = install.verify_release(&release)?;
        let manifest = install.release_manifest(&release)?;
        macos::verify(&mut archive, journal.staged.parent().ok_or("E_APP_UPDATE_STAGE")?, &manifest)?;
        macos::verify_codesign(&journal.staged, &manifest)?;
        begin_trial(install, &release)
    })();
    if let Err(error) = verified {
        if journal.placement().is_ok() || journal.original_is_installed().unwrap_or(false) {
            rollback_and_relaunch(install, &mut journal, &release, false, args, &lease)?;
        }
        return Err(error);
    }
    if let Err(error) = journal.swap(&install.root) {
        if journal.placement().is_ok() || journal.original_is_installed().unwrap_or(false) {
            rollback_and_relaunch(install, &mut journal, &release, false, args, &lease)?;
        }
        return Err(error);
    }
    let mut trial = match wait_trial(install, bundle, &release, args, &lease) {
        Ok(Some(trial)) => trial,
        Ok(None) => return rollback_and_relaunch(install, &mut journal, &release, true, args, &lease),
        Err(failure) if !failure.child_started => {
            rollback_and_relaunch(install, &mut journal, &release, true, args, &lease)?;
            return Err(failure.error);
        }
        Err(failure) => return Err(failure.error),
    };
    if let Err(error) = trial.accept().and_then(|_| trial.wait_for_acknowledgement("accept-ack.json")) {
        trial.abort_and_wait()?;
        rollback_and_relaunch(install, &mut journal, &release, true, args, &lease)?;
        return Err(error);
    }
    #[cfg(all(feature = "app-update-fixture", debug_assertions))]
    if std::env::var_os("AMEOW_UPDATE_TEST_CRASH_AT").is_some_and(|value| value == "after-accept-ack") {
        std::process::exit(86);
    }
    if let Err(error) = journal.confirm_with(&install.root, || trial.wait_for_current_owner())
        .and_then(|_| committed(install, &release)) {
        trial.abort_and_wait()?;
        if let Some(mut persisted) = Journal::load(&install.root, bundle)? {
            rollback_unaccepted(install, &mut persisted, &release, args, &lease)?;
        }
        return Err(error);
    }
    #[cfg(all(feature = "app-update-fixture", debug_assertions))]
    if std::env::var_os("AMEOW_UPDATE_TEST_CRASH_AT").is_some_and(|value| value == "after-confirm-before-commit") {
        std::process::exit(86);
    }
    if let Err(error) = trial.commit().and_then(|_| trial.wait_for_acknowledgement("commit-ack.json")) {
        trial.abort_and_wait()?;
        let mut persisted = Journal::load(&install.root, bundle)?.ok_or("E_APP_UPDATE_NO_RECOVERY")?;
        if persisted.stage == Stage::Accepted {
            committed(install, &release)?;
            finish_local_relaunch(install, &persisted, bundle, args, &lease)?;
        } else {
            rollback_unaccepted(install, &mut persisted, &release, args, &lease)?;
        }
        return Err(error);
    }
    let accepted = Journal::load(&install.root, bundle)?.ok_or("E_APP_UPDATE_NO_RECOVERY")?;
    if accepted.stage != Stage::Accepted { return Err("E_APP_UPDATE_JOURNAL_STAGE".into()); }
    accepted.finish(&install.root)
}

fn recover(install: &Install, bundle: &Path, parent: Option<i32>, args: &[OsString]) -> Result<(), String> {
    let mut journal = Journal::load(&install.root, bundle)?.ok_or("E_APP_UPDATE_NO_RECOVERY")?;
    let release = release_for_journal(install, &journal)?;
    if let Some(parent) = parent {
        writeln!(std::io::stdout(), "READY").and_then(|_| std::io::stdout().flush())
            .map_err(|e| e.to_string())?;
        wait_for_parent(parent)?;
    }
    let lease = wait_for_lease(&install.root)?;
    if journal.stage == Stage::Accepted {
        committed(install, &release)?;
        return finish_local_relaunch(install, &journal, bundle, args, &lease);
    }
    if journal.stage == Stage::Confirmed {
        return rollback_unaccepted(install, &mut journal, &release, args, &lease);
    }
    if journal.stage == Stage::RolledBack {
        if !journal.original_is_installed()? { return Err("E_APP_UPDATE_JOURNAL_CONTENTS".into()); }
        return finish_local_relaunch(install, &journal, bundle, args, &lease);
    }
    let attempted = match journal.placement() {
        Ok(placement) => placement == Placement::CandidateInstalled,
        Err(_) if journal.original_is_installed()? => false,
        Err(_) if journal.original_is_staged()? => true,
        Err(error) => return Err(error),
    };
    rollback_and_relaunch(install, &mut journal, &release, attempted, args, &lease)
}

fn clear_privileged_marker(install: &Install, marker: &super::macos_privileged::Marker) -> Result<(), String> {
    let path = install.root.join(super::macos_privileged::MARKER);
    let current: super::macos_privileged::Marker = read_json(&path)?;
    if current.token != marker.token || current.target != marker.target || current.release.manifest_hash != marker.release.manifest_hash {
        return Err("E_APP_UPDATE_PRIVILEGED_MARKER_CHANGED".into());
    }
    fs::remove_file(path).map_err(|error| error.to_string())?;
    super::macos_fs::directory(&install.root)?.sync_all().map_err(|error| error.to_string())
}

fn finish_privileged_relaunch(
    install: &Install, marker: &super::macos_privileged::Marker, args: &[OsString], lease: &File,
    remote: &mut super::macos_privileged::Remote,
) -> Result<(), String> {
    use super::macos_privileged::Operation;
    let _ready = ready_relaunch(install, &marker.target, args, lease,
        |pid| remote.call(Operation::Relaunch(pid)).map(|_| ()))?;
    remote.call(Operation::Finish)?;
    clear_privileged_marker(install, marker)
}

fn record_failure(install: &Install, error: &str) -> Result<(), String> {
    let _lock = install.lock()?;
    let mut state = install.load()?;
    state.last_error = Some(error.chars().take(2048).collect());
    install.save(&state)
}

pub(super) fn privileged(
    install: &Install, marker: &super::macos_privileged::Marker, args: &[OsString], lease: &File,
    remote: &mut super::macos_privileged::Remote, recovery: bool,
) -> Result<(), String> {
    record_result(install, privileged_inner(install, marker, args, lease, remote, recovery))
}

pub(super) fn record_result(install: &Install, result: Result<(), String>) -> Result<(), String> {
    if let Err(error) = &result {
        record_failure(install, error).map_err(|write_error| format!("{error}; E_APP_UPDATE_FAILURE_RECORD: {write_error}"))?;
    }
    result
}

fn privileged_inner(
    install: &Install, marker: &super::macos_privileged::Marker, args: &[OsString], lease: &File,
    remote: &mut super::macos_privileged::Remote, recovery: bool,
) -> Result<(), String> {
    use super::macos_privileged::{Operation, Outcome};
    let status = remote.call(Operation::Status)?;
    if status == Outcome::Accepted {
        committed(install, &marker.release)?;
        return finish_privileged_relaunch(install, marker, args, lease, remote);
    }
    if recovery || status == Outcome::Restored {
        remote.call(Operation::Restore)?;
        rolled_back(install, &marker.release, status != Outcome::Prepared)?;
        return finish_privileged_relaunch(install, marker, args, lease, remote);
    }
    begin_trial(install, &marker.release)?;
    if let Err(error) = remote.call(Operation::Swap) {
        remote.call(Operation::Restore)?;
        rolled_back(install, &marker.release, false)?;
        finish_privileged_relaunch(install, marker, args, lease, remote)?;
        return Err(error);
    }
    let trial = wait_trial_registered(install, &marker.target, &marker.release, args, lease,
        Some(marker.token.clone()), |pid| remote.call(Operation::Trial(pid)).map(|_| ()));
    let mut trial = match trial {
        Ok(Some(trial)) => trial,
        Ok(None) => {
            remote.call(Operation::Restore)?;
            rolled_back(install, &marker.release, true)?;
            return finish_privileged_relaunch(install, marker, args, lease, remote);
        }
        Err(failure) if !failure.child_started => {
            remote.call(Operation::Restore)?;
            rolled_back(install, &marker.release, true)?;
            finish_privileged_relaunch(install, marker, args, lease, remote)?;
            return Err(failure.error);
        }
        Err(failure) => return Err(failure.error),
    };
    let result = (|| {
        trial.accept()?;
        trial.wait_for_acknowledgement("accept-ack.json")?;
        trial.wait_for_current_owner()?;
        remote.call(Operation::Confirm)?;
        committed(install, &marker.release)?;
        trial.commit()?;
        trial.wait_for_acknowledgement("commit-ack.json")?;
        remote.call(Operation::Accept)?;
        atomic_json(&trial.boot.path().join("finalized.json"), &trial.ticket.nonce)?;
        trial.wait_for_acknowledgement("final-ack.json")
    })();
    if let Err(error) = result {
        trial.abort_and_wait()?;
        if remote.call(Operation::Status)? == Outcome::Accepted {
            committed(install, &marker.release)?;
        } else {
            remote.call(Operation::Restore)?;
            rolled_back(install, &marker.release, true)?;
        }
        finish_privileged_relaunch(install, marker, args, lease, remote)?;
        return Err(error);
    }
    remote.call(Operation::Finish)?;
    clear_privileged_marker(install, marker)
}

fn authorized_recovery_arguments(arguments: &[OsString]) -> Result<(&Path, Option<&Path>, Vec<String>), String> {
    if arguments.len() < 2
        || arguments.get(2).is_some_and(|value| value.is_empty() || value == "--")
        || arguments.len() > 3 && arguments.get(3).is_none_or(|value| value != "--") {
        return Err("E_APP_UPDATE_HELPER_ARGUMENTS".into());
    }
    let args = arguments.get(4..).unwrap_or_default().iter()
        .map(|value| value.clone().into_string().map_err(|_| "E_APP_UPDATE_HELPER_ARGUMENTS".to_string()))
        .collect::<Result<_, _>>()?;
    Ok((Path::new(&arguments[1]), arguments.get(2).map(Path::new), args))
}

pub fn run(arguments: &[OsString]) -> Result<(), String> {
    let mode = arguments.first().and_then(|value| value.to_str()).ok_or("E_APP_UPDATE_HELPER_ARGUMENTS")?;
    if mode == "--privileged-worker" && arguments.len() == 2 {
        return super::macos_privileged::worker(Path::new(&arguments[1]));
    }
    if mode == "--privileged-supervisor" && arguments.len() == 3 {
        return super::macos_privileged::supervisor(arguments[1].to_str().ok_or("E_APP_UPDATE_HELPER_ARGUMENTS")?
            .parse().map_err(|_| "E_APP_UPDATE_HELPER_ARGUMENTS")?, Path::new(&arguments[2]));
    }
    if unsafe { geteuid() } == 0 { return Err("E_APP_UPDATE_HELPER_MUST_NOT_RUN_AS_ROOT".into()); }
    if mode == "--authorize-recover" {
        let (updates, target, args) = authorized_recovery_arguments(arguments)?;
        #[cfg(all(feature = "app-update-fixture", debug_assertions))]
        let install = Install::fixture(updates.to_path_buf())?;
        #[cfg(not(all(feature = "app-update-fixture", debug_assertions)))]
        let install = Install::production(updates.to_path_buf())?;
        return record_result(&install, (|| {
            let marker = if let Some(target) = target {
                super::macos_privileged::recovery_marker(updates, target)?
            } else { super::macos_privileged::marker(updates)? }.ok_or("E_APP_UPDATE_NO_RECOVERY")?;
            let mut client = super::macos_privileged::Client::prepare(&macos::current_bundle()?, updates, None, Some(marker), args)?;
            client.go()?;
            Ok(())
        })());
    }
    let mode = arguments.first().and_then(|value| value.to_str()).ok_or("E_APP_UPDATE_HELPER_ARGUMENTS")?;
    if !matches!(mode, "--apply" | "--recover" | "--recover-unaccepted" | "--recover-standalone") { return Err("E_APP_UPDATE_HELPER_ARGUMENTS".into()); }
    let args = &arguments[1..];
    #[cfg(all(feature = "app-update-fixture", debug_assertions))]
    let install = Install::fixture(super::default_install_root()?)?;
    #[cfg(not(all(feature = "app-update-fixture", debug_assertions)))]
    let install = Install::production(super::default_install_root()?)?;
    let _running = exclusive(&install.root.join("running.lock"))?;
    if mode == "--recover-standalone" {
        let executable = install.root.join(RECOVERY_HELPER);
        plain(&executable)?;
        let metadata = fs::symlink_metadata(&executable).map_err(|e| e.to_string())?;
        if !metadata.is_file() || metadata.uid() != unsafe { geteuid() } || metadata.nlink() != 1
            || metadata.mode() & 0o077 != 0
            || std::env::current_exe().map_err(|e| e.to_string())?.canonicalize().map_err(|e| e.to_string())?
                != executable.canonicalize().map_err(|e| e.to_string())? {
            return Err("E_APP_UPDATE_RECOVERY_HELPER_IDENTITY".into());
        }
        let journal = Journal::load_for_recovery(&install.root)?.ok_or("E_APP_UPDATE_NO_RECOVERY")?;
        return record_result(&install, recover(&install, &journal.installed, None, args));
    }
    let bundle = macos::current_bundle()?;
    let parent = parent_for_bundle(&bundle)?;
    let result = match mode {
        "--apply" => apply(&install, &bundle, parent, args),
        "--recover" | "--recover-unaccepted" => recover(&install, &bundle, Some(parent), args),
        _ => Err("E_APP_UPDATE_HELPER_ARGUMENTS".into()),
    };
    record_result(&install, result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authorized_recovery_preserves_explicit_application_arguments_in_the_real_child() {
        use std::os::unix::fs::PermissionsExt;
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().canonicalize().unwrap();
        let updates = root.join("Updates");
        let bundle = root.join("Ameow.app");
        let executable = bundle.join("Contents/MacOS/ameow");
        fs::create_dir_all(executable.parent().unwrap()).unwrap();
        fs::write(&executable, b"#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$4\"\n").unwrap();
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o755)).unwrap();
        let ordinary = ["--runtime-root".into(), root.join("runtime").into_os_string(),
            "--settings-path".into(), root.join("actual-arguments").into_os_string(),
            "--output".into(), root.join("output").into_os_string()];
        let mut arguments = vec!["--authorize-recover".into(), updates.clone().into_os_string(),
            bundle.clone().into_os_string(), "--".into()];
        arguments.extend(ordinary.iter().cloned());
        let (actual_updates, target, forwarded) = authorized_recovery_arguments(&arguments).unwrap();
        assert_eq!(actual_updates, updates);
        assert_eq!(target, Some(bundle.as_path()));
        let forwarded = forwarded.into_iter().map(OsString::from).collect::<Vec<_>>();
        assert_eq!(forwarded, ordinary);
        let lease = super::super::store::exclusive(&root.join("gate")).unwrap();
        let mut child = start_app(&bundle, &forwarded, &lease, None).unwrap();
        assert!(child.wait().unwrap().success());
        assert_eq!(fs::read_to_string(root.join("actual-arguments")).unwrap(),
            ordinary.iter().map(|value| value.to_str().unwrap()).collect::<Vec<_>>().join("\n") + "\n");
        assert!(authorized_recovery_arguments(&arguments[..2]).unwrap().1.is_none());
        assert!(authorized_recovery_arguments(&arguments[..3]).unwrap().2.is_empty());
        arguments[3] = "--settings-path".into();
        assert_eq!(authorized_recovery_arguments(&arguments).unwrap_err(), "E_APP_UPDATE_HELPER_ARGUMENTS");
        assert!(authorized_recovery_arguments(&arguments[..1]).is_err());
        for target in ["--", ""] {
            let malformed = ["--authorize-recover".into(), updates.clone().into_os_string(), target.into()];
            assert_eq!(authorized_recovery_arguments(&malformed).unwrap_err(), "E_APP_UPDATE_HELPER_ARGUMENTS");
        }
    }

    #[test]
    fn authorize_recovery_preflight_failure_is_recorded_before_any_authorization() {
        let root = tempfile::tempdir().unwrap();
        let updates = root.path().canonicalize().unwrap().join("updates");
        let error = run(&["--authorize-recover".into(), updates.clone().into_os_string()]).unwrap_err();
        assert_eq!(error, "E_APP_UPDATE_NO_RECOVERY");
        let install = Install::fixture(updates).unwrap();
        assert_eq!(install.state().unwrap().last_error.as_deref(), Some(error.as_str()));
        assert!(matches!(super::super::Coordinator::new(install.clone()).snapshot().phase, super::super::Phase::Failed));
        assert!(!install.root.join(super::super::macos_privileged::MARKER).exists());
    }

    #[test]
    fn confirmed_rollback_is_projected_separately_from_operation_failure() {
        let root = tempfile::tempdir().unwrap();
        let install = Install::fixture(root.path().canonicalize().unwrap().join("updates")).unwrap();
        let release = Release { version: "0.5.1".into(), sequence: 501, manifest_hash: "a".repeat(64) };
        let previous = Release { version: "0.5.0".into(), sequence: 500, manifest_hash: "b".repeat(64) };
        let mut state = install.state().unwrap();
        state.current = Some(previous);
        state.trial = Some(release.clone());
        install.save(&state).unwrap();
        rolled_back(&install, &release, true).unwrap();
        let snapshot = super::super::Coordinator::new(install.clone()).snapshot();
        assert!(matches!(snapshot.phase, super::super::Phase::RolledBack));
        assert_eq!(snapshot.version.as_deref(), Some("0.5.0"));
        assert_eq!(snapshot.error.as_deref(), Some("E_APP_UPDATE_ROLLED_BACK: 0.5.1 did not become Ready"));
        assert!(install.state().unwrap().trial.is_none());
        assert_eq!(install.state().unwrap().failed, vec![release.manifest_hash]);
    }

    #[test]
    fn relaunch_child_fixture() {
        let Some(boot) = std::env::var_os("AMEOW_LAUNCH_SESSION").map(PathBuf::from) else { return; };
        let ticket: Ticket = read_json(&boot.join("ticket.json")).unwrap();
        let version = macos::plist_value(&macos::current_bundle().unwrap(), "CFBundleShortVersionString").unwrap();
        assert_eq!(version, ticket.version);
        atomic_json(&ticket.install.join("fixture-started-version.json"), &version).unwrap();
        let mode: String = read_json(&ticket.install.join("fixture-mode.json")).unwrap();
        atomic_json(&ticket.install.join("fixture-pid.json"), &std::process::id()).unwrap();
        let mut sequence = 0;
        let mut accepted = false;
        loop {
            if ticket.install.join("fixture-stop").exists()
                || read_json::<String>(&boot.join("abort.json")).is_ok_and(|nonce| nonce == ticket.nonce) { return; }
            if !accepted {
                sequence += 1;
                let version = if mode == "wrong-version" { "wrong" } else { &ticket.version };
                atomic_json(&boot.join("ready.json"), &Ready { nonce: ticket.nonce.clone(), version: version.into(), pid: std::process::id() }).unwrap();
                atomic_json(&boot.join("owner-ready.json"), &OwnerReady { nonce: ticket.nonce.clone(), version: ticket.version.clone(), pid: std::process::id(), sequence }).unwrap();
                if mode == "ready" && read_json::<String>(&boot.join("relaunch.json")).is_ok_and(|nonce| nonce == ticket.nonce) {
                    atomic_json(&boot.join("relaunch-ack.json"), &ticket.nonce).unwrap();
                    if read_json::<String>(&boot.join("finalized.json")).is_ok_and(|nonce| nonce == ticket.nonce) {
                        atomic_json(&boot.join("final-ack.json"), &ticket.nonce).unwrap();
                        accepted = true;
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(40));
        }
    }

    #[test]
    fn privileged_relaunch_preserves_recovery_until_ready_and_reports_failures() {
        use super::super::macos_privileged::{self, Marker, Operation, Outcome, Remote};
        use std::{os::unix::net::UnixStream, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}};
        for mode in ["ready", "legacy", "wrong-version", "spawn-failure", "root-error"] {
            let temporary = tempfile::tempdir().unwrap();
            let root = temporary.path().canonicalize().unwrap();
            let install = Install::fixture(root.join("updates")).unwrap();
            atomic_json(&install.root.join("fixture-mode.json"), &mode).unwrap();
            let bundle = root.join("Ameow.app");
            fs::create_dir_all(bundle.join("Contents/MacOS")).unwrap();
            fs::write(bundle.join("Contents/Info.plist"), br#"<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>1.0.0</string></dict></plist>"#).unwrap();
            if mode != "spawn-failure" { fs::copy(std::env::current_exe().unwrap(), bundle.join("Contents/MacOS/ameow")).unwrap(); }
            let previous = Release { version: "1.0.0".into(), sequence: 1, manifest_hash: "a".repeat(64) };
            let candidate = Release { version: "2.0.0".into(), sequence: 2, manifest_hash: "b".repeat(64) };
            let mut state = install.state().unwrap();
            state.current = Some(previous.clone());
            state.trial = Some(candidate.clone());
            install.save(&state).unwrap();
            let marker = Marker { token: "c".repeat(64), target: bundle, release: candidate.clone(), recovery_helper: root.join("preserved/ameow-updater") };
            let marker_path = install.root.join(macos_privileged::MARKER);
            atomic_json(&marker_path, &marker).unwrap();
            let index = root.join("fixture-index");
            fs::write(&index, b"retained index").unwrap();
            let sentinel = root.join("user-data");
            fs::write(&sentinel, b"unchanged").unwrap();
            let (pipe, mut server) = UnixStream::pair().unwrap();
            let mut remote = Remote::new(pipe);
            let finished = Arc::new(AtomicBool::new(false));
            let operations = Arc::new(Mutex::new(Vec::new()));
            let observed = operations.clone();
            let did_finish = finished.clone();
            let updates = install.root.clone();
            let server_marker = marker_path.clone();
            let server_index = index.clone();
            let serving = std::thread::spawn(move || {
                while let Ok(operation) = macos_privileged::read_message::<Operation>(&mut server) {
                    let result: Result<Outcome, String> = match operation {
                        Operation::Status => { observed.lock().unwrap().push("Status"); Ok(Outcome::Prepared) }
                        Operation::Restore => {
                            observed.lock().unwrap().push("Restore");
                            if mode == "root-error" { Err("E_APP_UPDATE_PRIVILEGED_PROCESS_UNKNOWN: pid=42 proc_pidpath=Some(1)".into()) }
                            else { Ok(Outcome::Restored) }
                        }
                        Operation::Relaunch(pid) => {
                            observed.lock().unwrap().push("Relaunch");
                            let boot = fs::read_dir(&updates).unwrap().filter_map(Result::ok)
                                .find(|entry| entry.file_name().to_string_lossy().starts_with("boot-")).unwrap().path();
                            let ticket: Ticket = read_json(&boot.join("ticket.json")).unwrap();
                            let ready: Ready = read_json(&boot.join("ready.json")).unwrap();
                            let ack: String = read_json(&boot.join("relaunch-ack.json")).unwrap();
                            if ticket.version == "1.0.0" && valid_ready(&ready, &ticket, pid) && ack == ticket.nonce
                                && server_marker.exists() && server_index.exists() { Ok(Outcome::Restored) }
                            else { Err("E_FIXTURE_RELAUNCH_IDENTITY".into()) }
                        }
                        Operation::Finish => {
                            observed.lock().unwrap().push("Finish");
                            let boot = fs::read_dir(&updates).unwrap().filter_map(Result::ok)
                                .find(|entry| entry.file_name().to_string_lossy().starts_with("boot-")).map(|entry| entry.path());
                            let acknowledged = boot.is_some_and(|boot| read_json::<Ticket>(&boot.join("ticket.json")).is_ok_and(|ticket|
                                read_json::<String>(&boot.join("final-ack.json")).is_ok_and(|nonce| nonce == ticket.nonce)));
                            if acknowledged && server_marker.exists() {
                                fs::remove_file(&server_index).unwrap();
                                did_finish.store(true, Ordering::Release);
                                Ok(Outcome::Restored)
                            } else { Err("E_FIXTURE_FINISH_BEFORE_READY".into()) }
                        }
                        _ => Err("E_FIXTURE_UNEXPECTED_OPERATION".into()),
                    };
                    if macos_privileged::write_message(&mut server, &result).is_err() { break; }
                }
            });
            let lease = File::create(root.join("lease")).unwrap();
            let arguments = [OsString::from("--exact"), OsString::from("app_update::macos_helper::tests::relaunch_child_fixture"), OsString::from("--nocapture")];
            let result = privileged(&install, &marker, &arguments, &lease, &mut remote, true);
            drop(remote);
            fs::write(install.root.join("fixture-stop"), b"stop").unwrap();
            if let Ok(pid) = read_json::<u32>(&install.root.join("fixture-pid.json")) {
                let mut status = 0;
                let waited = unsafe { libc::waitpid(pid as i32, &mut status, 0) };
                assert!(waited == pid as i32 || std::io::Error::last_os_error().raw_os_error() == Some(libc::ECHILD));
            }
            serving.join().unwrap();
            if mode == "ready" {
                result.unwrap();
                assert!(finished.load(Ordering::Acquire));
                assert!(!marker_path.exists() && !index.exists());
                assert_eq!(*operations.lock().unwrap(), ["Status", "Restore", "Relaunch", "Finish"]);
            } else {
                let error = result.unwrap_err();
                assert!(!finished.load(Ordering::Acquire));
                assert!(marker_path.exists() && index.exists());
                assert!(!operations.lock().unwrap().contains(&"Finish"));
                assert_eq!(install.state().unwrap().last_error.as_deref(), Some(error.as_str()));
                if mode == "root-error" { assert!(error.contains("pid=42 proc_pidpath=Some(1)")); }
                else if mode == "spawn-failure" { assert!(error.starts_with("E_APP_UPDATE_START:")); }
                else { assert!(error.starts_with("E_APP_UPDATE_RECOVERY_NOT_READY")); }
            }
            let state = install.state().unwrap();
            assert_eq!(state.current.unwrap().manifest_hash, previous.manifest_hash);
            if mode != "root-error" { assert_eq!(state.pending.unwrap().manifest_hash, candidate.manifest_hash); }
            assert_eq!(fs::read(&sentinel).unwrap(), b"unchanged");
        }
    }

    #[test]
    fn staging_directory_is_private_when_created() {
        let parent = tempfile::tempdir().unwrap();
        let parent = parent.path().canonicalize().unwrap();
        let stage = create_stage(&parent).unwrap();
        assert_eq!(stage.path().metadata().unwrap().permissions().mode() & 0o777, 0o700);
        check_exchange(&stage).unwrap();
        assert_eq!(std::fs::read_dir(stage.path()).unwrap().count(), 0);
    }

    #[test]
    fn immutable_bundle_is_rejected_before_staging() {
        unsafe extern "C" { fn chflags(path: *const std::ffi::c_char, flags: u32) -> i32; }
        let parent = tempfile::tempdir().unwrap();
        let bundle = parent.path().join("Ameow.app");
        fs::create_dir(&bundle).unwrap();
        let name = std::ffi::CString::new(bundle.as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { chflags(name.as_ptr(), 2) }, 0);
        let result = check_bundle_permissions(&bundle, parent.path());
        assert_eq!(unsafe { chflags(name.as_ptr(), 0) }, 0);
        assert_eq!(result.unwrap_err(), "E_APP_UPDATE_BUNDLE_IMMUTABLE");
    }

    #[test]
    fn nonremovable_old_bundle_requires_authorization_before_staging() {
        let temporary = tempfile::tempdir().unwrap();
        let parent = temporary.path().canonicalize().unwrap();
        let bundle = parent.join("Ameow.app");
        let contents = bundle.join("Contents");
        fs::create_dir_all(&contents).unwrap();
        fs::write(contents.join("old"), b"old bundle").unwrap();
        fs::set_permissions(&contents, fs::Permissions::from_mode(0o555)).unwrap();
        let result = check_bundle_permissions(&bundle, &parent);
        fs::set_permissions(&contents, fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(result.unwrap_err(), "E_APP_UPDATE_AUTHORIZATION_REQUIRED");
        assert_eq!(fs::read(contents.join("old")).unwrap(), b"old bundle");
        assert_eq!(fs::read_dir(&parent).unwrap().count(), 1);
    }

    #[test]
    fn ready_requires_the_launched_process_version_and_nonce() {
        let ticket = Ticket { nonce: "expected".into(), version: "2.0.0".into(),
            install: PathBuf::from("/tmp/updates"), bundle: None, supervisor: None, privileged: None };
        let mut ready = Ready { nonce: ticket.nonce.clone(), version: ticket.version.clone(), pid: 42 };
        assert!(valid_ready(&ready, &ticket, 42));
        assert!(!valid_ready(&ready, &ticket, 43));
        ready.version = "1.0.0".into();
        assert!(!valid_ready(&ready, &ticket, 42));
        ready.version = ticket.version.clone();
        ready.nonce = "other".into();
        assert!(!valid_ready(&ready, &ticket, 42));
        let mut owner = OwnerReady { nonce: ticket.nonce.clone(), version: ticket.version.clone(),
            pid: 42, sequence: 1 };
        assert!(valid_owner_ready(&owner, &ticket, 42));
        assert!(!valid_owner_ready(&owner, &ticket, 43));
        owner.sequence = 0;
        assert!(!valid_owner_ready(&owner, &ticket, 42));
    }

    #[test]
    fn ready_requires_continuous_owner_progress() {
        let start = Instant::now();
        let mut tracker = ReadyTracker::default();
        assert!(!tracker.observe(Some(1), start));
        assert!(!tracker.observe(Some(2), start + Duration::from_millis(400)));
        assert!(tracker.observe(Some(3), start + Duration::from_millis(800)));
        assert!(!tracker.observe(Some(3), start + Duration::from_millis(1400)));
        assert!(!tracker.observe(Some(4), start + Duration::from_millis(1500)));
        assert!(!tracker.observe(Some(5), start + Duration::from_millis(1900)));
        assert!(tracker.observe(Some(6), start + Duration::from_millis(2300)));
        assert!(!tracker.observe(None, start + Duration::from_millis(2350)));
        assert!(!tracker.observe(Some(7), start + Duration::from_millis(2400)));
    }

    #[test]
    fn rollback_restores_the_previous_state_if_confirmation_was_not_accepted() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap();
        let install = Install::fixture(root.join("updates")).unwrap();
        let previous = Release { version: "1.0.0".into(), sequence: 1, manifest_hash: "a".repeat(64) };
        let candidate = Release { version: "2.0.0".into(), sequence: 2, manifest_hash: "b".repeat(64) };
        let mut state = install.state().unwrap();
        state.current = Some(candidate.clone());
        state.previous = Some(previous.clone());
        install.save(&state).unwrap();
        rolled_back(&install, &candidate, true).unwrap();
        let restored = install.state().unwrap();
        assert_eq!(restored.current.unwrap().manifest_hash, previous.manifest_hash);
        assert!(restored.failed.contains(&candidate.manifest_hash));
    }

    #[test]
    fn recovery_relaunches_the_bundle_that_reached_the_durable_acceptance_stage() {
        for accepted in [false, true] {
            let temporary = tempfile::tempdir().unwrap();
            let root = temporary.path().canonicalize().unwrap();
            let install = Install::fixture(root.join("updates")).unwrap();
            let bundle = root.join("Ameow.app");
            let staged = root.join(".ameow-update-recovery-test").join("Ameow.app");
            for (path, version) in [(&bundle, "1.0.0"), (&staged, "2.0.0")] {
                let macos = path.join("Contents/MacOS");
                fs::create_dir_all(&macos).unwrap();
                let executable = macos.join("ameow");
                fs::copy(std::env::current_exe().unwrap(), &executable).unwrap();
                fs::write(path.join("Contents/Info.plist"), format!("<?xml version=\"1.0\"?><plist version=\"1.0\"><dict><key>CFBundleShortVersionString</key><string>{version}</string></dict></plist>")).unwrap();
            }
            fs::set_permissions(staged.parent().unwrap(), fs::Permissions::from_mode(0o700)).unwrap();
            let previous = Release { version: "1.0.0".into(), sequence: 1, manifest_hash: "a".repeat(64) };
            let candidate = Release { version: "2.0.0".into(), sequence: 2, manifest_hash: "b".repeat(64) };
            let mut state = install.state().unwrap();
            state.current = Some(previous.clone());
            state.trial = Some(candidate.clone());
            install.save(&state).unwrap();
            let mut journal = Journal::create(&install.root, &bundle, &staged, candidate.manifest_hash.clone()).unwrap();
            journal.arm(&install.root).unwrap();
            journal.swap(&install.root).unwrap();
            journal.confirm_with(&install.root, || Ok(())).unwrap();
            committed(&install, &candidate).unwrap();
            if accepted { journal.accept(&install.root).unwrap(); }
            atomic_json(&install.root.join("fixture-mode.json"), &"ready").unwrap();
            fs::write(root.join("user-data"), b"preserved").unwrap();
            let result = recover(&install, &bundle, None, &[OsString::from("--exact"), OsString::from("app_update::macos_helper::tests::relaunch_child_fixture"), OsString::from("--nocapture")]);
            fs::write(install.root.join("fixture-stop"), b"stop").unwrap();
            if let Ok(pid) = read_json::<u32>(&install.root.join("fixture-pid.json")) {
                let mut status = 0;
                assert_eq!(unsafe { libc::waitpid(pid as i32, &mut status, 0) }, pid as i32);
            }
            result.unwrap();
            let version: String = read_json(&install.root.join("fixture-started-version.json")).unwrap();
            assert_eq!(version, if accepted { "2.0.0" } else { "1.0.0" });
            let state = install.state().unwrap();
            assert_eq!(state.current.unwrap().manifest_hash, if accepted { candidate.manifest_hash } else { previous.manifest_hash });
            assert_eq!(fs::read(root.join("user-data")).unwrap(), b"preserved");
            assert!(!Journal::exists(&install.root).unwrap());
        }
    }
}
