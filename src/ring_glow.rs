//! Blurred copies of the foreground arc. GPUI caches each SVG alpha mask;
//! angle and state colour are applied on the GPU, never baked into cache keys.
use gpui::{prelude::*, *};
use std::f32::consts::{FRAC_PI_2, TAU};

const STEPS: u16 = 128;
const PADDING: f32 = 32.; // Three sigma of the widest (10px) blur, outside the 50px ring.
const SIZE: f32 = 50. + PADDING * 2.;
const CENTER: f32 = SIZE / 2.;
pub const FOLDER_SIZE: f32 = 24.;
const FOLDER_GLOW: &str = "icon-glow/folder.svg";

fn path(step: u16, blur: u8) -> SharedString {
    format!("ring-glow/{blur}/{step}.svg").into()
}

pub fn asset_paths() -> impl Iterator<Item = SharedString> {
    [4, 10]
        .into_iter()
        .flat_map(|blur| (1..=STEPS).map(move |step| path(step, blur)))
        .chain(std::iter::once(FOLDER_GLOW.into()))
}

pub fn load(path: &str) -> Option<Vec<u8>> {
    if path == FOLDER_GLOW {
        // Blur the same bundled folder artwork that supplies the foreground icon.
        let icon = gpui_kit_assets::Assets.load("icons/folder.svg").ok()??;
        let icon = std::str::from_utf8(&icon).ok()?.replace("currentColor", "white");
        let side = FOLDER_SIZE + 2. * PADDING;
        let blur = crate::tokens::ring_glow_blur(crate::model::Stage::Success);
        return Some(format!("<svg xmlns='http://www.w3.org/2000/svg' width='{side}' height='{side}' viewBox='-{PADDING} -{PADDING} {side} {side}'><defs><filter id='glow' filterUnits='userSpaceOnUse' x='-{PADDING}' y='-{PADDING}' width='{side}' height='{side}' color-interpolation-filters='sRGB'><feGaussianBlur stdDeviation='{blur}'/></filter></defs><g filter='url(#glow)'>{icon}</g></svg>").into_bytes());
    }
    let key = path.strip_prefix("ring-glow/")?.strip_suffix(".svg")?;
    let (blur, step) = key.split_once('/')?;
    let blur: u8 = blur.parse().ok()?;
    let step: u16 = step.parse().ok()?;
    if ![4, 10].contains(&blur) || !(1..=STEPS).contains(&step) {
        return None;
    }
    let shape = if step == STEPS {
        format!("<circle cx='{CENTER}' cy='{CENTER}' r='22.5'/>")
    } else {
        let angle = step as f32 / STEPS as f32 * TAU - FRAC_PI_2;
        let x = CENTER + 22.5 * angle.cos();
        let y = CENTER + 22.5 * angle.sin();
        let large = u8::from(step > STEPS / 2);
        format!(
            "<path d='M{CENTER} {} A22.5 22.5 0 {large} 1 {x:.4} {y:.4}'/>",
            CENTER - 22.5
        )
    };
    Some(format!(
        "<svg xmlns='http://www.w3.org/2000/svg' width='{SIZE}' height='{SIZE}' viewBox='0 0 {SIZE} {SIZE}'>
         <defs><filter id='glow' filterUnits='userSpaceOnUse' x='0' y='0' width='{SIZE}' height='{SIZE}' color-interpolation-filters='sRGB'>
         <feGaussianBlur stdDeviation='{blur}'/></filter></defs>
         <g fill='none' stroke='white' stroke-width='5' stroke-linecap='round' filter='url(#glow)'>{shape}</g></svg>"
    ).into_bytes())
}

pub fn folder(color: Hsla) -> impl IntoElement {
    svg().absolute().left(px(-PADDING)).top(px(-PADDING))
        .size(px(FOLDER_SIZE + 2. * PADDING)).path(FOLDER_GLOW).text_color(color)
}

#[cfg(test)]
mod tests {
    use super::{load, FOLDER_GLOW, asset_paths};
    use gpui::AssetSource;
    #[test]
    fn folder_glow_uses_the_bundled_foreground_art_and_status_blur() {
        let source = gpui_kit_assets::Assets.load("icons/folder.svg").unwrap().unwrap();
        let source = std::str::from_utf8(&source).unwrap().replace("currentColor", "white");
        let glow = String::from_utf8(load(FOLDER_GLOW).unwrap()).unwrap();
        assert!(glow.contains(&source));
        let blur = crate::tokens::ring_glow_blur(crate::model::Stage::Success);
        assert!(glow.contains(&format!("stdDeviation='{blur}'")));
        assert!(asset_paths().any(|path| path == FOLDER_GLOW));
    }
}

pub fn arc(start: f32, sweep: f32, blur: u8, color: Hsla) -> impl IntoElement {
    let step = (sweep.clamp(0., 1.) * STEPS as f32).round() as u16;
    div()
        .absolute()
        .left(px(-PADDING))
        .top(px(-PADDING))
        .size(px(SIZE))
        .when(step > 0 && color.a > 0., |s| {
            s.child(
                svg()
                    .size_full()
                    .path(path(step, blur))
                    .text_color(color)
                    .with_transformation(Transformation::rotate(radians(start * TAU))),
            )
        })
}
