//! A single application-owned summon registration, never an input monitor.
use ameow_next::shortcut::{ShortcutChord, ShortcutPlatform, ShortcutPreference};
use std::sync::{Arc, Mutex, atomic::{AtomicBool, AtomicU32, Ordering}};

#[cfg(target_os = "windows")]
#[path = "global_shortcut_windows.rs"]
mod platform;
#[cfg(target_os = "macos")]
#[path = "global_shortcut_macos.rs"]
mod platform;

#[derive(Default)]
pub struct Signal {
    pending: AtomicU32,
    waker: Mutex<Option<std::task::Waker>>,
}
impl Signal {
    fn notify(&self, id: u32) {
        self.pending.store(id, Ordering::Release);
        let waker = self.waker.lock().unwrap().take();
        if let Some(waker) = waker { waker.wake(); }
    }
    pub async fn next(&self) -> u32 {
        std::future::poll_fn(|cx| {
            let mut waker = self.waker.lock().unwrap();
            match self.pending.swap(0, Ordering::AcqRel) {
                0 => { *waker = Some(cx.waker().clone()); std::task::Poll::Pending }
                id => std::task::Poll::Ready(id),
            }
        }).await
    }
}

struct Registration {
    _native: platform::Registration,
    id: u32,
    active: Arc<AtomicBool>,
    chord: ShortcutChord,
}
impl Registration {
    fn new(chord: ShortcutChord, signal: Arc<Signal>) -> Result<Self, String> {
        chord.validate().map_err(str::to_owned)?;
        if chord.platform != ShortcutPlatform::current() { return Err("platform".into()); }
        static NEXT_ID: AtomicU32 = AtomicU32::new(1);
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        let active = Arc::new(AtomicBool::new(false));
        let native = platform::Registration::new(&chord, signal, active.clone(), id)?;
        Ok(Self { _native: native, id, active, chord })
    }
    fn set_active(&self, value: bool) { self.active.store(value, Ordering::Release); }
}
impl Drop for Registration {
    fn drop(&mut self) { self.set_active(false); }
}

struct Pending {
    preference: ShortcutPreference,
    candidate: Option<Registration>,
}

#[derive(Default)]
pub struct Controller {
    pub signal: Arc<Signal>,
    preference: Option<ShortcutPreference>,
    active: Option<Registration>,
    pending: Option<Pending>,
    suspended: bool,
    stopped: bool,
    restore_error: Option<String>,
    pub error: Option<String>,
}
impl Controller {
    pub fn observe(&mut self, preference: &ShortcutPreference) {
        if self.stopped || self.preference.as_ref() == Some(preference) || self.pending.is_some() { return; }
        self.preference = Some(preference.clone());
        self.restore();
    }
    fn restore(&mut self) {
        self.active = None;
        self.signal.pending.store(0, Ordering::Release);
        self.error = None;
        self.restore_error = None;
        if self.suspended || self.stopped { return; }
        if let Some(chord) = self.preference.as_ref().and_then(|preference| preference.chord.clone()) {
            match Registration::new(chord, self.signal.clone()) {
                Ok(registration) => { registration.set_active(true); self.active = Some(registration); }
                Err(error) => { self.restore_error = Some(error.clone()); self.error = Some(error); }
            }
        }
    }
    pub fn suspend(&mut self) {
        self.suspended = true;
        self.active = None;
        self.signal.pending.store(0, Ordering::Release);
        self.error = None;
        self.restore_error = None;
    }
    pub fn resume(&mut self) {
        if self.suspended { self.suspended = false; self.restore(); }
        else if self.active.is_some() { self.error = None; }
    }
    pub fn prepare(&mut self, preference: ShortcutPreference) -> Result<(), String> {
        if self.stopped || self.pending.is_some() { return Err("busy".into()); }
        preference.validate().map_err(str::to_owned)?;
        self.resume();
        let reuse = self.active.as_ref().is_some_and(|active| preference.chord.as_ref() == Some(&active.chord));
        let candidate = match &preference.chord {
            Some(chord) if !reuse => match Registration::new(chord.clone(), self.signal.clone()) {
                Ok(registration) => Some(registration),
                Err(error) => {
                    let error = if self.restore_error.is_some() {
                        if error == "taken" { "taken-restore".into() } else { "register-restore".into() }
                    } else { error };
                    self.error = Some(error.clone()); return Err(error);
                }
            },
            _ => None,
        };
        self.pending = Some(Pending { preference, candidate });
        if let Some(active) = &self.active { active.set_active(false); }
        self.signal.pending.store(0, Ordering::Release);
        self.error = None;
        Ok(())
    }
    pub fn complete(&mut self, saved: bool) {
        let Some(pending) = self.pending.take() else {
            if matches!(self.error.as_deref(), Some("save" | "save-restore")) { self.error = self.restore_error.clone(); }
            return;
        };
        if !saved {
            // Release a candidate first, including one that uses the old chord.
            drop(pending.candidate);
            if self.active.is_none() { self.restore(); }
            if let Some(active) = &self.active { active.set_active(true); }
            self.error = Some(if self.restore_error.is_some() { "save-restore" } else { "save" }.into()); return;
        }
        if let Some(candidate) = pending.candidate {
            self.active = Some(candidate);
        } else if pending.preference.chord.is_none() { self.active = None; }
        self.preference = Some(pending.preference);
        if let Some(active) = &self.active { active.set_active(true); }
        self.error = None;
        self.restore_error = None;
    }
    pub fn accepts(&self, id: u32) -> bool {
        !self.stopped && !self.suspended && self.pending.is_none() && self.active.as_ref().is_some_and(|r| r.id == id)
    }
    pub fn stop(&mut self) {
        self.stopped = true;
        self.active = None; self.pending = None;
        self.restore_error = None;
        self.signal.pending.store(0, Ordering::Release);
    }
    pub fn is_pending(&self) -> bool { self.pending.is_some() }
    pub fn is_suspended(&self) -> bool { self.suspended }
    #[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
    pub fn is_active(&self) -> bool { self.active.is_some() }
}

pub fn focused(native: &crate::native::Native) -> bool {
    #[cfg(target_os = "windows")]
    { unsafe { windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow() == native.hwnd } }
    #[cfg(target_os = "macos")]
    { native.hwnd.window().is_some_and(|window| window.isKeyWindow()) }
}

pub fn record(event: &gpui::KeyDownEvent) -> Result<ShortcutChord, String> {
    let key = event.keystroke.key.to_ascii_lowercase();
    if event.is_held || event.prefer_character_input { return Err("unsupported".into()); }
    let m = event.keystroke.modifiers;
    let chord = ShortcutChord {
        platform: ShortcutPlatform::current(), key: key.clone(),
        key_code: platform::record_key(&key).ok_or("unsupported")?,
        control: m.control, alt: m.alt, shift: m.shift, command: m.platform,
    };
    chord.validate().map_err(str::to_owned)?;
    Ok(chord)
}

pub fn error_text(error: &str, language: crate::ui_text::Language) -> String {
    let text = match error {
        "unsupported" => language.text("请使用修饰键与字母、数字或 F1–F11", "Use modifiers with a letter, number or F1–F11"),
        "reserved" => language.text("该组合用于常用系统操作，请换一个", "Choose a different combination for this system shortcut"),
        "platform" => language.text("请在本机重新录入组合键", "Record the shortcut on this computer"),
        "taken" => language.text("组合已被占用", "Shortcut is in use"),
        "save" => language.text("保存失败，已保留原设置", "Could not save. Previous settings retained"),
        "save-restore" => language.text("保存失败；原快捷键不可用", "Save failed; previous shortcut unavailable"),
        "taken-restore" => language.text("新组合已被占用；原快捷键也不可用", "New shortcut is in use; previous shortcut is also unavailable"),
        "register-restore" => language.text("注册失败；原快捷键也不可用", "Registration failed; previous shortcut unavailable"),
        "busy" => language.text("正在保存，请稍后重试", "Saving. Try again shortly"),
        _ => language.text("无法注册此组合", "Could not register this shortcut"),
    };
    text.into()
}
