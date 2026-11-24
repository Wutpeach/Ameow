use super::*;
use std::io::Cursor;

fn prepared() -> (tempfile::TempDir, Install, Release) {
    let root = tempfile::tempdir().unwrap();
    let install = Install::fixture(root.path().join("install")).unwrap();
    let (_, bytes, signed) = super::super::package::fixture_windows_package(
        "0.5.2", 1, now(), &[("Ameow.exe", b"isolated app")]);
    install.prepare_fixture(&signed, &mut Cursor::new(bytes)).unwrap();
    let release = install.state().unwrap().pending.unwrap();
    (root, install, release)
}

#[test]
fn component_launch_keeps_the_verified_handle_and_all_member_checks() {
    let (_root, install, release) = prepared();
    let target = install.release_dir(&release.version).unwrap().join("ameow-browser-host.exe");
    let (selected, app, component) = install.component_launch("ameow-browser-host.exe").unwrap();
    assert_eq!(selected.manifest_hash, release.manifest_hash);
    assert!(fs::write(&target, b"replacement").is_err());
    assert!(fs::remove_file(&target).is_err());
    drop((app, component));
    let other = install.release_dir(&release.version).unwrap().join("browser-extension/page.js");
    fs::write(&other, b"tampered unrelated member").unwrap();
    assert!(install.component_launch("ameow-browser-host.exe").is_err());
}

#[test]
fn component_launch_rejects_target_tamper_and_failed_bootstrap() {
    let (_root, install, release) = prepared();
    let mut state = install.state().unwrap();
    state.failed.push(release.manifest_hash.clone());
    install.save(&state).unwrap();
    assert!(matches!(install.component_launch("ameow-browser-host.exe"), Err(code) if code == "E_APP_UPDATE_FAILED_TRIAL"));
    state.failed.clear(); install.save(&state).unwrap();
    let target = install.release_dir(&release.version).unwrap().join("ameow-browser-host.exe");
    fs::write(target, b"tampered host").unwrap();
    assert!(matches!(install.component_launch("ameow-browser-host.exe"), Err(code) if code == "E_APP_UPDATE_EXECUTABLE_HASH"));
}

#[test]
#[ignore = "requires an explicitly supplied owned signed fixture directory"]
fn component_phase_probe() {
    let root = std::env::var_os("AMEOW_POPUP_PROBE_INSTALL").expect("owned fixture path required");
    let install = Install::fixture(root.into()).unwrap();
    let start = std::time::Instant::now();
    let (release, app) = install.component_release().unwrap();
    let release_ms = start.elapsed().as_secs_f64() * 1000.;
    let start = std::time::Instant::now();
    let component = install.verify_component(&release, "ameow-browser-host.exe").unwrap();
    let repeated_ms = start.elapsed().as_secs_f64() * 1000.;
    drop((app, component));
    let start = std::time::Instant::now();
    let (_, app, component) = install.component_launch("ameow-browser-host.exe").unwrap();
    println!("COMPONENT_PHASE_PROBE={}", serde_json::json!({"selection_and_full_verify_ms":release_ms,
        "repeated_component_verify_ms":repeated_ms,"single_pass_verify_ms":start.elapsed().as_secs_f64()*1000.}));
    drop((app, component));
}
