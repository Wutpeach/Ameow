use super::*;
use ameow_next::browser_sessions::SiteView;
use gpui_base::ElementExt as _;
#[cfg(test)]
use ameow_next::browser_sessions::SyncError;
use std::time::{Duration, Instant};

pub(super) struct BrowserUi {
    pub guide: u8,
    pub(super) guide_focus_pending: bool,
    selected: Option<String>,
    pub(super) details: bool,
    pub(super) menu_focus_pending: bool,
    badge_focus: RefCell<HashMap<String, Rc<Cell<bool>>>>,
    copy_error: bool,
    setup_requested: bool,
    setup_error: Option<String>,
    path: Option<PathBuf>,
    elapsed: Duration,
    tick: Option<Instant>,
    visible: Rc<Cell<bool>>,
    anchors: Rc<RefCell<[Option<Bounds<Pixels>>; 4]>>,
    origin: Rc<Cell<Option<Point<Pixels>>>>,
}
impl Default for BrowserUi {
    fn default() -> Self {
        Self { guide: 0, guide_focus_pending: false, selected: None, details: false, menu_focus_pending: false, badge_focus: RefCell::new(HashMap::new()), copy_error: false, setup_requested: false,
            setup_error: None, path: None,
            elapsed: Duration::ZERO, tick: None, visible: Rc::new(Cell::new(false)),
            anchors: Rc::new(RefCell::new([None; 4])), origin: Rc::new(Cell::new(None)) }
    }
}
impl BrowserUi {
    pub(super) fn preview_path(&mut self) { self.path = Some(PathBuf::from(r"C:\Apps\Ameow\browser-extension")); }
    pub(super) fn has_selected(&self) -> bool { self.selected.is_some() }
    pub(super) fn clear_menu(&mut self) { self.selected = None; self.details = false; self.menu_focus_pending = false; }
    fn begin_setup(&mut self) { self.path = None; self.setup_error = None; self.copy_error = false; }
    fn finish_setup(&mut self, result: Result<PathBuf, String>) {
        match result {
            Ok(path) => { self.path = Some(path); self.setup_error = None; },
            Err(error) => { self.path = None; self.setup_error = Some(error); },
        }
    }
    fn copy_path(&self) -> Option<&Path> { self.path.as_deref() }
    fn advance_demo_clock(&mut self, now: Instant, run: bool) {
        if run {
            if let Some(previous) = self.tick { self.elapsed += now.saturating_duration_since(previous); }
            self.tick = Some(now);
        } else { self.tick = None; }
    }
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
fn session_diagnostic(site: &SiteView, l: Language) -> String {
    let result = match site.last_result.as_ref() {
        None => l.text("未知", "Unknown"),
        Some(r) if r.error.is_some() => l.text("失败", "Failed"),
        Some(_) => l.text("成功", "Succeeded"),
    };
    let result = match site.last_result.as_ref() {
        Some(r) => format!("{} · {}{}", ameow_next::browser_sessions::utc_timestamp(r.at), result,
            r.error.map(|error| format!(" ({error:?})")).unwrap_or_default()),
        None => result.to_owned(),
    };
    format!("{}: {}\n{}: {}\n{}: {}\n{}: {}\n{}: {}",
        l.text("站点", "Site"), site.site, l.text("来源安装 ID", "Source installation ID"), site.source_id, l.text("上次快照", "Last snapshot"),
        ameow_next::browser_sessions::utc_timestamp(site.synced_at), l.text("最近同步", "Latest sync"), result,
        l.text("可用 / 排除的分区 Cookie", "Available / excluded partitioned cookies"), format!("{} / {}", site.cookie_count, site.skipped_partitioned))
}
fn short_status(site: &SiteView, l: Language) -> &'static str {
    if failed(site) { l.text("已授权；最近同步未完成", "Authorized; latest sync failed") }
    else if site.cookie_count == 0 { l.text("已授权；没有可用会话", "Authorized; no usable session") }
    else if site.last_result.is_none() { l.text("已授权；同步结果未知", "Authorized; sync result unknown") }
    else { l.text("已授权；上次同步成功", "Authorized; last sync succeeded") }
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
    pub(super) fn close_browser_site_menu(&mut self, window: &mut Window, cx: &mut Context<Self>) -> bool {
        let Some(id) = self.browser_ui.selected.take() else { return false; };
        self.browser_ui.clear_menu();
        if self.page == Page::Download && self.browser_ui.guide == 0 {
            if let Some(focus) = self.control_focus.borrow().get(&format!("browser-site:{id}")) { window.focus(focus, cx); }
            else { window.focus(&self.focus, cx); }
        } else { window.focus(&self.focus, cx); }
        cx.notify(); true
    }
    pub(super) fn browser_setup_observe(&mut self, next: &Projection) {
        if self.browser_ui.guide != 1 || !self.browser_ui.setup_requested || next.bridge_config_pending { return; }
        if let Some(result) = &next.bridge_config_result {
            self.browser_ui.setup_requested = false;
            let path = match result {
                Ok(()) => ameow_next::browser_sessions::native::extension_directory(),
                Err(error) => Err(error.clone()),
            };
            self.browser_ui.finish_setup(path);
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
        let mut body = div().mt(px(24.)).border_t_1().border_color(p.border).pt(px(20.))
            .child(div().flex().flex_wrap().items_center().justify_between().gap(px(12.))
                .child(div().text_size(px(15.)).font_weight(FontWeight::MEDIUM).child(l.text("浏览器会话", "Browser sessions")))
                .child(self.button("browser-connect", l.text("配置扩展", "Set up extension"), true, ButtonStyle::Standard, cx, |this, _, cx| {
                    this.browser_ui.guide = 1; this.browser_ui.guide_focus_pending = true;
                    this.browser_ui.selected = None; this.browser_ui.details = false;
                    this.browser_ui.elapsed = Duration::ZERO; this.browser_ui.tick = None; this.browser_ui.copy_error = false;
                    this.scroll.set_offset(point(px(0.), px(0.))); this.start_browser_setup(cx);
                })));
        if status.error.is_some() {
            body = body.child(div().mt(px(12.)).child(inline_notice(p, l.text("会话暂不可用，请重试。", "Sessions are unavailable. Try again."), true)));
        } else if status.notice.as_ref().is_some_and(|s| s != "installed") {
            body = body.child(div().mt(px(12.)).child(inline_notice(p, l.text("操作未完成，请重试。", "The operation did not finish. Try again."), true)));
        }
        let mut badges = div().mt(px(16.)).flex().flex_wrap().gap(px(12.));
        for site in &status.sites {
            let (name, icon) = brand(&site.site); let name = name.to_owned();
            let id = site.grant_id.clone(); let key = format!("browser-site:{id}");
            let (container, focus) = self.control_container(&key, true, cx);
            let is_open = self.browser_ui.selected.as_deref() == Some(id.as_str());
            let focused = self.browser_ui.badge_focus.borrow_mut().entry(id.clone()).or_insert_with(|| Rc::new(Cell::new(false))).clone();
            let keyboard_hint = focused.get() && self.keyboard_focus && !is_open;
            let state = short_status(site, l); let tip = format!("{} · {}", site.site, state);
            let tooltip = tip.clone(); let icon_size = brand_size(&site.site);
            let error = failed(site); let badge_color = if error { p.red } else if site.cookie_count == 0 || site.last_result.is_none() { p.neutral } else { p.green };
            let state_icon = if error { "icons/circle-alert.svg" } else if site.cookie_count == 0 || site.last_result.is_none() { "icons/info.svg" } else { "icons/check.svg" };
            let focus_for_paint = focus.clone(); let focused_for_paint = focused.clone();
            let control = gpui_base::Button::new(SharedString::from(key)).track_focus(&focus).disabled(self.passive.get())
                .accessibility_label(tip.clone()).w(px(100.)).min_h(px(90.)).flex().flex_col().items_center().gap(px(4.))
                .border_1().border_color(transparent_black()).rounded(px(8.)).overflow_hidden()
                .when(is_open, |s| s.bg(p.badge.opacity(0.4)))
                .when(self.keyboard_focus, |s| s.focus(move |s| s.rounded(px(8.)).border_color(p.blue).bg(p.badge.opacity(0.4))))
                .on_prepaint(move |_, window, _| {
                    let next = focus_for_paint.is_focused(window);
                    if focused_for_paint.replace(next) != next { window.request_animation_frame(); }
                })
                .tooltip_above(&self.tooltips, move |_, cx| cx.new(|_| HelpTooltip { text: tooltip.clone(), night: p.night }).into())
                .cursor_pointer().hover(move |s| s.rounded(px(8.)).bg(p.badge.opacity(0.4)))
                .active(move |s| s.rounded(px(8.)).bg(p.border))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.browser_ui.selected = if this.browser_ui.selected.as_deref() == Some(id.as_str()) { None } else { Some(id.clone()) };
                    this.browser_ui.menu_focus_pending = this.browser_ui.selected.is_some() && this.keyboard_focus;
                    this.browser_ui.details = false; this.browser_ui.copy_error = false; cx.notify();
                }))
                .child(div().relative().size(px(60.)).rounded_full().border_2().border_color(if is_open { p.blue } else { transparent_black() }).p(px(2.))
                    .child(div().size_full().rounded_full().bg(p.badge).flex().items_center().justify_center()
                        .child(svg().path(icon).size(px(icon_size)).text_color(p.primary_text())))
                    .child(div().absolute().right_0().bottom_0().size(px(20.)).rounded_full().border_2().border_color(p.surface).bg(badge_color)
                        .flex().items_center().justify_center().child(svg().path(state_icon).size(px(12.)).text_color(p.surface))))
                .child(div().w_full().text_center().text_size(px(13.)).truncate().child(name));
            let mut item = container.relative().flex_none().child(control);
            if keyboard_hint {
                item = item.child(div().absolute().left_0().bottom(px(84.)).child(deferred(anchored().anchor(gpui::Anchor::BottomLeft)
                    .snap_to_window_with_margin(Edges::all(px(12.))).child(div().max_w(px(260.)).p(px(8.)).rounded(px(6.))
                        .bg(p.surface).border_1().border_color(p.control_border()).text_size(px(12.)).child(break_long(&tip))))));
            }
            if is_open && !self.passive.get() { item = item.child(self.browser_site_menu(site, cx)); }
            badges = badges.child(item);
        }
        body.child(badges).into_any_element()
    }

    fn browser_site_menu(&self, site: &SiteView, cx: &mut Context<Self>) -> Div {
        let p = Palette::new(self.projection.night); let l = self.projection.language;
        let domain = site.site.clone(); let grant = site.grant_id.clone();
        let report = session_diagnostic(site, l); let copy_report = report.clone();
        let mut panel = div().w(px(280.)).max_w_full().p(px(8.)).rounded(px(8.)).bg(p.surface)
            .border_1().border_color(p.control_border()).occlude().flex().flex_col().gap(px(4.))
            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .on_mouse_down_out(cx.listener(|this, _, window, cx| {
                let menu_has_focus = ["browser-site-remove", "browser-site-diagnostics", "browser-copy-diagnostic"].iter()
                    .any(|id| this.control_focus.borrow().get(*id).is_some_and(|focus| focus.is_focused(window)));
                this.browser_ui.clear_menu();
                if menu_has_focus { window.focus(&this.focus, cx); }
                cx.notify();
            }))
            .child(self.button("browser-site-remove", l.text("移除", "Remove"), true, ButtonStyle::Menu, cx, move |this, window, cx| {
                if this.projection.preview {
                    if let Some(snapshot) = this.projection.queue.as_mut() { std::sync::Arc::make_mut(snapshot).browser_sessions.sites.retain(|s| s.grant_id != grant); }
                } else { this.session_command(ameow_next::download::queue::QueueCommand::RemoveBrowserSession { site: domain.clone(), grant_id: grant.clone() }, cx); }
                this.browser_ui.selected = None; this.browser_ui.details = false; window.focus(&this.focus, cx); cx.notify();
            }))
            .child(self.button("browser-site-diagnostics", l.text("诊断", "Diagnostics"), true, ButtonStyle::Menu, cx, |this, _, cx| { this.browser_ui.details = !this.browser_ui.details; cx.notify(); }));
        if self.browser_ui.details {
            let copied = self.copy_feedback.contains_key("browser-diagnostic");
            panel = panel.child(div().p(px(8.)).rounded(px(6.)).bg(p.badge.opacity(0.55)).text_size(px(12.)).child(break_long(&report)))
                .child(self.button("browser-copy-diagnostic", if copied { l.text("已复制", "Copied") } else { l.text("复制诊断报告", "Copy diagnostic report") }, true, ButtonStyle::Standard, cx, move |this, window, cx| {
                    let result = if this.projection.preview { Ok(()) } else { crate::tray::copy_text(hwnd(window), &copy_report) };
                    this.browser_ui.copy_error = result.is_err();
                    if result.is_ok() { this.reset_copy_feedback_later("browser-diagnostic", cx); } cx.notify();
                }));
            if self.browser_ui.copy_error { panel = panel.child(inline_notice(p, l.text("复制失败，请重试。", "Copy failed. Try again."), true)); }
        }
        div().absolute().left_0().top(px(88.)).child(deferred(anchored().anchor(gpui::Anchor::TopLeft)
            .snap_to_window_with_margin(Edges::all(px(12.))).child(panel)))
    }

    fn start_browser_setup(&mut self, cx: &mut Context<Self>) {
        self.browser_ui.begin_setup();
        self.copy_feedback.remove("browser-extension");
        if self.projection.preview { self.browser_ui.preview_path(); self.browser_ui.setup_requested = false; cx.notify(); return; }
        let accepted = self.main.update(cx, |main, cx| {
            let now = main.now();
            let accepted = main.downloads.as_mut().is_some_and(|ui| ui.send(ameow_next::download::queue::QueueCommand::InstallBrowserBridge, now));
            cx.notify(); accepted
        }).unwrap_or(false);
        self.browser_ui.setup_requested = accepted;
        if !accepted { self.browser_ui.setup_error = Some("E_REQUEST".into()); }
        cx.notify();
    }

    pub(super) fn browser_guide(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.projection.night); let l = self.projection.language;
        let mut page = div().w_full().flex().flex_col()
            .child(div().flex().items_center().gap(px(8.))
                .child(self.icon_button("browser-guide-back", "icons/chevron-left.svg", l.text("返回", "Back"), true, cx, |this, window, cx| this.close_browser_guide(window, cx)))
                .child(div().flex_1().min_w(px(0.)).text_size(px(15.)).font_weight(FontWeight::MEDIUM).child(l.text("配置扩展", "Set up extension")))
                .child(self.icon_button("browser-guide-close", "icons/x.svg", l.text("关闭引导", "Close guide"), true, cx, |this, window, cx| this.close_browser_guide(window, cx))));
        if self.browser_ui.setup_requested || self.projection.bridge_config_pending {
            page = page.child(div().mt(px(12.)).text_color(p.neutral).child(l.text("正在配置…", "Setting up…")));
        }
        if let Some(error) = self.browser_ui.setup_error.as_deref().filter(|e| *e != "E_COPY") {
            page = page.child(div().mt(px(12.)).child(inline_notice(p, setup_error(error, l), true)))
                .child(self.button("browser-setup-retry", l.text("重试", "Retry"), !self.projection.bridge_config_pending, ButtonStyle::Standard, cx, |this, window, cx| {
                    if let Some(focus) = this.control_focus.borrow().get("browser-guide-back") { window.focus(focus, cx); } this.start_browser_setup(cx);
                }));
        }
        let path = self.browser_ui.path.as_ref().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| l.text("扩展路径不可用", "Extension path unavailable").into());
        let copied = self.copy_feedback.contains_key("browser-extension");
        page = page.child(div().mt(px(24.)).p(px(12.)).rounded(px(8.)).bg(p.badge.opacity(0.55)).flex().flex_wrap().items_center().gap(px(8.))
            .child(div().flex_1().min_w(px(0.)).text_size(px(12.)).font(tokens::ui_font()).child(break_long(&path)))
            .child(self.button("browser-copy-path", if copied { l.text("已复制", "Copied") } else { l.text("复制路径", "Copy path") }, self.browser_ui.copy_path().is_some(), ButtonStyle::Standard, cx, |this, window, cx| {
                if let Some(path) = this.browser_ui.copy_path() {
                    let result = if this.projection.preview { Ok(()) } else { crate::tray::copy_text(hwnd(window), &path.to_string_lossy()) };
                    if result.is_ok() { this.browser_ui.copy_error = false; this.reset_copy_feedback_later("browser-extension", cx); }
                    else { this.browser_ui.copy_error = true; } cx.notify();
                }
            })));
        if self.browser_ui.copy_error { page = page.child(div().mt(px(8.)).child(inline_notice(p, l.text("无法复制路径，请重试。", "Cannot copy the path. Try again."), true))); }
        page.child(self.browser_demo(cx)).into_any_element()
    }

    fn browser_demo(&self, _cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.projection.night);
        let l = self.projection.language;
        let reduced = self.projection.reduced;
        let at = if reduced { 0.80 } else { (self.browser_ui.elapsed.as_secs_f32() % 5.) / 5. };
        let reset = if at >= 0.93 { (1. - ((at - 0.93) / 0.03)).clamp(0., 1.) } else { 1. };
        let toggle = ((at - 0.12) / 0.025).clamp(0., 1.) * reset;
        let pasted = at >= 0.535 && at < 0.96;
        let selected = at >= 0.75 && at < 0.96;
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
                    .bg(if (0.307..0.335).contains(&at) { p.badge } else { p.surface })
                    .child(l.text("加载已解压的扩展", "Load unpacked")).into_any_element()));
        let browser = div().w_full().rounded(px(8.)).border_1().border_color(p.border).bg(p.surface).overflow_hidden()
            .child(div().px(px(12.)).py(px(8.)).border_b_1().border_color(p.border).text_color(p.neutral)
                .child(l.text("浏览器扩展", "Browser extensions")))
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
                let pulse = [0.12_f32, 0.31, 0.515, 0.73].into_iter().map(|click| (1. - ((at - click) / 0.025).abs()).clamp(0., 1.)).fold(0_f32, f32::max);
                stage = stage.child(div().absolute().left(x - px(8.)).top(y - px(8.)).size(px(18. + pulse * 10.))
                    .rounded_full().border_2().border_color(p.blue.opacity(pulse * 0.8)))
                    .child(demo_cursor(p).absolute().left(x).top(y));
            }
        }
        let header = div().font_weight(FontWeight::MEDIUM).child(l.text("操作演示", "Demo"));
        div().mt(px(24.)).p(px(12.)).rounded(px(8.)).bg(p.badge).child(header).child(div().mt(px(12.)).child(stage)).into_any_element()
    }

    pub(super) fn browser_demo_tick(&mut self, window: &mut Window) {
        let run = demo_should_run(self.page == Page::Download && self.browser_ui.guide > 0, self.projection.reduced, self.browser_ui.visible.get(), window.is_visible());
        self.browser_ui.advance_demo_clock(Instant::now(), run);
        if run { window.request_animation_frame(); }
    }
    pub(super) fn browser_demo_visibility(&mut self, visible: bool) {
        if !visible { self.browser_ui.advance_demo_clock(Instant::now(), false); }
    }
}
fn demo_should_run(guide: bool, reduced: bool, on_screen: bool, window_visible: bool) -> bool {
    guide && !reduced && on_screen && window_visible
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
    let start = targets[0] - point(px(18.), px(10.));
    let stops = [(0., start), (0.12, targets[0]), (0.31, targets[1]),
        (0.515, targets[2]), (0.73, targets[3]), (0.90, targets[3]), (1., start)];
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
    fn copy_path_requires_successful_current_setup() {
        let mut ui = BrowserUi::default();
        ui.preview_path();
        assert!(ui.copy_path().is_some());
        ui.begin_setup();
        assert!(ui.copy_path().is_none()); // Pending, including a retry after earlier success.
        ui.finish_setup(Err("E_SESSION_REGISTRATION".into()));
        assert!(ui.copy_path().is_none());
        ui.begin_setup();
        ui.finish_setup(Err("E_SESSION_HOST_MISSING".into()));
        assert!(ui.copy_path().is_none());
        ui.begin_setup();
        ui.finish_setup(Ok(PathBuf::from("extension")));
        assert_eq!(ui.copy_path(), Some(Path::new("extension")));
    }
    #[::core::prelude::v1::test]
    fn dismissing_menu_clears_pending_focus_and_diagnostic() {
        let mut ui = BrowserUi::default();
        ui.selected = Some("grant".into()); ui.details = true; ui.menu_focus_pending = true;
        ui.clear_menu();
        assert!(!ui.has_selected());
        assert!(!ui.details && !ui.menu_focus_pending);
    }
    #[::core::prelude::v1::test]
    fn pointer_follows_four_distinct_steps_and_loops() {
        let anchors = [0., 20., 40., 60.].map(|y| Some(Bounds::new(point(px(0.), px(y)), size(px(10.), px(10.)))));
        for (time, y) in [(0.12, 5.), (0.31, 25.), (0.515, 45.), (0.73, 65.)] {
            assert_eq!(demo_points(&anchors, time), Some(point(px(5.), px(y))));
        }
        assert_eq!(demo_points(&anchors, 1.), demo_points(&anchors, 0.));
        assert_ne!(demo_points(&anchors, 0.), demo_points(&anchors, 0.12));
    }
    #[::core::prelude::v1::test]
    fn demo_clock_pauses_without_counting_hidden_time() {
        let mut ui = BrowserUi::default();
        let start = Instant::now();
        ui.advance_demo_clock(start, demo_should_run(true, false, true, true));
        ui.advance_demo_clock(start + Duration::from_secs(1), demo_should_run(true, false, true, true));
        assert_eq!(ui.elapsed, Duration::from_secs(1));
        ui.advance_demo_clock(start + Duration::from_secs(2), demo_should_run(true, false, true, false));
        assert!(ui.tick.is_none());
        ui.advance_demo_clock(start + Duration::from_secs(102), demo_should_run(true, false, true, true));
        assert_eq!(ui.elapsed, Duration::from_secs(1));
        ui.advance_demo_clock(start + Duration::from_secs(103), demo_should_run(true, false, true, true));
        assert_eq!(ui.elapsed, Duration::from_secs(2));
        ui.advance_demo_clock(start + Duration::from_secs(104), demo_should_run(true, true, true, true));
        assert!(ui.tick.is_none());
        ui.advance_demo_clock(start + Duration::from_secs(105), demo_should_run(true, false, true, true));
        ui.advance_demo_clock(start + Duration::from_secs(106), demo_should_run(true, false, false, true));
        assert!(ui.tick.is_none());
        assert_eq!(ui.elapsed, Duration::from_secs(2));
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
        assert_eq!(short_status(&site, Language::Chinese), "已授权；没有可用会话");
        site.last_result = Some(ameow_next::browser_sessions::SyncResult { at: 2, error: None });
        assert_eq!(short_status(&site, Language::Chinese), "已授权；没有可用会话");
        site.last_result = Some(ameow_next::browser_sessions::SyncResult { at: 3, error: Some(SyncError::Bridge) });
        assert_eq!(short_status(&site, Language::Chinese), "已授权；最近同步未完成");
        site.last_result = None;
        site.cookie_count = 3;
        assert_eq!(short_status(&site, Language::Chinese), "已授权；同步结果未知");
        site.last_result = Some(ameow_next::browser_sessions::SyncResult { at: 2, error: Some(SyncError::Bridge) });
        assert_eq!(short_status(&site, Language::Chinese), "已授权；最近同步未完成");
        assert_eq!(site.synced_at, 1);
        assert_eq!(break_long("源"), "源");
        let report = session_diagnostic(&site, Language::English);
        assert!(report.contains("example.com"));
        assert!(report.contains("Failed"));
        assert!(report.contains("Bridge"));
        assert!(report.contains(&ameow_next::browser_sessions::utc_timestamp(2)));
        assert!(report.contains(&site.source_id));
        assert!(!report.contains(&site.source_name));
    }
}
