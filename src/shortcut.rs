//! The one desktop summon preference; native registration belongs to the GUI instance.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ShortcutPreference {
    pub chord: Option<ShortcutChord>,
}
impl Default for ShortcutPreference {
    fn default() -> Self {
        Self { chord: Some(ShortcutChord { platform: ShortcutPlatform::current(), key: "f".into(),
            key_code: if cfg!(target_os = "macos") { 3 } else { 0x46 },
            control: true, alt: false, shift: true, command: false }) }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ShortcutPlatform { Windows, Macos }

impl ShortcutPlatform {
    pub fn current() -> Self {
        if cfg!(target_os = "macos") { Self::Macos } else { Self::Windows }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ShortcutChord {
    pub platform: ShortcutPlatform,
    pub key: String,
    pub key_code: u16,
    pub control: bool,
    pub alt: bool,
    pub shift: bool,
    pub command: bool,
}

impl ShortcutChord {
    pub fn supported_key(key: &str) -> bool {
        (key.len() == 1 && key.as_bytes()[0].is_ascii_alphanumeric())
            || key.strip_prefix('f').and_then(|n| n.parse::<u8>().ok()).is_some_and(|n| (1..=11).contains(&n))
    }
    pub fn validate(&self) -> Result<(), &'static str> {
        if !Self::supported_key(&self.key) { return Err("unsupported"); }
        let valid = match self.platform {
            ShortcutPlatform::Windows => !self.command && (self.control || self.alt)
                && Self::windows_key(&self.key) == Some(self.key_code),
            ShortcutPlatform::Macos => (self.control || self.command) && self.key_code < 128
                && ![36, 48, 51, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 111].contains(&self.key_code),
        };
        if !valid { return Err("unsupported"); }
        if !self.alt && !self.shift && matches!(self.key.as_str(), "c" | "v" | "x" | "z" | "q" | "w" | "h" | "m") {
            return Err("reserved");
        }
        Ok(())
    }
    pub fn windows_key(key: &str) -> Option<u16> {
        if key.len() == 1 && key.as_bytes()[0].is_ascii_alphanumeric() {
            Some(key.as_bytes()[0].to_ascii_uppercase() as u16)
        } else {
            key.strip_prefix('f').and_then(|n| n.parse::<u16>().ok())
                .filter(|n| (1..=11).contains(n)).map(|n| 0x6f + n)
        }
    }
    pub fn label(&self) -> String {
        let mut parts = Vec::new();
        if self.control { parts.push("Ctrl".to_owned()); }
        if self.alt { parts.push(if self.platform == ShortcutPlatform::Macos { "Option" } else { "Alt" }.to_owned()); }
        if self.shift { parts.push("Shift".to_owned()); }
        if self.command { parts.push("Cmd".to_owned()); }
        parts.push(self.key.to_ascii_uppercase());
        parts.join("+")
    }
}

impl ShortcutPreference {
    pub fn validate(&self) -> Result<(), &'static str> {
        if let Some(chord) = &self.chord { chord.validate()?; }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn chord() -> ShortcutChord {
        ShortcutChord { platform: ShortcutPlatform::Windows, key: "f9".into(), key_code: 0x78,
            control: true, alt: true, shift: false, command: false }
    }
    #[test]
    fn default_is_control_shift_f_and_an_explicit_empty_choice_stays_disabled() {
        let preference = ShortcutPreference::default();
        let default = preference.chord.as_ref().unwrap();
        assert_eq!(default.label(), "Ctrl+Shift+F");
        assert_eq!(default.platform, ShortcutPlatform::current());
        assert!(preference.validate().is_ok());
        let cleared = ShortcutPreference { chord: None };
        assert!(cleared.validate().is_ok());
        assert_eq!(serde_json::from_str::<ShortcutPreference>(&serde_json::to_string(&cleared).unwrap()).unwrap(), cleared);
        let chosen = ShortcutPreference { chord: Some(chord()) };
        assert!(chosen.validate().is_ok());
        assert_eq!(serde_json::from_str::<ShortcutPreference>(&serde_json::to_string(&chosen).unwrap()).unwrap(), chosen);
    }
    #[test]
    fn rejects_reserved_unmodified_and_mislabelled_keys() {
        for key in ["f12", "space", "tab", "escape", "é", "fn"] {
            assert!(!ShortcutChord::supported_key(key));
        }
        let mut c = chord(); c.control = false; c.alt = false;
        assert!(c.validate().is_err());
        c.control = true; c.key = "v".into(); c.key_code = 0x56;
        assert_eq!(c.validate(), Err("reserved"));
        c.alt = true; c.key_code = 0x57;
        assert!(c.validate().is_err());
    }
}
