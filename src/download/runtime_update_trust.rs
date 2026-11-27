//! Trust bootstrap for official downloader candidates. No local metadata is an authority.
use super::{
    contract::Downloader,
    network::{self, Route},
    preparation::{ErrorCategory, PreparationFailure, PreparationPhase, PreparationSnapshot, PreparationStage, RuntimeComponent},
    process_supervisor::{Control, ProcessObservation},
    runtime::{self, RuntimeLease, RuntimeManager, TrustedRuntimeRequirements},
    runtime_update::{RuntimeUpdateFailure, UpdateErrorCategory, UpdateService, UpdateStage},
    upstream::normalize_stable_version,
};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use url::Url;

const MAX_SUMS: u64 = 1024 * 1024;
const MAX_EXECUTABLE: u64 = 128 * 1024 * 1024;
const MAX_SIGNATURE: u64 = 4096;
const PROOF_MAGIC: &[u8; 8] = b"AMEOWSG1";
#[cfg(windows)]
const YT_ASSET: &str = "yt-dlp.exe";
#[cfg(target_os = "macos")]
const YT_ASSET: &str = "yt-dlp";
#[cfg(windows)]
const YT_FILE: &str = "yt-dlp.exe";
#[cfg(target_os = "macos")]
const YT_FILE: &str = "yt-dlp";

struct ReleaseProof {
    sums: Vec<u8>,
    signature: Vec<u8>,
}

impl ReleaseProof {
    fn checksum(&self) -> Result<String, String> {
        super::release_signature::verify(&self.sums, &self.signature)?;
        checksum(&self.sums)
    }

    fn encode(&self) -> Vec<u8> {
        let mut bytes = PROOF_MAGIC.to_vec();
        bytes.extend_from_slice(&(self.sums.len() as u32).to_be_bytes());
        bytes.extend_from_slice(&(self.signature.len() as u32).to_be_bytes());
        bytes.extend_from_slice(&self.sums);
        bytes.extend_from_slice(&self.signature);
        bytes
    }

    #[cfg(test)]
    fn decode(bytes: &[u8]) -> Result<Self, String> {
        let proof = Self::decode_unverified(bytes)?;
        proof.checksum()?;
        Ok(proof)
    }
    fn decode_unverified(bytes: &[u8]) -> Result<Self, String> {
        if bytes.len() < 16 || &bytes[..8] != PROOF_MAGIC {
            return Err("E_UPDATE_SIGNATURE".into());
        }
        let sums = u32::from_be_bytes(bytes[8..12].try_into().unwrap()) as usize;
        let signature = u32::from_be_bytes(bytes[12..16].try_into().unwrap()) as usize;
        if sums == 0 || sums > MAX_SUMS as usize || signature == 0
            || signature > MAX_SIGNATURE as usize || bytes.len() != 16 + sums + signature {
            return Err("E_UPDATE_SIGNATURE".into());
        }
        let proof = Self { sums: bytes[16..16+sums].to_vec(), signature: bytes[16+sums..].to_vec() };
        Ok(proof)
    }
    fn checksum_for(&self, downloader: Downloader, version: &str) -> Result<String, String> {
        match downloader {
            Downloader::YtDlp => self.checksum(),
            Downloader::GalleryDl => {
                super::release_signature::verify_gallery(&self.sums, &self.signature)?;
                checksum_named(&self.sums, &asset_name(downloader, version))
            }
        }
    }

    fn persist(&self, root: &Path, version: &str) -> Result<(), String> {
        let dir = root.join("release-proofs");
        runtime::safe_dir(&dir).map_err(|_| "E_UPDATE_STORAGE")?;
        let mut temp = tempfile::NamedTempFile::new_in(&dir).map_err(|_| "E_UPDATE_STORAGE")?;
        temp.write_all(&self.encode()).and_then(|_| temp.as_file().sync_all())
            .map_err(|_| "E_UPDATE_STORAGE")?;
        temp.persist(dir.join(format!("{version}.proof"))).map_err(|_| "E_UPDATE_STORAGE")?;
        Ok(())
    }
}

#[cfg(test)]
fn signed_release(
    root: &Path, version: &str, fetch: impl FnMut(&str, u64) -> Result<Vec<u8>, String>,
) -> Result<(ReleaseProof, bool), String> {
    signed_release_for(root, Downloader::YtDlp, version, fetch)
}
fn signed_release_for(
    root: &Path, downloader: Downloader, version: &str, mut fetch: impl FnMut(&str, u64) -> Result<Vec<u8>, String>,
) -> Result<(ReleaseProof, bool), String> {
    let dir = root.join("release-proofs");
    match fs::symlink_metadata(&dir) {
        Ok(_) => { runtime::typed_safe_existing_dir(&dir).map_err(|_| "E_UPDATE_STORAGE")?; }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("E_UPDATE_STORAGE".into()),
    }
    let proof_name = if downloader == Downloader::YtDlp { version.to_owned() } else { format!("gallery-{version}") };
    let path = dir.join(format!("{proof_name}.proof"));
    match fs::symlink_metadata(&path) {
        Ok(meta) => {
            if !super::is_plain_file(&meta)
                || meta.len() > MAX_SUMS + MAX_SIGNATURE + 16 {
                return Err("E_UPDATE_SIGNATURE".into());
            }
            let file = runtime::open_identity_file(&path)
                .map_err(|_| "E_UPDATE_STORAGE")?;
            let mut bytes = Vec::new();
            file.take(MAX_SUMS + MAX_SIGNATURE + 17).read_to_end(&mut bytes)
                .map_err(|_| "E_UPDATE_STORAGE")?;
            let proof = ReleaseProof::decode_unverified(&bytes)?;
            proof.checksum_for(downloader, version)?;
            return Ok((proof, false));
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("E_UPDATE_STORAGE".into()),
    }
    let base = release_base(downloader, version);
    let sums = if downloader == Downloader::YtDlp { "SHA2-256SUMS" } else { "SHA256SUMS" };
    let proof = ReleaseProof {
        sums: fetch(&format!("{base}/{sums}"), MAX_SUMS)?,
        signature: fetch(&format!("{base}/{sums}.sig"), MAX_SIGNATURE)?,
    };
    proof.checksum_for(downloader, version)?;
    Ok((proof, true))
}

fn allowed(url: &Url) -> bool {
    url.scheme() == "https"
        && matches!(
            url.host_str(),
            Some("github.com" | "release-assets.githubusercontent.com" | "codeberg.org")
        )
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url.fragment().is_none()
}

fn get(url: &str, control: &Control, failure: &mut RuntimeUpdateFailure) -> Result<reqwest::blocking::Response, String> {
    let mut url = Url::parse(url).map_err(|_| "E_UPDATE_URL")?;
    for _ in 0..8 {
        if control.is_cancelled() {
            return Err("E_UPDATE_CANCELLED".into());
        }
        if !allowed(&url) {
            return Err("E_UPDATE_URL".into());
        }
        failure.service = UpdateService::from_url(url.as_str());
        failure.http_status = None;
        failure.retry_after_seconds = None;
        failure.retry_at_unix_seconds = None;
        let route = network::resolve(url.as_str()).map_err(|_| "E_UPDATE_ROUTE")?;
        let mut client = reqwest::blocking::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(300));
        if let Route::Proxy(proxy) = route {
            client = client.proxy(reqwest::Proxy::all(proxy).map_err(|_| "E_UPDATE_ROUTE")?);
        }
        let response = client
            .build()
            .map_err(|_| "E_UPDATE_NETWORK")?
            .get(url.clone())
            .header(reqwest::header::USER_AGENT, "Ameow-Next/0.1")
            .send()
            .map_err(|e| if e.is_timeout() { "E_UPDATE_TIMEOUT" } else if e.is_connect() { "E_UPDATE_CONNECT" } else { "E_UPDATE_NETWORK" })?;
        failure.response(&response);
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| { failure.response(&response); "E_UPDATE_HTTP" })?;
            url = url.join(location).map_err(|_| "E_UPDATE_URL")?;
            continue;
        }
        if !response.status().is_success() {
            failure.response(&response);
            return Err("E_UPDATE_HTTP".into());
        }
        return Ok(response);
    }
    Err("E_UPDATE_HTTP".into())
}

fn checksum(bytes: &[u8]) -> Result<String, String> {
    checksum_named(bytes, YT_ASSET)
}
fn checksum_named(bytes: &[u8], asset: &str) -> Result<String, String> {
    let text = std::str::from_utf8(bytes).map_err(|_| "E_UPDATE_CHECKSUM")?;
    let mut found = None;
    for line in text.lines() {
        let Some((digest, name)) = line.split_once("  ") else {
            continue;
        };
        if name != asset {
            continue;
        }
        if found.is_some() || digest.len() != 64 || !digest.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("E_UPDATE_CHECKSUM".into());
        }
        found = Some(digest.to_ascii_uppercase());
    }
    found.ok_or_else(|| "E_UPDATE_CHECKSUM".into())
}

fn verify_hash(actual: &str, expected: &str) -> Result<(), String> {
    if actual == expected {
        Ok(())
    } else {
        Err("E_UPDATE_HASH".into())
    }
}

fn read_bounded(
    mut input: impl Read,
    limit: u64,
    control: &Control,
    mut output: impl Write,
    mut progress: impl FnMut(u64),
) -> Result<(u64, String), String> {
    let mut size = 0_u64;
    let mut hash = Sha256::new();
    let mut buffer = [0_u8; 65536];
    loop {
        if control.is_cancelled() {
            return Err("E_UPDATE_CANCELLED".into());
        }
        let n = input.read(&mut buffer).map_err(|error| {
            if error.kind() == std::io::ErrorKind::TimedOut { "E_UPDATE_TIMEOUT" } else { "E_UPDATE_NETWORK" }
        })?;
        if n == 0 {
            break;
        }
        size = size.checked_add(n as u64).ok_or("E_UPDATE_SIZE")?;
        if size > limit {
            return Err("E_UPDATE_SIZE".into());
        }
        hash.update(&buffer[..n]);
        output
            .write_all(&buffer[..n])
            .map_err(|_| "E_UPDATE_STORAGE")?;
        progress(size);
    }
    if size == 0 {
        return Err("E_UPDATE_SIZE".into());
    }
    Ok((size, format!("{:X}", hash.finalize())))
}

fn cached_artifact(
    root: &Path,
    file_name: &str,
    expected: &str,
    control: &Control,
) -> Result<Option<(PathBuf, u64, File)>, String> {
    let entries = fs::read_dir(root).map_err(|_| "E_UPDATE_STORAGE")?;
    for entry in entries.take(128) {
        if control.is_cancelled() {
            return Err("E_UPDATE_CANCELLED".into());
        }
        let entry = entry.map_err(|_| "E_UPDATE_STORAGE")?;
        if !entry.file_name().to_string_lossy().starts_with("runtime-")
            || runtime::typed_safe_existing_dir(&entry.path()).is_err()
        {
            continue;
        }
        let path = entry.path().join(file_name);
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_EXECUTABLE {
            continue;
        }
        if let Ok(guard) = runtime::check_file(&path, expected) {
            let size = guard.metadata().map_err(|_| "E_UPDATE_STORAGE")?.len();
            if size > 0 && size <= MAX_EXECUTABLE {
                return Ok(Some((path, size, guard)));
            }
        }
    }
    Ok(None)
}

// Marker fields only select a candidate; RuntimeManager authenticates its complete catalog/files.
// Keeping the identity guard avoids hashing a healthy selected asset twice on restart.
fn cached_artifact_hint(root: &Path, file_name: &str, component_name: &str, expected: &str, control: &Control) -> Result<Option<(PathBuf, u64, File)>, String> {
    for entry in fs::read_dir(root).map_err(|_| "E_UPDATE_STORAGE")?.take(128) {
        if control.is_cancelled() { return Err("E_UPDATE_CANCELLED".into()); }
        let entry = entry.map_err(|_| "E_UPDATE_STORAGE")?;
        if !entry.file_name().to_string_lossy().starts_with("runtime-") || runtime::typed_safe_existing_dir(&entry.path()).is_err() { continue; }
        let marker = entry.path().join("complete.json");
        let Ok(metadata) = fs::symlink_metadata(&marker) else { continue; };
        if !super::is_plain_file(&metadata) || metadata.len() > 65536 { continue; }
        let Ok(file) = runtime::open_identity_file(&marker) else { continue; };
        let Ok(manifest) = serde_json::from_reader::<_, runtime::Manifest>(file.take(65537)) else { continue; };
        if !manifest.components.iter().any(|component| component.name == component_name && component.sha256 == expected) { continue; }
        let path = entry.path().join(file_name);
        let Ok(metadata) = fs::symlink_metadata(&path) else { continue; };
        if !super::is_plain_file(&metadata) { continue; }
        let Ok(guard) = runtime::open_identity_file(&path) else { continue; };
        let metadata = guard.metadata().map_err(|_| "E_UPDATE_STORAGE")?;
        if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_EXECUTABLE { continue; }
        return Ok(Some((path, metadata.len(), guard)));
    }
    Ok(None)
}

fn release_base(downloader: Downloader, version: &str) -> String {
    match downloader {
        Downloader::YtDlp => format!("https://github.com/yt-dlp/yt-dlp/releases/download/{version}"),
        Downloader::GalleryDl => format!("https://codeberg.org/mikf/gallery-dl/releases/download/v{version}"),
    }
}
fn asset_name(downloader: Downloader, version: &str) -> String {
    match downloader {
        Downloader::YtDlp => YT_ASSET.into(),
        #[cfg(windows)]
        Downloader::GalleryDl => { let _ = version; "gallery-dl.exe".into() }
        #[cfg(target_os = "macos")]
        Downloader::GalleryDl => format!("gallery_dl-{version}-py3-none-any.whl"),
    }
}
fn tool_name(downloader: Downloader) -> &'static str {
    match downloader {
        Downloader::YtDlp => YT_FILE,
        #[cfg(windows)]
        Downloader::GalleryDl => "gallery-dl.exe",
        #[cfg(target_os = "macos")]
        Downloader::GalleryDl => "gallery-dl",
    }
}

pub(crate) fn prepare_selected_diagnosed(
    root: PathBuf, selection: &super::runtime_update::Selection, allow_acquire: bool,
    requirements: &TrustedRuntimeRequirements, control: &Control,
    observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>, progress: impl FnMut(PreparationSnapshot),
) -> Result<Arc<RuntimeLease>, RuntimeUpdateFailure> {
    let mut failure = RuntimeUpdateFailure::new(selection.downloader, UpdateStage::Unknown, UpdateService::Unknown);
    prepare_selected_inner(root, selection, allow_acquire, requirements, control, observer, progress, &mut failure)
        .map_err(|error| {
            if failure.category == UpdateErrorCategory::Unknown { failure.classify(&error); }
            let component_name = failure.component.map(|component| match component {
                RuntimeComponent::YtDlp => "yt-dlp", RuntimeComponent::GalleryDl => "gallery-dl",
                RuntimeComponent::Deno => "deno", RuntimeComponent::Ffmpeg => "ffmpeg", RuntimeComponent::Runtime => "runtime",
            });
            failure.target_version = match failure.component {
                Some(RuntimeComponent::YtDlp) => selection.version_for(Downloader::YtDlp).map(str::to_owned),
                Some(RuntimeComponent::GalleryDl) => selection.version_for(Downloader::GalleryDl).map(str::to_owned),
                _ => None,
            }.or_else(|| runtime::manifest().ok().and_then(|manifest| manifest.components.into_iter()
                .find(|component| Some(component.name.as_str()) == component_name).map(|component| component.version)));
            failure.downloader = selection.downloader;
            failure
        })
}

fn set_context(failure: &mut RuntimeUpdateFailure, downloader: Downloader, stage: UpdateStage, service: UpdateService) {
    *failure = RuntimeUpdateFailure::new(downloader, stage, service);
}

fn preparation_error(failure: &mut RuntimeUpdateFailure, error: &PreparationFailure) {
    failure.component = Some(error.component);
    if let Some(downloader) = match error.component { RuntimeComponent::YtDlp => Some(Downloader::YtDlp), RuntimeComponent::GalleryDl => Some(Downloader::GalleryDl), _ => None } {
        failure.downloader = downloader;
    }
    failure.stage = match error.stage {
        PreparationStage::Acquire => UpdateStage::Download,
        PreparationStage::Verify | PreparationStage::Extract | PreparationStage::Probe | PreparationStage::Cache => UpdateStage::Verify,
        PreparationStage::Publish => UpdateStage::Activate,
    };
    failure.service = UpdateService::Unknown;
    failure.http_status = error.http_status;
    failure.retry_after_seconds = None;
    failure.retry_at_unix_seconds = None;
    failure.category = match error.category {
        ErrorCategory::Timeout => UpdateErrorCategory::Timeout,
        ErrorCategory::Connect => UpdateErrorCategory::Connect,
        ErrorCategory::ProxyRouting => UpdateErrorCategory::Route,
        ErrorCategory::Http => UpdateErrorCategory::Http,
        ErrorCategory::Size => UpdateErrorCategory::Size,
        ErrorCategory::Hash => UpdateErrorCategory::Hash,
        ErrorCategory::Probe => UpdateErrorCategory::Probe,
        ErrorCategory::Permission | ErrorCategory::Storage => UpdateErrorCategory::Storage,
        ErrorCategory::Cancelled => UpdateErrorCategory::Cancelled,
        ErrorCategory::Extract | ErrorCategory::Unknown => UpdateErrorCategory::Unknown,
    };
}

fn matches_recommended(selection: &super::runtime_update::Selection, catalog: &runtime::Manifest) -> bool {
    [Downloader::YtDlp, Downloader::GalleryDl].into_iter().all(|downloader| {
        selection.version_for(downloader).is_none_or(|version| catalog.components.iter()
            .any(|component| component.name == downloader.label() && component.version == version))
    })
}

fn prepare_selected_inner(
    root: PathBuf, selection: &super::runtime_update::Selection, allow_acquire: bool,
    requirements: &TrustedRuntimeRequirements, control: &Control,
    observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>, mut progress: impl FnMut(PreparationSnapshot),
    failure: &mut RuntimeUpdateFailure,
) -> Result<Arc<RuntimeLease>, String> {
    set_context(failure, selection.downloader, UpdateStage::Verify, UpdateService::Local);
    runtime::check_data_location(&root)?;
    runtime::safe_dir(&root).map_err(|_| "E_UPDATE_STORAGE")?;
    let mut catalog = runtime::manifest().map_err(|_| "E_UPDATE_MANIFEST")?;
    // Matching selections use compiled trust, so a new recommended dependency can be prepared on restart.
    if matches_recommended(selection, &catalog) {
        return RuntimeManager::new(root).prepare_observed(requirements, control, observer, progress)
            .map_err(|error| { preparation_error(failure, &error); failure.code().to_owned() });
    }
    if allow_acquire && let Some(version) = selection.version_for(selection.downloader) {
        let installability = super::upstream::query_installability_diagnosed(selection.downloader, version)
            .map_err(|error| { *failure = error; failure.code() })?;
        if installability != super::upstream::Installability::Installable {
            set_context(failure, selection.downloader, UpdateStage::CheckVersion, UpdateService::Unknown);
            return Err("E_UPDATE_REQUIRES_AMEOW".into());
        }
    }
    set_context(failure, selection.downloader, UpdateStage::Verify, UpdateService::Local);
    let temp = tempfile::Builder::new().prefix("candidate-").tempdir_in(&root).map_err(|_| "E_UPDATE_STORAGE")?;
    let mut artifacts = Vec::new();
    let mut proofs = Vec::new();
    let mut guards = Vec::new();
    for downloader in [Downloader::YtDlp, Downloader::GalleryDl] {
        let Some(version) = selection.version_for(downloader) else { continue; };
        set_context(failure, downloader, UpdateStage::FetchMetadata, UpdateService::Local);
        let normalized = match downloader {
            Downloader::YtDlp => normalize_stable_version(version),
            Downloader::GalleryDl => super::runtime_update::normalize_gallery_version(version),
        }.ok_or("E_UPDATE_VERSION")?;
        if normalized != version { return Err("E_UPDATE_VERSION".into()); }
        let file_name = tool_name(downloader);
        if !requirements.contains(file_name) { return Err("E_UPDATE_REQUIREMENTS".into()); }
        let component_id = RuntimeComponent::from_name(downloader.label());
        let mut snapshot = PreparationSnapshot::default();
        snapshot.observe(PreparationPhase::Preparing, Some(component_id), PreparationStage::Cache, 0, None, None);
        progress(snapshot.clone());
        let (proof, new_proof) = signed_release_for(&root, downloader, version, |url, limit| {
            let mut bytes = Vec::new();
            set_context(failure, downloader, UpdateStage::FetchMetadata, UpdateService::from_url(url));
            read_bounded(get(url, control, failure)?, limit, control, &mut bytes, |_| {})?;
            Ok(bytes)
        }).map_err(|error| {
            if matches!(error.as_str(), "E_UPDATE_SIGNATURE" | "E_UPDATE_CHECKSUM") {
                set_context(failure, downloader, UpdateStage::Verify, UpdateService::Local);
            }
            error
        })?;
        set_context(failure, downloader, UpdateStage::Verify, UpdateService::Local);
        let expected = proof.checksum_for(downloader, version)?;
        let asset = asset_name(downloader, version);
        let base = release_base(downloader, version);
        #[cfg(target_os = "macos")]
        let cached_name = if downloader == Downloader::GalleryDl { "gallery-dl.artifact" } else { file_name };
        #[cfg(not(target_os = "macos"))]
        let cached_name = file_name;
        let cached = cached_artifact_hint(&root, cached_name, downloader.label(), &expected, control)?;
        let cached = if cached.is_none() && allow_acquire { cached_artifact(&root, cached_name, &expected, control)? } else { cached };
        let (artifact, size) = if let Some((path, size, guard)) = cached {
            guards.push(guard); (path, size)
        } else {
            if !allow_acquire { return Err("E_UPDATE_CACHE".into()); }
            let artifact = temp.path().join(&asset);
            let mut file = File::create(&artifact).map_err(|_| "E_UPDATE_STORAGE")?;
            set_context(failure, downloader, UpdateStage::Download, UpdateService::from_url(&base));
            let response = get(&format!("{base}/{asset}"), control, failure)?;
            let total = response.content_length().filter(|n| *n > 0 && *n <= MAX_EXECUTABLE);
            let (size, actual) = read_bounded(response, MAX_EXECUTABLE, control, &mut file, |bytes| {
                snapshot.observe(PreparationPhase::Downloading, Some(component_id), PreparationStage::Acquire, bytes, total, None);
                progress(snapshot.clone());
            })?;
            file.sync_all().map_err(|_| "E_UPDATE_STORAGE")?;
            set_context(failure, downloader, UpdateStage::Verify, UpdateService::Local);
            verify_hash(&actual, &expected)?;
            (artifact, size)
        };
        snapshot.observe(PreparationPhase::Verifying, Some(component_id), PreparationStage::Verify, size, Some(size), None);
        progress(snapshot);
        let component = catalog.components.iter_mut().find(|c| c.name == downloader.label()).ok_or("E_UPDATE_MANIFEST")?;
        if component.files.len() != 1 || component.files[0].name != file_name || component.files[0].archive_path.is_some() {
            return Err("E_UPDATE_MANIFEST".into());
        }
        component.version = version.into(); component.bytes = size; component.sha256 = expected.clone();
        component.url = format!("{base}/{asset}");
        component.source = match downloader {
            Downloader::YtDlp => format!("https://github.com/yt-dlp/yt-dlp/tree/{version}"),
            Downloader::GalleryDl => format!("https://codeberg.org/mikf/gallery-dl/src/tag/v{version}"),
        };
        #[cfg(windows)]
        { component.files[0].sha256 = expected; }
        #[cfg(target_os = "macos")]
        if downloader == Downloader::YtDlp { component.files[0].sha256 = expected; }
        component.files[0].version_contains = version.into();
        artifacts.push((downloader.label().to_owned(), artifact, file_name.to_owned()));
        if new_proof { proofs.push((downloader, proof, if downloader == Downloader::YtDlp { version.to_owned() } else { format!("gallery-{version}") })); }
    }
    set_context(failure, selection.downloader, UpdateStage::Verify, UpdateService::Local);
    let lease = RuntimeManager::candidates(root.clone(), catalog, artifacts, allow_acquire)
        .prepare_observed(requirements, control, observer, |event| {
            if let Some(component) = event.component {
                failure.component = Some(component);
                match component { RuntimeComponent::YtDlp => failure.downloader = Downloader::YtDlp, RuntimeComponent::GalleryDl => failure.downloader = Downloader::GalleryDl, _ => {} }
            }
            progress(event);
        }).map_err(|error| { preparation_error(failure, &error); failure.code().to_owned() })?;
    for (downloader, proof, name) in proofs {
        set_context(failure, downloader, UpdateStage::Activate, UpdateService::Local);
        proof.persist(&root, &name)?;
    }
    Ok(lease)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matching_selected_versions_use_compiled_recommendation_without_changing_intent() {
        let catalog = runtime::manifest().unwrap();
        let mut selection = super::super::runtime_update::Selection::default();
        for downloader in [Downloader::YtDlp, Downloader::GalleryDl] {
            let version = catalog.components.iter().find(|component| component.name == downloader.label()).unwrap().version.clone();
            selection.select(downloader, Some(version));
            let before = serde_json::to_vec(&selection).unwrap();
            assert!(matches_recommended(&selection, &catalog));
            assert_eq!(serde_json::to_vec(&selection).unwrap(), before);
        }
        selection.select(Downloader::YtDlp, Some("2026.10.26".into()));
        assert!(!matches_recommended(&selection, &catalog));
        selection.select(Downloader::YtDlp, None);
        assert!(matches_recommended(&selection, &catalog));
        selection.select(Downloader::GalleryDl, Some("1.32.20".into()));
        assert!(!matches_recommended(&selection, &catalog));
        selection.select(Downloader::GalleryDl, None);
        assert!(matches_recommended(&selection, &catalog));
    }
    #[test]
    fn offline_missing_selected_asset_keeps_cache_error_and_its_own_target() {
        let root = tempfile::tempdir().unwrap();
        authentic_proof().persist(root.path(), "2026.10.26").unwrap();
        let mut selection = super::super::runtime_update::Selection::default();
        selection.select(Downloader::YtDlp, Some("2026.10.26".into()));
        let requirements = TrustedRuntimeRequirements::compiled(&[(YT_FILE, &["--version"])], &[]);
        let error = prepare_selected_diagnosed(root.path().to_owned(), &selection, false, &requirements,
            &Control::default(), Arc::new(|_| {}), |_| {}).err().unwrap();
        assert_eq!(error.category, UpdateErrorCategory::Cache);
        assert_eq!(error.code(), "E_UPDATE_CACHE");
        assert_eq!(error.target_version.as_deref(), Some("2026.10.26"));
        assert_eq!(error.component, Some(RuntimeComponent::YtDlp));
    }
    #[test]
    fn typed_preparation_failure_retains_component_stage_and_category() {
        let mut diagnostic = RuntimeUpdateFailure::new(Downloader::YtDlp, UpdateStage::Download, UpdateService::GitHub);
        diagnostic.http_status = Some(429);
        diagnostic.retry_after_seconds = Some(20);
        let error = PreparationFailure::new(RuntimeComponent::GalleryDl, PreparationStage::Probe, ErrorCategory::Probe);
        preparation_error(&mut diagnostic, &error);
        assert_eq!(diagnostic.downloader, Downloader::GalleryDl);
        assert_eq!(diagnostic.stage, UpdateStage::Verify);
        assert_eq!(diagnostic.category, UpdateErrorCategory::Probe);
        assert_eq!(diagnostic.http_status, None);
        assert_eq!(diagnostic.retry_after_seconds, None);
        let deno = PreparationFailure::new(RuntimeComponent::Deno, PreparationStage::Probe, ErrorCategory::Probe);
        preparation_error(&mut diagnostic, &deno);
        assert_eq!(diagnostic.component, Some(RuntimeComponent::Deno));
    }
    #[test]
    fn gallery_proof_is_authenticated_offline_and_names_the_platform_asset() {
        let root = tempfile::tempdir().unwrap();
        let proof = ReleaseProof {
            sums: include_bytes!("../../assets/test/gallery-dl-1.32.21-SHA256SUMS").to_vec(),
            signature: include_bytes!("../../assets/test/gallery-dl-1.32.21-SHA256SUMS.sig").to_vec(),
        };
        assert!(proof.checksum_for(Downloader::GalleryDl, "1.32.21").is_ok());
        assert!(proof.checksum_for(Downloader::YtDlp, "1.32.21").is_err());
        proof.persist(root.path(), "gallery-1.32.21").unwrap();
        let (_, fresh) = signed_release_for(root.path(), Downloader::GalleryDl, "1.32.21", |_, _| panic!("authentic gallery proof must work offline")).unwrap();
        assert!(!fresh);
        let mut damaged = proof.encode(); damaged[16] ^= 1;
        fs::write(root.path().join("release-proofs/gallery-1.32.21.proof"), damaged).unwrap();
        assert!(signed_release_for(root.path(), Downloader::GalleryDl, "1.32.21", |_, _| panic!("damaged proof must fail closed")).is_err());
    }
    fn authentic_proof() -> ReleaseProof {
        ReleaseProof {
            sums: include_bytes!("../../assets/test/yt-dlp-2026.10.26-SHA2-256SUMS").to_vec(),
            signature: include_bytes!("../../assets/test/yt-dlp-2026.10.26-SHA2-256SUMS.sig").to_vec(),
        }
    }

    #[test]
    fn offline_proof_is_reauthenticated_without_fetching_and_tampering_fails_closed() {
        let root = tempfile::tempdir().unwrap();
        let proof = authentic_proof();
        proof.persist(root.path(), "2026.10.26").unwrap();
        let (cached, new) = signed_release(root.path(), "2026.10.26", |_, _| panic!("offline cache must not fetch")).unwrap();
        assert!(!new);
        #[cfg(windows)]
        let expected = "F5389D3698ECDE4EF06F4E6B1CE0294FE9AC1396228C8990B8D3416D6D177A7D";
        #[cfg(target_os = "macos")]
        let expected = "E51E69E89489F199530F13D32A4342DA3DDB2CF34842F364603A066DB05AFBF3";
        assert_eq!(cached.checksum().unwrap(), expected);
        let mut tampered = proof.encode();
        tampered[16] ^= 1;
        fs::write(root.path().join("release-proofs/2026.10.26.proof"), tampered).unwrap();
        assert!(signed_release(root.path(), "2026.10.26", |_, _| panic!("tampered proof must not fetch or silently repair")).is_err());
    }

    #[test]
    fn legacy_bootstrap_fetches_only_signed_metadata_and_does_not_publish_before_probes() {
        let root = tempfile::tempdir().unwrap();
        let fixture = authentic_proof();
        let mut urls = Vec::new();
        let (proof, new) = signed_release(root.path(), "2026.10.26", |url, _| {
            urls.push(url.to_owned());
            Ok(if url.ends_with(".sig") { fixture.signature.clone() } else { fixture.sums.clone() })
        }).unwrap();
        assert!(new);
        assert_eq!(urls.len(), 2);
        assert!(urls.iter().all(|url| url.starts_with("https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/SHA2-256SUMS")));
        assert!(proof.checksum().is_ok());
        assert!(!root.path().join("release-proofs").exists());
        assert!(ReleaseProof::decode(&proof.encode()[..15]).is_err());
        let mut extra = proof.encode();
        extra.push(0);
        assert!(ReleaseProof::decode(&extra).is_err());
    }

    #[test]
    fn forged_unsigned_local_proof_cannot_supply_a_digest() {
        let proof = ReleaseProof { sums: format!("{}  yt-dlp.exe\n", "0".repeat(64)).into_bytes(), signature: vec![0; 128] };
        assert!(ReleaseProof::decode(&proof.encode()).is_err());
    }
    #[test]
    fn trusted_hosts_and_checksum_are_strict() {
        for u in [
            "https://github.com/a",
            "https://release-assets.githubusercontent.com/a?sig=x",
        ] {
            assert!(allowed(&Url::parse(u).unwrap()));
        }
        for u in [
            "http://github.com/a",
            "https://github.com.evil/a",
            "https://user@github.com/a",
            "https://github.com:444/a",
            "https://example.com/a",
        ] {
            assert!(!allowed(&Url::parse(u).unwrap()));
        }
        let hash = "a".repeat(64);
        assert_eq!(
            checksum(format!("{hash}  {YT_ASSET}\n").as_bytes()).unwrap(),
            hash.to_ascii_uppercase()
        );
        for s in [
            format!("{hash}  other.exe"),
            format!("{hash}  {YT_ASSET}\n{hash}  {YT_ASSET}"),
            format!("xyz  {YT_ASSET}"),
        ] {
            assert!(checksum(s.as_bytes()).is_err());
        }
    }
    #[test]
    fn bounded_asset_reads_hash_actual_bytes_and_rejects_oversize() {
        let control = Control::default();
        let mut out = Vec::new();
        let mut updates = Vec::new();
        let (size, hash) =
            read_bounded(&b"abc"[..], 3, &control, &mut out, |n| updates.push(n)).unwrap();
        assert_eq!(size, 3);
        assert_eq!(updates, vec![3]);
        assert_eq!(hash, runtime::hash(&b"abc"[..]).unwrap());
        assert!(verify_hash(&hash, &hash).is_ok());
        assert_eq!(
            verify_hash(&hash, &"0".repeat(64)),
            Err("E_UPDATE_HASH".into())
        );
        assert!(read_bounded(&b"abcd"[..], 3, &control, Vec::new(), |_| {}).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn cached_artifact_requires_official_hash_and_retains_read_only_guard() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("runtime-test");
        fs::create_dir(&dir).unwrap();
        fs::write(dir.join("yt-dlp.exe"), b"verified").unwrap();
        let expected = runtime::hash(&b"verified"[..]).unwrap();
        let (_, size, guard) = cached_artifact(root.path(), YT_FILE, &expected, &Control::default())
            .unwrap()
            .unwrap();
        assert_eq!(size, 8);
        assert!(
            fs::OpenOptions::new()
                .write(true)
                .open(dir.join("yt-dlp.exe"))
                .is_err()
        );
        drop(guard);
        assert!(
            cached_artifact(root.path(), YT_FILE, &"0".repeat(64), &Control::default())
                .unwrap()
                .is_none()
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn cached_zipapp_is_rechecked_against_the_expected_hash() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("runtime-test");
        fs::create_dir(&directory).unwrap();
        let artifact = directory.join(YT_FILE);
        fs::write(&artifact, b"verified").unwrap();
        let expected = runtime::hash(&b"verified"[..]).unwrap();
        let (path, size, guard) = cached_artifact(root.path(), YT_FILE, &expected, &Control::default())
            .unwrap().unwrap();
        assert_eq!(path, artifact);
        assert_eq!(size, 8);
        drop(guard);
        fs::write(&artifact, b"tampered").unwrap();
        assert!(cached_artifact(root.path(), YT_FILE, &expected, &Control::default()).unwrap().is_none());
    }
}
