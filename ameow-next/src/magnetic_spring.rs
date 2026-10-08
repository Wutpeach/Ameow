//! Single-object Nested-inspired follow; no native geometry or lifecycle authority.
use crate::edge_hover::{SIDE, nearest};

const RANGE: f64 = 200.;
const INTENSITY: f64 = 0.12; // Nested outer 0.2, scaled by 0.6 for a natural 6px peak.
pub const MAX_OFFSET: f32 = 6.;
const FADE_ONSET: f64 = 0.9; // Protected travel reaches a 186px normal Surface here.
const DURATION_MS: u64 = 800;
const DAMPING_RATIO: f64 = 0.9; // Motion 11.12: 1 - bounce(0.1).

#[derive(Clone, Copy)]
pub struct Input {
    pub pointer: [f32; 2],
    pub inside_native: bool,
    pub full_intent: bool,
    pub fullness: f32,
    pub fullness_velocity: f32,
    pub locks: [bool; 3],
    pub reduced: bool,
    pub enabled: bool,
}

/// Quintic fade and exact time derivative in s^-1, from protected normal travel.
fn fade(fullness: f32, velocity: f32) -> (f64, f64) {
    let x = f64::from(fullness);
    if x <= FADE_ONSET {
        return (0., 0.);
    }
    if x >= 1. {
        return (1., 0.);
    }
    let u = (x - FADE_ONSET) / (1. - FADE_ONSET);
    let weight = (u.powi(3) * (10. - 15. * u + 6. * u * u)).clamp(0., 1.);
    let derivative = 30. * u.powi(2) * (1. - u).powi(2) / (1. - FADE_ONSET) * f64::from(velocity);
    (weight, derivative)
}

pub fn target(pointer: [f32; 2]) -> [f32; 2] {
    target_exact(pointer).map(|v| v as f32)
}
fn target_exact(pointer: [f32; 2]) -> [f64; 2] {
    let d = pointer.map(|v| f64::from(v) - f64::from(SIDE / 2.));
    let r = d[0].hypot(d[1]);
    let scale = INTENSITY * (1. - r / RANGE).max(0.);
    d.map(|v| v * scale)
}

/// Motion 11.12 findSpring, mass 1, duration 800ms, bounce 0.1.
/// Velocity is already negated and converted from px/s to px/ms.
fn coefficients(velocity: f64) -> (f64, f64) {
    let duration = DURATION_MS as f64 / 1000.;
    let factor = (1. - DAMPING_RATIO.powi(2)).sqrt();
    let envelope = |freq: f64| {
        let decay = freq * DAMPING_RATIO;
        0.001 - ((decay - velocity) / (freq * factor)) * (-decay * duration).exp()
    };
    let mut freq = 5. / duration;
    for _ in 1..12 {
        let decay = freq * DAMPING_RATIO;
        let delta = decay * duration;
        let d = delta * velocity + velocity;
        let e = DAMPING_RATIO.powi(2) * freq.powi(2) * duration;
        let sign = if -envelope(freq) + 0.001 > 0. {
            -1.
        } else {
            1.
        };
        let derivative = sign * (d - e) * (-delta).exp() / (freq.powi(2) * factor);
        freq -= envelope(freq) / derivative;
    }
    if freq.is_nan() {
        (10., 0.5) // Exact source fallback: stiffness 100, damping 10, mass 1.
    } else {
        (freq.abs(), DAMPING_RATIO) // Source squares the root to obtain stiffness.
    }
}
#[derive(Clone, Copy)]
struct Segment {
    at: u64,
    origin: f64,
    target: f64,
    initial_velocity: f64,
    frequency: f64,
    damping_ratio: f64,
}
impl Segment {
    fn new(at: u64, origin: f64, target: f64, velocity: f64) -> Self {
        let initial_velocity = -velocity / 1000.;
        let (frequency, damping_ratio) = coefficients(initial_velocity);
        Self {
            at,
            origin,
            target,
            initial_velocity,
            frequency: frequency / 1000.,
            damping_ratio,
        }
    }
    fn sample(self, now: u64) -> (f64, f64, bool) {
        let elapsed = now.saturating_sub(self.at);
        if elapsed >= DURATION_MS {
            return (self.target, 0., true);
        }
        let t = elapsed as f64;
        let decay = self.damping_ratio * self.frequency;
        let angular = self.frequency * (1. - self.damping_ratio.powi(2)).sqrt();
        let delta = self.target - self.origin;
        let b = (self.initial_velocity + decay * delta) / angular;
        let (sin, cos) = (angular * t).sin_cos();
        let wave = b * sin + delta * cos;
        let envelope = (-decay * t).exp();
        let position = self.target - envelope * wave;
        let velocity = envelope * (decay * wave - angular * (b * cos - delta * sin)) * 1000.;
        (position, velocity, false)
    }
}
#[derive(Default)]
struct Axis {
    position: f64,
    velocity: f64,
    target: f64,
    segment: Option<Segment>,
    generation: u64,
}
impl Axis {
    fn advance(&mut self, now: u64) {
        if let Some(segment) = self.segment {
            let (position, velocity, done) = segment.sample(now);
            self.position = position;
            self.velocity = velocity;
            if done {
                self.segment = None;
            }
        }
    }
    fn retarget(&mut self, now: u64, target: f64) {
        if target == self.target {
            return;
        }
        self.target = target;
        self.generation = self.generation.saturating_add(1);
        self.segment = if self.position != target || self.velocity != 0. {
            Some(Segment::new(now, self.position, target, self.velocity))
        } else {
            None
        };
    }
}
#[derive(Default)]
pub struct Hover {
    pub eligible: bool,
    pub distance: f32,
    pub q: f32,
    pub nearest_point: [f32; 2],
    pub target_offset: [f32; 2],
    pub offset: [f32; 2],
    /// Final visual derivative, w*v + w_dot*p, logical px/s.
    pub velocity: [f32; 2],
    pub spring_position: [f32; 2],
    pub spring_velocity: [f32; 2],
    pub fade_weight: f32,
    pub fade_velocity: f32,
    pub tracking: bool,
    pub integrated_target: [f32; 2],
    /// Previous active sample interval; analytical evaluation has no 50ms cap.
    pub step_ms: f32,
    pub target_changed: bool,
    axes: [Axis; 2],
    last: Option<u64>,
}
impl Hover {
    pub fn sample(&mut self, now: u64, input: Input) {
        let previous_target = self.target_offset;
        self.step_ms = if self.moving() {
            self.last.map_or(0, |last| now.saturating_sub(last)) as f32
        } else {
            0.
        };
        self.last = Some(now);
        self.integrated_target =
            std::array::from_fn(|axis| self.axes[axis].segment.map_or(0., |s| s.target as f32));
        self.tracking = input.enabled && input.full_intent && !input.reduced;
        if !self.tracking {
            self.eligible = false;
            self.q = 0.;
            self.target_offset = [0., 0.];
            self.offset = [0., 0.];
            self.velocity = [0., 0.];
            for axis in &mut self.axes {
                axis.position = 0.;
                axis.velocity = 0.;
                axis.target = 0.;
                axis.segment = None;
            }
            self.spring_position = [0., 0.];
            self.spring_velocity = [0., 0.];
            self.fade_weight = 0.;
            self.fade_velocity = 0.;
            self.step_ms = 0.;
            self.integrated_target = [0., 0.];
            self.target_changed = previous_target != self.target_offset;
            return;
        }
        // Evaluate outgoing trajectories at the input time before replacing changed axes.
        for axis in &mut self.axes {
            axis.advance(now);
        }
        self.cap();
        self.eligible = input.inside_native && !input.locks.into_iter().any(|v| v);
        let projection = nearest(input.pointer);
        self.distance = projection.distance;
        self.nearest_point = projection.point;
        let next_target = if self.eligible {
            target_exact(input.pointer)
        } else {
            [0., 0.]
        };
        self.target_offset = if self.eligible {
            target(input.pointer)
        } else {
            [0., 0.]
        };
        self.q = self.target_offset[0].hypot(self.target_offset[1]) / MAX_OFFSET;
        self.target_changed = previous_target != self.target_offset;
        for (axis, target) in self.axes.iter_mut().zip(next_target) {
            axis.retarget(now, target);
        }
        let (weight, weight_velocity) = fade(input.fullness, input.fullness_velocity);
        self.fade_weight = weight as f32;
        self.fade_velocity = weight_velocity as f32;
        self.spring_position = self.axes.each_ref().map(|axis| axis.position as f32);
        self.spring_velocity = self.axes.each_ref().map(|axis| axis.velocity as f32);
        self.offset = self
            .axes
            .each_ref()
            .map(|axis| (weight * axis.position) as f32);
        self.velocity = self
            .axes
            .each_ref()
            .map(|axis| (weight * axis.velocity + weight_velocity * axis.position) as f32);
    }
    fn cap(&mut self) {
        let radius = self.axes[0].position.hypot(self.axes[1].position);
        if radius >= f64::from(MAX_OFFSET) {
            let unit = self.axes.each_ref().map(|axis| axis.position / radius);
            let outward = self.axes[0].velocity * unit[0] + self.axes[1].velocity * unit[1];
            for (axis, direction) in self.axes.iter_mut().zip(unit) {
                axis.position = direction * f64::from(MAX_OFFSET);
                if outward > 0. {
                    axis.velocity -= outward * direction;
                }
            }
        }
    }
    pub fn moving(&self) -> bool {
        self.axes.iter().any(|axis| axis.segment.is_some())
    }
    pub fn axis_generations(&self) -> [u64; 2] {
        self.axes.each_ref().map(|axis| axis.generation)
    }
    pub fn axis_started_ms(&self) -> [Option<u64>; 2] {
        self.axes
            .each_ref()
            .map(|axis| axis.segment.map(|segment| segment.at))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn input(pointer: [f32; 2]) -> Input {
        Input {
            pointer,
            inside_native: true,
            full_intent: true,
            fullness: 1.,
            fullness_velocity: 0.,
            locks: [false; 3],
            reduced: false,
            enabled: true,
        }
    }
    fn close(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 0.000001,
            "{actual} != {expected}"
        );
    }
    #[test]
    fn nested_target_is_continuous_near_centre_edges_corners_and_gutter() {
        assert_eq!(target([100., 100.]), [0., 0.]);
        assert_eq!(target([200., 100.]), [6., 0.]);
        assert_eq!(target([300., 100.]), [0., 0.]);
        assert_eq!(target([400., 100.]), [0., 0.]);
        for d in [0.001, 0.1, 1., 5.] {
            assert!(target([100. + d, 100.])[0] > 0.);
            assert!(target([100. - d, 100.])[0] < 0.);
        }
        for x in -140..=2140 {
            let pointer = [x as f32 / 10., x as f32 / 10.];
            let t = target(pointer);
            assert!(t[0].hypot(t[1]) <= MAX_OFFSET + 0.000001);
            assert_eq!(t[0], t[1]);
            let next = target([pointer[0] + 0.01, pointer[1] + 0.01]);
            assert!((t[0] - next[0]).hypot(t[1] - next[1]) < 0.002);
        }
        assert!(target([214., 100.])[0] < 6.);
    }
    #[test]
    fn tagged_motion_reference_checkpoints_and_analytical_derivative_match() {
        // Independently computed by root from the tagged JS equations. Raw segment, no cap.
        let (freq, _) = coefficients(0.);
        close(freq, 10.601056064909912);
        let s = Segment::new(0, 0., 3., 0.);
        for (ms, x, v) in [
            (16, 0.03898706183417877, 4.626434855146334),
            (100, 0.902079144486231, 12.528359759528646),
            (200, 1.998462130752336, 8.638706332319279),
            (400, 2.8869898052794873, 1.544231365819101),
            (600, 3.0018397723803028, 0.0859277794381258),
            (799, 3.002834567506787, -0.018662423767399655),
        ] {
            let (position, velocity, _) = s.sample(ms);
            close(position, x);
            close(velocity, v);
        }
        assert_eq!(s.sample(800), (3., 0., true));
    }
    #[test]
    fn analytic_response_is_independent_of_callback_cadence_and_dropped_frames() {
        let mut regular = Hover::default();
        let mut sparse = Hover::default();
        let i = input([200., 100.]);
        regular.sample(0, i);
        sparse.sample(0, i);
        for now in [16, 32, 48, 64, 80, 96] {
            regular.sample(now, i);
        }
        regular.sample(250, i);
        sparse.sample(250, i);
        assert_eq!(regular.offset, sparse.offset);
        assert_eq!(regular.velocity, sparse.velocity);
        assert_eq!(sparse.step_ms, 250.);
        for now in (266..800).step_by(16) {
            regular.sample(now, i);
        }
        regular.sample(800, i);
        sparse.sample(1200, i);
        assert_eq!(regular.offset, [6., 0.]);
        assert_eq!(sparse.offset, [6., 0.]);
        assert!(!regular.moving() && !sparse.moving());
        assert_eq!(sparse.velocity, [0., 0.]);
    }
    #[test]
    fn retarget_evaluates_outgoing_response_and_preserves_position_velocity() {
        let mut h = Hover::default();
        h.sample(0, input([200., 100.]));
        h.sample(100, input([200., 100.]));
        let position = h.offset;
        let velocity = h.velocity;
        h.sample(100, input([0., 100.]));
        assert_eq!(h.offset, position);
        assert_eq!(h.velocity, velocity);
        assert_eq!(h.integrated_target, [6., 0.]);
        assert_eq!(h.target_offset, [-6., 0.]);
        h.sample(101, input([0., 100.]));
        assert!(h.velocity[0] < velocity[0]);
        assert!(h.offset[0] > position[0]); // Outgoing positive velocity is not discarded.
        h.sample(900, input([0., 100.]));
        assert_eq!(h.offset, [-6., 0.]);
        assert!(!h.moving());
    }
    #[test]
    fn moving_reversal_matches_independent_velocity_dependent_reference() {
        let velocity = 12.528359759528646;
        let (freq, _) = coefficients(-velocity / 1000.);
        close(freq, 10.602878325564014);
        let segment = Segment::new(100, 0.902079144486231, -3., velocity);
        for (elapsed, position, speed) in [
            (16, 1.0232657484572831, 3.065013705395354),
            (100, 0.19394160708282282, -16.421599382465374),
            (400, -2.795815654950398, -2.6300852471811926),
        ] {
            let (actual_position, actual_velocity, _) = segment.sample(100 + elapsed);
            close(actual_position, position);
            close(actual_velocity, speed);
        }
        assert_eq!(segment.sample(900), (-3., 0., true));
    }
    #[test]
    fn unchanged_axis_keeps_original_duration_when_other_axis_retargets() {
        let mut x = Axis::default();
        let mut y = Axis::default();
        x.retarget(0, 2.);
        y.retarget(0, 1.);
        x.advance(100);
        y.advance(100);
        y.retarget(100, -1.);
        x.retarget(100, 2.);
        x.advance(800);
        y.advance(800);
        assert_eq!(x.position, 2.);
        assert!(x.segment.is_none());
        assert_ne!(y.position, -1.);
        y.advance(900);
        assert_eq!(y.position, -1.);
        assert!(y.segment.is_none());
    }
    #[test]
    fn actual_cap_removes_outward_velocity_and_retargets_from_visible_state() {
        let mut h = Hover::default();
        for now in (0..6000).step_by(7) {
            let pointer = match (now / 70) % 4 {
                0 => [200., 100.],
                1 => [100., 0.],
                2 => [0., 100.],
                _ => [100., 200.],
            };
            h.sample(now, input(pointer));
            assert!(h.offset[0].hypot(h.offset[1]) <= 6.000001);
            assert!(h.velocity.iter().all(|v| v.is_finite()));
        }
        h.axes[0].position = 8.;
        h.axes[1].position = 0.;
        h.axes[0].velocity = 20.;
        h.axes[1].velocity = 7.;
        h.cap();
        close(h.axes[0].position, 6.);
        close(h.axes[0].velocity, 0.);
        close(h.axes[1].velocity, 7.);
        h.axes[0].velocity = -5.;
        h.cap();
        close(h.axes[0].velocity, -5.);
        h.axes[0].retarget(6000, -3.);
        let (position, velocity, _) = h.axes[0].segment.unwrap().sample(6000);
        close(position, 6.);
        close(velocity, -5.);
    }
    #[test]
    fn leave_and_all_locks_aim_at_zero_then_sleep_without_residual() {
        for cause in 0..4 {
            let mut h = Hover::default();
            h.sample(0, input([200., 100.]));
            h.sample(800, input([200., 100.]));
            let mut i = input([200., 100.]);
            if cause == 3 {
                i.inside_native = false;
            } else {
                i.locks[cause] = true;
            }
            h.sample(1000, i);
            assert_eq!(h.offset, [6., 0.]);
            assert_eq!(h.target_offset, [0., 0.]);
            assert_eq!(h.step_ms, 0.);
            h.sample(1016, i);
            assert!(h.offset[0] < 6. && h.offset[0] > 0.);
            h.sample(1800, i);
            assert_eq!(h.offset, [0., 0.]);
            assert_eq!(h.velocity, [0., 0.]);
            assert!(!h.moving());
            assert!(!h.eligible);
        }
    }
    #[test]
    fn suppression_clears_segments_and_new_input_never_catches_up_idle_time() {
        for cause in 0..3 {
            let mut h = Hover::default();
            h.sample(0, input([200., 100.]));
            h.sample(16, input([200., 100.]));
            let mut i = input([200., 100.]);
            match cause {
                0 => i.full_intent = false,
                1 => i.reduced = true,
                _ => i.enabled = false,
            }
            h.sample(20, i);
            assert_eq!(h.offset, [0., 0.]);
            assert_eq!(h.velocity, [0., 0.]);
            assert!(!h.moving());
            h.sample(10000, input([200., 100.]));
            assert_eq!(h.offset, [0., 0.]);
            assert_eq!(h.step_ms, 0.);
            h.sample(10016, input([200., 100.]));
            assert!(h.offset[0] > 0.);
            h.sample(10800, input([200., 100.]));
            assert!(!h.moving());
            h.sample(50000, input([0., 100.]));
            assert_eq!(h.offset, [6., 0.]);
            assert_eq!(h.velocity, [0., 0.]);
            assert_eq!(h.step_ms, 0.);
        }
    }
    #[test]
    fn late_fade_has_zero_endpoint_derivatives_and_correct_product_velocity() {
        for x in [0., 0.5, 0.89] {
            assert_eq!(fade(x, 3.), (0., 0.));
        }
        assert_eq!(fade(1., 3.), (1., 0.));
        let (w, derivative) = fade(0.95, 0.5);
        assert!((w - 0.5).abs() < 0.000001);
        assert!((derivative - 9.375).abs() < 0.00001);
        let (left, _) = fade(0.9499, 0.);
        let (right, _) = fade(0.9501, 0.);
        assert!(
            ((right - left) / (f64::from(0.9501f32) - f64::from(0.9499f32)) * 0.5 - derivative)
                .abs()
                < 0.001
        );
        let mut h = Hover::default();
        let mut i = input([30., 30.]);
        i.fullness = 0.;
        h.sample(0, i);
        h.sample(120, i);
        assert_ne!(h.spring_position, [0., 0.]);
        assert_eq!(h.offset, [0., 0.]);
        assert_eq!(h.velocity, [0., 0.]);
        i.fullness = 0.95;
        i.fullness_velocity = 0.5;
        h.sample(160, i);
        for axis in 0..2 {
            let a = &h.axes[axis];
            assert!((f64::from(h.offset[axis]) - w * a.position).abs() < 0.000001);
            assert!(
                (f64::from(h.velocity[axis]) - (w * a.velocity + derivative * a.position)).abs()
                    < 0.00001
            );
        }
    }
    #[test]
    fn real_repair_b_expand_settle_rest_keeps_same_spring_and_time_owner() {
        use crate::repair_motion::{Candidate, Motion};
        for cadence in [4, 16, 33] {
            let mut motion = Motion::new(Candidate::Converged, false, 0);
            motion.tick(0, true, false);
            let mut h = Hover::default();
            let mut i = input([30., 30.]);
            i.fullness = 0.;
            h.sample(0, i);
            let identities = h.axis_generations();
            assert_eq!(h.axis_started_ms(), [Some(0), Some(0)]);
            let mut saw_late = false;
            let mut saw_settle = false;
            let mut saw_rest = false;
            for now in (cadence..=640).step_by(cadence as usize) {
                motion.tick(now, true, false);
                i.fullness = motion.x;
                i.fullness_velocity = motion.v;
                h.sample(now, i);
                assert_eq!(h.axis_generations(), identities);
                assert_eq!(h.axis_started_ms(), [Some(0), Some(0)]);
                assert!(h.offset[0].hypot(h.offset[1]) <= MAX_OFFSET + 0.000001);
                if motion.x <= 0.9 {
                    assert_eq!(h.offset, [0., 0.]);
                }
                if motion.x > 0.9 && motion.x < 1. {
                    saw_late = true;
                    assert!(h.fade_weight > 0. && h.fade_weight <= 1.);
                    assert_ne!(h.offset, [0., 0.]);
                }
                if motion.phase() == "settle" || motion.phase() == "rest" {
                    assert_eq!(h.fade_weight, 1.);
                    assert_eq!(h.fade_velocity, 0.);
                    assert_eq!(h.offset, h.spring_position);
                    assert_eq!(h.velocity, h.spring_velocity);
                    saw_settle |= motion.phase() == "settle";
                    saw_rest |= motion.phase() == "rest";
                }
            }
            assert!(saw_late && saw_settle && saw_rest);
            // Reversing the lifecycle retires all hidden and visible residual immediately.
            i.full_intent = false;
            h.sample(641, i);
            assert_eq!(h.offset, [0., 0.]);
            assert_eq!(h.velocity, [0., 0.]);
            assert_eq!(h.spring_position, [0., 0.]);
            assert!(!h.moving());
            i.full_intent = true;
            i.fullness = 0.;
            h.sample(10000, i);
            assert_eq!(h.step_ms, 0.);
            assert_eq!(h.offset, [0., 0.]);
            assert_eq!(h.axis_started_ms(), [Some(10000), Some(10000)]);
        }
    }
    #[test]
    fn fade_and_spring_output_are_cadence_independent_given_same_travel_sample() {
        let mut regular = Hover::default();
        let mut dropped = Hover::default();
        let mut i = input([30., 30.]);
        i.fullness = 0.;
        regular.sample(0, i);
        dropped.sample(0, i);
        for now in (16..160).step_by(16) {
            regular.sample(now, i);
        }
        i.fullness = 0.95;
        i.fullness_velocity = 1.;
        regular.sample(160, i);
        dropped.sample(160, i);
        assert_eq!(regular.offset, dropped.offset);
        assert_eq!(regular.velocity, dropped.velocity);
        assert_eq!(regular.axis_generations(), dropped.axis_generations());
        assert_eq!(regular.axis_started_ms(), dropped.axis_started_ms());
        i.fullness = 1.;
        i.fullness_velocity = 0.;
        regular.sample(432, i);
        dropped.sample(432, i);
        assert_eq!(regular.offset, dropped.offset);
        assert_eq!(regular.velocity, dropped.velocity);
    }
    #[test]
    fn reversal_reduced_and_off_clear_hidden_and_visible_motion_at_every_fade_stage() {
        for fullness in [0.5, 0.95, 1.] {
            for cause in 0..3 {
                let mut h = Hover::default();
                let mut i = input([30., 30.]);
                i.fullness = fullness;
                i.fullness_velocity = 0.5;
                h.sample(0, i);
                h.sample(160, i);
                assert_ne!(h.spring_position, [0., 0.]);
                match cause {
                    0 => i.full_intent = false,
                    1 => i.reduced = true,
                    _ => i.enabled = false,
                }
                h.sample(161, i);
                assert_eq!(h.offset, [0., 0.]);
                assert_eq!(h.velocity, [0., 0.]);
                assert_eq!(h.spring_position, [0., 0.]);
                assert_eq!(h.spring_velocity, [0., 0.]);
                assert_eq!(h.fade_weight, 0.);
                assert_eq!(h.fade_velocity, 0.);
                assert_eq!(h.axis_started_ms(), [None, None]);
                assert!(!h.tracking && !h.moving());
            }
        }
    }
}
