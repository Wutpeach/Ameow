#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
mod edge_hover;
mod download_ui;
mod queue_presentation;
mod queue_fixture;
mod preview;
mod gallery;
#[cfg(target_os = "windows")]
mod tray;
#[cfg(target_os = "macos")]
#[path = "tray_macos.rs"]
mod tray;
mod tray_popup;
mod indicator;
mod mascot;
mod mascot_motion;
mod mascot_reveal;
mod mascot_layers;
mod mascot_scene;
mod magnetic_spring;
mod model;
#[cfg(target_os = "windows")]
mod native;
#[cfg(target_os = "macos")]
#[path = "native_macos.rs"]
mod native;
mod repair_motion;
mod ring_glow;
mod tokens;
mod context_menu;
mod ui_motion;
mod ui_tooltip;
mod surface_actions;
mod settings_window;
mod global_shortcut;
use ameow_next::login_startup;
mod app_update_ui;
mod ui_text;
mod brand_icons;
#[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
mod native_acceptance;

use gpui::{prelude::*, *};
use model::{Geometry, Model, Stage};
use native::Native;
use std::{
    borrow::Cow,
    fs::File,
    io::{BufWriter, Write},
    time::{Duration, Instant},
};
use tokens::Palette;
use ui_tooltip::TooltipExt as _;

const DIAGNOSTIC: &str = "Ameow · Phase 1 mock diagnostic\nE_MOCK_DOWNLOAD: simulated download failure\nNo backend request was made.";
struct Assets;
impl AssetSource for Assets {
    fn load(&self, path: &str) -> anyhow::Result<Option<Cow<'static, [u8]>>> {
        Ok(match path {
            "brands/bilibili.svg" => Some(Cow::Borrowed(include_bytes!("../assets/brands/bilibili.svg"))),
            "brands/youtube.svg" => Some(Cow::Borrowed(include_bytes!("../assets/brands/youtube.svg"))),
            "brands/bluesky.svg" => Some(Cow::Borrowed(include_bytes!("../assets/brands/bluesky.svg"))),
            "brands/imgur.svg" => Some(Cow::Borrowed(include_bytes!("../assets/brands/imgur.svg"))),
            "brands/x.svg" => Some(Cow::Borrowed(include_bytes!("../assets/brands/x.svg"))),
            "brands/vimeo.svg" => Some(Cow::Borrowed(include_bytes!("../assets/brands/vimeo.svg"))),
            "icons/x.svg" => Some(Cow::Borrowed(include_bytes!("../assets/x.svg"))),
            "icons/copy.svg" => Some(Cow::Borrowed(include_bytes!("../assets/copy.svg"))),
            "icons/check.svg" => Some(Cow::Borrowed(include_bytes!("../assets/check.svg"))),
            "icons/eye-off.svg" => Some(Cow::Borrowed(include_bytes!("../assets/eye-off.svg"))),
            "icons/settings.svg" => Some(Cow::Borrowed(include_bytes!("../assets/settings.svg"))),
            "icons/sliders-horizontal.svg" => Some(Cow::Borrowed(include_bytes!("../assets/sliders-horizontal.svg"))),
            "icons/download.svg" => Some(Cow::Borrowed(include_bytes!("../assets/download.svg"))),
            "icons/blocks.svg" => Some(Cow::Borrowed(include_bytes!("../assets/blocks.svg"))),
            "icons/info.svg" => Some(Cow::Borrowed(include_bytes!("../assets/info.svg"))),
            "icons/circle-alert.svg" => Some(Cow::Borrowed(include_bytes!("../assets/circle-alert.svg"))),
            "icons/chevron-right.svg" => Some(Cow::Borrowed(include_bytes!("../assets/chevron-right.svg"))),
            "icons/chevron-down.svg" => Some(Cow::Borrowed(include_bytes!("../assets/chevron-down.svg"))),
            "icons/circle-arrow-up.svg" => Some(Cow::Borrowed(include_bytes!("../assets/circle-arrow-up.svg"))),
            "icons/clock.svg" => Some(Cow::Borrowed(include_bytes!("../assets/clock.svg"))),
            "icons/rotate-ccw.svg" => Some(Cow::Borrowed(include_bytes!("../assets/rotate-ccw.svg"))),
            // Preserve Ameow's existing aliases; other component icons use the official bundle.
            _ => match ring_glow::load(path) {
                Some(bytes) => Some(Cow::Owned(bytes)),
                None => return gpui_kit_assets::Assets.load(path),
            },
        })
    }
    fn list(&self, prefix: &str) -> anyhow::Result<Vec<SharedString>> {
        let mut paths: Vec<SharedString> = ["brands/bilibili.svg", "brands/youtube.svg", "brands/bluesky.svg",
            "brands/imgur.svg", "brands/x.svg", "brands/vimeo.svg",
            "icons/x.svg", "icons/copy.svg", "icons/check.svg", "icons/eye-off.svg",
            "icons/settings.svg", "icons/sliders-horizontal.svg", "icons/download.svg",
            "icons/blocks.svg", "icons/info.svg", "icons/circle-alert.svg",
            "icons/chevron-right.svg", "icons/chevron-down.svg",
            "icons/circle-arrow-up.svg", "icons/clock.svg", "icons/rotate-ccw.svg"]
            .into_iter()
            .map(Into::into)
            .chain(ring_glow::asset_paths())
            .filter(|path: &SharedString| path.starts_with(prefix))
            .collect();
        paths.extend(gpui_kit_assets::Assets.list(prefix)?);
        paths.sort();
        paths.dedup();
        Ok(paths)
    }
}
struct Options {
    instance: Option<login_startup::InstanceGuard>,
    login_startup: bool,
    fixture: bool,
    tray_fixture: bool,
    preview: bool,
    preview_session: Option<preview::Session>,
    unknown_downloading: bool,
    queue_fixture: Option<std::path::PathBuf>,
    night: bool,
    reduced: bool,
    demo: bool,
    stage: Stage,
    telemetry: Option<File>,
    measure: Option<BufWriter<File>>,
    native_metrics: Option<String>,
    exit_after_ms: Option<u64>,
    native_probe: String,
    probe_period_ms: Option<u64>,
    hover_enabled: bool,
}
impl Options {
    fn from_args() -> Self {
        let args: Vec<String> = std::env::args().collect();
        if let Some(option) = args.iter().find(|arg| matches!(arg.as_str(),
            "--motion" | "--magnetic" | "--dt" | "--native-flags")) {
            panic!("{option} was a historical comparison option; use the current defaults");
        }
        let value = |name: &str| {
            args.iter()
                .position(|a| a == name)
                .and_then(|i| args.get(i + 1))
        };
        if value("--native-probe").is_some_and(|s| s != "normal")
            && value("--probe-period-ms").is_none()
        {
            panic!("--native-probe measurement controls require --probe-period-ms");
        }
        let unknown_downloading = args.iter().any(|arg| arg == "--unknown-downloading");
        let queue_fixture = value("--queue-fixture-control").map(std::path::PathBuf::from);
        let queue_fixture_enabled = queue_fixture.is_some();
        let preview = args.iter().any(|arg| arg == "--preview");
        let stage = match value("--stage").map(String::as_str) {
            Some("resolving") => Stage::Resolving,
            Some("downloading") => Stage::Downloading,
            Some("transcoding") => Stage::Transcoding,
            Some("success") => Stage::Success,
            Some("failure") => Stage::Failure,
            Some("cancelled") => Stage::Cancelled,
            _ => Stage::Idle,
        };
        Self {
            unknown_downloading,
            tray_fixture: queue_fixture_enabled && args.iter().any(|arg| arg == "--tray-fixture"),
            instance: None,
            login_startup: args.iter().any(|s| s == "--login-startup"),
            preview,
            preview_session: preview.then(|| preview::Session::new(value("--preview-control").map(std::path::PathBuf::from),
                value("--preview-scene").map_or("queue.mixed", String::as_str)).expect("validated preview scene")),
            queue_fixture,
            fixture: preview || queue_fixture_enabled || unknown_downloading || args.iter().any(|arg| matches!(arg.as_str(), "--demo" | "--stage" | "--probe-period-ms")),
            night: args.iter().any(|s| s == "--night"),
            reduced: args.iter().any(|s| s == "--reduced") || Native::reduced_motion(),
            demo: args.iter().any(|s| s == "--demo"),
            stage: if unknown_downloading { Stage::Downloading } else { stage },
            telemetry: value("--telemetry")
                .map(|p| File::create(p).expect("create local telemetry")),
            measure: value("--measure")
                .map(|p| BufWriter::new(File::create(p).expect("create research measurements"))),
            native_metrics: value("--native-metrics").cloned(),
            exit_after_ms: if queue_fixture_enabled {
                Some(value("--exit-after-ms").map_or(120_000, |v| v.parse::<u64>().expect("--exit-after-ms integer")).min(120_000))
            } else { value("--exit-after-ms").map(|v| v.parse().expect("--exit-after-ms integer")) },
            native_probe: match value("--native-probe").map_or("normal", String::as_str) {
                "normal" | "origin-only" | "resize-only" => value("--native-probe")
                    .cloned()
                    .unwrap_or_else(|| "normal".into()),
                _ => panic!("--native-probe normal|origin-only|resize-only"),
            },
            probe_period_ms: value("--probe-period-ms").map(|s| {
                s.parse::<u64>()
                    .ok()
                    .filter(|v| *v > 0)
                    .expect("--probe-period-ms positive integer")
            }),
            hover_enabled: match value("--hover").map_or("on", String::as_str) {
                "on" => true,
                "off" => false,
                _ => panic!("--hover on|off"),
            },
        }
    }
}
// Opt-in, one retained paint sample. The next render emits it with its originating
// timestamp; it is not a GPU-present receipt or the current render's layout.
#[derive(Clone, Copy, serde::Serialize)]
struct SurfacePaint {
    source_timestamp_us: u128,
    paint_unix_us: u128,
    native_rect_ltrb: [f32; 4],
    native_coordinate_scale: f32,
    backing_scale: f32,
    viewport: [f32; 2],
    carrier_paint_ltrb: [f32; 4],
    source_surface_ltrb: [f32; 4],
    expected_screen_center: [f32; 2],
    mapped_screen_center: [f32; 2],
    residual_device: [f32; 2],
}
impl SurfacePaint {
    fn capture(timestamp: u128, window: &Window, actual: [f32; 4], carrier: Bounds<Pixels>, frame: mascot::SurfaceFrame, anchor: [f32; 2], gutter: f32, hover: [f32; 2], native_scale: f32) -> Self {
        let backing = window.scale_factor();
        let edges = |bounds: Bounds<Pixels>| [f32::from(bounds.left()), f32::from(bounds.top()), f32::from(bounds.right()), f32::from(bounds.bottom())];
        let carrier_edges = edges(carrier);
        let paint_edges = carrier_edges.map(|v| { let d = v * backing; (d.abs() - 0.5).ceil().copysign(d) / backing });
        let surface = frame.bounds(carrier);
        let center = surface.center();
        let expected = std::array::from_fn(|i| anchor[i] + native_scale * (hover[i] + frame.native * 0.5 - gutter));
        let painted = [actual[0] + f32::from(center.x) * native_scale, actual[1] + f32::from(center.y) * native_scale];
        let viewport = window.viewport_size();
        Self {
            source_timestamp_us: timestamp,
            paint_unix_us: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).expect("paint clock").as_micros(),
            native_rect_ltrb: actual, native_coordinate_scale: native_scale, backing_scale: backing,
            viewport: [viewport.width.into(), viewport.height.into()],
            carrier_paint_ltrb: paint_edges, source_surface_ltrb: edges(surface),
            expected_screen_center: expected, mapped_screen_center: painted,
            residual_device: std::array::from_fn(|i| (painted[i] - expected[i]) * backing / native_scale),
        }
    }
}
struct Prototype {
    instance: Option<login_startup::InstanceGuard>,
    production_preferences: bool,
    preview: Option<preview::Session>,
    language: ui_text::Language,
    system_preferences: ui_text::SystemPreferences,
    last_system_preferences_ms: u64,
    surface_menu: context_menu::Menu,
    menu_save_generation: Option<u64>,
    _menu_activation: Subscription,
    visual_offset: [f32; 2],
    background_clicks: surface_actions::BackgroundClicks,
    downloads: Option<download_ui::DownloadUi>,
    settings_window: Option<WindowHandle<gpui_component::Root>>,
    shortcut: global_shortcut::Controller,
    shortcut_allowed: bool,
    _shortcut_task: Task<()>,
    shortcut_reveal: Task<()>,
    shortcut_positioning: bool,
    unknown_downloading: bool,
    tray: Option<tray::Tray>,
    tray_popup: Option<WindowHandle<tray_popup::TrayPopup>>,
    tray_actions: std::rc::Rc<std::cell::RefCell<Vec<tray_popup::Action>>>,
    close_requested: std::sync::Arc<std::sync::atomic::AtomicBool>,
    _download_poll: Option<Task<()>>,
    clock: Instant,
    model: Model,
    native: Option<Native>,
    anchor: [f32; 2],
    clamped_target: bool,
    focus: FocusHandle,
    night: bool,
    indicator: indicator::Indicator,
    mascot: mascot::Mascot,
    mascot_reveal: mascot_reveal::Reveal,
    _mascot_visibility: Subscription,
    drag: Option<([f32; 2], [f32; 2])>,
    directory_drag: Option<(std::path::PathBuf, bool)>,
    directory_probe: Option<Task<()>>,
    copied_at: Option<u64>,
    demo: bool,
    demo_step: u8,
    telemetry: Option<File>,
    last_telemetry: u64,
    wake: Option<Task<()>>,
    measure: Option<BufWriter<File>>,
    last_frame_us: u128,
    last_surface_paint: Option<std::rc::Rc<std::cell::Cell<Option<SurfacePaint>>>>,
    native_metrics: Option<String>,
    exit_after_ms: Option<u64>,
    native_probe: String,
    probe_period_ms: Option<u64>,
    hover_enabled: bool,
    spring_hover: magnetic_spring::Hover,
    ui_motion: ui_motion::Motion,
    tooltips: ui_tooltip::Host,
    queue_motion_rows: Vec<ameow_next::download::queue::JobSnapshot>,
}
impl Prototype {
    fn new(options: Options, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let focus = cx.focus_handle();
        window.focus(&focus, cx);
        let menu_activation = cx.observe_window_activation(window, |this, window, cx| {
            if !window.is_window_active() { this.model.keyboard(false, this.now()); }
            if this.preview.is_none() && !window.is_window_active() && this.surface_menu.is_open() {
                this.close_menu(cx);
            }
        });
        let mut model = Model::new(0, options.reduced);
        model.state(
            if options.demo {
                Stage::Resolving
            } else {
                options.stage
            },
            if options.fixture && !options.unknown_downloading { 0.46 } else { 0. },
            0,
        );
        if options.preview { model.locks.menu = true; model.locks_changed(0); }
        let close_requested = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let close_signal = close_requested.clone();
        if !options.fixture {
            window.on_window_should_close(cx, move |_, _| {
                close_signal.store(true, std::sync::atomic::Ordering::Release);
                false
            });
        }
        let mascot_entity = cx.entity().downgrade();
        let mascot_visibility = window.observe_window_visibility(move |_, _, cx| {
            let _ = mascot_entity.update(cx, |this, cx| {
                this.mascot.sample(this.now(), false, this.model.reduced);
                this.mascot_reveal.sample(this.now(), this.model.target_full, this.model.fullness, false, this.model.reduced);
                cx.notify();
            });
        });
        let downloads = if options.preview { Some(download_ui::DownloadUi::controlled_preview()) } else if let Some(path) = options.queue_fixture {
            Some(download_ui::DownloadUi::fixture(path))
        } else { (!options.fixture).then(download_ui::DownloadUi::start) };
        let tray = if !options.fixture || (options.tray_fixture && !options.preview) {
            match tray::Tray::new() {
                Ok(tray) => {
                    if let Some(ui) = &downloads { ui.evidence(serde_json::json!({"type":"tray-created"})); }
                    Some(tray)
                }
                Err(error) => {
                    if let Some(ui) = &downloads { ui.evidence(serde_json::json!({"type":"tray-create-failed","error":error})); }
                    None
                }
            }
        } else { None };
        let download_poll = (downloads.is_some() || options.unknown_downloading).then(|| cx.spawn_in(window, async move |this, cx| {
            loop {
                cx.background_executor().timer(Duration::from_millis(100)).await;
                if this.update_in(cx, |this, window, cx| { this.poll_downloads(window, cx); cx.notify(); }).is_err() { break; }
            }
        }));
        let shortcut = global_shortcut::Controller::default();
        let shortcut_allowed = !options.fixture && options.instance.is_some();
        let shortcut_signal = shortcut.signal.clone();
        let shortcut_task = cx.spawn_in(window, async move |this, cx| {
            loop {
                let id = shortcut_signal.next().await;
                if this.update_in(cx, |this, window, cx| {
                    if this.shortcut.accepts(id) { this.toggle_shortcut(window, cx); }
                }).is_err() { break; }
            }
        });
        Self {
            surface_menu: context_menu::Menu::default(),
            instance: options.instance,
            production_preferences: !options.fixture,
            preview: options.preview_session,
            language: if options.preview && std::env::args().any(|arg|arg=="--preview-english") {ui_text::Language::English}else{ui_text::Language::Chinese},
            system_preferences: ui_text::SystemPreferences::read(),
            last_system_preferences_ms: 0,
            menu_save_generation: None,
            _menu_activation: menu_activation,
            visual_offset: [0., 0.],
            background_clicks: surface_actions::BackgroundClicks::default(),
            downloads,
            settings_window: None,
            shortcut,
            shortcut_allowed,
            _shortcut_task: shortcut_task,
            shortcut_reveal: Task::ready(()),
            shortcut_positioning: false,
            unknown_downloading: options.unknown_downloading,
            tray,
            tray_popup: None,
            tray_actions: Default::default(),
            close_requested,
            _download_poll: download_poll,
            clock: Instant::now(),
            model,
            native: None,
            anchor: [514., 314.],
            clamped_target: false,
            focus,
            night: options.night,
            indicator: indicator::Indicator::default(),
            mascot: mascot::Mascot::new(std::process::id() as u64),
            mascot_reveal: if options.fixture { Default::default() } else { mascot_reveal::Reveal::startup() },
            _mascot_visibility: mascot_visibility,
            drag: None,
            directory_drag: None,
            directory_probe: None,
            copied_at: None,
            demo: options.demo,
            demo_step: 0,
            telemetry: options.telemetry,
            last_telemetry: 0,
            wake: None,
            last_surface_paint: options.measure.as_ref().map(|_| Default::default()),
            measure: options.measure,
            last_frame_us: 0,
            native_metrics: options.native_metrics,
            exit_after_ms: options.exit_after_ms,
            native_probe: options.native_probe,
            probe_period_ms: options.probe_period_ms,
            hover_enabled: options.hover_enabled,
            spring_hover: magnetic_spring::Hover::default(),
            ui_motion: ui_motion::Motion::default(),
            tooltips: ui_tooltip::Host::new(cx),
            queue_motion_rows: Vec::new(),
        }
    }
    fn now(&self) -> u64 {
        self.clock.elapsed().as_millis() as u64
    }
    fn clear_directory_drag(&mut self) {
        self.directory_drag = None;
        self.directory_probe = None;
    }
    fn end_external_drop(&mut self, cx: &mut Context<Self>) {
        self.clear_directory_drag();
        self.model.directory_hover(false, self.now());
        self.model.locks.drop = false;
        self.model.locks_changed(self.now());
        cx.notify();
    }
    fn preview_directory_drag(&mut self, paths: &[std::path::PathBuf], cx: &mut Context<Self>) {
        let candidate = surface_actions::single_drop(paths);
        if self.directory_drag.as_ref().map(|(path, _)| path) == candidate.as_ref() { return; }
        self.clear_directory_drag();
        let Some(path) = candidate else { return; };
        self.directory_drag = Some((path.clone(), false));
        // This read is only a visual hint; the settings owner still validates and saves.
        self.directory_probe = Some(cx.spawn(async move |this, cx| {
            let is_directory = cx.background_executor().spawn(async move { path.is_dir() }).await;
            let _ = this.update(cx, |this, cx| {
                if let Some((_, ready)) = &mut this.directory_drag { *ready = is_directory; }
                cx.notify();
            });
        }));
    }
    fn refresh_preferences(&mut self) {
        if self.shortcut_allowed && let Some(settings) = self.downloads.as_ref().and_then(|ui| ui.settings()) {
            self.shortcut.observe(&settings.shortcut);
        }
        if !self.production_preferences { return; }
        let now = self.now();
        // Polling also notices OS changes while all windows are hidden.
        if now.saturating_sub(self.last_system_preferences_ms) >= 1000 {
            self.system_preferences = ui_text::SystemPreferences::read();
            self.last_system_preferences_ms = now;
        }
        if let Some(settings) = self.downloads.as_ref().and_then(|ui| ui.settings()) {
            (self.night, self.language) = self.system_preferences.effective(settings.theme, settings.language);
        }
        if let Some(ui) = &mut self.downloads { ui.language = self.language; }
        let icon = self.downloads.as_ref().and_then(|ui| ui.settings()).map(|s| s.tray_icon).unwrap_or_default();
        if let Some(tray) = &mut self.tray {
            if let Err(error) = tray.set_preferences(self.language, icon, self.night) {
                eprintln!("Tray preferences: {error}");
            }
            #[cfg(target_os = "macos")]
            {
                let update = self.downloads.as_ref().map(|ui| ui.updates.snapshot()).unwrap_or_default();
                tray.set_menu(self.language, update.attention().then(|| app_update_ui::popup_label(&update, self.language)));
            }
        }
    }
    fn state(&mut self, stage: Stage, cx: &mut Context<Self>) {
        let now = self.now();
        self.demo = false;
        self.copied_at = None;
        self.model
            .state(stage, if stage == Stage::Success { 1. } else { 0.46 }, now);
        cx.notify();
    }
    fn copy(&mut self, cx: &mut Context<Self>) {
        if self.downloads.is_some() {
            self.copy_download(cx);
            return;
        }
        if matches!(self.model.stage, Stage::Failure | Stage::Partial) {
            cx.write_to_clipboard(ClipboardItem::new_string(DIAGNOSTIC.into()));
            self.copied_at = Some(self.now());
            cx.notify();
        }
    }
    fn close_menu(&mut self, cx: &mut Context<Self>) {
        self.surface_menu.close(self.now());
        self.background_clicks.reset();
        self.drag = None;
        self.model.locks.drag = false;
        self.model.locks.menu = self.downloads.as_ref().is_some_and(|ui| ui.queue_open || ui.exit_open);
        self.model.locks_changed(self.now());
        cx.notify();
    }
    fn show_context_menu(&mut self, cx: &mut Context<Self>) {
        if self.surface_menu.is_open() { return; }
        if !self.model.target_full || self.model.fullness < 0.999 { return; }
        if self.downloads.as_ref().is_some_and(|ui| ui.queue_open || ui.exit_open) { return; }
        let quality = self.downloads.as_ref().and_then(|ui| ui.settings()).map(|s| s.quality);
        self.surface_menu.open(quality, self.now());
        self.model.locks.menu = true;
        self.background_clicks.reset();
        self.drag=None;self.model.locks.drag=false;
        self.model.locks_changed(self.now());
        cx.notify();
    }
    fn background_eligible(&self) -> bool {
        self.downloads.as_ref().is_some_and(|ui| ui.background_actions_available()) && self.model.target_full && self.model.fullness >= 0.999
            && !self.model.locks.menu && !self.model.locks.drop
    }
    fn key(&mut self, key: &str, cx: &mut Context<Self>) {
        if key == "escape" && self.model.locks.drop { self.end_external_drop(cx); return; }
        if self.surface_menu.is_open() {
            if let Some(action) = self.surface_menu.key(key) { self.surface_menu_action(action, cx); }
            cx.notify();
            return;
        }
        if self.downloads.as_mut().is_some_and(|ui| ui.preview_key(key)) {
            self.model.locks.menu = self.downloads.as_ref().is_some_and(|ui| ui.queue_open);
            self.model.locks_changed(self.now());
            cx.notify();
            return;
        }
        if self.downloads.is_some() {
            self.production_key(key, cx);
            return;
        }
        match key {
            "0" => self.state(Stage::Idle, cx),
            // Keep the historical manual-Compact exercise in mock fixtures only.
            "s" | "S" => { self.close_menu(cx); self.model.request_compact(self.now()); cx.notify(); }
            "1" => self.state(Stage::Resolving, cx),
            "2" => self.state(Stage::Downloading, cx),
            "3" => self.state(Stage::Transcoding, cx),
            "4" => self.state(Stage::Success, cx),
            "5" => self.state(Stage::Failure, cx),
            "6" => self.state(Stage::Cancelled, cx),
            "t" | "T" => {
                self.night = !self.night;
                cx.notify();
            }
            "r" | "R" => {
                self.model.set_reduced(!self.model.reduced, self.now());
                cx.notify();
            }
            "+" | "=" => {
                self.model
                    .progress
                    .update(self.model.progress.target + 0.1, self.now());
                cx.notify();
            }
            "-" => {
                self.model
                    .progress
                    .update(self.model.progress.target - 0.1, self.now());
                cx.notify();
            }
            "c" | "C" => self.copy(cx),
            "escape" => self.close_menu(cx),
            _ => {}
        }
    }
    fn clamp_anchor(&mut self, target: Geometry) {
        if let Some(native) = &self.native {
            let scale = native.scale();
            let work = if self.drag.is_some() {
                native.work_area_at(Native::cursor())
            } else {
                native.work_area()
            };
            self.anchor = model::reachable_anchor(
                self.anchor,
                Geometry {
                    surface: target.surface * scale,
                    gutter: target.gutter * scale,
                    radius: target.radius * scale,
                    native: target.native * scale,
                },
                work,
            );
        }
    }
    fn advance(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.refresh_preferences();
        if self.instance.as_ref().is_some_and(|instance| instance.take_restore_request().unwrap_or(false)) {
            self.restore_downloads(window, cx);
        }
        let now = self.now();
        if self.exit_after_ms.is_some_and(|at| now >= at) {
            if let Some(writer) = &mut self.measure {
                writer.flush().expect("flush research measurements");
            }
            self.exit_after_ms = None;
            if self.downloads.is_some() { self.stop_and_exit(cx); } else { cx.quit(); }
        }
        if self.copied_at.is_some_and(|at| now >= at + ui_motion::COPY_FEEDBACK_MS) {
            self.copied_at = None;
        }
        if self.native.is_none() {
            let mut native = Native::attach(window, self.native_metrics.take());
            native.set_probe(&self.native_probe);
            self.native = Some(native);
            self.clamp_anchor(Geometry::at(1.));
        }
        if let Some((cursor, anchor)) = self.drag {
            if Native::left_down() {
                let p = Native::cursor();
                if (p[0]-cursor[0]).hypot(p[1]-cursor[1])>4. { self.background_clicks.reset(); }
                self.anchor = [anchor[0] + p[0] - cursor[0], anchor[1] + p[1] - cursor[1]];
                self.clamp_anchor(Geometry::at(1.));
            } else {
                self.drag = None;
                self.model.locks.drag = false;
                self.model.locks_changed(now);
            }
        }
        if self.model.locks.drop && (!cx.has_active_drag() || !self.native.as_ref().is_some_and(Native::inside)) {
            self.end_external_drop(cx);
        }
        if self.preview.is_none() {
            let ready = self.model.locks.drop && self.directory_drag.as_ref().is_some_and(|(_, ready)| *ready)
                && self.downloads.as_ref().is_some_and(|ui| ui.background_actions_available() && ui.settings().is_some())
                && !self.surface_menu.is_open();
            self.model.directory_hover(ready, now);
        }
        if self.demo {
            let step = (now / 2200).min(4) as u8;
            if step != self.demo_step {
                self.demo_step = step;
                self.model.state(
                    match step {
                        1 => Stage::Downloading,
                        2 => Stage::Transcoding,
                        3 => Stage::Success,
                        _ => Stage::Idle,
                    },
                    0.46,
                    now,
                );
                if step == 4 {
                    self.demo = false;
                }
            }
            if matches!(self.model.stage, Stage::Downloading | Stage::Transcoding) {
                self.model
                    .progress
                    .update(0.46 + 0.54 * (now % 2200) as f32 / 2200., now);
            }
        }
        if let Some(period) = self.probe_period_ms {
            self.model.set_target((now / period).is_multiple_of(2), now);
        } else {
            let feedback_replay = self.preview.as_ref().is_some_and(|p| p.scene().directory_feedback().is_some()
                || (p.scene().surface == "full" && p.scene().state == "success"));
            self.model.pointer(!feedback_replay && self.native.as_ref().is_some_and(Native::inside), now);
        }
        self.model.tick(now);
        if let Some(preview) = &self.preview {
            let success_replay = preview.scene().surface == "full" && preview.scene().state == "success" && !self.model.reduced;
            let feedback_replay = (preview.scene().directory_feedback().is_some() && !self.model.reduced) || success_replay;
            if !feedback_replay { self.model.set_target(preview.scene().surface != "compact", now); }
            match preview.scene().state.as_str() {
                "success" if !success_replay => self.model.stage = Stage::Success,
                "failure" => self.model.stage = Stage::Failure,
                "cancelled" => self.model.stage = Stage::Cancelled,
                _ => {}
            }
        }
        if !self.shortcut_positioning && self.clamped_target != self.model.target_full {
            self.clamped_target = self.model.target_full;
            self.clamp_anchor(
                if self.model.target_full {
                    Geometry::at(1.)
                } else {
                    Geometry::at(0.)
                },
            );
        }
        let g = self.model.geometry();
        if !self.shortcut_positioning {
            #[cfg(target_os = "macos")]
            self.native.as_mut().unwrap().set_compact(!self.model.target_full && self.model.fullness < 0.02, cx);
            self.native
            .as_mut()
            .unwrap()
            .apply(
                self.anchor,
                g.native - 2. * g.gutter,
                g.gutter,
                cx,
            )
                .expect("atomic native geometry");
        }
        if now >= self.last_telemetry + 8 {
            self.last_telemetry = now;
            if let Some(log) = &mut self.telemetry {
                let n = self.native.as_ref().unwrap();
                let arc = self.model.arc(now);
                let viewport = window.viewport_size();
                let _ = writeln!(log, "{}", serde_json::json!({
                    "ms":now,"stage":format!("{:?}",self.model.stage),"fullness":self.model.fullness,
                    "target_full":self.model.target_full,"pointer":self.model.pointer,"drag":self.model.locks.drag,
                    "menu":self.model.locks.menu,"drop":self.model.locks.drop,"night":self.night,"reduced":self.model.reduced,
                    "bounds":n.bounds(),"viewport":[f32::from(viewport.width),f32::from(viewport.height)],
                    "anchor":self.anchor,"scale":n.scale(),"arc":[arc.0,arc.1],
                    "progress":self.model.progress.sample(now),"symbol":self.model.symbol(now),
                    "menu_page":self.surface_menu.name(),"menu_selected":self.surface_menu.selected,
                    "menu_pending":self.downloads.as_ref().is_some_and(|ui|ui.settings_pending),
                    "menu_hint":self.surface_menu.hint.is_some(),"visual_offset":self.visual_offset
                }));
                let _ = log.flush();
            }
        }
    }
    fn menu(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let p = Palette::new(self.night);
        let g = self.model.geometry();
        div()
            .absolute()
            .left(px(g.gutter + 10.))
            .top(px(g.gutter + 10.))
            .w(px(180.))
            .p(px(5.))
            .bg(p.badge)
            .border_1()
            .border_color(p.border)
            .rounded(px(9.))
            .children(
                [
                    ("0", "待机"),
                    ("1", "解析中"),
                    ("2", "下载中"),
                    ("3", "转码中"),
                    ("4", "下载完成"),
                    ("5", "下载失败"),
                    ("t", "切换 Light / Night"),
                    ("r", "减少动态效果"),
                ]
                .into_iter()
                .map(|(key, label)| {
                    div()
                        .id(SharedString::from(format!("menu-{key}")))
                        .h(px(20.))
                        .px(px(6.))
                        .flex()
                        .items_center()
                        .justify_between()
                        .text_size(px(10.))
                        .text_color(p.neutral)
                        .rounded(px(4.))
                        .cursor_pointer()
                        .hover(move |s| s.bg(p.surface))
                        .child(label)
                        .child(key.to_uppercase())
                        .on_mouse_down(
                            MouseButton::Left,
                            cx.listener(|_, _, _, cx| cx.stop_propagation()),
                        )
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.key(key, cx);
                            this.close_menu(cx);
                        }))
                }),
            )
    }
}
impl Render for Prototype {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.ui_motion.begin(self.model.reduced);
        let queue_presence = self.ui_motion.presence("full-queue", self.downloads.as_ref().is_some_and(|ui| ui.queue_open));
        let exit_presence = self.ui_motion.presence("full-exit", self.downloads.as_ref().is_some_and(|ui| ui.exit_open));
        let held = queue_presence.visible() || exit_presence.visible() || self.surface_menu.visible(self.now(), self.model.reduced);
        if held != self.model.locks.menu { self.model.locks.menu = held; self.model.locks_changed(self.now()); }
        let render_start = Instant::now();
        let timestamp_us = self.clock.elapsed().as_micros();
        let dt_actual_ms = timestamp_us.saturating_sub(self.last_frame_us) as f64 / 1000.;
        self.last_frame_us = timestamp_us;
        self.advance(window, cx);
        tokens::sync_kit_theme(self.night, cx);
        if cx.reduce_motion() != self.model.reduced { cx.set_reduce_motion(self.model.reduced); }
        let cpu_advance_us = render_start.elapsed().as_micros();
        let now = self.now();
        let g = self.model.geometry();
        #[cfg(target_os = "macos")]
        let g = native::presented_geometry(g, [window.viewport_size().width.into(), window.viewport_size().height.into()]);
        let p = Palette::new(self.night);
        let native = self.native.as_ref().unwrap();
        let cursor = Native::cursor();
        let scale = native.scale();
        let reveal_delay = self.mascot_reveal.sample(now, self.model.target_full, self.model.fullness, native.visible(), self.model.reduced);
        let mascot_scene = mascot_reveal::scene(self.mascot_reveal.progress);
        let mascot_visible = native.visible() && self.mascot_reveal.idle_ready() && self.model.fullness <= 0.001;
        let mut mascot_delay = self.mascot.sample(now, mascot_visible, self.model.reduced);
        if let Some(pose) = self.preview.as_ref().and_then(|p| mascot::preview_pose(&p.scene().state)) {
            self.mascot.pose = pose;
            mascot_delay = None;
        }
        self.mascot.pose = mascot_scene::idle_pose(self.mascot.pose, mascot_scene.idle_weight);
        let mascot_alpha = self.mascot_reveal.alpha();
        let surface_frame = mascot::SurfaceFrame::new(g);
        let surface_image = self.mascot.image(self.night, surface_frame, mascot_alpha, mascot_scene, window, cx);
        if let Some(log) = &mut self.telemetry {
            let pose = self.mascot.pose;
            let _ = writeln!(log, "{}", serde_json::json!({
                "type":"mascot", "ms":now, "visible":mascot_visible, "delay":mascot_delay,
                "reveal":self.mascot_reveal.progress,"reveal_delay":reveal_delay,"alpha":mascot_alpha,
                "local_side":mascot_reveal::local_side(g.surface),"local_origin":mascot_reveal::local_origin(g.native,g.surface),
                "blink":pose.blink, "gaze":pose.gaze, "head":pose.head, "head_tilt":pose.head_tilt, "ears":pose.ears,
                "success_alpha":self.model.success_alpha(now),
                "directory_alpha":self.model.directory.map(|d| d.alpha(now, self.model.reduced)),
                "raster_us":self.mascot.raster_us, "prepare_us":self.mascot.prepare_us,
                "scale":scale, "night":self.night, "reduced":self.model.reduced
            }));
            let _ = log.flush();
        }
        let rest_pointer = [
            (cursor[0] - self.anchor[0]) / scale,
            (cursor[1] - self.anchor[1]) / scale,
        ];
        let hover_locks = [
            self.model.locks.drag,
            self.model.locks.drop,
            self.model.locks.menu,
        ];
        self.spring_hover.sample(
            now,
            magnetic_spring::Input {
                pointer: rest_pointer,
                inside_native: native.inside(),
                full_intent: self.model.target_full,
                fullness: self.model.fullness,
                fullness_velocity: self.model.velocity,
                locks: hover_locks,
                reduced: self.model.reduced,
                enabled: self.hover_enabled,
            },
        );
        let h = &self.spring_hover;
        let (
            eligible,
            distance,
            q,
            target_offset,
            nearest_point,
            visual_offset,
            hover_velocity,
            integrated_target,
            step_ms,
            target_changed,
            hover_moving,
        ) = (
            h.eligible,
            h.distance,
            h.q,
            h.target_offset,
            h.nearest_point,
            h.offset,
            h.velocity,
            h.integrated_target,
            h.step_ms,
            h.target_changed,
            h.moving(),
        );
        #[cfg(not(target_os = "macos"))]
        let alpha = ((self.model.fullness - 0.72) / 0.28).clamp(0., 1.);
        #[cfg(target_os = "macos")]
        let alpha = ((((g.gutter - 10.) / 4.) - 0.72) / 0.28).clamp(0., 1.);
        self.visual_offset = visual_offset;
        let frame = self.indicator.sample(&self.model, p, now);
        let indeterminate = self.unknown_downloading || self
            .downloads
            .as_ref()
            .is_some_and(|ui| ui.selected_fraction.is_none());
        let frame = if indeterminate {
            frame.indeterminate(now, self.model.reduced)
        } else {
            frame
        };
        let stage = self.model.stage;
        let directory_feedback = self.model.directory.filter(|_| !self.surface_menu.is_open());
        let directory_hover = directory_feedback.is_some_and(model::DirectoryPresentation::receiving);
        let copied = self.copied_at.is_some_and(|t| now < t + ui_motion::COPY_FEEDBACK_MS);
        self.wake = None;
        let motion_delay = if self.demo || self.probe_period_ms.is_some()
            || self.model.indeterminate_animation(indeterminate) {
            Some(16)
        } else {
            self.model.next_wake_ms(now)
        };
        let copy_delay = self
            .copied_at
            .map(|at| (at + ui_motion::COPY_FEEDBACK_MS).saturating_sub(now).max(1));
        let exit_delay = self.exit_after_ms.map(|at| at.saturating_sub(now).max(1));
        let hover_delay = (hover_moving || self.surface_menu.animating(now, self.model.reduced)).then_some(16);
        let preparation_delay = self.preparation_animation_delay();
        let queue_delay = self.downloads.as_mut().and_then(|ui| ui.queue_animation_delay(now, self.model.reduced));
        let delay = [motion_delay, copy_delay, exit_delay, hover_delay, preparation_delay, queue_delay, mascot_delay, reveal_delay]
            .into_iter()
            .flatten()
            .min();
        if let Some(delay) = delay {
            if delay <= 16 {
                window.request_animation_frame();
            } else {
                self.wake = Some(cx.spawn_in(window, async move |this, cx| {
                    cx.background_executor()
                        .timer(Duration::from_millis(delay))
                        .await;
                    let _ = this.update(cx, |_, cx| cx.notify());
                }));
            }
        }
        // Keep the small Compact compression centered inside the legal native bounds.
        let surface_origin = g.gutter + (g.native - 2. * g.gutter - g.surface) * 0.5;
        let paint_sample = self.last_surface_paint.clone();
        let paint_anchor = self.anchor;
        let native_scale = native.scale();
        let native_handle = native.hwnd;
        // Only the full-source carrier goes through layout/paint edge snapping.
        // Circle, art and clip share the continuous transform inside its pixels.
        let surface_paint = canvas(
                |_, _, _| (),
                move |bounds, _, window, _| {
                    let _ = window.paint_image(bounds, bounds, Corners::default(), surface_image, 0, false);
                    if let Some(sample) = &paint_sample {
                        #[cfg(target_os = "windows")]
                        let actual = {
                            let mut rect = windows::Win32::Foundation::RECT::default();
                            unsafe { windows::Win32::UI::WindowsAndMessaging::GetWindowRect(native_handle, &mut rect).expect("paint native bounds"); }
                            [rect.left as f32, rect.top as f32, rect.right as f32, rect.bottom as f32]
                        };
                        #[cfg(target_os = "macos")]
                        let actual = native::rect_edges(native_handle.window().expect("paint native window").frame());
                        sample.set(Some(SurfacePaint::capture(timestamp_us, window, actual, bounds, surface_frame, paint_anchor, g.gutter, visual_offset, native_scale)));
                    }
                },
            ).absolute().left(px(0.)).top(px(0.)).size(px(surface_frame.side(window.scale_factor())));
        let surface = div()
            .id("surface")
            .absolute()
            .left(px(surface_origin))
            .top(px(surface_origin))
            .size(px(g.surface))
            .rounded(px(g.radius.min(g.surface * 0.5)))
            .border_1()
            .border_color(if directory_hover { p.neutral.opacity(0.3 * alpha) } else { gpui::transparent_black() })
            .when(directory_hover, |s| s.bg(p.badge.opacity(0.35 * alpha)))
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, event: &MouseDownEvent, window, cx| {
                    if this.surface_menu.is_open() { cx.stop_propagation(); return; }
                    window.focus(&this.focus, cx);
                    if this.model.locks.menu {
                        this.close_menu(cx);
                        return;
                    }
                    let paired=this.background_clicks.press(this.now(),[event.position.x.into(),event.position.y.into()],event.click_count,this.background_eligible());
                    this.drag = (!paired).then(||(Native::cursor(), this.anchor));
                    this.model.locks.drag = !paired;
                    this.model.locks_changed(this.now());
                    cx.notify();
                }),
            )
            .on_mouse_up(MouseButton::Left,cx.listener(|this,event:&MouseUpEvent,_,cx| {
                if this.surface_menu.is_open() { cx.stop_propagation(); return; }
                let open=this.background_clicks.release(this.now(),[event.position.x.into(),event.position.y.into()],this.background_eligible());
                this.drag=None;this.model.locks.drag=false;this.model.locks_changed(this.now());
                if open {this.open_output_directory(cx);}
            }))
            .on_mouse_down(
                MouseButton::Right,
                cx.listener(|this, _, window, cx| {
                    window.focus(&this.focus, cx);
                    if this.downloads.is_some() {this.show_context_menu(cx);} else {
                        this.model.locks.menu = !this.model.locks.menu;
                        this.model.locks_changed(this.now());cx.notify();
                    }
                }),
            );
        let slot = div()
            .id("persistent-state-slot")
            .absolute()
            .left(px(g.gutter + 52.))
            .top(px(g.gutter + 61.))
            .w(px(96.))
            .h(px(99.))
            .opacity(alpha * if directory_feedback.is_none() { self.model.success_alpha(now) } else { 1. })
            .when_some(directory_feedback, |s, feedback| s.child(indicator::directory_feedback(p, feedback, self.language, now, self.model.reduced)))
            .when(directory_feedback.is_none(), |s| s
                .child(indicator::ring(frame))
                .child(indicator::center(frame))
                .child(if self.downloads.is_some() { indicator::label_with_text(frame, self.live_label()).into_any_element() } else { indicator::label(frame).into_any_element() }))
            .when(directory_feedback.is_none() && (stage.active() || matches!(stage, Stage::Failure | Stage::Partial)), |s| {
                let copy = matches!(stage, Stage::Failure | Stage::Partial);
                let enabled = copy || self.main_cancel_allowed();
                s.child(
                    div()
                        .id("state-action")
                        .group("state-action")
                        .absolute()
                        .left(px(41.))
                        .top(px(83.))
                        .size(px(tokens::FULL_ACTION_SIZE))
                        .rounded_full()
                        .when(enabled, |s| s.cursor_pointer())
                        .opacity(if enabled { 1. } else { 0.35 })
                        .flex()
                        .items_center()
                        .justify_center()
                        .text_color(p.neutral)
                        .when(enabled, |s| s.hover(move |s| {
                            if copy { tokens::icon_hover(s, p).shadow(tokens::state_action_shadow(p.neutral)) } else {
                                s.bg(p.red).text_color(gpui::white()).shadow(tokens::state_action_shadow(p.red))
                            }
                        }))
                        .child(
                            svg()
                                .path(if matches!(stage, Stage::Failure | Stage::Partial) {
                                    if copied {
                                        "icons/check.svg"
                                    } else {
                                        "icons/copy.svg"
                                    }
                                } else {
                                    "icons/x.svg"
                                })
                                .size(px(if matches!(stage, Stage::Failure | Stage::Partial) { 10. } else { 16. }))
                                .text_color(p.neutral)
                                .when(enabled, |icon| icon.group_hover("state-action", move |s| s.text_color(if copy { p.neutral } else { gpui::white() }))),
                        )
                        .on_mouse_down(
                            MouseButton::Left,
                            cx.listener(|this, _, _, cx| {this.background_clicks.reset();cx.stop_propagation();}),
                        )
                        .on_click(cx.listener(move |this, _, _, cx| {
                            if !enabled { return; }
                            if matches!(stage, Stage::Failure | Stage::Partial) {
                                this.copy(cx);
                            } else if this.downloads.is_some() {
                                this.cancel_main(cx);
                            } else {
                                this.state(Stage::Cancelled, cx);
                            }
                        })),
                )
            });
        let live_badge = self.downloads.as_ref().and_then(|ui| ui.badge());
        let badge_visible = if self.downloads.is_some() { live_badge.is_some() } else { stage.active() };
        let (badge_count, failure_dot, download_dot) = live_badge.unwrap_or((2, false, true));
        let badge_text = badge_count.to_string();
        let badge = div()
            .id("queue-badge")
            .absolute()
            .left(px(g.gutter + 10.))
            .top(px(g.gutter + 10.))
            .w(px(42.))
            .h(px(28.))
            .rounded(px(20.))
            .bg(p.badge)
            .border_2()
            .border_color(p.border)
            .opacity(if badge_visible { alpha } else { 0. })
            .cursor_pointer()
            .text_color(p.neutral)
            .font_family(tokens::LATIN_FONT)
            .text_size(px(12.))
            .font_weight(FontWeight::MEDIUM)
            // One vertical center for both themes; fixed slots preserve dot x21/x24.
            .child(div().w_full().h_full().flex().items_center().gap(px(5.))
                .child(div().w(px(16.)).h(px(12.)).flex_none().line_height(px(12.)).text_align(TextAlign::Right).child(badge_text))
                .child(div().relative().w(px(11.)).h(px(8.)).flex_none()
                    .when(download_dot, |group| group.child(div().absolute().left(px(if failure_dot { 3. } else { 0. })).top(px(0.)).size(px(8.)).rounded_full().bg(if self.downloads.is_some() { p.blue } else { p.semantic(stage) })))
                    .when(failure_dot, |group| group.child(div().absolute().left(px(0.)).top(px(0.)).size(px(8.)).rounded_full().bg(p.red)))))
            .on_mouse_down(MouseButton::Left, cx.listener(|this, _, _, cx| {this.background_clicks.reset();cx.stop_propagation();}))
            .on_click(cx.listener(move |this, _, _, cx| { if badge_visible { this.open_queue(cx); } }));
        let surface_extra = self.model.window_motion.extra;
        // Endpoint elasticity belongs to the Surface alone; shadow uses native travel.
        let shadow_surface = g.native - 2. * g.gutter;
        let shadow_fullness = ((g.gutter - 10.) / 4.).clamp(0., 1.);
        let shadow_blur = g.gutter * 0.5 - 2.;
        let shadow_offset = 1. + shadow_fullness;
        let shadow_alpha = (if p.night { 0.24 } else { 0.085 }) * (0.72 + 0.28 * shadow_fullness);
        let shadow = canvas(
            |_, _, _| (),
            move |canvas_bounds, _, window, _| {
                let bounds = Bounds::new(
                    point(
                        canvas_bounds.origin.x + px(g.gutter),
                        canvas_bounds.origin.y + px(g.gutter),
                    ),
                    size(px(shadow_surface), px(shadow_surface)),
                );
                window.paint_drop_shadows(
                    bounds,
                    Corners::all(px(g.radius)),
                    &[BoxShadow { inset: false,
                        color: gpui::black().opacity(shadow_alpha),
                        offset: point(px(0.), px(shadow_offset)),
                        blur_radius: px(shadow_blur),
                        spread_radius: px(0.),
                    }],
                );
            },
        )
        .absolute()
        .size_full();
        let menu_open = self.surface_menu.visible(now, self.model.reduced);
        let menu_alpha = self.surface_menu.menu_alpha(now, self.model.reduced);
        let queue_presence = self.ui_motion.presence("full-queue", self.downloads.as_ref().is_some_and(|ui| ui.queue_open));
        let exit_presence = self.ui_motion.presence("full-exit", self.downloads.as_ref().is_some_and(|ui| ui.exit_open));
        let content_alpha = (1. - menu_alpha) * (1. - queue_presence.alpha) * (1. - exit_presence.alpha);
        let main_content = div().absolute().size(px(g.native)).opacity(content_alpha)
            .child(slot)
            .when(badge_visible, |group| group.child(badge))
            .when(self.preparation_indicator_visible(), |group| group.child(self.preparation_indicator(cx)));
        let visual_group = div()
            .id("full-visual-object")
            .absolute()
            .left(px(visual_offset[0]))
            .top(px(visual_offset[1]))
            .size(px(g.native))
            .child(shadow)
            .child(surface_paint)
            .child(surface)
            .when(content_alpha > 0.001, |group| group.child(main_content))
            .when(menu_open, |group| group.child(self.surface_menu_page(cx)));
        let overlays = div().absolute().left(px(visual_offset[0])).top(px(visual_offset[1])).size(px(g.native))
            .when(queue_presence.visible(), |s| s.child(div().absolute().inset_0().left(px(queue_presence.travel(5.))).opacity(queue_presence.alpha)
                .when(!queue_presence.open, |s| s.capture_any_mouse_down(|_, _, cx| cx.stop_propagation()).capture_key_down(|_, _, cx| cx.stop_propagation()))
                .child(self.queue_panel(window, cx))))
            .when(exit_presence.visible(), |s| s.child(div().absolute().inset_0().opacity(exit_presence.alpha)
                .when(!exit_presence.open, |s| s.capture_any_mouse_down(|_, _, cx| cx.stop_propagation()).capture_key_down(|_, _, cx| cx.stop_propagation()))
                .child(self.exit_panel(cx))));
        self.ui_motion.finish(window);
        let result = div()
            .id("ameow-root")
            .track_focus(&self.focus)
            .relative()
            .size_full()
            .overflow_hidden()
            .font(tokens::ui_font())
            .on_hover(cx.listener(|this, inside: &bool, _, cx| {
                if !*inside {this.background_clicks.reset();}
                if this.probe_period_ms.is_none() && this.preview.is_none() {
                    // A deferred GPUI hover may describe the hidden bootstrap HWND.
                    // Windows uses the same applied, current native bounds as polling.
                    #[cfg(target_os = "windows")]
                    let inside = this.native.as_ref().is_some_and(Native::inside);
                    #[cfg(not(target_os = "windows"))]
                    let inside = *inside;
                    this.model.pointer(inside, this.now());
                }
                cx.notify();
            }))
            .on_mouse_move(cx.listener(|this, event: &MouseMoveEvent, _, cx| {
                if let Some(ui) = &this.downloads { ui.updates.user_interaction(); }
                this.background_clicks.motion([event.position.x.into(),event.position.y.into()]);cx.notify();
            }))
            .on_scroll(cx.listener(|this, _, _, _| {
                if let Some(ui) = &this.downloads { ui.updates.user_interaction(); }
            }))
            .capture_any_mouse_down(cx.listener(|this, _, _, _| {
                if let Some(ui) = &this.downloads { ui.updates.user_interaction(); }
            }))
            .capture_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                if let Some(ui) = &this.downloads { ui.updates.user_interaction(); }
                #[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
                if this.shortcut_allowed && this.instance.is_none() && let Some(ui) = &this.downloads {
                    ui.evidence(serde_json::json!({"type":"native-key-target", "key":event.keystroke.key,
                        "control":event.keystroke.modifiers.control,"alt":event.keystroke.modifiers.alt,
                        "platform":event.keystroke.modifiers.platform}));
                }
                if event.keystroke.key == "u" && this.downloads.as_ref().is_some_and(|ui| ui.updates.snapshot().full_attention()) {
                    this.open_update_settings(cx);
                    cx.stop_propagation();
                    return;
                }
                // GPUI registers tab stops but requires the application to move focus.
                if this.surface_menu.is_open() {
                    let key = if event.keystroke.key == "tab" && event.keystroke.modifiers.shift {
                        "shift-tab"
                    } else { event.keystroke.key.as_str() };
                    this.key(key, cx);
                    cx.stop_propagation();
                } else if event.keystroke.key == "tab"
                    && this.downloads.as_ref().is_some_and(|ui| ui.queue_open)
                {
                    if event.keystroke.modifiers.shift { window.focus_prev(cx); }
                    else { window.focus_next(cx); }
                    cx.stop_propagation();
                    cx.notify();
                } else if this.downloads.is_some() && event.keystroke.modifiers.secondary(cx) && event.keystroke.key.eq_ignore_ascii_case("v") {
                    this.paste_download(cx);
                    cx.stop_propagation();
                } else {
                    this.key(event.keystroke.key.as_str(), cx)
                }
            }))
            .on_file_drop_exit(cx.listener(|this, _, _, cx| this.end_external_drop(cx)))
            .on_drag_move::<ExternalPaths>(cx.listener(|this, event: &DragMoveEvent<ExternalPaths>, _, cx| {
                if this.preview.is_some() { return; }
                if this.surface_menu.is_open() { this.end_external_drop(cx); cx.stop_propagation(); return; }
                if !event.bounds.contains(&event.event.position) { this.end_external_drop(cx); return; }
                this.background_clicks.reset();
                if !this.model.locks.drop { this.model.clear_directory(this.now()); }
                this.model.locks.drop = true;
                this.model.locks_changed(this.now());
                let paths = event.drag(cx).paths().to_vec();
                this.preview_directory_drag(&paths, cx);
                cx.notify();
            }))
            .on_drop(cx.listener(|this, paths: &ExternalPaths, _, cx| {
                this.end_external_drop(cx);
                if this.surface_menu.is_open() { cx.stop_propagation(); return; }
                if this.downloads.is_some() {this.drop_output_directory(paths.paths(),cx);}
                if this.downloads.is_none() && !paths.paths().is_empty() {
                    this.state(Stage::Resolving, cx);
                }
            }))
            .child(visual_group)
            .child(overlays)
            .when(self.downloads.is_none() && self.model.locks.menu, |s| {
                s.child(self.menu(cx))
            }).tooltip_root(&self.tooltips);
        if let Some(writer) = &mut self.measure {
            let native = self.native.as_ref().unwrap();
            let scale = native.scale();
            let viewport = window.viewport_size();
            let requested = self.model.geometry();
            let native_request = [
                (self.anchor[0] - requested.gutter * scale).round() as i32,
                (self.anchor[1] - requested.gutter * scale).round() as i32,
                (requested.native * scale).round() as i32,
                (requested.native * scale).round() as i32,
            ];
            let cpu_render_us = render_start.elapsed().as_micros();
            let phase = self.model.window_motion.phase();
            let handoff_json = {
                let h = &self.spring_hover;
                let starts = h
                    .axis_started_ms()
                    .map(|at| at.map_or_else(|| "null".to_owned(), |at| at.to_string()));
                format!(
                    ",\"tracking\":{},\"full_intent\":{},\"fade_weight\":{},\"fade_velocity\":{},\"spring_position\":{:?},\"spring_velocity\":{:?},\"axis_generation\":{:?},\"axis_started_ms\":[{},{}],\"max_offset\":{}",
                    h.tracking,
                    self.model.target_full,
                    h.fade_weight,
                    h.fade_velocity,
                    h.spring_position,
                    h.spring_velocity,
                    h.axis_generations(),
                    starts[0],
                    starts[1],
                    magnetic_spring::MAX_OFFSET
                )
            };
            let hover_json = format!(
                "{{\"enabled\":{},\"eligible\":{},\"distance\":{},\"q\":{},\"target_offset\":{:?},\"current_offset\":{:?},\"radius\":{},\"locks\":{:?},\"rest_pointer\":{:?},\"nearest_point\":{:?},\"variant\":\"{}\",\"velocity\":{:?},\"integrated_target\":{:?},\"step_ms\":{},\"target_changed\":{}{}}}",
                self.hover_enabled,
                eligible,
                distance,
                q,
                target_offset,
                visual_offset,
                edge_hover::RADIUS,
                hover_locks,
                rest_pointer,
                nearest_point,
                "b",
                hover_velocity,
                integrated_target,
                step_ms,
                target_changed,
                handoff_json
            );
            writeln!(writer,"{{\"type\":\"frame\",\"timestamp_us\":{},\"ms\":{},\"dt_actual_ms\":{},\"rawfullness\":{},\"velocity\":{},\"target_full\":{},\"visualsurface\":{},\"gutter\":{},\"radius\":{},\"native_request\":{:?},\"viewport\":[{},{}],\"bounds\":{:?},\"anchor\":{:?},\"surface_extra\":{},\"extra_velocity\":{},\"settlephase\":\"{}\",\"candidate\":\"{}\",\"reduced\":{},\"cpu_advance_us\":{},\"cpu_render_us\":{},\"pointer\":{},\"native_probe\":\"{}\",\"dt\":\"{}\",\"native_flags\":\"{}\",\"shadow_surface\":{},\"shadow_blur\":{},\"shadow_offset\":{},\"shadow_alpha\":{},\"hover\":{},\"previous_surface_paint\":{}}}",
                timestamp_us,now,dt_actual_ms,self.model.fullness,self.model.velocity,self.model.target_full,g.surface,g.gutter,g.radius,native_request,
                f32::from(viewport.width),f32::from(viewport.height),native.bounds(),self.anchor,surface_extra,self.model.window_motion.extra_v,
                phase,"converged",self.model.reduced,cpu_advance_us,cpu_render_us,self.model.pointer,self.native_probe,
                "baseline","always",
                shadow_surface,shadow_blur,shadow_offset,shadow_alpha,hover_json,serde_json::to_string(&self.last_surface_paint.as_ref().and_then(|sample| sample.get())).expect("paint sample")).expect("buffer research frame");
        }
        result
    }
}
fn main() {
    let args: Vec<_> = std::env::args().collect();
    if args.iter().any(|argument| argument == "--shortcut-native-acceptance") {
        #[cfg(all(feature = "app-update-fixture", debug_assertions))]
        { native_acceptance::run(); return; }
        #[cfg(not(all(feature = "app-update-fixture", debug_assertions)))]
        { eprintln!("Native acceptance requires an explicit debug fixture build"); std::process::exit(2); }
    }
    if args.iter().any(|argument| argument == "--download-test-bridge") {
        eprintln!("--download-test-bridge 已退役；请使用 cargo run --locked --features dev-tools --bin ameow-cli -- dev run --root <新隔离目录> --url <URL>");
        std::process::exit(2);
    }
    if let Err(error) = ameow_next::control::launch_session(&args) {
        eprintln!("Ameow Launcher session: {error}");
        std::process::exit(2);
    }
    if args.iter().any(|a| a == "--gallery") {
        if let Err(error) = gallery::run() { eprintln!("Gallery 无法启动：{error}"); std::process::exit(1); }
        return;
    }
    if let Some(at) = args.iter().position(|a| a == "--preview-catalog-out") {
        let Some(path) = args.get(at + 1) else { std::process::exit(2); };
        if std::fs::write(path, preview::CATALOG).is_err() { std::process::exit(2); }
        return;
    }
    if let Some(at) = args.iter().position(|a| a == "--preview-scene") {
        if !args.iter().any(|a| a == "--preview") || args.get(at + 1).is_none_or(|name| preview::find(name).is_err()) {
            eprintln!("无效的预览场景；需要 --preview 和有效的 --preview-scene 名称");
            std::process::exit(2);
        }
    }
    if args.iter().any(|a| a == "--preview-control") && !args.iter().any(|a| a == "--preview") {
        eprintln!("--preview-control 需要同时指定 --preview");
        std::process::exit(2);
    }
    let mut options = Options::from_args();
    if !options.fixture {
        let restore = !options.login_startup && !args.iter().any(|arg| arg == "--cli-launch");
        let isolated = match ameow_next::control::isolated_root(&args) {
            Ok(root) => root,
            Err(error) => { eprintln!("{error}"); std::process::exit(2); }
        };
        let acquire = match &isolated {
            Some(root) => login_startup::InstanceGuard::acquire_isolated(root, restore),
            None => login_startup::InstanceGuard::acquire_with_restore(restore),
        };
        match acquire {
            Ok(login_startup::InstanceAcquire::Primary(guard)) => options.instance = Some(guard),
            Ok(login_startup::InstanceAcquire::Duplicate) => return,
            Err(error) => {
                // Fail closed rather than create a second queue/runtime owner.
                let message = ui_text::SystemPreferences::read().language.message(&error);
                #[cfg(target_os = "windows")]
                {
                    let wide: Vec<u16> = message.encode_utf16().chain(Some(0)).collect();
                    unsafe { windows::Win32::UI::WindowsAndMessaging::MessageBoxW(None, windows::core::PCWSTR(wide.as_ptr()), windows::core::w!("Ameow"), windows::Win32::UI::WindowsAndMessaging::MB_OK | windows::Win32::UI::WindowsAndMessaging::MB_ICONERROR); }
                }
                #[cfg(target_os = "macos")]
                eprintln!("Ameow: {message}");
                return;
            }
        }
    }
    let activate = !options.login_startup && !args.iter().any(|arg| arg == "--cli-launch");
    gpui_platform::application()
        .with_assets(Assets)
        .run(move |cx: &mut App| {
            #[cfg(target_os = "macos")]
            cx.set_activation_policy(ActivationPolicy::Accessory);
            gpui_component::init(cx);
            cx.text_system()
                .add_fonts(
                    tokens::LATIN_FONT_BYTES
                        .into_iter()
                        .map(Cow::Borrowed)
                        .collect(),
                )
                .expect("bundled JetBrains Mono fonts");
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(504.), px(304.)),
                        size(px(80.), px(80.)),
                    ))),
                    titlebar: Some(TitlebarOptions {
                        title: Some("Ameow".into()),
                        appears_transparent: false,
                        ..Default::default()
                    }),
                    kind: WindowKind::PopUp,
                    // Native completes first geometry and TOPMOST on the foreground
                    // executor before showing this Windows popup without activation.
                    show: false,
                    focus: false,
                    inactive_frame_interval: None,
                    window_background: WindowBackgroundAppearance::Transparent,
                    is_resizable: false,
                    is_minimizable: false,
                    ..Default::default()
                },
                move |window, cx| cx.new(|cx| Prototype::new(options, window, cx)),
            )
            .expect("GPUI native window");
            if activate { cx.activate(true); }
        });
}
