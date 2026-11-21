//! Process-level evidence: the dev owner has no desktop/attach lifetime.
use serde_json::Value;
use std::process::Command;
#[cfg(feature = "dev-tools")]
use std::{fs, path::Path};

#[cfg(feature = "dev-tools")]
fn invoke(root: &Path, arguments: &[&str]) -> (i32, Value) {
    let output = Command::new(env!("CARGO_BIN_EXE_ameow-cli"))
        .args(["--json", "dev"])
        .args(arguments)
        .arg("--root")
        .arg(root)
        .output()
        .unwrap();
    let text = String::from_utf8(output.stdout).unwrap();
    assert_eq!(text.lines().count(), 1, "stdout contains logs: {text}");
    let result: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(result["exit_code"], output.status.code().unwrap());
    let saved: Value =
        serde_json::from_slice(&fs::read(root.join("evidence/result.json")).unwrap()).unwrap();
    assert_eq!(result, saved);
    (output.status.code().unwrap(), result)
}

#[cfg(feature = "dev-tools")]
#[test]
fn finite_processes_report_retry_cancel_held_and_timeout_without_claiming_gui() {
    let parent = tempfile::tempdir().unwrap();
    for (case, code) in [
        ("success", 0),
        ("retry", 0),
        ("cancel", 5),
        ("stop", 5),
        ("held", 6),
        ("timeout", 6),
    ] {
        let root = parent.path().join(case);
        let (actual, result) = invoke(&root, &["scenario", "--case", case]);
        assert_eq!(actual, code, "{result}");
        assert_eq!(result["identity"]["mode"], "synthetic-adapter-core");
        assert_eq!(result["identity"]["gui"], false);
        assert_eq!(result["owner_settled"], case != "held");
        if case == "timeout" {
            assert_eq!(result["error"]["code"], "E_RUN_TIMEOUT");
            assert_eq!(result["state"]["stopped"], true);
        }
        if case == "held" {
            assert_eq!(result["state"]["stopped"], false);
            assert_eq!(result["state"]["active_slots"], 1);
            assert_eq!(result["state"]["tasks"][0]["phase"], "Held");
            let events = fs::read_to_string(root.join("evidence/events.jsonl")).unwrap();
            assert!(events.lines().any(
                |l| serde_json::from_str::<Value>(l).unwrap()["event"] == "cleanup_unconfirmed"
            ));
            assert!(events.lines().any(|l| {
                let e: Value = serde_json::from_str(l).unwrap();
                e["event"] == "cancel" && e["value"]["result"]["applied"] == true
            }));
        }
        // Ordinary control cannot attach to a finite dev owner, even with the same root.
        let ordinary = Command::new(env!("CARGO_BIN_EXE_ameow-cli"))
            .args(["--json", "--no-start", "--instance-root"])
            .arg(&root)
            .arg("list")
            .output()
            .unwrap();
        assert_eq!(ordinary.status.code(), Some(7));
    }
}

#[cfg(not(feature = "dev-tools"))]
#[test]
fn ordinary_build_cannot_start_dev_owner() {
    let parent = tempfile::tempdir().unwrap();
    let root = parent.path().join("unused");
    let output = Command::new(env!("CARGO_BIN_EXE_ameow-cli"))
        .args(["--json", "dev", "scenario", "--case", "success", "--root"])
        .arg(&root)
        .output()
        .unwrap();
    let result: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert!(!output.status.success());
    assert_eq!(result["error"]["code"], "E_DEV_DISABLED");
    assert!(!root.exists());
}
