//! Saved defaults. Persist first; callers publish/acknowledge only after this succeeds.
use super::request::Quality;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Settings {
    pub quality: Quality,
    pub output_dir: PathBuf,
}
impl Settings {
    pub fn load(path: &Path, defaults: Self) -> Result<Self, String> {
        match fs::read(path) {
            Ok(bytes) if bytes.len() <= 16_384 => serde_json::from_slice(&bytes)
                .map_err(|_| "E_SETTINGS_READ: Saved defaults are invalid".into()),
            Ok(_) => Err("E_SETTINGS_READ: Saved defaults exceed size limit".into()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(defaults),
            Err(_) => Err("E_SETTINGS_READ: Cannot read saved defaults".into()),
        }
    }
    pub fn persist(&self, path: &Path) -> Result<Self, String> {
        let output_dir = self
            .output_dir
            .canonicalize()
            .map_err(|_| "E_SETTINGS_SAVE: Choose an existing output directory")?;
        if !output_dir.is_dir() {
            return Err("E_SETTINGS_SAVE: Output must be a directory".into());
        }
        let saved = Self {
            quality: self.quality,
            output_dir,
        };
        let parent = path
            .parent()
            .ok_or("E_SETTINGS_SAVE: Missing settings directory")?;
        fs::create_dir_all(parent)
            .map_err(|_| "E_SETTINGS_SAVE: Cannot create settings directory")?;
        let mut file = tempfile::NamedTempFile::new_in(parent)
            .map_err(|_| "E_SETTINGS_SAVE: Cannot stage saved defaults")?;
        let bytes = serde_json::to_vec_pretty(&saved)
            .map_err(|_| "E_SETTINGS_SAVE: Cannot encode defaults")?;
        file.write_all(&bytes)
            .and_then(|_| file.as_file().sync_all())
            .map_err(|_| "E_SETTINGS_SAVE: Cannot write saved defaults")?;
        // tempfile uses atomic same-directory replacement on Windows. Never remove old settings first.
        file.persist(path)
            .map_err(|_| "E_SETTINGS_SAVE: Cannot replace saved defaults")?;
        Ok(saved)
    }
}
