use super::*;
use std::{
    fs,
    io::{self, Cursor, Read, Write},
};

pub(super) fn fixture(
    version: &str,
    sequence: u64,
    members: &[(&str, &[u8])],
) -> (Manifest, Vec<u8>, Vec<u8>) {
    fixture_issued(version, sequence, members, store::now() / 86400 * 86400)
}
pub(super) fn fixture_issued(
    version: &str,
    sequence: u64,
    members: &[(&str, &[u8])],
    issued: u64,
) -> (Manifest, Vec<u8>, Vec<u8>) {
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (name, bytes) in members {
        writer
            .start_file(*name, zip::write::SimpleFileOptions::default())
            .unwrap();
        writer.write_all(bytes).unwrap();
    }
    let package = writer.finish().unwrap().into_inner();
    let exe = members.first().map_or(&b"exe"[..], |(_, b)| *b);
    let m = Manifest {
        schema: 1,
        product: "Ameow".into(),
        channel: "stable".into(),
        target: TARGET.into(),
        version: version.into(),
        sequence,
        issued,
        url: format!(
            "https://github.com/Wutpeach/Ameow/releases/download/v{version}/Ameow-{version}-windows-x64.zip"
        ),
        package_bytes: package.len() as u64,
        package_sha256: hash(&package),
        exe_bytes: exe.len() as u64,
        exe_sha256: hash(exe),
    };
    let envelope = fixture_envelope(&m);
    (m, package, envelope)
}
pub(super) fn prepare(install: &Install, version: &str, sequence: u64) -> Vec<u8> {
    let (_, bytes, envelope) = fixture(
        version,
        sequence,
        &[("Ameow.exe", b"verified fixture executable")],
    );
    install
        .prepare_fixture(&envelope, &mut Cursor::new(bytes))
        .unwrap();
    envelope
}
#[test]
fn publisher_signature_is_required_and_fixture_is_not_production_trust() {
    let (_, _, envelope) = fixture("0.1.0", 1, &[("Ameow.exe", b"exe")]);
    assert!(
        Trust::fixture()
            .verify(&envelope, Some(store::now()))
            .is_ok()
    );
    assert!(
        Trust::production()
            .unwrap()
            .verify(&envelope, Some(store::now()))
            .is_err()
    );
    let mut signed: SignedManifest = serde_json::from_slice(&envelope).unwrap();
    signed.payload = signed.payload.replace("0.1.0", "9.1.0");
    assert!(
        Trust::fixture()
            .verify(&serde_json::to_vec(&signed).unwrap(), None)
            .unwrap_err()
            .contains("SIGNATURE")
    );
    signed.signature.replace_range(0..2, "ff");
    assert!(
        Trust::fixture()
            .verify(&serde_json::to_vec(&signed).unwrap(), None)
            .is_err()
    );
}
#[test]
fn signed_but_wrong_identity_source_future_issue_and_version_are_rejected() {
    let (m, _, _) = fixture("0.1.0", 1, &[("Ameow.exe", b"exe")]);
    for mutate in [
        |m: &mut Manifest| m.target = "aarch64-pc-windows-msvc".into(),
        |m: &mut Manifest| m.product = "Electron".into(),
        |m: &mut Manifest| m.channel = "nightly".into(),
        |m: &mut Manifest| m.url = "https://example.com/mutable.zip".into(),
        |m: &mut Manifest| m.version = "0.3.1-beta".into(),
        |m: &mut Manifest| m.issued = store::now() + 3600,
    ] {
        let mut changed = m.clone();
        mutate(&mut changed);
        assert!(
            Trust::fixture()
                .verify(&fixture_envelope(&changed), Some(store::now()))
                .is_err()
        );
    }
    for bad in [
        "1.0",
        "01.0.0",
        "1.0.0+build",
        "1.0.0-rc1",
        "v1.0.0",
        "../../x",
    ] {
        assert!(Version::parse(bad).is_err());
    }
    assert!(Version::parse("0.10.0").unwrap() > Version::parse("0.9.9").unwrap());
}
#[test]
fn immutable_signed_release_has_no_expiry_and_still_rejects_future_issuance() {
    let issued = 1_700_000_000;
    let (m, _, envelope) = fixture_issued(
        "0.5.0", 1, &[("Ameow.exe", b"exe")], issued,
    );
    let payload = serde_json::to_value(&m).unwrap();
    assert!(payload.get("expires").is_none());
    for days in [8, 30, 365 * 5] {
        let (_, verified) = Trust::fixture()
            .verify(&envelope, Some(issued + days * 86400)).unwrap();
        assert_eq!(verified.version, "0.5.0");
        assert_eq!(verified.sequence, 1);
    }
    assert_eq!(Trust::fixture().verify(&envelope, Some(issued - 301))
        .unwrap_err(), "E_APP_UPDATE_ISSUED_IN_FUTURE");
}
#[test]
fn obsolete_expiring_draft_is_rejected_even_with_a_valid_fixture_signature() {
    let (m, _, _) = fixture("0.5.0", 1, &[("Ameow.exe", b"exe")]);
    let mut payload = serde_json::to_value(&m).unwrap();
    payload["expires"] = serde_json::json!(m.issued + 86400);
    let payload = serde_json::to_string(&payload).unwrap();
    let seed = package::unhex(
        "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60", 32,
    ).unwrap();
    let key = ring::signature::Ed25519KeyPair::from_seed_unchecked(&seed).unwrap();
    let signature = key.sign(&[package::DOMAIN, payload.as_bytes()].concat());
    let envelope = SignedManifest { payload, signature: signature.as_ref().iter()
        .map(|b| format!("{b:02x}")).collect() };
    assert_eq!(Trust::fixture().verify(&serde_json::to_vec(&envelope).unwrap(), None)
        .unwrap_err(), "E_APP_UPDATE_MANIFEST");
}
#[test]
fn full_package_is_verified_before_pending_and_launch_rechecks_executable() {
    let root = tempfile::tempdir().unwrap();
    let install = Install::fixture(root.path().into()).unwrap();
    let (_, mut bytes, envelope) = fixture("0.1.0", 1, &[("Ameow.exe", b"original")]);
    bytes[0] ^= 1;
    assert!(
        install
            .prepare_fixture(&envelope, &mut Cursor::new(&bytes))
            .is_err()
    );
    assert!(install.state().unwrap().pending.is_none());
    assert!(!root.path().join("versions/0.1.0").exists());
    bytes[0] ^= 1;
    install
        .prepare_fixture(&envelope, &mut Cursor::new(bytes))
        .unwrap();
    let release = install.state().unwrap().pending.unwrap();
    let guard = install.verify_release(&release).unwrap();
    #[cfg(windows)]
    assert!(fs::write(root.path().join("versions/0.1.0/Ameow.exe"), b"tampered").is_err());
    drop(guard);
    fs::write(root.path().join("versions/0.1.0/Ameow.exe"), b"tampered").unwrap();
    assert!(install.verify_release(&release).is_err());
}
#[test]
fn interrupted_or_truncated_download_never_becomes_switchable_and_can_retry_exact_manifest() {
    struct Broken;
    impl Read for Broken {
        fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
            Err(io::Error::new(
                io::ErrorKind::ConnectionReset,
                "disconnected fixture",
            ))
        }
    }
    let root = tempfile::tempdir().unwrap();
    let install = Install::fixture(root.path().into()).unwrap();
    let (_, bytes, envelope) = fixture("0.1.0", 1, &[("Ameow.exe", b"exe")]);
    for reader in [
        &mut Broken as &mut dyn Read,
        &mut Cursor::new(&bytes[..bytes.len() / 2]) as &mut dyn Read,
    ] {
        assert!(
            install
                .prepare_fixture(&envelope, &mut reader.take(10000))
                .is_err()
        );
        assert!(install.state().unwrap().pending.is_none());
        assert_eq!(
            fs::read_dir(root.path().join("staging")).unwrap().count(),
            0
        );
    }
    install
        .prepare_fixture(&envelope, &mut Cursor::new(bytes))
        .unwrap();
    assert!(install.state().unwrap().pending.is_some());
}
#[test]
fn zip_traversal_extra_members_and_signed_wrong_exe_digest_are_rejected() {
    for members in [
        vec![("../Ameow.exe", &b"exe"[..])],
        vec![("Ameow.exe", &b"exe"[..]), ("extra.dll", &b"extra"[..])],
    ] {
        let root = tempfile::tempdir().unwrap();
        let install = Install::fixture(root.path().into()).unwrap();
        let (_, bytes, envelope) = fixture("0.1.0", 1, &members);
        assert!(
            install
                .prepare_fixture(&envelope, &mut Cursor::new(bytes))
                .is_err()
        );
        assert!(install.state().unwrap().pending.is_none());
    }
    let root = tempfile::tempdir().unwrap();
    let install = Install::fixture(root.path().into()).unwrap();
    let (mut m, bytes, _) = fixture("0.1.0", 1, &[("Ameow.exe", b"exe")]);
    m.exe_sha256 = "0".repeat(64);
    assert!(
        install
            .prepare_fixture(&fixture_envelope(&m), &mut Cursor::new(bytes))
            .is_err()
    );
}
#[test]
fn replay_downgrade_conflicting_sequence_and_failed_trial_do_not_replace_current() {
    let root = tempfile::tempdir().unwrap();
    let install = Install::fixture(root.path().into()).unwrap();
    prepare(&install, "0.1.0", 1);
    let mut state = install.state().unwrap();
    state.current = state.pending.take();
    install.save(&state).unwrap();
    let (_, bytes, envelope) = fixture("0.1.0", 2, &[("Ameow.exe", b"exe")]);
    assert!(
        install
            .prepare_fixture(&envelope, &mut Cursor::new(bytes))
            .unwrap_err()
            .contains("DOWNGRADE")
    );
    prepare(&install, "0.2.0", 3);
    for (version, seq) in [("0.1.1", 2), ("0.3.0", 3)] {
        let (_, bytes, envelope) = fixture(version, seq, &[("Ameow.exe", b"exe")]);
        assert!(
            install
                .prepare_fixture(&envelope, &mut Cursor::new(bytes))
                .unwrap_err()
                .contains("REPLAY")
        );
    }
    let mut state = install.state().unwrap();
    let release = state.pending.take().unwrap();
    state.failed.push(release.manifest_hash);
    install.save(&state).unwrap();
    let (_, bytes, envelope) =
        fixture("0.2.0", 3, &[("Ameow.exe", b"verified fixture executable")]);
    assert!(
        install
            .prepare_fixture(&envelope, &mut Cursor::new(bytes))
            .is_err()
    );
    assert_eq!(install.state().unwrap().current.unwrap().version, "0.1.0");
    assert_eq!(
        fs::read(root.path().join("versions/0.1.0/Ameow.exe")).unwrap(),
        b"verified fixture executable"
    );
}
#[test]
fn program_switch_does_not_touch_settings_cache_outputs_or_old_identity() {
    let root = tempfile::tempdir().unwrap();
    for name in [
        "Ameow/ui-settings.json",
        "Ameow/cache/tool.exe",
        "output/movie.mkv",
        "AmeowNext/stage-a/old.json",
    ] {
        let path = root.path().join(name);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, b"sentinel").unwrap();
    }
    let install = Install::fixture(root.path().join("Programs/Ameow")).unwrap();
    prepare(&install, "0.1.0", 1);
    prepare(&install, "0.1.1", 2);
    for name in [
        "Ameow/ui-settings.json",
        "Ameow/cache/tool.exe",
        "output/movie.mkv",
        "AmeowNext/stage-a/old.json",
    ] {
        assert_eq!(fs::read(root.path().join(name)).unwrap(), b"sentinel");
    }
    let exe = install.root.join("versions/0.1.1/Ameow.exe");
    assert!(startup_entry_for(&exe).is_err());
    fs::write(install.root.join("AmeowLauncher.exe"), b"launcher").unwrap();
    assert_eq!(
        startup_entry_for(&exe).unwrap(),
        install.root.join("AmeowLauncher.exe")
    );
}
#[test]
fn identity_uses_new_data_root_without_inspecting_the_old_tree() {
    let expected =
        std::path::PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap()).join("Ameow");
    assert_eq!(
        crate::download::runtime::RuntimeManager::default_root().unwrap(),
        expected
    );
}

fn installed_files(install: &Install, version: &str, sequence: u64) {
    let (_, _, envelope) = fixture(version, sequence, &[("Ameow.exe", b"installed fixture")]);
    let dir = install.root.join("versions").join(version);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("Ameow.exe"), b"installed fixture").unwrap();
    fs::write(dir.join("manifest.json"), envelope).unwrap();
}

// Separate temporary directories still share the Windows production instance mutex.
static INSTALLER_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[test]
fn old_signed_installers_register_and_reinstall_without_a_time_limit() {
    let _installer_test = INSTALLER_TEST_LOCK.lock().unwrap();
    for days in [8, 30, 365 * 5] {
        let root = tempfile::tempdir().unwrap();
        let install = Install::fixture(root.path().into()).unwrap();
        let (_, _, envelope) = fixture_issued(
            "0.5.0", 1, &[("Ameow.exe", b"installed fixture")],
            store::now() - days * 86400,
        );
        let dir = root.path().join("versions/0.5.0");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("Ameow.exe"), b"installed fixture").unwrap();
        fs::write(dir.join("manifest.json"), envelope).unwrap();
        install.register_installed_version("0.5.0").unwrap();
        let state = install.state().unwrap();
        assert!(state.current.is_none() && state.trial.is_none());
        assert_eq!(state.pending.as_ref().unwrap().version, "0.5.0");
        install.verify_release(state.pending.as_ref().unwrap()).unwrap();
        let before = fs::read(root.path().join("state.json")).unwrap();
        install.register_installed_version("0.5.0").unwrap();
        assert_eq!(fs::read(root.path().join("state.json")).unwrap(), before);
        let mut state = install.state().unwrap();
        state.current = state.pending.take();
        install.save(&state).unwrap();
        let before = fs::read(root.path().join("state.json")).unwrap();
        install.register_installed_version("0.5.0").unwrap();
        assert_eq!(fs::read(root.path().join("state.json")).unwrap(), before);
    }
}

#[test]
fn installer_reinstall_preserves_state_and_upgrade_uses_pending_trial() {
    let _installer_test = INSTALLER_TEST_LOCK.lock().unwrap();
    let root = tempfile::tempdir().unwrap();
    let install = Install::fixture(root.path().into()).unwrap();
    installed_files(&install, "0.1.0", 1);
    install.register_installed_version("0.1.0").unwrap();
    let mut state = install.state().unwrap();
    state.current = state.pending.take();
    state.last_error = Some("preserve diagnostic".into());
    install.save(&state).unwrap();
    let before = fs::read(root.path().join("state.json")).unwrap();
    install.register_installed_version("0.1.0").unwrap();
    assert_eq!(fs::read(root.path().join("state.json")).unwrap(), before);
    installed_files(&install, "0.1.1", 2);
    install.register_installed_version("0.1.1").unwrap();
    let state = install.state().unwrap();
    assert_eq!(state.current.unwrap().version, "0.1.0");
    assert_eq!(state.pending.unwrap().version, "0.1.1");
    assert!(state.trial.is_none());
    assert_eq!(state.last_error.as_deref(), Some("preserve diagnostic"));
    assert!(root.path().join("versions/0.1.0/Ameow.exe").is_file());
}

#[test]
fn installer_rejects_tampering_running_launcher_and_downgrade_without_resetting_state() {
    let _installer_test = INSTALLER_TEST_LOCK.lock().unwrap();
    let root = tempfile::tempdir().unwrap();
    let install = Install::fixture(root.path().into()).unwrap();
    installed_files(&install, "0.1.1", 2);
    install.register_installed_version("0.1.1").unwrap();
    let mut state = install.state().unwrap();
    state.current = state.pending.take();
    install.save(&state).unwrap();
    let before = fs::read(root.path().join("state.json")).unwrap();
    installed_files(&install, "0.1.0", 1);
    assert!(install.register_installed_version("0.1.0").unwrap_err().contains("DOWNGRADE"));
    installed_files(&install, "0.1.2", 3);
    fs::write(root.path().join("versions/0.1.2/Ameow.exe"), b"tampered").unwrap();
    assert!(install.register_installed_version("0.1.2").unwrap_err().contains("HASH"));
    let running = store::exclusive(&root.path().join("running.lock")).unwrap();
    assert!(install.register_installed_version("0.1.1").unwrap_err().contains("LOCK"));
    drop(running);
    assert_eq!(fs::read(root.path().join("state.json")).unwrap(), before);
}
#[cfg(windows)]
#[test]
fn native_state_lock_excludes_writers() {
    let root = tempfile::tempdir().unwrap();
    let install = Install::fixture(root.path().into()).unwrap();
    let lock = install.lock().unwrap();
    assert!(install.state().is_err());
    drop(lock);
    assert!(install.state().is_ok());
}
