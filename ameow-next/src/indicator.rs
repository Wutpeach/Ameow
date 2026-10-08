//! One stable presentation slot. Ring continuity is sampled here; lifecycle belongs to Model.
use crate::{
    model::{Model, PROGRESS_MS, Stage},
    tokens::Palette,
};
use gpui::{prelude::*, *};
use std::f32::consts::{FRAC_PI_2, TAU};

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
        if !m.reduced && m.stage == Stage::Failure {
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
            Stage::Failure
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
            percent: m.progress.target,
            center_alpha,
            symbol_scale,
        }
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
fn stroke(window: &mut Window, points: &[Point<Pixels>], width: f32, color: Hsla) {
    if points.len() < 2 || color.a <= 0. {
        return;
    }
    let mut path = PathBuilder::stroke(px(width));
    path.move_to(points[0]);
    for p in points.iter().skip(1) {
        path.line_to(*p);
    }
    if let Ok(path) = path.build() {
        window.paint_path(path, color);
    }
    dot(window, points[0], width / 2., color);
    dot(window, *points.last().unwrap(), width / 2., color);
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
    stroke(window, &points, 5., color);
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
        Stage::Failure => vec![[19., 19.], [31., 31.]],
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
            stroke(window, &out, 2.8, color);
        }
    };
    if stage == Stage::Failure {
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

pub fn ring(f: Frame) -> impl IntoElement {
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
    .left(px(23.))
    .top(px(0.))
    .size(px(50.))
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
        .font_family("JetBrains Mono")
        .text_size(px(14.))
        .font_weight(FontWeight::MEDIUM)
        .text_color(f.color)
        .opacity(f.center_alpha)
        .child(format!("{}%", (f.percent * 100.).round() as u32))
}
pub fn label(f: Frame) -> impl IntoElement {
    let p = f.palette;
    div()
        .absolute()
        .left(px(0.))
        .top(px(59.))
        .w(px(96.))
        .h(px(16.))
        .rounded(px(8.))
        .bg(p.pill(f.stage))
        .border_1()
        .border_color(p.ring(f.stage).opacity(0.3))
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
                .opacity(1. - f.mix)
                .child(f.previous.name()),
        )
        .child(
            div()
                .absolute()
                .left_0()
                .right_0()
                .top(px(2. * (1. - f.mix)))
                .h(px(16.))
                .flex()
                .items_center()
                .justify_center()
                .text_size(px(8.))
                .font_weight(FontWeight::MEDIUM)
                .text_color(p.ring(f.stage))
                .opacity(f.mix)
                .child(f.stage.name()),
        )
}
