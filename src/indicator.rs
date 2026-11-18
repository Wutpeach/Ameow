//! One stable presentation slot. Ring continuity is sampled here; lifecycle belongs to Model.
use crate::{
    model::{Model, PROGRESS_MS, Stage},
    ring_glow,
    tokens::{self, Palette},
};
use gpui::{prelude::*, *};
use std::f32::consts::{FRAC_PI_2, TAU};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DirectoryFeedback { Receiving, Saved }
impl DirectoryFeedback {
    pub fn label(self, language: crate::ui_text::Language) -> &'static str {
        match self {
            Self::Receiving => language.text("松开设为目录", "Drop to set folder"),
            Self::Saved => language.text("目录已更新", "Folder updated"),
        }
    }
    fn frame(self, p: Palette) -> Frame {
        // Presentation only: neither feedback enters the download lifecycle or carries progress.
        let stage = if self == Self::Saved { Stage::Success } else { Stage::Cancelled };
        let color = if self == Self::Saved { p.green } else { p.neutral };
        Frame { stage, previous: stage, color, previous_color: color, palette: p,
            start: 0., sweep: 1., blue_trace: 0., symbol: 0., mix: 1.,
            percent: 0., center_alpha: 0., symbol_scale: 1. }
    }
    fn ring_frame(self, p: Palette) -> Option<Frame> {
        (self == Self::Saved).then(|| self.frame(p))
    }
}

pub fn directory_feedback(p: Palette, feedback: DirectoryFeedback, language: crate::ui_text::Language) -> Div {
    let frame = feedback.frame(p);
    let color = if feedback == DirectoryFeedback::Saved { p.green }
        else { p.neutral.opacity(if p.night { 1. } else { 0.8 }) };
    div().absolute().w(px(96.)).h(px(75.))
        .when_some(feedback.ring_frame(p), |s, frame| s.child(ring(frame)))
        .child(div().absolute().left(px(23.)).top_0().size(px(50.))
            .flex().items_center().justify_center()
            .child(div().relative().size(px(ring_glow::FOLDER_SIZE))
                .child(ring_glow::folder(color.opacity(tokens::RING_GLOW_OPACITY)))
                .child(svg().path("icons/folder.svg").size_full().text_color(color))))
        .child(label_with_color(frame, Some(feedback.label(language).into()), frame.color))
}

#[derive(Clone, Copy)]
pub struct Frame {
    stage: Stage,
    previous: Stage,
    color: Hsla,
    previous_color: Hsla,
    palette: Palette,
    start: f32,
    sweep: f32,
    blue_trace: f32,
    symbol: f32,
    mix: f32,
    percent: f32,
    center_alpha: f32,
    symbol_scale: f32,
}
impl Frame {
    /// Whole-job percentage is unavailable; retain the accepted blue/glow with an honest moving arc.
    pub fn indeterminate(mut self, now: u64, reduced: bool) -> Self {
        if self.stage == Stage::Downloading {
            self.start = if reduced { 0. } else { now as f32 / crate::model::ROTATION_MS as f32 };
            self.sweep = 0.72;
        }
        self.center_alpha = 0.;
        self
    }
}
pub struct Indicator {
    last_stage: Stage,
    last_start: f32,
    last_sweep: f32,
    from_start: f32,
    from_sweep: f32,
}
impl Default for Indicator {
    fn default() -> Self {
        Self {
            last_stage: Stage::Idle,
            last_start: 0.,
            last_sweep: 0.,
            from_start: 0.,
            from_sweep: 0.,
        }
    }
}
impl Indicator {
    pub fn sample(&mut self, m: &Model, p: Palette, now: u64) -> Frame {
        if self.last_stage != m.stage {
            self.from_start = self.last_start;
            self.from_sweep = self.last_sweep;
            self.last_stage = m.stage;
        }
        let (mut start, mut sweep) = m.arc(now);
        let elapsed = now.saturating_sub(m.stage_at);
        if m.stage == Stage::Downloading && m.previous == Stage::Resolving && !m.reduced {
            let t = (elapsed as f32 / 180.).clamp(0., 1.);
            // Use the nearest equivalent top angle, preserving the resolver's last orientation.
            let turn = self.from_start.round();
            start = self.from_start + (turn - self.from_start) * (1. - (1. - t).powi(3));
            sweep = self.from_sweep + (sweep - self.from_sweep) * (1. - (1. - t).powi(3));
        }
        self.last_start = start;
        self.last_sweep = sweep;
        let closure = m.stage == Stage::Success && !m.reduced && elapsed < PROGRESS_MS;
        let mut color = if closure {
            p.ring(m.previous)
        } else {
            p.ring(m.stage)
        };
        if !m.reduced && m.stage == Stage::Downloading && m.previous == Stage::Resolving {
            color = p
                .ring(m.previous)
                .blend(color.opacity((elapsed as f32 / 180.).clamp(0., 1.)));
        }
        if !m.reduced && m.stage == Stage::Success && !closure {
            color = p
                .ring(m.previous)
                .blend(color.opacity(((elapsed - PROGRESS_MS) as f32 / 110.).clamp(0., 1.)));
        }
        if !m.reduced && matches!(m.stage, Stage::Failure | Stage::Partial) {
            color = p
                .ring(m.previous)
                .blend(color.opacity((elapsed.saturating_sub(70) as f32 / 110.).clamp(0., 1.)));
            if elapsed < 70 {
                color = p.ring(m.previous);
            }
        }
        let center_alpha = match m.stage {
            Stage::Downloading if m.previous == Stage::Resolving && !m.reduced => {
                (elapsed as f32 / 160.).clamp(0., 1.)
            }
            Stage::Downloading | Stage::Transcoding => 1.,
            Stage::Success if !m.reduced => {
                (1. - elapsed as f32 / PROGRESS_MS as f32).clamp(0., 1.)
            }
            Stage::Failure | Stage::Partial
                if !m.reduced && matches!(m.previous, Stage::Downloading | Stage::Transcoding) =>
            {
                (1. - elapsed.saturating_sub(70) as f32 / 120.).clamp(0., 1.)
            }
            _ => 0.,
        };
        let mix = if m.stage == Stage::Success && !m.reduced {
            (elapsed.saturating_sub(PROGRESS_MS + 50) as f32 / 160.).clamp(0., 1.)
        } else {
            m.label_mix(now)
        };
        let settle = elapsed.saturating_sub(PROGRESS_MS + 180) as f32 / 1000.;
        let symbol_scale = if m.stage == Stage::Success
            && !m.reduced
            && elapsed >= PROGRESS_MS + 180
            && settle < 0.25
        {
            1. - 0.025 * (-18. * settle).exp() * (40. * settle).cos()
        } else {
            1.
        };
        Frame {
            stage: m.stage,
            previous: m.previous,
            color,
            previous_color: p.ring(m.previous),
            palette: p,
            start,
            sweep,
            blue_trace: m.blue_trace(now),
            symbol: m.symbol(now),
            mix,
            percent: if m.reduced { m.progress.target } else { m.progress.sample(now) },
            center_alpha,
            symbol_scale,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{Indicator, Model, Palette, Stage};
    #[test]
    fn reduced_numeric_progress_matches_immediate_arc_without_tween() {
        let mut model = Model::new(0, true);
        model.state(Stage::Downloading, 0.2, 0);
        model.progress.retarget(0.8, 100);
        let frame = Indicator::default().sample(&model, Palette::new(false), 100);
        assert_eq!(frame.percent, 0.8);
        assert_eq!(frame.sweep, 0.8);
        model.set_reduced(false, 100);
        let frame = Indicator::default().sample(&model, Palette::new(false), 100);
        assert_eq!(frame.percent, model.progress.sample(100));
        assert_eq!(frame.percent, frame.sweep);
    }
    #[test]
    fn directory_feedback_keeps_folder_semantics_and_existing_status_palette() {
        use super::DirectoryFeedback;
        use crate::ui_text::Language;
        for night in [false, true] {
            let p = Palette::new(night);
            let receiving = DirectoryFeedback::Receiving.frame(p);
            let saved = DirectoryFeedback::Saved.frame(p);
            assert!(DirectoryFeedback::Receiving.ring_frame(p).is_none());
            assert!(DirectoryFeedback::Saved.ring_frame(p).is_some());
            assert_eq!(receiving.color, p.neutral);
            assert_eq!(saved.color, p.ring(Stage::Success));
            assert_eq!(saved.palette.pill(saved.stage), p.pill(Stage::Success));
            assert!(!receiving.stage.active());
            for frame in [receiving, saved] {
                assert_eq!(frame.center_alpha, 0., "folder feedback must not display a percentage");
                assert_eq!(frame.symbol, 0., "the folder is not replaced by a download check");
                assert_eq!(frame.blue_trace, 0.);
            }
        }
        assert_eq!(DirectoryFeedback::Receiving.label(Language::English), "Drop to set folder");
        assert_eq!(DirectoryFeedback::Saved.label(Language::Chinese), "目录已更新");
        assert_ne!(DirectoryFeedback::Saved.label(Language::Chinese), Stage::Success.name());
    }
}

fn dot(window: &mut Window, center: Point<Pixels>, radius: f32, color: Hsla) {
    window.paint_quad(quad(
        Bounds::new(
            point(center.x - px(radius), center.y - px(radius)),
            size(px(radius * 2.), px(radius * 2.)),
        ),
        px(radius),
        color,
        px(0.),
        transparent_black(),
        BorderStyle::Solid,
    ));
}
fn stroke(window: &mut Window, points: &[Point<Pixels>], width: f32, color: Hsla, closed: bool) {
    if points.len() < 2 || color.a <= 0. {
        return;
    }
    let mut path = PathBuilder::stroke(px(width));
    // Full circles have no end caps: translucent caps would stack into a fixed dot.
    path.add_polygon(if closed { &points[..points.len() - 1] } else { points }, closed);
    if let Ok(path) = path.build() {
        window.paint_path(path, color);
    }
    if !closed {
        dot(window, points[0], width / 2., color);
        dot(window, *points.last().unwrap(), width / 2., color);
    }
}
/// The component preparation ring has its own geometry and never enters media ring/glow state.
pub fn preparation_ring(
    palette: Palette,
    fraction: Option<f32>,
    failed: bool,
    ready: bool,
    now: u64,
    reduced: bool,
) -> impl IntoElement {
    let color = if failed {
        palette.red
    } else if ready {
        palette.green
    } else {
        palette.orange
    };
    canvas(
        |_, _, _| (),
        move |bounds, _, window, _| {
            let center = bounds.center();
            let start = if fraction.is_some() || failed || ready || reduced {
                0.
            } else {
                now as f32 / 1250.
            };
            let sweep = if failed || ready {
                1.
            } else {
                fraction.unwrap_or(0.28)
            };
            let points = |start: f32, sweep: f32| {
                (0..=64)
                    .map(|i| {
                        let angle = (start + sweep * i as f32 / 64.) * TAU - FRAC_PI_2;
                        point(
                            center.x + px(7. * angle.cos()),
                            center.y + px(7. * angle.sin()),
                        )
                    })
                    .collect::<Vec<_>>()
            };
            stroke(window, &points(0., 1.), 1.6, palette.border, true);
            if sweep > 0. {
                stroke(window, &points(start, sweep), 1.6, color, sweep >= 1.);
            }
        },
    )
    .size(px(24.))
}
fn arc(window: &mut Window, origin: Point<Pixels>, start: f32, sweep: f32, color: Hsla) {
    if sweep <= 0.0001 {
        return;
    }
    let sweep = sweep.clamp(0., 1.);
    let count = (sweep * 128.).ceil().max(2.) as usize;
    let points = (0..=count)
        .map(|i| {
            let angle = (start + sweep * i as f32 / count as f32) * TAU - FRAC_PI_2;
            point(
                origin.x + px(25. + 22.5 * angle.cos()),
                origin.y + px(25. + 22.5 * angle.sin()),
            )
        })
        .collect::<Vec<_>>();
    stroke(window, &points, 5., color, sweep == 1.);
}
fn draw_symbol(
    window: &mut Window,
    origin: Point<Pixels>,
    stage: Stage,
    fraction: f32,
    color: Hsla,
    scale: f32,
) {
    let points: Vec<[f32; 2]> = match stage {
        Stage::Success => vec![[17., 25.], [22.5, 30.5], [33., 20.]],
        Stage::Failure | Stage::Partial => vec![[19., 19.], [31., 31.]],
        Stage::Cancelled => vec![[18., 25.], [32., 25.]],
        _ => return,
    };
    let draw = |window: &mut Window, points: &[[f32; 2]], fraction: f32| {
        let points = points
            .iter()
            .map(|p| [25. + (p[0] - 25.) * scale, 25. + (p[1] - 25.) * scale])
            .collect::<Vec<_>>();
        let total: f32 = points
            .windows(2)
            .map(|p| (p[1][0] - p[0][0]).hypot(p[1][1] - p[0][1]))
            .sum();
        let mut left = total * fraction.clamp(0., 1.);
        let mut out = vec![point(
            origin.x + px(points[0][0]),
            origin.y + px(points[0][1]),
        )];
        for line in points.windows(2) {
            let length = (line[1][0] - line[0][0]).hypot(line[1][1] - line[0][1]);
            let t = (left / length).min(1.);
            out.push(point(
                origin.x + px(line[0][0] + (line[1][0] - line[0][0]) * t),
                origin.y + px(line[0][1] + (line[1][1] - line[0][1]) * t),
            ));
            left -= length;
            if left <= 0. {
                break;
            }
        }
        if fraction > 0. {
            stroke(window, &out, 2.8, color, false);
        }
    };
    if matches!(stage, Stage::Failure | Stage::Partial) {
        draw(window, &points, (fraction * 2.).min(1.));
        draw(
            window,
            &[[31., 19.], [19., 31.]],
            (fraction * 2. - 1.).max(0.),
        );
    } else {
        draw(window, &points, fraction);
    }
}

/// Static cleanup attention uses the Full indicator's geometry without changing job state.
pub fn cleanup_attention(p: Palette, label: &'static str) -> Div {
    div().relative().w(px(96.)).h(px(75.))
        .child(div().absolute().left(px(23.)).top_0().size(px(50.))
            .child(ring_glow::arc(0., 1., 10, p.orange.opacity(tokens::RING_GLOW_OPACITY)))
            .child(canvas(|_, _, _| (), move |bounds, _, window, _| {
                arc(window, bounds.origin, 0., 1., p.orange);
                stroke(window, &[
                    bounds.origin + point(px(25.), px(17.)),
                    bounds.origin + point(px(25.), px(27.)),
                ], 2.8, p.orange, false);
                dot(window, bounds.origin + point(px(25.), px(33.)), 1.4, p.orange);
            }).size(px(50.))))
        .child(div().absolute().left_0().top(px(59.)).w(px(96.)).h(px(16.))
            .rounded(px(8.)).bg(p.orange.opacity(0.08)).border_1().border_color(p.orange.opacity(0.3))
            .flex().items_center().justify_center().text_size(px(8.))
            .font_weight(FontWeight::MEDIUM).text_color(p.orange).child(label))
}

pub fn ring(f: Frame) -> impl IntoElement {
    let blur = tokens::ring_glow_blur(f.stage);
    let glow = tokens::RING_GLOW_OPACITY;
    div()
        .absolute()
        .left(px(23.))
        .top(px(0.))
        .size(px(50.))
        .when(f.stage != Stage::Idle, |s| {
            s.child(ring_glow::arc(
                0.,
                1.,
                blur,
                f.palette.blue.opacity(f.blue_trace * glow),
            ))
            .child(ring_glow::arc(
                f.start,
                f.sweep,
                blur,
                f.color.opacity(glow),
            ))
        })
        .child(
            canvas(
                |_, _, _| (),
                move |b, _, window, _| {
                    if f.stage == Stage::Idle {
                        return;
                    }
                    arc(
                        window,
                        b.origin,
                        0.,
                        1.,
                        f.color.opacity(if f.stage == Stage::Resolving {
                            0.12
                        } else {
                            0.14
                        }),
                    );
                    if f.blue_trace > 0. {
                        arc(
                            window,
                            b.origin,
                            0.,
                            1.,
                            f.palette.blue.opacity(f.blue_trace),
                        );
                    }
                    if matches!(f.stage, Stage::Downloading | Stage::Transcoding) {
                        arc(window, b.origin, f.start, 1., f.color.opacity(0.3));
                    }
                    arc(window, b.origin, f.start, f.sweep, f.color);
                    draw_symbol(window, b.origin, f.stage, f.symbol, f.color, f.symbol_scale);
                },
            )
            .absolute()
            .size(px(50.)),
        )
}
pub fn center(f: Frame) -> impl IntoElement {
    div()
        .absolute()
        .left(px(23.))
        .top(px(0.))
        .size(px(50.))
        .flex()
        .items_center()
        .justify_center()
        .font_family(tokens::LATIN_FONT)
        .text_size(px(14.))
        .font_weight(FontWeight::MEDIUM)
        .text_color(f.color)
        .opacity(f.center_alpha)
        .child(format!("{}%", (f.percent * 100.).round() as u32))
}
pub fn label(f: Frame) -> impl IntoElement {
    label_with_text(f, None)
}
pub fn label_with_text(f: Frame, text: Option<String>) -> impl IntoElement {
    label_with_color(f, text, f.palette.ring(f.stage))
}
fn label_with_color(f: Frame, text: Option<String>, color: Hsla) -> Div {
    let p = f.palette;
    let live = text.is_some();
    div()
        .absolute()
        .left(px(0.))
        .top(px(59.))
        .w(px(96.))
        .h(px(16.))
        .rounded(px(8.))
        .bg(p.pill(f.stage))
        .border_1()
        .border_color(color.opacity(0.3))
        .opacity(if f.stage == Stage::Idle { 0. } else { 1. })
        .child(
            div()
                .absolute()
                .left_0()
                .right_0()
                .top(px(-2. * f.mix))
                .h(px(16.))
                .flex()
                .items_center()
                .justify_center()
                .text_size(px(8.))
                .font_weight(FontWeight::MEDIUM)
                .text_color(f.previous_color)
                .opacity(if live { 0. } else { 1. - f.mix })
                .child(f.previous.name()),
        )
        .child(
            div()
                .absolute()
                .left_0()
                .right_0()
                .top(px(if live { 0. } else { 2. * (1. - f.mix) }))
                .h(px(16.))
                .flex()
                .items_center()
                .justify_center()
                .text_size(px(8.))
                .font_weight(FontWeight::MEDIUM)
                .text_color(color)
                .opacity(if live { 1. } else { f.mix })
                .child(text.unwrap_or_else(|| f.stage.name().into())),
        )
}
