//! One reversible local performance; window geometry remains with its existing owner.
pub const ENTER_MS: f64 = 720.;
pub const EXIT_MS: f64 = 160.;
pub const COMPACT_TAIL: f32 = 0.04;

pub fn alpha(fullness: f32) -> f32 {
    ((1. - fullness) / 0.8).clamp(0., 1.)
}

pub fn local_side(surface: f32) -> f32 {
    surface.min(60.)
}

pub fn local_origin(native: f32, surface: f32) -> f32 {
    (native - surface) * 0.5
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Scene {
    pub perch_y: f32,
    pub head_y: f32,
    pub paws_y: f32,
    pub idle_weight: f32,
    pub head_alpha: f32,
}

pub fn scene(progress: f64) -> Scene {
    let t = (progress.clamp(0., 1.) * ENTER_MS) as f32;
    let head_y = if t < 350. { 26. - 21. * smooth((t - 140.) / 210.) }
        else if t < 410. { 5. }
        else if t < 610. { 5. - 6.2 * smooth((t - 410.) / 200.) }
        else { -1.2 * (1. - smooth((t - 610.) / 110.)) };
    Scene {
        perch_y: 24. * (1. - ease_out(t / 230.)),
        head_y,
        paws_y: 10. * (1. - smooth((t - 480.) / 180.)),
        idle_weight: smooth((t - 610.) / 110.),
        head_alpha: smooth((t - 120.) / 20.),
    }
}
fn smooth(t: f32) -> f32 { let t = t.clamp(0., 1.); t * t * (3. - 2. * t) }
fn ease_out(t: f32) -> f32 { 1. - (1. - t.clamp(0., 1.)).powi(3) }

pub struct Reveal {
    pub progress: f64,
    last: Option<u64>,
    full: bool,
    latched: bool,
}
impl Default for Reveal {
    fn default() -> Self { Self { progress: 1., last: None, full: false, latched: true } }
}
impl Reveal {
    /// Startup Compact keeps the accepted resting pose. Full retires the performance.
    pub fn sample(&mut self, now: u64, full: bool, fullness: f32, visible: bool, reduced: bool) -> Option<u64> {
        if reduced {
            self.progress = if full || fullness > COMPACT_TAIL { 0. } else { 1. };
            self.full = full;
            self.latched = !full && self.progress == 1.;
            self.last = None;
            return None;
        }
        if !visible {
            self.last = None;
            self.full = full;
            if full { self.latched = false; }
            if full && fullness >= 0.999 { self.progress = 0.; }
            return None;
        }
        if let Some(last) = self.last {
            let elapsed = now.saturating_sub(last) as f64;
            if self.full { self.progress = (self.progress - elapsed / EXIT_MS).max(0.); }
            else if self.latched { self.progress = (self.progress + elapsed / ENTER_MS).min(1.); }
        }
        self.last = Some(now);
        self.full = full;
        if full {
            self.latched = false;
            if fullness >= 0.999 { self.progress = 0.; }
        } else if !self.latched && (fullness <= COMPACT_TAIL || self.progress > 0.) {
            // Latch once: the Compact spring may cross this point again while landing.
            self.latched = true;
        }
        ((full && self.progress > 0.) || (!full && self.latched && self.progress < 1.)).then_some(16)
    }
    pub fn idle_ready(&self) -> bool { !self.full && self.progress == 1. }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn from_full() -> Reveal {
        let mut r = Reveal::default(); r.sample(0, true, 1., true, false); r
    }
    #[test]
    fn main_window_travel_precedes_one_latched_entrance() {
        let mut r = from_full();
        for (t, fullness) in [(0, 1.), (100, 0.7), (200, 0.2), (300, 0.05)] {
            assert_eq!(r.sample(t, false, fullness, true, false), None);
            assert_eq!(r.progress, 0.);
        }
        assert_eq!(r.sample(320, false, COMPACT_TAIL, true, false), Some(16));
        assert_eq!(r.progress, 0.);
        for t in [336, 352, 368] { r.sample(t, false, 0.06, true, false); }
        assert!(r.progress > 0.06); // A rebound above the threshold neither restarts nor reverses.
        r.sample(1040, false, 0., true, false);
        assert_eq!(r.progress, 1.); assert!(r.idle_ready());
        assert_eq!(r.sample(2000, false, 0., true, false), None);
        let mut cancelled = from_full();
        cancelled.sample(200, false, 0.08, true, false);
        assert_eq!(cancelled.sample(201, true, 0.08, true, false), None);
        assert_eq!(cancelled.progress, 0.);
    }
    #[test]
    fn reversal_keeps_the_current_pose_and_only_traverses_visible_distance() {
        let mut r = from_full();
        r.sample(0, false, 0., true, false);
        r.sample(360, false, 0., true, false);
        let halfway = scene(r.progress);
        r.sample(360, true, 0., true, false);
        assert_eq!(scene(r.progress), halfway);
        r.sample(400, true, 0.1, true, false);
        assert!((r.progress - 0.25).abs() < 1e-9);
        let reversing = scene(r.progress);
        r.sample(400, false, 0.1, true, false);
        assert_eq!(scene(r.progress), reversing);
        r.sample(940, false, 0., true, false);
        assert_eq!(r.progress, 1.);
        r.sample(940, true, 0., true, false);
        assert_eq!(r.sample(1100, true, 0.9, true, false), None);
        assert_eq!(r.progress, 0.);
    }
    #[test]
    fn hidden_time_freezes_and_reduced_motion_has_no_wake() {
        let mut r = from_full();
        r.sample(0, false, 0., true, false);
        r.sample(240, false, 0., true, false);
        let before = r.progress;
        assert_eq!(r.sample(250, false, 0., false, false), None);
        assert_eq!(r.sample(10000, false, 0., false, false), None);
        r.sample(10001, false, 0., true, false);
        assert_eq!(r.progress, before);
        assert_eq!(r.sample(10002, false, 0., true, true), None);
        assert_eq!(r.progress, 1.);
        assert_eq!(r.sample(10003, true, 1., true, true), None);
        assert_eq!(r.progress, 0.); assert!(!r.idle_ready());
    }
    #[test]
    fn stage_order_and_rest_match_the_approved_pose() {
        let early = scene(120. / ENTER_MS);
        assert!(early.perch_y < 3.); assert_eq!(early.head_y, 26.);
        assert_eq!(scene(360. / ENTER_MS).head_y, scene(400. / ENTER_MS).head_y);
        assert!(scene(610. / ENTER_MS).head_y < 0.);
        assert_eq!(scene(1.), Scene { perch_y: 0., head_y: -0., paws_y: 0., idle_weight: 1., head_alpha: 1. });
        assert_eq!(local_side(140.), 60.);
        assert_eq!(local_side(57.), 57.);
        assert_eq!(alpha(1.), 0.);
        assert!(alpha(0.3) > 0.8); // Early expansion must leave time to read the reverse act.
    }
}
