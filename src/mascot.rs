//! One prepared 60px rig and one composed frame, using the existing raster stack.
use crate::{mascot_motion::{Idle, Pose}, mascot_reveal::Scene, mascot_scene::Prepared, model::Geometry, tokens::Palette};
use gpui::*;
use std::sync::Arc;
use tiny_skia::{Pixmap, Transform};
use crate::mascot_layers::{LIGHT, NIGHT};

pub struct Mascot {
    idle: Idle,
    pub pose: Pose,
    prepared: Option<(Pose, bool, f32, Pixmap)>,
    scene_prepared: Option<(Pose, bool, f32, Prepared)>,
    cache: Option<(Pose, bool, f32, SurfaceFrame, f32, Scene, Arc<RenderImage>)>,
    pub raster_us: u128,
    pub prepare_us: u128,
}
impl Mascot {
    pub fn new(seed: u64) -> Self {
        Self { idle: Idle::new(seed), pose: Pose::default(), prepared: None, scene_prepared: None, cache: None, raster_us: 0, prepare_us: 0 }
    }
    pub fn sample(&mut self, now: u64, visible: bool, reduced: bool) -> Option<u64> {
        let (pose, delay) = self.idle.sample(now, visible, reduced);
        self.pose = pose;
        delay
    }
    pub fn image(&mut self, night: bool, frame: SurfaceFrame, alpha: f32, scene: Scene, window: &mut Window, cx: &App) -> Arc<RenderImage> {
        let scale = window.scale_factor();
        self.prepare_us = 0;
        if let Some((pose, cached_night, cached_scale, cached_frame, cached_alpha, cached_scene, image)) = &self.cache {
            if *pose == self.pose && *cached_night == night && *cached_scale == scale && *cached_frame == frame && *cached_alpha == alpha && *cached_scene == scene {
                self.raster_us = 0;
                return image.clone();
            }
        }
        let started = std::time::Instant::now();
        let pixels = self.compose_frame(night, frame, alpha, scene, scale, &cx.svg_renderer());
        let side = pixels.width();
        let bytes = straight_bgra(pixels);
        let image = Arc::new(RenderImage::new(vec![image::Frame::new(image::RgbaImage::from_raw(side, side, bytes).expect("surface pixels"))]));
        self.raster_us = started.elapsed().as_micros();
        if let Some((_, _, _, _, _, _, previous)) = self.cache.take() { let _ = window.drop_image(previous); }
        self.cache = Some((self.pose, night, scale, frame, alpha, scene, image.clone()));
        image
    }
    pub(crate) fn compose_frame(&mut self, night: bool, frame: SurfaceFrame, alpha: f32, scene: Scene, scale: f32, renderer: &SvgRenderer) -> Pixmap {
        let started = std::time::Instant::now();
        self.prepare_us = 0;
        let resting = scene == crate::mascot_reveal::scene(1.) && frame.surface <= 60.;
        if alpha > 0. && resting && !self.prepared.as_ref().is_some_and(|(pose, n, s, _)| *pose == self.pose && *n == night && *s == scale) {
            let svg = rig(self.pose, night);
            let source = renderer.render_single_frame(svg.as_bytes(), scale).expect("embedded Mascot rig");
            self.prepared = Some((self.pose, night, scale, prepared_pixels(&source)));
            self.prepare_us = started.elapsed().as_micros();
        } else if alpha > 0. && !resting && !self.scene_prepared.as_ref().is_some_and(|(pose, n, s, _)| *pose == self.pose && *n == night && *s == scale) {
            let svg = rig(self.pose, night);
            if let Some((pose, _, _, layers)) = self.scene_prepared.as_mut().filter(|(_, n, s, _)| *n == night && *s == scale) {
                layers.update_head(&svg, renderer, scale);
                *pose = self.pose;
            } else {
                self.scene_prepared = Some((self.pose, night, scale, Prepared::new(&svg, renderer, scale)));
            }
            self.prepare_us = started.elapsed().as_micros();
        }
        if resting {
            frame.compose(self.prepared.as_ref().map(|(_, _, _, pixels)| pixels), alpha, night, scale)
        } else { frame.compose_with(night, scale, |pixels| {
            if alpha > 0. {
                if let Some((_, _, _, prepared)) = &self.scene_prepared { prepared.paint(pixels, frame, scene, alpha, scale); }
            }
        }) }
    }
}

// SVG output is straight BGRA; tiny-skia input is premultiplied RGBA. Convert
// only when preparing a new local pose, never once per window geometry frame.
pub(crate) fn prepared_pixels(source: &RenderImage) -> Pixmap {
    let side = source.size(0).width.0 as u32;
    // Two transparent source pixels keep Bilinear sampling away from Pad edges.
    let mut pixels = Pixmap::new(side + 4, side + 4).expect("prepared source size");
    let width = pixels.width() as usize;
    for (i, source) in source.as_bytes(0).expect("Mascot pixels").chunks_exact(4).enumerate() {
        let offset = ((i / side as usize + 2) * width + i % side as usize + 2) * 4;
        let pixel = &mut pixels.data_mut()[offset..offset+4];
        let a = source[3] as u16;
        for (c, channel) in pixel[..3].iter_mut().zip([source[2], source[1], source[0]]) { *c = ((channel as u16 * a + 127) / 255) as u8; }
        pixel[3] = source[3];
    }
    pixels
}
pub(crate) fn straight_bgra(pixels: Pixmap) -> Vec<u8> {
    let mut bytes = pixels.take();
    for p in bytes.chunks_exact_mut(4) {
        let a = p[3] as u32;
        if a == 0 { p.fill(0); continue; }
        p.swap(0, 2);
        if a != 255 { for c in &mut p[..3] { *c = ((*c as u32 * 255 + a / 2) / a).min(255) as u8; } }
    }
    bytes
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SurfaceFrame {
    pub native: f32,
    pub surface: f32,
    pub radius: f32,
}
impl SurfaceFrame {
    pub fn new(g: Geometry) -> Self { Self { native: g.native, surface: g.surface, radius: g.radius.min(g.surface * 0.5) } }
    pub fn side(self, scale: f32) -> f32 { (self.native * scale).ceil() / scale }
    pub fn bounds(self, carrier: Bounds<Pixels>) -> Bounds<Pixels> {
        let origin = px((self.native - self.surface) * 0.5);
        Bounds::new(carrier.origin + point(origin, origin), size(px(self.surface), px(self.surface)))
    }
    pub(crate) fn compose(self, art: Option<&Pixmap>, alpha: f32, night: bool, scale: f32) -> Pixmap {
        self.compose_with(night, scale, |pixels| {
            if let Some(art) = art.filter(|_| alpha > 0.) {
                let factor = self.surface * scale / (art.width() - 4) as f32;
                let origin = (self.native - self.surface) * 0.5;
                let offset = origin * scale - 2. * factor;
                pixels.draw_pixmap(0, 0, art.as_ref(), &tiny_skia::PixmapPaint { opacity: alpha, quality: tiny_skia::FilterQuality::Bilinear, ..Default::default() }, Transform::from_row(factor, 0., 0., factor, offset, offset), None);
            }
        })
    }
    pub(crate) fn compose_with(self, night: bool, scale: f32, paint_art: impl FnOnce(&mut Pixmap)) -> Pixmap {
        let side = (self.side(scale) * scale).round() as u32;
        let mut pixels = Pixmap::new(side, side).expect("surface size");
        let palette = Palette::new(night);
        let color = |c: Hsla| { let c: Rgba = c.into(); tiny_skia::Color::from_rgba(c.r, c.g, c.b, c.a).expect("surface color") };
        let border = if night { palette.surface.blend(gpui::white().opacity(0.15)) } else { palette.border };
        // Composite before the common outer AA mask, including the border.
        pixels.fill(color(border));
        let origin = (self.native - self.surface) * 0.5;
        let border_width = (scale.abs() - 0.5).ceil() / scale;
        let inner = rounded_path(origin + border_width, self.surface - 2. * border_width, (self.radius - border_width).max(0.));
        let paint = tiny_skia::Paint { shader: tiny_skia::Shader::SolidColor(color(palette.surface)), ..Default::default() };
        pixels.fill_path(&inner, &paint, tiny_skia::FillRule::Winding, Transform::from_scale(scale, scale), None);
        paint_art(&mut pixels);
        let mut mask = tiny_skia::Mask::new(side, side).expect("surface mask");
        mask.fill_path(&rounded_path(origin, self.surface, self.radius), tiny_skia::FillRule::Winding, true, Transform::from_scale(scale, scale));
        pixels.apply_mask(&mask);
        pixels
    }
}
fn rounded_path(origin: f32, side: f32, radius: f32) -> tiny_skia::Path {
    let (l, r) = (origin, origin + side);
    let a = radius.min(side * 0.5);
    let k = a * 0.5522848;
    let mut p = tiny_skia::PathBuilder::new();
    p.move_to(l + a, l); p.line_to(r - a, l);
    p.cubic_to(r - a + k, l, r, l + a - k, r, l + a); p.line_to(r, r - a);
    p.cubic_to(r, r - a + k, r - a + k, r, r - a, r); p.line_to(l + a, r);
    p.cubic_to(l + a - k, r, l, r - a + k, l, r - a); p.line_to(l, l + a);
    p.cubic_to(l, l + a - k, l + a - k, l, l + a, l); p.close();
    p.finish().expect("rounded surface")
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
    use super::{prepared_pixels, straight_bgra, rig, Pose, SurfaceFrame};
    use crate::model::Geometry;
    use gpui::{point, px, Bounds, DevicePixels, RenderImage, size, SvgRenderer, SvgSize};
    use std::sync::Arc;

    const CALLBACKS: &[u64] = &[
            0, 18, 22, 25, 28, 31, 35, 39, 42, 45, 48, 52, 56, 59, 62, 65,
            69, 72, 75, 78, 81, 84, 87, 90, 93, 97, 100, 103, 106, 109, 112, 115,
            119, 122, 125, 129, 132, 135, 139, 142, 145, 148, 152, 156, 159, 162, 165, 169,
            173, 176, 179, 181, 185, 189, 191, 194, 197, 199, 204, 208, 211, 213, 216, 220,
            223, 234, 239, 242, 251, 256, 268, 272, 285, 289, 301, 318, 334, 351, 367, 384,
            400, 418, 434, 452, 467, 484, 501, 517, 534, 550, 568, 584, 601, 617, 634, 650,
            668, 684, 701, 717, 734, 750, 767, 784
    ];

    fn snap(value: f32) -> f32 { (value.abs() - 0.5).ceil().copysign(value) }
    fn alpha_center(bytes: &[u8], side: usize) -> ([f64; 2], u64) {
        let mut moment = [0., 0.];
        let mut area = 0u64;
        for (i, pixel) in bytes.chunks_exact(4).enumerate() {
            let a = pixel[3] as u64;
            area += a;
            moment[0] += (i % side) as f64 * a as f64 + 0.5 * a as f64;
            moment[1] += (i / side) as f64 * a as f64 + 0.5 * a as f64;
        }
        (moment.map(|v| v / area as f64), area)
    }
    fn prepared(renderer: &SvgRenderer, night: bool, scale: f32) -> tiny_skia::Pixmap {
        prepared_pixels(&renderer.render_single_frame(rig(Pose::default(), night).as_bytes(), scale).unwrap())
    }
    fn assert_carrier(frame: SurfaceFrame, scale: f32) {
        let side = frame.side(scale) * scale;
        // GPUI style first rounds size, then paint_image rounds near/far. The
        // carrier is already integral; full source bounds==image_bounds, with
        // no dynamic quad bounds or cropped atlas rectangle to snap separately.
        assert!((side - snap(side)).abs() < 0.0001);
        let bounds = Bounds::new(point(px(0.), px(0.)), size(px(frame.side(scale)), px(frame.side(scale))));
        assert!((f32::from(frame.bounds(bounds).center().x) - frame.native * 0.5).abs() < 0.0001);
    }

    #[test]
    fn composed_pixels_keep_whole_circle_screen_anchor_on_recorded_collapse() {
        let renderer = SvgRenderer::new(Arc::new(()));
        let mut times = Vec::new();
        let mut maximum_center_error = 0f64;
        for scale in [1., 1.25, 1.5, 2.] {
            let art = prepared(&renderer, false, scale); // Once per pose, not per diameter.
            let mut motion = crate::repair_motion::Motion::new(0);
            motion.tick(0, true, true);
            motion.tick(0, false, false);
            let mut negative = 0;
            for &now in CALLBACKS {
                motion.tick(now, false, false);
                if motion.x >= 0. { continue; }
                let frame = SurfaceFrame::new(motion.geometry());
                assert!(frame.surface * scale / ((art.width() - 4) as f32) < 0.75, "actual source scale must use Bilinear, not identity/translation Nearest");
                assert_carrier(frame, scale);
                let start = std::time::Instant::now();
                let pixels = frame.compose(Some(&art), 1., false, scale);
                let side = pixels.width() as usize;
                let bytes = straight_bgra(pixels);
                times.push(start.elapsed().as_micros());
                let (center, _) = alpha_center(&bytes, side);
                for (c, origin) in center.into_iter().zip([504., 304.]) {
                    let screen = origin + c / scale as f64;
                    let expected = origin + 40.;
                    maximum_center_error = maximum_center_error.max((screen - expected).abs() * scale as f64);
                    assert!((screen - expected).abs() < 0.025 / scale as f64, "{now}ms @{scale}: {screen}");
                }
                negative += 1;
            }
            assert!(negative > 10);
        }
        for (surface, old_center) in [(59.32672, 39.5), (58.687088, 40.5), (59., 39.5)] {
            // Includes the half-pixel tie which a raw float quad still snaps wrong.
            assert_eq!(snap((80. - surface) * 0.5) + snap(surface) * 0.5, old_center);
            let frame = SurfaceFrame::new(Geometry { surface, ..Geometry::at(0.) });
            let pixels = frame.compose(None, 0., false, 1.);
            assert!((alpha_center(&straight_bgra(pixels), 80).0[0] - 40.).abs() < 0.025);
        }
        times.sort();
        eprintln!("whole-circle maximum coverage-center error={maximum_center_error:.6} device px");
        eprintln!("cached-source composition ({} samples): median={}us p95={}us max={}us", times.len(), times[times.len()/2], times[times.len()*95/100], times[times.len()-1]);
    }

    #[test]
    fn final_paint_keeps_subpixel_radius_and_zero_endpoint_phase() {
        let renderer = SvgRenderer::new(Arc::new(()));
        for scale in [1., 1.25, 1.5, 2.] {
            let art = prepared(&renderer, true, scale);
            let mut previous = None;
            let mut previous_area = 0;
            for surface in [58.75, 59., 59.25, 59.5, 59.75, 60.] {
                let frame = SurfaceFrame::new(Geometry { surface, ..Geometry::at(0.) });
                let pixels = frame.compose(Some(&art), 1., true, scale);
                let side = pixels.width() as usize;
                let bytes = straight_bgra(pixels);
                let (center, area) = alpha_center(&bytes, side);
                assert!(center.into_iter().all(|c| (c - 40. * scale as f64).abs() < 0.025));
                assert!(area > previous_area, "radius must not stick at 2dp intervals");
                if let Some(previous) = previous { assert_ne!(bytes, previous); }
                previous = Some(bytes);
                previous_area = area;
            }
            let mut last_center: Option<f64> = None;
            for x in [-0.00001, 0., 0.00001] {
                let mut g = Geometry::at(x);
                g.surface += 140. * x.min(0.);
                let frame = SurfaceFrame::new(g);
                assert_carrier(frame, scale);
                let pixels = frame.compose(None, 0., false, scale);
                let side = pixels.width() as usize;
                let center = alpha_center(&straight_bgra(pixels), side).0;
                if let Some(last) = last_center { assert!((center[0] - last).abs() < 0.025); }
                last_center = Some(center[0]);
            }
            for x in [0., 1.] {
                let frame = SurfaceFrame::new(Geometry::at(x));
                assert_carrier(frame, scale);
                let pixels = frame.compose(None, 0., false, scale);
                let side = pixels.width() as usize;
                let center = alpha_center(&straight_bgra(pixels), side).0;
                assert!((center[0] - frame.native as f64 * scale as f64 * 0.5).abs() < 0.025);
            }
        }
    }

    #[test]
    fn cached_art_landmarks_follow_the_same_continuous_surface_transform() {
        let mut maximum_sampling_error = 0f64;
        for scale in [1., 1.25, 1.5, 2.] {
            let source_side = (120. * scale) as u32; // Same 2x preparation as the real rig.
            let mut art = tiny_skia::Pixmap::new(source_side + 4, source_side + 4).unwrap();
            for (y, color) in [(30., tiny_skia::Color::from_rgba8(255, 0, 0, 255)), (45., tiny_skia::Color::from_rgba8(0, 255, 0, 255))] {
                let mut path = tiny_skia::PathBuilder::new();
                path.push_circle(2. + 60. * scale, 2. + y * 2. * scale, 3.);
                let paint = tiny_skia::Paint { shader: tiny_skia::Shader::SolidColor(color), ..Default::default() };
                art.fill_path(&path.finish().unwrap(), &paint, tiny_skia::FillRule::Winding, tiny_skia::Transform::identity(), None);
            }
            for surface in [57., 58.687088, 59., 59.32672, 60., 70.] {
                let frame = SurfaceFrame::new(Geometry { surface, ..Geometry::at(0.) });
                let pixels = frame.compose(Some(&art), 1., false, scale);
                let side = pixels.width() as usize;
                let bytes = straight_bgra(pixels);
                for (channel, source_y) in [(2, 30.), (1, 45.)] {
                    let mut mass = 0.;
                    let mut moment = [0., 0.];
                    for (i, p) in bytes.chunks_exact(4).enumerate() {
                        let weight = p[channel].saturating_sub(p[0]) as f64;
                        mass += weight;
                        moment[0] += (i % side) as f64 * weight + 0.5 * weight;
                        moment[1] += (i / side) as f64 * weight + 0.5 * weight;
                    }
                    let expected = [40. * scale, (40. + surface * (source_y / 60. - 0.5)) * scale];
                    for (axis, (actual, expected)) in moment.map(|v| v / mass).into_iter().zip(expected).enumerate() {
                        let error = (actual - expected as f64).abs();
                        maximum_sampling_error = maximum_sampling_error.max(error);
                        // Center registration is symmetric. A small off-center
                        // feature has normal discrete Bilinear coverage error.
                        let tolerance = if axis == 0 || source_y == 30. { 0.025 } else { 0.2 };
                        assert!(error < tolerance, "@{scale} S{surface} marker{source_y}: {actual} vs {expected}");
                    }
                }
            }
        }
        eprintln!("cached landmark maximum coverage-centroid error={maximum_sampling_error:.6} device px");
    }

    #[test]
    fn composed_frame_preserves_reversal_reduced_and_legitimate_travel() {
        for scale in [1., 1.25, 1.5, 2.] {
            for x in [0., 0.2, 0.9, 1.] {
                let g = Geometry::at(x);
                let frame = SurfaceFrame::new(g);
                let hover = [snap(2.3 * scale) / scale, snap(-1.7 * scale) / scale];
                let carrier = Bounds::new(point(px(hover[0]), px(hover[1])), size(px(frame.side(scale)), px(frame.side(scale))));
                let bounds = frame.bounds(carrier);
                assert!((f32::from(bounds.origin.x) - (hover[0] + g.gutter)).abs() < 0.0001);
                assert!((f32::from(bounds.center().x) - (hover[0] + g.native * 0.5)).abs() < 0.0001);
            }
            let mut motion = crate::repair_motion::Motion::new(0);
            motion.tick(0, true, true);
            motion.tick(0, false, false);
            for &now in CALLBACKS.iter().filter(|&&now| now <= 452) { motion.tick(now, false, false); }
            assert!(motion.x < 0.);
            let before = SurfaceFrame::new(motion.geometry());
            motion.tick(452, true, false);
            assert_eq!(SurfaceFrame::new(motion.geometry()), before);
            for target in [true, false] {
                motion.tick(551, target, true);
                let frame = SurfaceFrame::new(motion.geometry());
                let expected = Geometry::at(if target { 1. } else { 0. });
                assert_eq!(frame, SurfaceFrame::new(expected));
                assert_carrier(frame, scale);
            }
        }
    }

    #[test]
    fn prepared_source_is_premultiplied_padded_and_roundtrips_bgra() {
        let source = RenderImage::new(vec![image::Frame::new(image::RgbaImage::from_raw(1, 1, vec![0, 0, 255, 128]).unwrap())]);
        let pixels = prepared_pixels(&source);
        assert_eq!(&pixels.data()[(2*5+2)*4..(2*5+3)*4], &[128, 0, 0, 128]);
        assert_eq!(&pixels.data()[..4], &[0, 0, 0, 0]);
        let bytes = straight_bgra(pixels);
        assert_eq!(&bytes[(2*5+2)*4..(2*5+3)*4], &[0, 0, 255, 128]);
        assert_eq!(&bytes[..4], &[0, 0, 0, 0]);
        let red = [0, 0, 255, 128].repeat(100);
        let source = RenderImage::new(vec![image::Frame::new(image::RgbaImage::from_raw(10, 10, red).unwrap())]);
        let art = prepared_pixels(&source);
        let frame = SurfaceFrame::new(Geometry::at(0.));
        let bytes = straight_bgra(frame.compose(Some(&art), 1., false, 1.));
        let center = &bytes[(40*80+40)*4..(40*80+41)*4];
        for (&actual, expected) in center.iter().zip([127u8, 127, 255, 255]) {
            assert!(actual.abs_diff(expected) <= 1, "straight/premultiplied alpha must composite once over the white surface");
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
