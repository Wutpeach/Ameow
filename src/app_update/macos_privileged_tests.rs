use super::*;
use std::os::unix::fs::{PermissionsExt, symlink};

fn tree(path: &Path, contents: &[u8]) {
    fs::create_dir_all(path.join("Contents/MacOS")).unwrap();
    fs::write(path.join("Contents/MacOS/ameow"), contents).unwrap();
    fs::set_permissions(path.join("Contents/MacOS/ameow"), fs::Permissions::from_mode(0o755)).unwrap();
    fs::write(path.join("Contents/MacOS/ameow-updater"), b"same helper").unwrap();
}

fn fixture() -> (tempfile::TempDir, Storage, Transaction) {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
    let storage = Storage { base: root.clone(), owner: unsafe { libc::geteuid() } };
    let token = "a".repeat(64);
    let path = root.join(&token);
    create_private(&path, storage.owner).unwrap();
    let target = root.join("Ameow.app");
    let candidate = path.join("payload/Ameow.app");
    let backup = path.join("backup/Ameow.app");
    tree(&target, b"old");
    tree(&backup, b"old");
    tree(&candidate, b"new");
    let mut child = Command::new("/bin/sleep").arg("0.1").spawn().unwrap();
    let owner = ProcessIdentity::capture(child.id()).unwrap();
    child.wait().unwrap();
    assert!(!owner.alive().unwrap());
    let original = fs::metadata(&target).unwrap();
    let staged = fs::metadata(&candidate).unwrap();
    let journal = RootJournal { schema: 1, token, target: target.clone(), updates: root.join("Updates"),
        release: Release { version: "2.0.0".into(), sequence: 2, manifest_hash: "b".repeat(64) },
        owner, trial: None, stage: RootStage::Prepared, original_hash: fingerprint(&target).unwrap(),
        backup_hash: fingerprint(&backup).unwrap(), candidate_hash: fingerprint(&candidate).unwrap(),
        target_device: original.dev(), original_inode: original.ino(), candidate_inode: staged.ino(), code: root.join("code/Ameow.app") };
    let transaction = Transaction { path, journal, storage_owner: storage.owner, relaunched: None };
    transaction.persist().unwrap();
    (temporary, storage, transaction)
}

fn old_is_intact(transaction: &Transaction) {
    assert_eq!(fs::read(transaction.journal.target.join("Contents/MacOS/ameow")).unwrap(), b"old");
}

#[test]
fn supervisor_uses_relocated_code_for_new_transactions_and_current_bootstrap_for_recovery() {
    let (_temporary, storage, mut transaction) = fixture();
    let bootstrap = storage.base.join("bootstrap/Ameow.app");
    tree(&bootstrap, b"current app");
    let helper = bootstrap.join("Contents/MacOS/ameow-updater");
    fs::write(&helper, b"#!/bin/sh\nprintf current-new").unwrap();
    fs::set_permissions(&helper, fs::Permissions::from_mode(0o755)).unwrap();
    let durable = storage.base.join("durable");
    fs::rename(bootstrap.parent().unwrap(), &durable).unwrap();
    transaction.journal.code = durable.join("Ameow.app");
    assert!(!bootstrap.exists());
    let output = Command::new(supervisor_bundle(&bootstrap, &transaction, false).join("Contents/MacOS/ameow-updater"))
        .output().unwrap();
    assert!(output.status.success());
    assert_eq!(output.stdout, b"current-new");
    let recovery = storage.base.join("recovery-bootstrap/Ameow.app");
    tree(&recovery, b"current recovery app");
    let helper = recovery.join("Contents/MacOS/ameow-updater");
    fs::write(&helper, b"#!/bin/sh\nprintf current-recovery").unwrap();
    fs::set_permissions(&helper, fs::Permissions::from_mode(0o755)).unwrap();
    let output = Command::new(supervisor_bundle(&recovery, &transaction, true).join("Contents/MacOS/ameow-updater"))
        .output().unwrap();
    assert!(output.status.success());
    assert_eq!(output.stdout, b"current-recovery");
}

#[test]
fn recovery_reconciles_every_unaccepted_durable_exchange_boundary() {
    for boundary in ["prepared", "swapping-before", "swapping-after", "swapped", "confirmed", "restoring-before", "restoring-after"] {
        let (_temporary, storage, mut transaction) = fixture();
        let sentinel = storage.base.join("user-data");
        fs::write(&sentinel, b"preserved").unwrap();
        match boundary {
            "prepared" => {},
            "swapping-before" | "swapping-after" => {
                transaction.journal.stage = RootStage::Swapping;
                transaction.persist().unwrap();
                if boundary == "swapping-after" { macos::exchange(&transaction.journal.target, &transaction.candidate()).unwrap(); }
            }
            _ => {
                transaction.swap().unwrap();
                transaction.journal.stage = if boundary == "confirmed" { RootStage::Confirmed } else { RootStage::Restoring };
                if boundary == "swapped" { transaction.journal.stage = RootStage::Swapped; }
                transaction.persist().unwrap();
                if boundary == "restoring-after" { macos::exchange(&transaction.journal.target, &transaction.backup()).unwrap(); }
            }
        }
        let mut recovered = storage.load(&transaction.journal.token).unwrap();
        recovered.rollback().unwrap_or_else(|error| panic!("{boundary}: {error}"));
        old_is_intact(&recovered);
        assert_eq!(recovered.journal.stage, RootStage::Restored);
        assert_eq!(fs::read(sentinel).unwrap(), b"preserved");
        recovered.rollback().unwrap();
        old_is_intact(&recovered);
    }
}

#[test]
fn accepted_update_is_never_rolled_back_after_a_restart() {
    let (_temporary, storage, mut transaction) = fixture();
    transaction.swap().unwrap();
    transaction.journal.stage = RootStage::Accepted;
    transaction.persist().unwrap();
    let mut recovered = storage.load(&transaction.journal.token).unwrap();
    assert_eq!(recovered.rollback().unwrap_err(), "E_APP_UPDATE_PRIVILEGED_COMMITTED");
    assert_eq!(fs::read(recovered.journal.target.join("Contents/MacOS/ameow")).unwrap(), b"new");
    assert_eq!(fs::read(recovered.backup().join("Contents/MacOS/ameow")).unwrap(), b"old");
}

#[test]
fn prepared_transaction_is_recoverable_without_the_user_marker_or_index() {
    let (_temporary, storage, transaction) = fixture();
    assert!(!transaction.journal.updates.join(MARKER).exists());
    let mut recovered = storage.interrupted(&transaction.journal.target, &transaction.journal.updates).unwrap().unwrap();
    assert_eq!(recovered.journal.token, transaction.journal.token);
    let index = storage.base.join("root-owned-index.json");
    let value = Marker { token: recovered.journal.token.clone(), target: recovered.journal.target.clone(),
        release: recovered.journal.release.clone(), recovery_helper: recovered.journal.code.join("Contents/MacOS/ameow-updater") };
    publish_index(&storage.base, &index, &value).unwrap();
    assert_eq!(read_index(&index, storage.owner).unwrap().unwrap().token, transaction.journal.token);
    if storage.owner != 0 { assert!(read_index(&index, 0).is_err()); }
    recovered.rollback().unwrap();
    old_is_intact(&recovered);
    assert!(storage.interrupted(&recovered.journal.target, &recovered.journal.updates).unwrap().is_none());
}

#[test]
fn restore_handles_known_corruption_and_missing_target_without_overwriting_a_replacement() {
    for condition in ["corrupt", "missing", "unrelated", "symlink"] {
        let (_temporary, storage, mut transaction) = fixture();
        transaction.swap().unwrap();
        match condition {
            "corrupt" => fs::write(transaction.journal.target.join("Contents/MacOS/ameow"), b"broken").unwrap(),
            _ => {
                fs::rename(&transaction.journal.target, storage.base.join("preserved-candidate")).unwrap();
                match condition {
                    "unrelated" => tree(&transaction.journal.target, b"unrelated"),
                    "symlink" => symlink(storage.base.join("preserved-candidate"), &transaction.journal.target).unwrap(),
                    _ => {},
                }
            }
        }
        if matches!(condition, "unrelated" | "symlink") {
            assert!(transaction.rollback().is_err());
            assert_eq!(fs::read(transaction.backup().join("Contents/MacOS/ameow")).unwrap(), b"old");
        } else {
            transaction.rollback().unwrap();
            old_is_intact(&transaction);
        }
    }
}

#[test]
fn live_owner_and_corrupt_backup_prevent_mutation() {
    let (_temporary, _storage, mut transaction) = fixture();
    transaction.journal.owner = ProcessIdentity::capture(std::process::id()).unwrap();
    assert_eq!(transaction.swap().unwrap_err(), "E_APP_UPDATE_PRIVILEGED_PROCESS_ACTIVE");
    old_is_intact(&transaction);
    transaction.journal.owner.executable = PathBuf::from("/renamed-but-still-running");
    assert!(transaction.journal.owner.alive().unwrap());
    let (_temporary, _storage, mut transaction) = fixture();
    transaction.swap().unwrap();
    fs::write(transaction.backup().join("Contents/MacOS/ameow"), b"broken backup").unwrap();
    assert_eq!(transaction.rollback().unwrap_err(), "E_APP_UPDATE_PRIVILEGED_BACKUP");
    assert_eq!(fs::read(transaction.journal.target.join("Contents/MacOS/ameow")).unwrap(), b"new");
}

#[test]
fn frozen_copy_requires_the_entire_old_bundle_even_when_helper_is_identical() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let target = root.join("target.app");
    let frozen = root.join("frozen.app");
    tree(&target, b"old main");
    tree(&frozen, b"old main");
    assert!(Command::new("/bin/chmod").args(["-R", "-P", "a+rX,a-w"]).arg(&frozen).status().unwrap().success());
    let (original, backup) = require_backup_identity(&target, &frozen).unwrap();
    assert_ne!(original, backup);
    fs::write(target.join("Contents/MacOS/ameow"), b"other main, identical updater").unwrap();
    assert_eq!(require_backup_identity(&target, &frozen).unwrap_err(), "E_APP_UPDATE_PRIVILEGED_BACKUP_IDENTITY");
    fs::write(target.join("Contents/MacOS/ameow"), b"old main").unwrap();
    fs::write(target.join("Contents/extra-resource"), b"changed resource").unwrap();
    assert_eq!(require_backup_identity(&target, &frozen).unwrap_err(), "E_APP_UPDATE_PRIVILEGED_BACKUP_IDENTITY");
    assert!(Command::new("/bin/chmod").args(["-R", "-P", "u+w"]).arg(&frozen).status().unwrap().success());
}

#[test]
fn private_paths_and_messages_reject_links_acl_changes_and_oversize_frames() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let uid = unsafe { libc::geteuid() };
    create_private(&root.join("private"), uid).unwrap();
    symlink(root.join("private"), root.join("redirect")).unwrap();
    assert!(protected_directory(&root.join("redirect"), uid, true).is_err());
    fs::set_permissions(root.join("private"), fs::Permissions::from_mode(0o777)).unwrap();
    assert!(protected_directory(&root.join("private"), uid, true).is_err());
    assert!(read_message::<Operation>(&mut &((MAX_MESSAGE as u32 + 1).to_be_bytes())[..]).is_err());
    assert!(read_message::<Operation>(&mut &[0, 0, 0, 0][..]).is_err());
    let home = Path::new("/Users/actual-user");
    assert!(allowed_target(Path::new("/Applications/Ameow.app"), home));
    assert!(allowed_target(Path::new("/Users/actual-user/Applications/Ameow.app"), home));
    assert!(!allowed_target(Path::new("/Users/other-user/Applications/Ameow.app"), home));
    assert!(!allowed_target(Path::new("/Applications/nested/Ameow.app"), home));
}

#[test]
fn preparation_independently_authenticates_and_copies_the_archive() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
    let uid = unsafe { libc::geteuid() };
    let storage = Storage { base: root.join("private"), owner: uid };
    create_private(&storage.base, uid).unwrap();
    fs::create_dir(root.join("current")).unwrap();
    fs::create_dir(root.join("next")).unwrap();
    let (target, _) = super::super::macos_authorization::tests::signed_bundle(&root.join("current"));
    let (candidate, _) = super::super::macos_authorization::tests::signed_bundle(&root.join("next"));
    let plist = candidate.join("Contents/Info.plist");
    fs::write(&plist, fs::read_to_string(&plist).unwrap().replace("1.0.0", "2.0.0")).unwrap();
    assert!(Command::new("/usr/bin/codesign").args(["--force", "--sign", "-", "--timestamp=none"]).arg(&candidate).output().unwrap().status.success());
    let code = root.join("code/Ameow.app");
    assert!(Command::new("/usr/bin/ditto").args(["--noacl", "--noextattr"]).arg(&target).arg(&code).status().unwrap().success());
    assert!(Command::new("/bin/chmod").args(["-R", "-P", "a+rX,a-w"]).arg(&code).status().unwrap().success());
    let input = root.join("Updates/versions/2.0.0");
    fs::create_dir_all(&input).unwrap();
    let archive = input.join("package.zip");
    assert!(Command::new("/usr/bin/ditto").args(["-c", "-k", "--keepParent", "--norsrc"]).arg(&candidate).arg(&archive).status().unwrap().success());
    let bytes = fs::read(&archive).unwrap();
    let executable = fs::read(candidate.join("Contents/MacOS/ameow")).unwrap();
    let manifest = super::super::Manifest { schema: 1, product: "Ameow".into(), channel: "stable".into(),
        target: package::MACOS_ARM_TARGET.into(), version: "2.0.0".into(), sequence: 2, issued: super::super::store::now(),
        url: "https://github.com/Wutpeach/Ameow/releases/download/v2.0.0/Ameow-2.0.0-macos-arm64.zip".into(),
        package_bytes: bytes.len() as u64, package_sha256: package::hash(&bytes),
        exe_bytes: executable.len() as u64, exe_sha256: package::hash(&executable), bundle_sha256: None };
    let envelope = package::fixture_envelope(&manifest);
    fs::write(input.join("manifest.json"), &envelope).unwrap();
    let trust = Trust::fixture_for_target(package::MACOS_ARM_TARGET);
    let (signed, _) = trust.verify(&envelope, None).unwrap();
    let release = Release { version: "2.0.0".into(), sequence: 2, manifest_hash: package::hash(signed.payload.as_bytes()) };
    let mut child = Command::new("/bin/sleep").arg("0.1").spawn().unwrap();
    let owner = ProcessIdentity::capture(child.id()).unwrap();
    child.wait().unwrap();
    let transaction = storage.prepare(&target, &root.join("Updates"), &release, &code, owner.clone(), &trust).unwrap();
    assert_eq!(fingerprint(&target).unwrap(), transaction.journal.original_hash);
    assert_eq!(fingerprint(&transaction.backup()).unwrap(), readonly_fingerprint(&target).unwrap());
    fs::write(&archive, b"tampered after copying").unwrap();
    assert_eq!(macos::plist_value(&transaction.candidate(), "CFBundleShortVersionString").unwrap(), "2.0.0");
    assert!(storage.prepare(&target, &root.join("Updates"), &release, &code, owner, &trust).is_err());
    assert_eq!(fingerprint(&target).unwrap(), transaction.journal.original_hash);
    assert!(Command::new("/bin/chmod").args(["-R", "-P", "u+w"]).arg(&root).status().unwrap().success());
}

#[test]
fn live_relaunch_fixture() {
    if std::env::var_os("AMEOW_TEST_RELAUNCH_CHILD").is_some() {
        let mut byte = [0];
        let _ = std::io::stdin().read(&mut byte);
    }
}

#[test]
fn root_finish_requires_a_registered_live_image_and_rechecks_all_bundle_bytes() {
    let (_temporary, storage, mut transaction) = fixture();
    let image = transaction.journal.target.join("Contents/MacOS/ameow");
    fs::copy(std::env::current_exe().unwrap(), &image).unwrap();
    transaction.journal.original_hash = fingerprint(&transaction.journal.target).unwrap();
    transaction.journal.stage = RootStage::Restored;
    transaction.persist().unwrap();
    assert_eq!(transaction.require_ready_to_finish().unwrap_err(), "E_APP_UPDATE_RECOVERY_NOT_READY");
    let mut child = Command::new(&image).args(["--exact", "app_update::macos_privileged::tests::live_relaunch_fixture", "--nocapture"])
        .env("AMEOW_TEST_RELAUNCH_CHILD", "1").stdin(Stdio::piped()).stdout(Stdio::null()).spawn().unwrap();
    let result = (|| -> Result<(), String> {
        let deadline = std::time::Instant::now() + Duration::from_secs(3);
        loop {
            if ProcessIdentity::capture(child.id()).is_ok_and(|process| process.executable == image) { break; }
            if std::time::Instant::now() >= deadline { return Err("child did not enter expected image".into()); }
            std::thread::sleep(Duration::from_millis(5));
        }
        transaction.register_relaunch(child.id(), std::process::id())?;
        transaction.require_ready_to_finish()?;
        let reloaded = storage.load(&transaction.journal.token)?;
        assert!(reloaded.require_ready_to_finish().is_err());
        fs::write(transaction.journal.target.join("changed"), b"different bundle")
            .map_err(|error| error.to_string())?;
        assert!(transaction.require_ready_to_finish().is_err());
        fs::remove_file(transaction.journal.target.join("changed")).map_err(|error| error.to_string())?;
        transaction.require_ready_to_finish()
    })();
    drop(child.stdin.take());
    child.wait().unwrap();
    result.unwrap();
    assert!(transaction.require_ready_to_finish().is_err());
}

#[test]
fn confirmed_zombie_is_not_an_active_image_but_still_blocks_its_original_owner_guard() {
    let mut child = Command::new("/bin/sleep").arg("0.1").spawn().unwrap();
    let pid = child.id() as i32;
    let owner = ProcessIdentity::capture(child.id()).unwrap();
    assert!(executable_is_running(pid, &[PathBuf::from("/bin/sleep")]).unwrap());
    let mut status = std::mem::MaybeUninit::<libc::siginfo_t>::zeroed();
    let observed = unsafe { libc::waitid(libc::P_PID, pid as u32, status.as_mut_ptr(), libc::WEXITED | libc::WNOWAIT) };
    let result = executable_is_running(pid, &[PathBuf::from("/bin/sleep")]);
    let (_temporary, _storage, mut transaction) = fixture();
    transaction.journal.owner = owner;
    let guarded = transaction.require_quiescent();
    child.wait().unwrap();
    assert_eq!(observed, 0);
    assert!(!result.unwrap());
    assert!(guarded.is_err());
    transaction.require_quiescent().unwrap();
    assert!(!executable_is_running(pid, &[PathBuf::from("/bin/sleep")]).unwrap());
}

#[test]
fn missing_or_live_process_status_never_establishes_a_zombie() {
    assert!(zombie_record(b"42 Z\n", 42));
    assert!(zombie_record(b"42 Z+\n", 42));
    for record in [b"42 S\n".as_slice(), b"42 R\n", b"43 Z\n", b"42\n", b"Z\n", b"42 Z 43 S\n", b"42 Zombie\n", b"42 ZZ\n", b"", b"42 ?\n"] {
        assert!(!zombie_record(record, 42));
    }
}

#[test]
fn unavailable_paths_only_ignore_proven_unrelated_or_exited_processes() {
    let targets = [PathBuf::from("/Applications/Ameow.app/Contents/MacOS/ameow")];
    let diagnostics = "proc_pidpath=0 errno=Some(1) proc_name=0 errno=Some(13)";
    let missing = || Err("pid=42 proc_pidinfo=0/136 errno=Some(3)".into());
    assert!(!unresolved_executable(42, &targets, missing(), diagnostics, || Ok(false), || panic!("exited process" )).unwrap());
    let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
    info.pbi_pid = 42;
    info.pbi_status = libc::SRUN;
    for (slot, byte) in info.pbi_name.iter_mut().zip(b"launchd") { *slot = *byte as _; }
    assert!(!unresolved_executable(42, &targets, Ok(info), diagnostics, || Ok(true), || panic!("known system image")).unwrap());
    info.pbi_name.fill(0);
    for (slot, byte) in info.pbi_name.iter_mut().zip(b"ameow") { *slot = *byte as _; }
    let related = unresolved_executable(42, &targets, Ok(info), diagnostics, || Ok(true), || panic!("live image")).unwrap_err();
    assert!(related.starts_with("E_APP_UPDATE_PRIVILEGED_PROCESS_UNKNOWN: pid=42"));
    assert!(related.contains(diagnostics));
    assert!(related.contains("proc_pidinfo=ok uid=0 status=2"));
    let unknown = unresolved_executable(42, &targets, missing(), diagnostics, || Ok(true), || Ok(false)).unwrap_err();
    assert!(unknown.contains(diagnostics));
    assert!(unknown.contains("proc_pidinfo=0/136 errno=Some(3)"));
    info.pbi_name.fill(0);
    assert!(unresolved_executable(42, &targets, Ok(info), diagnostics, || Ok(true), || Ok(false)).is_err());
    let long_target = [PathBuf::from("/Applications/Ameow.app/Contents/MacOS/ameow-updater-long-executable-name")];
    assert!(could_be_target_name(b"ameow-updater-l", 16, &long_target));
    assert!(!could_be_target_name(b"unrelated", 16, &long_target));
}

#[test]
#[ignore = "Subprocess fixture with an inherited private IPC descriptor; no authorization"]
fn worker_failure_recorder_fixture() {
    let descriptor: i32 = std::env::var("AMEOW_TEST_WORKER_PIPE").unwrap().parse().unwrap();
    assert_eq!(unsafe { libc::fcntl(descriptor, libc::F_SETFD, libc::FD_CLOEXEC) }, 0);
    let mut remote = Remote::new(unsafe { UnixStream::from_raw_fd(descriptor) });
    let config: Supervisor = read_message(&mut remote.pipe).unwrap();
    let install = super::super::Install::fixture(config.updates.clone()).unwrap();
    let mode: String = read_json(&install.root.join("fixture-failure-mode.json")).unwrap();
    write_message(&mut remote.pipe, &Ok::<(), String>(())).unwrap();
    let result = supervise_worker(&install, &config, &mut remote, || {
        if mode == "adopt-error" { return super::super::macos_lease::adopt_for_target(&config.marker.target); }
        let descriptor: i32 = std::env::var("AMEOW_UPDATE_LEASE_FD").unwrap().parse().unwrap();
        Ok(unsafe { File::from_raw_fd(descriptor) })
    });
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(72);
    }
    if mode == "success" {
        let application: u32 = read_json(&install.root.join("fixture-pid.json")).unwrap();
        let mut status = 0;
        assert_eq!(unsafe { libc::waitpid(application as i32, &mut status, 0) }, application as i32);
        assert!(libc::WIFEXITED(status));
        atomic_json(&install.root.join("fixture-app-waited.json"), &application).unwrap();
    }
}

#[test]
fn worker_failures_after_handoff_reach_user_state_without_finishing_recovery() {
    for mode in ["before-activation", "root-disappeared", "adopt-error", "running-lock-error", "operation-error", "completion-error"] {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().canonicalize().unwrap();
        let install = super::super::Install::fixture(root.join("updates")).unwrap();
        atomic_json(&install.root.join("fixture-failure-mode.json"), &mode).unwrap();
        let running = (mode == "running-lock-error").then(|| super::super::store::exclusive(&install.root.join("running.lock")).unwrap());
        let release = Release { version: "2.0.0".into(), sequence: 2, manifest_hash: "b".repeat(64) };
        let mut state = install.state().unwrap();
        state.current = Some(Release { version: "1.0.0".into(), sequence: 1, manifest_hash: "a".repeat(64) });
        state.trial = Some(release.clone());
        state.highest_sequence = 2;
        let before = serde_json::to_value(&state).unwrap();
        install.save(&state).unwrap();
        let marker = Marker { token: "c".repeat(64), target: root.join("Ameow.app"), release,
            recovery_helper: root.join("preserved/Ameow.app/Contents/MacOS/ameow-updater") };
        let marker_path = install.root.join(MARKER);
        atomic_json(&marker_path, &marker).unwrap();
        let marker_bytes = fs::read(&marker_path).unwrap();
        let index = root.join("fixture-index");
        let sentinel = root.join("user-data");
        fs::write(&index, b"retained index").unwrap();
        fs::write(&sentinel, b"user data").unwrap();
        let config = Supervisor { marker, updates: install.root.clone(), args: Vec::new(), recovery: true };
        let (mut server, pipe) = UnixStream::pair().unwrap();
        let descriptor = pipe.as_raw_fd();
        let mut command = Command::new(std::env::current_exe().unwrap());
        command.args(["--exact", "app_update::macos_privileged::tests::worker_failure_recorder_fixture", "--ignored", "--nocapture"])
            .env("AMEOW_TEST_WORKER_PIPE", descriptor.to_string()).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
        unsafe { command.pre_exec(move || {
            if libc::fcntl(descriptor, libc::F_SETFD, 0) != 0 { return Err(std::io::Error::last_os_error()); }
            Ok(())
        }); }
        let lease_path = root.join("fixture-lease");
        let lease = super::super::store::exclusive(&lease_path).unwrap();
        let child = super::super::macos_lease::spawn_with_lease(&mut command, &lease).unwrap();
        drop(lease);
        drop(pipe);
        write_message(&mut server, &config).unwrap();
        let initialized: Result<(), String> = read_message(&mut server).unwrap();
        initialized.unwrap();
        let root_error = "E_APP_UPDATE_PRIVILEGED_PROCESS_UNKNOWN: pid=42 proc_pidpath=0 errno=Some(1) proc_name=0 errno=Some(13) proc_pidinfo=0/136 errno=Some(3)";
        match mode {
            "before-activation" => write_message(&mut server, &Err::<(), _>(root_error)).unwrap(),
            "root-disappeared" => {},
            _ => {
                write_message(&mut server, &Ok::<(), String>(())).unwrap();
                if !matches!(mode, "adopt-error" | "running-lock-error") {
                    assert!(matches!(read_message::<Operation>(&mut server).unwrap(), Operation::Status));
                    write_message(&mut server, &Err::<Outcome, _>("E_FIXTURE_ROOT_STATUS")).unwrap();
                }
                assert!(matches!(read_message::<Operation>(&mut server).unwrap(), Operation::Complete));
                assert!(super::super::store::exclusive(&lease_path).is_ok(), "{mode}: supervisor still holds its lease while waiting for completion");
                let result = if mode == "completion-error" { Err(root_error) } else { Ok(Outcome::Prepared) };
                write_message(&mut server, &result).unwrap();
            }
        }
        drop(server);
        let output = child.wait_with_output().unwrap();
        assert_eq!(output.status.code(), Some(72), "{mode}: {}", String::from_utf8_lossy(&output.stderr));
        let state = install.state().unwrap();
        let error = state.last_error.as_ref().unwrap();
        assert!(matches!(super::super::Coordinator::new(install.clone()).snapshot().phase, super::super::Phase::Failed));
        match mode {
            "before-activation" => assert_eq!(error, root_error),
            "root-disappeared" => assert!(error.starts_with("E_APP_UPDATE_PRIVILEGED_PIPE:")),
            "adopt-error" => assert_eq!(error, "E_APP_UPDATE_PRIVILEGED_GATE"),
            "running-lock-error" => assert!(error.starts_with("E_APP_UPDATE_LOCK:")),
            "completion-error" => assert!(error.contains(root_error) && error.contains("E_APP_UPDATE_PRIVILEGED_COMPLETION")),
            _ => assert_eq!(error, "E_FIXTURE_ROOT_STATUS"),
        }
        let mut after = serde_json::to_value(&state).unwrap();
        after["last_error"] = serde_json::Value::Null;
        assert_eq!(before, after, "{mode}");
        assert_eq!(fs::read(&marker_path).unwrap(), marker_bytes);
        assert_eq!(fs::read(&index).unwrap(), b"retained index");
        assert_eq!(fs::read(&sentinel).unwrap(), b"user data");
        drop(running);
    }
}

#[test]
fn legacy_v1_recovery_reuses_content_guards_and_never_finishes_without_a_ready_image() {
    let (_temporary, storage, mut original) = fixture();
    let code = original.journal.code.clone();
    let journal = fs::read(original.path.join("journal.json")).unwrap();
    let mut loaded = storage.load(&original.journal.token).unwrap();
    assert_eq!(loaded.journal.schema, 1);
    assert_eq!(loaded.journal.code, code);
    let main = loaded.journal.target.join("Contents/MacOS/ameow");
    fs::write(&main, b"altered in place").unwrap();
    assert!(loaded.rollback().is_err());
    assert_eq!(fs::read(loaded.path.join("journal.json")).unwrap(), journal);
    fs::write(&main, b"old").unwrap();
    original.rollback().unwrap();
    let before = fs::read(original.path.join("journal.json")).unwrap();
    let (mut client, mut server) = UnixStream::pair().unwrap();
    let serving = std::thread::spawn(move || serve_operations(&mut original, std::process::id(), &mut server, settle_worker));
    write_message(&mut client, &Operation::Finish).unwrap();
    let unfinished: Result<Outcome, String> = read_message(&mut client).unwrap();
    assert_eq!(unfinished.err().as_deref(), Some("E_APP_UPDATE_RECOVERY_NOT_READY"));
    write_message(&mut client, &Operation::Complete).unwrap();
    let completed: Result<Outcome, String> = read_message(&mut client).unwrap();
    assert!(matches!(completed, Ok(Outcome::Restored)));
    serving.join().unwrap().unwrap();
    let restored = storage.load(&loaded.journal.token).unwrap();
    assert_eq!(restored.journal.code, code);
    assert_eq!(fs::read(restored.path.join("journal.json")).unwrap(), before);
    old_is_intact(&restored);
}

#[test]
fn lost_swap_reply_waits_for_real_lease_release_and_preserves_settlement_errors() {
    for guard_unknown in [false, true] {
        let (_temporary, storage, mut transaction) = fixture();
        let lease_path = storage.base.join("fixture-gate");
        let gate = super::super::store::exclusive(&lease_path).unwrap();
        let mut command = Command::new("/bin/cat");
        command.stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null());
        let mut owner = super::super::macos_lease::spawn_with_lease(&mut command, &gate).unwrap();
        drop(gate);
        let (mut client, mut server) = UnixStream::pair().unwrap();
        let (entered, observed) = std::sync::mpsc::channel();
        let (run, start) = std::sync::mpsc::channel();
        let (completed, completion) = std::sync::mpsc::channel();
        let gate_path = lease_path.clone();
        let token = transaction.journal.token.clone();
        let target = transaction.journal.target.clone();
        let supervisor = owner.id();
        let serving = std::thread::spawn(move || {
        start.recv().unwrap();
        let result = serve_operations(&mut transaction, supervisor, &mut server, |transaction| {
            entered.send(()).unwrap();
            let gate = File::open(&gate_path).map_err(|error| error.to_string())?;
            lock_gate(&gate)?;
            if guard_unknown { return Err("E_FIXTURE_PARTICIPANT_UNKNOWN".into()); }
            transaction.rollback()
        });
        completed.send(()).unwrap();
        result });
        write_message(&mut client, &Operation::Swap).unwrap();
        drop(client);
        run.send(()).unwrap();
        let reached_settlement = observed.recv_timeout(Duration::from_secs(2));
        let before_release_completed = completion.recv_timeout(Duration::from_millis(100));
        let owner_still_running = owner.try_wait().unwrap().is_none();
        let before_release = fs::read(target.join("Contents/MacOS/ameow")).unwrap();
        owner.stdin.take();
        let status = owner.wait().unwrap();
        let result = serving.join().unwrap().unwrap_err();
        assert!(reached_settlement.is_ok(), "lost reply skipped settlement");
        assert!(matches!(before_release_completed, Err(std::sync::mpsc::RecvTimeoutError::Timeout)), "settlement completed while the controlled lease was still held");
        assert!(owner_still_running);
        assert_eq!(before_release, b"new");
        assert!(status.success());
        assert!(result.contains("E_APP_UPDATE_PRIVILEGED_PIPE"));
        let restored = storage.load(&token).unwrap();
        if guard_unknown {
            assert!(result.contains("E_FIXTURE_PARTICIPANT_UNKNOWN"));
            assert_eq!(restored.journal.stage, RootStage::Swapped);
            assert_eq!(fs::read(target.join("Contents/MacOS/ameow")).unwrap(), b"new");
            assert_eq!(fs::read(restored.backup().join("Contents/MacOS/ameow")).unwrap(), b"old");
        } else {
            assert_eq!(restored.journal.stage, RootStage::Restored);
            old_is_intact(&restored);
        }
        assert!(super::super::store::exclusive(&lease_path).is_ok());
    }
}

#[test]
fn worker_success_waits_for_ready_then_receives_final_completion() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let install = super::super::Install::fixture(root.join("updates")).unwrap();
    atomic_json(&install.root.join("fixture-failure-mode.json"), &"success").unwrap();
    atomic_json(&install.root.join("fixture-mode.json"), &"ready").unwrap();
    let bundle = root.join("Ameow.app");
    fs::create_dir_all(bundle.join("Contents/MacOS")).unwrap();
    fs::copy(std::env::current_exe().unwrap(), bundle.join("Contents/MacOS/ameow")).unwrap();
    fs::write(bundle.join("Contents/Info.plist"), br#"<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>1.0.0</string></dict></plist>"#).unwrap();
    let previous = Release { version: "1.0.0".into(), sequence: 1, manifest_hash: "a".repeat(64) };
    let release = Release { version: "2.0.0".into(), sequence: 2, manifest_hash: "b".repeat(64) };
    let mut state = install.state().unwrap();
    state.current = Some(previous);
    state.trial = Some(release.clone());
    install.save(&state).unwrap();
    let marker = Marker { token: "c".repeat(64), target: bundle.clone(), release,
        recovery_helper: root.join("preserved/Ameow.app/Contents/MacOS/ameow-updater") };
    atomic_json(&install.root.join(MARKER), &marker).unwrap();
    let config = Supervisor { marker, updates: install.root.clone(), args: vec!["--exact".into(),
        "app_update::macos_helper::tests::relaunch_child_fixture".into(), "--nocapture".into()], recovery: true };
    let (mut server, pipe) = UnixStream::pair().unwrap();
    let descriptor = pipe.as_raw_fd();
    let mut command = Command::new(std::env::current_exe().unwrap());
    command.args(["--exact", "app_update::macos_privileged::tests::worker_failure_recorder_fixture", "--ignored", "--nocapture"])
        .env("AMEOW_TEST_WORKER_PIPE", descriptor.to_string()).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
    unsafe { command.pre_exec(move || {
        if libc::fcntl(descriptor, libc::F_SETFD, 0) != 0 { return Err(std::io::Error::last_os_error()); }
        Ok(())
    }); }
    let lease = super::super::store::exclusive(&root.join("fixture-lease")).unwrap();
    let child = super::super::macos_lease::spawn_with_lease(&mut command, &lease).unwrap();
    drop(lease);
    drop(pipe);
    write_message(&mut server, &config).unwrap();
    let initialized: Result<(), String> = read_message(&mut server).unwrap();
    initialized.unwrap();
    write_message(&mut server, &Ok::<(), String>(())).unwrap();
    let mut operations = Vec::new();
    let mut application = None;
    loop {
        let operation: Operation = read_message(&mut server).unwrap();
        let result: Result<Outcome, String> = match operation {
            Operation::Status => { operations.push("Status"); Ok(Outcome::Prepared) }
            Operation::Restore => { operations.push("Restore"); Ok(Outcome::Restored) }
            Operation::Relaunch(pid) => {
                operations.push("Relaunch");
                let process = ProcessIdentity::capture(pid).unwrap();
                assert_eq!(process.parent, child.id());
                assert_eq!(process.executable, bundle.join("Contents/MacOS/ameow"));
                assert_eq!(process.uid, unsafe { libc::geteuid() });
                application = Some(process);
                Ok(Outcome::Restored)
            }
            Operation::Finish => {
                operations.push("Finish");
                assert!(application.as_ref().unwrap().alive().unwrap());
                let boot = fs::read_dir(&install.root).unwrap().filter_map(Result::ok)
                    .find(|entry| entry.file_name().to_string_lossy().starts_with("boot-")).unwrap().path();
                let ticket: super::super::launcher::Ticket = read_json(&boot.join("ticket.json")).unwrap();
                assert_eq!(read_json::<String>(&boot.join("final-ack.json")).unwrap(), ticket.nonce);
                assert!(install.root.join(MARKER).exists());
                Ok(Outcome::Restored)
            }
            Operation::Complete => {
                operations.push("Complete");
                assert!(!install.root.join(MARKER).exists());
                write_message(&mut server, &Ok::<_, String>(Outcome::Restored)).unwrap();
                break;
            }
            _ => panic!("unexpected operation"),
        };
        write_message(&mut server, &result).unwrap();
    }
    drop(server);
    fs::write(install.root.join("fixture-stop"), b"stop").unwrap();
    let output = child.wait_with_output().unwrap();
    assert_eq!(read_json::<u32>(&install.root.join("fixture-app-waited.json")).unwrap(), application.as_ref().unwrap().pid);
    assert!(!application.as_ref().unwrap().alive().unwrap());
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    assert_eq!(operations, ["Status", "Restore", "Relaunch", "Finish", "Complete"]);
    let state = install.state().unwrap();
    assert!(state.last_error.is_none());
    assert_eq!(state.current.unwrap().version, "1.0.0");
    assert_eq!(state.pending.unwrap().version, "2.0.0");
    assert!(state.trial.is_none());
}

#[test]
#[ignore = "Read-only installed target scan as the current user; no authorization or transaction changes"]
fn inspect_installed_processes_without_authorization() {
    let result = running_executables(&[
        PathBuf::from("/Applications/Ameow.app/Contents/MacOS/ameow"),
        PathBuf::from("/Applications/Ameow.app/Contents/MacOS/ameow-updater"),
    ]);
    println!("ordinary-user installed executable scan: {}", match result {
        Ok(active) => format!("active={active}"),
        Err(error) => error,
    });
}

#[test]
fn system_user_groups_and_process_discovery_preserve_the_callers_identity() {
    let uid = unsafe { libc::getuid() };
    let gid = unsafe { libc::getgid() };
    let mut groups = user_groups(uid, gid).unwrap();
    groups.sort_unstable();
    groups.dedup();
    let result = Command::new("/usr/bin/id").args(["-G", &uid.to_string()]).output().unwrap();
    assert!(result.status.success());
    let mut expected = String::from_utf8(result.stdout).unwrap().split_whitespace().map(|group| group.parse::<u32>().unwrap()).collect::<Vec<_>>();
    expected.sort_unstable();
    expected.dedup();
    assert_eq!(groups, expected);
    assert!(running_executables(&[std::env::current_exe().unwrap()]).unwrap());
}
