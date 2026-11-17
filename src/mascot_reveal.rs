//! One local entrance; Full immediately retires it without changing window geometry.
pub const ENTER_MS: f64 = 480.;
pub const COMPACT_TAIL: f32 = 0.04;

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
    /// Reach below the moving sill; zero means both paws have gripped it.
    pub paws_y: f32,
    pub idle_weight: f32,
    pub head_alpha: f32,
}

pub fn scene(progress: f64) -> Scene {
    let t = (progress.clamp(0., 1.) * ENTER_MS) as f32;
    // The paws grip at 88ms, bear the load, then pull the hidden head up.
    let head_y = if t < 128. { 26. }
        else if t < 365. { 26. - 27.2 * ease_out((t - 128.) / 237.) }
        else { -1.2 * (1. - smooth((t - 365.) / 115.)) };
    Scene {
        perch_y: 24. * (1. - ease_out(t / 145.)),
        head_y,
        paws_y: 10. * (1. - smooth((t - 12.) / 76.)),
        idle_weight: smooth((t - 405.) / 75.),
        head_alpha: smooth((t - 128.) / 24.),
    }
}
fn smooth(t: f32) -> f32 { let t = t.clamp(0., 1.); t * t * (3. - 2. * t) }
fn ease_out(t: f32) -> f32 { 1. - (1. - t.clamp(0., 1.)).powi(3) }

pub struct Reveal {
    pub progress: f64,
    last: Option<u64>,
    latched: bool,
}
impl Default for Reveal {
    fn default() -> Self { Self { progress: 1., last: None, latched: true } }
}
impl Reveal {
    /// Startup Compact keeps the accepted resting pose. Full retires the performance.
    pub fn sample(&mut self, now: u64, full: bool, fullness: f32, visible: bool, reduced: bool) -> Option<u64> {
        if full {
            self.progress = 0.;
            self.last = None;
            self.latched = false;
            return None;
        }
        if reduced {
            self.progress = if fullness > COMPACT_TAIL { 0. } else { 1. };
            self.latched = self.progress == 1.;
            self.last = None;
            return None;
        }
        if !visible {
            self.last = None;
            return None;
        }
        if let Some(last) = self.last {
            let elapsed = now.saturating_sub(last) as f64;
            if self.latched { self.progress = (self.progress + elapsed / ENTER_MS).min(1.); }
        }
        self.last = Some(now);
        if !self.latched && fullness <= COMPACT_TAIL {
            // Latch once: the Compact spring may cross this point again while landing.
            self.latched = true;
        }
        (self.latched && self.progress < 1.).then_some(16)
    }
    pub fn idle_ready(&self) -> bool { self.progress == 1. }
    pub fn alpha(&self) -> f32 { if self.progress > 0. { 1. } else { 0. } }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn from_full() -> Reveal {
        let mut r = Reveal::default(); r.sample(0, true, 1., true, false); r
    }
    #[test]
    fn main_window_travel_precedes_one_latched_fast_entrance() {
        let mut r = from_full();
        for (t, fullness) in [(0, 1.), (100, 0.7), (200, 0.2), (300, 0.05)] {
            assert_eq!(r.sample(t, false, fullness, true, false), None);
            assert_eq!(r.progress, 0.);
            assert_eq!(r.alpha(), 0.);
        }
        assert_eq!(r.sample(320, false, COMPACT_TAIL, true, false), Some(16));
        assert_eq!(r.progress, 0.);
        for t in [336, 352, 368] { r.sample(t, false, 0.06, true, false); }
        assert!(r.progress > 0.09); // A rebound neither restarts nor hides the entrance.
        r.sample(799, false, 0., true, false);
        assert!(r.progress < 1.);
        assert_eq!(r.sample(800, false, 0., true, false), None);
        assert_eq!(r.progress, 1.); assert!(r.idle_ready());
        assert_eq!(r.alpha(), 1.);
        assert_eq!(r.sample(2000, false, 0., true, false), None);
    }
    #[test]
    fn full_target_clears_partial_and_complete_poses_and_reentry_starts_fresh() {
        for elapsed in [240, 480] {
            let mut r = from_full();
            r.sample(0, false, 0., true, false);
            r.sample(elapsed, false, 0., true, false);
            assert!(r.progress > 0.);
            assert_eq!(r.alpha(), 1.);
            assert_eq!(r.sample(elapsed, true, 0., true, false), None);
            assert_eq!(r.progress, 0.);
            assert_eq!(r.alpha(), 0.);
            assert_eq!(r.last, None);
            assert!(!r.latched && !r.idle_ready());
            assert_eq!(r.sample(elapsed + 1, false, 0.5, true, false), None);
            assert_eq!(r.progress, 0.);
            assert_eq!(r.sample(elapsed + 2, false, COMPACT_TAIL, true, false), Some(16));
            assert_eq!(r.progress, 0.);
            r.sample(elapsed + 18, false, 0.06, true, false);
            assert!(r.progress > 0. && r.progress < 0.04);
        }
    }
    #[test]
    fn full_target_clears_waiting_and_hidden_or_reduced_states_without_waking() {
        for visible in [false, true] {
            for reduced in [false, true] {
                let mut r = Reveal::default();
                r.sample(0, false, 0., true, false);
                assert_eq!(r.sample(100, true, 0., visible, reduced), None);
                assert_eq!(r.progress, 0.);
                assert_eq!(r.alpha(), 0.);
                assert_eq!(r.last, None);
                assert!(!r.latched);
                assert_eq!(r.sample(200, false, 0.2, true, false), None);
                assert_eq!(r.sample(201, true, 0.2, visible, reduced), None);
                assert_eq!(r.last, None);
                assert_eq!(r.progress, 0.);
            }
        }
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
        assert_eq!(r.sample(10003, true, 0., false, true), None);
        assert_eq!(r.progress, 0.); assert!(!r.idle_ready());
    }
    #[test]
    fn grip_load_pull_and_settle_preserve_the_approved_rest() {
        let reach = scene(48. / ENTER_MS);
        assert!(reach.perch_y > 3. && reach.paws_y < 8.);
        assert_eq!((reach.head_y, reach.head_alpha), (26., 0.));
        let loaded = scene(112. / ENTER_MS);
        assert_eq!((loaded.paws_y, loaded.head_y, loaded.head_alpha), (0., 26., 0.));
        assert!(scene(240. / ENTER_MS).head_y < scene(160. / ENTER_MS).head_y);
        assert!(scene(365. / ENTER_MS).head_y < 0.);
        assert_eq!(scene(1.), Scene { perch_y: 0., head_y: -0., paws_y: 0., idle_weight: 1., head_alpha: 1. });
        assert_eq!(local_side(140.), 60.);
        assert_eq!(local_side(57.), 57.);
    }
}
