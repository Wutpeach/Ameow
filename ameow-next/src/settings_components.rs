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
                "清理未确认，无法重试。",
                "Cleanup unconfirmed; retry unavailable.",
            ),
            true,
        );
    }
    if s.preparation_held {
        return (
            l.text(
                "等待安全清理，暂无法重试。",
                "Waiting for cleanup; retry unavailable.",
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
            "代理路由不可用，请检查代理。",
            "Proxy route unavailable. Check proxy settings.",
        ),
        ErrorCategory::Http => l.text("组件来源返回错误。", "Component source returned an error."),
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
    match error {
        UpstreamError::Route => l
            .text(
                "系统代理路由不可用，未切换备用路由。",
                "The system proxy route is unavailable. No fallback route was used.",
            )
            .into(),
        UpstreamError::Timeout => l
            .text(
                "查询超时，请稍后手动重试。",
                "The check timed out. Try again manually later.",
            )
            .into(),
        UpstreamError::Connect => l
            .text(
                "无法连接上游，请检查网络或代理。",
                "Cannot connect to upstream. Check the network or proxy.",
            )
            .into(),
        UpstreamError::Http(403 | 429) => format!(
            "{} ({})",
            l.text(
                "上游拒绝请求或已限流，请稍后重试",
                "Upstream refused or rate-limited the request. Try later"
            ),
            match error {
                UpstreamError::Http(code) => *code,
                _ => unreachable!(),
            }
        ),
        UpstreamError::Http(code) => format!(
            "{} HTTP {code}",
            l.text("上游检查失败：", "Upstream check failed:")
        ),
        UpstreamError::InvalidResponse => l
            .text(
                "上游响应不是可确认的稳定版本，结果未知。",
                "The response did not identify a valid stable release. The result is unknown.",
            )
            .into(),
        UpstreamError::TooLarge => l
            .text(
                "上游响应超过安全大小限制，结果未知。",
                "The response exceeded the safe size limit. The result is unknown.",
            )
            .into(),
        UpstreamError::Network => l
            .text(
                "查询未完成，请检查网络后重试。",
                "The check could not complete. Check the network and try again.",
            )
            .into(),
    }
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
    let seconds = at / 1000;
    format!(
        "{} {:02}:{:02}:{:02} UTC · {} {}",
        l.text("检查时间：", "Checked:"),
        seconds / 3600 % 24,
        seconds / 60 % 60,
        seconds % 60,
        now.saturating_sub(at) / 1000,
        l.text("秒前", "seconds ago")
    )
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
        RuntimeUpdatePhase::Idle => l.text("仅在确认升级后准备新版本。", "New versions are prepared only after confirmation."),
        RuntimeUpdatePhase::Preparing => l.text("正在准备版本并检查本地缓存…", "Preparing the version and checking the local cache…"),
        RuntimeUpdatePhase::Downloading => l.text("正在下载并准备候选版本…", "Downloading and preparing the candidate…"),
        RuntimeUpdatePhase::Verifying => l.text("正在验证完整性和可执行版本…", "Verifying integrity and executable version…"),
        RuntimeUpdatePhase::Waiting => l.text("等待安全切换；现有任务将继续，资源释放后自动切换。", "Waiting for a safe switch. Current tasks continue; activation follows resource release."),
        RuntimeUpdatePhase::Activated => l.text("已安全切换并保存版本选择。", "Safely activated and saved the version selection."),
        RuntimeUpdatePhase::Failed => l.text("更新未完成，原有效版本和选择仍保留。请重试或复制诊断。", "Update incomplete. The previous version and selection are retained. Retry or copy diagnostics."),
        RuntimeUpdatePhase::RolledBack => l.text("已恢复上次可信版本及选择。", "Restored the previous trusted version and selection."),
        RuntimeUpdatePhase::RecoveryRequired => l.text("所选版本未通过可信验证。请复制诊断并重试组件准备，或恢复推荐版本。", "The selected version failed trust verification. Copy diagnostics and retry setup, or restore the recommended version."),
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
        // Recheck the current query and verified version after the confirmation was opened.
        if let Some(version) = &selection {
            let upstream = self.projection.upstream.snapshot();
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
        let candidate = upgrade_version(&self.projection.upstream.snapshot(), verified_version(Some(snapshot), "yt-dlp"), ameow_next::download::progress::now_ms());
        let mut panel = div().pb(px(16.)).flex().flex_col().gap(px(8.)).text_size(px(12.));
        panel = panel.child(div().text_color(p.neutral).child(l.text("版本信息来源：PyPI · yt-dlp", "Version source: PyPI · yt-dlp")));
        panel = panel.child(div().text_color(p.neutral).child(match update.policy {
            RuntimeSelectionPolicy::FollowAmeow => l.text("版本策略：跟随 Ameow 推荐版本", "Selection: follow Ameow recommended baseline"),
            RuntimeSelectionPolicy::UserSelected => l.text("版本策略：保留用户已验证版本", "Selection: retain the user-verified version"),
        }));
        if let Some(version) = &update.active_version {
            panel = panel.child(div().text_color(p.primary_text()).child(format!("{} {version}", l.text("当前已验证版本：", "Current verified version:"))));
        }
        if update_busy(update.phase) && snapshot.preparation.downloaded_bytes > 0 {
            panel = panel.child(div().text_color(p.neutral).child(format!("{} {:.1} MB", l.text("已准备", "Prepared"), snapshot.preparation.downloaded_bytes as f64 / 1_000_000.)));
        }
        panel = panel.child(div().text_color(if matches!(update.phase, RuntimeUpdatePhase::Failed | RuntimeUpdatePhase::RecoveryRequired) {p.red} else {p.neutral}).child(update_status(update.phase, l)));
        if let Some(version) = &update.requested_version {
            panel = panel.child(div().text_color(p.neutral).child(format!("{} {version}", l.text("请求版本：", "Requested version:"))));
        }
        if update.error.is_some() {
            panel = panel.child(div().text_color(p.red).child(l.text("验证或保存未完成；可复制组件诊断查看原因。", "Verification or saving did not complete. Copy component diagnostics for details.")));
        }
        if self.projection.engine_command_pending {
            panel = panel.child(l.text("正在提交版本操作…", "Submitting the version action…"));
        } else if self.projection.engine_notice == Some(false) {
            panel = panel.child(div().text_color(p.red).child(l.text("操作未受理或状态已变化，请重新查看后重试。", "Action rejected or state changed. Review and try again.")));
        }
        if let Some(selection) = &self.engine_confirmation {
            let title = selection.as_ref().map_or_else(|| l.text("确认恢复 Ameow 推荐版本？", "Restore the Ameow recommended version?").to_owned(), |v| format!("{} {v}？", l.text("确认升级到", "Upgrade to")));
            panel = panel.child(div().p(px(12.)).rounded(px(8.)).bg(p.badge).flex().flex_col().gap(px(8.))
                .child(title)
                .child(l.text("后台验证后安全切换；不会中断活动下载。已验证且缓存完好的版本可在离线重启时使用。", "Activation follows background verification without interrupting downloads. Verified versions with a healthy cache remain usable after an offline restart."))
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
    pub(super) fn check_upstream(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let snapshot = self.projection.queue.as_deref();
        let upstream = self.projection.upstream.snapshot();
        let owner_available = self.projection.upstream_available
            && snapshot.is_some_and(|s| !s.stopping && !s.stopped);
        if !check_enabled(
            owner_available,
            check_is_visible(upstream.pending, self.upstream_feedback),
            upstream.worker_running,
            upstream.cooldown_remaining_ms,
        ) {
            return;
        }
        let accepted = self
            .main
            .update(cx, |main, _| {
                main.downloads
                    .as_ref()
                    .is_some_and(|ui| ui.request_upstream_check())
            })
            .unwrap_or(false);
        self.upstream_feedback = Some((std::time::Instant::now(), accepted));
        window.focus(&self.focus);
        cx.notify();
    }
    pub(super) fn components_page(&self, cx: &mut Context<Self>) -> AnyElement {
        let l = self.projection.language;
        let p = Palette::new(self.projection.night);
        let snapshot = self.projection.queue.as_deref();
        let upstream = self.projection.upstream.snapshot();
        let checking = check_is_visible(upstream.pending, self.upstream_feedback);
        let owner_available = self.projection.upstream_available
            && snapshot.is_some_and(|s| !s.stopping && !s.stopped);
        let enabled = check_enabled(
            owner_available,
            checking,
            upstream.worker_running,
            upstream.cooldown_remaining_ms,
        );
        let mut content = div().flex().flex_col().child(self.page_header(
            l.text("组件与诊断", "Components & diagnostics"),
            l.text(
                "组件版本与运行状态",
                "Component versions and runtime status",
            ),
        ));
        for (index, (name, label)) in [
            ("yt-dlp", "yt-dlp"),
            ("deno", "Deno"),
            ("ffmpeg", "FFmpeg / ffprobe"),
        ]
        .into_iter()
        .enumerate()
        {
            let version =
                verified_version(snapshot, name).unwrap_or(l.text("不可用", "Unavailable"));
            let version_value = div()
                .id(("component-version", index))
                .flex_none()
                .max_w(px(192.))
                .overflow_hidden()
                .whitespace_nowrap()
                .px(px(8.))
                .py(px(2.))
                .rounded(px(4.))
                .bg(p.badge.opacity(0.55))
                .text_size(px(12.))
                .text_color(p.neutral)
                .font(tokens::ui_font())
                .tooltip({
                    let full_version = version.to_owned();
                    move |_, cx| {
                        cx.new(|_| ValueTooltip {
                            path: full_version.clone(),
                            night: p.night,
                        })
                        .into()
                    }
                })
                .child(version_preview(version));
            let mut controls = div()
                .flex()
                .items_center()
                .justify_end()
                .gap(px(12.))
                .min_w(px(0.))
                .child(version_value);
            if name == "yt-dlp" {
                controls = controls.child(self.button(
                    "check-yt-dlp-release",
                    if checking {
                        l.text("检查中…", "Checking…")
                    } else {
                        l.text("检查更新", "Check updates")
                    },
                    enabled,
                    ButtonStyle::Standard,
                    cx,
                    |this, window, cx| this.check_upstream(window, cx),
                ));
            }
            let row = div()
                .min_h(px(64.))
                .flex()
                .items_center()
                .justify_between()
                .gap(px(12.))
                .child(div().flex_none().text_size(px(14.)).child(label))
                .child(controls);
            let mut section = div()
                .flex()
                .flex_col()
                .border_b_1()
                .border_color(p.border)
                .child(row);
            if name == "yt-dlp" {
                let feedback = if checking {
                    Some((
                        l.text(
                            "正在检查上游稳定版本…",
                            "Checking the upstream stable release…",
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
                        .mb(px(16.))
                        .p(px(12.))
                        .rounded(px(8.))
                        .bg(p.badge)
                        .text_size(px(12.))
                        .line_height(px(20.))
                        .flex()
                        .flex_col()
                        .gap(px(4.));
                    if let Some((message, danger)) = feedback {
                        result_panel = result_panel.child(
                            div()
                                .text_color(if danger { p.red } else { p.neutral })
                                .child(message),
                        );
                    }
                    if !checking {
                        if let Some(result) = &upstream.result {
                            let message = match result {
                                Ok(version) => format!(
                                    "{} {version}",
                                    l.text("上游稳定版本：", "Upstream stable release:")
                                ),
                                Err(error) => upstream_error(error, l),
                            };
                            result_panel = result_panel.child(
                                div()
                                    .text_color(if result.is_err() {
                                        p.red
                                    } else {
                                        p.primary_text()
                                    })
                                    .child(message),
                            );
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
                    section = section.child(result_panel);
                }
                section = section.child(self.engine_update_panel(cx));
            }
            content = content.child(section);
        }
        let mut actions = div()
            .flex()
            .flex_wrap()
            .justify_end()
            .gap(px(8.))
            .child(self.button(
                "copy-component-diagnostic",
                l.text("复制组件诊断", "Copy diagnostics"),
                snapshot.is_some() && !self.projection.preparation_copy_pending,
                ButtonStyle::Standard,
                cx,
                |this, _, cx| {
                    let _ = this.main.update(cx, |main, cx| {
                        let now = main.now();
                        if let Some(ui) = &mut main.downloads {
                            ui.copy_preparation_diagnostic(now);
                        }
                        cx.notify();
                    });
                },
            ));
        if self.projection.preparation_retry_available {
            actions = actions.child(self.button(
                "retry-component-preparation",
                l.text("重试组件准备", "Retry setup"),
                true,
                ButtonStyle::Standard,
                cx,
                |this, _, cx| {
                    let _ = this.main.update(cx, |main, cx| {
                        let now = main.now();
                        if let Some(ui) = &mut main.downloads {
                            ui.retry_preparation(now);
                        }
                        cx.notify();
                    });
                },
            ));
        }
        let mut diagnostic = div().pt(px(20.)).flex().flex_col().gap(px(8.)).child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .gap(px(12.))
                .child(
                    div()
                        .text_size(px(14.))
                        .child(l.text("诊断", "Diagnostics")),
                )
                .child(actions),
        );
        let (status, danger) = if snapshot.is_none() && self.projection.error.is_some() {
            (
                l.text("组件状态不可用。", "Component status unavailable."),
                true,
            )
        } else {
            runtime_status(snapshot, l)
        };
        if ["yt-dlp", "deno", "ffmpeg"]
            .iter()
            .any(|name| verified_version(snapshot, name).is_none())
        {
            diagnostic = diagnostic.child(
                div()
                    .text_size(px(12.))
                    .text_color(if danger { p.red } else { p.neutral })
                    .child(status),
            );
        }
        if let Some(failure) = snapshot.and_then(|s| s.preparation.failure.as_ref()) {
            diagnostic = diagnostic.child(
                div()
                    .text_size(px(12.))
                    .text_color(p.red)
                    .child(failure_text(failure.category, l)),
            );
        }
        if let Some((message, danger)) = &self.projection.preparation_status {
            diagnostic = diagnostic.child(
                div()
                    .text_size(px(12.))
                    .text_color(if *danger { p.red } else { p.neutral })
                    .child(action_notice(message, l)),
            );
        }
        content.child(diagnostic).into_any_element()
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
                .contains("Cleanup unconfirmed")
        );
        snapshot.preparation_owner_lost = false;
        snapshot.preparation_held = true;
        assert!(
            runtime_status(Some(&snapshot), Language::English)
                .0
                .contains("Waiting for cleanup")
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
        assert!(
            checked_time(3661000, 3666000, Language::English)
                .contains("01:01:01 UTC · 5 seconds ago")
        );
    }
}
