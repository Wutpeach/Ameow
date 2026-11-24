//! Components page consumes Coordinator snapshots; it never opens or owns runtime files.
use super::*;
use ameow_next::download::{
    contract::Downloader,
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

fn upgrade_for(downloader: Downloader, upstream: &ameow_next::download::upstream::UpstreamSnapshot, current: Option<&str>) -> Option<String> {
    use ameow_next::download::upstream::{Installability, compare_versions};
    if upstream.installability != Installability::Installable || upstream.checked_at_ms.is_none() { return None; }
    let version = upstream.result.as_ref()?.as_ref().ok()?;
    (compare_versions(downloader, version, current?) == Some(std::cmp::Ordering::Greater)).then(|| version.clone())
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
            ((s.preparation.phase == PreparationPhase::Ready && !s.preparing)
                || (update_busy(s.runtime_update.phase) && s.runtime_update.active_version.is_some()))
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
fn downloader_index(downloader: Downloader) -> usize { if downloader == Downloader::YtDlp { 0 } else { 1 } }
fn component_check_status(query: &ameow_next::download::upstream::UpstreamSnapshot, feedback: Option<(std::time::Instant, bool)>, l: Language) -> Option<(String, bool)> {
    if check_is_visible(query.pending, feedback) { return Some((l.text("正在检查…", "Checking…").into(), false)); }
    if query.worker_running { return Some((l.text("检查已超时，仍在结束，请稍候。", "Check timed out; still finishing. Please wait.").into(), true)); }
    let message = if query.cache_error { Some((l.text("更新记录不可用，请重新检查。", "Update history is unavailable. Check again.").into(), true)) }
        else if let Some(Err(error)) = &query.result { Some((upstream_error(error, l), true)) }
        else if feedback.is_some_and(|(_, accepted)| !accepted) { Some((l.text("检查未受理，请稍后重试。", "Check not accepted. Try again shortly.").into(), true)) }
        else if query.installability == ameow_next::download::upstream::Installability::RequiresAmeow { Some((l.text("此新版需要更新 Ameow。", "Update Ameow to use this version.").into(), false)) }
        else { None };
    if query.cooldown_remaining_ms > 0 {
        let cooldown = format!("{} {}s", l.text("再次检查需等待", "Check again in"), query.cooldown_remaining_ms.div_ceil(1000));
        return Some(message.map_or_else(|| (cooldown.clone(), false), |(message, danger)| (format!("{message} · {cooldown}"), danger)));
    }
    message
}

impl SettingsWindow {
    pub(super) fn components_unread(&self) -> bool {
        self.projection.extension.unread || [Downloader::YtDlp, Downloader::GalleryDl].into_iter().any(|downloader|
            self.projection.upstream.has_unread(downloader, verified_version(self.projection.queue.as_deref(), downloader.label())))
    }

    pub(super) fn mark_components_seen(&mut self, cx: &mut Context<Self>) {
        if self.projection.preview || !self.components_visible || self.page != Page::Components || self.browser_ui.guide > 0 { return; }
        for downloader in [Downloader::YtDlp, Downloader::GalleryDl] {
            let snapshot = self.projection.upstream.snapshot_for(downloader);
            if let Some(version) = upgrade_for(downloader, &snapshot, verified_version(self.projection.queue.as_deref(), downloader.label())) {
                let key = format!("{}:{version}", downloader.label());
                if !self.components_seen.contains(&key) {
                    self.components_seen.push(key);
                    let checker = self.projection.upstream.clone();
                    cx.background_executor().spawn(async move { checker.mark_seen(downloader, &version); }).detach();
                }
            }
        }
        if self.projection.extension.unread
            && let Some(identity) = &self.projection.extension.available
            && let Some((root, directory)) = self.projection.extension_location.clone() {
            let key = format!("extension:{}:{}", identity.version, identity.source_sha256);
            if !self.components_seen.contains(&key) {
                self.components_seen.push(key);
                cx.background_executor().spawn(async move {
                    let _ = ameow_next::browser_sessions::extension::mark_seen(&root, &directory);
                }).detach();
            }
        }
    }

    fn extension_component(&self, cx: &mut Context<Self>) -> AnyElement {
        let l = self.projection.language;
        let p = Palette::new(self.projection.night);
        let extension = &self.projection.extension;
        let version = extension.available.as_ref().map(|identity| identity.version.as_str())
            .unwrap_or_default();
        let mut row = div().flex().flex_col().border_b_1().border_color(p.border)
            .child(div().min_h(px(tokens::SETTINGS_ROW_HEIGHT)).flex().items_center().justify_between().gap(px(12.))
                .child(div().flex().items_center().gap(px(6.)).text_size(px(13.))
                    .child(svg().path("icons/blocks.svg").size(px(14.)).text_color(p.neutral))
                    .child(l.text("浏览器扩展", "Browser extension"))
                    .when(extension.pending, |s| s.child(component_dot(p, l.text("需要重载扩展", "Extension reload required"), "extension-update-dot"))))
                .child(div().flex().items_center().gap(px(8.))
                    .child(div().text_size(px(12.)).text_color(p.neutral).child(version.to_owned()))
                    .child(self.button("component-extension-setup", l.text("配置扩展", "Set up extension"), true,
                        ButtonStyle::Standard, cx, |this, _, cx| this.open_browser_guide(cx)))));
        if extension.needs_reload {
            row = row.child(div().pb(px(8.)).child(inline_notice(p,
                l.text("请在浏览器扩展管理页重新加载 Ameow，再刷新正在使用的网页。", "Reload Ameow in your browser’s extension manager, then refresh the pages you are using."), false)));
        }
        row.into_any_element()
    }

    fn component_upstream_for(&self, downloader: Downloader) -> ameow_next::download::upstream::UpstreamSnapshot {
        if downloader == Downloader::YtDlp { self.projection.upstream_snapshot() }
        else { self.projection.preview_gallery_upstream.clone().unwrap_or_else(|| self.projection.upstream.snapshot_for(downloader)) }
    }
    fn component_upstream(&self) -> ameow_next::download::upstream::UpstreamSnapshot {
        self.component_upstream_for(self.component_downloader)
    }
    pub(super) fn component_trigger_id(&self) -> &'static str {
        if self.component_downloader == Downloader::YtDlp { "component-details" } else { "gallery-component-details" }
    }
    fn component_has_restore(&self, downloader: Downloader) -> bool {
        self.projection.queue.as_deref().is_some_and(|snapshot| {
            let update = snapshot.component_update(downloader);
            update.policy == RuntimeSelectionPolicy::UserSelected || update.phase == RuntimeUpdatePhase::RecoveryRequired
        })
    }
    pub(super) fn select_engine_version(&mut self, selection: Option<String>, cx: &mut Context<Self>) {
        if self.projection.preview { cx.notify(); return; }
        // The version named on the clicked button must still be current and verified.
        if let Some(version) = &selection {
            let upstream = self.component_upstream();
            if upgrade_for(self.component_downloader, &upstream, verified_version(self.projection.queue.as_deref(), self.component_downloader.label())).as_ref() != Some(version) {
                self.projection.engine_notice = Some(false);
                cx.notify();
                return;
            }
        }
        let downloader = self.component_downloader;
        let _ = self.main.update(cx, |main, cx| {
            let now = main.now();
            if let Some(ui) = &mut main.downloads { ui.request_downloader_update(downloader, selection, now); }
            cx.notify();
        });
        cx.notify();
    }

    pub(super) fn engine_update_available(&self) -> bool {
        self.projection.upstream_available && !self.projection.engine_command_pending
            && self.projection.queue.as_deref().is_some_and(|s| !s.stopping && !s.stopped && !update_busy(s.runtime_update.phase))
    }

    pub(super) fn component_menu_action_ids(&self) -> Vec<&'static str> {
        if self.engine_update_available() && self.component_has_restore(self.component_downloader) { vec!["restore-recommended"] }
        else { Vec::new() }
    }
    fn component_restore_menu(&self, bounds: Rc<Cell<Option<Bounds<Pixels>>>>, cx: &mut Context<Self>) -> AnyElement {
        let l = self.projection.language; let p = Palette::new(self.projection.night);
        div().id("component-restore-menu").w(px(208.)).p(px(4.)).rounded(px(6.)).bg(p.surface)
            .border_1().border_color(p.control_border()).occlude()
            .on_click(|_, _, cx| cx.stop_propagation())
            .on_mouse_down_out(cx.listener(move |this, event: &MouseDownEvent, _, cx| {
                if bounds.get().is_some_and(|bounds| bounds.contains(&event.position)) { return; }
                this.component_menu_open = false; cx.notify();
            }))
            .child(self.button("restore-recommended", l.text("恢复推荐版本", "Restore recommended"),
                !self.passive.get() && self.engine_update_available() && self.component_has_restore(self.component_downloader),
                ButtonStyle::Menu, cx, |this, window, cx| {
                    this.component_menu_open = false;
                    this.select_engine_version(None, cx);
                    if let Some(focus) = this.control_focus.borrow().get(this.component_trigger_id()) { window.focus(focus, cx); }
                })).into_any_element()
    }
    fn can_check_downloader(&self, downloader: Downloader) -> bool {
        let upstream = self.component_upstream_for(downloader);
        check_enabled(self.projection.upstream_available
            && self.projection.queue.as_deref().is_some_and(|s| !s.stopping && !s.stopped),
            check_is_visible(upstream.pending, self.upstream_feedback[downloader_index(downloader)]),
            upstream.worker_running, upstream.cooldown_remaining_ms)
    }
    pub(super) fn can_check_upstream(&self) -> bool {
        [Downloader::YtDlp, Downloader::GalleryDl].into_iter().any(|downloader| self.can_check_downloader(downloader))
    }
    pub(super) fn check_upstream(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.projection.preview { return; }
        for downloader in [Downloader::YtDlp, Downloader::GalleryDl] {
            if !self.can_check_downloader(downloader) { continue; }
            let accepted = self.main.update(cx, |main, _| main.downloads.as_ref()
                .is_some_and(|ui| ui.request_downloader_check(downloader, true))).unwrap_or(false);
            self.upstream_feedback[downloader_index(downloader)] = Some((std::time::Instant::now(), accepted));
        }
        if let Some(focus) = self.control_focus.borrow().get("check-component-updates") { window.focus(focus, cx); }
        cx.spawn(async move |this, cx| {
            cx.background_executor().timer(std::time::Duration::from_millis(710)).await;
            let _ = this.update(cx, |_, cx| cx.notify());
        }).detach();
        cx.notify();
    }
    pub(super) fn components_page(&self, cx: &mut Context<Self>) -> AnyElement {
        let l = self.projection.language; let p = Palette::new(self.projection.night);
        let snapshot = self.projection.queue.as_deref();
        let mut content = div().flex().flex_col()
            .child(div().flex().items_center().justify_between().pb(px(8.))
                .child(div().text_size(px(13.)).font_weight(FontWeight::MEDIUM)
                    .child(l.text("组件", "Components")))
                .child(self.icon_button("check-component-updates", "icons/refresh-cw.svg",
                    l.text("检查更新", "Check updates"), self.can_check_upstream(), cx,
                    |this, window, cx| this.check_upstream(window, cx))))
            .child(self.extension_component(cx));
        let components = [("yt-dlp", "yt-dlp"), ("gallery-dl", "gallery-dl"), ("deno", "Deno"), ("ffmpeg", "FFmpeg / ffprobe")];
        for (index, (name, label)) in components.into_iter().enumerate() {
            let version = verified_version(snapshot, name).unwrap_or(l.text("不可用", "Unavailable"));
            let version_value = div().id(("component-version", index)).text_size(px(12.)).text_color(p.neutral)
                .when(version_preview(version) != version, |s| s.tooltip_above(&self.tooltips, {
                    let full = version.to_owned(); move |_, cx| cx.new(|_| ValueTooltip { path: full.clone(), night: p.night }).into()
                })).child(version_preview(version));
            let downloader = if name == "gallery-dl" { Downloader::GalleryDl } else { Downloader::YtDlp };
            let updatable = matches!(name, "yt-dlp" | "gallery-dl");
            let upstream = self.component_upstream_for(downloader);
            let candidate = updatable.then(|| upgrade_for(downloader, &upstream, verified_version(snapshot, name))).flatten();
            let mut controls = div().flex_none().flex().items_center().gap(px(8.)).child(version_value);
            if let Some(version) = &candidate {
                let version = version.clone();
                controls = controls.child(self.button(if downloader == Downloader::YtDlp { "update-video-downloader" } else { "update-gallery-downloader" },
                    format!("{} {version}", l.text("更新至", "Update to")),
                    self.engine_update_available() && !upstream.pending && !upstream.worker_running,
                    ButtonStyle::Standard, cx, move |this, _, cx| {
                        this.component_downloader = downloader; this.select_engine_version(Some(version.clone()), cx);
                    }));
            }
            if updatable && self.component_has_restore(downloader) {
                let was_open = self.component_menu_open && self.component_downloader == downloader;
                let bounds = Rc::new(Cell::new(None::<Bounds<Pixels>>)); let measured = bounds.clone();
                let id = if downloader == Downloader::YtDlp { "component-details" } else { "gallery-component-details" };
                let trigger = self.icon_button(id, "icons/ellipsis.svg", format!("{} · {}", label, l.text("更多", "More")),
                    self.engine_update_available(), cx, move |this, window, cx| {
                        this.component_downloader = downloader; this.component_menu_open = !was_open;
                        if let Some(focus) = this.control_focus.borrow().get(id) { window.focus(focus, cx); } cx.notify();
                    });
                let mut anchor = div().relative()
                    .on_children_prepainted(move |children, _, _| measured.set(children.first().copied()))
                    .id(("component-anchor", index))
                    .when(!self.passive.get() && self.component_downloader == downloader, |s| s.track_focus(&self.component_menu_focus))
                    .child(trigger);
                let presence = self.motion.presence(if downloader == Downloader::YtDlp { "component-version-menu" } else { "gallery-component-menu" }, was_open && !self.passive.get());
                if presence.visible() && self.component_downloader == downloader {
                    let passive = self.passive.replace(!was_open || self.passive.get());
                    let menu = self.component_restore_menu(bounds, cx); self.passive.set(passive);
                    anchor = anchor.child(div().absolute().left(px(0.)).top(px(36.)).w(px(208.))
                        .child(deferred(anchored().anchor(gpui::Anchor::TopRight).snap_to_window_with_margin(Edges::all(px(12.)))
                            .child(div().relative().top(px(presence.travel(-4.))).opacity(presence.alpha).child(menu)))));
                }
                controls = controls.child(anchor);
            }
            let mut section = div().flex().flex_col().border_b_1().border_color(p.border)
                .child(div().min_h(px(tokens::SETTINGS_ROW_HEIGHT)).flex().items_center().justify_between().gap(px(12.))
                    .child(div().flex().items_center().gap(px(6.)).text_size(px(13.)).child(label)
                        .when(candidate.is_some(), |s| s.child(component_dot(p, l.text("有可用更新", "Update available"),
                            if downloader == Downloader::YtDlp { "video-update-dot" } else { "gallery-update-dot" }))))
                    .child(controls));
            if updatable {
                let feedback = self.upstream_feedback[downloader_index(downloader)];
                let message = component_check_status(&upstream, feedback, l);
                if let Some((message, danger)) = message {
                    section = section.child(div().pb(px(8.)).text_size(px(12.)).text_color(p.neutral)
                        .when(!danger, |s| s.child(message.clone()))
                        .when(danger, |s| s.child(inline_notice(p, message, true))));
                }
                if let Some(snapshot) = snapshot {
                    let update = snapshot.component_update(downloader);
                    let message = update_status(update.phase, l);
                    if !message.is_empty() { section = section.child(div().pb(px(8.)).text_size(px(12.)).text_color(p.neutral).child(message)); }
                }
            }
            content = content.child(section);
        }
        #[cfg(target_os = "macos")]
        if let Some(snapshot) = snapshot {
            for (name, version) in snapshot.verified_runtime_versions.iter().filter(|(name, _)| !["yt-dlp", "gallery-dl", "deno", "ffmpeg"].contains(&name.as_str())) {
                content = content.child(div().min_h(px(tokens::SETTINGS_ROW_HEIGHT)).flex().items_center().justify_between()
                    .border_b_1().border_color(p.border).text_size(px(13.)).child(name.clone())
                    .child(div().text_size(px(12.)).text_color(p.neutral).child(version.clone())));
            }
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
            || snapshot.is_some() && ["yt-dlp", "gallery-dl", "deno", "ffmpeg"].iter()
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
    fn cached_candidate_survives_refresh_but_failure_does_not_claim_success() {
        let mut query = ameow_next::download::upstream::UpstreamSnapshot {
            installability: ameow_next::download::upstream::Installability::Installable,
            checked_at_ms: Some(1), result: Some(Ok("2026.10.30".into())), ..Default::default()
        };
        let candidate = |query: &ameow_next::download::upstream::UpstreamSnapshot, current| upgrade_for(Downloader::YtDlp, query, current);
        assert_eq!(candidate(&query, Some("2026.08.19")), Some("2026.10.30".into()));
        assert!(candidate(&query, None).is_none());
        assert!(candidate(&query, Some("2026.10.30")).is_none());
        assert!(candidate(&query, Some("2026.11.01")).is_none());
        query.pending = true; query.worker_running = true;
        assert!(candidate(&query, Some("2026.08.19")).is_some());
        query.result = Some(Err(UpstreamError::Timeout));
        assert!(candidate(&query, Some("2026.08.19")).is_none());
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

#[cfg(test)]
mod independent_check_feedback_tests {
    use super::*;
    #[::core::prelude::v1::test]
    fn each_downloader_keeps_its_own_busy_failure_and_cooldown_feedback() {
        let video=ameow_next::download::upstream::UpstreamSnapshot { pending:true, ..Default::default() };
        let gallery=ameow_next::download::upstream::UpstreamSnapshot { result:Some(Err(UpstreamError::Network)),cooldown_remaining_ms:5000,..Default::default() };
        for language in [Language::Chinese,Language::English] {
            let feedback=[Some((std::time::Instant::now(),true)),None];
            assert_eq!(component_check_status(&video,feedback[downloader_index(Downloader::YtDlp)],language).unwrap().0,language.text("正在检查…","Checking…"));
            let(message,danger)=component_check_status(&gallery,feedback[downloader_index(Downloader::GalleryDl)],language).unwrap();
            assert!(danger && message.contains("5s"));assert!(message.contains(language.text("网络","network")));
            assert!(!check_enabled(true,video.pending,video.worker_running,0));
            assert!(check_enabled(true,false,false,0));
            assert!(!check_enabled(true,false,false,gallery.cooldown_remaining_ms));
        }
    }
}
