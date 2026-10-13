//! Native shell continuation and clipboard acknowledgements. No download lifecycle authority.
use std::{
    collections::VecDeque,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use windows::{
    Win32::{
        Foundation::{GlobalFree, HANDLE, HINSTANCE, HWND, LPARAM, LRESULT, POINT, WPARAM},
        System::{
            Com::CoTaskMemFree,
            DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData},
            LibraryLoader::GetModuleHandleW,
            Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalUnlock},
        },
        UI::{
            Shell::{
                FOLDERID_Downloads, KF_FLAG_DEFAULT, NIF_ICON, NIF_MESSAGE, NIF_TIP, NIM_ADD,
                NIM_DELETE, NOTIFYICONDATAW, SHGetKnownFolderPath, Shell_NotifyIconW,
            },
            WindowsAndMessaging::*,
        },
    },
    core::w,
};
const CALLBACK: u32 = WM_APP + 23;
#[derive(Clone, Copy)]
pub enum TrayEvent {
    Restore,
    Exit,
}
struct State {
    events: Arc<Mutex<VecDeque<TrayEvent>>>,
    taskbar_created: u32,
}
pub struct Tray {
    hwnd: HWND,
    state: Box<State>,
}
fn icon(hwnd: HWND) -> NOTIFYICONDATAW {
    let mut data = NOTIFYICONDATAW {
        cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
        hWnd: hwnd,
        uID: 1,
        uFlags: NIF_ICON | NIF_MESSAGE | NIF_TIP,
        uCallbackMessage: CALLBACK,
        ..Default::default()
    };
    data.hIcon = unsafe { LoadIconW(None, IDI_APPLICATION) }.unwrap_or_default();
    for (dest, value) in data
        .szTip
        .iter_mut()
        .zip("Ameow · 下载继续运行".encode_utf16())
    {
        *dest = value;
    }
    data
}
unsafe extern "system" fn window_proc(hwnd: HWND, message: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    unsafe {
        if message == WM_NCCREATE {
            let create = &*(lp.0 as *const CREATESTRUCTW);
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, create.lpCreateParams as isize);
        }
        let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *const State;
        if let Some(state) = ptr.as_ref() {
            if state.taskbar_created != 0 && message == state.taskbar_created {
                let _ = Shell_NotifyIconW(NIM_ADD, &icon(hwnd));
            }
            if message == CALLBACK {
                match lp.0 as u32 {
                    WM_LBUTTONUP | WM_LBUTTONDBLCLK => state
                        .events
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .push_back(TrayEvent::Restore),
                    WM_RBUTTONUP | WM_CONTEXTMENU => {
                        if let Ok(menu) = CreatePopupMenu() {
                            let _ = AppendMenuW(menu, MF_STRING, 1, w!("打开 Ameow"));
                            let _ = AppendMenuW(menu, MF_STRING, 2, w!("退出 Ameow"));
                            let mut point = POINT::default();
                            let _ = GetCursorPos(&mut point);
                            let _ = SetForegroundWindow(hwnd);
                            let chosen = TrackPopupMenu(
                                menu,
                                TPM_RETURNCMD | TPM_NONOTIFY | TPM_RIGHTBUTTON,
                                point.x,
                                point.y,
                                None,
                                hwnd,
                                None,
                            )
                            .0;
                            let _ = DestroyMenu(menu);
                            let event = match chosen {
                                1 => Some(TrayEvent::Restore),
                                2 => Some(TrayEvent::Exit),
                                _ => None,
                            };
                            if let Some(event) = event {
                                state
                                    .events
                                    .lock()
                                    .unwrap_or_else(|e| e.into_inner())
                                    .push_back(event);
                            }
                            let _ = PostMessageW(Some(hwnd), WM_NULL, WPARAM(0), LPARAM(0));
                        }
                    }
                    _ => {}
                }
                return LRESULT(0);
            }
        }
        DefWindowProcW(hwnd, message, wp, lp)
    }
}
impl Tray {
    pub fn new() -> Result<Self, String> {
        unsafe {
            let instance = HINSTANCE(GetModuleHandleW(None).map_err(|_| "无法取得托盘模块")?.0);
            let class = WNDCLASSW {
                lpfnWndProc: Some(window_proc),
                hInstance: instance,
                lpszClassName: w!("AmeowNextTrayOwner"),
                ..Default::default()
            };
            if RegisterClassW(&class) == 0 {
                return Err("无法创建托盘窗口类".into());
            }
            let mut state = Box::new(State {
                events: Arc::new(Mutex::new(VecDeque::new())),
                taskbar_created: RegisterWindowMessageW(w!("TaskbarCreated")),
            });
            // A hidden top-level window receives Explorer's TaskbarCreated broadcast.
            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                class.lpszClassName,
                w!("Ameow tray"),
                WINDOW_STYLE::default(),
                0,
                0,
                0,
                0,
                None,
                None,
                Some(instance),
                Some((&mut *state as *mut State).cast()),
            )
            .map_err(|_| "无法创建托盘入口")?;
            if !Shell_NotifyIconW(NIM_ADD, &icon(hwnd)).as_bool() {
                let _ = DestroyWindow(hwnd);
                return Err("托盘入口不可用，请保持窗口打开".into());
            }
            Ok(Self { hwnd, state })
        }
    }
    pub fn poll(&self) -> Vec<TrayEvent> {
        self.state
            .events
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .drain(..)
            .collect()
    }
    pub fn hide(hwnd: HWND) {
        unsafe {
            let _ = ShowWindow(hwnd, SW_HIDE);
        }
    }
    pub fn restore(hwnd: HWND) {
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOWNORMAL);
            let _ = SetForegroundWindow(hwnd);
        }
    }
}
impl Drop for Tray {
    fn drop(&mut self) {
        unsafe {
            let _ = Shell_NotifyIconW(NIM_DELETE, &icon(self.hwnd));
            let _ = DestroyWindow(self.hwnd);
        }
    }
}
pub fn downloads_directory() -> Result<PathBuf, String> {
    unsafe {
        let path = SHGetKnownFolderPath(&FOLDERID_Downloads, KF_FLAG_DEFAULT, None)
            .map_err(|_| "无法读取默认下载目录，请重新打开 Ameow")?;
        let result = path
            .to_string()
            .map(PathBuf::from)
            .map_err(|_| "无法读取默认下载目录".into());
        CoTaskMemFree(Some(path.0.cast()));
        result
    }
}
pub fn copy_text(hwnd: HWND, text: &str) -> Result<(), String> {
    let utf16: Vec<u16> = text.encode_utf16().chain(Some(0)).collect();
    unsafe {
        let memory = GlobalAlloc(GMEM_MOVEABLE, utf16.len() * 2).map_err(|_| "无法准备诊断复制")?;
        let pointer = GlobalLock(memory);
        if pointer.is_null() {
            let _ = GlobalFree(Some(memory));
            return Err("无法准备诊断复制".into());
        }
        std::ptr::copy_nonoverlapping(utf16.as_ptr(), pointer.cast::<u16>(), utf16.len());
        let _ = GlobalUnlock(memory);
        if OpenClipboard(Some(hwnd)).is_err() {
            let _ = GlobalFree(Some(memory));
            return Err("剪贴板忙，请重试复制".into());
        }
        let result = EmptyClipboard().and_then(|_| SetClipboardData(13, Some(HANDLE(memory.0)))); // CF_UNICODETEXT
        let _ = CloseClipboard();
        if result.is_err() {
            let _ = GlobalFree(Some(memory));
            return Err("诊断未复制，请重试".into());
        }
        // Windows now owns the memory. Only successful SetClipboardData permits feedback.
        Ok(())
    }
}
