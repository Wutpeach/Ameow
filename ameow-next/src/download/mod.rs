pub mod bridge_commands;
pub mod network;
pub mod output;
pub mod plan;
pub mod process_supervisor;
pub mod request;
pub mod runtime;

use process_supervisor::{Control, ProcessObservation, ProcessSpec};
use request::{Accepted, DownloadIntent, Identity};
use runtime::{RuntimeLease, RuntimeManager};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs::{self, File},
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
    pub plan: Option<plan::FormatPlan>,
    pub message: String,
    pub delivered: Option<output::VerifiedMedia>,
    pub terminal_count: u32,
    pub workspace: Option<PathBuf>,
    pub runtime_digest: Option<String>,
    pub diagnostics: Option<PathBuf>,
    pub resources_released: bool,
    pub settlements: Vec<String>,
    pub destination_stage: Option<PathBuf>,
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
            plan: None,
            message: String::new(),
            delivered: None,
            terminal_count: 0,
            workspace: None,
            runtime_digest: None,
            diagnostics: None,
            resources_released: true,
            settlements: Vec::new(),
            destination_stage: None,
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
    runtime: Arc<RuntimeManager>,
    published: Arc<Mutex<Arc<Snapshot>>>,
}
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    match m.lock() {
        Ok(v) => v,
        Err(e) => e.into_inner(),
    }
}
impl Coordinator {
    pub fn new(root: PathBuf) -> Self {
        let published = Arc::new(Mutex::new(Arc::new(Snapshot::default())));
        Self {
            state: Arc::new(Mutex::new(State {
                snapshot: Snapshot::default(),
                control: Control::default(),
                published: published.clone(),
                #[cfg(test)]
                probe: None,
            })),
            runtime: Arc::new(RuntimeManager::new(root)),
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
        let manager = self.runtime.clone();
        let control = state.control.clone();
        let spawn = thread::Builder::new()
            .name(format!("download-job-{job}"))
            .spawn(move || execute(shared, manager, accepted, control, job, attempt));
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
fn update(state: &Arc<Mutex<State>>, job: u64, attempt: u64, phase: Phase, message: String) {
    let mut state = lock(state);
    if state.snapshot.job_id == job
        && state.snapshot.attempt == attempt
        && !state.snapshot.phase.terminal()
    {
        state.snapshot.phase = phase;
        state.snapshot.message = message;
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
        state.snapshot.message = message;
        state.snapshot.terminal_count += 1;
        state.snapshot.resources_released = true;
        state.snapshot.revision += 1;
        state.publish();
    }
}
fn execute(
    state: Arc<Mutex<State>>,
    manager: Arc<RuntimeManager>,
    accepted: Accepted,
    control: Control,
    job: u64,
    attempt: u64,
) {
    // Resources are owned outside the catch boundary, so unwind cannot release them prematurely.
    let mut workspace = None;
    let mut lease = None;
    let mut destination_stage = None;
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
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
                ProcessObservation::Held(reason) => {
                    update(&observe_state, job, attempt, Phase::Held, reason)
                }
                ProcessObservation::Output { stderr, text } => {
                    let mut state = lock(&observe_state);
                    if state.snapshot.job_id == job
                        && state.snapshot.attempt == attempt
                        && !state.snapshot.phase.terminal()
                    {
                        state.snapshot.message = format!(
                            "{}{}",
                            if stderr { "Engine: " } else { "" },
                            text.chars().take(1000).collect::<String>()
                        );
                        state.snapshot.revision += 1;
                        state.publish();
                    }
                }
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
        lease = Some(manager.prepare(&control, observer.clone(), |message| {
            use std::io::Write;
            if let Ok(mut log) = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(working.join("runtime-events.log"))
            {
                let _ = writeln!(log, "{message}");
            }
            update(&state, job, attempt, Phase::Preparing, message)
        })?);
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
                    streams: serde_json::json!({}),
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
                    env: runtime::child_environment(working)?,
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
        update(
            &state,
            job,
            attempt,
            Phase::Resolving,
            "Resolving one accepted media object".into(),
        );
        let route = network::engine_route(&accepted.intent.url)
            .map_err(|e| format!("E_NETWORK_ENGINE_ROUTE_UNSUPPORTED: {e}"))?;
        let mut arguments = engine_args(runtime, &route)?;
        arguments.extend([
            "--dump-single-json".into(),
            "--skip-download".into(),
            "--".into(),
            accepted.intent.url.clone(),
        ]);
        let metadata = invoke(
            runtime,
            arguments,
            working,
            &control,
            observer.clone(),
            "resolve",
            Some(Duration::from_secs(120)),
        )?;
        let metadata: Value = serde_json::from_slice(&metadata)
            .map_err(|e| format!("Single-object metadata JSON: {e}"))?;
        let identity = accepted.identity(&metadata)?;
        let plan = plan::select(&metadata, accepted.intent.quality)?;
        {
            let mut state = lock(&state);
            state.snapshot.identity = Some(identity.clone());
            state.snapshot.plan = Some(plan.clone());
            state.snapshot.revision += 1;
            state.publish();
        }
        fs::write(
            working.join("resolved.json"),
            serde_json::to_vec_pretty(&metadata).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        let transfer_input = plan::transfer_input(&metadata, &plan)?;
        fs::write(
            working.join("transfer-input.json"),
            serde_json::to_vec_pretty(&transfer_input).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        if control.is_cancelled() {
            return Err("Cancelled before media transfer".into());
        }
        update(
            &state,
            job,
            attempt,
            Phase::Downloading,
            format!(
                "Selected {} / {}p {}",
                plan.selector, plan.height, plan.video_codec
            ),
        );
        let route = network::bind_media_routes(&metadata, &plan, &accepted.intent.url)?;
        fs::write(
            working.join("media-route.json"),
            serde_json::to_vec_pretty(&route).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        let mut arguments = engine_args(runtime, &route)?;
        arguments.extend([
            "--no-simulate".into(),
            "--load-info-json".into(),
            working.join("transfer-input.json").display().to_string(),
            "--format".into(),
            plan.selector.clone(),
            "--merge-output-format".into(),
            "mkv".into(),
            "--output".into(),
            working.join("media.%(ext)s").display().to_string(),
            "--write-info-json".into(),
            "--no-overwrites".into(),
            "--no-part".into(),
            "--newline".into(),
            "--print".into(),
            "after_move:AMEOW_FINAL=%(filepath)j".into(),
        ]);
        let transfer = invoke(
            runtime,
            arguments,
            working,
            &control,
            observer.clone(),
            "transfer",
            None,
        )?;
        let text = String::from_utf8(transfer).map_err(|e| e.to_string())?;
        let final_paths: Vec<_> = text
            .lines()
            .filter_map(|line| line.strip_prefix("AMEOW_FINAL="))
            .collect();
        if final_paths.len() != 1 {
            return Err("Transfer did not report exactly one final object".into());
        }
        let final_path: PathBuf =
            serde_json::from_str(final_paths[0]).map_err(|e| format!("Final path JSON: {e}"))?;
        let info: Value = serde_json::from_reader(
            File::open(working.join("media.info.json"))
                .map_err(|e| format!("Transfer identity record: {e}"))?,
        )
        .map_err(|e| e.to_string())?;
        if accepted.identity(&info)? != identity {
            return Err("Transfer object differs from resolved identity".into());
        }
        if control.is_cancelled() {
            return Err("Cancelled after settled transfer".into());
        }
        update(
            &state,
            job,
            attempt,
            Phase::Validating,
            "Verifying video/audio and settled output integrity".into(),
        );
        let media = output::verify(&final_path, working, &plan, runtime, &control, observer)?;
        if control.is_cancelled() {
            return Err("Cancelled before destination staging".into());
        }
        update(
            &state,
            job,
            attempt,
            Phase::Publishing,
            "Staging verified output in fixed destination".into(),
        );
        destination_stage = Some(output::DestinationStage::create(
            &media,
            &accepted.intent.output_dir,
            job,
        )?);
        let staged = destination_stage
            .as_mut()
            .ok_or("Owned destination stage missing")?;
        {
            let mut state = lock(&state);
            state.snapshot.destination_stage = Some(staged.path.clone());
            state.snapshot.revision += 1;
            state.publish();
        }
        staged.fill(&media)?;
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
        match preserve_diagnostics(&manager.root, &path, job) {
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
    {
        let mut state = lock(&state);
        state.snapshot.workspace = None;
        state.snapshot.revision += 1;
        state.publish();
    }
    terminal(&state, job, attempt, phase, message);
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
    media.path = staged.publish(destination, identity)?;
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
) -> Result<PathBuf, String> {
    fs::create_dir_all(root.join("diagnostics")).map_err(|e| e.to_string())?;
    let dir = tempfile::Builder::new()
        .prefix(&format!("job-{job}-"))
        .tempdir_in(root.join("diagnostics"))
        .map_err(|e| e.to_string())?;
    for name in [
        "runtime-events.log",
        "resolved.json",
        "transfer-input.json",
        "media.info.json",
        "media-route.json",
        "resolve-argv.json",
        "resolve-stdout.log",
        "resolve-stderr.log",
        "resolve-settlement.txt",
        "transfer-argv.json",
        "transfer-stdout.log",
        "transfer-stderr.log",
        "transfer-settlement.txt",
        "ffprobe.json",
        "ffprobe-stderr.log",
    ] {
        let source = working.join(name);
        match fs::symlink_metadata(&source) {
            Ok(meta) if meta.is_file() && meta.len() <= 8 * 1024 * 1024 => {
                fs::copy(&source, dir.path().join(name)).map_err(|e| e.to_string())?;
            }
            Ok(_) => return Err(format!("Diagnostics bound/type {name}")),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(dir.keep())
}
fn engine_args(runtime: &RuntimeLease, route: &network::Route) -> Result<Vec<String>, String> {
    Ok(vec![
        "--ignore-config".into(),
        "--no-plugin-dirs".into(),
        "--no-js-runtimes".into(),
        "--js-runtimes".into(),
        format!("deno:{}", runtime.file("deno.exe")?.display()),
        "--no-cache-dir".into(),
        "--no-playlist".into(),
        "--proxy".into(),
        route.cli(),
        "--ffmpeg-location".into(),
        runtime
            .file("ffmpeg.exe")?
            .parent()
            .ok_or("Runtime parent missing")?
            .display()
            .to_string(),
        "--extractor-args".into(),
        "youtube:player_js_variant=tv".into(),
        "--socket-timeout".into(),
        "20".into(),
        "--retries".into(),
        "0".into(),
        "--fragment-retries".into(),
        "0".into(),
        "--verbose".into(),
    ])
}
fn invoke(
    runtime: &RuntimeLease,
    args: Vec<String>,
    working: &std::path::Path,
    control: &Control,
    observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>,
    label: &str,
    timeout: Option<Duration>,
) -> Result<Vec<u8>, String> {
    fs::write(
        working.join(format!("{label}-argv.json")),
        serde_json::to_vec_pretty(&args).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let outcome = process_supervisor::run(
        ProcessSpec {
            executable: runtime.file("yt-dlp.exe")?,
            args,
            cwd: working.into(),
            env: runtime::child_environment(working)?,
            stdout_limit: 8 * 1024 * 1024,
            stderr_limit: 1024 * 1024,
            timeout,
        },
        control,
        observer,
    )?;
    fs::write(working.join(format!("{label}-stdout.log")), &outcome.stdout)
        .map_err(|e| e.to_string())?;
    fs::write(working.join(format!("{label}-stderr.log")), &outcome.stderr)
        .map_err(|e| e.to_string())?;
    fs::write(
        working.join(format!("{label}-settlement.txt")),
        format!("{:?}", outcome.facts),
    )
    .map_err(|e| e.to_string())?;
    if outcome.exit_code != 0
        || outcome.facts.stdout_truncated
        || !outcome.facts.resources_releasable()
    {
        return Err(format!(
            "{label} engine exit {}: {}",
            outcome.exit_code,
            String::from_utf8_lossy(&outcome.stderr)
                .chars()
                .rev()
                .take(3000)
                .collect::<String>()
                .chars()
                .rev()
                .collect::<String>()
        ));
    }
    Ok(outcome.stdout)
}

#[cfg(test)]
mod ownership_tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
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
                streams: serde_json::json!({}),
                identity_guard: None,
            };
            let mut stage = output::DestinationStage::create(&media, root.path(), 1)?;
            stage.fill(&media)?;
            let partial = stage.path.clone();
            let coordinator = Arc::new(Coordinator::new(root.path().into()));
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
        let coordinator = Coordinator::new(root.clone());
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
        let coordinator = Arc::new(Coordinator::new(root.path().into()));
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
        let coordinator = Arc::new(Coordinator::new(root.clone()));
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
