use ring::signature;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{cmp::Ordering, io::Read};

pub const TARGET: &str = "x86_64-pc-windows-msvc";
pub const BUILD_VERSION: &str = match option_env!("AMEOW_FIXTURE_BUILD_VERSION") {
    Some(version) if cfg!(all(feature = "app-update-fixture", debug_assertions)) => version,
    _ => env!("CARGO_PKG_VERSION"),
};
pub const MAX_PACKAGE: u64 = 512 * 1024 * 1024;
pub(crate) const DOMAIN: &[u8] = b"Ameow application update v1\n";

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
}
impl Trust {
    // Offline release tooling supplies explicit public roots; application roots stay embedded.
    pub(crate) fn offline(keys: &[String]) -> Result<Self, String> {
        Ok(Self { keys: keys.iter().map(|key| unhex(key, 32)).collect::<Result<_, _>>()? })
    }
    pub fn configured(&self) -> bool {
        !self.keys.is_empty()
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
        Ok(Self { keys })
    }
    #[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
    pub fn fixture() -> Self {
        // RFC 8032 public test vector, deliberately absent from production roots.
        Self {
            keys: vec![
                unhex(
                    "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
                    32,
                )
                .unwrap(),
            ],
        }
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
        manifest.validate(acquisition_time)?;
        Ok((envelope, manifest))
    }
}
impl Manifest {
    pub(crate) fn validate(&self, now: Option<u64>) -> Result<(), String> {
        Version::parse(&self.version)?;
        if self.schema != 1
            || self.product != "Ameow"
            || self.channel != "stable"
            || self.target != TARGET
        {
            return Err("E_APP_UPDATE_IDENTITY".into());
        }
        let expected = format!(
            "https://github.com/Wutpeach/Ameow/releases/download/v{}/Ameow-{}-windows-x64.zip",
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
    // Public test-vector seed; this function cannot enter a production build.
    let seed = unhex(
        "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
        32,
    )
    .unwrap();
    let key = signature::Ed25519KeyPair::from_seed_unchecked(&seed).unwrap();
    let payload = serde_json::to_string(manifest).unwrap();
    let sig = key.sign(&[DOMAIN, payload.as_bytes()].concat());
    let envelope = SignedManifest {
        payload,
        signature: sig.as_ref().iter().map(|b| format!("{b:02x}")).collect(),
    };
    serde_json::to_vec(&envelope).unwrap()
}
