//! Main-Surface menu state. No native windows, input polling, or settings authority.
use ameow_next::download::request::Quality;
pub const FADE_MS: u64 = crate::ui_motion::ENTER_MS;
pub const HOVER_MS: u64 = 90;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    Close,
    Quality(Quality),
    Hide,
    Settings,
    Exit,
}
#[derive(Default)]
pub struct Menu {
    open: bool,
    pub selected: usize,
    // Quality-control tooltip only; Full has no temporary status text at its bottom.
    pub hint: Option<String>,
    generation: u64,
    presence: crate::ui_motion::Scalar,
    quality_focus: usize,
    hovered: Option<usize>,
    old_hover: Option<usize>,
    hover_at: u64,
    keyboard: bool,
}
fn ease(now: u64, at: u64, duration: u64, reduced: bool) -> f32 {
    if reduced {
        return 1.;
    }
    let t = (now.saturating_sub(at) as f32 / duration as f32).clamp(0., 1.);
    1. - (1. - t).powi(4)
}
impl Menu {
    pub fn is_open(&self) -> bool {
        self.open
    }
    pub fn generation(&self) -> u64 {
        self.generation
    }
    pub fn name(&self) -> &'static str {
        if self.open { "primary" } else { "closed" }
    }
    pub fn open(&mut self, current: Option<Quality>, now: u64) {
        self.generation += 1;
        self.open = true;
        self.presence.set(1., now, FADE_MS, false);
        self.reset_selection();
        self.quality_focus = match current {
            Some(Quality::Highest) => 0,
            Some(Quality::Saver) => 2,
            _ => 1,
        };
        self.selected = self.quality_focus;
    }
    pub fn close(&mut self, now: u64) {
        if self.open {
            self.generation += 1;
            self.presence.set(0., now, crate::ui_motion::EXIT_MS, false);
        }
        self.open = false;
    }
    /// Acknowledgements from an earlier closed menu cannot dismiss a newer session.
    pub fn saved(&mut self, generation: u64, success: bool, now: u64) -> bool {
        if !self.open || self.generation != generation {
            return false;
        }
        if success {
            self.close(now);
            true
        } else {
            self.hint = Some("保存失败，请重试".into());
            false
        }
    }
    fn reset_selection(&mut self) {
        self.selected = 0;
        self.hovered = None;
        self.old_hover = None;
        self.keyboard = false;
        self.hint = None;
    }
    pub fn action(index: usize) -> Option<Action> {
        match index {
            0 => Some(Action::Quality(Quality::Highest)),
            1 => Some(Action::Quality(Quality::Balanced)),
            2 => Some(Action::Quality(Quality::Saver)),
            3 => Some(Action::Settings),
            4 => Some(Action::Hide),
            5 => Some(Action::Exit),
            6 => Some(Action::Close),
            _ => None,
        }
    }
    pub fn key(&mut self, key: &str) -> Option<Action> {
        if !self.open { return None; }
        match key {
            "escape" => return Some(Action::Close),
            "enter" | "space" => return Self::action(self.selected),
            "left" | "right" if self.selected < 3 => {
                self.selected = (self.selected + if key == "left" { 2 } else { 1 }) % 3;
            }
            "up" => self.selected = match self.selected {
                0..=2 | 6 => 5,
                3 => self.quality_focus,
                index => index - 1,
            },
            "down" => self.selected = match self.selected {
                0..=2 => 3,
                5 | 6 => self.quality_focus,
                index => index + 1,
            },
            // Tab also reaches the close button; arrow navigation follows the visual groups.
            "tab" => self.selected = (self.selected + 1) % 7,
            "shift-tab" => self.selected = (self.selected + 6) % 7,
            _ => return None,
        }
        if self.selected < 3 { self.quality_focus = self.selected; }
        self.keyboard = true;
        None
    }
    pub fn hover(&mut self, index: usize, inside: bool, now: u64) {
        if !self.open { return; }
        let next = if inside {
            Some(index)
        } else if self.hovered == Some(index) {
            None
        } else {
            self.hovered
        };
        if next == self.hovered { return; }
        self.old_hover = self.hovered;
        self.hovered = next;
        self.hover_at = now;
        if inside {
            self.selected = index;
            if index < 3 { self.quality_focus = index; }
            self.keyboard = false;
        }
    }
    pub fn keyboard_selected(&self, index: usize) -> bool {
        self.keyboard && self.selected == index
    }
    pub fn highlight(&self, index: usize, now: u64, reduced: bool) -> f32 {
        if self.keyboard_selected(index) { return 1.; }
        let t = ease(now, self.hover_at, HOVER_MS, reduced);
        if self.hovered == Some(index) { t }
        else if self.old_hover == Some(index) { 1. - t }
        else { 0. }
    }
    #[cfg(test)]
    pub fn content_alpha(&self, now: u64, reduced: bool) -> f32 {
        if self.open { self.menu_alpha(now, reduced) } else { 1. - self.menu_alpha(now, reduced) }
    }
    pub fn menu_alpha(&self, now: u64, reduced: bool) -> f32 {
        if reduced { if self.open { 1. } else { 0. } } else { self.presence.sample(now) }
    }
    pub fn visible(&self, now: u64, reduced: bool) -> bool { self.open || self.menu_alpha(now, reduced) > 0.001 }
    pub fn active_item(&self) -> Option<usize> { if self.keyboard { Some(self.selected) } else { self.hovered } }
    pub fn animating(&self, now: u64, reduced: bool) -> bool {
        !reduced && (self.presence.moving(now)
            || now < self.hover_at + HOVER_MS)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn closing_disables_actions_immediately_and_reopening_continues_the_fade() {
        let mut menu = Menu::default();
        menu.open(None, 0);
        menu.close(FADE_MS);
        assert!(!menu.is_open());
        assert!(menu.visible(FADE_MS, false));
        assert_eq!(menu.key("enter"), None);
        let at = FADE_MS + 45;
        let fading = menu.menu_alpha(at, false);
        assert!(fading > 0. && fading < 1.);
        menu.open(None, at);
        assert_eq!(menu.menu_alpha(at, false), fading);
        assert_eq!(menu.menu_alpha(at + FADE_MS, false), 1.);
        menu.close(at + FADE_MS);
        assert!(!menu.visible(at + FADE_MS, true));
        assert!(!menu.visible(at + FADE_MS + crate::ui_motion::EXIT_MS, false));
    }
    #[test]
    fn quality_and_window_actions_are_reachable_without_a_second_page() {
        let mut menu = Menu::default();
        menu.open(Some(Quality::Balanced), 0);
        assert_eq!(menu.key("enter"), Some(Action::Quality(Quality::Balanced)));
        menu.key("left");
        assert_eq!(menu.key("space"), Some(Action::Quality(Quality::Highest)));
        menu.key("left");
        assert_eq!(menu.key("enter"), Some(Action::Quality(Quality::Saver)));
        menu.key("down");
        assert_eq!(menu.key("enter"), Some(Action::Settings));
        menu.key("up");
        assert_eq!(menu.key("enter"), Some(Action::Quality(Quality::Saver)));
        for expected in [Action::Settings, Action::Hide, Action::Exit] {
            menu.key("down");
            assert_eq!(menu.key("enter"), Some(expected));
        }
        assert_eq!(menu.name(), "primary");
        assert_eq!(menu.key("escape"), Some(Action::Close));
        menu.close(20);
        assert_eq!(menu.key("enter"), None);
    }
    #[test]
    fn tab_reaches_every_action_in_both_directions_including_close() {
        let mut menu = Menu::default();
        menu.open(Some(Quality::Highest), 0);
        for expected in [Action::Quality(Quality::Balanced), Action::Quality(Quality::Saver),
            Action::Settings, Action::Hide, Action::Exit, Action::Close,
            Action::Quality(Quality::Highest)] {
            menu.key("tab");
            assert_eq!(menu.key("enter"), Some(expected));
        }
        menu.key("shift-tab");
        assert_eq!(menu.key("enter"), Some(Action::Close));
        menu.key("shift-tab");
        assert_eq!(menu.key("enter"), Some(Action::Exit));
    }
    #[test]
    fn menu_fade_and_hover_respect_reduced_motion() {
        let mut menu = Menu::default();
        menu.open(None, 0);
        assert_eq!(menu.content_alpha(0, false), 0.);
        assert_eq!(menu.content_alpha(FADE_MS, false), 1.);
        assert_eq!(menu.content_alpha(0, true), 1.);
        menu.hover(4, true, 200);
        assert_eq!(menu.highlight(4, 200, true), 1.);
        assert!(!menu.animating(200, true));
    }
    #[test]
    fn quality_waits_for_ack_failure_stays_and_stale_success_cannot_close_a_new_menu() {
        let mut menu = Menu::default();
        menu.open(Some(Quality::Balanced), 0);
        let session = menu.generation();
        assert!(!menu.saved(session, false, 20));
        assert!(menu.is_open());
        assert!(menu.hint.is_some());
        assert!(menu.saved(session, true, 30));
        assert!(!menu.is_open());
        menu.open(Some(Quality::Saver), 40);
        assert!(!menu.saved(session, true, 50));
        assert_eq!(menu.key("enter"), Some(Action::Quality(Quality::Saver)));
        assert!(menu.is_open());
    }
    #[test]
    fn menu_lock_does_not_pause_terminal_expiry_and_release_uses_current_stage_and_pointer() {
        use crate::model::{Model, Stage};
        let mut model = Model::new(0, true);
        model.pointer(true, 0);
        model.state(Stage::Success, 1., 1);
        model.locks.menu = true;
        model.locks_changed(2);
        model.pointer(false, 3);
        model.tick(1600);
        assert_eq!(model.stage, Stage::Idle);
        assert!(model.target_full);
        model.locks.menu = false;
        model.locks_changed(1601);
        model.tick(1681);
        assert!(!model.target_full);
        model.state(Stage::Downloading, 0.5, 1700);
        model.locks.menu = true;
        model.locks_changed(1701);
        model.locks.menu = false;
        model.locks_changed(1702);
        model.tick(1800);
        assert!(model.target_full);
        assert_eq!(model.stage, Stage::Downloading);
    }
}
