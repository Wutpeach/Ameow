//! Measured Penpot tokens, 2026-10-06. Raw Night values take precedence over
//! resolvedValue, which can still reflect the active Light token-set alias.
use crate::model::Stage;
use gpui::{Hsla, rgb};
#[derive(Clone, Copy)]
pub struct Palette {
    pub surface: Hsla,
    pub neutral: Hsla,
    pub border: Hsla,
    pub badge: Hsla,
    pub blue: Hsla,
    pub orange: Hsla,
    pub green: Hsla,
    pub red: Hsla,
    pub night: bool,
}
impl Palette {
    pub fn new(night: bool) -> Self {
        if night {
            Self {
                surface: rgb(0x232427).into(),
                neutral: rgb(0xa5a8ad).into(),
                border: rgb(0x2e3033).into(),
                badge: rgb(0x2b2c2f).into(),
                blue: rgb(0x3d9aff).into(),
                orange: rgb(0xf68f3c).into(),
                green: rgb(0x3cbb72).into(),
                red: rgb(0xee5c61).into(),
                night,
            }
        } else {
            Self {
                surface: rgb(0xffffff).into(),
                neutral: rgb(0x62656b).into(),
                border: rgb(0xecedef).into(),
                badge: rgb(0xf2f2f3).into(),
                blue: rgb(0x0285ff).into(),
                orange: rgb(0xef720d).into(),
                green: rgb(0x199a4d).into(),
                red: rgb(0xe3474c).into(),
                night,
            }
        }
    }
    pub fn semantic(self, stage: Stage) -> Hsla {
        match stage {
            Stage::Downloading => self.blue,
            Stage::Transcoding => self.orange,
            Stage::Success => self.green,
            Stage::Failure => self.red,
            _ => self.neutral,
        }
    }
    pub fn ring(self, stage: Stage) -> Hsla {
        if matches!(stage, Stage::Idle | Stage::Resolving | Stage::Cancelled) {
            rgb(if self.night { 0x6c6f75 } else { 0x9a9da3 }).into()
        } else {
            self.semantic(stage)
        }
    }
    pub fn pill(self, stage: Stage) -> Hsla {
        if self.night {
            match stage {
                Stage::Downloading => self.blue.opacity(0.16),
                Stage::Transcoding => self.orange.opacity(0.14),
                Stage::Success => self.green.opacity(0.14),
                Stage::Failure => self.red.opacity(0.14),
                _ => self.badge,
            }
        } else {
            match stage {
                Stage::Downloading => rgb(0xe9f3ff).into(),
                Stage::Transcoding => rgb(0xfdf1e5).into(),
                Stage::Success => rgb(0xe8f5ed).into(),
                Stage::Failure => rgb(0xfcecec).into(),
                _ => self.badge,
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn downloading_retains_original_theme_blue() {
        let light = Palette::new(false);
        let night = Palette::new(true);
        assert_eq!(light.blue, Hsla::from(rgb(0x0285ff)));
        assert_eq!(light.ring(Stage::Downloading), light.blue);
        assert_eq!(night.blue, Hsla::from(rgb(0x3d9aff)));
        assert_eq!(night.ring(Stage::Downloading), night.blue);
    }
}
