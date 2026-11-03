//! Bounded, opt-in no-network snapshots for native production UI review.
//! Never constructs the coordinator, runtime, preparation, settings store or tray.
use crate::download_ui::UiReply;
use ameow_next::download::{
    diagnostics::{Failure, FailureCode},
    progress::{TransferPhase, TransferProgress, now_ms},
    queue::{CommandReply, JobPhase, JobSnapshot, QueueCommand, QueueSnapshot},
    request::{Accepted, DownloadIntent, Object, Quality},
    settings::Settings,
};
use serde::Deserialize;
use std::{
    fs::File,
    io::{Read, Write},
    path::PathBuf,
    sync::{Arc, Mutex, mpsc},
    time::{Duration, Instant},
};

#[derive(Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct Control {
    step: u64,
    event: String,
    retry_accept: Option<bool>,
    command_accept: Option<bool>,
}

pub fn job(id: u64, phase: JobPhase, ticket: Option<u64>, fraction: Option<f32>) -> JobSnapshot {
    let terminal = phase.terminal();
    JobSnapshot {
        job_id: id,
        revision: 1,
        attempt: u32::from(ticket.is_some()),
        phase: phase.clone(),
        accepted: Accepted {
            intent: DownloadIntent {
                url: String::new(),
                quality: Quality::Balanced,
                output_dir: PathBuf::new(),
            },
            object: Object::Youtube(format!("{id:011}")),
        },
        identity: None,
        title: format!(
            "{} · 完整视频标题：海边的傍晚与城市散步，原声记录",
            char::from(b'A' + (id.saturating_sub(1) % 26) as u8)
        ),
        message: String::new(),
        failure: (phase == JobPhase::Failure).then(|| Failure::new(FailureCode::Media, "verify")),
        transfer_progress: (phase == JobPhase::Downloading).then_some(TransferProgress {
            downloaded_bytes: fraction.map_or(42, |fraction| (fraction * 100.) as u64),
            exact_total_bytes: fraction.map(|_| 100),
            bytes_per_second: Some(1_250_000.),
            fraction,
            observed_at_ms: now_ms(),
            merging: false,
            ..Default::default()
        }),
        delivered: None,
        slot_owned: !terminal && ticket.is_some(),
        resources_released: terminal,
        start_order: ticket,
        terminal_count: u32::from(terminal),
        events: Vec::new(),
    }
}
pub fn snapshot(jobs: Vec<JobSnapshot>) -> QueueSnapshot {
    QueueSnapshot {
        revision: 1,
        unfinished: jobs.iter().filter(|j| !j.phase.terminal()).count(),
        failures: jobs.iter().filter(|j| j.phase == JobPhase::Failure).count(),
        active_slots: jobs.iter().filter(|j| j.slot_owned).count(),
        main_job: jobs
            .iter()
            .filter(|j| j.slot_owned)
            .min_by_key(|j| j.start_order)
            .map(|j| j.job_id),
        jobs,
        settings: Settings {
            quality: Quality::Balanced,
            output_dir: PathBuf::new(), theme: Default::default(), language: Default::default(),
        },
        preparing: false,
        preparation_held: false,
        preparation_owner_lost: false,
        verified_runtime_versions: Vec::new(),
            runtime_update: Default::default(),
        preparation_retry_allowed: false,
        stopping: false,
        stopped: false,
        preparation: Default::default(),
    }
}
pub fn fifo() -> QueueSnapshot {
    snapshot(vec![
        job(1, JobPhase::Downloading, Some(1), Some(0.34)),
        job(2, JobPhase::Downloading, Some(2), None),
        job(3, JobPhase::Downloading, Some(3), Some(0.72)),
        job(4, JobPhase::Queued, None, None),
    ])
}
fn set_phase(s: &mut QueueSnapshot, id: u64, phase: JobPhase) {
    if let Some(j) = s.jobs.iter_mut().find(|j| j.job_id == id) {
        j.phase = phase.clone();
        j.revision += 1;
        if phase.terminal() {
            j.slot_owned = false;
            j.resources_released = true;
            j.terminal_count = 1;
            j.transfer_progress = None;
            j.failure =
                (phase == JobPhase::Failure).then(|| Failure::new(FailureCode::Media, "verify"));
        } else if phase != JobPhase::Downloading {
            j.transfer_progress = None;
        }
    }
}
pub fn start(
    path: Option<PathBuf>,
    scenes: mpsc::Receiver<&'static str>,
    commands: mpsc::Receiver<QueueCommand>,
    evidence: mpsc::Receiver<serde_json::Value>,
    replies: mpsc::Sender<UiReply>,
    latest: Arc<Mutex<Option<Arc<QueueSnapshot>>>>,
) {
    std::thread::Builder::new().name("gpui-no-network-fixture".into()).spawn(move || {
        let args: Vec<_> = std::env::args().collect();
        let mut log = args.windows(2).find(|p| p[0] == "--queue-evidence").and_then(|p| File::create(&p[1]).ok());
        let started = Instant::now();
        let mut s = if path.is_some() { fifo() } else { preview_scene("8") };
        let mut last_step = None;
        let mut retry_accept = path.is_none();
        let mut command_accept = true;
        while path.is_none() || started.elapsed() < Duration::from_secs(120) {
            for scene in scenes.try_iter() {
                let revision = s.revision;
                s = preview_scene(scene);
                s.revision = revision;
            }
            let mut bytes = Vec::new();
            let control = path.as_ref().and_then(|path| File::open(path).ok()).and_then(|f| f.take(8193).read_to_end(&mut bytes).ok())
                .filter(|_| bytes.len() <= 8192).and_then(|_| serde_json::from_slice::<Control>(&bytes).ok());
            if let Some(control) = control && last_step != Some(control.step) {
                last_step = Some(control.step);
                if let Some(accept) = control.retry_accept { retry_accept = accept; }
                if let Some(accept) = control.command_accept { command_accept = accept; }
                let revision = s.revision;
                match control.event.as_str() {
                    "polish" => {
                        let mut short = job(1, JobPhase::Downloading, Some(1), Some(0.46));
                        short.title = "海边".into();
                        s = snapshot(vec![job(5, JobPhase::Failure, Some(5), None), short,
                            job(2, JobPhase::Validating, Some(2), None), job(3, JobPhase::Queued, None, None)]);
                    }
                    "layout" => {
                        s = snapshot(vec![job(5, JobPhase::Failure, Some(5), None),
                            job(1, JobPhase::Downloading, Some(1), Some(0.46)),
                            job(control.step.saturating_add(100), JobPhase::Success, Some(2), None),
                            job(3, JobPhase::Downloading, Some(3), None),
                            job(4, JobPhase::Queued, None, None)]);
                        for j in &mut s.jobs { j.title = layout_title(); }
                        if let Some(p) = s.jobs[3].transfer_progress.as_mut() { p.phase = TransferPhase::Audio; }
                    }
                    "layout-failure" | "layout-download" | "layout-success" | "layout-audio" | "layout-wait" => {
                        let key = match control.event.as_str() {
                            "layout-failure" => "5", "layout-download" => "2",
                            "layout-success" => "4", "layout-audio" => "6", _ => "wait",
                        };
                        s = match key {
                            "wait" => snapshot(vec![job(1, JobPhase::Queued, None, None)]),
                            // Each trigger gets a fresh terminal identity and its own real500ms hold.
                            "4" => snapshot(vec![job(control.step.saturating_add(100), JobPhase::Success, Some(1), None)]),
                            _ => preview_scene(key),
                        };
                        for j in &mut s.jobs { j.title = layout_title(); }
                    }
                    "held" => s = snapshot(vec![job(5, JobPhase::Held, Some(5), None)]),
                    "owner-lost" => {
                        s = snapshot(vec![job(5, JobPhase::Held, None, None)]);
                        s.preparation_owner_lost = true;
                        s.preparation_held = true;
                    }
                    "fifo" => s = fifo(),
                    "progress-a" => {
                        if let Some(j) = s.jobs.iter_mut().find(|j| j.job_id == 1 && j.phase == JobPhase::Downloading)
                            && let Some(p) = &mut j.transfer_progress {
                            p.fraction = Some(0.61);
                            p.downloaded_bytes = 61;
                            p.bytes_per_second = Some(2_500_000.);
                            j.revision += 1;
                        }
                    }
                    "queue" => {
                        s = fifo();
                        s.jobs.extend([job(5, JobPhase::Failure, Some(5), None), job(6, JobPhase::Failure, Some(6), None), job(7, JobPhase::Queued, None, None)]);
                    }
                    "failure" => s = snapshot(vec![job(5, JobPhase::Failure, Some(5), None)]),
                    "finish-c" => {
                        set_phase(&mut s, 3, JobPhase::Success);
                        if let Some(d) = s.jobs.iter_mut().find(|j| j.job_id == 4) { *d = job(4, JobPhase::Downloading, Some(4), Some(0.19)); }
                    }
                    "finish-a" => set_phase(&mut s, 1, JobPhase::Success),
                    "fail-c" => set_phase(&mut s, 3, JobPhase::Failure),
                    "cancel-c" => set_phase(&mut s, 3, JobPhase::Cancelled),
                    "merge-c" => { if let Some(sample) = s.jobs.iter_mut().find(|j| j.job_id == 3).and_then(|j| j.transfer_progress.as_mut()) { sample.merging = true; } }
                    "validate-c" => set_phase(&mut s, 3, JobPhase::Validating),
                    "publish-c" => set_phase(&mut s, 3, JobPhase::Publishing),
                    _ => {}
                }
                s.revision = revision;
                if let Some(log) = &mut log { let _ = writeln!(log, "{}", serde_json::json!({"type":"fixture-control","elapsed_ms":started.elapsed().as_millis(),"step":control.step,"event":control.event,"retry_accept":retry_accept,"command_accept":command_accept})); }
            }
            match commands.recv_timeout(Duration::from_millis(40)) {
                Ok(command) => {
                    let summary = super::download_ui::command_summary(&command);
                    if let Some(log) = &mut log { let _ = writeln!(log, "{summary}"); }
                    let event = match command {
                        QueueCommand::Retry(source) => {
                            let reply = if retry_accept && s.jobs.iter().any(|j| j.job_id == source && j.phase == JobPhase::Failure) {
                                let id = s.jobs.iter().map(|j| j.job_id).max().unwrap_or(0) + 1;
                                s.jobs.push(job(id, JobPhase::Queued, None, None)); CommandReply::Accepted(id)
                            } else { CommandReply::Error("E_FIXTURE_REFUSED: 重试未受理".into()) };
                            UiReply::Retry { source, reply }
                        }
                        QueueCommand::CopyDiagnostic(id) => UiReply::Diagnostic { job: id, text: format!("Ameow safe diagnostic\nJob: {id}\nCode: E_MEDIA\nStage: verify\nSynthetic no-network fixture; no raw URL or private path.\n") },
                        QueueCommand::Cancel(id) => {
                            if command_accept { set_phase(&mut s, id, JobPhase::Cancelled); }
                            UiReply::RowCommand { job: id, cleanup: false, reply: CommandReply::Applied(command_accept) }
                        }
                        QueueCommand::RetryCleanup(id) => {
                            let allowed = command_accept && !s.preparation_owner_lost && s.jobs.iter().any(|j| j.job_id == id && j.phase == JobPhase::Held && j.slot_owned);
                            if allowed { set_phase(&mut s, id, JobPhase::Cancelled); }
                            UiReply::RowCommand { job: id, cleanup: true, reply: CommandReply::Applied(allowed) }
                        }
                        QueueCommand::Stop => { s.stopped = true; UiReply::Reply(CommandReply::Stopping) }
                        _ => UiReply::Reply(CommandReply::Error("E_FIXTURE_ONLY: 此验证仅支持队列操作".into())),
                    };
                    let _ = replies.send(event);
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            for mut event in evidence.try_iter() {
                event["elapsed_ms"] = serde_json::json!(started.elapsed().as_millis());
                if let Some(log) = &mut log { let _ = writeln!(log, "{event}"); }
            }
            for j in &mut s.jobs { if let Some(p) = &mut j.transfer_progress { p.observed_at_ms = now_ms(); } }
            s.revision += 1;
            s.unfinished = s.jobs.iter().filter(|j| !j.phase.terminal()).count();
            s.failures = s.jobs.iter().filter(|j| j.phase == JobPhase::Failure).count();
            s.active_slots = s.jobs.iter().filter(|j| j.slot_owned).count();
            s.main_job = s.jobs.iter().filter(|j| j.slot_owned).min_by_key(|j| j.start_order).map(|j| j.job_id);
            *latest.lock().unwrap_or_else(|e| e.into_inner()) = Some(Arc::new(s.clone()));
            if let Some(log) = &mut log { let _ = log.flush(); }
        }
    }).expect("start bounded no-network fixture");
}
fn layout_title() -> String {
    "同一条完整视频标题：海边的傍晚与城市散步，原声记录与远方灯火".into()
}

/// Synthetic transport shared by the easy preview and bounded control fixture.
fn preview_scene(key: &str) -> QueueSnapshot {
    match key {
        "0" => snapshot(Vec::new()),
        "1" => snapshot(vec![job(1, JobPhase::Resolving, Some(1), None)]),
        "2" => snapshot(vec![job(1, JobPhase::Downloading, Some(1), Some(0.46))]),
        "3" => snapshot(vec![job(1, JobPhase::Downloading, Some(1), None)]),
        "4" => snapshot(vec![job(1, JobPhase::Success, Some(1), None)]),
        "5" => snapshot(vec![job(5, JobPhase::Failure, Some(5), None)]),
        "6" => {
            let mut j = job(1, JobPhase::Downloading, Some(1), None);
            j.transfer_progress.as_mut().unwrap().phase = TransferPhase::Audio;
            snapshot(vec![j])
        }
        "7" | "8" => {
            let mut s = fifo();
            s.jobs.extend([job(5, JobPhase::Failure, Some(5), None), job(6, JobPhase::Queued, None, None), job(7, JobPhase::Queued, None, None)]);
            s.failures = 1;
            s.unfinished = 6;
            s
        }
        "9" => fifo(),
        _ => snapshot(Vec::new()),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn polish_and_safety_controls_publish_no_network_rows_without_rewinding_revision() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("control.json");
        let (_scenes, scene_receiver) = mpsc::sync_channel(1);
        let (commands, receiver) = mpsc::sync_channel(4);
        let (_evidence, evidence_receiver) = mpsc::sync_channel(1);
        let (replies, reply_receiver) = mpsc::channel();
        let latest = Arc::new(Mutex::new(None));
        start(Some(path.clone()), scene_receiver, receiver, evidence_receiver, replies, latest.clone());
        let wait = |predicate: &dyn Fn(&QueueSnapshot) -> bool| {
            let deadline = Instant::now() + Duration::from_secs(3);
            loop {
                if let Some(s) = latest.lock().unwrap().clone() && predicate(&s) { return s; }
                assert!(Instant::now() < deadline, "fixture control did not publish");
                std::thread::sleep(Duration::from_millis(5));
            }
        };
        let old = wait(&|s| s.revision > 12);
        std::fs::write(&path, r#"{"step":1,"event":"polish"}"#).unwrap();
        let polish = wait(&|s| s.jobs.first().is_some_and(|j| j.job_id == 5 && j.phase == JobPhase::Failure));
        assert!(polish.revision > old.revision);
        assert_eq!(polish.jobs[1].title, "海边");
        assert_eq!(polish.jobs[2].phase, JobPhase::Validating);
        assert!(polish.jobs.iter().all(|j| j.accepted.intent.url.is_empty()));
        std::fs::write(&path, r#"{"step":2,"event":"held"}"#).unwrap();
        let held = wait(&|s| s.jobs.len() == 1 && s.jobs[0].phase == JobPhase::Held && s.jobs[0].slot_owned);
        assert!(held.revision > polish.revision);
        commands.send(QueueCommand::RetryCleanup(5)).unwrap();
        assert!(matches!(reply_receiver.recv_timeout(Duration::from_secs(3)), Ok(UiReply::RowCommand { job: 5, cleanup: true, reply: CommandReply::Applied(true) })));
        wait(&|s| s.jobs[0].phase == JobPhase::Cancelled);
        std::fs::write(&path, r#"{"step":3,"event":"owner-lost"}"#).unwrap();
        let lost = wait(&|s| s.preparation_owner_lost);
        assert!(!lost.jobs[0].slot_owned);
        commands.send(QueueCommand::RetryCleanup(0)).unwrap();
        assert!(matches!(reply_receiver.recv_timeout(Duration::from_secs(3)), Ok(UiReply::RowCommand { job: 0, cleanup: true, reply: CommandReply::Applied(false) })));
        for (index, (event, phase)) in [
            ("layout-failure", JobPhase::Failure), ("layout-download", JobPhase::Downloading),
            ("layout-success", JobPhase::Success), ("layout-audio", JobPhase::Downloading),
            ("layout-wait", JobPhase::Queued),
        ].into_iter().enumerate() {
            let old_revision = latest.lock().unwrap().as_ref().unwrap().revision;
            std::fs::write(&path, serde_json::json!({"step":index + 4,"event":event}).to_string()).unwrap();
            let scene = wait(&|s| s.revision > old_revision && s.jobs.len() == 1
                && s.jobs[0].phase == phase && s.jobs[0].title == layout_title()
                && !s.preparation_owner_lost
                && (event != "layout-audio" || s.jobs[0].transfer_progress.as_ref().is_some_and(|p| p.phase == TransferPhase::Audio)));
            assert!(scene.jobs[0].accepted.intent.url.is_empty());
        }
        std::fs::write(&path, r#"{"step":9,"event":"layout"}"#).unwrap();
        let layout = wait(&|s| s.jobs.len() == 5 && s.jobs[0].title == layout_title());
        assert_eq!(layout.jobs.iter().map(|j| j.phase.clone()).collect::<Vec<_>>(),
            [JobPhase::Failure, JobPhase::Downloading, JobPhase::Success, JobPhase::Downloading, JobPhase::Queued]);
        assert!(layout.jobs.iter().all(|j| j.title == layout_title()));
        assert_eq!(layout.jobs[3].transfer_progress.as_ref().unwrap().phase, TransferPhase::Audio);
        std::fs::write(&path, r#"{"step":10,"event":"fifo","command_accept":false}"#).unwrap();
        let running = wait(&|s| s.jobs.len() == 4 && s.jobs[0].title != layout_title());
        assert_eq!(running.jobs[0].transfer_progress.as_ref().unwrap().fraction, Some(0.34));
        commands.send(QueueCommand::Cancel(1)).unwrap();
        assert!(matches!(reply_receiver.recv_timeout(Duration::from_secs(3)),
            Ok(UiReply::RowCommand { job: 1, cleanup: false, reply: CommandReply::Applied(false) })));
        std::fs::write(&path, r#"{"step":11,"event":"progress-a"}"#).unwrap();
        let changed = wait(&|s| s.jobs[0].transfer_progress.as_ref().is_some_and(|p| p.fraction == Some(0.61)));
        assert_eq!(changed.jobs[0].job_id, running.jobs[0].job_id);
        assert_eq!(changed.jobs[0].phase, JobPhase::Downloading);
        assert_eq!(changed.jobs[0].transfer_progress.as_ref().unwrap().bytes_per_second, Some(2_500_000.));
        std::fs::write(&path, r#"{"step":12,"event":"held"}"#).unwrap();
        wait(&|s| s.jobs.len() == 1 && s.jobs[0].phase == JobPhase::Held);
        commands.send(QueueCommand::RetryCleanup(5)).unwrap();
        assert!(matches!(reply_receiver.recv_timeout(Duration::from_secs(3)),
            Ok(UiReply::RowCommand { job: 5, cleanup: true, reply: CommandReply::Applied(false) })));
        assert_eq!(latest.lock().unwrap().as_ref().unwrap().jobs[0].phase, JobPhase::Held);
        drop(commands);
    }
    #[test]
    fn preview_switch_publishes_immediately_after_prior_scene_revisions() {
        let (scenes, scene_receiver) = mpsc::sync_channel(16);
        let (commands, receiver) = mpsc::sync_channel(8);
        let (_evidence, evidence_receiver) = mpsc::sync_channel(1);
        let (replies, _reply_receiver) = mpsc::channel();
        let latest = Arc::new(Mutex::new(None));
        start(None, scene_receiver, receiver, evidence_receiver, replies, latest.clone());
        let wait = |after: u64, phase: Option<JobPhase>| {
            let deadline = Instant::now() + Duration::from_secs(3);
            loop {
                if let Some(s) = latest.lock().unwrap().clone() {
                    if phase.is_some() {
                        assert!(s.revision >= after, "scene reset must not make UI reject the snapshot as stale");
                    }
                    if s.revision > after
                        && phase.as_ref().is_none_or(|p| s.jobs.len() == 1 && s.jobs[0].phase == *p)
                    { return s; }
                }
                assert!(Instant::now() < deadline, "preview scene did not publish a newer snapshot");
                std::thread::sleep(Duration::from_millis(5));
            }
        };
        let old = wait(12, None);
        scenes.send("5").unwrap();
        let failed = wait(old.revision, Some(JobPhase::Failure));
        assert_eq!(failed.jobs[0].job_id, 5);
        scenes.send("2").unwrap();
        let running = wait(failed.revision, Some(JobPhase::Downloading));
        assert_eq!(running.jobs[0].job_id, 1);
        assert_eq!(running.jobs[0].transfer_progress.as_ref().unwrap().fraction, Some(0.46));
        drop(commands);
    }
    #[test]
    fn preview_scenes_are_isolated_and_keep_real_action_identities() {
        for key in ["0","1","2","3","4","5","6","7","8","9"] {
            let s = preview_scene(key);
            assert!(s.jobs.iter().all(|j| j.accepted.intent.url.is_empty() && j.accepted.intent.output_dir.as_os_str().is_empty()));
            assert_eq!(s.unfinished, s.jobs.iter().filter(|j| !j.phase.terminal()).count());
        }
        let s = preview_scene("8");
        assert_eq!(s.jobs.iter().map(|j| j.job_id).collect::<Vec<_>>(), vec![1,2,3,4,5,6,7]);
        assert_eq!(s.active_slots, 3);
        assert_eq!(s.failures, 1);
        assert_eq!(preview_scene("6").jobs[0].transfer_progress.as_ref().unwrap().phase, TransferPhase::Audio);
    }
}
