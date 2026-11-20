use super::{ShortcutChord, Signal};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use windows::{core::w, Win32::{Foundation::{HWND, LPARAM, LRESULT, WPARAM, HINSTANCE},
    System::LibraryLoader::GetModuleHandleW, UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*}}};

struct State { signal: Arc<Signal>, active: Arc<AtomicBool>, id: u32 }
pub struct Registration { hwnd: HWND, _state: Box<State> }
unsafe extern "system" fn procedure(hwnd: HWND, message: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    unsafe {
        if message == WM_NCCREATE {
            let create = &*(lp.0 as *const CREATESTRUCTW);
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, create.lpCreateParams as isize);
        }
        if message == WM_HOTKEY {
            if let Some(state) = (GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *const State).as_ref()
                && state.active.load(Ordering::Acquire) { state.signal.notify(state.id); }
            return LRESULT(0);
        }
        DefWindowProcW(hwnd, message, wp, lp)
    }
}
impl Registration {
    pub fn new(chord: &ShortcutChord, signal: Arc<Signal>, active: Arc<AtomicBool>, id: u32) -> Result<Self, String> {
        unsafe {
            let instance = HINSTANCE(GetModuleHandleW(None).map_err(|e| e.to_string())?.0);
            let class = WNDCLASSW { lpfnWndProc: Some(procedure), hInstance: instance,
                lpszClassName: w!("AmeowSummonShortcut"), ..Default::default() };
            // The class is shared by old and candidate registrations on this GUI thread.
            RegisterClassW(&class);
            let mut state = Box::new(State { signal, active, id });
            let hwnd = CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, class.lpszClassName,
                w!("Ameow shortcut owner"), WINDOW_STYLE::default(), 0, 0, 0, 0,
                None, None, Some(instance), Some((&mut *state as *mut State).cast()))
                .map_err(|error| error.to_string())?;
            let mut modifiers = MOD_NOREPEAT;
            if chord.control { modifiers |= MOD_CONTROL; }
            if chord.alt { modifiers |= MOD_ALT; }
            if chord.shift { modifiers |= MOD_SHIFT; }
            if let Err(error) = RegisterHotKey(Some(hwnd), 1, modifiers, chord.key_code as u32) {
                SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
                let _ = DestroyWindow(hwnd);
                return Err(if error.code().0 as u32 == 0x80070581 { "taken".into() } else { error.to_string() });
            }
            Ok(Self { hwnd, _state: state })
        }
    }
}
impl Drop for Registration {
    fn drop(&mut self) {
        unsafe {
            if let Err(error) = UnregisterHotKey(Some(self.hwnd), 1) { eprintln!("Shortcut unregister: {error}"); }
            SetWindowLongPtrW(self.hwnd, GWLP_USERDATA, 0);
            if let Err(error) = DestroyWindow(self.hwnd) { eprintln!("Shortcut owner: {error}"); }
        }
    }
}
pub fn record_key(key: &str) -> Option<u16> { ShortcutChord::windows_key(key) }
