//! Native adaptations of motion-primitives Animated Background, Transition Panel
//! and Morphing Popover. Only presentation lives here; committed state stays with its owner.
use std::{cell::{Cell, RefCell}, collections::HashMap, rc::Rc, time::Instant};
use gpui::{prelude::*, *};

pub const FEEDBACK_MS: u64 = 150;
pub use crate::model::{Scalar, ENTER_MS, EXIT_MS};
pub const COPY_FEEDBACK_MS: u64 = 2000;

#[derive(Clone, Copy)]
pub struct Presence { pub alpha: f32, pub open: bool }
impl Presence {
    pub fn visible(self) -> bool { self.open || self.alpha > 0.001 }
    pub fn travel(self, distance: f32) -> f32 { (1. - self.alpha) * distance }
}
struct Track { value: Scalar, seen: u64, tag: Option<String> }
pub struct Motion {
    clock: Instant, now: Cell<u64>, frame: Cell<u64>, reduced: Cell<bool>,
    tracks: RefCell<HashMap<String, Track>>,
    notices: RefCell<HashMap<String, (String, bool)>>,
    heights: RefCell<HashMap<String, Rc<Cell<f32>>>>,
}
impl Default for Motion {
    fn default() -> Self { Self { clock: Instant::now(), now: Cell::new(0), frame: Cell::new(0),
        reduced: Cell::new(false), tracks: RefCell::new(HashMap::new()), notices: RefCell::new(HashMap::new()), heights: RefCell::new(HashMap::new()) } }
}
impl Motion {
    pub fn begin(&self, reduced: bool) {
        self.now.set(self.clock.elapsed().as_millis() as u64); self.reduced.set(reduced);
        let frame = self.frame.get().saturating_add(1); self.frame.set(frame);
        self.tracks.borrow_mut().retain(|_, track| track.seen + 2 >= frame);
    }
    fn track(&self, id: String, target: f32, initial: f32, duration: u64) -> f32 {
        let now = self.now.get();
        let mut tracks = self.tracks.borrow_mut();
        let track = tracks.entry(id).or_insert_with(|| Track { value: Scalar::new(initial), seen: self.frame.get(), tag: None });
        track.seen = self.frame.get();
        track.value.set(target, now, duration, self.reduced.get());
        track.value.sample(now)
    }
    pub fn value(&self, id: impl Into<String>, target: f32) -> f32 { self.track(id.into(), target, target, FEEDBACK_MS) }
    pub fn presence(&self, id: impl Into<String>, open: bool) -> Presence {
        Presence { alpha: self.track(id.into(), if open { 1. } else { 0. }, 0., if open { ENTER_MS } else { EXIT_MS }), open }
    }
    pub fn change(&self, id: impl Into<String>, tag: impl ToString) -> f32 {
        let id = id.into(); let tag = tag.to_string(); let now = self.now.get();
        let mut tracks = self.tracks.borrow_mut();
        let track = tracks.entry(id).or_insert_with(|| Track { value: Scalar::new(1.), seen: self.frame.get(), tag: Some(tag.clone()) });
        if track.tag.as_ref() != Some(&tag) {
            let from = if track.value.moving(now) { track.value.sample(now) } else { 0. };
            track.value = Scalar::new(from); track.value.set(1., now, ENTER_MS, self.reduced.get()); track.tag = Some(tag);
        }
        track.seen = self.frame.get();
        if self.reduced.get() { track.value = Scalar::new(1.); }
        track.value.sample(now)
    }
    pub fn notice(&self, id: &str, current: Option<(String, bool)>) -> Option<(String, bool, Presence)> {
        let presence = self.presence(format!("notice:{id}"), current.is_some());
        let mut notices = self.notices.borrow_mut();
        if let Some(value) = current { notices.insert(id.into(), value); }
        if !presence.visible() { notices.remove(id); return None; }
        notices.get(id).map(|(text, danger)| (text.clone(), *danger, presence))
    }
    pub fn moving(&self) -> bool { self.tracks.borrow().values().any(|track| track.seen == self.frame.get() && track.value.moving(self.now.get())) }
    pub fn reveal(&self, id: &str, presence: Presence, child: impl IntoElement) -> Div {
        let height = self.heights.borrow_mut().entry(id.into()).or_insert_with(|| Rc::new(Cell::new(0.))).clone();
        let measured = height.clone();
        div().flex().flex_col().max_h(px(height.get() * presence.alpha)).overflow_hidden()
            .child(div().w_full().flex_none().opacity(presence.alpha).relative().top(px(presence.travel(-3.)))
                .on_children_prepainted(move |children, window, _| {
                    if let Some(bounds) = children.into_iter().reduce(|a, b| a.union(&b)) {
                        let next = f32::from(bounds.size.height);
                        if (next - measured.get()).abs() > 0.5 { measured.set(next); window.request_animation_frame(); }
                    }
                }).child(child))
    }
    pub fn finish(&self, window: &mut Window) { if self.moving() { window.request_animation_frame(); } }
}

#[cfg(test)]
mod tests {
    use super::*;
    use core::prelude::v1::test;
    #[test]
    fn reversal_continues_from_the_visible_value_and_settles() {
        let mut value = Scalar::new(0.); value.set(1., 0, ENTER_MS, false);
        let midway = value.sample(60); assert!(midway > 0. && midway < 1.);
        value.set(0., 60, EXIT_MS, false); assert_eq!(value.sample(60), midway);
        assert!(value.sample(90) < midway); assert_eq!(value.sample(170), 0.); assert!(!value.moving(170));
    }
    #[test]
    fn repeated_target_does_not_restart_a_transition() {
        let mut value = Scalar::new(0.); value.set(1., 0, 150, false);
        value.set(1., 100, 150, false); assert_eq!(value.sample(150), 1.); assert!(!value.moving(150));
    }
    #[test]
    fn reduced_motion_finishes_current_direction_without_replay() {
        let mut value = Scalar::new(0.); value.set(1., 0, 180, false);
        value.set(0., 50, 110, true); assert_eq!(value.sample(50), 0.); assert!(!value.moving(50));
        value.set(0., 60, 110, false); assert!(!value.moving(60));
    }
    #[test]
    fn closing_presence_keeps_content_only_until_exit_finishes() {
        let motion = Motion::default(); motion.begin(false); motion.presence("popup", true);
        motion.now.set(180); assert_eq!(motion.presence("popup", true).alpha, 1.);
        assert!(motion.presence("popup", false).visible());
        motion.now.set(290); assert!(!motion.presence("popup", false).visible()); assert!(!motion.moving());
    }
    #[test]
    fn notice_retains_its_reason_during_exit_and_releases_it_at_rest() {
        let motion = Motion::default(); motion.begin(false); motion.notice("error", Some(("reason".into(), true)));
        motion.now.set(180); motion.notice("error", Some(("reason".into(), true)));
        assert_eq!(motion.notice("error", None).unwrap().0, "reason");
        motion.now.set(290); assert!(motion.notice("error", None).is_none());
    }
}
