use super::{
    adapter::{DownloadServices, DownloaderAdapter, ExecutionContext},
    contract::*,
    diagnostics::{Failure, FailureCode},
    queue::{DownloadCoordinator, JobPhase, QueueSnapshot},
    request::{Identity, Quality},
    runtime::{RuntimeManager, TrustedRuntimeRequirements},
    settings::Settings,
    verification::VerifierRegistry,
};
use super::{composition, output, request};
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

struct CollectionFixture {
    requirements: TrustedRuntimeRequirements,
    mode: Arc<AtomicU8>,
}
impl DownloaderAdapter for CollectionFixture {
    fn kind(&self) -> MediaKind {
        MediaKind::Data
    }
    fn requirements(&self) -> &TrustedRuntimeRequirements {
        &self.requirements
    }
    fn evidence_files(&self) -> &[(&str, u64)] {
        &[]
    }
    fn execute(&self, _: &ExecutionRequest, _: &ExecutionContext<'_>) -> AdapterResult {
        unreachable!()
    }
    fn execute_batch(
        &self,
        request: &ExecutionRequest,
        context: &ExecutionContext<'_>,
    ) -> Result<ProducedBatch, Failure> {
        let request::Object::Gallery { site, id } = &request.accepted.object else {
            unreachable!()
        };
        let identity = Identity {
            id: id.clone(),
            site: *site,
            title: "作品:名称".into(),
            part: None,
        };
        context.admit(&IdentityAttestation {
            aliases: vec![identity.canonical_key()],
            identity: identity.clone(),
        })?;
        context.emit(AdapterEvent::Transferring);
        let mode = self.mode.load(Ordering::Acquire);
        if mode == 3 {
            while !context.cancelled() {
                thread::sleep(Duration::from_millis(5));
            }
        }
        let mut artifacts = Vec::new();
        for n in 0..if mode == 0 { 2 } else { 1 } {
            let relative_path = PathBuf::from(format!("image-{n}.bin"));
            fs::write(
                context.workspace().join(&relative_path),
                format!("complete image {n}"),
            )
            .unwrap();
            artifacts.push(ProducedArtifact {
                relative_path,
                identity: identity.clone(),
                kind: MediaKind::Data,
                verification: VerificationRequirements::Data,
            });
        }
        Ok(ProducedBatch {
            artifacts,
            failure: (mode != 0).then(|| {
                Failure::new(
                    if mode == 3 {
                        FailureCode::Cancelled
                    } else {
                        FailureCode::Unknown
                    },
                    "transfer",
                )
            }),
            total: Some(2),
            collection: true,
            expected_paths: vec!["image-0.bin".into(), "image-1.bin".into()],
        })
    }
}
fn wait(queue: &DownloadCoordinator, check: impl Fn(&QueueSnapshot) -> bool) -> QueueSnapshot {
    let start = Instant::now();
    loop {
        let snapshot = queue.snapshot();
        if check(&snapshot) {
            return snapshot;
        }
        assert!(
            start.elapsed() < Duration::from_secs(120),
            "Queue did not settle: {snapshot:?}"
        );
        thread::sleep(Duration::from_millis(10));
    }
}
fn setup(mode: u8) -> (tempfile::TempDir, DownloadCoordinator, Arc<AtomicU8>) {
    let root = tempfile::tempdir().unwrap();
    let output = root.path().join("output");
    fs::create_dir(&output).unwrap();
    let mode = Arc::new(AtomicU8::new(mode));
    let queue = DownloadCoordinator::new(
        DownloadServices {
            runtime: Arc::new(RuntimeManager::new(root.path().join("runtime"))),
            adapter: Arc::new(CollectionFixture {
                requirements: TrustedRuntimeRequirements::empty(),
                mode: mode.clone(),
            }),
            verifiers: Arc::new(VerifierRegistry::data()),
        },
        root.path().join("settings.json"),
        Settings {
            quality: Quality::Saver,
            output_dir: output,
            theme: Default::default(),
            language: Default::default(),
            tray_icon: Default::default(),
        },
    )
    .unwrap();
    (root, queue, mode)
}
const URL: &str = "https://bsky.app/profile/mollieoreilly.bsky.social/post/3mz5die727k22";
#[test]
fn partial_retry_keeps_job_directory_and_verified_files_without_overwrite() {
    let (_root, queue, mode) = setup(1);
    let job = queue.submit(URL.into()).unwrap();
    let partial = wait(&queue, |s| s.jobs[0].phase == JobPhase::Partial);
    assert_eq!(partial.active_slots, 0);
    assert_eq!(partial.failures, 1);
    assert!(queue.diagnostic(job).is_ok());
    let saved = partial.jobs[0].collection.clone().unwrap();
    assert_eq!(saved.files.len(), 1);
    let path = saved.files[0].delivered.path.clone();
    let bytes = fs::read(&path).unwrap();
    mode.store(0, Ordering::Release);
    assert_eq!(queue.retry(job).unwrap(), job);
    let done = wait(&queue, |s| s.jobs[0].phase == JobPhase::Success);
    assert_eq!(done.jobs.len(), 1);
    assert_eq!(done.jobs[0].attempt, 2);
    let result = done.jobs[0].collection.as_ref().unwrap();
    assert_eq!(result.directory, saved.directory);
    assert_eq!(result.files.len(), 2);
    assert_eq!(fs::read(path).unwrap(), bytes);
    assert_eq!(
        fs::read_dir(result.directory.as_ref().unwrap())
            .unwrap()
            .count(),
        2
    );
    queue.stop();
    wait(&queue, |s| s.stopped);
}
#[test]
fn cancel_keeps_completed_files_and_releases_resources() {
    let (_root, queue, _) = setup(3);
    let job = queue.submit(URL.into()).unwrap();
    wait(&queue, |s| s.jobs[0].phase == JobPhase::Downloading);
    assert!(queue.cancel(job));
    let cancelled = wait(&queue, |s| s.jobs[0].phase == JobPhase::Cancelled);
    assert_eq!(cancelled.active_slots, 0);
    assert_eq!(cancelled.jobs[0].terminal_count, 1);
    assert!(cancelled.jobs[0].resources_released);
    assert!(
        cancelled.jobs[0].collection.as_ref().unwrap().files[0]
            .delivered
            .path
            .is_file()
    );
    queue.stop();
    wait(&queue, |s| s.stopped);
}
#[test]
fn collection_names_and_collisions_preserve_existing_files() {
    assert_eq!(output::safe_filename("CON"), "_CON");
    assert_eq!(output::safe_filename("作品:名称. "), "作品_名称");
    let (_root, queue, _) = setup(0);
    for _ in 0..2 {
        let job = queue.submit(URL.into()).unwrap();
        wait(&queue, |s| {
            s.jobs
                .iter()
                .any(|j| j.job_id == job && j.phase == JobPhase::Success)
        });
    }
    let snapshot = queue.snapshot();
    assert_ne!(
        snapshot.jobs[0].collection.as_ref().unwrap().directory,
        snapshot.jobs[1].collection.as_ref().unwrap().directory
    );
    queue.stop();
    wait(&queue, |s| s.stopped);
}
#[test]
fn changed_saved_file_is_not_trusted_or_overwritten_by_retry() {
    let (_root, queue, mode) = setup(1);
    let job = queue.submit(URL.into()).unwrap();
    let partial = wait(&queue, |s| s.jobs[0].phase == JobPhase::Partial);
    let original = partial.jobs[0].collection.as_ref().unwrap().files[0]
        .delivered
        .path
        .clone();
    fs::write(&original, b"user changed this file").unwrap();
    mode.store(0, Ordering::Release);
    queue.retry(job).unwrap();
    let done = wait(&queue, |s| s.jobs[0].phase == JobPhase::Success);
    assert_eq!(fs::read(&original).unwrap(), b"user changed this file");
    assert_eq!(done.jobs[0].collection.as_ref().unwrap().files.len(), 2);
    assert!(
        done.jobs[0]
            .collection
            .as_ref()
            .unwrap()
            .files
            .iter()
            .all(|f| f.delivered.path != original)
    );
    queue.stop();
    wait(&queue, |s| s.stopped);
}

// This injects a missing result after genuine gallery-dl transfer; it is not a public-site failure claim.
struct PartialOnce {
    inner: super::adapters::automatic::AutomaticAdapter,
    first: AtomicU8,
}
impl DownloaderAdapter for PartialOnce {
    fn kind(&self) -> MediaKind {
        MediaKind::Video
    }
    fn requirements(&self) -> &TrustedRuntimeRequirements {
        self.inner.requirements()
    }
    fn evidence_files(&self) -> &[(&str, u64)] {
        self.inner.evidence_files()
    }
    fn execute(&self, r: &ExecutionRequest, c: &ExecutionContext<'_>) -> AdapterResult {
        self.inner.execute(r, c)
    }
    fn execute_batch(
        &self,
        r: &ExecutionRequest,
        c: &ExecutionContext<'_>,
    ) -> Result<ProducedBatch, Failure> {
        let mut batch = self.inner.execute_batch(r, c)?;
        if batch.collection && self.first.swap(0, Ordering::AcqRel) == 1 {
            batch.artifacts.truncate(1);
            batch.failure = Some(Failure::new(FailureCode::Unknown, "transfer"));
        }
        Ok(batch)
    }
}
#[test]
#[ignore = "Real Windows gallery/video downloads; requires AMEOW_GALLERY_TEST_ROOT, writes task-owned evidence"]
fn real_gallery_pipeline_and_partial_retry() {
    let root = PathBuf::from(std::env::var("AMEOW_GALLERY_TEST_ROOT").unwrap());
    fs::create_dir_all(root.join("output")).unwrap();
    let requirements = composition::requirements();
    let queue = DownloadCoordinator::new(
        DownloadServices {
            runtime: Arc::new(RuntimeManager::new(root.join("runtime"))),
            adapter: Arc::new(PartialOnce {
                inner: super::adapters::automatic::AutomaticAdapter::new(requirements),
                first: AtomicU8::new(1),
            }),
            verifiers: Arc::new(VerifierRegistry::video_and_images("ffprobe.exe")),
        },
        root.join("settings.json"),
        Settings {
            quality: Quality::Saver,
            output_dir: root.join("output"),
            theme: Default::default(),
            language: Default::default(),
            tray_icon: Default::default(),
        },
    )
    .unwrap();
    let album = queue.submit(URL.into()).unwrap();
    let partial = wait(&queue, |s| s.jobs[0].phase.terminal());
    fs::write(
        root.join("partial.json"),
        serde_json::to_vec_pretty(&partial).unwrap(),
    )
    .unwrap();
    assert_eq!(partial.jobs[0].phase, JobPhase::Partial);
    let saved = partial.jobs[0].collection.clone().unwrap();
    assert_eq!(saved.files.len(), 1);
    assert_eq!(queue.retry(album).unwrap(), album);
    let completed = wait(&queue, |s| s.jobs[0].phase.terminal());
    fs::write(
        root.join("retried.json"),
        serde_json::to_vec_pretty(&completed).unwrap(),
    )
    .unwrap();
    assert_eq!(completed.jobs[0].phase, JobPhase::Success);
    assert_eq!(
        completed.jobs[0].collection.as_ref().unwrap().directory,
        saved.directory
    );
    assert_eq!(
        completed.jobs[0].collection.as_ref().unwrap().files.len(),
        2
    );
    queue
        .submit("https://bsky.app/profile/bsky.app/post/3mzhhvhjfwk22".into())
        .unwrap();
    queue.submit(URL.into()).unwrap();
    queue.submit("https://youtu.be/jNQXAC9IVRw".into()).unwrap();
    let done = wait(&queue, |s| {
        s.jobs.len() == 4 && s.jobs.iter().all(|j| j.phase.terminal())
    });
    fs::write(
        root.join("coexistence.json"),
        serde_json::to_vec_pretty(&done).unwrap(),
    )
    .unwrap();
    assert_eq!(done.jobs[1].phase, JobPhase::Success);
    assert_eq!(done.jobs[2].phase, JobPhase::Success);
    assert!(
        done.jobs[1]
            .collection
            .as_ref()
            .unwrap()
            .directory
            .is_none()
    );
    assert_ne!(
        done.jobs[2].collection.as_ref().unwrap().directory,
        saved.directory
    );
    queue.stop();
    let stopped = wait(&queue, |s| s.stopped);
    assert_eq!(stopped.active_slots, 0);
    fs::write(
        root.join("stopped.json"),
        serde_json::to_vec_pretty(&stopped).unwrap(),
    )
    .unwrap();
}
#[test]
#[ignore = "Real Windows gallery cancellation; requires AMEOW_GALLERY_TEST_ROOT"]
fn real_gallery_cancel_releases_managed_processes() {
    let root = PathBuf::from(std::env::var("AMEOW_GALLERY_TEST_ROOT").unwrap());
    let queue = composition::download_coordinator(
        root.join("runtime"),
        root.join("cancel-settings.json"),
        Settings {
            quality: Quality::Saver,
            output_dir: root.join("output"),
            theme: Default::default(),
            language: Default::default(),
            tray_icon: Default::default(),
        },
    )
    .unwrap();
    let job = queue.submit(URL.into()).unwrap();
    wait(&queue, |s| s.jobs[0].phase == JobPhase::Downloading);
    let start = Instant::now();
    assert!(queue.cancel(job));
    let cancelled = wait(&queue, |s| s.jobs[0].phase.terminal());
    assert_eq!(cancelled.jobs[0].phase, JobPhase::Cancelled);
    assert_eq!(cancelled.active_slots, 0);
    assert!(start.elapsed() < Duration::from_secs(10));
    fs::write(
        root.join("cancelled.json"),
        serde_json::to_vec_pretty(&cancelled).unwrap(),
    )
    .unwrap();
    queue.stop();
    wait(&queue, |s| s.stopped);
}
#[test]
#[ignore = "Real public Imgur image through the managed Windows coordinator"]
fn real_imgur_single_image_delivery() {
    let root = PathBuf::from(std::env::var("AMEOW_GALLERY_TEST_ROOT").unwrap());
    let queue = composition::download_coordinator(
        root.join("runtime"),
        root.join("imgur-settings.json"),
        Settings {
            quality: Quality::Saver,
            output_dir: root.join("output"),
            theme: Default::default(),
            language: Default::default(),
            tray_icon: Default::default(),
        },
    )
    .unwrap();
    queue.submit("https://imgur.com/21yMxCS".into()).unwrap();
    let done = wait(&queue, |s| s.jobs[0].phase.terminal());
    fs::write(
        root.join("imgur.json"),
        serde_json::to_vec_pretty(&done).unwrap(),
    )
    .unwrap();
    assert_eq!(done.jobs[0].phase, JobPhase::Success);
    let saved = done.jobs[0].collection.as_ref().unwrap();
    assert_eq!(saved.files.len(), 1);
    assert!(saved.directory.is_none());
    queue.stop();
    wait(&queue, |s| s.stopped);
}
#[test]
#[ignore = "Acquires the official pinned gallery-dl component into a fresh task-owned cache"]
fn real_gallery_component_acquisition() {
    let root = PathBuf::from(std::env::var("AMEOW_GALLERY_TEST_ROOT").unwrap());
    let owned = tempfile::Builder::new().prefix("gallery-acquisition-").tempdir_in(&root).unwrap();
    let requirements = TrustedRuntimeRequirements::compiled(&[("gallery-dl.exe", &["--ignore-config", "--version"])], &[]);
    let manager = RuntimeManager::new(owned.path().into());
    let mut observations = Vec::new();
    let lease = manager.prepare_observed(&requirements, &super::process_supervisor::Control::default(), Arc::new(|_| {}), |event| observations.push(event)).unwrap();
    assert!(observations.iter().any(|s| s.phase == super::preparation::PreparationPhase::Downloading && s.downloaded_bytes > 0));
    fs::write(root.join("gallery-acquisition.json"), serde_json::to_vec_pretty(&observations).unwrap()).unwrap();
    assert!(lease.file("gallery-dl.exe").unwrap().is_file());
    drop(lease);
}

#[test]
#[ignore = "Real empty-cache component acquisition and image/video delivery; requires a new AMEOW_GALLERY_TEST_ROOT"]
fn real_cold_runtime_image_and_video_delivery() {
    use super::preparation::{PreparationPhase, PreparationStage, RuntimeComponent};
    use super::process_supervisor::Control;

    let root = PathBuf::from(std::env::var("AMEOW_GALLERY_TEST_ROOT").unwrap());
    assert!(
        !root.exists(),
        "Use a new task-owned directory for cold-start evidence"
    );
    fs::create_dir_all(root.join("output")).unwrap();
    let runtime = root.join("runtime");
    assert!(!runtime.exists());
    let mut events = Vec::new();
    let prepared = RuntimeManager::new(runtime.clone()).prepare_observed(
        &composition::requirements(),
        &Control::default(),
        Arc::new(|_| {}),
        |event| events.push(event),
    );
    fs::write(
        root.join("acquisition.json"),
        serde_json::to_vec_pretty(&events).unwrap(),
    )
    .unwrap();
    let lease = prepared.unwrap();
    for component in [
        RuntimeComponent::YtDlp,
        RuntimeComponent::Deno,
        RuntimeComponent::Ffmpeg,
        RuntimeComponent::GalleryDl,
    ] {
        assert!(events.iter().any(|e| e.component == Some(component)
            && e.phase == PreparationPhase::Downloading
            && e.downloaded_bytes > 0));
        assert!(
            events
                .iter()
                .any(|e| e.component == Some(component) && e.stage == PreparationStage::Verify)
        );
        assert!(
            events
                .iter()
                .any(|e| e.component == Some(component) && e.stage == PreparationStage::Probe)
        );
    }
    for component in super::runtime::manifest().unwrap().components {
        for file in component.files {
            super::runtime::check_file(&lease.file(&file.name).unwrap(), &file.sha256).unwrap();
        }
    }
    drop(lease);

    let queue = composition::download_coordinator(
        runtime,
        root.join("settings.json"),
        Settings {
            quality: Quality::Saver,
            output_dir: root.join("output"),
            theme: Default::default(),
            language: Default::default(),
            tray_icon: Default::default(),
        },
    )
    .unwrap();
    queue.submit("https://imgur.com/21yMxCS".into()).unwrap();
    let image = wait(&queue, |s| s.jobs[0].phase.terminal());
    fs::write(
        root.join("image.json"),
        serde_json::to_vec_pretty(&image).unwrap(),
    )
    .unwrap();
    assert_eq!(image.jobs[0].phase, JobPhase::Success);
    let saved = image.jobs[0].collection.as_ref().unwrap();
    assert_eq!(saved.files.len(), 1);
    assert!(saved.directory.is_none());
    assert!(saved.files[0].delivered.bytes > 0);

    queue.submit("https://youtu.be/jNQXAC9IVRw".into()).unwrap();
    let video = wait(&queue, |s| s.jobs[1].phase.terminal());
    fs::write(
        root.join("video.json"),
        serde_json::to_vec_pretty(&video).unwrap(),
    )
    .unwrap();
    assert_eq!(video.jobs[1].phase, JobPhase::Success);
    let delivered = video.jobs[1].delivered.as_ref().unwrap();
    assert!(delivered.bytes > 0);
    queue.stop();
    let stopped = wait(&queue, |s| s.stopped);
    assert_eq!(stopped.active_slots, 0);
    assert!(stopped.jobs.iter().all(|j| j.resources_released));
    fs::write(
        root.join("stopped.json"),
        serde_json::to_vec_pretty(&stopped).unwrap(),
    )
    .unwrap();
}
