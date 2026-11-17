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

fn clip_bounds(
    image_bounds: Bounds<Pixels>,
    diameter: f32,
    native_side: f32,
    snap: impl Fn(Pixels) -> Pixels,
) -> Bounds<Pixels> {
    let image_origin = snap(px((native_side - 60.) * 0.5));
    let surface_origin = snap(px((native_side - diameter) * 0.5));
    let inset = surface_origin - image_origin;
    let side = snap(px(diameter));
    Bounds::new(image_bounds.origin + point(inset, inset), size(side, side))
}

pub fn element(image: Arc<RenderImage>, diameter: f32, native_side: f32, alpha: f32) -> impl IntoElement {
    // Keep the authored image on a fixed layout box. Mixing its raw inset with
    // the already snapped compression box makes atlas cropping move the artwork.
    let origin = px((native_side - 60.) * 0.5);
    canvas(|_, _, _| (), move |image_bounds, _, window, _| {
        let clip = clip_bounds(image_bounds, diameter, native_side, |value| window.pixel_snap(value));
        let radius = clip.size.width.min(clip.size.height) * 0.5;
        let _ = window.paint_image(clip, image_bounds, Corners::all(radius), image, 0, false);
    }).absolute().left(origin).top(origin).size(px(60.)).opacity(alpha)
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
    use super::{clip_bounds, rig, Pose};
    use gpui::{point, px, Bounds, Pixels};
    use gpui::{DevicePixels, size, SvgRenderer, SvgSize};
    use std::sync::Arc;

    // Match the pinned GPUI device grid; half-pixel ties go toward zero.
    fn snap(value: Pixels, scale: f32) -> Pixels {
        let device = f32::from(value) * scale;
        px((device.abs() - 0.5).ceil().copysign(device) / scale)
    }

    fn artwork_bounds(native: f32, scale: f32) -> Bounds<Pixels> {
        let origin = snap(px((native - 60.) * 0.5), scale);
        let side = snap(px(60.), scale);
        Bounds::new(point(origin, origin), gpui::size(side, side))
    }

    fn atlas_origin(clip: Bounds<Pixels>, image: Bounds<Pixels>, scale: f32) -> [i32; 2] {
        // paint_image rounds the cropped atlas offset separately from its destination.
        let visible = clip.intersect(&image);
        let source_width = (f32::from(image.size.width) * scale).round();
        let source_height = (f32::from(image.size.height) * scale).round();
        let cropped_x = (f32::from(visible.origin.x - image.origin.x)
            / f32::from(image.size.width) * source_width).round() as i32;
        let cropped_y = (f32::from(visible.origin.y - image.origin.y)
            / f32::from(image.size.height) * source_height).round() as i32;
        [
            (f32::from(visible.origin.x) * scale).round() as i32 - cropped_x,
            (f32::from(visible.origin.y) * scale).round() as i32 - cropped_y,
        ]
    }

    #[test]
    fn compression_keeps_artwork_stationary_on_recorded_callback_times() {
        // One existing real Full→Compact run, 11813–12597ms; no desktop replay.
        let callbacks = [
            0, 18, 22, 25, 28, 31, 35, 39, 42, 45, 48, 52, 56, 59, 62, 65,
            69, 72, 75, 78, 81, 84, 87, 90, 93, 97, 100, 103, 106, 109, 112, 115,
            119, 122, 125, 129, 132, 135, 139, 142, 145, 148, 152, 156, 159, 162, 165, 169,
            173, 176, 179, 181, 185, 189, 191, 194, 197, 199, 204, 208, 211, 213, 216, 220,
            223, 234, 239, 242, 251, 256, 268, 272, 285, 289, 301, 318, 334, 351, 367, 384,
            400, 418, 434, 452, 467, 484, 501, 517, 534, 550, 568, 584, 601, 617, 634, 650,
            668, 684, 701, 717, 734, 750, 767, 784
        ];
        for scale in [1., 1.25, 1.5, 2.] {
            let mut motion = crate::repair_motion::Motion::new(0);
            motion.tick(0, true, true);
            motion.tick(0, false, false);
            let image = artwork_bounds(80., scale);
            let expected = [
                (f32::from(image.origin.x) * scale).round() as i32,
                (f32::from(image.origin.y) * scale).round() as i32,
            ];
            let mut compressed = 0;
            for now in callbacks {
                motion.tick(now, false, false);
                let g = motion.geometry();
                if g.surface >= 60. { continue; }
                compressed += 1;
                assert_eq!(g.native, 80.);
                let clip = clip_bounds(image, g.surface, g.native, |value| snap(value, scale));
                assert_eq!(atlas_origin(clip, image, scale), expected, "{scale}x at {now}ms");
                let origin = snap(px((g.native - g.surface) * 0.5), scale);
                let side = snap(px(g.surface), scale);
                assert_eq!(clip, Bounds::new(point(origin, origin), gpui::size(side, side)));
            }
            assert!(compressed > 10);
        }
    }

    #[test]
    fn compression_clip_follows_reversal_and_reduced_endpoints() {
        for scale in [1., 1.25, 1.5, 2.] {
            let mut motion = crate::repair_motion::Motion::new(0);
            motion.tick(0, true, true);
            motion.tick(0, false, false);
            for now in [0, 19, 41, 78, 109, 147, 186, 221, 265, 302, 341, 379, 417, 452] {
                motion.tick(now, false, false);
            }
            let surface = motion.geometry().surface;
            assert!(surface < 60.);
            motion.tick(452, true, false);
            assert_eq!(motion.geometry().surface, surface);
            for (now, reduced) in [(452, false), (469, false), (498, false), (527, false), (551, true)] {
                motion.tick(now, true, reduced);
                let g = motion.geometry();
                let image = artwork_bounds(g.native, scale);
                let clip = clip_bounds(image, g.surface.min(60.), g.native, |value| snap(value, scale));
                let edges = |bounds: Bounds<Pixels>| [bounds.left(), bounds.top(), bounds.right(), bounds.bottom()]
                    .map(|value| (f32::from(value) * scale).round() as i32);
                assert_eq!(edges(clip.intersect(&image)), edges(clip));
                assert_eq!(atlas_origin(clip, image, scale), [
                    (f32::from(image.origin.x) * scale).round() as i32,
                    (f32::from(image.origin.y) * scale).round() as i32,
                ]);
            }
            motion.tick(551, false, true);
            let image = artwork_bounds(80., scale);
            assert_eq!(clip_bounds(image, 60., 80., |value| snap(value, scale)), image);
        }
    }

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
