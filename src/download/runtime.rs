use super::{
    network,
    process_supervisor::{self, Control, ProcessObservation, ProcessSpec},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, Weak},
    time::Duration,
};
#[cfg(windows)]
use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
#[cfg(target_os = "macos")]
use std::os::unix::{fs::{MetadataExt, OpenOptionsExt, PermissionsExt}, io::AsRawFd};

#[cfg(target_os = "macos")]
#[path = "runtime_identity_macos.rs"]
pub(super) mod identity;

#[cfg(test)]
thread_local! { static FILE_HASHES: std::cell::Cell<usize> = const { std::cell::Cell::new(0) }; }

#[cfg(all(test, target_os = "macos"))]
#[path = "runtime_reuse_macos_tests.rs"]
mod reuse_tests;

#[cfg(not(target_os = "macos"))]
const MANIFEST: &str = include_str!("../../assets/runtime-manifest.json");
#[cfg(target_os = "macos")]
const MANIFEST: &str = include_str!("macos-runtime-manifest.json");

fn native_tool_name(name: &str) -> &str {
    #[cfg(target_os = "macos")]
    {
        name.strip_suffix(".exe").unwrap_or(name)
    }
    #[cfg(not(target_os = "macos"))]
    {
        name
    }
}
#[cfg(target_os = "macos")]
pub(crate) const PYTHON_TOOL: &str = "python/bin/python3.13";

#[cfg(target_os = "macos")]
pub(crate) fn python_zipapp(python: PathBuf, archive: &Path, args: Vec<String>) -> Result<(PathBuf, Vec<String>), String> {
    let archive = archive.to_str().ok_or("Runtime zipapp path is not valid UTF-8")?;
    let mut command = vec!["-I".into(), "-B".into(), archive.into()];
    command.extend(args);
    Ok((python, command))
}
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
    #[cfg(all(target_os = "macos", not(target_arch = "aarch64")))]
    return Err("Managed macOS runtime requires Apple Silicon".into());
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
    #[cfg(target_os = "macos")]
    let identity = identity::PathIdentity::capture(path)?;
    let metadata = fs::symlink_metadata(path)
        .map_err(|e| format!("Runtime identity {}: {e}", path.display()))?;
    if !super::is_plain_file(&metadata) {
        return Err(format!(
            "Runtime identity is not a regular non-reparse file: {}",
            path.display()
        ));
    }
    let mut file = open_identity_file(path)
        .map_err(|e| format!("Runtime read-only lease: {e}"))?;
    #[cfg(test)]
    FILE_HASHES.with(|count| count.set(count.get() + 1));
    let actual = hash(&mut file)?;
    if actual != expected {
        return Err(format!(
            "Runtime SHA-256 mismatch {}: expected {expected}, got {actual}",
            path.display()
        ));
    }
    #[cfg(target_os = "macos")]
    identity.validate_handle(&file)?;
    Ok(file)
}
pub(crate) fn open_identity_file(path: &Path) -> std::io::Result<File> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    options.share_mode(1);
    #[cfg(target_os = "macos")]
    options.custom_flags(libc::O_NOFOLLOW);
    let file = options.open(path)?;
    #[cfg(target_os = "macos")]
    {
        let path_metadata = fs::symlink_metadata(path)?;
        let opened = file.metadata()?;
        if !super::is_plain_file(&path_metadata) || !opened.is_file()
            || path_metadata.dev() != opened.dev() || path_metadata.ino() != opened.ino()
        {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "runtime file identity changed"));
        }
        if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_SH | libc::LOCK_NB) } != 0 {
            return Err(std::io::Error::last_os_error());
        }
    }
    Ok(file)
}

fn is_link(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    { metadata.file_attributes() & 0x400 != 0 }
    #[cfg(target_os = "macos")]
    { metadata.file_type().is_symlink() }
}

fn lock_preparation(root: &Path) -> std::io::Result<File> {
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(false);
    #[cfg(windows)]
    options.share_mode(0);
    #[cfg(target_os = "macos")]
    options.custom_flags(libc::O_NOFOLLOW);
    let file = options.open(root.join("prepare.lock"))?;
    #[cfg(target_os = "macos")]
    if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(file)
}

#[cfg(target_os = "macos")]
fn absolute_normalized(path: &Path) -> Result<PathBuf, String> {
    use std::path::Component;
    let absolute = if path.is_absolute() { path.to_path_buf() } else {
        std::env::current_dir().map_err(|error| error.to_string())?.join(path)
    };
    let mut result = PathBuf::new();
    for component in absolute.components() {
        match component {
            Component::RootDir => result.push("/"),
            Component::Normal(name) => result.push(name),
            Component::CurDir => {}
            Component::ParentDir if result.pop() => {}
            _ => return Err("Invalid managed storage path".into()),
        }
    }
    Ok(result)
}

#[cfg(target_os = "macos")]
fn resolve_existing_ancestor(path: &Path) -> Result<PathBuf, String> {
    let mut ancestor = path;
    loop {
        match fs::symlink_metadata(ancestor) {
            Ok(_) => break,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                ancestor = ancestor.parent().ok_or("Managed storage has no existing ancestor")?;
            }
            Err(error) => return Err(format!("Managed storage identity: {error}")),
        }
    }
    let resolved = ancestor.canonicalize().map_err(|error| error.to_string())?;
    let suffix = path.strip_prefix(ancestor).map_err(|error| error.to_string())?;
    absolute_normalized(&resolved.join(suffix))
}

#[cfg(target_os = "macos")]
fn check_storage_for_home(path: &Path, home: &Path) -> Result<(), String> {
    let target = if path.is_absolute() { path.to_path_buf() } else {
        std::env::current_dir().map_err(|error| error.to_string())?.join(path)
    };
    let legacy = absolute_normalized(&home.join("Library/Application Support/Ameow"))?;
    if absolute_normalized(&target)?.starts_with(&legacy) {
        return Err("E_LEGACY_STORAGE: Native Ameow does not use legacy data".into());
    }
    let resolved_target = resolve_existing_ancestor(&target)?;
    let resolved_legacy = resolve_existing_ancestor(&legacy)?;
    if resolved_target.starts_with(&resolved_legacy) {
        return Err("E_LEGACY_STORAGE: Native Ameow does not use legacy data".into());
    }
    Ok(())
}

#[cfg(all(test, target_os = "macos"))]
thread_local! {
    static TEST_DATA_HOME: std::cell::RefCell<Option<PathBuf>> = const { std::cell::RefCell::new(None) };
}

#[cfg(all(test, target_os = "macos"))]
pub(super) fn with_test_data_home<T>(home: &Path, action: impl FnOnce() -> T) -> T {
    struct Restore(Option<PathBuf>);
    impl Drop for Restore {
        fn drop(&mut self) {
            TEST_DATA_HOME.with(|slot| { slot.replace(self.0.take()); });
        }
    }
    let previous = TEST_DATA_HOME.with(|slot| slot.replace(Some(home.to_path_buf())));
    let _restore = Restore(previous);
    action()
}

pub(crate) fn check_data_location(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        #[cfg(test)]
        if let Some(home) = TEST_DATA_HOME.with(|slot| slot.borrow().clone()) {
            return check_storage_for_home(path, &home);
        }
        let home = std::env::var_os("HOME").ok_or("Managed home directory unavailable")?;
        check_storage_for_home(path, Path::new(&home))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Ok(())
    }
}
pub(crate) fn safe_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| format!("App-owned directory: {e}"))?;
    if is_link(&fs::symlink_metadata(path).map_err(|e| e.to_string())?) {
        return Err("Managed directory is a symlink".into());
    }
    #[cfg(target_os = "macos")]
    let checked = path.canonicalize().map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "macos"))]
    let checked = path.to_path_buf();
    for ancestor in checked.ancestors() {
        let metadata = fs::symlink_metadata(ancestor).map_err(|e| e.to_string())?;
        if is_link(&metadata) {
            return Err(format!(
                "Managed path crosses reparse point {}",
                ancestor.display()
            ));
        }
    }
    Ok(())
}
pub fn child_environment(workspace: &Path) -> Result<Vec<(String, String)>, String> {
    for dir in ["home", "temp", "appdata", "localappdata"] {
        fs::create_dir_all(workspace.join(dir)).map_err(|e| e.to_string())?;
    }
    #[cfg(windows)]
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
    ];
    #[cfg(target_os = "macos")]
    let mut environment: Vec<(String, String)> = vec![
        ("PATH".into(), String::new()),
        ("TMPDIR".into(), workspace.join("temp").display().to_string()),
        ("TMP".into(), workspace.join("temp").display().to_string()),
        ("XDG_CONFIG_HOME".into(), workspace.join("appdata").display().to_string()),
        ("XDG_CACHE_HOME".into(), workspace.join("localappdata").display().to_string()),
        ("SSL_CERT_FILE".into(), "/etc/ssl/cert.pem".into()),
        ("LANG".into(), "en_US.UTF-8".into()),
    ];
    environment.sort_by_key(|(key, _)| key.to_uppercase());
    Ok(environment)
}
#[derive(Clone)]
pub struct TrustedRuntimeRequirements {
    probes: BTreeMap<String, Vec<String>>,
    additions: Vec<(String, String, bool)>,
    empty: bool,
}
impl TrustedRuntimeRequirements {
    pub(crate) fn compiled(probes: &[(&str, &[&str])], additions: &[(&str, &str, bool)]) -> Self {
        #[allow(unused_mut)]
        let mut probes: BTreeMap<String, Vec<String>> = probes.iter()
            .map(|(name, args)| (native_tool_name(name).into(), args.iter().map(|s| (*s).into()).collect()))
            .collect();
        #[cfg(target_os = "macos")]
        if probes.contains_key("yt-dlp") || probes.contains_key("gallery-dl") {
            probes.entry(PYTHON_TOOL.into()).or_insert_with(|| vec!["--version".into()]);
        }
        Self {
            probes,
            additions: additions
                .iter()
                .map(|(key, value, dir)| ((*key).into(), (*value).into(), *dir))
                .collect(),
            empty: false,
        }
    }
    #[cfg(any(test, all(feature = "dev-tools", debug_assertions)))]
    pub(crate) fn empty() -> Self {
        Self {
            probes: BTreeMap::new(),
            additions: Vec::new(),
            empty: true,
        }
    }
    pub fn contains(&self, file: &str) -> bool {
        self.probes.contains_key(native_tool_name(file))
    }
    pub fn versions(&self) -> Vec<(String, String)> {
        if self.empty {
            Vec::new()
        } else {
            self.selected_manifest()
                .map(|(m, _)| {
                    m.components
                        .into_iter()
                        .map(|c| (c.name, c.version))
                        .collect()
                })
                .unwrap_or_default()
        }
    }
    fn identity(&self) -> Result<String, String> {
        hash(
            serde_json::to_vec(&(&self.probes, &self.additions, self.empty))
                .map_err(|e| e.to_string())?
                .as_slice(),
        )
    }
    fn validate(&self) -> Result<(), String> {
        if self.empty {
            return Ok(());
        }
        let manifest = manifest()?;
        let files: Vec<_> = manifest
            .components
            .iter()
            .flat_map(|c| c.files.iter())
            .collect();
        if self.probes.is_empty()
            || self
                .probes
                .keys()
                .any(|name| !files.iter().any(|f| &f.name == name))
        {
            return Err("Untrusted compiled tool requirements".into());
        }
        let mut keys = std::collections::BTreeSet::new();
        for (key, value, directory) in &self.additions {
            if !keys.insert(key) {
                return Err("Duplicate runtime environment extension".into());
            }
            if key.is_empty()
                || !key.bytes().all(|b| b.is_ascii_uppercase() || b == b'_')
                || matches!(
                    key.as_str(),
                    "PATH"
                        | "SYSTEMROOT"
                        | "USERPROFILE"
                        | "APPDATA"
                        | "LOCALAPPDATA"
                        | "TEMP"
                        | "TMP"
                )
                || (cfg!(target_os = "macos") && matches!(key.as_str(),
                    "HOME" | "CODEX_HOME" | "TMPDIR" | "XDG_CONFIG_HOME" | "XDG_CACHE_HOME"
                    | "SSL_CERT_FILE" | "SSL_CERT_DIR"))
            {
                return Err("Runtime environment cannot override base isolation".into());
            }
            if *directory
                && !Path::new(value)
                    .components()
                    .all(|c| matches!(c, std::path::Component::Normal(_)))
            {
                return Err("Runtime environment directory escapes workspace".into());
            }
        }
        Ok(())
    }
    pub fn environment(&self, workspace: &Path) -> Result<Vec<(String, String)>, String> {
        self.validate()?;
        let mut environment = child_environment(workspace)?;
        for (key, value, directory) in &self.additions {
            let value = if *directory {
                let path = workspace.join(value);
                safe_dir(&path)?;
                path.display().to_string()
            } else {
                value.clone()
            };
            environment.push((key.clone(), value));
        }
        environment.sort_by_key(|(key, _)| key.to_uppercase());
        Ok(environment)
    }
    fn selected_manifest(&self) -> Result<(Manifest, Vec<u8>), String> {
        let mut selected = manifest()?;
        let all = selected
            .components
            .iter()
            .flat_map(|component| &component.files)
            .all(|file| self.contains(&file.name));
        if all {
            return Ok((selected, MANIFEST.as_bytes().to_vec()));
        }
        for component in &mut selected.components {
            component.files.retain(|file| self.contains(&file.name));
        }
        selected
            .components
            .retain(|component| !component.files.is_empty());
        let bytes = serde_json::to_vec(&selected).map_err(|e| e.to_string())?;
        Ok((selected, bytes))
    }
}

#[derive(Default)]
struct VerifiedRuntime {
    guards: Vec<File>,
    #[cfg(target_os = "macos")]
    identities: Vec<identity::PathIdentity>,
}
impl VerifiedRuntime {
    fn file(&mut self, path: &Path, expected: &str,
        component: super::preparation::RuntimeComponent, stage: super::preparation::PreparationStage,
    ) -> Result<(), super::preparation::PreparationFailure> {
        #[cfg(target_os = "macos")]
        let identity = identity::PathIdentity::from_metadata(path, &fs::symlink_metadata(path)
            .map_err(|error| super::preparation::PreparationFailure::io_operation(component, stage,
                super::preparation::PreparationOperation::FileOpen, error))?);
        let guard = typed_check_file(path, expected, component, stage)?;
        #[cfg(target_os = "macos")]
        {
            identity.validate_handle(&guard).map_err(|_| super::preparation::PreparationFailure::new(
                component, stage, super::preparation::ErrorCategory::Hash))?;
            self.identities.push(identity);
        }
        self.guards.push(guard);
        Ok(())
    }
    fn marker(&mut self, directory: &Path, digest: &str, bytes: u64)
        -> Result<(), super::preparation::PreparationFailure> {
        #[cfg(target_os = "macos")]
        use super::preparation::{ErrorCategory as E, PreparationFailure as F, PreparationOperation as O, PreparationStage as S, RuntimeComponent as C};
        #[cfg(target_os = "macos")]
        let identity = identity::PathIdentity::from_metadata(&directory.join("complete.json"),
            &fs::symlink_metadata(directory.join("complete.json"))
                .map_err(|error| F::io_operation(C::Runtime, S::Cache, O::MarkerCheck, error))?);
        let guard = typed_marker_guard(directory, digest, bytes)?;
        #[cfg(target_os = "macos")]
        {
            identity.validate_handle(&guard).map_err(|_| F::new(C::Runtime, S::Cache, E::Hash))?;
            self.identities.push(identity);
        }
        self.guards.push(guard);
        Ok(())
    }
}

pub struct RuntimeLease {
    pub directory: PathBuf,
    requirement_id: String,
    marker_bytes: u64,
    pub files: BTreeMap<String, PathBuf>,
    #[cfg(target_os = "macos")]
    identities: Vec<identity::PathIdentity>,
    pub versions: Vec<(String, String)>,
    pub digest: String,
    _guards: Vec<File>,
}
impl RuntimeLease {
    #[cfg(target_os = "macos")]
    pub(crate) fn execution_guards(&self) -> Result<Vec<File>, String> {
        self.validate_identity()?;
        self._guards.iter().map(|guard| guard.try_clone().map_err(|error| error.to_string())).collect()
    }
    fn validate_identity(&self) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        for identity in &self.identities { identity.validate()?; }
        Ok(())
    }
    pub fn file(&self, name: &str) -> Result<PathBuf, String> {
        let name = native_tool_name(name);
        let path = self.files.get(name).cloned()
            .ok_or_else(|| format!("Manifest executable missing: {name}"))?;
        self.validate_identity()?;
        Ok(path)
    }
}
#[cfg(all(test, target_os = "macos"))]
#[test]
fn execution_guards_use_current_lease_hashes_and_reject_changed_files() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("yt-dlp");
    for bytes in [b"recommended runtime".as_slice(), b"user selected newer runtime".as_slice()] {
        fs::write(&path, bytes).unwrap();
        let guard = check_file(&path, &hash(bytes).unwrap()).unwrap();
        let lease = RuntimeLease {
            directory: root.path().into(), requirement_id: "fixture".into(), marker_bytes: 0,
            files: BTreeMap::from([("yt-dlp".into(), path.clone())]),
            identities: vec![identity::PathIdentity::capture(&path).unwrap()],
            versions: Vec::new(), digest: String::new(), _guards: vec![guard],
        };
        assert_eq!(lease.execution_guards().unwrap().len(), 1);
        fs::write(&path, b"changed executable").unwrap();
        assert!(lease.execution_guards().unwrap_err().contains("identity changed"));
    }
}

pub struct RuntimeManager {
    pub root: PathBuf,
    pub(crate) root_source: super::preparation::RuntimeRootSource,
    cache: Mutex<Weak<RuntimeLease>>,
    candidate: Option<Candidate>,
    #[cfg(test)]
    test_catalog: Mutex<Option<Manifest>>,
    #[cfg(test)]
    test_acquirer: Mutex<Option<TestAcquirer>>,
}
struct Candidate {
    manifest: Manifest,
    artifact: PathBuf,
    component: String,
    exact_probe_file: String,
    allow_acquisition: bool,
}
#[cfg(test)]
type TestAcquirer = Arc<dyn Fn(&Path, u64) -> Result<(), network::AcquisitionError> + Send + Sync>;
impl RuntimeManager {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            root_source: super::preparation::RuntimeRootSource::Unknown,
            cache: Mutex::new(Weak::new()),
            candidate: None,
            #[cfg(test)]
            test_catalog: Mutex::new(None),
            #[cfg(test)]
            test_acquirer: Mutex::new(None),
        }
    }
    pub fn with_root_source(mut self, source: super::preparation::RuntimeRootSource) -> Self {
        self.root_source = source;
        self
    }
    pub(crate) fn candidate(
        root: PathBuf,
        manifest: Manifest,
        artifact: PathBuf,
        component: &str,
        exact_probe_file: &str,
        allow_acquisition: bool,
    ) -> Self {
        let mut manager = Self::new(root);
        manager.candidate = Some(Candidate {
            manifest,
            artifact,
            component: component.into(),
            exact_probe_file: exact_probe_file.into(),
            allow_acquisition,
        });
        manager
    }
    pub fn default_root() -> Result<PathBuf, String> {
        #[cfg(windows)]
        {
        Ok(PathBuf::from(
            std::env::var("LOCALAPPDATA").map_err(|e| format!("Managed local data path: {e}"))?,
        )
        .join("Ameow"))
        }
        #[cfg(target_os = "macos")]
        {
            Ok(PathBuf::from(std::env::var_os("HOME").ok_or("Managed home directory unavailable")?)
                .join("Library/Application Support/AmeowNative"))
        }
    }
    pub fn prepare(
        &self,
        requirements: &TrustedRuntimeRequirements,
        control: &Control,
        observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>,
        mut record: impl FnMut(String),
    ) -> Result<Arc<RuntimeLease>, String> {
        self.prepare_observed(requirements, control, observer, |event| {
            record(format!(
                "{:?} {:?} {:?} bytes={} total={:?}",
                event.phase,
                event.component,
                event.stage,
                event.downloaded_bytes,
                event.total_bytes
            ));
        })
        .map_err(|error| error.to_string())
    }
    pub(crate) fn prepare_observed(
        &self,
        requirements: &TrustedRuntimeRequirements,
        control: &Control,
        observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>,
        mut observed: impl FnMut(super::preparation::PreparationSnapshot),
    ) -> Result<Arc<RuntimeLease>, super::preparation::PreparationFailure> {
        use super::preparation::{
            ErrorCategory as E, PreparationFailure as F, PreparationPhase as P,
            PreparationOperation as O, PreparationSnapshot, PreparationStage as S, RuntimeComponent as C,
        };
        let fail = |stage, category| F::new(C::Runtime, stage, category);
        let mut state = PreparationSnapshot { root_source: self.root_source, ..Default::default() };
        state.observe(P::Preparing, None, S::Cache, 0, None, None);
        observed(state.clone());
        check_data_location(&self.root).map_err(|_| fail(S::Cache, E::Storage))?;
        requirements
            .validate()
            .map_err(|_| fail(S::Cache, E::Unknown))?;
        if control.is_cancelled() {
            return Err(fail(S::Cache, E::Cancelled));
        }
        let requirement_id = requirements
            .identity()
            .map_err(|_| fail(S::Cache, E::Unknown))?;
        if requirements.empty {
            safe_dir(&self.root).map_err(|_| fail(S::Cache, E::Storage))?;
            return Ok(Arc::new(RuntimeLease {
                directory: self.root.clone(),
                requirement_id,
                marker_bytes: 0,
                files: BTreeMap::new(),
                #[cfg(target_os = "macos")]
                identities: Vec::new(),
                versions: Vec::new(),
                digest: hash(b"empty-trusted-set".as_slice())
                    .map_err(|_| fail(S::Cache, E::Unknown))?,
                _guards: Vec::new(),
            }));
        }
        let mut cache = self.cache.lock().map_err(|_| fail(S::Cache, E::Unknown))?;
        let (manifest, marker_content) = requirements
            .selected_manifest()
            .map_err(|_| fail(S::Cache, E::Unknown))?;
        let (manifest, marker_content) = if let Some(candidate) = &self.candidate {
            let mut selected = candidate.manifest.clone();
            for component in &mut selected.components {
                component
                    .files
                    .retain(|file| requirements.contains(&file.name));
            }
            selected
                .components
                .retain(|component| !component.files.is_empty());
            let bytes = serde_json::to_vec(&selected).map_err(|_| fail(S::Cache, E::Unknown))?;
            (selected, bytes)
        } else {
            (manifest, marker_content)
        };
        #[cfg(test)]
        let (manifest, marker_content) = match self.test_catalog.lock().unwrap().clone() {
            Some(catalog) => {
                let content = serde_json::to_vec(&catalog).unwrap();
                (catalog, content)
            }
            None => (manifest, marker_content),
        };
        let digest = hash(marker_content.as_slice()).map_err(|_| fail(S::Cache, E::Unknown))?;
        if let Some(lease) = cache.upgrade() {
            if lease.requirement_id != requirement_id || lease.digest != digest
                || lease.marker_bytes != marker_content.len() as u64 {
                return Err(fail(S::Cache, E::Unknown));
            }
            lease.validate_identity().map_err(|_| fail(S::Cache, E::Hash))?;
            if control.is_cancelled() { return Err(fail(S::Cache, E::Cancelled)); }
            return Ok(lease);
        }
        typed_safe_dir(&self.root, C::Runtime, S::Cache)?;
        let _exclusive = lock_preparation(&self.root)
            .map_err(|e| F::io_operation(C::Runtime, S::Cache, O::PrepareLock, e))?;
        // Search only bounded application-owned immutable candidates; never mutate a rejected cache.
        let primary = self.root.join(format!("runtime-{digest}"));
        let entries = fs::read_dir(&self.root)
            .map_err(|e| F::io_operation(C::Runtime, S::Cache, O::CandidateInspect, e))?
            .take(129)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| F::io_operation(C::Runtime, S::Cache, O::CandidateInspect, e))?;
        let at_capacity = entries.len() >= 128;
        let reuse_candidates: Vec<_> = entries.iter().take(128)
            .filter(|entry| entry.file_name().to_string_lossy().starts_with("runtime-"))
            .map(|entry| entry.path()).collect();
        let mut candidates = vec![primary.clone()];
        candidates.extend(reuse_candidates.iter().filter(|path| path.file_name().is_some_and(|name|
            name.to_string_lossy().starts_with(&format!("runtime-{digest}-recovered-")))).cloned());
        for target in candidates {
            if control.is_cancelled() {
                return Err(fail(S::Cache, E::Cancelled));
            }
            if !target.exists() {
                continue;
            }
            let candidate = (|| {
                typed_safe_existing_dir(&target)?;
                let mut verified = VerifiedRuntime::default();
                verified.marker(&target, &digest, marker_content.len() as u64)?;
                for component in &manifest.components {
                    for file in &component.files {
                        verified.file(
                            &target.join(&file.name),
                            &file.sha256,
                            C::from_name(&component.name),
                            S::Cache,
                        )?;
                    }
                }
                verify_bundles(&target, &manifest, S::Cache, &mut verified)?;
                Ok::<_, F>(verified)
            })();
            match candidate {
                Ok(verified) => {
                    if control.is_cancelled() { return Err(fail(S::Cache, E::Cancelled)); }
                    let lease = runtime_lease(
                        target,
                        requirement_id.clone(),
                        digest.clone(),
                        marker_content.len() as u64,
                        &manifest,
                        verified,
                    );
                    lease.validate_identity().map_err(|_| fail(S::Cache, E::Hash))?;
                    if control.is_cancelled() { return Err(fail(S::Cache, E::Cancelled)); }
                    *cache = Arc::downgrade(&lease);
                    return Ok(lease);
                }
                Err(error) => {
                    if error.category == E::Permission {
                        return Err(error);
                    }
                    state.observe(
                        P::Preparing,
                        Some(error.component),
                        S::Cache,
                        0,
                        None,
                        Some(error),
                    );
                    observed(state.clone());
                }
            }
        }
        if at_capacity {
            let mut failure = fail(S::Cache, E::Storage);
            failure.operation = Some(O::CandidateLimit);
            return Err(failure);
        }
        // Failed attempts remain discoverable. Files are only created in this new sibling.
        let target = tempfile::Builder::new()
            .prefix(&format!("runtime-{digest}-recovered-"))
            .tempdir_in(&self.root)
            .map_err(|e| F::io_operation(C::Runtime, S::Acquire, O::RootCreate, e))?
            .keep();
        let stage = target.as_path();
        for component in &manifest.components {
            let component_id = C::from_name(&component.name);
            if self
                .candidate
                .as_ref()
                .is_none_or(|candidate| component.name != candidate.component)
            {
                #[cfg(target_os = "macos")]
                let mut reused = false;
                // Windows can salvage individual tools from an incomplete shared archive.
                #[cfg(windows)]
                let reused = {
                    for file in &component.files {
                        for previous in &reuse_candidates {
                            if control.is_cancelled() { return Err(fail(S::Cache, E::Cancelled)); }
                            if typed_safe_existing_dir(previous).is_err() { continue; }
                            if let Ok(mut input) = typed_check_file(&previous.join(&file.name), &file.sha256, component_id, S::Cache) {
                                copy_new(&mut input, &stage.join(&file.name), control, component_id)?;
                                break;
                            }
                        }
                    }
                    component.files.iter().all(|file| stage.join(&file.name).is_file())
                };
                #[cfg(target_os = "macos")]
                for previous in &reuse_candidates {
                    if typed_safe_existing_dir(previous).is_err() { continue; }
                    let guards: Result<Vec<_>, _> = component
                        .files
                        .iter()
                        .map(|f| {
                            typed_check_file(
                                &previous.join(&f.name),
                                &f.sha256,
                                component_id,
                                S::Cache,
                            )
                        })
                        .collect();
                    if let Ok(_guards) = guards {
                        #[cfg(target_os = "macos")]
                        if matches!(component.name.as_str(), "python" | "gallery-dl") {
                            let verified = if component.name == "python" {
                                super::macos_gallery::verify_python(previous)
                            } else {
                                super::macos_gallery::verify_gallery(previous)
                            };
                            if verified.is_err() { continue; }
                            let copied = if component.name == "python" {
                                super::macos_gallery::copy_python(previous, stage)
                            } else {
                                super::macos_gallery::copy_gallery(previous, stage)
                            };
                            copied.map_err(|_| F::new(component_id, S::Extract, E::Hash))?;
                            reused = true; break;
                        }
                        for file in &component.files {
                            fs::copy(previous.join(&file.name), stage.join(&file.name))
                                .map_err(|e| F::io(component_id, S::Extract, e))?;
                        }
                        reused = true;
                        break;
                    }
                }
                if reused {
                    continue;
                }
            }
            if control.is_cancelled() { return Err(fail(S::Acquire, E::Cancelled)); }
            let archive_name = format!("{}.artifact", component.name);
            let local_candidate = self.candidate.as_ref().is_some_and(|candidate| component.name == candidate.component);
            let reusable_archive = if local_candidate { None } else {
                reuse_candidates.iter().filter(|previous| typed_safe_existing_dir(previous).is_ok())
                    .find_map(|previous| {
                        let path = previous.join(&archive_name);
                        checked_artifact(&path, component).ok().map(|guard| (path, guard))
                    })
            };
            let (archive, _archive_guard) = if let Some(cached) = reusable_archive { cached } else {
                if self.candidate.as_ref().is_some_and(|candidate| !candidate.allow_acquisition) && !local_candidate {
                    return Err(F::new(component_id, S::Cache, E::Hash));
                }
                let archive = stage.join(archive_name);
                state.observe(
                    if local_candidate { P::Preparing } else { P::Downloading },
                    Some(component_id), if local_candidate { S::Cache } else { S::Acquire },
                    0, Some(component.bytes), None,
                );
                observed(state.clone());
                self.acquire_component(component, &archive, control, |bytes, total| {
                    state.observe(P::Downloading, Some(component_id), S::Acquire, bytes, total, None);
                    observed(state.clone());
                }).map_err(|error| {
                    let mut failure = F::new(component_id, S::Acquire, error.category);
                    failure.http_status = error.http_status;
                    failure.operation = Some(error.operation);
                    failure.raw_os_error = error.raw_os_error;
                    failure
                })?;
                state.observe(P::Verifying, Some(component_id), S::Verify, component.bytes, Some(component.bytes), None);
                observed(state.clone());
                let guard = checked_artifact(&archive, component)?;
                (archive, guard)
            };
            state.observe(P::Verifying, Some(component_id), S::Extract, 0, None, None);
            observed(state.clone());
            #[cfg(target_os = "macos")]
            let bundled_gallery = match component.name.as_str() {
                "python" => { super::macos_gallery::extract_python(&archive, stage, control)?; true }
                "gallery-dl" => { super::macos_gallery::extract_gallery(&archive, stage, control)?; true }
                _ => false,
            };
            #[cfg(not(target_os = "macos"))]
            let bundled_gallery = false;
            #[cfg(target_os = "macos")]
            let tar_file = if !bundled_gallery && component.url.ends_with(".tgz") {
                for file in &component.files {
                    let member = file.archive_path.as_deref().ok_or_else(|| F::new(component_id, S::Extract, E::Extract))?;
                    super::macos_gallery::extract_tar_file(&archive, member, &stage.join(&file.name))
                        .map_err(|_| F::new(component_id, S::Extract, E::Extract))?;
                }
                true
            } else { false };
            #[cfg(not(target_os = "macos"))]
            let tar_file = false;
            if bundled_gallery || tar_file {
            } else if component.files.iter().all(|f| f.archive_path.is_none()) {
                let mut input = open_identity_file(&archive)
                    .map_err(|e| F::io_operation(component_id, S::Extract, O::FileOpen, e))?;
                copy_new(&mut input, &stage.join(&component.files[0].name), control, component_id)?;
            } else {
                let mut zip = zip::ZipArchive::new(
                    File::open(&archive).map_err(|e| F::io_operation(component_id, S::Extract, O::FileOpen, e))?,
                )
                .map_err(|_| F::new(component_id, S::Extract, E::Extract))?;
                for entry in &component.files {
                    if stage.join(&entry.name).is_file() { continue; }
                    if control.is_cancelled() {
                        return Err(F::new(component_id, S::Extract, E::Cancelled));
                    }
                    let mut item = zip
                        .by_name(
                            entry
                                .archive_path
                                .as_deref()
                                .ok_or_else(|| F::new(component_id, S::Extract, E::Extract))?,
                        )
                        .map_err(|_| F::new(component_id, S::Extract, E::Extract))?;
                    if item.is_dir() || item.size() > 512_000_000
                        || item.unix_mode().is_some_and(|mode| mode & 0o170000 == 0o120000) {
                        return Err(F::new(component_id, S::Extract, E::Extract));
                    }
                    let mut out = OpenOptions::new()
                        .create_new(true)
                        .write(true)
                        .open(stage.join(&entry.name))
                        .map_err(|e| F::io_operation(component_id, S::Extract, O::FileCreate, e))?;
                    copy_cancelled(&mut item, &mut out, control, component_id)?;
                    out.sync_all()
                        .map_err(|e| F::io_operation(component_id, S::Extract, O::FileSync, e))?;
                }
            }
            // Keep the pinned artifact for an explicit retry if a later component or publish fails.
        }
        #[cfg(target_os = "macos")]
        for component in &manifest.components {
            for file in &component.files {
                fs::set_permissions(stage.join(&file.name), fs::Permissions::from_mode(0o555))
                    .map_err(|e| F::io(C::from_name(&component.name), S::Extract, e))?;
            }
        }
        let mut verified = VerifiedRuntime::default();
        verify_bundles(stage, &manifest, S::Verify, &mut verified)?;
        self.probe(
            stage,
            &manifest,
            requirements,
            control,
            observer,
            &mut state,
            &mut observed,
        )?;
        if control.is_cancelled() {
            return Err(fail(S::Publish, E::Cancelled));
        }
        for component in &manifest.components {
            for file in &component.files {
                verified.file(
                    &target.join(&file.name),
                    &file.sha256,
                    C::from_name(&component.name),
                    S::Verify,
                )?;
            }
        }
        state.observe(P::Verifying, None, S::Publish, 0, None, None);
        observed(state.clone());
        if control.is_cancelled() { return Err(fail(S::Publish, E::Cancelled)); }
        let mut marker = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(stage.join("complete.pending"))
            .map_err(|e| F::io_operation(C::Runtime, S::Publish, O::MarkerCreate, e))?;
        marker
            .write_all(&marker_content)
            .map_err(|e| F::io_operation(C::Runtime, S::Publish, O::MarkerWrite, e))?;
        marker
            .sync_all()
            .map_err(|e| F::io_operation(C::Runtime, S::Publish, O::MarkerSync, e))?;
        drop(marker);
        if control.is_cancelled() { return Err(fail(S::Publish, E::Cancelled)); }
        super::output::move_no_replace(&stage.join("complete.pending"), &stage.join("complete.json"))
            .map_err(|e| F::io_operation(C::Runtime, S::Publish, O::MarkerPublish, e))?;
        verified.marker(&target, &digest, marker_content.len() as u64)?;
        let lease = runtime_lease(
            target,
            requirement_id,
            digest,
            marker_content.len() as u64,
            &manifest,
            verified,
        );
        lease.validate_identity().map_err(|_| fail(S::Verify, E::Hash))?;
        *cache = Arc::downgrade(&lease);
        Ok(lease)
    }
    fn acquire_component(
        &self,
        component: &Component,
        archive: &Path,
        control: &Control,
        progress: impl FnMut(u64, Option<u64>),
    ) -> Result<(), network::AcquisitionError> {
        if let Some(candidate) = &self.candidate {
            if component.name == candidate.component {
                if control.is_cancelled() {
                    return Err(super::preparation::ErrorCategory::Cancelled.into());
                }
                fs::copy(&candidate.artifact, archive).map_err(|e| {
                    network::AcquisitionError { category: super::preparation::ErrorCategory::io(&e),
                        http_status: None, operation: super::preparation::PreparationOperation::FileCopy, raw_os_error: e.raw_os_error() }
                })?;
                return Ok(());
            }
            if !candidate.allow_acquisition {
                return Err(super::preparation::ErrorCategory::Hash.into());
            }
        }
        #[cfg(test)]
        if let Some(acquire) = self.test_acquirer.lock().unwrap().clone() {
            return acquire(archive, component.bytes);
        }
        network::acquire_observed(
            &component.url,
            archive,
            component.bytes,
            control.cancellation_flag(),
            |_, _| {},
            progress,
        )
    }
    #[allow(clippy::too_many_arguments)]
    fn probe(
        &self,
        path: &Path,
        manifest: &Manifest,
        requirements: &TrustedRuntimeRequirements,
        control: &Control,
        observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>,
        state: &mut super::preparation::PreparationSnapshot,
        observed: &mut impl FnMut(super::preparation::PreparationSnapshot),
    ) -> Result<(), super::preparation::PreparationFailure> {
        use super::preparation::{
            ErrorCategory as E, PreparationFailure as F, PreparationPhase as P,
            PreparationStage as S, RuntimeComponent as C,
        };
        for component in &manifest.components {
            let component_id = C::from_name(&component.name);
            state.observe(P::Verifying, Some(component_id), S::Probe, 0, None, None);
            observed(state.clone());
            for file in &component.files {
                if control.is_cancelled() {
                    return Err(F::new(component_id, S::Probe, E::Cancelled));
                }
                let executable = path.join(&file.name);
                let _guard = typed_check_file(&executable, &file.sha256, component_id, S::Verify)?;
                let args = requirements.probes.get(&file.name)
                    .ok_or_else(|| F::new(component_id, S::Probe, E::Probe))?.clone();
                #[cfg(target_os = "macos")]
                let (executable, args) = if file.name == "yt-dlp" {
                    python_zipapp(path.join(PYTHON_TOOL), &executable, args)
                        .map_err(|_| F::new(component_id, S::Probe, E::Probe))?
                } else { (executable, args) };
                let probe = tempfile::Builder::new()
                    .prefix("probe-")
                    .tempdir_in(&self.root)
                    .map_err(|e| F::io(component_id, S::Probe, e))?;
                let outcome = process_supervisor::run(
                    ProcessSpec {
                        executable,
                        args,
                        cwd: probe.path().into(),
                        env: requirements
                            .environment(probe.path())
                            .map_err(|_| F::new(component_id, S::Probe, E::Storage))?,
                        stdout_limit: 64 * 1024,
                        stderr_limit: 64 * 1024,
                        timeout: Some(Duration::from_secs(20)),
                    },
                    control,
                    observer.clone(),
                )
                // The supervisor exposes an opaque error here: retain the verified probe
                // stage without guessing a timeout or network cause from its prose.
                .map_err(|_| F::new(component_id, S::Probe, E::Probe))?;
                if control.is_cancelled() {
                    return Err(F::new(component_id, S::Probe, E::Cancelled));
                }
                if outcome.exit_code != 0
                    || outcome.facts.stdout_truncated
                    || outcome.facts.stderr_truncated
                    || !outcome.facts.resources_releasable()
                    || !probe_matches(
                        self.candidate
                            .as_ref()
                            .is_some_and(|candidate| file.name == candidate.exact_probe_file),
                        &file.version_contains,
                        &outcome.stdout,
                        &outcome.stderr,
                    )
                {
                    return Err(F::new(component_id, S::Probe, E::Probe));
                }
            }
        }
        Ok(())
    }
}
fn probe_matches(exact: bool, expected: &str, stdout: &[u8], stderr: &[u8]) -> bool {
    if exact {
        std::str::from_utf8(stdout).is_ok_and(|s| s.trim() == expected) && stderr.is_empty()
    } else {
        format!(
            "{}{}",
            String::from_utf8_lossy(stdout),
            String::from_utf8_lossy(stderr)
        )
        .contains(expected)
    }
}
fn verify_bundles(
    directory: &Path,
    manifest: &Manifest,
    stage: super::preparation::PreparationStage,
    verified: &mut VerifiedRuntime,
) -> Result<(), super::preparation::PreparationFailure> {
    #[cfg(target_os = "macos")]
    if manifest.components.iter().any(|component| component.name == "python") {
        verified.identities.extend(super::macos_gallery::verified_python(directory).map_err(|_| super::preparation::PreparationFailure::new(
            super::preparation::RuntimeComponent::Runtime, stage, super::preparation::ErrorCategory::Hash))?);
    }
    #[cfg(target_os = "macos")]
    if manifest.components.iter().any(|component| component.name == "gallery-dl") {
        let directories = super::macos_gallery::verify_gallery_dependencies(directory, |path, expected| {
            verified.file(path, expected, super::preparation::RuntimeComponent::GalleryDl, stage).map_err(|error| error.to_string())
        }).map_err(|_| super::preparation::PreparationFailure::new(
            super::preparation::RuntimeComponent::GalleryDl, stage, super::preparation::ErrorCategory::Hash))?;
        verified.identities.extend(directories);
    }
    let _ = (directory, manifest, stage, verified);
    Ok(())
}

fn checked_artifact(path: &Path, component: &Component) -> Result<File, super::preparation::PreparationFailure> {
    use super::preparation::{ErrorCategory as E, PreparationFailure as F, PreparationOperation as O, PreparationStage as S, RuntimeComponent as C};
    let component_id = C::from_name(&component.name);
    let metadata = fs::symlink_metadata(path)
        .map_err(|e| F::io_operation(component_id, S::Verify, O::FileOpen, e))?;
    if !super::is_plain_file(&metadata) || metadata.len() != component.bytes {
        let mut failure = F::new(component_id, S::Verify, E::Size);
        failure.operation = Some(O::ArtifactLength);
        return Err(failure);
    }
    typed_check_file(path, &component.sha256, component_id, S::Verify)
}

fn copy_cancelled(
    input: &mut impl Read, out: &mut File, control: &Control,
    component: super::preparation::RuntimeComponent,
) -> Result<(), super::preparation::PreparationFailure> {
    use super::preparation::{ErrorCategory as E, PreparationFailure as F, PreparationOperation as O, PreparationStage as S};
    let mut buffer = [0u8; 65536];
    loop {
        if control.is_cancelled() { return Err(F::new(component, S::Extract, E::Cancelled)); }
        let n = input.read(&mut buffer).map_err(|e| F::io_operation(component, S::Extract, O::FileRead, e))?;
        if n == 0 { break; }
        out.write_all(&buffer[..n]).map_err(|e| F::io_operation(component, S::Extract, O::FileWrite, e))?;
    }
    Ok(())
}

fn copy_new(input: &mut File, target: &Path, control: &Control, component: super::preparation::RuntimeComponent)
    -> Result<(), super::preparation::PreparationFailure> {
    use super::preparation::{PreparationFailure as F, PreparationOperation as O, PreparationStage as S};
    input.seek(SeekFrom::Start(0)).map_err(|e| F::io_operation(component, S::Extract, O::FileRead, e))?;
    let mut out = OpenOptions::new().write(true).create_new(true).open(target)
        .map_err(|e| F::io_operation(component, S::Extract, O::FileCreate, e))?;
    copy_cancelled(input, &mut out, control, component)?;
    out.sync_all().map_err(|e| F::io_operation(component, S::Extract, O::FileSync, e))
}

fn runtime_lease(
    target: PathBuf,
    requirement_id: String,
    digest: String,
    marker_bytes: u64,
    manifest: &Manifest,
    verified: VerifiedRuntime,
) -> Arc<RuntimeLease> {
    Arc::new(RuntimeLease {
        directory: target.clone(),
        requirement_id,
        marker_bytes,
        files: manifest
            .components
            .iter()
            .flat_map(|c| {
                c.files
                    .iter()
                    .map(|f| (f.name.clone(), target.join(&f.name)))
            })
            .collect(),
        #[cfg(target_os = "macos")]
        identities: verified.identities,
        versions: manifest
            .components
            .iter()
            .map(|c| (c.name.clone(), c.version.clone()))
            .collect(),
        digest,
        _guards: verified.guards,
    })
}
pub(crate) fn typed_safe_existing_dir(
    path: &Path,
) -> Result<(), super::preparation::PreparationFailure> {
    use super::preparation::{
        ErrorCategory as E, PreparationFailure as F, PreparationOperation as O, PreparationStage as S, RuntimeComponent as C,
    };
    let metadata = fs::symlink_metadata(path).map_err(|e| F::io_operation(C::Runtime, S::Cache, O::CandidateInspect, e))?;
    if is_link(&metadata) || !metadata.is_dir() {
        return Err(F::new(C::Runtime, S::Cache, E::Storage));
    }
    #[cfg(target_os = "macos")]
    let checked = path.canonicalize().map_err(|e| F::io_operation(C::Runtime, S::Cache, O::CandidateInspect, e))?;
    #[cfg(not(target_os = "macos"))]
    let checked = path.to_path_buf();
    for ancestor in checked.ancestors() {
        let metadata =
            fs::symlink_metadata(ancestor).map_err(|e| F::io_operation(C::Runtime, S::Cache, O::CandidateInspect, e))?;
        if is_link(&metadata) || !metadata.is_dir() {
            return Err(F::new(C::Runtime, S::Cache, E::Storage));
        }
    }
    Ok(())
}
fn typed_safe_dir(
    path: &Path,
    component: super::preparation::RuntimeComponent,
    stage: super::preparation::PreparationStage,
) -> Result<(), super::preparation::PreparationFailure> {
    if let Some(existing) = path.ancestors().find(|ancestor| ancestor.exists()) {
        typed_safe_existing_dir(existing)?;
    }
    fs::create_dir_all(path)
        .map_err(|e| super::preparation::PreparationFailure::io_operation(component, stage, super::preparation::PreparationOperation::RootCreate, e))?;
    typed_safe_existing_dir(path)
}
fn typed_check_file(
    path: &Path,
    expected: &str,
    component: super::preparation::RuntimeComponent,
    stage: super::preparation::PreparationStage,
) -> Result<File, super::preparation::PreparationFailure> {
    use super::preparation::{ErrorCategory as E, PreparationFailure as F, PreparationOperation as O};
    let metadata = fs::symlink_metadata(path).map_err(|e| F::io_operation(component, stage, O::FileOpen, e))?;
    if !super::is_plain_file(&metadata) {
        return Err(F::new(component, stage, E::Hash));
    }
    let mut file = open_identity_file(path)
        .map_err(|e| F::io_operation(component, stage, O::FileOpen, e))?;
    #[cfg(test)]
    FILE_HASHES.with(|count| count.set(count.get() + 1));
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let n = file
            .read(&mut buffer)
            .map_err(|e| F::io_operation(component, stage, O::FileRead, e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    if format!("{:X}", hasher.finalize()) != expected {
        return Err(F::new(component, stage, E::Hash));
    }
    Ok(file)
}
fn typed_marker_guard(
    path: &Path,
    digest: &str,
    bytes: u64,
) -> Result<File, super::preparation::PreparationFailure> {
    use super::preparation::{
        ErrorCategory as E, PreparationFailure as F, PreparationOperation as O, PreparationStage as S, RuntimeComponent as C,
    };
    let marker = path.join("complete.json");
    let file = typed_check_file(&marker, digest, C::Runtime, S::Cache).map_err(|mut failure| {
        failure.operation = Some(O::MarkerCheck); failure
    })?;
    if file
        .metadata()
        .map_err(|e| F::io_operation(C::Runtime, S::Cache, O::MarkerCheck, e))?
        .len()
        != bytes
    {
        return Err(F::new(C::Runtime, S::Cache, E::Hash));
    }
    Ok(file)
}

#[cfg(all(test, windows))]
#[path = "../../tests/support/windows_process_fixture.rs"]
mod runtime_fixture;
#[cfg(test)]
mod requirement_tests {
    #[cfg(windows)]
    use super::runtime_fixture as fixture;
    use super::*;
    #[test]
    fn candidate_probe_requires_exact_version() {
        assert!(probe_matches(true, "2026.03.17", b"2026.03.17\r\n", b""));
        assert!(!probe_matches(true, "2026.03.17", b"2026.03.17.1\n", b""));
        assert!(!probe_matches(
            true,
            "2026.03.17",
            b"2026.03.17\n",
            b"warning"
        ));
        assert!(probe_matches(false, "2.9.7", b"deno 2.9.7\n", b""));
    }
    #[test]
    fn candidate_catalog_has_distinct_cache_identity_from_embedded_catalog() {
        let baseline = hash(MANIFEST.as_bytes()).unwrap();
        let mut candidate = manifest().unwrap();
        let yt = candidate
            .components
            .iter_mut()
            .find(|c| c.name == "yt-dlp")
            .unwrap();
        yt.version = "2099.01.01".into();
        yt.files[0].version_contains = yt.version.clone();
        let candidate_digest = hash(serde_json::to_vec(&candidate).unwrap().as_slice()).unwrap();
        assert_ne!(baseline, candidate_digest);
    }
    #[cfg(windows)]
    fn fixture_catalog(root: &Path) -> (Manifest, TrustedRuntimeRequirements, PathBuf) {
        let executable = fixture::fixture();
        let file_hash = hash(File::open(&executable).unwrap()).unwrap();
        let catalog = Manifest {
            schema: 1,
            platform: "windows-x64".into(),
            components: vec![Component {
                name: "ffmpeg".into(),
                version: "fixture".into(),
                url: "https://invalid.example/never-request".into(),
                bytes: fs::metadata(&executable).unwrap().len(),
                sha256: file_hash.clone(),
                license: "fixture".into(),
                source: "fixture".into(),
                files: vec![RuntimeFile {
                    archive_path: None,
                    name: "ffprobe.exe".into(),
                    sha256: file_hash,
                    probe: "echo".into(),
                    version_contains: "fixture-ready".into(),
                }],
            }],
        };
        let marker = root.join("probe-marker.txt").display().to_string();
        let requirements = TrustedRuntimeRequirements::compiled(
            &[("ffprobe.exe", &["echo", &marker, "fixture-ready"])],
            &[],
        );
        (catalog, requirements, executable)
    }
    #[test]
    #[cfg(windows)]
    fn candidate_resume_missing_dependency_fails_without_acquisition_or_download_status() {
        use super::super::preparation::{ErrorCategory, PreparationPhase};
        let root = tempfile::tempdir().unwrap();
        let (catalog, requirements, executable) = fixture_catalog(root.path());
        let manager = RuntimeManager::candidate(root.path().into(), catalog, executable, "selected-engine", "selected.exe", false);
        *manager.test_acquirer.lock().unwrap() = Some(Arc::new(|_, _| panic!("offline recovery must not acquire dependencies")));
        let mut events = Vec::new();
        let failure = manager.prepare_observed(&requirements, &Control::default(), Arc::new(|_| {}), |s| events.push(s)).err().unwrap();
        assert_eq!(failure.category, ErrorCategory::Hash);
        assert!(events.iter().all(|s| s.phase != PreparationPhase::Downloading));
    }
    #[test]
    #[cfg(windows)]
    fn r12_verified_cache_works_with_failing_acquisition_and_keeps_native_leases() {
        use super::super::preparation::{ErrorCategory as E, PreparationPhase};
        let root = tempfile::tempdir().unwrap();
        let (catalog, requirements, executable) = fixture_catalog(root.path());
        let content = serde_json::to_vec(&catalog).unwrap();
        let digest = hash(content.as_slice()).unwrap();
        let target = root.path().join(format!("runtime-{digest}"));
        fs::create_dir(&target).unwrap();
        fs::copy(executable, target.join("ffprobe.exe")).unwrap();
        fs::write(target.join("complete.json"), content).unwrap();
        let manager = RuntimeManager::new(root.path().into());
        *manager.test_catalog.lock().unwrap() = Some(catalog);
        *manager.test_acquirer.lock().unwrap() = Some(Arc::new(|_, _| Err(E::Connect.into())));
        let mut events = Vec::new();
        let lease = manager
            .prepare_observed(
                &requirements,
                &Control::default(),
                Arc::new(|_| {}),
                |event| events.push(event),
            )
            .unwrap();
        assert_eq!(lease.directory, target);
        assert!(
            events
                .iter()
                .all(|event| event.phase != PreparationPhase::Downloading)
        );
        assert!(
            OpenOptions::new()
                .write(true)
                .open(lease.file("ffprobe.exe").unwrap())
                .is_err()
        );
        let live = manager
            .prepare_observed(&requirements, &Control::default(), Arc::new(|_| {}), |_| {})
            .unwrap();
        assert!(Arc::ptr_eq(&lease, &live));
        drop(live);
        drop(lease);
        // A fresh manager still authenticates the complete cache with the failing provider.
        assert!(
            manager
                .prepare_observed(&requirements, &Control::default(), Arc::new(|_| {}), |_| {})
                .is_ok()
        );
    }
    #[test]
    #[cfg(windows)]
    fn catalog_extension_reuses_hash_verified_components_before_acquisition() {
        let root = tempfile::tempdir().unwrap();
        let (catalog, requirements, executable) = fixture_catalog(root.path());
        let previous = root.path().join("runtime-previous-catalog");
        fs::create_dir(&previous).unwrap();
        fs::copy(executable, previous.join("ffprobe.exe")).unwrap();
        let manager = RuntimeManager::new(root.path().into());
        *manager.test_catalog.lock().unwrap() = Some(catalog);
        *manager.test_acquirer.lock().unwrap() = Some(Arc::new(|_, _| panic!("unchanged verified components must be reused")));
        let lease = manager.prepare_observed(&requirements, &Control::default(), Arc::new(|_| {}), |_| {}).unwrap();
        assert_ne!(lease.directory, previous);
        assert!(lease.file("ffprobe.exe").unwrap().is_file());
        assert!(previous.join("ffprobe.exe").is_file());
    }
    #[test]
    #[cfg(windows)]
    fn r12_corrupt_cache_is_preserved_and_recovered_into_a_verified_immutable_sibling() {
        use super::super::preparation::{ErrorCategory as E, PreparationStage as S};
        let root = tempfile::tempdir().unwrap();
        let (catalog, requirements, executable) = fixture_catalog(root.path());
        let content = serde_json::to_vec(&catalog).unwrap();
        let digest = hash(content.as_slice()).unwrap();
        let target = root.path().join(format!("runtime-{digest}"));
        fs::create_dir(&target).unwrap();
        fs::write(target.join("complete.json"), b"corrupt-original-evidence").unwrap();
        let manager = RuntimeManager::new(root.path().into());
        *manager.test_catalog.lock().unwrap() = Some(catalog);
        *manager.test_acquirer.lock().unwrap() = Some(Arc::new(|_, _| Err(E::Connect.into())));
        let failure = manager
            .prepare_observed(&requirements, &Control::default(), Arc::new(|_| {}), |_| {})
            .err()
            .unwrap();
        assert_eq!((failure.stage, failure.category), (S::Acquire, E::Connect));
        assert_eq!(
            fs::read(target.join("complete.json")).unwrap(),
            b"corrupt-original-evidence"
        );
        *manager.test_acquirer.lock().unwrap() = Some(Arc::new(move |path, bytes| {
            fs::copy(&executable, path).unwrap();
            assert_eq!(fs::metadata(path).unwrap().len(), bytes);
            Ok(())
        }));
        let lease = manager
            .prepare_observed(&requirements, &Control::default(), Arc::new(|_| {}), |_| {})
            .unwrap();
        assert_ne!(lease.directory, target);
        assert_eq!(
            fs::read(target.join("complete.json")).unwrap(),
            b"corrupt-original-evidence"
        );
        assert!(
            OpenOptions::new()
                .write(true)
                .open(lease.file("ffprobe.exe").unwrap())
                .is_err()
        );
        drop(lease);
        *manager.test_acquirer.lock().unwrap() = Some(Arc::new(|_, _| Err(E::Connect.into())));
        assert!(
            manager
                .prepare_observed(&requirements, &Control::default(), Arc::new(|_| {}), |_| {})
                .is_ok()
        );
    }
    #[test]
    #[cfg(windows)]
    fn publish_marker_keeps_open_tool_identity_and_failed_publish_reuses_files() {
        use super::super::preparation::{PreparationOperation as O, PreparationStage as S};
        use std::sync::atomic::{AtomicUsize, Ordering};
        let root = tempfile::tempdir().unwrap();
        let (catalog, requirements, executable) = fixture_catalog(root.path());
        let manager = RuntimeManager::new(root.path().into());
        *manager.test_catalog.lock().unwrap() = Some(catalog);
        let acquired = Arc::new(AtomicUsize::new(0));
        let calls = acquired.clone();
        *manager.test_acquirer.lock().unwrap() = Some(Arc::new(move |path, _| {
            calls.fetch_add(1, Ordering::SeqCst); fs::copy(&executable, path).unwrap(); Ok(())
        }));
        let mut blocked = PathBuf::new();
        let failure = manager.prepare_observed(&requirements, &Control::default(), Arc::new(|_| {}), |event| {
            if event.stage == S::Publish {
                blocked = fs::read_dir(root.path()).unwrap().filter_map(Result::ok)
                    .find(|entry| entry.file_name().to_string_lossy().contains("-recovered-")).unwrap().path();
                fs::write(blocked.join("complete.json"), b"existing-marker-do-not-overwrite").unwrap();
            }
        }).err().unwrap();
        assert_eq!(failure.operation, Some(O::MarkerPublish));
        assert!(failure.raw_os_error.is_some());
        assert_eq!(fs::read(blocked.join("complete.json")).unwrap(), b"existing-marker-do-not-overwrite");
        assert!(blocked.join("ffmpeg.artifact").is_file());
        let mut open_tool = None;
        let mut publishing = PathBuf::new();
        let lease = manager.prepare_observed(&requirements, &Control::default(), Arc::new(|_| {}), |event| {
            if event.stage == S::Publish {
                publishing = fs::read_dir(root.path()).unwrap().filter_map(Result::ok)
                    .find(|entry| entry.path() != blocked && entry.file_name().to_string_lossy().contains("-recovered-")).unwrap().path();
                open_tool = Some(open_identity_file(&publishing.join("ffprobe.exe")).unwrap());
                // This deliberately reproduces the old directory Move failure, without changing ACLs.
                assert!(super::super::output::move_no_replace(&publishing, &root.path().join("must-not-move")).is_err());
            }
        }).unwrap();
        assert_eq!(lease.directory, publishing);
        assert!(open_tool.is_some());
        assert_eq!(acquired.load(Ordering::SeqCst), 1);
        assert!(fs::write(lease.file("ffprobe.exe").unwrap(), b"tamper").is_err());
    }
    #[test]
    #[cfg(windows)]
    fn cancellation_before_marker_preserves_trusted_inputs_and_never_completes() {
        use super::super::preparation::{ErrorCategory as E, PreparationStage as S};
        let root = tempfile::tempdir().unwrap();
        let (catalog, requirements, executable) = fixture_catalog(root.path());
        let manager = RuntimeManager::new(root.path().into());
        *manager.test_catalog.lock().unwrap() = Some(catalog);
        *manager.test_acquirer.lock().unwrap() = Some(Arc::new(move |path, _| { fs::copy(&executable, path).unwrap(); Ok(()) }));
        let control = Control::default();
        let failure = manager.prepare_observed(&requirements, &control, Arc::new(|_| {}), |event| {
            if event.stage == S::Publish { control.cancel(); }
        }).err().unwrap();
        assert_eq!(failure.category, E::Cancelled);
        let target = fs::read_dir(root.path()).unwrap().filter_map(Result::ok)
            .find(|entry| entry.file_name().to_string_lossy().contains("-recovered-")).unwrap().path();
        assert!(!target.join("complete.json").exists());
        assert!(target.join("ffprobe.exe").is_file());
        *manager.test_acquirer.lock().unwrap() = Some(Arc::new(|_, _| panic!("retry must reuse trusted inputs")));
        assert!(manager.prepare_observed(&requirements, &Control::default(), Arc::new(|_| {}), |_| {}).is_ok());
    }
    #[test]
    #[cfg(windows)]
    fn shared_archive_reuses_trusted_file_and_only_extracts_missing_member() {
        use zip::{write::SimpleFileOptions, ZipWriter};
        use super::super::preparation::ErrorCategory as E;
        let root = tempfile::tempdir().unwrap();
        let (mut catalog, _, executable) = fixture_catalog(root.path());
        let bytes = fs::read(&executable).unwrap();
        let mut zip = ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for name in ["ffmpeg.exe", "ffprobe.exe"] {
            zip.start_file(name, SimpleFileOptions::default()).unwrap();
            zip.write_all(&bytes).unwrap();
        }
        let archive = zip.finish().unwrap().into_inner();
        let component = &mut catalog.components[0];
        let mut ffmpeg = component.files[0].clone(); ffmpeg.name = "ffmpeg.exe".into();
        component.files.push(ffmpeg);
        for file in &mut component.files { file.archive_path = Some(file.name.clone()); }
        component.bytes = archive.len() as u64; component.sha256 = hash(archive.as_slice()).unwrap();
        let marker = root.path().join("probed").display().to_string();
        let requirements = TrustedRuntimeRequirements::compiled(
            &[("ffmpeg.exe", &["echo", &marker, "fixture-ready"]), ("ffprobe.exe", &["echo", &marker, "fixture-ready"])], &[]);
        let previous = root.path().join("runtime-incomplete"); fs::create_dir(&previous).unwrap();
        fs::copy(&executable, previous.join("ffmpeg.exe")).unwrap();
        fs::write(previous.join("ffmpeg.artifact"), b"bad-package").unwrap();
        assert_eq!(checked_artifact(&previous.join("ffmpeg.artifact"), component).err().unwrap().category, E::Size);
        fs::write(previous.join("ffmpeg.artifact"), vec![0; archive.len()]).unwrap();
        assert_eq!(checked_artifact(&previous.join("ffmpeg.artifact"), component).err().unwrap().category, E::Hash);
        let manager = RuntimeManager::new(root.path().into());
        *manager.test_catalog.lock().unwrap() = Some(catalog.clone());
        let bad_package = vec![0; archive.len()];
        *manager.test_acquirer.lock().unwrap() = Some(Arc::new(move |path, _| { fs::write(path, &bad_package).unwrap(); Ok(()) }));
        let failure = manager.prepare_observed(&requirements, &Control::default(), Arc::new(|_| {}), |_| {}).err().unwrap();
        assert_eq!(failure.category, E::Hash);
        for entry in fs::read_dir(root.path()).unwrap().filter_map(Result::ok) {
            assert!(!entry.path().join("ffprobe.exe").exists());
            assert!(!entry.path().join("complete.json").exists());
        }
        fs::write(previous.join("ffmpeg.artifact"), archive).unwrap();
        *manager.test_catalog.lock().unwrap() = Some(catalog);
        *manager.test_acquirer.lock().unwrap() = Some(Arc::new(|_, _| panic!("trusted artifact must avoid acquisition")));
        let lease = manager.prepare_observed(&requirements, &Control::default(), Arc::new(|_| {}), |_| {}).unwrap();
        assert_ne!(lease.directory, previous);
        for name in ["ffmpeg.exe", "ffprobe.exe"] { assert!(lease.file(name).unwrap().is_file()); }
        assert!(previous.join("ffmpeg.exe").is_file());
        assert!(!previous.join("ffprobe.exe").exists());
    }
    #[test]
    #[cfg(windows)]
    fn failed_component_keeps_prior_component_and_retry_only_acquires_missing() {
        use super::super::preparation::ErrorCategory as E;
        use std::sync::atomic::{AtomicUsize, Ordering};
        let root = tempfile::tempdir().unwrap();
        let (mut catalog, _, executable) = fixture_catalog(root.path());
        let mut deno = catalog.components[0].clone(); deno.name = "deno".into(); deno.files[0].name = "deno.exe".into();
        catalog.components.push(deno);
        let marker = root.path().join("probed").display().to_string();
        let requirements = TrustedRuntimeRequirements::compiled(
            &[("ffprobe.exe", &["echo", &marker, "fixture-ready"]), ("deno.exe", &["echo", &marker, "fixture-ready"])], &[]);
        let manager = RuntimeManager::new(root.path().into());
        *manager.test_catalog.lock().unwrap() = Some(catalog);
        let counts = Arc::new((AtomicUsize::new(0), AtomicUsize::new(0))); let calls = counts.clone();
        *manager.test_acquirer.lock().unwrap() = Some(Arc::new(move |path, _| {
            if path.file_stem().unwrap() == "deno" {
                if calls.1.fetch_add(1, Ordering::SeqCst) == 0 { return Err(E::Connect.into()); }
            } else { calls.0.fetch_add(1, Ordering::SeqCst); }
            fs::copy(&executable, path).unwrap(); Ok(())
        }));
        assert_eq!(manager.prepare_observed(&requirements, &Control::default(), Arc::new(|_| {}), |_| {}).err().unwrap().category, E::Connect);
        assert!(manager.prepare_observed(&requirements, &Control::default(), Arc::new(|_| {}), |_| {}).is_ok());
        assert_eq!(counts.0.load(Ordering::SeqCst), 1);
        assert_eq!(counts.1.load(Ordering::SeqCst), 2);
    }
    #[test]
    #[cfg(windows)]
    fn retained_candidate_bound_stops_new_acquisition_and_preserves_root_source() {
        use super::super::preparation::{ErrorCategory as E, PreparationOperation as O, RuntimeRootSource};
        let root = tempfile::tempdir().unwrap();
        let (catalog, requirements, _) = fixture_catalog(root.path());
        for index in 0..128 { fs::write(root.path().join(format!("evidence-{index}")), b"preserve").unwrap(); }
        let manager = RuntimeManager::new(root.path().into()).with_root_source(RuntimeRootSource::ExplicitRuntimeRoot);
        *manager.test_catalog.lock().unwrap() = Some(catalog);
        *manager.test_acquirer.lock().unwrap() = Some(Arc::new(|_, _| panic!("candidate cap must precede acquisition")));
        let mut source = RuntimeRootSource::Unknown;
        let error = manager.prepare_observed(&requirements, &Control::default(), Arc::new(|_| {}), |state| source = state.root_source).err().unwrap();
        assert_eq!(error.category, E::Storage); assert_eq!(error.operation, Some(O::CandidateLimit));
        assert!(error.safe().message.contains("candidate limit"));
        assert!(!error.safe().suggestion.contains("free space"));
        assert_eq!(source, RuntimeRootSource::ExplicitRuntimeRoot);
        assert!(fs::read_dir(root.path()).unwrap().all(|entry| !entry.unwrap().file_name().to_string_lossy().contains("-recovered-")));
    }
    #[test]
    #[cfg(windows)]
    #[ignore = "requires an existing pinned cache via AMEOW_RUNTIME_TEST_ROOT; never acquires assets"]
    fn genuine_pinned_cache_authenticates_without_probes_and_same_process_reuses_lease() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let root = PathBuf::from(std::env::var_os("AMEOW_RUNTIME_TEST_ROOT").expect("existing cache root"));
        let manager = RuntimeManager::new(root).with_root_source(super::super::preparation::RuntimeRootSource::ExplicitRuntimeRoot);
        *manager.test_acquirer.lock().unwrap() = Some(Arc::new(|_, _| panic!("real-cache check must never acquire")));
        let settled = Arc::new(AtomicUsize::new(0)); let received = settled.clone();
        let observer = Arc::new(move |event| if let ProcessObservation::Settled(facts) = event {
            assert!(facts.resources_releasable()); received.fetch_add(1, Ordering::SeqCst);
        });
        let started = std::time::Instant::now();
        let requirements = super::super::composition::requirements();
        let lease = manager.prepare_observed(&requirements, &Control::default(), observer.clone(), |state| {
            assert_ne!(state.phase, super::super::preparation::PreparationPhase::Downloading);
        }).unwrap();
        assert_eq!(settled.load(Ordering::SeqCst), 0);
        let reused = manager.prepare_observed(&requirements, &Control::default(), observer, |_| {}).unwrap();
        assert!(Arc::ptr_eq(&lease, &reused));
        assert_eq!(settled.load(Ordering::SeqCst), 0);
        println!("{}", serde_json::json!({"pid":std::process::id(),"settled_probes":0,"acquired":0,
            "lease_reused":true,"files":lease.files.len(),"versions":lease.versions,"elapsed_ms":started.elapsed().as_millis()}));
    }
    #[test]
    fn full_catalog_keeps_exact_marker_and_subset_contains_only_declared_tools() {
        let full = crate::download::composition::requirements();
        assert_eq!(full.selected_manifest().unwrap().1, MANIFEST.as_bytes());
        let subset = TrustedRuntimeRequirements::compiled(&[("ffprobe.exe", &["-version"])], &[]);
        subset.validate().unwrap();
        let (selected, bytes) = subset.selected_manifest().unwrap();
        assert_ne!(
            hash(bytes.as_slice()).unwrap(),
            hash(MANIFEST.as_bytes()).unwrap()
        );
        assert_eq!(
            selected
                .components
                .iter()
                .flat_map(|c| &c.files)
                .map(|f| f.name.as_str())
                .collect::<Vec<_>>(),
            vec![native_tool_name("ffprobe.exe")]
        );
        assert_eq!(
            subset.versions(),
            selected
                .components
                .iter()
                .map(|c| (c.name.clone(), c.version.clone()))
                .collect::<Vec<_>>()
        );
        let untrusted = TrustedRuntimeRequirements::compiled(&[("untrusted.exe", &[])], &[]);
        assert!(untrusted.validate().is_err());
    }
    #[test]
    fn trusted_extensions_preserve_base_isolation_and_owned_directories() {
        let root = tempfile::tempdir().unwrap();
        let requirements = TrustedRuntimeRequirements::compiled(
            &[("ffprobe.exe", &["-version"])],
            &[
                ("ADAPTER_CACHE", "adapter-cache", true),
                ("ADAPTER_FLAG", "1", false),
            ],
        );
        let env = requirements.environment(root.path()).unwrap();
        assert!(
            env.iter()
                .any(|(key, value)| key == "PATH" && value.is_empty())
        );
        assert!(env.iter().any(|(key, value)| key == "ADAPTER_CACHE"
            && value == &root.path().join("adapter-cache").display().to_string()));
        assert!(root.path().join("adapter-cache").is_dir());
        for additions in [
            vec![("PATH", "unsafe", false)],
            vec![("ADAPTER_CACHE", "../escape", true)],
            vec![("ADAPTER_FLAG", "1", false), ("ADAPTER_FLAG", "2", false)],
        ] {
            assert!(
                TrustedRuntimeRequirements::compiled(&[("ffprobe.exe", &["-version"])], &additions)
                    .environment(root.path())
                    .is_err()
            );
        }
    }
}
