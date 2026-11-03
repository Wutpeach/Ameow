//! Blurred copies of the foreground arc. GPUI caches each SVG alpha mask;
//! angle and state colour are applied on the GPU, never baked into cache keys.
use gpui::{prelude::*, *};
use std::f32::consts::{FRAC_PI_2, TAU};

const STEPS: u16 = 128;
const PADDING: f32 = 32.; // Three sigma of the widest (10px) blur, outside the 50px ring.
const SIZE: f32 = 50. + PADDING * 2.;
const CENTER: f32 = SIZE / 2.;

fn path(step: u16, blur: u8) -> SharedString {
    format!("ring-glow/{blur}/{step}.svg").into()
}

pub fn asset_paths() -> impl Iterator<Item = SharedString> {
    [4, 10]
        .into_iter()
        .flat_map(|blur| (1..=STEPS).map(move |step| path(step, blur)))
}

pub fn load(path: &str) -> Option<Vec<u8>> {
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
