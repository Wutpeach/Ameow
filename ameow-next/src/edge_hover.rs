//! Full-only magnetic follow from rest geometry; no window-motion or task-state authority.
use std::f32::consts::{FRAC_PI_2, PI, TAU};
pub const SIDE: f32 = 200.;
pub const RADIUS: f32 = 20.;
pub const STRAIGHT: f32 = SIDE - 2. * RADIUS;
pub const QUARTER: f32 = RADIUS * FRAC_PI_2;
pub const PERIMETER: f32 = 4. * STRAIGHT + TAU * RADIUS;
pub const MAX_OFFSET: f32 = 3.;
fn smooth(t: f32) -> f32 {
    let t = t.clamp(0., 1.);
    t * t * (3. - 2. * t)
}
pub fn wrap(s: f32) -> f32 {
    s.rem_euclid(PERIMETER)
}
pub fn point_at(s: f32) -> [f32; 2] {
    let s = wrap(s);
    let side = (s / (STRAIGHT + QUARTER)).floor() as usize;
    let u = s - side as f32 * (STRAIGHT + QUARTER);
    if u <= STRAIGHT {
        match side {
            0 => [RADIUS + u, 0.],
            1 => [SIDE, RADIUS + u],
            2 => [SIDE - RADIUS - u, SIDE],
            _ => [0., SIDE - RADIUS - u],
        }
    } else {
        let angle = -FRAC_PI_2 + side as f32 * FRAC_PI_2 + (u - STRAIGHT) / RADIUS;
        let center = match side {
            0 => [SIDE - RADIUS, RADIUS],
            1 => [SIDE - RADIUS, SIDE - RADIUS],
            2 => [RADIUS, SIDE - RADIUS],
            _ => [RADIUS, RADIUS],
        };
        [
            center[0] + RADIUS * angle.cos(),
            center[1] + RADIUS * angle.sin(),
        ]
    }
}
#[derive(Clone, Copy, Debug)]
pub struct Projection {
    pub point: [f32; 2],
    pub distance: f32,
}
pub fn nearest(p: [f32; 2]) -> Projection {
    let mut best = Projection {
        point: [RADIUS, 0.],
        distance: f32::INFINITY,
    };
    let mut consider = |s: f32| {
        let q = point_at(s);
        let d = (p[0] - q[0]).hypot(p[1] - q[1]);
        if d < best.distance {
            best = Projection {
                point: q,
                distance: d,
            };
        }
    };
    consider((p[0] - RADIUS).clamp(0., STRAIGHT));
    consider(STRAIGHT + QUARTER + (p[1] - RADIUS).clamp(0., STRAIGHT));
    consider(2. * (STRAIGHT + QUARTER) + (SIDE - RADIUS - p[0]).clamp(0., STRAIGHT));
    consider(3. * (STRAIGHT + QUARTER) + (SIDE - RADIUS - p[1]).clamp(0., STRAIGHT));
    for side in 0..4 {
        let center = match side {
            0 => [SIDE - RADIUS, RADIUS],
            1 => [SIDE - RADIUS, SIDE - RADIUS],
            2 => [RADIUS, SIDE - RADIUS],
            _ => [RADIUS, RADIUS],
        };
        let start = -FRAC_PI_2 + side as f32 * FRAC_PI_2;
        let angle = (p[1] - center[1]).atan2(p[0] - center[0]);
        let angle = if side == 0 && angle > PI {
            angle - TAU
        } else if side >= 2 && angle < 0. {
            angle + TAU
        } else {
            angle
        };
        let theta = angle.clamp(start, start + FRAC_PI_2);
        consider(side as f32 * (STRAIGHT + QUARTER) + STRAIGHT + (theta - start) * RADIUS);
    }
    let c = [
        p[0].clamp(RADIUS, SIDE - RADIUS),
        p[1].clamp(RADIUS, SIDE - RADIUS),
    ];
    let inside = (p[0] - c[0]).hypot(p[1] - c[1]) <= RADIUS;
    if inside {
        best.distance = -best.distance;
    }
    best
}
pub fn proximity(distance: f32) -> f32 {
    let d = distance.abs();
    if d >= 56. {
        0.
    } else if d >= 30. {
        0.25 * smooth((56. - d) / 26.)
    } else if d >= 14. {
        0.25 + 0.75 * smooth((30. - d) / 16.)
    } else {
        1.
    }
}
pub fn offset_magnitude(distance: f32) -> f32 {
    let d = distance.abs();
    let baseline = if d >= 56. {
        0.
    } else if d >= 30. {
        0.65 * smooth((56. - d) / 26.)
    } else if d >= 14. {
        0.65 + 0.85 * smooth((30. - d) / 16.)
    } else {
        1.5 + 0.3 * smooth((14. - d) / 14.)
    };
    baseline * (MAX_OFFSET / 1.8)
}
#[derive(Clone, Copy)]
pub struct Input {
    pub pointer: [f32; 2],
    pub inside_native: bool,
    pub settled_full: bool,
    pub locks: [bool; 3],
    pub reduced: bool,
    pub enabled: bool,
}
#[derive(Clone, Copy)]
struct Fade {
    at: u64,
    offset: [f32; 2],
}
pub struct Hover {
    pub eligible: bool,
    pub distance: f32,
    pub q: f32,
    pub offset: [f32; 2],
    pub target_offset: [f32; 2],
    pub nearest_point: [f32; 2],
    last: u64,
    fade: Option<Fade>,
}
impl Default for Hover {
    fn default() -> Self {
        Self {
            eligible: false,
            distance: 0.,
            q: 0.,
            offset: [0., 0.],
            target_offset: [0., 0.],
            nearest_point: [0., 0.],
            last: 0,
            fade: None,
        }
    }
}
impl Hover {
    fn reset(&mut self, now: u64) {
        self.q = 0.;
        self.offset = [0., 0.];
        self.target_offset = [0., 0.];
        self.last = now;
        self.fade = None;
        self.eligible = false;
    }
    pub fn sample(&mut self, now: u64, input: Input) {
        let dt = now.saturating_sub(self.last) as f32;
        self.last = now;
        if !input.enabled || !input.settled_full {
            self.reset(now);
            return;
        }
        // Advance existing micro targets first. Previous idle time never belongs to new input.
        if let Some(fade) = self.fade {
            let t = now.saturating_sub(fade.at) as f32 / 120.;
            let weight = 1. - smooth(t);
            self.offset = [fade.offset[0] * weight, fade.offset[1] * weight];
            if t >= 1. {
                self.offset = [0., 0.];
                self.fade = None;
            }
        } else if self.q > 0. {
            let offset_t = 1. - (-dt / 50.).exp();
            for axis in 0..2 {
                self.offset[axis] += (self.target_offset[axis] - self.offset[axis]) * offset_t;
            }
            if (self.offset[0] - self.target_offset[0])
                .hypot(self.offset[1] - self.target_offset[1])
                < 0.001
            {
                self.offset = self.target_offset;
            }
        }
        self.eligible = input.inside_native && !input.locks.into_iter().any(|v| v);
        let projection = nearest(input.pointer);
        self.nearest_point = projection.point;
        self.distance = projection.distance;
        self.q = if self.eligible {
            proximity(projection.distance)
        } else {
            0.
        };
        let dx = input.pointer[0] - SIDE / 2.;
        let dy = input.pointer[1] - SIDE / 2.;
        let length = dx.hypot(dy);
        let magnitude = if self.q > 0. && !input.reduced {
            offset_magnitude(projection.distance)
        } else {
            0.
        };
        self.target_offset = if length > 0. {
            [dx / length * magnitude, dy / length * magnitude]
        } else {
            [0., 0.]
        };
        if input.reduced {
            self.offset = [0., 0.];
            self.fade = None;
            return;
        }
        if self.q == 0. {
            if self.fade.is_none() && self.offset != [0., 0.] {
                self.fade = Some(Fade {
                    at: now,
                    offset: self.offset,
                });
            }
            return;
        }
        self.fade = None;
    }
    pub fn moving(&self) -> bool {
        self.fade.is_some()
            || (self.q > 0.
                && ((self.offset[0] - self.target_offset[0])
                    .hypot(self.offset[1] - self.target_offset[1])
                    >= 0.001))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn input(point: [f32; 2]) -> Input {
        Input {
            pointer: point,
            inside_native: true,
            settled_full: true,
            locks: [false; 3],
            reduced: false,
            enabled: true,
        }
    }
    #[test]
    fn projection_follows_all_edges_and_round_corners_continuously() {
        for step in 0..=2000 {
            let s = PERIMETER * step as f32 / 2000.;
            let p = point_at(s);
            let n = nearest(p);
            assert!(n.distance.abs() < 0.0001);
            assert!((n.point[0] - p[0]).hypot(n.point[1] - p[1]) < 0.001);
            let p2 = point_at(s + 0.1);
            assert!((p2[0] - p[0]).hypot(p2[1] - p[1]) < 0.101);
        }
        assert!((nearest([0., 0.]).distance - 8.28427).abs() < 0.001);
        assert_eq!(nearest([100., 100.]).distance, -100.);
        assert!((nearest([100., -10.]).distance - 10.).abs() < 0.001);
    }
    #[test]
    fn shared_proximity_is_continuous_bounded_and_quiet() {
        assert_eq!(proximity(56.), 0.);
        assert_eq!(proximity(30.), 0.25);
        assert_eq!(proximity(14.), 1.);
        assert_eq!(proximity(-100.), 0.);
        assert_eq!(offset_magnitude(30.), 0.65 * (3. / 1.8));
        assert_eq!(offset_magnitude(14.), 2.5);
        assert_eq!(offset_magnitude(0.), MAX_OFFSET);
        let mut previous = 0.;
        for d in (0..=560).rev() {
            let q = proximity(d as f32 / 10.);
            assert!(q >= previous && q <= 1.);
            previous = q;
        }
        for d in [14., 30., 56.] {
            assert!((proximity(d - 0.001) - proximity(d + 0.001)).abs() < 0.001);
        }
    }
    #[test]
    fn approved_mag_range_scales_the_whole_profile_without_changing_proximity() {
        for d in 0..=560 {
            let distance = d as f32 / 10.;
            let old = if distance >= 56. {
                0.
            } else if distance >= 30. {
                0.65 * smooth((56. - distance) / 26.)
            } else if distance >= 14. {
                0.65 + 0.85 * smooth((30. - distance) / 16.)
            } else {
                1.5 + 0.3 * smooth((14. - distance) / 14.)
            };
            assert_eq!(offset_magnitude(distance), old * (3. / 1.8));
            assert!(offset_magnitude(distance) <= MAX_OFFSET);
        }
        assert_eq!(proximity(30.), 0.25);
        assert_eq!(proximity(14.), 1.);
    }
    #[test]
    fn offset_has_no_overshoot_and_rest_input_has_no_feedback() {
        let mut h = Hover::default();
        let point = input([200., 100.]);
        for now in (0..=900).step_by(16) {
            h.sample(now, point);
            assert!(h.offset[0] >= 0. && h.offset[0] <= MAX_OFFSET);
            assert_eq!(h.offset[1], 0.);
            assert_eq!(h.distance, 0.);
        }
        assert_eq!(h.offset, [MAX_OFFSET, 0.]);
        assert!(!h.moving());
    }
    #[test]
    fn centre_returns_follow_to_rest() {
        let mut h = Hover::default();
        for t in 0..300 {
            h.sample(t, input([100., 0.]));
        }
        h.sample(300, input([100., 100.]));
        h.sample(350, input([99., 100.]));
        assert_eq!(h.target_offset, [0., 0.]);
        h.sample(351, input([100., 200.]));
        assert_eq!(h.target_offset, [0., MAX_OFFSET]);
        h.sample(500, input([100., 100.]));
        h.sample(620, input([100., 100.]));
        assert_eq!(h.offset, [0., 0.]);
        assert!(!h.moving());
    }
    #[test]
    fn locks_fade_morph_off_and_reduced_clear_all_old_motion() {
        for cause in 0..5 {
            let mut h = Hover::default();
            for t in 0..300 {
                h.sample(t, input([0., 100.]));
            }
            let mut i = input([0., 100.]);
            match cause {
                0 => i.locks[0] = true,
                1 => i.locks[1] = true,
                2 => i.locks[2] = true,
                3 => i.inside_native = false,
                _ => i.enabled = false,
            };
            h.sample(300, i);
            h.sample(420, i);
            assert_eq!(h.offset, [0., 0.]);
            assert!(!h.moving());
        }
        let mut h = Hover::default();
        for t in 0..300 {
            h.sample(t, input([200., 100.]));
        }
        let mut i = input([200., 100.]);
        i.reduced = true;
        h.sample(300, i);
        assert_eq!(h.offset, [0., 0.]);
        assert!(!h.moving());
        i.settled_full = false;
        h.sample(301, i);
        assert_eq!(h.offset, [0., 0.]);
    }
    #[test]
    fn idle_time_does_not_jump_new_magnetic_target() {
        let mut h = Hover::default();
        h.sample(0, input([100., 100.]));
        h.sample(1000, input([200., 100.]));
        assert_eq!(h.offset, [0., 0.]);
        h.sample(1016, input([200., 100.]));
        assert!(h.offset[0] > 0. && h.offset[0] < MAX_OFFSET);
    }
}
