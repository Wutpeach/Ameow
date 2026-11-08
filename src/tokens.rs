//! Measured Penpot tokens, 2026-10-06. Raw Night values take precedence over
//! resolvedValue, which can still reflect the active Light token-set alias.
use crate::model::Stage;
use gpui::{Font, FontFallbacks, Hsla, font, rgb};

pub const LATIN_FONT: &str = "JetBrains Mono";
pub const LATIN_FONT_BYTES: [&[u8]; 2] = [
    include_bytes!("../assets/fonts/JetBrainsMono-Regular.ttf"),
    include_bytes!("../assets/fonts/JetBrainsMono-Medium.ttf"),
];
pub const CHINESE_FONT: &str = if cfg!(target_os = "macos") {
    "PingFang SC"
} else {
    "Microsoft YaHei UI"
};
pub const DESKTOP_FONT: &str = if cfg!(target_os = "windows") { "Segoe UI" } else { "Helvetica Neue" };
pub const CONTROL_HEIGHT: f32 = 32.;
pub const SELECT_HEIGHT: f32 = 28.;
pub const CONTROL_RADIUS: f32 = 6.;
pub const CONTROL_FONT_SIZE: f32 = 13.;
pub const CONTROL_LINE_HEIGHT: f32 = 20.;

pub fn ui_font() -> Font {
    let mut font = font(LATIN_FONT);
    font.fallbacks = Some(FontFallbacks::from_fonts(vec![CHINESE_FONT.into()]));
    font
}

// Settings and tray use native UI text; the floating surface retains its measured font.
pub fn desktop_ui_font() -> Font {
    let mut font = font(DESKTOP_FONT);
    font.fallbacks = Some(FontFallbacks::from_fonts(vec![CHINESE_FONT.into()]));
    font
}

/// Project the measured Ameow palette into Kit; component defaults are not a
/// second visual authority. The caller supplies the acknowledged effective theme.
pub fn kit_tokens(night: bool) -> gpui_base::SemanticThemeTokens {
    use gpui::px;
    let p = Palette::new(night);
    let mut t = gpui_base::SemanticThemeTokens::default();
    let c = &mut t.colors;
    c.background = p.surface;
    c.foreground = p.primary_text();
    c.surface = p.surface;
    c.surface_foreground = p.primary_text();
    c.primary = p.blue;
    c.primary_foreground = gpui::white();
    c.secondary = p.badge;
    c.secondary_foreground = p.primary_text();
    c.muted = p.badge;
    c.muted_foreground = p.neutral;
    c.accent = p.badge;
    c.accent_foreground = p.primary_text();
    c.destructive = p.red;
    c.destructive_foreground = gpui::white();
    c.border = p.border;
    c.input = p.control_border();
    c.ring = p.blue;
    c.selection = p.blue.opacity(0.2);
    t.radius.none = px(0.);
    t.radius.sm = px(4.);
    t.radius.md = px(CONTROL_RADIUS);
    t.radius.lg = px(12.);
    t.radius.xl = px(16.);
    t.radius.full = px(9999.);
    t.spacing.xxs = px(2.);
    t.spacing.xs = px(4.);
    t.spacing.sm = px(8.);
    t.spacing.md = px(12.);
    t.spacing.lg = px(16.);
    t.spacing.xl = px(24.);
    t.spacing.xxl = px(32.);
    t.typography.sans = DESKTOP_FONT.into();
    t.typography.mono = LATIN_FONT.into();
    for (style, size, line) in [
        (&mut t.typography.xs, 12., 18.),
        (&mut t.typography.sm, CONTROL_FONT_SIZE, CONTROL_LINE_HEIGHT),
        (&mut t.typography.md, CONTROL_FONT_SIZE, CONTROL_LINE_HEIGHT),
        (&mut t.typography.lg, 18., 24.),
        (&mut t.typography.xl, 20., 28.),
        (&mut t.typography.mono_md, 13., 20.),
    ] {
        style.size = px(size); style.line_height = px(line);
        style.weight = gpui::FontWeight::NORMAL;
    }
    // Base adds no elevation; the existing surface/menu painters own shadows.
    t.shadow = Default::default();
    t
}

pub fn sync_kit_theme(night: bool, cx: &mut gpui::App) {
    use gpui_base::{Theme, ThemeAppearance};
    let appearance = if night { ThemeAppearance::Dark } else { ThemeAppearance::Light };
    if cx.try_global::<Theme>().is_some_and(|t| t.appearance == appearance
        && t.tokens.colors.primary == Palette::new(night).blue
        && t.tokens.typography.sans.as_ref() == DESKTOP_FONT) { return; }
    let theme = Theme::global_mut(cx);
    theme.appearance = appearance;
    theme.tokens = kit_tokens(night);
}

// Penpot's ring duplicates use 30% opacity and Gaussian blur 4px (failure: 10px).
pub const RING_GLOW_OPACITY: f32 = 0.3;
pub fn ring_glow_blur(stage: Stage) -> u8 {
    if matches!(stage, Stage::Failure | Stage::Partial) { 10 } else { 4 }
}
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
    pub fn primary_text(self) -> Hsla {
        let mut text = self.neutral;
        text.l = if self.night { 0.90 } else { 0.16 };
        text
    }
    pub fn disabled_text(self) -> Hsla {
        self.neutral.opacity(0.55)
    }
    pub fn control_border(self) -> Hsla {
        self.neutral.opacity(if self.night { 0.35 } else { 0.23 })
    }
    pub fn semantic(self, stage: Stage) -> Hsla {
        match stage {
            Stage::Downloading => self.blue,
            Stage::Transcoding => self.orange,
            Stage::Success => self.green,
            Stage::Failure | Stage::Partial => self.red,
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
                Stage::Failure | Stage::Partial => self.red.opacity(0.14),
                _ => self.badge,
            }
        } else {
            match stage {
                Stage::Downloading => rgb(0xe9f3ff).into(),
                Stage::Transcoding => rgb(0xfdf1e5).into(),
                Stage::Success => rgb(0xe8f5ed).into(),
                Stage::Failure | Stage::Partial => rgb(0xfcecec).into(),
                _ => self.badge,
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn kit_theme_preserves_measured_roles_and_control_geometry() {
        for night in [false, true] {
            let t = kit_tokens(night);
            let p = Palette::new(night);
            assert_eq!(t.colors.surface, p.surface);
            assert_eq!(t.colors.ring, p.blue);
            assert_eq!(t.colors.destructive, p.red);
            assert_ne!(t.colors.foreground, t.colors.surface);
            assert_eq!(t.typography.sans.as_ref(), DESKTOP_FONT);
            assert_eq!(t.typography.mono.as_ref(), LATIN_FONT);
            assert_eq!(t.typography.sm.size, gpui::px(13.));
            assert_eq!(t.radius.md, gpui::px(6.));
            assert!(t.shadow.md.is_empty());
        }
        assert_ne!(kit_tokens(false).colors.surface, kit_tokens(true).colors.surface);
    }
    #[test]
    fn downloading_retains_original_theme_blue() {
        let light = Palette::new(false);
        let night = Palette::new(true);
        assert_eq!(light.blue, Hsla::from(rgb(0x0285ff)));
        assert_eq!(light.ring(Stage::Downloading), light.blue);
        assert_eq!(night.blue, Hsla::from(rgb(0x3d9aff)));
        assert_eq!(night.ring(Stage::Downloading), night.blue);
    }

    // Native text shaping is an integration check, separate from headless logic tests.
    #[cfg(target_os = "windows")]
    #[test]
    #[ignore = "requires the Windows native text system; run with --ignored --test-threads=1"]
    fn native_mixed_labels_use_platform_chinese_and_bundled_latin() {
        use gpui::*;
        use std::borrow::Cow;
        struct FontCheck;
        impl Render for FontCheck {
            fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
                div()
            }
        }
        gpui_platform::application().run(|cx| {
            cx.text_system()
                .add_fonts(LATIN_FONT_BYTES.into_iter().map(Cow::Borrowed).collect())
                .unwrap();
            cx.open_window(
                WindowOptions {
                    show: false,
                    focus: false,
                    ..Default::default()
                },
                |window, cx| {
                    let text_system = window.text_system();
                    let mut mixed_font = ui_font();
                    mixed_font.weight = FontWeight::MEDIUM;
                    let latin_id = text_system.resolve_font(&mixed_font);
                    let mut chinese_font = font(CHINESE_FONT);
                    chinese_font.weight = FontWeight::MEDIUM;
                    let chinese_id = text_system.resolve_font(&chinese_font);
                    for stage in [
                        Stage::Resolving,
                        Stage::Downloading,
                        Stage::Transcoding,
                        Stage::Success,
                        Stage::Failure,
                        Stage::Cancelled,
                    ] {
                        let text = stage.name();
                        let line = text_system.shape_line(
                            text.into(),
                            px(8.),
                            &[TextRun {
                                len: text.len(),
                                font: mixed_font.clone(),
                                color: black(),
                                background_color: None,
                                underline: None,
                                strikethrough: None,
                            }],
                            None,
                        );
                        assert!(
                            line.width <= px(94.),
                            "label overflows its pill: {text}, {}",
                            line.width
                        );
                        assert!(
                            line.ascent + line.descent <= px(16.),
                            "label overflows vertically: {text}"
                        );
                        for (index, character) in text.char_indices() {
                            if character.is_ascii_alphanumeric() {
                                assert_eq!(
                                    line.font_id_for_index(index),
                                    Some(latin_id),
                                    "Latin fallback changed for {text}"
                                );
                            } else if ('一'..='鿿').contains(&character) {
                                assert_eq!(
                                    line.font_id_for_index(index),
                                    Some(chinese_id),
                                    "Chinese fallback changed for {text}"
                                );
                            }
                        }
                        println!(
                            "{text}: {}; platform Chinese and JetBrains Mono verified",
                            line.width
                        );
                    }
                    cx.new(|_| FontCheck)
                },
            )
            .unwrap();
            cx.quit();
        });
    }
}
