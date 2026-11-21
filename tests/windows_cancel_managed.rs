#![cfg(all(windows, debug_assertions, feature = "cancel-fixture"))]

use ameow_next::download::{
    cancel_fixture::{self, OTHER_URL, TARGET_URL},
    queue::{DownloadCoordinator, JobPhase, QueueSnapshot},
    request::Quality,
    settings::Settings,
};
use serde_json::{Value, json};
use std::{collections::HashSet, fs, path::{Path, PathBuf}, thread, time::{Duration, Instant}};

fn wait<T>(label: &str, timeout: Duration, mut probe: impl FnMut() -> Option<T>) -> Result<T, String> {
    let until = Instant::now() + timeout;
    loop {
        if let Some(value) = probe() { return Ok(value); }
        if Instant::now() >= until { return Err(format!("Timed out: {label}")); }
        thread::sleep(Duration::from_millis(10));
    }
}
fn lines(path: &Path) -> Vec<Value> {
    fs::read_to_string(path).unwrap_or_default().lines()
        .filter_map(|line| serde_json::from_str(line).ok()).collect()
}
fn event_count(path: &Path, kind: &str, needle: &str) -> usize {
    lines(path).iter().filter(|v| v["event"] == kind && v["path"].as_str().is_some_and(|s| s.contains(needle))).count()
}
fn find_new_log(dir: &Path, prefix: &str, existing: &HashSet<PathBuf>) -> Option<PathBuf> {
    fs::read_dir(dir).ok()?.filter_map(Result::ok).map(|entry| entry.path())
        .find(|path| !existing.contains(path) && path.file_name().and_then(|x| x.to_str()).is_some_and(|x| x.starts_with(prefix)))
}
fn snapshot(queue: &DownloadCoordinator, job: u64) -> Value {
    let view = queue.snapshot();
    let item = view.jobs.iter().find(|item| item.job_id == job).unwrap();
    json!({"revision":view.revision, "active_slots":view.active_slots, "job":item})
}
fn job(view: &QueueSnapshot, id: u64) -> &ameow_next::download::queue::JobSnapshot {
    view.jobs.iter().find(|item| item.job_id == id).unwrap()
}

#[test]
#[ignore = "requires the task-owned recommended runtime and the bounded localhost HLS server"]
fn real_managed_transfer_cancellation_through_queue() -> Result<(), String> {
    let root = PathBuf::from(std::env::var("AMEOW_FIXTURE_INSTANCE").map_err(|e| e.to_string())?);
    let origin = std::env::var("AMEOW_FIXTURE_ORIGIN").map_err(|e| e.to_string())?;
    let mode = std::env::var("AMEOW_FIXTURE_MODE").map_err(|e| e.to_string())?;
    let http_log = PathBuf::from(std::env::var("AMEOW_FIXTURE_HTTP_LOG").map_err(|e| e.to_string())?);
    let report_path = PathBuf::from(std::env::var("AMEOW_FIXTURE_REPORT").map_err(|e| e.to_string())?);
    let evidence = root.join("cancel-fixture-evidence");
    let existing: HashSet<PathBuf> = fs::read_dir(&evidence).ok().into_iter().flatten()
        .filter_map(Result::ok).map(|e| e.path()).collect();
    assert!(cancel_fixture::services(root.join("runtime"), "http://example.com:1234", &mode).is_err());
    let services = cancel_fixture::services(root.join("runtime"), &origin, &mode)?;
    let queue = DownloadCoordinator::new(services, root.join("settings.json"), Settings {
        quality: Quality::Balanced, output_dir: root.join("output"), theme: Default::default(),
        language: Default::default(), tray_icon: Default::default(), shortcut: Default::default(),
    })?;
    let target = queue.submit(TARGET_URL.into())?;
    let other = queue.submit(OTHER_URL.into())?;
    let prefix = format!("{mode}-target-");
    let target_log = wait("target evidence", Duration::from_secs(60), || find_new_log(&evidence, &prefix, &existing))?;
    let start = wait("target execution identity", Duration::from_secs(20), || lines(&target_log).into_iter().find(|v| v["event"] == "start"))?;
    let workspace = PathBuf::from(start["workspace"].as_str().ok_or("Missing owned workspace")?);
    let target_path = format!("/{mode}/target/");
    let other_path = format!("/{mode}/other/");
    let ready = wait("two live transfers and cancellation trigger", Duration::from_secs(60), || {
        let view = queue.snapshot();
        let target_ready = if mode == "retry" { event_count(&http_log, "injected_503", &target_path) >= 2 }
            else { event_count(&http_log, "request", &format!("{target_path}segment-")) >= 3 };
        (target_ready && event_count(&http_log, "request", &format!("{other_path}segment-")) >= 1
            && job(&view, target).phase == JobPhase::Downloading && job(&view, other).phase == JobPhase::Downloading
            && view.active_slots == 2).then_some(view)
    })?;
    assert!(job(&ready, target).slot_owned && job(&ready, other).slot_owned);
    let other_requests_before = event_count(&http_log, "request", &other_path);
    let cancel_at = Instant::now();
    assert!(queue.cancel(target), "queue refused the in-flight cancel");
    let immediate = queue.snapshot();
    assert!(job(&immediate, target).cancellation_requested);
    assert!(!job(&immediate, target).phase.terminal());
    assert!(job(&immediate, target).slot_owned && !job(&immediate, target).resources_released);
    assert!(!job(&immediate, other).cancellation_requested && job(&immediate, other).slot_owned);
    let accepted = snapshot(&queue, target);
    let settled = wait("native supervisor settlement", Duration::from_secs(10), || {
        let view = queue.snapshot();
        let item = job(&view, target);
        assert!(item.cancellation_requested, "accepted cancellation disappeared");
        assert!(!item.phase.terminal(), "terminal preceded process settlement");
        lines(&target_log).into_iter().find(|v| v["event"] == "settled")
    })?;
    assert_eq!(settled["resources_releasable"], true);
    assert_eq!(settled["root_waited"], true);
    assert_eq!(settled["job_active_zero"], true);
    assert_eq!(settled["stdout_reader_joined"], true);
    assert_eq!(settled["stderr_reader_joined"], true);
    assert_eq!(settled["callback_consumer_joined"], true);
    assert_eq!(settled["membership_verified_before_resume"], true);
    if mode == "ffmpeg" { assert!(settled["total_processes"].as_u64().unwrap_or(0) >= 2, "FFmpeg child was not observed"); }
    let waiting = queue.snapshot();
    assert!(job(&waiting, target).cancellation_requested && job(&waiting, target).slot_owned);
    assert!(!job(&waiting, target).resources_released && !job(&waiting, target).phase.terminal());
    let during_owner_pause = snapshot(&queue, target);
    let target_requests_settled = event_count(&http_log, "request", &target_path);
    let terminal = wait("joined cancelled attempt", Duration::from_secs(12), || {
        let view = queue.snapshot();
        let item = job(&view, target);
        assert!(item.cancellation_requested, "accepted cancellation was lost while waiting for owner");
        item.phase.terminal().then_some(view)
    })?;
    let cancel_to_terminal = cancel_at.elapsed();
    let item = job(&terminal, target);
    assert_eq!(item.phase, JobPhase::Cancelled);
    assert_eq!(item.terminal_count, 1);
    assert!(item.resources_released && !item.slot_owned && item.delivered.is_none());
    let joined = item.events.iter().position(|e| e.kind == "attempt-joined-slot-release").ok_or("Missing joined-owner event")?;
    let logical = item.events.iter().position(|e| e.kind == "logical-terminal").ok_or("Missing terminal event")?;
    assert!(joined < logical);
    assert!(!workspace.exists(), "settled workspace still exists");
    assert_eq!(event_count(&http_log, "request", &target_path), target_requests_settled);
    let finished_target = snapshot(&queue, target);
    let result = wait("native result evidence", Duration::from_secs(2), || lines(&target_log).into_iter().find(|v| v["event"] == "result"))?;
    if mode == "retry" {
        assert!(format!("{} {}", result["stdout"], result["stderr"]).contains("Retrying"), "yt-dlp native retries not established");
    }
    if mode == "ffmpeg" {
        assert!(format!("{} {}", result["stdout"], result["stderr"]).contains("ffmpeg"), "FFmpeg invocation not present in engine evidence");
    }
    let until = Instant::now() + Duration::from_secs(2);
    while Instant::now() < until {
        assert!(!workspace.exists(), "workspace recreated after queue settlement");
        assert_eq!(event_count(&http_log, "request", &target_path), target_requests_settled, "new target request after settlement");
        let view = queue.snapshot();
        assert_eq!(job(&view, target).terminal_count, 1);
        assert!(!job(&view, other).cancellation_requested);
        thread::sleep(Duration::from_millis(20));
    }
    assert!(event_count(&http_log, "request", &other_path) > other_requests_before, "other transfer did not continue after cancellation");
    let completed = wait("independent transfer delivery", Duration::from_secs(35), || {
        let view = queue.snapshot();
        job(&view, other).phase.terminal().then_some(view)
    })?;
    assert_eq!(job(&completed, other).phase, JobPhase::Success, "independent Job did not succeed: {:?}", job(&completed, other));
    assert_eq!(job(&completed, other).terminal_count, 1);
    assert!(job(&completed, other).resources_released && job(&completed, other).delivered.is_some());
    assert_eq!(completed.active_slots, 0);
    assert!(!queue.cancel(target));
    queue.stop();
    let stopped = wait("queue stop", Duration::from_secs(10), || { let view = queue.snapshot(); view.stopped.then_some(view) })?;
    assert_eq!(stopped.active_slots, 0);
    let output = json!({"mode":mode, "cancel_to_terminal_ms":cancel_to_terminal.as_millis(),
        "runtime_versions":ready.verified_runtime_versions, "identity":start, "process_settlement":settled,
        "target_requests_at_settlement":target_requests_settled, "post_terminal_quiet_ms":2000,
        "other_requests_before":other_requests_before, "other_requests_after":event_count(&http_log, "request", &other_path),
        "accepted":accepted, "during_owner_pause":during_owner_pause, "terminal":finished_target,
        "other_final":job(&completed, other), "stopped":stopped.stopped, "target_log":target_log});
    fs::write(report_path, serde_json::to_vec_pretty(&output).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(())
}
