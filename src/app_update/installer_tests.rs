use super::*;
use std::os::windows::fs::OpenOptionsExt;

fn legacy(root: &Path) -> Vec<u8> {
    let version = "0.5.1";
    let exe = b"legacy verified executable";
    let (mut manifest, _, _) = super::super::package::fixture_windows_package(
        version,
        1,
        store::now(),
        &[("Ameow.exe", exe)],
    );
    manifest.schema = 1;
    manifest.bundle_sha256 = None;
    manifest.url = format!(
        "https://github.com/Wutpeach/Ameow/releases/download/v{version}/Ameow-{version}-windows-x64.zip"
    );
    let envelope = super::super::package::fixture_envelope(&manifest);
    let signed: SignedManifest = serde_json::from_slice(&envelope).unwrap();
    let directory = root.join("versions").join(version);
    fs::create_dir_all(&directory).unwrap();
    fs::write(directory.join("Ameow.exe"), exe).unwrap();
    fs::write(directory.join("manifest.json"), envelope).unwrap();
    fs::write(root.join("AmeowLauncher.exe"), b"legacy launcher").unwrap();
    fs::write(root.join("ameow-cli.exe"), b"legacy CLI").unwrap();
    fs::create_dir(root.join("browser-extension")).unwrap();
    fs::write(
        root.join("browser-extension/background.js"),
        b"legacy extension",
    )
    .unwrap();
    let state = State {
        current: Some(Release {
            version: version.into(),
            sequence: 1,
            manifest_hash: super::super::hash(signed.payload.as_bytes()),
        }),
        highest_sequence: 1,
        ..Default::default()
    };
    let bytes = serde_json::to_vec(&state).unwrap();
    fs::write(root.join("state.json"), &bytes).unwrap();
    bytes
}

#[test]
fn empty_destination_and_new_install_migration_do_not_create_directories() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().join("中文 new installation");
    let mut report = Report::default();
    assert!(!inspect(&root, &Trust::fixture(), &mut report).unwrap());
    execute(
        &root,
        &Trust::fixture(),
        "migrate-legacy",
        false,
        &mut report,
    )
    .unwrap();
    assert!(!root.exists());
    fs::create_dir(&root).unwrap();
    fs::write(root.join("Ameow.exe"), b"not an identified installation").unwrap();
    assert!(inspect(&root, &Trust::fixture(), &mut report).is_err());
    assert_eq!(
        fs::read(root.join("Ameow.exe")).unwrap(),
        b"not an identified installation"
    );
}

#[test]
fn legacy_migration_preserves_old_files_and_restores_original_companions_after_failure() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path();
    let original_state = legacy(root);
    fs::write(root.join("unrelated download.mp4"), b"user media").unwrap();
    let mut report = Report::default();
    migrate(root, &Trust::fixture(), &mut report).unwrap();
    assert!(!root.join("state.json").exists());
    assert!(root.join("AmeowLauncher.exe").is_file());
    assert_eq!(
        fs::read(root.join(BACKUP).join("state.json")).unwrap(),
        original_state
    );
    // An interrupted installer can resume before it has written the new contract.
    migrate(root, &Trust::fixture(), &mut report).unwrap();
    fs::write(root.join("state.json"), b"rejected new state").unwrap();
    fs::write(root.join("entry.json"), b"rejected new entry").unwrap();
    fs::write(root.join("ameow-cli.exe"), b"new CLI").unwrap();
    fs::write(
        root.join("browser-extension/background.js"),
        b"new extension",
    )
    .unwrap();
    rollback(root, &mut report).unwrap();
    assert_eq!(fs::read(root.join("state.json")).unwrap(), original_state);
    assert!(!root.join("entry.json").exists());
    assert_eq!(fs::read(root.join("ameow-cli.exe")).unwrap(), b"legacy CLI");
    assert_eq!(
        fs::read(root.join("browser-extension/background.js")).unwrap(),
        b"legacy extension"
    );
    assert_eq!(
        fs::read(root.join("unrelated download.mp4")).unwrap(),
        b"user media"
    );
    assert!(root.join("versions/0.5.1/Ameow.exe").is_file());
}

#[test]
fn corrupt_legacy_program_cannot_authorize_state_migration() {
    let temporary = tempfile::tempdir().unwrap();
    let original = legacy(temporary.path());
    fs::write(
        temporary.path().join("versions/0.5.1/Ameow.exe"),
        b"tampered",
    )
    .unwrap();
    assert!(migrate(temporary.path(), &Trust::fixture(), &mut Report::default()).is_err());
    assert_eq!(
        fs::read(temporary.path().join("state.json")).unwrap(),
        original
    );
    assert!(!temporary.path().join(BACKUP).exists());
}

#[test]
fn changed_or_locked_owned_file_is_reported_and_preserved_until_a_retry() {
    let temporary = tempfile::tempdir().unwrap();
    let path = temporary.path().join("owned.bin");
    fs::write(&path, b"original").unwrap();
    let record = BundleFile {
        path: "owned.bin".into(),
        bytes: 8,
        sha256: super::super::hash(b"original"),
    };
    let locked = OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&path)
        .unwrap();
    let mut report = Report::default();
    remove_record(&path, &record, &mut report);
    assert!(path.exists());
    assert!(!report.remaining.is_empty());
    drop(locked);
    fs::write(&path, b"modified").unwrap();
    let mut changed = Report::default();
    remove_record(&path, &record, &mut changed);
    assert!(path.exists());
    assert!(!changed.remaining.is_empty());
    fs::write(&path, b"original").unwrap();
    remove_record(&path, &record, &mut Report::default());
    assert!(!path.exists());
}

#[test]
fn explicit_data_cleanup_keeps_recorded_output_and_unknown_user_files() {
    let temporary = tempfile::tempdir().unwrap();
    let data = temporary.path();
    let runtime = data.join(format!("runtime-{}", "a".repeat(64)));
    let output = runtime.join("我的下载");
    fs::create_dir_all(&output).unwrap();
    fs::write(output.join("成品.mp4"), b"download result").unwrap();
    fs::write(
        data.join("ui-settings.json"),
        serde_json::to_vec(&serde_json::json!({"output_dir": output})).unwrap(),
    )
    .unwrap();
    fs::create_dir(data.join("browser-sessions")).unwrap();
    fs::write(
        data.join("browser-sessions/sessions.bin"),
        b"isolated credential fixture",
    )
    .unwrap();
    fs::write(data.join("unrelated.bin"), b"user file").unwrap();
    for name in ["app-install-receipt.json", "lifecycle-receipt.json"] {
        fs::write(data.join(name), b"owned maintenance receipt").unwrap();
    }
    let mut report = Report::default();
    purge_data(data, &mut report).unwrap();
    assert!(report.remaining.is_empty());
    assert!(output.join("成品.mp4").is_file());
    assert!(data.join("unrelated.bin").is_file());
    assert!(!data.join("browser-sessions").exists());
    assert!(!data.join("ui-settings.json").exists());
    assert!(!data.join("app-install-receipt.json").exists());
    assert!(!data.join("lifecycle-receipt.json").exists());
}

#[test]
fn malformed_settings_prevent_user_data_deletion() {
    let temporary = tempfile::tempdir().unwrap();
    fs::write(temporary.path().join("ui-settings.json"), b"broken").unwrap();
    fs::create_dir(temporary.path().join("jobs")).unwrap();
    fs::write(
        temporary.path().join("jobs/possibly-user-output.bin"),
        b"preserve",
    )
    .unwrap();
    assert!(purge_data(temporary.path(), &mut Report::default()).is_err());
    assert!(
        temporary
            .path()
            .join("jobs/possibly-user-output.bin")
            .is_file()
    );
}

#[test]
fn data_cleanup_preserves_default_custom_and_previous_download_destinations() {
    for selected in [None, Some(0usize), Some(1usize)] {
        let temporary = tempfile::tempdir().unwrap();
        let data = temporary.path().join("LocalAppData/Ameow");
        fs::create_dir_all(data.join("browser-sessions")).unwrap();
        fs::write(data.join("browser-sessions/sessions.bin"), b"test session").unwrap();
        let destinations = [
            temporary.path().join("User/Downloads"),
            temporary.path().join("OtherDisk/我的视频"),
            temporary.path().join("旧下载位置"),
        ];
        for destination in &destinations {
            fs::create_dir_all(destination).unwrap();
            fs::write(destination.join("已完成.mp4"), b"finished download").unwrap();
        }
        if let Some(index) = selected {
            fs::write(
                data.join("ui-settings.json"),
                serde_json::to_vec(&serde_json::json!({"output_dir": destinations[index]}))
                    .unwrap(),
            )
            .unwrap();
        }
        let mut report = Report::default();
        purge_data(&data, &mut report).unwrap();
        assert!(report.remaining.is_empty());
        assert!(!data.join("browser-sessions").exists());
        for destination in &destinations {
            assert_eq!(
                fs::read(destination.join("已完成.mp4")).unwrap(),
                b"finished download"
            );
        }
    }
}

#[test]
fn canonical_and_case_varied_output_paths_are_preserved_inside_diagnostics() {
    for uppercase in [false, true] {
        let temporary = tempfile::tempdir().unwrap();
        let data = temporary.path();
        let output = data.join("diagnostics/中文 Output");
        fs::create_dir_all(&output).unwrap();
        fs::write(output.join("完成.mp4"), b"finished media").unwrap();
        let canonical = output.canonicalize().unwrap().to_string_lossy().to_string();
        let setting = if uppercase {
            canonical.to_uppercase()
        } else {
            canonical
        };
        fs::write(
            data.join("ui-settings.json"),
            serde_json::to_vec(&serde_json::json!({"output_dir": setting})).unwrap(),
        )
        .unwrap();
        purge_data(data, &mut Report::default()).unwrap();
        assert_eq!(
            fs::read(output.join("完成.mp4")).unwrap(),
            b"finished media"
        );
    }
}

fn complete_install(root: &Path) {
    let (_, bytes, _) = super::super::package::fixture_windows_package(
        "0.5.3",
        3,
        store::now(),
        &[("Ameow.exe", b"fixture application")],
    );
    zip::ZipArchive::new(std::io::Cursor::new(bytes))
        .unwrap()
        .extract(root)
        .unwrap();
    let envelope: SignedManifest = store::read_json(&root.join("entry.json")).unwrap();
    let release = Release {
        version: "0.5.3".into(),
        sequence: 3,
        manifest_hash: super::super::hash(envelope.payload.as_bytes()),
    };
    let state = State {
        current: Some(release),
        highest_sequence: 3,
        ..Default::default()
    };
    store::atomic_json(&root.join("state.json"), &state).unwrap();
}

#[test]
fn cleanup_failure_preserves_entry_and_signed_receipts_and_can_finish_on_retry() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path();
    complete_install(root);
    fs::write(root.join("unrelated user.txt"), b"keep").unwrap();
    let data = data_root(root).unwrap();
    fs::create_dir_all(&data).unwrap();
    fs::write(data.join("ui-settings.json"), b"invalid JSON").unwrap();
    assert!(
        execute(
            root,
            &Trust::fixture(),
            "cleanup",
            true,
            &mut Report::default()
        )
        .is_err()
    );
    assert!(root.join("Ameow.exe").is_file());
    assert!(root.join("state.json").is_file());
    assert!(root.join("versions/0.5.3/bundle.json").is_file());
    assert!(root.join("versions/0.5.3/Ameow.exe").is_file());
    // Permit reads but deny deletion, so preflight succeeds and actual root-mirror
    // deletion fails after slot members have been removed. Signed receipts survive.
    let locked = OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(root.join("browser-extension/background.js"))
        .unwrap();
    assert!(
        execute(
            root,
            &Trust::fixture(),
            "cleanup",
            false,
            &mut Report::default()
        )
        .is_err()
    );
    assert!(root.join("Ameow.exe").is_file());
    assert!(root.join("entry.json").is_file());
    assert!(root.join(UNINSTALL).is_file());
    assert!(root.join("versions/0.5.3/bundle.json").is_file());
    drop(locked);
    execute(
        root,
        &Trust::fixture(),
        "cleanup",
        false,
        &mut Report::default(),
    )
    .unwrap();
    assert!(!root.join("Ameow.exe").exists());
    assert!(!root.join("state.json").exists());
    assert!(!root.join("versions").exists());
    assert!(!root.join(UNINSTALL).exists());
    assert!(!root.join("state.lock").exists());
    assert!(!root.join("running.lock").exists());
    assert!(data.join("ui-settings.json").is_file());
    assert_eq!(fs::read(root.join("unrelated user.txt")).unwrap(), b"keep");
}

#[test]
fn runtime_cache_cleanup_preserves_media_and_jobs_cleanup_keeps_nonworkspaces() {
    let temporary = tempfile::tempdir().unwrap();
    let data = temporary.path();
    let mut manifest = crate::download::runtime::manifest().unwrap();
    manifest.components.truncate(1);
    let bytes = serde_json::to_vec(&manifest).unwrap();
    let runtime = data.join(format!("runtime-{}", super::super::hash(&bytes)));
    fs::create_dir(&runtime).unwrap();
    fs::write(runtime.join("complete.json"), &bytes).unwrap();
    fs::write(runtime.join("already-downloaded.mp4"), b"keep media").unwrap();
    for component in &manifest.components {
        for file in &component.files {
            fs::write(runtime.join(&file.name), b"component cache").unwrap();
        }
    }
    let jobs = data.join("jobs");
    fs::create_dir_all(jobs.join("job-1-Ab12cd")).unwrap();
    fs::write(
        jobs.join("job-1-Ab12cd/partial-media.part"),
        b"temporary job",
    )
    .unwrap();
    fs::write(jobs.join("finished.mp4"), b"keep media").unwrap();
    let mut report = Report::default();
    purge_data(data, &mut report).unwrap();
    assert!(report.remaining.is_empty());
    assert!(runtime.join("already-downloaded.mp4").is_file());
    assert!(!runtime.join("complete.json").exists());
    assert!(!jobs.join("job-1-Ab12cd").exists());
    assert!(jobs.join("finished.mp4").is_file());
}
