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

fn paint_geometry(
    bounds: Bounds<Pixels>,
    radius: f32,
) -> (Bounds<Pixels>, Bounds<Pixels>, Corners<Pixels>) {
    // The full source image follows the same post-layout frame as its surface.
    let corners = Corners::all(px(radius)).clamp_radii_for_quad_size(bounds.size);
    (bounds, bounds, corners)
}

pub fn element(image: Arc<RenderImage>, radius: f32, alpha: f32) -> impl IntoElement {
    canvas(|_, _, _| (), move |bounds, _, window, _| {
        let (clip, image_bounds, corners) = paint_geometry(bounds, radius);
        let _ = window.paint_image(clip, image_bounds, corners, image, 0, false);
    }).absolute().left(px(0.)).top(px(0.)).size_full().opacity(alpha)
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
    use super::{paint_geometry, rig, Pose};
    use gpui::{point, px, Bounds, Pixels};
    use gpui::{DevicePixels, size, SvgRenderer, SvgSize};
    use std::sync::Arc;

    // Match the pinned GPUI device grid; half-pixel ties go toward zero.
    fn snap(value: Pixels, scale: f32) -> Pixels {
        let device = f32::from(value) * scale;
        px((device.abs() - 0.5).ceil().copysign(device) / scale)
    }

    fn surface_bounds(g: crate::model::Geometry, scale: f32) -> Bounds<Pixels> {
        let origin = snap(px(g.gutter + (g.native - 2. * g.gutter - g.surface) * 0.5), scale);
        let side = snap(px(g.surface), scale);
        Bounds::new(point(origin, origin), gpui::size(side, side))
    }

    fn assert_shared_frame(bounds: Bounds<Pixels>, radius: f32, scale: f32) {
        let (clip, image, corners) = paint_geometry(bounds, radius);
        assert_eq!(clip, bounds);
        assert_eq!(image, bounds);
        // Cat and sill landmarks use the same 60px source-to-surface transform.
        for [x, y] in [[30., 33.3], [30., 45.], [17., 28.], [43., 28.]] {
            let position = image.origin + point(image.size.width * (x / 60.), image.size.height * (y / 60.));
            let expected = bounds.origin + point(bounds.size.width * (x / 60.), bounds.size.height * (y / 60.));
            assert_eq!(position, expected);
        }
        // A full-source atlas rectangle has no independent cropped-pixel offset.
        let visible = clip.intersect(&image);
        let source_side = (60. * scale).round();
        for (near, origin, visible_side, side) in [
            (visible.origin.x, image.origin.x, visible.size.width, image.size.width),
            (visible.origin.y, image.origin.y, visible.size.height, image.size.height),
        ] {
            assert_eq!((f32::from(near - origin) / f32::from(side) * source_side).round(), 0.);
            assert_eq!((f32::from(visible_side) / f32::from(side) * source_side).round(), source_side);
        }
        assert!(corners.top_left <= bounds.size.width * 0.5);
        assert!(corners.top_left <= bounds.size.height * 0.5);
    }

    #[test]
    fn shared_frame_follows_compression_on_recorded_callback_times() {
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
            let mut minimum_side = f32::MAX;
            let mut maximum_side = 0f32;
            let mut compressed = 0;
            for now in callbacks {
                motion.tick(now, false, false);
                let g = motion.geometry();
                if motion.x >= 0.2 { continue; } // The existing Mascot fade is visible below here.
                let bounds = surface_bounds(g, scale);
                assert_shared_frame(bounds, g.radius, scale);
                let side = f32::from(bounds.size.width);
                minimum_side = minimum_side.min(side);
                maximum_side = maximum_side.max(side);
                compressed += usize::from(g.surface < 60.);
            }
            assert!(minimum_side < 59.);
            assert!(maximum_side > 60.);
            assert!(compressed > 10);
        }
    }

    #[test]
    fn shared_frame_preserves_reversal_and_reduced_endpoints() {
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
                assert_shared_frame(surface_bounds(g, scale), g.radius, scale);
            }
            motion.tick(551, false, true);
            let compact = surface_bounds(motion.geometry(), scale);
            assert_shared_frame(compact, 30., scale);
            assert_eq!(compact.size.width, snap(px(60.), scale));
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
