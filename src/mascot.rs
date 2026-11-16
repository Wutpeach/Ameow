//! The approved layered vector rig, rendered by GPUI's existing native SVG renderer.
use crate::mascot_motion::{Idle, Pose};
use gpui::{prelude::*, *};
use std::sync::Arc;

const LIGHT: &str = include_str!("../assets/mascot/light.svg");
const NIGHT: &str = include_str!("../assets/mascot/night.svg");

pub struct Mascot {
    idle: Idle,
    pub pose: Pose,
    cache: Option<(Pose, bool, f32, Arc<RenderImage>)>,
    pub raster_us: u128,
}
impl Mascot {
    pub fn new(seed: u64) -> Self {
        Self { idle: Idle::new(seed), pose: Pose::default(), cache: None, raster_us: 0 }
    }
    pub fn sample(&mut self, now: u64, visible: bool, reduced: bool) -> Option<u64> {
        let (pose, delay) = self.idle.sample(now, visible, reduced);
        self.pose = pose;
        delay
    }
    pub fn image(&mut self, night: bool, window: &mut Window, cx: &App) -> Arc<RenderImage> {
        let scale = window.scale_factor();
        if let Some((pose, cached_night, cached_scale, image)) = &self.cache {
            if *pose == self.pose && *cached_night == night && *cached_scale == scale {
                self.raster_us = 0;
                return image.clone();
            }
        }
        let started = std::time::Instant::now();
        let svg = rig(self.pose, night);
        let image = cx.svg_renderer().render_single_frame(svg.as_bytes(), scale)
            .expect("embedded Mascot vector rig");
        self.raster_us = started.elapsed().as_micros();
        if let Some((_, _, _, previous)) = self.cache.take() {
            // Each animated pose has a new image id; do not retain a frame history in the atlas.
            let _ = window.drop_image(previous);
        }
        self.cache = Some((self.pose, night, scale, image.clone()));
        image
    }
}

fn rig(p: Pose, night: bool) -> String {
    let mut svg = if night { NIGHT } else { LIGHT }.to_owned();
    svg = svg.replace("id=\"head\" transform=\"translate(0 0)\"",
        &format!("id=\"head\" transform=\"translate({} {})\"", p.head[0], p.head[1]));
    for (side, pivot, angle) in [("left", 17, p.ears[0]), ("right", 43, p.ears[1])] {
        svg = svg.replace(&format!("id=\"ear-{side}\" transform=\"rotate(0 {pivot} 28)\""),
            &format!("id=\"ear-{side}\" transform=\"rotate({} {pivot} 28)\"", angle.to_degrees()));
        // One eye group keeps socket, pupil and glint on the same closing lid.
        svg = svg.replace(&format!("id=\"eye-{side}\" transform=\"translate(0 33.3) scale(1 1) translate(0 -33.3)\""),
            &format!("id=\"eye-{side}\" transform=\"translate(0 33.3) scale(1 {}) translate(0 -33.3)\"", 1. - 0.925 * p.blink));
        svg = svg.replace(&format!("id=\"gaze-{side}\" transform=\"translate(0 0)\""),
            &format!("id=\"gaze-{side}\" transform=\"translate({} {})\"", p.gaze[0], p.gaze[1]));
        svg = svg.replace(&format!("id=\"glint-{side}\" opacity=\"1\""),
            &format!("id=\"glint-{side}\" opacity=\"{}\"", (1. - p.blink).powi(2)));
    }
    svg
}

pub fn element(image: Arc<RenderImage>, diameter: f32) -> impl IntoElement {
    canvas(|_, _, _| (), move |bounds, _, window, _| {
        // Converged collapse briefly compresses below 60px. Keep the rig at its
        // authored scale and clip it to the actual surface, including that overshoot.
        let inset = px((diameter - 60.) * 0.5);
        let image_bounds = Bounds::new(bounds.origin + point(inset, inset), size(px(60.), px(60.)));
        let _ = window.paint_image(bounds, image_bounds, Corners::all(px(diameter * 0.5)), image, 0, false);
    }).size(px(diameter))
}

pub fn preview_pose(state: &str) -> Option<Pose> {
    match state {
        "mascot-blink" => Some(Pose { blink: 1., ..Pose::default() }),
        "mascot-observe" => Some(Pose { gaze: [-0.6, -0.12], head: [-0.3, -0.06], ..Pose::default() }),
        "mascot-ears" => Some(Pose { ears: [0.05, -0.02], ..Pose::default() }),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{rig, Pose};
    use gpui::{DevicePixels, size, SvgRenderer, SvgSize};
    use std::sync::Arc;
    #[test]
    fn native_rig_preserves_foreground_and_closes_both_eyes_without_glints() {
        for night in [false, true] {
            let rest = rig(Pose::default(), night);
            let closed = rig(Pose { blink: 1., gaze: [0.6, -0.12], head: [0.3, -0.06], ears: [0.05, -0.04] }, night);
            for side in ["left", "right"] {
                assert!(closed.contains(&format!("id=\"glint-{side}\" opacity=\"0\"")));
            }
            let renderer = SvgRenderer::new(Arc::new(()));
            for scale in [1, 2] {
                let width = 60 * scale;
                let render = |svg: &str| {
                    let parsed = renderer.parse_svg(svg.as_bytes()).unwrap();
                    renderer.render_parsed(&parsed, SvgSize::ExactSize(size(DevicePixels(width), DevicePixels(width)))).unwrap()
                };
                let open_image = render(&rest);
                let closed_image = render(&closed);
                let open = open_image.as_bytes(0).unwrap();
                let shut = closed_image.as_bytes(0).unwrap();
                assert_ne!(open, shut, "eyes must visibly change");
                assert_eq!(&open[(42 * scale * width * 4) as usize..], &shut[(42 * scale * width * 4) as usize..], "foreground must stay fixed");
                assert_eq!(shut[3], 0, "circular clip excludes the corner");
                if let Some(directory) = std::env::var_os("AMEOW_MASCOT_RASTER_DIR") {
                    let directory = std::path::PathBuf::from(directory);
                    std::fs::create_dir_all(&directory).unwrap();
                    for (name, bytes) in [("open", open), ("closed", shut)] {
                        std::fs::write(directory.join(format!("{}-{name}-{width}.bgra", if night { "night" } else { "light" })), bytes).unwrap();
                    }
                }
            }
            let foreground = |s: &str| s[s.find("id=\"perch-a\"").unwrap()..].to_owned();
            assert_eq!(foreground(&rest), foreground(&closed));
            assert!(closed.contains("rx=\"30\""));
        }
    }
}
