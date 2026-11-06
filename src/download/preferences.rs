//! Bounded local hostname hints, learned only after verified delivery.
use super::{contract::Downloader, request::{Accepted, Object, validate_public_url}};
use serde::{Deserialize, Serialize};
use std::{collections::{BTreeMap, BTreeSet}, fs, io::{Read, Write}, os::windows::{ffi::OsStrExt, fs::MetadataExt}, path::{Path, PathBuf}};

const MAX_HOSTS: usize = 128;
const MAX_BYTES: u64 = 65_536;
const MAX_QUARANTINE_BYTES: u64 = 1_048_576;
const READ_ERROR: &str = "E_PREFERENCES_READ: Local downloader cache is unavailable; writes deferred";
const PRESERVE_ERROR: &str = "E_PREFERENCES_PRESERVE: Invalid local downloader cache was retained; writes deferred";

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
pub struct Preferences {
    // Array order is insertion order; updating an existing host does not move it.
    hosts: Vec<Entry>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct Entry { host: String, engine: Downloader }
#[derive(Deserialize)]
#[serde(untagged)]
enum Records { Ordered(Vec<Entry>), Legacy(BTreeMap<String, Downloader>) }
impl Default for Records { fn default() -> Self { Self::Ordered(Vec::new()) } }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Stored {
    #[serde(default, rename = "enabled")]
    _legacy_enabled: bool,
    #[serde(default)]
    hosts: Records,
}
enum ReadError { Io, Invalid }
pub fn path(settings: &Path) -> PathBuf { settings.with_extension("downloaders.json") }
fn quarantine_path(path: &Path) -> PathBuf { path.with_extension("invalid") }
fn host(accepted: &Accepted) -> Option<String> {
    let Object::Generic { url } = &accepted.object else { return None; };
    let parsed = validate_public_url(url).ok()?;
    match parsed.host()? {
        url::Host::Domain(name) if name.trim_end_matches('.').len() <= 253 => Some(name.trim_end_matches('.').to_ascii_lowercase()),
        _ => None,
    }
}
fn valid_host(host: &str) -> bool {
    let Ok(parsed) = validate_public_url(&format!("https://{host}/")) else { return false; };
    host.len() <= 253 && !host.ends_with('.') && matches!(parsed.host(), Some(url::Host::Domain(_)))
        && parsed.host_str() == Some(host) && parsed.path() == "/" && parsed.query().is_none() && parsed.fragment().is_none()
}
impl Preferences {
    pub fn preferred(&self, accepted: &Accepted) -> Downloader {
        host(accepted).and_then(|h| self.hosts.iter().find(|entry| entry.host == h).map(|entry| entry.engine)).unwrap_or_default()
    }
    pub fn remember(&mut self, accepted: &Accepted, engine: Downloader) -> bool {
        let Some(host) = host(accepted) else { return false; };
        if let Some(entry) = self.hosts.iter_mut().find(|entry| entry.host == host) {
            if entry.engine == engine { return false; }
            entry.engine = engine;
        } else {
            if self.hosts.len() == MAX_HOSTS { self.hosts.remove(0); }
            self.hosts.push(Entry { host, engine });
        }
        true
    }
    fn read(path: &Path) -> Result<Self, ReadError> {
        let metadata = match fs::symlink_metadata(path) {
            Ok(metadata) => metadata,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Self::default()),
            Err(_) => return Err(ReadError::Io),
        };
        if !metadata.is_file() || metadata.file_attributes() & 0x400 != 0 { return Err(ReadError::Io); }
        let file = fs::File::open(path).map_err(|_| ReadError::Io)?;
        let mut bytes = Vec::new();
        file.take(MAX_BYTES + 1).read_to_end(&mut bytes).map_err(|_| ReadError::Io)?;
        if bytes.len() as u64 > MAX_BYTES { return Err(ReadError::Invalid); }
        let stored: Stored = serde_json::from_slice(&bytes).map_err(|_| ReadError::Invalid)?;
        let hosts = match stored.hosts {
            Records::Ordered(hosts) => hosts,
            // Old maps have no age information; seed a stable order once.
            Records::Legacy(hosts) => hosts.into_iter().map(|(host, engine)| Entry { host, engine }).collect(),
        };
        let mut unique = BTreeSet::new();
        if hosts.len() > MAX_HOSTS || hosts.iter().any(|e| !valid_host(&e.host) || !unique.insert(&e.host)) { return Err(ReadError::Invalid); }
        Ok(Self { hosts })
    }
    #[cfg(test)]
    pub fn load(path: &Path) -> Result<Self, String> { Self::read(path).map_err(|_| READ_ERROR.into()) }
    pub fn restore(path: &Path) -> (Self, Option<String>, bool) {
        match Self::read(path) {
            Ok(cache) => (cache, None, false),
            Err(ReadError::Io) => (Self::default(), Some(READ_ERROR.into()), true),
            Err(ReadError::Invalid) => {
                // One same-directory slot, <=1 MiB, no overwrite or deletion of evidence.
                let preserve = || -> Result<(), ()> {
                    let metadata = fs::symlink_metadata(path).map_err(|_| ())?;
                    if !metadata.is_file() || metadata.file_attributes() & 0x400 != 0 || metadata.len() > MAX_QUARANTINE_BYTES { return Err(()); }
                    let from: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
                    let to: Vec<u16> = quarantine_path(path).as_os_str().encode_wide().chain(Some(0)).collect();
                    // Flags=0: same-volume atomic rename, never replace an existing slot.
                    if unsafe { windows_sys::Win32::Storage::FileSystem::MoveFileExW(from.as_ptr(), to.as_ptr(), 0) } == 0 { return Err(()); }
                    Ok(())
                };
                if preserve().is_ok() {
                    (Self::default(), Some("E_PREFERENCES_RECOVERED: Invalid local downloader cache was quarantined".into()), false)
                } else { (Self::default(), Some(PRESERVE_ERROR.into()), true) }
            }
        }
    }
    pub fn persist(&self, path: &Path) -> Result<(), String> {
        let save = || -> Result<(), Box<dyn std::error::Error>> {
            let parent = path.parent().ok_or("Missing cache directory")?;
            fs::create_dir_all(parent)?;
            let mut staged = tempfile::NamedTempFile::new_in(parent)?;
            staged.write_all(&serde_json::to_vec_pretty(self)?)?;
            staged.as_file().sync_all()?;
            staged.persist(path)?;
            Ok(())
        };
        save().map_err(|_| "E_PREFERENCES_SAVE: Local downloader cache was not saved".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::download::request::{DownloadIntent, Quality};
    use std::os::windows::fs::OpenOptionsExt;

    fn accepted(url: &str) -> Accepted {
        Accepted::new(DownloadIntent { url: url.into(), quality: Quality::Balanced, output_dir: std::env::temp_dir() }).unwrap()
    }

    #[test]
    fn missing_legacy_migration_and_host_scope() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("preferences.json");
        let (empty, diagnostic, blocked) = Preferences::restore(&path);
        assert_eq!(empty, Preferences::default());
        assert!(diagnostic.is_none() && !blocked);
        let work = accepted("https://example.com/private?token=secret");
        fs::write(&path, br#"{"enabled":false,"hosts":{"example.com":"gallery_dl"}}"#).unwrap();
        let (mut cache, diagnostic, blocked) = Preferences::restore(&path);
        assert!(diagnostic.is_none() && !blocked);
        assert_eq!(cache.preferred(&work), Downloader::GalleryDl);
        assert_eq!(cache.preferred(&accepted("https://other.example/work")), Downloader::YtDlp);
        assert_eq!(cache.preferred(&accepted("https://youtu.be/jNQXAC9IVRw")), Downloader::YtDlp);
        assert!(!cache.remember(&accepted("https://youtu.be/jNQXAC9IVRw"), Downloader::GalleryDl));
        assert!(cache.remember(&accepted("https://other.example/work"), Downloader::GalleryDl));
        cache.persist(&path).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(!text.contains("enabled") && !text.contains("private") && !text.contains("token") && !text.contains("secret"));
        assert_eq!(Preferences::load(&path).unwrap(), cache);
    }

    #[test]
    fn fifo_updates_stay_in_place_and_survive_restart() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("preferences.json");
        let make = |i| accepted(&format!("https://h{i:03}.example/work"));
        let mut cache = Preferences::default();
        for i in 0..128 { assert!(cache.remember(&make(i), Downloader::GalleryDl)); }
        assert!(cache.remember(&make(0), Downloader::YtDlp));
        assert_eq!(cache.hosts[0].host, "h000.example");
        assert!(cache.remember(&make(128), Downloader::GalleryDl));
        assert_eq!(cache.hosts.len(), 128);
        assert_eq!(cache.hosts[0].host, "h001.example");
        cache.persist(&path).unwrap();
        let mut restored = Preferences::load(&path).unwrap();
        assert!(restored.remember(&make(129), Downloader::GalleryDl));
        assert_eq!(restored.hosts[0].host, "h002.example");
        assert_eq!(restored.hosts.last().unwrap().host, "h129.example");
    }

    #[test]
    fn legacy_map_order_is_stable_before_and_after_restart() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("preferences.json");
        let mut map = BTreeMap::new();
        for i in (0..128).rev() { map.insert(format!("h{i:03}.example"), "gallery_dl"); }
        fs::write(&path, serde_json::to_vec(&serde_json::json!({"hosts":map})).unwrap()).unwrap();
        let mut first = Preferences::load(&path).unwrap();
        assert_eq!(first.hosts[0].host, "h000.example");
        assert_eq!(first, Preferences::load(&path).unwrap());
        first.remember(&accepted("https://new.example/work"), Downloader::GalleryDl);
        assert_eq!(first.hosts[0].host, "h001.example");
        first.persist(&path).unwrap();
        let mut restarted = Preferences::load(&path).unwrap();
        restarted.remember(&accepted("https://next.example/work"), Downloader::GalleryDl);
        assert_eq!(restarted.hosts[0].host, "h002.example");
    }

    #[test]
    fn invalid_cache_is_preserved_before_rebuilding() {
        let many = (0..129).map(|i| serde_json::json!({"host":format!("h{i}.example"),"engine":"gallery_dl"})).collect::<Vec<_>>();
        let cases = vec![
            b"{broken".to_vec(),
            br#"{"future":true}"#.to_vec(),
            br#"{"hosts":null}"#.to_vec(),
            br#"{"hosts":[{"host":"bad host","engine":"yt_dlp"}]}"#.to_vec(),
            br#"{"hosts":[{"host":"example.com","engine":"yt_dlp"},{"host":"example.com","engine":"gallery_dl"}]}"#.to_vec(),
            serde_json::to_vec(&serde_json::json!({"hosts":many})).unwrap(),
            vec![b'x'; 65_537],
        ];
        for original in cases {
            let root = tempfile::tempdir().unwrap();
            let path = root.path().join("preferences.json");
            fs::write(&path, &original).unwrap();
            let (mut cache, diagnostic, blocked) = Preferences::restore(&path);
            assert!(!blocked && diagnostic.unwrap().starts_with("E_PREFERENCES_RECOVERED"));
            assert_eq!(fs::read(quarantine_path(&path)).unwrap(), original);
            assert!(!path.exists());
            cache.remember(&accepted("https://example.com/work"), Downloader::GalleryDl);
            cache.persist(&path).unwrap();
            assert_eq!(Preferences::load(&path).unwrap(), cache);
            assert_eq!(fs::read(quarantine_path(&path)).unwrap(), original);
        }
    }

    #[test]
    fn preservation_and_atomic_write_failures_keep_existing_bytes() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("preferences.json");
        let original = b"invalid json";
        fs::write(&path, original).unwrap();
        let quarantine = quarantine_path(&path);
        fs::write(&quarantine, b"previous evidence").unwrap();
        let (_, diagnostic, blocked) = Preferences::restore(&path);
        assert!(blocked && diagnostic.unwrap().starts_with("E_PREFERENCES_PRESERVE"));
        assert_eq!(fs::read(&path).unwrap(), original);
        assert_eq!(fs::read(&quarantine).unwrap(), b"previous evidence");
        fs::remove_file(&quarantine).unwrap();
        let lock = fs::OpenOptions::new().read(true).share_mode(1).open(&path).unwrap();
        let (_, diagnostic, blocked) = Preferences::restore(&path);
        assert!(blocked && diagnostic.unwrap().starts_with("E_PREFERENCES_PRESERVE"));
        assert!(!quarantine.exists());
        assert!(Preferences::default().persist(&path).is_err());
        drop(lock);
        assert_eq!(fs::read(&path).unwrap(), original);
        fs::write(&path, vec![b'x'; 1_048_577]).unwrap();
        let (_, diagnostic, blocked) = Preferences::restore(&path);
        assert!(blocked && diagnostic.unwrap().starts_with("E_PREFERENCES_PRESERVE"));
        assert_eq!(fs::metadata(&path).unwrap().len(), 1_048_577);
        assert!(!quarantine.exists());
    }

    #[test]
    fn read_io_failure_does_not_quarantine_valid_cache() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("preferences.json");
        let mut cache = Preferences::default();
        cache.remember(&accepted("https://example.com/work"), Downloader::GalleryDl);
        cache.persist(&path).unwrap();
        let original = fs::read(&path).unwrap();
        let lock = fs::OpenOptions::new().read(true).share_mode(0).open(&path).unwrap();
        let (_, diagnostic, blocked) = Preferences::restore(&path);
        assert!(blocked && diagnostic.unwrap().starts_with("E_PREFERENCES_READ"));
        assert!(!quarantine_path(&path).exists());
        drop(lock);
        assert_eq!(fs::read(&path).unwrap(), original);
        assert_eq!(Preferences::load(&path).unwrap(), cache);
    }
}
