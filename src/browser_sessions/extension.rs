//! Optional extension updates use reported loaded code, never a connection or a disk replacement as proof of reload.
use super::{Result, protection, storage};
use crate::download::runtime;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::{
    collections::BTreeMap,
    fs::OpenOptions,
    io::{Read, Write},
    path::Path,
};

const MAX_JSON: u64 = 32 * 1024;
const MAX_SOURCES: usize = 16;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Identity {
    pub version: String,
    pub extension_id: String,
    pub source_sha256: String,
    #[serde(default)]
    pub capabilities: Vec<String>,
}
impl Identity {
    fn validate(&self) -> Result<()> {
        let parts: Vec<_> = self.version.split('.').collect();
        if !(1..=4).contains(&parts.len())
            || self.version.len() > 32
            || parts.iter().any(|v| {
                v.is_empty()
                    || v.len() > 5
                    || !v.bytes().all(|b| b.is_ascii_digit())
                    || v.parse::<u16>().is_err()
            })
            || self.extension_id != super::native::EXTENSION_ID
            || self.source_sha256.len() != 64
            || !self.source_sha256.bytes().all(|b| b.is_ascii_hexdigit())
            || self.capabilities.len() > 16
            || self.capabilities.iter().any(|v| {
                v.is_empty()
                    || v.len() > 48
                    || !v
                        .bytes()
                        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
            })
        {
            return Err("E_SESSION_INVALID".into());
        }
        Ok(())
    }
    fn key(&self) -> String {
        format!(
            "{}:{}",
            self.version,
            self.source_sha256.to_ascii_lowercase()
        )
    }
    fn matches(&self, available: &Self) -> bool {
        self.extension_id == available.extension_id
            && self.key() == available.key()
            && available
                .capabilities
                .iter()
                .all(|v| self.capabilities.contains(v))
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Snapshot {
    pub available: Option<Identity>,
    /// Historical evidence only; absence or presence does not describe a live connection.
    pub loaded: Option<Identity>,
    pub pending: bool,
    pub unread: bool,
    pub needs_reload: bool,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct State {
    reports: BTreeMap<String, Observation>,
    last_source: Option<String>,
    seen: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Observation {
    loaded: Identity,
    pending_target: Option<String>,
}

fn read_json<T: DeserializeOwned>(path: &Path) -> Result<Option<T>> {
    runtime::check_data_location(path).map_err(|_| storage())?;
    let file = match runtime::open_identity_file(path) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(storage()),
    };
    if !file.metadata().map_err(|_| storage())?.is_file() {
        return Err(storage());
    }
    let mut bytes = Vec::new();
    file.take(MAX_JSON + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| storage())?;
    if bytes.len() as u64 > MAX_JSON {
        return Err(storage());
    }
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| storage())
}

/// Read B's actual active mirror, not a downloaded Prepare/Ready candidate.
pub fn available_identity(extension_directory: &Path) -> Result<Option<Identity>> {
    #[derive(Deserialize)]
    struct Manifest {
        version: String,
        manifest_version: u32,
        background: Background,
    }
    #[derive(Deserialize)]
    struct Background {
        service_worker: String,
    }
    let Some(identity): Option<Identity> = read_json(&extension_directory.join("build.json"))?
    else {
        return Ok(None);
    };
    identity.validate()?;
    let Some(manifest): Option<Manifest> = read_json(&extension_directory.join("manifest.json"))?
    else {
        return Ok(None);
    };
    if manifest.version != identity.version
        || manifest.manifest_version != 3
        || manifest.background.service_worker != "background.js"
    {
        return Err("E_SESSION_INVALID".into());
    }
    let worker = runtime::open_identity_file(&extension_directory.join("background.js"))
        .map_err(|_| storage())?;
    let metadata = worker.metadata().map_err(|_| storage())?;
    if !metadata.is_file() || metadata.len() == 0 {
        return Err(storage());
    }
    Ok(Some(identity))
}

fn load(data_root: &Path) -> Result<State> {
    let state =
        read_json::<State>(&data_root.join("extension-update/state.json"))?.unwrap_or_default();
    if state.reports.len() > MAX_SOURCES || state.seen.as_ref().is_some_and(|v| v.len() > 32) {
        return Err(storage());
    }
    for (source, report) in &state.reports {
        if !super::valid_id(source) || report.pending_target.as_ref().is_some_and(|v| v.len() > 98)
        {
            return Err(storage());
        }
        report.loaded.validate()?;
    }
    if state
        .last_source
        .as_ref()
        .is_some_and(|v| !state.reports.contains_key(v))
    {
        return Err(storage());
    }
    Ok(state)
}

fn write(data_root: &Path, action: impl FnOnce(&mut State) -> Result<()>) -> Result<()> {
    let directory = data_root.join("extension-update");
    protection::directory(&directory)?;
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(directory.join("state.lock"))
        .map_err(|_| storage())?;
    lock.try_lock().map_err(|_| storage())?;
    let mut state = load(data_root)?;
    action(&mut state)?;
    let bytes = serde_json::to_vec(&state).map_err(|_| storage())?;
    if bytes.len() as u64 > MAX_JSON {
        return Err(storage());
    }
    let mut temp = tempfile::NamedTempFile::new_in(&directory).map_err(|_| storage())?;
    temp.write_all(&bytes)
        .and_then(|_| temp.as_file().sync_all())
        .map_err(|_| storage())?;
    temp.persist(directory.join("state.json"))
        .map_err(|_| storage())?;
    Ok(())
}

pub fn snapshot(data_root: &Path, extension_directory: &Path) -> Result<Snapshot> {
    let available = available_identity(extension_directory)?;
    let state = load(data_root)?;
    let loaded = state
        .last_source
        .as_ref()
        .and_then(|source| state.reports.get(source))
        .map(|r| r.loaded.clone());
    let pending = available.as_ref().is_some_and(|available| state.reports.values()
        .any(|report| report.pending_target.is_some() && !report.loaded.matches(available)));
    let unread = pending && state.seen.as_ref() != available.as_ref().map(|a| &a.version);
    Ok(Snapshot {
        available,
        loaded,
        pending,
        unread,
        needs_reload: pending,
    })
}

/// Only an actual browser report creates or settles a pending reload for that source.
pub fn report_loaded(
    data_root: &Path,
    extension_directory: &Path,
    source_id: &str,
    identity: Identity,
) -> Result<()> {
    if !super::valid_id(source_id) {
        return Err("E_SESSION_INVALID".into());
    }
    identity.validate()?;
    let available = available_identity(extension_directory)?;
    write(data_root, |state| {
        if !state.reports.contains_key(source_id) && state.reports.len() >= MAX_SOURCES {
            return Err("E_SESSION_LIMIT".into());
        }
        let pending_target = available
            .as_ref()
            .filter(|a| !identity.matches(a))
            .map(Identity::key);
        state.reports.insert(
            source_id.to_owned(),
            Observation {
                loaded: identity,
                pending_target,
            },
        );
        state.last_source = Some(source_id.to_owned());
        Ok(())
    })
}

/// Remember the seen version independently of the exact loaded build; viewing never confirms a reload.
pub fn mark_seen(data_root: &Path, extension_directory: &Path) -> Result<()> {
    let Some(available) = available_identity(extension_directory)? else {
        return Ok(());
    };
    write(data_root, |state| {
        if state
            .reports
            .values()
            .any(|r| r.pending_target.is_some() && !r.loaded.matches(&available))
        {
            state.seen = Some(available.version);
        }
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    fn identity(hash: char) -> Identity {
        Identity {
            version: "0.5.2".into(),
            extension_id: super::super::native::EXTENSION_ID.into(),
            source_sha256: hash.to_string().repeat(64),
            capabilities: vec!["session_sync_v1".into()],
        }
    }
    fn install(directory: &Path, identity: &Identity) {
        fs::create_dir_all(directory).unwrap();
        fs::write(
            directory.join("build.json"),
            serde_json::to_vec(identity).unwrap(),
        )
        .unwrap();
        fs::write(directory.join("manifest.json"), format!(r#"{{"version":"{}","manifest_version":3,"background":{{"service_worker":"background.js"}}}}"#, identity.version)).unwrap();
        fs::write(
            directory.join("background.js"),
            b"// synthetic compiled worker fixture",
        )
        .unwrap();
    }
    #[test]
    fn disk_replacement_and_viewing_do_not_confirm_or_create_a_reload() {
        let root = tempfile::tempdir().unwrap();
        let files = root.path().join("extension");
        let current = identity('a');
        install(&files, &current);
        assert!(!snapshot(root.path(), &files).unwrap().pending);
        report_loaded(root.path(), &files, &"1".repeat(32), current.clone()).unwrap();
        let next = identity('b');
        install(&files, &next);
        assert!(
            !snapshot(root.path(), &files).unwrap().pending,
            "disk is not running-browser evidence"
        );
        report_loaded(root.path(), &files, &"1".repeat(32), current.clone()).unwrap();
        assert!(snapshot(root.path(), &files).unwrap().unread);
        mark_seen(root.path(), &files).unwrap();
        let viewed = snapshot(root.path(), &files).unwrap();
        assert!(viewed.pending && viewed.needs_reload && !viewed.unread);
        report_loaded(root.path(), &files, &"1".repeat(32), current).unwrap();
        assert!(
            !snapshot(root.path(), &files).unwrap().unread,
            "same build cannot become unread again"
        );
        report_loaded(root.path(), &files, &"1".repeat(32), next).unwrap();
        assert!(!snapshot(root.path(), &files).unwrap().pending);
        let same_version = identity('c');
        install(&files, &same_version);
        report_loaded(root.path(), &files, &"1".repeat(32), identity('b')).unwrap();
        let same = snapshot(root.path(), &files).unwrap();
        assert!(
            same.pending && !same.unread,
            "another build of the same viewed version is not new unread information"
        );
        let mut newer = identity('d');
        newer.version = "0.5.3".into();
        install(&files, &newer);
        report_loaded(root.path(), &files, &"1".repeat(32), same_version).unwrap();
        assert!(snapshot(root.path(), &files).unwrap().unread);
    }
    #[test]
    fn another_disk_switch_keeps_an_existing_pending_reload() {
        let root = tempfile::tempdir().unwrap();
        let files = root.path().join("extension");
        install(&files, &identity('b'));
        report_loaded(root.path(), &files, &"1".repeat(32), identity('a')).unwrap();
        let mut next = identity('c'); next.version = "0.5.3".into();
        install(&files, &next);
        assert!(snapshot(root.path(), &files).unwrap().pending);
        mark_seen(root.path(), &files).unwrap();
        assert!(!snapshot(root.path(), &files).unwrap().unread);
        report_loaded(root.path(), &files, &"1".repeat(32), next).unwrap();
        assert!(!snapshot(root.path(), &files).unwrap().pending);
    }
    #[test]
    fn each_known_source_must_report_its_loaded_build_without_connection_status() {
        let root = tempfile::tempdir().unwrap();
        let files = root.path().join("extension");
        let current = identity('b');
        install(&files, &current);
        for source in ['1', '2'] {
            report_loaded(
                root.path(),
                &files,
                &source.to_string().repeat(32),
                identity('a'),
            )
            .unwrap();
        }
        report_loaded(root.path(), &files, &"1".repeat(32), current.clone()).unwrap();
        assert!(snapshot(root.path(), &files).unwrap().pending);
        report_loaded(root.path(), &files, &"2".repeat(32), current).unwrap();
        assert!(!snapshot(root.path(), &files).unwrap().pending);
    }
    #[test]
    fn unknown_or_invalid_identity_is_not_an_update_alert() {
        let root = tempfile::tempdir().unwrap();
        let files = root.path().join("extension");
        assert!(!snapshot(root.path(), &files).unwrap().pending);
        let mut bad = identity('a');
        bad.source_sha256 = "private invalid value".into();
        assert!(report_loaded(root.path(), &files, &"1".repeat(32), bad).is_err());
        assert!(!root.path().join("extension-update").exists());
    }
}
