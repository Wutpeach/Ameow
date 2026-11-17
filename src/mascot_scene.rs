//! Cached local layers, composed inside the shared surface's final AA mask.
use crate::{mascot::{prepared_pixels, SurfaceFrame}, mascot_layers::Parts, mascot_motion::Pose, mascot_reveal::{local_origin, local_side, Scene}};
use gpui::SvgRenderer;
use tiny_skia::{Pixmap, Transform};

pub struct Prepared {
    head: Layer,
    perch: Layer,
    paws: Layer,
}
struct Layer { pixels: Pixmap, source_side: f32, offset: [f32; 2] }
impl Layer {
    fn new(source: &gpui::RenderImage) -> Self {
        let full = prepared_pixels(source);
        let (w, h) = (full.width(), full.height());
        let (mut left, mut top, mut right, mut bottom) = (w, h, 0, 0);
        for (i, _) in full.data().chunks_exact(4).enumerate().filter(|(_, p)| p[3] != 0) {
            let (x, y) = (i as u32 % w, i as u32 / w);
            left = left.min(x); top = top.min(y); right = right.max(x + 1); bottom = bottom.max(y + 1);
        }
        // Retain transparent padding for Bilinear and the original 60px-domain offset.
        left = left.saturating_sub(2); top = top.saturating_sub(2);
        right = (right + 2).min(w); bottom = (bottom + 2).min(h);
        let rect = tiny_skia::IntRect::from_ltrb(left as i32, top as i32, right as i32, bottom as i32).expect("nonempty approved layer");
        Self { pixels: full.clone_rect(rect).expect("layer bounds"), source_side: (w - 4) as f32, offset: [left as f32 - 2., top as f32 - 2.] }
    }
}
impl Prepared {
    pub fn new(svg: &str, renderer: &SvgRenderer, scale: f32) -> Self {
        let parts = Parts::new(svg);
        let render = |body| Layer::new(&renderer.render_single_frame(parts.document(body).as_bytes(), scale).expect("approved Mascot layer"));
        Self { head: render(parts.head), perch: render(parts.perch), paws: render(parts.paws) }
    }
    pub fn update_head(&mut self, svg: &str, renderer: &SvgRenderer, scale: f32) {
        let parts = Parts::new(svg);
        self.head = Layer::new(&renderer.render_single_frame(parts.document(parts.head).as_bytes(), scale).expect("approved Mascot head"));
    }
    pub fn paint(&self, target: &mut Pixmap, frame: SurfaceFrame, scene: Scene, alpha: f32, scale: f32) {
        if alpha == 1. { self.paint_layers(target, frame, scene, scale, 0.); return; }
        // Occlusion belongs inside the role; fading each layer would reveal the cat through the sill.
        let origin = local_origin(frame.native, frame.surface) * scale;
        let offset = (origin.floor() - 2.).max(0.);
        let side = (origin + local_side(frame.surface) * scale + 2.).ceil() as u32 - offset as u32;
        let mut group = Pixmap::new(side, side).expect("local role group");
        self.paint_layers(&mut group, frame, scene, scale, offset);
        // Integral target crop: all fractional sampling stays in the local layer transforms.
        target.draw_pixmap(offset as i32, offset as i32, group.as_ref(), &tiny_skia::PixmapPaint { opacity: alpha, ..Default::default() }, Transform::identity(), None);
    }
    fn paint_layers(&self, target: &mut Pixmap, frame: SurfaceFrame, scene: Scene, scale: f32, target_offset: f32) {
        let side = local_side(frame.surface);
        // The window expands from its surface anchor; retain the old Compact origin.
        let origin = local_origin(frame.native, frame.surface) * scale - target_offset;
        let unit = side / 60. * scale;
        let local_circle = (frame.surface > 60.).then(|| {
            let mut mask = tiny_skia::Mask::new(target.width(), target.height()).expect("local circle");
            let center = origin + side * scale * 0.5;
            let path = tiny_skia::PathBuilder::from_circle(center, center, side * scale * 0.5).expect("local circle path");
            mask.fill_path(&path, tiny_skia::FillRule::Winding, true, Transform::identity());
            mask
        });
        let paint = |target: &mut Pixmap, layer: &Layer, y: f32, opacity: f32, mask: Option<&tiny_skia::Mask>| {
            if opacity == 0. { return; }
            // GPUI prepared sources are 2x oversampled: this is scaling, even at rest.
            let factor = side * scale / layer.source_side;
            target.draw_pixmap(0, 0, layer.pixels.as_ref(), &tiny_skia::PixmapPaint {
                opacity, quality: tiny_skia::FilterQuality::Bilinear, ..Default::default()
            }, Transform::from_row(factor, 0., 0., factor, origin + layer.offset[0] * factor, origin + layer.offset[1] * factor + y * unit), mask);
        };
        if scene.head_y < 24. { paint(target, &self.head, scene.head_y, scene.head_alpha, local_circle.as_ref()); }
        paint(target, &self.perch, scene.perch_y, 1., local_circle.as_ref());
        if scene.paws_y >= 8. { return; }
        let mut paws_mask = None;
        if scene.paws_y != 0. {
            let mut mask = local_circle.clone().unwrap_or_else(|| tiny_skia::Mask::new(target.width(), target.height()).expect("local paws mask"));
            let rect = tiny_skia::Rect::from_xywh(0., 0., target.width() as f32, origin + 41. * unit).expect("local contact line");
            if local_circle.is_some() { mask.intersect_path(&tiny_skia::PathBuilder::from_rect(rect), tiny_skia::FillRule::Winding, true, Transform::identity()); }
            else { mask.fill_path(&tiny_skia::PathBuilder::from_rect(rect), tiny_skia::FillRule::Winding, true, Transform::identity()); }
            paws_mask = Some(mask);
        }
        paint(target, &self.paws, scene.paws_y, 1., paws_mask.as_ref().or(local_circle.as_ref()));
    }
}

pub fn idle_pose(mut pose: Pose, weight: f32) -> Pose {
    pose.blink *= weight;
    pose.gaze = pose.gaze.map(|v| v * weight);
    pose.head = pose.head.map(|v| v * weight);
    pose.ears = pose.ears.map(|v| v * weight);
    pose
}
