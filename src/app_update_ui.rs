use crate::{Prototype, ui_text::Language};
use ameow_next::app_update::{
    Phase,
    service::{Action, View},
};
use gpui::*;
pub fn check_feedback(view: &View, l: Language) -> Option<&'static str> {
    if view.check_error.is_none() || matches!(view.update.phase,
        Phase::Checking | Phase::Failed | Phase::RolledBack | Phase::Unavailable) { return None; }
    Some(if view.update.phase == Phase::Ready {
        l.text("暂时无法检查新版本，已下载的更新仍可安装。", "Could not check for new versions. The downloaded update is still available to install.")
    } else {
        l.text("检查更新未完成，请重试。", "Update check did not finish. Try again.")
    })
}
pub fn ready_error_headline(view: &View, l: Language) -> Option<&'static str> {
    if view.update.phase != Phase::Ready { return None; }
    view.update.error.as_ref().map(|error| {
        if error == "E_APP_UPDATE_AUTHORIZATION_CANCELLED" {
            l.text("已取消系统授权", "Authorization cancelled")
        } else { l.text("上次更新未完成", "Update did not finish") }
    })
}
pub fn restart_label(view: &View, l: Language) -> &'static str {
    if ready_error_headline(view, l).is_some() { l.text("重试", "Retry") }
    else { l.text("重启更新", "Restart & update") }
}
pub fn popup_restart_available(view: &View) -> bool {
    matches!(view.update.phase, Phase::Ready | Phase::WaitingForTasks) && view.launcher
}
pub fn popup_action(view: &View) -> Option<Action> {
    match view.update.phase {
        Phase::Available => Some(Action::Download),
        Phase::Ready if view.launcher => Some(Action::Restart),
        Phase::Failed | Phase::RolledBack if view.check_retry_secs == 0 => Some(Action::Check),
        _ => None,
    }
}
pub fn full_label(view: &View, l: Language) -> &'static str {
    match view.update.phase {
        Phase::Available => l.text("下载更新", "Download update"),
        Phase::Downloading => l.text("正在下载更新", "Downloading"),
        Phase::Verifying => l.text("正在验证更新", "Verifying"),
        Phase::Ready if popup_restart_available(view) => restart_label(view, l),
        Phase::WaitingForTasks => l.text("已安排更新", "Update scheduled"),
        Phase::Switching => l.text("正在安全重启", "Restarting safely"),
        Phase::Failed | Phase::RolledBack => l.text("重试更新", "Retry update"),
        _ => l.text("查看应用更新", "View app update"),
    }
}
pub fn popup_label(view: &View, l: Language) -> &'static str {
    match view.update.phase {
        Phase::Ready | Phase::WaitingForTasks if popup_restart_available(view) => restart_label(view, l),
        Phase::Switching => l.text("正在安全重启", "Restarting safely"),
        Phase::RolledBack => l.text("已恢复可用版本", "Working version restored"),
        _ => l.text("查看应用更新", "View app update"),
    }
}
pub fn popup_icon(view: &View) -> &'static str {
    match view.update.phase {
        Phase::Switching => "icons/clock.svg",
        Phase::Failed | Phase::RolledBack => "icons/rotate-ccw.svg",
        _ => "icons/circle-arrow-up.svg",
    }
}
pub fn headline(view: &View, l: Language) -> String {
    let text = match view.update.phase {
        Phase::Unchecked => l.text("尚未检查更新", "Updates not checked"),
        Phase::NoUpdate => l.text("当前已是最新版本", "Ameow is up to date"),
        Phase::Checking => l.text("正在检查更新…", "Checking for updates…"),
        Phase::Available => l.text("发现新版本", "New version available"),
        Phase::Downloading => l.text("正在后台下载更新", "Downloading update in background"),
        Phase::Verifying => l.text("正在验证更新", "Verifying update"),
        Phase::Ready => ready_error_headline(view, l).unwrap_or_else(|| l.text("新版本已就绪", "Update ready")),
        Phase::WaitingForTasks => l.text("新版本已就绪", "Update ready"),
        Phase::Switching => l.text("正在安全重启", "Restarting safely"),
        Phase::Failed => l.text("更新未完成，请重试", "Update failed. Try again"),
        Phase::RolledBack => l.text("已恢复到可用版本", "Restored the working version"),
        Phase::Unavailable => {
            l.text("当前未配置可信更新源", "Trusted updates are not configured")
        }
    };
    if let Some(v) = &view.update.version {
        format!("{text} · {v}")
    } else {
        text.into()
    }
}
pub fn detail(view: &View, l: Language) -> String {
    match view.update.phase {
        Phase::Downloading=>{
            let bytes=view.update.downloaded as f64/1_000_000.;
            view.update.total.map_or_else(||format!("{bytes:.1} MB"),|n|format!("{bytes:.1} / {:.1} MB · {:.0}%",n as f64/1_000_000.,(view.update.downloaded as f64/n.max(1) as f64*100.).min(100.)))
        }
        Phase::Ready | Phase::Available if view.update.error.as_deref() == Some("E_APP_UPDATE_AUTHORIZATION_CANCELLED") =>
            l.text("系统授权已取消，本次操作未继续。准备好后可重试。", "System authorization was cancelled and this request did not continue. Retry when you are ready.").into(),
        Phase::Ready | Phase::Available if view.update.error.is_some() =>
            l.text("安装或恢复尚未完成。重试会先检查当前状态，必要时请求系统授权。", "Installation or recovery has not finished. Retrying will check the current state and request system authorization if needed.").into(),
        Phase::Ready if !view.launcher =>
            l.text("请通过 Ameow 启动入口重新打开后更新。", "Open Ameow through its launcher to install the update.").into(),
        Phase::WaitingForTasks =>
            l.text("任务完成且资源释放后更新，当前下载会继续。", "The app will update after tasks finish and release their resources. Current downloads will continue.").into(),
        Phase::RolledBack=>l.text("新版启动失败，数据已保留。", "The new version could not start. Your data was preserved.").into(),
        Phase::Failed=>{
            let e=view.update.error.as_deref().unwrap_or("");
            if e.contains("MACOS_INSTALL_UNAVAILABLE") {l.text("更新已验证，但暂时无法自动安装。", "The update was verified, but automatic installation is not available yet.").into()}
            else if e.contains("AUTHORIZATION_REQUIRED") {l.text("安装目录没有足够权限，当前版本未更改。", "The installation folder is not writable. The current version was not changed.").into()}
            else if e.contains("BUNDLE_IMMUTABLE") {l.text("应用或安装目录已锁定，当前版本未更改。", "The app or installation folder is locked. The current version was not changed.").into()}
            else if e.contains("HELPER_MISSING") {l.text("更新包不完整，原版本仍可使用。", "The update package is incomplete. The current version is still available.").into()}
            else if e.contains("SIGNATURE")||e.contains("CODESIGN")||e.contains("HASH")||e.contains("IDENTITY")||e.contains("REPLAY")||e.contains("ZIP_")||e.contains("BUNDLE_")||e.contains("ARCH") {l.text("更新未通过安全验证，原版本仍可使用。", "The update failed security checks. The current version is still available.").into()}
            else {l.text("无法获取更新，请检查网络或稍后重试。", "Could not get the update. Check your connection or try again later.").into()}
        }
        _=>String::new(),
    }
}
pub fn preview_view(state: &str) -> View {
    use ameow_next::app_update::Snapshot;
    let phase = match state {
        "app-checking" => Phase::Checking,
        "app-available" => Phase::Available,
        "app-downloading" => Phase::Downloading,
        "app-verifying" => Phase::Verifying,
        "app-ready" | "app-preparing" | "app-self-check" | "app-conflict" | "app-conflict-copied" | "app-help" | "app-retry" | "app-authorization-cancelled" | "app-auto-notify" | "app-auto-quiet" | "app-manual-notify" | "app-manual-quiet" => Phase::Ready,
        "app-waiting" => Phase::WaitingForTasks,
        "app-update-feedback" => Phase::WaitingForTasks,
        "app-switching" => Phase::Switching,
        "app-failed" | "app-authorization-required" | "app-immutable" => Phase::Failed,
        "app-rollback" => Phase::RolledBack,
        "app-unavailable" => Phase::Unavailable,
        "app-current" => Phase::NoUpdate,
        _ => Phase::Unchecked,
    };
    View {
        update: Snapshot {
            phase,
            version: Some("0.5.1".into()),
            downloaded: 24_000_000,
            total: Some(40_000_000),
            error: match state {
                "app-failed" => Some("E_APP_UPDATE_SIGNATURE".into()),
                "app-authorization-required" => Some("E_APP_UPDATE_AUTHORIZATION_REQUIRED".into()),
                "app-immutable" => Some("E_APP_UPDATE_BUNDLE_IMMUTABLE".into()),
                "app-retry" => Some("E_APP_UPDATE_PATH_OPEN: No such file or directory (os error 2)".into()),
                "app-authorization-cancelled" => Some("E_APP_UPDATE_AUTHORIZATION_CANCELLED".into()),
                _ => None,
            },
        },
        launcher: true,
        check_retry_secs: if state == "app-check-cooldown" { 8 } else { 0 },
        preferences:ameow_next::app_update::service::Preferences {
            auto_update: !matches!(state,"app-paused" | "app-manual-notify" | "app-manual-quiet"),
            notify_updates: !matches!(state,"app-auto-quiet" | "app-manual-quiet"),
        },
        save_error:(state=="app-save-failed").then(||"E_APP_UPDATE_STATE_WRITE".into()),
        ..Default::default()
    }
}
#[cfg(test)]
mod update_feedback_tests {
    use super::{detail, headline, preview_view, ready_error_headline, restart_label};
    use crate::ui_text::Language;

    #[test]
    fn retry_and_cancelled_authorization_do_not_claim_the_update_is_ready() {
        for language in [Language::Chinese, Language::English] {
            let ready = preview_view("app-ready");
            let retry = preview_view("app-retry");
            let cancelled = preview_view("app-authorization-cancelled");
            assert_eq!(ready_error_headline(&ready, language), None);
            assert_eq!(headline(&ready, language), format!("{} · {}", language.text("新版本已就绪", "Update ready"), ready.update.version.as_deref().unwrap()));
            assert_eq!(restart_label(&ready, language), language.text("重启更新", "Restart & update"));
            assert!(headline(&retry, language).starts_with(language.text("上次更新未完成", "Update did not finish")));
            assert!(detail(&retry, language).contains(language.text("安装或恢复尚未完成", "Installation or recovery has not finished")));
            assert!(headline(&cancelled, language).starts_with(language.text("已取消系统授权", "Authorization cancelled")));
            assert!(detail(&cancelled, language).contains(language.text("本次操作未继续", "this request did not continue")));
            for view in [&retry, &cancelled] {
                assert_eq!(restart_label(view, language), language.text("重试", "Retry"));
                assert!(!detail(view, language).contains("E_APP_UPDATE"));
                let mut available=view.clone();
                available.update.phase=ameow_next::app_update::Phase::Available;
                assert!(headline(&available,language).starts_with(language.text("发现新版本", "New version available")));
                assert_eq!(detail(&available,language),detail(view,language));
                assert!(matches!(super::popup_action(&available),Some(ameow_next::app_update::service::Action::Download)));
            }
        }
    }
}
impl Prototype {
    pub(super) fn full_update_action(&mut self, cx: &mut Context<Self>) {
        if let Some(view) = self.downloads.as_ref().map(|ui| ui.updates.snapshot())
            && view.full_attention()
            && let Some(action) = popup_action(&view)
        {
            self.app_update_action(action, cx);
        }
    }
    pub(super) fn app_update_action(&mut self, action: Action, cx: &mut Context<Self>) -> bool {
        let accepted = if let Some(ui) = &self.downloads {
            ui.updates.user_interaction();
            ui.evidence(
                serde_json::json!({"type":"app-update-action","action":format!("{action:?}")}),
            );
            ui.updates.send(action)
        } else { false };
        cx.notify();
        accepted
    }
}

#[cfg(test)]
mod tests {
    use super::{detail, full_label, headline, popup_action, popup_icon, popup_label, popup_restart_available, preview_view};
    use ameow_next::app_update::{Phase, service::Action};
    use crate::ui_text::Language;

    #[test]
    fn ready_and_scheduled_updates_keep_the_same_ui_and_require_a_launcher() {
        for state in ["app-ready", "app-preparing", "app-self-check", "app-conflict", "app-conflict-copied"] {
            let mut view = preview_view(state);
            assert!(popup_restart_available(&view));
            assert_eq!(popup_label(&view, Language::Chinese), "重启更新");
            assert_eq!(popup_label(&view, Language::English), "Restart & update");
            view.launcher = false;
            assert!(!popup_restart_available(&view));
            assert_eq!(popup_label(&view, Language::Chinese), "查看应用更新");
        }
        let ready = preview_view("app-ready");
        let scheduled = preview_view("app-update-feedback");
        for language in [Language::Chinese, Language::English] {
            assert_eq!(headline(&ready, language), headline(&scheduled, language));
            assert!(detail(&scheduled, language).contains(language.text("当前下载会继续", "Current downloads will continue")));
            assert_eq!(full_label(&scheduled, language),language.text("已安排更新", "Update scheduled"));
            assert_eq!(popup_label(&scheduled, language),popup_label(&ready,language));
        }
        assert_eq!(popup_icon(&ready), popup_icon(&scheduled));
        for state in ["app-switching", "app-rollback", "app-failed"] {
            assert!(!popup_restart_available(&preview_view(state)));
        }
        assert_eq!(popup_label(&preview_view("app-rollback"), Language::Chinese), "已恢复可用版本");
        assert_eq!(full_label(&preview_view("app-rollback"), Language::Chinese), "重试更新");
    }
    #[test]
    fn popup_actions_follow_current_phase_and_never_act_on_hover_or_pending_work() {
        assert!(matches!(popup_action(&preview_view("app-available")),Some(Action::Download)));
        assert!(matches!(popup_action(&preview_view("app-ready")),Some(Action::Restart)));
        for state in ["app-failed","app-rollback"] {
            assert!(matches!(popup_action(&preview_view(state)),Some(Action::Check)));
        }
        for state in ["app-checking","app-downloading","app-verifying","app-waiting","app-switching","app-current"] {
            assert!(popup_action(&preview_view(state)).is_none(),"{state}");
        }
        let mut failed=preview_view("app-failed");failed.check_retry_secs=1;
        assert!(popup_action(&failed).is_none());
        let mut ready=preview_view("app-ready");ready.launcher=false;
        assert!(popup_action(&ready).is_none());
        for state in ["app-auto-notify","app-auto-quiet","app-manual-notify","app-manual-quiet"] {
            let view=preview_view(state);
            assert_eq!(view.update.phase,Phase::Ready);
            assert_eq!(view.full_attention(),view.preferences.notify_updates);
            assert!(matches!(popup_action(&view),Some(Action::Restart)));
        }
    }
    #[test]
    fn a_failed_recheck_keeps_the_valid_install_action_and_accurate_feedback() {
        let mut view=preview_view("app-ready");
        view.check_error=Some("E_APP_UPDATE_CHECK_FAILED".into());
        for language in [Language::Chinese,Language::English] {
            assert!(headline(&view,language).starts_with(language.text("新版本已就绪","Update ready")));
            assert!(super::check_feedback(&view,language).unwrap().contains(language.text("已下载的更新仍可安装","downloaded update is still available to install")));
            assert_eq!(super::restart_label(&view,language),language.text("重启更新","Restart & update"));
            let mut blocked=view.clone();
            blocked.update.error=Some("E_APP_UPDATE_AUTHORIZATION_CANCELLED".into());
            assert!(headline(&blocked,language).starts_with(language.text("已取消系统授权","Authorization cancelled")));
            assert_eq!(super::check_feedback(&blocked,language),super::check_feedback(&view,language));
            assert_eq!(super::restart_label(&blocked,language),language.text("重试","Retry"));
            let mut failed=preview_view("app-failed");failed.check_error=view.check_error.clone();
            assert!(super::check_feedback(&failed,language).is_none());
        }
        assert!(matches!(popup_action(&view),Some(Action::Restart)));
    }
}
