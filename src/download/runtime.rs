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
pub(crate) fn safe_dir(path: &Path) -> Result<(), String> {
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
    for dir in ["home", "temp", "appdata", "localappdata"] {
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
        Self {
            probes: probes
                .iter()
                .map(|(name, args)| ((*name).into(), args.iter().map(|s| (*s).into()).collect()))
                .collect(),
            additions: additions
                .iter()
                .map(|(key, value, dir)| ((*key).into(), (*value).into(), *dir))
                .collect(),
            empty: false,
        }
    }
    #[cfg(test)]
    pub(crate) fn empty() -> Self {
        Self {
            probes: BTreeMap::new(),
            additions: Vec::new(),
            empty: true,
        }
    }
    pub fn contains(&self, file: &str) -> bool {
        self.probes.contains_key(file)
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

pub struct RuntimeLease {
    pub directory: PathBuf,
    requirement_id: String,
    marker_bytes: u64,
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
            cache: Mutex::new(Weak::new()),
            candidate: None,
            #[cfg(test)]
            test_catalog: Mutex::new(None),
            #[cfg(test)]
            test_acquirer: Mutex::new(None),
        }
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
        Ok(PathBuf::from(
            std::env::var("LOCALAPPDATA").map_err(|e| format!("Managed local data path: {e}"))?,
        )
        // Preserve the existing user settings and runtime cache location.
        .join("AmeowNext/stage-a"))
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
            PreparationSnapshot, PreparationStage as S, RuntimeComponent as C,
        };
        let fail = |stage, category| F::new(C::Runtime, stage, category);
        requirements
            .validate()
            .map_err(|_| fail(S::Cache, E::Unknown))?;
        if control.is_cancelled() {
            return Err(fail(S::Cache, E::Cancelled));
        }
        let requirement_id = requirements
            .identity()
            .map_err(|_| fail(S::Cache, E::Unknown))?;
        let mut state = PreparationSnapshot::default();
        state.observe(P::Preparing, None, S::Cache, 0, None, None);
        observed(state.clone());
        if requirements.empty {
            safe_dir(&self.root).map_err(|_| fail(S::Cache, E::Storage))?;
            return Ok(Arc::new(RuntimeLease {
                directory: self.root.clone(),
                requirement_id,
                marker_bytes: 0,
                files: BTreeMap::new(),
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
            if lease.requirement_id != requirement_id {
                return Err(fail(S::Cache, E::Unknown));
            }
            typed_marker_guard(&lease.directory, &digest, lease.marker_bytes)?;
            for component in &manifest.components {
                for file in &component.files {
                    typed_check_file(
                        &lease.directory.join(&file.name),
                        &file.sha256,
                        C::from_name(&component.name),
                        S::Cache,
                    )?;
                }
            }
            return Ok(lease);
        }
        typed_safe_dir(&self.root, C::Runtime, S::Cache)?;
        let _exclusive = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(false)
            .share_mode(0)
            .open(self.root.join("prepare.lock"))
            .map_err(|e| F::io(C::Runtime, S::Cache, e))?;
        // Search only bounded application-owned immutable candidates; never mutate a rejected cache.
        let primary = self.root.join(format!("runtime-{digest}"));
        let mut candidates = vec![primary.clone()];
        for entry in fs::read_dir(&self.root)
            .map_err(|e| F::io(C::Runtime, S::Cache, e))?
            .take(128)
        {
            let entry = entry.map_err(|e| F::io(C::Runtime, S::Cache, e))?;
            if entry
                .file_name()
                .to_string_lossy()
                .starts_with(&format!("runtime-{digest}-recovered-"))
            {
                candidates.push(entry.path());
            }
        }
        for target in candidates {
            if control.is_cancelled() {
                return Err(fail(S::Cache, E::Cancelled));
            }
            if !target.exists() {
                continue;
            }
            let candidate = (|| {
                typed_safe_existing_dir(&target)?;
                let marker = typed_marker_guard(&target, &digest, marker_content.len() as u64)?;
                let mut guards = Vec::new();
                for component in &manifest.components {
                    for file in &component.files {
                        guards.push(typed_check_file(
                            &target.join(&file.name),
                            &file.sha256,
                            C::from_name(&component.name),
                            S::Cache,
                        )?);
                    }
                }
                Ok::<_, F>((marker, guards))
            })();
            match candidate {
                Ok((marker, mut guards)) => {
                    // A complete cache still runs supervised local probes; it never resolves a network route.
                    self.probe(
                        &target,
                        &manifest,
                        requirements,
                        control,
                        observer.clone(),
                        &mut state,
                        &mut observed,
                    )?;
                    guards.push(marker);
                    let lease = runtime_lease(
                        target,
                        requirement_id.clone(),
                        digest.clone(),
                        marker_content.len() as u64,
                        &manifest,
                        guards,
                    );
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
        let stage = tempfile::Builder::new()
            .prefix("runtime-stage-")
            .tempdir_in(&self.root)
            .map_err(|e| F::io(C::Runtime, S::Acquire, e))?;
        for component in &manifest.components {
            let component_id = C::from_name(&component.name);
            if self
                .candidate
                .as_ref()
                .is_some_and(|candidate| component.name != candidate.component)
            {
                let mut reused = false;
                for entry in fs::read_dir(&self.root)
                    .map_err(|e| F::io(C::Runtime, S::Cache, e))?
                    .take(128)
                {
                    let entry = entry.map_err(|e| F::io(C::Runtime, S::Cache, e))?;
                    if !entry.file_name().to_string_lossy().starts_with("runtime-")
                        || typed_safe_existing_dir(&entry.path()).is_err()
                    {
                        continue;
                    }
                    let guards: Result<Vec<_>, _> = component
                        .files
                        .iter()
                        .map(|f| {
                            typed_check_file(
                                &entry.path().join(&f.name),
                                &f.sha256,
                                component_id,
                                S::Cache,
                            )
                        })
                        .collect();
                    if let Ok(_guards) = guards {
                        for file in &component.files {
                            fs::copy(entry.path().join(&file.name), stage.path().join(&file.name))
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
            let archive = stage.path().join(format!("{}.artifact", component.name));
            let local_candidate = self.candidate.as_ref().is_some_and(|candidate| component.name == candidate.component);
            if self.candidate.as_ref().is_some_and(|candidate| !candidate.allow_acquisition) && !local_candidate {
                return Err(F::new(component_id, S::Cache, E::Hash));
            }
            state.observe(
                if local_candidate { P::Preparing } else { P::Downloading },
                Some(component_id),
                if local_candidate { S::Cache } else { S::Acquire },
                0,
                Some(component.bytes),
                None,
            );
            observed(state.clone());
            self.acquire_component(component, &archive, control, |bytes, total| {
                state.observe(
                    P::Downloading,
                    Some(component_id),
                    S::Acquire,
                    bytes,
                    total,
                    None,
                );
                observed(state.clone());
            })
            .map_err(|error| {
                let mut failure = F::new(component_id, S::Acquire, error.category);
                failure.http_status = error.http_status;
                failure
            })?;
            state.observe(
                P::Verifying,
                Some(component_id),
                S::Verify,
                component.bytes,
                Some(component.bytes),
                None,
            );
            observed(state.clone());
            drop(typed_check_file(
                &archive,
                &component.sha256,
                component_id,
                S::Verify,
            )?);
            state.observe(P::Verifying, Some(component_id), S::Extract, 0, None, None);
            observed(state.clone());
            if component.files.iter().all(|f| f.archive_path.is_none()) {
                fs::copy(&archive, stage.path().join(&component.files[0].name))
                    .map_err(|e| F::io(component_id, S::Extract, e))?;
            } else {
                let mut zip = zip::ZipArchive::new(
                    File::open(&archive).map_err(|e| F::io(component_id, S::Extract, e))?,
                )
                .map_err(|_| F::new(component_id, S::Extract, E::Extract))?;
                for entry in &component.files {
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
                    if item.is_dir() || item.size() > 512_000_000 {
                        return Err(F::new(component_id, S::Extract, E::Extract));
                    }
                    let mut out = OpenOptions::new()
                        .create_new(true)
                        .write(true)
                        .open(stage.path().join(&entry.name))
                        .map_err(|e| F::io(component_id, S::Extract, e))?;
                    std::io::copy(&mut item, &mut out)
                        .map_err(|e| F::io(component_id, S::Extract, e))?;
                    out.sync_all()
                        .map_err(|e| F::io(component_id, S::Extract, e))?;
                }
            }
            fs::remove_file(archive).map_err(|e| F::io(component_id, S::Extract, e))?;
        }
        self.probe(
            stage.path(),
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
        state.observe(P::Verifying, None, S::Publish, 0, None, None);
        observed(state.clone());
        let mut marker = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(stage.path().join("complete.json"))
            .map_err(|e| F::io(C::Runtime, S::Publish, e))?;
        marker
            .write_all(&marker_content)
            .map_err(|e| F::io(C::Runtime, S::Publish, e))?;
        marker
            .sync_all()
            .map_err(|e| F::io(C::Runtime, S::Publish, e))?;
        drop(marker);
        // An invalid primary remains as evidence. Publish a fresh immutable sibling, no in-place repair.
        let target = if primary.exists() {
            self.root.join(format!(
                "runtime-{digest}-recovered-{}",
                stage.path().file_name().unwrap().to_string_lossy()
            ))
        } else {
            primary
        };
        super::output::move_no_replace(stage.path(), &target)
            .map_err(|e| F::io(C::Runtime, S::Publish, e))?;
        let mut guards = vec![typed_marker_guard(
            &target,
            &digest,
            marker_content.len() as u64,
        )?];
        for component in &manifest.components {
            for file in &component.files {
                guards.push(typed_check_file(
                    &target.join(&file.name),
                    &file.sha256,
                    C::from_name(&component.name),
                    S::Verify,
                )?);
            }
        }
        let lease = runtime_lease(
            target,
            requirement_id,
            digest,
            marker_content.len() as u64,
            &manifest,
            guards,
        );
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
                    network::AcquisitionError::from(super::preparation::ErrorCategory::io(&e))
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
                let probe = tempfile::Builder::new()
                    .prefix("probe-")
                    .tempdir_in(&self.root)
                    .map_err(|e| F::io(component_id, S::Probe, e))?;
                let outcome = process_supervisor::run(
                    ProcessSpec {
                        executable,
                        args: requirements
                            .probes
                            .get(&file.name)
                            .ok_or_else(|| F::new(component_id, S::Probe, E::Probe))?
                            .clone(),
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
fn runtime_lease(
    target: PathBuf,
    requirement_id: String,
    digest: String,
    marker_bytes: u64,
    manifest: &Manifest,
    guards: Vec<File>,
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
        versions: manifest
            .components
            .iter()
            .map(|c| (c.name.clone(), c.version.clone()))
            .collect(),
        digest,
        _guards: guards,
    })
}
pub(crate) fn typed_safe_existing_dir(
    path: &Path,
) -> Result<(), super::preparation::PreparationFailure> {
    use super::preparation::{
        ErrorCategory as E, PreparationFailure as F, PreparationStage as S, RuntimeComponent as C,
    };
    for ancestor in path.ancestors() {
        let metadata =
            fs::symlink_metadata(ancestor).map_err(|e| F::io(C::Runtime, S::Cache, e))?;
        if metadata.file_attributes() & 0x400 != 0 || !metadata.is_dir() {
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
        .map_err(|e| super::preparation::PreparationFailure::io(component, stage, e))?;
    typed_safe_existing_dir(path)
}
fn typed_check_file(
    path: &Path,
    expected: &str,
    component: super::preparation::RuntimeComponent,
    stage: super::preparation::PreparationStage,
) -> Result<File, super::preparation::PreparationFailure> {
    use super::preparation::{ErrorCategory as E, PreparationFailure as F};
    let metadata = fs::symlink_metadata(path).map_err(|e| F::io(component, stage, e))?;
    if !metadata.is_file() || metadata.file_attributes() & 0x400 != 0 {
        return Err(F::new(component, stage, E::Hash));
    }
    let mut file = OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(path)
        .map_err(|e| F::io(component, stage, e))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let n = file
            .read(&mut buffer)
            .map_err(|e| F::io(component, stage, e))?;
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
        ErrorCategory as E, PreparationFailure as F, PreparationStage as S, RuntimeComponent as C,
    };
    let marker = path.join("complete.json");
    let file = typed_check_file(&marker, digest, C::Runtime, S::Cache)?;
    if file
        .metadata()
        .map_err(|e| F::io(C::Runtime, S::Cache, e))?
        .len()
        != bytes
    {
        return Err(F::new(C::Runtime, S::Cache, E::Hash));
    }
    Ok(file)
}

#[cfg(test)]
#[path = "../../tests/support/windows_process_fixture.rs"]
mod runtime_fixture;
#[cfg(test)]
mod requirement_tests {
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
        // A fresh manager still succeeds through marker/hash/native probes with the failing provider.
        assert!(
            manager
                .prepare_observed(&requirements, &Control::default(), Arc::new(|_| {}), |_| {})
                .is_ok()
        );
    }
    #[test]
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
            vec!["ffprobe.exe"]
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
