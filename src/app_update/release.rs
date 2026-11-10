//! Offline release preparation. No publishing or production key activation.
use super::package::{DOMAIN, MAX_PACKAGE, hash, unhex};
use super::store::plain;
use super::{Manifest, Release, SignedManifest, State, TARGET, Trust, Version};
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
const MARKER: &[u8] = b"CONTROLLED LOCAL PREPARATION - NOT FOR DISTRIBUTION\nPublic Gate B remains blocked. License/product/ordinary-user acceptance is not granted.\n";
const GUIDE: &[u8] = b"Ameow controlled portable candidate\nExtract the entire ZIP into a NEW writable directory. Start AmeowLauncher.exe; do not launch versions/*/Ameow.exe directly.\nRecommended future location: %LOCALAPPDATA%/Programs/Ameow. User data stays in %LOCALAPPDATA%/Ameow.\nThe first start is an unconfirmed signed trial; only the application's real Ready handshake confirms it. Missing/untrusted signatures fail closed.\nNo managed runtimes, caches or downloads are bundled. No administrator rights or installer are required by this layout.\nThis controlled artifact is not authorized for distribution.\n";
const PUBLIC_GUIDE: &[u8] = b"Ameow for Windows x64\nExtract the entire ZIP into a new writable directory, then start AmeowLauncher.exe. Keep the complete folder together; do not start versions/*/Ameow.exe directly.\nUser data stays in %LOCALAPPDATA%/Ameow. No administrator rights are required.\nThe first start verifies the signed application and confirms it only after successful startup.\nThird-party notices are in LICENSE, licenses/ and Settings > About. Runtime components are downloaded separately when needed.\n";
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
    pub public_gate_b: String,
    pub license_review: String,
    pub trust: PublicRoots,
    pub app: FileRecord,
    pub launcher: FileRecord,
    pub notices: Vec<FileRecord>,
}
impl Build {
    fn is_public(&self) -> bool {
        self.public_gate_b == "approved"
    }
    fn guide(&self) -> &'static [u8] {
        if self.is_public() {
            PUBLIC_GUIDE
        } else {
            GUIDE
        }
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
        if self.schema != 1
            || self.target != TARGET
            || self.toolchain != "1.93.0"
            || !matches!(
                (self.public_gate_b.as_str(), self.license_review.as_str()),
                ("blocked", "not-evaluated") | ("approved", "approved")
            )
            || self.app.path != "Ameow.exe"
            || self.launcher.path != "AmeowLauncher.exe"
        {
            return Err("E_RELEASE_BUILD_IDENTITY".into());
        }
        if self.is_public() {
            if self.dirty
                || self.tag.as_deref() != Some(&format!("v{}", self.version))
                || self.commit == "0".repeat(40)
                || self.tree == "0".repeat(40)
            {
                return Err("E_RELEASE_TAG".into());
            }
            if self.trust.keys.is_empty() {
                return Err("E_APP_UPDATE_TRUST_NOT_CONFIGURED".into());
            }
            if self.trust.keys.iter().any(|key| key == FIXTURE_PUBLIC) {
                return Err("E_RELEASE_TEST_KEY".into());
            }
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
        if !names.contains("license") || !names.contains("licenses/license-inputs.json") {
            return Err("E_RELEASE_NOTICE".into());
        }
        Ok(())
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Plan {
    build: Build,
    update: FileRecord,
    controlled: bool,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Identity {
    build: Build,
    update: FileRecord,
    manifest_sha256: String,
    controlled: bool,
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
fn update_name(version: &str) -> String {
    format!("Ameow-{version}-windows-x64.zip")
}
fn portable_name(build: &Build) -> String {
    let suffix = if build.is_public() { "" } else { "-CONTROLLED" };
    format!("Ameow-{}-windows-x64-portable{suffix}.zip", build.version)
}
fn verify_public_inventory(build: &Build, bytes: &[u8]) -> Result<()> {
    if !build.is_public() {
        return Ok(());
    }
    let inventory: serde_json::Value = serde_json::from_slice(bytes).map_err(err)?;
    let materials = inventory["materials"]
        .as_array()
        .ok_or("E_RELEASE_MATERIAL_REVIEW")?;
    if inventory["schema"] != 1
        || inventory["scope"] != "public-release"
        || inventory["publicGateB"]["status"] != "approved"
        || inventory["publicGateB"]["blockers"]
            .as_array()
            .is_none_or(|b| !b.is_empty())
        || materials.is_empty()
        || materials.len() + 1 != build.notices.len()
    {
        return Err("E_RELEASE_MATERIAL_REVIEW".into());
    }
    let mut names = BTreeSet::new();
    for material in materials {
        let name = material["destination"]
            .as_str()
            .ok_or("E_RELEASE_MATERIAL_REVIEW")?;
        let digest = material["sha256"]
            .as_str()
            .ok_or("E_RELEASE_MATERIAL_REVIEW")?;
        if name == "licenses/license-inputs.json"
            || !names.insert(name)
            || !build
                .notices
                .iter()
                .any(|n| n.path == name && n.sha256.eq_ignore_ascii_case(digest))
        {
            return Err("E_RELEASE_MATERIAL_REVIEW".into());
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
    for notice in &build.notices {
        notice.check(&read(&root.join(&notice.path), MAX_PACKAGE)?)?;
    }
    verify_public_inventory(
        &build,
        &read(&root.join("licenses/license-inputs.json"), MAX_PACKAGE)?,
    )?;
    Ok(build)
}
fn verify_update(bytes: &[u8], build: &Build, record: &FileRecord) -> Result<()> {
    if record.path != update_name(&build.version) {
        return Err("E_RELEASE_UPDATE_NAME".into());
    }
    record.check(bytes)?;
    let contents = members(bytes, &BTreeSet::from(["Ameow.exe".into()]))?;
    build.app.check(&contents["Ameow.exe"])
}
/// No signatures are invented. An unconfigured build can prepare only an unsigned plan.
pub fn prepare(build_root: &Path, output: &Path) -> Result<()> {
    let build = load_build(build_root)?;
    let update = archive(&BTreeMap::from([(
        "Ameow.exe".into(),
        read(&build_root.join("Ameow.exe"), MAX_PACKAGE)?,
    )]))?;
    let record = FileRecord::of(&update_name(&build.version), &update);
    verify_update(&update, &build, &record)?;
    fresh(output)?;
    for item in std::iter::once(&build.app)
        .chain(std::iter::once(&build.launcher))
        .chain(build.notices.iter())
    {
        let dest = output.join(&item.path);
        fs::create_dir_all(dest.parent().ok_or("E_RELEASE_PATH")?).map_err(err)?;
        let bytes = read(&build_root.join(&item.path), MAX_PACKAGE)?;
        item.check(&bytes)?;
        write_new(&dest, &bytes)?;
    }
    write_new(&output.join("release-build.json"), &encode(&build)?)?;
    write_new(&output.join(&record.path), &update)?;
    if !build.is_public() {
        write_new(&output.join("CONTROLLED.txt"), MARKER)?;
    }
    let controlled = !build.is_public();
    write_new(
        &output.join("unsigned-plan.json"),
        &encode(&Plan {
            build,
            update: record,
            controlled,
        })?,
    )?;
    verify_prepared(output).map(|_| ())
}
fn verify_prepared(root: &Path) -> Result<Plan> {
    let plan: Plan = json(&root.join("unsigned-plan.json"))?;
    if plan.controlled == plan.build.is_public()
        || encode(&load_build(root)?)? != encode(&plan.build)?
    {
        return Err("E_RELEASE_PLAN_IDENTITY".into());
    }
    if plan.update.path != update_name(&plan.build.version) {
        return Err("E_RELEASE_UPDATE_NAME".into());
    }
    verify_update(
        &read(&root.join(&plan.update.path), MAX_PACKAGE)?,
        &plan.build,
        &plan.update,
    )?;
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
    let version = &build.version;
    let manifest = Manifest {
        schema: 1,
        product: "Ameow".into(),
        channel: "stable".into(),
        target: TARGET.into(),
        version: version.clone(),
        sequence,
        issued,
        url: format!(
            "https://github.com/Wutpeach/Ameow/releases/download/v{version}/Ameow-{version}-windows-x64.zip"
        ),
        package_bytes: plan.update.bytes,
        package_sha256: plan.update.sha256.clone(),
        exe_bytes: build.app.bytes,
        exe_sha256: build.app.sha256.clone(),
    };
    manifest.validate(Some(super::store::now()))?;
    let envelope = signed(&manifest, DOMAIN, key)?;
    let manifest_bytes = encode(&envelope)?;
    trust.verify(&manifest_bytes, Some(super::store::now()))?;
    let identity = Identity {
        build: build.clone(),
        update: plan.update.clone(),
        manifest_sha256: hash(&manifest_bytes),
        controlled: !build.is_public(),
    };
    let identity_bytes = encode(&signed(&identity, IDENTITY_DOMAIN, key)?)?;
    let release = Release {
        version: version.clone(),
        sequence,
        manifest_hash: hash(envelope.payload.as_bytes()),
    };
    let state = State {
        pending: Some(release.clone()),
        highest_sequence: sequence,
        highest_manifest: release.manifest_hash,
        ..Default::default()
    };
    let mut files = BTreeMap::from([
        (
            "AmeowLauncher.exe".into(),
            read(&root.join("AmeowLauncher.exe"), MAX_PACKAGE)?,
        ),
        (
            format!("versions/{version}/Ameow.exe"),
            read(&root.join("Ameow.exe"), MAX_PACKAGE)?,
        ),
        (
            format!("versions/{version}/manifest.json"),
            manifest_bytes.clone(),
        ),
        ("state.json".into(), encode(&state)?),
        ("release-identity.json".into(), identity_bytes.clone()),
        ("README.txt".into(), build.guide().to_vec()),
    ]);
    if !build.is_public() {
        files.insert("CONTROLLED.txt".into(), MARKER.to_vec());
    }
    for notice in &build.notices {
        files.insert(
            notice.path.clone(),
            read(&root.join(&notice.path), MAX_PACKAGE)?,
        );
    }
    let portable = archive(&files)?;
    fresh(output)?;
    write_new(
        &output.join(&plan.update.path),
        &read(&root.join(&plan.update.path), MAX_PACKAGE)?,
    )?;
    write_new(&output.join("manifest.json"), &manifest_bytes)?;
    write_new(&output.join("release-identity.json"), &identity_bytes)?;
    write_new(&output.join("release-build.json"), &encode(build)?)?;
    write_new(&output.join(portable_name(build)), &portable)?;
    if !build.is_public() {
        write_new(&output.join("CONTROLLED.txt"), MARKER)?;
    }
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
    if !verify_prepared(root)?.build.trust.trust()?.configured() {
        return Err("E_APP_UPDATE_TRUST_NOT_CONFIGURED".into());
    }
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
fn verify_signed_with_roots(root: &Path, roots: &PublicRoots) -> Result<()> {
    let build: Build = json(&root.join("release-build.json"))?;
    build.validate()?;
    if encode(roots)? != encode(&build.trust)? {
        return Err("E_RELEASE_TRUST_MISMATCH".into());
    }
    let trust = roots.trust()?;
    if !trust.configured() {
        return Err("E_APP_UPDATE_TRUST_NOT_CONFIGURED".into());
    }
    let identity_bytes = read(&root.join("release-identity.json"), 1024 * 1024)?;
    let envelope: SignedManifest = serde_json::from_slice(&identity_bytes).map_err(err)?;
    let signature = unhex(&envelope.signature, 64)?;
    let message = [IDENTITY_DOMAIN, envelope.payload.as_bytes()].concat();
    if !roots.keys.iter().any(|key| {
        unhex(key, 32).is_ok_and(|key| {
            UnparsedPublicKey::new(&ED25519, key)
                .verify(&message, &signature)
                .is_ok()
        })
    }) {
        return Err("E_RELEASE_IDENTITY_SIGNATURE".into());
    }
    let identity: Identity = serde_json::from_str(&envelope.payload).map_err(err)?;
    if identity.controlled == build.is_public() || encode(&identity.build)? != encode(&build)? {
        return Err("E_RELEASE_SOURCE_IDENTITY".into());
    }
    let signed_bytes = read(&root.join("manifest.json"), 16384)?;
    let (signed, manifest) = trust.verify(&signed_bytes, Some(super::store::now()))?;
    if hash(&signed_bytes) != identity.manifest_sha256
        || manifest.version != build.version
        || manifest.exe_sha256 != build.app.sha256
        || manifest.exe_bytes != build.app.bytes
        || manifest.package_bytes != identity.update.bytes
        || manifest.package_sha256 != identity.update.sha256
    {
        return Err("E_RELEASE_MANIFEST_IDENTITY".into());
    }
    if identity.update.path != update_name(&build.version) {
        return Err("E_RELEASE_UPDATE_NAME".into());
    }
    verify_update(
        &read(&root.join(&identity.update.path), MAX_PACKAGE)?,
        &build,
        &identity.update,
    )?;
    let version = &build.version;
    let mut expected = BTreeSet::from([
        "AmeowLauncher.exe".into(),
        format!("versions/{version}/Ameow.exe"),
        format!("versions/{version}/manifest.json"),
        "state.json".into(),
        "release-identity.json".into(),
        "README.txt".into(),
    ]);
    if !build.is_public() {
        expected.insert("CONTROLLED.txt".into());
    }
    let expected = expected
        .into_iter()
        .chain(build.notices.iter().map(|n| n.path.clone()))
        .collect();
    let portable_path = portable_name(&build);
    let portable_bytes = read(&root.join(&portable_path), MAX_PACKAGE)?;
    let files = members(&portable_bytes, &expected)?;
    build
        .app
        .check(&files[&format!("versions/{version}/Ameow.exe")])?;
    build.launcher.check(&files["AmeowLauncher.exe"])?;
    for notice in &build.notices {
        notice.check(&files[&notice.path])?;
    }
    verify_public_inventory(&build, &files["licenses/license-inputs.json"])?;
    let state: State = serde_json::from_slice(&files["state.json"]).map_err(err)?;
    let expected_release = Release {
        version: version.clone(),
        sequence: manifest.sequence,
        manifest_hash: hash(signed.payload.as_bytes()),
    };
    let expected_state = State {
        pending: Some(expected_release.clone()),
        highest_sequence: manifest.sequence,
        highest_manifest: expected_release.manifest_hash,
        ..Default::default()
    };
    if encode(&state)? != encode(&expected_state)?
        || files[&format!("versions/{version}/manifest.json")] != signed_bytes
        || files["release-identity.json"] != identity_bytes
        || files["README.txt"] != build.guide()
        || !build.is_public() && files["CONTROLLED.txt"] != MARKER
    {
        return Err("E_RELEASE_BOOTSTRAP".into());
    }
    let report = serde_json::json!({"schema":1,"controlled":!build.is_public(),"publicGateB":build.public_gate_b,"build":build,"update":identity.update,"portable":FileRecord::of(&portable_path,&portable_bytes),"members":files.iter().map(|(n,b)|FileRecord::of(n,b)).collect::<Vec<_>>(),"firstStart":"pending trial; real Launcher Ready required"});
    // Verification is read-only; the caller decides where to retain the public report.
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
