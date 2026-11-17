use crate::{Prototype, ui_text::Language};
use ameow_next::app_update::{
    Phase,
    service::{Action, View},
};
use gpui::*;
pub fn ready_error_headline(view: &View, l: Language) -> Option<&'static str> {
    if view.update.phase != Phase::Ready {
        return None;
    }
    view.update.error.as_ref().map(|error| {
        if error == "E_APP_UPDATE_AUTHORIZATION_CANCELLED" {
            l.text("已取消系统授权", "Authorization cancelled")
        } else {
            l.text("上次更新未完成", "Update did not finish")
        }
    })
}
pub fn restart_label(view: &View, l: Language) -> &'static str {
    if ready_error_headline(view, l).is_some() {
        l.text("重试", "Retry")
    } else {
        l.text("重启并更新", "Restart and update")
    }
}
pub fn headline(view: &View, l: Language) -> String {
    let text = if view.confirmation {
        l.text("任务仍在进行", "Tasks are still running")
    } else {
        match view.update.phase {
            Phase::Unchecked => l.text("尚未检查更新", "Updates not checked"),
            Phase::NoUpdate => l.text("当前已是最新版本", "Ameow is up to date"),
            Phase::Checking => l.text("正在检查更新…", "Checking for updates…"),
            Phase::Available => l.text("发现新版本", "New version available"),
            Phase::Downloading => l.text("正在后台下载更新", "Downloading update in background"),
            Phase::Verifying => l.text("正在验证更新", "Verifying update"),
            Phase::Ready => ready_error_headline(view, l)
                .unwrap_or_else(|| l.text("新版本已就绪", "Update ready")),
            Phase::WaitingForTasks => l.text("等待任务结束后更新", "Waiting for tasks to finish"),
            Phase::Switching => l.text("正在安全重启", "Restarting safely"),
            Phase::Failed => l.text("更新未完成，请重试", "Update failed. Try again"),
            Phase::RolledBack => l.text("已恢复到可用版本", "Restored the working version"),
            Phase::Unavailable => {
                l.text("当前未配置可信更新源", "Trusted updates are not configured")
            }
        }
    };
    if let Some(v) = &view.update.version {
        format!("{text} · {v}")
    } else {
        text.into()
    }
}
pub fn detail(view: &View, l: Language) -> String {
    if view.confirmation {
        return l
            .text(
                "可等待任务结束后更新，或稍后再更新。下载不会被中断。",
                "Wait for tasks to finish, or update later. Downloads will continue.",
            )
            .into();
    }
    match view.update.phase {
        Phase::Unavailable=>l.text("可信更新源就绪后即可检查；当前不会下载或安装更新。", "Checking will be available when a trusted source is configured. No update will be downloaded or installed.").into(),
        Phase::Downloading=>{
            let bytes=view.update.downloaded as f64/1_000_000.;
            view.update.total.map_or_else(||format!("{bytes:.1} MB"),|n|format!("{bytes:.1} / {:.1} MB · {:.0}%",n as f64/1_000_000.,(view.update.downloaded as f64/n.max(1) as f64*100.).min(100.)))
        }
        Phase::Ready if view.update.error.as_deref() == Some("E_APP_UPDATE_AUTHORIZATION_CANCELLED") =>
            l.text("系统授权已取消，本次操作未继续。准备好后可重试。", "System authorization was cancelled and this request did not continue. Retry when you are ready.").into(),
        Phase::Ready if view.update.error.is_some() =>
            l.text("安装或恢复尚未完成。重试会先检查当前状态，必要时请求系统授权。", "Installation or recovery has not finished. Retrying will check the current state and request system authorization if needed.").into(),
        Phase::Ready=>l.text("更新已下载并通过验证，可安全重启安装。", "Downloaded and verified. Restart to install safely.").into(),
        Phase::WaitingForTasks=>l.text("现有任务继续运行，完成并释放资源后重启。", "Existing tasks will finish and release their resources before restarting.").into(),
        Phase::RolledBack=>l.text("新版未能正常启动，已保留原版本和你的数据。", "The new version could not start. Your working version and data were preserved.").into(),
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
        "app-ready" | "app-conflict" | "app-confirm" | "app-retry" | "app-authorization-cancelled" => Phase::Ready,
        "app-waiting" => Phase::WaitingForTasks,
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
            version: Some("0.3.0".into()),
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
        confirmation: state == "app-confirm",
        launcher: true,
        preferences:if state=="app-paused"{ameow_next::app_update::service::Preferences{auto_check:false,..Default::default()}}else{Default::default()},
        save_error:(state=="app-save-failed").then(||"E_APP_UPDATE_STATE_WRITE".into()),
        ..Default::default()
    }
}
#[cfg(test)]
mod tests {
    use super::{detail, headline, preview_view, ready_error_headline, restart_label};
    use crate::ui_text::Language;

    #[test]
    fn retry_and_cancelled_authorization_do_not_claim_the_update_is_ready() {
        for language in [Language::Chinese, Language::English] {
            let ready = preview_view("app-ready");
            let retry = preview_view("app-retry");
            let cancelled = preview_view("app-authorization-cancelled");
            assert_eq!(ready_error_headline(&ready, language), None);
            assert_eq!(headline(&ready, language), format!("{} · 0.3.0", language.text("新版本已就绪", "Update ready")));
            assert_eq!(restart_label(&ready, language), language.text("重启并更新", "Restart and update"));
            assert!(headline(&retry, language).starts_with(language.text("上次更新未完成", "Update did not finish")));
            assert!(detail(&retry, language).contains(language.text("安装或恢复尚未完成", "Installation or recovery has not finished")));
            assert!(headline(&cancelled, language).starts_with(language.text("已取消系统授权", "Authorization cancelled")));
            assert!(detail(&cancelled, language).contains(language.text("本次操作未继续", "this request did not continue")));
            for view in [&retry, &cancelled] {
                assert_eq!(restart_label(view, language), language.text("重试", "Retry"));
                assert!(!detail(view, language).contains("E_APP_UPDATE"));
            }
        }
    }
}
impl Prototype {
    pub(super) fn app_update_action(&mut self, action: Action, cx: &mut Context<Self>) {
        if let Some(ui) = &self.downloads {
            ui.evidence(
                serde_json::json!({"type":"app-update-action","action":format!("{action:?}")}),
            );
            ui.updates.send(action);
        }
        cx.notify();
    }
}
