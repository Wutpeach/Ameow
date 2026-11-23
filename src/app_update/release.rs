//! Offline release preparation. No publishing or production key activation.
use super::package::{BUNDLE_DOMAIN, DOMAIN, MAX_PACKAGE, WINDOWS_TARGET as TARGET, BundleFile, WindowsBundle, hash, unhex};
use super::store::plain;
use super::{Manifest, Release, SignedManifest, State, Trust, Version};
use ring::signature::{ED25519, Ed25519KeyPair, KeyPair, UnparsedPublicKey};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::Path,
};

const IDENTITY_DOMAIN: &[u8] = b"Ameow controlled release identity v1\n";
const FIXTURE_PUBLIC: &str = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const MARKER: &[u8] = b"SYNTHETIC TEST FIXTURE - NOT FOR DISTRIBUTION\nSigned with the public RFC test key; never a production release.\n";
type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FileRecord {
    pub path: String,
    pub bytes: u64,
    pub sha256: String,
}
impl FileRecord {
    pub fn of(path: &str, bytes: &[u8]) -> Self {
        Self {
            path: path.into(),
            bytes: bytes.len() as u64,
            sha256: hash(bytes),
        }
    }
    fn check(&self, bytes: &[u8]) -> Result<()> {
        if self.bytes == 0
            || self.bytes > MAX_PACKAGE
            || self.bytes != bytes.len() as u64
            || self.sha256 != hash(bytes)
        {
            return Err("E_RELEASE_FILE_HASH".into());
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicRoots {
    pub schema: u32,
    pub keys: Vec<String>,
}
impl PublicRoots {
    fn trust(&self) -> Result<Trust> {
        if self.schema != 1 {
            return Err("E_RELEASE_TRUST_SCHEMA".into());
        }
        if !cfg!(any(
            test,
            all(feature = "app-update-fixture", debug_assertions)
        )) && self.keys.iter().any(|k| k == FIXTURE_PUBLIC)
        {
            return Err("E_RELEASE_TEST_KEY".into());
        }
        Trust::offline(&self.keys)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Build {
    pub schema: u32,
    pub version: String,
    pub target: String,
    pub commit: String,
    pub tree: String,
    pub tag: Option<String>,
    pub dirty: bool,
    pub source_sha256: String,
    pub cargo_lock_sha256: String,
    pub toolchain: String,
    pub trust: PublicRoots,
    pub app: FileRecord,
    pub launcher: FileRecord,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cli: Option<FileRecord>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub browser: Vec<FileRecord>,
    pub notices: Vec<FileRecord>,
}
impl Build {
    fn is_fixture(&self) -> bool {
        self.trust.keys.iter().any(|key| key == FIXTURE_PUBLIC)
    }
    fn validate(&self) -> Result<()> {
        Version::parse(&self.version)?;
        if !cfg!(any(
            test,
            all(feature = "app-update-fixture", debug_assertions)
        )) {
            let compiled: PublicRoots =
                serde_json::from_slice(include_bytes!("../../assets/app-update-trust.json"))
                    .map_err(err)?;
            if self.version != super::BUILD_VERSION || encode(&self.trust)? != encode(&compiled)? {
                return Err("E_RELEASE_COMPILED_IDENTITY".into());
            }
        }
        if !matches!((self.schema, &self.cli, self.browser.is_empty()), (1, None, true) | (2, Some(_), true) | (3, Some(_), false))
            || (!self.is_fixture() && !cfg!(test) && self.schema != 3)
            || self.target != TARGET
            || self.toolchain != "1.98.1"
            || self.app.path != "Ameow.exe"
            || self.launcher.path != "AmeowLauncher.exe"
            || self.cli.as_ref().is_some_and(|cli| cli.path != "ameow-cli.exe")
        {
            return Err("E_RELEASE_BUILD_IDENTITY".into());
        }
        unhex(&self.commit, 20)?;
        unhex(&self.tree, 20)?;
        unhex(&self.source_sha256, 32)?;
        unhex(&self.cargo_lock_sha256, 32)?;
        if self
            .tag
            .as_ref()
            .is_some_and(|tag| tag != &format!("v{}", self.version) || self.dirty)
        {
            return Err("E_RELEASE_TAG".into());
        }
        self.trust.trust()?;
        if self.schema == 3 {
            let required = BTreeSet::from(["ameow-browser-host.exe", "browser-extension/manifest.json", "browser-extension/background.js", "browser-extension/popup.js", "browser-extension/popup.html", "browser-extension/popup.css", "browser-extension/build.json", "browser-extension/LICENSES.txt", "browser-extension/page.js", "browser-extension/page.css", "browser-extension/ameow-cat.svg", "browser-extension/icons/16.png", "browser-extension/icons/24.png", "browser-extension/icons/32.png", "browser-extension/icons/48.png", "browser-extension/icons/128.png"]);
            let names: BTreeSet<_> = self.browser.iter().map(|r| r.path.as_str()).collect();
            if names != required || self.browser.len() != required.len() { return Err("E_RELEASE_BROWSER_ASSETS".into()); }
            for record in &self.browser { unhex(&record.sha256, 32)?; }
        }
        let mut names = BTreeSet::new();
        for notice in &self.notices {
            safe_member(&notice.path)?;
            if !(notice.path == "LICENSE"
                || notice.path.starts_with("licenses/")
                    && [".txt", ".md", ".json"]
                        .iter()
                        .any(|suffix| notice.path.ends_with(suffix)))
                || !names.insert(notice.path.to_ascii_lowercase())
            {
                return Err("E_RELEASE_NOTICE".into());
            }
            unhex(&notice.sha256, 32)?;
        }
        if !names.contains("license")
            || !names.contains("licenses/third_party_notices.md")
            || !names.contains("licenses/license-inputs.json") {
            return Err("E_RELEASE_NOTICE".into());
        }
        Ok(())
    }
    fn validate_signed_source(&self) -> Result<()> {
        if !self.is_fixture()
            && (self.dirty || self.commit == "0".repeat(40) || self.tree == "0".repeat(40))
        {
            return Err("E_RELEASE_SOURCE_IDENTITY".into());
        }
        Ok(())
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Plan {
    build: Build,
    fixture: bool,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Identity {
    build: Build,
    update: FileRecord,
    manifest_sha256: String,
    fixture: bool,
}

fn read(path: &Path, max: u64) -> Result<Vec<u8>> {
    plain(path)?;
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(err)?
        .take(max + 1)
        .read_to_end(&mut bytes)
        .map_err(err)?;
    if bytes.len() as u64 > max {
        return Err("E_RELEASE_SIZE".into());
    }
    Ok(bytes)
}
fn write_new(path: &Path, bytes: &[u8]) -> Result<()> {
    plain(path)?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(err)?;
    file.write_all(bytes).map_err(err)?;
    file.sync_all().map_err(err)
}
fn json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    serde_json::from_slice(&read(path, 1024 * 1024)?).map_err(err)
}
fn encode(value: &impl Serialize) -> Result<Vec<u8>> {
    serde_json::to_vec_pretty(value).map_err(err)
}
fn fresh(path: &Path) -> Result<()> {
    if !path.is_absolute() {
        return Err("E_RELEASE_ABSOLUTE_PATH".into());
    }
    plain(path)?;
    fs::create_dir(path).map_err(err)
}
fn safe_member(name: &str) -> Result<()> {
    if name.is_empty()
        || name.starts_with('/')
        || name
            .split('/')
            .any(|p| p.is_empty() || p == "." || p == "..")
        || !name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_./".contains(&b))
    {
        return Err("E_RELEASE_ZIP_PATH".into());
    }
    Ok(())
}
fn archive(members: &BTreeMap<String, Vec<u8>>) -> Result<Vec<u8>> {
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    for (name, bytes) in members {
        safe_member(name)?;
        zip.start_file(
            name,
            zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated)
                .unix_permissions(0o644),
        )
        .map_err(err)?;
        zip.write_all(bytes).map_err(err)?;
    }
    Ok(zip.finish().map_err(err)?.into_inner())
}
fn members(bytes: &[u8], expected: &BTreeSet<String>) -> Result<BTreeMap<String, Vec<u8>>> {
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(err)?;
    if zip.len() != expected.len() {
        return Err("E_RELEASE_ZIP_MEMBERS".into());
    }
    let mut result = BTreeMap::new();
    let mut folded = BTreeSet::new();
    let mut total = 0u64;
    for index in 0..zip.len() {
        let mut entry = zip.by_index(index).map_err(err)?;
        let name = entry.name().to_string();
        safe_member(&name)?;
        if !expected.contains(&name)
            || !folded.insert(name.to_ascii_lowercase())
            || entry.is_dir()
            || entry
                .unix_mode()
                .is_some_and(|m| m & 0o170000 != 0 && m & 0o170000 != 0o100000)
        {
            return Err("E_RELEASE_ZIP_MEMBER".into());
        }
        total = total.checked_add(entry.size()).ok_or("E_RELEASE_SIZE")?;
        if total > MAX_PACKAGE {
            return Err("E_RELEASE_SIZE".into());
        }
        let declared = entry.size();
        let mut body = Vec::new();
        entry
            .by_ref()
            .take(declared + 1)
            .read_to_end(&mut body)
            .map_err(err)?;
        if body.len() as u64 != declared {
            return Err("E_RELEASE_ZIP_SIZE".into());
        }
        result.insert(name, body);
    }
    Ok(result)
}
fn portable_name(build: &Build) -> String {
    format!("Ameow-{}-windows-x64-portable.zip", build.version)
}
fn verify_material_inventory(build: &Build, bytes: &[u8]) -> Result<()> {
    let inventory: serde_json::Value = serde_json::from_slice(bytes).map_err(err)?;
    let materials = inventory["materials"]
        .as_array()
        .ok_or("E_RELEASE_MATERIALS")?;
    if inventory["schema"] != 1
        || materials.is_empty()
        || materials.len() + 1 != build.notices.len()
    {
        return Err("E_RELEASE_MATERIALS".into());
    }
    let mut names = BTreeSet::new();
    for material in materials {
        let name = material["destination"]
            .as_str()
            .ok_or("E_RELEASE_MATERIALS")?;
        let digest = material["sha256"]
            .as_str()
            .ok_or("E_RELEASE_MATERIALS")?;
        if name == "licenses/license-inputs.json"
            || !names.insert(name)
            || !build
                .notices
                .iter()
                .any(|n| n.path == name && n.sha256.eq_ignore_ascii_case(digest))
        {
            return Err("E_RELEASE_MATERIALS".into());
        }
    }
    Ok(())
}
fn load_build(root: &Path) -> Result<Build> {
    let build: Build = json(&root.join("release-build.json"))?;
    build.validate()?;
    build
        .app
        .check(&read(&root.join(&build.app.path), MAX_PACKAGE)?)?;
    build
        .launcher
        .check(&read(&root.join(&build.launcher.path), MAX_PACKAGE)?)?;
    if let Some(cli) = &build.cli {
        cli.check(&read(&root.join(&cli.path), MAX_PACKAGE)?)?;
    }
    for notice in build.notices.iter().chain(build.browser.iter()) {
        notice.check(&read(&root.join(&notice.path), MAX_PACKAGE)?)?;
    }
    verify_material_inventory(
        &build,
        &read(&root.join("licenses/license-inputs.json"), MAX_PACKAGE)?,
    )?;
    Ok(build)
}
/// No signatures are invented. An unconfigured build can prepare only an unsigned plan.
pub fn prepare(build_root: &Path, output: &Path) -> Result<()> {
    let build = load_build(build_root)?;
    fresh(output)?;
    for item in std::iter::once(&build.app)
        .chain(std::iter::once(&build.launcher))
        .chain(build.cli.iter())
        .chain(build.browser.iter())
        .chain(build.notices.iter())
    {
        let dest = output.join(&item.path);
        fs::create_dir_all(dest.parent().ok_or("E_RELEASE_PATH")?).map_err(err)?;
        let bytes = read(&build_root.join(&item.path), MAX_PACKAGE)?;
        item.check(&bytes)?;
        write_new(&dest, &bytes)?;
    }
    write_new(&output.join("release-build.json"), &encode(&build)?)?;
    let fixture = build.is_fixture();
    write_new(
        &output.join("unsigned-plan.json"),
        &encode(&Plan {
            build,
            fixture,
        })?,
    )?;
    verify_prepared(output).map(|_| ())
}
fn verify_prepared(root: &Path) -> Result<Plan> {
    let plan: Plan = json(&root.join("unsigned-plan.json"))?;
    if plan.fixture != plan.build.is_fixture()
        || encode(&load_build(root)?)? != encode(&plan.build)?
    {
        return Err("E_RELEASE_PLAN_IDENTITY".into());
    }
    Ok(plan)
}
fn signed(value: &impl Serialize, domain: &[u8], key: &Ed25519KeyPair) -> Result<SignedManifest> {
    let payload = serde_json::to_string(value).map_err(err)?;
    let signature = key.sign(&[domain, payload.as_bytes()].concat());
    Ok(SignedManifest {
        payload,
        signature: signature
            .as_ref()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect(),
    })
}
fn sign_with_key(
    root: &Path,
    output: &Path,
    key: &Ed25519KeyPair,
    sequence: u64,
    issued: u64,
) -> Result<()> {
    let plan = verify_prepared(root)?;
    let build = &plan.build;
    let trust = build.trust.trust()?;
    if !trust.configured() { return Err("E_APP_UPDATE_TRUST_NOT_CONFIGURED".into()); }
    build.validate_signed_source()?;
    let version = &build.version;
    let records: Vec<&FileRecord> = std::iter::once(&build.app)
        .chain(build.cli.iter()).chain(build.browser.iter()).chain(build.notices.iter()).collect();
    let bundle = WindowsBundle {
        schema: 1, product: "Ameow".into(), target: TARGET.into(), version: version.clone(),
        sequence, issued,
        launcher: BundleFile { path: "Ameow.exe".into(), bytes: build.launcher.bytes, sha256: build.launcher.sha256.clone() },
        files: records.iter().map(|record| BundleFile { path: record.path.clone(), bytes: record.bytes, sha256: record.sha256.clone() }).collect(),
    };
    let receipt = signed(&bundle, BUNDLE_DOMAIN, key)?;
    let receipt_bytes = encode(&receipt)?;
    trust.verify_bundle(&receipt_bytes, Some(super::store::now()))?;
    let receipt_hash = hash(receipt.payload.as_bytes());
    let release = Release { version: version.clone(), sequence, manifest_hash: receipt_hash.clone() };
    let state = State { pending: Some(release), highest_sequence: sequence,
        highest_manifest: receipt_hash.clone(), ..Default::default() };
    let mut files = BTreeMap::new();
    files.insert("Ameow.exe".into(), read(&root.join(&build.launcher.path), MAX_PACKAGE)?);
    for record in records {
        let bytes = read(&root.join(&record.path), MAX_PACKAGE)?;
        record.check(&bytes)?;
        files.insert(format!("versions/{version}/{}", record.path), bytes.clone());
        if record.path != "Ameow.exe" { files.insert(record.path.clone(), bytes); }
    }
    files.insert("entry.json".into(), receipt_bytes.clone());
    files.insert(format!("versions/{version}/bundle.json"), receipt_bytes);
    files.insert("state.json".into(), encode(&state)?);
    if build.is_fixture() { files.insert("FIXTURE.txt".into(), MARKER.to_vec()); }
    let portable = archive(&files)?;
    let update = FileRecord::of(&portable_name(build), &portable);
    let manifest = Manifest {
        schema: 2, product: "Ameow".into(), channel: "stable".into(), target: TARGET.into(),
        version: version.clone(), sequence, issued,
        url: format!("https://github.com/Wutpeach/Ameow/releases/download/v{version}/{}", update.path),
        package_bytes: update.bytes, package_sha256: update.sha256.clone(),
        exe_bytes: build.app.bytes, exe_sha256: build.app.sha256.clone(),
        bundle_sha256: Some(receipt_hash),
    };
    manifest.validate(Some(super::store::now()))?;
    let envelope = signed(&manifest, DOMAIN, key)?;
    let manifest_bytes = encode(&envelope)?;
    trust.verify(&manifest_bytes, Some(super::store::now()))?;
    let identity = Identity { build: build.clone(), update, manifest_sha256: hash(&manifest_bytes), fixture: build.is_fixture() };
    let identity_bytes = encode(&signed(&identity, IDENTITY_DOMAIN, key)?)?;
    fresh(output)?;
    write_new(&output.join(portable_name(build)), &portable)?;
    write_new(&output.join("manifest.json"), &manifest_bytes)?;
    write_new(&output.join("release-identity.json"), &identity_bytes)?;
    write_new(&output.join("release-build.json"), &encode(build)?)?;
    if build.is_fixture() { write_new(&output.join("FIXTURE.txt"), MARKER)?; }
    verify_signed_with_roots(output, &build.trust)
}
/// The private key stays outside every candidate directory and is never copied or logged.
pub fn sign(
    root: &Path,
    private: &Path,
    output: &Path,
    sequence: u64,
    issued: u64,
) -> Result<()> {
    offline_only()?;
    if !root.is_absolute() || !output.is_absolute() {
        return Err("E_RELEASE_ABSOLUTE_PATH".into());
    }
    let build = verify_prepared(root)?.build;
    if !build.trust.trust()?.configured() {
        return Err("E_APP_UPDATE_TRUST_NOT_CONFIGURED".into());
    }
    build.validate_signed_source()?;
    outside_git(private)?;
    let key_path = private.canonicalize().map_err(err)?;
    for directory in [
        std::path::absolute(root).map_err(err)?,
        std::path::absolute(output).map_err(err)?,
    ] {
        if key_path.starts_with(directory) {
            return Err("E_RELEASE_PRIVATE_KEY_LOCATION".into());
        }
    }
    let key =
        Ed25519KeyPair::from_pkcs8(&read(private, 4096)?).map_err(|_| "E_RELEASE_PRIVATE_KEY")?;
    sign_with_key(root, output, &key, sequence, issued)
}
pub fn verify(root: &Path) -> Result<()> {
    verify_prepared(root).map(|_| ())
}
/// Verification roots must come from the owner's trusted copy, never from the artifact.
pub fn verify_signed(root: &Path, public_roots: &Path) -> Result<()> {
    let roots: PublicRoots = json(public_roots)?;
    verify_signed_with_roots(root, &roots)
}
/// Only debug fixtures may launch a signed synthetic installation in an isolated data domain.
#[cfg(any(test, all(windows, feature = "app-update-fixture", debug_assertions)))]
pub fn verify_fixture_launcher(launcher: &Path) -> Result<()> {
    let root = launcher.parent().ok_or("E_RELEASE_PATH")?;
    if read(&root.join("FIXTURE.txt"), 1024)? != MARKER { return Err("E_RELEASE_FIXTURE_REQUIRED".into()); }
    let receipt = read(&root.join("entry.json"), 65536)?;
    let (_, bundle) = Trust::fixture().verify_bundle(&receipt, None)?;
    let record = bundle.launcher;
    FileRecord { path: record.path, bytes: record.bytes, sha256: record.sha256 }.check(&read(launcher, MAX_PACKAGE)?)
}
fn verify_signed_with_roots(root: &Path, roots: &PublicRoots) -> Result<()> {
    let build: Build = json(&root.join("release-build.json"))?;
    build.validate()?;
    build.validate_signed_source()?;
    if encode(roots)? != encode(&build.trust)? { return Err("E_RELEASE_TRUST_MISMATCH".into()); }
    let trust = roots.trust()?;
    if !trust.configured() { return Err("E_APP_UPDATE_TRUST_NOT_CONFIGURED".into()); }
    let identity_bytes = read(&root.join("release-identity.json"), 1024 * 1024)?;
    let identity_envelope: SignedManifest = serde_json::from_slice(&identity_bytes).map_err(err)?;
    let signature = unhex(&identity_envelope.signature, 64)?;
    let message = [IDENTITY_DOMAIN, identity_envelope.payload.as_bytes()].concat();
    if !roots.keys.iter().any(|key| unhex(key, 32).is_ok_and(|key|
        UnparsedPublicKey::new(&ED25519, key).verify(&message, &signature).is_ok())) {
        return Err("E_RELEASE_IDENTITY_SIGNATURE".into());
    }
    let identity: Identity = serde_json::from_str(&identity_envelope.payload).map_err(err)?;
    if identity.fixture != build.is_fixture() || encode(&identity.build)? != encode(&build)? {
        return Err("E_RELEASE_SOURCE_IDENTITY".into());
    }
    let signed_bytes = read(&root.join("manifest.json"), 16384)?;
    let (_, manifest) = trust.verify(&signed_bytes, Some(super::store::now()))?;
    if hash(&signed_bytes) != identity.manifest_sha256 || manifest.version != build.version
        || manifest.exe_sha256 != build.app.sha256 || manifest.exe_bytes != build.app.bytes
        || manifest.package_bytes != identity.update.bytes || manifest.package_sha256 != identity.update.sha256
        || identity.update.path != portable_name(&build) { return Err("E_RELEASE_MANIFEST_IDENTITY".into()); }
    let portable_bytes = read(&root.join(&identity.update.path), MAX_PACKAGE)?;
    identity.update.check(&portable_bytes)?;
    let version = &build.version;
    let records: Vec<&FileRecord> = std::iter::once(&build.app).chain(build.cli.iter())
        .chain(build.browser.iter()).chain(build.notices.iter()).collect();
    let mut expected = BTreeSet::from(["Ameow.exe".to_string(), "entry.json".to_string(), "state.json".to_string(), format!("versions/{version}/bundle.json")]);
    for record in &records {
        expected.insert(format!("versions/{version}/{}", record.path));
        if record.path != "Ameow.exe" { expected.insert(record.path.clone()); }
    }
    if build.is_fixture() { expected.insert("FIXTURE.txt".into()); }
    let files = members(&portable_bytes, &expected)?;
    build.launcher.check(&files["Ameow.exe"])?;
    for record in &records {
        record.check(&files[&format!("versions/{version}/{}", record.path)])?;
        if record.path != "Ameow.exe" { record.check(&files[&record.path])?; }
    }
    verify_material_inventory(&build, &files["licenses/license-inputs.json"])?;
    if files["entry.json"] != files[&format!("versions/{version}/bundle.json")] { return Err("E_RELEASE_BOOTSTRAP".into()); }
    let (receipt, bundle) = trust.verify_bundle(&files[&format!("versions/{version}/bundle.json")], Some(super::store::now()))?;
    let digest = hash(receipt.payload.as_bytes());
    let expected_bundle_files: BTreeMap<_, _> = records.iter().map(|r| (&r.path, (r.bytes, &r.sha256))).collect();
    let signed_bundle_files: BTreeMap<_, _> = bundle.files.iter().map(|r| (&r.path, (r.bytes, &r.sha256))).collect();
    if manifest.bundle_sha256.as_deref() != Some(digest.as_str()) || bundle.version != *version
        || bundle.sequence != manifest.sequence || bundle.launcher.sha256 != build.launcher.sha256
        || bundle.launcher.bytes != build.launcher.bytes || expected_bundle_files != signed_bundle_files {
        return Err("E_RELEASE_BUNDLE_IDENTITY".into());
    }
    let state: State = serde_json::from_slice(&files["state.json"]).map_err(err)?;
    let expected_state = State { pending: Some(Release { version: version.clone(), sequence: manifest.sequence, manifest_hash: digest.clone() }),
        highest_sequence: manifest.sequence, highest_manifest: digest, ..Default::default() };
    if encode(&state)? != encode(&expected_state)? || build.is_fixture() && files["FIXTURE.txt"] != MARKER {
        return Err("E_RELEASE_BOOTSTRAP".into());
    }
    let report = serde_json::json!({"schema":2,"fixture":build.is_fixture(),"build":build,"portable":identity.update,"update":identity.update,
        "members":files.iter().map(|(n,b)|FileRecord::of(n,b)).collect::<Vec<_>>(),"firstStart":"pending trial; real launcher Ready required"});
    println!("{}", serde_json::to_string_pretty(&report).map_err(err)?);
    Ok(())
}
fn offline_only() -> Result<()> {
    if std::env::var_os("CI").is_some() || std::env::var_os("GITHUB_ACTIONS").is_some() {
        return Err("E_RELEASE_OFFLINE_OWNER_ONLY".into());
    }
    Ok(())
}
fn outside_git(path: &Path) -> Result<()> {
    if !path.is_absolute() {
        return Err("E_RELEASE_ABSOLUTE_PATH".into());
    }
    plain(path)?;
    if path.ancestors().any(|p| p.join(".git").exists()) {
        return Err("E_RELEASE_PRIVATE_KEY_IN_GIT".into());
    }
    Ok(())
}
/// Owner-invoked only. This function is not called by CI, preparation or tests.
pub fn keygen(private: &Path, public: &Path) -> Result<()> {
    offline_only()?;
    outside_git(private)?;
    plain(public)?;
    if private.exists() || public.exists() || private == public {
        return Err("E_RELEASE_KEY_EXISTS".into());
    }
    let document = Ed25519KeyPair::generate_pkcs8(&ring::rand::SystemRandom::new())
        .map_err(|_| "E_RELEASE_RANDOM")?;
    let key = Ed25519KeyPair::from_pkcs8(document.as_ref()).map_err(|_| "E_RELEASE_PRIVATE_KEY")?;
    let hex: String = key
        .public_key()
        .as_ref()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    write_new(private, document.as_ref())?;
    write_new(public, hex.as_bytes())
}
pub fn import_public(roots: &Path, public: &Path, output: &Path) -> Result<()> {
    let mut roots: PublicRoots = json(roots)?;
    let text = String::from_utf8(read(public, 128)?).map_err(err)?;
    let key = text.trim().to_string();
    unhex(&key, 32)?;
    if key == FIXTURE_PUBLIC {
        return Err("E_RELEASE_TEST_KEY".into());
    }
    if roots.keys.contains(&key) {
        return Err("E_RELEASE_DUPLICATE_KEY".into());
    }
    roots.keys.push(key);
    roots.trust()?;
    write_new(output, &encode(&roots)?)
}
#[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
pub fn sign_fixture(
    root: &Path,
    output: &Path,
    sequence: u64,
    issued: u64,
) -> Result<()> {
    let seed = unhex(
        "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
        32,
    )?;
    let key = Ed25519KeyPair::from_seed_unchecked(&seed).map_err(|_| "E_RELEASE_FIXTURE_KEY")?;
    sign_with_key(root, output, &key, sequence, issued)
}
#[cfg(test)]
mod tests;
