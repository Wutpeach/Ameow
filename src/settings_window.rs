//! Independent settings presentation. All writes go through the main command owner.
use crate::{
    Prototype,
    download_ui::SettingsStatus,
    login_startup::{self, StartupState},
    tokens::{self, Palette},
    ui_text::Language,
    ui_tooltip::TooltipExt as _,
};
use ameow_next::download::settings::{LanguagePreference, ThemePreference, TrayIconPreference};
use gpui::{prelude::*, *};
use gpui_component::Root;
#[cfg(target_os = "windows")]
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use std::{
    cell::{Cell, RefCell},
    collections::HashMap,
    path::{Path, PathBuf},
    rc::Rc,
};
#[cfg(target_os = "windows")]
use windows::Win32::{
    Foundation::{HWND, POINT, RECT},
    Graphics::Gdi::{
        GetMonitorInfoW, MONITOR_DEFAULTTONEAREST, MONITORINFO, MonitorFromPoint, MonitorFromWindow,
    },
    UI::{
        HiDpi::{GetDpiForMonitor, GetDpiForWindow, MDT_EFFECTIVE_DPI},
        WindowsAndMessaging::*,
    },
};
#[path = "settings_components.rs"]
mod components;
#[path = "settings_notices.rs"]
mod notices;

actions!(ameow_settings, [TabForward, TabBackward]);
struct SettingsKeyBindings;
impl Global for SettingsKeyBindings {}

fn error_text(p: Palette) -> Hsla {
    if p.night { p.red } else { rgb(0xb8323c).into() }
}
fn inline_notice(p: Palette, message: impl Into<String>, danger: bool) -> Div {
    let color = if danger { error_text(p) } else { p.neutral };
    div().p(px(10.)).rounded(px(6.))
        .bg(if danger { p.red.opacity(if p.night { 0.12 } else { 0.07 }) } else { p.badge.opacity(0.55) })
        .flex().items_start().gap(px(8.))
        .child(svg().path(if danger { "icons/circle-alert.svg" } else { "icons/info.svg" })
            .size(px(14.)).mt(px(2.)).flex_none().text_color(color))
        .child(div().flex_1().min_w(px(0.)).text_size(px(12.)).line_height(px(18.))
            .text_color(color).child(message.into()))
}

fn focus_scroll_delta(viewport: Bounds<Pixels>, target: Bounds<Pixels>) -> Pixels {
    if target.top() < viewport.top() {
        viewport.top() - target.top()
    } else if target.bottom() > viewport.bottom() {
        viewport.bottom() - target.bottom()
    } else {
        px(0.)
    }
}

fn settings_message(language: Language, message: &str) -> String {
    let pair = match message {
        #[cfg(test)]
        "测试宿主禁用用户启动项操作" => Some((
            "测试宿主禁用用户启动项操作",
            "Startup changes are disabled in this test host.",
        )),
        "当前无法保存，若另一个设置正在保存，请稍后重试" => Some((
            "当前无法保存，若另一个设置正在保存，请稍后重试",
            "Cannot save now. If another setting is being saved, try again shortly.",
        )),
        "下载设置尚未就绪，请稍后重试" => Some((
            "下载设置尚未就绪，请稍后重试",
            "Download settings are not ready. Try again shortly.",
        )),
        "保存未受理，请稍后重试" => Some((
            "保存未受理，请稍后重试",
            "Save was not accepted. Try again.",
        )),
        "无法读取文件夹选择结果，请重试" => Some((
            "无法读取文件夹选择结果，请重试",
            "Cannot read the folder selection. Try again.",
        )),
        "请选择一个文件夹，目录未更改" => Some((
            "请选择一个文件夹，目录未更改",
            "Choose one folder; the folder is unchanged.",
        )),
        "无法打开文件夹，请检查目录后重试" => Some((
            "无法打开文件夹，请检查目录后重试",
            "Cannot open the folder. Check it and try again.",
        )),
        "已请求在资源管理器中打开" => Some((
            "已请求在资源管理器中打开",
            "Requested opening in File Explorer.",
        )),
        "完整路径已复制" => Some(("完整路径已复制", "Full path copied.")),
        "无法复制路径，请重试" => {
            Some(("无法复制路径，请重试", "Cannot copy the path. Try again."))
        }
        "当前目录已不存在或不是文件夹，请重新选择。" => Some((
            "当前目录已不存在或不是文件夹，请重新选择。",
            "The current folder no longer exists or is not a folder. Choose another.",
        )),
        "当前目录无法访问，请检查权限或重新选择。" => Some((
            "当前目录无法访问，请检查权限或重新选择。",
            "Cannot access the current folder. Check permissions or choose another.",
        )),
        _ => None,
    };
    pair.map_or_else(
        || language.message(message),
        |(zh, en)| language.text(zh, en).to_owned(),
    )
}

fn download_location_label(path: Option<&Path>, error: Option<&str>, l: Language) -> String {
    if let Some(path) = path {
        display_path(&path.to_string_lossy())
    } else if error.is_some() {
        l.text("暂时无法读取下载位置", "Download location unavailable").into()
    } else {
        l.text("正在读取…", "Loading…").into()
    }
}

#[derive(Clone)]
struct Projection {
    app_update: ameow_next::app_update::service::View,
    preview: bool,
    path: Option<PathBuf>,
    pending: bool,
    status: SettingsStatus,
    error: Option<String>,
    night: bool,
    reduced: bool,
    language: Language,
    preferences: Option<(ThemePreference, LanguagePreference, TrayIconPreference)>,
    queue: Option<std::sync::Arc<ameow_next::download::queue::QueueSnapshot>>,
    preparation_retry_available: bool,
    preparation_copy_pending: bool,
    preparation_status: Option<(String, bool)>,
    upstream: ameow_next::download::upstream::UpstreamChecker,
    preview_upstream: Option<ameow_next::download::upstream::UpstreamSnapshot>,
    upstream_available: bool,
    engine_command_pending: bool,
    engine_notice: Option<bool>,
}
impl Projection {
    fn from_main(main: &Prototype) -> Self {
        let ui = main.downloads.as_ref();
        Self {
            app_update: ui.map(|u| u.updates.snapshot()).unwrap_or_default(),
            preview: main.preview.is_some(),
            path: ui.and_then(|ui| ui.settings()).map(|s| s.output_dir),
            pending: ui.is_some_and(|ui| ui.settings_pending),
            status: ui.map_or(SettingsStatus::Idle, |ui| ui.settings_status.clone()),
            error: ui.and_then(|ui| ui.startup_error.clone()),
            night: main.night,
            reduced: main.model.reduced,
            language: main.language,
            preferences: ui
                .and_then(|ui| ui.settings())
                .map(|s| (s.theme, s.language, s.tray_icon)),
            queue: ui.and_then(|ui| ui.snapshot.clone()),
            preparation_retry_available: ui.is_some_and(|ui| ui.preparation_retry_available()),
            preparation_copy_pending: ui.is_some_and(|ui| ui.preparation_copy_pending),
            preparation_status: ui.and_then(|ui| ui.preparation_status_at(main.now())),
            upstream: ui.map(|ui| ui.upstream.clone()).unwrap_or_default(),
            preview_upstream: None,
            upstream_available: ui.is_some_and(|ui| ui.upstream_check_available()),
            engine_command_pending: ui.is_some_and(|ui| ui.engine_command_pending),
            engine_notice: ui.and_then(|ui| ui.engine_notice),
        }
    }
    fn upstream_snapshot(&self) -> ameow_next::download::upstream::UpstreamSnapshot {
        self.preview_upstream.clone().unwrap_or_else(|| self.upstream.snapshot())
    }
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Page {
    General,
    Download,
    Components,
    About,
}
#[derive(Clone, Copy)]
enum PreferenceKind { Theme, Language, TrayIcon }
impl PreferenceKind {
    const ALL: [Self; 3] = [Self::Theme, Self::Language, Self::TrayIcon];
    fn id(self) -> &'static str {
        match self { Self::Theme => "theme-menu", Self::Language => "language-menu", Self::TrayIcon => "tray-icon-menu" }
    }
    fn labels(self, l: Language) -> [&'static str; 3] {
        match self {
            Self::Theme => [l.text("跟随系统", "System"), l.text("浅色", "Light"), l.text("深色", "Dark")],
            Self::Language => [l.text("跟随系统", "System"), "简体中文", "English"],
            Self::TrayIcon => [l.text("跟随外观", "Follow appearance"), "Ameow Blue", "Apricot"],
        }
    }
    fn selected(self, projection: &Projection) -> Option<usize> {
        let (theme, language, icon) = projection.preferences?;
        Some(match self {
            Self::Theme => match theme { ThemePreference::System => 0, ThemePreference::Light => 1, ThemePreference::Dark => 2 },
            Self::Language => match language { LanguagePreference::System => 0, LanguagePreference::Chinese => 1, LanguagePreference::English => 2 },
            Self::TrayIcon => match icon { TrayIconPreference::FollowAppearance => 0, TrayIconPreference::AmeowBlue => 1, TrayIconPreference::Apricot => 2 },
        })
    }
 }
struct PreferenceSelect {
    kind: PreferenceKind, trigger: FocusHandle, menu: FocusHandle, open: bool, cursor: usize,
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum ButtonStyle {
    Standard,
    Quiet,
    Menu,
}
pub struct SettingsWindow {
    main: WeakEntity<Prototype>,
    projection: Projection,
    _observer: Subscription,
    _component_menu_blur: Subscription,
    focus: FocusHandle,
    component_menu_focus: FocusHandle,
    page: Page,
    scroll: ScrollHandle,
    control_focus: RefCell<HashMap<String, FocusHandle>>,
    reveal_focus: Rc<Cell<bool>>,
    picker_pending: bool,
    open_pending: bool,
    notice: Option<(String, bool)>,
    health_path: Option<PathBuf>,
    health_generation: u64,
    health: Option<Result<(), String>>,
    startup: Option<Result<StartupState, String>>,
    startup_pending: bool,
    selects: Vec<PreferenceSelect>,
    _select_subscriptions: Vec<Subscription>,
    motion: crate::ui_motion::Motion,
    tooltips: crate::ui_tooltip::Host,
    shown_page: (Page, bool),
    previous_page: Option<(Page, bool)>,
    passive: Cell<bool>,
    _help_focus_subscriptions: Vec<Subscription>,
    preview_select: Option<PreferenceKind>,
    keyboard_focus: bool,
    component_menu_open: bool,
    help_open: Option<&'static str>,
    upstream_feedback: Option<(std::time::Instant, bool)>,
    title_language: Language,
    update_notice_deadline: Option<std::time::Instant>,
    notices_open: bool,
    notices_focus: FocusHandle,
    notices_scroll: ListState,
    notices_copied: Option<bool>,
    copy_feedback: HashMap<&'static str, std::time::Instant>,
}
impl SettingsWindow {
    #[cfg(test)]
    pub(super) fn acceptance_snapshot(&self, window: &Window, _: &App) -> serde_json::Value {
        serde_json::json!({
            "selects": self.selects.iter().map(|s| serde_json::json!({
                "id": s.kind.id(), "value": s.kind.selected(&self.projection),
                "ack": s.kind.selected(&self.projection), "open": s.open,
                "focused": if s.open { s.menu.is_focused(window) } else { s.trigger.is_focused(window) },
            })).collect::<Vec<_>>(),
            "disabled": self.projection.preferences.is_none() || self.projection.pending || self.picker_pending,
            "status": format!("{:?}", self.projection.status),
            "page": match self.page {Page::General=>"general",Page::Download=>"download",Page::Components=>"components",Page::About=>"about"},
            "browser_sessions": self.projection.queue.as_ref().map(|q| &q.browser_sessions),
        })
    }
    fn new(
        main: Entity<Prototype>,
        projection: Projection,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        if !cx.has_global::<SettingsKeyBindings>() {
            cx.bind_keys([
                KeyBinding::new("tab", TabForward, Some("AmeowSettings")),
                KeyBinding::new("shift-tab", TabBackward, Some("AmeowSettings")),
            ]);
            cx.set_global(SettingsKeyBindings);
        }
        #[cfg(target_os = "windows")]
        crate::brand_icons::set_window(hwnd(window));
        let observer = cx.observe(&main, |this, main, cx| {
            if this.projection.preview { return; }
            let next = Projection::from_main(main.read(cx));
            let update_scheduled = next.app_update.update.phase == ameow_next::app_update::Phase::WaitingForTasks
                && this.projection.app_update.update.phase != ameow_next::app_update::Phase::WaitingForTasks;
            if next.path != this.projection.path || next.status != this.projection.status {
                this.notice = None;
            }
            this.projection = next;
            if update_scheduled { this.show_update_notice(cx); }
            this.refresh_health(false, cx);
            cx.notify();
        });
        let focus = cx.focus_handle();
        let component_menu_focus = cx.focus_handle();
        let component_menu_blur = cx.on_focus_out(&component_menu_focus, window, |this, _, _, cx| {
            if this.component_menu_open {
                this.component_menu_open = false;
                cx.notify();
            }
        });
        window.focus(&focus, cx);
        let mut select_subscriptions = Vec::new();
        let selects = PreferenceKind::ALL.into_iter().enumerate().map(|(index, kind)| {
            let trigger = cx.focus_handle().tab_index(0).tab_stop(true);
            let menu = cx.focus_handle();
            select_subscriptions.push(cx.on_focus_out(&menu, window, move |this, _, _, cx| {
                if this.selects[index].open { this.selects[index].open = false; cx.notify(); }
            }));
            PreferenceSelect { kind, trigger, menu, open: false, cursor: kind.selected(&projection).unwrap_or(0) }
        }).collect();
        let mut control_focus = HashMap::new();
        let mut help_focus_subscriptions = Vec::new();
        for id in ["download-read-help", "update-auto-check-help", "update-auto-download-help", "update-idle-restart-help"] {
            let focus = cx.focus_handle().tab_index(0).tab_stop(true);
            help_focus_subscriptions.push(cx.on_focus_in(&focus, window, move |this, _, cx| {
                if this.keyboard_focus { this.help_open = Some(id); cx.notify(); }
            }));
            help_focus_subscriptions.push(cx.on_focus_out(&focus, window, move |this, _, _, cx| {
                if this.help_open == Some(id) { this.help_open = None; cx.notify(); }
            }));
            control_focus.insert(id.to_owned(), focus);
        }
        let mut this = Self {
            title_language: projection.language,
            main: main.downgrade(),
            projection,
            _observer: observer,
            _component_menu_blur: component_menu_blur,
            focus,
            component_menu_focus,
            page: Page::General,
            scroll: ScrollHandle::new(),
            control_focus: RefCell::new(control_focus),
            reveal_focus: Rc::new(Cell::new(false)),
            picker_pending: false,
            open_pending: false,
            notice: None,
            health_path: None,
            health_generation: 0,
            health: None,
            startup: None,
            startup_pending: false,
            selects,
            _select_subscriptions: select_subscriptions,
            motion: crate::ui_motion::Motion::default(),
            tooltips: crate::ui_tooltip::Host::new(cx),
            shown_page: (Page::General, false), previous_page: None, passive: Cell::new(false),
            _help_focus_subscriptions: help_focus_subscriptions,
            preview_select: None,
            keyboard_focus: false,
            component_menu_open: false,
            help_open: None,
            upstream_feedback: None,
            update_notice_deadline: None,
            notices_open: false,
            notices_focus: cx.focus_handle().tab_index(0).tab_stop(true),
            notices_scroll: ListState::new(ameow_next::third_party_notices::TEXT.lines().count(), ListAlignment::Top, px(100.)),
            notices_copied: None,
            copy_feedback: HashMap::new(),
        };
        this.refresh_health(true, cx);
        this.refresh_startup(None, cx);
        cx.spawn(async move |this, cx| {
            let mut ticks = 0;
            loop {
                cx.background_executor()
                    .timer(std::time::Duration::from_secs(1))
                    .await;
                ticks += 1;
                if this
                    .update(cx, |this, cx| {
                        if this.projection.preview { return; }
                        if ticks % 10 == 0 {
                            this.refresh_startup(None, cx);
                        }
                        if this.page == Page::Components {
                            if let Ok(next) =
                                this.main.update(cx, |main, _| Projection::from_main(main))
                            {
                                this.projection = next;
                            }
                            cx.notify();
                        }
                    })
                    .is_err()
                {
                    break;
                }
            }
        })
        .detach();
        this
    }
    fn refresh_startup(&mut self, change: Option<bool>, cx: &mut Context<Self>) {
        // The ignored native acceptance host must never touch user startup registration.
        #[cfg(test)]
        if std::env::var_os("AMEOW_NATIVE_ACCEPTANCE_DIR").is_some() {
            self.startup = Some(Err("测试宿主禁用用户启动项操作".into()));
            return;
        }
        if self.projection.preview {
            if let Some(on) = change { self.startup = Some(Ok(if on { StartupState::Enabled } else { StartupState::Disabled })); cx.notify(); }
            return;
        }
        if self.startup_pending {
            return;
        }
        self.startup_pending = true;
        let task = cx.background_executor().spawn(async move {
            match change {
                Some(enabled) => login_startup::set_enabled(enabled),
                None => login_startup::read(),
            }
        });
        cx.spawn(async move |this, cx| {
            let result = task.await;
            let _ = this.update(cx, |this, cx| {
                this.startup_pending = false;
                this.startup = Some(result);
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }
    fn save_preferences(
        &mut self,
        theme: ThemePreference,
        language: LanguagePreference,
        cx: &mut Context<Self>,
    ) {
        if self.projection.preview { return; }
        if self.projection.pending || self.picker_pending || self.projection.preferences.is_none() {
            return;
        }
        self.notice = None;
        let admitted = self
            .main
            .update(cx, |main, cx| {
                let now = main.now();
                let admitted = main
                    .downloads
                    .as_mut()
                    .is_some_and(|ui| ui.request_preferences(theme, language, now));
                cx.notify();
                admitted
            })
            .unwrap_or(false);
        if !admitted {
            self.notice = Some((
                "当前无法保存，若另一个设置正在保存，请稍后重试".into(),
                true,
            ));
        }
        cx.notify();
    }
    fn notice_bar(&self, id: &str, current: Option<(String, bool)>) -> Div {
        let p = Palette::new(self.projection.night);
        let mut slot = div();
        if let Some((text, danger, presence)) = self.motion.notice(id, current) {
            slot = slot.child(self.motion.reveal(id, presence,
                div().pt(px(12.)).child(inline_notice(p, text, danger))));
        }
        slot
    }
    fn help_button(&self, id: &'static str, label: &'static str, text: String, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.projection.night);
        let (container, focus) = self.control_container(id, true, cx);
        let tooltip = text.clone();
        let open = !self.passive.get() && self.help_open == Some(id);
        container.relative().flex_none()
            .child(gpui_base::Button::new(id).disabled(self.passive.get()).track_focus(&focus).accessibility_label(label)
                .size(px(tokens::SMALL_ICON_BUTTON_SIZE)).flex().items_center().justify_center().rounded(px(4.))
                .border_1().border_color(transparent_black()).cursor_pointer()
                .bg(p.badge).hover(move |s| tokens::icon_hover(s, p)).active(move |s| s.bg(p.border))
                .focus(move |s| s.border_color(p.neutral))
                .when(!open, |s| s.tooltip_above(&self.tooltips, move |_, cx| cx.new(|_| HelpTooltip {
                    text: tooltip.clone(), night: p.night,
                }).into()))
                .child(svg().path("icons/info.svg").size(px(tokens::ICON_SIZE)).text_color(p.neutral))
                .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.help_open = if open { None } else { Some(id) };
                    cx.notify();
                })))
            .when(self.motion.presence(format!("help:{id}"), open).visible(), |s| s.child(self.help_panel(id, text, cx)))
            .into_any_element()
    }
    fn help_panel(&self, id: &str, text: String, cx: &mut Context<Self>) -> Div {
        let presence = self.motion.presence(format!("help:{id}"), !self.passive.get() && self.help_open == Some(id));
        let p = Palette::new(self.projection.night);
        let panel = div().relative().top(px(presence.travel(-4.))).opacity(presence.alpha)
            .w(px(252.)).p(px(10.)).rounded(px(6.)).bg(p.surface)
            .border_1().border_color(p.control_border()).occlude()
            .text_color(p.primary_text()).text_size(px(12.)).line_height(px(18.))
            .child(text)
            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .on_mouse_down_out(cx.listener(|this, _, _, cx| {
                this.help_open = None; this.update_notice_deadline = None; cx.notify();
            }));
        div().absolute().left_0().top(px(28.))
            .child(deferred(anchored().anchor(gpui::Anchor::TopLeft)
                .snap_to_window_with_margin(Edges::all(px(12.))).child(panel)))
    }
    fn show_update_notice(&mut self, cx: &mut Context<Self>) {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(4);
        self.update_notice_deadline = Some(deadline);
        self.help_open = Some("update-restart-notice");
        cx.spawn(async move |this, cx| {
            cx.background_executor().timer(std::time::Duration::from_secs(4)).await;
            let _ = this.update(cx, |this, cx| {
                if this.update_notice_deadline == Some(deadline) {
                    this.update_notice_deadline = None;
                    if this.help_open == Some("update-restart-notice") { this.help_open = None; }
                    cx.notify();
                }
            });
        }).detach();
        cx.notify();
    }
    fn general_page(&self, cx: &mut Context<Self>) -> AnyElement {
        let l = self.projection.language;
        let p = Palette::new(self.projection.night);
        let prefs = self.projection.preferences;
        let enabled = prefs.is_some() && !self.projection.pending && !self.picker_pending;
        let on = matches!(self.startup, Some(Ok(StartupState::Enabled)));
        let switch_enabled = !self.startup_pending && self.startup.is_some() && !self.passive.get();
        let thumb = self.motion.value("switch:startup", if on { 1. } else { 0. });
        let switch = self.focusable_control("startup-switch", switch_enabled, cx)
            .w(px(40.))
            .h(px(32.))
            .rounded(px(6.))
            .border_1()
            .border_color(transparent_black())
            .flex()
            .items_center()
            .justify_end()
            .child(div().relative().w(px(32.)).h(px(18.)).rounded(px(9.)).bg(p.control_border())
                .child(div().absolute().inset_0().rounded_full().bg(p.blue.opacity(thumb)))
                .child(div().absolute().left(px(3. + 14. * thumb)).top(px(3.)).size(px(12.)).rounded_full().bg(p.surface)))
            .opacity(if switch_enabled { 1. } else { 0.45 })
            .when(switch_enabled, |s| {
                s.cursor_pointer()
                    .when(self.keyboard_focus, |s| {
                        s.focus(move |s| s.border_color(p.blue))
                    })
                    .on_click(
                        cx.listener(move |this, _, _, cx| this.refresh_startup(Some(!on), cx)),
                    )
                    .on_key_down(cx.listener(move |this, event: &KeyDownEvent, _, cx| {
                        if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                            this.refresh_startup(Some(!on), cx);
                            cx.stop_propagation();
                        }
                    }))
            });
        #[cfg(target_os = "macos")]
        let switch = div().flex().items_center().gap(px(8.))
            .when(matches!(self.startup, Some(Ok(StartupState::RequiresApproval))), |control| {
                control.child(self.button(
                    "startup-unregister",
                    l.text("撤销注册", "Unregister"),
                    !self.startup_pending,
                    ButtonStyle::Quiet,
                    cx,
                    |this, _, cx| this.refresh_startup(Some(false), cx),
                ))
            })
            .child(switch);
        let row = |label: &'static str, control: AnyElement| {
            div()
                .min_h(px(56.))
                .flex()
                .items_center()
                .justify_between()
                .gap(px(12.))
                .child(div().flex_none().text_size(px(13.)).child(label))
                .child(control)
        };
        let startup_status = match &self.startup {
            #[cfg(target_os = "macos")]
            Some(Ok(StartupState::RequiresApproval)) => Some((
                l.text(
                    "尚未获准开机启动。请在系统设置的“登录项”中批准，或撤销注册。",
                    "Login startup is not approved. Approve it in System Settings > Login Items, or unregister.",
                ).to_owned(),
                true,
            )),
            #[cfg(target_os = "macos")]
            Some(Ok(StartupState::Stale)) => Some((
                l.text(
                    "系统尚未找到有效登录项，开启可注册或修复。",
                    "No valid login item was found; turn on to register or repair it.",
                ).to_owned(),
                true,
            )),
            #[cfg(target_os = "windows")]
            Some(Ok(StartupState::Stale)) => Some((
                l.text(
                    "启动项指向旧位置，开启可修复。",
                    "Startup entry points to an old location; turn on to repair.",
                )
                .to_owned(),
                true,
            )),
            Some(Err(error)) => Some((
                format!(
                    "{}{}",
                    l.text(
                        "无法读取或更改启动项：",
                        "Cannot read or change startup entry: "
                    ),
                    settings_message(l, error)
                ),
                true,
            )),
            _ if self.startup_pending => Some((
                l.text("正在读取系统状态…", "Reading system status…").into(),
                false,
            )),
            _ => None,
        };
        let group = div()
            .flex()
            .flex_col()
            .child(div().pb(px(12.)).child(row(
                l.text("开机启动", "Launch at login"),
                switch.into_any_element(),
            )).child(self.notice_bar("startup", startup_status)))
            .child(row(
                l.text("主题", "Theme"),
                self.preference_select(0, l.text("主题", "Theme"), enabled, cx),
            ))
            .child(row(
                l.text("语言", "Language"),
                self.preference_select(1, l.text("语言", "Language"), enabled, cx),
            ))
            .child(row(
                l.text("托盘图标", "Tray icon"),
                self.preference_select(2, l.text("托盘图标", "Tray icon"), enabled, cx),
            ));
        let status = if let Some((message, danger)) = &self.notice {
            Some((settings_message(l, message), *danger))
        } else if let Some(error) = &self.projection.error {
            Some((
                format!(
                    "{}{}",
                    l.text("无法读取设置：", "Cannot load settings: "),
                    settings_message(l, error)
                ),
                true,
            ))
        } else {
            match &self.projection.status {
                SettingsStatus::Saving => Some((l.text("正在保存…", "Saving…").into(), false)),
                SettingsStatus::Failed(message) => Some((settings_message(l, message), true)),
                _ => None,
            }
        };
        div()
            .flex()
            .flex_col()
            .child(group)
            .child(self.notice_bar("general_page", status))
            .into_any_element()
    }
    fn set_preference_open(&mut self, index: usize, open: bool, window: &mut Window, cx: &mut Context<Self>) {
        if open && (self.projection.pending || self.picker_pending || self.projection.preferences.is_none()) { return; }
        for (other, select) in self.selects.iter_mut().enumerate() {
            if other != index { select.open = false; }
        }
        let select = &mut self.selects[index];
        if open && !select.open { select.cursor = select.kind.selected(&self.projection).unwrap_or(0); }
        select.open = open;
        window.focus(if open { &select.menu } else { &select.trigger }, cx);
        cx.notify();
    }
    fn confirm_preference(&mut self, index: usize, window: &mut Window, cx: &mut Context<Self>) {
        if !self.selects[index].open { return; }
        let select = &self.selects[index];
        let (kind, cursor) = (select.kind, select.cursor);
        self.set_preference_open(index, false, window, cx);
        self.select_option(kind, cursor, cx);
        // Base Select focuses its content after Confirm; restore the trigger after that dispatch.
        let trigger = self.selects[index].trigger.clone();
        let menu = self.selects[index].menu.clone();
        window.on_next_frame(move |window, cx| {
            if menu.is_focused(window) { window.focus(&trigger, cx); }
        });
    }
    fn preference_select(&self, index: usize, label: &'static str, enabled: bool, cx: &mut Context<Self>) -> AnyElement {
        let select = &self.selects[index];
        let enabled = enabled && !self.passive.get();
        let p = Palette::new(self.projection.night);
        let labels = select.kind.labels(self.projection.language);
        let selected = select.kind.selected(&self.projection);
        let value_label = selected.map_or(self.projection.language.text("不可用", "Unavailable"), |i| labels[i]);
        let id = select.kind.id();
        let open = select.open && enabled;
        let presence = self.motion.presence(format!("select:{id}"), open);
        let cursor_y = self.motion.value(format!("select-cursor:{id}"), select.cursor as f32 * 30.);
        self.control_focus.borrow_mut().insert(id.to_owned(), select.trigger.clone());
        let (container, _) = self.control_container(id, enabled, cx);
        let owner = cx.entity(); let confirm = owner.clone();
        let trigger_bounds = Rc::new(Cell::new(None::<Bounds<Pixels>>));
        let measured_trigger = trigger_bounds.clone();
        let trigger = div().id(("preference-trigger", index)).h(px(32.)).w_full().px(px(10.)).rounded(px(6.))
            .border_1().border_color(if open { p.blue } else { p.control_border() }).bg(p.surface)
            .flex().items_center().justify_between().gap(px(8.)).text_size(px(13.))
            .text_color(if enabled { p.primary_text() } else { p.disabled_text() })
            .child(value_label)
            .child(svg().path("icons/chevron-down.svg").size(px(12.)).text_color(p.neutral))
            .when(enabled, |s| s.cursor_pointer().on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .on_click(cx.listener(move |this, _, window, cx| this.set_preference_open(index, !open, window, cx))));
        let mut root = gpui_base::Select::new(id).open(open).disabled(!enabled)
            .focus_handle(&select.trigger).content_focus_handle(&select.menu)
            .accessibility_label(label).accessibility_value(value_label)
            .w_full().relative()
            .on_open_change(move |open, window, cx| owner.update(cx, |this, cx| this.set_preference_open(index, open, window, cx)))
            .on_confirm(move |window, cx| confirm.update(cx, |this, cx| this.confirm_preference(index, window, cx)))
            .child(div().on_children_prepainted(move |children, _, _| measured_trigger.set(children.first().copied())).child(trigger));
        if presence.visible() {
            let mut menu = div().id(("preference-popup", index)).relative().w(px(176.)).p(px(4.))
                .rounded(px(8.)).border_1().border_color(p.border).bg(p.surface).occlude()
                .opacity(presence.alpha).top(px(presence.travel(-4.)))
                .shadow(vec![BoxShadow { inset: false, color: gpui::black().opacity(0.12 * presence.alpha.powi(3)),
                    offset: point(px(0.), px(2.)), blur_radius: px(10.), spread_radius: px(0.) }])
                .when(open, |s| s.track_focus(&select.menu))
                .role(Role::ListBox).aria_label(label)
                .on_mouse_down_out(cx.listener(move |this, event: &MouseDownEvent, window, cx| {
                    // The trigger owns its toggle; dismissing here would reopen it on mouse-up.
                    if trigger_bounds.get().is_some_and(|bounds| bounds.contains(&event.position)) { return; }
                    if this.selects[index].open { this.set_preference_open(index, false, window, cx); }
                }))
                .on_action(cx.listener(move |this, _: &gpui_base::actions::SelectDown, _, cx| {
                    if this.selects[index].open { this.selects[index].cursor = (this.selects[index].cursor + 1) % 3; cx.notify(); cx.stop_propagation(); }
                }))
                .on_action(cx.listener(move |this, _: &gpui_base::actions::SelectUp, _, cx| {
                    if this.selects[index].open { this.selects[index].cursor = (this.selects[index].cursor + 2) % 3; cx.notify(); cx.stop_propagation(); }
                }))
                .child(div().absolute().left(px(4.)).right(px(4.)).top(px(4. + cursor_y)).h(px(30.)).rounded(px(4.)).bg(p.badge));
            for (option, text) in labels.into_iter().enumerate() {
                menu = menu.child(div().id(("preference-option", option)).relative().h(px(30.)).px(px(8.))
                    .flex().items_center().justify_between().text_size(px(13.)).text_color(p.primary_text())
                    .role(Role::ListBoxOption).aria_label(text).aria_selected(selected == Some(option))
                    .when(open && select.cursor == option, |s| s.aria_active_descendant())
                    .child(text).when(selected == Some(option), |s| s.child(svg().path("icons/check.svg").size(px(12.)).text_color(p.neutral)))
                    .when(open, |s| s.cursor_pointer().on_hover(cx.listener(move |this, inside, _, cx| {
                        if *inside { this.selects[index].cursor = option; cx.notify(); }
                    })).on_click(cx.listener(move |this, _, window, cx| {
                        if this.selects[index].open { this.selects[index].cursor = option; this.confirm_preference(index, window, cx); }
                    }))));
            }
            root = root.child(div().absolute().right_0().top(px(38.)).child(deferred(
                anchored().anchor(gpui::Anchor::TopRight).snap_to_window_with_margin(Edges::all(px(12.))).child(menu))));
        }
        container.w(px(176.)).child(root).into_any_element()
    }
    fn select_option(&mut self, kind: PreferenceKind, index: usize, cx: &mut Context<Self>) {
        if index >= 3 || self.projection.pending || self.picker_pending { cx.notify(); return; }
        if self.projection.preview {
            // Gallery mutates only its disposable projection, never settings or the OS.
            if let Some((theme, language, icon)) = self.projection.preferences {
                self.projection.preferences = Some(match kind {
                    PreferenceKind::Theme => ([ThemePreference::System, ThemePreference::Light, ThemePreference::Dark][index], language, icon),
                    PreferenceKind::Language => (theme, [LanguagePreference::System, LanguagePreference::Chinese, LanguagePreference::English][index], icon),
                    PreferenceKind::TrayIcon => (theme, language, [TrayIconPreference::FollowAppearance, TrayIconPreference::AmeowBlue, TrayIconPreference::Apricot][index]),
                });
                match kind {
                    PreferenceKind::Theme if index != 0 => self.projection.night = index == 2,
                    PreferenceKind::Language if index != 0 => self.projection.language = if index == 2 { Language::English } else { Language::Chinese },
                    _ => {}
                }
            }
            cx.notify(); return;
        }
        if let Some((theme, language, tray_icon)) = self.projection.preferences {
            if matches!(kind, PreferenceKind::Theme) {
                let next = [
                    ThemePreference::System,
                    ThemePreference::Light,
                    ThemePreference::Dark,
                ][index];
                if next != theme {
                    self.save_preferences(next, language, cx);
                    return;
                }
            } else if matches!(kind, PreferenceKind::Language) {
                let next = [
                    LanguagePreference::System,
                    LanguagePreference::Chinese,
                    LanguagePreference::English,
                ][index];
                if next != language {
                    self.save_preferences(theme, next, cx);
                    return;
                }
            } else if matches!(kind, PreferenceKind::TrayIcon) {
                let next = [TrayIconPreference::FollowAppearance, TrayIconPreference::AmeowBlue, TrayIconPreference::Apricot][index];
                if next != tray_icon && !self.projection.pending && !self.picker_pending {
                    self.notice = None;
                    let admitted = self.main.update(cx, |main, cx| {
                        let now = main.now();
                        let admitted = main.downloads.as_mut().is_some_and(|ui| ui.request_tray_icon(next, now));
                        cx.notify();
                        admitted
                    }).unwrap_or(false);
                    if !admitted {
                        self.notice = Some(("当前无法保存，若另一个设置正在保存，请稍后重试".into(), true));
                    }
                }
            }
        }
        cx.notify();
    }
    fn refresh_health(&mut self, force: bool, cx: &mut Context<Self>) {
        if self.projection.preview { return; }
        let Some(path) = self.projection.path.clone() else {
            return;
        };
        if !force && self.health_path.as_ref() == Some(&path) {
            return;
        }
        self.health_path = Some(path.clone());
        self.health = None;
        self.health_generation += 1;
        let generation = self.health_generation;
        let task = cx
            .background_executor()
            .spawn(async move { directory_health(&path) });
        cx.spawn(async move |this, cx| {
            let result = task.await;
            let _ = this.update(cx, |this, cx| {
                if this.health_generation == generation {
                    this.health = Some(result);
                    cx.notify();
                }
            });
        })
        .detach();
    }
    fn choose(&mut self, cx: &mut Context<Self>) {
        if self.projection.preview { return; }
        if self.picker_pending || self.projection.pending || self.projection.path.is_none() {
            return;
        }
        self.picker_pending = true;
        self.notice = None;
        cx.notify();
        let receiver = cx.prompt_for_paths(PathPromptOptions {
            files: false,
            directories: true,
            multiple: false,
            prompt: Some(
                self.projection
                    .language
                    .text("选择下载文件夹", "Choose download folder")
                    .into(),
            ),
        });
        cx.spawn(async move |this, cx| {
            let selection = match receiver.await {
                Ok(Ok(paths)) => normalize_selection(paths),
                Ok(Err(_)) | Err(_) => Err("无法读取文件夹选择结果，请重试".into()),
            };
            let _ = this.update(cx, |this, cx| {
                this.picker_pending = false;
                match selection {
                    Ok(Some(path)) => {
                        let admitted = this
                            .main
                            .update(cx, |main, cx| {
                                let now = main.now();
                                let admitted = main
                                    .downloads
                                    .as_mut()
                                    .is_some_and(|ui| ui.request_output_directory(path, now));
                                cx.notify();
                                admitted
                            })
                            .unwrap_or(false);
                        if !admitted {
                            this.notice = Some((
                                "当前无法保存，若另一个设置正在保存，请稍后重试".into(),
                                true,
                            ));
                        }
                    }
                    // GPUI Windows maps all native Show failures to None, so do not assert cancellation.
                    Ok(None) => this.notice = None,
                    Err(message) => this.notice = Some((message, true)),
                }
                cx.notify();
            });
        })
        .detach();
    }
    fn open_directory(&mut self, cx: &mut Context<Self>) {
        if self.projection.preview { return; }
        if self.projection.pending || self.open_pending || self.picker_pending {
            return;
        }
        let Some(path) = self.projection.path.clone() else {
            return;
        };
        self.open_pending = true;
        self.notice = None;
        let task = cx.background_executor().spawn(async move {
            directory_health(&path)?;
            ameow_next::file_manager::open_directory(&path)
                .map_err(|_| "无法打开文件夹，请检查目录后重试".to_string())
        });
        cx.spawn(async move |this, cx| {
            let result = task.await;
            let _ = this.update(cx, |this, cx| {
                this.open_pending = false;
                this.notice = result.err().map(|message| (message, true));
                this.refresh_health(true, cx);
                cx.notify();
            });
        })
        .detach();
    }
    fn move_focus(&mut self, backwards: bool, window: &mut Window, cx: &mut Context<Self>) {
        self.keyboard_focus = true;
        if let Some(select) = self.selects.iter().find(|select| select.open) {
            let trigger = select.trigger.clone();
            for select in &mut self.selects { select.open = false; }
            window.focus(&trigger, cx);
            if backwards { window.focus_prev(cx); } else { window.focus_next(cx); }
        } else if self.component_menu_open {
            let actions: Vec<_> = self.component_menu_action_ids().iter()
                .filter_map(|id| self.control_focus.borrow().get(*id).cloned()).collect();
            let trigger = self.control_focus.borrow().get("component-details").cloned();
            let stops: Vec<_> = trigger.iter().chain(actions.iter()).collect();
            let current = stops.iter().position(|f| f.is_focused(window)).unwrap_or(0);
            let next = if backwards { current.checked_sub(1) }
                else { (current + 1 < stops.len()).then_some(current + 1) };
            if let Some(next) = next {
                window.focus(stops[next], cx);
            } else {
                self.component_menu_open = false;
                if let Some(trigger) = &trigger { window.focus(trigger, cx); }
                // The closing deferred menu keeps its tab stops for this frame.
                for _ in 0..=actions.len() {
                    if backwards { window.focus_prev(cx); } else { window.focus_next(cx); }
                    if !actions.iter().any(|f| f.is_focused(window)) { break; }
                }
            }
        } else if backwards { window.focus_prev(cx); } else { window.focus_next(cx); }
        self.reveal_focus.set(true);
        cx.notify();
    }
    fn control_container(&self, id: &str, enabled: bool, cx: &mut Context<Self>) -> (Div, FocusHandle) {
        let id = id.to_owned();
        let focus = self.control_focus.borrow_mut().entry(id.clone())
            .or_insert_with(|| cx.focus_handle().tab_index(0).tab_stop(true)).clone();
        let enabled = enabled && !self.passive.get();
        let tracked = focus.clone();
        let scroll = self.scroll.clone();
        let reveal = self.reveal_focus.clone();
        let container = div().on_children_prepainted(move |children, window, _| {
            // Reveal only on keyboard traversal, so wheel scrolling never fights the focused control.
            if !enabled || id == "close-settings" || !reveal.get() || !focus.is_focused(window) { return; }
            if let Some(bounds) = children.into_iter().reduce(|a, b| a.union(&b)) {
                let target = Bounds::new(bounds.origin - point(px(0.), px(8.)),
                    size(bounds.size.width, bounds.size.height + px(16.)));
                let delta = focus_scroll_delta(scroll.bounds(), target);
                if delta != px(0.) {
                    scroll.set_offset(scroll.offset() + point(px(0.), delta));
                    window.refresh();
                }
            }
        });
        (container, tracked)
    }
    fn focusable_control(&self, id: &'static str, enabled: bool, cx: &mut Context<Self>) -> Stateful<Div> {
        let (container, focus) = self.control_container(id, enabled, cx);
        container.id(id).when(enabled, |s| s.track_focus(&focus))
    }
    fn button(
        &self,
        id: &'static str,
        label: impl IntoElement,
        enabled: bool,
        style: ButtonStyle,
        cx: &mut Context<Self>,
        action: impl Fn(&mut Self, &mut Window, &mut Context<Self>) + 'static,
    ) -> AnyElement {
        let p = Palette::new(self.projection.night);
        let quiet = matches!(style, ButtonStyle::Quiet | ButtonStyle::Menu);
        let enabled = enabled && !self.passive.get();
        let (container, focus) = self.control_container(id, enabled, cx);
        let button = gpui_base::Button::new(id)
            .track_focus(&focus)
            .disabled(!enabled)
            .flex_none()
            .h(px(tokens::CONTROL_HEIGHT))
            .px(px(if style == ButtonStyle::Quiet {
                0.
            } else if quiet {
                8.
            } else {
                12.
            }))
            .flex()
            .items_center()
            .justify_center()
            .when(style == ButtonStyle::Menu, |s| s.w_full().justify_start())
            .rounded(px(tokens::CONTROL_RADIUS))
            .border_1()
            .border_color(if quiet {
                transparent_black()
            } else {
                p.control_border()
            })
            .bg(if quiet {
                transparent_black()
            } else {
                p.surface
            })
            .text_color(if enabled {
                p.primary_text()
            } else {
                p.disabled_text()
            })
            .text_size(px(tokens::CONTROL_FONT_SIZE))
            .line_height(px(tokens::CONTROL_LINE_HEIGHT))
            .child(label)
            .when(enabled, |s| {
                s.cursor_pointer()
                    .hover(move |s| s.bg(p.badge))
                    .when(self.keyboard_focus, |s| {
                        s.focus(move |s| s.border_color(p.blue))
                    })
                    .on_click(cx.listener(move |this, _, window, cx| action(this, window, cx)))
            });
        container.flex_none().child(button).into_any_element()
    }
    fn nav(&self, page: Page, label: &'static str, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.projection.night);
        let selected = self.page == page;
        let icon = match page {
            Page::General => "icons/sliders-horizontal.svg",
            Page::Download => "icons/download.svg",
            Page::Components => "icons/blocks.svg",
            Page::About => "icons/info.svg",
        };
        div()
            .id(label)
            .h(px(36.))
            .px(px(8.))
            .rounded(px(6.))
            .flex()
            .items_center()
            .gap(px(8.))
            .bg(transparent_black())
            .text_color(if selected {
                p.primary_text()
            } else {
                p.neutral
            })
            .text_size(px(13.))
            .focusable()
            .tab_index(0)
            .cursor_pointer()
            .border_1()
            .border_color(transparent_black())
            .when(self.keyboard_focus, |s| {
                s.focus(move |s| s.border_color(p.blue))
            })
            .when(!selected, |s| s.hover(move |s| s.bg(p.badge)))
            .child(svg().path(icon).size(px(14.)).flex_none()
                .text_color(if selected { p.primary_text() } else { p.neutral }))
            .whitespace_nowrap()
            .child(label)
            .on_key_down(cx.listener(move |this, event: &KeyDownEvent, _, cx| {
                if event.keystroke.key == "enter" || event.keystroke.key == "space" {
                    for select in &mut this.selects { select.open = false; }
                    this.page = page;
                    this.notices_open = false;
                    this.component_menu_open = false;
                    this.help_open = None;
                    this.scroll.set_offset(point(px(0.), px(0.)));
                    cx.notify();
                    cx.stop_propagation();
                }
            }))
            .on_click(cx.listener(move |this, _, _, cx| {
                for select in &mut this.selects { select.open = false; }
                this.page = page;
                this.notices_open = false;
                this.component_menu_open = false;
                this.help_open = None;
                this.scroll.set_offset(point(px(0.), px(0.)));
                cx.notify();
            }))
            .into_any_element()
    }
    fn reset_copy_feedback_later(&mut self, id: &'static str, cx: &mut Context<Self>) {
        let started = std::time::Instant::now();
        self.copy_feedback.insert(id, started);
        cx.spawn(async move |this, cx| {
            cx.background_executor().timer(std::time::Duration::from_millis(crate::ui_motion::COPY_FEEDBACK_MS)).await;
            let _ = this.update(cx, |this, cx| {
                // A repeated copy starts a fresh hold; an older timer cannot clear it.
                if this.copy_feedback.get(id) != Some(&started) { return; }
                this.copy_feedback.remove(id);
                match id {
                    "path" if this.notice.as_ref().is_some_and(|(message, danger)| !danger && message == "完整路径已复制") => this.notice = None,
                    "notices" if this.notices_copied == Some(true) => this.notices_copied = None,
                    "component" if this.projection.preview && this.projection.preparation_status.as_ref()
                        .is_some_and(|(message, danger)| !danger && message == "已复制组件诊断") => this.projection.preparation_status = None,
                    _ => {},
                }
                cx.notify();
            });
        }).detach();
    }
    fn copy_path(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(path) = &self.projection.path {
            let result = if self.projection.preview { Ok(()) }
                else { crate::tray::copy_text(hwnd(window), &display_path(&path.to_string_lossy())) };
            self.notice = Some(match result {
                Ok(()) => ("完整路径已复制".into(), false),
                Err(_) => ("无法复制路径，请重试".into(), true),
            });
            if result.is_ok() { self.reset_copy_feedback_later("path", cx); }
            cx.notify();
        }
    }
    fn download_page(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.projection.night);
        let l = self.projection.language;
        let enabled =
            self.projection.path.is_some() && !self.projection.pending && !self.picker_pending;
        let path = download_location_label(self.projection.path.as_deref(), self.projection.error.as_deref(), l);
        let read_error = self.projection.error.as_deref().filter(|_| self.projection.path.is_none());
        let copied = self.notice.as_ref().is_some_and(|(message, danger)| !danger && message == "完整路径已复制");
        let preview = path_preview(&path);
        let status = if let Some((message, danger)) = &self.notice {
            (!copied).then(|| (settings_message(l, message), *danger))
        } else if let Some(error) = &self.projection.error {
            read_error.is_none().then(|| (settings_message(l, error), true))
        } else {
            match &self.projection.status {
                SettingsStatus::Saving => Some((l.text("正在保存…", "Saving…").into(), false)),
                SettingsStatus::Failed(message) => Some((settings_message(l, message), true)),
                _ => None,
            }
        };
        div()
            .flex()
            .flex_col()
            .child(
                div()
                    .pb(px(4.))
                    .flex()
                    .flex_col()
                    .child(
                        div()
                            .min_h(px(56.))
                            .flex()
                            .items_center()
                            .gap(px(8.))
                            .child(
                                div()
                                    .flex_1()
                                    .text_size(px(13.))
                                    .child(l.text("下载位置", "Download location")),
                            )
                            .child(self.icon_button(
                                "open-folder",
                                if self.open_pending { "icons/loader-circle.svg" } else { "icons/folder-open.svg" },
                                if self.open_pending {
                                    l.text("正在打开…", "Opening…")
                                } else {
                                    l.text("打开", "Open")
                                },
                                enabled && !self.open_pending, cx,
                                |this, _, cx| this.open_directory(cx),
                            ))
                            .child(self.button(
                                "choose-folder",
                                if self.picker_pending {
                                    l.text("正在选择…", "Choosing…")
                                } else {
                                    l.text("更改", "Change")
                                },
                                enabled,
                                ButtonStyle::Standard,
                                cx,
                                |this, _, cx| this.choose(cx),
                            )),
                    )
                    .child(
                        div().w_full().min_h(px(44.)).pl(px(12.)).pr(px(6.)).py(px(6.))
                            .rounded(px(6.)).bg(p.badge.opacity(0.55)).flex().items_center().gap(px(8.))
                            .flex_none().min_w(px(0.))
                            .when(read_error.is_some(), |s| s.child(svg().path("icons/circle-alert.svg")
                                .size(px(14.)).flex_none().text_color(error_text(p))))
                            .child(div().id("download-path-preview").flex_1().min_w(px(0.))
                                .text_size(px(12.)).font(tokens::ui_font())
                                .overflow_hidden().whitespace_nowrap()
                                .when(self.projection.path.is_some() && preview != path, |s| s.tooltip_above(&self.tooltips, {
                                    let full_path = path.clone();
                                    move |_, cx| cx.new(|_| ValueTooltip { path: full_path.clone(), night: p.night }).into()
                                }))
                                // Bound the preview before GPUI's early zero-width measure.
                                .child(preview))
                            .when(self.projection.path.is_some(), |s| s.child(self.icon_button(
                                "copy-folder", if copied { "icons/check.svg" } else { "icons/copy.svg" },
                                if copied { l.text("已复制", "Copied") } else { l.text("复制路径", "Copy path") },
                                true, cx,
                                |this, window, cx| this.copy_path(window, cx),
                            )))
                            .when_some(read_error, |s, error| s.child(self.help_button(
                                "download-read-help", l.text("读取失败详情", "Read error details"),
                                settings_message(l, error), cx))),
                    ),
            )
            .child(self.notice_bar("download_page", status))
            .child(self.notice_bar("download-health", self.health.as_ref()
                .and_then(|health| health.as_ref().err()).map(|error| (settings_message(l, error), true))))
            .child(self.browser_sessions_section(cx))
            .into_any_element()
    }
    fn session_command(&mut self, command: ameow_next::download::queue::QueueCommand, cx: &mut Context<Self>) {
        if self.projection.preview { return; }
        let accepted = self.main.update(cx, |main, cx| {
            let now = main.now();
            let accepted = main.downloads.as_mut().is_some_and(|ui| ui.send(command, now));
            cx.notify(); accepted
        }).unwrap_or(false);
        if !accepted { self.notice = Some((self.projection.language.text("操作未受理，请重试", "Request was not accepted. Try again.").into(), true)); }
        cx.notify();
    }
    fn browser_sessions_section(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.projection.night); let l = self.projection.language;
        let status = self.projection.queue.as_ref().map(|q| q.browser_sessions.clone()).unwrap_or_default();
        let enabled = !self.projection.preview && !self.passive.get();
        let mut content = div().mt(px(24.)).border_t_1().border_color(p.border).pt(px(20.))
            .child(div().flex().items_center().justify_between().gap(px(12.))
                .child(div().text_size(px(15.)).font_weight(FontWeight::MEDIUM).child(l.text("浏览器会话", "Browser sessions")))
                .child(div().flex().items_center().gap(px(4.))
                    .child(self.icon_button("open-browser-extension", "icons/folder-open.svg", l.text("扩展文件", "Extension files"), enabled, cx, |this, _, cx| this.open_extension(cx)))
                    .child(self.button("install-browser-bridge", l.text("安装浏览器连接", "Install browser connection"), enabled, ButtonStyle::Standard, cx,
                        |this, _, cx| this.session_command(ameow_next::download::queue::QueueCommand::InstallBrowserBridge, cx)))))
            .child(div().mt(px(8.)).text_size(px(12.)).line_height(px(18.)).text_color(p.neutral)
                .child(l.text("从扩展主动授权站点，之后自动同步此浏览器已有会话。", "Authorize a site in the extension to keep its existing browser session in sync.")));
        if let Some(error) = status.error.as_ref().or(status.notice.as_ref().filter(|n| n.as_str() != "installed")) {
            let message = if error == "E_SESSION_HOST_MISSING" {
                l.text("未找到浏览器连接组件，请使用完整 Ameow 产品包。", "Browser bridge is missing. Use the complete Ameow package.")
            } else { l.text("浏览器连接操作未完成，请重试。", "The browser connection could not be updated. Try again.") };
            content = content.child(div().mt(px(12.)).child(inline_notice(p, message, true)));
        } else if status.notice.as_deref() == Some("installed") {
            content = content.child(div().mt(px(12.)).child(inline_notice(p, l.text("连接已安装。请在 Edge 或 Chrome 扩展页加载包内 browser-extension 文件夹。", "Connection installed. Load the packaged browser-extension folder from Edge or Chrome's extensions page."), false)));
        }
        for session in status.sites {
            let key = format!("remove-session:{}", session.site);
            let (container, focus) = self.control_container(&key, enabled, cx);
            let site = session.site.clone(); let grant_id = session.grant_id.clone();
            let detail = if session.skipped_partitioned > 0 {
                l.text("已同步；分区 Cookie 已排除", "Synced; partitioned cookies excluded").to_owned()
            } else if session.cookie_count == 0 { l.text("已同步；当前无会话 Cookie", "Synced; no current session cookies").to_owned() }
            else { l.text("已同步", "Synced").to_owned() };
            content = content.child(div().mt(px(12.)).py(px(8.)).flex().items_center().gap(px(12.))
                .child(div().flex_1().min_w(px(0.)).flex().flex_col().gap(px(4.))
                    .child(div().text_size(px(13.)).child(session.site.clone()))
                    .child(div().text_size(px(12.)).text_color(p.neutral).child(format!("{} · {} · {}", session.source_name, &session.source_id[..6], detail))))
                .child(container.child(gpui_base::Button::new(SharedString::from(key)).track_focus(&focus).disabled(!enabled)
                    .accessibility_label(format!("{} {}", l.text("移除", "Remove"), session.site))
                    .h(px(tokens::CONTROL_HEIGHT)).px(px(12.)).rounded(px(tokens::CONTROL_RADIUS))
                    .border_1().border_color(p.control_border()).text_size(px(tokens::CONTROL_FONT_SIZE)).text_color(p.primary_text())
                    .child(l.text("移除", "Remove"))
                    .when(enabled, |s| s.cursor_pointer().hover(move |s| s.bg(p.badge))
                        .when(self.keyboard_focus, |s| s.focus(move |s| s.border_color(p.blue)))
                        .on_click(cx.listener(move |this, _, _, cx| this.session_command(ameow_next::download::queue::QueueCommand::RemoveBrowserSession {site: site.clone(), grant_id: grant_id.clone()}, cx)))))));
        }
        content.into_any_element()
    }
    fn open_extension(&mut self, cx: &mut Context<Self>) {
        if self.projection.preview { return; }
        let task = cx.background_executor().spawn(async {
            let path = ameow_next::browser_sessions::native::extension_directory()?;
            ameow_next::file_manager::open_directory(&path).map_err(|e| e.to_string())
        });
        cx.spawn(async move |this, cx| {
            let result = task.await;
            let _ = this.update(cx, |this, cx| {
                if result.is_err() { this.notice = Some((this.projection.language.text("未找到扩展文件，请使用完整 Ameow 产品包。", "Extension files are missing. Use the complete Ameow package.").into(), true)); }
                cx.notify();
            });
        }).detach();
    }
    fn about_page(&self, cx: &mut Context<Self>) -> AnyElement {

        let p = Palette::new(self.projection.night);
        let l = self.projection.language;
        div()
            .min_h_full()
            .flex()
            .flex_col()
            .justify_between()
            .gap(px(24.))
            .child(self.app_update_section(cx))
            .child(
                div().flex_none().border_t_1().border_color(p.border).pt(px(12.))
                    .flex().items_center().justify_between().gap(px(12.))
                    .child(div().text_size(px(12.)).text_color(p.neutral)
                        .child(format!("Ameow {}", ameow_next::app_update::BUILD_VERSION)))
                    .child(div().flex().items_center().gap(px(4.))
                        .child(self.icon_button("project-link", "icons/github.svg",
                            "GitHub · Wutpeach/Ameow", true, cx, |this, _, cx| {
                                if !this.projection.preview { cx.open_url("https://github.com/Wutpeach/Ameow"); }
                            }))
                        .child(self.icon_button("third-party-licenses", "icons/file-text.svg",
                            l.text("第三方许可", "Third-party licenses"), true, cx,
                            |this, window, cx| this.open_notices(window, cx)))),
            )
            .into_any_element()
    }
    fn icon_button(
        &self,
        id: &'static str,
        icon: &'static str,
        label: impl Into<String>,
        enabled: bool,
        cx: &mut Context<Self>,
        action: impl Fn(&mut Self, &mut Window, &mut Context<Self>) + 'static,
    ) -> AnyElement {
        let p = Palette::new(self.projection.night);
        let enabled = enabled && !self.passive.get();
        let arrival = self.motion.change(format!("icon:{id}"), icon);
        let (container, focus) = self.control_container(id, enabled, cx);
        let label = label.into();
        container.flex_none().child(
            gpui_base::Button::new(id).track_focus(&focus).disabled(!enabled).accessibility_label(label.clone())
                .size(px(tokens::CONTROL_HEIGHT)).flex().items_center().justify_center().rounded(px(tokens::CONTROL_RADIUS))
                .border_1().border_color(transparent_black())
                .text_color(if enabled { p.neutral } else { p.disabled_text() })
                .when(id != "close-settings" && (id != "update-restart" || self.help_open != Some("update-restart-notice")), |s| s
                    .tooltip_above(&self.tooltips, move |_, cx| cx.new(|_| HelpTooltip { text: label.clone(), night: p.night }).into()))
                .child(svg().path(icon).size(px(tokens::ICON_SIZE)).opacity(0.4 + 0.6 * arrival).text_color(if enabled { p.neutral } else { p.disabled_text() }))
                .when(enabled, |s| s.cursor_pointer()
                    .hover(move |s| tokens::icon_hover(s, p).text_color(p.primary_text()))
                    .active(move |s| s.bg(p.border))
                    .when(self.keyboard_focus, |s| s.focus(move |s| s.border_color(p.blue)))
                    .on_click(cx.listener(move |this, _, window, cx| action(this, window, cx)))),
        ).into_any_element()
    }
    fn update_action(
        &mut self,
        action: ameow_next::app_update::service::Action,
        cx: &mut Context<Self>,
    ) {
        if self.projection.preview {
            if let ameow_next::app_update::service::Action::Save(preferences) = action {
                self.projection.app_update.preferences = preferences;
                cx.notify();
            }
            return;
        }
        let restart = matches!(&action, ameow_next::app_update::service::Action::Restart);
        let accepted = self
            .main
            .update(cx, |main, cx| main.app_update_action(action, cx)).unwrap_or(false);
        if accepted && restart && self.projection.app_update.update.phase == ameow_next::app_update::Phase::WaitingForTasks {
            self.show_update_notice(cx);
        }
        cx.notify();
    }
    fn update_switch(&self, index: usize, cx: &mut Context<Self>) -> AnyElement {
        use ameow_next::app_update::service::Action;
        let v = &self.projection.app_update;
        let l = self.projection.language;
        let p = Palette::new(self.projection.night);
        let on = match index {
            0 => v.preferences.auto_check,
            1 => v.preferences.auto_download,
            _ => v.preferences.idle_restart,
        };
        let enabled = !v.saving && (index != 1 || v.preferences.auto_check) && !self.passive.get();
        let thumb = self.motion.value(format!("switch:update:{index}"), if on { 1. } else { 0. });
        let id = match index {
            0 => "update-auto-check",
            1 => "update-auto-download",
            _ => "update-idle-restart",
        };
        let mut prefs = v.preferences.clone();
        match index {
            0 => prefs.auto_check = !on,
            1 => prefs.auto_download = !on,
            _ => prefs.idle_restart = !on,
        };
        let keyboard = prefs.clone();
        let switch = self
            .focusable_control(id, enabled, cx)
            .w(px(40.))
            .h(px(32.))
            .rounded(px(6.))
            .border_1()
            .border_color(transparent_black())
            .flex()
            .items_center()
            .justify_end()
            .child(
                div().relative().w(px(32.)).h(px(18.)).rounded(px(9.)).bg(p.control_border())
                    .child(div().absolute().inset_0().rounded_full().bg(p.blue.opacity(thumb)))
                    .child(div().absolute().left(px(3. + 14. * thumb)).top(px(3.)).size(px(12.)).rounded_full().bg(p.surface)),
            )
            .opacity(if enabled { 1. } else { 0.45 })
            .when(enabled, |s| {
                s.cursor_pointer()
                    .when(self.keyboard_focus, |s| {
                        s.focus(move |s| s.border_color(p.blue))
                    })
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.update_action(Action::Save(prefs.clone()), cx)
                    }))
                    .on_key_down(cx.listener(move |this, event: &KeyDownEvent, _, cx| {
                        if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                            this.update_action(Action::Save(keyboard.clone()), cx);
                            cx.stop_propagation();
                        }
                    }))
            });
        let label = match index {
            0 => l.text("自动检查更新", "Automatically check for updates"),
            1 => l.text("后台下载更新", "Download updates in background"),
            _ => l.text("空闲时自动重启更新", "Restart to update when idle"),
        };
        let (help_id, help_label, help) = match index {
            0 => ("update-auto-check-help", l.text("自动检查更新说明", "Automatic update check help"), l.text("关闭后仍可手动检查更新。", "You can still check for updates manually when this is off.")),
            1 => ("update-auto-download-help", l.text("后台下载更新说明", "Background update download help"), l.text("关闭自动检查时，后台下载也会暂停。", "Background downloads pause when automatic checks are off.")),
            _ => ("update-idle-restart-help", l.text("空闲时自动重启更新说明", "Idle restart help"), l.text("所有下载任务结束并释放资源后，自动重启应用以安装更新。", "Restarts the app to install an update after all downloads finish and release their resources.")),
        };
        div()
            .min_h(px(44.))
            .flex()
            .items_center()
            .justify_between()
            .gap(px(12.))
            .child(div().flex_1().flex().items_center().gap(px(4.)).text_size(px(13.))
                .child(label).child(self.help_button(help_id, help_label, help.into(), cx)))
            .child(switch)
            .into_any_element()
    }
    fn app_update_section(&self, cx: &mut Context<Self>) -> AnyElement {
        use ameow_next::app_update::{Phase, service::Action};
        let v = &self.projection.app_update;
        let l = self.projection.language;
        let p = Palette::new(self.projection.night);
        let busy = matches!(
            v.update.phase,
            Phase::Checking
                | Phase::Downloading
                | Phase::Verifying
                | Phase::Switching
                | Phase::WaitingForTasks
        );
        let mut actions = div().flex().flex_wrap().gap(px(8.));
        if v.update.phase == Phase::Available {
            actions = actions.child(self.icon_button(
                "update-download",
                "icons/download.svg",
                l.text("下载更新", "Download update"),
                true,
                cx,
                |t, _, cx| t.update_action(Action::Download, cx),
            ));
        }
        if matches!(v.update.phase, Phase::Ready | Phase::WaitingForTasks) {
            actions = actions.child(div().relative().flex_none().child(self.icon_button(
                "update-restart",
                "icons/rotate-cw.svg",
                l.text("重启并更新", "Restart and update"),
                v.launcher,
                cx,
                |t, _, cx| t.update_action(Action::Restart, cx),
            )).when(self.motion.presence("help:update-restart-notice", self.help_open == Some("update-restart-notice")).visible(), |s| s.child(self.help_panel("update-restart-notice",
                l.text("任务完成后会自动更新，当前下载会继续。",
                    "The app will update automatically when tasks finish. Current downloads will continue.").into(), cx))));
        }
        if !busy && v.update.phase != Phase::Ready {
            actions = actions.child(self.icon_button(
                "update-check",
                "icons/refresh-cw.svg",
                if v.check_retry_secs > 0 {
                    format!("{} ({}s)", l.text("检查更新", "Check for updates"), v.check_retry_secs)
                } else { l.text("检查更新", "Check for updates").to_string() },
                v.check_retry_secs == 0,
                cx,
                |t, _, cx| t.update_action(Action::Check, cx),
            ));
        }
        let detail = crate::app_update_ui::detail(v, l);
        div().flex_none().pt(px(8.)).flex().flex_col()
            .child(div().text_size(px(15.)).font_weight(FontWeight::MEDIUM).child(l.text("应用更新","Application updates")))
            .child(div().mt(px(12.)).flex().flex_wrap().items_center().justify_between().gap(px(12.))
                .child(div().flex_1().min_w(px(0.)).text_size(px(13.)).line_height(px(20.))
                    .child(crate::app_update_ui::headline(v,l)))
                .child(actions.flex_none()))
            .child(self.notice_bar("app-update-error", (!detail.is_empty() && matches!(v.update.phase, Phase::Failed | Phase::RolledBack))
                .then(|| (detail.clone(), true))).mx(px(-10.)))
            .when(!detail.is_empty() && !matches!(v.update.phase, Phase::Failed | Phase::RolledBack), |s|
                s.child(div().mt(px(6.)).text_size(px(12.)).line_height(px(18.)).text_color(p.neutral).child(detail)))
            .when(v.update.phase==Phase::Ready&&!v.launcher,|s|s.child(div().mt(px(6.)).text_size(px(12.)).text_color(p.neutral).child(l.text("请通过 Ameow 启动入口重新打开后更新。","Open Ameow through its launcher to install the update."))))
            .child(div().mt(px(20.)).border_t_1().border_color(p.border).pt(px(8.))
                .child(self.update_switch(0,cx)).child(self.update_switch(1,cx)).child(self.update_switch(2,cx)))
            .child(self.notice_bar("update-preferences", (v.saving || v.save_error.is_some()).then(|| (
                if v.save_error.is_some() { l.text("保存失败，请重试", "Could not save. Try again") } else { l.text("正在保存…", "Saving…") }.into(),
                v.save_error.is_some()))).mx(px(-10.)))
            .into_any_element()
    }
}
pub(super) struct HelpTooltip {
    pub(super) text: String,
    pub(super) night: bool,
}
impl Render for HelpTooltip {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        let p = Palette::new(self.night);
        div().max_w(px(280.)).p(px(8.)).rounded(px(6.)).bg(p.surface)
            .border_1().border_color(p.border).text_color(p.primary_text())
            .font(tokens::desktop_ui_font()).text_size(px(12.)).line_height(px(18.))
            .child(self.text.clone())

    }
}
struct ValueTooltip {
    path: String,
    night: bool,
}
impl Render for ValueTooltip {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        let p = Palette::new(self.night);
        let mut lines = String::new();
        for (i, character) in self.path.chars().enumerate() {
            if i > 0 && i % 38 == 0 {
                lines.push('\n');
            }
            lines.push(character);
        }
        div()
            .max_w(px(340.))
            .p(px(8.))
            .rounded(px(6.))
            .bg(p.surface)
            .border_1()
            .border_color(p.border)
            .text_color(p.neutral)
            .font(tokens::ui_font())
            .text_size(px(11.))
            .child(lines)
    }
}
impl Render for SettingsWindow {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.title_language != self.projection.language {
            self.title_language = self.projection.language;
            window.set_window_title(self.title_language.text("Ameow · 设置", "Ameow · Settings"));
        }
        tokens::sync_kit_theme(self.projection.night, cx);
        self.motion.begin(self.projection.reduced);
        if let Some(kind) = self.preview_select.take() {
            let trigger = self.selects.iter().find(|s| s.kind.id() == kind.id()).unwrap().trigger.clone();
            // Dispatch after the trigger exists in the rendered focus tree.
            window.on_next_frame(move |window, cx| {
                trigger.focus(window, cx);
                trigger.dispatch_action(&gpui_base::actions::Confirm { secondary: false }, window, cx);
            });
        }
        let p = Palette::new(self.projection.night);
        let l = self.projection.language;
        let reveal = self.reveal_focus.clone();
        let scroll = self.scroll.clone();
        let nav_y = self.motion.value("settings-nav", self.page as u8 as f32 * 40.);
        let next_page = (self.page, self.notices_open);
        if self.shown_page != next_page { self.previous_page = Some(self.shown_page); self.shown_page = next_page; }
        let arrival = self.motion.change("settings-page", format!("{}:{}", self.page as u8, self.notices_open));
        if arrival >= 0.999 { self.previous_page = None; }
        let build = |this: &Self, page: Page, notices: bool, cx: &mut Context<Self>| {
            match page { Page::General => this.general_page(cx), Page::Download => this.download_page(cx),
                Page::Components => this.components_page(cx), Page::About if notices => this.notices_page(cx), Page::About => this.about_page(cx) }
        };
        let forward = self.previous_page.is_none_or(|(page, notices)| (self.page as u8, self.notices_open) >= (page as u8, notices));
        let direction = if forward { 1. } else { -1. };
        let current = build(self, self.page, self.notices_open, cx);
        let mut content = div().relative().w_full().when(self.notices_open, |s| s.h_full());
        if let Some((old_page, notices)) = self.previous_page {
            self.passive.set(true);
            let outgoing = build(self, old_page, notices, cx);
            self.passive.set(false);
            content = content.child(div().id("settings-outgoing-page").absolute().inset_0().overflow_hidden()
                .top(px(-direction * arrival * 5.)).opacity(1. - arrival)
                .capture_any_mouse_down(|_, _, cx| cx.stop_propagation())
                .capture_key_down(|_, _, cx| cx.stop_propagation()).child(outgoing));
        }
        content = content.child(div().relative().w_full().when(self.notices_open, |s| s.h_full())
            .top(px(direction * (1. - arrival) * 5.)).opacity(arrival).child(current));
        let root = div().on_children_prepainted(move |_, _, _| reveal.set(false))
            .id("settings-root")
            .key_context("AmeowSettings")
            .on_action(cx.listener(|this, _: &TabForward, window, cx| {
                this.move_focus(false, window, cx); cx.stop_propagation();
            }))
            .on_action(cx.listener(|this, _: &TabBackward, window, cx| {
                this.move_focus(true, window, cx); cx.stop_propagation();
            }))
            .relative()
            .size_full()
            .flex()
            .bg(p.surface)
            .text_color(p.primary_text())
            .font(tokens::desktop_ui_font())
            .text_size(px(13.))
            .line_height(px(20.))
            .capture_any_mouse_down(cx.listener(|this, _, _, cx| {
                if this.keyboard_focus {
                    this.keyboard_focus = false;
                    cx.notify();
                }
            }))
            .capture_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                if !this.keyboard_focus {
                    this.keyboard_focus = true;
                    cx.notify();
                }
                if this.notices_key(&event.keystroke.key, window, cx) {
                    cx.stop_propagation();
                    return;
                }
                if event.keystroke.key == "escape" && this.help_open.take().is_some() {
                    cx.notify(); cx.stop_propagation(); return;
                }
                if this.selects.iter().any(|s| s.open)
                    && matches!(event.keystroke.key.as_str(), "escape" | "enter" | "space" | "up" | "down") { return; }
                if this.component_menu_open {
                    let actions: Vec<_> = this.component_menu_action_ids().iter()
                        .filter_map(|id| this.control_focus.borrow().get(*id).cloned()).collect();
                    match event.keystroke.key.as_str() {
                        "escape" => {
                            this.component_menu_open = false;
                            if let Some(focus) = this.control_focus.borrow().get("component-details") {
                                window.focus(focus, cx);
                            }
                            cx.notify();
                            cx.stop_propagation();
                            return;
                        }
                        "up" | "down" if !actions.is_empty() => {
                            let current = actions.iter().position(|f| f.is_focused(window));
                            let next = if event.keystroke.key == "up" {
                                current.map_or(actions.len() - 1, |i| (i + actions.len() - 1) % actions.len())
                            } else { current.map_or(0, |i| (i + 1) % actions.len()) };
                            window.focus(&actions[next], cx);
                            cx.notify();
                            cx.stop_propagation();
                            return;
                        }
                        "enter" | "space" if this.can_check_upstream() && this.component_menu_focus.is_focused(window) => {
                            this.check_upstream(window, cx);
                            cx.stop_propagation();
                            return;
                        }
                        _ => {}
                    }
                }
                if event.keystroke.key == "escape" {
                    window.remove_window();
                    cx.stop_propagation();
                } else if event.keystroke.key == "tab" {
                    this.move_focus(event.keystroke.modifiers.shift, window, cx);
                    cx.stop_propagation();
                }
            }))
            .child(
                div()
                    .relative().w(px(144.))
                    .h_full()
                    .flex_none()
                    .p(px(12.))
                    .pt(px(16.))
                    .bg(p.badge.opacity(0.55))
                    .border_r_1()
                    .border_color(p.border)
                    .flex()
                    .flex_col()
                    .gap(px(4.))
                    .when(cfg!(target_os = "macos"), |sidebar| {
                        sidebar.relative().pt(px(28. + 16.)).child(
                            div()
                                .absolute()
                                .top_0()
                                .left_0()
                                .w_full()
                                .h(px(28.))
                                .window_control_area(WindowControlArea::Drag),
                        )
                    })
                    .child(div().absolute().left(px(12.)).right(px(12.)).top(px(16. + nav_y + if cfg!(target_os = "macos") { 28. } else { 0. })).h(px(36.)).rounded(px(6.)).bg(p.border))
                    .child(self.nav(Page::General, l.text("常规", "General"), cx))
                    .child(self.nav(Page::Download, l.text("下载", "Download"), cx))
                    .child(self.nav(Page::Components, l.text("组件与诊断", "Components"), cx))
                    .child(self.nav(Page::About, l.text("关于", "About"), cx)),
            )
            .child(
                div()
                    .flex_1()
                    .min_w(px(0.))
                    .h_full()
                    .flex()
                    .flex_col()
                    .child(
                        div()
                            .h(px(28.))
                            .flex_none()
                            .flex()
                            .items_center()
                            // Native dragging must stay outside focusable ancestors.
                            .child(
                                div()
                                    .h_full()
                                    .flex_1()
                                    .window_control_area(WindowControlArea::Drag),
                            )
                            .when(!cfg!(target_os = "macos"), |header| header.child(div().pr(px(8.)).child(self.icon_button(
                                "close-settings",
                                "icons/x.svg",
                                l.text("关闭设置", "Close settings"),
                                true,
                                cx,
                                |_, window, _| window.remove_window(),
                            )))),
                    )
                    .child(
                        div()
                            .id("settings-content")
                            .flex_1()
                            .min_w(px(0.))
                            .min_h(px(0.))
                            .px(px(24.))
                            .pt(px(8.))
                            .pb(px(24.))
                            .track_focus(&self.focus)
                            .when(!self.notices_open, |s| s.overflow_y_scroll())
                            .when(self.notices_open, |s| s.overflow_hidden())
                            .track_scroll(&self.scroll)
                            .on_scroll(cx.listener(|this, _, _, cx| {
                                if this.component_menu_open || this.help_open.is_some() {
                                    this.component_menu_open = false;
                                    this.help_open = None;
                                    cx.notify();
                                }
                            }))
                            .child(content),
                    ),
            )
            .child(div().absolute().right(px(6.)).top(px(36.)).bottom(px(12.)).w(px(3.))
                .child(canvas(|_, _, _| (), move |bounds, _, window, _| {
                    let maximum = scroll.max_offset().y;
                    if maximum <= px(0.) { return; }
                    let viewport = scroll.bounds().size.height;
                    let thumb = (bounds.size.height * (viewport / (viewport + maximum))).max(px(24.)).min(bounds.size.height);
                    let progress = (-scroll.offset().y / maximum).clamp(0., 1.);
                    let origin = bounds.origin + point(px(0.), (bounds.size.height - thumb) * progress);
                    window.paint_quad(fill(Bounds::new(origin, size(bounds.size.width, thumb)), p.neutral.opacity(0.4)));
                }).size_full()));
        self.motion.finish(window);
        root.tooltip_root(&self.tooltips)
    }
}

fn normalize_selection(paths: Option<Vec<PathBuf>>) -> Result<Option<PathBuf>, String> {
    match paths {
        None => Ok(None),
        Some(mut paths) if paths.len() == 1 => Ok(paths.pop()),
        Some(_) => Err("请选择一个文件夹，目录未更改".into()),
    }
}
fn path_preview(path: &str) -> String {
    fn width(c: char) -> usize {
        if c.is_ascii() { 1 } else { 2 }
    }
    if path.chars().map(width).sum::<usize>() <= 44 {
        return path.to_owned();
    }
    fn take_side(chars: impl Iterator<Item = char>) -> String {
        let mut result = String::new();
        let mut used = 0;
        for c in chars {
            used += width(c);
            if used > 21 {
                break;
            }
            result.push(c);
        }
        result
    }
    let start = take_side(path.chars());
    let end = take_side(path.chars().rev())
        .chars()
        .rev()
        .collect::<String>();
    format!("{start}…{end}")
}
fn display_path(path: &str) -> String {
    let Some(rest) = path.strip_prefix(r"\\?\") else {
        return path.to_owned();
    };
    // Removing the prefix must not change Win32 normalization or length semantics.
    if path.encode_utf16().count() >= 260 {
        return path.to_owned();
    }
    let plain = |tail: &str| {
        let mut parts = tail.split('\\').peekable();
        while let Some(part) = parts.next() {
            if part.is_empty() {
                if parts.peek().is_some() {
                    return false;
                }
                continue;
            }
            if part.ends_with(['.', ' '])
                || part
                    .chars()
                    .any(|c| c.is_control() || "<>:\"/|?*".contains(c))
            {
                return false;
            }
            let stem = part
                .split('.')
                .next()
                .unwrap_or("")
                .trim_end()
                .to_ascii_uppercase();
            if matches!(
                stem.as_str(),
                "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
            ) || ((stem.starts_with("COM") || stem.starts_with("LPT"))
                && matches!(
                    &stem[3..],
                    "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
                ))
            {
                return false;
            }
        }
        true
    };
    let bytes = rest.as_bytes();
    if bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && bytes[2] == b'\\'
        && plain(&rest[3..])
    {
        return rest.to_owned();
    }
    if rest
        .get(..4)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("UNC\\"))
    {
        let unc = &rest[4..];
        let mut parts = unc.split('\\');
        let valid = |part: &str| !part.is_empty() && part != "." && part != "..";
        if parts.next().is_some_and(valid) && parts.next().is_some_and(valid) && plain(unc) {
            return format!(r"\\{unc}");
        }
    }
    path.to_owned()
}
fn directory_health(path: &Path) -> Result<(), String> {
    if !path.is_dir() {
        return Err("当前目录已不存在或不是文件夹，请重新选择。".into());
    }
    std::fs::read_dir(path)
        .map(|_| ())
        .map_err(|_| "当前目录无法访问，请检查权限或重新选择。".into())
}

/// Physical screen coordinates throughout, including negative monitor origins.
fn side_bounds(main: Option<[i32; 4]>, work: [i32; 4], scale: f32) -> [i32; 4] {
    let width = ((580. * scale).round() as i32).min((work[2] - work[0]).max(1));
    let height = ((440. * scale).round() as i32).min((work[3] - work[1]).max(1));
    let gap = (16. * scale).round() as i32;
    let main =
        main.filter(|r| r[0] < work[2] && r[2] > work[0] && r[1] < work[3] && r[3] > work[1]);
    let (x, y) = main.map_or(
        (
            work[0] + (work[2] - work[0] - width) / 2,
            work[1] + (work[3] - work[1] - height) / 2,
        ),
        |r| {
            (
                if r[2] + gap + width <= work[2] {
                    r[2] + gap
                } else {
                    r[0] - gap - width
                },
                r[1],
            )
        },
    );
    [
        x.clamp(work[0], work[2] - width),
        y.clamp(work[1], work[3] - height),
        width,
        height,
    ]
}
#[cfg(target_os = "windows")]
fn hwnd(window: &Window) -> HWND {
    let RawWindowHandle::Win32(handle) = HasWindowHandle::window_handle(window)
        .expect("settings HWND")
        .as_raw()
    else {
        unreachable!()
    };
    HWND(handle.hwnd.get() as *mut std::ffi::c_void)
}
struct Anchor {
    main: Option<[i32; 4]>,
    work: [i32; 4],
    monitor: [i32; 4],
    scale: f32,
}
#[cfg(target_os = "windows")]
fn anchor(main: HWND) -> Anchor {
    // SAFETY: called on the foreground thread with the owned main HWND.
    unsafe {
        let visible = IsWindowVisible(main).as_bool();
        let monitor = if visible {
            MonitorFromWindow(main, MONITOR_DEFAULTTONEAREST)
        } else {
            let mut point = POINT::default();
            let _ = GetCursorPos(&mut point);
            MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST)
        };
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        GetMonitorInfoW(monitor, &mut info)
            .ok()
            .expect("settings monitor");
        let mut x = 96;
        let mut y = 96;
        let _ = GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut x, &mut y);
        let mut r = RECT::default();
        let valid = visible && GetWindowRect(main, &mut r).is_ok();
        let w = info.rcWork;
        let m = info.rcMonitor;
        Anchor {
            main: valid.then_some([r.left, r.top, r.right, r.bottom]),
            work: [w.left, w.top, w.right, w.bottom],
            monitor: [m.left, m.top, m.right, m.bottom],
            scale: x as f32 / 96.,
        }
    }
}
#[cfg(target_os = "windows")]
fn show(handle: WindowHandle<Root>, first: Option<Anchor>, cx: &mut App) {
    cx.defer(move |cx| {
        let Ok((target, preview)) = handle.update(cx, |root, window, cx| {
            let view = root.view().clone().downcast::<SettingsWindow>().expect("settings content");
            view.update(cx, |view, cx| {
                window.focus(&view.focus, cx);
                view.refresh_health(true, cx);
            });
            (hwnd(window), view.read(cx).projection.preview)
        }) else {
            return;
        };
        // Native geometry can synchronously reenter GPUI. All entity/window borrows
        // end before this foreground task runs. Never call GPUI activate_window.
        cx.foreground_executor()
            .spawn(async move {
                unsafe {
                    if !IsWindow(Some(target)).as_bool() {
                        return;
                    }
                    if let Some(a) = first {
                        let scale = (GetDpiForWindow(target) as f32 / 96.).max(1.);
                        let r = side_bounds(a.main, a.work, scale);
                        let _ = SetWindowPos(
                            target,
                            Some(HWND_TOPMOST),
                            r[0],
                            r[1],
                            r[2],
                            r[3],
                            SWP_SHOWWINDOW | SWP_NOOWNERZORDER | SWP_NOACTIVATE,
                        );
                    } else {
                        let _ = ShowWindow(target, if preview { SW_SHOWNOACTIVATE } else { SW_RESTORE });
                        let _ = SetWindowPos(
                            target,
                            Some(HWND_TOPMOST),
                            0,
                            0,
                            0,
                            0,
                            SWP_SHOWWINDOW
                                | SWP_NOMOVE
                                | SWP_NOSIZE
                                | SWP_NOOWNERZORDER
                                | SWP_NOACTIVATE,
                        );
                    }
                    if !preview { let _ = SetForegroundWindow(target); }
                }
            })
            .detach();
    });
}
#[cfg(target_os = "macos")]
fn hwnd(window: &Window) -> crate::native::NativeHandle {
    crate::native::handle(window)
}

#[cfg(target_os = "macos")]
fn anchor(main: crate::native::NativeHandle) -> Anchor {
    let window = main.window();
    let screen = window.as_ref().and_then(|window| window.screen()).unwrap_or_else(|| crate::native::screen_at(crate::native::Native::cursor()));
    Anchor {
        main: window.filter(|window| window.isVisible()).map(|window| crate::native::rect_edges(window.frame()).map(|value| value.round() as i32)),
        work: crate::native::rect_edges(screen.visibleFrame()).map(|value| value.round() as i32),
        monitor: crate::native::rect_edges(screen.frame()).map(|value| value.round() as i32),
        scale: 1.,
    }
}

#[cfg(target_os = "macos")]
fn show(handle: WindowHandle<Root>, _first: Option<Anchor>, cx: &mut App) {
    cx.defer(move |cx| {
        let Ok(native) = handle.update(cx, |root, window, cx| {
            let view = root.view().clone().downcast::<SettingsWindow>().expect("settings content");
            view.update(cx, |view, cx| {
                window.focus(&view.focus, cx);
                view.refresh_health(true, cx);
            });
            crate::native::handle(window)
        }) else { return; };
        cx.foreground_executor().spawn(async move {
            let Some(window) = native.window() else { return; };
            window.setCollectionBehavior(objc2_app_kit::NSWindowCollectionBehavior::FullScreenNone);
            if !window.isVisible() && let Some(view) = window.contentView() {
                view.setNeedsDisplay(true);
            }
            #[allow(deprecated)]
            objc2_app_kit::NSApplication::sharedApplication(crate::native::marker()).activateIgnoringOtherApps(true);
            if window.isMiniaturized() { window.deminiaturize(None); }
            window.makeKeyAndOrderFront(None);
        }).detach();
    });
}

impl Prototype {
    pub(super) fn open_component_settings(&mut self, cx: &mut Context<Self>) {
        self.open_or_focus_settings(cx);
        if let Some(handle) = self.settings_window {
            let _ = handle.update(cx, |root, _, cx| {
                let view = root.view().clone().downcast::<SettingsWindow>().expect("settings content");
                view.update(cx, |view, cx| {
                    view.page = Page::Components;
                    view.notices_open = false;
                    view.help_open = None;
                    view.scroll.set_offset(point(px(0.), px(0.)));
                    cx.notify();
                });
            });
        }
    }
    pub(super) fn open_update_settings(&mut self, cx: &mut Context<Self>) {
        self.open_or_focus_settings(cx);
        if let Some(handle) = self.settings_window {
            let _ = handle.update(cx, |root, _, cx| {
                let view = root.view().clone().downcast::<SettingsWindow>().expect("settings content");
                view.update(cx, |view, cx| {
                    view.page = Page::About;
                    view.notices_open = false;
                    view.scroll.set_offset(point(px(0.), px(0.)));
                    if view.projection.app_update.update.phase == ameow_next::app_update::Phase::WaitingForTasks {
                        view.show_update_notice(cx);
                    }
                    cx.notify();
                });
            });
        }
    }
    pub(super) fn apply_preview_settings_scene(&mut self, scene: &crate::preview::Scene, cx: &mut Context<Self>) {
        self.open_or_focus_settings(cx);
        let mut projection = Projection::from_main(self);
        projection.preview = true;
        projection.path = Some(PathBuf::from(r"C:\Users\Ameow\Downloads"));
        projection.preferences = Some((if self.night { ThemePreference::Dark } else { ThemePreference::Light },
            LanguagePreference::System, TrayIconPreference::FollowAppearance));
        projection.error = None;
        projection.pending = false;
        projection.status = SettingsStatus::Idle;
        projection.upstream_available = true;
        let mut upstream = ameow_next::download::upstream::UpstreamSnapshot::default();
        if let Some(snapshot) = projection.queue.as_mut() {
            use ameow_next::download::{preparation::PreparationPhase, runtime_update::RuntimeUpdatePhase};
            let snapshot = std::sync::Arc::make_mut(snapshot);
            if scene.state == "browser-sessions" {
                snapshot.browser_sessions.sites = vec![ameow_next::browser_sessions::SiteView {site:"bilibili.com".into(),source_id:"a".repeat(32),source_name:"Microsoft Edge".into(),grant_id:"b".repeat(32),synced_at:ameow_next::browser_sessions::now(),cookie_count:3,skipped_partitioned:0}];
            } else if scene.state == "browser-session-error" {
                snapshot.browser_sessions.error = Some("E_SESSION_STORAGE".into());
            }
            snapshot.preparation.phase = PreparationPhase::Ready;
            snapshot.verified_runtime_versions = vec![("yt-dlp".into(), "2026.10.01".into()), ("gallery-dl".into(), "1.32.19".into()), ("deno".into(), "2.5.0".into()), ("ffmpeg".into(), "8.0".into())];
            match scene.state.as_str() {
                "missing" => { snapshot.preparation.phase = PreparationPhase::Idle; snapshot.verified_runtime_versions.clear(); },
                "preparing" => { snapshot.preparing = true; snapshot.preparation.phase = PreparationPhase::Preparing; },
                "owner-lost" => snapshot.preparation_owner_lost = true,
                "updating" => snapshot.runtime_update.phase = RuntimeUpdatePhase::Downloading,
                "update-waiting" => snapshot.runtime_update.phase = RuntimeUpdatePhase::Waiting,
                "update-failed" => snapshot.runtime_update.phase = RuntimeUpdatePhase::Failed,
                "restored" => snapshot.runtime_update.phase = RuntimeUpdatePhase::RolledBack,
                "recovery-required" => snapshot.runtime_update.phase = RuntimeUpdatePhase::RecoveryRequired,
                _ => {},
            }
        }
        match scene.state.as_str() {
            "checking" => upstream.pending = true,
            "check-failed" => { upstream.checked_at_ms = Some(ameow_next::download::progress::now_ms()); upstream.result = Some(Err(ameow_next::download::upstream::UpstreamError::Network)); },
            "update-available" => { upstream.checked_at_ms = Some(ameow_next::download::progress::now_ms()); upstream.result = Some(Ok("2026.11.01".into())); },
            _ => {},
        }
        projection.preview_upstream = Some(upstream);
        if let Some(handle) = self.settings_window {
            let _ = handle.update(cx, |root, window, cx| {
                let view = root.view().clone().downcast::<SettingsWindow>().expect("settings content");
                view.update(cx, |view, cx| {
                window.focus(&view.focus, cx);
                view.projection = projection;
                view.startup = Some(Ok(StartupState::Disabled));
                view.startup_pending = false;
                for select in &mut view.selects { select.open = false; }
                view.preview_select = match scene.state.as_str() {
                    "theme-menu" => Some(PreferenceKind::Theme),
                    "language-menu" => Some(PreferenceKind::Language),
                    "tray-menu" => Some(PreferenceKind::TrayIcon),
                    _ => None,
                };
                view.health = Some(Ok(()));
                view.notice = None;
                view.open_pending = scene.state == "folder-opening";
                view.help_open = match scene.state.as_str() {
                    "app-help" => Some("update-auto-check-help"),
                    "app-update-feedback" => Some("update-restart-notice"),
                    _ => None,
                };
                view.update_notice_deadline = None;
                view.notices_open = scene.state.starts_with("third-party-licenses");
                view.copy_feedback.clear();
                view.notices_copied = match scene.state.as_str() {
                    "third-party-licenses-copied" => Some(true),
                    "third-party-licenses-copy-failed" => Some(false),
                    _ => None,
                };
                view.component_menu_open = matches!(scene.state.as_str(), "version-menu" | "update-available" | "checking" | "check-failed");
                view.page = match scene.surface.as_str() {
                    _ if scene.state.starts_with("app-") || scene.state.starts_with("third-party-licenses") || scene.state == "about" => Page::About,
                    "components" | "diagnostics" => Page::Components,
                    _ if matches!(scene.state.as_str(), "general" | "theme-menu" | "language-menu" | "tray-menu" | "startup-enabled" | "startup-unavailable" | "startup-pending") => Page::General,
                    _ => Page::Download,
                };
                match (scene.surface.as_str(), scene.state.as_str()) {
                    ("settings", "startup-enabled") => view.startup = Some(Ok(StartupState::Enabled)),
                    ("settings", "startup-unavailable") => view.startup = Some(Err("无法读取 Windows 启动应用的批准状态".into())),
                    ("settings", "startup-pending") => { view.startup = None; view.startup_pending = true; },
                    ("settings", "saving") => { view.projection.pending = true; view.projection.status = SettingsStatus::Saving; },
                    ("settings", "save-failed") => view.projection.status = SettingsStatus::Failed("保存未受理，请稍后重试".into()),
                    ("settings", "unavailable") => { view.projection.path = None; view.projection.error = Some("下载设置尚未就绪，请稍后重试".into()); },
                    ("settings", "download-loading") => { view.projection.path = None; },
                    ("settings", "path-unavailable") => view.health = Some(Err("当前目录已不存在或不是文件夹，请重新选择。".into())),
                    ("settings", "path-denied") => view.health = Some(Err("当前目录无法访问，请检查权限或重新选择。".into())),
                    ("settings", "path-copied") => view.notice = Some(("完整路径已复制".into(), false)),
                    ("settings", "path-copy-failed") => view.notice = Some(("无法复制路径，请重试".into(), true)),
                    ("settings", "open-failed") => view.notice = Some(("无法打开文件夹，请检查目录后重试".into(), true)),
                    ("diagnostics", "copying") => { view.projection.preparation_copy_pending = true; view.projection.preparation_status = Some(("正在复制组件诊断".into(), false)); },
                    ("diagnostics", "copied") => view.projection.preparation_status = Some(("已复制组件诊断".into(), false)),
                    ("diagnostics", "copy-failed") => view.projection.preparation_status = Some(("无法复制组件诊断，请重试".into(), true)),
                    ("diagnostics", "unavailable") => { view.projection.queue = None; view.projection.error = Some("unavailable".into()); },
                    _ => {},
                }
                view.scroll.set_offset(point(px(0.), px(0.)));
                cx.notify();
                });
            });
        }
    }
    pub(super) fn open_or_focus_settings(&mut self, cx: &mut Context<Self>) {
        if let Some(handle) = self.settings_window {
            if handle.update(cx, |_, _, _| ()).is_ok() {
                show(handle, None, cx);
                return;
            }
            self.settings_window = None;
        }
        let Some(native) = &self.native else {
            return;
        };
        let a = anchor(native.hwnd);
        let bounds = side_bounds(a.main, a.work, a.scale);
        // Match GPUI's per-display logical coordinate system before creation.
        let display = cx
            .displays()
            .into_iter()
            .find(|display| {
                let b = display.bounds();
                (f32::from(b.origin.x) - a.monitor[0] as f32 / a.scale).abs() < 2.
                    && (f32::from(b.origin.y) - a.monitor[1] as f32 / a.scale).abs() < 2.
                    && (f32::from(b.size.width) - (a.monitor[2] - a.monitor[0]) as f32 / a.scale)
                        .abs()
                        < 2.
            })
            .map(|display| display.id());
        let main = cx.entity();
        let projection = Projection::from_main(self);
        let title = projection.language.text("Ameow · 设置", "Ameow · Settings");
        match cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    point(
                        px(bounds[0] as f32 / a.scale),
                        px(bounds[1] as f32 / a.scale),
                    ),
                    size(
                        px(bounds[2] as f32 / a.scale),
                        px(bounds[3] as f32 / a.scale),
                    ),
                ))),
                titlebar: Some(TitlebarOptions {
                    title: Some(title.into()),
                    appears_transparent: true,
                    ..Default::default()
                }),
                display_id: display,
                kind: WindowKind::Normal,
                show: false,
                focus: false,
                is_movable: true,
                is_resizable: false,
                is_minimizable: true,
                ..Default::default()
            },
            move |window, cx| {
                let view = cx.new(|cx| SettingsWindow::new(main, projection, window, cx));
                cx.new(|cx| Root::new(view, window, cx))
            },
        ) {
            Ok(handle) => {
                self.settings_window = Some(handle);
                show(handle, Some(a), cx);
            }
            Err(error) => eprintln!("Open settings window: {error}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        Language, directory_health, display_path, download_location_label, normalize_selection, path_preview,
        settings_message, side_bounds,
    };
    use std::path::Path;
    #[test]
    fn keyboard_reveal_scrolls_only_enough_to_show_the_target() {
        use gpui::{Bounds, point, px, size};
        let viewport = Bounds::new(point(px(0.), px(28.)), size(px(400.), px(380.)));
        for (top, expected) in [(40., 0.), (10., 18.), (400., -24.)] {
            let target = Bounds::new(point(px(0.), px(top)), size(px(100.), px(32.)));
            assert_eq!(super::focus_scroll_delta(viewport, target), px(expected));
        }
    }
    #[test]
    fn path_preview_preserves_short_paths_and_bounds_long_unicode() {
        let normal = r"C:\Users\Administrator\Desktop\223";
        assert_eq!(path_preview(normal), normal);
        let long = "猫".repeat(50);
        let preview = path_preview(&long);
        assert!(preview.contains('…'));
        assert!(
            preview
                .chars()
                .map(|c| if c.is_ascii() { 1 } else { 2 })
                .sum::<usize>()
                <= 44
        );
    }
    #[test]
    fn display_paths_only_unwrap_absolute_drive_and_complete_unc() {
        assert_eq!(display_path(r"\\?\C:\用户\下载"), r"C:\用户\下载");
        assert_eq!(display_path(r"\\?\uNc\服务器\共享\猫"), r"\\服务器\共享\猫");
        for raw in [
            r"\\?\C:relative",
            r"\\?\UNC\server",
            r"\\?\UNC\server\\file",
            r"\\?\C:\downloads\folder.",
            "\\\\?\\C:\\downloads\\folder ",
            r"\\?\UNC\server\share\folder.",
            "\\\\?\\UNC\\server\\share\\folder ",
            r"\\?\C:\downloads\..\folder",
            r"\\?\UNC\server\share\.\folder",
            r"\\?\C:\downloads\con.txt",
            r"\\?\UNC\server\share\LPT1.log",
            r"\\?\C:\downloads\file:stream",
            r"\\?\C:\downloads/mixed",
            r"\\?\Volume{abc}\dir",
            r"\\?\GLOBALROOT\Device\disk",
            r"\\.\PhysicalDrive0",
            r"C:\普通",
        ] {
            assert_eq!(display_path(raw), raw);
        }
    }
    #[test]
    fn download_location_never_reports_loading_after_a_read_failure() {
        assert_eq!(download_location_label(None, None, Language::Chinese), "正在读取…");
        assert_eq!(download_location_label(None, Some("read failed"), Language::Chinese), "暂时无法读取下载位置");
        assert_eq!(download_location_label(None, Some("read failed"), Language::English), "Download location unavailable");
        let path = Path::new(r"C:\Downloads");
        assert_eq!(download_location_label(Some(path), Some("old error"), Language::Chinese), r"C:\Downloads");
    }
    #[test]
    fn settings_notices_follow_effective_language() {
        let message = "当前目录无法访问，请检查权限或重新选择。";
        assert_eq!(settings_message(Language::Chinese, message), message);
        assert!(settings_message(Language::English, message).contains("Cannot access"));
        assert!(
            settings_message(Language::English, "E_SETTINGS_SAVE: failure").contains("not saved")
        );
        let isolated = "测试宿主禁用用户启动项操作";
        assert_eq!(settings_message(Language::Chinese, isolated), isolated);
        assert_eq!(
            settings_message(Language::English, isolated),
            "Startup changes are disabled in this test host."
        );
    }
    #[test]
    fn placement_uses_right_then_left_and_clamps_to_work_area_at_each_scale() {
        for scale in [1., 1.5, 2.] {
            let work = [-2400, -100, 2400, 1800];
            let right = side_bounds(Some([0, 100, 200, 300]), work, scale);
            assert_eq!(right[0], 200 + (16. * scale) as i32);
            let left = side_bounds(Some([2200, 1600, 2400, 1800]), work, scale);
            assert_eq!(left[0] + left[2] + (16. * scale) as i32, 2200);
            assert_eq!(left[1] + left[3], 1800);
        }
        assert_eq!(
            side_bounds(None, [-800, 0, -400, 300], 2.),
            [-800, 0, 400, 300]
        );
        assert_eq!(
            side_bounds(Some([5000, 5000, 5200, 5200]), [0, 0, 1000, 800], 1.),
            side_bounds(None, [0, 0, 1000, 800], 1.)
        );
    }
    #[test]
    fn picker_empty_multiple_and_unavailable_paths_do_not_claim_a_saved_directory() {
        assert_eq!(normalize_selection(None).unwrap(), None);
        assert!(normalize_selection(Some(vec![])).is_err());
        assert!(normalize_selection(Some(vec!["a".into(), "b".into()])).is_err());
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join("folder");
        std::fs::create_dir(&folder).unwrap();
        assert!(directory_health(&folder).is_ok());
        std::fs::remove_dir(&folder).unwrap();
        assert!(directory_health(&folder).is_err());
        std::fs::write(&folder, b"file").unwrap();
        assert!(directory_health(&folder).is_err());
    }
}
