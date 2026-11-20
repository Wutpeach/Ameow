#[test]
fn retired_bridge_fails_before_launch_session_or_window_initialization() {
    let isolated = tempfile::tempdir().unwrap();
    for arguments in [
        vec!["--download-test-bridge"],
        vec!["--preview", "--download-test-bridge"],
        vec!["--gallery", "--download-test-bridge"],
    ] {
        let output = std::process::Command::new(env!("CARGO_BIN_EXE_ameow"))
            .args(arguments)
            .env("AMEOW_LAUNCH_SESSION", isolated.path().join("missing-session"))
            .output()
            .unwrap();
        assert_eq!(output.status.code(), Some(2));
        let error = String::from_utf8(output.stderr).unwrap();
        assert!(error.contains("--download-test-bridge"));
        assert!(error.contains("--features dev-tools --bin ameow-cli -- dev run --root"));
        assert!(!error.contains("Ameow Launcher session"));
        assert!(output.stdout.is_empty());
        assert_eq!(std::fs::read_dir(isolated.path()).unwrap().count(), 0);
    }
}
