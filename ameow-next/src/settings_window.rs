//! Independent settings presentation. All writes go through the main command owner.
use crate::{
    Prototype,
    download_ui::SettingsStatus,
    login_startup::{self, StartupState},
    tokens::{self, Palette},
    ui_text::Language,
};
use ameow_next::download::settings::{LanguagePreference, ThemePreference};
use gpui::{prelude::*, *};
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use std::path::{Path, PathBuf};
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

fn settings_message(language: Language, message: &str) -> String {
    let pair = match message {
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
        "未选择文件夹，目录未更改" => Some((
            "未选择文件夹，目录未更改",
            "No folder was selected; the folder is unchanged.",
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

#[derive(Clone)]
struct Projection {
    path: Option<PathBuf>,
    pending: bool,
    status: SettingsStatus,
    error: Option<String>,
    night: bool,
    language: Language,
    preferences: Option<(ThemePreference, LanguagePreference)>,
    queue: Option<std::sync::Arc<ameow_next::download::queue::QueueSnapshot>>,
    preparation_retry_available: bool,
    preparation_copy_pending: bool,
    preparation_status: Option<(String, bool)>,
    upstream: ameow_next::download::upstream::UpstreamChecker,
    upstream_available: bool,
}
impl Projection {
    fn from_main(main: &Prototype) -> Self {
        let ui = main.downloads.as_ref();
        Self {
            path: ui.and_then(|ui| ui.settings()).map(|s| s.output_dir),
            pending: ui.is_some_and(|ui| ui.settings_pending),
            status: ui.map_or(SettingsStatus::Idle, |ui| ui.settings_status.clone()),
            error: ui.and_then(|ui| ui.startup_error.clone()),
            night: main.night,
            language: main.language,
            preferences: ui
                .and_then(|ui| ui.settings())
                .map(|s| (s.theme, s.language)),
            queue: ui.and_then(|ui| ui.snapshot.clone()),
            preparation_retry_available: ui.is_some_and(|ui| ui.preparation_retry_available()),
            preparation_copy_pending: ui.is_some_and(|ui| ui.preparation_copy_pending),
            preparation_status: ui.and_then(|ui| ui.preparation_status_at(main.now())),
            upstream: ui.map(|ui| ui.upstream.clone()).unwrap_or_default(),
            upstream_available: ui.is_some_and(|ui| ui.upstream_check_available()),
        }
    }
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Page {
    General,
    Download,
    Components,
    About,
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum ButtonStyle {
    Standard,
    Quiet,
    Select,
    Icon,
}
pub struct SettingsWindow {
    main: WeakEntity<Prototype>,
    projection: Projection,
    _observer: Subscription,
    focus: FocusHandle,
    page: Page,
    scroll: ScrollHandle,
    picker_pending: bool,
    open_pending: bool,
    notice: Option<(String, bool)>,
    health_path: Option<PathBuf>,
    health_generation: u64,
    health: Option<Result<(), String>>,
    startup: Option<Result<StartupState, String>>,
    startup_pending: bool,
    menu: Option<Page>,
    menu_index: usize,
    keyboard_focus: bool,
    upstream_feedback: Option<(std::time::Instant, bool)>,
    title_language: Language,
}
impl SettingsWindow {
    fn new(
        main: Entity<Prototype>,
        projection: Projection,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let observer = cx.observe(&main, |this, main, cx| {
            let next = Projection::from_main(main.read(cx));
            if next.path != this.projection.path || next.status != this.projection.status {
                this.notice = None;
            }
            this.projection = next;
            this.refresh_health(false, cx);
            cx.notify();
        });
        let focus = cx.focus_handle();
        window.focus(&focus);
        let mut this = Self {
            title_language: projection.language,
            main: main.downgrade(),
            projection,
            _observer: observer,
            focus,
            page: Page::General,
            scroll: ScrollHandle::new(),
            picker_pending: false,
            open_pending: false,
            notice: None,
            health_path: None,
            health_generation: 0,
            health: None,
            startup: None,
            startup_pending: false,
            menu: None,
            menu_index: 0,
            keyboard_focus: false,
            upstream_feedback: None,
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
    fn page_header(&self, title: &'static str, subtitle: &'static str) -> Div {
        let p = Palette::new(self.projection.night);
        div()
            .pb(px(20.))
            .border_b_1()
            .border_color(p.border)
            .child(
                div()
                    .text_size(px(20.))
                    .line_height(px(28.))
                    .font_weight(FontWeight::MEDIUM)
                    .child(title),
            )
            .child(
                div()
                    .mt(px(4.))
                    .text_size(px(12.))
                    .line_height(px(20.))
                    .text_color(p.neutral)
                    .child(subtitle),
            )
    }
    fn general_page(&self, cx: &mut Context<Self>) -> AnyElement {
        let l = self.projection.language;
        let p = Palette::new(self.projection.night);
        let prefs = self.projection.preferences;
        let enabled = prefs.is_some() && !self.projection.pending && !self.picker_pending;
        let (theme, language) = prefs.unwrap_or_default();
        let theme_label = match theme {
            ThemePreference::System => l.text("跟随系统", "System"),
            ThemePreference::Light => l.text("浅色", "Light"),
            ThemePreference::Dark => l.text("深色", "Dark"),
        };
        let language_label = match language {
            LanguagePreference::System => l.text("跟随系统", "System"),
            LanguagePreference::Chinese => "简体中文",
            LanguagePreference::English => "English",
        };
        let on = matches!(self.startup, Some(Ok(StartupState::Enabled)));
        let switch_enabled = !self.startup_pending && self.startup.is_some();
        let switch = div()
            .id("startup-switch")
            .w(px(40.))
            .h(px(24.))
            .rounded(px(12.))
            .bg(if on { p.blue } else { p.control_border() })
            .p(px(4.))
            .flex()
            .when(on, |s| s.justify_end())
            .child(div().size(px(16.)).rounded(px(8.)).bg(p.surface))
            .opacity(if switch_enabled { 1. } else { 0.45 })
            .when(switch_enabled, |s| {
                s.focusable()
                    .tab_index(0)
                    .cursor_pointer()
                    .when(self.keyboard_focus, |s| {
                        s.focus(move |s| s.border_1().border_color(p.blue))
                    })
                    .on_click(
                        cx.listener(move |this, _, _, cx| this.refresh_startup(Some(!on), cx)),
                    )
                    .on_key_down(cx.listener(move |this, event: &KeyDownEvent, _, cx| {
                        if event.keystroke.key == "enter" || event.keystroke.key == "space" {
                            this.refresh_startup(Some(!on), cx);
                            cx.stop_propagation();
                        }
                    }))
            });
        let row = |label: &'static str, control: AnyElement| {
            div()
                .min_h(px(64.))
                .border_b_1()
                .border_color(p.border)
                .flex()
                .items_center()
                .justify_between()
                .gap(px(12.))
                .child(div().flex_none().text_size(px(14.)).child(label))
                .child(control)
        };
        let theme_index = match theme {
            ThemePreference::System => 0,
            ThemePreference::Light => 1,
            ThemePreference::Dark => 2,
        };
        let language_index = match language {
            LanguagePreference::System => 0,
            LanguagePreference::Chinese => 1,
            LanguagePreference::English => 2,
        };
        let group = div()
            .flex()
            .flex_col()
            .child(row(
                l.text("开机启动", "Launch at login"),
                switch.into_any_element(),
            ))
            .child(row(
                l.text("主题", "Theme"),
                self.select_menu(
                    Page::General,
                    "theme-menu",
                    theme_label,
                    [
                        l.text("跟随系统", "System"),
                        l.text("浅色", "Light"),
                        l.text("深色", "Dark"),
                    ],
                    theme_index,
                    enabled,
                    cx,
                ),
            ))
            .child(row(
                l.text("语言", "Language"),
                self.select_menu(
                    Page::Download,
                    "language-menu",
                    language_label,
                    [l.text("跟随系统", "System"), "简体中文", "English"],
                    language_index,
                    enabled,
                    cx,
                ),
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
        let startup_status = match &self.startup {
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
        div()
            .flex()
            .flex_col()
            .child(self.page_header(
                l.text("常规", "General"),
                l.text("启动、主题与语言", "Startup, theme and language"),
            ))
            .child(group)
            .when_some(status, |s, (text, danger)| {
                s.child(
                    div()
                        .mt(px(12.))
                        .text_size(px(12.))
                        .text_color(if danger { p.red } else { p.neutral })
                        .child(text),
                )
            })
            .when_some(startup_status, |s, (text, danger)| {
                s.child(
                    div()
                        .mt(px(12.))
                        .text_size(px(12.))
                        .text_color(if danger { p.red } else { p.neutral })
                        .child(text),
                )
            })
            .into_any_element()
    }
    fn select_menu(
        &self,
        menu: Page,
        id: &'static str,
        label: &'static str,
        options: [&'static str; 3],
        selected: usize,
        enabled: bool,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let p = Palette::new(self.projection.night);
        let was_open = self.menu == Some(menu);
        let mut control = div().relative().w(px(144.)).child(self.button(
            id,
            label,
            enabled,
            ButtonStyle::Select,
            cx,
            move |this, _, cx| {
                this.menu = if was_open { None } else { Some(menu) };
                this.menu_index = selected;
                cx.notify();
            },
        ));
        if self.menu == Some(menu) {
            let mut list = div()
                .id(if menu == Page::General {
                    "theme-options"
                } else {
                    "language-options"
                })
                .w(px(144.))
                .p(px(4.))
                .rounded(px(8.))
                .bg(p.surface)
                .border_1()
                .border_color(p.border)
                .flex()
                .flex_col()
                .on_mouse_down_out(cx.listener(|this, _, _, cx| {
                    this.menu = None;
                    cx.notify();
                }));
            for (index, option) in options.into_iter().enumerate() {
                list = list.child(
                    div()
                        .id((id, index))
                        .h(px(32.))
                        .px(px(8.))
                        .rounded(px(4.))
                        .flex()
                        .items_center()
                        .justify_between()
                        .bg(if self.menu_index == index {
                            p.badge
                        } else {
                            transparent_black()
                        })
                        .hover(move |s| s.bg(p.badge))
                        .cursor_pointer()
                        .text_size(px(13.))
                        .child(option)
                        .child(if selected == index { "✓" } else { "" })
                        .on_click(
                            cx.listener(move |this, _, _, cx| this.select_option(menu, index, cx)),
                        ),
                );
            }
            control = control.child(deferred(anchored().child(list)));
        }
        control.into_any_element()
    }
    fn select_option(&mut self, menu: Page, index: usize, cx: &mut Context<Self>) {
        self.menu = None;
        if let Some((theme, language)) = self.projection.preferences {
            if menu == Page::General {
                let next = [
                    ThemePreference::System,
                    ThemePreference::Light,
                    ThemePreference::Dark,
                ][index];
                if next != theme {
                    self.save_preferences(next, language, cx);
                    return;
                }
            } else if menu == Page::Download {
                let next = [
                    LanguagePreference::System,
                    LanguagePreference::Chinese,
                    LanguagePreference::English,
                ][index];
                if next != language {
                    self.save_preferences(theme, next, cx);
                    return;
                }
            }
        }
        cx.notify();
    }
    fn refresh_health(&mut self, force: bool, cx: &mut Context<Self>) {
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
            let explorer = std::env::var_os("WINDIR")
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("C:/Windows"))
                .join("explorer.exe");
            std::process::Command::new(explorer)
                .arg(path)
                .spawn()
                .map(|_| ())
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
    fn button(
        &self,
        id: &'static str,
        label: &'static str,
        enabled: bool,
        style: ButtonStyle,
        cx: &mut Context<Self>,
        action: impl Fn(&mut Self, &mut Window, &mut Context<Self>) + 'static,
    ) -> AnyElement {
        let p = Palette::new(self.projection.night);
        let action = std::rc::Rc::new(action);
        let key_action = action.clone();
        let quiet = matches!(style, ButtonStyle::Quiet | ButtonStyle::Icon);
        div()
            .id(id)
            .flex_none()
            .h(px(32.))
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
            .when(style == ButtonStyle::Select, |s| {
                s.w_full().justify_between()
            })
            .when(style == ButtonStyle::Icon, |s| s.w(px(32.)))
            .rounded(px(6.))
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
            .text_size(px(13.))
            .child(label)
            .when(style == ButtonStyle::Select, |s| {
                s.child(
                    canvas(
                        |_, _, _| (),
                        move |bounds, _, window, _| {
                            let mut path = PathBuilder::stroke(px(1.3));
                            path.move_to(bounds.origin + point(px(1.), px(2.)));
                            path.line_to(bounds.origin + point(px(4.), px(5.)));
                            path.line_to(bounds.origin + point(px(7.), px(2.)));
                            if let Ok(path) = path.build() {
                                window.paint_path(path, p.neutral);
                            }
                        },
                    )
                    .size(px(8.))
                    .flex_none(),
                )
            })
            .when(enabled, |s| {
                s.focusable()
                    .tab_index(0)
                    .cursor_pointer()
                    .hover(move |s| s.bg(p.badge))
                    .when(self.keyboard_focus, |s| {
                        s.focus(move |s| s.border_color(p.blue))
                    })
                    .on_key_down(cx.listener(move |this, event: &KeyDownEvent, window, cx| {
                        if event.keystroke.key == "enter" || event.keystroke.key == "space" {
                            key_action(this, window, cx);
                            cx.stop_propagation();
                        }
                    }))
                    .on_click(cx.listener(move |this, _, window, cx| action(this, window, cx)))
            })
            .into_any_element()
    }
    fn nav(&self, page: Page, label: &'static str, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.projection.night);
        let selected = self.page == page;
        div()
            .id(label)
            .h(px(36.))
            .px(px(12.))
            .rounded(px(6.))
            .flex()
            .items_center()
            .bg(if selected {
                p.border
            } else {
                transparent_black()
            })
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
            .hover(move |s| s.bg(if selected { p.border } else { p.badge }))
            .child(label)
            .on_key_down(cx.listener(move |this, event: &KeyDownEvent, _, cx| {
                if event.keystroke.key == "enter" || event.keystroke.key == "space" {
                    this.page = page;
                    this.scroll.set_offset(point(px(0.), px(0.)));
                    cx.notify();
                    cx.stop_propagation();
                }
            }))
            .on_click(cx.listener(move |this, _, _, cx| {
                this.page = page;
                this.scroll.set_offset(point(px(0.), px(0.)));
                cx.notify();
            }))
            .into_any_element()
    }
    fn copy_path(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(path) = &self.projection.path {
            self.notice = Some(
                match crate::tray::copy_text(hwnd(window), &display_path(&path.to_string_lossy())) {
                    Ok(()) => ("完整路径已复制".into(), false),
                    Err(_) => ("无法复制路径，请重试".into(), true),
                },
            );
            cx.spawn(async move |this, cx| {
                cx.background_executor()
                    .timer(std::time::Duration::from_secs(3))
                    .await;
                let _ = this.update(cx, |this, cx| {
                    if this
                        .notice
                        .as_ref()
                        .is_some_and(|(message, _)| message == "完整路径已复制")
                    {
                        this.notice = None;
                        cx.notify();
                    }
                });
            })
            .detach();
            cx.notify();
        }
    }
    fn download_page(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.projection.night);
        let l = self.projection.language;
        let enabled =
            self.projection.path.is_some() && !self.projection.pending && !self.picker_pending;
        let path = self
            .projection
            .path
            .as_ref()
            .map(|p| display_path(&p.to_string_lossy()))
            .unwrap_or_else(|| {
                l.text("正在读取下载设置…", "Loading download settings…")
                    .into()
            });
        let preview = path_preview(&path);
        let status = if let Some((message, danger)) = &self.notice {
            Some((settings_message(l, message), *danger))
        } else if let Some(error) = &self.projection.error {
            Some((
                format!(
                    "{}{}",
                    l.text("无法读取下载设置：", "Cannot load download settings: "),
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
            .child(self.page_header(
                l.text("下载", "Download"),
                l.text("默认下载文件夹", "Default download folder"),
            ))
            .child(
                div()
                    .pb(px(20.))
                    .border_b_1()
                    .border_color(p.border)
                    .flex()
                    .flex_col()
                    .child(
                        div()
                            .min_h(px(64.))
                            .flex()
                            .items_center()
                            .gap(px(8.))
                            .child(
                                div()
                                    .flex_1()
                                    .text_size(px(14.))
                                    .child(l.text("下载位置", "Download location")),
                            )
                            .child(self.button(
                                "open-folder",
                                if self.open_pending {
                                    l.text("正在打开…", "Opening…")
                                } else {
                                    l.text("打开", "Open")
                                },
                                enabled && !self.open_pending,
                                ButtonStyle::Standard,
                                cx,
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
                        div()
                            .w_full()
                            .min_h(px(44.))
                            .px(px(12.))
                            .py(px(10.))
                            .rounded(px(6.))
                            .bg(p.badge.opacity(0.55))
                            .border_1()
                            .border_color(transparent_black())
                            .flex()
                            .items_center()
                            .flex_none()
                            .min_w(px(0.))
                            .text_size(px(12.))
                            .font(tokens::ui_font())
                            .overflow_hidden()
                            .whitespace_nowrap()
                            .id("copy-folder")
                            .cursor_pointer()
                            .focusable()
                            .tab_index(0)
                            .hover(move |s| s.bg(p.badge))
                            .when(self.keyboard_focus, |s| {
                                s.focus(move |s| s.border_1().border_color(p.blue))
                            })
                            .tooltip({
                                let full_path = path.clone();
                                move |_, cx| {
                                    cx.new(|_| ValueTooltip {
                                        path: full_path.clone(),
                                        night: p.night,
                                    })
                                    .into()
                                }
                            })
                            .on_click(cx.listener(|this, _, window, cx| this.copy_path(window, cx)))
                            .on_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                                if event.keystroke.key == "enter" || event.keystroke.key == "space"
                                {
                                    this.copy_path(window, cx);
                                    cx.stop_propagation();
                                }
                            }))
                            // Preview is already bounded; GPUI's early zero-width measure
                            // can cache a lone ellipsis when text_ellipsis is inherited here.
                            .child(preview),
                    ),
            )
            .when_some(status, |s, (text, danger)| {
                s.child(
                    div()
                        .mt(px(12.))
                        .text_size(px(12.))
                        .text_color(if danger { p.red } else { p.neutral })
                        .child(text),
                )
            })
            .when_some(
                self.health
                    .as_ref()
                    .and_then(|health| health.as_ref().err()),
                |s, error| {
                    s.child(
                        div()
                            .mt(px(12.))
                            .text_size(px(12.))
                            .text_color(p.red)
                            .child(settings_message(l, error)),
                    )
                },
            )
            .into_any_element()
    }
    fn about_page(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.projection.night);
        let l = self.projection.language;
        div()
            .flex()
            .flex_col()
            .child(self.page_header(l.text("关于", "About"), "Ameow"))
            .child(
                div()
                    .min_h(px(64.))
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(px(12.))
                    .border_b_1()
                    .border_color(p.border)
                    .child(l.text("版本", "Version"))
                    .child(
                        div()
                            .px(px(8.))
                            .py(px(2.))
                            .rounded(px(4.))
                            .bg(p.badge.opacity(0.55))
                            .text_size(px(12.))
                            .text_color(p.neutral)
                            .font(tokens::ui_font())
                            .child(env!("CARGO_PKG_VERSION")),
                    ),
            )
            .child(
                div()
                    .min_h(px(64.))
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(px(12.))
                    .border_b_1()
                    .border_color(p.border)
                    .child("GitHub")
                    .child(self.button(
                        "project-link",
                        "Wutpeach/Ameow ↗",
                        true,
                        ButtonStyle::Quiet,
                        cx,
                        |_, _, cx| cx.open_url("https://github.com/Wutpeach/Ameow"),
                    )),
            )
            .into_any_element()
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
        let p = Palette::new(self.projection.night);
        let l = self.projection.language;
        let content = if self.page == Page::General {
            self.general_page(cx)
        } else if self.page == Page::Download {
            self.download_page(cx)
        } else if self.page == Page::Components {
            self.components_page(cx)
        } else {
            self.about_page(cx)
        };
        div()
            .id("settings-root")
            .size_full()
            .flex()
            .bg(p.surface)
            .text_color(p.primary_text())
            .font(tokens::desktop_ui_font())
            .text_size(px(14.))
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
                if event.keystroke.key == "escape" && this.menu.is_some() {
                    this.menu = None;
                    cx.notify();
                    cx.stop_propagation();
                    return;
                }
                if this.page == Page::General {
                    if let Some(menu @ (Page::General | Page::Download)) = this.menu {
                        match event.keystroke.key.as_str() {
                            "escape" => {
                                this.menu = None;
                                cx.notify();
                                cx.stop_propagation();
                                return;
                            }
                            "up" => {
                                this.menu_index = (this.menu_index + 2) % 3;
                                cx.notify();
                                cx.stop_propagation();
                                return;
                            }
                            "down" => {
                                this.menu_index = (this.menu_index + 1) % 3;
                                cx.notify();
                                cx.stop_propagation();
                                return;
                            }
                            "enter" | "space" => {
                                this.select_option(menu, this.menu_index, cx);
                                cx.stop_propagation();
                                return;
                            }
                            "tab" => {
                                this.menu = None;
                                cx.notify();
                            }
                            _ => {}
                        }
                    }
                }
                if event.keystroke.key == "escape" {
                    window.remove_window();
                    cx.stop_propagation();
                } else if event.keystroke.key == "tab" {
                    if event.keystroke.modifiers.shift {
                        window.focus_prev();
                    } else {
                        window.focus_next();
                    }
                    cx.stop_propagation();
                }
            }))
            .child(
                div()
                    .w(px(128.))
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
                            .child(div().pr(px(8.)).child(self.button(
                                "close-settings",
                                "×",
                                true,
                                ButtonStyle::Icon,
                                cx,
                                |_, window, _| window.remove_window(),
                            ))),
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
                            .overflow_y_scroll()
                            .track_scroll(&self.scroll)
                            .child(content),
                    ),
            )
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
fn show(handle: WindowHandle<SettingsWindow>, first: Option<Anchor>, cx: &mut App) {
    cx.defer(move |cx| {
        let Ok(target) = handle.update(cx, |view, window, cx| {
            window.focus(&view.focus);
            view.refresh_health(true, cx);
            hwnd(window)
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
                        let _ = ShowWindow(target, SW_RESTORE);
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
                    let _ = SetForegroundWindow(target);
                }
            })
            .detach();
    });
}
impl Prototype {
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
            move |window, cx| cx.new(|cx| SettingsWindow::new(main, projection, window, cx)),
        ) {
            Ok(handle) => {
                self.settings_window = Some(handle);
                show(handle, Some(a), cx);
            }
            Err(_) => {
                let now = self.now();
                if let Some(ui) = &mut self.downloads {
                    ui.feedback = Some(("无法打开设置窗口，请重试".into(), now));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        Language, directory_health, display_path, normalize_selection, path_preview,
        settings_message, side_bounds,
    };
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
    fn settings_notices_follow_effective_language() {
        let message = "当前目录无法访问，请检查权限或重新选择。";
        assert_eq!(settings_message(Language::Chinese, message), message);
        assert!(settings_message(Language::English, message).contains("Cannot access"));
        assert!(
            settings_message(Language::English, "E_SETTINGS_SAVE: failure").contains("not saved")
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
