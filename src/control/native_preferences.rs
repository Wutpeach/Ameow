//! Request native shortcut registration on the desktop owner before saving.
use crate::shortcut::ShortcutPreference;
use std::{
    sync::{Arc, Condvar, Mutex},
    time::{Duration, Instant},
};

const DEADLINE: Duration = Duration::from_secs(5);

pub enum Action {
    Prepare(Option<ShortcutPreference>),
    Complete {
        saved: bool,
        settings: Option<(crate::download::settings::Settings, u64)>,
    },
}
struct State {
    result: Option<Result<(), String>>,
    expired: bool,
}
pub struct Request {
    action: Action,
    state: Arc<(Mutex<State>, Condvar)>,
}
impl Request {
    /// Process on the native UI owner. A timed-out preparation cannot register late.
    pub fn process(self, apply: impl FnOnce(Action) -> Result<(), String>) {
        let (lock, ready) = &*self.state;
        let mut state = lock.lock().unwrap();
        if state.expired && matches!(&self.action, Action::Prepare(_)) {
            return;
        }
        state.result = Some(apply(self.action));
        ready.notify_one();
    }
}

#[derive(Clone)]
pub struct Handle {
    send: Arc<dyn Fn(Request) -> Result<(), String> + Send + Sync>,
}
impl Handle {
    pub fn new(send: impl Fn(Request) -> Result<(), String> + Send + Sync + 'static) -> Self {
        Self {
            send: Arc::new(send),
        }
    }
    fn call(&self, action: Action) -> Result<(), String> {
        let state = Arc::new((
            Mutex::new(State {
                result: None,
                expired: false,
            }),
            Condvar::new(),
        ));
        (self.send)(Request {
            action,
            state: state.clone(),
        })?;
        let deadline = Instant::now() + DEADLINE;
        let (lock, ready) = &*state;
        let mut guard = lock.lock().map_err(|_| "E_SHORTCUT_OWNER".to_owned())?;
        loop {
            if let Some(result) = guard.result.take() {
                return result;
            }
            let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
                guard.expired = true;
                return Err("E_SHORTCUT_OWNER_TIMEOUT".into());
            };
            guard = ready
                .wait_timeout(guard, remaining)
                .map_err(|_| "E_SHORTCUT_OWNER".to_owned())?
                .0;
        }
    }
    pub fn begin(&self) -> Result<(), String> {
        self.call(Action::Prepare(None))
    }
    pub fn prepare(&self, preference: ShortcutPreference) -> Result<(), String> {
        self.call(Action::Prepare(Some(preference)))
    }
    pub fn complete(
        &self,
        saved: bool,
        settings: Option<(crate::download::settings::Settings, u64)>,
    ) -> Result<(), String> {
        self.call(Action::Complete { saved, settings })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn expired_prepare_cannot_apply_after_caller_has_left() {
        let state = Arc::new((
            Mutex::new(State {
                result: None,
                expired: true,
            }),
            Condvar::new(),
        ));
        let request = Request {
            action: Action::Prepare(Some(ShortcutPreference { chord: None })),
            state,
        };
        request.process(|_| panic!("expired preparation registered a shortcut"));
    }
    #[test]
    fn expired_completion_still_releases_registration() {
        let state = Arc::new((
            Mutex::new(State {
                result: None,
                expired: true,
            }),
            Condvar::new(),
        ));
        let request = Request {
            action: Action::Complete {
                saved: false,
                settings: None,
            },
            state: state.clone(),
        };
        request.process(|action| {
            assert!(matches!(action, Action::Complete { saved: false, .. }));
            Ok(())
        });
        assert!(state.0.lock().unwrap().result.as_ref().unwrap().is_ok());
    }
}
