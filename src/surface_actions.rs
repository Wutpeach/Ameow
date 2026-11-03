//! Eligibility belongs to the background hit target, not Windows' global click count.
#[derive(Default)]
pub struct BackgroundClicks {
    first: Option<(u64, [f32; 2])>,
    pressed: Option<([f32; 2], bool)>,
}
impl BackgroundClicks {
    pub fn reset(&mut self) {
        self.first = None;
        self.pressed = None;
    }
    pub fn motion(&mut self, at:[f32;2]) {
        if self.pressed.is_some_and(|(down,_)|distance(down,at)>4.) {self.reset();}
    }
    pub fn press(&mut self, now: u64, at: [f32; 2], count: usize, eligible: bool) -> bool {
        if !eligible {
            self.reset();
            return false;
        }
        let paired = count == 2
            && self
                .first
                .is_some_and(|(when, p)| now.saturating_sub(when) <= 500 && distance(p, at) <= 4.);
        self.pressed = Some((at, paired));
        if !paired {
            self.first = None;
        }
        paired
    }
    pub fn release(&mut self, now: u64, at: [f32; 2], eligible: bool) -> bool {
        let Some((down, paired)) = self.pressed.take() else {
            return false;
        };
        if !eligible || distance(down, at) > 4. {
            self.reset();
            return false;
        }
        if paired {
            self.first = None;
            true
        } else {
            self.first = Some((now, at));
            false
        }
    }
}
fn distance(a: [f32; 2], b: [f32; 2]) -> f32 {
    (a[0] - b[0]).hypot(a[1] - b[1])
}
/// Only cardinality is decided on the UI thread. The settings owner validates the filesystem.
pub fn single_drop(paths: &[std::path::PathBuf]) -> Option<std::path::PathBuf> {
    if paths.len() == 1 {
        Some(paths[0].clone())
    } else {
        None
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn save_pending_between_clicks_or_before_release_retires_the_pair() {
        for pending_before_second_press in [true, false] {
            let mut clicks = BackgroundClicks::default();
            clicks.press(0, [20., 30.], 1, true);
            assert!(!clicks.release(20, [20., 30.], true));
            clicks.press(100, [20., 30.], 2, !pending_before_second_press);
            assert!(!clicks.release(120, [20., 30.], false));
            clicks.press(200, [20., 30.], 2, true);
            assert!(!clicks.release(220, [20., 30.], true));
        }
    }
    #[test]
    fn second_press_move_away_and_back_cannot_open() {
        let mut c=BackgroundClicks::default();c.press(0,[20.,30.],1,true);assert!(!c.release(20,[20.,30.],true));
        assert!(c.press(100,[20.,30.],2,true));c.motion([35.,30.]);c.motion([20.,30.]);
        assert!(!c.release(150,[20.,30.],true));
    }
    #[test]
    fn only_two_completed_eligible_background_clicks_open() {
        let mut c = BackgroundClicks::default();
        c.press(0, [20., 30.], 1, true);
        assert!(!c.release(20, [20., 30.], true));
        c.press(100, [20., 30.], 2, true);
        assert!(c.release(120, [20., 30.], true));
    }
    #[test]
    fn control_first_compact_locks_and_drag_cannot_open() {
        let mut c = BackgroundClicks::default();
        c.press(0, [20., 30.], 1, false);
        c.press(100, [20., 30.], 2, true);
        assert!(!c.release(120, [20., 30.], true));
        c.reset();
        c.press(0, [20., 30.], 1, true);
        assert!(!c.release(20, [30., 30.], true));
        c.press(100, [30., 30.], 2, true);
        assert!(!c.release(120, [30., 30.], true));
        c.press(200, [30., 30.], 2, false);
        assert!(!c.release(220, [30., 30.], true));
    }
    #[test]
    fn only_one_filesystem_candidate_is_admitted_to_validation() {
        assert!(single_drop(&[]).is_none());
        assert!(single_drop(&["a".into(), "b".into()]).is_none());
        assert_eq!(single_drop(&["a".into()]), Some("a".into()));
    }
}
