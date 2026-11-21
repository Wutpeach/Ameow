//! Explicitly selected, isolated Windows fixture for exercising the real queue.
use super::{
    adapter::{DownloadServices, DownloaderAdapter, ExecutionContext, ManagedCommand},
    composition,
    contract::{AdapterEvent, AdapterResult, Downloader, ExecutionRequest, IdentityAttestation, MediaKind, ProducedArtifact, VerificationRequirements, VideoExpectation},
    diagnostics::{Failure, FailureCode},
    process_supervisor::ProcessObservation,
    request::{Identity, Object, Site},
    runtime::{self, RuntimeManager, TrustedRuntimeRequirements},
    verification::VerifierRegistry,
};
use serde_json::{Value, json};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, atomic::{AtomicU64, Ordering}},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub const MARKER_NAME: &str = ".ameow-cancel-fixture";
pub const MARKER_CONTENT: &str = "Ameow isolated cancellation fixture v1\n";
pub const TARGET_URL: &str = "https://youtu.be/00000000001";
pub const OTHER_URL: &str = "https://youtu.be/00000000002";
static NEXT_LOG: AtomicU64 = AtomicU64::new(0);

/// The runtime root must be inside an explicitly marked, isolated instance.
pub fn services(root: PathBuf, origin: &str, mode: &str) -> Result<DownloadServices, String> {
    let origin = url::Url::parse(origin).map_err(|e| e.to_string())?;
    if origin.scheme() != "http" || origin.host_str() != Some("127.0.0.1")
        || origin.port().is_none() || origin.path() != "/" || origin.query().is_some()
        || origin.fragment().is_some() || !origin.username().is_empty() || origin.password().is_some()
    {
        return Err("Fixture requires a numeric loopback HTTP origin with an explicit port".into());
    }
    if !matches!(mode, "native" | "retry" | "ffmpeg") {
        return Err("Fixture mode must be native, retry, or ffmpeg".into());
    }
    let instance = root.parent().ok_or("Fixture runtime has no parent")?;
    if !root.is_absolute() || root.file_name().and_then(|s| s.to_str()) != Some("runtime")
        || fs::read_to_string(instance.join(MARKER_NAME)).ok().as_deref() != Some(MARKER_CONTENT)
    {
        return Err("Fixture requires a marked isolated instance and its runtime directory".into());
    }
    let args = vec!["ameow".to_string(), "--instance-root".to_string(), instance.display().to_string()];
    let instance = crate::control::isolated_root(&args)
        .map_err(|e| e.to_string())?.ok_or("Fixture isolation unavailable")?;
    let evidence = instance.join("cancel-fixture-evidence");
    fs::create_dir_all(&evidence).map_err(|e| e.to_string())?;
    let requirements = composition::requirements();
    Ok(DownloadServices {
        runtime: Arc::new(RuntimeManager::new(instance.join("runtime"))),
        adapter: Arc::new(FixtureAdapter { requirements, origin: origin.as_str().trim_end_matches('/').into(), mode: mode.into(), evidence }),
        verifiers: Arc::new(VerifierRegistry::video("ffprobe.exe")),
    })
}

struct FixtureAdapter {
    requirements: TrustedRuntimeRequirements,
    origin: String,
    mode: String,
    evidence: PathBuf,
}
fn failed(code: FailureCode) -> Failure { Failure::new(code, "fixture-transfer") }
fn log(file: &Mutex<File>, value: Value) {
    if let Ok(mut file) = file.lock() {
        let _ = writeln!(file, "{value}");
        let _ = file.flush();
    }
}
fn sha(path: &Path) -> Result<String, String> {
    runtime::hash(File::open(path).map_err(|e| e.to_string())?)
}
impl DownloaderAdapter for FixtureAdapter {
    fn kind(&self) -> MediaKind { MediaKind::Video }
    fn requirements(&self) -> &TrustedRuntimeRequirements { &self.requirements }
    fn evidence_files(&self) -> &[(&str, u64)] { &[] }
    fn execute(&self, request: &ExecutionRequest, context: &ExecutionContext<'_>) -> AdapterResult {
        let (role, id) = match &request.accepted.object {
            Object::Youtube(id) if id == "00000000001" => ("target", id.clone()),
            Object::Youtube(id) if id == "00000000002" => ("other", id.clone()),
            _ => return Err(failed(FailureCode::Identity)),
        };
        let identity = Identity { id, title: format!("Fixture {role}"), site: Site::Youtube, part: None };
        context.emit(AdapterEvent::Resolving);
        context.admit(&IdentityAttestation { identity: identity.clone(), aliases: vec![identity.canonical_key()] })?;
        let yt = context.tool("yt-dlp.exe").map_err(|_| failed(FailureCode::Runtime))?;
        let ffmpeg = context.tool("ffmpeg.exe").map_err(|_| failed(FailureCode::Runtime))?;
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|_| failed(FailureCode::Unknown))?.as_nanos();
        let filename = format!("{}-{}-{}-{}.jsonl", self.mode, role, timestamp, NEXT_LOG.fetch_add(1, Ordering::Relaxed));
        let file = Arc::new(Mutex::new(OpenOptions::new().write(true).create_new(true)
            .open(self.evidence.join(filename)).map_err(|_| failed(FailureCode::Storage))?));
        log(&file, json!({"event":"start", "role":role, "mode":self.mode,
            "workspace":context.workspace(), "yt_dlp":yt, "yt_dlp_sha256":sha(&yt).map_err(|_| failed(FailureCode::Runtime))?,
            "ffmpeg":ffmpeg, "ffmpeg_sha256":sha(&ffmpeg).map_err(|_| failed(FailureCode::Runtime))?}));
        let target = format!("{}/{}/{}/video.m3u8", self.origin, self.mode, role);
        let mut args: Vec<String> = ["--ignore-config", "--no-plugin-dirs", "--no-js-runtimes", "--proxy", "",
            "--no-playlist", "--verbose", "--newline", "--progress", "--progress-delta", "0.2",
            "--socket-timeout", "5", "--fragment-retries", "20", "--retry-sleep", "fragment:1",
            "--abort-on-unavailable-fragments", "--format", "best", "--remux-video", "mkv",
            "--output", "media.%(ext)s", "--write-info-json"]
            .into_iter().map(str::to_string).collect();
        args.extend(["--ffmpeg-location".into(), ffmpeg.display().to_string()]);
        if self.mode == "ffmpeg" && role == "target" { args.push("--hls-prefer-ffmpeg".into()); }
        args.extend(["--".into(), target]);
        context.emit(AdapterEvent::Engine(Downloader::YtDlp));
        context.emit(AdapterEvent::Transferring);
        let observation_file = file.clone();
        let outcome = context.run(ManagedCommand { tool: "yt-dlp.exe", args, stdout_limit: 256 * 1024,
            stderr_limit: 256 * 1024, timeout: Some(Duration::from_secs(180)) },
            Some(Arc::new(move |event| match event {
                ProcessObservation::Running { pid } => log(&observation_file, json!({"event":"running", "pid":pid})),
                ProcessObservation::Held(reason) => log(&observation_file, json!({"event":"held", "reason":reason})),
                ProcessObservation::Settled(facts) => log(&observation_file, json!({"event":"settled",
                    "root_pid":facts.root_pid, "total_processes":facts.total_processes,
                    "root_waited":facts.root_waited, "job_active_zero":facts.job_active_zero,
                    "stdout_reader_joined":facts.stdout_reader_joined, "stderr_reader_joined":facts.stderr_reader_joined,
                    "callback_consumer_joined":facts.callback_consumer_joined,
                    "membership_verified_before_resume":facts.membership_verified_before_resume,
                    "resources_releasable":facts.resources_releasable()})),
                ProcessObservation::Output { .. } => {}
            }))).map_err(|_| failed(FailureCode::Runtime))?;
        log(&file, json!({"event":"result", "exit_code":outcome.exit_code,
            "stdout":String::from_utf8_lossy(&outcome.stdout), "stderr":String::from_utf8_lossy(&outcome.stderr)}));
        if context.cancelled() {
            // Keep the real attempt owner alive briefly so its cancelling state can be inspected.
            log(&file, json!({"event":"fixture_post_settlement_pause", "milliseconds":2000}));
            std::thread::sleep(Duration::from_secs(2));
            return Err(failed(FailureCode::Cancelled));
        }
        if outcome.exit_code != 0 || !outcome.facts.resources_releasable() { return Err(failed(FailureCode::Unknown)); }
        let path = ["media.mkv", "media.mp4", "media.ts"].into_iter()
            .find(|name| context.workspace().join(name).is_file()).ok_or_else(|| failed(FailureCode::Media))?;
        Ok(ProducedArtifact { relative_path: path.into(), identity, kind: MediaKind::Video,
            verification: VerificationRequirements::Video(VideoExpectation { height: None, codec: None,
                requires_audio: false, height_cap: request.accepted.intent.quality.cap() }) })
    }
}
