//! Minimal Windows adapter: exact borderless popup bounds, cursor and work area.
//! GPUI 0.2.2's resize is asynchronous and position-preserving; this atomic call
//! keeps the surface anchor and size on one trajectory without a renderer bridge.
use gpui::{App, Window};
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use std::{
    cell::{Cell, RefCell},
    fs::File,
    io::{BufWriter, Write},
    rc::Rc,
    time::Instant,
};
use windows::{
    Win32::{
        Foundation::{HWND, POINT, RECT},
        Graphics::Gdi::{
            GetMonitorInfoW, HMONITOR, MONITOR_DEFAULTTONEAREST, MONITORINFO, MonitorFromPoint,
            MonitorFromWindow,
        },
        UI::{
            HiDpi::GetDpiForWindow, Input::KeyboardAndMouse::GetAsyncKeyState,
            WindowsAndMessaging::*,
        },
    },
    core::Result,
};

pub struct Native {
    pub hwnd: HWND,
    last: Option<[i32; 4]>,
    latest: Rc<Cell<Option<[i32; 4]>>>,
    research: Rc<RefCell<NativeResearch>>,
    probe: String,
}

/// Opt-in CPU timing only. SetWindowPos includes synchronous GPUI resize callbacks;
/// these records are not measurements of GPU present or monitor scanout.
struct NativeResearch {
    clock: Instant,
    writer: Option<BufWriter<File>>,
    always_framechanged: bool,
    request_count: u64,
    apply_count: u64,
    skipped_count: u64,
    unchanged_count: u64,
    last_applied: Option<[i32; 4]>,
}
impl NativeResearch {
    fn emit(&mut self, event: &str) {
        if let Some(writer) = &mut self.writer {
            writeln!(writer, "{event}").expect("native research record");
            if (self.apply_count + self.skipped_count).is_multiple_of(64) {
                writer.flush().expect("native metrics flush");
            }
        }
    }
}
impl Drop for NativeResearch {
    fn drop(&mut self) {
        let summary = format!(
            r#"{{"type":"native_summary","requested":{},"applied":{},"skipped":{},"unchanged":{},"framechanged_always":{}}}"#,
            self.request_count,
            self.apply_count,
            self.skipped_count,
            self.unchanged_count,
            self.always_framechanged
        );
        self.emit(&summary);
        if let Some(writer) = &mut self.writer {
            let _ = writer.flush();
        }
    }
}
impl Native {
    pub fn attach(window: &Window) -> Self {
        let handle = HasWindowHandle::window_handle(window)
            .expect("GPUI HWND")
            .as_raw();
        let RawWindowHandle::Win32(handle) = handle else {
            panic!("Windows native prototype")
        };
        let hwnd = HWND(handle.hwnd.get() as *mut std::ffi::c_void);
        // TitlebarOptions.appears_transparent=false lets DefWindowProc handle the
        // WS_POPUP nonclient area; GPUI's transparent-titlebar insets are not used.
        unsafe {
            SetWindowLongPtrW(hwnd, GWL_STYLE, (WS_POPUP | WS_VISIBLE).0 as isize);
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
        Self {
            hwnd,
            last: None,
            latest: Rc::new(Cell::new(None)),
            research: Rc::new(RefCell::new(NativeResearch {
                clock: Instant::now(),
                writer: None,
                always_framechanged: true,
                request_count: 0,
                apply_count: 0,
                skipped_count: 0,
                unchanged_count: 0,
                last_applied: None,
            })),
            probe: "normal".into(),
        }
    }
    pub fn set_research(&mut self, frame_changed_always: bool, metrics_path: Option<String>) {
        let mut research = self.research.borrow_mut();
        research.always_framechanged = frame_changed_always;
        research.writer = metrics_path.map(|path| {
            BufWriter::with_capacity(256 * 1024, File::create(path).expect("native metrics file"))
        });
    }
    /// Diagnostic stimuli only, not product window behavior. Both controls follow
    /// the same size trajectory but constrain which native dimensions may change.
    pub fn set_probe(&mut self, probe: &str) {
        assert!(
            matches!(probe, "normal" | "origin-only" | "resize-only"),
            "unknown native probe"
        );
        self.probe = probe.into();
    }
    pub fn scale(&self) -> f32 {
        unsafe { GetDpiForWindow(self.hwnd) as f32 / 96. }
    }
    pub fn apply(&mut self, anchor: [f32; 2], surface: f32, gutter: f32, cx: &App) -> Result<()> {
        let scale = self.scale();
        let size = ((surface + gutter * 2.) * scale).round() as i32;
        let mut rect = [
            (anchor[0] - gutter * scale).round() as i32,
            (anchor[1] - gutter * scale).round() as i32,
            size,
            size,
        ];
        if self.probe == "origin-only" {
            rect = [
                (500. * scale).round() as i32 + size - (80. * scale).round() as i32,
                (300. * scale).round() as i32,
                (228. * scale).round() as i32,
                (228. * scale).round() as i32,
            ];
        }
        if self.probe == "resize-only" {
            rect[0] = (500. * scale).round() as i32;
            rect[1] = (300. * scale).round() as i32;
        }
        if self.last != Some(rect) {
            // GPUI on_resize updates Window. Calling SetWindowPos during Render
            // reenters a borrowed Window and leaves its cached viewport stale.
            // Run atomically on the foreground executor after that borrow ends.
            self.latest.set(Some(rect));
            let latest = self.latest.clone();
            let hwnd = self.hwnd;
            let research = self.research.clone();
            let (id, queued_us) = {
                let mut r = research.borrow_mut();
                r.request_count += 1;
                (r.request_count, r.clock.elapsed().as_micros())
            };
            cx.foreground_executor()
                .spawn(async move {
                    if latest.get() != Some(rect) {
                        let mut r=research.borrow_mut();r.skipped_count+=1;
                        let now=r.clock.elapsed().as_micros();
                        r.emit(&format!(r#"{{"type":"native_skip","id":{id},"queued_us":{queued_us},"timestamp_us":{now},"requested":{rect:?}}}"#));
                        return;
                    }
                    let (start_us,framechanged,previous)={let r=research.borrow();(r.clock.elapsed().as_micros(),r.always_framechanged||r.apply_count==0,r.last_applied)};
                    // Keep Z-order treatment identical: FRAMECHANGED is the only
                    // varied flag in this controlled experiment.
                    let flags=SWP_NOACTIVATE | if framechanged {SWP_FRAMECHANGED}else{SET_WINDOW_POS_FLAGS(0)};
                    // SAFETY: this is the owned HWND on the GPUI foreground thread.
                    unsafe {
                        SetWindowPos(
                            hwnd,
                            Some(HWND_TOPMOST),
                            rect[0],
                            rect[1],
                            rect[2],
                            rect[3],
                            flags,
                        )
                        .expect("atomic native bounds");
                    }
                    let end_us=research.borrow().clock.elapsed().as_micros();
                    let mut actual=RECT::default();
                    unsafe { GetWindowRect(hwnd,&mut actual).expect("research actual bounds"); }
                    let applied=[actual.left,actual.top,actual.right-actual.left,actual.bottom-actual.top];
                    let mut r=research.borrow_mut();r.apply_count+=1;r.last_applied=Some(rect);
                    let resize=previous.is_none_or(|p|p[2]!=rect[2]||p[3]!=rect[3]);
                    let move_only=previous.is_some_and(|p|(p[0]!=rect[0]||p[1]!=rect[1])&&!resize);
                    r.emit(&format!(r#"{{"type":"native_apply","id":{id},"queued_us":{queued_us},"start_us":{start_us},"end_us":{end_us},"queue_ms":{},"call_ms":{},"requested":{rect:?},"applied":{applied:?},"framechanged":{framechanged},"resize":{resize},"move_only":{move_only}}}"#,(start_us-queued_us) as f64/1000.,(end_us-start_us) as f64/1000.));
                })
                .detach();
            self.last = Some(rect);
        } else {
            self.research.borrow_mut().unchanged_count += 1;
        }
        Ok(())
    }
    pub fn bounds(&self) -> [i32; 4] {
        let mut r = RECT::default();
        unsafe {
            GetWindowRect(self.hwnd, &mut r).expect("native bounds");
        }
        [r.left, r.top, r.right, r.bottom]
    }
    pub fn work_area(&self) -> [f32; 4] {
        Self::monitor_area(unsafe { MonitorFromWindow(self.hwnd, MONITOR_DEFAULTTONEAREST) })
    }
    pub fn work_area_at(&self, point: [f32; 2]) -> [f32; 4] {
        Self::monitor_area(unsafe {
            MonitorFromPoint(
                POINT {
                    x: point[0].round() as i32,
                    y: point[1].round() as i32,
                },
                MONITOR_DEFAULTTONEAREST,
            )
        })
    }
    fn monitor_area(monitor: HMONITOR) -> [f32; 4] {
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        unsafe {
            GetMonitorInfoW(monitor, &mut info)
                .ok()
                .expect("monitor work area");
        }
        let r = info.rcWork;
        [r.left as f32, r.top as f32, r.right as f32, r.bottom as f32]
    }
    pub fn cursor() -> [f32; 2] {
        let mut p = POINT::default();
        unsafe {
            GetCursorPos(&mut p).expect("cursor");
        }
        [p.x as f32, p.y as f32]
    }
    pub fn inside(&self) -> bool {
        let p = Self::cursor();
        let r = self.bounds();
        p[0] >= r[0] as f32 && p[0] < r[2] as f32 && p[1] >= r[1] as f32 && p[1] < r[3] as f32
    }
    pub fn left_down() -> bool {
        unsafe { GetAsyncKeyState(1) < 0 }
    }
    pub fn reduced_motion() -> bool {
        let mut enabled = windows::core::BOOL(1);
        unsafe {
            SystemParametersInfoW(
                SPI_GETCLIENTAREAANIMATION,
                0,
                Some((&mut enabled as *mut windows::core::BOOL).cast()),
                SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
            )
            .expect("animation preference");
        }
        !enabled.as_bool()
    }
}
