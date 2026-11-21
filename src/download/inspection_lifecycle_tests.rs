//! Synthetic sessions and Adapter results exercise the real queue's ownership path.
use super::{
    adapter::{DownloadServices, DownloaderAdapter, ExecutionContext},
    contract::{AdapterEvent, AdapterResult, ExecutionRequest, MediaKind},
    diagnostics::{Failure, FailureCode},
    inspection::Inspection,
    queue::{DownloadCoordinator, JobPhase, QueueSnapshot},
    request::Quality,
    runtime::{RuntimeManager, TrustedRuntimeRequirements},
    settings::Settings,
    verification::VerifierRegistry,
};
use crate::browser_sessions::{Cookie, Operation, Store};
use std::{
    fs,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU8, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

struct Probe {
    mode: Arc<AtomicU8>,
    observed: Arc<Mutex<Vec<Option<String>>>>,
    workspaces: Arc<Mutex<Vec<std::path::PathBuf>>>,
    held_file: Arc<Mutex<Option<fs::File>>>,
    requirements: TrustedRuntimeRequirements,
}
impl DownloaderAdapter for Probe {
    fn kind(&self) -> MediaKind {
        MediaKind::Video
    }
    fn requirements(&self) -> &TrustedRuntimeRequirements {
        &self.requirements
    }
    fn evidence_files(&self) -> &[(&str, u64)] {
        &[]
    }
    fn execute(&self, _: &ExecutionRequest, _: &ExecutionContext<'_>) -> AdapterResult {
        panic!("inspection entered transfer")
    }
    fn inspect(
        &self,
        request: &ExecutionRequest,
        context: &ExecutionContext<'_>,
    ) -> Result<Inspection, Failure> {
        context.emit(AdapterEvent::Resolving);
        self.workspaces
            .lock()
            .unwrap()
            .push(context.workspace().into());
        self.observed.lock().unwrap().push(
            context
                .authentication
                .map(|auth| fs::read_to_string(&auth.path).unwrap()),
        );
        let mode = self.mode.load(Ordering::Acquire);
        while self.mode.load(Ordering::Acquire) == 2 && !context.cancelled() {
            thread::sleep(Duration::from_millis(5));
        }
        if context.cancelled() {
            return Err(Failure::new(FailureCode::Cancelled, "resolve"));
        }
        if mode == 1 {
            return Err(Failure::new(FailureCode::UnsupportedUrl, "resolve"));
        }
        if mode == 3 {
            use std::os::windows::fs::OpenOptionsExt;
            let file = fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .share_mode(0)
                .open(context.workspace().join("held.tmp"))
                .unwrap();
            *self.held_file.lock().unwrap() = Some(file);
        }
        let mut proof = super::adapters::yt_dlp::identity::proof(&request.accepted, &serde_json::json!({"id":"jNQXAC9IVRw","extractor_key":"Youtube","title":"clip SYNTHETIC_V1"})).unwrap();
        proof.identity.title.clear();
        context.admit(&proof)?;
        Ok(Inspection {
            identity: context.public_identity(&proof.identity).unwrap(),
            duration_seconds: None,
            selected: vec![],
        })
    }
}
fn wait(queue: &DownloadCoordinator, predicate: impl Fn(&QueueSnapshot) -> bool) -> QueueSnapshot {
    let until = Instant::now() + Duration::from_secs(8);
    loop {
        let view = queue.snapshot();
        if predicate(&view) {
            return view;
        }
        assert!(Instant::now() < until, "queue did not settle: {view:?}");
        thread::sleep(Duration::from_millis(5));
    }
}
fn authorize(store: &Store, value: &str, grant: &str) {
    store
        .apply(Operation::Authorize {
            site: "youtube.com".into(),
            source_id: "a".repeat(32),
            source_name: "Synthetic test".into(),
            grant_id: grant.repeat(32),
            replaces: None,
            cookies: vec![Cookie {
                domain: ".youtube.com".into(),
                path: "/".into(),
                name: "test".into(),
                value: value.into(),
                secure: true,
                http_only: true,
                host_only: false,
                expires: None,
            }],
            skipped_partitioned: 0,
        })
        .unwrap();
}
#[test]
fn inspection_uses_formal_session_and_settles_without_transfer_or_delivery() {
    let root = tempfile::tempdir().unwrap();
    let output = root.path().join("output");
    fs::create_dir(&output).unwrap();
    let runtime = root.path().join("runtime");
    let store = Store::new(&runtime);
    authorize(&store, "SYNTHETIC_V1", "b");
    let mode = Arc::new(AtomicU8::new(0));
    let observed = Arc::new(Mutex::new(Vec::new()));
    let workspaces = Arc::new(Mutex::new(Vec::new()));
    let held = Arc::new(Mutex::new(None));
    let queue = DownloadCoordinator::new(
        DownloadServices {
            runtime: Arc::new(RuntimeManager::new(runtime)),
            adapter: Arc::new(Probe {
                mode: mode.clone(),
                observed: observed.clone(),
                workspaces: workspaces.clone(),
                held_file: held.clone(),
                requirements: TrustedRuntimeRequirements::empty(),
            }),
            verifiers: Arc::new(VerifierRegistry::video("must-never-run")),
        },
        root.path().join("settings.json"),
        Settings {
            quality: Quality::Balanced,
            output_dir: output.clone(),
            theme: Default::default(),
            language: Default::default(),
            tray_icon: Default::default(),
            shortcut: Default::default(),
        },
    )
    .unwrap();
    let url = "https://youtube.com/watch?v=jNQXAC9IVRw";
    let first = queue.inspect(url.into(), Quality::Saver).unwrap();
    let view = wait(&queue, |s| {
        s.jobs
            .iter()
            .any(|j| j.job_id == first && j.phase == JobPhase::Inspected)
    });
    let job = &view.jobs[0];
    assert!(job.inspect_only && job.resources_released && !job.slot_owned);
    assert!(job.delivered.is_none());
    assert_eq!(job.terminal_count, 1);
    assert_eq!(job.accepted.intent.quality, Quality::Saver);
    assert_eq!(job.inspection.as_ref().unwrap().identity.title, "");
    assert!(
        observed.lock().unwrap()[0]
            .as_ref()
            .unwrap()
            .contains("SYNTHETIC_V1")
    );
    mode.store(1, Ordering::Release);
    let failed = queue.inspect(url.into(), Quality::Highest).unwrap();
    let view = wait(&queue, |s| {
        s.jobs
            .iter()
            .any(|j| j.job_id == failed && j.phase == JobPhase::Failure)
    });
    assert_eq!(view.jobs[1].failure.as_ref().unwrap().stage, "resolve");
    assert!(queue.retry(failed).is_err());
    assert!(!queue.diagnostic(failed).unwrap().contains("SYNTHETIC"));
    mode.store(2, Ordering::Release);
    let cancelled = queue.inspect(url.into(), Quality::Highest).unwrap();
    wait(&queue, |s| {
        s.jobs
            .iter()
            .any(|j| j.job_id == cancelled && j.phase == JobPhase::Resolving)
    });
    assert!(queue.cancel(cancelled));
    wait(&queue, |s| {
        s.jobs.iter().any(|j| {
            j.job_id == cancelled && j.phase == JobPhase::Cancelled && j.resources_released
        })
    });
    let observed_before_revoke = observed.lock().unwrap().len();
    let revoked = queue.inspect(url.into(), Quality::Highest).unwrap();
    wait(&queue, |s| {
        s.jobs
            .iter()
            .any(|j| j.job_id == revoked && j.phase == JobPhase::Resolving)
            && observed.lock().unwrap().len() > observed_before_revoke
    });
    // Slot admission can report Resolving before the attempt takes its session snapshot.
    assert!(observed.lock().unwrap().last().unwrap().is_some());
    store.remove("youtube.com", &"b".repeat(32)).unwrap();
    wait(&queue, |s| {
        s.jobs
            .iter()
            .any(|j| j.job_id == revoked && j.phase == JobPhase::Cancelled && j.resources_released)
    });
    mode.store(0, Ordering::Release);
    let anonymous = queue.inspect(url.into(), Quality::Highest).unwrap();
    wait(&queue, |s| {
        s.jobs
            .iter()
            .any(|j| j.job_id == anonymous && j.phase == JobPhase::Inspected)
    });
    assert!(observed.lock().unwrap().last().unwrap().is_none());
    authorize(&store, "SYNTHETIC_V3", "c");
    fs::remove_dir(&output).unwrap(); // Metadata-only does not need a save destination.
    mode.store(3, Ordering::Release);
    let cleanup = queue.inspect(url.into(), Quality::Highest).unwrap();
    let view = wait(&queue, |s| {
        s.jobs
            .iter()
            .any(|j| j.job_id == cleanup && j.phase == JobPhase::Held)
    });
    let job = view.jobs.last().unwrap();
    assert!(!job.resources_released && job.slot_owned && job.inspection.is_none());
    store.remove("youtube.com", &"c".repeat(32)).unwrap();
    drop(held.lock().unwrap().take());
    // Exercise the actual control command, not an internal recovery shortcut.
    crate::control::retry_inspection_cleanup_for_test(&queue, cleanup);

    wait(&queue, |s| {
        s.jobs
            .iter()
            .any(|j| j.job_id == cleanup && j.phase == JobPhase::Cancelled && j.resources_released)
    });
    assert!(!output.exists());
    assert!(workspaces.lock().unwrap().iter().all(|p| !p.exists()));
    queue.stop();
    wait(&queue, |s| s.stopped);
}
