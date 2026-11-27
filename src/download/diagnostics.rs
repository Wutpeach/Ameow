//! Failure classification consumes local evidence; projection/copy emits ONLY trusted fields.
use super::Phase;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Failure {
    #[serde(default)]
    pub downloader: Option<super::contract::Downloader>,
    pub code: String,
    pub stage: String,
    pub reason: String,
    pub suggestion: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub engine: Option<EngineFailure>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<FailureContext>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum EngineReport {
    Unknown,
    Http(u16),
    Timeout,
    Dns,
    Tls,
    ProxyConnection,
    ConnectionReset,
    DiskFull,
    PermissionDenied,
    FormatUnavailable,
}
impl EngineReport {
    fn description(&self) -> String {
        match self {
            Self::Http(status) if (100..=599).contains(status) => format!("HTTP {status} (reported by downloader; response not independently verified)"),
            Self::Timeout => "connection/read timed out (reported by downloader)".into(),
            Self::Dns => "DNS resolution failed (reported by downloader)".into(),
            Self::Tls => "TLS/certificate failure (reported by downloader)".into(),
            Self::ProxyConnection => "proxy connection failed (reported by downloader; target HTTP status unknown)".into(),
            Self::ConnectionReset => "connection reset (reported by downloader)".into(),
            Self::DiskFull => "disk full (reported by downloader)".into(),
            Self::PermissionDenied => "file permission denied (reported by downloader)".into(),
            Self::FormatUnavailable => "requested format unavailable (reported by downloader)".into(),
            _ => "unknown; no classified engine error was retained".into(),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum EngineOutput { CompleteLines, NoCompleteLines, Truncated }
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum EngineStage { Resolve, Transfer }
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct EngineFailure {
    #[serde(default)]
    pub stage: Option<EngineStage>,
    pub exit_code: u32,
    pub observed_at_ms: u64,
    pub report: EngineReport,
    pub output: EngineOutput,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct FailureContext {
    pub job_id: u64,
    pub attempt: u64,
    pub occurred_at_ms: u64,
    pub runtime_digest: Option<String>,
    pub runtime_versions: Vec<(String, String)>,
    pub executable_sha256: Option<String>,
}
impl FailureContext {
    pub(crate) fn capture(job_id: u64, attempt: u64, runtime: Option<&super::runtime::RuntimeLease>, engine: Option<&EngineFailure>) -> Self {
        static EXE_HASH: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();
        Self {
            job_id, attempt,
            occurred_at_ms: engine.map_or_else(super::progress::now_ms, |e| e.observed_at_ms),
            runtime_digest: runtime.map(|r| r.digest.clone()),
            runtime_versions: runtime.map_or_else(Vec::new, |r| r.versions.clone()),
            executable_sha256: EXE_HASH.get_or_init(|| {
                std::env::current_exe().ok().and_then(|p| std::fs::File::open(p).ok())
                    .and_then(|f| super::runtime::hash(f).ok())
            }).clone(),
        }
    }
}
#[derive(Clone, Copy, Debug)]
pub enum FailureCode {
    Runtime,
    Identity,
    Duplicate,
    Storage,
    Route,
    Cancelled,
    Media,
    Unknown,
    UnsupportedObject,
    UnsafeUrl,
    UnsupportedUrl,
    FallbackFailed,
    FormatUnavailable,
}
impl Failure {
    pub(crate) fn safe(&self) -> Self {
        let mut safe = known(&self.code, &self.stage);
        safe.downloader = self.downloader;
        safe.engine = self.engine.clone();
        safe.context = self.context.clone();
        safe
    }
    pub fn new(code: FailureCode, stage: &str) -> Self {
        known(
            match code {
                FailureCode::Runtime => "E_RUNTIME",
                FailureCode::Identity => "E_IDENTITY",
                FailureCode::Duplicate => "E_DUPLICATE",
                FailureCode::Storage => "E_STORAGE",
                FailureCode::Route => "E_ROUTE_UNSUPPORTED",
                FailureCode::Cancelled => "E_CANCELLED",
                FailureCode::Media => "E_MEDIA",
                FailureCode::Unknown => "E_UNKNOWN",
                FailureCode::UnsupportedObject => "E_OBJECT_UNSUPPORTED",
                FailureCode::UnsafeUrl => "E_URL_UNSAFE",
                FailureCode::UnsupportedUrl => "E_UNSUPPORTED_URL",
                FailureCode::FallbackFailed => "E_FALLBACK_FAILED",
                FailureCode::FormatUnavailable => "E_FORMAT_UNAVAILABLE",
            },
            stage,
        )
    }
    pub fn local(phase: &Phase) -> Self {
        let (code, stage) = match phase {
            Phase::Preparing => (FailureCode::Runtime, "runtime"),
            Phase::Publishing => (FailureCode::Storage, "publish"),
            Phase::Validating => (FailureCode::Media, "verify"),
            _ => (FailureCode::Unknown, "unknown"),
        };
        Self::new(code, stage)
    }
    pub fn from_error(phase: &Phase, error: &str) -> Self {
        if error.starts_with("E_MEDIA_UNVERIFIED:") { known("E_MEDIA_UNVERIFIED", "verify") }
        else if error.starts_with("E_MEDIA_INVALID:") { known("E_MEDIA", "verify") }
        else if error.starts_with("E_OBJECT_UNSUPPORTED:") { known("E_OBJECT_UNSUPPORTED", "verify") }
        else if error.starts_with("E_CLIP_UNSUPPORTED:") { known("E_CLIP_UNSUPPORTED", "verify") }
        else { Self::local(phase) }
    }
}
pub(crate) fn known(code: &str, stage: &str) -> Failure {
    let (reason, suggestion) = match code {
        "E_CLIP_UNSUPPORTED" => (
            "The source could not deliver a bounded fast clip",
            "Check the selected range and source format; no whole-video fallback was performed",
        ),
        "E_OBJECT_UNSUPPORTED" => (
            "This link did not resolve to one verifiable media object",
            "Use a public single-work link; collections are not supported here yet",
        ),
        "E_URL_UNSAFE" => (
            "This destination is not an allowed public HTTP(S) target",
            "Use a public link without credentials or local-network addresses",
        ),
        "E_UNSUPPORTED_URL" => (
            "The selected downloader could not extract this link",
            "Check the public work link and the safe attempt diagnostics",
        ),
        "E_FALLBACK_FAILED" => (
            "Neither downloader completed a verified delivery",
            "Check the public work link and review both safe attempt diagnostics",
        ),
        "E_MEDIA" => (
            "The delivered media failed verification",
            "Copy the safe diagnostics before retrying",
        ),
        "E_MEDIA_UNVERIFIED" => (
            "The delivered media could not be verified from available evidence",
            "Copy the safe diagnostics; the file has not been confirmed damaged",
        ),
        "E_RATE_LIMIT" => (
            "The site temporarily limited requests",
            "Check the original page; retry manually later",
        ),
        "E_NETWORK_TEMPORARY" => (
            "The network temporarily failed",
            "Check the connection; retry manually if needed",
        ),
        "E_ACCESS_DENIED" => (
            "The downloader reported restricted access",
            "Check access to the original page before retrying manually",
        ),
        "E_UNAVAILABLE" => (
            "This public video is unavailable",
            "Check the original video page",
        ),
        "E_IDENTITY" => (
            "A single accepted video identity could not be verified",
            "Use a clear single-video link and explicit part",
        ),
        "E_DUPLICATE" => (
            "The same video already has an unfinished job",
            "Open the existing queue item",
        ),
        "E_STORAGE" => (
            "The destination could not safely store the file",
            "Check free space and directory permissions",
        ),
        "E_ROUTE_UNSUPPORTED" => (
            "The current network route cannot be represented safely",
            "Check the existing system proxy configuration",
        ),
        "E_RUNTIME" => (
            "The fixed download runtime could not be prepared",
            "Check the connection and managed runtime",
        ),
        "E_CANCELLED" => (
            "Download cancelled",
            "Paste again to create a new job",
        ),
        "E_METADATA_TOO_LARGE" => (
            "Complete metadata exceeds the bounded resolver capacity",
            "Try a smaller public single video or copy the safe diagnostics",
        ),
        "E_METADATA_INVALID_JSON" => (
            "The resolver returned complete but invalid metadata JSON",
            "Check the public video page and copy the safe diagnostics",
        ),
        "E_FORMAT_UNAVAILABLE" => (
            "No video format matches the selected quality",
            "Choose a different quality and submit the link again; retrying this task keeps its original quality",
        ),
        "E_ENGINE_FAILED" => (
            "The download engine exited unsuccessfully; the cause is unconfirmed",
            "Check the public video page and copy the safe diagnostics",
        ),
        "E_ENGINE_OUTPUT_LIMIT" => (
            "The download engine output exceeded its bounded capture",
            "Copy the safe diagnostics before retrying",
        ),
        "E_HTTP_FORBIDDEN" => (
            "The downloader reported HTTP 403; the cause is unconfirmed",
            "Check the public video page; no automatic retry is scheduled",
        ),
        _ => (
            "The download failed without a verified recoverable cause",
            "Check the original page and copy the safe diagnostics",
        ),
    };
    let code = if matches!(
        code,
        "E_MEDIA"
            | "E_CLIP_UNSUPPORTED"
            | "E_MEDIA_UNVERIFIED"
            | "E_OBJECT_UNSUPPORTED"
            | "E_URL_UNSAFE"
            | "E_UNSUPPORTED_URL"
            | "E_FALLBACK_FAILED"
            | "E_RATE_LIMIT"
            | "E_NETWORK_TEMPORARY"
            | "E_ACCESS_DENIED"
            | "E_UNAVAILABLE"
            | "E_IDENTITY"
            | "E_DUPLICATE"
            | "E_STORAGE"
            | "E_ROUTE_UNSUPPORTED"
            | "E_RUNTIME"
            | "E_CANCELLED"
            | "E_METADATA_TOO_LARGE"
            | "E_METADATA_INVALID_JSON"
            | "E_ENGINE_FAILED"
            | "E_FORMAT_UNAVAILABLE"
            | "E_ENGINE_OUTPUT_LIMIT"
            | "E_HTTP_FORBIDDEN"
    ) {
        code
    } else {
        "E_UNKNOWN"
    };
    let stage = if matches!(
        stage,
        "runtime" | "resolve" | "transfer" | "verify" | "publish" | "cleanup" | "admission"
            | "primary-resolve" | "fallback-resolve" | "fallback-transfer"
            | "fallback-admission" | "fallback-verify" | "fallback-publish" | "fallback-unknown"
    ) {
        stage
    } else {
        "unknown"
    };
    Failure {
        downloader: None,
        engine: None,
        context: None,
        code: code.into(),
        stage: stage.into(),
        reason: reason.into(),
        suggestion: suggestion.into(),
    }
}
pub fn cancelled() -> Failure {
    known("E_CANCELLED", "cleanup")
}
pub fn identity_failure() -> Failure {
    known("E_IDENTITY", "admission")
}
#[cfg(test)]
mod resolve_regressions {
    use super::*;
    #[test]
    fn native_failure_bad_media_and_missing_evidence_remain_distinct() {
        assert_eq!(Failure::from_error(&Phase::Validating, "E_MEDIA_UNVERIFIED: missing timing").code, "E_MEDIA_UNVERIFIED");
        assert_eq!(Failure::from_error(&Phase::Validating, "E_MEDIA_INVALID: decoding failed").code, "E_MEDIA");
        let native = crate::download::adapters::yt_dlp::diagnostics::classify(&Phase::Resolving, "resolve engine exit 1: ERROR: opaque native failure");
        assert_eq!(native.code, "E_ENGINE_FAILED");
        let copy = copy_text(1, "unknown", &[Failure::from_error(&Phase::Validating, "E_MEDIA_UNVERIFIED: https://private.example/token=SECRET")]);
        assert!(copy.contains("E_MEDIA_UNVERIFIED [verify]")); assert!(!copy.contains("SECRET"));
    }
    #[test]
    fn truncated_and_invalid_metadata_have_distinct_safe_diagnostics() {
        let overflow = crate::download::adapters::yt_dlp::diagnostics::classify(
            &Phase::Resolving,
            "E_METADATA_TOO_LARGE: complete metadata capture exceeded bound",
        );
        assert_eq!(overflow.code, "E_METADATA_TOO_LARGE");
        let invalid = crate::download::adapters::yt_dlp::diagnostics::classify(
            &Phase::Resolving,
            "E_METADATA_INVALID_JSON: complete output is invalid JSON",
        );
        assert_eq!(invalid.code, "E_METADATA_INVALID_JSON");
        let copy = copy_text(1, "youtube", &[overflow, invalid]);
        assert!(copy.contains("E_METADATA_TOO_LARGE [resolve]"));
        assert!(copy.contains("E_METADATA_INVALID_JSON [resolve]"));
    }
}
pub fn safe_title(title: &str) -> String {
    title
        .split_whitespace()
        .map(|word| {
            if word.contains("://")
                || word.contains('\\')
                || word.starts_with('/')
                || word.contains('@')
                || word.to_ascii_lowercase().contains("token=")
            {
                "[redacted]"
            } else {
                word
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .filter(|c| !c.is_control())
        .take(160)
        .collect()
}
pub fn copy_text(job: u64, site: &str, failures: &[Failure]) -> String {
    copy_with_versions(job, site, failures, &[])
}
pub fn copy_with_versions(
    job: u64,
    site: &str,
    failures: &[Failure],
    versions: &[(String, String)],
) -> String {
    // Reassemble from a closed vocabulary, never quote evidence, metadata, URL, title or paths.
    let site = if matches!(site, "youtube" | "bilibili") {
        site
    } else {
        "unknown"
    };
    let mut text = format!(
        "Ameow {}\nPlatform: {}\nBuild: {}\nSource commit: {}\nSource SHA256: {}\nJob: {job}\nSite: {site}\n",
        env!("CARGO_PKG_VERSION"), crate::app_update::TARGET,
        if cfg!(debug_assertions) { "debug" } else { "release" },
        fingerprint(option_env!("AMEOW_DEV_BUILD_COMMIT"), 40),
        fingerprint(option_env!("AMEOW_DEV_BUILD_SOURCE_SHA256"), 64),
    );
    for (component, version) in versions.iter().take(8) {
        let sanitize = |value: &str| value.chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')).take(48).collect::<String>();
        text.push_str(&format!("Declared runtime: {} {}\n", sanitize(component), sanitize(version)));
    }
    for (index, failure) in failures.iter().take(6).enumerate() {
        let safe = failure.safe();
        if let Some(engine) = failure.downloader { text.push_str(&format!("Downloader: {}\n", engine.label())); }
        else if safe.stage == "primary-resolve" { text.push_str("Downloader: yt-dlp\n"); }
        else if safe.stage.starts_with("fallback-") { text.push_str("Downloader: gallery-dl\n"); }
        text.push_str(&format!(
            "Failure {}: {} [{}]\n{}\nSuggestion: {}\n",
            index + 1,
            safe.code,
            safe.stage,
            safe.reason,
            safe.suggestion
        ));
        if let Some(context) = failure.context.as_ref().filter(|c| c.job_id == job) {
            text.push_str(&format!("Attempt: {}\nFailure time: {}\nEXE SHA256: {}\nRuntime digest: {}\n",
                context.attempt, crate::browser_sessions::utc_timestamp(context.occurred_at_ms / 1000),
                fingerprint(context.executable_sha256.as_deref(), 64), fingerprint(context.runtime_digest.as_deref(), 64)));
            for (name, version) in context.runtime_versions.iter().take(8) {
                if matches!(name.as_str(), "yt-dlp" | "gallery-dl" | "ffmpeg" | "ffprobe" | "deno" | "python")
                    && !version.is_empty() && version.len() <= 96
                    && version.bytes().all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'-' | b'_')) {
                    text.push_str(&format!("Actual runtime: {name} {version}\n"));
                }
            }
        } else {
            text.push_str("Attempt/time/build/runtime identity: unknown; not retained for this failure\n");
        }
        if let Some(engine) = &failure.engine {
            text.push_str(&format!("Engine phase: {}\nEngine exit code: {}\nEngine report: {}\nEngine evidence: {}\n",
                match engine.stage { Some(EngineStage::Resolve) => "resolve", Some(EngineStage::Transfer) => "transfer", None => "unknown" },
                engine.exit_code, engine.report.description(), match engine.output {
                    EngineOutput::CompleteLines => "bounded stderr lines examined; raw text excluded",
                    EngineOutput::NoCompleteLines => "no complete stderr lines available",
                    EngineOutput::Truncated => "stderr capture truncated; cause not classified",
                }));
        } else {
            text.push_str("Engine exit/report: unknown; not retained or not an engine failure\n");
        }
    }
    // Closed ASCII vocabulary plus bounded numeric fields is the final redaction/size gate.
    text.chars()
        .filter(|c| c.is_ascii() && (!c.is_control() || *c == '\n'))
        .take(4096)
        .collect()
}
fn fingerprint(value: Option<&str>, length: usize) -> &str {
    value.filter(|s| s.len() == length && s.bytes().all(|b| b.is_ascii_hexdigit())).unwrap_or("unknown")
}
