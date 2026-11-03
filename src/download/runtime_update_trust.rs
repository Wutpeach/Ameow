//! Trust bootstrap for an official yt-dlp candidate. No local metadata is an authority.
use super::{
    network::{self, Route},
    preparation::{PreparationPhase, PreparationSnapshot, PreparationStage, RuntimeComponent},
    process_supervisor::{Control, ProcessObservation},
    runtime::{self, RuntimeLease, RuntimeManager, TrustedRuntimeRequirements},
    upstream::normalize_stable_version,
};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::windows::fs::{MetadataExt, OpenOptionsExt},
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use url::Url;

const MAX_SUMS: u64 = 1024 * 1024;
const MAX_EXECUTABLE: u64 = 128 * 1024 * 1024;
const MAX_SIGNATURE: u64 = 4096;
const PROOF_MAGIC: &[u8; 8] = b"AMEOWSG1";

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

    fn decode(bytes: &[u8]) -> Result<Self, String> {
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
        proof.checksum()?;
        Ok(proof)
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

fn signed_release(
    root: &Path, version: &str, mut fetch: impl FnMut(&str, u64) -> Result<Vec<u8>, String>,
) -> Result<(ReleaseProof, bool), String> {
    let dir = root.join("release-proofs");
    match fs::symlink_metadata(&dir) {
        Ok(_) => { runtime::typed_safe_existing_dir(&dir).map_err(|_| "E_UPDATE_STORAGE")?; }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("E_UPDATE_STORAGE".into()),
    }
    let path = dir.join(format!("{version}.proof"));
    match fs::symlink_metadata(&path) {
        Ok(meta) => {
            if !meta.is_file() || meta.file_attributes() & 0x400 != 0
                || meta.len() > MAX_SUMS + MAX_SIGNATURE + 16 {
                return Err("E_UPDATE_SIGNATURE".into());
            }
            let file = OpenOptions::new().read(true).share_mode(1).open(&path)
                .map_err(|_| "E_UPDATE_STORAGE")?;
            let mut bytes = Vec::new();
            file.take(MAX_SUMS + MAX_SIGNATURE + 17).read_to_end(&mut bytes)
                .map_err(|_| "E_UPDATE_STORAGE")?;
            return Ok((ReleaseProof::decode(&bytes)?, false));
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("E_UPDATE_STORAGE".into()),
    }
    let base = format!("https://github.com/yt-dlp/yt-dlp/releases/download/{version}");
    let proof = ReleaseProof {
        sums: fetch(&format!("{base}/SHA2-256SUMS"), MAX_SUMS)?,
        signature: fetch(&format!("{base}/SHA2-256SUMS.sig"), MAX_SIGNATURE)?,
    };
    proof.checksum()?;
    Ok((proof, true))
}

fn allowed(url: &Url) -> bool {
    url.scheme() == "https"
        && matches!(
            url.host_str(),
            Some("github.com" | "release-assets.githubusercontent.com")
        )
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url.fragment().is_none()
}

fn get(url: &str, control: &Control) -> Result<reqwest::blocking::Response, String> {
    let mut url = Url::parse(url).map_err(|_| "E_UPDATE_URL")?;
    for _ in 0..8 {
        if control.is_cancelled() {
            return Err("E_UPDATE_CANCELLED".into());
        }
        if !allowed(&url) {
            return Err("E_UPDATE_URL".into());
        }
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
            .map_err(|_| "E_UPDATE_NETWORK")?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or("E_UPDATE_HTTP")?;
            url = url.join(location).map_err(|_| "E_UPDATE_URL")?;
            continue;
        }
        if !response.status().is_success() {
            return Err("E_UPDATE_HTTP".into());
        }
        return Ok(response);
    }
    Err("E_UPDATE_HTTP".into())
}

fn checksum(bytes: &[u8]) -> Result<String, String> {
    let text = std::str::from_utf8(bytes).map_err(|_| "E_UPDATE_CHECKSUM")?;
    let mut found = None;
    for line in text.lines() {
        let Some((digest, name)) = line.split_once("  ") else {
            continue;
        };
        if name != "yt-dlp.exe" {
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
        let n = input.read(&mut buffer).map_err(|_| "E_UPDATE_NETWORK")?;
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
        let path = entry.path().join("yt-dlp.exe");
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

pub(crate) fn prepare_candidate(
    root: PathBuf,
    version: &str,
    allow_acquire: bool,
    requirements: &TrustedRuntimeRequirements,
    control: &Control,
    observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>,
    mut progress: impl FnMut(PreparationSnapshot),
) -> Result<Arc<RuntimeLease>, String> {
    let version = normalize_stable_version(version).ok_or("E_UPDATE_VERSION")?;
    if !requirements.contains("yt-dlp.exe") {
        return Err("E_UPDATE_REQUIREMENTS".into());
    }
    let mut snapshot = PreparationSnapshot::default();
    snapshot.observe(
        PreparationPhase::Preparing,
        Some(RuntimeComponent::YtDlp),
        PreparationStage::Cache,
        0,
        None,
        None,
    );
    progress(snapshot.clone());
    runtime::safe_dir(&root).map_err(|_| "E_UPDATE_STORAGE")?;
    let (proof, new_proof) = signed_release(&root, &version, |url, limit| {
        let mut bytes = Vec::new();
        read_bounded(get(url, control)?, limit, control, &mut bytes, |_| {})?;
        Ok(bytes)
    })?;
    let expected = proof.checksum()?;
    let base = format!("https://github.com/yt-dlp/yt-dlp/releases/download/{version}");
    let temp = tempfile::Builder::new()
        .prefix("candidate-")
        .tempdir_in(&root)
        .map_err(|_| "E_UPDATE_STORAGE")?;
    snapshot.observe(
        PreparationPhase::Verifying,
        Some(RuntimeComponent::YtDlp),
        PreparationStage::Verify,
        0,
        None,
        None,
    );
    progress(snapshot.clone());
    let (artifact, size, _guard) = if let Some((path, size, guard)) =
        cached_artifact(&root, &expected, control)?
    {
        (path, size, Some(guard))
    } else {
        if !allow_acquire { return Err("E_UPDATE_CACHE".into()); }
        let artifact = temp.path().join("yt-dlp.exe");
        let mut file = File::create(&artifact).map_err(|_| "E_UPDATE_STORAGE")?;
        snapshot.observe(
            PreparationPhase::Downloading,
            Some(RuntimeComponent::YtDlp),
            PreparationStage::Acquire,
            0,
            None,
            None,
        );
        progress(snapshot.clone());
        let response = get(&format!("{base}/yt-dlp.exe"), control)?;
        let total = response
            .content_length()
            .filter(|n| *n > 0 && *n <= MAX_EXECUTABLE);
        let (size, actual) = read_bounded(response, MAX_EXECUTABLE, control, &mut file, |bytes| {
            snapshot.observe(
                PreparationPhase::Downloading,
                Some(RuntimeComponent::YtDlp),
                PreparationStage::Acquire,
                bytes,
                total,
                None,
            );
            progress(snapshot.clone());
        })?;
        file.sync_all().map_err(|_| "E_UPDATE_STORAGE")?;
        drop(file);
        snapshot.observe(
            PreparationPhase::Verifying,
            Some(RuntimeComponent::YtDlp),
            PreparationStage::Verify,
            size,
            Some(size),
            None,
        );
        progress(snapshot.clone());
        verify_hash(&actual, &expected)?;
        (artifact, size, None)
    };
    let mut catalog = runtime::manifest().map_err(|_| "E_UPDATE_MANIFEST")?;
    let mut matches = catalog.components.iter_mut().filter(|c| c.name == "yt-dlp");
    let component = matches.next().ok_or("E_UPDATE_MANIFEST")?;
    if component.files.len() != 1
        || component.files[0].name != "yt-dlp.exe"
        || component.files[0].archive_path.is_some()
    {
        return Err("E_UPDATE_MANIFEST".into());
    }
    component.version = version.clone();
    component.url = format!("{base}/yt-dlp.exe");
    component.source = format!("https://github.com/yt-dlp/yt-dlp/tree/{version}");
    component.bytes = size;
    component.sha256 = expected.clone();
    component.files[0].sha256 = expected;
    component.files[0].version_contains = version.clone();
    if matches.next().is_some() {
        return Err("E_UPDATE_MANIFEST".into());
    }
    let lease = RuntimeManager::candidate(root.clone(), catalog, artifact, "yt-dlp", "yt-dlp.exe", allow_acquire)
        .prepare_observed(requirements, control, observer, progress)
        .map_err(|e| e.to_string())?;
    // The signed proof is durable only after the entire local runtime passes its probes.
    if new_proof { proof.persist(&root, &version)?; }
    Ok(lease)
}

#[cfg(test)]
mod tests {
    use super::*;
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
        assert_eq!(cached.checksum().unwrap(), "F5389D3698ECDE4EF06F4E6B1CE0294FE9AC1396228C8990B8D3416D6D177A7D");
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
            checksum(format!("{hash}  yt-dlp.exe\n").as_bytes()).unwrap(),
            hash.to_ascii_uppercase()
        );
        for s in [
            format!("{hash}  other.exe"),
            format!("{hash}  yt-dlp.exe\n{hash}  yt-dlp.exe"),
            "xyz  yt-dlp.exe".into(),
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
    #[test]
    fn cached_artifact_requires_official_hash_and_retains_read_only_guard() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("runtime-test");
        fs::create_dir(&dir).unwrap();
        fs::write(dir.join("yt-dlp.exe"), b"verified").unwrap();
        let expected = runtime::hash(&b"verified"[..]).unwrap();
        let (_, size, guard) = cached_artifact(root.path(), &expected, &Control::default())
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
            cached_artifact(root.path(), &"0".repeat(64), &Control::default())
                .unwrap()
                .is_none()
        );
    }
}
