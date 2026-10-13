//! Failure classification consumes local evidence; projection/copy emits ONLY trusted fields.
use super::Phase;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Failure {
    pub code: String,
    pub stage: String,
    pub reason: String,
    pub suggestion: String,
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
}
impl Failure {
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
}
pub(crate) fn known(code: &str, stage: &str) -> Failure {
    let (reason, suggestion) = match code {
        "E_MEDIA" => (
            "The delivered media failed verification",
            "Copy the safe diagnostics before retrying",
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
            "The site requires permission or authentication",
            "Use a public video you can download",
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
        "E_ENGINE_FAILED" => (
            "The download engine exited unsuccessfully; the cause is unconfirmed",
            "Check the public video page and copy the safe diagnostics",
        ),
        "E_ENGINE_OUTPUT_LIMIT" => (
            "The download engine output exceeded its bounded capture",
            "Copy the safe diagnostics before retrying",
        ),
        "E_HTTP_FORBIDDEN" => (
            "The site rejected a media request with HTTP 403; the cause is unconfirmed",
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
    ) {
        stage
    } else {
        "unknown"
    };
    Failure {
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
        "Ameow Next {}\nPlatform: windows-x64\nJob: {job}\nSite: {site}\n",
        env!("CARGO_PKG_VERSION")
    );
    for (component, version) in versions.iter().take(8) {
        let sanitize = |value: &str| value.chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')).take(48).collect::<String>();
        text.push_str(&format!("Runtime: {} {}
", sanitize(component), sanitize(version)));
    }
    for (index, failure) in failures.iter().take(6).enumerate() {
        let safe = known(&failure.code, &failure.stage);
        text.push_str(&format!(
            "Failure {}: {} [{}]\n{}\nSuggestion: {}\n",
            index + 1,
            safe.code,
            safe.stage,
            safe.reason,
            safe.suggestion
        ));
    }
    // Closed ASCII vocabulary plus bounded numeric fields is the final redaction/size gate.
    text.chars()
        .filter(|c| c.is_ascii() && (!c.is_control() || *c == '\n'))
        .take(4096)
        .collect()
}
