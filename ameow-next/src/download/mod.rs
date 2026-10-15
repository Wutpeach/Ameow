pub mod bridge_commands;
pub mod diagnostics;
pub mod network;
pub mod output;
pub mod contract;
pub mod adapter;
pub mod adapters;
pub mod composition;
pub mod verification;
pub mod process_supervisor;
pub mod progress;
pub mod preparation;
pub mod queue;
pub mod request;
pub mod runtime;
pub mod settings;
#[cfg(test)]
mod neutral_tests;
// Existing supervisor regression fixtures keep their original bytes; never a production path.
#[cfg(test)]
use adapters::yt_dlp::{parse_final_record, validate_engine_outcome};

use process_supervisor::{Control, ProcessObservation};
#[cfg(test)]
use process_supervisor::ProcessSpec;
use adapter::{DownloadServices, ExecutionContext, IdentityAdmission};
use contract::{AdapterEvent, ExecutionRequest, VerificationRequirements};
#[cfg(test)]
use contract::MediaKind;
use request::{Accepted, DownloadIntent, Identity};
use runtime::RuntimeLease;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    os::windows::fs::MetadataExt,
    path::PathBuf,
    sync::{Arc, Mutex, MutexGuard},
    thread,
    time::Duration,
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum Phase {
    Idle,
    Accepted,
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
impl Phase {
    pub fn terminal(&self) -> bool {
        matches!(self, Self::Success | Self::Failure | Self::Cancelled)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Snapshot {
    pub job_id: u64,
    pub attempt: u64,
    pub revision: u64,
    pub phase: Phase,
    pub accepted: Option<Accepted>,
    pub identity: Option<Identity>,
    pub message: String,
    pub delivered: Option<output::VerifiedMedia>,
    pub terminal_count: u32,
    pub workspace: Option<PathBuf>,
    pub runtime_digest: Option<String>,
    pub diagnostics: Option<PathBuf>,
    pub resources_released: bool,
    pub settlements: Vec<String>,
    pub destination_stage: Option<PathBuf>,
    pub failure: Option<diagnostics::Failure>,
    pub transfer_progress: Option<progress::TransferProgress>,
}
impl Default for Snapshot {
    fn default() -> Self {
        Self {
            job_id: 0,
            attempt: 0,
            revision: 0,
            phase: Phase::Idle,
            accepted: None,
            identity: None,
            message: String::new(),
            delivered: None,
            terminal_count: 0,
            workspace: None,
            runtime_digest: None,
            diagnostics: None,
            resources_released: true,
            settlements: Vec::new(),
            destination_stage: None,
            failure: None,
            transfer_progress: None,
        }
    }
}
struct State {
    snapshot: Snapshot,
    control: Control,
    published: Arc<Mutex<Arc<Snapshot>>>,
    #[cfg(test)]
    probe: Option<Arc<TestProbe>>,
}
#[cfg(test)]
struct TestProbe {
    query_failure: Arc<std::sync::atomic::AtomicBool>,
    owner_panic: bool,
    stage_cleanup: bool,
}
impl State {
    fn publish(&self) {
        let snapshot = Arc::new(self.snapshot.clone());
        *lock(&self.published) = snapshot;
    }
}
pub struct Coordinator {
    state: Arc<Mutex<State>>,
    services: DownloadServices,
    published: Arc<Mutex<Arc<Snapshot>>>,
}
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    match m.lock() {
        Ok(v) => v,
        Err(e) => e.into_inner(),
    }
}
impl Coordinator {
    pub fn new(services: DownloadServices) -> Self {
        Self::with_services(services)
    }
    fn with_services(services: DownloadServices) -> Self {
        let published = Arc::new(Mutex::new(Arc::new(Snapshot::default())));
        Self {
            state: Arc::new(Mutex::new(State {
                snapshot: Snapshot::default(),
                control: Control::default(),
                published: published.clone(),
                #[cfg(test)]
                probe: None,
            })),
            services,
            published,
        }
    }
    pub fn snapshot(&self) -> Snapshot {
        // Projection lock never surrounds filesystem/process/authority operations. The full
        // previous authoritative snapshot remains readable during a slow atomic publication.
        let snapshot = { lock(&self.published).clone() };
        (*snapshot).clone()
    }
    pub fn accept(&self, intent: DownloadIntent) -> Result<u64, String> {
        // Filesystem and URL acceptance runs off the GPUI thread through the bridge command owner.
        let accepted = Accepted::new(intent)?;
        let mut state = lock(&self.state);
        if state.snapshot.phase != Phase::Idle && !state.snapshot.phase.terminal() {
            return Err("Busy: one active or Held job already owns resources".into());
        }
        let job = state
            .snapshot
            .job_id
            .checked_add(1)
            .ok_or("Job generation exhausted")?;
        let attempt = state
            .snapshot
            .attempt
            .checked_add(1)
            .ok_or("Attempt generation exhausted")?;
        let revision = state.snapshot.revision + 1;
        state.control = Control::default();
        state.snapshot = Snapshot {
            job_id: job,
            attempt,
            revision,
            phase: Phase::Accepted,
            accepted: Some(accepted.clone()),
            resources_released: false,
            ..Default::default()
        };
        state.publish();
        let shared = self.state.clone();
        let services = self.services.clone();
        let control = state.control.clone();
        let spawn = thread::Builder::new()
            .name(format!("download-job-{job}"))
            .spawn(move || execute(shared, services, accepted, control, job, attempt, None));
        if let Err(error) = spawn {
            state.snapshot.phase = Phase::Failure;
            state.snapshot.message = format!("Job owner creation: {error}");
            state.snapshot.terminal_count = 1;
            state.snapshot.resources_released = true;
            state.snapshot.revision += 1;
            state.publish();
            return Err(state.snapshot.message.clone());
        }
        Ok(job)
    }
    // Stage B's outer logical authority owns this join; standalone Stage A API stays compatible.
    fn start_prepared(
        &self,
        accepted: Accepted,
        job: u64,
        attempt: u64,
        prepared: PreparedAttempt,
    ) -> Result<thread::JoinHandle<()>, String> {
        let mut state = lock(&self.state);
        if !matches!(state.snapshot.phase, Phase::Idle) {
            return Err("Attempt runner already started".into());
        }
        state.control = Control::default();
        state.snapshot = Snapshot {
            job_id: job,
            attempt,
            revision: 1,
            phase: Phase::Accepted,
            accepted: Some(accepted.clone()),
            resources_released: false,
            ..Default::default()
        };
        state.publish();
        let shared = self.state.clone();
        let services = self.services.clone();
        let control = state.control.clone();
        thread::Builder::new()
            .name(format!("download-attempt-{job}-{attempt}"))
            .spawn(move || {
                execute(
                    shared,
                    services,
                    accepted,
                    control,
                    job,
                    attempt,
                    Some(prepared),
                )
            })
            .map_err(|_| "E_RUNTIME: Cannot create attempt owner".into())
    }
    pub fn cancel(&self, job: u64) -> bool {
        let mut state = lock(&self.state);
        if state.snapshot.job_id != job
            || state.snapshot.phase.terminal()
            || state.snapshot.phase == Phase::Idle
            || state.snapshot.delivered.is_some()
        {
            return false;
        }
        state.control.cancel();
        state.snapshot.transfer_progress = None;
        state.snapshot.revision += 1;
        state.snapshot.message = "Cancellation requested; waiting for ownership barriers".into();
        state.publish();
        true
    }
    pub fn retry_cleanup(&self, job: u64) -> bool {
        let state = lock(&self.state);
        if state.snapshot.job_id != job || state.snapshot.phase != Phase::Held {
            return false;
        }
        state.control.retry_cleanup();
        true
    }
}
struct PreparedAttempt {
    lease: Arc<RuntimeLease>,
    admit: IdentityAdmission,
}
fn update(state: &Arc<Mutex<State>>, job: u64, attempt: u64, phase: Phase, _message: String) {
    let mut state = lock(state);
    if state.snapshot.job_id == job
        && state.snapshot.attempt == attempt
        && !state.snapshot.phase.terminal()
    {
        state.snapshot.phase = phase.clone();
        if phase != Phase::Downloading {
            state.snapshot.transfer_progress = None;
        }
        state.snapshot.message = match phase {
            Phase::Held => "Ownership retained; explicit cleanup retry required".into(),
            Phase::Preparing => "Preparing fixed official runtime".into(),
            Phase::Resolving => "Resolving one accepted video".into(),
            Phase::Downloading => "Downloading or merging selected media streams".into(),
            Phase::Validating => "Verifying video/audio and output integrity".into(),
            Phase::Publishing => "Saving verified media without overwrite".into(),
            _ => "Waiting for download ownership settlement".into(),
        };
        state.snapshot.revision += 1;
        state.publish();
    }
}
fn terminal(state: &Arc<Mutex<State>>, job: u64, attempt: u64, phase: Phase, message: String) {
    let mut state = lock(state);
    if state.snapshot.job_id == job
        && state.snapshot.attempt == attempt
        && !state.snapshot.phase.terminal()
    {
        state.snapshot.phase = phase;
        state.snapshot.transfer_progress = None;
        state.snapshot.message = message;
        state.snapshot.terminal_count += 1;
        state.snapshot.resources_released = true;
        state.snapshot.revision += 1;
        state.publish();
    }
}
fn publish_progress(
    state: &Arc<Mutex<State>>,
    job: u64,
    attempt: u64,
    sample: progress::TransferProgress,
) {
    let mut state = lock(state);
    if state.snapshot.job_id == job
        && state.snapshot.attempt == attempt
        && state.snapshot.phase == Phase::Downloading
        && !state.control.is_cancelled()
    {
        state.snapshot.transfer_progress = Some(sample);
        state.snapshot.revision += 1;
        state.publish();
    }
}
fn execute(
    state: Arc<Mutex<State>>,
    services: DownloadServices,
    accepted: Accepted,
    control: Control,
    job: u64,
    attempt: u64,
    prepared: Option<PreparedAttempt>,
) {
    let manager = services.runtime.clone();
    let mut adapter_failure = None;
    // Resources are owned outside the catch boundary, so unwind cannot release them prematurely.
    let mut workspace = None;
    let mut lease = None;
    let mut destination_stage = None;
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        if !accepted.intent.output_dir.is_dir() {
            adapter_failure = Some(diagnostics::Failure::new(
                diagnostics::FailureCode::Storage,
                "publish",
            ));
            return Err("E_STORAGE: Frozen output directory no longer exists".into());
        }
        fs::create_dir_all(manager.root.join("jobs"))
            .map_err(|e| format!("Job workspace root: {e}"))?;
        let owned = tempfile::Builder::new()
            .prefix(&format!("job-{job}-"))
            .tempdir_in(manager.root.join("jobs"))
            .map_err(|e| e.to_string())?;
        {
            let mut state = lock(&state);
            state.snapshot.workspace = Some(owned.path().into());
            state.snapshot.revision += 1;
            state.publish();
        }
        workspace = Some(owned);
        let working = workspace.as_ref().ok_or("Missing owned workspace")?.path();
        update(
            &state,
            job,
            attempt,
            Phase::Preparing,
            "Preparing fixed official runtime".into(),
        );
        let observe_state = state.clone();
        let observer: Arc<dyn Fn(ProcessObservation) + Send + Sync> =
            Arc::new(move |event| match event {
                ProcessObservation::Held(_) => update(
                    &observe_state,
                    job,
                    attempt,
                    Phase::Held,
                    "Ownership retained".into(),
                ),
                // Raw engine output is captured in private local evidence by invoke, never in projections.
                ProcessObservation::Output { .. } => {}
                ProcessObservation::Settled(facts) => {
                    let mut state = lock(&observe_state);
                    if state.snapshot.settlements.len() < 16 {
                        state.snapshot.settlements.push(format!("{facts:?}"));
                        state.snapshot.revision += 1;
                        state.publish();
                    }
                }
                _ => {}
            });
        lease = Some(if let Some(prepared) = &prepared {
            prepared.lease.clone()
        } else {
            manager.prepare(services.adapter.requirements(), &control, observer.clone(), |message| {
                use std::io::Write;
                if let Ok(mut log) = fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(working.join("runtime-events.log"))
                {
                    let _ = writeln!(log, "{message}");
                }
                update(&state, job, attempt, Phase::Preparing, "Preparing trusted download runtime".into())
            })?
        });
        let runtime = lease.as_ref().ok_or("Runtime lease unavailable")?;
        {
            let mut state = lock(&state);
            state.snapshot.runtime_digest = Some(runtime.digest.clone());
            state.snapshot.revision += 1;
            state.publish();
        }
        #[cfg(test)]
        let test_probe = { lock(&state).probe.clone() };
        #[cfg(test)]
        if let Some(probe) = test_probe {
            if probe.owner_panic {
                panic!("test-only coordinator owner unwind after runtime binding");
            }
            if probe.stage_cleanup {
                let path = working.join("cleanup-fixture.mkv");
                fs::write(&path, b"settled fixture").map_err(|e| e.to_string())?;
                let media = output::VerifiedMedia {
                    path,
                    bytes: 15,
                    sha256: runtime::hash(&b"settled fixture"[..])?,
                    kind: MediaKind::Data,
                    facts: contract::VerifiedFacts::default(),
                    identity_guard: None,
                };
                destination_stage = Some(output::DestinationStage::create(
                    &media,
                    &accepted.intent.output_dir,
                    job,
                )?);
                let stage = destination_stage.as_mut().ok_or("Stage missing")?;
                stage.fill(&media)?;
                let mut permissions = fs::metadata(&stage.path)
                    .map_err(|e| e.to_string())?
                    .permissions();
                permissions.set_readonly(true);
                fs::set_permissions(&stage.path, permissions).map_err(|e| e.to_string())?;
                return Err("Test-only destination cleanup failure".into());
            }
            process_supervisor::run_with_test_query_failure(
                ProcessSpec {
                    executable: runtime.file("deno.exe")?,
                    args: vec![
                        "eval".into(),
                        "--no-config".into(),
                        "--no-remote".into(),
                        "await new Promise(r => setTimeout(r, 10000));".into(),
                    ],
                    cwd: working.into(),
                    env: services.adapter.requirements().environment(working)?,
                    stdout_limit: 1024,
                    stderr_limit: 1024,
                    timeout: Some(Duration::from_secs(20)),
                },
                &control,
                observer.clone(),
                probe.query_failure.clone(),
            )?;
            return Err("Test-only retained process probe completed".into());
        }
        if control.is_cancelled() {
            return Err("Cancelled before media resolution".into());
        }
        let admitted_state = state.clone();
        let admission = prepared.as_ref().map(|p| p.admit.clone());
        let admit = Arc::new(move |proof: &contract::IdentityAttestation| {
            if let Some(admission) = &admission {
                admission(proof)?;
            }
            let mut state = lock(&admitted_state);
            if state.snapshot.job_id != job
                || state.snapshot.attempt != attempt
                || state.control.is_cancelled()
            {
                return Err("E_IDENTITY: stale or cancelled identity admission".into());
            }
            state.snapshot.identity = Some(proof.identity.clone());
            state.snapshot.revision += 1;
            state.publish();
            Ok(())
        });
        let event_state = state.clone();
        let events = Arc::new(move |event| match event {
            AdapterEvent::Resolving => update(&event_state, job, attempt, Phase::Resolving, String::new()),
            AdapterEvent::Transferring => update(&event_state, job, attempt, Phase::Downloading, String::new()),
            AdapterEvent::Finalizing => {
                let mut state = lock(&event_state);
                if state.snapshot.job_id == job
                    && state.snapshot.attempt == attempt
                    && !state.snapshot.phase.terminal()
                {
                    state.snapshot.transfer_progress = None;
                    state.snapshot.revision += 1;
                    state.publish();
                }
            }
            AdapterEvent::Progress(sample) => publish_progress(&event_state, job, attempt, sample),
        });
        let context = ExecutionContext {
            workspace: working,
            lease: runtime,
            requirements: services.adapter.requirements(),
            control: &control,
            observer: observer.clone(),
            admission: admit,
            events,
        };
        let artifact = services
            .adapter
            .execute(
                &ExecutionRequest {
                    accepted: accepted.clone(),
                },
                &context,
            )
            .map_err(|failure| {
                let message = format!("{}: {}", failure.code, failure.reason);
                adapter_failure = Some(failure);
                message
            })?;
        if artifact.kind != services.adapter.kind()
            || lock(&state)
                .snapshot
                .identity
                .as_ref()
                .is_none_or(|id| id.canonical_key() != artifact.identity.canonical_key())
        {
            return Err("Artifact kind or admitted identity mismatch".into());
        }
        if let VerificationRequirements::Video(expected) = &artifact.verification
            && (expected.height_cap != accepted.intent.quality.cap() || !expected.requires_audio)
        {
            return Err("Artifact verification changed frozen video requirements".into());
        }
        if control.is_cancelled() {
            return Err("Cancelled after settled transfer".into());
        }
        update(&state, job, attempt, Phase::Validating, String::new());
        let identity = artifact.identity.clone();
        let media = services
            .verifiers
            .verify(&artifact, working, runtime, &control, observer)?;
        update(
            &state,
            job,
            attempt,
            Phase::Publishing,
            "Staging verified output in fixed destination".into(),
        );
        destination_stage = Some(
            output::DestinationStage::create(&media, &accepted.intent.output_dir, job)
                .map_err(|error| format!("E_STORAGE: {error}"))?,
        );
        let staged = destination_stage
            .as_mut()
            .ok_or("Owned destination stage missing")?;
        {
            let mut state = lock(&state);
            state.snapshot.destination_stage = Some(staged.path.clone());
            state.snapshot.revision += 1;
            state.publish();
        }
        staged
            .fill(&media)
            .map_err(|error| format!("E_STORAGE: {error}"))?;
        commit_delivery(
            &state,
            job,
            attempt,
            staged,
            &accepted.intent.output_dir,
            &identity.id,
            media,
        )?;
        Ok::<(), String>(())
    }));
    let error_phase = lock(&state).snapshot.phase.clone();
    let (phase, mut message) = match outcome {
        Ok(Ok(())) => (Phase::Success, "Verified media safely delivered".into()),
        Ok(Err(error)) => (
            if control.is_cancelled() {
                Phase::Cancelled
            } else {
                Phase::Failure
            },
            error,
        ),
        Err(_) => {
            let baseline = control.cleanup_revision();
            update(
                &state,
                job,
                attempt,
                Phase::Held,
                "Job owner panic caught; retained runtime/workspace for explicit cleanup".into(),
            );
            // Process run owns and catches its own unwind; unwinding here only occurs after a settled run.
            // Still retain ownership until the user explicitly requests cleanup rather than infer recovery.
            while control.cleanup_revision() == baseline {
                thread::sleep(Duration::from_millis(50));
            }
            (
                Phase::Failure,
                "Owner panic; explicit cleanup accepted after settled process boundary".into(),
            )
        }
    };
    let failure = if phase == Phase::Failure {
        Some(adapter_failure.unwrap_or_else(|| diagnostics::Failure::local(&error_phase)))
    } else if phase == Phase::Cancelled {
        Some(diagnostics::cancelled())
    } else {
        None
    };
    if let Some(working) = workspace.as_ref() {
        let _ = fs::write(working.path().join("attempt-error.log"), &message);
    }
    if let Some(stage) = destination_stage.as_mut() {
        {
            let mut state = lock(&state);
            state.snapshot.destination_stage = stage.owned_path().map(PathBuf::from);
            state.snapshot.revision += 1;
            state.publish();
        }
        settle_destination(&state, &control, job, attempt, stage);
    }
    // Every run returned only after proved barriers. Preserve bounded diagnostics, then remove only
    // this owner's exact workspace. A failed cleanup remains Held with its runtime lease retained.
    if let Some(owned) = workspace {
        let path = owned.keep();
        let evidence: Vec<_> = services
            .adapter
            .evidence_files()
            .iter()
            .chain(services.verifiers.evidence_files().iter())
            .copied()
            .collect();
        match preserve_diagnostics(&manager.root, &path, job, &evidence) {
            Ok(diagnostics) => {
                let mut state = lock(&state);
                state.snapshot.diagnostics = Some(diagnostics);
                state.snapshot.revision += 1;
                state.publish();
            }
            Err(error) => message.push_str(&format!("; diagnostics preservation: {error}")),
        }
        loop {
            match fs::remove_dir_all(&path) {
                Ok(()) => break,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
                Err(error) => {
                    let baseline = control.cleanup_revision();
                    update(
                        &state,
                        job,
                        attempt,
                        Phase::Held,
                        format!("Settled workspace cleanup retained: {error}"),
                    );
                    while control.cleanup_revision() == baseline {
                        thread::sleep(Duration::from_millis(50));
                    }
                }
            }
        }
    }
    drop(lease);
    drop(prepared); // shared attempt lease is released before this runner publishes resources_released.
    {
        let mut state = lock(&state);
        state.snapshot.workspace = None;
        state.snapshot.failure = failure.clone();
        state.snapshot.revision += 1;
        state.publish();
    }
    terminal(
        &state,
        job,
        attempt,
        phase,
        failure.map_or_else(
            || "Verified media safely delivered".into(),
            |failure| format!("{}: {}", failure.code, failure.reason),
        ),
    );
}
fn commit_delivery(
    state: &Arc<Mutex<State>>,
    job: u64,
    attempt: u64,
    staged: &mut output::DestinationStage,
    destination: &std::path::Path,
    identity: &str,
    mut media: output::VerifiedMedia,
) -> Result<(), String> {
    let mut authority = lock(state);
    if authority.snapshot.job_id != job
        || authority.snapshot.attempt != attempt
        || authority.snapshot.phase.terminal()
        || authority.snapshot.delivered.is_some()
    {
        return Err("Stale or already delivered publication".into());
    }
    if authority.control.is_cancelled() {
        return Err("Cancelled before atomic publication".into());
    }
    media.path = staged
        .publish(destination, identity)
        .map_err(|error| format!("E_STORAGE: {error}"))?;
    media.identity_guard = None;
    authority.snapshot.delivered = Some(media);
    authority.snapshot.destination_stage = None;
    authority.snapshot.message = "Verified media published; releasing settled resources".into();
    authority.snapshot.revision += 1;
    authority.publish();
    Ok(())
}
fn settle_destination(
    state: &Arc<Mutex<State>>,
    control: &Control,
    job: u64,
    attempt: u64,
    stage: &mut output::DestinationStage,
) {
    loop {
        let baseline = control.cleanup_revision();
        match stage.cleanup() {
            Ok(()) => {
                let mut state = lock(state);
                state.snapshot.destination_stage = None;
                state.snapshot.revision += 1;
                state.publish();
                break;
            }
            Err(error) => {
                update(state, job, attempt, Phase::Held, error);
                while control.cleanup_revision() == baseline {
                    thread::sleep(Duration::from_millis(50));
                }
            }
        }
    }
}
fn preserve_diagnostics(
    root: &std::path::Path,
    working: &std::path::Path,
    job: u64,
    files: &[(&str, u64)],
) -> Result<PathBuf, String> {
    fs::create_dir_all(root.join("diagnostics")).map_err(|e| e.to_string())?;
    let dir = tempfile::Builder::new()
        .prefix(&format!("job-{job}-"))
        .tempdir_in(root.join("diagnostics"))
        .map_err(|e| e.to_string())?;
    let mut archived_bytes = 0_u64;
    let common = [
        ("runtime-events.log", 8 * 1024 * 1024),
        ("attempt-error.log", 8 * 1024 * 1024),
    ];
    for &(name, limit) in files.iter().chain(common.iter()) {
        if PathBuf::from(name).components().count() != 1
            || !PathBuf::from(name)
                .components()
                .all(|c| matches!(c, std::path::Component::Normal(_)))
        {
            return Err("Evidence filename is not owned relative".into());
        }
        let source = working.join(name);
        match fs::symlink_metadata(&source) {
            Ok(meta) if meta.is_file() && meta.file_attributes() & 0x400 == 0 => {
                if meta.len() <= limit
                    && archived_bytes.saturating_add(meta.len()) <= 64 * 1024 * 1024
                {
                    fs::copy(&source, dir.path().join(name)).map_err(|e| e.to_string())?;
                    archived_bytes += meta.len();
                } else {
                    fs::write(dir.path().join(format!("{name}.omitted.txt")), format!("Bounded local diagnostic omitted: bytes={} per_file_limit={limit}; original failure unchanged\n", meta.len())).map_err(|e| e.to_string())?;
                }
            }
            Ok(_) => return Err(format!("Diagnostics bound/type {name}")),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(dir.keep())
}
#[cfg(test)]
mod ownership_tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    #[test]
    fn progress_publication_rejects_other_identity_phase_cancel_and_terminal() {
        let root = tempfile::tempdir().unwrap();
        let coordinator = composition::coordinator(root.path().into());
        {
            let mut state = lock(&coordinator.state);
            state.snapshot.job_id = 1;
            state.snapshot.attempt = 2;
            state.snapshot.phase = Phase::Downloading;
        }
        let sample = progress::TransferProgress {
            downloaded_bytes: 25,
            exact_total_bytes: Some(100),
            bytes_per_second: Some(5.),
            fraction: Some(0.25),
            observed_at_ms: 1,
            merging: false,
        };
        publish_progress(&coordinator.state, 2, 2, sample.clone());
        publish_progress(&coordinator.state, 1, 1, sample.clone());
        assert!(coordinator.snapshot().transfer_progress.is_none());
        publish_progress(&coordinator.state, 1, 2, sample.clone());
        assert!(coordinator.snapshot().transfer_progress.is_some());
        update(&coordinator.state, 1, 2, Phase::Validating, String::new());
        assert!(coordinator.snapshot().transfer_progress.is_none());
        publish_progress(&coordinator.state, 1, 2, sample.clone());
        assert!(coordinator.snapshot().transfer_progress.is_none());
        update(&coordinator.state, 1, 2, Phase::Downloading, String::new());
        publish_progress(&coordinator.state, 1, 2, sample.clone());
        assert!(coordinator.cancel(1));
        assert!(coordinator.snapshot().transfer_progress.is_none());
        publish_progress(&coordinator.state, 1, 2, sample.clone());
        assert!(coordinator.snapshot().transfer_progress.is_none());
        terminal(&coordinator.state, 1, 2, Phase::Cancelled, String::new());
        publish_progress(&coordinator.state, 1, 2, sample);
        assert!(coordinator.snapshot().transfer_progress.is_none());
        assert_eq!(coordinator.snapshot().terminal_count, 1);
    }
    #[test]
    fn observation_messages_are_closed_phase_templates_not_metadata_or_private_logs()
    -> Result<(), String> {
        let root = tempfile::tempdir().map_err(|e| e.to_string())?;
        let coordinator = composition::coordinator(root.path().into());
        {
            let mut state = lock(&coordinator.state);
            state.snapshot.job_id = 1;
            state.snapshot.attempt = 1;
            state.snapshot.phase = Phase::Accepted;
            state.publish();
        }
        for phase in [
            Phase::Preparing,
            Phase::Resolving,
            Phase::Downloading,
            Phase::Validating,
            Phase::Publishing,
            Phase::Held,
        ] {
            update(&coordinator.state,1,1,phase.clone(),"https://cdn/signed-SECRET?token=SECRET C:\\Users\\PRIVATE Authorization: SECRET Cookie: SECRET".into());
            let snapshot = coordinator.snapshot();
            assert_eq!(snapshot.phase, phase);
            for secret in [
                "SECRET",
                "PRIVATE",
                "://",
                "Cookie",
                "Authorization",
                "C:\\",
            ] {
                assert!(!snapshot.message.contains(secret));
            }
        }
        Ok(())
    }
    #[test]
    fn cancel_and_publication_arbitrate_without_removing_delivery() -> Result<(), String> {
        for _ in 0..20 {
            let root = tempfile::tempdir().map_err(|e| e.to_string())?;
            let source = root.path().join("source.mkv");
            fs::write(&source, b"settled output").map_err(|e| e.to_string())?;
            let media = output::VerifiedMedia {
                path: source,
                bytes: 14,
                sha256: runtime::hash(&b"settled output"[..])?,
                kind: MediaKind::Data,
                facts: contract::VerifiedFacts::default(),
                identity_guard: None,
            };
            let mut stage = output::DestinationStage::create(&media, root.path(), 1)?;
            stage.fill(&media)?;
            let partial = stage.path.clone();
            let coordinator = Arc::new(composition::coordinator(root.path().into()));
            {
                let mut state = lock(&coordinator.state);
                state.snapshot.job_id = 1;
                state.snapshot.attempt = 1;
                state.snapshot.phase = Phase::Publishing;
                state.snapshot.resources_released = false;
                state.publish();
            }
            let barrier = Arc::new(std::sync::Barrier::new(2));
            let publisher = coordinator.clone();
            let start = barrier.clone();
            let destination = root.path().to_path_buf();
            let worker = thread::spawn(move || {
                let mut stage = stage;
                start.wait();
                let result = commit_delivery(
                    &publisher.state,
                    1,
                    1,
                    &mut stage,
                    &destination,
                    "delivered",
                    media,
                );
                stage.cleanup()?;
                result
            });
            barrier.wait();
            let cancelled = coordinator.cancel(1);
            let result = worker.join().map_err(|_| "Publication test owner panic")?;
            if cancelled {
                assert!(result.is_err());
                assert!(coordinator.snapshot().delivered.is_none());
                assert!(!root.path().join("delivered.mkv").exists());
            } else {
                result?;
                let snapshot = coordinator.snapshot();
                let delivered = snapshot.delivered.ok_or("Missing delivered media")?;
                assert_eq!(
                    fs::read(&delivered.path).map_err(|e| e.to_string())?,
                    b"settled output"
                );
                assert!(!coordinator.cancel(1));
            }
            assert!(!partial.exists());
        }
        Ok(())
    }
    fn wait_phase(coordinator: &Coordinator, phase: Phase) -> Result<Snapshot, String> {
        let start = std::time::Instant::now();
        loop {
            let snapshot = coordinator.snapshot();
            if snapshot.phase == phase {
                return Ok(snapshot);
            }
            if start.elapsed() > Duration::from_secs(30) {
                return Err(format!("Expected {phase:?}, got {snapshot:?}"));
            }
            thread::sleep(Duration::from_millis(10));
        }
    }
    fn run_retention(owner_panic: bool) -> Result<(), String> {
        let root =
            PathBuf::from(std::env::var("AMEOW_RUNTIME_TEST_ROOT").map_err(|e| e.to_string())?);
        let output = tempfile::tempdir().map_err(|e| e.to_string())?;
        let coordinator = composition::coordinator(root.clone());
        let query_failure = Arc::new(AtomicBool::new(true));
        lock(&coordinator.state).probe = Some(Arc::new(TestProbe {
            query_failure: query_failure.clone(),
            owner_panic,
            stage_cleanup: false,
        }));
        let intent = DownloadIntent {
            url: "https://youtu.be/jNQXAC9IVRw".into(),
            quality: request::Quality::Saver,
            output_dir: output.path().into(),
        };
        let job = coordinator.accept(intent.clone())?;
        let held = wait_phase(&coordinator, Phase::Held)?;
        assert_eq!(held.terminal_count, 0);
        assert!(!held.resources_released);
        let workspace = held.workspace.ok_or("Held lost workspace")?;
        assert!(workspace.is_dir());
        let deno = root
            .join(format!(
                "runtime-{}",
                held.runtime_digest.ok_or("Held lost runtime digest")?
            ))
            .join("deno.exe");
        assert!(fs::OpenOptions::new().write(true).open(&deno).is_err());
        assert!(coordinator.accept(intent).is_err());
        assert!(!coordinator.retry_cleanup(job + 1));
        thread::sleep(Duration::from_millis(100));
        assert_eq!(coordinator.snapshot().phase, Phase::Held);
        assert!(workspace.is_dir());
        query_failure.store(false, Ordering::Release);
        assert!(coordinator.retry_cleanup(job));
        let terminal = wait_phase(&coordinator, Phase::Failure)?;
        assert!(terminal.resources_released);
        assert_eq!(terminal.terminal_count, 1);
        assert!(!workspace.exists());
        assert!(fs::OpenOptions::new().write(true).open(deno).is_ok());
        assert!(!coordinator.cancel(job));
        Ok(())
    }
    #[test]
    #[ignore = "Requires genuine production-prepared cache via AMEOW_RUNTIME_TEST_ROOT"]
    fn coordinator_retains_real_runtime_and_workspace_while_process_held() -> Result<(), String> {
        run_retention(false)
    }
    #[test]
    #[ignore = "Requires genuine production-prepared cache via AMEOW_RUNTIME_TEST_ROOT"]
    fn coordinator_owner_unwind_retains_real_runtime_until_explicit_cleanup() -> Result<(), String>
    {
        run_retention(true)
    }
    #[test]
    fn snapshot_remains_readable_during_publication_authority_checkpoint() -> Result<(), String> {
        let root = tempfile::tempdir().map_err(|e| e.to_string())?;
        let coordinator = Arc::new(composition::coordinator(root.path().into()));
        let mut held = lock(&coordinator.state);
        held.snapshot.job_id = 7;
        held.snapshot.attempt = 3;
        held.snapshot.revision = 42;
        held.snapshot.phase = Phase::Publishing;
        held.snapshot.resources_released = false;
        held.publish();
        let reader = coordinator.clone();
        let (tx, rx) = std::sync::mpsc::channel();
        let worker = thread::spawn(move || {
            let _ = tx.send(reader.snapshot());
        });
        let result = rx.recv_timeout(Duration::from_millis(100));
        drop(held);
        worker.join().map_err(|_| "Snapshot reader panic")?;
        let snapshot = result.map_err(|_| "Snapshot blocked behind publication authority")?;
        assert_eq!(snapshot.phase, Phase::Publishing);
        assert_eq!(snapshot.job_id, 7);
        assert_eq!(snapshot.attempt, 3);
        assert_eq!(snapshot.revision, 42);
        assert!(!snapshot.resources_released);
        Ok(())
    }
    #[test]
    #[ignore = "Requires genuine production-prepared cache via AMEOW_RUNTIME_TEST_ROOT"]
    fn destination_cleanup_failure_retains_stage_runtime_workspace_and_requires_retry()
    -> Result<(), String> {
        let root =
            PathBuf::from(std::env::var("AMEOW_RUNTIME_TEST_ROOT").map_err(|e| e.to_string())?);
        let output = tempfile::tempdir().map_err(|e| e.to_string())?;
        let coordinator = Arc::new(composition::coordinator(root.clone()));
        lock(&coordinator.state).probe = Some(Arc::new(TestProbe {
            query_failure: Arc::new(AtomicBool::new(false)),
            owner_panic: false,
            stage_cleanup: true,
        }));
        let intent = DownloadIntent {
            url: "https://youtu.be/jNQXAC9IVRw".into(),
            quality: request::Quality::Saver,
            output_dir: output.path().into(),
        };
        let job = coordinator.accept(intent.clone())?;
        let held = wait_phase(&coordinator, Phase::Held)?;
        println!(">>> Actual retained cleanup failure: {}", held.message);
        let (commands, receiver) = std::sync::mpsc::sync_channel(8);
        let stop = Arc::new(AtomicBool::new(true));
        let acknowledged = Arc::new(AtomicBool::new(false));
        let owner = coordinator.clone();
        let status = acknowledged.clone();
        let command_intent = intent.clone();
        let command_owner = thread::spawn(move || {
            bridge_commands::run(owner, command_intent, receiver, stop, status)
        });
        let partial = held.destination_stage.ok_or("Held lost exact partial")?;
        let workspace = held.workspace.ok_or("Held lost workspace")?;
        let deno = root
            .join(format!(
                "runtime-{}",
                held.runtime_digest.ok_or("Lease missing")?
            ))
            .join("deno.exe");
        assert!(partial.is_file());
        assert!(workspace.is_dir());
        assert_eq!(held.terminal_count, 0);
        assert!(!held.resources_released);
        assert!(coordinator.accept(intent).is_err());
        assert!(fs::OpenOptions::new().write(true).open(&deno).is_err());
        commands
            .send(bridge_commands::Command::Start)
            .map_err(|e| e.to_string())?;
        commands
            .send(bridge_commands::Command::Retry)
            .map_err(|e| e.to_string())?;
        thread::sleep(Duration::from_millis(100));
        assert_eq!(coordinator.snapshot().phase, Phase::Held);
        assert_eq!(coordinator.snapshot().job_id, job);
        assert!(!acknowledged.load(Ordering::Acquire));
        assert!(partial.exists());
        let mut permissions = fs::metadata(&partial)
            .map_err(|e| e.to_string())?
            .permissions();
        permissions.set_readonly(false);
        fs::set_permissions(&partial, permissions).map_err(|e| e.to_string())?;
        thread::sleep(Duration::from_millis(100));
        assert_eq!(coordinator.snapshot().phase, Phase::Held);
        assert!(partial.exists());
        commands
            .send(bridge_commands::Command::Retry)
            .map_err(|e| e.to_string())?;
        let terminal = wait_phase(&coordinator, Phase::Failure)?;
        assert_eq!(terminal.terminal_count, 1);
        assert!(terminal.resources_released);
        assert!(terminal.destination_stage.is_none());
        assert!(!partial.exists());
        assert!(!workspace.exists());
        assert!(fs::OpenOptions::new().write(true).open(deno).is_ok());
        command_owner
            .join()
            .map_err(|_| "Bridge command owner panic")?;
        assert!(acknowledged.load(Ordering::Acquire));
        Ok(())
    }
}
