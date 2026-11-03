//! Saved defaults. Persist first; callers publish/acknowledge only after this succeeds.
use super::request::Quality;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ThemePreference {
    System,
    #[default]
    Light,
    Dark,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LanguagePreference {
    #[default]
    System,
    Chinese,
    English,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TrayIconPreference {
    #[default]
    FollowAppearance,
    AmeowBlue,
    Apricot,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Settings {
    pub quality: Quality,
    pub output_dir: PathBuf,
    #[serde(default)]
    pub theme: ThemePreference,
    #[serde(default)]
    pub language: LanguagePreference,
    #[serde(default)]
    pub tray_icon: TrayIconPreference,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn old_settings_default_preferences_and_new_preferences_round_trip() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("settings.json");
        let defaults = Settings { quality: Quality::Saver, output_dir: root.path().into(), theme: ThemePreference::Dark, language: LanguagePreference::English, tray_icon: TrayIconPreference::Apricot };
        fs::write(&path, serde_json::json!({"quality": "Balanced", "output_dir": root.path()}).to_string()).unwrap();
        let old = Settings::load(&path, defaults).unwrap();
        assert_eq!(old.theme, ThemePreference::Light);
        assert_eq!(old.language, LanguagePreference::System);
        assert_eq!(old.tray_icon, TrayIconPreference::FollowAppearance);
        let changed = Settings { theme: ThemePreference::Dark, language: LanguagePreference::Chinese, ..old };
        let saved = changed.persist(&path).unwrap();
        assert_eq!(Settings::load(&path, changed).unwrap(), saved);
        let json: serde_json::Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
        assert_eq!(json["theme"], "dark");
        assert_eq!(json["language"], "chinese");
    }
    #[test]
    fn tray_icon_preferences_round_trip() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("settings.json");
        for (tray_icon, encoded) in [
            (TrayIconPreference::FollowAppearance, "follow_appearance"),
            (TrayIconPreference::AmeowBlue, "ameow_blue"),
            (TrayIconPreference::Apricot, "apricot"),
        ] {
            let settings = Settings { quality: Quality::Balanced, output_dir: root.path().into(), theme: Default::default(), language: Default::default(), tray_icon };
            let saved = settings.persist(&path).unwrap();
            assert_eq!(Settings::load(&path, settings).unwrap(), saved);
            let json: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
            assert_eq!(json["tray_icon"], encoded);
        }
    }
    #[test]
    fn acknowledged_canonical_directory_can_be_saved_again_for_quality_change() {
        let root = tempfile::tempdir().unwrap();
        let output = root.path().join("output");
        fs::create_dir(&output).unwrap();
        let path = root.path().join("settings.json");
        let first = Settings { quality: Quality::Balanced, output_dir: output , theme: Default::default(), language: Default::default(), tray_icon: Default::default()}.persist(&path).unwrap();
        let next = Settings { quality: Quality::Saver, ..first };
        let saved = next.persist(&path).unwrap();
        assert_eq!(saved.quality, Quality::Saver);
        assert_eq!(Settings::load(&path, next).unwrap(), saved);
        assert_eq!(fs::read_dir(&saved.output_dir).unwrap().count(), 0);
    }
    #[test]
    fn directory_validation_keeps_acknowledged_defaults_and_removes_probe() {
        let root=tempfile::tempdir().unwrap();let output=root.path().join("output");fs::create_dir(&output).unwrap();
        let path=root.path().join("settings.json");
        let saved=Settings{quality:Quality::Balanced,output_dir:output.clone(), theme: Default::default(), language: Default::default(), tray_icon: Default::default()}.persist(&path).unwrap();
        assert_eq!(fs::read_dir(&output).unwrap().count(),0);
        let before=fs::read(&path).unwrap();let file=root.path().join("file.txt");fs::write(&file,b"ordinary").unwrap();
        for candidate in [file,root.path().join("missing")] {
            assert!(Settings{quality:Quality::Saver,output_dir:candidate, theme: Default::default(), language: Default::default(), tray_icon: Default::default()}.persist(&path).is_err());
            assert_eq!(fs::read(&path).unwrap(),before);
            assert_eq!(Settings::load(&path,saved.clone()).unwrap(),saved);
        }
        assert_eq!(fs::read_dir(&output).unwrap().count(),0);
    }
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
        // Runs on the existing settings command owner, before publication/acknowledgement.
        let mut probe = tempfile::Builder::new().prefix(".ameow-write-probe-")
            .tempfile_in(&output_dir)
            .map_err(|_| "E_SETTINGS_SAVE: Output directory is not writable")?;
        probe.write_all(b"").and_then(|_| probe.as_file().sync_all())
            .map_err(|_| "E_SETTINGS_SAVE: Cannot write to output directory")?;
        probe.close().map_err(|_| "E_SETTINGS_SAVE: Cannot finish output directory check")?;
        let saved = Self {
            quality: self.quality,
            output_dir,
            theme: self.theme,
            language: self.language,
            tray_icon: self.tray_icon,
        };
        saved.persist_preferences(path)
    }

    pub(super) fn persist_preferences(&self, path: &Path) -> Result<Self, String> {
        let parent = path
            .parent()
            .ok_or("E_SETTINGS_SAVE: Missing settings directory")?;
        fs::create_dir_all(parent)
            .map_err(|_| "E_SETTINGS_SAVE: Cannot create settings directory")?;
        let mut file = tempfile::NamedTempFile::new_in(parent)
            .map_err(|_| "E_SETTINGS_SAVE: Cannot stage saved defaults")?;
        let bytes = serde_json::to_vec_pretty(self)
            .map_err(|_| "E_SETTINGS_SAVE: Cannot encode defaults")?;
        file.write_all(&bytes)
            .and_then(|_| file.as_file().sync_all())
            .map_err(|_| "E_SETTINGS_SAVE: Cannot write saved defaults")?;
        // tempfile uses atomic same-directory replacement on Windows. Never remove old settings first.
        file.persist(path)
            .map_err(|_| "E_SETTINGS_SAVE: Cannot replace saved defaults")?;
        Ok(self.clone())
    }
}
