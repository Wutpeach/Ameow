use super::{ShortcutChord, Signal};
use std::{cell::Cell, ffi::c_void, ptr, sync::{Arc, atomic::{AtomicBool, Ordering}}};

type Ref = *mut c_void;
#[repr(C, packed(2))]
#[derive(Clone, Copy, Default)]
struct HotKeyId { signature: u32, id: u32 }
#[repr(C, packed(2))]
struct EventType { class: u32, kind: u32 }
const SIGNATURE: u32 = u32::from_be_bytes(*b"Am59");
const KEYBOARD: u32 = u32::from_be_bytes(*b"keyb");

#[link(name = "Carbon", kind = "framework")]
unsafe extern "C" {
    fn GetApplicationEventTarget() -> Ref;
    fn InstallEventHandler(target: Ref, callback: Option<unsafe extern "C" fn(Ref, Ref, Ref) -> i32>,
        count: u64, types: *const EventType, data: Ref, handler: *mut Ref) -> i32;
    fn RemoveEventHandler(handler: Ref) -> i32;
    fn RegisterEventHotKey(code: u32, modifiers: u32, id: HotKeyId, target: Ref, options: u32, hotkey: *mut Ref) -> i32;
    fn UnregisterEventHotKey(hotkey: Ref) -> i32;
    fn GetEventKind(event: Ref) -> u32;
    fn GetEventParameter(event: Ref, name: u32, desired: u32, actual_type: *mut u32, size: u64, actual_size: *mut u64, data: Ref) -> i32;
}
struct State { signal: Arc<Signal>, active: Arc<AtomicBool>, id: u32, pressed: Cell<bool> }
pub struct Registration { hotkey: Ref, handler: Ref, state: Option<Box<State>> }
unsafe extern "C" fn callback(_: Ref, event: Ref, data: Ref) -> i32 {
    unsafe {
        let mut id = HotKeyId::default();
        if GetEventParameter(event, u32::from_be_bytes(*b"----"), u32::from_be_bytes(*b"hkid"),
            ptr::null_mut(), size_of::<HotKeyId>() as u64, ptr::null_mut(), (&mut id as *mut HotKeyId).cast()) != 0 { return -9874; }
        let state = &*(data as *const State);
        if id.signature != SIGNATURE || id.id != state.id { return -9874; }
        match GetEventKind(event) {
            5 => if !state.pressed.replace(true) && state.active.load(Ordering::Acquire) { state.signal.notify(state.id); },
            6 => state.pressed.set(false),
            _ => return -9874,
        }
        0
    }
}
impl Registration {
    pub fn new(chord: &ShortcutChord, signal: Arc<Signal>, active: Arc<AtomicBool>, id: u32) -> Result<Self, String> {
        let _ = crate::native::marker();
        unsafe {
            let mut state = Box::new(State { signal, active, id, pressed: Cell::new(false) });
            let types = [EventType { class: KEYBOARD, kind: 5 }, EventType { class: KEYBOARD, kind: 6 }];
            let mut handler = ptr::null_mut();
            let result = InstallEventHandler(GetApplicationEventTarget(), Some(callback), 2, types.as_ptr(),
                (&mut *state as *mut State).cast(), &mut handler);
            if result != 0 { return Err(format!("Carbon handler: {result}")); }
            let mut modifiers = 0;
            if chord.command { modifiers |= 256; }
            if chord.shift { modifiers |= 512; }
            if chord.alt { modifiers |= 2048; }
            if chord.control { modifiers |= 4096; }
            let mut hotkey = ptr::null_mut();
            let result = RegisterEventHotKey(chord.key_code as u32, modifiers, HotKeyId { signature: SIGNATURE, id },
                GetApplicationEventTarget(), 1, &mut hotkey);
            if result != 0 {
                if RemoveEventHandler(handler) != 0 {
                    // A surviving native callback must retain its inactive data.
                    Box::leak(state);
                }
                return Err(if result == -9878 { "taken".into() } else { format!("Carbon registration: {result}") });
            }
            Ok(Self { hotkey, handler, state: Some(state) })
        }
    }
}
impl Drop for Registration {
    fn drop(&mut self) {
        if let Some(state) = &self.state { state.active.store(false, Ordering::Release); }
        unsafe {
            let result = UnregisterEventHotKey(self.hotkey);
            if result != 0 { eprintln!("Shortcut unregister: {result}"); }
            let result = RemoveEventHandler(self.handler);
            if result != 0 {
                eprintln!("Shortcut handler: {result}");
                if let Some(state) = self.state.take() { Box::leak(state); }
            }
        }
    }
}
pub fn record_key(_: &str) -> Option<u16> {
    // Read only this app's current key event while its focused recorder handles it.
    objc2_app_kit::NSApplication::sharedApplication(crate::native::marker()).currentEvent().map(|event| event.keyCode())
}
