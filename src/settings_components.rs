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
fn checked_time(at: u64, now: u64, l: Language) -> String {
    let seconds = now.saturating_sub(at) / 1000;
    if seconds < 60 { return l.text("刚刚检查", "Checked just now").into(); }
    if seconds < 3600 {
        let minutes = seconds / 60;
        return match l {
            Language::Chinese => format!("上次检查：{minutes} 分钟前"),
            Language::English => format!("Last checked: {minutes} {} ago", if minutes == 1 { "minute" } else { "minutes" }),
        };
    }
    let hours = seconds / 3600;
    match l {
        Language::Chinese => format!("上次检查：{hours} 小时前"),
        Language::English => format!("Last checked: {hours} {} ago", if hours == 1 { "hour" } else { "hours" }),
    }
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
        RuntimeUpdatePhase::Idle => l.text("升级前会请你确认。", "You will be asked to confirm before upgrading."),
        RuntimeUpdatePhase::Preparing => l.text("正在准备更新…", "Preparing the update…"),
        RuntimeUpdatePhase::Downloading => l.text("正在下载更新…", "Downloading the update…"),
        RuntimeUpdatePhase::Verifying => l.text("正在验证更新…", "Verifying the update…"),
        RuntimeUpdatePhase::Waiting => l.text("等待当前任务结束后应用更新。", "The update will be applied after current tasks finish."),
        RuntimeUpdatePhase::Activated => l.text("更新已应用。", "Update applied."),
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
    fn confirm_engine_update(&mut self, cx: &mut Context<Self>) {
        let Some(selection) = self.engine_confirmation.take() else { return; };
        if self.projection.preview { cx.notify(); return; }
        // Recheck the current query and verified version after the confirmation was opened.
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

    fn engine_update_panel(&self, cx: &mut Context<Self>) -> AnyElement {
        let l = self.projection.language;
        let p = Palette::new(self.projection.night);
        let Some(snapshot) = self.projection.queue.as_deref() else { return div().into_any_element(); };
        let update = &snapshot.runtime_update;
        let available = self.projection.upstream_available && !snapshot.stopping && !snapshot.stopped && !self.projection.engine_command_pending && !update_busy(update.phase);
        let candidate = upgrade_version(&self.projection.upstream_snapshot(), verified_version(Some(snapshot), "yt-dlp"), ameow_next::download::progress::now_ms());
        if update.phase == RuntimeUpdatePhase::Idle && update.error.is_none()
            && !self.projection.engine_command_pending && self.projection.engine_notice != Some(false)
            && self.engine_confirmation.is_none() && candidate.is_none()
            && update.policy == RuntimeSelectionPolicy::FollowAmeow {
            return div().into_any_element();
        }
        let mut panel = div().pb(px(12.)).flex().flex_col().gap(px(4.)).text_size(px(12.));
        if update_busy(update.phase) && snapshot.preparation.downloaded_bytes > 0 {
            panel = panel.child(div().text_color(p.neutral).child(format!("{} {:.1} MB", l.text("已准备", "Prepared"), snapshot.preparation.downloaded_bytes as f64 / 1_000_000.)));
        }
        if update.phase != RuntimeUpdatePhase::Idle {
            panel = panel.child(div().text_color(if matches!(update.phase, RuntimeUpdatePhase::Failed | RuntimeUpdatePhase::RecoveryRequired) {error_text(p)} else {p.neutral}).child(update_status(update.phase, l)));
        }
        if let Some(version) = &update.requested_version && update_busy(update.phase) {
            panel = panel.child(div().text_color(p.neutral).child(format!("{} {version}", l.text("目标版本：", "Target version:"))));
        }
        if update.error.is_some() && !matches!(update.phase, RuntimeUpdatePhase::Failed | RuntimeUpdatePhase::RecoveryRequired) {
            panel = panel.child(div().text_color(error_text(p)).child(l.text("验证或保存未完成；可复制组件诊断查看原因。", "Verification or saving did not complete. Copy component diagnostics for details.")));
        }
        if self.projection.engine_command_pending {
            panel = panel.child(l.text("正在处理…", "Processing…"));
        } else if self.projection.engine_notice == Some(false) {
            panel = panel.child(div().text_color(error_text(p)).child(l.text("当前无法执行此操作，请稍后重试。", "This action is unavailable now. Try again shortly.")));
        }
        if let Some(selection) = &self.engine_confirmation {
            let title = selection.as_ref().map_or_else(|| l.text("确认恢复 Ameow 推荐版本？", "Restore the Ameow recommended version?").to_owned(), |v| format!("{} {v}？", l.text("确认升级到", "Upgrade to")));
            panel = panel.child(div().p(px(12.)).rounded(px(8.)).bg(p.badge).flex().flex_col().gap(px(8.))
                .child(title)
                .child(l.text("更新不会中断正在进行的下载。已验证的版本保存在本机，缓存完好时可离线使用。", "The update will not interrupt active downloads. Verified versions are saved locally and work offline while their cache remains intact."))
                .child(div().flex().flex_wrap().gap(px(8.))
                    .child(self.button("confirm-engine-update", l.text("确认", "Confirm"), available, ButtonStyle::Standard, cx, |this, _, cx| this.confirm_engine_update(cx)))
                    .child(self.button("cancel-engine-update", l.text("取消", "Cancel"), true, ButtonStyle::Quiet, cx, |this, _, cx| { this.engine_confirmation = None; cx.notify(); }))));
        } else {
            let mut actions = div().flex().flex_wrap().gap(px(8.));
            if let Some(version) = candidate {
                actions = actions.child(self.button("upgrade-yt-dlp", l.text("升级", "Upgrade"), available, ButtonStyle::Standard, cx, move |this, _, cx| { this.engine_confirmation = Some(Some(version.clone())); cx.notify(); }));
            }
            if update.policy == RuntimeSelectionPolicy::UserSelected || update.phase == RuntimeUpdatePhase::RecoveryRequired {
                actions = actions.child(self.button("restore-recommended", l.text("恢复 Ameow 推荐版本", "Restore Ameow recommended version"), available, ButtonStyle::Standard, cx, |this, _, cx| { this.engine_confirmation = Some(None); cx.notify(); }));
            }
            panel = panel.child(actions);
        }
        panel.into_any_element()
    }

    fn component_version_menu(&self, cx: &mut Context<Self>) -> AnyElement {
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
                .tooltip({
                    let full_version = version.to_owned();
                    move |_, cx| cx.new(|_| ValueTooltip {
                        path: full_version.clone(), night: p.night,
                    }).into()
                })
                .child(version_preview(version));
            let current_version = verified_version(Some(snapshot), "yt-dlp");
            let mut summary = div().flex().flex_wrap().items_center().gap(px(8.));
            if let Some(version) = current_version {
                summary = summary.child(version_value("component-detail-current-version", version)
                    .text_size(px(13.)).font_weight(FontWeight::MEDIUM));
            }
            summary = summary.child(div().flex_none().px(px(6.)).py(px(2.))
                .rounded(px(4.)).border_1().border_color(p.control_border())
                .text_size(px(11.)).line_height(px(16.)).text_color(p.neutral)
                .child(match update.policy {
                    RuntimeSelectionPolicy::FollowAmeow => l.text("推荐版本", "Recommended"),
                    RuntimeSelectionPolicy::UserSelected => l.text("自选版本", "User selected"),
                }));
            let mut fields = div().p(px(12.))
                .text_size(px(12.)).line_height(px(18.)).flex().flex_col().gap(px(6.))
                .child(summary)
                .child(div().text_color(p.neutral).child(l.text("来源：PyPI", "Source: PyPI")));
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
            div().p(px(12.)).text_size(px(12.)).text_color(p.neutral)
                .child(l.text("正在读取组件状态…", "Reading component status…"))
        };
        let mut menu = div().id("component-version-menu").w(px(272.)).max_h(px(320.))
            .overflow_y_scroll().rounded(px(8.)).bg(p.surface)
            .border_1().border_color(p.control_border())
            .shadow(vec![BoxShadow { inset: false, color: black().opacity(if p.night { 0.24 } else { 0.10 }),
                offset: point(px(0.), px(4.)), blur_radius: px(12.), spread_radius: px(0.) }])
            .occlude().flex().flex_col()
            .on_click(|_, _, cx| cx.stop_propagation())
            .on_mouse_down_out(cx.listener(|this, _, _, cx| {
                this.component_menu_open = false;
                cx.notify();
            }))
            .on_scroll(|_, _, cx| cx.stop_propagation())
            .child(fields)
            .child(div().border_t_1().border_color(p.border).p(px(4.))
                .child(self.button("check-yt-dlp-release",
                    if checking { l.text("检查中…", "Checking…") }
                    else { l.text("检查更新", "Check updates") },
                    self.can_check_upstream(), ButtonStyle::Menu, cx,
                    |this, window, cx| this.check_upstream(window, cx))));
        let feedback = if checking {
            Some((
                l.text(
                    "正在检查更新…",
                    "Checking for updates…",
                )
                .to_owned(),
                false,
            ))
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
            Some((
                l.text("请稍候再检查。", "Wait briefly before checking again.")
                    .to_owned(),
                false,
            ))
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
        if feedback.is_some() || (!checking && upstream.result.is_some()) {
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
                    div()
                        .text_color(if danger { error_text(p) } else { p.neutral })
                        .child(message),
                );
            }
            if !checking {
                if let Some(result) = &upstream.result {
                    let message = match result {
                        Ok(version) => format!(
                            "{} {version}",
                            l.text("最新稳定版本：", "Latest stable release:")
                        ),
                        Err(error) => upstream_error(error, l),
                    };
                    let mut message_row = div().id("upstream-result")
                            .text_color(if result.is_err() {
                                error_text(p)
                            } else {
                                p.primary_text()
                            })
                            .child(message);
                    if let Err(error) = result {
                        let detail = format!("{} {error:?}", l.text("检查详情：", "Check details:"));
                        message_row = message_row.tooltip(move |_, cx| cx.new(|_| HelpTooltip { text: detail.clone(), night: p.night }).into());
                    }
                    result_panel = result_panel.child(message_row);
                    if let Some(at) = upstream.checked_at_ms {
                        result_panel = result_panel.child(
                            div().text_size(px(11.)).text_color(p.neutral).child(
                                checked_time(
                                    at,
                                    ameow_next::download::progress::now_ms(),
                                    l,
                                ),
                            ),
                        );
                    }
                }
            }
            menu = menu.child(result_panel);
        }
        menu.into_any_element()
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
        let mut content = div().flex().flex_col().child(self.page_header(
            l.text("组件与诊断", "Components & diagnostics"),
            l.text("管理下载所需的组件", "Manage the components used for downloads"),
        ));
        let needs_attention = snapshot.is_none()
            || runtime_status(snapshot, l).1
            || ["yt-dlp", "gallery-dl", "deno", "ffmpeg"].iter().any(|name| verified_version(snapshot, name).is_none());
        if needs_attention {
            content = content.child(self.component_diagnostics(cx));
        }
        for (index, (name, label)) in [
            ("yt-dlp", "yt-dlp"), ("gallery-dl", "gallery-dl"), ("deno", "Deno"), ("ffmpeg", "FFmpeg / ffprobe"),
        ].into_iter().enumerate() {
            let version = verified_version(snapshot, name).unwrap_or(l.text("不可用", "Unavailable"));
            let version_value = div().text_size(px(12.)).text_color(p.neutral)
                .font(tokens::ui_font()).child(version_preview(version));
            let control = if name == "yt-dlp" {
                let was_open = self.component_menu_open;
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
                let mut anchor = div().relative().flex_none().track_focus(&self.component_menu_focus)
                    .child(trigger);
                if self.component_menu_open {
                    anchor = anchor.child(div().absolute().right_0().top(px(36.))
                        .child(deferred(anchored().anchor(gpui::Anchor::TopRight)
                            .child(self.component_version_menu(cx)))));
                }
                anchor.into_any_element()
            } else {
                div().id(("component-version", index)).flex_none()
                    .tooltip({
                        let full_version = version.to_owned();
                        move |_, cx| cx.new(|_| ValueTooltip {
                            path: full_version.clone(), night: p.night,
                        }).into()
                    }).child(version_value).into_any_element()
            };
            let mut section = div().flex().flex_col().border_b_1().border_color(p.border)
                .child(div().min_h(px(56.)).flex().items_center().justify_between().gap(px(12.))
                    .child(div().id(("component-name", index)).flex_none().text_size(px(13.))
                        .tooltip(move |_, cx| cx.new(|_| HelpTooltip {
                            text: match name {
                                "yt-dlp" => l.text("用于获取视频和下载信息。", "Retrieves videos and download information."),
                                "gallery-dl" => l.text("用于下载图片集。", "Downloads image galleries."),
                                "deno" => l.text("提供部分网站下载所需的脚本支持。", "Runs scripts needed to download from some websites."),
                                _ => l.text("用于合并和处理音视频。", "Merges and processes audio and video."),
                            }.into(), night: p.night,
                        }).into()).child(label))
                    .child(control));
            if name == "yt-dlp" {
                section = section.child(self.engine_update_panel(cx));
            }
            content = content.child(section);
        }
        if !needs_attention {
            content = content.child(self.component_diagnostics(cx));
        }
        content.into_any_element()
    }

    fn component_diagnostics(&self, cx: &mut Context<Self>) -> AnyElement {
        let l = self.projection.language;
        let p = Palette::new(self.projection.night);
        let snapshot = self.projection.queue.as_deref();
        let (status, danger) = if snapshot.is_none() && self.projection.error.is_some() {
            (l.text("组件状态不可用", "Component status unavailable"), true)
        } else {
            runtime_status(snapshot, l)
        };
        let show_status = danger || ["yt-dlp", "gallery-dl", "deno", "ffmpeg"].iter()
            .any(|name| verified_version(snapshot, name).is_none());
        let mut actions = div().flex().flex_wrap().justify_end().gap(px(8.))
            .child(self.button(
                "copy-component-diagnostic", l.text("复制诊断", "Copy diagnostics"),
                snapshot.is_some() && !self.projection.preparation_copy_pending,
                ButtonStyle::Quiet, cx, |this, _, cx| {
                    if this.projection.preview { return; }
                    let _ = this.main.update(cx, |main, cx| {
                        let now = main.now();
                        if let Some(ui) = &mut main.downloads { ui.copy_preparation_diagnostic(now); }
                        cx.notify();
                    });
                },
            ));
        if self.projection.preparation_retry_available {
            actions = actions.child(self.button(
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
        let mut diagnostic = if show_status {
            let mut body = div().flex().flex_col().gap(px(6.))
                .child(div().flex().items_center().gap(px(8.))
                    .child(svg().path(if danger { "icons/circle-alert.svg" } else { "icons/info.svg" })
                        .size(px(14.)).flex_none().text_color(if danger { error_text(p) } else { p.neutral }))
                    .child(div().text_size(px(13.)).font_weight(FontWeight::MEDIUM)
                        .text_color(p.primary_text()).child(status.trim_end_matches('。').trim_end_matches('.').to_owned())));
            if let Some(failure) = snapshot.and_then(|s| s.preparation.failure.as_ref()) {
                body = body.child(div().pl(px(22.)).text_size(px(12.)).line_height(px(18.))
                    .text_color(p.neutral).child(failure_text(failure.category, l)));
            }
            div().mb(px(16.)).p(px(12.)).rounded(px(6.)).bg(p.badge.opacity(0.55))
                .border_1().border_color(p.border).flex().flex_col().gap(px(10.))
                .child(body).child(actions)
        } else {
            div().pt(px(16.)).flex().flex_col().gap(px(8.))
                .child(div().flex().items_center().justify_between().gap(px(12.))
                    .child(div().text_size(px(13.)).child(l.text("诊断", "Diagnostics")))
                    .child(actions))
        };
        if let Some((message, danger)) = &self.projection.preparation_status {
            diagnostic = diagnostic.child(div().text_size(px(12.))
                .text_color(if *danger { error_text(p) } else { p.neutral })
                .child(action_notice(message, l)));
        }
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
    fn checked_age_handles_clock_skew_and_localized_units() {
        assert_eq!(checked_time(2000, 1000, Language::Chinese), "刚刚检查");
        assert_eq!(checked_time(0, 60_000, Language::English), "Last checked: 1 minute ago");
        assert_eq!(checked_time(0, 120_000, Language::Chinese), "上次检查：2 分钟前");
        assert_eq!(checked_time(0, 3_600_000, Language::English), "Last checked: 1 hour ago");
        assert_eq!(checked_time(0, 7_200_000, Language::English), "Last checked: 2 hours ago");
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
        assert!(
            checked_time(3661000, 3666000, Language::English)
                .contains("Checked just now")
        );
    }
}
