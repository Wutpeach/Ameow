use super::METADATA_LIMIT;
use crate::download::runtime;
use serde_json::Value;
use std::{fs::{self, File}, io::Read, path::{Path, PathBuf}};

pub(super) fn input_bytes(metadata: &Value, canonical: &str, authenticated: bool) -> Result<Option<Vec<u8>>, String> {
    if authenticated || !metadata.is_object() { return Ok(None); }
    let mut input = metadata.clone();
    input["webpage_url"] = Value::String(canonical.into());
    let bytes = serde_json::to_vec(&input).map_err(|error| error.to_string())?;
    Ok((bytes.len() <= METADATA_LIMIT).then_some(bytes))
}

pub(super) struct AttemptResolution {
    path: PathBuf,
    guard: File,
    #[cfg(target_os = "macos")]
    identity: runtime::identity::PathIdentity,
}
impl AttemptResolution {
    pub fn open(path: &Path, expected: &[u8]) -> Result<Self, String> {
        let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
        if !crate::download::is_plain_file(&metadata) || metadata.len() > METADATA_LIMIT as u64 {
            return Err("E_IDENTITY: native input type/bound".into());
        }
        #[cfg(target_os = "macos")]
        let identity = runtime::identity::PathIdentity::capture(path)?;
        let mut guard = runtime::open_identity_file(path).map_err(|error| error.to_string())?;
        let mut actual = Vec::new();
        (&mut guard).take(METADATA_LIMIT as u64 + 1).read_to_end(&mut actual).map_err(|error| error.to_string())?;
        if actual != expected { return Err("E_IDENTITY: native input content changed".into()); }
        let input = Self { path: path.into(), guard, #[cfg(target_os = "macos")] identity };
        input.validate()?;
        Ok(input)
    }
    pub fn validate(&self) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        self.identity.validate_handle(&self.guard).map_err(|_| "E_IDENTITY: native input identity changed".to_string())?;
        #[cfg(not(target_os = "macos"))]
        self.guard.metadata().map_err(|error| error.to_string())?;
        Ok(())
    }
}

pub(super) fn append_input(args: &mut Vec<String>, input: Option<&AttemptResolution>, canonical: &str) {
    if let Some(input) = input {
        args.extend(["--abort-on-error".into(), "--load-info-json".into(), input.path.display().to_string()]);
    } else {
        args.extend(["--".into(), canonical.into()]);
    }
}

#[cfg(test)]
mod tests;
