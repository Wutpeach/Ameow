use gpui::*;
use std::borrow::Cow;

#[path = "../src/model.rs"]
#[allow(dead_code)]
mod model;
#[path = "../src/repair_motion.rs"]
#[allow(dead_code)]
mod repair_motion;
#[path = "../src/tokens.rs"]
#[allow(dead_code)]
mod tokens;

fn main() {
    let platform = gpui_platform::current_platform(true);
    let native_text = platform.text_system();
    native_text
        .add_fonts(
            tokens::LATIN_FONT_BYTES
                .into_iter()
                .map(Cow::Borrowed)
                .collect(),
        )
        .unwrap();
    let mut failure = false;
    for family in [
        tokens::DESKTOP_FONT,
        tokens::LATIN_FONT,
        tokens::CHINESE_FONT,
    ] {
        let font_id = native_text.font_id(&font(family)).unwrap();
        for character in if family == tokens::CHINESE_FONT {
            ['设', '置']
        } else {
            ['A', 'm']
        } {
            let glyph_id = native_text.glyph_for_char(font_id, character).unwrap();
            let params = RenderGlyphParams {
                font_id,
                glyph_id,
                font_size: px(16.),
                subpixel_variant: point(0, 0),
                scale_factor: 2.,
                is_emoji: false,
                subpixel_rendering: false,
                dilation: 0,
            };
            let bounds = native_text.glyph_raster_bounds(&params).unwrap();
            let (bitmap_size, bytes) = native_text.rasterize_glyph(&params, bounds).unwrap();
            let ink = bytes.iter().filter(|byte| **byte != 0).count();
            failure |= bitmap_size.width.0 <= 0 || bitmap_size.height.0 <= 0 || ink == 0;
            println!(
                "{family} {character}: font={font_id:?} glyph={glyph_id:?} size={bitmap_size:?} ink={ink}"
            );
        }
    }
    assert!(
        !failure,
        "Native text has no ink; enable gpui_platform/font-kit on macOS"
    );
}
