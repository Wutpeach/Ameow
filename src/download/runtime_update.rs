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
    pub downloader: Downloader,
    #[serde(default)]
    pub selected: Vec<DownloaderSelection>,
    pub phase: RuntimeUpdatePhase,
    pub policy: RuntimeSelectionPolicy,
    pub requested_version: Option<String>,
    pub active_version: Option<String>,
    pub error: Option<String>,
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
