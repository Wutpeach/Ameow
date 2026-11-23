use ring::signature;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{cmp::Ordering, io::Read};

pub(crate) const WINDOWS_TARGET: &str = "x86_64-pc-windows-msvc";
pub(crate) const MACOS_ARM_TARGET: &str = "aarch64-apple-darwin";
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
pub const TARGET: &str = MACOS_ARM_TARGET;
#[cfg(all(target_os = "macos", not(target_arch = "aarch64")))]
pub const TARGET: &str = "unsupported-macos";
#[cfg(not(target_os = "macos"))]
pub const TARGET: &str = WINDOWS_TARGET;
pub const BUILD_VERSION: &str = match option_env!("AMEOW_FIXTURE_BUILD_VERSION") {
    Some(version) if cfg!(all(feature = "app-update-fixture", debug_assertions)) => version,
    _ => env!("CARGO_PKG_VERSION"),
};
pub const MAX_PACKAGE: u64 = 512 * 1024 * 1024;
pub(crate) const DOMAIN: &[u8] = b"Ameow application update v1\n";
pub(crate) const BUNDLE_DOMAIN: &[u8] = b"Ameow Windows bundle v1\n";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BundleFile {
    pub path: String,
    pub bytes: u64,
    pub sha256: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WindowsBundle {
    pub schema: u32,
    pub product: String,
    pub target: String,
    pub version: String,
    pub sequence: u64,
    pub issued: u64,
    pub launcher: BundleFile,
    pub files: Vec<BundleFile>,
}
impl WindowsBundle {
    pub(crate) fn validate(&self, now: Option<u64>) -> Result<(), String> {
        Version::parse(&self.version)?;
        if self.schema != 1 || self.product != "Ameow" || self.target != WINDOWS_TARGET
            || self.sequence == 0 || self.launcher.path != "Ameow.exe"
            || self.files.is_empty() || self.files.len() > 256
            || now.is_some_and(|now| self.issued > now.saturating_add(300)) {
            return Err("E_APP_UPDATE_BUNDLE_IDENTITY".into());
        }
        let mut names = std::collections::BTreeSet::new();
        let mut total = 0u64;
        for file in self.files.iter().chain(std::iter::once(&self.launcher)) {
            bundle_path(&file.path)?;
            if file.bytes == 0 || file.bytes > MAX_PACKAGE { return Err("E_APP_UPDATE_SIZE".into()); }
            unhex(&file.sha256, 32)?;
        }
        for file in &self.files {
            if !names.insert(file.path.to_ascii_lowercase()) { return Err("E_APP_UPDATE_BUNDLE_DUPLICATE".into()); }
            total = total.checked_add(file.bytes).ok_or("E_APP_UPDATE_SIZE")?;
        }
        if total > MAX_PACKAGE || !["ameow.exe", "ameow-cli.exe", "ameow-browser-host.exe",
            "browser-extension/manifest.json", "browser-extension/build.json", "browser-extension/background.js",
            "browser-extension/popup.js", "browser-extension/popup.html", "browser-extension/popup.css",
            "browser-extension/page.js", "browser-extension/page.css", "browser-extension/ameow-cat.svg",
            "browser-extension/licenses.txt", "browser-extension/icons/16.png", "browser-extension/icons/24.png",
            "browser-extension/icons/32.png", "browser-extension/icons/48.png", "browser-extension/icons/128.png", "license",
            "licenses/license-inputs.json", "licenses/third_party_notices.md"].iter().all(|n| names.contains(*n)) {
            return Err("E_APP_UPDATE_BUNDLE_INCOMPLETE".into());
        }
        Ok(())
    }
}
pub(crate) fn bundle_path(path: &str) -> Result<(), String> {
    if path.is_empty() || path.contains(['\\', ':'])
        || path.split('/').any(|p| p.is_empty() || p == "." || p == ".."
            || p.ends_with(['.', ' ']) || p.bytes().any(|c| c < 32)) {
        return Err("E_APP_UPDATE_ZIP_MEMBER".into());
    }
    let allowed = ["Ameow.exe", "ameow-cli.exe", "ameow-browser-host.exe", "LICENSE"].contains(&path)
        || path.starts_with("browser-extension/") || path.starts_with("licenses/");
    if !allowed { return Err("E_APP_UPDATE_ZIP_MEMBER".into()); }
    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Version([u32; 3]);
impl Version {
    pub fn parse(input: &str) -> Result<Self, String> {
        let parts: Vec<_> = input.split('.').collect();
        if parts.len() != 3
            || parts.iter().any(|p| {
                p.is_empty()
                    || p.len() > 1 && p.starts_with('0')
                    || !p.bytes().all(|b| b.is_ascii_digit())
            })
        {
            return Err("E_APP_UPDATE_VERSION".into());
        }
        Ok(Self([
            parts[0].parse().map_err(|_| "E_APP_UPDATE_VERSION")?,
            parts[1].parse().map_err(|_| "E_APP_UPDATE_VERSION")?,
            parts[2].parse().map_err(|_| "E_APP_UPDATE_VERSION")?,
        ]))
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub schema: u32,
    pub product: String,
    pub channel: String,
    pub target: String,
    pub version: String,
    pub sequence: u64,
    // Signing time is provenance, never a lifetime limit for an immutable release.
    pub issued: u64,
    pub url: String,
    pub package_bytes: u64,
    pub package_sha256: String,
    pub exe_bytes: u64,
    pub exe_sha256: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bundle_sha256: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SignedManifest {
    pub payload: String,
    pub signature: String,
}

#[derive(Clone)]
pub struct Trust {
    keys: Vec<Vec<u8>>,
    target: &'static str,
}
impl Trust {
    pub fn verify_bundle(&self, bytes: &[u8], now: Option<u64>) -> Result<(SignedManifest, WindowsBundle), String> {
        if bytes.len() > 65536 || self.keys.is_empty() { return Err("E_APP_UPDATE_BUNDLE".into()); }
        let envelope: SignedManifest = serde_json::from_slice(bytes).map_err(|_| "E_APP_UPDATE_BUNDLE")?;
        let sig = unhex(&envelope.signature, 64)?;
        let signed = [BUNDLE_DOMAIN, envelope.payload.as_bytes()].concat();
        if !self.keys.iter().any(|key| signature::UnparsedPublicKey::new(&signature::ED25519, key)
            .verify(&signed, &sig).is_ok()) { return Err("E_APP_UPDATE_SIGNATURE".into()); }
        let bundle: WindowsBundle = serde_json::from_str(&envelope.payload).map_err(|_| "E_APP_UPDATE_BUNDLE")?;
        bundle.validate(now)?;
        Ok((envelope, bundle))
    }
    // Offline release tooling supplies explicit public roots; application roots stay embedded.
    pub(crate) fn offline(keys: &[String]) -> Result<Self, String> {
        Ok(Self { keys: keys.iter().map(|key| unhex(key, 32)).collect::<Result<_, _>>()?, target: WINDOWS_TARGET })
    }
    pub fn configured(&self) -> bool {
        !self.keys.is_empty()
    }
    pub(crate) fn target(&self) -> &'static str {
        self.target
    }
    pub fn production() -> Result<Self, String> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Roots {
            schema: u32,
            keys: Vec<String>,
        }
        let roots: Roots =
            serde_json::from_slice(include_bytes!("../../assets/app-update-trust.json"))
                .map_err(|_| "E_APP_UPDATE_TRUST")?;
        if roots.schema != 1 {
            return Err("E_APP_UPDATE_TRUST".into());
        }
        let keys = roots
            .keys
            .iter()
            .map(|k| unhex(k, 32))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self { keys, target: TARGET })
    }
    #[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
    pub fn fixture() -> Self {
        #[cfg(test)]
        let target = WINDOWS_TARGET;
        #[cfg(not(test))]
        let target = TARGET;
        // RFC 8032 public test vector, deliberately absent from production roots.
        Self {
            keys: vec![
                unhex(
                    "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
                    32,
                )
                .unwrap(),
            ],
            target,
        }
    }
    #[cfg(test)]
    pub(crate) fn fixture_for_target(target: &'static str) -> Self {
        Self { target, ..Self::fixture() }
    }
    pub fn verify(
        &self,
        bytes: &[u8],
        acquisition_time: Option<u64>,
    ) -> Result<(SignedManifest, Manifest), String> {
        if self.keys.is_empty() {
            return Err("E_APP_UPDATE_TRUST_NOT_CONFIGURED".into());
        }
        if bytes.len() > 16_384 {
            return Err("E_APP_UPDATE_MANIFEST_SIZE".into());
        }
        let envelope: SignedManifest =
            serde_json::from_slice(bytes).map_err(|_| "E_APP_UPDATE_MANIFEST")?;
        let sig = unhex(&envelope.signature, 64)?;
        let signed = [DOMAIN, envelope.payload.as_bytes()].concat();
        if !self.keys.iter().any(|key| {
            signature::UnparsedPublicKey::new(&signature::ED25519, key)
                .verify(&signed, &sig)
                .is_ok()
        }) {
            return Err("E_APP_UPDATE_SIGNATURE".into());
        }
        let manifest: Manifest =
            serde_json::from_str(&envelope.payload).map_err(|_| "E_APP_UPDATE_MANIFEST")?;
        manifest.validate_for_target(acquisition_time, self.target)?;
        Ok((envelope, manifest))
    }
}
impl Manifest {
    pub(crate) fn validate(&self, now: Option<u64>) -> Result<(), String> {
        self.validate_for_target(now, WINDOWS_TARGET)
    }
    pub(crate) fn validate_for_target(&self, now: Option<u64>, target: &str) -> Result<(), String> {
        Version::parse(&self.version)?;
        if self.schema != if target == WINDOWS_TARGET { 2 } else { 1 }
            || self.product != "Ameow"
            || self.channel != "stable"
            || self.target != target
        {
            return Err("E_APP_UPDATE_IDENTITY".into());
        }
        let platform = match target {
            WINDOWS_TARGET => "windows-x64-portable",
            MACOS_ARM_TARGET => "macos-arm64",
            _ => return Err("E_APP_UPDATE_IDENTITY".into()),
        };
        let expected = format!(
            "https://github.com/Wutpeach/Ameow/releases/download/v{}/Ameow-{}-{platform}.zip",
            self.version, self.version
        );
        if self.url != expected {
            return Err("E_APP_UPDATE_ORIGIN".into());
        }
        if self.sequence == 0
            || self.package_bytes == 0
            || self.package_bytes > MAX_PACKAGE
            || self.exe_bytes == 0
            || self.exe_bytes > MAX_PACKAGE
        {
            return Err("E_APP_UPDATE_SIZE".into());
        }
        unhex(&self.package_sha256, 32)?;
        unhex(&self.exe_sha256, 32)?;
        if target == WINDOWS_TARGET {
            unhex(self.bundle_sha256.as_deref().ok_or("E_APP_UPDATE_BUNDLE_IDENTITY")?, 32)?;
        } else if self.bundle_sha256.is_some() { return Err("E_APP_UPDATE_IDENTITY".into()); }
        if now.is_some_and(|now| self.issued > now.saturating_add(300)) {
            return Err("E_APP_UPDATE_ISSUED_IN_FUTURE".into());
        }
        Ok(())
    }
    pub(crate) fn newer_than(&self, current: &str) -> Result<(), String> {
        if Version::parse(&self.version)?.cmp(&Version::parse(current)?) != Ordering::Greater {
            return Err("E_APP_UPDATE_DOWNGRADE".into());
        }
        Ok(())
    }
}
pub(crate) fn unhex(text: &str, bytes: usize) -> Result<Vec<u8>, String> {
    if text.len() != bytes * 2
        || !text
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
    {
        return Err("E_APP_UPDATE_HEX".into());
    }
    (0..text.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&text[i..i + 2], 16).map_err(|_| "E_APP_UPDATE_HEX".into()))
        .collect()
}
pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub(crate) fn hash_reader(reader: &mut impl Read) -> Result<(u64, String), String> {
    let mut hash = Sha256::new();
    let mut total = 0;
    let mut buffer = [0; 64 * 1024];
    loop {
        let n = reader
            .read(&mut buffer)
            .map_err(|e| format!("E_APP_UPDATE_READ: {e}"))?;
        if n == 0 {
            break;
        }
        total += n as u64;
        if total > MAX_PACKAGE {
            return Err("E_APP_UPDATE_SIZE".into());
        }
        hash.update(&buffer[..n]);
    }
    Ok((total, format!("{:x}", hash.finalize())))
}
#[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
pub fn fixture_envelope(manifest: &Manifest) -> Vec<u8> {
    fixture_signed(manifest, DOMAIN)
}
#[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
pub fn fixture_signed(value: &impl Serialize, domain: &[u8]) -> Vec<u8> {
    // Public test-vector seed; this function cannot enter a production build.
    let seed = unhex(
        "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
        32,
    )
    .unwrap();
    let key = signature::Ed25519KeyPair::from_seed_unchecked(&seed).unwrap();
    let payload = serde_json::to_string(value).unwrap();
    let sig = key.sign(&[domain, payload.as_bytes()].concat());
    let envelope = SignedManifest {
        payload,
        signature: sig.as_ref().iter().map(|b| format!("{b:02x}")).collect(),
    };
    serde_json::to_vec(&envelope).unwrap()
}
#[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
pub fn fixture_windows_package(version: &str, sequence: u64, issued: u64, members: &[(&str, &[u8])]) -> (Manifest, Vec<u8>, Vec<u8>) {
    use std::{collections::BTreeMap, io::{Cursor, Write}};
    let mut files: BTreeMap<String, Vec<u8>> = ["ameow-cli.exe", "ameow-browser-host.exe", "browser-extension/manifest.json",
        "browser-extension/build.json", "browser-extension/background.js", "browser-extension/popup.js",
        "browser-extension/popup.html", "browser-extension/popup.css", "browser-extension/page.js",
        "browser-extension/page.css", "browser-extension/ameow-cat.svg", "browser-extension/LICENSES.txt",
        "browser-extension/icons/16.png", "browser-extension/icons/24.png", "browser-extension/icons/32.png",
        "browser-extension/icons/48.png", "browser-extension/icons/128.png",
        "LICENSE", "licenses/license-inputs.json", "licenses/THIRD_PARTY_NOTICES.md"].into_iter()
        .map(|p| (p.to_string(), format!("synthetic {version}: {p}").into_bytes())).collect();
    for (name, bytes) in members { files.insert((*name).into(), bytes.to_vec()); }
    let launcher = b"synthetic stable launcher";
    let bundle = WindowsBundle { schema:1, product:"Ameow".into(), target:WINDOWS_TARGET.into(), version:version.into(), sequence, issued,
        launcher:BundleFile { path:"Ameow.exe".into(),bytes:launcher.len() as u64,sha256:hash(launcher) },
        files:files.iter().map(|(path,body)| BundleFile {path:path.clone(),bytes:body.len() as u64,sha256:hash(body)}).collect() };
    let receipt = fixture_signed(&bundle, BUNDLE_DOMAIN);
    let signed: SignedManifest = serde_json::from_slice(&receipt).unwrap();
    let mut archive = BTreeMap::from([("Ameow.exe".to_string(),launcher.to_vec()),("state.json".into(),b"{}".to_vec()),
        ("entry.json".into(),receipt.clone()),(format!("versions/{version}/bundle.json"),receipt)]);
    for (path, body) in &files {
        archive.insert(format!("versions/{version}/{path}"),body.clone());
        if path != "Ameow.exe" {archive.insert(path.clone(),body.clone());}
    }
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (name,body) in archive { writer.start_file(name,zip::write::SimpleFileOptions::default()).unwrap();writer.write_all(&body).unwrap(); }
    let package = writer.finish().unwrap().into_inner();
    let exe = files.get("Ameow.exe").cloned().unwrap_or_else(|| b"missing".to_vec());
    let manifest = Manifest {schema:2,product:"Ameow".into(),channel:"stable".into(),target:WINDOWS_TARGET.into(),version:version.into(),sequence,issued,
        url:format!("https://github.com/Wutpeach/Ameow/releases/download/v{version}/Ameow-{version}-windows-x64-portable.zip"),
        package_bytes:package.len() as u64,package_sha256:hash(&package),exe_bytes:exe.len() as u64,exe_sha256:hash(&exe),
        bundle_sha256:Some(hash(signed.payload.as_bytes()))};
    let envelope = fixture_envelope(&manifest);
    (manifest, package, envelope)
}

#[cfg(test)]
mod platform_tests {
    use super::*;

    fn manifest(target: &str, platform: &str) -> Manifest {
        Manifest {
            schema: if target == WINDOWS_TARGET {2} else {1}, product: "Ameow".into(), channel: "stable".into(),
            target: target.into(), version: "1.2.3".into(), sequence: 1, issued: 1,
            url: format!("https://github.com/Wutpeach/Ameow/releases/download/v1.2.3/Ameow-1.2.3-{platform}.zip"),
            package_bytes: 10, package_sha256: hash(b"package"),
            exe_bytes: 5, exe_sha256: hash(b"exe"), bundle_sha256: (target == WINDOWS_TARGET).then(|| hash(b"bundle")),
        }
    }

    #[test]
    fn platform_signatures_cannot_cross_architectures_or_origins() {
        for (target, platform) in [(WINDOWS_TARGET, "windows-x64-portable"),
            (MACOS_ARM_TARGET, "macos-arm64")] {
            let signed = fixture_envelope(&manifest(target, platform));
            assert!(Trust::fixture_for_target(target).verify(&signed, None).is_ok());
            for other in [WINDOWS_TARGET, MACOS_ARM_TARGET, "x86_64-apple-darwin"] {
                if other != target {
                    assert!(Trust::fixture_for_target(other).verify(&signed, None).is_err());
                }
            }
            let wrong = fixture_envelope(&manifest(target, "windows-x64-bad"));
            assert_eq!(Trust::fixture_for_target(target).verify(&wrong, None).unwrap_err(), "E_APP_UPDATE_ORIGIN");
        }
    }
}
