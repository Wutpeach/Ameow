use super::*;
use ameow_next::browser_sessions::{SiteView, SyncError};
use std::time::{Duration, Instant};

pub(super) struct BrowserUi {
    pub guide: u8,
    pub(super) guide_focus_pending: bool,
    selected: Option<String>,
    pub(super) details: bool,
    setup_requested: bool,
    setup_error: Option<String>,
    path: Option<PathBuf>,
    chrome: bool,
    paused: bool,
    manual_motion: bool,
    elapsed: Duration,
    tick: Option<Instant>,
    visible: Rc<Cell<bool>>,
    anchors: Rc<RefCell<[Option<Bounds<Pixels>>; 4]>>,
    origin: Rc<Cell<Option<Point<Pixels>>>>,
}
impl Default for BrowserUi {
    fn default() -> Self {
        Self { guide: 0, guide_focus_pending: false, selected: None, details: false, setup_requested: false,
            setup_error: None, path: None, chrome: false, paused: false, manual_motion: false,
            elapsed: Duration::ZERO, tick: None, visible: Rc::new(Cell::new(false)),
            anchors: Rc::new(RefCell::new([None; 4])), origin: Rc::new(Cell::new(None)) }
    }
}
impl BrowserUi {
    pub(super) fn preview_path(&mut self) { self.path = Some(PathBuf::from(r"C:\Apps\Ameow\browser-extension")); }
}

fn brand(site: &str) -> (&str, &'static str) {
    match site {
        "bilibili.com" => ("Bilibili", "brands/bilibili.svg"),
        "youtube.com" => ("YouTube", "brands/youtube.svg"),
        "bsky.app" => ("Bluesky", "brands/bluesky.svg"),
        "imgur.com" => ("Imgur", "brands/imgur.svg"),
        "x.com" => ("X", "brands/x.svg"),
        "vimeo.com" => ("Vimeo", "brands/vimeo.svg"),
        _ => (site, "icons/info.svg"),
    }
}
fn brand_size(site: &str) -> f32 {
    match site { "youtube.com" => 30., "x.com" => 26., "bilibili.com" | "bsky.app" | "imgur.com" | "vimeo.com" => 28., _ => 26. }
}
fn failed(site: &SiteView) -> bool { site.last_result.as_ref().is_some_and(|r| r.error.is_some()) }
fn show_latest_on_summary(site: &SiteView) -> bool { site.cookie_count > 0 || failed(site) }
fn short_status(site: &SiteView, l: Language) -> &'static str {
    if failed(site) { l.text("最近失败", "Latest failed") }
    else if site.cookie_count == 0 { l.text("空会话", "Empty session") }
    else if site.last_result.is_none() { l.text("结果未知", "Result unknown") }
    else { l.text("已存快照", "Snapshot saved") }
}
fn setup_error(code: &str, l: Language) -> &'static str {
    match code {
        "E_SESSION_HOST_MISSING" => l.text("未找到浏览器连接组件，请使用完整 Ameow 产品包。", "Browser bridge is missing. Use the complete Ameow package."),
        "E_SESSION_HOST_PATH" => l.text("浏览器无法使用此组件路径，请把完整产品包放到较短的普通目录。", "The browser cannot use this bridge path. Put the complete package in a shorter standard directory."),
        "E_SESSION_HOST_PROTOCOL" => l.text("连接组件自检失败，请使用与当前应用配套的完整产品包。", "Bridge self-check failed. Use the complete package matching this application."),
        "E_SESSION_HOST_START" | "E_SESSION_HOST_TIMEOUT" => l.text("连接组件未能正常启动或响应。", "The bridge could not start or respond."),
        "E_SESSION_REGISTRATION" => l.text("组件自检通过，但浏览器注册未完成。", "Component self-check passed, but browser registration is incomplete."),
        _ => l.text("浏览器连接配置未完成，请重试。", "Browser connection setup did not finish. Try again."),
    }
}

impl SettingsWindow {
    pub(super) fn browser_setup_observe(&mut self, next: &Projection) {
        if self.browser_ui.guide != 1 || !self.browser_ui.setup_requested || next.bridge_config_pending { return; }
        if let Some(result) = &next.bridge_config_result {
            self.browser_ui.setup_requested = false;
            match result {
                Ok(()) => match ameow_next::browser_sessions::native::extension_directory() {
                    Ok(path) => { self.browser_ui.path = Some(path); self.browser_ui.guide = 2; self.browser_ui.guide_focus_pending = true; self.scroll.set_offset(point(px(0.), px(0.))); }
                    Err(error) => self.browser_ui.setup_error = Some(error),
                },
                Err(error) => self.browser_ui.setup_error = Some(error.clone()),
            }
        }
    }
    pub(super) fn close_browser_guide(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.browser_ui.guide = 0;
        self.browser_ui.guide_focus_pending = false;
        self.browser_ui.setup_requested = false;
        self.browser_ui.tick = None;
        if let Some(focus) = self.control_focus.borrow().get("browser-connect").cloned() {
            let reveal = self.reveal_focus.clone();
            let owner = cx.entity().downgrade();
            window.on_next_frame(move |window, cx| {
                let _ = owner.update(cx, |this, cx| {
                    if this.page == Page::Download && this.browser_ui.guide == 0 {
                        reveal.set(true); window.focus(&focus, cx);
                    }
                });
            });
        }
        cx.notify();
    }
    pub(super) fn browser_sessions_section(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.projection.night); let l = self.projection.language;
        let status = self.projection.queue.as_ref().map(|q| q.browser_sessions.clone()).unwrap_or_default();
        let selected = self.browser_ui.selected.as_ref().and_then(|id| status.sites.iter().find(|s| &s.grant_id == id)).or_else(|| status.sites.first());
        let mut body = div().mt(px(24.)).border_t_1().border_color(p.border).pt(px(20.))
            .child(div().flex().flex_wrap().items_center().justify_between().gap(px(12.))
                .child(div().text_size(px(15.)).font_weight(FontWeight::MEDIUM).child(l.text("浏览器会话", "Browser sessions")))
                .child(self.button("browser-connect", l.text("连接浏览器", "Connect browser"), true, ButtonStyle::Standard, cx, |this, _, cx| {
                    this.browser_ui.guide = 1; this.browser_ui.guide_focus_pending = true; this.browser_ui.setup_error = None;
                    this.browser_ui.setup_requested = false; this.scroll.set_offset(point(px(0.), px(0.))); cx.notify();
                })))
            .child(div().mt(px(12.)).text_color(p.neutral).child(authorized_count(status.sites.len(), l)));
        if status.error.is_some() {
            body = body.child(div().mt(px(12.)).child(inline_notice(p, l.text("会话缓存暂不可读，请重试。", "Session cache is unavailable. Try again."), true)));
        } else if status.notice.as_ref().is_some_and(|s| s != "installed") {
            body = body.child(div().mt(px(12.)).child(inline_notice(p, l.text("操作未完成，请重试。", "The operation did not finish. Try again."), true)));
        }
        let mut badges = div().mt(px(16.)).flex().flex_wrap().gap(px(12.));
        for session in &status.sites {
            let (name, icon) = brand(&session.site); let name = name.to_owned();
            let icon_size = brand_size(&session.site);
            let selected_badge = selected.is_some_and(|s| s.grant_id == session.grant_id);
            let id = session.grant_id.clone(); let key = format!("browser-site:{id}");
            let (container, focus) = self.control_container(&key, true, cx);
            let state_color = if failed(session) { error_text(p) } else { p.neutral };
            let state_icon = if failed(session) { "icons/circle-alert.svg" } else if session.cookie_count == 0 || session.last_result.is_none() { "icons/info.svg" } else { "icons/check.svg" };
            let control = gpui_base::Button::new(SharedString::from(key)).track_focus(&focus).disabled(self.passive.get())
                .accessibility_label(format!("{} · {}", name, short_status(session, l)))
                .w(px(100.)).min_h(px(110.)).flex().flex_col().items_center().gap(px(4.))
                .border_1().border_color(transparent_black()).rounded(px(8.))
                .when(self.keyboard_focus, |s| s.focus(move |s| s.border_color(p.blue)))
                .cursor_pointer().hover(move |s| s.bg(p.badge.opacity(0.4)))
                .on_click(cx.listener(move |this, _, _, cx| { this.browser_ui.selected = Some(id.clone()); this.browser_ui.details = false; cx.notify(); }))
                .child(div().relative().size(px(60.)).rounded_full().border_2().border_color(if selected_badge { p.blue } else { transparent_black() }).p(px(2.))
                    .child(div().size_full().rounded_full().bg(p.badge).flex().items_center().justify_center()
                        .child(svg().path(icon).size(px(icon_size)).text_color(p.primary_text())))
                    .child(div().absolute().right_0().bottom_0().size(px(18.)).rounded_full().bg(p.surface).flex().items_center().justify_center()
                        .child(svg().path(state_icon).size(px(14.)).text_color(state_color))))
                .child(div().w_full().text_size(px(13.)).truncate().child(name))
                .child(div().text_size(px(12.)).text_color(state_color).child(short_status(session, l)));
            badges = badges.child(container.child(control));
        }
        body = body.child(badges);
        if let Some(site) = selected {
            let (name, _) = brand(&site.site); let site_name = site.site.clone(); let grant = site.grant_id.clone();
            let source_name = if site.source_name.trim().is_empty() { l.text("未知来源", "Unknown source") } else { &site.source_name };
            let latest = match &site.last_result {
                None => l.text("最近同步结果未知", "Latest sync result unknown").to_owned(),
                Some(result) => {
                    let text = match result.error {
                        Some(SyncError::Storage) => l.text("存储失败；保留旧缓存", "Storage failed; previous snapshot retained"),
                        Some(SyncError::Bridge) => l.text("连接失败；保留旧缓存", "Connection failed; previous snapshot retained"),
                        Some(SyncError::CookieRead) => l.text("读取失败；保留旧缓存", "Read failed; previous snapshot retained"),
                        Some(_) => l.text("同步失败；保留旧缓存", "Sync failed; previous snapshot retained"),
                        None => l.text("最近同步成功", "Latest sync succeeded"),
                    };
                    format!("{} · {}", text, ameow_next::browser_sessions::utc_timestamp(result.at))
                }
            };
            let mut detail = div().mt(px(20.)).pt(px(16.)).border_t_1().border_color(p.border)
                .child(div().flex().flex_wrap().items_center().justify_between().gap(px(8.))
                    .child(div().min_w(px(0.)).flex_1().child(format!("{} · {}", name, break_long(&site.site))))
                    .child(self.button("remove-browser-session", l.text("移除", "Remove"), true, ButtonStyle::Standard, cx, move |this, _, cx| {
                        if this.projection.preview {
                            if let Some(snapshot) = this.projection.queue.as_mut() { std::sync::Arc::make_mut(snapshot).browser_sessions.sites.retain(|s| s.grant_id != grant); }
                            this.browser_ui.selected = None; cx.notify();
                        } else { this.session_command(ameow_next::download::queue::QueueCommand::RemoveBrowserSession { site: site_name.clone(), grant_id: grant.clone() }, cx); }
                    })))
                .child(div().mt(px(8.)).text_color(p.neutral).child(break_long(source_name)))
                .child(div().text_color(p.neutral).child(format!("{} · {}", l.text("快照", "Snapshot"), ameow_next::browser_sessions::utc_timestamp(site.synced_at))));
            if show_latest_on_summary(site) {
                detail = detail.child(div().mt(px(6.)).text_color(if failed(site) { error_text(p) } else { p.neutral }).child(latest.clone()));
            }
            if site.cookie_count == 0 {
                detail = detail.child(div().mt(px(8.)).child(l.text("没有可用 Cookie", "No usable cookies")))
                    .child(div().text_color(p.neutral).child(l.text("请在浏览器登录后重新同步。", "Sign in in your browser, then sync again.")));
            }
            if site.skipped_partitioned > 0 { detail = detail.child(div().mt(px(6.)).text_color(p.neutral).child(l.text("分区 Cookie 已排除。", "Partitioned cookies were excluded."))); }
            detail = detail.child(self.button("browser-source-details", l.text("来源与快照", "Source and snapshot"), true, ButtonStyle::Quiet, cx, |this, _, cx| { this.browser_ui.details = !this.browser_ui.details; cx.notify(); }));
            if self.browser_ui.details {
                detail = detail.child(div().mt(px(4.)).p(px(10.)).rounded(px(6.)).bg(p.badge.opacity(0.55)).text_color(p.neutral)
                    .child(format!("{}: {}", l.text("来源", "Source"), break_long(source_name)))
                    .child(div().child(format!("ID: {}", break_long(&site.source_id))))
                    .child(div().child(format!("{}: {}", l.text("上次成功缓存", "Last successful snapshot"), ameow_next::browser_sessions::utc_timestamp(site.synced_at))))
                    .when(!show_latest_on_summary(site), |s| s.child(div().child(latest)))
                    .child(div().child(format!("Cookie: {}", site.cookie_count))));
            }
            body = body.child(detail);
        }
        body.into_any_element()
    }

    pub(super) fn browser_guide(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.projection.night); let l = self.projection.language;
        let second = self.browser_ui.guide == 2;
        let mut page = div().w_full().flex().flex_col()
            .child(div().flex().items_center().gap(px(8.))
                .child(self.icon_button("browser-guide-back", "icons/chevron-left.svg", l.text("返回", "Back"), true, cx, |this, window, cx| {
                    if this.browser_ui.guide == 2 { this.browser_ui.guide = 1; this.browser_ui.guide_focus_pending = true; this.browser_ui.tick = None; cx.notify(); }
                    else { this.close_browser_guide(window, cx); }
                }))
                .child(div().flex_1().min_w(px(0.)).text_size(px(15.)).font_weight(FontWeight::MEDIUM)
                    .child(if second { l.text("加载浏览器扩展", "Load browser extension") } else { l.text("连接浏览器", "Connect browser") }))
                .child(div().text_color(p.neutral).child(if second { "2 / 2" } else { "1 / 2" }))
                .child(self.icon_button("browser-guide-close", "icons/x.svg", l.text("关闭引导", "Close guide"), true, cx, |this, window, cx| this.close_browser_guide(window, cx))));
        if !second {
            page = page.child(div().mt(px(24.)).text_size(px(15.)).font_weight(FontWeight::MEDIUM).child(l.text("配置本机连接", "Set up this computer")))
                .child(div().mt(px(8.)).text_color(p.neutral).child(l.text("配置 Ameow 与浏览器扩展之间的本机连接。", "Set up the connection between Ameow and the browser extension.")));
            if let Some(error) = self.browser_ui.setup_error.as_deref() {
                page = page.child(div().mt(px(12.)).child(inline_notice(p, setup_error(error, l), true)));
            }
            let busy = self.browser_ui.setup_requested || self.projection.bridge_config_pending;
            let label = if busy { l.text("正在配置…", "Setting up…") } else if self.browser_ui.setup_error.is_some() { l.text("重试配置", "Retry setup") } else { l.text("配置本机连接", "Set up this computer") };
            page = page.child(div().mt(px(20.)).child(self.button("browser-setup", label, !busy, ButtonStyle::Standard, cx, |this, window, cx| {
                this.browser_ui.setup_error = None;
                if let Some(focus) = this.control_focus.borrow().get("browser-guide-back") { window.focus(focus, cx); }
                if this.projection.preview {
                    this.browser_ui.preview_path();
                    this.browser_ui.guide = 2;
                    this.browser_ui.guide_focus_pending = true;
                } else {
                    let accepted = this.main.update(cx, |main, cx| {
                        let now = main.now();
                        let accepted = main.downloads.as_mut().is_some_and(|ui| ui.send(ameow_next::download::queue::QueueCommand::InstallBrowserBridge, now));
                        cx.notify(); accepted
                    }).unwrap_or(false);
                    this.browser_ui.setup_requested = accepted;
                    if !accepted { this.browser_ui.setup_error = Some("E_REQUEST".into()); }
                }
                cx.notify();
            })));
        } else {
            let path = self.browser_ui.path.as_ref().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| l.text("扩展路径不可用", "Extension path unavailable").into());
            let copied = self.copy_feedback.contains_key("browser-extension");
            page = page.child(div().mt(px(24.)).p(px(12.)).rounded(px(8.)).bg(p.badge.opacity(0.55)).flex().flex_wrap().items_center().gap(px(8.))
                .child(div().flex_1().min_w(px(0.)).text_size(px(12.)).font(tokens::ui_font()).child(break_long(&path)))
                .child(self.button("browser-copy-path", if copied { l.text("已复制", "Copied") } else { l.text("复制路径", "Copy path") }, self.browser_ui.path.is_some(), ButtonStyle::Standard, cx, |this, window, cx| {
                    if let Some(path) = &this.browser_ui.path {
                        let result = if this.projection.preview { Ok(()) } else { crate::tray::copy_text(hwnd(window), &path.to_string_lossy()) };
                        if result.is_ok() { this.browser_ui.setup_error = None; this.reset_copy_feedback_later("browser-extension", cx); }
                        else { this.browser_ui.setup_error = Some("E_COPY".into()); }
                        cx.notify();
                    }
                })));
            if self.browser_ui.setup_error.as_deref() == Some("E_COPY") {
                page = page.child(div().mt(px(8.)).child(inline_notice(p, l.text("无法复制路径，请重试。", "Cannot copy the path. Try again."), true)));
            }
            page = page.child(self.browser_demo(cx));
        }
        page.into_any_element()
    }

    fn browser_demo(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.projection.night);
        let l = self.projection.language;
        let reduced = self.projection.reduced && !self.browser_ui.manual_motion;
        let at = if reduced { 0.8 } else { (self.browser_ui.elapsed.as_secs_f32() % 9.) / 9. };
        let reset = if at >= 0.945 { (1. - ((at - 0.945) / 0.02)).clamp(0., 1.) } else { 1. };
        let toggle = ((at - 0.155) / 0.017).clamp(0., 1.) * reset;
        let pasted = at >= 0.535 && at < 0.965;
        let selected = at >= 0.72 && at < 0.965;
        let mock_path = self.browser_ui.path.as_ref().map(|path| path.to_string_lossy().into_owned()).unwrap_or_default();
        let anchors = &self.browser_ui.anchors;

        let developer = div().flex().items_center().gap(px(6.)).child(pin("1", p))
            .child(l.text("开发者模式", "Developer mode"))
            .child(demo_anchor(anchors.clone(), 0, div().relative().w(px(28.)).h(px(16.)).rounded_full()
                .bg(if toggle > 0.5 { p.blue } else { p.neutral })
                .child(div().absolute().top(px(2.)).left(px(2. + 12. * toggle)).size(px(12.)).rounded_full().bg(p.surface)).into_any_element()));
        let top = div().flex().flex_wrap().items_center().justify_between().gap(px(8.))
            .child(div().font_weight(FontWeight::MEDIUM).child(l.text("扩展", "Extensions"))).child(developer);
        let load = div().flex().items_center().gap(px(8.)).opacity(0.35 + 0.65 * toggle)
            .child(pin("2", p)).child(demo_anchor(anchors.clone(), 1,
                div().px(px(8.)).py(px(4.)).rounded(px(6.)).border_1().border_color(p.border)
                    .bg(if (0.337..0.362).contains(&at) { p.badge } else { p.surface })
                    .child(l.text("加载已解压的扩展", "Load unpacked")).into_any_element()));
        let browser = div().w_full().rounded(px(8.)).border_1().border_color(p.border).bg(p.surface).overflow_hidden()
            .child(div().px(px(12.)).py(px(8.)).border_b_1().border_color(p.border).text_color(p.neutral)
                .child(if self.browser_ui.chrome { "chrome://extensions" } else { "edge://extensions" }))
            .child(div().p(px(12.)).flex().flex_col().gap(px(12.)).child(top).child(load));
        let address = div().flex().items_center().gap(px(8.)).child(pin("3", p))
            .child(demo_anchor(anchors.clone(), 2, div().flex_1().min_w(px(0.)).px(px(8.)).py(px(5.))
                .rounded(px(5.)).border_1().border_color(if pasted && !selected { p.blue } else { p.border }).text_color(p.neutral)
                .child(div().truncate().child(if pasted { mock_path } else { l.text("粘贴扩展路径", "Paste extension path").to_owned() })).into_any_element()));
        let choose = div().flex().items_center().justify_end().gap(px(8.)).child(pin("4", p))
            .child(demo_anchor(anchors.clone(), 3, div().px(px(8.)).py(px(4.)).rounded(px(5.))
                .border_1().border_color(if selected { p.blue } else { p.border }).flex().items_center().gap(px(4.))
                .child(l.text("选择文件夹", "Select folder"))
                .when(selected, |s| s.child(svg().path("icons/check.svg").size(px(14.)).text_color(p.primary_text()))).into_any_element()));
        let folder = div().mt(px(16.)).p(px(8.)).rounded(px(8.)).border_1().border_color(p.border).bg(p.surface)
            .flex().flex_col().gap(px(8.)).child(address).child(choose);
        let visible = self.browser_ui.visible.clone();
        let origin = self.browser_ui.origin.clone();
        let scroll = self.scroll.clone();
        let measured = div().on_children_prepainted(move |children, window, _| {
            if let Some(bounds) = children.into_iter().reduce(|a, b| a.union(&b)) {
                let viewport = scroll.bounds();
                let shown = bounds.bottom() > viewport.top() && bounds.top() < viewport.bottom();
                let changed = record_demo_measurement(&visible, &origin, shown, bounds.origin);
                if changed && shown { window.request_animation_frame(); }
            }
        }).child(div().flex().flex_col().child(browser).child(folder));
        let mut stage = div().relative().w_full().child(measured);
        if !reduced {
            if let (Some(origin), Some(points)) = (self.browser_ui.origin.get(), demo_points(&self.browser_ui.anchors.borrow(), at)) {
                let x = points.x - origin.x; let y = points.y - origin.y;
                let pulse = [0.155_f32, 0.34, 0.515, 0.70].into_iter().map(|click| (1. - ((at - click) / 0.025).abs()).clamp(0., 1.)).fold(0_f32, f32::max);
                stage = stage.child(div().absolute().left(x - px(8.)).top(y - px(8.)).size(px(18. + pulse * 10.))
                    .rounded_full().border_2().border_color(p.blue.opacity(pulse * 0.8)))
                    .child(demo_cursor(p).absolute().left(x).top(y));
            }
        }
        let header = div().flex().flex_wrap().items_center().gap(px(8.))
            .child(div().flex_1().min_w(px(80.)).font_weight(FontWeight::MEDIUM).child(l.text("操作演示", "Demo")))
            .child(self.button("browser-demo-edge", "Edge", true, if self.browser_ui.chrome { ButtonStyle::Quiet } else { ButtonStyle::Standard }, cx, |this, _, cx| { this.browser_ui.chrome = false; cx.notify(); }))
            .child(self.button("browser-demo-chrome", "Chrome", true, if self.browser_ui.chrome { ButtonStyle::Standard } else { ButtonStyle::Quiet }, cx, |this, _, cx| { this.browser_ui.chrome = true; cx.notify(); }))
            .child(self.button("browser-demo-play", if self.browser_ui.paused || reduced { l.text("播放", "Play") } else { l.text("暂停", "Pause") }, true, ButtonStyle::Quiet, cx, |this, _, cx| {
                if this.projection.reduced && !this.browser_ui.manual_motion { this.browser_ui.manual_motion = true; this.browser_ui.paused = false; }
                else { this.browser_ui.paused = !this.browser_ui.paused; }
                this.browser_ui.tick = None; cx.notify();
            }));
        div().mt(px(24.)).p(px(12.)).rounded(px(8.)).bg(p.badge).child(header).child(div().mt(px(12.)).child(stage)).into_any_element()
    }

    pub(super) fn browser_demo_tick(&mut self, window: &mut Window) {
        let run = self.page == Page::Download && self.browser_ui.guide == 2 && !self.browser_ui.paused && (!self.projection.reduced || self.browser_ui.manual_motion) && self.browser_ui.visible.get() && window.is_window_active();
        let now = Instant::now();
        if run {
            if let Some(previous) = self.browser_ui.tick { self.browser_ui.elapsed += now.saturating_duration_since(previous); }
            self.browser_ui.tick = Some(now);
            window.request_animation_frame();
        } else { self.browser_ui.tick = None; }
    }
}

fn pin(number: &'static str, p: Palette) -> Div {
    div().size(px(20.)).flex_none().rounded_full().bg(p.primary_text()).text_color(p.surface)
        .flex().items_center().justify_center().text_size(px(12.)).child(number)
}
fn record_demo_measurement(visible: &Cell<bool>, origin: &Cell<Option<Point<Pixels>>>, shown: bool, point: Point<Pixels>) -> bool {
    let visibility_changed = visible.replace(shown) != shown;
    let origin_changed = origin.replace(Some(point)) != Some(point);
    visibility_changed || origin_changed
}
fn demo_cursor(p: Palette) -> impl IntoElement + Styled {
    canvas(|_, _, _| (), move |bounds, _, window, _| {
        // The accepted cursor's SVG path, drawn in two colors; GPUI SVGs are monochrome masks.
        let points = [(1.5, 1.5), (1.5, 22.5), (7.3, 17.4), (11.8, 26.4),
            (16.1, 24.3), (11.6, 15.4), (19.6, 14.0), (1.5, 1.5)];
        let mut fill_path = PathBuilder::fill();
        let mut border = PathBuilder::stroke(px(1.5));
        for (index, (x, y)) in points.into_iter().enumerate() {
            let point = bounds.origin + point(px(x), px(y));
            if index == 0 { fill_path.move_to(point); border.move_to(point); }
            else { fill_path.line_to(point); border.line_to(point); }
        }
        if let Ok(path) = fill_path.build() { window.paint_path(path, p.surface); }
        if let Ok(path) = border.build() { window.paint_path(path, p.primary_text()); }
    }).w(px(24.)).h(px(28.))
}
fn authorized_count(count: usize, l: Language) -> String {
    format!("{} {}", count, l.text("个已授权站点", if count == 1 { "authorized site" } else { "authorized sites" }))
}
fn break_long(text: &str) -> String {
    let mut result = String::new();
    for (i, c) in text.chars().enumerate() {
        if i > 0 && i % 24 == 0 { result.push('\u{200b}'); }
        result.push(c);
    }
    result
}

fn demo_anchor(anchors: Rc<RefCell<[Option<Bounds<Pixels>>; 4]>>, index: usize, child: AnyElement) -> Div {
    div().when(index == 2, |s| s.flex_1().min_w(px(0.))).on_children_prepainted(move |children, window, _| {
        if let Some(bounds) = children.into_iter().reduce(|a, b| a.union(&b)) {
            let mut anchors = anchors.borrow_mut();
            if anchors[index] != Some(bounds) { anchors[index] = Some(bounds); window.request_animation_frame(); }
        }
    }).child(child)
}
fn demo_points(anchors: &[Option<Bounds<Pixels>>; 4], t: f32) -> Option<Point<Pixels>> {
    let target = |i: usize| anchors[i].map(|b| b.origin + point(b.size.width * 0.5, b.size.height * 0.5));
    let targets = [target(0)?, target(1)?, target(2)?, target(3)?];
    let stops = [(0., targets[0]), (0.155, targets[0]), (0.34, targets[1]),
        (0.515, targets[2]), (0.70, targets[3]), (0.94, targets[3]), (1., targets[0])];
    for pair in stops.windows(2) {
        let (a, from) = pair[0]; let (b, to) = pair[1];
        if t <= b {
            let q = ((t - a) / (b - a)).clamp(0., 1.); let q = 1. - (1. - q).powi(3);
            return Some(from + (to - from) * q);
        }
    }
    Some(targets[0])
}

#[cfg(test)]
mod tests {
    use super::*;
    #[::core::prelude::v1::test]
    fn pointer_follows_four_distinct_steps_and_loops() {
        let anchors = [0., 20., 40., 60.].map(|y| Some(Bounds::new(point(px(0.), px(y)), size(px(10.), px(10.)))));
        for (time, y) in [(0.155, 5.), (0.34, 25.), (0.515, 45.), (0.70, 65.)] {
            assert_eq!(demo_points(&anchors, time), Some(point(px(5.), px(y))));
        }
        assert_eq!(demo_points(&anchors, 1.), demo_points(&anchors, 0.));
    }
    #[::core::prelude::v1::test]
    fn first_visible_measurement_records_origin_without_short_circuiting() {
        let visible = Cell::new(false);
        let origin = Cell::new(None);
        let position = point(px(100.), px(200.));
        assert!(record_demo_measurement(&visible, &origin, true, position));
        assert!(visible.get());
        assert_eq!(origin.get(), Some(position));
        assert!(!record_demo_measurement(&visible, &origin, true, position));
        let moved = point(px(100.), px(120.));
        assert!(record_demo_measurement(&visible, &origin, true, moved));
        assert_eq!(origin.get(), Some(moved));
    }
    #[::core::prelude::v1::test]
    fn failed_and_empty_snapshots_are_distinct() {
        let mut site = SiteView { site: "example.com".into(), source_id: "源".into(), source_name: "Unknown".into(), grant_id: "x".into(), synced_at: 1, cookie_count: 0, skipped_partitioned: 2, last_result: None };
        assert_eq!(short_status(&site, Language::Chinese), "空会话");
        assert!(!show_latest_on_summary(&site));
        site.last_result = Some(ameow_next::browser_sessions::SyncResult { at: 2, error: None });
        assert!(!show_latest_on_summary(&site));
        site.last_result = Some(ameow_next::browser_sessions::SyncResult { at: 3, error: Some(SyncError::Bridge) });
        assert!(show_latest_on_summary(&site));
        site.last_result = None;
        site.cookie_count = 3;
        assert_eq!(short_status(&site, Language::Chinese), "结果未知");
        site.last_result = Some(ameow_next::browser_sessions::SyncResult { at: 2, error: Some(SyncError::Bridge) });
        assert_eq!(short_status(&site, Language::Chinese), "最近失败");
        assert_eq!(site.synced_at, 1);
        assert_eq!(break_long("源"), "源");
        assert_eq!(authorized_count(1, Language::English), "1 authorized site");
        assert_eq!(authorized_count(0, Language::English), "0 authorized sites");
        assert_eq!(authorized_count(2, Language::English), "2 authorized sites");
    }
}
