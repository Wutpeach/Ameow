//! Local presentation only. All timestamps are supplied, making ownership and motion testable.
pub const LEAVE_MS: u64 = 80;
pub const PROGRESS_MS: u64 = 220;
pub const ROTATION_MS: u64 = 1250;
use crate::repair_motion::{Candidate, Motion};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Stage {
    Idle,
    Resolving,
    Downloading,
    Transcoding,
    Success,
    Failure,
    Partial,
    Cancelled,
}
impl Stage {
    pub fn active(self) -> bool {
        matches!(
            self,
            Self::Resolving | Self::Downloading | Self::Transcoding
        )
    }
    pub fn terminal(self) -> bool {
        matches!(self, Self::Success | Self::Failure | Self::Partial | Self::Cancelled)
    }
    pub fn retention(self) -> u64 {
        if matches!(self, Self::Failure | Self::Partial) { 5000 } else { 1500 }
    }
    pub fn name(self) -> &'static str {
        match self {
            Self::Idle => "待机",
            Self::Resolving => "解析中",
            Self::Downloading => "下载中",
            Self::Transcoding => "转码中 · 0:24",
            Self::Success => "下载完成",
            Self::Failure => "下载失败",
            Self::Partial => "部分完成",
            Self::Cancelled => "已取消",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Geometry {
    pub surface: f32,
    pub gutter: f32,
    pub radius: f32,
    pub native: f32,
}
impl Geometry {
    pub fn at(fullness: f32) -> Self {
        let x = fullness.clamp(0., 1.);
        let surface = 60. + 140. * x;
        let gutter = 10. + 4. * x;
        Self {
            surface,
            gutter,
            radius: 30. - 10. * x,
            native: surface + 2. * gutter,
        }
    }
    pub fn origin(self, anchor: [f32; 2]) -> [f32; 2] {
        [anchor[0] - self.gutter, anchor[1] - self.gutter]
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Locks {
    pub drag: bool,
    pub menu: bool,
    pub drop: bool,
}
#[derive(Clone, Copy, Debug)]
struct Deadline {
    at: u64,
    epoch: u64,
}

#[derive(Clone, Copy, Debug)]
pub struct Progress {
    from: f32,
    pub target: f32,
    start: u64,
}
impl Progress {
    pub fn new(value: f32, now: u64) -> Self {
        let value = if value.is_finite() {
            value.clamp(0., 1.)
        } else {
            0.
        };
        Self {
            from: value,
            target: value,
            start: now,
        }
    }
    pub fn sample(self, now: u64) -> f32 {
        let t = (now.saturating_sub(self.start) as f32 / PROGRESS_MS as f32).clamp(0., 1.);
        self.from + (self.target - self.from) * (1. - (1. - t).powi(3))
    }
    pub fn update(&mut self, value: f32, now: u64) {
        if !value.is_finite() {
            return;
        }
        let value = value.clamp(0., 1.).max(self.target);
        self.retarget(value, now);
    }
    /// Optional measured facts can correct an estimate in either direction.
    /// The standard update path remains monotonic for existing lifecycle animation.
    pub fn retarget(&mut self, value: f32, now: u64) {
        if value.is_finite() && value.clamp(0., 1.) != self.target {
            self.from = self.sample(now);
            self.target = value.clamp(0., 1.);
            self.start = now;
        }
    }
    pub fn moving(self, now: u64) -> bool {
        now < self.start + PROGRESS_MS && self.from != self.target
    }
}

pub struct Model {
    pub stage: Stage,
    pub previous: Stage,
    pub pointer: bool,
    pub locks: Locks,
    pub fullness: f32,
    pub velocity: f32,
    pub target_full: bool,
    pub reduced: bool,
    pub progress: Progress,
    pub previous_progress: f32,
    pub stage_at: u64,
    pub epoch: u64,
    collapse: Option<Deadline>,
    terminal: Option<Deadline>,
    pending_transcode: Option<(Deadline, f32)>,
    pub blue_trace_at: Option<u64>,
    last_tick: u64,
    pub window_motion: Motion,
    manual_compact: bool,
    compact_left: bool,
}
impl Model {
    pub fn new(now: u64, reduced: bool) -> Self {
        Self {
            stage: Stage::Idle,
            previous: Stage::Idle,
            pointer: false,
            locks: Locks::default(),
            fullness: 0.,
            velocity: 0.,
            target_full: false,
            reduced,
            progress: Progress::new(0., now),
            previous_progress: 0.,
            stage_at: now,
            epoch: 0,
            collapse: None,
            terminal: None,
            pending_transcode: None,
            blue_trace_at: None,
            last_tick: now,
            window_motion: Motion::new(Candidate::default(), false, now),
            manual_compact: false,
            compact_left: false,
        }
    }
    pub fn blocked(&self) -> bool {
        self.locks.drag
            || self.locks.menu
            || self.locks.drop
            || (!self.manual_compact
                && (self.stage.active()
                    || self.terminal.is_some()
                    || self.pending_transcode.is_some()))
    }
    /// Explicit Compact affects presentation only. A real leave/re-entry retires the override.
    pub fn request_compact(&mut self, now: u64) {
        self.manual_compact = true;
        self.compact_left = !self.pointer;
        self.collapse = None;
        self.set_target(false, now);
    }
    /// Transfer at the input/deadline timestamp; previous idle time belongs to the old target.
    pub fn set_target(&mut self, full: bool, now: u64) {
        if self.target_full == full {
            return;
        }
        if self.window_motion.candidate != Candidate::Baseline {
            self.window_motion.tick(now, self.target_full, self.reduced);
            self.window_motion.tick(now, full, self.reduced);
            self.fullness = self.window_motion.x;
            self.velocity = self.window_motion.v;
        }
        self.target_full = full;
    }
    pub fn set_reduced(&mut self, reduced: bool, now: u64) {
        if self.window_motion.candidate != Candidate::Baseline {
            // Process due ownership under the old preference, then snap to the current owner.
            self.tick(now);
            self.window_motion.tick(now, self.target_full, self.reduced);
            self.window_motion.tick(now, self.target_full, reduced);
            self.fullness = self.window_motion.x;
            self.velocity = self.window_motion.v;
        }
        self.reduced = reduced;
    }
    fn schedule_leave(&mut self, now: u64) {
        if !self.pointer && !self.blocked() && self.target_full {
            self.collapse = Some(Deadline {
                at: now + LEAVE_MS,
                epoch: self.epoch,
            });
        }
    }
    pub fn pointer(&mut self, inside: bool, now: u64) {
        if self.manual_compact && !inside {
            self.compact_left = true;
        } else if self.manual_compact && inside && self.compact_left {
            self.manual_compact = false;
            self.compact_left = false;
        }
        if inside == self.pointer {
            return;
        }
        self.pointer = inside;
        self.epoch += 1;
        // Deadlines belong to their own purpose; pointer events must not invalidate task retention.
        if let Some(t) = &mut self.terminal {
            t.epoch = self.epoch;
        }
        if let Some((t, _)) = &mut self.pending_transcode {
            t.epoch = self.epoch;
        }
        if inside {
            self.set_target(true, now);
            self.collapse = None;
        } else if !self.blocked()
            && self.target_full
            && (self.fullness < 1.
                || (self.window_motion.candidate != Candidate::Baseline
                    && self.window_motion.moving()))
        {
            // In-flight reversal has no settled-Full leave grace and preserves velocity.
            self.set_target(false, now);
            self.collapse = None;
        } else {
            self.schedule_leave(now);
        }
    }
    pub fn locks_changed(&mut self, now: u64) {
        if self.blocked() {
            self.collapse = None;
            self.set_target(true, now);
        } else {
            self.schedule_leave(now);
        }
    }
    pub fn state(&mut self, stage: Stage, percent: f32, now: u64) {
        if stage == Stage::Transcoding
            && let Some((_, pending)) = &mut self.pending_transcode
        {
            if percent.is_finite() {
                *pending = pending.max(percent.clamp(0., 1.));
            }
            return;
        }
        if self.stage == stage && stage.active() {
            self.progress.update(percent, now);
            return;
        }
        self.epoch += 1;
        self.collapse = None;
        self.terminal = None;
        self.previous = self.stage;
        self.previous_progress = self.progress.sample(now);
        self.pending_transcode = None;
        self.blue_trace_at = None;
        if stage == Stage::Transcoding && self.stage == Stage::Downloading && !self.reduced {
            self.progress.update(1., now);
            self.pending_transcode = Some((
                Deadline {
                    at: now + PROGRESS_MS + 100,
                    epoch: self.epoch,
                },
                percent,
            ));
            self.set_target(true, now);
            return;
        }
        self.stage = stage;
        self.stage_at = now;
        if stage.active() {
            if !self.manual_compact {
                self.set_target(true, now);
            }
            self.progress = Progress::new(percent.clamp(0., 1.), now);
        }
        if stage.terminal() {
            if !self.manual_compact {
                self.set_target(true, now);
            }
            self.terminal = Some(Deadline {
                at: now + stage.retention(),
                epoch: self.epoch,
            });
            if stage == Stage::Success {
                self.progress.update(1., now);
            }
        }
        if stage == Stage::Idle {
            self.progress = Progress::new(0., now);
            self.schedule_leave(now);
        }
    }
    pub fn tick(&mut self, now: u64) {
        if let Some((deadline, percent)) = self.pending_transcode
            && now >= deadline.at
            && deadline.epoch == self.epoch
        {
            self.pending_transcode = None;
            self.previous = Stage::Downloading;
            self.stage = Stage::Transcoding;
            self.stage_at = now;
            self.blue_trace_at = Some(now);
            self.progress = Progress::new(percent.clamp(0., 1.), now);
        }
        if let Some(deadline) = self.terminal
            && now >= deadline.at
            && deadline.epoch == self.epoch
        {
            self.terminal = None;
            // Retire terminal UI but retain Full while the pointer is inside.
            self.stage = Stage::Idle;
            self.stage_at = now;
            self.schedule_leave(now);
        }
        if let Some(deadline) = self.collapse
            && now >= deadline.at
        {
            self.collapse = None;
            if deadline.epoch == self.epoch && !self.pointer && !self.blocked() {
                self.set_target(false, deadline.at);
            }
        }
        if self.window_motion.candidate != Candidate::Baseline {
            self.window_motion.tick(now, self.target_full, self.reduced);
            self.fullness = self.window_motion.x;
            self.velocity = self.window_motion.v;
            self.last_tick = now;
            return;
        }
        let raw_dt = now.saturating_sub(self.last_tick) as f32 / 1000.;
        let mut dt = if self.window_motion.uncapped {
            raw_dt
        } else {
            raw_dt.min(0.05)
        };
        self.last_tick = now;
        let target = if self.target_full { 1. } else { 0. };
        if self.reduced {
            self.fullness = target;
            self.velocity = 0.;
            return;
        }
        // Near-critical spring, integrated in small steps. Reversal preserves current velocity.
        while dt > 0. {
            let step = dt.min(0.004);
            self.velocity += (520. * (target - self.fullness) - 42. * self.velocity) * step;
            self.fullness += self.velocity * step;
            dt -= step;
        }
        if (self.fullness - target).abs() < 0.0002 && self.velocity.abs() < 0.003 {
            self.fullness = target;
            self.velocity = 0.;
        }
    }
    pub fn geometry(&self) -> Geometry {
        if self.window_motion.candidate == Candidate::Baseline {
            Geometry::at(self.fullness)
        } else {
            self.window_motion.geometry()
        }
    }
    pub fn indeterminate_animation(&self, unknown: bool) -> bool {
        unknown && self.stage == Stage::Downloading && !self.reduced
    }
    /// One view-owned wakeup: animate only while visible motion is in flight.
    /// Determinate/reduced states sleep until native input or a deadline.
    pub fn next_wake_ms(&self, now: u64) -> Option<u64> {
        let target = if self.target_full { 1. } else { 0. };
        let changing = self.velocity != 0.
            || (self.window_motion.candidate != Candidate::Baseline && self.window_motion.moving())
            || self.fullness != target
            || self.locks.drag
            || self.locks.drop
            || (!self.reduced && self.progress.moving(now))
            || (!self.reduced
                && (self.stage == Stage::Resolving
                    || (self.stage != Stage::Idle && now < self.stage_at + 700)
                    || self.blue_trace(now) > 0.));
        if changing {
            return Some(16);
        }
        [
            self.collapse,
            self.terminal,
            self.pending_transcode.map(|p| p.0),
        ]
        .into_iter()
        .flatten()
        .map(|deadline| deadline.at.saturating_sub(now).max(1))
        .min()
    }
    pub fn blue_trace(&self, now: u64) -> f32 {
        self.blue_trace_at.map_or(0., |at| {
            (1. - now.saturating_sub(at) as f32 / 160.).clamp(0., 1.) * 0.24
        })
    }
    pub fn arc(&self, now: u64) -> (f32, f32) {
        let elapsed = now.saturating_sub(self.stage_at) as f32;
        match self.stage {
            Stage::Idle => (0., 0.),
            Stage::Resolving => (
                if self.reduced {
                    0.
                } else {
                    elapsed / ROTATION_MS as f32
                },
                0.72,
            ),
            Stage::Success => (
                0.,
                if self.reduced {
                    1.
                } else {
                    self.progress.sample(now)
                },
            ),
            Stage::Failure | Stage::Partial => (
                0.,
                if self.reduced {
                    1.
                } else {
                    self.previous_progress
                        + (1. - self.previous_progress) * ((elapsed - 70.) / 170.).clamp(0., 1.)
                },
            ),
            Stage::Cancelled => (0., 1.),
            _ => (
                0.,
                if self.reduced {
                    self.progress.target
                } else {
                    self.progress.sample(now)
                },
            ),
        }
    }
    pub fn symbol(&self, now: u64) -> f32 {
        if !self.stage.terminal() {
            return 0.;
        }
        if self.reduced {
            return 1.;
        }
        let delay = if self.stage == Stage::Success {
            PROGRESS_MS
        } else {
            100
        };
        (now.saturating_sub(self.stage_at + delay) as f32 / 180.).clamp(0., 1.)
    }
    pub fn label_mix(&self, now: u64) -> f32 {
        if self.reduced {
            return 1.;
        }
        let delay = if self.stage == Stage::Success { 50 } else { 0 };
        (now.saturating_sub(self.stage_at + delay) as f32 / 160.).clamp(0., 1.)
    }
}

/// Keep the actual native bounds, including its gutter, inside the work area.
pub fn reachable_anchor(anchor: [f32; 2], geometry: Geometry, work: [f32; 4]) -> [f32; 2] {
    let origin = geometry.origin(anchor);
    [
        origin[0].clamp(work[0], (work[2] - geometry.native).max(work[0])) + geometry.gutter,
        origin[1].clamp(work[1], (work[3] - geometry.native).max(work[1])) + geometry.gutter,
    ]
}

#[cfg(test)]
mod tests {
    #[test]
    fn unknown_downloading_keeps_rotating_after_initial_wake_window() {
        let mut model = super::Model::new(0, false);
        model.state(super::Stage::Downloading, 0., 0);
        for now in (0..=2000).step_by(16) { model.tick(now); }
        assert_eq!(model.next_wake_ms(2000), None);
        assert!(model.indeterminate_animation(true));
        assert!(!model.indeterminate_animation(false));
        model.set_reduced(true, 2000);
        assert!(!model.indeterminate_animation(true));
        model.state(super::Stage::Success, 1., 2000);
        assert!(!model.indeterminate_animation(true));
    }
    use super::*;
    #[test]
    fn explicit_compact_survives_menu_dismiss_and_job_updates_until_real_reentry() {
        let mut model = Model::new(0, true);
        model.pointer(true, 0);
        model.state(Stage::Downloading, 0., 1);
        model.tick(2);
        assert_eq!(model.fullness, 1.);
        model.request_compact(3);
        model.pointer(true, 4);
        model.state(Stage::Downloading, 0., 5);
        model.tick(6);
        assert_eq!((model.target_full, model.fullness), (false, 0.));
        model.state(Stage::Success, 1., 7);
        model.tick(8);
        assert_eq!(model.fullness, 0.);
        assert_eq!(model.stage, Stage::Success);
        model.pointer(false, 9);
        model.pointer(true, 10);
        model.tick(11);
        assert_eq!((model.target_full, model.fullness), (true, 1.));
    }
    #[test]
    fn reduced_toggle_after_due_leave_uses_compact_owner_without_replay() {
        let mut m = Model::new(0, false);
        m.pointer(true, 0);
        for now in (0..=600).step_by(4) {
            m.tick(now);
        }
        m.pointer(false, 600);
        m.tick(600);
        m.set_reduced(true, 730);
        assert!(!m.target_full);
        assert_eq!(
            (m.fullness, m.velocity, m.window_motion.extra),
            (0., 0., 0.)
        );
        m.set_reduced(false, 740);
        m.tick(760);
        assert_eq!(m.geometry().native, 80.);
        assert_eq!(m.window_motion.extra, 0.);
        assert_eq!(m.next_wake_ms(760), None);
    }
    #[test]
    fn chosen_default_starts_at_event_time_after_idle_and_leave_grace() {
        let mut m = Model::new(0, false);
        assert_eq!(m.window_motion.candidate, Candidate::Converged);
        m.tick(0);
        m.pointer(true, 722);
        m.tick(722);
        assert_eq!((m.fullness, m.velocity, m.geometry().native), (0., 0., 80.));
        m.tick(738);
        assert!(m.fullness > 0. && m.fullness < 0.1);
        for now in (754..=1500).step_by(16) {
            m.tick(now);
        }
        m.tick(1500);
        assert_eq!(m.fullness, 1.);
        assert_eq!(m.window_motion.extra, 0.);
        m.pointer(false, 2300);
        m.tick(2300);
        m.tick(2379);
        assert!(m.target_full);
        assert_eq!(m.geometry().native, 228.);
        m.tick(2380);
        assert!(!m.target_full);
        assert_eq!(
            (m.fullness, m.velocity, m.geometry().native),
            (1., 0., 228.)
        );
        m.tick(2396);
        assert!(m.fullness < 1. && m.fullness > 0.9);
    }
    #[test]
    fn input_time_precedes_render_and_deadline_time_excludes_leave_grace() {
        let mut m = Model::new(0, false);
        m.pointer(true, 500);
        assert_eq!((m.fullness, m.velocity), (0., 0.));
        m.tick(516);
        let mut expected = Motion::new(Candidate::Converged, false, 0);
        expected.tick(500, true, false);
        expected.tick(516, true, false);
        assert_eq!((m.fullness, m.velocity), (expected.x, expected.v));
        let mut m = Model::new(0, false);
        m.pointer(true, 10);
        m.tick(26);
        let mut expected = Motion::new(Candidate::Converged, false, 0);
        expected.tick(10, true, false);
        expected.tick(26, true, false);
        assert_eq!((m.fullness, m.velocity), (expected.x, expected.v));
        m.set_reduced(true, 100);
        m.set_reduced(false, 100);
        assert_eq!(m.fullness, 1.);
        m.pointer(false, 600);
        m.tick(600);
        m.tick(679);
        assert_eq!(m.geometry().native, 228.);
        m.tick(696);
        let mut expected = Motion::new(Candidate::Converged, false, 0);
        expected.tick(100, true, true);
        expected.tick(680, false, false);
        expected.tick(696, false, false);
        assert_eq!((m.fullness, m.velocity), (expected.x, expected.v));
    }
    #[test]
    fn task_and_lock_targets_take_ownership_at_their_input_time() {
        for use_lock in [false, true] {
            let mut m = Model::new(0, false);
            if use_lock {
                m.locks.menu = true;
                m.locks_changed(500);
            } else {
                m.state(Stage::Resolving, 0., 500);
            }
            assert_eq!(m.geometry().native, 80.);
            m.tick(516);
            assert!(m.fullness > 0. && m.fullness < 0.1);
            m.set_reduced(true, 517);
            assert_eq!(m.window_motion.extra, 0.);
            assert_eq!(m.fullness, 1.);
        }
    }
    #[test]
    fn explicit_historical_baseline_matches_frozen_r1_integration() {
        let mut m = Model::new(0, false);
        m.window_motion = Motion::new(Candidate::Baseline, false, 0);
        let (mut x, mut v, mut last) = (0f32, 0f32, 0u64);
        for now in [
            0, 16, 32, 48, 96, 112, 190, 206, 222, 300, 350, 400, 470, 550, 630, 710, 790, 870,
            950, 1030,
        ] {
            let target = if now < 350 || now >= 630 { 1. } else { 0. };
            m.target_full = target == 1.;
            m.tick(now);
            let mut dt = (now.saturating_sub(last) as f32 / 1000.).min(0.05);
            last = now;
            while dt > 0. {
                let h = dt.min(0.004);
                v += (520. * (target - x) - 42. * v) * h;
                x += v * h;
                dt -= h;
            }
            if (x - target).abs() < 0.0002 && v.abs() < 0.003 {
                x = target;
                v = 0.;
            }
            assert_eq!((m.fullness, m.velocity), (x, v));
            let actual = m.geometry();
            let expected = Geometry::at(x);
            assert_eq!(
                (actual.surface, actual.gutter, actual.native),
                (expected.surface, expected.gutter, expected.native)
            );
        }
    }
    #[test]
    fn geometry_shares_one_invariant_anchor() {
        let anchor = [514., 314.];
        for i in 0..=100 {
            let g = Geometry::at(i as f32 / 100.);
            let o = g.origin(anchor);
            assert!((o[0] + g.gutter - anchor[0]).abs() < 0.0001);
            assert_eq!(g.native, g.surface + 2. * g.gutter);
        }
        assert_eq!(Geometry::at(1.).origin(anchor), [500., 300.]);
        assert_eq!(Geometry::at(0.).origin(anchor), [504., 304.]);
        assert_eq!(Geometry::at(0.).native, 80.);
        assert_eq!(Geometry::at(1.).native, 228.);
    }
    #[test]
    fn leave_has_grace_and_reentry_reverses_without_waiting() {
        let mut m = Model::new(0, false);
        m.window_motion = Motion::new(Candidate::Baseline, false, 0);
        m.pointer(true, 0);
        for t in (0..600).step_by(4) {
            m.tick(t);
        }
        m.pointer(false, 600);
        m.tick(679);
        assert!(m.target_full);
        m.tick(700);
        assert!(!m.target_full);
        let before = m.fullness;
        m.pointer(true, 701);
        assert!(m.target_full);
        assert_eq!(before, m.fullness);
        for t in (704..1000).step_by(4) {
            m.tick(t);
        }
        assert!(m.fullness > before);
        m.tick(2000);
        assert!(m.target_full);
    }
    #[test]
    fn locks_and_new_tasks_cancel_old_collapse_and_terminal_deadlines() {
        for lock in 0..3 {
            let mut m = Model::new(0, true);
            m.pointer(true, 0);
            m.tick(1);
            m.pointer(false, 2);
            match lock {
                0 => m.locks.drag = true,
                1 => m.locks.menu = true,
                _ => m.locks.drop = true,
            };
            m.locks_changed(3);
            m.tick(500);
            assert_eq!(m.fullness, 1.);
            m.locks = Locks::default();
            m.locks_changed(501);
            m.tick(581);
            assert_eq!(m.fullness, 0.);
        }
        let mut m = Model::new(0, true);
        m.state(Stage::Failure, 0., 0);
        m.state(Stage::Resolving, 0., 10);
        m.tick(6000);
        assert_eq!(m.stage, Stage::Resolving);
        assert_eq!(m.fullness, 1.);
    }
    #[test]
    fn retention_expiry_with_pointer_inside_waits_for_real_leave() {
        for stage in [Stage::Success, Stage::Cancelled, Stage::Failure] {
            let mut m = Model::new(0, true);
            m.pointer(true, 0);
            m.state(stage, 0., 1);
            m.tick(stage.retention());
            assert_eq!(m.stage, stage);
            m.tick(stage.retention() + 2);
            assert_eq!(m.stage, Stage::Idle);
            assert_eq!(m.fullness, 1.);
            m.pointer(false, stage.retention() + 3);
            m.tick(stage.retention() + 82);
            assert_eq!(m.fullness, 1.);
            m.tick(stage.retention() + 83);
            assert_eq!(m.fullness, 0.);
        }
    }
    #[test]
    fn progress_is_monotonic_bounded_and_rejects_bad_updates() {
        let mut p = Progress::new(0., 0);
        p.update(0.6, 0);
        let mut last = 0.;
        for t in 0..221 {
            let v = p.sample(t);
            assert!(v >= last && v <= 0.6);
            last = v;
        }
        p.update(0.2, 300);
        p.update(f32::NAN, 300);
        assert_eq!(p.target, 0.6);
        p.update(2., 300);
        assert_eq!(p.target, 1.);
    }
    #[test]
    fn blue_closes_and_holds_before_orange_with_trace() {
        let mut m = Model::new(0, false);
        m.state(Stage::Downloading, 0.7, 0);
        m.state(Stage::Transcoding, 0.1, 10);
        m.tick(230);
        assert_eq!(m.stage, Stage::Downloading);
        assert_eq!(m.arc(230).1, 1.);
        m.tick(329);
        assert_eq!(m.stage, Stage::Downloading);
        m.tick(330);
        assert_eq!(m.stage, Stage::Transcoding);
        assert_eq!(m.arc(330).1, 0.1);
        assert!(m.blue_trace(330) > 0.);
        assert_eq!(m.blue_trace(490), 0.);
    }
    #[test]
    fn failure_freezes_before_outline_and_reduced_motion_is_static() {
        let mut m = Model::new(0, false);
        m.state(Stage::Downloading, 0.3, 0);
        m.state(Stage::Failure, 0., 10);
        assert_eq!(m.arc(70).1, 0.3);
        assert_eq!(m.arc(250).1, 1.);
        let mut r = Model::new(0, true);
        r.state(Stage::Resolving, 0., 0);
        r.tick(1);
        assert_eq!(r.fullness, 1.);
        assert_eq!(r.arc(100), r.arc(200));
        r.state(Stage::Success, 1., 300);
        assert_eq!(r.symbol(300), 1.);
    }
    #[test]
    fn compact_and_full_reachability_use_actual_native_size() {
        for x in [0., 1.] {
            let g = Geometry::at(x);
            let a = reachable_anchor([1950., 1090.], g, [0., 0., 1920., 1040.]);
            let o = g.origin(a);
            assert!(
                o[0] >= 0. && o[1] >= 0. && o[0] + g.native <= 1920. && o[1] + g.native <= 1040.
            );
        }
    }
    #[test]
    fn replacement_task_owns_phase_handoff_and_trace() {
        let mut m = Model::new(0, false);
        m.state(Stage::Downloading, 0.4, 0);
        m.state(Stage::Transcoding, 0.2, 10);
        m.state(Stage::Resolving, 0., 20);
        m.tick(1000);
        assert_eq!(m.stage, Stage::Resolving);
        assert_eq!(m.blue_trace(1000), 0.);
        m.state(Stage::Downloading, 1., 1010);
        m.state(Stage::Transcoding, 0., 1020);
        m.tick(1340);
        assert!(m.blue_trace(1340) > 0.);
        m.state(Stage::Resolving, 0., 1341);
        assert_eq!(m.blue_trace(1341), 0.);
    }
    #[test]
    fn retention_outside_keeps_lock_then_uses_leave_grace() {
        let mut m = Model::new(0, true);
        m.state(Stage::Failure, 0., 0);
        m.tick(4999);
        assert_eq!(m.fullness, 1.);
        m.tick(5000);
        assert_eq!(m.stage, Stage::Idle);
        assert_eq!(m.fullness, 1.);
        m.tick(5079);
        assert_eq!(m.fullness, 1.);
        m.tick(5080);
        assert_eq!(m.fullness, 0.);
    }
    #[test]
    fn progress_chase_keeps_continuity_when_target_updates_mid_tween() {
        let mut p = Progress::new(0., 0);
        p.update(0.5, 0);
        let before = p.sample(80);
        p.update(0.8, 80);
        assert_eq!(p.sample(80), before);
        assert!(p.sample(81) >= before);
        assert_eq!(p.sample(300), 0.8);
    }
    #[test]
    fn settled_views_sleep_but_retention_and_leave_keep_exact_wakeups() {
        let mut m = Model::new(0, true);
        assert_eq!(m.next_wake_ms(0), None);
        m.state(Stage::Resolving, 0., 1);
        m.tick(2);
        assert_eq!(m.next_wake_ms(2), None);
        m.state(Stage::Success, 1., 10);
        m.tick(11);
        assert_eq!(m.next_wake_ms(11), Some(1499));
        m.tick(1510);
        assert_eq!(m.next_wake_ms(1510), Some(80));
        m.tick(1590);
        assert_eq!(m.next_wake_ms(1590), None);
        m.reduced = false;
        m.state(Stage::Resolving, 0., 1600);
        assert_eq!(m.next_wake_ms(1600), Some(16));
    }
    #[test]
    fn settled_drop_lock_keeps_waking_until_native_drag_exit_is_observed() {
        let mut model = Model::new(0, true);
        model.locks.drop = true;
        model.locks_changed(1);
        model.tick(2);
        assert_eq!(model.next_wake_ms(2), Some(16));
        model.locks.drop = false;
        model.locks_changed(3);
        assert_eq!(model.next_wake_ms(3), Some(80));
        model.tick(83);
        assert_eq!(model.fullness, 0.);
        assert_eq!(model.next_wake_ms(83), None);
    }
    #[test]
    fn leave_during_expansion_reverses_immediately_without_position_jump() {
        let mut m = Model::new(0, false);
        m.pointer(true, 0);
        m.tick(0);
        m.tick(40);
        m.tick(41);
        let before = (m.fullness, m.velocity);
        assert!(before.0 > 0. && before.0 < 1.);
        m.pointer(false, 41);
        assert!(!m.target_full);
        assert_eq!((m.fullness, m.velocity), before);
        m.tick(42);
        let before = (m.fullness, m.velocity);
        m.pointer(true, 42);
        assert!(m.target_full);
        assert_eq!((m.fullness, m.velocity), before);
    }
    #[test]
    fn transcode_updates_preserve_blue_hold_deadline_and_latest_progress() {
        let mut m = Model::new(0, false);
        m.state(Stage::Downloading, 0.7, 0);
        m.state(Stage::Transcoding, 0.1, 10);
        m.state(Stage::Transcoding, 0.4, 100);
        m.state(Stage::Transcoding, 0.2, 200);
        m.state(Stage::Transcoding, f32::NAN, 300);
        m.pointer(true, 301);
        m.tick(329);
        assert_eq!(m.stage, Stage::Downloading);
        m.tick(330);
        assert_eq!(m.stage, Stage::Transcoding);
        assert_eq!(m.arc(330).1, 0.4);
    }
    #[test]
    fn invalid_initial_progress_never_poison_geometry() {
        for (input, expected) in [(f32::NAN, 0.), (f32::INFINITY, 0.), (-1., 0.), (2., 1.)] {
            let mut p = Progress::new(input, 0);
            assert_eq!(p.sample(0), expected);
            p.update(1., 1);
            assert!(p.sample(50).is_finite());
        }
    }
}
