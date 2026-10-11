use super::{
    network,
    process_supervisor::{self, Control, ProcessObservation, ProcessSpec},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::windows::fs::{MetadataExt, OpenOptionsExt},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, Weak},
    time::Duration,
};

const MANIFEST: &str = include_str!("../../assets/runtime-manifest.json");
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Manifest {
    pub schema: u32,
    pub platform: String,
    pub components: Vec<Component>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Component {
    pub name: String,
    pub version: String,
    pub url: String,
    pub bytes: u64,
    pub sha256: String,
    pub license: String,
    pub source: String,
    pub files: Vec<RuntimeFile>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct RuntimeFile {
    pub archive_path: Option<String>,
    pub name: String,
    pub sha256: String,
    pub probe: String,
    pub version_contains: String,
}
pub fn manifest() -> Result<Manifest, String> {
    serde_json::from_str(MANIFEST).map_err(|e| format!("Embedded runtime manifest: {e}"))
}
pub fn hash(mut input: impl Read) -> Result<String, String> {
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 65536];
    loop {
        let n = input
            .read(&mut buffer)
            .map_err(|e| format!("Hash read: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(format!("{:X}", hasher.finalize()))
}
pub fn check_file(path: &Path, expected: &str) -> Result<File, String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|e| format!("Runtime identity {}: {e}", path.display()))?;
    if !metadata.is_file() || metadata.file_attributes() & 0x400 != 0 {
        return Err(format!(
            "Runtime identity is not a regular non-reparse file: {}",
            path.display()
        ));
    }
    let mut file = OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(path)
        .map_err(|e| format!("Runtime read-only lease: {e}"))?;
    let actual = hash(&mut file)?;
    if actual != expected {
        return Err(format!(
            "Runtime SHA-256 mismatch {}: expected {expected}, got {actual}",
            path.display()
        ));
    }
    Ok(file)
}
fn safe_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| format!("App-owned directory: {e}"))?;
    for ancestor in path.ancestors() {
        let metadata = fs::symlink_metadata(ancestor).map_err(|e| e.to_string())?;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(format!(
                "Managed path crosses reparse point {}",
                ancestor.display()
            ));
        }
    }
    Ok(())
}
pub fn child_environment(workspace: &Path) -> Result<Vec<(String, String)>, String> {
    for dir in ["home", "temp", "appdata", "localappdata", "deno-cache"] {
        fs::create_dir_all(workspace.join(dir)).map_err(|e| e.to_string())?;
    }
    let mut environment: Vec<(String, String)> = vec![
        (
            "SystemRoot".into(),
            std::env::var("SystemRoot").map_err(|e| e.to_string())?,
        ),
        ("PATH".into(), String::new()),
        (
            "USERPROFILE".into(),
            workspace.join("home").display().to_string(),
        ),
        (
            "APPDATA".into(),
            workspace.join("appdata").display().to_string(),
        ),
        (
            "LOCALAPPDATA".into(),
            workspace.join("localappdata").display().to_string(),
        ),
        ("TEMP".into(), workspace.join("temp").display().to_string()),
        ("TMP".into(), workspace.join("temp").display().to_string()),
        (
            "DENO_DIR".into(),
            workspace.join("deno-cache").display().to_string(),
        ),
        ("DENO_NO_UPDATE_CHECK".into(), "1".into()),
        ("DENO_NO_PACKAGE_JSON".into(), "1".into()),
        ("PYTHONIOENCODING".into(), "utf-8".into()),
    ];
    environment.sort_by_key(|(key, _)| key.to_uppercase());
    Ok(environment)
}
pub struct RuntimeLease {
    pub files: BTreeMap<String, PathBuf>,
    pub versions: Vec<(String, String)>,
    pub digest: String,
    _guards: Vec<File>,
}
impl RuntimeLease {
    pub fn file(&self, name: &str) -> Result<PathBuf, String> {
        self.files
            .get(name)
            .cloned()
            .ok_or_else(|| format!("Manifest executable missing: {name}"))
    }
}
pub struct RuntimeManager {
    pub root: PathBuf,
    cache: Mutex<Weak<RuntimeLease>>,
}
impl RuntimeManager {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            cache: Mutex::new(Weak::new()),
        }
    }
    pub fn default_root() -> Result<PathBuf, String> {
        Ok(PathBuf::from(
            std::env::var("LOCALAPPDATA").map_err(|e| format!("Managed local data path: {e}"))?,
        )
        .join("AmeowNext/stage-a"))
    }
    pub fn prepare(
        &self,
        control: &Control,
        observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>,
        mut record: impl FnMut(String),
    ) -> Result<Arc<RuntimeLease>, String> {
        let mut cache = self
            .cache
            .lock()
            .map_err(|_| "Runtime preparation lock poisoned")?;
        if let Some(lease) = cache.upgrade() {
            let target = lease
                .file("yt-dlp.exe")?
                .parent()
                .ok_or("Runtime parent missing")?
                .to_path_buf();
            let _marker = marker_guard(&target, &lease.digest)?;
            for component in manifest()?.components {
                for file in component.files {
                    let _guard = check_file(&lease.file(&file.name)?, &file.sha256)?;
                }
            }
            record(format!(
                "Reuse live immutable runtime lease {}",
                lease.digest
            ));
            return Ok(lease);
        }
        safe_dir(&self.root)?;
        let manifest = manifest()?;
        let digest = hash(MANIFEST.as_bytes())?;
        struct PreparationLock {
            _file: File,
        }
        let lock_path = self.root.join("prepare.lock");
        let exclusive = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(false)
            .share_mode(0)
            .open(&lock_path)
            .map_err(|e| format!("Runtime preparation busy/exclusive lock: {e}"))?;
        let _lock = PreparationLock { _file: exclusive };
        let prepared = (|| {
            let target = self.root.join(format!("runtime-{digest}"));
            if !target.exists() {
                let stage = tempfile::Builder::new()
                    .prefix("runtime-stage-")
                    .tempdir_in(&self.root)
                    .map_err(|e| e.to_string())?;
                for component in &manifest.components {
                    let archive = stage.path().join(format!("{}.artifact", component.name));
                    network::acquire(
                        &component.url,
                        &archive,
                        component.bytes,
                        control.cancellation_flag(),
                        |url, route| record(format!("Acquire {} route {:?}", url, route)),
                    )?;
                    let guard = check_file(&archive, &component.sha256)?;
                    drop(guard);
                    if component.files.iter().all(|f| f.archive_path.is_none()) {
                        fs::copy(&archive, stage.path().join(&component.files[0].name))
                            .map_err(|e| e.to_string())?;
                    } else {
                        let mut zip =
                            zip::ZipArchive::new(File::open(&archive).map_err(|e| e.to_string())?)
                                .map_err(|e| format!("Runtime ZIP: {e}"))?;
                        for entry in &component.files {
                            let source = entry
                                .archive_path
                                .as_deref()
                                .ok_or("Mixed manifest archive types")?;
                            let mut item = zip
                                .by_name(source)
                                .map_err(|e| format!("Pinned ZIP entry {source}: {e}"))?;
                            if item.is_dir() || item.size() > 512_000_000 {
                                return Err("Runtime ZIP entry invalid/bound exceeded".into());
                            }
                            let mut out = OpenOptions::new()
                                .create_new(true)
                                .write(true)
                                .open(stage.path().join(&entry.name))
                                .map_err(|e| e.to_string())?;
                            std::io::copy(&mut item, &mut out).map_err(|e| e.to_string())?;
                            out.sync_all().map_err(|e| e.to_string())?;
                        }
                    }
                    fs::remove_file(archive).map_err(|e| e.to_string())?;
                }
                self.verify(
                    stage.path(),
                    &manifest,
                    control,
                    observer.clone(),
                    &mut record,
                )?;
                let mut marker = OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(stage.path().join("complete.json"))
                    .map_err(|e| e.to_string())?;
                marker
                    .write_all(MANIFEST.as_bytes())
                    .map_err(|e| e.to_string())?;
                marker.sync_all().map_err(|e| e.to_string())?;
                drop(marker);
                super::output::move_no_replace(stage.path(), &target)
                    .map_err(|e| format!("Runtime immutable publication: {e}"))?;
            }
            safe_dir(&target)?;
            let marker = marker_guard(&target, &digest)?;
            let mut guards = self.verify(&target, &manifest, control, observer, &mut record)?;
            guards.push(marker);
            let files = manifest
                .components
                .iter()
                .flat_map(|c| {
                    c.files
                        .iter()
                        .map(|f| (f.name.clone(), target.join(&f.name)))
                })
                .collect();
            Ok(Arc::new(RuntimeLease {
                files,
                versions: manifest
                    .components
                    .iter()
                    .map(|c| (c.name.clone(), c.version.clone()))
                    .collect(),
                digest,
                _guards: guards,
            }))
        })();
        if let Ok(lease) = &prepared {
            *cache = Arc::downgrade(lease);
        }
        prepared
    }
    fn verify(
        &self,
        path: &Path,
        manifest: &Manifest,
        control: &Control,
        observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>,
        record: &mut impl FnMut(String),
    ) -> Result<Vec<File>, String> {
        let mut guards = Vec::new();
        for component in &manifest.components {
            for file in &component.files {
                if control.is_cancelled() {
                    return Err("Runtime verification cancelled".into());
                }
                let executable = path.join(&file.name);
                guards.push(check_file(&executable, &file.sha256)?);
                let probe = tempfile::Builder::new()
                    .prefix("probe-")
                    .tempdir_in(&self.root)
                    .map_err(|e| e.to_string())?;
                let outcome = process_supervisor::run(
                    ProcessSpec {
                        executable,
                        args: if file.name == "yt-dlp.exe" {
                            vec![
                                "--ignore-config".into(),
                                "--no-plugin-dirs".into(),
                                file.probe.clone(),
                            ]
                        } else {
                            vec![file.probe.clone()]
                        },
                        cwd: probe.path().into(),
                        env: child_environment(probe.path())?,
                        stdout_limit: 64 * 1024,
                        stderr_limit: 64 * 1024,
                        timeout: Some(Duration::from_secs(20)),
                    },
                    control,
                    observer.clone(),
                )?;
                let text = format!(
                    "{}{}",
                    String::from_utf8_lossy(&outcome.stdout),
                    String::from_utf8_lossy(&outcome.stderr)
                );
                record(format!(
                    "Runtime probe {} exit={} settlement={:?} output={text}",
                    file.name, outcome.exit_code, outcome.facts
                ));
                if control.is_cancelled() {
                    return Err(
                        "Runtime preparation cancelled after owned process settlement".into(),
                    );
                }
                if outcome.exit_code != 0
                    || outcome.facts.stdout_truncated
                    || !outcome.facts.resources_releasable()
                    || !text.contains(&file.version_contains)
                {
                    return Err(format!(
                        "Runtime version probe mismatch {}: {text}",
                        file.name
                    ));
                }
                record(format!(
                    "Verified {} SHA256={} version={}",
                    file.name, file.sha256, file.version_contains
                ));
            }
        }
        Ok(guards)
    }
}
fn marker_guard(target: &Path, digest: &str) -> Result<File, String> {
    let path = target.join("complete.json");
    if fs::symlink_metadata(&path)
        .map_err(|e| format!("Runtime completion marker: {e}"))?
        .len()
        != MANIFEST.len() as u64
    {
        return Err("Runtime completion manifest mismatch; refusing cache".into());
    }
    check_file(&path, digest)
        .map_err(|e| format!("Runtime completion manifest mismatch; refusing cache: {e}"))
}
