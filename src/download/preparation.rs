//! Safe preparation observations. No URLs, paths, stderr, or proxy configuration cross this boundary.
use serde::{Deserialize, Serialize};
use std::{
    io,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum RuntimeComponent {
    YtDlp,
    GalleryDl,
    Deno,
    Ffmpeg,
    Runtime,
}
impl RuntimeComponent {
    pub fn label(self) -> &'static str {
        match self {
            Self::YtDlp => "yt-dlp",
            Self::GalleryDl => "gallery-dl",
            Self::Deno => "Deno",
            Self::Ffmpeg => "FFmpeg",
            Self::Runtime => "Runtime",
        }
    }
    pub(crate) fn from_name(name: &str) -> Self {
        match name {
            "yt-dlp" => Self::YtDlp,
            "gallery-dl" => Self::GalleryDl,
            "deno" => Self::Deno,
            "ffmpeg" | "ffprobe" => Self::Ffmpeg,
            _ => Self::Runtime,
        }
    }
}
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub enum PreparationPhase {
    #[default]
    Idle,
    Preparing,
    Downloading,
    Verifying,
    Ready,
    Failed,
}
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub enum PreparationStage {
    #[default]
    Cache,
    Acquire,
    Verify,
    Extract,
    Probe,
    Publish,
}
impl PreparationStage {
    pub fn label(self) -> &'static str {
        match self {
            Self::Cache => "cache",
            Self::Acquire => "download",
            Self::Verify => "verify",
            Self::Extract => "extract",
            Self::Probe => "probe",
            Self::Publish => "publish",
        }
    }
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum ErrorCategory {
    Timeout,
    Connect,
    ProxyRouting,
    Http,
    Size,
    Hash,
    Extract,
    Permission,
    Probe,
    Storage,
    Cancelled,
    Unknown,
}
impl ErrorCategory {
    pub fn label(self) -> &'static str {
        match self {
            Self::Timeout => "timeout",
            Self::Connect => "connect",
            Self::ProxyRouting => "proxy-routing",
            Self::Http => "http",
            Self::Size => "size",
            Self::Hash => "hash",
            Self::Extract => "extract",
            Self::Permission => "permission",
            Self::Probe => "probe",
            Self::Storage => "storage",
            Self::Cancelled => "cancelled",
            Self::Unknown => "unknown",
        }
    }
    pub(crate) fn io(error: &io::Error) -> Self {
        match error.kind() {
            io::ErrorKind::PermissionDenied => Self::Permission,
            io::ErrorKind::TimedOut => Self::Timeout,
            _ => Self::Storage,
        }
    }
}

/// Closed, path-free description of the operation that failed.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum PreparationOperation {
    RootCreate, PrepareLock, CandidateInspect, CandidateLimit, FileOpen, FileRead, FileCopy,
    FileCreate, FileWrite, FileSync, ArtifactCreate, ArtifactWrite, ArtifactSync,
    MarkerCreate, MarkerWrite, MarkerSync, MarkerPublish, MarkerCheck, ProbeSpawn,
    ProxyRoute, ProxyConfig, ProxySession, ProxyAuto, ProxyConfigure, HttpRequest,
    ResponseRead, UrlParse, HttpsRequired, RedirectLocation, RedirectLimit, HttpStatus,
    ArtifactLength, Acquire, AcquireCancel,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub enum RuntimeRootSource {
    #[default]
    Unknown,
    DefaultLocalAppData,
    DefaultApplicationSupport,
    ExplicitRuntimeRoot,
    IsolatedInstance,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PreparationFailure {
    pub component: RuntimeComponent,
    pub stage: PreparationStage,
    pub category: ErrorCategory,
    pub message: String,
    pub suggestion: String,
    pub http_status: Option<u16>,
    #[serde(default)]
    pub operation: Option<PreparationOperation>,
    #[serde(default)]
    pub raw_os_error: Option<i32>,
}
impl PreparationFailure {
    pub(crate) fn new(
        component: RuntimeComponent,
        stage: PreparationStage,
        category: ErrorCategory,
    ) -> Self {
        let suggestion = match category {
            ErrorCategory::Timeout | ErrorCategory::Connect | ErrorCategory::Http => {
                "Check the connection; retry preparation manually"
            }
            ErrorCategory::ProxyRouting => {
                "Check the existing system route; no direct fallback was used"
            }
            ErrorCategory::Permission | ErrorCategory::Storage => {
                "Check managed local storage permissions and free space; retry manually"
            }
            ErrorCategory::Cancelled => "Preparation stopped safely",
            _ => "Copy preparation diagnostics; retry preparation manually",
        };
        Self {
            component,
            stage,
            category,
            message: format!(
                "{}: {} failed ({})",
                component.label(),
                stage.label(),
                category.label()
            ),
            suggestion: suggestion.into(),
            http_status: None,
            operation: None,
            raw_os_error: None,
        }
    }
    pub(crate) fn io(
        component: RuntimeComponent,
        stage: PreparationStage,
        error: io::Error,
    ) -> Self {
        let mut failure = Self::new(component, stage, ErrorCategory::io(&error));
        failure.raw_os_error = error.raw_os_error();
        failure
    }
    pub(crate) fn io_operation(
        component: RuntimeComponent, stage: PreparationStage,
        operation: PreparationOperation, error: io::Error,
    ) -> Self {
        let mut failure = Self::io(component, stage, error);
        failure.operation = Some(operation);
        failure
    }
    pub(crate) fn safe(&self) -> Self {
        let mut safe = Self::new(self.component, self.stage, self.category);
        safe.http_status = self.http_status.filter(|s| (100..=599).contains(s));
        safe.operation = self.operation;
        safe.raw_os_error = self.raw_os_error;
        if self.operation == Some(PreparationOperation::CandidateLimit) {
            safe.message = "Runtime: managed cache candidate limit reached".into();
            safe.suggestion = "Copy preparation diagnostics; review managed cache before retry".into();
        }
        safe
    }
}
impl std::fmt::Display for PreparationFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.safe().message)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PreparationEvent {
    pub attempt: u64,
    pub timestamp_ms: u64,
    pub phase: PreparationPhase,
    pub component: Option<RuntimeComponent>,
    pub stage: PreparationStage,
    pub category: Option<ErrorCategory>,
    pub http_status: Option<u16>,
    #[serde(default)]
    pub operation: Option<PreparationOperation>,
    #[serde(default)]
    pub raw_os_error: Option<i32>,
    #[serde(default)]
    pub root_source: RuntimeRootSource,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PreparationSnapshot {
    pub phase: PreparationPhase,
    pub attempt: u64,
    pub component: Option<RuntimeComponent>,
    pub stage: PreparationStage,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub updated_at_ms: u64,
    pub failure: Option<PreparationFailure>,
    pub history: Vec<PreparationEvent>,
    #[serde(default)]
    pub root_source: RuntimeRootSource,
}
pub(crate) fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
impl PreparationSnapshot {
    pub(crate) fn observe(
        &mut self,
        phase: PreparationPhase,
        component: Option<RuntimeComponent>,
        stage: PreparationStage,
        downloaded: u64,
        total: Option<u64>,
        failure: Option<PreparationFailure>,
    ) -> bool {
        let changed = self.phase != phase
            || self.component != component
            || self.stage != stage
            || failure.is_some();
        self.phase = phase;
        self.component = component;
        self.stage = stage;
        self.downloaded_bytes = downloaded;
        self.total_bytes = total;
        self.updated_at_ms = now();
        self.failure = failure.map(|f| f.safe());
        if changed {
            self.history.push(PreparationEvent {
                attempt: self.attempt,
                timestamp_ms: self.updated_at_ms,
                phase,
                component,
                stage,
                category: self.failure.as_ref().map(|f| f.category),
                http_status: self.failure.as_ref().and_then(|f| f.http_status),
                operation: self.failure.as_ref().and_then(|f| f.operation),
                raw_os_error: self.failure.as_ref().and_then(|f| f.raw_os_error),
                root_source: self.root_source,
                downloaded_bytes: downloaded,
                total_bytes: total,
            });
            while self.history.len() > 96 {
                let index = self
                    .history
                    .iter()
                    .position(|e| e.category.is_none())
                    .unwrap_or(0);
                self.history.remove(index);
            }
        }
        changed
    }
    pub fn diagnostic(&self) -> String {
        let mut text = format!(
            "Ameow {}\nPlatform: {}\nRuntime root source: {:?}\nPreparation attempt: {}\n",
            env!("CARGO_PKG_VERSION"),
            if cfg!(windows) { "windows-x64" } else if cfg!(target_os = "macos") { "macos" } else { "unknown" },
            self.root_source,
            self.attempt
        );
        let mut summaries: Vec<_> = self
            .history
            .iter()
            .rev()
            .filter(|event| event.category.is_some())
            .take(6)
            .collect();
        summaries.extend(self.history.iter().rev().take(6));
        summaries.sort_by_key(|event| (event.attempt, event.timestamp_ms));
        summaries.dedup_by(|left, right| std::ptr::eq(*left, *right));
        for event in summaries {
            text.push_str(&format!(
                "Attempt {}: {:?} {} {} bytes={} total={:?} category={} http={:?} operation={:?} os={:?} root={:?}\n",
                event.attempt,
                event.phase,
                event.component.unwrap_or(RuntimeComponent::Runtime).label(),
                event.stage.label(),
                event.downloaded_bytes,
                event.total_bytes,
                event.category.map(|c| c.label()).unwrap_or("none"),
                event.http_status, event.operation, event.raw_os_error, event.root_source
            ));
        }
        if let Some(failure) = &self.failure {
            let safe = failure.safe();
            text.push_str(&format!(
                "{}\nOperation: {:?}; OS: {:?}\nSuggestion: {}\n",
                safe.message, safe.operation, safe.raw_os_error, safe.suggestion
            ));
        }
        text.truncate(4096);
        text
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn r12_diagnostics_reassemble_closed_fields_and_preserve_failure_across_retry() {
        let mut state = PreparationSnapshot {
            attempt: 1,
            ..Default::default()
        };
        let mut failure = PreparationFailure::new(
            RuntimeComponent::YtDlp,
            PreparationStage::Acquire,
            ErrorCategory::Http,
        );
        failure.message =
            r"https://user:secret@private.invalid/file?token=secret C:\private\name raw stderr"
                .into();
        failure.suggestion = "proxy=user:secret@private.invalid".into();
        failure.http_status = Some(403);
        failure.operation = Some(PreparationOperation::MarkerPublish);
        failure.raw_os_error = Some(5);
        state.root_source = RuntimeRootSource::DefaultLocalAppData;
        state.observe(
            PreparationPhase::Failed,
            Some(failure.component),
            failure.stage,
            123,
            Some(456),
            Some(failure),
        );
        state.attempt = 2;
        state.observe(
            PreparationPhase::Preparing,
            None,
            PreparationStage::Cache,
            0,
            None,
            None,
        );
        for index in 0..240 {
            state.observe(
                PreparationPhase::Verifying,
                Some(RuntimeComponent::Ffmpeg),
                if index % 2 == 0 {
                    PreparationStage::Probe
                } else {
                    PreparationStage::Verify
                },
                0,
                None,
                None,
            );
        }
        assert_eq!(state.history.len(), 96);
        assert!(state.history.iter().any(|event| event.attempt == 1
            && event.category == Some(ErrorCategory::Http)
            && event.http_status == Some(403)));
        let text = state.diagnostic();
        assert!(text.is_ascii());
        assert!(text.len() <= 4096);
        assert!(text.contains("403"));
        assert!(text.contains("MarkerPublish"));
        assert!(text.contains("os=Some(5)"));
        assert!(text.contains("DefaultLocalAppData"));
        for secret in ["secret", "private", "stderr", "https://", r"C:\"] {
            assert!(!text.contains(secret));
        }
        // The recent summary still includes prior failure evidence, even after many stage samples.
        let saved = serde_json::to_string(&state.history).unwrap();
        assert!(saved.contains("403"));
        let restored: Vec<PreparationEvent> = serde_json::from_str(&saved).unwrap();
        assert!(restored.iter().any(|event| event.operation == Some(PreparationOperation::MarkerPublish)
            && event.raw_os_error == Some(5) && event.root_source == RuntimeRootSource::DefaultLocalAppData));
        assert!(!saved.contains("secret"));
    }
    #[test]
    fn old_history_without_diagnostic_fields_is_readable() {
        let old = r#"{"attempt":1,"timestamp_ms":0,"phase":"Failed","component":"Runtime","stage":"Publish","category":"Permission","http_status":null,"downloaded_bytes":0,"total_bytes":null}"#;
        let event: PreparationEvent = serde_json::from_str(old).unwrap();
        assert_eq!(event.operation, None);
        assert_eq!(event.raw_os_error, None);
        assert_eq!(event.root_source, RuntimeRootSource::Unknown);
    }
}
