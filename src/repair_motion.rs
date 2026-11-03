//! Adopted asymmetric A-soft window motion, plus explicit historical recovery modes.
use crate::model::Geometry;
const B_MIN_X: f32 = -1.2 / 140.;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Candidate {
    #[default]
    Converged,
    Baseline,
    ASoft,
    ACrisp,
    B,
}
impl Candidate {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "converged" => Some(Self::Converged),
            "baseline" => Some(Self::Baseline),
            "a-soft" => Some(Self::ASoft),
            "a-crisp" => Some(Self::ACrisp),
            "b" => Some(Self::B),
            _ => None,
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            Self::Converged => "converged",
            Self::Baseline => "baseline",
            Self::ASoft => "a-soft",
            Self::ACrisp => "a-crisp",
            Self::B => "b",
        }
    }
    fn spring(self) -> (f32, f32) {
        match self {
            Self::Converged | Self::ASoft => (520., 40.),
            Self::ACrisp => (550., 40.),
            Self::B => (520., 36.5),
            Self::Baseline => (520., 42.),
        }
    }
    pub fn max_geometry(self) -> Geometry {
        if self == Self::B {
            Geometry {
                surface: 202.8,
                gutter: 14.08,
                radius: 20.,
                native: 230.96,
            }
        } else {
            Geometry::at(1.)
        }
    }
}
#[derive(Clone, Copy, Debug)]
struct Landing {
    from: f32,
    velocity: f32,
    target: f32,
    elapsed: f32,
    duration: f32,
}
#[derive(Clone, Copy, Debug)]
struct Pulse {
    elapsed: f32,
    duration: f32,
    peak: f32,
}
#[derive(Debug)]
pub struct Motion {
    pub candidate: Candidate,
    pub x: f32,
    pub v: f32,
    pub extra: f32,
    pub extra_v: f32,
    pub uncapped: bool,
    target: bool,
    last: u64,
    landing: Option<Landing>,
    pulse: Option<Pulse>,
    recover: bool,
}
impl Motion {
    pub fn new(candidate: Candidate, uncapped: bool, now: u64) -> Self {
        Self {
            candidate,
            x: 0.,
            v: 0.,
            extra: 0.,
            extra_v: 0.,
            uncapped,
            target: false,
            last: now,
            landing: None,
            pulse: None,
            recover: false,
        }
    }
    pub fn phase(&self) -> &'static str {
        if self.pulse.is_some() {
            "settle"
        } else if self.recover {
            "transfer"
        } else if self.landing.is_some() {
            "landing"
        } else if self.v != 0. {
            "travel"
        } else {
            "rest"
        }
    }
    pub fn moving(&self) -> bool {
        self.v != 0.
            || self.x != if self.target { 1. } else { 0. }
            || self.landing.is_some()
            || self.pulse.is_some()
            || self.recover
    }
    pub fn geometry(&self) -> Geometry {
        if self.candidate == Candidate::B {
            let x = self.x.clamp(B_MIN_X, 1.02);
            let surface = 60. + 140. * x;
            let gutter = 10. + 4. * x;
            Geometry {
                surface,
                gutter,
                radius: 30. - 10. * x.clamp(0., 1.),
                native: surface + 2. * gutter,
            }
        } else {
            let mut g = Geometry::at(self.x);
            g.surface += self.extra;
            g
        }
    }
    fn change_target(&mut self, target: bool) {
        self.target = target;
        self.landing = None;
        self.pulse = None;
        // Preserve the sampled visual position and velocity; retire the old pulse ownership.
        self.recover = self.extra.abs() > 0.0001 || self.extra_v.abs() > 0.0001;
    }
    pub fn tick(&mut self, now: u64, target: bool, reduced: bool) {
        let raw = now.saturating_sub(self.last) as f32 / 1000.;
        // A late lifecycle deadline must not rewind the integrated clock.
        self.last = self.last.max(now);
        if reduced {
            self.target = target;
            self.x = if target { 1. } else { 0. };
            self.v = 0.;
            self.extra = 0.;
            self.extra_v = 0.;
            self.landing = None;
            self.pulse = None;
            self.recover = false;
            return;
        }
        // Advance the previous owner to the event time before handing over a reversal.
        let mut dt = if self.uncapped { raw } else { raw.min(0.05) };
        while dt > 0. {
            let h = dt.min(0.004);
            self.step(h);
            dt -= h;
        }
        if target != self.target {
            self.change_target(target);
        }
    }
    fn step(&mut self, h: f32) {
        let target = if self.target { 1. } else { 0. };
        let mut arrived = false;
        if let Some(mut landing) = self.landing {
            landing.elapsed = (landing.elapsed + h).min(landing.duration);
            let t = landing.elapsed / landing.duration;
            let t2 = t * t;
            let t3 = t2 * t;
            self.x = (2. * t3 - 3. * t2 + 1.) * landing.from
                + (t3 - 2. * t2 + t) * landing.duration * landing.velocity
                + (-2. * t3 + 3. * t2) * landing.target;
            self.v = ((6. * t2 - 6. * t) * landing.from
                + (3. * t2 - 4. * t + 1.) * landing.duration * landing.velocity
                + (-6. * t2 + 6. * t) * landing.target)
                / landing.duration;
            if t >= 1. || (self.x == target && self.v.abs() < 0.003) {
                self.x = target;
                self.v = 0.;
                self.landing = None;
                arrived = true;
                let crisp = self.candidate == Candidate::ACrisp;
                self.pulse = Some(Pulse {
                    elapsed: 0.,
                    duration: if self.target {
                        if crisp { 0.160 } else { 0.170 }
                    } else if crisp {
                        0.140
                    } else if self.candidate == Candidate::Converged {
                        0.120
                    } else {
                        0.150
                    },
                    peak: if self.target {
                        if crisp { 3. } else { 2.5 }
                    } else if crisp {
                        2.
                    } else if self.candidate == Candidate::Converged {
                        0.85
                    } else {
                        1.5
                    },
                });
            } else {
                self.landing = Some(landing);
            }
        } else if self.x != target || self.v != 0. {
            let (k, d) = self.candidate.spring();
            self.v += (k * (target - self.x) - d * self.v) * h;
            self.x += self.v * h;
            if self.candidate == Candidate::B {
                if self.x < B_MIN_X {
                    self.x = B_MIN_X;
                    self.v = self.v.max(0.);
                }
                if self.x > 1.02 {
                    self.x = 1.02;
                    self.v = self.v.min(0.);
                }
                if (self.x - target).abs() < 0.0002 && self.v.abs() < 0.003 {
                    self.x = target;
                    self.v = 0.;
                }
            } else {
                self.x = self.x.clamp(0., 1.);
                let gap = target - self.x;
                if gap.abs() < 0.025 && gap * self.v > 0. {
                    self.landing = Some(Landing {
                        from: self.x,
                        velocity: self.v,
                        target,
                        elapsed: 0.,
                        duration: (2. * gap / self.v).clamp(0.008, 0.1),
                    });
                }
            }
        }
        if self.recover {
            // Critically damped transfer residual. Analytic update avoids a reversal reset.
            let w = 32.;
            let b = self.extra_v + w * self.extra;
            let decay = (-w * h).exp();
            self.extra = (self.extra + b * h) * decay;
            self.extra_v = (self.extra_v - w * b * h) * decay;
            if self.extra.abs() < 0.0001 && self.extra_v.abs() < 0.003 {
                self.extra = 0.;
                self.extra_v = 0.;
                self.recover = false;
            }
        } else if !arrived && let Some(mut pulse) = self.pulse {
            pulse.elapsed = (pulse.elapsed + h).min(pulse.duration);
            let angle = std::f32::consts::PI * pulse.elapsed / pulse.duration;
            self.extra = pulse.peak * angle.sin().powi(2);
            self.extra_v = pulse.peak * std::f32::consts::PI / pulse.duration * (2. * angle).sin();
            if pulse.elapsed >= pulse.duration {
                self.extra = 0.;
                self.extra_v = 0.;
                self.pulse = None;
            } else {
                self.pulse = Some(pulse);
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn late_handover_does_not_reintegrate_an_already_sampled_interval() {
        let mut m = Motion::new(Candidate::Converged, false, 0);
        m.tick(0, true, false);
        run(&mut m, 1, 500, true);
        let before = (m.x, m.v, m.extra, m.extra_v);
        m.tick(400, false, false);
        m.tick(500, false, false);
        assert_eq!(before, (m.x, m.v, m.extra, m.extra_v));
        assert_eq!(m.last, 500);
        m.tick(516, false, false);
        assert!(m.x < 1. && m.x > 0.9);
    }
    #[test]
    fn chosen_expand_matches_repair_a_soft_exactly_and_collapse_changes_only_residual() {
        for interval in [1, 4, 16, 33] {
            let mut chosen = Motion::new(Candidate::Converged, false, 0);
            let mut old = Motion::new(Candidate::ASoft, false, 0);
            chosen.tick(700, true, false);
            old.tick(700, true, false);
            for now in (700..=1400).step_by(interval) {
                chosen.tick(now, true, false);
                old.tick(now, true, false);
                assert_eq!(
                    (chosen.x, chosen.v, chosen.extra, chosen.extra_v),
                    (old.x, old.v, old.extra, old.extra_v)
                );
            }
            chosen.tick(1400, false, false);
            old.tick(1400, false, false);
            let mut peak = 0f32;
            for now in (1400..=2200).step_by(interval) {
                chosen.tick(now, false, false);
                old.tick(now, false, false);
                assert_eq!((chosen.x, chosen.v), (old.x, old.v));
                assert_eq!(
                    (chosen.geometry().native, chosen.geometry().radius),
                    (old.geometry().native, old.geometry().radius)
                );
                if let Some(pulse) = chosen.pulse {
                    assert_eq!(pulse.duration, 0.120);
                    assert_eq!(pulse.peak, 0.85);
                }
                peak = peak.max(chosen.extra);
                assert!(chosen.geometry().surface >= 60.);
            }
            assert!((0.65..=0.851).contains(&peak));
            if interval == 1 {
                assert!((peak - 0.85).abs() < 0.001);
            }
            assert_eq!(chosen.extra, 0.);
            assert!(!chosen.moving());
        }
    }
    #[test]
    fn chosen_settle_reversal_retires_pulse_without_position_or_velocity_reset() {
        for reverse_at in [80, 210, 290, 330] {
            let mut m = Motion::new(Candidate::Converged, false, 0);
            m.tick(0, true, false);
            run(&mut m, 1, reverse_at, true);
            let before = (m.x, m.v, m.extra, m.extra_v);
            m.tick(reverse_at, false, false);
            assert_eq!(before, (m.x, m.v, m.extra, m.extra_v));
            assert!(m.pulse.is_none());
            for now in reverse_at + 1..=reverse_at + 800 {
                m.tick(now, false, false);
                if let Some(p) = m.pulse {
                    assert_eq!(p.peak, 0.85);
                }
                assert!((80. ..=228.).contains(&m.geometry().native));
            }
            assert_eq!((m.x, m.v, m.extra, m.extra_v), (0., 0., 0., 0.));
        }
    }
    #[test]
    fn chosen_reduced_motion_clears_expand_and_collapse_settle_without_replay() {
        for expand in [true, false] {
            let mut m = Motion::new(Candidate::Converged, false, 0);
            if !expand {
                m.tick(0, true, true);
            }
            m.tick(0, expand, false);
            run(&mut m, 1, 300, expand);
            assert!(m.extra > 0.);
            m.tick(300, expand, true);
            assert_eq!(m.extra, 0.);
            assert_eq!(m.extra_v, 0.);
            assert!(!m.moving());
            run(&mut m, 301, 800, expand);
            assert_eq!(m.extra, 0.);
            assert_eq!(m.geometry().radius, if expand { 20. } else { 30. });
        }
    }
    fn run(m: &mut Motion, start: u64, end: u64, target: bool) {
        for t in (start..=end).step_by(1) {
            m.tick(t, target, false);
        }
    }
    #[test]
    fn a_arrives_and_settles_inside_legal_native_endpoints() {
        for c in [Candidate::ASoft, Candidate::ACrisp] {
            let mut m = Motion::new(c, false, 0);
            m.tick(0, true, false);
            let mut arrival = None;
            let mut peak = 0f32;
            for t in 1..=500 {
                m.tick(t, true, false);
                let g = m.geometry();
                assert!((80. ..=228.).contains(&g.native));
                assert!(g.surface + g.gutter <= g.native);
                peak = peak.max(m.extra);
                if m.x == 1. && arrival.is_none() {
                    arrival = Some(t);
                }
            }
            assert!(
                (220..=280).contains(&arrival.unwrap()),
                "{:?} {:?}",
                c,
                arrival
            );
            assert!((2.49..=3.01).contains(&peak));
            assert_eq!(m.extra, 0.);
            assert!(!m.moving());
        }
    }
    #[test]
    fn travel_landing_and_settle_reversals_preserve_position_and_velocity() {
        for at in [80, 210, 290, 330] {
            let mut m = Motion::new(Candidate::ASoft, false, 0);
            m.tick(0, true, false);
            run(&mut m, 1, at, true);
            let before = (m.x, m.v, m.extra, m.extra_v);
            m.tick(at, false, false);
            assert_eq!(before, (m.x, m.v, m.extra, m.extra_v));
            assert!(m.pulse.is_none());
            run(&mut m, at + 1, at + 1000, false);
            assert_eq!(m.x, 0.);
            assert_eq!(m.extra, 0.);
            assert!(!m.moving());
        }
    }
    #[test]
    fn reduced_motion_cancels_mid_settle_and_does_not_replay() {
        let mut m = Motion::new(Candidate::ACrisp, false, 0);
        m.tick(0, true, false);
        run(&mut m, 1, 300, true);
        assert!(m.extra > 0.);
        m.tick(300, true, true);
        assert_eq!((m.x, m.v, m.extra, m.extra_v), (1., 0., 0., 0.));
        assert!(!m.moving());
        run(&mut m, 301, 500, true);
        assert_eq!(m.extra, 0.);
    }
    #[test]
    fn compact_settle_is_positive_and_smaller() {
        let mut m = Motion::new(Candidate::ACrisp, false, 0);
        m.tick(0, true, true);
        m.tick(0, false, false);
        let mut peak = 0f32;
        for t in 1..=500 {
            m.tick(t, false, false);
            peak = peak.max(m.extra);
            assert!(m.extra >= 0.);
            assert!(m.geometry().surface >= 60.);
        }
        assert!((1.99..=2.01).contains(&peak));
        assert_eq!(m.geometry().native, 80.);
    }
    #[test]
    fn b_bounds_are_limited_and_disclosed() {
        let mut m = Motion::new(Candidate::B, false, 0);
        m.tick(0, true, false);
        let mut peak = 0f32;
        for t in 1..=900 {
            m.tick(t, true, false);
            peak = peak.max(m.x);
            assert!((B_MIN_X..=1.02).contains(&m.x));
            assert!(m.geometry().native <= 230.96);
        }
        assert!(peak > 1. && peak <= 1.02);
        assert_eq!(m.geometry().radius, 20.);
        m.tick(900, false, false);
        for now in 901..=1800 {
            m.tick(now, false, false);
            assert!(m.geometry().surface >= 58.8);
            assert!((B_MIN_X..=1.02).contains(&m.x));
        }
    }
    #[test]
    fn reversal_surface_shadow_and_anchor_remain_inside_a_gutter() {
        for c in [Candidate::ASoft, Candidate::ACrisp] {
            for reverse_at in (20..420).step_by(10) {
                let mut m = Motion::new(c, false, 0);
                m.tick(0, true, false);
                for now in 1..=1100 {
                    m.tick(now, now < reverse_at, false);
                    let g = m.geometry();
                    assert!((80. ..=228.).contains(&g.native));
                    let response = (m.extra / 3.).clamp(0., 1.);
                    let fullness = (g.gutter - 10.) / 4.;
                    let blur = g.gutter * 0.5 - 2. + response * 0.4;
                    let offset = 1. + fullness + response * 0.2;
                    assert!(
                        m.extra + offset + blur * 1.5 <= g.gutter,
                        "{:?} at{} now{} extra{}",
                        c,
                        reverse_at,
                        now,
                        m.extra
                    );
                    let anchor = [514., 314.];
                    let origin = g.origin(anchor);
                    assert!((origin[0] + g.gutter - anchor[0]).abs() < 0.0001);
                }
            }
        }
    }
    #[test]
    fn uncapped_long_frame_changes_travel_but_not_final_endpoint() {
        let mut cap = Motion::new(Candidate::ASoft, false, 0);
        let mut uncap = Motion::new(Candidate::ASoft, true, 0);
        cap.tick(0, true, false);
        uncap.tick(0, true, false);
        cap.tick(200, true, false);
        uncap.tick(200, true, false);
        assert!(uncap.x > cap.x);
        run(&mut cap, 201, 1000, true);
        run(&mut uncap, 201, 1000, true);
        assert_eq!(cap.geometry().native, 228.);
        assert_eq!(uncap.geometry().native, 228.);
    }
    #[test]
    fn late_landing_and_repeated_reversals_do_not_hide_outward_boundary_velocity() {
        for c in [Candidate::ASoft, Candidate::ACrisp] {
            for reverse_at in 190..290 {
                let mut m = Motion::new(c, false, 0);
                m.tick(0, true, false);
                for now in 1..=900 {
                    let target = now < reverse_at
                        || (now >= reverse_at + 20 && now < reverse_at + 45)
                        || now >= reverse_at + 75;
                    m.tick(now, target, false);
                    assert!(
                        !(m.x == 1. && m.v > 0.) && !(m.x == 0. && m.v < 0.),
                        "{:?} reverse{} now{} x{} v{}",
                        c,
                        reverse_at,
                        now,
                        m.x,
                        m.v
                    );
                    let g = m.geometry();
                    assert!(g.surface + g.gutter <= g.native);
                }
            }
        }
    }
}
