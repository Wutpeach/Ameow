use super::{
    Manifest, Phase, SignedManifest, Trust,
    package::{hash, hash_reader},
};
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
        .map_err(|e| format!("E_APP_UPDATE_STATE_WRITE: {e}"))?;
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

fn extract_windows(mut file: File, archive: &Path, stage: &Path, manifest: &Manifest) -> Result<(), String> {
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "E_APP_UPDATE_ZIP")?;
    if zip.len() != 1 { return Err("E_APP_UPDATE_ZIP_MEMBERS".into()); }
    let mut member = zip.by_index(0).map_err(|_| "E_APP_UPDATE_ZIP")?;
    if member.name() != "Ameow.exe" || member.is_dir()
        || member.unix_mode().is_some_and(|mode| mode & 0o170000 == 0o120000)
        || member.size() != manifest.exe_bytes {
        return Err("E_APP_UPDATE_ZIP_MEMBER".into());
    }
    let exe = stage.join("Ameow.exe");
    let mut output = OpenOptions::new().read(true).write(true).create_new(true).open(&exe)
        .map_err(|e| e.to_string())?;
    if std::io::copy(&mut member.by_ref().take(manifest.exe_bytes + 1), &mut output)
        .map_err(|e| e.to_string())? != manifest.exe_bytes {
        return Err("E_APP_UPDATE_EXECUTABLE_SIZE".into());
    }
    output.sync_all().map_err(|e| e.to_string())?;
    output.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    if hash_reader(&mut output)?.1 != manifest.exe_sha256 {
        return Err("E_APP_UPDATE_EXECUTABLE_HASH".into());
    }
    drop(output);
    drop(member);
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
        let dir = self.release_dir(&release.version)?;
        let manifest = self.release_manifest(release)?;
        #[cfg(target_os = "macos")]
        if manifest.target != super::package::WINDOWS_TARGET {
            let path = dir.join("package.zip");
            let mut archive = super::macos_fs::regular_file(&path)
                .map_err(|e| format!("E_APP_UPDATE_PACKAGE: {e}"))?;
            super::macos::verify(&mut archive, &dir, &manifest)?;
            super::macos::verify_codesign(&dir.join("Ameow.app"), &manifest)?;
            return Ok(archive);
        }
        let exe = dir.join("Ameow.exe");
        plain(&exe)?;
        let mut options = OpenOptions::new();
        options.read(true);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            options.share_mode(1);
        }
        let mut guard = options
            .open(exe)
            .map_err(|e| format!("E_APP_UPDATE_EXECUTABLE: {e}"))?;
        let (bytes, digest) = hash_reader(&mut guard)?;
        if bytes != manifest.exe_bytes || digest != manifest.exe_sha256 {
            return Err("E_APP_UPDATE_EXECUTABLE_HASH".into());
        }
        Ok(guard)
    }
    /// An installer adds immutable files; the existing Launcher still owns trial/Ready/rollback.
    pub fn register_installed_version(&self, version: &str) -> Result<(), String> {
        let _running = exclusive(&self.root.join("running.lock"))?;
        #[cfg(windows)]
        let _instance = match crate::login_startup::InstanceGuard::acquire_with_restore(false)? {
            crate::login_startup::InstanceAcquire::Duplicate => return Err("E_APP_UPDATE_INSTALL_RUNNING".into()),
            crate::login_startup::InstanceAcquire::Primary(guard) => guard,
        };
        let _lock = self.lock()?;
        let envelope: SignedManifest = read_json(&self.release_dir(version)?.join("manifest.json"))?;
        let bytes = serde_json::to_vec(&envelope).map_err(|e| e.to_string())?;
        let (_, manifest) = self.trust.verify(&bytes, Some(now()))?;
        let release = Release {
            version: version.into(),
            sequence: manifest.sequence,
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
        self.authorize(&bytes)?;
        let mut state = self.load()?;
        state.pending = Some(release);
        self.save(&state)
    }
    fn authorize(&self, envelope: &[u8]) -> Result<(SignedManifest, Manifest), String> {
        let (signed, manifest) = self.trust.verify(envelope, Some(now()))?;
        let mut state = self.load()?;
        let baseline = if manifest.target == super::package::WINDOWS_TARGET { "0.0.0" } else { super::BUILD_VERSION };
        manifest.newer_than(state.current.as_ref().map_or(baseline, |r| &r.version))?;
        let digest = hash(signed.payload.as_bytes());
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
            extract_windows(file, &archive, stage.path(), &manifest)?;
        }
        #[cfg(not(target_os = "macos"))]
        extract_windows(file, &archive, stage.path(), &manifest)?;
        atomic_json(&stage.path().join("manifest.json"), &signed)?;
        let release = Release {
            version: manifest.version.clone(),
            sequence: manifest.sequence,
            manifest_hash: hash(signed.payload.as_bytes()),
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
        };
        assert_eq!(install.authorize(&fixture_envelope(&manifest)).unwrap_err(), "E_APP_UPDATE_DOWNGRADE");
        manifest.version = "9.0.0".into();
        manifest.url = "https://github.com/Wutpeach/Ameow/releases/download/v9.0.0/Ameow-9.0.0-macos-arm64.zip".into();
        install.authorize(&fixture_envelope(&manifest)).unwrap();
        manifest.package_sha256 = hash(b"different");
        assert_eq!(install.authorize(&fixture_envelope(&manifest)).unwrap_err(), "E_APP_UPDATE_REPLAY");
    }
}
