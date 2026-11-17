use crate::{
    Prototype,
    tokens::{self, Palette},
    ui_text::Language,
    ui_tooltip::TooltipExt as _,
};
use ameow_next::download::preparation::PreparationPhase;
use ameow_next::download::queue::{JobPhase, QueueSnapshot};
use gpui::{prelude::*, *};
#[cfg(target_os = "windows")]
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use std::{cell::RefCell, rc::Rc};
#[cfg(target_os = "windows")]
use windows::Win32::{
    Foundation::{HWND, RECT},
    Graphics::Dwm::{DWMNCRP_DISABLED, DWMWA_NCRENDERING_POLICY, DwmSetWindowAttribute},
    UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN, HWND_TOPMOST, SWP_NOOWNERZORDER, SWP_SHOWWINDOW, SetForegroundWindow,
        SetWindowPos, SWP_NOACTIVATE,
    },
};

const WIDTH: f32 = 248.;
const HEIGHT: f32 = 172.;
#[derive(Clone, Copy, Debug)]
pub enum Action {
    Status,
    Update,
    Open,
    Settings,
    Exit,
    Closed,
}
#[derive(Clone)]
struct Projection {
    update: ameow_next::app_update::service::View,
    preview: bool,
    language: Language,
    night: bool,
    reduced: bool,
    exit_issue: bool,
    summary: Summary,
}
#[derive(Clone, Debug, PartialEq, Eq)]
struct Summary {
    text: String,
    icon: StatusIcon,
    count: Option<usize>,
    queued: Option<String>,
    failure: Option<String>,
    clickable: bool,
}
impl Projection {
    fn from_main(main: &Prototype) -> Self {
        let preview = main.preview.as_ref().map(|session| session.scene());
        let mut snapshot = main.downloads.as_ref().and_then(|ui| ui.snapshot.as_deref()).cloned();
        if let (Some(scene), Some(snapshot)) = (preview, snapshot.as_mut()) { preview_snapshot(snapshot, &scene.state); }
        Self {
            update: main
                .downloads
                .as_ref()
                .map(|u| u.updates.snapshot())
                .unwrap_or_default(),
            preview: preview.is_some(),
            language: main.language,
            night: main.night,
            reduced: main.model.reduced,
            exit_issue: main.downloads.as_ref().is_some_and(|ui| ui.exit_issue().is_some()),
            summary: summary(
                if preview.is_some_and(|scene| scene.state == "startup-failed") { None } else { snapshot.as_ref() },
                preview.is_some_and(|scene| scene.state == "startup-failed") || main.downloads.as_ref().is_some_and(|ui| ui.startup_error.is_some()),
                main.language,
            ),
        }
    }
}

fn preview_snapshot(snapshot: &mut QueueSnapshot, state: &str) {
    match state {
        "preparing" => { snapshot.preparing = true; snapshot.preparation.phase = PreparationPhase::Preparing; },
        "cleanup-unknown" => snapshot.preparation_owner_lost = true,
        "stopping" => snapshot.stopping = true,
        _ => {},
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum StatusIcon {
    Download,
    Clock,
    Warning,
    Loading,
    Check,
}

fn status_icon(icon: StatusIcon, color: Hsla) -> impl IntoElement {
    svg()
        .path(match icon {
            StatusIcon::Download => "icons/download.svg",
            StatusIcon::Clock => "icons/clock.svg",
            StatusIcon::Warning => "icons/circle-alert.svg",
            StatusIcon::Loading => "icons/loader-circle.svg",
            StatusIcon::Check => "icons/check.svg",
        })
        .size(px(14.))
        .flex_none()
        .text_color(color)
}
fn summary(snapshot: Option<&QueueSnapshot>, startup_failed: bool, language: Language) -> Summary {
    let Some(s) = snapshot else {
        return Summary {
            text: language
                .text(
                    if startup_failed {
                        "启动失败"
                    } else {
                        "正在读取状态"
                    },
                    if startup_failed {
                        "Startup failed"
                    } else {
                        "Loading status"
                    },
                )
                .into(),
            icon: if startup_failed { StatusIcon::Warning } else { StatusIcon::Loading },
            count: None,
            queued: None,
            failure: None,
            clickable: false,
        };
    };
    let issue = crate::download_ui::exit_issue(s);
    let clickable = s.unfinished > 0 || s.failures > 0 || issue.is_some();
    let downloading = s
        .jobs
        .iter()
        .filter(|j| j.phase == JobPhase::Downloading)
        .count();
    let queued = s
        .jobs
        .iter()
        .filter(|j| j.phase == JobPhase::Queued)
        .count();
    let (icon, text, count) = if issue == Some(crate::download_ui::ExitIssue::OwnerLost) {
        (
            StatusIcon::Warning,
            language.text("清理未确认", "Cleanup unknown").to_string(),
            None,
        )
    } else if issue == Some(crate::download_ui::ExitIssue::Cleanup) {
        (
            StatusIcon::Warning,
            if s.preparation_held { language.text("等待组件清理", "Waiting for cleanup") }
                else { language.text("等待任务清理", "Waiting for task cleanup") }.to_string(),
            None,
        )
    } else if s.stopping {
        (
            StatusIcon::Clock,
            language.text("正在安全停止", "Stopping safely").to_string(),
            None,
        )
    } else if downloading > 0 {
        (
            StatusIcon::Download,
            format!("{} {}", language.text("下载中", "Downloading"), downloading),
            Some(downloading),
        )
    } else if s.preparation.phase == PreparationPhase::Failed {
        (
            StatusIcon::Warning,
            language.text("组件准备失败", "Preparation failed").to_string(),
            None,
        )
    } else if s.preparing {
        (
            StatusIcon::Loading,
            language.text("准备中", "Preparing").to_string(),
            None,
        )
    } else if queued > 0 && queued == s.unfinished {
        (
            StatusIcon::Clock,
            format!("{} {}", language.text("排队中", "Queued"), queued),
            Some(queued),
        )
    } else if s.unfinished > 0 {
        (
            StatusIcon::Loading,
            format!("{} {}", language.text("任务进行中", "Tasks in progress"), s.unfinished),
            Some(s.unfinished),
        )
    } else if s.failures > 0 {
        (
            StatusIcon::Warning,
            language.text("需要处理", "Needs attention").to_string(),
            None,
        )
    } else {
        (StatusIcon::Check, language.text("空闲", "Idle").to_string(), None)
    };
    let queued_primary = icon == StatusIcon::Clock && count == Some(queued);
    let failure =
        (s.failures > 0).then(|| format!("{} {}", language.text("失败", "Failed"), s.failures));
    let queued = (queued > 0 && !queued_primary)
        .then(|| format!("{} {}", language.text("排队", "Queued"), queued));
    Summary {
        text,
        icon,
        count,
        queued,
        failure,
        clickable,
    }
}
pub struct TrayPopup {
    projection: Projection,
    actions: Rc<RefCell<Vec<Action>>>,
    selected: Option<usize>,
    keyboard: bool,
    focus: FocusHandle,
    _observer: Subscription,
    _activation: Subscription,
    motion: crate::ui_motion::Motion,
    tooltips: crate::ui_tooltip::Host,
    closing: bool,
    edge: crate::tray::TaskbarEdge,
}
impl TrayPopup {
    fn new(
        main: Entity<Prototype>,
        projection: Projection,
        actions: Rc<RefCell<Vec<Action>>>,
        anchor: crate::tray::PopupAnchor,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let icon=anchor.icon;
        let observer = cx.observe(&main, |this, main, cx| {
            this.projection = Projection::from_main(main.read(cx));
            cx.notify();
        });
        let preview = projection.preview;
        let activation = cx.observe_window_activation(window, move |this, window, cx| {
            if preview { return; }
            if !window.is_window_active() {
                let cursor = crate::native::Native::cursor();
                let on_icon = cursor[0] >= icon.left as f32
                    && cursor[0] < icon.right as f32
                    && cursor[1] >= icon.top as f32
                    && cursor[1] < icon.bottom as f32;
                if !on_icon {
                    this.dismiss(Action::Closed, cx);
                }
            }
        });
        let focus = cx.focus_handle();
        window.focus(&focus, cx);
        Self {
            projection,
            actions,
            selected: None,
            keyboard: false,
            focus,
            _observer: observer,
            _activation: activation,
            motion: crate::ui_motion::Motion::default(), tooltips: crate::ui_tooltip::Host::new(cx), closing: false, edge: anchor.edge,
        }
    }
    fn trigger(&mut self, index: usize, _window: &mut Window, cx: &mut Context<Self>) {
        if self.closing { return; }
        if self.projection.preview { return; }
        let action = match index {
            0 if self.projection.summary.clickable => Action::Status,
            4 if self.projection.update.attention() => Action::Update,
            1 => Action::Open,
            2 => Action::Settings,
            3 => Action::Exit,
            _ => return,
        };
        self.dismiss(action, cx);
    }
    fn dismiss(&mut self, action: Action, cx: &mut Context<Self>) {
        if self.closing { return; }
        self.closing = true;
        self.actions.borrow_mut().push(action);
        cx.notify();
    }
    fn row(
        &self,
        index: usize,
        label: &'static str,
        color: Hsla,
        _p: Palette,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        div()
            .id(index)
            .w_full()
            .h(px(32.))
            .px(px(12.))
            .flex()
            .items_center()
            .rounded(px(4.))
            .text_size(px(13.))
            .text_color(color)
            .cursor_pointer()
            .bg(transparent_black())
            .on_hover(cx.listener(move |this, inside: &bool, _, cx| {
                let was_keyboard = this.keyboard;
                if *inside {
                    this.keyboard = false;
                }
                let selected = if *inside {
                    Some(index)
                } else if !this.keyboard && this.selected == Some(index) {
                    None
                } else {
                    this.selected
                };
                if this.selected != selected || was_keyboard != this.keyboard {
                    this.selected = selected;
                    cx.notify();
                }
            }))
            .on_click(cx.listener(move |this, _, window, cx| this.trigger(index, window, cx)))
            .child(label)
            .into_any_element()
    }
}
impl Render for TrayPopup {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.motion.begin(self.projection.reduced);
        let presence = self.motion.presence("tray-presence", !self.closing);
        if self.closing && !presence.visible() { window.remove_window(); }
        let highlight = self.motion.presence("tray-row-highlight", self.selected.is_some_and(|i| (1..=3).contains(&i)));
        let row_y = self.motion.value("tray-row-position", match self.selected { Some(2) => 85., Some(3) => 122., _ => 53. });
        let offset = presence.travel(4.);
        let (dx, dy) = match self.edge { crate::tray::TaskbarEdge::Left => (-offset, 0.), crate::tray::TaskbarEdge::Right => (offset, 0.),
            crate::tray::TaskbarEdge::Top => (0., -offset), crate::tray::TaskbarEdge::Bottom => (0., offset) };
        let p = Palette::new(self.projection.night);
        let l = self.projection.language;
        let summary = self.projection.summary.clone();
        let attention = self.projection.update.attention();
        let update = &self.projection.update;
        let update_hint = format!(
            "{} · {}",
            crate::app_update_ui::headline(update, l),
            if crate::app_update_ui::popup_restart_available(update) {
                crate::app_update_ui::popup_label(update, l)
            } else {
                l.text("查看应用更新", "View app update")
            },
        );
        let mut status_hint = summary.text.clone();
        for detail in [&summary.queued, &summary.failure].into_iter().flatten() {
            status_hint.push_str(" · ");
            status_hint.push_str(detail);
        }
        if summary.clickable {
            status_hint.push_str(if self.projection.exit_issue {
                l.text(" · 查看退出问题", " · View quit issue")
            } else { l.text(" · 打开队列", " · Open queue") });
        }
        let status_label = summary.count.map_or_else(|| summary.text.clone(), |count| count.to_string());
        let status_color = match summary.icon {
            StatusIcon::Download => p.blue,
            StatusIcon::Warning => p.orange,
            _ => p.neutral,
        };
        let panel = div().relative().left(px(dx)).top(px(dy)).opacity(presence.alpha)
            .size_full()
            .p(px(8.))
            .font(tokens::desktop_ui_font())
            .bg(p.surface)
            .text_color(p.primary_text())
            .line_height(px(20.))
            .rounded(px(12.))
            .border_1()
            .border_color(p.border.opacity(0.65))
            .shadow(vec![BoxShadow { inset: false,
                color: gpui::black().opacity((if p.night { 0.20 } else { 0.10 }) * presence.alpha.powi(3)),
                offset: point(px(0.), px(1.)),
                blur_radius: px(8.),
                spread_radius: px(0.),
            }])
            .track_focus(&self.focus)
            .capture_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                match event.keystroke.key.as_str() {
                    "escape" => {
                        this.dismiss(Action::Closed, cx);
                    }
                    "up" => {
                        this.keyboard = true;
                        let mut choices = vec![1, 2, 3];
                        if this.projection.summary.clickable {
                            choices.insert(0, 0);
                        }
                        if this.projection.update.attention() {
                            choices.insert(usize::from(this.projection.summary.clickable), 4);
                        }
                        let index = this.selected.and_then(|s| choices.iter().position(|i| *i == s))
                            .unwrap_or(0);
                        this.selected = Some(choices[(index + choices.len() - 1) % choices.len()]);
                        cx.notify();
                    }
                    "down" => {
                        this.keyboard = true;
                        let mut choices = vec![1, 2, 3];
                        if this.projection.summary.clickable {
                            choices.insert(0, 0);
                        }
                        if this.projection.update.attention() {
                            choices.insert(usize::from(this.projection.summary.clickable), 4);
                        }
                        this.selected = Some(
                            this.selected
                                .and_then(|s| choices.iter().position(|i| *i == s))
                                .map_or(choices[0], |i| choices[(i + 1) % choices.len()]),
                        );
                        cx.notify();
                    }
                    "enter" | "space" => {
                        if let Some(selected) = this.selected {
                            this.trigger(selected, window, cx);
                        }
                    }
                    _ => return,
                }
                cx.stop_propagation();
            }))
            .child(div().absolute().left(px(8.)).right(px(8.)).top(px(row_y)).h(px(32.))
                .rounded(px(4.)).bg(p.badge.opacity(highlight.alpha)))
            .child(
                div()
                    .w_full()
                    .h(px(40.))
                    .p(px(4.))
                    .rounded(px(6.))
                    .bg(p.badge.opacity(0.45))
                    .flex()
                    .items_center()
                    .gap(px(4.))
                    .child(gpui_base::Button::new("status")
                        .accessibility_label(status_hint.clone())
                        .disabled(!summary.clickable)
                        .focusable(false)
                        .flex_1()
                        .min_w(px(0.))
                        .h(px(32.))
                        .px(px(6.))
                        .rounded(px(4.))
                        .border_1()
                        .border_color(transparent_black())
                        .flex()
                        .items_center()
                        .gap(px(5.))
                        .text_size(px(12.))
                        .text_color(p.primary_text())
                        .tooltip_above(&self.tooltips, move |_, cx| cx.new(|_| crate::settings_window::HelpTooltip {
                            text: status_hint.clone(), night: p.night,
                        }).into())
                        .when(summary.clickable, |d| {
                            d.cursor_pointer().hover(move |d| d.bg(p.badge))
                                .active(move |d| d.bg(p.border))
                        })
                        .when(self.selected == Some(0) && summary.clickable, |d| {
                            d.bg(if self.keyboard {
                                p.badge.opacity(0.7)
                            } else {
                                p.badge
                            }).when(self.keyboard, |d| d.border_color(p.neutral))
                        })
                        .on_hover(cx.listener(|this, inside: &bool, _, cx| {
                            let was_keyboard = this.keyboard;
                            if *inside && this.projection.summary.clickable {
                                this.keyboard = false;
                            }
                            let selected = if *inside && this.projection.summary.clickable {
                                Some(0)
                            } else if !this.keyboard && this.selected == Some(0) {
                                None
                            } else {
                                this.selected
                            };
                            if this.selected != selected || was_keyboard != this.keyboard {
                                this.selected = selected;
                                cx.notify();
                            }
                        }))
                        .on_click(cx.listener(|this, _, window, cx| this.trigger(0, window, cx)))
                        .child(status_icon(summary.icon, status_color))
                        .child(div().min_w(px(0.)).truncate()
                            .when(summary.count.is_none(), |d| d.flex_1())
                            .child(status_label))
                        .when_some(summary.queued, |d, queued| {
                            d.child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(2.))
                                    .flex_shrink_0()
                                    .child(status_icon(StatusIcon::Clock, p.neutral))
                                    .child(queued.split_whitespace().last().unwrap_or("").to_string()),
                            )
                        })
                        .when_some(summary.failure, |d, failure| {
                            d.child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(2.))
                                    .flex_shrink_0()
                                    .text_color(p.red)
                                    .child(status_icon(StatusIcon::Warning, p.red))
                                    .child(failure.split_whitespace().last().unwrap_or("").to_string()),
                            )
                        })
                        .when(summary.clickable, |d| {
                            d.child(svg().path("icons/chevron-right.svg").size(px(12.)).ml_auto().flex_none().text_color(p.neutral))
                        }))
                    .when(attention, |group| group
                        .child(div().w(px(1.)).h(px(16.)).flex_none().bg(p.border))
                        .child(gpui_base::Button::new("tray-app-update")
                            .accessibility_label(update_hint.clone())
                            .focusable(false)
                            .size(px(32.))
                            .flex_none()
                            .flex()
                            .items_center()
                            .justify_center()
                            .rounded(px(4.))
                            .border_1()
                            .border_color(transparent_black())
                            .cursor_pointer()
                            .when(self.selected == Some(4), |d| d.bg(p.badge)
                                .when(self.keyboard, |d| d.border_color(p.neutral)))
                            .hover(move |d| crate::tokens::icon_hover(d, p))
                            .active(move |d| d.bg(p.border))
                            .tooltip_above(&self.tooltips, move |_, cx| cx.new(|_| crate::settings_window::HelpTooltip {
                                text: update_hint.clone(), night: p.night,
                            }).into())
                            .on_hover(cx.listener(|this, inside: &bool, _, cx| {
                                let previous = (this.selected, this.keyboard);
                                if *inside {
                                    this.selected = Some(4);
                                    this.keyboard = false;
                                } else if !this.keyboard && this.selected == Some(4) {
                                    this.selected = None;
                                }
                                if previous != (this.selected, this.keyboard) { cx.notify(); }
                            }))
                            .on_click(cx.listener(|this, _, window, cx| this.trigger(4, window, cx)))
                            .child(svg().path(crate::app_update_ui::popup_icon(update))
                                .size(px(16.)).text_color(p.primary_text())))),
            )
            .child(div().h(px(1.)).bg(p.border).mx(px(12.)).my(px(2.)))
            .child(self.row(
                1,
                l.text("打开 Ameow", "Open Ameow"),
                p.primary_text(),
                p,
                cx,
            ))
            .child(self.row(2, l.text("设置", "Settings"), p.primary_text(), p, cx))
            .child(div().h(px(1.)).bg(p.border).mx(px(12.)).my(px(2.)))
            .child(self.row(3, l.text("退出 Ameow", "Quit Ameow"), p.red, p, cx));
        let root = div().id("tray-root").size_full().p(px(4.)).child(panel)
            .when(self.closing, |s| s.capture_any_mouse_down(|_, _, cx| cx.stop_propagation())
                .capture_key_down(|_, _, cx| cx.stop_propagation()));
        self.motion.finish(window);
        root.tooltip_root(&self.tooltips).into_any_element()
    }
}
impl Prototype {
    pub(super) fn apply_preview_tray_scene(&mut self, _scene: &crate::preview::Scene, cx: &mut Context<Self>) {
        self.close_tray_popup(cx);
        self.toggle_tray_popup(cx);
    }
    pub(super) fn close_tray_popup(&mut self, cx: &mut Context<Self>) {
        if let Some(handle) = self.tray_popup {
            if handle
                .update(cx, |view, _, cx| view.dismiss(Action::Closed, cx))
                .is_ok()
            {
                if let Some(ui) = &self.downloads {
                    ui.evidence(serde_json::json!({"type":"tray-popup-close"}));
                }
            }
        }
    }
    pub(super) fn toggle_tray_popup(&mut self, cx: &mut Context<Self>) {
        #[cfg(target_os = "macos")]
        if self.preview.is_none() { return; }
        if let Some(handle) = self.tray_popup {
            if handle
                .update(cx, |view, _, cx| {
                    if view.closing { view.closing = false; cx.notify(); } else { view.dismiss(Action::Closed, cx); }
                })
                .is_ok()
            {
                if let Some(ui) = &self.downloads {
                    ui.evidence(serde_json::json!({"type":"tray-popup-close"}));
                }
                return;
            }
        }
        // Explicit debug fixtures can exercise popup actions when Explorer's tray is unavailable.
        #[cfg(all(feature = "app-update-fixture", debug_assertions))]
        let fixture_anchor = self.tray.is_none() && std::env::args().any(|arg| arg == "--app-update-ui-control");
        #[cfg(not(all(feature = "app-update-fixture", debug_assertions)))]
        let fixture_anchor = false;
        let anchor = if self.preview.is_some() || fixture_anchor {
            #[cfg(target_os = "windows")]
            {
            let (width, height) = unsafe { (GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN)) };
            crate::tray::PopupAnchor { icon: RECT { left: width - 50, top: height - 50, right: width - 20, bottom: height - 20 }, work: RECT { left: 0, top: 0, right: width, bottom: height }, dpi: 96, edge: crate::tray::TaskbarEdge::Bottom }
            }
            #[cfg(target_os = "macos")]
            { crate::tray::PopupAnchor::preview() }
        } else if let Some(anchor) = self.tray.as_ref().map(|tray| tray.popup_anchor()) { anchor } else {
            return;
        };
        let scale = (anchor.dpi as f32 / 96.).max(0.01);
        let width = WIDTH.min((anchor.work.right - anchor.work.left).max(1) as f32 / scale);
        let height = HEIGHT.min((anchor.work.bottom - anchor.work.top).max(1) as f32 / scale);
        let pos = anchor.place(width, height);
        let projection = Projection::from_main(self);
        let preview = projection.preview;
        let main = cx.entity();
        let actions = self.tray_actions.clone();
        let summary_evidence = serde_json::json!({"type":"tray-popup-open", "summary":projection.summary.text, "queued":projection.summary.queued, "failure":projection.summary.failure, "clickable":projection.summary.clickable});
        let opened = cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    point(px(pos.x as f32 / scale), px(pos.y as f32 / scale)),
                    size(px(width), px(height)),
                ))),
                titlebar: Some(TitlebarOptions {
                    title: Some("Ameow · Tray".into()),
                    appears_transparent: true,
                    ..Default::default()
                }),
                kind: WindowKind::PopUp,
                show: false,
                focus: false,
                is_movable: false,
                is_resizable: false,
                window_background: WindowBackgroundAppearance::Transparent,
                ..Default::default()
            },
            move |window, cx| {
                cx.new(|cx| TrayPopup::new(main, projection, actions, anchor, window, cx))
            },
        );
        if let Ok(handle) = opened {
            if let Some(ui) = &self.downloads {
                ui.evidence(summary_evidence);
            }
            self.tray_popup = Some(handle);
            #[cfg(target_os = "windows")]
            cx.defer(move |cx| {
                let Ok(hwnd) = handle.update(cx, |view, window, cx| {
                    window.focus(&view.focus, cx);
                    let RawWindowHandle::Win32(raw) = HasWindowHandle::window_handle(window)
                        .expect("tray popup HWND")
                        .as_raw()
                    else {
                        unreachable!()
                    };
                    HWND(raw.hwnd.get() as *mut _)
                }) else {
                    return;
                };
                cx.foreground_executor()
                    .spawn(async move {
                        unsafe {
                            // GPUI draws this popup's edge and shadow inside its fixed hit bounds.
                            let policy = DWMNCRP_DISABLED;
                            let _ = DwmSetWindowAttribute(
                                hwnd,
                                DWMWA_NCRENDERING_POLICY,
                                &policy as *const _ as _,
                                std::mem::size_of_val(&policy) as u32,
                            );
                            let _ = SetWindowPos(
                                hwnd,
                                Some(HWND_TOPMOST),
                                pos.x,
                                pos.y,
                                (width * scale).round() as i32,
                                (height * scale).round() as i32,
                                SWP_SHOWWINDOW | SWP_NOOWNERZORDER | if preview { SWP_NOACTIVATE } else { Default::default() },
                            );
                            if !preview { let _ = SetForegroundWindow(hwnd); }
                        }
                    })
                    .detach();
            });
            #[cfg(target_os = "macos")]
            cx.defer(move |cx| {
                let Ok(target) = handle.update(cx, |view, window, cx| {
                    window.focus(&view.focus, cx);
                    let native = crate::native::handle(window);
                    native.window()
                }) else { return; };
                let Some(target) = target else { return; };
                cx.foreground_executor().spawn(async move {
                    target.setStyleMask(objc2_app_kit::NSWindowStyleMask::Borderless);
                    crate::native::configure_overlay(&target);
                    crate::native::set_bounds(&target, [pos.x, pos.y, width.round() as i32, height.round() as i32]);
                    target.makeKeyAndOrderFront(None);
                }).detach();
            });
        } else if let Some(ui) = &mut self.downloads {
            ui.evidence(serde_json::json!({"type":"tray-popup-error"}));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::queue_fixture::{job, snapshot};
    use core::prelude::v1::test;

    #[test]
    fn preview_states_reach_the_real_summary() {
        for (state, expected, icon) in [
            ("preparing", "Preparing", StatusIcon::Loading),
            ("cleanup-unknown", "Cleanup unknown", StatusIcon::Warning),
            ("stopping", "Stopping safely", StatusIcon::Clock),
        ] {
            let mut s = snapshot(vec![]);
            preview_snapshot(&mut s, state);
            let result = summary(Some(&s), false, Language::English);
            assert_eq!(result.text, expected);
            assert_eq!(result.icon, icon);
            assert_eq!(result.count, None);
        }
    }

    #[test]
    fn summary_reports_unknown_idle_preparation_and_cleanup() {
        assert!(!summary(None, false, Language::English).clickable);
        assert_eq!(summary(None, false, Language::English).icon, StatusIcon::Loading);
        assert_eq!(summary(None, true, Language::English).icon, StatusIcon::Warning);
        assert_eq!(
            summary(None, true, Language::English).text,
            "Startup failed"
        );
        let mut s = snapshot(vec![]);
        s.preparing = false;
        assert_eq!(summary(Some(&s), false, Language::English).text, "Idle");
        assert_eq!(summary(Some(&s), false, Language::English).icon, StatusIcon::Check);
        s.preparing = true;
        assert_eq!(
            summary(Some(&s), false, Language::English).text,
            "Preparing"
        );
        s.preparation.phase = PreparationPhase::Failed;
        assert_eq!(
            summary(Some(&s), false, Language::English).text,
            "Preparation failed"
        );
        s.preparation_held = true;
        assert_eq!(
            summary(Some(&s), false, Language::English).text,
            "Waiting for cleanup"
        );
        s.preparation_owner_lost = true;
        assert_eq!(
            summary(Some(&s), false, Language::English).text,
            "Cleanup unknown"
        );
    }

    #[test]
    fn simultaneous_download_and_failure_preserves_both_counts() {
        let s = snapshot(vec![
            job(1, JobPhase::Downloading, Some(1), None),
            job(2, JobPhase::Failure, Some(2), None),
            job(3, JobPhase::Queued, None, None),
        ]);
        let result = summary(Some(&s), false, Language::English);
        assert!(result.clickable);
        assert_eq!(result.icon, StatusIcon::Download);
        assert_eq!(result.count, Some(1));
        assert_eq!(result.text, "Downloading 1");
        assert_eq!(result.queued.as_deref(), Some("Queued 1"));
        assert_eq!(result.failure.as_deref(), Some("Failed 1"));
    }

    #[test]
    fn queued_count_remains_visible_during_cleanup() {
        let mut s = snapshot(vec![job(1, JobPhase::Queued, None, None)]);
        let queued = summary(Some(&s), false, Language::English);
        assert_eq!(queued.text, "Queued 1");
        assert_eq!(queued.icon, StatusIcon::Clock);
        assert_eq!(queued.count, Some(1));
        assert_eq!(queued.queued, None);
        s.preparation_owner_lost = true;
        let result = summary(Some(&s), false, Language::English);
        assert_eq!(result.text, "Cleanup unknown");
        assert_eq!(result.queued.as_deref(), Some("Queued 1"));
        assert_eq!(result.icon, StatusIcon::Warning);
        assert_eq!(result.count, None);
    }

    #[test]
    fn cleanup_issue_stays_visible_while_stopping_without_hiding_queued_jobs() {
        let mut s = snapshot(vec![
            job(1, JobPhase::Downloading, Some(1), None),
            job(2, JobPhase::Queued, None, None),
            job(3, JobPhase::Failure, Some(3), None),
        ]);
        s.preparation_owner_lost = true;
        let cleanup = summary(Some(&s), false, Language::English);
        assert_eq!(cleanup.text, "Cleanup unknown");
        assert_eq!(cleanup.icon, StatusIcon::Warning);
        assert_eq!(cleanup.count, None);
        assert!(cleanup.clickable);
        s.stopping = true;
        let stopping = summary(Some(&s), false, Language::English);
        assert_eq!(stopping.text, "Cleanup unknown");
        assert_eq!(stopping.icon, StatusIcon::Warning);
        assert_eq!(stopping.count, None);
        for result in [cleanup, stopping] {
            assert_eq!(result.queued.as_deref(), Some("Queued 1"));
            assert_eq!(result.failure.as_deref(), Some("Failed 1"));
        }
    }
}
