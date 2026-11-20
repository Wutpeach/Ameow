//! Local presentation only. All timestamps are supplied, making ownership and motion testable.
pub const LEAVE_MS: u64 = 80;
pub const PROGRESS_MS: u64 = 220;
pub const ROTATION_MS: u64 = 1250;
pub const STATUS_ANIMATION_MS: u64 = 700;
pub fn label_mix_at(stage:Stage, at:u64, now:u64, reduced:bool) -> f32 {
    if reduced { return 1.; }
    let delay = if stage == Stage::Success { 50 } else { 0 };
    (now.saturating_sub(at + delay) as f32 / 160.).clamp(0., 1.)
}
use crate::repair_motion::Motion;
pub const ENTER_MS: u64 = 180;
pub const EXIT_MS: u64 = 110;

#[derive(Clone, Copy, Debug)]
pub struct Scalar { from: f32, target: f32, at: u64, duration: u64 }
impl Default for Scalar { fn default() -> Self { Self::new(0.) } }
impl Scalar {
    pub fn new(value: f32) -> Self { Self { from: value, target: value, at: 0, duration: 0 } }
    pub fn sample(&self, now: u64) -> f32 {
        let t = if self.duration == 0 { 1. } else { (now.saturating_sub(self.at) as f32 / self.duration as f32).clamp(0., 1.) };
        // A bounded ease-out: no overshoot at the ends of a small control.
        let eased = 1. - (1. - t).powi(3);
        self.from + (self.target - self.from) * eased
    }
    pub fn set(&mut self, target: f32, now: u64, duration: u64, reduced: bool) {
        if reduced { *self = Self::new(target); }
        else if self.target != target {
            self.from = self.sample(now); self.target = target; self.at = now; self.duration = duration;
        }
    }
    pub fn moving(&self, now: u64) -> bool { self.from != self.target && now < self.at.saturating_add(self.duration) }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DirectoryFeedback { Receiving, Saved }
#[derive(Clone, Copy, Debug)]
pub struct DirectoryPresentation {
    pub feedback: DirectoryFeedback,
    pub at: u64,
    opacity: Scalar,
    exit_at: Option<u64>,
    latched: bool,
}
impl DirectoryPresentation {
    pub fn alpha(self, now:u64, reduced:bool) -> f32 {
        if reduced { if self.exit_at.is_some() { 0. } else { 1. } } else { self.opacity.sample(now) }
    }
    pub fn receiving(self) -> bool { self.feedback == DirectoryFeedback::Receiving && self.exit_at.is_none() }
    fn deadline(self) -> Option<u64> {
        if self.latched { None } else if let Some(at) = self.exit_at { Some(at + EXIT_MS) }
        else if self.feedback == DirectoryFeedback::Saved { Some(self.at + Stage::Success.retention()) }
        else { None }
    }
    fn animating(self, now:u64, reduced:bool) -> bool {
        !reduced && (self.opacity.moving(now) || (self.feedback == DirectoryFeedback::Saved && now < self.at + STATUS_ANIMATION_MS))
    }
}

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
    pub keyboard_hold: bool,
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
    pub window_motion: Motion,
    manual_compact: bool,
    compact_left: bool,
    pub directory: Option<DirectoryPresentation>,
}
impl Model {
    pub fn new(now: u64, reduced: bool) -> Self {
        Self {
            keyboard_hold: false,
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
            window_motion: Motion::new(now),
            manual_compact: false,
            compact_left: false,
            directory: None,
        }
    }
    pub fn blocked(&self) -> bool {
        self.keyboard_hold || self.locks.drag
            || self.locks.menu
            || self.locks.drop
            || (!self.manual_compact
                && (self.stage.active()
                    || self.terminal.is_some()
                    || self.pending_transcode.is_some()
                    || self.directory.is_some()))
    }
    /// Explicit Compact affects presentation only. A real leave/re-entry retires the override.
    pub fn request_compact(&mut self, now: u64) {
        self.keyboard_hold = false;
        self.directory = None;
        self.manual_compact = true;
        self.compact_left = !self.pointer;
        self.collapse = None;
        self.set_target(false, now);
    }
    pub fn keyboard(&mut self, hold: bool, now: u64) {
        if self.keyboard_hold == hold { return; }
        self.keyboard_hold = hold;
        if hold {
            self.manual_compact = false; self.compact_left = false;
            self.collapse = None; self.set_target(true, now);
        } else { self.schedule_leave(now); }
    }
    /// A new summon starts at Compact without resetting download or terminal ownership.
    pub fn summon(&mut self, now: u64) {
        self.window_motion = Motion::new(now);
        self.fullness = 0.;
        self.velocity = 0.;
        self.target_full = false;
        self.keyboard_hold = false;
        self.keyboard(true, now);
    }
    pub fn clear_directory(&mut self, now:u64) {
        if self.directory.take().is_some() { self.schedule_leave(now); }
    }
    pub fn directory_hover(&mut self, ready:bool, now:u64) {
        if ready {
            if self.directory.is_some_and(|d| d.receiving()) { return; }
            self.start_directory(DirectoryFeedback::Receiving, now);
        } else if let Some(d) = &mut self.directory
            && d.receiving() && !d.latched {
            d.opacity.set(0., now, EXIT_MS, self.reduced);
            d.exit_at = Some(now);
            if self.reduced { self.clear_directory(now); }
        }
    }
    pub fn directory_saved(&mut self, now:u64) { self.start_directory(DirectoryFeedback::Saved, now); }
    fn start_directory(&mut self, feedback:DirectoryFeedback, now:u64) {
        let mut opacity = self.directory.map_or(Scalar::new(0.), |d| Scalar::new(d.alpha(now, self.reduced)));
        opacity.set(1., now, ENTER_MS, self.reduced);
        self.directory = Some(DirectoryPresentation { feedback, at:now, opacity, exit_at:None, latched:false });
        self.collapse = None;
        if !self.manual_compact { self.set_target(true, now); }
    }
    pub fn preview_directory(&mut self, feedback:DirectoryFeedback, now:u64) {
        self.directory = None;
        self.manual_compact = false;
        self.compact_left = false;
        self.start_directory(feedback, now);
        self.directory.as_mut().unwrap().latched = self.reduced;
    }
    /// Transfer at the input/deadline timestamp; previous idle time belongs to the old target.
    pub fn set_target(&mut self, full: bool, now: u64) {
        if self.target_full == full {
            return;
        }
        self.window_motion.tick(now, self.target_full, self.reduced);
        self.window_motion.tick(now, full, self.reduced);
        self.fullness = self.window_motion.x;
        self.velocity = self.window_motion.v;
        self.target_full = full;
    }
    pub fn set_reduced(&mut self, reduced: bool, now: u64) {
        // Process due ownership under the old preference, then snap to the current owner.
        self.tick(now);
        self.window_motion.tick(now, self.target_full, self.reduced);
        self.window_motion.tick(now, self.target_full, reduced);
        self.fullness = self.window_motion.x;
        self.velocity = self.window_motion.v;
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
            && (self.fullness < 1. || self.window_motion.moving())
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
        if stage != Stage::Idle { self.directory = None; }
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
        if self.directory.and_then(DirectoryPresentation::deadline).is_some_and(|at| now >= at) {
            self.clear_directory(now);
        }
        if let Some((deadline, percent)) = self.pending_transcode
            && now >= deadline.at
            && deadline.epoch == self.epoch
        {
            self.pending_transcode = None;
            self.directory = None;
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
        self.window_motion.tick(now, self.target_full, self.reduced);
        self.fullness = self.window_motion.x;
        self.velocity = self.window_motion.v;
        // Keyboard summon protects expansion only; pointer leave owns settled Full.
        if self.keyboard_hold && self.target_full && self.fullness == 1. && !self.window_motion.moving() {
            self.keyboard(false, now);
        }
    }
    pub fn geometry(&self) -> Geometry {
        self.window_motion.geometry()
    }
    pub fn indeterminate_animation(&self, unknown: bool) -> bool {
        unknown && self.stage == Stage::Downloading && !self.reduced
    }
    /// One view-owned wakeup: animate only while visible motion is in flight.
    /// Determinate/reduced states sleep until native input or a deadline.
    pub fn next_wake_ms(&self, now: u64) -> Option<u64> {
        let target = if self.target_full { 1. } else { 0. };
        let changing = self.velocity != 0.
            || self.window_motion.moving()
            || self.fullness != target
            || self.locks.drag
            || self.locks.drop
            || (self.target_full && self.directory.is_some_and(|d| d.animating(now, self.reduced)))
            || (!self.reduced && self.progress.moving(now))
            || (!self.reduced
                && (self.stage == Stage::Resolving
                    || (self.stage != Stage::Idle && now < self.stage_at + STATUS_ANIMATION_MS)
                    || self.blue_trace(now) > 0.));
        if changing {
            return Some(16);
        }
        [
            self.collapse,
            self.terminal,
            self.pending_transcode.map(|p| p.0),
            self.directory.and_then(DirectoryPresentation::deadline).map(|at| Deadline { at, epoch:self.epoch }),
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
        label_mix_at(self.stage, self.stage_at, now, self.reduced)
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

/// Reserve the expanded native bounds on the cursor's display before showing Compact.
pub fn summon_anchor(cursor: [f32; 2], scale: f32, work: [f32; 4]) -> [f32; 2] {
    let full = Geometry::at(1.);
    reachable_anchor(cursor, Geometry {
        surface: full.surface * scale, gutter: full.gutter * scale,
        radius: full.radius * scale, native: full.native * scale,
    }, work)
}

#[cfg(test)]
mod tests {
    fn directory_full(reduced:bool) -> super::Model {
        let mut model = super::Model::new(0, reduced);
        model.pointer(true, 0);
        for now in (0..=600).step_by(16) { model.tick(now); }
        model.tick(600);
        model
    }
    #[test]
    fn directory_ack_then_immediate_leave_uses_success_retention_and_leave_grace() {
        for reduced in [false, true] {
            let mut model = directory_full(reduced);
            model.directory_saved(600);
            model.pointer(false, 601);
            for now in (601..1200).step_by(16) { model.tick(now); assert!(model.target_full); }
            model.pointer(true, 1200); model.pointer(false, 1201);
            for now in (1201..2100).step_by(16) { model.tick(now); assert!(model.target_full); }
            assert_eq!(model.stage, super::Stage::Idle, "directory ACK is not download success");
            assert!(model.directory.is_some());
            assert_eq!(model.next_wake_ms(2099), Some(1));
            model.tick(2100);
            assert!(model.directory.is_none());
            assert!(model.target_full);
            assert_eq!(model.next_wake_ms(2100), Some(super::LEAVE_MS));
            model.tick(2180);
            assert!(!model.target_full);
        }
    }
    #[test]
    fn directory_cancel_reversal_and_replacement_do_not_reuse_old_deadlines() {
        let mut model = directory_full(false);
        model.directory_hover(true, 600);
        model.pointer(false, 680);
        let alpha = model.directory.unwrap().alpha(700, false);
        model.directory_hover(false, 700);
        assert_eq!(model.directory.unwrap().alpha(700, false), alpha);
        let reversing = model.directory.unwrap().alpha(720, false);
        model.directory_hover(true, 720);
        assert_eq!(model.directory.unwrap().alpha(720, false), reversing);
        model.tick(810);
        assert!(model.directory.unwrap().receiving());
        model.directory_saved(900);
        model.directory_saved(1100);
        model.tick(2400);
        assert!(model.target_full);
        assert!(model.directory.is_some());
        model.tick(2600);
        assert!(model.directory.is_none());
        model.tick(2680);
        assert!(!model.target_full);
    }
    #[test]
    fn directory_hover_cancel_and_reduced_motion_never_start_success_hold() {
        for reduced in [false, true] {
            let mut model = directory_full(reduced);
            model.directory_hover(true, 600);
            model.pointer(false, 690);
            model.directory_hover(false, 700);
            let end = if reduced { 700 } else { 700 + super::EXIT_MS };
            model.tick(end);
            assert!(model.directory.is_none());
            model.tick(end + super::LEAVE_MS);
            assert!(!model.target_full);
        }
    }
    #[test]
    fn directory_yields_to_new_download_and_explicit_compact_without_replay() {
        let mut model = directory_full(true);
        model.state(super::Stage::Downloading, 0.3, 600);
        model.directory_saved(700);
        model.state(super::Stage::Downloading, 0.6, 710);
        assert!(model.directory.is_some(), "fresh progress does not restart or cancel feedback");
        assert_eq!(model.stage, super::Stage::Downloading);
        model.state(super::Stage::Success, 1., 720);
        assert!(model.directory.is_none());
        model.directory_saved(800);
        model.request_compact(810);
        assert!(model.directory.is_none());
        assert!(!model.target_full);
        model.tick(2400);
        assert!(!model.target_full);
        model.pointer(false, 2401); model.pointer(true, 2402);
        assert!(model.target_full);
        assert!(model.directory.is_none(), "re-entry must not replay old directory success");
        let mut hidden = directory_full(true);
        hidden.directory_saved(700); hidden.pointer(false, 710);
        hidden.clear_directory(720); hidden.tick(800);
        assert!(!hidden.target_full);
        hidden.tick(2300); assert!(hidden.directory.is_none());
    }
    #[test]
    fn directory_ack_during_collapse_reverses_existing_motion_without_a_new_spring() {
        let mut model = directory_full(false);
        model.pointer(false, 600); model.tick(680); model.tick(696);
        let before = model.fullness;
        assert!(!model.target_full);
        model.directory_saved(700);
        assert!(model.target_full);
        assert!((model.fullness - before).abs() < 0.03);
        for now in (700..2200).step_by(16) { model.tick(now); assert!(model.target_full); }
        model.tick(2200); assert!(model.directory.is_none());
    }
    #[test]
    fn directory_preview_latches_reduced_but_replays_dynamic_retention_and_collapse() {
        let mut still = super::Model::new(0, true);
        still.preview_directory(super::DirectoryFeedback::Saved, 0);
        still.tick(60_000);
        assert!(still.directory.is_some());
        assert!(still.target_full);
        let mut dynamic = super::Model::new(0, false);
        dynamic.preview_directory(super::DirectoryFeedback::Saved, 0);
        for now in (0..1500).step_by(16) { dynamic.tick(now); assert!(dynamic.target_full); }
        dynamic.tick(1500); assert!(dynamic.directory.is_none());
        dynamic.tick(1580); assert!(!dynamic.target_full);
        dynamic.preview_directory(super::DirectoryFeedback::Saved, 2000);
        assert_eq!(dynamic.directory.unwrap().at, 2000);
        assert!(dynamic.target_full);
        assert_eq!(dynamic.directory.unwrap().alpha(2000, false), 0.);
    }
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
        let mut expected = Motion::new(0);
        expected.tick(500, true, false);
        expected.tick(516, true, false);
        assert_eq!((m.fullness, m.velocity), (expected.x, expected.v));
        let mut m = Model::new(0, false);
        m.pointer(true, 10);
        m.tick(26);
        let mut expected = Motion::new(0);
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
        let mut expected = Motion::new(0);
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
        m.pointer(true, 0);
        for t in (0..600).step_by(4) {
            m.tick(t);
        }
        m.pointer(false, 600);
        m.tick(679);
        assert!(m.target_full);
        m.tick(700);
        assert!(!m.target_full);
        m.tick(701);
        let before = (m.fullness, m.velocity);
        m.pointer(true, 701);
        assert!(m.target_full);
        assert_eq!(before, (m.fullness, m.velocity));
        for t in (704..1000).step_by(4) {
            m.tick(t);
        }
        assert!(m.fullness > before.0);
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

#[cfg(test)]
mod shortcut_tests {
    use super::*;
    #[test]
    fn every_summon_restarts_compact_motion_and_preserves_business() {
        let mut model = Model::new(0, false);
        model.state(Stage::Downloading, 0.4, 0);
        for now in (0..=800).step_by(16) { model.tick(now); }
        assert_eq!(model.fullness, 1.);
        for start in [1000, 2000] {
            model.summon(start);
            assert_eq!((model.fullness, model.velocity), (0., 0.));
            assert!(model.keyboard_hold && model.target_full);
            assert_eq!(model.stage, Stage::Downloading);
            assert_eq!(model.progress.target, 0.4);
            model.pointer(false, start + 1);
            model.tick(start + 32);
            assert!(model.fullness > 0. && model.fullness < 1.);
            for now in (start + 48..=start + 800).step_by(16) { model.tick(now); }
            assert_eq!(model.fullness, 1.);
            assert!(!model.keyboard_hold);
        }
    }
    #[test]
    fn reduced_summon_snaps_to_full_without_resetting_terminal_retention() {
        let mut model = Model::new(0, true);
        model.state(Stage::Success, 1., 1);
        model.summon(20);
        assert_eq!(model.fullness, 1.);
        model.tick(20);
        assert!(!model.keyboard_hold && model.target_full);
        model.tick(1501);
        assert_eq!(model.stage, Stage::Idle);
        assert!(model.target_full);
        model.tick(1501 + LEAVE_MS - 1);
        assert!(model.target_full);
        model.tick(1501 + LEAVE_MS);
        assert_eq!(model.fullness, 0.);
    }
    #[test]
    fn summon_reserves_full_bounds_on_the_selected_work_area_at_each_scale() {
        for work in [[0.,0.,1920.,1040.],[-1920.,-300.,0.,780.],[0.,-1200.,2560.,0.]] {
            for scale in [1.,1.25,1.5,2.] {
                for cursor in [[work[0],work[1]],[work[2]-1.,work[3]-1.],[(work[0]+work[2])/2.,(work[1]+work[3])/2.]] {
                    let anchor = summon_anchor(cursor, scale, work);
                    for fullness in [0.,0.25,0.5,1.] {
                        let g = Geometry::at(fullness);
                        let origin = [anchor[0]-g.gutter*scale,anchor[1]-g.gutter*scale];
                        assert!(origin[0] >= work[0] && origin[1] >= work[1]);
                        assert!(origin[0]+g.native*scale <= work[2] && origin[1]+g.native*scale <= work[3]);
                    }
                }
            }
        }
        assert_eq!(summon_anchor([500.,400.],1.,[0.,0.,1920.,1040.]),[500.,400.]);
    }
    #[test]
    fn settled_summon_uses_pointer_leave_without_a_focus_loss_event() {
        for reduced in [false, true] {
            let mut model = Model::new(0, reduced);
            model.pointer(true, 1);
            model.summon(2);
            for now in (2..=1000).step_by(16) { model.tick(now); }
            assert!(model.target_full && !model.keyboard_hold && model.pointer);
            model.tick(5000);
            assert!(model.target_full, "pointer inside must retain Full");
            // No keyboard(false) input is delivered: native focus may stay with the window.
            model.pointer(false, 5001);
            model.tick(5001 + LEAVE_MS - 1);
            assert!(model.target_full);
            model.tick(5001 + LEAVE_MS);
            assert!(!model.target_full);
            for now in (5100..=6100).step_by(16) { model.tick(now); }
            assert_eq!(model.fullness, 0.);
        }
    }
    #[test]
    fn old_outside_sample_cannot_reverse_summon_expansion() {
        let mut model = Model::new(0, false);
        model.pointer(true, 1);
        model.summon(2);
        model.pointer(false, 3);
        model.tick(34);
        assert!(model.target_full && model.keyboard_hold);
        assert!(model.fullness > 0. && model.fullness < 1.);
        model.pointer(true, 35);
        for now in (50..=1000).step_by(16) { model.tick(now); }
        assert!(model.target_full && !model.keyboard_hold && model.pointer);
        model.tick(5000);
        assert!(model.target_full);
    }
    #[test]
    fn clamped_outside_summon_and_repeats_have_no_permanent_hold() {
        for reduced in [false, true] {
            let mut model = Model::new(0, reduced);
            for start in [0, 2000, 4000] {
                model.summon(start);
                model.pointer(false, start);
                let mut released = None;
                for now in (start..=start + 1000).step_by(16) {
                    model.tick(now);
                    if !model.keyboard_hold { released = Some(now); break; }
                    assert!(model.target_full, "first-frame outside cannot cancel expansion");
                }
                let released = released.expect("completed expansion must hand ownership back");
                assert_eq!(model.fullness, 1.);
                model.tick(released + LEAVE_MS - 1);
                assert!(model.target_full);
                model.tick(released + LEAVE_MS);
                assert!(!model.target_full && !model.keyboard_hold);
                for now in (released + LEAVE_MS + 16..=start + 1800).step_by(16) { model.tick(now); }
                assert_eq!(model.fullness, 0.);
            }
        }
    }
    #[test]
    fn releasing_keyboard_does_not_override_download_or_menu_ownership() {
        for owner in 0..4 {
            let mut model = Model::new(0, false);
            match owner {
                0 => model.state(Stage::Downloading, 0.2, 0),
                1 => model.locks.menu = true,
                2 => model.locks.drag = true,
                _ => model.locks.drop = true,
            }
            model.summon(1);
            model.pointer(false, 2);
            for now in (1..=1500).step_by(16) { model.tick(now); }
            assert!(model.target_full && !model.keyboard_hold);
            match owner {
                0 => model.state(Stage::Idle, 0., 1501),
                1 => model.locks.menu = false,
                2 => model.locks.drag = false,
                _ => model.locks.drop = false,
            }
            model.locks_changed(1501);
            model.tick(1501 + LEAVE_MS - 1);
            assert!(model.target_full);
            model.tick(1501 + LEAVE_MS);
            assert!(!model.target_full);
        }
    }
}
