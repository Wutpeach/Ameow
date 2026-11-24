//! Small, visible-time-only idle performance for the Compact mascot.

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Pose {
    /// 0 is open; 1 is fully closed.
    pub blink: f32,
    /// Offsets in the 60 px artwork coordinate space.
    pub gaze: [f32; 2],
    pub head: [f32; 2],
    /// Head tilt in radians around the resting lower edge.
    pub head_tilt: f32,
    /// Ear rotations in radians.
    pub ears: [f32; 2],
}

#[derive(Clone, Copy)]
struct Act { start: u64, direction: f32 }

pub struct Idle {
    rng: u64,
    visible_time: u64,
    last_wall_time: Option<u64>,
    last_pose: Pose,
    blink_due: u64,
    look_due: u64,
    ear_due: u64,
    blink: Option<Act>,
    look: Option<Act>,
    ear: Option<Act>,
    was_reduced: bool,
}

impl Idle {
    pub fn new(seed: u64) -> Self {
        let mut idle = Self {
            rng: seed, visible_time: 0, last_wall_time: None, last_pose: Pose::default(),
            blink_due: 0, look_due: 0, ear_due: 0, blink: None, look: None, ear: None,
            was_reduced: false,
        };
        idle.schedule_initial();
        idle
    }

    fn random(&mut self, min: u64, max: u64) -> u64 {
        // SplitMix64 also produces useful variation for a zero seed.
        self.rng = self.rng.wrapping_add(0x9e3779b97f4a7c15);
        let mut z = self.rng;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
        min + (z ^ (z >> 31)) % (max - min + 1)
    }

    fn schedule_initial(&mut self) {
        self.blink_due = self.visible_time + self.random(1_000, 3_000);
        self.look_due = self.visible_time + self.random(14_000, 22_000);
        self.ear_due = self.visible_time + self.random(18_000, 30_000);
    }

    /// Advances only while visible. Hidden callers must sample once when visibility changes.
    /// The returned delay is a timer while resting and a frame request during an act.
    pub fn sample(&mut self, now_ms: u64, visible: bool, reduced: bool) -> (Pose, Option<u64>) {
        if reduced {
            if !self.was_reduced {
                self.blink = None; self.look = None; self.ear = None;
                self.last_pose = Pose::default();
                self.schedule_initial();
            }
            self.was_reduced = true;
            self.last_wall_time = None;
            return (self.last_pose, None);
        }
        self.was_reduced = false;
        if !visible {
            self.last_wall_time = None;
            return (self.last_pose, None);
        }
        if let Some(last) = self.last_wall_time {
            self.visible_time = self.visible_time.saturating_add(now_ms.saturating_sub(last));
        }
        self.last_wall_time = Some(now_ms);
        let now = self.visible_time;

        if self.blink.is_some_and(|act| now.saturating_sub(act.start) >= 360) {
            self.blink = None;
            self.blink_due = now + self.random(4_000, 8_000);
        }
        if self.look.is_some_and(|act| now.saturating_sub(act.start) >= 3_000) {
            self.look = None;
            self.look_due = now + self.random(14_000, 28_000);
        }
        if self.ear.is_some_and(|act| now.saturating_sub(act.start) >= 560) {
            self.ear = None;
            self.ear_due = now + self.random(18_000, 35_000);
        }
        if self.blink.is_none() && self.look.is_none() && self.ear.is_none() && now >= self.blink_due {
            self.blink = Some(Act { start: now, direction: 1. });
        }
        if self.blink.is_none() && self.look.is_none() && self.ear.is_none() && now >= self.look_due {
            let direction = if self.random(0, 1) == 0 { -1. } else { 1. };
            self.look = Some(Act { start: now, direction });
            self.ear_due = self.ear_due.max(now + 4_000);
        }
        if self.blink.is_none() && self.look.is_none() && self.ear.is_none() && now >= self.ear_due {
            let direction = if self.random(0, 1) == 0 { -1. } else { 1. };
            self.ear = Some(Act { start: now, direction });
            self.look_due = self.look_due.max(now + 1_560);
        }

        let mut pose = Pose::default();
        if let Some(act) = self.blink {
            let t = now.saturating_sub(act.start);
            pose.blink = pulse(t, 0, 115, 155, 360);
        }
        if let Some(act) = self.look {
            let t = now.saturating_sub(act.start);
            let eye = pulse(t, 0, 320, 1_950, 2_500);
            let head = pulse(t, 650, 1_150, 2_200, 3_000);
            pose.gaze = [act.direction * 0.6 * eye, -0.12 * eye];
            pose.head = [act.direction * 0.3 * head, -0.06 * head];
            pose.head_tilt = act.direction * 0.075 * head;
        }
        if let Some(act) = self.ear {
            let t = now.saturating_sub(act.start);
            let first = pulse(t, 0, 120, 170, 390);
            let second = pulse(t, 110, 230, 280, 560);
            if act.direction > 0. { pose.ears = [0.14 * first, -0.045 * second]; }
            else { pose.ears = [0.045 * second, -0.14 * first]; }
        }
        self.last_pose = pose;
        let moving = self.blink.is_some() || self.look.is_some() || self.ear.is_some();
        let delay = if moving { 16 } else {
            self.blink_due.min(self.look_due).min(self.ear_due).saturating_sub(now).max(1)
        };
        (pose, Some(delay))
    }
}

fn smooth(t: f32) -> f32 {
    let t = t.clamp(0., 1.);
    t * t * (3. - 2. * t)
}

fn pulse(t: u64, start: u64, up: u64, down: u64, end: u64) -> f32 {
    if t < start || t >= end { 0. }
    else if t < up { smooth((t - start) as f32 / (up - start) as f32) }
    else if t < down { 1. }
    else { 1. - smooth((t - down) as f32 / (end - down) as f32) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blinking_is_bounded_closed_and_returns_to_rest_with_quiet_intervals() {
        let mut idle = Idle::new(0);
        let mut starts = Vec::new();
        let mut previous = 0.;
        let mut peak: f32 = 0.;
        for t in (0..60_000).step_by(10) {
            let (p, _) = idle.sample(t, true, false);
            assert!((0. ..=1.).contains(&p.blink));
            if previous == 0. && p.blink > 0. { starts.push(t); }
            previous = p.blink;
            peak = peak.max(p.blink);
            assert!(p.gaze[0].abs() <= 0.6 && p.gaze[1].abs() <= 0.6);
            assert!(p.head[0].abs() <= 0.3 && p.head[1].abs() <= 0.3);
            assert!(p.head_tilt.abs() <= 0.075);
            assert!(p.ears.iter().all(|x| x.abs() <= 0.14));
        }
        assert_eq!(peak, 1.);
        assert!(starts.len() >= 4 && starts.len() <= 15);
        assert!(starts.windows(2).all(|w| w[1] - w[0] >= 4_000));
        assert_eq!(pulse(360, 0, 115, 155, 360), 0.);
    }

    #[test]
    fn hidden_freezes_last_visible_pose_and_resumes_without_a_jump() {
        let mut idle = Idle::new(4);
        idle.sample(0, true, false);
        idle.sample(3_000, true, false);
        let (before, _) = idle.sample(3_050, true, false);
        assert!(before.blink > 0.);
        assert_eq!(idle.sample(3_060, false, false), (before, None));
        assert_eq!(idle.sample(99_000, false, false), (before, None));
        assert_eq!(idle.sample(100_000, true, false).0, before);
        assert!(idle.sample(100_020, true, false).0.blink > before.blink);
    }

    #[test]
    fn reduced_motion_returns_rest_without_waking_and_reschedules_afterward() {
        let mut idle = Idle::new(3);
        idle.sample(0, true, false);
        idle.sample(3_000, true, false);
        assert!(idle.sample(3_050, true, false).0.blink > 0.);
        assert_eq!(idle.sample(3_060, true, true), (Pose::default(), None));
        assert_eq!(idle.sample(30_000, true, true), (Pose::default(), None));
        let (pose, delay) = idle.sample(50_000, true, false);
        assert_eq!(pose, Pose::default());
        assert!((1_000..=3_000).contains(&delay.unwrap()));
    }

    #[test]
    fn ear_and_look_do_not_overlap_and_resume_after_hidden_or_reduced() {
        let mut idle = Idle::new(7);
        idle.sample(0, true, false);
        idle.blink_due = u64::MAX;
        idle.look_due = 100;
        idle.ear_due = 100;
        idle.sample(100, true, false);
        let peak = idle.sample(1_300, true, false).0;
        assert!(peak.head_tilt.abs() > 0.07);
        assert_eq!(peak.ears, [0., 0.]);
        assert_eq!(idle.sample(1_310, false, false), (peak, None));
        assert_eq!(idle.sample(20_000, true, false).0, peak);
        assert_eq!(idle.sample(20_010, true, true), (Pose::default(), None));

        let mut idle = Idle::new(7);
        idle.sample(0, true, false);
        idle.blink_due = u64::MAX;
        idle.look_due = u64::MAX;
        idle.ear_due = 100;
        idle.sample(100, true, false);
        let first = idle.sample(200, true, false).0;
        assert!(first.ears.iter().any(|v| v.abs() > 0.1));
        assert!(first.ears.iter().any(|v| *v == 0.));
        let later = idle.sample(340, true, false).0;
        assert!(later.ears.iter().all(|v| v.abs() > 0.));
        assert_eq!(idle.sample(660, true, false).0, Pose::default());
    }

    #[test]
    fn look_moves_eyes_first_then_head_and_settles() {
        let mut idle = Idle::new(1);
        idle.sample(0, true, false);
        idle.blink_due = u64::MAX;
        idle.ear_due = u64::MAX;
        idle.sample(25_000, true, false);
        let early = idle.sample(25_160, true, false).0;
        assert!(early.gaze[0].abs() > 0. && early.head == [0., 0.] && early.head_tilt == 0.);
        let following = idle.sample(25_900, true, false).0;
        assert!(following.gaze[0].abs() > 0. && following.head[0].abs() > 0. && following.head_tilt.abs() > 0.);
        let settled = idle.sample(28_000, true, false).0;
        assert_eq!(settled.gaze, [0., 0.]);
        assert_eq!(settled.head, [0., 0.]);
        assert_eq!(settled.head_tilt, 0.);
    }
}
