use crate::{
    Prototype,
    tokens::{self, Palette},
    ui_text::Language,
};
use ameow_next::download::preparation::PreparationPhase;
use ameow_next::download::queue::{JobPhase, QueueSnapshot};
use gpui::{prelude::*, *};
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use std::{cell::RefCell, rc::Rc, time::Duration};
use windows::Win32::{
    Foundation::{HWND, POINT, RECT},
    Graphics::Dwm::{DWMNCRP_DISABLED, DWMWA_NCRENDERING_POLICY, DwmSetWindowAttribute},
    UI::WindowsAndMessaging::{
        GetCursorPos, HWND_TOPMOST, SWP_NOOWNERZORDER, SWP_SHOWWINDOW, SetForegroundWindow,
        SetWindowPos,
    },
};

const WIDTH: f32 = 248.;
const HEIGHT: f32 = 172.;
#[derive(Clone, Copy, Debug)]
pub enum Action {
    Status,
    Open,
    Settings,
    Exit,
    Closed,
}
#[derive(Clone)]
struct Projection {
    language: Language,
    night: bool,
    reduced: bool,
    summary: Summary,
}
#[derive(Clone, Debug, PartialEq, Eq)]
struct Summary {
    text: String,
    downloading: bool,
    queued_primary: bool,
    queued: Option<String>,
    failure: Option<String>,
    clickable: bool,
}
impl Projection {
    fn from_main(main: &Prototype) -> Self {
        Self {
            language: main.language,
            night: main.night,
            reduced: main.model.reduced,
            summary: summary(
                main.downloads
                    .as_ref()
                    .and_then(|ui| ui.snapshot.as_deref()),
                main.downloads
                    .as_ref()
                    .is_some_and(|ui| ui.startup_error.is_some()),
                main.language,
            ),
        }
    }
}

#[derive(Clone, Copy)]
enum StatusIcon {
    Download,
    Clock,
    Warning,
    Forward,
}

fn status_icon(icon: StatusIcon, color: Hsla) -> impl IntoElement {
    canvas(
        |_, _, _| (),
        move |bounds, _, window, _| {
            let paths: &[&[(f32, f32)]] = match icon {
                StatusIcon::Download => &[
                    &[(8., 2.), (8., 10.)],
                    &[(4.5, 6.5), (8., 10.), (11.5, 6.5)],
                    &[(2.5, 9.), (2.5, 13.), (13.5, 13.), (13.5, 9.)],
                ],
                StatusIcon::Clock => &[
                    &[
                        (8., 2.),
                        (11., 2.8),
                        (13.2, 5.),
                        (14., 8.),
                        (13.2, 11.),
                        (11., 13.2),
                        (8., 14.),
                        (5., 13.2),
                        (2.8, 11.),
                        (2., 8.),
                        (2.8, 5.),
                        (5., 2.8),
                        (8., 2.),
                    ],
                    &[(8., 4.5), (8., 8.), (10.5, 9.5)],
                ],
                StatusIcon::Warning => &[
                    &[(8., 2.), (14., 13.), (2., 13.), (8., 2.)],
                    &[(8., 5.5), (8., 9.)],
                    &[(8., 11.), (8., 11.5)],
                ],
                StatusIcon::Forward => &[&[(6., 4.), (10., 8.), (6., 12.)]],
            };
            for points in paths {
                let mut path = PathBuilder::stroke(px(1.2));
                for (index, (x, y)) in points.iter().enumerate() {
                    let position = bounds.origin + point(px(*x * 0.875), px(*y * 0.875));
                    if index == 0 {
                        path.move_to(position);
                    } else {
                        path.line_to(position);
                    }
                }
                if let Ok(path) = path.build() {
                    window.paint_path(path, color);
                }
            }
        },
    )
    .size(px(14.))
    .flex_none()
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
            downloading: false,
            queued_primary: false,
            queued: None,
            failure: None,
            clickable: false,
        };
    };
    let clickable = s.unfinished > 0 || s.failures > 0;
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
    let text = if s.stopping {
        language.text("正在安全停止", "Stopping safely").to_string()
    } else if s.preparation_owner_lost {
        language.text("清理未确认", "Cleanup unknown").to_string()
    } else if s.preparation_held {
        language
            .text("等待组件清理", "Waiting for cleanup")
            .to_string()
    } else if downloading > 0 {
        format!("{} {}", language.text("下载中", "Downloading"), downloading)
    } else if s.preparation.phase == PreparationPhase::Failed {
        language
            .text("组件准备失败", "Preparation failed")
            .to_string()
    } else if s.preparing {
        language.text("准备中", "Preparing").to_string()
    } else if queued > 0 && queued == s.unfinished {
        format!("{} {}", language.text("排队中", "Queued"), queued)
    } else if s.unfinished > 0 {
        format!(
            "{} {}",
            language.text("任务进行中", "Tasks in progress"),
            s.unfinished
        )
    } else if s.failures > 0 {
        language.text("需要处理", "Needs attention").to_string()
    } else {
        language.text("空闲", "Idle").to_string()
    };
    let queued_primary = !s.stopping
        && !s.preparation_owner_lost
        && !s.preparation_held
        && downloading == 0
        && s.preparation.phase != PreparationPhase::Failed
        && !s.preparing
        && queued > 0
        && queued == s.unfinished;
    let failure =
        (s.failures > 0).then(|| format!("{} {}", language.text("失败", "Failed"), s.failures));
    let queued = (queued > 0 && !queued_primary)
        .then(|| format!("{} {}", language.text("排队", "Queued"), queued));
    Summary {
        text,
        downloading: downloading > 0
            && !s.stopping
            && !s.preparation_owner_lost
            && !s.preparation_held,
        queued_primary,
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
}
impl TrayPopup {
    fn new(
        main: Entity<Prototype>,
        projection: Projection,
        actions: Rc<RefCell<Vec<Action>>>,
        icon: RECT,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let observer = cx.observe(&main, |this, main, cx| {
            this.projection = Projection::from_main(main.read(cx));
            cx.notify();
        });
        let activation_actions = actions.clone();
        let activation = cx.observe_window_activation(window, move |_, window, _| {
            if !window.is_window_active() {
                let mut cursor = POINT::default();
                let on_icon = unsafe { GetCursorPos(&mut cursor).is_ok() }
                    && cursor.x >= icon.left
                    && cursor.x < icon.right
                    && cursor.y >= icon.top
                    && cursor.y < icon.bottom;
                if !on_icon {
                    activation_actions.borrow_mut().push(Action::Closed);
                    window.remove_window();
                }
            }
        });
        let focus = cx.focus_handle();
        window.focus(&focus);
        Self {
            projection,
            actions,
            selected: None,
            keyboard: false,
            focus,
            _observer: observer,
            _activation: activation,
        }
    }
    fn trigger(&mut self, index: usize, window: &mut Window) {
        let action = match index {
            0 if self.projection.summary.clickable => Action::Status,
            1 => Action::Open,
            2 => Action::Settings,
            3 => Action::Exit,
            _ => return,
        };
        self.actions.borrow_mut().push(action);
        window.remove_window();
    }
    fn row(
        &self,
        index: usize,
        label: &'static str,
        color: Hsla,
        p: Palette,
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
            .when(self.selected == Some(index), |d| {
                d.bg(if self.keyboard {
                    p.badge.opacity(0.7)
                } else {
                    p.badge
                })
            })
            .hover(move |d| d.bg(p.badge))
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
            .on_click(cx.listener(move |this, _, window, _| this.trigger(index, window)))
            .child(label)
            .into_any_element()
    }
}
impl Render for TrayPopup {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = Palette::new(self.projection.night);
        let l = self.projection.language;
        let summary = self.projection.summary.clone();
        let panel = div()
            .size_full()
            .p(px(8.))
            .font(tokens::desktop_ui_font())
            .bg(p.surface)
            .text_color(p.primary_text())
            .line_height(px(20.))
            .rounded(px(12.))
            .border_1()
            .border_color(p.border.opacity(0.65))
            .shadow(vec![BoxShadow {
                color: gpui::black().opacity(if p.night { 0.20 } else { 0.10 }),
                offset: point(px(0.), px(1.)),
                blur_radius: px(8.),
                spread_radius: px(0.),
            }])
            .track_focus(&self.focus)
            .capture_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                match event.keystroke.key.as_str() {
                    "escape" => {
                        this.actions.borrow_mut().push(Action::Closed);
                        window.remove_window();
                    }
                    "up" => {
                        this.keyboard = true;
                        let next = this.selected.map_or(3, |selected| (selected + 3) % 4);
                        this.selected = Some(if next == 0 && !this.projection.summary.clickable {
                            3
                        } else {
                            next
                        });
                        cx.notify();
                    }
                    "down" => {
                        this.keyboard = true;
                        let next = this.selected.map_or(1, |selected| (selected + 1) % 4);
                        this.selected = Some(if next == 0 && !this.projection.summary.clickable {
                            1
                        } else {
                            next
                        });
                        cx.notify();
                    }
                    "enter" | "space" => {
                        if let Some(selected) = this.selected {
                            this.trigger(selected, window);
                        }
                    }
                    _ => return,
                }
                cx.stop_propagation();
            }))
            .child(
                div()
                    .id("status")
                    .w_full()
                    .h(px(40.))
                    .px(px(12.))
                    .rounded(px(4.))
                    .flex()
                    .items_center()
                    .gap(px(4.))
                    .text_size(px(12.))
                    .when(summary.clickable, |d| {
                        d.cursor_pointer().hover(move |d| d.bg(p.badge))
                    })
                    .when(self.selected == Some(0) && summary.clickable, |d| {
                        d.bg(if self.keyboard {
                            p.badge.opacity(0.7)
                        } else {
                            p.badge
                        })
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
                    .on_click(cx.listener(|this, _, window, _| this.trigger(0, window)))
                    .when(summary.downloading, |d| {
                        d.child(status_icon(StatusIcon::Download, p.blue))
                    })
                    .when(summary.queued_primary, |d| {
                        d.child(status_icon(StatusIcon::Clock, p.neutral))
                    })
                    .child(div().flex_1().overflow_hidden().child(summary.text))
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
                        d.child(status_icon(StatusIcon::Forward, p.neutral))
                    }),
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
        let root = div().size_full().p(px(4.)).child(panel);
        if self.projection.reduced {
            root.into_any_element()
        } else {
            root.with_animation(
                "tray-fade-in",
                Animation::new(Duration::from_millis(130)),
                |element, delta| element.opacity(delta),
            )
            .into_any_element()
        }
    }
}
impl Prototype {
    pub(super) fn close_tray_popup(&mut self, cx: &mut Context<Self>) {
        if let Some(handle) = self.tray_popup.take() {
            if handle
                .update(cx, |_, window, _| window.remove_window())
                .is_ok()
            {
                if let Some(ui) = &self.downloads {
                    ui.evidence(serde_json::json!({"type":"tray-popup-close"}));
                }
            }
        }
    }
    pub(super) fn toggle_tray_popup(&mut self, cx: &mut Context<Self>) {
        if let Some(handle) = self.tray_popup.take() {
            if handle
                .update(cx, |_, window, _| window.remove_window())
                .is_ok()
            {
                if let Some(ui) = &self.downloads {
                    ui.evidence(serde_json::json!({"type":"tray-popup-close"}));
                }
                return;
            }
        }
        let Some(anchor) = self.tray.as_ref().map(|tray| tray.popup_anchor()) else {
            return;
        };
        let scale = (anchor.dpi as f32 / 96.).max(0.01);
        let width = WIDTH.min((anchor.work.right - anchor.work.left).max(1) as f32 / scale);
        let height = HEIGHT.min((anchor.work.bottom - anchor.work.top).max(1) as f32 / scale);
        let pos = anchor.place(width, height);
        let projection = Projection::from_main(self);
        let main = cx.entity();
        let actions = self.tray_actions.clone();
        let icon = anchor.icon;
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
                cx.new(|cx| TrayPopup::new(main, projection, actions, icon, window, cx))
            },
        );
        if let Ok(handle) = opened {
            if let Some(ui) = &self.downloads {
                ui.evidence(summary_evidence);
            }
            self.tray_popup = Some(handle);
            cx.defer(move |cx| {
                let Ok(hwnd) = handle.update(cx, |view, window, _| {
                    window.focus(&view.focus);
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
                                SWP_SHOWWINDOW | SWP_NOOWNERZORDER,
                            );
                            let _ = SetForegroundWindow(hwnd);
                        }
                    })
                    .detach();
            });
        } else if let Some(ui) = &mut self.downloads {
            ui.feedback = Some((
                "无法打开托盘窗口，请重试".into(),
                self.clock.elapsed().as_millis() as u64,
            ));
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
    fn summary_reports_unknown_idle_preparation_and_cleanup() {
        assert!(!summary(None, false, Language::English).clickable);
        assert_eq!(
            summary(None, true, Language::English).text,
            "Startup failed"
        );
        let mut s = snapshot(vec![]);
        s.preparing = false;
        assert_eq!(summary(Some(&s), false, Language::English).text, "Idle");
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
        assert!(result.downloading);
        assert_eq!(result.text, "Downloading 1");
        assert_eq!(result.queued.as_deref(), Some("Queued 1"));
        assert_eq!(result.failure.as_deref(), Some("Failed 1"));
    }

    #[test]
    fn queued_count_remains_visible_during_cleanup() {
        let mut s = snapshot(vec![job(1, JobPhase::Queued, None, None)]);
        s.preparation_owner_lost = true;
        let result = summary(Some(&s), false, Language::English);
        assert_eq!(result.text, "Cleanup unknown");
        assert_eq!(result.queued.as_deref(), Some("Queued 1"));
        assert!(!result.queued_primary);
    }
}
