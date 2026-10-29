//! One logical download authority. Each Job has one engine execution and one settled terminal.
use super::{
    Coordinator, Phase, PreparedAttempt, Snapshot,
    adapter::DownloadServices,
    contract::IdentityAttestation,
    diagnostics::{self, Failure, FailureCode},
    lock,
    preparation::{
        ErrorCategory, PreparationFailure, PreparationPhase, PreparationSnapshot, PreparationStage,
        RuntimeComponent,
    },
    process_supervisor::{Control, ProcessObservation},
    request::{Accepted, DownloadIntent, Identity},
    runtime::RuntimeLease,
    settings::Settings,
};
use serde::{Deserialize, Serialize};
#[cfg(test)]
use std::fs;
use std::{
    collections::{BTreeMap, VecDeque},
    path::PathBuf,
    sync::{
        Arc, Mutex,
        mpsc::{Receiver, RecvTimeoutError, Sender},
    },
    thread::{self, JoinHandle},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub const MAX_SLOTS: usize = 3;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum JobPhase {
    Queued,
    Preparing,
    Resolving,
    Downloading,
    Validating,
    Publishing,
    Held,
    Success,
    Failure,
    Cancelled,
}
impl JobPhase {
    pub fn terminal(&self) -> bool {
        matches!(self, Self::Success | Self::Failure | Self::Cancelled)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeliveredFile {
    pub path: PathBuf,
    pub bytes: u64,
    pub sha256: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct JobEvent {
    pub timestamp_ms: u64,
    pub attempt: u32,
    pub kind: String,
    pub active_slots: usize,
    pub start_order: Option<u64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct JobSnapshot {
    pub job_id: u64,
    pub revision: u64,
    pub attempt: u32,
    pub phase: JobPhase,
    pub accepted: Accepted,
    pub identity: Option<Identity>,
    pub title: String,
    pub message: String,
    pub failure: Option<Failure>,
    pub transfer_progress: Option<super::progress::TransferProgress>,
    pub delivered: Option<DeliveredFile>,
    pub slot_owned: bool,
    pub resources_released: bool,
    pub start_order: Option<u64>,
    pub terminal_count: u32,
    pub events: Vec<JobEvent>,
}

#[cfg(test)]
#[path = "../../tests/support/windows_process_fixture.rs"]
mod preparation_fixture;
#[cfg(test)]
mod tests {
    use super::super::request::Quality;
    use super::*;
    use crate::download::{
        adapters::yt_dlp::{diagnostics as native_diagnostics, identity as native_identity},
        composition,
        runtime::RuntimeManager,
    };
    use serde_json::{Value, json};
    trait NativeFixture {
        fn identity(&self, metadata: &Value) -> Result<Identity, String>;
    }
    impl NativeFixture for Accepted {
        fn identity(&self, metadata: &Value) -> Result<Identity, String> {
            native_identity::attest(self, metadata)
        }
    }
    fn admit_fixture(
        shared: &Shared,
        job: u64,
        identity: &Identity,
        metadata: &Value,
    ) -> Result<(), String> {
        let accepted = lock(&shared.model).records[&job].view.accepted.clone();
        let mut proof = native_identity::proof(&accepted, metadata)?;
        proof.identity = identity.clone();
        admit_identity(shared, job, &proof)
    }
    use std::time::Instant;
    #[test]
    fn r12_startup_shared_failure_manual_retry_resumes_same_fifo_jobs_and_preserves_history()
    -> Result<(), String> {
        use crate::download::{
            neutral_tests::DataAdapter, runtime::TrustedRuntimeRequirements,
            verification::VerifierRegistry,
        };
        use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
        let root = tempfile::tempdir().map_err(|e| e.to_string())?;
        let mut backend = fake_backend(root.path());
        let manager = backend.shared.manager.clone();
        Arc::get_mut(&mut backend.shared).unwrap().services = DownloadServices {
            runtime: manager.clone(),
            adapter: Arc::new(DataAdapter {
                requirements: TrustedRuntimeRequirements::empty(),
                mode: Arc::new(AtomicU8::new(3)),
            }),
            verifiers: Arc::new(VerifierRegistry::data()),
        };
        let release = Arc::new(AtomicBool::new(false));
        let released = release.clone();
        let weak = Arc::downgrade(&backend.shared);
        *lock(&backend.shared.preparation_test) = Some(Arc::new(move |control, observer| {
            let shared = weak.upgrade().unwrap();
            let attempt = lock(&shared.model).preparation.attempt;
            if attempt == 1 {
                while !released.load(Ordering::Acquire) && !control.is_cancelled() {
                    thread::sleep(Duration::from_millis(5));
                }
                let failure = PreparationFailure::new(
                    RuntimeComponent::Deno,
                    PreparationStage::Acquire,
                    ErrorCategory::Timeout,
                );
                let mut event = lock(&shared.model).preparation.clone();
                event.phase = PreparationPhase::Failed;
                event.component = Some(failure.component);
                event.stage = failure.stage;
                event.failure = Some(failure);
                observe_preparation(&shared, event);
                Err(Failure::new(FailureCode::Runtime, "runtime"))
            } else {
                manager
                    .prepare(
                        &TrustedRuntimeRequirements::empty(),
                        &control,
                        observer,
                        |_| {},
                    )
                    .map_err(|_| Failure::new(FailureCode::Runtime, "runtime"))
            }
        }));
        let shared = backend.shared.clone();
        let owner = thread::spawn(move || dispatch(shared));
        wait_until(&backend, |v| v.preparing)?;
        assert!(backend.snapshot().jobs.is_empty());
        assert_eq!(backend.snapshot().active_slots, 0);
        for n in 1..=5 {
            backend.submit(format!("https://youtu.be/{n:011}"))?;
        }
        assert!(!backend.retry_preparation());
        release.store(true, Ordering::Release);
        let failed = wait_until(&backend, |v| {
            !v.preparing && v.preparation.phase == PreparationPhase::Failed
        })?;
        assert_eq!(failed.active_slots, 0);
        assert_eq!(failed.unfinished, 5);
        assert_eq!(failed.failures, 0);
        assert!(failed.jobs.iter().all(|j| j.phase == JobPhase::Preparing
            && j.message.contains("manual preparation Retry")
            && j.attempt == 0
            && j.terminal_count == 0));
        thread::sleep(Duration::from_millis(80));
        assert_eq!(backend.snapshot().preparation.attempt, 1);
        let copied = match backend.apply(QueueCommand::CopyPreparationDiagnostic) {
            CommandReply::Diagnostic(text) => text,
            _ => panic!("missing safe diagnostic"),
        };
        assert!(copied.contains("Deno"));
        assert!(copied.contains("timeout"));
        let late_job = backend.submit("https://youtu.be/00000000006".into())?;
        let late = backend.snapshot();
        let late = late.jobs.iter().find(|job| job.job_id == late_job).unwrap();
        assert_eq!(late.phase, JobPhase::Preparing);
        assert!(late.message.contains("Deno"));
        assert!(late.message.contains("timeout"));
        assert!(late.message.contains("manual preparation Retry"));
        assert!(backend.cancel(late_job));
        assert!(backend.retry_preparation());
        assert!(!backend.retry_preparation());
        let running = wait_until(&backend, |v| v.active_slots == 3)?;
        assert_eq!(
            running.jobs.iter().map(|j| j.job_id).collect::<Vec<_>>(),
            vec![1, 2, 3, 4, 5, 6]
        );
        assert_eq!(
            running
                .jobs
                .iter()
                .filter(|j| j.slot_owned)
                .map(|j| j.start_order)
                .collect::<Vec<_>>(),
            vec![Some(1), Some(2), Some(3)]
        );
        assert!(backend.cancel(2));
        let resumed = wait_until(&backend, |v| v.jobs[3].slot_owned)?;
        assert_eq!(resumed.jobs[3].start_order, Some(4));
        assert!(
            resumed
                .preparation
                .history
                .iter()
                .any(|e| e.attempt == 1 && e.category == Some(ErrorCategory::Timeout))
        );
        assert!(resumed.preparation.history.iter().any(|e| e.attempt == 2));
        backend.stop();
        wait_until(&backend, |v| v.stopped)?;
        owner.join().map_err(|_| "dispatcher panic")?;
        let persisted = fs::read_to_string(root.path().join("preparation-history.json"))
            .map_err(|e| e.to_string())?;
        assert!(persisted.contains("Timeout"));
        Ok(())
    }
    #[test]
    fn progress_projection_rejects_stale_identity_and_clears_manual_retry_cancel_stop_terminal()
    -> Result<(), String> {
        let root = tempfile::tempdir().map_err(|e| e.to_string())?;
        let backend = fake_backend(root.path());
        let mut job = backend.submit("https://youtu.be/jNQXAC9IVRw".into())?;
        let runner = Arc::new(composition::coordinator(root.path().into()));
        let sample = super::super::progress::TransferProgress {
            downloaded_bytes: 25,
            exact_total_bytes: Some(100),
            bytes_per_second: Some(5.),
            fraction: Some(0.25),
            observed_at_ms: 1,
            merging: false,
            ..Default::default()
        };
        let mut snapshot = Snapshot {
            job_id: job,
            attempt: 1,
            revision: 10,
            phase: Phase::Downloading,
            transfer_progress: Some(sample.clone()),
            ..Default::default()
        };
        {
            let mut model = lock(&backend.shared.model);
            assert_eq!(model.launch(), Some(job));
            model.records.get_mut(&job).unwrap().running = Some(RunningAttempt {
                runner: runner.clone(),
                owner: thread::spawn(|| {}),
                seen_revision: 0,
                seen_settlements: 0,
            });
            snapshot.job_id += 1;
            project_attempt(&mut model, job, &snapshot);
            assert!(model.records[&job].view.transfer_progress.is_none());
            snapshot.job_id = job;
            snapshot.attempt = 2;
            project_attempt(&mut model, job, &snapshot);
            assert!(model.records[&job].view.transfer_progress.is_none());
            snapshot.attempt = 1;
            project_attempt(&mut model, job, &snapshot);
            assert_eq!(
                model.records[&job].view.transfer_progress,
                Some(sample.clone())
            );
            snapshot.revision = 9;
            snapshot.phase = Phase::Held;
            project_attempt(&mut model, job, &snapshot);
            assert_eq!(model.records[&job].view.phase, JobPhase::Downloading);
            snapshot.revision = 10;
            project_attempt(&mut model, job, &snapshot);
            assert_eq!(model.records[&job].view.phase, JobPhase::Downloading);
            snapshot.revision = 11;
            project_attempt(&mut model, job, &snapshot);
            assert!(model.records[&job].view.transfer_progress.is_none());
            snapshot.revision = 12;
            snapshot.phase = Phase::Downloading;
            project_attempt(&mut model, job, &snapshot);
            assert!(model.records[&job].view.transfer_progress.is_some());
            let running = model.records.get_mut(&job).unwrap().running.take().unwrap();
            running.owner.join().unwrap();
            model.settled(job, temporary());
            assert!(model.records[&job].view.transfer_progress.is_none());
            assert_eq!(model.records[&job].view.phase, JobPhase::Failure);
            let original = job;
            let accepted = model.records[&original].view.accepted.clone();
            job = model.accept(accepted, None)?;
            assert_ne!(job, original);
            assert_eq!(model.launch(), Some(job));
            assert_eq!(model.records[&job].view.attempt, 1);
            assert!(model.records[&job].view.transfer_progress.is_none());
            model.records.get_mut(&job).unwrap().running = Some(RunningAttempt {
                runner: runner.clone(),
                owner: thread::spawn(|| {}),
                seen_revision: 0,
                seen_settlements: 0,
            });
            {
                let mut state = lock(&runner.state);
                state.snapshot.job_id = job;
                state.snapshot.attempt = 1;
                state.snapshot.phase = Phase::Downloading;
            }
            snapshot.job_id = job;
            snapshot.attempt = 1;
            snapshot.revision = 20;
            project_attempt(&mut model, job, &snapshot);
            backend.shared.publish(&model);
        }
        assert!(backend.cancel(job));
        {
            let mut model = lock(&backend.shared.model);
            snapshot.revision += 1;
            project_attempt(&mut model, job, &snapshot);
            assert!(model.records[&job].view.transfer_progress.is_none());
            let running = model.records.get_mut(&job).unwrap().running.take().unwrap();
            running.owner.join().unwrap();
            model.settled(
                job,
                Snapshot {
                    phase: Phase::Cancelled,
                    ..Default::default()
                },
            );
            assert_eq!(model.records[&job].view.phase, JobPhase::Cancelled);
            snapshot.revision += 1;
            project_attempt(&mut model, job, &snapshot);
            assert!(model.records[&job].view.transfer_progress.is_none());
        }
        let next = backend.submit("https://youtu.be/dQw4w9WgXcQ".into())?;
        {
            let mut model = lock(&backend.shared.model);
            model.records.get_mut(&next).unwrap().view.transfer_progress = Some(sample);
        }
        backend.stop();
        assert!(
            backend
                .snapshot()
                .jobs
                .iter()
                .all(|job| job.transfer_progress.is_none())
        );
        Ok(())
    }
    fn clear_fixture_readonly(path: &std::path::Path) -> Result<(), String> {
        use std::os::windows::{ffi::OsStrExt, fs::MetadataExt};
        use windows_sys::Win32::Storage::FileSystem::{
            FILE_ATTRIBUTE_NORMAL, FILE_ATTRIBUTE_READONLY, SetFileAttributesW,
        };
        let attributes = fs::metadata(path)
            .map_err(|error| error.to_string())?
            .file_attributes()
            & !FILE_ATTRIBUTE_READONLY;
        let attributes = if attributes == 0 {
            FILE_ATTRIBUTE_NORMAL
        } else {
            attributes
        };
        let path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        // These Windows-only fixtures deliberately retain readonly stages until explicit repair.
        if unsafe { SetFileAttributesW(path.as_ptr(), attributes) } == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(())
    }
    fn accepted(root: &std::path::Path, n: u64) -> Result<Accepted, String> {
        Accepted::new(DownloadIntent {
            url: format!("https://youtu.be/{n:011}"),
            quality: Quality::Balanced,
            output_dir: root.into(),
        })
    }
    fn defaults(root: &std::path::Path) -> Settings {
        Settings {
            quality: Quality::Balanced,
            output_dir: root.into(),
        }
    }
    fn fake_backend(root: &std::path::Path) -> DownloadCoordinator {
        let model = Model::new(defaults(root));
        let snapshot = model.snapshot();
        DownloadCoordinator {
            shared: Arc::new(Shared {
                model: Mutex::new(model),
                published: Mutex::new(Arc::new(snapshot)),
                manager: Arc::new(RuntimeManager::new(root.into())),
                services: composition::services(root.into()),
                settings_path: root.join("defaults.json"),
                command_gate: Mutex::new(()),
                preparation_control: Mutex::new(Control::default()),
                preparation_owner_live: Mutex::new(false),
                probe: Mutex::new(None),
                preparation_test: Mutex::new(None),
                dispatch_test_exit: std::sync::atomic::AtomicBool::new(false),
                preparation_test_joined: std::sync::atomic::AtomicBool::new(false),
            }),
        }
    }
    fn success() -> Snapshot {
        Snapshot {
            phase: Phase::Success,
            resources_released: true,
            ..Default::default()
        }
    }
    fn temporary() -> Snapshot {
        Snapshot {
            phase: Phase::Failure,
            resources_released: true,
            failure: Some(native_diagnostics::classify(
                &Phase::Resolving,
                "resolve engine exit 1: ERROR: ConnectionResetError: connection reset by peer",
            )),
            ..Default::default()
        }
    }
    #[test]
    fn r8_engine_final_failure_is_terminal_and_never_restarts_the_job() -> Result<(), String> {
        let root = tempfile::tempdir().map_err(|e| e.to_string())?;
        let mut model = Model::new(defaults(root.path()));
        for n in 1..=4 {
            model.accept(accepted(root.path(), n)?, None)?;
        }
        assert_eq!(
            (model.launch(), model.launch(), model.launch()),
            (Some(1), Some(2), Some(3))
        );
        assert_eq!(model.launch(), None);
        model.settled(1, temporary());
        let view = model.snapshot();
        assert_eq!(view.jobs[0].phase, JobPhase::Failure);
        assert_eq!(view.jobs[0].attempt, 1);
        assert_eq!(view.jobs[0].terminal_count, 1);
        assert_eq!(view.failures, 1);
        assert_eq!(view.active_slots, 2);
        assert_eq!(model.launch(), Some(4));
        assert_eq!(model.launch(), None);
        Ok(())
    }
    #[test]
    fn r8_diagnostic_has_no_application_attempt_budget_or_retry_delay() {
        let failure = native_diagnostics::classify(
            &Phase::Downloading,
            "transfer engine exit 1: ERROR: HTTP Error 429: Too Many Requests\nRetry-After: 123\n",
        );
        let text = diagnostics::copy_text(1, "youtube", &[failure]);
        assert!(!text.contains("Attempts:"));
        assert!(!text.contains("/6"));
        assert!(!text.contains("retry delay"));
    }
    #[test]
    fn fifo_three_slots_keeps_held_until_joined_and_refills_in_order() -> Result<(), String> {
        let root = tempfile::tempdir().map_err(|e| e.to_string())?;
        let mut model = Model::new(defaults(root.path()));
        for n in 1..=5 {
            model.accept(accepted(root.path(), n)?, None)?;
        }
        assert_eq!(
            (
                model.launch(),
                model.launch(),
                model.launch(),
                model.launch()
            ),
            (Some(1), Some(2), Some(3), None)
        );
        let held = model.records.get_mut(&1).ok_or("Missing Job")?;
        held.view.phase = JobPhase::Held;
        // Cancellation/terminal request alone is unable to release a retained owner.
        model.terminal(1, JobPhase::Cancelled);
        assert_eq!(model.active(), 3);
        assert_eq!(model.launch(), None);
        assert_eq!(model.snapshot().unfinished, 5);
        assert_eq!(model.snapshot().main_job, Some(1));
        model.settled(2, success());
        assert_eq!(model.launch(), Some(4));
        model.settled(3, success());
        assert_eq!(model.launch(), Some(5));
        assert_eq!(model.active(), 3);
        for job in [1, 4, 5] {
            model.settled(job, success());
        }
        assert_eq!(model.snapshot().unfinished, 0);
        assert!(
            model
                .snapshot()
                .jobs
                .iter()
                .all(|r| r.terminal_count == 1 && r.resources_released && !r.slot_owned)
        );
        let revision = model.revision;
        model.settled(1, temporary());
        assert_eq!(model.revision, revision);
        assert_eq!(model.snapshot().jobs[0].phase, JobPhase::Success);
        Ok(())
    }
    #[test]
    fn engine_observations_keep_one_job_and_slot_until_actual_owner_join() -> Result<(), String> {
        let root = tempfile::tempdir().map_err(|e| e.to_string())?;
        let mut model = Model::new(defaults(root.path()));
        for n in 1..=4 {
            model.accept(accepted(root.path(), n)?, None)?;
        }
        assert_eq!(
            (model.launch(), model.launch(), model.launch()),
            (Some(1), Some(2), Some(3))
        );
        let runner = Arc::new(composition::coordinator(root.path().into()));
        let (release, wait) = std::sync::mpsc::channel();
        model.records.get_mut(&1).unwrap().running = Some(RunningAttempt {
            runner,
            owner: thread::spawn(move || {
                wait.recv().unwrap();
            }),
            seen_revision: 0,
            seen_settlements: 0,
        });
        for revision in 1..=3 {
            project_attempt(
                &mut model,
                1,
                &Snapshot {
                    job_id: 1,
                    attempt: 1,
                    revision,
                    phase: Phase::Downloading,
                    resources_released: false,
                    ..Default::default()
                },
            );
            let snapshot = model.snapshot();
            assert_eq!(snapshot.jobs.len(), 4);
            assert_eq!(snapshot.active_slots, 3);
            assert_eq!(snapshot.jobs[0].attempt, 1);
            assert_eq!(snapshot.jobs[0].terminal_count, 0);
            assert_eq!(model.launch(), None);
        }
        let mut final_failure = temporary();
        final_failure.job_id = 1;
        final_failure.attempt = 1;
        final_failure.revision = 4;
        project_attempt(&mut model, 1, &final_failure);
        assert_eq!(model.snapshot().jobs[0].phase, JobPhase::Downloading);
        assert_eq!(model.active(), 3);
        assert_eq!(model.launch(), None);
        release.send(()).unwrap();
        let running = model.records.get_mut(&1).unwrap().running.take().unwrap();
        running.owner.join().unwrap();
        model.settled(1, final_failure);
        assert_eq!(model.snapshot().jobs[0].phase, JobPhase::Failure);
        assert_eq!(model.snapshot().jobs[0].terminal_count, 1);
        assert_eq!(model.launch(), Some(4));
        assert_eq!(model.launch(), None);
        Ok(())
    }
    #[test]
    fn cancelling_pending_job_does_not_cancel_shared_preparation_until_stop() -> Result<(), String>
    {
        let root = tempfile::tempdir().map_err(|e| e.to_string())?;
        let backend = fake_backend(root.path());
        let job = backend.submit("https://youtu.be/jNQXAC9IVRw".into())?;
        assert!(backend.cancel(job));
        assert!(!lock(&backend.shared.preparation_control).is_cancelled());
        {
            let mut model = lock(&backend.shared.model);
            assert_eq!(model.launch(), None);
            assert_eq!(model.records[&job].view.attempt, 0);
            assert_eq!(model.records[&job].view.phase, JobPhase::Cancelled);
        }
        backend.stop();
        assert!(lock(&backend.shared.preparation_control).is_cancelled());
        assert!(
            backend
                .submit("https://youtu.be/dQw4w9WgXcQ".into())
                .is_err()
        );
        Ok(())
    }
    #[test]
    fn saved_defaults_are_atomic_frozen_and_failed_save_keeps_previous_acknowledged_values()
    -> Result<(), String> {
        let root = tempfile::tempdir().map_err(|e| e.to_string())?;
        let out_a = root.path().join("a");
        let out_b = root.path().join("b");
        fs::create_dir(&out_a)
            .and_then(|_| fs::create_dir(&out_b))
            .map_err(|e| e.to_string())?;
        let backend = fake_backend(root.path());
        let a = backend.save_settings(Settings {
            quality: Quality::Saver,
            output_dir: out_a,
        })?;
        let job = backend.submit("https://youtu.be/jNQXAC9IVRw".into())?;
        let b = backend.save_settings(Settings {
            quality: Quality::Highest,
            output_dir: out_b,
        })?;
        let view = backend.snapshot();
        let accepted = &view
            .jobs
            .iter()
            .find(|r| r.job_id == job)
            .ok_or("Missing Job")?
            .accepted
            .intent;
        assert_eq!(accepted.quality, a.quality);
        assert_eq!(accepted.output_dir, a.output_dir);
        let future = backend.submit("https://youtu.be/dQw4w9WgXcQ".into())?;
        let future_view = backend.snapshot();
        let future_intent = &future_view.jobs.iter().find(|r| r.job_id == future)
            .ok_or("Missing future Job")?.accepted.intent;
        assert_eq!(future_intent.quality, b.quality);
        assert_eq!(future_intent.output_dir, b.output_dir);
        assert_eq!(
            Settings::load(&backend.shared.settings_path, defaults(root.path()))?,
            b
        );
        let bytes = fs::read(&backend.shared.settings_path).map_err(|e| e.to_string())?;
        // Real Windows file share denial makes atomic replacement fail; old persisted file survives.
        use std::os::windows::fs::OpenOptionsExt;
        let guard = fs::OpenOptions::new()
            .read(true)
            .share_mode(1)
            .open(&backend.shared.settings_path)
            .map_err(|e| e.to_string())?;
        assert!(backend.save_settings(a).is_err());
        assert_eq!(backend.snapshot().settings, b);
        assert_eq!(
            fs::read(&backend.shared.settings_path).map_err(|e| e.to_string())?,
            bytes
        );
        drop(guard);
        assert_eq!(
            Settings::load(&backend.shared.settings_path, defaults(root.path()))?,
            b
        );
        Ok(())
    }
    #[test]
    fn manual_retry_creates_new_job_with_original_values_identity_and_double_click_dedup()
    -> Result<(), String> {
        let root = tempfile::tempdir().map_err(|e| e.to_string())?;
        let backend = fake_backend(root.path());
        let job = backend.submit("https://youtu.be/jNQXAC9IVRw".into())?;
        let metadata = json!({"id":"jNQXAC9IVRw","extractor_key":"Youtube","title":"public"});
        let identity = lock(&backend.shared.model)
            .records
            .get(&job)
            .ok_or("Missing Job")?
            .view
            .accepted
            .identity(&metadata)?;
        admit_fixture(&backend.shared, job, &identity, &metadata)?;
        {
            let mut model = lock(&backend.shared.model);
            assert_eq!(model.launch(), Some(job));
            model.settled(
                job,
                Snapshot {
                    phase: Phase::Failure,
                    failure: Some(native_diagnostics::classify(
                        &Phase::Resolving,
                        "HTTP Error 403: Forbidden",
                    )),
                    resources_released: true,
                    ..Default::default()
                },
            );
            backend.shared.publish(&model);
        }
        backend.save_settings(Settings {
            quality: Quality::Saver,
            output_dir: root.path().into(),
        })?;
        let new = backend.retry(job)?;
        assert!(new > job);
        assert!(backend.retry(job).is_err());
        let view = backend.snapshot();
        assert_eq!(view.jobs[0].phase, JobPhase::Failure);
        assert_eq!(view.jobs[0].terminal_count, 1);
        assert_eq!(view.jobs[1].accepted.intent.quality, Quality::Balanced);
        assert_eq!(view.jobs[1].attempt, 0);
        let changed = Identity {
            id: "dQw4w9WgXcQ".into(),
            site: super::super::request::Site::Youtube,
            part: None,
            title: "changed".into(),
        };
        assert!(admit_fixture(&backend.shared, new, &changed, &metadata).is_err());
        assert!(
            backend
                .submit("https://youtube.com/shorts/jNQXAC9IVRw".into())
                .is_err()
        );
        assert!(backend.diagnostic(job)?.contains("E_HTTP_FORBIDDEN"));
        assert!(backend.diagnostic(new).is_err());
        Ok(())
    }
    #[test]
    fn aliases_admit_only_one_transfer_and_ambiguous_parts_never_get_identity() -> Result<(), String>
    {
        let root = tempfile::tempdir().map_err(|e| e.to_string())?;
        let backend = fake_backend(root.path());
        let av = backend.submit("https://bilibili.com/video/av170001?p=2".into())?;
        let bv = backend.submit("https://bilibili.com/video/BV17x411w7KC?p=2".into())?;
        let short = backend.submit("https://b23.tv/AbCd12?p=2".into())?;
        let metadata = json!({"id":"BV17x411w7KC_p2","extractor_key":"BiliBili","title":"public","_old_archive_ids":["bilibili 170001_part2"]});
        let identity = lock(&backend.shared.model)
            .records
            .get(&av)
            .ok_or("Missing Job")?
            .view
            .accepted
            .identity(&metadata)?;
        assert!(admit_fixture(&backend.shared, bv, &identity, &metadata).is_err()); // unresolved earlier av wins
        admit_fixture(&backend.shared, av, &identity, &metadata)?;
        assert!(admit_fixture(&backend.shared, short, &identity, &metadata).is_err());
        assert!(
            backend
                .submit("https://bilibili.com/video/BV17x411w7KC?p=2".into())
                .is_err()
        );
        let unparted = Accepted::new(DownloadIntent {
            url: "https://b23.tv/AbCd12".into(),
            quality: Quality::Saver,
            output_dir: root.path().into(),
        })?;
        assert!(unparted.identity(&metadata).is_err());
        assert!(
            unparted
                .identity(&json!({"entries":[metadata.clone()]}))
                .is_err()
        );
        assert!(
            unparted
                .identity(
                    &json!({"id":"BV17x411w7KC_pbad","extractor_key":"BiliBili","title":"unknown"})
                )
                .is_err()
        );
        for url in [
            "https://youtube.com/watch?v=jNQXAC9IVRw&list=PLabc",
            "https://b23.tv/AbCd12?p=1&p=2",
            "https://b23.tv/AbCd12?p=0",
            "https://evil.example/BV17x411w7KC",
        ] {
            assert!(backend.submit(url.into()).is_err());
        }
        Ok(())
    }
    #[test]
    fn conservative_failure_classification_and_copy_privacy_ignore_attacker_controlled_fields() {
        for raw in [
            "HTTP Error 403: Forbidden",
            "429 http number without status evidence",
            "C:\\Users\\secret\\token.txt",
            "https://cdn.example/signed-secret-path?token=SECRET",
            "Authorization: Bearer SECRET",
            "Cookie: SID=SECRET",
        ] {
            let failure = native_diagnostics::classify(&Phase::Resolving, raw);
            let safe = diagnostics::copy_text(1, "youtube", &[failure]);
            assert!(!safe.contains("SECRET"));
        }
        let attack = Failure {
            code: "E_UNKNOWN\nCookie: SECRET".into(),
            stage: "transfer https://cdn/signed?x=SECRET".into(),
            reason: "C:\\Users\\secret\\private".into(),
            suggestion: "Authorization: SECRET".into(),
        };
        let text = diagnostics::copy_text(8, "https://proxy:password@secret", &vec![attack; 200]);
        for forbidden in [
            "SECRET",
            "secret",
            "Cookie",
            "Authorization",
            "://",
            "C:\\",
            "token=",
        ] {
            assert!(!text.contains(forbidden), "{forbidden}");
        }
        assert!(text.len() <= 4096);
        assert_eq!(text.matches("Failure ").count(), 6);
        assert!(
            diagnostics::safe_title("public https://cdn/signed?token=secret C:\\Users\\private")
                .contains("[redacted]")
        );
    }
    #[test]
    fn opaque_http_failure_copy_does_not_invent_headers_or_application_recovery() {
        let limited = native_diagnostics::classify(
            &Phase::Downloading,
            "transfer engine exit 1: ERROR: HTTP Error 429: Too Many Requests\nRetry-After: 123\n",
        );
        assert_eq!(limited.code, "E_RATE_LIMIT");
        let text = diagnostics::copy_text(1, "youtube", &[limited]);
        assert!(!text.contains("Retry-After"));
        assert!(!text.contains("123"));
        assert!(!text.contains("retry delay"));
    }
    #[test]
    fn exact_private_video_error_is_access_denied_but_debug_url_status_cannot_trigger_retry() {
        let private = native_diagnostics::classify(
            &Phase::Resolving,
            "resolve engine exit 1: [debug] fixed runtime\nERROR: [youtube] 2lAe1cqCOXo: Private video\n",
        );
        assert_eq!(private.code, "E_ACCESS_DENIED");

        let attacker = native_diagnostics::classify(
            &Phase::Resolving,
            "resolve engine exit 1: [debug] Command-line config: ['https://youtube.com/watch?v=jNQXAC9IVRw&title=HTTP Error 429: Too Many Requests']\nERROR: [youtube] jNQXAC9IVRw: Unexpected object schema\n",
        );
        assert_eq!(attacker.code, "E_ENGINE_FAILED");

        let forbidden = native_diagnostics::classify(
            &Phase::Downloading,
            "transfer engine exit 1: [debug] fixed runtime\nERROR: unable to download video: HTTP Error 403: Forbidden\n",
        );
        assert_eq!(forbidden.code, "E_HTTP_FORBIDDEN");
    }
    fn wait_until(
        backend: &DownloadCoordinator,
        check: impl Fn(&QueueSnapshot) -> bool,
    ) -> Result<QueueSnapshot, String> {
        let start = Instant::now();
        loop {
            let view = backend.snapshot();
            if check(&view) {
                return Ok(view);
            }
            if start.elapsed() > Duration::from_secs(90) {
                return Err(format!("Timed out: {view:?}"));
            }
            thread::sleep(Duration::from_millis(10));
        }
    }
    #[test]
    fn unknown_short_link_retry_cannot_silently_choose_a_new_object_and_parts_are_not_guessed()
    -> Result<(), String> {
        let root = tempfile::tempdir().map_err(|e| e.to_string())?;
        let backend = fake_backend(root.path());
        let job = backend.submit("https://b23.tv/AbCd12".into())?;
        {
            let mut model = lock(&backend.shared.model);
            model.terminal(job, JobPhase::Failure);
            backend.shared.publish(&model);
        }
        assert!(backend.retry(job).is_err());
        assert_eq!(backend.snapshot().jobs.len(), 1);
        let single = Accepted::new(DownloadIntent {
            url: "https://bilibili.com/video/BV17x411w7KC".into(),
            quality: Quality::Saver,
            output_dir: root.path().into(),
        })?;
        let part = Accepted::new(DownloadIntent {
            url: "https://bilibili.com/video/BV17x411w7KC?p=1".into(),
            quality: Quality::Saver,
            output_dir: root.path().into(),
        })?;
        assert_ne!(
            single.object.provisional_key(),
            part.object.provisional_key()
        );
        let meta = json!({"id":"BV17x411w7KC","extractor_key":"BiliBili","title":"single"});
        assert!(single.identity(&meta).is_ok());
        assert!(part.identity(&meta).is_err());
        Ok(())
    }
    #[test]
    fn corrupt_saved_defaults_are_reported_instead_of_acknowledging_an_unsaved_fallback()
    -> Result<(), String> {
        let root = tempfile::tempdir().map_err(|e| e.to_string())?;
        let path = root.path().join("defaults.json");
        fs::write(&path, b"{broken-private-path").map_err(|e| e.to_string())?;
        let error = Settings::load(&path, defaults(root.path()))
            .err()
            .ok_or("Corrupt settings unexpectedly loaded")?;
        assert!(error.contains("E_SETTINGS_READ"));
        assert!(!error.contains("private"));
        Ok(())
    }
    #[test]
    fn preparation_started_panic_refuses_phantom_cleanup_and_stop() -> Result<(), String> {
        use std::sync::atomic::Ordering;
        let root = tempfile::tempdir().map_err(|e| e.to_string())?;
        let backend = fake_backend(root.path());
        *lock(&backend.shared.preparation_test) = Some(Arc::new(|_, _| {
            panic!("test-only started preparation panic, no native process");
        }));
        // Startup preparation can now fail before later admission. Seed the pending
        // Job before starting the owner to test the intended unresolved-Job barrier.
        let job = backend.submit("https://youtu.be/00000000001".into())?;
        let shared = backend.shared.clone();
        let owner = thread::spawn(move || dispatch(shared));
        struct DispatchGuard(Arc<Shared>);
        impl Drop for DispatchGuard {
            fn drop(&mut self) {
                self.0.dispatch_test_exit.store(true, Ordering::Release);
            }
        }
        let guard = DispatchGuard(backend.shared.clone());
        let started = Instant::now();
        while !backend
            .shared
            .preparation_test_joined
            .load(Ordering::Acquire)
        {
            assert!(
                started.elapsed() < Duration::from_secs(5),
                "preparation join deadline"
            );
            thread::sleep(Duration::from_millis(5));
        }
        let control = lock(&backend.shared.preparation_control).clone();
        let epoch = control.cleanup_revision();
        assert!(
            !backend.retry_cleanup(0),
            "finished/unwound owner cannot receive cleanup retry"
        );
        assert_eq!(control.cleanup_revision(), epoch);
        let view = backend.snapshot();
        assert!(view.preparation_owner_lost);
        assert!(!view.preparing);
        assert!(!view.preparation_held);
        assert_eq!(view.unfinished, 1);
        assert!(!view.jobs[0].resources_released);
        assert!(!backend.cancel(job));
        let error = backend
            .submit("https://youtu.be/00000000002".into())
            .unwrap_err();
        assert!(error.starts_with("E_RUNTIME_OWNER_LOST"));
        assert_eq!(backend.snapshot().jobs.len(), 1);
        backend.stop();
        let view = backend.snapshot();
        assert!(!view.stopped);
        assert!(!view.jobs[0].phase.terminal());
        assert_eq!(view.jobs[0].job_id, job);
        assert_eq!(view.jobs[0].terminal_count, 0);
        drop(guard);
        let started = Instant::now();
        while !owner.is_finished() {
            assert!(started.elapsed() < Duration::from_secs(5));
            thread::sleep(Duration::from_millis(5));
        }
        owner.join().map_err(|_| "test dispatcher panicked")?;
        Ok(())
    }
    #[test]
    fn preparation_unwind_clears_retry_recipient_before_dispatch_can_join() -> Result<(), String> {
        let root = tempfile::tempdir().map_err(|e| e.to_string())?;
        let backend = fake_backend(root.path());
        let job = backend.submit("https://youtu.be/00000000001".into())?;
        let shared = backend.shared.clone();
        let owner = thread::spawn(move || {
            *lock(&shared.preparation_owner_live) = true;
            let _recipient = PreparationOwnerGuard(shared.clone());
            // Only seed a stale observer bit to test refusal, not native Held recovery.
            lock(&shared.model).preparation_held = true;
            panic!("test-only unwind before dispatcher join");
        });
        let started = Instant::now();
        while !owner.is_finished() {
            assert!(started.elapsed() < Duration::from_secs(5));
            thread::sleep(Duration::from_millis(5));
        }
        assert!(
            backend.snapshot().preparation_owner_lost,
            "unwind must be recognized before dispatcher join"
        );
        assert!(!lock(&backend.shared.model).preparation_held);
        assert!(!*lock(&backend.shared.preparation_owner_live));
        let control = lock(&backend.shared.preparation_control).clone();
        let epoch = control.cleanup_revision();
        assert!(!backend.retry_cleanup(0));
        assert_eq!(control.cleanup_revision(), epoch);
        assert!(!backend.snapshot().preparation_held);
        assert!(
            !backend.cancel(job),
            "pre-join unwind must not become a released terminal during Cancel"
        );
        let error = backend
            .submit("https://youtu.be/00000000002".into())
            .unwrap_err();
        assert!(error.starts_with("E_RUNTIME_OWNER_LOST"));
        assert_eq!(
            backend.snapshot().jobs.len(),
            1,
            "pre-join unwind cannot admit a new pending Job"
        );
        backend.stop();
        let view = backend.snapshot();
        let pending = view
            .jobs
            .iter()
            .find(|record| record.job_id == job)
            .unwrap();
        assert!(
            !pending.phase.terminal(),
            "pre-join unwind must not become a released terminal during Stop"
        );
        assert!(!pending.resources_released);
        assert_eq!(pending.terminal_count, 0);
        assert_eq!(view.unfinished, 1);
        assert!(!view.stopped);
        assert!(owner.join().is_err());
        Ok(())
    }
    #[test]
    fn preparation_cleanup_zero_refuses_stale_held_without_a_live_recipient() -> Result<(), String>
    {
        let root = tempfile::tempdir().map_err(|e| e.to_string())?;
        let backend = fake_backend(root.path());
        assert!(!backend.retry_cleanup(0));
        {
            let mut model = lock(&backend.shared.model);
            model.preparing = true;
            model.preparation_held = true;
            backend.shared.publish(&model);
        }
        let control = lock(&backend.shared.preparation_control).clone();
        let baseline = control.cleanup_revision();
        assert!(!backend.retry_cleanup(0));
        assert_eq!(control.cleanup_revision(), baseline);
        let view = backend.snapshot();
        assert!(!view.preparation_held);
        assert!(view.preparing);
        assert!(!view.stopped);
        assert_eq!(view.active_slots, 0);
        assert!(view.jobs.is_empty());
        Ok(())
    }
    #[test]
    fn native_shared_preparation_held_retry_waits_for_settlement_and_outer_join()
    -> Result<(), String> {
        use super::super::process_supervisor::{
            ProcessSpec, SettlementFacts, run_with_test_query_failure,
        };
        use std::sync::atomic::{AtomicBool, Ordering};
        let native_root = preparation_fixture::case("queue-shared-preparation-held");
        let output = tempfile::tempdir().map_err(|e| e.to_string())?;
        let backend = fake_backend(output.path());
        let query_failure = Arc::new(AtomicBool::new(true));
        let hold_completion = Arc::new(AtomicBool::new(true));
        let facts = Arc::new(Mutex::new(None::<SettlementFacts>));
        let recorded = facts.clone();
        let query = query_failure.clone();
        let finish = hold_completion.clone();
        let spec = ProcessSpec {
            executable: preparation_fixture::fixture(),
            args: vec![
                "tree".into(),
                native_root.join("markers.txt").to_string_lossy().into(),
            ],
            cwd: native_root.clone(),
            env: vec![("PATH".into(), String::new())],
            stdout_limit: 4 * 1024 * 1024,
            stderr_limit: 1024 * 1024,
            timeout: None,
        };
        *lock(&backend.shared.preparation_test) = Some(Arc::new(move |control, observer| {
            let callback_facts = recorded.clone();
            let outcome = run_with_test_query_failure(
                spec.clone(),
                &control,
                Arc::new(move |event| {
                    let settled = match &event {
                        ProcessObservation::Settled(facts) => Some(facts.clone()),
                        _ => None,
                    };
                    observer(event);
                    if let Some(facts) = settled {
                        *lock(&callback_facts) = Some(facts);
                    }
                }),
                query.clone(),
            );
            preparation_fixture::write_record(
                &spec.cwd,
                "native-run-result.txt",
                format!("{outcome:#?}"),
            );
            let started = Instant::now();
            while finish.load(Ordering::Acquire) {
                assert!(
                    started.elapsed() < Duration::from_secs(10),
                    "test-only outer completion gate"
                );
                thread::sleep(Duration::from_millis(5));
            }
            Err(native_diagnostics::classify(
                &Phase::Preparing,
                "Cancelled after native test preparation settlement",
            ))
        }));
        struct Recovery {
            shared: Arc<Shared>,
            query: Arc<AtomicBool>,
            finish: Arc<AtomicBool>,
        }
        impl Drop for Recovery {
            fn drop(&mut self) {
                self.query.store(false, Ordering::Release);
                self.finish.store(false, Ordering::Release);
                let control = lock(&self.shared.preparation_control).clone();
                control.cancel();
                control.retry_cleanup();
                self.shared
                    .dispatch_test_exit
                    .store(true, Ordering::Release);
            }
        }
        let _recovery = Recovery {
            shared: backend.shared.clone(),
            query: query_failure.clone(),
            finish: hold_completion.clone(),
        };
        let shared = backend.shared.clone();
        let owner = thread::spawn(move || dispatch(shared));
        backend.submit("https://youtu.be/00000000003".into())?;
        let marker = native_root.join("markers.txt");
        preparation_fixture::wait_for(
            || backend.snapshot().preparation_held && preparation_fixture::tree_ready(&marker),
            "real shared preparation Held tree",
        );
        let handles = preparation_fixture::retain_tree(&marker);
        assert_eq!(handles.len(), 3);
        assert!(handles.iter().all(|handle| !handle.stopped()));
        let view = backend.snapshot();
        assert!(view.preparing);
        assert!(!view.preparation_owner_lost);
        assert_eq!(view.active_slots, 0);
        backend.stop();
        assert!(backend.retry_cleanup(0));
        thread::sleep(Duration::from_millis(75));
        assert!(
            !backend.snapshot().stopped,
            "failed native query cannot authorize stop"
        );
        assert!(lock(&facts).is_none());
        query_failure.store(false, Ordering::Release);
        assert!(backend.retry_cleanup(0));
        preparation_fixture::wait_for(|| lock(&facts).is_some(), "native settlement facts");
        let settled = lock(&facts).clone().ok_or("Missing native facts")?;
        assert!(settled.resources_releasable());
        assert!(settled.membership_verified_before_resume);
        assert!(handles.iter().all(|handle| handle.stopped()));
        assert!(
            !backend.snapshot().stopped,
            "native settlement alone is not outer owner join"
        );
        assert!(
            !backend
                .shared
                .preparation_test_joined
                .load(Ordering::Acquire)
        );
        assert!(
            !backend.retry_cleanup(0),
            "settled native process is no longer Held despite the still-live outer thread"
        );
        // An owner whose native Held process has settled is completing, not a cleanup recipient.
        hold_completion.store(false, Ordering::Release);
        preparation_fixture::wait_for(|| backend.snapshot().stopped, "outer join then stopped");
        assert!(
            !backend.snapshot().preparation_owner_lost,
            "normal Err with settled facts is not an outer unwind"
        );
        assert!(
            backend
                .shared
                .preparation_test_joined
                .load(Ordering::Acquire)
        );
        assert!(!backend.retry_cleanup(0));
        preparation_fixture::wait_for(|| owner.is_finished(), "queue owner exit");
        owner
            .join()
            .map_err(|_| "Native shared preparation dispatcher panic")?;
        preparation_fixture::write_record(
            &native_root,
            "facts.txt",
            format!("{settled:#?}\nfinal={:#?}", backend.snapshot()),
        );
        Ok(())
    }
    #[test]
    #[ignore = "Requires genuine production-prepared cache via AMEOW_RUNTIME_TEST_ROOT"]
    fn native_queued_destination_disappearance_fails_without_substituting_new_defaults()
    -> Result<(), String> {
        let root =
            PathBuf::from(std::env::var("AMEOW_RUNTIME_TEST_ROOT").map_err(|e| e.to_string())?);
        let output = tempfile::tempdir().map_err(|e| e.to_string())?;
        let backend = composition::download_coordinator(
            root,
            output.path().join("defaults.json"),
            defaults(output.path()),
        )?;
        *lock(&backend.shared.probe) = Some(Arc::new(super::super::TestProbe {
            query_failure: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            owner_panic: false,
            stage_cleanup: true,
        }));
        for n in 1..=3 {
            backend.submit(format!("https://youtu.be/{n:011}"))?;
        }
        wait_until(&backend, |v| {
            v.active_slots == 3 && v.jobs.iter().all(|j| j.phase == JobPhase::Held)
        })?;
        let destination = output.path().join("queued-destination");
        fs::create_dir(&destination).map_err(|e| e.to_string())?;
        let frozen = backend.save_settings(Settings {
            quality: Quality::Saver,
            output_dir: destination.clone(),
        })?;
        let queued = backend.submit("https://youtu.be/jNQXAC9IVRw".into())?;
        fs::remove_dir(&destination).map_err(|e| e.to_string())?;
        backend.save_settings(defaults(output.path()))?;
        let stages: Vec<_> = {
            let model = lock(&backend.shared.model);
            model
                .records
                .values()
                .filter_map(|r| {
                    r.running
                        .as_ref()
                        .map(|a| (r.view.job_id, a.runner.snapshot().destination_stage))
                })
                .collect()
        };
        for (job, stage) in stages {
            let stage = stage.ok_or("Missing exact stage")?;
            clear_fixture_readonly(&stage)?;
            assert!(backend.retry_cleanup(job));
        }
        let finished = wait_until(&backend, |v| v.unfinished == 0)?;
        let job = finished
            .jobs
            .iter()
            .find(|j| j.job_id == queued)
            .ok_or("Missing queued Job")?;
        assert_eq!(job.phase, JobPhase::Failure);
        assert_eq!(job.attempt, 1);
        assert_eq!(
            job.failure
                .as_ref()
                .ok_or("Missing classified failure")?
                .code,
            "E_STORAGE"
        );
        assert_eq!(job.accepted.intent.output_dir, frozen.output_dir);
        assert_eq!(job.accepted.intent.quality, Quality::Saver);
        assert!(job.delivered.is_none());
        assert!(job.identity.is_none());
        assert!(
            job.events
                .iter()
                .all(|event| !event.kind.starts_with("process-settled:"))
        );
        backend.stop();
        wait_until(&backend, |v| v.stopped)?;
        Ok(())
    }
    #[test]
    #[ignore = "Requires genuine production-prepared cache via AMEOW_RUNTIME_TEST_ROOT"]
    fn native_held_three_slots_stop_retains_exact_partials_until_cleanup_and_join()
    -> Result<(), String> {
        let root =
            PathBuf::from(std::env::var("AMEOW_RUNTIME_TEST_ROOT").map_err(|e| e.to_string())?);
        let output = tempfile::tempdir().map_err(|e| e.to_string())?;
        let backend = composition::download_coordinator(
            root.clone(),
            output.path().join("defaults.json"),
            defaults(output.path()),
        )?;
        *lock(&backend.shared.probe) = Some(Arc::new(super::super::TestProbe {
            query_failure: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            owner_panic: false,
            stage_cleanup: true,
        }));
        for n in 1..=4 {
            backend.submit(format!("https://youtu.be/{n:011}"))?;
        }
        let held = wait_until(&backend, |v| {
            v.active_slots == 3 && v.jobs.iter().filter(|j| j.phase == JobPhase::Held).count() == 3
        })?;
        assert_eq!(held.jobs[3].attempt, 0);
        assert_eq!(held.jobs[3].phase, JobPhase::Queued);
        assert!(backend.cancel(2));
        {
            let model = lock(&backend.shared.model);
            for job in [1, 3] {
                assert!(
                    !lock(
                        &model
                            .records
                            .get(&job)
                            .ok_or("Missing Job")?
                            .running
                            .as_ref()
                            .ok_or("Missing attempt")?
                            .runner
                            .state
                    )
                    .control
                    .is_cancelled()
                );
            }
        }
        let mut owned = Vec::new();
        {
            let model = lock(&backend.shared.model);
            for record in model.records.values().filter(|r| r.view.slot_owned) {
                let snapshot = record
                    .running
                    .as_ref()
                    .ok_or("Missing owner")?
                    .runner
                    .snapshot();
                owned.push((
                    record.view.job_id,
                    snapshot.destination_stage.ok_or("Lost partial")?,
                    snapshot.workspace.ok_or("Lost workspace")?,
                    snapshot.runtime_digest.ok_or("Lost lease")?,
                ));
            }
        }
        backend.stop();
        thread::sleep(Duration::from_millis(100));
        let stopping = backend.snapshot();
        assert!(!stopping.stopped);
        assert_eq!(stopping.active_slots, 3);
        assert_eq!(stopping.jobs[3].phase, JobPhase::Cancelled);
        for (job, partial, workspace, digest) in &owned {
            assert!(partial.is_file());
            assert!(workspace.is_dir());
            assert!(
                fs::OpenOptions::new()
                    .write(true)
                    .open(root.join(format!("runtime-{digest}")).join("deno.exe"))
                    .is_err()
            );
            clear_fixture_readonly(partial)?;
            assert!(backend.retry_cleanup(*job));
        }
        let stopped = wait_until(&backend, |v| v.stopped)?;
        assert_eq!(stopped.active_slots, 0);
        assert!(
            stopped
                .jobs
                .iter()
                .all(|j| j.terminal_count == 1 && j.resources_released)
        );
        for (_, partial, workspace, digest) in owned {
            assert!(!partial.exists());
            assert!(!workspace.exists());
            assert!(
                fs::OpenOptions::new()
                    .write(true)
                    .open(root.join(format!("runtime-{digest}")).join("deno.exe"))
                    .is_ok()
            );
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct QueueSnapshot {
    pub revision: u64,
    pub jobs: Vec<JobSnapshot>,
    pub settings: Settings,
    pub unfinished: usize,
    pub failures: usize,
    pub active_slots: usize,
    pub preparing: bool,
    pub preparation: PreparationSnapshot,
    pub preparation_held: bool,
    /// The outer preparation owner unwound without verified process/file settlement facts.
    pub preparation_owner_lost: bool,
    pub stopping: bool,
    pub stopped: bool,
    pub main_job: Option<u64>,
}
pub enum QueueCommand {
    Submit { url: String },
    SaveSettings(Settings),
    Cancel(u64),
    Retry(u64),
    RetryCleanup(u64),
    Stop,
    CopyDiagnostic(u64),
    RetryPreparation,
    CopyPreparationDiagnostic,
}
#[derive(Clone, Debug)]
pub enum CommandReply {
    Accepted(u64),
    SettingsSaved(Settings),
    Applied(bool),
    Stopping,
    Diagnostic(String),
    Error(String),
}

struct RunningAttempt {
    runner: Arc<Coordinator>,
    owner: JoinHandle<()>,
    seen_revision: u64,
    seen_settlements: usize,
}
struct Record {
    view: JobSnapshot,
    running: Option<RunningAttempt>,
    frozen_identity: Option<String>,
    history: Vec<Failure>,
    cancelled: bool,
}
struct Model {
    records: BTreeMap<u64, Record>,
    ready: VecDeque<u64>,
    next_job: u64,
    next_start: u64,
    revision: u64,
    settings: Settings,
    preparing: bool,
    preparation: PreparationSnapshot,
    preparation_requested: bool,
    preparation_held: bool,
    preparation_owner_lost: bool,
    stopping: bool,
    stopped: bool,
}
impl Model {
    fn mark_preparation_owner_lost(&mut self) {
        if self.preparation_owner_lost {
            return;
        }
        // Unexpected unwind provides no SettlementFacts or physical-resource proof.
        // Reserve unresolved accounting before any command can manufacture release.
        self.preparation_owner_lost = true;
        self.preparing = false;
        self.preparation_held = false;
        self.revision += 1;
        for record in self
            .records
            .values_mut()
            .filter(|r| !r.view.phase.terminal() && !r.view.slot_owned)
        {
            record.view.phase = JobPhase::Preparing;
            record.view.resources_released = false;
            record.view.message =
                "Runtime preparation owner ended; cleanup unconfirmed; safe exit blocked".into();
            record.view.revision += 1;
        }
    }
    fn new(settings: Settings) -> Self {
        Self {
            records: BTreeMap::new(),
            ready: VecDeque::new(),
            next_job: 0,
            next_start: 0,
            revision: 0,
            settings,
            preparing: false,
            preparation: PreparationSnapshot::default(),
            preparation_requested: true,
            preparation_held: false,
            preparation_owner_lost: false,
            stopping: false,
            stopped: false,
        }
    }
    fn active(&self) -> usize {
        self.records.values().filter(|r| r.view.slot_owned).count()
    }
    fn event(&mut self, job: u64, kind: &str) {
        let active_slots = self.active();
        if let Some(record) = self.records.get_mut(&job) {
            record.view.revision += 1;
            if record.view.events.len() < 96 {
                record.view.events.push(JobEvent {
                    timestamp_ms: timestamp(),
                    attempt: record.view.attempt,
                    kind: kind.into(),
                    active_slots,
                    start_order: record.view.start_order,
                });
            }
        }
        self.revision += 1;
    }
    fn snapshot(&self) -> QueueSnapshot {
        let jobs: Vec<_> = self.records.values().map(|r| r.view.clone()).collect();
        QueueSnapshot {
            revision: self.revision,
            unfinished: jobs.iter().filter(|r| !r.phase.terminal()).count(),
            failures: jobs.iter().filter(|r| r.phase == JobPhase::Failure).count(),
            active_slots: self.active(),
            preparing: self.preparing,
            preparation: self.preparation.clone(),
            preparation_held: self.preparation_held,
            preparation_owner_lost: self.preparation_owner_lost,
            stopping: self.stopping,
            stopped: self.stopped,
            settings: self.settings.clone(),
            main_job: jobs
                .iter()
                .filter(|r| r.slot_owned)
                .min_by_key(|r| r.start_order)
                .map(|r| r.job_id),
            jobs,
        }
    }
    fn accept(&mut self, accepted: Accepted, frozen: Option<String>) -> Result<u64, String> {
        if self.stopping {
            return Err("E_STOPPING: Downloads are stopping".into());
        }
        if self.preparation_owner_lost {
            return Err("E_RUNTIME_OWNER_LOST: Runtime preparation ended without confirmed cleanup; further downloads are blocked".into());
        }
        let key = accepted.object.provisional_key();
        if let Some(existing) = self.records.values().find(|r| {
            !r.view.phase.terminal()
                && (r.view.accepted.object.provisional_key() == key
                    || r.frozen_identity.as_ref() == Some(&key)
                    || r.view
                        .identity
                        .as_ref()
                        .is_some_and(|id| id.canonical_key() == key)
                    || frozen.as_ref().is_some_and(|key| {
                        r.frozen_identity.as_ref() == Some(key)
                            || r.view
                                .identity
                                .as_ref()
                                .is_some_and(|id| id.canonical_key() == *key)
                    }))
        }) {
            return Err(format!(
                "E_DUPLICATE: Existing unfinished Job {}",
                existing.view.job_id
            ));
        }
        self.next_job = self
            .next_job
            .checked_add(1)
            .ok_or("E_LIMIT: Job IDs exhausted")?;
        let job = self.next_job;
        self.records.insert(
            job,
            Record {
                view: JobSnapshot {
                    job_id: job,
                    revision: 0,
                    attempt: 0,
                    phase: if self.preparing || self.preparation.phase == PreparationPhase::Failed {
                        JobPhase::Preparing
                    } else {
                        JobPhase::Queued
                    },
                    accepted,
                    identity: None,
                    title: "Waiting for video identity".into(),
                    message: if self.preparation.phase == PreparationPhase::Failed {
                        self.preparation.failure.as_ref().map_or_else(
                            || "Components failed; waiting for manual preparation Retry".into(),
                            |failure| format!("{}; waiting for manual preparation Retry", failure.safe().message),
                        )
                    } else if self.preparing {
                        "Waiting for shared download components".into()
                    } else {
                        "Queued in acceptance order".into()
                    },
                    failure: None,
                    transfer_progress: None,
                    delivered: None,
                    slot_owned: false,
                    resources_released: true,
                    start_order: None,
                    terminal_count: 0,
                    events: Vec::new(),
                },
                running: None,
                frozen_identity: frozen,
                history: Vec::new(),
                cancelled: false,
            },
        );
        self.ready.push_back(job);
        self.event(job, "accepted");
        Ok(job)
    }
    fn terminal(&mut self, job: u64, phase: JobPhase) {
        if let Some(record) = self.records.get_mut(&job) {
            if record.view.phase.terminal() || record.view.slot_owned {
                return;
            }
            record.view.phase = phase;
            record.view.transfer_progress = None;
            record.view.resources_released = true;
            record.view.slot_owned = false;
            record.view.terminal_count += 1;
        }
        self.event(job, "logical-terminal");
    }
    fn launch(&mut self) -> Option<u64> {
        if self.stopping || self.preparation_owner_lost || self.active() >= MAX_SLOTS {
            return None;
        }
        while let Some(job) = self.ready.pop_front() {
            let record = self.records.get_mut(&job)?;
            if record.view.phase.terminal()
                || record.cancelled
                || record.view.slot_owned
                || record.view.attempt != 0
            {
                continue;
            }
            self.next_start += 1;
            record.view.attempt += 1;
            record.view.phase = JobPhase::Resolving;
            record.view.slot_owned = true;
            record.view.resources_released = false;
            record.view.start_order = Some(self.next_start);
            record.view.failure = None;
            record.view.transfer_progress = None;
            self.event(job, "slot-start");
            return Some(job);
        }
        None
    }
    // Called ONLY after resources_released AND actual attempt-owner join.
    fn settled(&mut self, job: u64, snapshot: Snapshot) {
        let Some(record) = self.records.get_mut(&job) else {
            return;
        };
        if record.view.phase.terminal() {
            return;
        }
        record.view.slot_owned = false;
        record.view.transfer_progress = None;
        record.view.resources_released = true;
        record.running = None;
        record.view.delivered = snapshot.delivered.as_ref().map(|media| DeliveredFile {
            path: media.path.clone(),
            bytes: media.bytes,
            sha256: media.sha256.clone(),
        });
        self.event(job, "attempt-joined-slot-release");
        if snapshot.phase == Phase::Success {
            if let Some(record) = self.records.get_mut(&job) {
                record.view.message = "Verified media safely delivered".into();
            }
            self.terminal(job, JobPhase::Success);
            return;
        }
        let Some(record) = self.records.get_mut(&job) else {
            return;
        };
        if record.cancelled || self.stopping || snapshot.phase == Phase::Cancelled {
            record.view.message = "Cancelled after safe resource settlement".into();
            self.terminal(job, JobPhase::Cancelled);
            return;
        }
        let failure = snapshot
            .failure
            .unwrap_or_else(|| Failure::new(FailureCode::Unknown, "unknown"));
        record.history.push(failure.clone());
        record.view.failure = Some(failure.clone());
        record.view.message = format!("{}: {}", failure.code, failure.reason);
        if failure.code == "E_DUPLICATE" {
            self.terminal(job, JobPhase::Cancelled);
        } else {
            self.terminal(job, JobPhase::Failure);
        }
    }
}
fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis().min(u64::MAX as u128) as u64)
}
struct Shared {
    model: Mutex<Model>,
    published: Mutex<Arc<QueueSnapshot>>,
    manager: Arc<super::runtime::RuntimeManager>,
    services: DownloadServices,
    settings_path: PathBuf,
    command_gate: Mutex<()>,
    preparation_control: Mutex<Control>,
    // Cleanup retry and owner completion/unwind serialize on this gate. Held observations alone
    // cannot establish that a preparation owner still exists to receive the signal.
    preparation_owner_live: Mutex<bool>,
    #[cfg(test)]
    probe: Mutex<Option<Arc<super::TestProbe>>>,
    #[cfg(test)]
    preparation_test: Mutex<Option<PreparationTest>>,
    #[cfg(test)]
    dispatch_test_exit: std::sync::atomic::AtomicBool,
    #[cfg(test)]
    preparation_test_joined: std::sync::atomic::AtomicBool,
}
#[cfg(test)]
type PreparationTest = Arc<
    dyn Fn(
            Control,
            Arc<dyn Fn(ProcessObservation) + Send + Sync>,
        ) -> Result<Arc<RuntimeLease>, Failure>
        + Send
        + Sync,
>;
impl Shared {
    fn publish(&self, model: &Model) {
        let mut snapshot = model.snapshot();
        snapshot.preparation_held &= *lock(&self.preparation_owner_live);
        *lock(&self.published) = Arc::new(snapshot);
    }
}
struct PreparationOwnerGuard(Arc<Shared>);
impl Drop for PreparationOwnerGuard {
    fn drop(&mut self) {
        // Commands and owner-loss recognition serialize on the model lock. Mark
        // unwind before clearing the recipient, so no pre-join command can mistake
        // an ended owner for ordinary completion and publish a released terminal.
        let mut model = lock(&self.0.model);
        if thread::panicking() {
            model.mark_preparation_owner_lost();
        }
        *lock(&self.0.preparation_owner_live) = false;
        model.revision += 1;
        self.0.publish(&model);
    }
}
pub struct DownloadCoordinator {
    shared: Arc<Shared>,
}
impl DownloadCoordinator {
    pub fn new(
        services: DownloadServices,
        settings_path: PathBuf,
        defaults: Settings,
    ) -> Result<Self, String> {
        let settings = Settings::load(&settings_path, defaults)?;
        let model = Model::new(settings);
        let published = Mutex::new(Arc::new(model.snapshot()));
        let shared = Arc::new(Shared {
            model: Mutex::new(model),
            published,
            manager: services.runtime.clone(),
            services,
            settings_path,
            command_gate: Mutex::new(()),
            preparation_control: Mutex::new(Control::default()),
            preparation_owner_live: Mutex::new(false),
            #[cfg(test)]
            probe: Mutex::new(None),
            #[cfg(test)]
            preparation_test: Mutex::new(None),
            #[cfg(test)]
            dispatch_test_exit: std::sync::atomic::AtomicBool::new(false),
            #[cfg(test)]
            preparation_test_joined: std::sync::atomic::AtomicBool::new(false),
        });
        let worker = shared.clone();
        thread::Builder::new()
            .name("download-queue-owner".into())
            .spawn(move || dispatch(worker))
            .map_err(|_| "E_RUNTIME: Cannot create queue owner")?;
        Ok(Self { shared })
    }
    pub fn snapshot(&self) -> QueueSnapshot {
        let view = lock(&self.shared.published).clone();
        (*view).clone()
    }
    pub fn submit(&self, url: String) -> Result<u64, String> {
        let _ordered = lock(&self.shared.command_gate);
        let settings = lock(&self.shared.model).settings.clone();
        let accepted = Accepted::new(DownloadIntent {
            url,
            quality: settings.quality,
            output_dir: settings.output_dir,
        })
        .map_err(|_| "E_INPUT: Use a public single-video URL and existing destination")?;
        let mut model = lock(&self.shared.model);
        let job = model.accept(accepted, None)?;
        self.shared.publish(&model);
        Ok(job)
    }
    pub fn save_settings(&self, settings: Settings) -> Result<Settings, String> {
        let _ordered = lock(&self.shared.command_gate);
        if lock(&self.shared.model).stopping {
            return Err("E_STOPPING: Downloads are stopping".into());
        }
        let saved = settings.persist(&self.shared.settings_path)?;
        let mut model = lock(&self.shared.model);
        model.settings = saved.clone();
        model.revision += 1;
        self.shared.publish(&model);
        Ok(saved)
    }
    pub fn cancel(&self, job: u64) -> bool {
        let mut model = lock(&self.shared.model);
        let unresolved_preparation = model.preparation_owner_lost;
        let Some(record) = model.records.get_mut(&job) else {
            return false;
        };
        if record.view.phase.terminal() || (record.view.slot_owned && record.running.is_none()) {
            return false;
        }
        if unresolved_preparation && !record.view.slot_owned {
            return false;
        }
        if let Some(attempt) = &record.running {
            if !attempt.runner.cancel(job) {
                return false;
            }
            record.cancelled = true;
            record.view.transfer_progress = None;
            record.view.message = "Cancellation requested; waiting for ownership barriers".into();
            model.event(job, "cancel-requested");
        } else {
            record.cancelled = true;
            record.view.message = "Cancelled before execution".into();
            model.terminal(job, JobPhase::Cancelled);
        }
        self.shared.publish(&model);
        true
    }
    pub fn retry(&self, failed_job: u64) -> Result<u64, String> {
        let _ordered = lock(&self.shared.command_gate);
        let mut model = lock(&self.shared.model);
        let old = model
            .records
            .get(&failed_job)
            .ok_or("E_RETRY: Unknown Job")?;
        if old.view.phase != JobPhase::Failure {
            return Err("E_RETRY: Only final Failure creates a new Job".into());
        }
        if matches!(
            old.view.accepted.object,
            super::request::Object::BilibiliShort { .. }
        ) && old.frozen_identity.is_none()
            && old.view.identity.is_none()
        {
            return Err("E_RETRY: Short-link media identity was not established; use a canonical single-video URL".into());
        }
        let accepted = old.view.accepted.clone();
        let frozen = old
            .frozen_identity
            .clone()
            .or_else(|| old.view.identity.as_ref().map(Identity::canonical_key));
        let job = model.accept(accepted, frozen)?;
        self.shared.publish(&model);
        Ok(job)
    }
    pub fn retry_cleanup(&self, job: u64) -> bool {
        let model = lock(&self.shared.model);
        // Zero addresses shared preparation, including after stop withdraws all pending Jobs.
        if job == 0 {
            return self.retry_preparation_cleanup(&model);
        }
        let Some(record) = model.records.get(&job) else {
            return false;
        };
        if let Some(attempt) = &record.running {
            return attempt.runner.retry_cleanup(job);
        }
        self.retry_preparation_cleanup(&model)
    }
    fn retry_preparation_cleanup(&self, model: &Model) -> bool {
        let live = lock(&self.shared.preparation_owner_live);
        if model.preparation_held && !model.preparation_owner_lost && *live {
            lock(&self.shared.preparation_control).retry_cleanup();
            return true;
        }
        false
    }
    pub fn stop(&self) {
        stop_shared(&self.shared);
    }
    pub fn diagnostic(&self, job: u64) -> Result<String, String> {
        let model = lock(&self.shared.model);
        let record = model.records.get(&job).ok_or("E_DIAGNOSTIC: Unknown Job")?;
        if record.view.phase != JobPhase::Failure {
            return Err("E_DIAGNOSTIC: Only final Failure has copy diagnostics".into());
        }
        Ok(diagnostics::copy_with_versions(
            job,
            record.view.accepted.object.site(),
            &record.history,
            &self.shared.services.adapter.requirements().versions(),
        ))
    }
    pub fn apply(&self, command: QueueCommand) -> CommandReply {
        match command {
            QueueCommand::RetryPreparation => CommandReply::Applied(self.retry_preparation()),
            QueueCommand::CopyPreparationDiagnostic => {
                CommandReply::Diagnostic(self.snapshot().preparation.diagnostic())
            }
            QueueCommand::Submit { url } => self
                .submit(url)
                .map(CommandReply::Accepted)
                .unwrap_or_else(CommandReply::Error),
            QueueCommand::SaveSettings(settings) => self
                .save_settings(settings)
                .map(CommandReply::SettingsSaved)
                .unwrap_or_else(CommandReply::Error),
            QueueCommand::Cancel(job) => CommandReply::Applied(self.cancel(job)),
            QueueCommand::Retry(job) => self
                .retry(job)
                .map(CommandReply::Accepted)
                .unwrap_or_else(CommandReply::Error),
            QueueCommand::RetryCleanup(job) => CommandReply::Applied(self.retry_cleanup(job)),
            QueueCommand::CopyDiagnostic(job) => self
                .diagnostic(job)
                .map(CommandReply::Diagnostic)
                .unwrap_or_else(CommandReply::Error),
            QueueCommand::Stop => {
                self.stop();
                CommandReply::Stopping
            }
        }
    }
    pub fn retry_preparation(&self) -> bool {
        let _ordered = lock(&self.shared.command_gate);
        let mut model = lock(&self.shared.model);
        if model.stopping
            || model.preparing
            || model.preparation_held
            || model.preparation_owner_lost
            || model.preparation_requested
            || model.preparation.phase != PreparationPhase::Failed
        {
            return false;
        }
        model.preparation_requested = true;
        model.revision += 1;
        self.shared.publish(&model);
        true
    }
}
impl Drop for DownloadCoordinator {
    fn drop(&mut self) {
        self.stop();
    }
}
fn stop_shared(shared: &Shared) {
    let mut model = lock(&shared.model);
    if model.stopping {
        return;
    }
    model.stopping = true;
    model.revision += 1;
    lock(&shared.preparation_control).cancel();
    let jobs: Vec<_> = model.records.keys().copied().collect();
    let unresolved_preparation = model.preparation_owner_lost;
    for job in jobs {
        if let Some(record) = model.records.get_mut(&job) {
            record.view.transfer_progress = None;
            if record.view.phase.terminal() {
                continue;
            }
            if let Some(attempt) = &record.running {
                // Publication arbitration stays with Stage A; committed success survives stop/cancel.
                if attempt.runner.cancel(job) {
                    record.cancelled = true;
                }
                record.view.message = "Stopping; waiting for exact ownership settlement".into();
                model.event(job, "stop-requested");
            } else if !record.view.slot_owned {
                record.cancelled = true;
                if unresolved_preparation {
                    record.view.message =
                        "Runtime preparation owner ended; cleanup unconfirmed; safe exit blocked"
                            .into();
                } else {
                    record.view.message = "Withdrawn during stop".into();
                    model.terminal(job, JobPhase::Cancelled);
                }
            }
        }
    }
    model.ready.clear();
    shared.publish(&model);
}
pub fn run_commands(
    backend: Arc<DownloadCoordinator>,
    receiver: Receiver<QueueCommand>,
    replies: Sender<CommandReply>,
) {
    loop {
        match receiver.recv_timeout(Duration::from_millis(20)) {
            Ok(command) => {
                let _ = replies.send(backend.apply(command));
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {
                backend.stop();
                thread::sleep(Duration::from_millis(20));
            }
        }
        if backend.snapshot().stopped {
            break;
        }
    }
}

fn admit_identity(shared: &Shared, job: u64, proof: &IdentityAttestation) -> Result<(), String> {
    let mut model = lock(&shared.model);
    let identity = &proof.identity;
    let key = identity.canonical_key();
    let current = model
        .records
        .get(&job)
        .ok_or("E_IDENTITY: Unknown logical Job")?;
    if current.cancelled || model.stopping {
        return Err("Cancelled before identity admission".into());
    }
    if current
        .frozen_identity
        .as_ref()
        .is_some_and(|expected| *expected != key)
    {
        return Err("E_IDENTITY: Manual retry resolved a changed media object".into());
    }
    if proof.aliases.len() > 16
        || proof
            .aliases
            .iter()
            .any(|alias| alias.len() > 192 || !alias.is_ascii())
    {
        return Err("E_IDENTITY: bounded neutral alias contract violated".into());
    }
    let aliases = &proof.aliases;
    // Earlier accepted unresolved aliases win too; identity admission is serialized before transfer.
    if let Some(existing) = model.records.values().find(|record| {
        record.view.job_id != job
            && !record.view.phase.terminal()
            && (record.frozen_identity.as_ref() == Some(&key)
                || record
                    .view
                    .identity
                    .as_ref()
                    .is_some_and(|id| id.canonical_key() == key)
                || (record.view.job_id < job
                    && aliases.contains(&record.view.accepted.object.provisional_key())))
    }) {
        return Err(format!(
            "E_DUPLICATE: Existing unfinished Job {}",
            existing.view.job_id
        ));
    }
    let record = model
        .records
        .get_mut(&job)
        .ok_or("E_IDENTITY: Missing logical Job")?;
    record.frozen_identity = Some(key);
    record.view.identity = Some(identity.clone());
    record.view.title = diagnostics::safe_title(&identity.title);
    model.event(job, "identity-admitted");
    shared.publish(&model);
    Ok(())
}
fn project_attempt(model: &mut Model, job: u64, snapshot: &Snapshot) {
    let Some(record) = model.records.get_mut(&job) else {
        return;
    };
    let Some(running) = record.running.as_mut() else {
        return;
    };
    if snapshot.job_id != job
        || snapshot.attempt != u64::from(record.view.attempt)
        || snapshot.revision <= running.seen_revision
        || record.view.phase.terminal()
    {
        return;
    }
    running.seen_revision = snapshot.revision;
    record.view.transfer_progress =
        if snapshot.phase == Phase::Downloading && !record.cancelled && !model.stopping {
            snapshot.transfer_progress.clone()
        } else {
            None
        };
    let settlements: Vec<_> = snapshot
        .settlements
        .iter()
        .skip(running.seen_settlements)
        .cloned()
        .collect();
    running.seen_settlements = snapshot.settlements.len();
    // Internal attempt terminal never leaks as a logical terminal before the actual owner join.
    if !snapshot.phase.terminal() {
        record.view.phase = match snapshot.phase {
            Phase::Resolving => JobPhase::Resolving,
            Phase::Downloading => JobPhase::Downloading,
            Phase::Validating => JobPhase::Validating,
            Phase::Publishing => JobPhase::Publishing,
            Phase::Held => JobPhase::Held,
            _ => JobPhase::Resolving,
        };
        record.view.message = match snapshot.phase {
            Phase::Held => "Ownership retained; retry cleanup to continue",
            Phase::Downloading => "Downloading or merging selected video/audio",
            Phase::Validating => "Verifying delivered media",
            Phase::Publishing => "Saving verified media without overwrite",
            _ => "Resolving one accepted video",
        }
        .into();
    }
    if let Some(identity) = &snapshot.identity {
        record.view.identity = Some(identity.clone());
        record.view.title = diagnostics::safe_title(&identity.title);
    }
    record.view.revision += 1;
    model.revision += 1;
    for facts in settlements {
        model.event(job, &format!("process-settled: {facts}"));
    }
}
fn persist_preparation(shared: &Shared, history: &[super::preparation::PreparationEvent]) {
    // A separate safe history leaves the historical raw R11 evidence untouched.
    let result = (|| -> Result<(), std::io::Error> {
        use std::io::Write;
        let mut file = tempfile::NamedTempFile::new_in(&shared.manager.root)?;
        serde_json::to_writer(&mut file, history)?;
        file.flush()?;
        file.as_file().sync_all()?;
        file.persist(shared.manager.root.join("preparation-history.json"))
            .map_err(|e| e.error)?;
        Ok(())
    })();
    if result.is_err() {
        // Keep the failure in memory even if the same filesystem prevents diagnostic persistence.
        let mut model = lock(&shared.model);
        model.revision += 1;
        shared.publish(&model);
    }
}
fn observe_preparation(shared: &Shared, event: PreparationSnapshot) {
    let history = {
        let mut model = lock(&shared.model);
        let changed = model.preparation.observe(
            event.phase,
            event.component,
            event.stage,
            event.downloaded_bytes,
            event.total_bytes,
            event.failure,
        );
        model.revision += 1;
        shared.publish(&model);
        changed.then(|| model.preparation.history.clone())
    };
    if let Some(history) = history {
        persist_preparation(shared, &history);
    }
}
fn dispatch(shared: Arc<Shared>) {
    // Background-only bounded read. Never restore Jobs or infer a live preparation from disk.
    if let Ok(file) = std::fs::File::open(shared.manager.root.join("preparation-history.json")) {
        use std::io::Read;
        if let Ok(history) = serde_json::from_reader::<_, Vec<super::preparation::PreparationEvent>>(
            file.take(65537),
        ) && history.len() <= 96
        {
            let mut model = lock(&shared.model);
            model.preparation.attempt =
                history.iter().map(|event| event.attempt).max().unwrap_or(0);
            model.preparation.history = history;
            shared.publish(&model);
        }
    }

    let mut prepared: Option<Arc<RuntimeLease>> = None;
    let mut preparation: Option<JoinHandle<Result<Arc<RuntimeLease>, Failure>>> = None;
    loop {
        #[cfg(test)]
        if shared
            .dispatch_test_exit
            .load(std::sync::atomic::Ordering::Acquire)
        {
            break;
        }
        // Join only finished owners. Held attempt remains in its exact owning thread and retains slot.
        let finished: Vec<_> = {
            let mut model = lock(&shared.model);
            let jobs: Vec<_> = model.records.keys().copied().collect();
            let mut finished = Vec::new();
            for job in jobs {
                let snapshot = model
                    .records
                    .get(&job)
                    .and_then(|r| r.running.as_ref())
                    .map(|attempt| attempt.runner.snapshot());
                if let Some(snapshot) = snapshot {
                    project_attempt(&mut model, job, &snapshot);
                    let ready = snapshot.phase.terminal()
                        && snapshot.resources_released
                        && model
                            .records
                            .get(&job)
                            .and_then(|r| r.running.as_ref())
                            .is_some_and(|r| r.owner.is_finished());
                    if ready
                        && let Some(attempt) =
                            model.records.get_mut(&job).and_then(|r| r.running.take())
                    {
                        finished.push((job, attempt, snapshot));
                    }
                }
            }
            shared.publish(&model);
            finished
        };
        for (job, attempt, snapshot) in finished {
            let joined = attempt.owner.join();
            let mut model = lock(&shared.model);
            if joined.is_ok() {
                model.settled(job, snapshot);
            } else {
                // Unexpected unwind outside the ownership boundary cannot prove release.
                if let Some(record) = model.records.get_mut(&job) {
                    record.view.phase = JobPhase::Held;
                    record.view.message = "Attempt owner failed outside verified settlement".into();
                }
                model.event(job, "unverified-owner-held");
            }
            shared.publish(&model);
        }
        if preparation.as_ref().is_some_and(JoinHandle::is_finished)
            && let Some(owner) = preparation.take()
        {
            let result = owner.join();
            let mut model = lock(&shared.model);
            model.preparing = false;
            model.preparation_held = false;
            model.revision += 1;
            match result {
                Ok(Ok(lease)) => {
                    model.preparation.observe(
                        PreparationPhase::Ready,
                        None,
                        PreparationStage::Publish,
                        0,
                        None,
                        None,
                    );
                    prepared = Some(lease);
                    for record in model
                        .records
                        .values_mut()
                        .filter(|r| !r.view.phase.terminal() && !r.view.slot_owned)
                    {
                        record.view.phase = JobPhase::Queued;
                        record.view.message = "Queued in acceptance order".into();
                        record.view.revision += 1;
                    }
                }
                Ok(Err(failure)) => {
                    // Failed components stay discoverable without consuming media slots or
                    // manufacturing terminal media Jobs. An explicit preparation Retry resumes them.
                    if model.preparation.phase != PreparationPhase::Failed {
                        let safe = PreparationFailure::new(
                            RuntimeComponent::Runtime,
                            PreparationStage::Cache,
                            ErrorCategory::Unknown,
                        );
                        model.preparation.observe(
                            PreparationPhase::Failed,
                            Some(safe.component),
                            safe.stage,
                            0,
                            None,
                            Some(safe),
                        );
                    }
                    let message = model
                        .preparation
                        .failure
                        .as_ref()
                        .map(|f| format!("{}; waiting for manual preparation Retry", f.message))
                        .unwrap_or(failure.reason);
                    for record in model
                        .records
                        .values_mut()
                        .filter(|r| !r.view.phase.terminal() && !r.view.slot_owned)
                    {
                        record.view.phase = JobPhase::Preparing;
                        record.view.message = message.clone();
                        record.view.revision += 1;
                    }
                }
                Err(_) => {
                    // A consumed failed join is not a live native Held owner. No
                    // SettlementFacts prove physical retention or release after unwind.
                    model.mark_preparation_owner_lost();
                }
            }
            shared.publish(&model);
            let history = model.preparation.history.clone();
            drop(model);
            persist_preparation(&shared, &history);
            #[cfg(test)]
            shared
                .preparation_test_joined
                .store(true, std::sync::atomic::Ordering::Release);
        }
        let need_preparation = {
            let mut model = lock(&shared.model);
            let need = !model.stopping
                && prepared.is_none()
                && preparation.is_none()
                && !model.preparation_held
                && !model.preparation_owner_lost
                && model.preparation_requested;
            if need {
                *lock(&shared.preparation_control) = Control::default();
                model.preparing = true;
                model.preparation_requested = false;
                model.preparation.attempt = model.preparation.attempt.saturating_add(1);
                model.preparation.observe(
                    PreparationPhase::Preparing,
                    None,
                    PreparationStage::Cache,
                    0,
                    None,
                    None,
                );
                model.revision += 1;
                for record in model
                    .records
                    .values_mut()
                    .filter(|r| !r.view.phase.terminal() && !r.view.slot_owned)
                {
                    record.view.phase = JobPhase::Preparing;
                    record.view.message = "Preparing shared official runtime".into();
                    record.view.revision += 1;
                }
            }
            shared.publish(&model);
            need
        };
        if need_preparation {
            let control = lock(&shared.preparation_control).clone();
            let worker = shared.clone();
            let observer_shared = shared.clone();
            let observer = Arc::new(move |event: ProcessObservation| {
                if let ProcessObservation::Settled(_) = &event {
                    let mut model = lock(&observer_shared.model);
                    model.preparation_held = false;
                    model.revision += 1;
                    for record in model
                        .records
                        .values_mut()
                        .filter(|r| r.view.phase == JobPhase::Held && !r.view.slot_owned)
                    {
                        record.view.phase = JobPhase::Preparing;
                        record.view.message = "Preparing shared official runtime".into();
                        record.view.revision += 1;
                    }
                    observer_shared.publish(&model);
                }
                if let ProcessObservation::Held(_) = event {
                    let mut model = lock(&observer_shared.model);
                    if !*lock(&observer_shared.preparation_owner_live) {
                        return;
                    }
                    model.preparation_held = true;
                    model.revision += 1;
                    for record in model
                        .records
                        .values_mut()
                        .filter(|r| !r.view.phase.terminal() && !r.view.slot_owned)
                    {
                        record.view.phase = JobPhase::Held;
                        record.view.message =
                            "Shared runtime ownership retained; retry cleanup".into();
                        record.view.revision += 1;
                    }
                    observer_shared.publish(&model);
                }
            });
            let spawn = thread::Builder::new()
                .name("download-shared-preparation".into())
                .spawn(move || {
                    *lock(&worker.preparation_owner_live) = true;
                    let _recipient = PreparationOwnerGuard(worker.clone());
                    #[cfg(test)]
                    if let Some(test) = lock(&worker.preparation_test).clone() {
                        return test(control, observer);
                    }
                    let result = worker.manager.prepare_observed(
                        worker.services.adapter.requirements(),
                        &control,
                        observer,
                        |event| observe_preparation(&worker, event),
                    );
                    if let Err(failure) = &result {
                        let mut event = lock(&worker.model).preparation.clone();
                        event.phase = PreparationPhase::Failed;
                        event.component = Some(failure.component);
                        event.stage = failure.stage;
                        event.failure = Some(failure.clone());
                        observe_preparation(&worker, event);
                    }
                    result.map_err(|error| Failure {
                        code: "E_RUNTIME".into(),
                        stage: "runtime".into(),
                        reason: error.message,
                        suggestion: error.suggestion,
                    })
                });
            match spawn {
                Ok(owner) => preparation = Some(owner),
                Err(_) => {
                    let failure = Failure::new(FailureCode::Runtime, "runtime");
                    let mut model = lock(&shared.model);
                    model.preparing = false;
                    let safe = PreparationFailure::new(
                        RuntimeComponent::Runtime,
                        PreparationStage::Cache,
                        ErrorCategory::Unknown,
                    );
                    model.preparation.observe(
                        PreparationPhase::Failed,
                        Some(safe.component),
                        safe.stage,
                        0,
                        None,
                        Some(safe),
                    );
                    let jobs: Vec<_> = model
                        .records
                        .iter()
                        .filter(|(_, r)| !r.view.phase.terminal())
                        .map(|(job, _)| *job)
                        .collect();
                    for job in jobs {
                        if let Some(r) = model.records.get_mut(&job) {
                            r.history.push(failure.clone());
                            r.view.failure = Some(failure.clone());
                        }
                        model.terminal(job, JobPhase::Failure);
                    }
                    shared.publish(&model);
                }
            }
        }
        if let Some(lease) = &prepared {
            loop {
                let mut model = lock(&shared.model);
                let Some(job) = model.launch() else {
                    break;
                };
                let runner = Arc::new(Coordinator::with_services(shared.services.clone()));
                #[cfg(test)]
                {
                    lock(&runner.state).probe = lock(&shared.probe).clone();
                }
                let gate_shared = shared.clone();
                let admit = Arc::new(move |proof: &IdentityAttestation| {
                    admit_identity(&gate_shared, job, proof)
                });
                let Some(record) = model.records.get_mut(&job) else {
                    break;
                };
                let accepted = record.view.accepted.clone();
                let attempt = record.view.attempt;
                match runner.start_prepared(
                    accepted,
                    job,
                    attempt as u64,
                    PreparedAttempt {
                        lease: lease.clone(),
                        admit,
                    },
                ) {
                    Ok(owner) => {
                        record.running = Some(RunningAttempt {
                            runner,
                            owner,
                            seen_revision: 0,
                            seen_settlements: 0,
                        })
                    }
                    Err(_error) => model.settled(
                        job,
                        Snapshot {
                            phase: Phase::Failure,
                            resources_released: true,
                            failure: Some(Failure::new(FailureCode::Runtime, "runtime")),
                            ..Default::default()
                        },
                    ),
                }
                shared.publish(&model);
            }
        }
        let (stopping, no_ownership) = {
            let model = lock(&shared.model);
            (
                model.stopping,
                model.active() == 0
                    && !model.preparing
                    && !model.preparation_owner_lost
                    && preparation.is_none(),
            )
        };
        if stopping && no_ownership {
            drop(prepared.take());
            let mut model = lock(&shared.model);
            model.stopped = true;
            model.revision += 1;
            shared.publish(&model);
            break;
        }
        thread::sleep(Duration::from_millis(20));
    }
}
