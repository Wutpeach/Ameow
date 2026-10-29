//! Main-Surface menu state. No native windows, input polling, or settings authority.
use ameow_next::download::request::Quality;
pub const FADE_MS: u64 = 140;
pub const PAGE_MS: u64 = 190;
pub const HOVER_MS: u64 = 90;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Page {
    Primary,
    Quality,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    Back,
    OpenQuality,
    Quality(Quality),
    Hide,
    Settings,
}
#[derive(Default)]
pub struct Menu {
    pub page: Option<Page>,
    pub selected: usize,
    pub hint: Option<String>,
    generation: u64,
    content_at: Option<u64>,
    previous: Option<(Page, u64, f32)>,
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
        self.page.is_some()
    }
    pub fn generation(&self) -> u64 {
        self.generation
    }
    pub fn name(&self) -> &'static str {
        match self.page {
            None => "closed",
            Some(Page::Primary) => "primary",
            Some(Page::Quality) => "quality",
        }
    }
    pub fn open(&mut self, now: u64) {
        self.generation += 1;
        self.page = Some(Page::Primary);
        self.content_at = Some(now);
        self.previous = None;
        self.reset_selection();
    }
    pub fn close(&mut self, now: u64) {
        if self.page.take().is_some() {
            self.generation += 1;
            self.content_at = Some(now);
        }
        self.previous = None;
        self.reset_selection();
    }
    /// Acknowledgements from an earlier closed menu cannot dismiss a newer session.
    pub fn saved(&mut self, generation: u64, success: bool, now: u64) -> bool {
        if !self.is_open() || self.generation != generation {
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
    pub fn quality(&mut self, current: Option<Quality>, now: u64) {
        if self.page != Some(Page::Primary) {
            return;
        }
        self.previous = Some((Page::Primary, now, 1.));
        self.page = Some(Page::Quality);
        self.reset_selection();
        self.selected = match current {
            Some(Quality::Balanced) => 1,
            Some(Quality::Saver) => 2,
            _ => 0,
        };
    }
    /// Returns true only when Back closes the primary page.
    pub fn back(&mut self, now: u64) -> bool {
        match self.page {
            Some(Page::Quality) => {
                self.previous = Some((Page::Quality, now, -1.));
                self.page = Some(Page::Primary);
                self.reset_selection();
                false
            }
            Some(Page::Primary) => {
                self.close(now);
                true
            }
            None => false,
        }
    }
    pub fn row_count(_page: Page) -> usize {
        3
    }
    pub fn action(page: Page, index: usize) -> Option<Action> {
        match (page, index) {
            (Page::Primary, 0) => Some(Action::OpenQuality),
            (Page::Primary, 1) => Some(Action::Hide),
            (Page::Primary, 2) => Some(Action::Settings),
            (Page::Quality, 0) => Some(Action::Quality(Quality::Highest)),
            (Page::Quality, 1) => Some(Action::Quality(Quality::Balanced)),
            (Page::Quality, 2) => Some(Action::Quality(Quality::Saver)),
            _ => None,
        }
    }
    pub fn key(&mut self, key: &str) -> Option<Action> {
        let page = self.page?;
        let count = Self::row_count(page);
        match key {
            "escape" | "left" => return Some(Action::Back),
            "up" => {
                self.selected = (self.selected + count - 1) % count;
                self.keyboard = true;
            }
            "down" => {
                self.selected = (self.selected + 1) % count;
                self.keyboard = true;
            }
            "enter" | "space" => return Self::action(page, self.selected),
            "right" if page == Page::Primary && self.selected == 0 => {
                return Some(Action::OpenQuality);
            }
            _ => {}
        }
        None
    }
    pub fn hover(&mut self, index: usize, inside: bool, now: u64) {
        let next = if inside {
            Some(index)
        } else if self.hovered == Some(index) {
            None
        } else {
            self.hovered
        };
        if next == self.hovered {
            return;
        }
        self.old_hover = self.hovered;
        self.hovered = next;
        self.hover_at = now;
        if inside {
            self.selected = index;
            self.keyboard = false;
        }
    }
    pub fn highlight(&self, index: usize, now: u64, reduced: bool) -> f32 {
        if self.keyboard && self.selected == index {
            return 1.;
        }
        let t = ease(now, self.hover_at, HOVER_MS, reduced);
        if self.hovered == Some(index) {
            t
        } else if self.old_hover == Some(index) {
            1. - t
        } else {
            0.
        }
    }
    pub fn content_alpha(&self, now: u64, reduced: bool) -> f32 {
        self.content_at
            .map_or(1., |at| ease(now, at, FADE_MS, reduced))
    }
    /// Current page, optional outgoing page. Only the current page receives input.
    pub fn pages(&self, now: u64, reduced: bool) -> Vec<(Page, f32, bool)> {
        let Some(current) = self.page else {
            return Vec::new();
        };
        if let Some((previous, at, direction)) = self.previous {
            let t = ease(now, at, PAGE_MS, reduced);
            if t < 1. {
                return vec![
                    (previous, -direction * t * 176., false),
                    (current, direction * (1. - t) * 176., true),
                ];
            }
        }
        vec![(current, 0., true)]
    }
    pub fn animating(&self, now: u64, reduced: bool) -> bool {
        !reduced
            && (self.content_at.is_some_and(|at| now < at + FADE_MS)
                || self.previous.is_some_and(|(_, at, _)| now < at + PAGE_MS)
                || now < self.hover_at + HOVER_MS)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn escape_has_one_owner_and_back_preserves_the_open_session() {
        let mut menu = Menu::default();
        menu.open(10);
        let session = menu.generation();
        menu.quality(Some(Quality::Balanced), 20);
        assert_eq!(menu.name(), "quality");
        assert_eq!(menu.selected, 1);
        assert_eq!(menu.key("escape"), Some(Action::Back));
        assert!(!menu.back(30));
        assert_eq!(menu.name(), "primary");
        assert_eq!(menu.generation(), session);
        assert!(menu.back(40));
        assert_eq!(menu.name(), "closed");
        menu.open(50);
        assert_ne!(menu.generation(), session);
    }
    #[test]
    fn navigation_uses_the_current_page_and_has_no_exit_action() {
        let mut menu = Menu::default();
        menu.open(0);
        menu.key("down");
        assert_eq!(menu.key("enter"), Some(Action::Hide));
        menu.quality(Some(Quality::Highest), 20);
        menu.key("up");
        assert_eq!(menu.key("enter"), Some(Action::Quality(Quality::Saver)));
        assert_eq!(Menu::action(Page::Quality, 3), None);
        assert_eq!(Menu::action(Page::Primary, 3), None);
        menu.open(30);
        for _ in 0..3 { menu.key("down"); }
        assert_eq!(menu.selected, 0);
        assert_eq!(menu.key("enter"), Some(Action::OpenQuality));
    }
    #[test]
    fn transitions_only_move_content_reverse_direction_and_respect_reduced_motion() {
        let mut menu = Menu::default();
        menu.open(0);
        assert_eq!(menu.content_alpha(0, false), 0.);
        assert_eq!(menu.content_alpha(140, false), 1.);
        menu.quality(None, 200);
        assert_eq!(
            menu.pages(200, false),
            vec![(Page::Primary, 0., false), (Page::Quality, 176., true)]
        );
        assert_eq!(menu.pages(200, true), vec![(Page::Quality, 0., true)]);
        menu.back(400);
        assert_eq!(
            menu.pages(400, false),
            vec![(Page::Quality, 0., false), (Page::Primary, -176., true)]
        );
        assert!(!menu.animating(400, true));
        menu.close(600);
        assert_eq!(menu.content_alpha(600, true), 1.);
        assert!(!menu.is_open());
    }
    #[test]
    fn quality_waits_for_ack_failure_stays_and_stale_success_cannot_close_a_new_menu() {
        let mut menu = Menu::default();
        menu.open(0);
        menu.quality(None, 10);
        let session = menu.generation();
        assert_eq!(menu.name(), "quality");
        assert!(!menu.saved(session, false, 20));
        assert_eq!(menu.name(), "quality");
        assert!(menu.hint.is_some());
        assert!(menu.saved(session, true, 30));
        assert_eq!(menu.name(), "closed");
        menu.open(40);
        assert!(!menu.saved(session, true, 50));
        assert_eq!(menu.name(), "primary");
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
