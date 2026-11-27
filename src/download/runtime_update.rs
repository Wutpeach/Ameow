use serde::{Deserialize, Serialize};
use super::contract::Downloader;
use std::{fs, io::{Read, Write}, path::Path};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum RuntimeUpdatePhase {
    #[default]
    Idle,
    Preparing,
    Downloading,
    Verifying,
    Waiting,
    Activated,
    Failed,
    RolledBack,
    RecoveryRequired,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeSelectionPolicy {
    #[default]
    #[serde(alias = "FollowAmeow")]
    FollowAmeow,
    #[serde(alias = "UserSelected")]
    UserSelected,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeUpdateSnapshot {
    #[serde(default)]
    pub operation_generation: u64,
    #[serde(default)]
    pub started_at_ms: Option<u64>,
    #[serde(default)]
    pub downloader: Downloader,
    #[serde(default)]
    pub selected: Vec<DownloaderSelection>,
    pub phase: RuntimeUpdatePhase,
    pub policy: RuntimeSelectionPolicy,
    pub requested_version: Option<String>,
    pub active_version: Option<String>,
    pub error: Option<String>,
    #[serde(default)]
    pub failure: Option<RuntimeUpdateFailure>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ComponentOperation {
    pub operation_generation: u64,
    pub started_at_ms: u64,
}
pub(crate) fn next_operation(generation: u64) -> Option<ComponentOperation> {
    Some(ComponentOperation {
        operation_generation: generation.checked_add(1)?,
        started_at_ms: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default().as_millis().min(u64::MAX as u128) as u64,
    })
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UpdateStage {
    #[default]
    Unknown,
    CheckVersion,
    FetchMetadata,
    Download,
    Verify,
    Activate,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UpdateService {
    #[default]
    Unknown,
    PyPi,
    GitHubApi,
    GitHub,
    GitHubReleaseAssets,
    Codeberg,
    PythonHosted,
    Local,
}
impl UpdateService {
    pub(crate) fn from_url(url: &str) -> Self {
        match url::Url::parse(url).ok().and_then(|url| url.host_str().map(str::to_owned)).as_deref() {
            Some("pypi.org") => Self::PyPi,
            Some("api.github.com") => Self::GitHubApi,
            Some("github.com") => Self::GitHub,
            Some("release-assets.githubusercontent.com") => Self::GitHubReleaseAssets,
            Some("codeberg.org") => Self::Codeberg,
            Some("files.pythonhosted.org") => Self::PythonHosted,
            _ => Self::Unknown,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UpdateErrorCategory {
    #[default]
    Unknown,
    Route, Timeout, Connect, Http, InvalidResponse, TooLarge, Network,
    Checksum, Signature, Hash, Size, Storage, Cancelled, Requirements, Probe, Cache,
}

/// Closed fields only: never store request URLs, response bodies or credentials.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeUpdateFailure {
    pub downloader: Downloader,
    #[serde(default)]
    pub component: Option<super::preparation::RuntimeComponent>,
    #[serde(default)]
    pub target_version: Option<String>,
    #[serde(default)]
    pub active_version: Option<String>,
    pub stage: UpdateStage,
    pub service: UpdateService,
    pub category: UpdateErrorCategory,
    pub http_status: Option<u16>,
    pub retry_after_seconds: Option<u64>,
    pub retry_at_unix_seconds: Option<u64>,
}
impl RuntimeUpdateFailure {
    pub(crate) fn sanitize_versions(&mut self) {
        let component = self.component;
        let normalize = |version: Option<&str>| match component {
            Some(super::preparation::RuntimeComponent::YtDlp) => safe_version(Downloader::YtDlp, version),
            Some(super::preparation::RuntimeComponent::GalleryDl) => safe_version(Downloader::GalleryDl, version),
            Some(component) => super::runtime::manifest().ok().and_then(|manifest| manifest.components.into_iter()
                .find(|entry| entry.name.eq_ignore_ascii_case(component.label()) && Some(entry.version.as_str()) == version).map(|entry| entry.version)),
            None => None,
        };
        self.target_version = normalize(self.target_version.as_deref());
        self.active_version = normalize(self.active_version.as_deref());
    }
    fn diagnostic_value(&self) -> serde_json::Value {
        let mut failure = self.clone();
        failure.sanitize_versions();
        serde_json::json!(failure)
    }
    pub(crate) fn code(&self) -> &'static str {
        match self.category {
            UpdateErrorCategory::Route => "E_UPDATE_ROUTE",
            UpdateErrorCategory::Timeout => "E_UPDATE_TIMEOUT",
            UpdateErrorCategory::Connect => "E_UPDATE_CONNECT",
            UpdateErrorCategory::Http => "E_UPDATE_HTTP",
            UpdateErrorCategory::InvalidResponse | UpdateErrorCategory::Checksum => "E_UPDATE_CHECKSUM",
            UpdateErrorCategory::TooLarge | UpdateErrorCategory::Size => "E_UPDATE_SIZE",
            UpdateErrorCategory::Network => "E_UPDATE_NETWORK",
            UpdateErrorCategory::Signature => "E_UPDATE_SIGNATURE",
            UpdateErrorCategory::Hash => "E_UPDATE_HASH",
            UpdateErrorCategory::Storage => "E_UPDATE_STORAGE",
            UpdateErrorCategory::Cancelled => "E_UPDATE_CANCELLED",
            UpdateErrorCategory::Requirements => "E_UPDATE_REQUIRES_AMEOW",
            UpdateErrorCategory::Probe => "E_UPDATE_PROBE",
            UpdateErrorCategory::Cache => "E_UPDATE_CACHE",
            UpdateErrorCategory::Unknown => "E_UPDATE_PREPARATION",
        }
    }
    pub(crate) fn new(downloader: Downloader, stage: UpdateStage, service: UpdateService) -> Self {
        Self { downloader, component: Some(super::preparation::RuntimeComponent::from_name(downloader.label())), stage, service, ..Self::default() }
    }
    pub(crate) fn response(&mut self, response: &reqwest::blocking::Response) {
        self.service = UpdateService::from_url(response.url().as_str());
        self.http_status = Some(response.status().as_u16());
        self.retry_after_seconds = numeric_header(response.headers(), "retry-after");
        self.retry_at_unix_seconds = response.headers().get("retry-after").and_then(|value| value.to_str().ok())
            .and_then(http_date).or_else(|| numeric_header(response.headers(), "x-ratelimit-reset"));
    }
    pub(crate) fn classify(&mut self, code: &str) {
        self.category = match code {
            "E_UPDATE_ROUTE" => UpdateErrorCategory::Route,
            "E_UPDATE_TIMEOUT" => UpdateErrorCategory::Timeout,
            "E_UPDATE_CONNECT" => UpdateErrorCategory::Connect,
            "E_UPDATE_NETWORK" => UpdateErrorCategory::Network,
            "E_UPDATE_HTTP" => UpdateErrorCategory::Http,
            "E_UPDATE_CHECKSUM" => UpdateErrorCategory::Checksum,
            "E_UPDATE_SIGNATURE" => UpdateErrorCategory::Signature,
            "E_UPDATE_HASH" => UpdateErrorCategory::Hash,
            "E_UPDATE_SIZE" => UpdateErrorCategory::Size,
            "E_UPDATE_STORAGE" => UpdateErrorCategory::Storage,
            "E_UPDATE_CACHE" => UpdateErrorCategory::Cache,
            "E_UPDATE_CANCELLED" => UpdateErrorCategory::Cancelled,
            "E_UPDATE_REQUIREMENTS" | "E_UPDATE_REQUIRES_AMEOW" => UpdateErrorCategory::Requirements,
            _ => UpdateErrorCategory::Unknown,
        };
    }
}

fn safe_version(downloader: Downloader, version: Option<&str>) -> Option<String> {
    version.and_then(|version| super::upstream::normalize_version(downloader, version))
}
impl RuntimeUpdateSnapshot {
    pub(crate) fn diagnostic(&self) -> String {
        serde_json::json!({
            "component": self.downloader, "phase": self.phase, "policy": self.policy,
            "operation_generation": self.operation_generation, "started_at_ms": self.started_at_ms,
            "requested": safe_version(self.downloader, self.requested_version.as_deref()),
            "active": safe_version(self.downloader, self.active_version.as_deref()),
            "error": self.error.as_deref().map(|error| candidate_error(error.split(':').next().unwrap_or_default()).split(':').next().unwrap_or_default().to_owned()),
            "failed": self.error.is_some(), "failure": self.failure.as_ref().map(RuntimeUpdateFailure::diagnostic_value),
        }).to_string()
    }
}

pub fn check_diagnostic(downloader: Downloader, snapshot: &super::upstream::UpstreamSnapshot) -> String {
    serde_json::json!({
        "component_check": downloader, "pending": snapshot.pending, "checked_at_ms": snapshot.checked_at_ms,
        "operation_generation": snapshot.operation_generation, "started_at_ms": snapshot.started_at_ms,
        "result_generation": snapshot.result_generation,
        "result": snapshot.result.as_ref().map(|result| match result {
            Ok(version) => serde_json::json!({"version": safe_version(downloader, Some(version))}),
            Err(error) => serde_json::json!({"error": error}),
        }),
        "failure": snapshot.failure.as_ref().map(RuntimeUpdateFailure::diagnostic_value),
    }).to_string()
}

pub fn bounded_diagnostic(mut text: String) -> String {
    text.retain(|c| c.is_ascii());
    text.truncate(text.len().min(4096));
    text
}
fn numeric_header(headers: &reqwest::header::HeaderMap, name: &str) -> Option<u64> {
    let value = headers.get(name)?.to_str().ok()?;
    (!value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit())).then(|| value.parse().ok()).flatten()
}
fn http_date(value: &str) -> Option<u64> {
    use chrono::{DateTime, NaiveDateTime};
    DateTime::parse_from_rfc2822(value).ok().map(|date| date.timestamp())
        .or_else(|| ["%A, %d-%b-%y %H:%M:%S GMT", "%a %b %e %H:%M:%S %Y"].iter()
            .find_map(|format| NaiveDateTime::parse_from_str(value, format).ok().map(|date| date.and_utc().timestamp())))
        .and_then(|seconds| seconds.try_into().ok())
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DownloaderSelection {
    pub downloader: Downloader,
    pub policy: RuntimeSelectionPolicy,
    pub version: Option<String>,
}

pub(crate) fn candidate_error(error: &str) -> String {
    let (code, message) = match error {
        "E_UPDATE_NETWORK" => ("E_UPDATE_NETWORK", "Cannot reach the official release"),
        "E_UPDATE_TIMEOUT" => ("E_UPDATE_TIMEOUT", "Official release request timed out"),
        "E_UPDATE_CONNECT" => ("E_UPDATE_CONNECT", "Cannot connect to the official release"),
        "E_UPDATE_PROBE" => ("E_UPDATE_PROBE", "Candidate version verification failed"),
        "E_UPDATE_HTTP" => ("E_UPDATE_HTTP", "Official release request failed"),
        "E_UPDATE_ROUTE" => ("E_UPDATE_ROUTE", "Cannot route to the official release"),
        "E_UPDATE_CHECKSUM" => ("E_UPDATE_CHECKSUM", "Official checksum is invalid"),
        "E_UPDATE_SIGNATURE" => ("E_UPDATE_SIGNATURE", "Official release signature verification failed"),
        "E_UPDATE_CACHE" => ("E_UPDATE_CACHE", "Selected runtime cache is missing or damaged"),
        "E_UPDATE_HASH" => ("E_UPDATE_HASH", "Candidate hash verification failed"),
        "E_UPDATE_SIZE" => ("E_UPDATE_SIZE", "Candidate size is invalid"),
        "E_UPDATE_STORAGE" => ("E_UPDATE_STORAGE", "Cannot store the candidate"),
        "E_UPDATE_CANCELLED" => ("E_UPDATE_CANCELLED", "Candidate preparation was cancelled"),
        "E_UPDATE_REQUIREMENTS" | "E_UPDATE_REQUIRES_AMEOW" => ("E_UPDATE_REQUIRES_AMEOW", "Update Ameow to use this downloader version"),
        "E_UPDATE_STALE" => ("E_UPDATE_STALE", "The upstream release changed; check updates again"),
        _ => ("E_UPDATE_PREPARATION", "Candidate preparation failed"),
    };
    format!("{code}: {message}; the previous selection is retained")
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct Selection {
    pub policy: RuntimeSelectionPolicy,
    pub version: Option<String>,
    #[serde(default)]
    pub previous: Option<Box<Selection>>,
    #[serde(default)]
    pub gallery_version: Option<String>,
    #[serde(default)]
    pub downloader: Downloader,
}

impl Default for Selection {
    fn default() -> Self {
        Self { policy: RuntimeSelectionPolicy::FollowAmeow, version: None, previous: None, gallery_version: None, downloader: Downloader::YtDlp }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_diagnostics_read_old_snapshots_and_exclude_untrusted_strings() {
        let old = r#"{"phase":"Failed","policy":"follow_ameow","requested_version":null,"active_version":null,"error":"old"}"#;
        let mut snapshot: RuntimeUpdateSnapshot = serde_json::from_str(old).unwrap();
        assert!(snapshot.failure.is_none());
        snapshot.requested_version = Some("https://private.invalid/?token=secret".into());
        snapshot.error = Some("Cookie: private-secret".into());
        let text = snapshot.diagnostic();
        assert!(!text.contains("secret"));
        assert!(text.contains("\"requested\":null"));
        let bounded = bounded_diagnostic(format!("{text}{}", "x".repeat(5000)));
        assert_eq!(bounded.len(), 4096);
        assert!(bounded.is_ascii());
    }

    #[test]
    fn retry_headers_keep_only_numeric_hints() {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("retry-after", "30".parse().unwrap());
        assert_eq!(numeric_header(&headers, "retry-after"), Some(30));
        for unsafe_value in ["token=secret", "-1", "18446744073709551616"] {
            headers.insert("retry-after", unsafe_value.parse().unwrap());
            assert_eq!(numeric_header(&headers, "retry-after"), None);
        }
        assert_eq!(UpdateService::from_url("https://codeberg.org/private?token=secret"), UpdateService::Codeberg);
        assert_eq!(UpdateService::from_url("https://github.com.evil/private"), UpdateService::Unknown);
        for value in ["Sun, 06 Nov 1994 08:49:37 GMT", "Sunday, 06-Nov-94 08:49:37 GMT", "Sun Nov  6 08:49:37 1994"] {
            assert_eq!(http_date(value), Some(784111777));
        }
        assert_eq!(http_date("Sun, 99 Nov 1994 08:49:37 GMT"), None);
        assert_eq!(http_date("token=secret"), None);
    }

    #[test]
    fn selection_is_atomic_and_rejects_invalid_intent() {
        let root = tempfile::tempdir().unwrap();
        assert_eq!(Selection::load(root.path()).unwrap(), Selection::default());
        let selected = Selection { policy: RuntimeSelectionPolicy::UserSelected, version: Some("2026.10.01".into()), previous: Some(Box::new(Selection::default())), ..Default::default() };
        selected.persist(root.path()).unwrap();
        assert_eq!(Selection::load(root.path()).unwrap(), selected);
        fs::write(root.path().join("runtime-selection.json"), b"{broken").unwrap();
        assert!(Selection::load(root.path()).is_err());
    }

    #[test]
    fn uncommitted_transaction_and_candidate_do_not_change_selection() {
        let root = tempfile::tempdir().unwrap();
        let old = Selection { policy: RuntimeSelectionPolicy::UserSelected, version: Some("2025.01.01".into()), previous: None, ..Default::default() };
        old.persist(root.path()).unwrap();
        let uncommitted = tempfile::NamedTempFile::new_in(root.path()).unwrap();
        fs::write(uncommitted.path(), br#"{"policy":"FollowAmeow","version":null}"#).unwrap();
        fs::create_dir(root.path().join("runtime-uncommitted-candidate")).unwrap();
        assert_eq!(Selection::load(root.path()).unwrap(), old);
        assert!(root.path().join("runtime-uncommitted-candidate").is_dir());
    }

    #[test]
    fn candidate_errors_keep_safe_attribution_without_leaking_input() {
        assert!(candidate_error("E_UPDATE_HTTP").starts_with("E_UPDATE_HTTP:"));
        let unknown = candidate_error("https://private.invalid/?token=secret");
        assert!(unknown.starts_with("E_UPDATE_PREPARATION:"));
        assert!(!unknown.contains("secret"));
    }

    #[test]
    fn policy_uses_snake_case_and_accepts_legacy_records() {
        for (policy, current, legacy) in [
            (RuntimeSelectionPolicy::FollowAmeow, "follow_ameow", "FollowAmeow"),
            (RuntimeSelectionPolicy::UserSelected, "user_selected", "UserSelected"),
        ] {
            assert_eq!(serde_json::to_value(policy).unwrap(), current);
            assert_eq!(serde_json::from_value::<RuntimeSelectionPolicy>(current.into()).unwrap(), policy);
            assert_eq!(serde_json::from_value::<RuntimeSelectionPolicy>(legacy.into()).unwrap(), policy);
        }
    }
    #[test]
    fn downloader_choices_restore_independently_and_survive_restart() {
        let root = tempfile::tempdir().unwrap();
        let mut selection = Selection::default();
        selection.select(Downloader::YtDlp, Some("2026.10.26".into()));
        selection.select(Downloader::GalleryDl, Some("1.32.21".into()));
        selection.persist(root.path()).unwrap();
        let mut recovered = Selection::load(root.path()).unwrap();
        assert_eq!(recovered.version_for(Downloader::YtDlp), Some("2026.10.26"));
        assert_eq!(recovered.version_for(Downloader::GalleryDl), Some("1.32.21"));
        recovered.select(Downloader::GalleryDl, None);
        assert_eq!(recovered.version_for(Downloader::YtDlp), Some("2026.10.26"));
        recovered.select(Downloader::GalleryDl, Some("1.32.21".into()));
        recovered.select(Downloader::YtDlp, None);
        assert_eq!(recovered.version_for(Downloader::GalleryDl), Some("1.32.21"));
        assert_eq!(recovered.policy, RuntimeSelectionPolicy::FollowAmeow);
    }
    #[test]
    fn invalid_gallery_choice_is_not_a_selected_runtime() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("runtime-selection.json"), br#"{"policy":"follow_ameow","version":null,"gallery_version":"1.32.21rc1"}"#).unwrap();
        assert!(Selection::load(root.path()).is_err());
        assert_eq!(normalize_gallery_version("1.32.21").as_deref(), Some("1.32.21"));
        assert_eq!(normalize_gallery_version("v1.32.21"), None);
    }
}

impl Selection {
    pub(crate) fn version_for(&self, downloader: Downloader) -> Option<&str> {
        match downloader { Downloader::YtDlp => self.version.as_deref(), Downloader::GalleryDl => self.gallery_version.as_deref() }
    }
    pub(crate) fn select(&mut self, downloader: Downloader, version: Option<String>) {
        self.downloader = downloader;
        match downloader {
            Downloader::YtDlp => {
                self.policy = if version.is_some() { RuntimeSelectionPolicy::UserSelected } else { RuntimeSelectionPolicy::FollowAmeow };
                self.version = version;
            }
            Downloader::GalleryDl => self.gallery_version = version,
        }
        self.previous = None;
    }
    pub(crate) fn selected(&self) -> Vec<DownloaderSelection> {
        [Downloader::YtDlp, Downloader::GalleryDl].into_iter().map(|downloader| DownloaderSelection {
            downloader, version: self.version_for(downloader).map(str::to_owned),
            policy: if self.version_for(downloader).is_some() { RuntimeSelectionPolicy::UserSelected } else { RuntimeSelectionPolicy::FollowAmeow },
        }).collect()
    }
    pub(crate) fn load(root: &Path) -> Result<Self, String> {
        super::runtime::check_data_location(root)?;
        let path = root.join("runtime-selection.json");
        let file = match fs::File::open(path) {
            Ok(file) => file,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Self::default()),
            Err(_) => return Err("Cannot read runtime selection".into()),
        };
        let selection: Self = serde_json::from_reader(file.take(4097))
            .map_err(|_| "Invalid runtime selection")?;
        if selection.gallery_version.as_deref().is_some_and(|version| normalize_gallery_version(version).as_deref() != Some(version)) {
            return Err("Invalid gallery runtime selection".into());
        }
        match (&selection.policy, &selection.version) {
            (RuntimeSelectionPolicy::FollowAmeow, None) => Ok(selection),
            (RuntimeSelectionPolicy::UserSelected, Some(version))
                if super::upstream::normalize_stable_version(version).as_deref() == Some(version) => Ok(selection),
            _ => Err("Invalid runtime selection".into()),
        }
    }

    pub(crate) fn persist(&self, root: &Path) -> Result<(), String> {
        super::runtime::check_data_location(root)?;
        super::runtime::safe_dir(root).map_err(|_| "Cannot create runtime selection directory")?;
        let mut file = tempfile::NamedTempFile::new_in(root)
            .map_err(|_| "Cannot create runtime selection transaction")?;
        let bytes = serde_json::to_vec(self).map_err(|_| "Cannot encode runtime selection")?;
        file.write_all(&bytes).and_then(|_| file.as_file().sync_all())
            .map_err(|_| "Cannot write runtime selection")?;
        file.persist(root.join("runtime-selection.json"))
            .map_err(|_| "Cannot commit runtime selection")?;
        Ok(())
    }
}

pub fn normalize_gallery_version(version: &str) -> Option<String> {
    super::upstream::normalize_version(Downloader::GalleryDl, version)
}
