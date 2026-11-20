//! Components page consumes Coordinator snapshots; it never opens or owns runtime files.
use super::*;
use ameow_next::download::{
    preparation::{ErrorCategory, PreparationPhase},
    queue::QueueSnapshot,
    upstream::UpstreamError,
    runtime_update::{RuntimeSelectionPolicy, RuntimeUpdatePhase},
};

fn runtime_status(snapshot: Option<&QueueSnapshot>, l: Language) -> (&'static str, bool) {
    let Some(s) = snapshot else {
        return (
            l.text("正在读取组件状态…", "Reading component status…"),
            false,
        );
    };
    if s.preparation_owner_lost {
        return (
            l.text(
                "无法确认组件清理状态，暂时无法重试。",
                "Component cleanup could not be confirmed. Retry is unavailable.",
            ),
            true,
        );
    }
    if s.preparation_held {
        return (
            l.text(
                "正在清理组件，请稍候再重试。",
                "Components are being cleaned up. Wait before retrying.",
            ),
            true,
        );
    }
    if s.stopping || s.stopped {
        return (
            l.text("组件服务正在停止。", "Component service stopping."),
            false,
        );
    }
    match s.preparation.phase {
        PreparationPhase::Idle => (l.text("组件尚未准备。", "Components not prepared."), false),
        PreparationPhase::Preparing | PreparationPhase::Downloading => {
            (l.text("正在准备组件…", "Preparing components…"), false)
        }
        PreparationPhase::Verifying => (l.text("正在验证组件…", "Verifying components…"), false),
        PreparationPhase::Ready => (
            l.text(
                "部分组件版本不可用。",
                "Some component versions are unavailable.",
            ),
            false,
        ),
        PreparationPhase::Failed => (l.text("组件准备失败。", "Component setup failed."), true),
    }
}
fn failure_text(category: ErrorCategory, l: Language) -> &'static str {
    match category {
        ErrorCategory::Timeout => l.text("连接超时，请检查网络。", "Timed out. Check the network."),
        ErrorCategory::Connect => l.text(
            "无法连接，请检查网络。",
            "Cannot connect. Check the network.",
        ),
        ErrorCategory::ProxyRouting => l.text(
            "无法使用代理，请检查代理设置。",
            "Cannot use the proxy. Check proxy settings.",
        ),
        ErrorCategory::Http => l.text("无法获取组件，请稍后重试。", "Cannot fetch components. Try again later."),
        ErrorCategory::Size | ErrorCategory::Hash | ErrorCategory::Probe => {
            l.text("组件验证失败。", "Component verification failed.")
        }
        ErrorCategory::Extract => l.text("组件解压失败。", "Component extraction failed."),
        ErrorCategory::Permission => l.text(
            "无法访问组件，请检查权限。",
            "Cannot access components. Check permissions.",
        ),
        ErrorCategory::Storage => l.text(
            "存储失败，请检查空间和权限。",
            "Storage failed. Check space and permissions.",
        ),
        ErrorCategory::Cancelled => l.text("准备已停止。", "Setup stopped."),
        ErrorCategory::Unknown => l.text("请复制诊断以排查。", "Copy diagnostics to investigate."),
    }
}
fn upstream_error(error: &UpstreamError, l: Language) -> String {
    l.text(match error {
        UpstreamError::Route => "无法使用系统代理，请检查代理设置后重试。",
        UpstreamError::Timeout => "检查更新超时，请稍后重试。",
        UpstreamError::Connect | UpstreamError::Network => "无法检查更新，请检查网络或代理后重试。",
        UpstreamError::Http(403 | 429) => "更新服务暂时拒绝请求，请稍后重试。",
        UpstreamError::Http(_) => "更新服务暂时不可用，请稍后重试。",
        UpstreamError::InvalidResponse | UpstreamError::TooLarge => "无法确认最新版本，请稍后重试。",
    }, match error {
        UpstreamError::Route => "Cannot use the system proxy. Check proxy settings and try again.",
        UpstreamError::Timeout => "The update check timed out. Try again later.",
        UpstreamError::Connect | UpstreamError::Network => "Cannot check for updates. Check the network or proxy and try again.",
        UpstreamError::Http(403 | 429) => "The update service refused or rate-limited the request. Try again later.",
        UpstreamError::Http(_) => "The update service is unavailable. Try again later.",
        UpstreamError::InvalidResponse | UpstreamError::TooLarge => "Cannot confirm the latest version. Try again later.",
    }).into()
}
fn action_notice(message: &str, l: Language) -> String {
    let (zh, en) = match message {
        "正在请求重新准备组件" => {
            ("正在请求重新准备组件", "Requesting component setup again…")
        }
        "已请求重新准备组件" => ("已请求重新准备组件", "Component setup was requested."),
        "组件状态已变化，请重新查看" => (
            "组件状态已变化，请重新查看",
            "The component state changed. Review the current state.",
        ),
        "正在复制组件诊断" => ("正在复制组件诊断", "Copying component diagnostic…"),
        "已复制组件诊断" => ("已复制组件诊断", "Component diagnostic copied."),
        "无法复制组件诊断，请重试" => (
            "无法复制组件诊断，请重试",
            "Cannot copy the component diagnostic. Try again.",
        ),
        _ => (
            "操作未受理，请稍后重试",
            "The action was not accepted. Try again shortly.",
        ),
    };
    l.text(zh, en).into()
}
fn check_is_visible(pending: bool, feedback: Option<(std::time::Instant, bool)>) -> bool {
    pending
        || feedback.is_some_and(|(at, accepted)| {
            accepted && at.elapsed() < std::time::Duration::from_millis(700)
        })
}
fn check_enabled(
    owner_available: bool,
    checking: bool,
    worker_running: bool,
    cooldown_ms: u64,
) -> bool {
    owner_available && !checking && !worker_running && cooldown_ms == 0
}

fn update_busy(phase: RuntimeUpdatePhase) -> bool {
    matches!(phase, RuntimeUpdatePhase::Preparing | RuntimeUpdatePhase::Downloading | RuntimeUpdatePhase::Verifying | RuntimeUpdatePhase::Waiting)
}

fn upgrade_version(upstream: &ameow_next::download::upstream::UpstreamSnapshot, current: Option<&str>, now: u64) -> Option<String> {
    if upstream.pending || upstream.worker_running || upstream.checked_at_ms.is_none_or(|at| now.saturating_sub(at) > 600_000) { return None; }
    let version = upstream.result.as_ref()?.as_ref().ok()?;
    (ameow_next::download::upstream::compare_stable_versions(version, current?) == Some(std::cmp::Ordering::Greater)).then(|| version.clone())
}

fn update_status(phase: RuntimeUpdatePhase, l: Language) -> &'static str {
    match phase {
        RuntimeUpdatePhase::Idle | RuntimeUpdatePhase::Activated => "",
        RuntimeUpdatePhase::Preparing => l.text("正在准备更新…", "Preparing the update…"),
        RuntimeUpdatePhase::Downloading => l.text("正在下载更新…", "Downloading the update…"),
        RuntimeUpdatePhase::Verifying => l.text("正在验证更新…", "Verifying the update…"),
        RuntimeUpdatePhase::Waiting => l.text("等待当前任务结束后应用更新。", "The update will be applied after current tasks finish."),
        RuntimeUpdatePhase::Failed => l.text("更新未完成，原有效版本和选择仍保留。请重试或复制诊断。", "Update incomplete. The previous version and selection are retained. Retry or copy diagnostics."),
        RuntimeUpdatePhase::RolledBack => l.text("已恢复上次可用的版本。", "Restored the previous working version."),
        RuntimeUpdatePhase::RecoveryRequired => l.text("当前版本无法通过验证，请重试准备组件或恢复推荐版本。", "The current version could not be verified. Retry setup or restore the recommended version."),
    }
}

fn verified_version<'a>(snapshot: Option<&'a QueueSnapshot>, name: &str) -> Option<&'a str> {
    snapshot
        .filter(|s| {
            s.preparation.phase == PreparationPhase::Ready
                && !s.preparing
                && !s.preparation_held
                && !s.preparation_owner_lost
                && !s.stopping
                && !s.stopped
        })
        .and_then(|s| s.verified_runtime_versions.iter().find(|(n, _)| n == name))
        .map(|(_, version)| version.as_str())
}
fn version_preview(version: &str) -> String {
    let chars: Vec<_> = version.chars().collect();
    if chars.len() <= 24 {
        return version.to_owned();
    }
    format!(
        "{}…{}",
        chars[..11].iter().collect::<String>(),
        chars[chars.len() - 12..].iter().collect::<String>()
    )
}
impl SettingsWindow {
    fn select_engine_version(&mut self, selection: Option<String>, cx: &mut Context<Self>) {
        if self.projection.preview { cx.notify(); return; }
        // The version named on the clicked button must still be current and verified.
        if let Some(version) = &selection {
            let upstream = self.projection.upstream_snapshot();
            if upgrade_version(&upstream, verified_version(self.projection.queue.as_deref(), "yt-dlp"), ameow_next::download::progress::now_ms()).as_ref() != Some(version) {
                self.projection.engine_notice = Some(false);
                cx.notify();
                return;
            }
        }
        let _ = self.main.update(cx, |main, cx| {
            let now = main.now();
            if let Some(ui) = &mut main.downloads { ui.request_engine_update(selection, now); }
            cx.notify();
        });
        cx.notify();
    }

    fn engine_update_available(&self) -> bool {
        self.projection.upstream_available && !self.projection.engine_command_pending
            && self.projection.queue.as_deref().is_some_and(|s| !s.stopping && !s.stopped && !update_busy(s.runtime_update.phase))
    }

    pub(super) fn component_menu_action_ids(&self) -> Vec<&'static str> {
        let mut actions = Vec::new();
        if self.can_check_upstream() { actions.push("check-yt-dlp-release"); }
        if self.engine_update_available() && let Some(snapshot) = self.projection.queue.as_deref() {
            if upgrade_version(&self.projection.upstream_snapshot(), verified_version(Some(snapshot), "yt-dlp"), ameow_next::download::progress::now_ms()).is_some() {
                actions.push("upgrade-yt-dlp");
            }
            if snapshot.runtime_update.policy == RuntimeSelectionPolicy::UserSelected || snapshot.runtime_update.phase == RuntimeUpdatePhase::RecoveryRequired {
                actions.push("restore-recommended");
            }
        }
        actions
    }

    fn engine_update_actions(&self, cx: &mut Context<Self>) -> AnyElement {
        let l = self.projection.language;
        let p = Palette::new(self.projection.night);
        let Some(snapshot) = self.projection.queue.as_deref() else { return div().into_any_element(); };
        let update = &snapshot.runtime_update;
        let available = !self.passive.get() && self.engine_update_available();
        let candidate = upgrade_version(&self.projection.upstream_snapshot(), verified_version(Some(snapshot), "yt-dlp"), ameow_next::download::progress::now_ms());
        let restore = update.policy == RuntimeSelectionPolicy::UserSelected || update.phase == RuntimeUpdatePhase::RecoveryRequired;
        if candidate.is_none() && !restore {
            return div().into_any_element();
        }
        let mut actions = div().border_t_1().border_color(p.border).p(px(4.)).flex().flex_col().gap(px(2.));
        if let Some(version) = candidate {
            let (container, focus) = self.control_container("upgrade-yt-dlp", available, cx);
            let label = format!("{} {version}", l.text("升级至", "Upgrade to"));
            let color = if available { p.neutral } else { p.disabled_text() };
            actions = actions.child(container.flex_none().child(
                gpui_base::Button::new("upgrade-yt-dlp").track_focus(&focus).disabled(!available)
                    .accessibility_label(label.clone())
                    .w_full().min_h(px(36.)).h_auto().px(px(8.)).py(px(6.))
                    .flex().items_center().gap(px(8.)).rounded(px(5.))
                    .border_1().border_color(transparent_black())
                    .text_size(px(12.)).line_height(px(18.)).text_color(color)
                    .child(svg().path("icons/circle-arrow-up.svg").size(px(14.)).flex_none().text_color(color))
                    .child(div().flex_1().min_w(px(0.)).truncate().font(tokens::ui_font()).child(version.clone()))
                    .child(div().flex_none().text_color(if available { p.primary_text() } else { p.disabled_text() })
                        .child(l.text("升级", "Upgrade")))
                    .when(available, |s| s.cursor_pointer().hover(move |s| s.bg(p.badge))
                        .active(move |s| s.bg(p.border))
                        .when(self.keyboard_focus, |s| s.focus(move |s| s.border_color(p.blue)))
                        .on_click(cx.listener(move |this, _, _, cx| this.select_engine_version(Some(version.clone()), cx)))),
            ));
        }
        if restore {
            actions = actions.child(self.button("restore-recommended", l.text("恢复推荐版本", "Restore recommended"), available, ButtonStyle::Menu, cx, |this, _, cx| this.select_engine_version(None, cx)));
        }
        actions.into_any_element()
    }

    fn component_version_menu(&self, trigger_bounds: Rc<Cell<Option<Bounds<Pixels>>>>, cx: &mut Context<Self>) -> AnyElement {
        let l = self.projection.language;
        let p = Palette::new(self.projection.night);
        let snapshot = self.projection.queue.as_deref();
        let upstream = self.projection.upstream_snapshot();
        let checking = check_is_visible(upstream.pending, self.upstream_feedback);
        let owner_available = self.projection.upstream_available
            && snapshot.is_some_and(|s| !s.stopping && !s.stopped);
        let fields = if let Some(snapshot) = snapshot {
            let update = &snapshot.runtime_update;
            let version_value = |id: &'static str, version: &str| div().id(id)
                .font(tokens::ui_font()).text_color(p.primary_text())
                .when(version_preview(version) != version, |value| value.tooltip_above(&self.tooltips, {
                    let full_version = version.to_owned();
                    move |_, cx| cx.new(|_| ValueTooltip {
                        path: full_version.clone(), night: p.night,
                    }).into()
                }))
                .child(version_preview(version));
            let current_version = verified_version(Some(snapshot), "yt-dlp");
            let mut fields = div().flex_1().min_w(px(0.))
                .text_size(px(12.)).line_height(px(18.)).flex().flex_col().gap(px(4.))
                .child(div().text_color(p.neutral).child(match update.policy {
                    RuntimeSelectionPolicy::FollowAmeow => l.text("推荐版本 · PyPI", "Recommended · PyPI"),
                    RuntimeSelectionPolicy::UserSelected => l.text("自选版本 · PyPI", "User selected · PyPI"),
                }));
            if let Some(version) = &update.active_version && current_version != Some(version.as_str()) {
                fields = fields.child(div().flex().flex_wrap().gap(px(6.))
                    .child(div().text_color(p.neutral).child(l.text("保留版本：", "Retained version:")))
                    .child(version_value("component-detail-retained-version", version)));
            }
            if let Some(version) = &update.requested_version {
                fields = fields.child(div().flex().flex_wrap().gap(px(6.))
                    .child(div().text_color(p.neutral).child(l.text("目标版本：", "Target version:")))
                    .child(version_value("component-detail-target-version", version)));
            }
            fields
        } else {
            div().flex_1().min_w(px(0.)).text_size(px(12.)).text_color(p.neutral)
                .child(l.text("正在读取组件状态…", "Reading component status…"))
        };
        let mut menu = div().id("component-version-menu").w(px(248.)).max_h(px(320.))
            .overflow_y_scroll().rounded(px(6.)).bg(p.surface)
            .border_1().border_color(p.control_border())
            .occlude().flex().flex_col()
            .on_click(|_, _, cx| cx.stop_propagation())
            .on_mouse_down_out(cx.listener(move |this, event: &MouseDownEvent, _, cx| {
                if trigger_bounds.get().is_some_and(|bounds| bounds.contains(&event.position)) { return; }
                this.component_menu_open = false;
                cx.notify();
            }))
            .on_scroll(|_, _, cx| cx.stop_propagation())
            .child(div().px(px(10.)).py(px(6.)).flex().items_center().gap(px(8.))
                .child(fields)
                .child(self.icon_button("check-yt-dlp-release",
                    if checking { "icons/loader-circle.svg" } else { "icons/refresh-cw.svg" },
                    if checking { l.text("检查中…", "Checking…").to_owned() }
                    else if upstream.cooldown_remaining_ms > 0 { format!("{} ({}s)", l.text("检查更新", "Check updates"), upstream.cooldown_remaining_ms.div_ceil(1000)) }
                    else { l.text("检查更新", "Check updates").to_owned() },
                    self.can_check_upstream(), cx,
                    |this, window, cx| this.check_upstream(window, cx))));
        let feedback = if checking {
            None
        } else if !self.projection.upstream_available && snapshot.is_some() {
            Some((
                l.text(
                    "此模式下无法检查更新。",
                    "Update checks unavailable in this mode.",
                )
                .to_owned(),
                false,
            ))
        } else if !owner_available {
            Some((
                l.text("组件服务不可用。", "Component service unavailable.")
                    .to_owned(),
                true,
            ))
        } else if upstream.worker_running {
            Some((
                l.text(
                    "检查已超时，仍在结束，请稍候。",
                    "Check timed out; still finishing. Please wait.",
                )
                .to_owned(),
                true,
            ))
        } else if upstream.cooldown_remaining_ms > 0 {
            None
        } else if self
            .upstream_feedback
            .is_some_and(|(_, accepted)| !accepted)
        {
            Some((
                l.text(
                    "检查未受理，请稍后重试。",
                    "Check not accepted. Try again shortly.",
                )
                .to_owned(),
                true,
            ))
        } else {
            None
        };
        let show_result = upstream.result.as_ref().is_some_and(|result| result.is_err()
            || upgrade_version(&upstream, verified_version(snapshot, "yt-dlp"), ameow_next::download::progress::now_ms()).is_none());
        if feedback.is_some() || (!checking && show_result) {
            let mut result_panel = div()
                .px(px(12.))
                .pt(px(4.))
                .pb(px(12.))
                .text_size(px(12.))
                .line_height(px(20.))
                .flex()
                .flex_col()
                .gap(px(4.));
            if let Some((message, danger)) = feedback {
                result_panel = result_panel.child(
                    inline_notice(p, message, danger),
                );
            }
            if !checking && show_result {
                if let Some(result) = &upstream.result {
                    let message = match result {
                        Ok(version) => format!(
                            "{} {version}",
                            l.text("最新稳定版本：", "Latest stable release:")
                        ),
                        Err(error) => upstream_error(error, l),
                    };
                    let mut message_row = div().id("upstream-result")
                        .when(result.is_ok(), |s| s.text_color(p.primary_text()).child(message.clone()))
                        .when(result.is_err(), |s| s.child(inline_notice(p, message, true)));
                    if let Err(error) = result {
                        let detail = format!("{} {error:?}", l.text("检查详情：", "Check details:"));
                        message_row = message_row.tooltip_above(&self.tooltips, move |_, cx| cx.new(|_| HelpTooltip { text: detail.clone(), night: p.night }).into());
                    }
                    result_panel = result_panel.child(message_row);
                }
            }
            menu = menu.child(result_panel);
        }
        menu.child(self.engine_update_actions(cx)).into_any_element()
    }

    pub(super) fn can_check_upstream(&self) -> bool {
        let upstream = self.projection.upstream_snapshot();
        check_enabled(
            self.projection.upstream_available
                && self.projection.queue.as_deref().is_some_and(|s| !s.stopping && !s.stopped),
            check_is_visible(upstream.pending, self.upstream_feedback),
            upstream.worker_running,
            upstream.cooldown_remaining_ms,
        )
    }

    pub(super) fn check_upstream(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.projection.preview || !self.can_check_upstream() { return; }
        let accepted = self
            .main
            .update(cx, |main, _| {
                main.downloads
                    .as_ref()
                    .is_some_and(|ui| ui.request_upstream_check())
            })
            .unwrap_or(false);
        self.upstream_feedback = Some((std::time::Instant::now(), accepted));
        window.focus(if self.component_menu_open { &self.component_menu_focus } else { &self.focus }, cx);
        cx.notify();
    }
    pub(super) fn components_page(&self, cx: &mut Context<Self>) -> AnyElement {
        let l = self.projection.language;
        let p = Palette::new(self.projection.night);
        let snapshot = self.projection.queue.as_deref();
        let mut content = div().flex().flex_col();
        for (index, (name, label)) in [
            ("yt-dlp", "yt-dlp"), ("gallery-dl", "gallery-dl"), ("deno", "Deno"), ("ffmpeg", "FFmpeg / ffprobe"),
        ].into_iter().enumerate() {
            let version = verified_version(snapshot, name).unwrap_or(l.text("不可用", "Unavailable"));
            let version_value = div().text_size(px(12.)).text_color(p.neutral)
                .font(tokens::ui_font()).child(version_preview(version));
            let control = if name == "yt-dlp" {
                let was_open = self.component_menu_open;
                let trigger_bounds = Rc::new(Cell::new(None::<Bounds<Pixels>>));
                let measured_trigger = trigger_bounds.clone();
                let trigger = self.button("component-details",
                    div().px(px(6.)).flex().items_center().gap(px(6.))
                        .child(version_value)
                        .child(svg().path("icons/chevron-down.svg").size(px(12.)).text_color(p.neutral)),
                    true, ButtonStyle::Quiet, cx, move |this, window, cx| {
                        this.component_menu_open = !was_open;
                        if let Some(focus) = this.control_focus.borrow().get("component-details") {
                            window.focus(focus, cx);
                        }
                        cx.notify();
                    });
                let mut anchor = div().relative().flex_none()
                    .on_children_prepainted(move |children, _, _| measured_trigger.set(children.first().copied()))
                    .when(!self.passive.get(), |s| s.track_focus(&self.component_menu_focus))
                    .child(trigger);
                let presence = self.motion.presence("component-version-menu", self.component_menu_open && !self.passive.get());
                if presence.visible() {
                    let passive = self.passive.replace(!self.component_menu_open || self.passive.get());
                    let menu = self.component_version_menu(trigger_bounds, cx);
                    self.passive.set(passive);
                    anchor = anchor.child(div().absolute().right_0().top(px(36.))
                        .child(deferred(anchored().anchor(gpui::Anchor::TopRight)
                            .snap_to_window_with_margin(Edges::all(px(12.))).child(div().relative().top(px(presence.travel(-4.))).opacity(presence.alpha)
                                .when(!self.component_menu_open, |s| s.capture_any_mouse_down(|_, _, cx| cx.stop_propagation()))
                                .child(menu)))));
                }
                anchor.into_any_element()
            } else {
                div().id(("component-version", index)).flex_none()
                    .when(version_preview(version) != version, |s| s.tooltip_above(&self.tooltips, {
                        let full_version = version.to_owned();
                        move |_, cx| cx.new(|_| ValueTooltip {
                            path: full_version.clone(), night: p.night,
                        }).into()
                    })).child(version_value).into_any_element()
            };
            let section = div().flex().flex_col().border_b_1().border_color(p.border)
                .child(div().min_h(px(tokens::SETTINGS_ROW_HEIGHT)).flex().items_center().justify_between().gap(px(12.))
                    .child(div().id(("component-name", index)).flex_none().text_size(px(13.))
                        .tooltip_above(&self.tooltips, move |_, cx| cx.new(|_| HelpTooltip {
                            text: match name {
                                "yt-dlp" => l.text("用于获取视频和下载信息。", "Retrieves videos and download information."),
                                "gallery-dl" => l.text("用于下载图片集。", "Downloads image galleries."),
                                "deno" => l.text("提供部分网站下载所需的脚本支持。", "Runs scripts needed to download from some websites."),
                                _ => l.text("用于合并和处理音视频。", "Merges and processes audio and video."),
                            }.into(), night: p.night,
                        }).into()).child(label))
                    .child(control));
            content = content.child(section);
        }
        content.child(self.component_diagnostics(cx)).into_any_element()
    }

    fn component_diagnostics(&self, cx: &mut Context<Self>) -> AnyElement {
        let l = self.projection.language;
        let p = Palette::new(self.projection.night);
        let snapshot = self.projection.queue.as_deref();
        let update = snapshot.map(|s| &s.runtime_update);
        let update_visible = update.is_some_and(|u| !matches!(u.phase, RuntimeUpdatePhase::Idle | RuntimeUpdatePhase::Activated) || u.error.is_some());
        let (status, danger) = if snapshot.is_none() && self.projection.error.is_some() {
            (l.text("组件状态不可用", "Component status unavailable"), true)
        } else if snapshot.is_some_and(|s| s.preparation_owner_lost || s.preparation_held) {
            runtime_status(snapshot, l)
        } else if self.projection.engine_notice == Some(false) {
            (l.text("当前无法执行此操作，请稍后重试。", "This action is unavailable now. Try again shortly."), true)
        } else if let Some(update) = update.filter(|u| !matches!(u.phase, RuntimeUpdatePhase::Idle | RuntimeUpdatePhase::Activated)) {
            (update_status(update.phase, l), matches!(update.phase, RuntimeUpdatePhase::Failed | RuntimeUpdatePhase::RecoveryRequired | RuntimeUpdatePhase::RolledBack))
        } else if update.is_some_and(|u| u.error.is_some()) {
            (l.text("验证或保存未完成，可复制诊断查看原因。", "Verification or saving did not complete. Copy diagnostics for details."), true)
        } else if self.projection.engine_command_pending {
            (l.text("正在准备更新…", "Preparing the update…"), false)
        } else {
            runtime_status(snapshot, l)
        };
        let show_status = danger || update_visible || self.projection.engine_command_pending
            || ["yt-dlp", "gallery-dl", "deno", "ffmpeg"].iter()
            .any(|name| verified_version(snapshot, name).is_none());
        let copied = self.projection.preparation_status.as_ref()
            .is_some_and(|(message, danger)| !danger && message == "已复制组件诊断");
        let mut diagnostic = div().pt(px(24.)).flex().flex_col().gap(px(8.))
            .child(div().flex().items_center().gap(px(8.))
            .child(div().flex_1().min_w(px(0.)).text_size(px(13.)).font_weight(FontWeight::MEDIUM)
                .child(l.text("诊断信息", "Diagnostics")))
            .child(self.icon_button(
                "copy-component-diagnostic",
                if self.projection.preparation_copy_pending { "icons/loader-circle.svg" }
                else if copied { "icons/check.svg" } else { "icons/copy.svg" },
                if self.projection.preparation_copy_pending { l.text("复制中…", "Copying…") }
                else if copied { l.text("已复制", "Copied") }
                else { l.text("复制诊断", "Copy diagnostics") },
                snapshot.is_some() && !self.projection.preparation_copy_pending,
                cx, |this, _, cx| {
                    if this.projection.preview {
                        this.projection.preparation_copy_pending = false;
                        this.projection.preparation_status = Some(("已复制组件诊断".into(), false));
                        this.reset_copy_feedback_later("component", cx);
                        cx.notify();
                        return;
                    }
                    let _ = this.main.update(cx, |main, cx| {
                        let now = main.now();
                        if let Some(ui) = &mut main.downloads { ui.copy_preparation_diagnostic(now); }
                        cx.notify();
                    });
                },
            )));
        if show_status {
            let mut status_row = div().flex().items_start().gap(px(8.))
                .child(svg().path(if danger { "icons/circle-alert.svg" } else { "icons/info.svg" })
                    .size(px(14.)).mt(px(3.)).flex_none().text_color(if danger { error_text(p) } else { p.neutral }))
                .child(div().flex_1().min_w(px(0.)).text_size(px(13.)).line_height(px(20.))
                    .text_color(p.primary_text()).child(status.trim_end_matches('。').trim_end_matches('.').to_owned()));
            if self.projection.preparation_retry_available {
                status_row = status_row.child(self.button(
                "retry-component-preparation", l.text("重试", "Retry"), true,
                ButtonStyle::Standard, cx, |this, _, cx| {
                    if this.projection.preview { return; }
                    let _ = this.main.update(cx, |main, cx| {
                        let now = main.now();
                        if let Some(ui) = &mut main.downloads { ui.retry_preparation(now); }
                        cx.notify();
                    });
                },
                ));
            }
            let mut body = div().flex().flex_col().gap(px(4.))
                .child(status_row);
            if let Some(failure) = snapshot.and_then(|s| s.preparation.failure.as_ref()) {
                body = body.child(div().pl(px(22.)).text_size(px(12.)).line_height(px(18.))
                    .text_color(p.neutral).child(failure_text(failure.category, l)));
            }
            if let Some(snapshot) = snapshot.filter(|s| update_busy(s.runtime_update.phase) && s.preparation.downloaded_bytes > 0) {
                body = body.child(div().pl(px(22.)).text_size(px(12.)).line_height(px(18.)).text_color(p.neutral)
                    .child(format!("{} {:.1} MB", l.text("已准备", "Prepared"), snapshot.preparation.downloaded_bytes as f64 / 1_000_000.)));
            }
            diagnostic = diagnostic.child(div().p(px(10.)).rounded(px(6.))
                .bg(if danger { p.red.opacity(if p.night { 0.12 } else { 0.07 }) } else { p.badge.opacity(0.55) })
                .border_1().border_color(p.border)
                .child(body));
        }
        diagnostic = diagnostic.child(self.notice_bar("component-diagnostics-error",
            self.projection.preparation_status.as_ref().filter(|(_, danger)| *danger)
                .map(|(message, _)| (action_notice(message, l), true))));
        diagnostic.into_any_element()
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    use core::prelude::v1::test;
    #[test]
    fn preparing_blocks_duplicate_actions_and_does_not_claim_a_download() {
        assert!(update_busy(RuntimeUpdatePhase::Preparing));
        assert!(!update_status(RuntimeUpdatePhase::Preparing, Language::Chinese).contains("下载"));
        assert!(!update_status(RuntimeUpdatePhase::Verifying, Language::English).contains("Downloading"));
    }
    #[test]
    fn upgrade_requires_fresh_success_and_newer_verified_version() {
        let mut query = ameow_next::download::upstream::UpstreamSnapshot {
            checked_at_ms: Some(1_000), result: Some(Ok("2026.10.30".into())), ..Default::default()
        };
        assert_eq!(upgrade_version(&query, Some("2026.08.19"), 1_000), Some("2026.10.30".into()));
        assert!(upgrade_version(&query, None, 1_000).is_none());
        assert!(upgrade_version(&query, Some("2026.10.30"), 1_000).is_none());
        assert!(upgrade_version(&query, Some("2026.11.01"), 1_000).is_none());
        assert!(upgrade_version(&query, Some("2026.08.19"), 601_001).is_none());
        query.worker_running = true;
        assert!(upgrade_version(&query, Some("2026.08.19"), 1_000).is_none());
        query.worker_running = false;
        query.result = Some(Err(UpstreamError::Timeout));
        assert!(upgrade_version(&query, Some("2026.08.19"), 1_000).is_none());
    }
    #[test]
    fn version_preview_keeps_identity_ends_without_splitting_unicode() {
        assert_eq!(version_preview("2026.08.19"), "2026.08.19");
        let version = "N-127264-gf5d4fd186c-20261009";
        let preview = version_preview(version);
        assert_eq!(preview.chars().count(), 24);
        assert!(preview.starts_with("N-127264-gf"));
        assert!(preview.contains('…'));
        assert!(preview.ends_with("20261009"));
        assert_eq!(version_preview(&"版".repeat(25)).chars().count(), 24);
    }
    #[test]
    fn cleanup_uncertainty_and_unverified_identity_override_ready() {
        let mut snapshot = crate::queue_fixture::snapshot(Vec::new());
        snapshot.preparation.phase = PreparationPhase::Ready;
        assert!(
            runtime_status(Some(&snapshot), Language::English)
                .0
                .contains("unavailable")
        );
        snapshot.verified_runtime_versions = vec![("yt-dlp".into(), "2026.01.01".into())];
        assert!(
            runtime_status(Some(&snapshot), Language::English)
                .0
                .contains("versions are unavailable")
        );
        snapshot.preparation_owner_lost = true;
        assert!(
            runtime_status(Some(&snapshot), Language::English)
                .0
                .contains("cleanup could not be confirmed")
        );
        snapshot.preparation_owner_lost = false;
        snapshot.preparation_held = true;
        assert!(
            runtime_status(Some(&snapshot), Language::English)
                .0
                .contains("being cleaned up")
        );
        snapshot.preparation_held = false;
        snapshot.preparing = true;
        assert!(
            runtime_status(Some(&snapshot), Language::English)
                .0
                .contains("versions are unavailable")
        );
    }
    #[test]
    fn version_requires_ready_and_uninterrupted_owner() {
        let mut snapshot = crate::queue_fixture::snapshot(Vec::new());
        snapshot.verified_runtime_versions = vec![("yt-dlp".into(), "2026.01.01".into())];
        assert_eq!(verified_version(Some(&snapshot), "yt-dlp"), None);
        snapshot.preparation.phase = PreparationPhase::Ready;
        assert_eq!(
            verified_version(Some(&snapshot), "yt-dlp"),
            Some("2026.01.01")
        );
        snapshot.preparing = true;
        assert_eq!(verified_version(Some(&snapshot), "yt-dlp"), None);
        snapshot.preparing = false;
        snapshot.preparation_held = true;
        assert_eq!(verified_version(Some(&snapshot), "yt-dlp"), None);
        snapshot.preparation_held = false;
        snapshot.preparation_owner_lost = true;
        assert_eq!(verified_version(Some(&snapshot), "yt-dlp"), None);
        snapshot.preparation_owner_lost = false;
        snapshot.stopping = true;
        assert_eq!(verified_version(Some(&snapshot), "yt-dlp"), None);
    }
    #[test]
    fn admitted_fast_check_has_visible_feedback_without_hiding_refusal() {
        let now = std::time::Instant::now();
        assert!(check_is_visible(false, Some((now, true))));
        assert!(check_is_visible(true, None));
        assert!(!check_is_visible(false, Some((now, false))));
        assert!(!check_is_visible(
            false,
            Some((now - std::time::Duration::from_secs(1), true))
        ));
        assert!(check_enabled(true, false, false, 0));
        assert!(!check_enabled(false, false, false, 0));
        assert!(!check_enabled(true, true, false, 0));
        assert!(!check_enabled(true, false, true, 0));
        assert!(!check_enabled(true, false, false, 1));
    }
    #[test]
    fn diagnostic_copy_and_upstream_failures_use_safe_localized_text() {
        for language in [Language::Chinese, Language::English] {
            for error in [
                UpstreamError::Route,
                UpstreamError::Timeout,
                UpstreamError::Http(429),
                UpstreamError::InvalidResponse,
                UpstreamError::TooLarge,
            ] {
                assert!(!upstream_error(&error, language).is_empty());
            }
            assert!(!action_notice("已复制组件诊断", language).is_empty());
        }
        assert!(
            upstream_error(&UpstreamError::Http(429), Language::English).contains("rate-limited")
        );
    }
}
