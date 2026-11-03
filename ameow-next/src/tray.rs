//! Native shell continuation and clipboard acknowledgements. No download lifecycle authority.
use std::{
    cell::Cell,
    collections::VecDeque,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use windows::{
    Win32::{
        Foundation::{GlobalFree, HANDLE, HINSTANCE, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM},
        Graphics::Gdi::{GetMonitorInfoW, MONITOR_DEFAULTTONEAREST, MONITORINFO, MonitorFromRect},
        System::{
            Com::CoTaskMemFree,
            DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData},
            LibraryLoader::GetModuleHandleW,
            Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalUnlock},
        },
        UI::{
            HiDpi::{GetDpiForMonitor, GetSystemMetricsForDpi, MDT_EFFECTIVE_DPI},
            Shell::{
                FOLDERID_Downloads, KF_FLAG_DEFAULT, NIF_ICON, NIF_MESSAGE, NIF_TIP, NIM_ADD,
                NIM_DELETE, NIM_MODIFY, NOTIFYICONDATAW, NOTIFYICONIDENTIFIER,
                SHGetKnownFolderPath, Shell_NotifyIconGetRect, Shell_NotifyIconW,
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
    TogglePopup,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TaskbarEdge {
    Left,
    Top,
    Right,
    Bottom,
}

/// Rectangles and placement coordinates are physical screen pixels.
pub struct PopupAnchor {
    pub icon: RECT,
    pub work: RECT,
    pub dpi: u32,
    pub edge: TaskbarEdge,
}
impl PopupAnchor {
    pub fn place(&self, width_logical: f32, height_logical: f32) -> POINT {
        let width = (width_logical * self.dpi as f32 / 96.0).round() as i32;
        let height = (height_logical * self.dpi as f32 / 96.0).round() as i32;
        let (x, y) = match self.edge {
            TaskbarEdge::Bottom => (
                self.icon.right - width,
                self.icon.top.min(self.work.bottom) - height,
            ),
            TaskbarEdge::Top => (self.icon.right - width, self.icon.bottom.max(self.work.top)),
            TaskbarEdge::Left => (
                self.icon.right.max(self.work.left),
                self.icon.bottom - height,
            ),
            TaskbarEdge::Right => (
                self.icon.left.min(self.work.right) - width,
                self.icon.bottom - height,
            ),
        };
        POINT {
            x: x.clamp(
                self.work.left,
                (self.work.right - width).max(self.work.left),
            ),
            y: y.clamp(
                self.work.top,
                (self.work.bottom - height).max(self.work.top),
            ),
        }
    }
}

fn taskbar_edge(icon: RECT, monitor: RECT, work: RECT) -> TaskbarEdge {
    let insets = [
        (TaskbarEdge::Bottom, monitor.bottom - work.bottom),
        (TaskbarEdge::Top, work.top - monitor.top),
        (TaskbarEdge::Left, work.left - monitor.left),
        (TaskbarEdge::Right, monitor.right - work.right),
    ];
    if let Some((edge, inset)) = insets.into_iter().max_by_key(|(_, inset)| *inset) {
        if inset > 0 {
            return edge;
        }
    }
    let x = icon.left + (icon.right - icon.left) / 2;
    let y = icon.top + (icon.bottom - icon.top) / 2;
    [
        (TaskbarEdge::Bottom, (monitor.bottom - y).abs()),
        (TaskbarEdge::Top, (y - monitor.top).abs()),
        (TaskbarEdge::Left, (x - monitor.left).abs()),
        (TaskbarEdge::Right, (monitor.right - x).abs()),
    ]
    .into_iter()
    .min_by_key(|(_, distance)| *distance)
    .unwrap()
    .0
}

fn fallback_icon_rect(point: POINT, width: i32, height: i32) -> RECT {
    // A second click can be anywhere on the same icon, not just at its center.
    let width = width.max(1);
    let height = height.max(1);
    RECT {
        left: point.x.saturating_sub(width),
        top: point.y.saturating_sub(height),
        right: point.x.saturating_add(width).saturating_add(1),
        bottom: point.y.saturating_add(height).saturating_add(1),
    }
}
struct State {
    language: Cell<crate::ui_text::Language>,
    events: Arc<Mutex<VecDeque<TrayEvent>>>,
    taskbar_created: u32,
}
pub struct Tray {
    hwnd: HWND,
    state: Box<State>,
}
fn icon(hwnd: HWND, language: crate::ui_text::Language) -> NOTIFYICONDATAW {
    let mut data = NOTIFYICONDATAW {
        cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
        hWnd: hwnd,
        uID: 1,
        uFlags: NIF_ICON | NIF_MESSAGE | NIF_TIP,
        uCallbackMessage: CALLBACK,
        ..Default::default()
    };
    data.hIcon = unsafe { LoadIconW(None, IDI_APPLICATION) }.unwrap_or_default();
    for (dest, value) in data.szTip.iter_mut().zip(
        language
            .text("Ameow · 下载继续运行", "Ameow · Running in background")
            .encode_utf16(),
    ) {
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
                let _ = Shell_NotifyIconW(NIM_ADD, &icon(hwnd, state.language.get()));
            }
            if message == CALLBACK {
                match lp.0 as u32 {
                    WM_LBUTTONUP | WM_LBUTTONDBLCLK => state
                        .events
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .push_back(TrayEvent::Restore),
                    WM_RBUTTONUP => state
                        .events
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .push_back(TrayEvent::TogglePopup),
                    _ => {}
                }
                return LRESULT(0);
            }
        }
        DefWindowProcW(hwnd, message, wp, lp)
    }
}
impl Tray {
    pub fn popup_anchor(&self) -> PopupAnchor {
        unsafe {
            let identifier = NOTIFYICONIDENTIFIER {
                cbSize: std::mem::size_of::<NOTIFYICONIDENTIFIER>() as u32,
                hWnd: self.hwnd,
                uID: 1,
                ..Default::default()
            };
            let shell_icon = Shell_NotifyIconGetRect(&identifier)
                .ok()
                .filter(|rect| rect.right > rect.left && rect.bottom > rect.top);
            let cursor = if shell_icon.is_none() {
                let mut point = POINT::default();
                let _ = GetCursorPos(&mut point);
                Some(point)
            } else {
                None
            };
            let monitor_rect = shell_icon.unwrap_or_else(|| {
                let point = cursor.unwrap();
                RECT {
                    left: point.x,
                    top: point.y,
                    right: point.x,
                    bottom: point.y,
                }
            });
            let monitor = MonitorFromRect(&monitor_rect, MONITOR_DEFAULTTONEAREST);
            let mut info = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if !GetMonitorInfoW(monitor, &mut info).as_bool() {
                info.rcMonitor = RECT {
                    left: 0,
                    top: 0,
                    right: GetSystemMetrics(SM_CXSCREEN),
                    bottom: GetSystemMetrics(SM_CYSCREEN),
                };
                info.rcWork = info.rcMonitor;
            }
            let (mut dpi, mut dpi_y) = (96, 96);
            if GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dpi, &mut dpi_y).is_err()
                || dpi == 0
            {
                dpi = 96;
            }
            let icon = shell_icon.unwrap_or_else(|| {
                fallback_icon_rect(
                    cursor.unwrap(),
                    GetSystemMetricsForDpi(SM_CXSMICON, dpi),
                    GetSystemMetricsForDpi(SM_CYSMICON, dpi),
                )
            });
            PopupAnchor {
                icon,
                work: info.rcWork,
                dpi,
                edge: taskbar_edge(icon, info.rcMonitor, info.rcWork),
            }
        }
    }
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
                language: Cell::new(crate::ui_text::SystemPreferences::read().language),
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
            if !Shell_NotifyIconW(NIM_ADD, &icon(hwnd, state.language.get())).as_bool() {
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
    pub fn set_language(&mut self, language: crate::ui_text::Language) {
        if self.state.language.replace(language) != language {
            unsafe {
                let _ = Shell_NotifyIconW(NIM_MODIFY, &icon(self.hwnd, language));
            }
        }
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
            let _ = Shell_NotifyIconW(NIM_DELETE, &icon(self.hwnd, self.state.language.get()));
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fallback_icon_has_usable_hit_area_even_for_tiny_metrics() {
        let point = POINT { x: -100, y: 25 };
        let rect = fallback_icon_rect(point, 24, 24);
        assert_eq!(
            rect,
            RECT {
                left: -124,
                top: 1,
                right: -75,
                bottom: 50
            }
        );
        let tiny = fallback_icon_rect(point, 0, -1);
        assert!(tiny.left < point.x && point.x < tiny.right);
        assert!(tiny.top < point.y && point.y < tiny.bottom);
    }

    #[test]
    fn tray_placement_obeys_work_area_and_dpi_on_each_edge() {
        let monitor = RECT {
            left: -1920,
            top: 0,
            right: 0,
            bottom: 1080,
        };
        let cases = [
            (
                TaskbarEdge::Bottom,
                RECT {
                    left: -1920,
                    top: 0,
                    right: 0,
                    bottom: 1040,
                },
                RECT {
                    left: -80,
                    top: 1040,
                    right: -60,
                    bottom: 1060,
                },
                POINT { x: -468, y: 671 },
            ),
            (
                TaskbarEdge::Top,
                RECT {
                    left: -1920,
                    top: 40,
                    right: 0,
                    bottom: 1080,
                },
                RECT {
                    left: -80,
                    top: 0,
                    right: -60,
                    bottom: 40,
                },
                POINT { x: -468, y: 40 },
            ),
            (
                TaskbarEdge::Left,
                RECT {
                    left: -1880,
                    top: 0,
                    right: 0,
                    bottom: 1080,
                },
                RECT {
                    left: -1920,
                    top: 980,
                    right: -1880,
                    bottom: 1000,
                },
                POINT { x: -1880, y: 631 },
            ),
            (
                TaskbarEdge::Right,
                RECT {
                    left: -1920,
                    top: 0,
                    right: -40,
                    bottom: 1080,
                },
                RECT {
                    left: -40,
                    top: 980,
                    right: 0,
                    bottom: 1000,
                },
                POINT { x: -448, y: 631 },
            ),
        ];
        for (edge, work, icon, expected) in cases {
            assert_eq!(taskbar_edge(icon, monitor, work), edge);
            let anchor = PopupAnchor {
                icon,
                work,
                dpi: 144,
                edge,
            };
            assert_eq!(anchor.place(272.0, 246.0), expected);
        }
    }

    #[test]
    fn oversized_popup_is_clamped_to_work_origin() {
        let work = RECT {
            left: 10,
            top: 20,
            right: 110,
            bottom: 120,
        };
        let anchor = PopupAnchor {
            icon: work,
            work,
            dpi: 96,
            edge: TaskbarEdge::Bottom,
        };
        assert_eq!(anchor.place(272.0, 246.0), POINT { x: 10, y: 20 });
    }

    #[test]
    fn overflow_icon_is_not_covered_when_there_is_room() {
        let work = RECT {
            left: 0,
            top: 0,
            right: 2560,
            bottom: 1400,
        };
        let icon = RECT {
            left: 2074,
            top: 1232,
            right: 2114,
            bottom: 1272,
        };
        let anchor = PopupAnchor {
            icon,
            work,
            dpi: 96,
            edge: TaskbarEdge::Bottom,
        };
        let position = anchor.place(272.0, 224.0);
        assert_eq!(position, POINT { x: 1842, y: 1008 });
        assert!(position.y + 224 <= icon.top);

        let anchor = PopupAnchor {
            edge: TaskbarEdge::Right,
            ..anchor
        };
        let position = anchor.place(272.0, 224.0);
        assert!(position.x + 272 <= icon.left);
    }
}
