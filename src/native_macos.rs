use gpui::{App, Window};
use objc2::{
    MainThreadMarker,
    rc::{Retained, Weak},
};
use objc2_app_kit::{
    NSEvent, NSScreen, NSView, NSWindow, NSWindowCollectionBehavior, NSWindowStyleMask, NSWorkspace,
};
use objc2_foundation::{NSPoint, NSRect, NSSize};
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use std::{
    cell::{Cell, RefCell},
    collections::HashMap,
    fs::File,
    io::Write,
    rc::Rc,
};

thread_local! {
    static WINDOWS: RefCell<HashMap<u64, Weak<NSWindow>>> = RefCell::new(HashMap::new());
    static NEXT_WINDOW: Cell<u64> = const { Cell::new(1) };
}

#[derive(Clone, Copy)]
pub struct NativeHandle(u64);

impl NativeHandle {
    pub fn window(&self) -> Option<Retained<NSWindow>> {
        MainThreadMarker::new()?;
        WINDOWS.with(|windows| windows.borrow().get(&self.0).and_then(Weak::load))
    }
    pub fn from_window(native: &NSWindow) -> Self {
        marker();
        WINDOWS.with(|windows| {
            let mut windows = windows.borrow_mut();
            windows.retain(|_, window| window.load().is_some());
            if let Some((&identity, _)) = windows.iter().find(|(_, window)| {
                window
                    .load()
                    .is_some_and(|window| std::ptr::eq(&*window, native))
            }) {
                return NativeHandle(identity);
            }
            let identity = NEXT_WINDOW.with(|next| {
                let identity = next.get();
                next.set(identity.checked_add(1).expect("Window identity overflow"));
                identity
            });
            windows.insert(identity, Weak::new(native));
            NativeHandle(identity)
        })
    }
}

pub fn marker() -> MainThreadMarker {
    MainThreadMarker::new().expect("AppKit requires the foreground thread")
}

pub fn handle(window: &Window) -> NativeHandle {
    marker();
    let RawWindowHandle::AppKit(raw) = HasWindowHandle::window_handle(window)
        .expect("AppKit window handle")
        .as_raw()
    else {
        panic!("Expected an AppKit view")
    };
    let view = unsafe { raw.ns_view.cast::<NSView>().as_ref() };
    let native = view.window().expect("Attached AppKit window");
    NativeHandle::from_window(&native)
}

pub fn desktop_top() -> f64 {
    NSScreen::screens(marker())
        .firstObject()
        .expect("Primary display")
        .frame()
        .size
        .height
}

pub fn rect_edges(rect: NSRect) -> [f32; 4] {
    [
        rect.origin.x as f32,
        (desktop_top() - rect.origin.y - rect.size.height) as f32,
        (rect.origin.x + rect.size.width) as f32,
        (desktop_top() - rect.origin.y) as f32,
    ]
}

pub fn screen_at(point: [f32; 2]) -> Retained<NSScreen> {
    let screens = NSScreen::screens(marker());
    (0..screens.count())
        .map(|index| screens.objectAtIndex(index))
        .find(|screen| {
            let bounds = rect_edges(screen.frame());
            point[0] >= bounds[0]
                && point[0] < bounds[2]
                && point[1] >= bounds[1]
                && point[1] < bounds[3]
        })
        .unwrap_or_else(|| screens.firstObject().expect("Primary display"))
}

pub fn set_bounds(window: &NSWindow, rect: [i32; 4]) {
    let frame = NSRect::new(
        NSPoint::new(
            rect[0] as f64,
            desktop_top() - rect[1] as f64 - rect[3] as f64,
        ),
        NSSize::new(rect[2] as f64, rect[3] as f64),
    );
    window.setFrame_display(frame, true);
}

pub fn configure_overlay(window: &NSWindow) {
    window.setLevel(3);
    window.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenNone
            | NSWindowCollectionBehavior::IgnoresCycle,
    );
    window.setHidesOnDeactivate(false);
}

pub struct Native {
    pub hwnd: NativeHandle,
    window: Retained<NSWindow>,
    latest: Rc<Cell<Option<[i32; 4]>>>,
    last: Option<[i32; 4]>,
    probe: String,
    metrics: Option<File>,
    frame_changed_always: bool,
    compact: bool,
    shown: Rc<Cell<bool>>,
    alive: Rc<Cell<bool>>,
}

impl Native {
    pub fn attach(window: &Window, metrics_path: Option<String>) -> Self {
        let hwnd = handle(window);
        let window = hwnd.window().expect("Live AppKit window");
        window.setStyleMask(NSWindowStyleMask::Borderless);
        window.setHasShadow(false);
        configure_overlay(&window);
        Self {
            hwnd,
            window,
            latest: Rc::new(Cell::new(None)),
            last: None,
            probe: "normal".into(),
            metrics: metrics_path.map(|path| File::create(path).expect("Native metrics")),
            frame_changed_always: true,
            compact: true,
            shown: Rc::new(Cell::new(false)),
            alive: Rc::new(Cell::new(true)),
        }
    }
    pub fn set_research(&mut self, enabled: bool) {
        self.frame_changed_always = enabled;
    }
    pub fn set_probe(&mut self, probe: &str) {
        assert!(matches!(probe, "normal" | "origin-only" | "resize-only"));
        self.probe = probe.into();
    }
    pub fn scale(&self) -> f32 {
        1.
    }
    pub fn set_compact(&mut self, compact: bool, cx: &App) {
        if self.compact == compact {
            return;
        }
        self.compact = compact;
        let window = self.window.clone();
        let alive = self.alive.clone();
        cx.foreground_executor()
            .spawn(async move {
                if !alive.get() {
                    return;
                }
                let behavior = NSWindowCollectionBehavior::FullScreenNone
                    | NSWindowCollectionBehavior::IgnoresCycle;
                window.setCollectionBehavior(if compact {
                    behavior | NSWindowCollectionBehavior::CanJoinAllSpaces
                } else {
                    behavior
                });
            })
            .detach();
    }
    pub fn show_without_activation(&self) {
        self.window.orderFrontRegardless();
    }
    pub fn ready_for_update(&self) -> bool {
        self.shown.get() && self.window.isVisible()
    }
    pub fn apply(
        &mut self,
        anchor: [f32; 2],
        surface: f32,
        gutter: f32,
        cx: &App,
    ) -> anyhow::Result<()> {
        let size = (surface + gutter * 2.).round() as i32;
        let mut rect = [
            (anchor[0] - gutter).round() as i32,
            (anchor[1] - gutter).round() as i32,
            size,
            size,
        ];
        if self.probe == "origin-only" {
            rect = [500 + size - 80, 300, 228, 228];
        }
        if self.probe == "resize-only" {
            rect[0] = 500;
            rect[1] = 300;
        }
        if self.last != Some(rect) {
            self.latest.set(Some(rect));
            let latest = self.latest.clone();
            let window = self.window.clone();
            let shown = self.shown.clone();
            let alive = self.alive.clone();
            cx.foreground_executor()
                .spawn(async move {
                    if !alive.get() || latest.get() != Some(rect) {
                        return;
                    }
                    set_bounds(&window, rect);
                    if !shown.replace(true) {
                        window.orderFrontRegardless();
                    }
                })
                .detach();
            if let Some(metrics) = &mut self.metrics {
                writeln!(
                    metrics,
                    "{}",
                    serde_json::json!({"type":"native_request", "platform":"macos", "requested":rect, "framechanged_always":self.frame_changed_always})
                )?;
            }
            self.last = Some(rect);
        }
        Ok(())
    }
    pub fn bounds(&self) -> [i32; 4] {
        rect_edges(self.window.frame()).map(|value| value.round() as i32)
    }
    pub fn work_area(&self) -> [f32; 4] {
        self.window
            .screen()
            .map(|screen| rect_edges(screen.visibleFrame()))
            .unwrap_or_else(|| self.work_area_at(Self::cursor()))
    }
    pub fn work_area_at(&self, point: [f32; 2]) -> [f32; 4] {
        rect_edges(screen_at(point).visibleFrame())
    }
    pub fn cursor() -> [f32; 2] {
        let point = NSEvent::mouseLocation();
        [point.x as f32, (desktop_top() - point.y) as f32]
    }
    pub fn inside(&self) -> bool {
        let point = Self::cursor();
        let rect = self.bounds();
        point[0] >= rect[0] as f32
            && point[0] < rect[2] as f32
            && point[1] >= rect[1] as f32
            && point[1] < rect[3] as f32
    }
    pub fn left_down() -> bool {
        NSEvent::pressedMouseButtons() & 1 != 0
    }
    pub fn reduced_motion() -> bool {
        NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceMotion()
    }
}

impl Drop for Native {
    fn drop(&mut self) {
        self.alive.set(false);
        WINDOWS.with(|windows| windows.borrow_mut().remove(&self.hwnd.0));
    }
}
