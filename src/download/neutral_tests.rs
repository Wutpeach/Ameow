//! A synthetic Data adapter proves generic lifecycle, not public-site capability.
use super::{
    adapter::{DownloadServices, DownloaderAdapter, ExecutionContext},
    contract::{
        AdapterEvent, AdapterResult, ExecutionRequest, IdentityAttestation, MediaKind,
        ProducedArtifact, VerificationRequirements,
    },
    diagnostics::{Failure, FailureCode},
    queue::{DownloadCoordinator, JobPhase, QueueSnapshot},
    request::{Identity, Object, Quality, Site},
    runtime::{RuntimeManager, TrustedRuntimeRequirements},
    settings::Settings,
    verification::VerifierRegistry,
};
use std::{
    fs,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicU8, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

pub(crate) struct DataAdapter {
    pub(crate) requirements: TrustedRuntimeRequirements,
    pub(crate) mode: Arc<AtomicU8>,
}
impl DownloaderAdapter for DataAdapter {
    fn kind(&self) -> MediaKind {
        MediaKind::Data
    }
    fn requirements(&self) -> &TrustedRuntimeRequirements {
        &self.requirements
    }
    fn evidence_files(&self) -> &[(&str, u64)] {
        &[]
    }
    fn execute(&self, request: &ExecutionRequest, context: &ExecutionContext<'_>) -> AdapterResult {
        let Object::Youtube(id) = &request.accepted.object else {
            return Err(Failure::new(FailureCode::Identity, "admission"));
        };
        let identity = Identity {
            id: id.clone(),
            site: Site::Youtube,
            part: None,
            title: "Synthetic data fixture".into(),
        };
        context.emit(AdapterEvent::Resolving);
        context.admit(&IdentityAttestation {
            aliases: vec![identity.canonical_key()],
            identity: identity.clone(),
        })?;
        context.emit(AdapterEvent::Transferring);
        match self.mode.load(Ordering::Acquire) {
            1 => return Err(Failure::new(FailureCode::Unknown, "transfer")),
            2 => return Ok(ProducedArtifact { relative_path: PathBuf::from("../sentinel.bin"), identity, kind: MediaKind::Data, verification: VerificationRequirements::Data }),
            3 => {
                while !context.cancelled() {
                    thread::sleep(Duration::from_millis(10));
                }
                return Err(Failure::new(FailureCode::Cancelled, "cleanup"));
            }
            4 => {
                let foreign = Identity {
                    id: "dQw4w9WgXcQ".into(),
                    ..identity.clone()
                };
                return Ok(ProducedArtifact {
                    relative_path: PathBuf::from("artifact.bin"),
                    identity: foreign,
                    kind: MediaKind::Data,
                    verification: VerificationRequirements::Data,
                });
            }
            _ => {}
        }
        fs::write(
            context.workspace().join("artifact.bin"),
            b"neutral adapter artifact",
        )
        .map_err(|_| Failure::new(FailureCode::Storage, "transfer"))?;
        Ok(ProducedArtifact {
            relative_path: PathBuf::from("artifact.bin"),
            identity,
            kind: MediaKind::Data,
            verification: VerificationRequirements::Data,
        })
    }
}
fn setup(mode: u8) -> Result<(tempfile::TempDir, DownloadCoordinator, Arc<AtomicU8>), String> {
    let root = tempfile::tempdir().map_err(|e| e.to_string())?;
    let output = root.path().join("output");
    fs::create_dir(&output).map_err(|e| e.to_string())?;
    let mode = Arc::new(AtomicU8::new(mode));
    let services = DownloadServices {
        runtime: Arc::new(RuntimeManager::new(root.path().join("runtime"))),
        adapter: Arc::new(DataAdapter {
            requirements: TrustedRuntimeRequirements::empty(),
            mode: mode.clone(),
        }),
        verifiers: Arc::new(VerifierRegistry::data()),
    };
    let queue = DownloadCoordinator::new(
        services,
        root.path().join("settings.json"),
        Settings {
            quality: Quality::Balanced,
            output_dir: output, theme: Default::default(), language: Default::default(), tray_icon: Default::default(),
        },
    )?;
    Ok((root, queue, mode))
}
fn wait(
    queue: &DownloadCoordinator,
    check: impl Fn(&QueueSnapshot) -> bool,
) -> Result<QueueSnapshot, String> {
    let until = Instant::now() + Duration::from_secs(10);
    loop {
        let view = queue.snapshot();
        if check(&view) {
            return Ok(view);
        }
        if Instant::now() > until {
            return Err(format!("Synthetic lifecycle did not settle: {view:?}"));
        }
        thread::sleep(Duration::from_millis(10));
    }
}
fn stop(queue: &DownloadCoordinator) -> Result<(), String> {
    queue.stop();
    let view = wait(queue, |v| v.stopped)?;
    assert_eq!(view.active_slots, 0);
    assert!(!view.preparation_owner_lost);
    Ok(())
}
#[test]
fn neutral_data_adapter_delivers_through_real_lifecycle_without_video_tools() -> Result<(), String>
{
    let (_root, queue, _) = setup(0)?;
    let job = queue.submit("https://youtu.be/jNQXAC9IVRw".into())?;
    let view = wait(&queue, |v| v.jobs[0].phase.terminal())?;
    let item = &view.jobs[0];
    assert_eq!(item.job_id, job);
    assert_eq!(item.phase, JobPhase::Success);
    assert_eq!(item.terminal_count, 1);
    assert!(item.resources_released);
    assert_eq!(item.attempt, 1);
    let media = item
        .delivered
        .as_ref()
        .ok_or("Missing delivered data receipt")?;
    assert_eq!(
        fs::read(&media.path).map_err(|e| e.to_string())?,
        b"neutral adapter artifact"
    );
    assert_eq!(
        media.sha256,
        super::runtime::hash(&b"neutral adapter artifact"[..])?
    );
    assert_eq!(view.active_slots, 0);
    stop(&queue)
}
#[test]
fn neutral_final_failure_stays_terminal_and_manual_retry_is_new_frozen_job() -> Result<(), String> {
    let (_root, queue, mode) = setup(1)?;
    let old = queue.submit("https://youtu.be/jNQXAC9IVRw".into())?;
    let view = wait(&queue, |v| v.jobs[0].phase == JobPhase::Failure)?;
    let frozen = view.jobs[0].accepted.clone();
    assert_eq!(view.jobs[0].attempt, 1);
    assert_eq!(view.jobs[0].terminal_count, 1);
    assert_eq!(view.active_slots, 0);
    thread::sleep(Duration::from_millis(80));
    assert_eq!(queue.snapshot().jobs[0].attempt, 1);
    queue.save_settings(Settings {
        quality: Quality::Saver,
        output_dir: frozen.intent.output_dir.clone(), theme: Default::default(), language: Default::default(), tray_icon: Default::default(),
    })?;
    mode.store(0, Ordering::Release);
    let new = queue.retry(old)?; assert_ne!(new, old);
    let view = wait(&queue, |v| v.jobs.len() == 2 && v.jobs[1].phase == JobPhase::Success)?;
    assert_eq!(view.jobs[0].phase, JobPhase::Failure); assert_eq!(view.jobs[0].terminal_count, 1);
    assert_eq!(view.jobs[1].accepted.intent.quality, frozen.intent.quality); assert_eq!(view.jobs[1].accepted.intent.output_dir, frozen.intent.output_dir); assert_eq!(view.jobs[1].terminal_count, 1);
    stop(&queue)
}
#[test]
fn neutral_foreign_artifact_path_is_rejected_and_existing_data_is_preserved() -> Result<(), String>
{
    let (root, queue, _) = setup(2)?;
    let sentinel = root.path().join("runtime/jobs/sentinel.bin");
    fs::create_dir_all(sentinel.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(&sentinel, b"existing data").map_err(|e| e.to_string())?;
    queue.submit("https://youtu.be/jNQXAC9IVRw".into())?;
    let view = wait(&queue, |v| v.jobs[0].phase.terminal())?;
    assert_eq!(view.jobs[0].phase, JobPhase::Failure);
    assert!(view.jobs[0].delivered.is_none());
    assert_eq!(view.jobs[0].terminal_count, 1);
    assert_eq!(
        fs::read(sentinel).map_err(|e| e.to_string())?,
        b"existing data"
    );
    stop(&queue)
}
#[test]
fn neutral_cancel_waits_for_execution_owner_then_releases_slot_once() -> Result<(), String> {
    let (_root, queue, _) = setup(3)?;
    let job = queue.submit("https://youtu.be/jNQXAC9IVRw".into())?;
    let live = wait(&queue, |v| v.jobs[0].phase == JobPhase::Downloading)?;
    assert_eq!(live.active_slots, 1);
    assert!(!live.jobs[0].resources_released);
    assert!(queue.cancel(job));
    let view = wait(&queue, |v| v.jobs[0].phase == JobPhase::Cancelled)?;
    assert_eq!(view.jobs[0].terminal_count, 1);
    assert!(view.jobs[0].resources_released);
    assert_eq!(view.active_slots, 0);
    assert!(!queue.cancel(job));
    stop(&queue)
}
#[test]
fn neutral_result_cannot_change_admitted_identity_or_publish_success() -> Result<(), String> {
    let (_root, queue, _) = setup(4)?;
    queue.submit("https://youtu.be/jNQXAC9IVRw".into())?;
    let view = wait(&queue, |v| v.jobs[0].phase.terminal())?;
    assert_eq!(view.jobs[0].phase, JobPhase::Failure);
    assert!(view.jobs[0].delivered.is_none());
    assert_eq!(view.jobs[0].terminal_count, 1);
    stop(&queue)
}
