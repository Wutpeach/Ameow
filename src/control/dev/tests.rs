use super::*;

#[test]
fn gallery_same_id_retry_waits_for_new_attempt_after_failure_or_partial() {
    let parent = tempfile::tempdir().unwrap();
    for (case, prior_phase) in [
        ("gallery-failure", "Failure"),
        ("gallery-partial", "Partial"),
    ] {
        let root = parent.path().join(case);
        let mut options = parse(vec![
            "scenario".into(),
            "--case".into(),
            "retry".into(),
            "--root".into(),
            root.to_str().unwrap().into(),
        ])
        .unwrap();
        options.scenario = Some(case.into());
        options.urls = vec!["https://imgur.com/a/ABCDE".into()];
        let result = execute(options).unwrap();
        assert_eq!(result["exit_code"], 0, "{result}");
        assert_eq!(result["owner_settled"], true);
        let tasks = result["state"]["tasks"].as_array().unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0]["phase"], "Success");
        assert_eq!(tasks[0]["attempt"], 2);
        assert_eq!(result["files"].as_array().unwrap().len(), 2);
        assert!(
            result["files"]
                .as_array()
                .unwrap()
                .iter()
                .all(|f| f["verified_on_disk"] == true)
        );
        let events: Vec<Value> = fs::read_to_string(root.join("evidence/events.jsonl"))
            .unwrap()
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        assert!(
            events
                .iter()
                .any(|e| e["event"] == "state" && e["value"]["tasks"][0]["phase"] == prior_phase)
        );
        let retry = events.iter().find(|e| e["event"] == "retry").unwrap();
        assert_eq!(
            retry["value"]["task_id"],
            retry["value"]["result"]["previous_task_id"]
        );
    }
}

#[test]
fn rejects_ambiguous_or_unbounded_arguments_before_creating_data() {
    for args in [
        vec!["run", "--root", "x"],
        vec!["run", "--root", "x", "--url", "http://127.0.0.1/private"],
        vec![
            "run",
            "--root",
            "x",
            "--url",
            "https://example.com/other",
            "--fixture-media-port",
            "1234",
        ],
        vec![
            "run",
            "--root",
            "x",
            "--url",
            "https://example.com/a",
            "--timeout",
            "0",
        ],
        vec![
            "run",
            "--root",
            "x",
            "--url",
            "https://example.com/a",
            "--cancel-job",
            "2",
        ],
        vec![
            "scenario",
            "--root",
            "x",
            "--case",
            "cancel",
            "--retry-failed",
        ],
        vec![
            "scenario", "--root", "x", "--case", "success", "--case", "stop",
        ],
    ] {
        assert!(parse(args.into_iter().map(str::to_owned).collect()).is_err());
    }
    let production = runtime::RuntimeManager::default_root().unwrap();
    assert_eq!(
        prepare_root(&production).unwrap_err().code,
        "E_INSTANCE_ROOT"
    );
}

#[test]
fn offline_scenarios_preserve_causal_identity_files_and_exit() {
    let parent = tempfile::tempdir().unwrap();
    for (case, expected, phase) in [
        ("success", 0, "Success"),
        ("retry", 0, "Success"),
        ("cancel", 5, "Cancelled"),
        ("stop", 5, "Cancelled"),
    ] {
        let root = parent.path().join(case);
        let options = parse(vec![
            "scenario".into(),
            "--root".into(),
            root.to_str().unwrap().into(),
            "--case".into(),
            case.into(),
        ])
        .unwrap();
        let result = execute(options).unwrap();
        assert_eq!(result["exit_code"], expected, "{result}");
        assert_eq!(result["owner_settled"], true, "{result}");
        assert_eq!(result["state"]["active_slots"], 0);
        let tasks = result["state"]["tasks"].as_array().unwrap();
        assert_eq!(tasks.last().unwrap()["phase"], phase);
        for task in tasks {
            assert_eq!(task["resources_released"], true);
            assert!(task["request_id"].as_str().is_some());
        }
        let events = fs::read_to_string(root.join("evidence/events.jsonl")).unwrap();
        let events: Vec<Value> = events
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert!(
            events
                .iter()
                .all(|e| e["instance_id"] == result["identity"]["instance_id"])
        );
        if expected == 0 {
            assert_eq!(result["files"][0]["verified_on_disk"], true);
        }
        if case == "retry" {
            assert_eq!(tasks.len(), 2);
            assert_eq!(tasks[0]["phase"], "Failure");
            assert!(events.iter().any(|e| e["event"] == "retry"
                && e["value"]["result"]["previous_task_id"] == tasks[0]["task_id"]));
        }
        assert_eq!(prepare_root(&root).unwrap_err().code, "E_DEV_ROOT_USED");
        let shareable = serde_json::to_string(&result).unwrap();
        assert!(!shareable.contains(root.to_str().unwrap()));
        assert!(!shareable.contains("https://example.invalid"));
    }
}

#[test]
fn held_is_never_cancelled_or_settled_and_log_is_bounded() {
    let parent = tempfile::tempdir().unwrap();
    let options = parse(vec![
        "scenario".into(),
        "--root".into(),
        parent.path().join("held").to_str().unwrap().into(),
        "--case".into(),
        "success".into(),
    ])
    .unwrap();
    let root = prepare_root(&options.root).unwrap();
    let mut evidence = Evidence::new(root.clone(), &options).unwrap();
    let backend = DownloadCoordinator::new(
        fixture::services(root.join("runtime"), "cancel"),
        root.join("settings.json"),
        Settings {
            quality: Quality::Balanced,
            output_dir: root.join("output"),
            theme: Default::default(),
            language: Default::default(),
            tray_icon: Default::default(),
        },
    )
    .unwrap();
    let id = backend.submit(options.urls[0].clone()).unwrap();
    let until = Instant::now() + Duration::from_secs(5);
    while backend.snapshot().jobs.is_empty() && Instant::now() < until {
        thread::sleep(Duration::from_millis(10));
    }
    // Projection contract only: native Held ownership remains covered by the native supervisor tests.
    let mut held = backend.snapshot();
    held.stopped = false;
    held.active_slots = 1;
    held.jobs[0].phase = JobPhase::Held;
    held.jobs[0].resources_released = false;
    held.jobs[0].slot_owned = true;
    assert_eq!(unsettled(&held), Some("E_CLEANUP_UNCONFIRMED"));
    assert_eq!(outcome(&held, &[id]), 6);
    for _ in 0..2050 {
        evidence.event("state", json!({})).unwrap();
    }
    let report = evidence
        .finish(&held, 6, Some("E_CLEANUP_UNCONFIRMED"))
        .unwrap();
    assert_eq!(report["owner_settled"], false);
    assert_eq!(report["state"]["tasks"][0]["phase"], "Held");
    assert_eq!(report["events_truncated"], true);
    assert_eq!(
        fs::read_to_string(root.join("evidence/events.jsonl"))
            .unwrap()
            .lines()
            .count(),
        2048
    );
    backend.stop();
    while !backend.snapshot().stopped && Instant::now() < until {
        thread::sleep(Duration::from_millis(10));
    }
    assert!(backend.snapshot().stopped);
}
