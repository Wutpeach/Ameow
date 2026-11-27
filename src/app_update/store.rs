use super::{
    Manifest, Phase, SignedManifest, Trust,
    package::{hash, hash_reader},
};
#[cfg(all(test, windows))]
#[path = "component_launch_tests.rs"]
mod component_launch_tests;
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Release {
    pub version: String,
    pub sequence: u64,
    pub manifest_hash: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct State {
    pub current: Option<Release>,
    pub previous: Option<Release>,
    pub pending: Option<Release>,
    pub trial: Option<Release>,
    pub highest_sequence: u64,
    pub highest_manifest: String,
    pub failed: Vec<String>,
    pub last_error: Option<String>,
}
#[derive(Clone)]
pub struct Install {
    pub root: PathBuf,
    trust: Trust,
}
pub(crate) fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
pub(crate) fn plain(path: &Path) -> Result<(), String> {
    // Check every existing ancestor; canonicalization alone would accept a junction.
    for ancestor in path.ancestors() {
        match fs::symlink_metadata(ancestor) {
            Ok(m) => {
                #[cfg(windows)]
                {
                    use std::os::windows::fs::MetadataExt;
                    if m.file_attributes() & 0x400 != 0 {
                        return Err("E_APP_UPDATE_REPARSE".into());
                    }
                }
                if m.file_type().is_symlink() {
                    return Err("E_APP_UPDATE_REPARSE".into());
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}
pub(crate) fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
    plain(path)?;
    let mut bytes = Vec::new();
    File::open(path)
        .and_then(|f| f.take(65537).read_to_end(&mut bytes))
        .map_err(|e| format!("E_APP_UPDATE_STATE: {e}"))?;
    if bytes.len() > 65536 {
        return Err("E_APP_UPDATE_STATE_SIZE".into());
    }
    serde_json::from_slice(&bytes).map_err(|e| format!("E_APP_UPDATE_STATE: {e}"))
}
pub(crate) fn atomic_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    plain(path)?;
    let mut file = tempfile::NamedTempFile::new_in(path.parent().ok_or("E_APP_UPDATE_PATH")?)
        .map_err(|e| e.to_string())?;
    serde_json::to_writer(file.as_file_mut(), value).map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(path)
        .map_err(|e| format!("E_APP_UPDATE_STATE_WRITE: {}: {e}", path.display()))?;
    Ok(())
}
pub(crate) fn exclusive(path: &Path) -> Result<File, String> {
    plain(path)?;
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(0);
    }
    let file = options
        .open(path)
        .map_err(|e| format!("E_APP_UPDATE_LOCK: {e}"))?;
    #[cfg(target_os = "macos")]
    {
        use std::os::fd::AsRawFd;
        unsafe extern "C" {
            fn flock(fd: std::os::raw::c_int, operation: std::os::raw::c_int) -> std::os::raw::c_int;
        }
        if unsafe { flock(file.as_raw_fd(), 2 | 4) } != 0 {
            return Err(format!("E_APP_UPDATE_LOCK: {}", std::io::Error::last_os_error()));
        }
    }
    Ok(file)
}
fn tree_files(root: &Path) -> Result<std::collections::BTreeSet<String>, String> {
    fn visit(root: &Path, dir: &Path, files: &mut std::collections::BTreeSet<String>) -> Result<(), String> {
        plain(dir)?;
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            plain(&path)?;
            let metadata = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
            if metadata.is_dir() { visit(root, &path, files)?; }
            else if metadata.is_file() { files.insert(path.strip_prefix(root).map_err(|e| e.to_string())?.to_string_lossy().replace('\\', "/")); }
            else { return Err("E_APP_UPDATE_REPARSE".into()); }
        }
        Ok(())
    }
    let mut files = std::collections::BTreeSet::new();
    if root.exists() { visit(root, root, &mut files)?; }
    Ok(files)
}

fn extract_windows(mut file: File, archive: &Path, stage: &Path, manifest: &Manifest, trust: &Trust) -> Result<(), String> {
    use std::collections::BTreeSet;
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "E_APP_UPDATE_ZIP")?;
    if zip.len() > 600 { return Err("E_APP_UPDATE_ZIP_MEMBERS".into()); }
    let prefix = format!("versions/{}/", manifest.version);
    let receipt_path = format!("{prefix}bundle.json");
    let receipt = {
        let member = zip.by_name(&receipt_path).map_err(|_| "E_APP_UPDATE_BUNDLE")?;
        let mut bytes = Vec::new();
        member.take(65537).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        bytes
    };
    let (signed, bundle) = trust.verify_bundle(&receipt, Some(now()))?;
    if bundle.version != manifest.version || bundle.sequence != manifest.sequence
        || manifest.bundle_sha256.as_deref() != Some(hash(signed.payload.as_bytes()).as_str())
        || !bundle.files.iter().any(|f| f.path == "Ameow.exe" && f.bytes == manifest.exe_bytes && f.sha256 == manifest.exe_sha256) {
        return Err("E_APP_UPDATE_BUNDLE_IDENTITY".into());
    }
    let mut required: BTreeSet<String> = bundle.files.iter().map(|f| format!("{prefix}{}", f.path)).collect();
    required.insert(receipt_path.clone());
    required.insert("Ameow.exe".into());
    required.insert("entry.json".into());
    required.insert("state.json".into());
    for f in &bundle.files { if f.path != "Ameow.exe" { required.insert(f.path.clone()); } }
    let mut seen = BTreeSet::new();
    let mut total = 0u64;
    for i in 0..zip.len() {
        let mut member = zip.by_index(i).map_err(|_| "E_APP_UPDATE_ZIP")?;
        let name = member.name().to_string();
        if member.is_dir() {
            if member.enclosed_name().is_none() || member.name().contains('\\') { return Err("E_APP_UPDATE_ZIP_MEMBER".into()); }
            continue;
        }
        if !seen.insert(name.to_ascii_lowercase()) || member.enclosed_name().is_none()
            || member.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000) { return Err("E_APP_UPDATE_ZIP_MEMBER".into()); }
        total = total.checked_add(member.size()).ok_or("E_APP_UPDATE_SIZE")?;
        if total > super::package::MAX_PACKAGE * 3 { return Err("E_APP_UPDATE_SIZE".into()); }
        if name == receipt_path { continue; }
        if name == "entry.json" {
            let mut bytes = Vec::new(); member.take(65537).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            if bytes != receipt { return Err("E_APP_UPDATE_BUNDLE_IDENTITY".into()); }
            continue;
        }
        if name == "state.json" { if member.size() > 65536 { return Err("E_APP_UPDATE_STATE_SIZE".into()); } continue; }
        if name == "FIXTURE.txt" && cfg!(any(test, all(feature="app-update-fixture", debug_assertions))) { continue; }
        let (relative, extract) = match name.strip_prefix(&prefix) { Some(p) => (p, true), None => (name.as_str(), false) };
        let record = if !extract && relative == "Ameow.exe" { &bundle.launcher } else {
            bundle.files.iter().find(|f| f.path == relative).ok_or("E_APP_UPDATE_ZIP_MEMBER")?
        };
        if member.size() != record.bytes { return Err("E_APP_UPDATE_EXECUTABLE_SIZE".into()); }
        if extract {
            let dest = stage.join(relative);
            fs::create_dir_all(dest.parent().ok_or("E_APP_UPDATE_PATH")?).map_err(|e| e.to_string())?;
            let mut output = OpenOptions::new().read(true).write(true).create_new(true).open(&dest).map_err(|e| e.to_string())?;
            std::io::copy(&mut member.by_ref().take(record.bytes + 1), &mut output).map_err(|e| e.to_string())?;
            output.sync_all().map_err(|e| e.to_string())?;
            output.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
            let (bytes, digest) = hash_reader(&mut output)?;
            if bytes != record.bytes || digest != record.sha256 { return Err("E_APP_UPDATE_EXECUTABLE_HASH".into()); }
        } else {
            let (bytes, digest) = hash_reader(&mut member)?;
            if bytes != record.bytes || digest != record.sha256 { return Err("E_APP_UPDATE_EXECUTABLE_HASH".into()); }
        }
    }
    if !required.iter().all(|n| seen.contains(&n.to_ascii_lowercase())) { return Err("E_APP_UPDATE_ZIP_MEMBERS".into()); }
    fs::write(stage.join("bundle.json"), receipt).map_err(|e| e.to_string())?;
    drop(zip);
    fs::remove_file(archive).map_err(|e| e.to_string())
}
impl Install {
    pub fn trust(&self) -> &Trust {
        &self.trust
    }
    pub fn production(root: PathBuf) -> Result<Self, String> {
        Self::new(root, Trust::production()?)
    }
    #[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
    pub fn fixture(root: PathBuf) -> Result<Self, String> {
        Self::new(root, Trust::fixture())
    }
    #[cfg(test)]
    pub(super) fn unconfigured(root: PathBuf) -> Result<Self, String> {
        Self::new(root, Trust::offline(&[])?)
    }
    fn new(root: PathBuf, trust: Trust) -> Result<Self, String> {
        if !root.is_absolute() {
            return Err("E_APP_UPDATE_PATH".into());
        }
        plain(&root)?;
        #[cfg(target_os = "macos")]
        {
            use std::os::unix::fs::{MetadataExt, PermissionsExt};
            unsafe extern "C" { fn geteuid() -> u32; }
            fs::create_dir_all(&root).map_err(|e| e.to_string())?;
            let metadata = fs::symlink_metadata(&root).map_err(|e| e.to_string())?;
            if !metadata.is_dir() || metadata.uid() != unsafe { geteuid() } || metadata.mode() & 0o022 != 0 {
                return Err("E_APP_UPDATE_DATA_DIRECTORY".into());
            }
            fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
        }
        fs::create_dir_all(root.join("versions")).map_err(|e| e.to_string())?;
        fs::create_dir_all(root.join("staging")).map_err(|e| e.to_string())?;
        Ok(Self {
            root: root.canonicalize().map_err(|e| e.to_string())?,
            trust,
        })
    }
    pub(crate) fn lock(&self) -> Result<File, String> {
        let path = self.root.join("state.lock");
        #[cfg(target_os = "macos")]
        {
            let deadline = std::time::Instant::now() + std::time::Duration::from_millis(250);
            loop {
                match exclusive(&path) {
                    Ok(lock) => return Ok(lock),
                    Err(error) if std::time::Instant::now() < deadline
                        && error.starts_with("E_APP_UPDATE_LOCK:") => {
                        std::thread::sleep(std::time::Duration::from_millis(10));
                    }
                    Err(error) => return Err(error),
                }
            }
        }
        #[cfg(not(target_os = "macos"))]
        exclusive(&path)
    }
    pub fn state(&self) -> Result<State, String> {
        let _lock = self.lock()?;
        self.load()
    }
    pub(crate) fn load(&self) -> Result<State, String> {
        let path = self.root.join("state.json");
        if !path.try_exists().map_err(|e| e.to_string())? {
            return Ok(State::default());
        }
        read_json(&path)
    }
    pub(crate) fn save(&self, state: &State) -> Result<(), String> {
        atomic_json(&self.root.join("state.json"), state)
    }
    pub(crate) fn release_dir(&self, version: &str) -> Result<PathBuf, String> {
        super::Version::parse(version)?;
        let path = self.root.join("versions").join(version);
        plain(&path)?;
        Ok(path)
    }
    #[cfg(target_os = "macos")]
    pub(crate) fn release_manifest(&self, release: &Release) -> Result<Manifest, String> {
        let dir = self.release_dir(&release.version)?;
        let envelope: SignedManifest = read_json(&dir.join("manifest.json"))?;
        let bytes = serde_json::to_vec(&envelope).map_err(|e| e.to_string())?;
        let (_, manifest) = self.trust.verify(&bytes, None)?;
        if manifest.version != release.version
            || manifest.sequence != release.sequence
            || hash(envelope.payload.as_bytes()) != release.manifest_hash
        {
            return Err("E_APP_UPDATE_RELEASE_IDENTITY".into());
        }
        Ok(manifest)
    }
    pub fn verify_release(&self, release: &Release) -> Result<File, String> {
        #[cfg(target_os = "macos")]
        let dir = self.release_dir(&release.version)?;
        #[cfg(target_os = "macos")]
        if self.trust.target() != super::package::WINDOWS_TARGET {
            let manifest = self.release_manifest(release)?;
            if manifest.target != super::package::WINDOWS_TARGET {
            let path = dir.join("package.zip");
            let mut archive = super::macos_fs::regular_file(&path)
                .map_err(|e| format!("E_APP_UPDATE_PACKAGE: {e}"))?;
            super::macos::verify(&mut archive, &dir, &manifest)?;
            super::macos::verify_codesign(&dir.join("Ameow.app"), &manifest)?;
            return Ok(archive);
            }
        }
        self.verify_windows_release(release, None).map(|(app, _)| app)
    }
    fn verify_windows_release(&self, release: &Release, component: Option<&str>) -> Result<(File, Option<File>), String> {
        let dir = self.release_dir(&release.version)?;
        let bundle = self.windows_bundle(release)?;
        let expected: std::collections::BTreeSet<_> = bundle.files.iter().map(|f| f.path.clone())
            .chain(["bundle.json".into(), "manifest.json".into()]).collect();
        let actual = tree_files(&dir)?;
        if actual.iter().any(|p| !expected.contains(p)) { return Err("E_APP_UPDATE_ZIP_MEMBERS".into()); }
        let mut app = None;
        let mut selected = None;
        for record in &bundle.files {
        let path = dir.join(&record.path);
        plain(&path)?;
        if !fs::symlink_metadata(&path).map_err(|e| e.to_string())?.is_file() { return Err("E_APP_UPDATE_EXECUTABLE".into()); }
        let mut options = OpenOptions::new();
        options.read(true);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            options.share_mode(1);
        }
        let mut guard = options
            .open(path)
            .map_err(|e| format!("E_APP_UPDATE_EXECUTABLE: {e}"))?;
        let (bytes, digest) = hash_reader(&mut guard)?;
        if bytes != record.bytes || digest != record.sha256 {
            return Err("E_APP_UPDATE_EXECUTABLE_HASH".into());
        }
        // Keep the same verified file open through spawn; reopening would need another hash.
        if component == Some(record.path.as_str()) { selected = Some(guard.try_clone().map_err(|e| e.to_string())?); }
        if record.path == "Ameow.exe" { app = Some(guard); }
        }
        Ok((app.ok_or("E_APP_UPDATE_BUNDLE_INCOMPLETE")?, selected))
    }
    #[cfg(all(test, windows))]
    pub(crate) fn component_release(&self) -> Result<(Release, File), String> {
        let release = self.selected_component_release()?;
        let guard = self.verify_release(&release)?;
        Ok((release, guard))
    }
    #[cfg(windows)]
    fn selected_component_release(&self) -> Result<Release, String> {
        let state = self.state()?;
        // An accepted version always wins. Only a first install uses its bootstrap slot.
        let release = state.current.or(state.trial).or(state.pending)
            .ok_or("E_APP_UPDATE_NO_CURRENT_VERSION")?;
        if state.failed.contains(&release.manifest_hash) { return Err("E_APP_UPDATE_FAILED_TRIAL".into()); }
        Ok(release)
    }
    #[cfg(windows)]
    pub(crate) fn component_launch(&self, name: &str) -> Result<(Release, File, File), String> {
        let release = self.selected_component_release()?;
        let (app, component) = self.verify_windows_release(&release, Some(name))?;
        Ok((release, app, component.ok_or("E_APP_UPDATE_BUNDLE_INCOMPLETE")?))
    }
    #[cfg(all(test, windows))]
    pub(crate) fn verify_component(&self, release: &Release, name: &str) -> Result<File, String> {
        let bundle = self.windows_bundle(release)?;
        let record = bundle.files.iter().find(|f| f.path == name).ok_or("E_APP_UPDATE_BUNDLE_INCOMPLETE")?;
        let path = self.release_dir(&release.version)?.join(name);
        plain(&path)?;
        use std::os::windows::fs::OpenOptionsExt;
        let mut file = OpenOptions::new().read(true).share_mode(1).open(path).map_err(|e| e.to_string())?;
        let (bytes, digest) = hash_reader(&mut file)?;
        if bytes != record.bytes || digest != record.sha256 { return Err("E_APP_UPDATE_EXECUTABLE_HASH".into()); }
        Ok(file)
    }
    pub(crate) fn windows_bundle(&self, release: &Release) -> Result<super::WindowsBundle, String> {
        let signed: SignedManifest = read_json(&self.release_dir(&release.version)?.join("bundle.json"))?;
        let (signed, bundle) = self.trust.verify_bundle(&serde_json::to_vec(&signed).map_err(|e| e.to_string())?, None)?;
        if bundle.version != release.version || bundle.sequence != release.sequence
            || hash(signed.payload.as_bytes()) != release.manifest_hash { return Err("E_APP_UPDATE_RELEASE_IDENTITY".into()); }
        Ok(bundle)
    }
    /// The unpacked browser path stays stable; its contents derive from the confirmed slot.
    pub(crate) fn publish_extension(&self, release: &Release) -> Result<(), String> {
        let bundle = self.windows_bundle(release)?;
        let live = self.root.join("browser-extension");
        let backup = self.root.join("browser-extension.previous");
        plain(&live)?; plain(&backup)?;
        let records: Vec<_> = bundle.files.iter().filter(|f| f.path.starts_with("browser-extension/")).collect();
        let expected: std::collections::BTreeSet<_> = records.iter().map(|f| f.path.strip_prefix("browser-extension/").unwrap().to_string()).collect();
        let matches = tree_files(&live)? == expected && records.iter().all(|f| File::open(self.root.join(&f.path)).ok()
            .and_then(|mut file| hash_reader(&mut file).ok()).is_some_and(|(n, hash)| n == f.bytes && hash == f.sha256));
        if matches {
            tree_files(&backup)?;
            if backup.exists() { fs::remove_dir_all(&backup).map_err(|e| e.to_string())?; }
            return Ok(());
        }
        let stage = tempfile::Builder::new().prefix("extension-").tempdir_in(self.root.join("staging")).map_err(|e| e.to_string())?;
        let next = stage.path().join("browser-extension");
        for record in records {
            let path = stage.path().join(&record.path);
            fs::create_dir_all(path.parent().ok_or("E_APP_UPDATE_PATH")?).map_err(|e| e.to_string())?;
            let source = self.release_dir(&release.version)?.join(&record.path);
            plain(&source)?;
            fs::copy(source, &path).map_err(|e| e.to_string())?;
            let (bytes, digest) = hash_reader(&mut File::open(&path).map_err(|e| e.to_string())?)?;
            if bytes != record.bytes || digest != record.sha256 { return Err("E_APP_UPDATE_EXECUTABLE_HASH".into()); }
        }
        tree_files(&backup)?;
        if backup.exists() { fs::remove_dir_all(&backup).map_err(|e| e.to_string())?; }
        if live.exists() { fs::rename(&live, &backup).map_err(|e| format!("E_APP_UPDATE_EXTENSION: {e}"))?; }
        if let Err(error) = fs::rename(&next, &live) {
            if backup.exists() { let _ = fs::rename(&backup, &live); }
            return Err(format!("E_APP_UPDATE_EXTENSION: {error}"));
        }
        if backup.exists() { fs::remove_dir_all(&backup).map_err(|e| e.to_string())?; }
        Ok(())
    }
    /// An installer adds immutable files; the existing Launcher still owns trial/Ready/rollback.
    pub fn register_installed_version(&self, version: &str) -> Result<(), String> {
        let _running = exclusive(&self.root.join("running.lock"))?;
        #[cfg(all(windows, not(any(test, feature = "app-update-fixture"))))]
        let _instance = match crate::login_startup::InstanceGuard::acquire_with_restore(false)? {
            crate::login_startup::InstanceAcquire::Duplicate => return Err("E_APP_UPDATE_INSTALL_RUNNING".into()),
            crate::login_startup::InstanceAcquire::Primary(guard) => guard,
        };
        let _lock = self.lock()?;
        let envelope: SignedManifest = read_json(&self.release_dir(version)?.join("bundle.json"))?;
        let bytes = serde_json::to_vec(&envelope).map_err(|e| e.to_string())?;
        let (_, bundle) = self.trust.verify_bundle(&bytes, Some(now()))?;
        if bundle.version != version { return Err("E_APP_UPDATE_RELEASE_IDENTITY".into()); }
        let release = Release {
            version: version.into(),
            sequence: bundle.sequence,
            manifest_hash: hash(envelope.payload.as_bytes()),
        };
        let _exe = self.verify_release(&release)?;
        let state = self.load()?;
        if state.trial.is_some() { return Err("E_APP_UPDATE_TRIAL_BUSY".into()); }
        if [&state.current, &state.pending].into_iter().flatten().any(|r| {
            r.version == release.version && r.sequence == release.sequence && r.manifest_hash == release.manifest_hash
        }) {
            return Ok(());
        }
        let mut state = self.load()?;
        super::Version::parse(version)?;
        if state.current.as_ref().is_some_and(|r| super::Version::parse(&r.version).is_ok_and(|v| v >= super::Version::parse(version).unwrap())) {
            return Err("E_APP_UPDATE_DOWNGRADE".into());
        }
        if bundle.sequence < state.highest_sequence
            || bundle.sequence == state.highest_sequence && state.highest_manifest != release.manifest_hash
            || state.failed.contains(&release.manifest_hash) { return Err("E_APP_UPDATE_REPLAY".into()); }
        state.highest_sequence = release.sequence;
        state.highest_manifest = release.manifest_hash.clone();
        state.pending = Some(release);
        self.save(&state)
    }
    fn authorize(&self, envelope: &[u8]) -> Result<(SignedManifest, Manifest), String> {
        let (signed, manifest) = self.trust.verify(envelope, Some(now()))?;
        let mut state = self.load()?;
        let baseline = if manifest.target == super::package::WINDOWS_TARGET { "0.0.0" } else { super::BUILD_VERSION };
        manifest.newer_than(state.current.as_ref().map_or(baseline, |r| &r.version))?;
        let digest = manifest.bundle_sha256.clone().unwrap_or_else(|| hash(signed.payload.as_bytes()));
        if state.trial.is_some() {
            return Err("E_APP_UPDATE_TRIAL_BUSY".into());
        }
        if state.failed.contains(&digest)
            || manifest.sequence < state.highest_sequence
            || manifest.sequence == state.highest_sequence && digest != state.highest_manifest
        {
            return Err("E_APP_UPDATE_REPLAY".into());
        }
        state.highest_sequence = manifest.sequence;
        state.highest_manifest = digest;
        self.save(&state)?;
        Ok((signed, manifest))
    }
    pub fn prepare_https(
        &self,
        envelope: &[u8],
        progress: impl Fn(Phase, String),
    ) -> Result<(), String> {
        let _lock = self.lock()?;
        let (signed, manifest) = self.authorize(envelope)?;
        progress(Phase::Downloading, manifest.version.clone());
        // Native Windows proxy policy remains authoritative; no failure-to-direct fallback.
        let download = tempfile::Builder::new()
            .prefix("download-")
            .tempdir_in(self.root.join("staging"))
            .map_err(|e| e.to_string())?;
        let path = download.path().join("package.zip");
        crate::download::network::acquire(
            &manifest.url,
            &path,
            manifest.package_bytes,
            &std::sync::atomic::AtomicBool::new(false),
            |_, _| {},
        )
        .map_err(|e| format!("E_APP_UPDATE_NETWORK: {e}"))?;
        self.prepare_body(
            signed,
            manifest,
            &mut File::open(path).map_err(|e| e.to_string())?,
            progress,
            None,
        )
    }
    pub(crate) fn prepare_observed(
        &self,
        envelope: &[u8],
        cancel: &std::sync::atomic::AtomicBool,
        progress: impl Fn(Phase, String, u64, Option<u64>),
        fixture: Option<&Path>,
        publish_gate: &std::sync::Mutex<()>,
    ) -> Result<(), String> {
        let _lock = self.lock()?;
        let (signed, manifest) = self.authorize(envelope)?;
        progress(
            Phase::Downloading,
            manifest.version.clone(),
            0,
            Some(manifest.package_bytes),
        );
        let download = tempfile::Builder::new()
            .prefix("download-")
            .tempdir_in(self.root.join("staging"))
            .map_err(|e| e.to_string())?;
        let path = download.path().join("package.zip");
        #[cfg(any(test,all(feature = "app-update-fixture", debug_assertions)))]
        if let Some(source) = fixture {
            let mut input = File::open(source.join("package.zip")).map_err(|e| e.to_string())?;
            let mut output = File::create(&path).map_err(|e| e.to_string())?;
            let mut buffer = [0; 65536];
            let mut total = 0;
            loop {
                if cancel.load(std::sync::atomic::Ordering::Acquire) {
                    return Err("E_APP_UPDATE_CANCELLED".into());
                }
                let n = input.read(&mut buffer).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                total += n as u64;
                if total > manifest.package_bytes {
                    return Err("E_APP_UPDATE_SIZE".into());
                }
                std::io::Write::write_all(&mut output, &buffer[..n]).map_err(|e| e.to_string())?;
                progress(
                    Phase::Downloading,
                    manifest.version.clone(),
                    total,
                    Some(manifest.package_bytes),
                );
                std::thread::sleep(std::time::Duration::from_millis(2));
            }
        }
        if fixture.is_none() {
            crate::download::network::acquire_observed(
                &manifest.url,
                &path,
                manifest.package_bytes,
                cancel,
                |_, _| {},
                |n, total| progress(Phase::Downloading, manifest.version.clone(), n, total),
            )
            .map_err(|e| format!("E_APP_UPDATE_NETWORK: {e:?}"))?;
        }
        if cancel.load(std::sync::atomic::Ordering::Acquire) {
            return Err("E_APP_UPDATE_CANCELLED".into());
        }
        self.prepare_body(
            signed,
            manifest,
            &mut File::open(path).map_err(|e| e.to_string())?,
            |phase, version| progress(phase, version, 0, None),
            Some((cancel, publish_gate)),
        )
    }
    #[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
    pub fn prepare_fixture(&self, envelope: &[u8], reader: &mut impl Read) -> Result<(), String> {
        let _lock = self.lock()?;
        let (signed, manifest) = self.authorize(envelope)?;
        self.prepare_body(signed, manifest, reader, |_, _| {}, None)
    }
    fn prepare_body(
        &self,
        signed: SignedManifest,
        manifest: Manifest,
        reader: &mut impl Read,
        progress: impl Fn(Phase, String),
        cancel: Option<(&std::sync::atomic::AtomicBool, &std::sync::Mutex<()>)>,
    ) -> Result<(), String> {
        let stage = tempfile::Builder::new()
            .prefix("update-")
            .tempdir_in(self.root.join("staging"))
            .map_err(|e| e.to_string())?;
        let archive = stage.path().join("package.zip");
        let mut file = OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .open(&archive)
            .map_err(|e| e.to_string())?;
        let copied = std::io::copy(&mut reader.take(manifest.package_bytes + 1), &mut file)
            .map_err(|e| format!("E_APP_UPDATE_INTERRUPTED: {e}"))?;
        file.sync_all().map_err(|e| e.to_string())?;
        progress(Phase::Verifying, manifest.version.clone());
        file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        if copied != manifest.package_bytes || hash_reader(&mut file)?.1 != manifest.package_sha256
        {
            return Err("E_APP_UPDATE_PACKAGE_HASH".into());
        }
        #[cfg(target_os = "macos")]
        if manifest.target != super::package::WINDOWS_TARGET {
            super::macos::extract(&mut file, stage.path(), &manifest, cancel.map(|(flag, _)| flag))?;
            super::macos::verify_codesign(&stage.path().join("Ameow.app"), &manifest)?;
            drop(file);
        } else {
            extract_windows(file, &archive, stage.path(), &manifest, &self.trust)?;
        }
        #[cfg(not(target_os = "macos"))]
        extract_windows(file, &archive, stage.path(), &manifest, &self.trust)?;
        atomic_json(&stage.path().join("manifest.json"), &signed)?;
        let release = Release {
            version: manifest.version.clone(),
            sequence: manifest.sequence,
            manifest_hash: manifest.bundle_sha256.clone().unwrap_or_else(|| hash(signed.payload.as_bytes())),
        };
        let destination = self.release_dir(&release.version)?;
        let _publish = cancel.map(|(_, gate)| gate.lock().unwrap());
        if cancel.is_some_and(|(c, _)| c.load(std::sync::atomic::Ordering::Acquire)) {
            return Err("E_APP_UPDATE_CANCELLED".into());
        }
        if destination.exists() {
            // Reuse only the exact fully verified immutable version after interrupted publication.
            self.verify_release(&release)?;
        } else {
            fs::rename(stage.path(), &destination)
                .map_err(|e| format!("E_APP_UPDATE_STAGE: {e}"))?;
        }
        let mut state = self.load()?;
        state.pending = Some(release);
        self.save(&state)?;
        progress(Phase::Ready, manifest.version);
        Ok(())
    }
}

#[cfg(all(test, target_os = "macos"))]
mod macos_tests {
    use super::*;
    use crate::app_update::package::{MACOS_ARM_TARGET, fixture_envelope};
    use std::io::{Cursor, Write};

    #[test]
    fn update_locks_exclude_another_owner_until_closed() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().canonicalize().unwrap().join("state.lock");
        let first = exclusive(&path).unwrap();
        assert!(exclusive(&path).is_err());
        drop(first);
        assert!(exclusive(&path).is_ok());
    }

    #[test]
    fn state_lock_tolerates_short_lived_contention() {
        let root = tempfile::tempdir().unwrap();
        let install = Install::fixture(root.path().canonicalize().unwrap().join("install")).unwrap();
        let lock = install.lock().unwrap();
        let release = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(30));
            drop(lock);
        });
        assert!(install.state().is_ok());
        release.join().unwrap();
    }

    #[test]
    fn an_unusable_macos_candidate_never_becomes_pending() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap().join("install");
        let install = Install::new(root, Trust::fixture_for_target(MACOS_ARM_TARGET)).unwrap();
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, bytes) in [
            ("Ameow.app/Contents/MacOS/ameow", &b"executable"[..]),
            ("Ameow.app/Contents/MacOS/ameow-updater", &b"helper"[..]),
            ("Ameow.app/Contents/Info.plist", &b"plist"[..]),
        ] {
            writer.start_file(name, zip::write::SimpleFileOptions::default().unix_permissions(0o755)).unwrap();
            writer.write_all(bytes).unwrap();
        }
        let archive = writer.finish().unwrap().into_inner();
        let manifest = Manifest {
            schema: 1, product: "Ameow".into(), channel: "stable".into(),
            target: MACOS_ARM_TARGET.into(), version: "9.0.0".into(), sequence: 1, issued: 1,
            url: "https://github.com/Wutpeach/Ameow/releases/download/v9.0.0/Ameow-9.0.0-macos-arm64.zip".into(),
            package_bytes: archive.len() as u64, package_sha256: hash(&archive),
            exe_bytes: 10, exe_sha256: hash(b"executable"),
            bundle_sha256: None,
        };
        let error = install.prepare_fixture(&fixture_envelope(&manifest), &mut Cursor::new(archive)).unwrap_err();
        assert!(error.contains("BUNDLE_IDENTITY") || error.contains("CODESIGN"));
        assert!(install.state().unwrap().pending.is_none());
        assert!(!install.root.join("versions/9.0.0").exists());
    }

    #[test]
    fn macos_rejects_the_running_version_and_replayed_sequences() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap().join("install");
        let install = Install::new(root, Trust::fixture_for_target(MACOS_ARM_TARGET)).unwrap();
        let mut manifest = Manifest {
            schema: 1, product: "Ameow".into(), channel: "stable".into(),
            target: MACOS_ARM_TARGET.into(), version: super::super::BUILD_VERSION.into(), sequence: 1, issued: 1,
            url: format!("https://github.com/Wutpeach/Ameow/releases/download/v{0}/Ameow-{0}-macos-arm64.zip", super::super::BUILD_VERSION),
            package_bytes: 1, package_sha256: hash(b"a"), exe_bytes: 1, exe_sha256: hash(b"b"),
            bundle_sha256: None,
        };
        assert_eq!(install.authorize(&fixture_envelope(&manifest)).unwrap_err(), "E_APP_UPDATE_DOWNGRADE");
        manifest.version = "9.0.0".into();
        manifest.url = "https://github.com/Wutpeach/Ameow/releases/download/v9.0.0/Ameow-9.0.0-macos-arm64.zip".into();
        install.authorize(&fixture_envelope(&manifest)).unwrap();
        manifest.package_sha256 = hash(b"different");
        assert_eq!(install.authorize(&fixture_envelope(&manifest)).unwrap_err(), "E_APP_UPDATE_REPLAY");
    }
}
