use serde::{Deserialize, Serialize};
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
    pub phase: RuntimeUpdatePhase,
    pub policy: RuntimeSelectionPolicy,
    pub requested_version: Option<String>,
    pub active_version: Option<String>,
    pub error: Option<String>,
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
}

impl Default for Selection {
    fn default() -> Self {
        Self { policy: RuntimeSelectionPolicy::FollowAmeow, version: None, previous: None }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selection_is_atomic_and_rejects_invalid_intent() {
        let root = tempfile::tempdir().unwrap();
        assert_eq!(Selection::load(root.path()).unwrap(), Selection::default());
        let selected = Selection { policy: RuntimeSelectionPolicy::UserSelected, version: Some("2026.10.01".into()), previous: Some(Box::new(Selection::default())) };
        selected.persist(root.path()).unwrap();
        assert_eq!(Selection::load(root.path()).unwrap(), selected);
        fs::write(root.path().join("runtime-selection.json"), b"{broken").unwrap();
        assert!(Selection::load(root.path()).is_err());
    }

    #[test]
    fn uncommitted_transaction_and_candidate_do_not_change_selection() {
        let root = tempfile::tempdir().unwrap();
        let old = Selection { policy: RuntimeSelectionPolicy::UserSelected, version: Some("2025.01.01".into()), previous: None };
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
}

impl Selection {
    pub(crate) fn load(root: &Path) -> Result<Self, String> {
        let path = root.join("runtime-selection.json");
        let file = match fs::File::open(path) {
            Ok(file) => file,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Self::default()),
            Err(_) => return Err("Cannot read runtime selection".into()),
        };
        let selection: Self = serde_json::from_reader(file.take(4097))
            .map_err(|_| "Invalid runtime selection")?;
        match (&selection.policy, &selection.version) {
            (RuntimeSelectionPolicy::FollowAmeow, None) => Ok(selection),
            (RuntimeSelectionPolicy::UserSelected, Some(version))
                if super::upstream::normalize_stable_version(version).as_deref() == Some(version) => Ok(selection),
            _ => Err("Invalid runtime selection".into()),
        }
    }

    pub(crate) fn persist(&self, root: &Path) -> Result<(), String> {
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
