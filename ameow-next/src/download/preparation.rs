//! Safe preparation observations. No URLs, paths, stderr, or proxy configuration cross this boundary.
use serde::{Deserialize, Serialize};
use std::{
    io,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum RuntimeComponent {
    YtDlp,
    Deno,
    Ffmpeg,
    Runtime,
}
impl RuntimeComponent {
    pub fn label(self) -> &'static str {
        match self {
            Self::YtDlp => "yt-dlp",
            Self::Deno => "Deno",
            Self::Ffmpeg => "FFmpeg",
            Self::Runtime => "Runtime",
        }
    }
    pub(crate) fn from_name(name: &str) -> Self {
        match name {
            "yt-dlp" => Self::YtDlp,
            "deno" => Self::Deno,
            "ffmpeg" => Self::Ffmpeg,
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
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PreparationFailure {
    pub component: RuntimeComponent,
    pub stage: PreparationStage,
    pub category: ErrorCategory,
    pub message: String,
    pub suggestion: String,
    pub http_status: Option<u16>,
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
        }
    }
    pub(crate) fn io(
        component: RuntimeComponent,
        stage: PreparationStage,
        error: io::Error,
    ) -> Self {
        Self::new(component, stage, ErrorCategory::io(&error))
    }
    pub(crate) fn safe(&self) -> Self {
        let mut safe = Self::new(self.component, self.stage, self.category);
        safe.http_status = self.http_status.filter(|s| (100..=599).contains(s));
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
            "Ameow Next {}\nPlatform: windows-x64\nPreparation attempt: {}\n",
            env!("CARGO_PKG_VERSION"),
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
                "Attempt {}: {:?} {} {} bytes={} total={:?} category={} http={:?}\n",
                event.attempt,
                event.phase,
                event.component.unwrap_or(RuntimeComponent::Runtime).label(),
                event.stage.label(),
                event.downloaded_bytes,
                event.total_bytes,
                event.category.map(|c| c.label()).unwrap_or("none"),
                event.http_status
            ));
        }
        if let Some(failure) = &self.failure {
            let safe = failure.safe();
            text.push_str(&format!(
                "{}\nSuggestion: {}\n",
                safe.message, safe.suggestion
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
        for secret in ["secret", "private", "stderr", "https://", r"C:\"] {
            assert!(!text.contains(secret));
        }
        // The recent summary still includes prior failure evidence, even after many stage samples.
        let saved = serde_json::to_string(&state.history).unwrap();
        assert!(saved.contains("403"));
        assert!(!saved.contains("secret"));
    }
}
