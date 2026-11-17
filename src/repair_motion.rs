//! Asymmetric window motion with direct Full arrival and a size-tuned Compact spring.
use crate::model::Geometry;
const COMPACT_MIN_X: f32 = -3. / 140.;

#[derive(Clone, Copy, Debug)]
struct Landing {
    from: f32,
    velocity: f32,
    target: f32,
    elapsed: f32,
    duration: f32,
}
#[derive(Debug)]
pub struct Motion {
    pub x: f32,
    pub v: f32,
    pub extra: f32,
    pub extra_v: f32,
    target: bool,
    last: u64,
    landing: Option<Landing>,
    recover: bool,
}
impl Motion {
    pub fn new(now: u64) -> Self {
        Self {
            x: 0.,
            v: 0.,
            extra: 0.,
            extra_v: 0.,
            target: false,
            last: now,
            landing: None,
            recover: false,
        }
    }
    pub fn phase(&self) -> &'static str {
        if self.recover {
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
            || self.recover
    }
    pub fn geometry(&self) -> Geometry {
        let mut g = Geometry::at(self.x);
        // Compress inside the 80px native window without shrinking its hit boundary.
        g.surface += 140. * self.x.min(0.);
        g.surface += self.extra;
        g
    }
    fn change_target(&mut self, target: bool) {
        if target && self.x < 0. {
            // Transfer the compressed Surface and its velocity before expansion clamps fullness.
            self.extra += 140. * self.x;
            self.extra_v += 140. * self.v;
            self.x = 0.;
            self.v = 0.;
        }
        self.target = target;
        self.landing = None;
        // Preserve the sampled visual position and velocity during the handover.
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
            self.recover = false;
            return;
        }
        // Advance the previous owner to the event time before handing over a reversal.
        let mut dt = raw.min(0.05);
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
            } else {
                self.landing = Some(landing);
            }
        } else if self.x != target || self.v != 0. {
            // Basic 2-inspired: direct Full arrival and a 2–3px Compact compression.
            let (k, d) = if self.target { (520., 40.) } else { (200., 22.) };
            self.v += (k * (target - self.x) - d * self.v) * h;
            self.x += self.v * h;
            if !self.target {
                if self.x < COMPACT_MIN_X {
                    self.x = COMPACT_MIN_X;
                    self.v = self.v.max(0.);
                }
                if self.x > 1. {
                    self.x = 1.;
                    self.v = self.v.min(0.);
                }
                if self.x.abs() < 0.0002 && self.v.abs() < 0.003 {
                    self.x = 0.;
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
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn late_handover_does_not_reintegrate_an_already_sampled_interval() {
        let mut m = Motion::new(0);
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
    fn chosen_expands_without_a_pulse_and_compact_compresses_before_settling() {
        for interval in [1, 4, 16, 33] {
            let mut chosen = Motion::new(0);
            chosen.tick(700, true, false);
            for now in (700..=1400).step_by(interval) {
                chosen.tick(now, true, false);
                assert_eq!((chosen.extra, chosen.extra_v), (0., 0.));
                assert!(chosen.geometry().surface <= 200.);
            }
            chosen.tick(1400, false, false);
            let mut minimum_surface = 200f32;
            let mut saw_return = false;
            let mut saw_midpoint = false;
            for now in (1400..=2600).step_by(interval) {
                chosen.tick(now, false, false);
                let g = chosen.geometry();
                minimum_surface = minimum_surface.min(g.surface);
                saw_return |= minimum_surface < 59. && g.surface > minimum_surface + 1.;
                assert_eq!((chosen.extra, chosen.extra_v), (0., 0.));
                assert!((57. ..=200.).contains(&g.surface));
                assert!((80. ..=228.).contains(&g.native));
                if g.surface < 60. {
                    assert_eq!((g.native, g.gutter), (80., 10.));
                }
                if (90..=110).contains(&(now - 1400)) {
                    // Keep the reference's unhurried travel while making the small endpoint visible.
                    assert!((0.45..=0.65).contains(&chosen.x));
                    saw_midpoint = true;
                }
            }
            assert!(saw_midpoint);
            assert!((57. ..=58.5).contains(&minimum_surface), "{interval}ms: {minimum_surface}px");
            assert!(saw_return);
            assert_eq!(chosen.geometry().surface, 60.);
            assert!(!chosen.moving());
        }
    }
    #[test]
    fn chosen_reversals_preserve_position_and_velocity() {
        for reverse_at in [80, 210, 290, 330] {
            let mut m = Motion::new(0);
            m.tick(0, true, false);
            run(&mut m, 1, reverse_at, true);
            let before = (m.x, m.v, m.extra, m.extra_v);
            m.tick(reverse_at, false, false);
            assert_eq!(before, (m.x, m.v, m.extra, m.extra_v));
            for now in reverse_at + 1..=reverse_at + 1200 {
                m.tick(now, false, false);
                assert_eq!((m.extra, m.extra_v), (0., 0.));
                assert!((80. ..=228.).contains(&m.geometry().native));
            }
            assert_eq!((m.x, m.v, m.extra, m.extra_v), (0., 0., 0., 0.));
        }
    }
    #[test]
    fn compressed_compact_reverses_without_a_surface_or_velocity_jump() {
        for interval in [1, 4, 16, 33] {
            for reverse_at in [320, 360, 420, 500] {
                let mut m = Motion::new(0);
                m.tick(0, true, true);
                m.tick(0, false, false);
                for now in (0..=reverse_at).step_by(interval) {
                    m.tick(now, false, false);
                }
                m.tick(reverse_at, false, false);
                assert!(m.x < 0.);
                let surface = m.geometry().surface;
                let velocity = 140. * m.v + m.extra_v;
                m.tick(reverse_at, true, false);
                assert!((m.geometry().surface - surface).abs() < 0.0001);
                assert!((140. * m.v + m.extra_v - velocity).abs() < 0.0001);
                assert_eq!(m.geometry().native, 80.);
                for now in (reverse_at..=reverse_at + 1000).step_by(interval) {
                    m.tick(now, true, false);
                    assert!((57. ..=200.).contains(&m.geometry().surface));
                    assert!((80. ..=228.).contains(&m.geometry().native));
                        }
                assert_eq!(m.geometry().surface, 200.);
                assert!(!m.moving());
            }
        }
    }
    #[test]
    fn chosen_reduced_motion_finishes_current_direction_without_replay() {
        for expand in [true, false] {
            let mut m = Motion::new(0);
            if !expand {
                m.tick(0, true, true);
            }
            m.tick(0, expand, false);
            let at = 160;
            run(&mut m, 1, at, expand);
            assert!(m.moving());
            m.tick(at, expand, true);
            assert_eq!(m.extra, 0.);
            assert_eq!(m.extra_v, 0.);
            assert!(!m.moving());
            run(&mut m, at + 1, 800, expand);
            assert_eq!(m.extra, 0.);
            assert_eq!(m.geometry().radius, if expand { 20. } else { 30. });
        }
        for reverse in [false, true] {
            let mut m = Motion::new(0);
            m.tick(0, true, true);
            m.tick(0, false, false);
            run(&mut m, 1, 360, false);
            assert!(m.geometry().surface < 59.);
            if reverse {
                m.tick(360, true, false);
                assert!(m.recover);
            }
            m.tick(360, reverse, true);
            run(&mut m, 361, 1400, reverse);
            assert_eq!(m.geometry().surface, if reverse { 200. } else { 60. });
            assert_eq!((m.extra, m.extra_v), (0., 0.));
            assert!(!m.moving());
        }
    }
    fn run(m: &mut Motion, start: u64, end: u64, target: bool) {
        for t in (start..=end).step_by(1) {
            m.tick(t, target, false);
        }
    }
}
