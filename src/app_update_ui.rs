use crate::{Prototype, ui_text::Language};
use ameow_next::app_update::{
    Phase,
    service::{Action, View},
};
use gpui::*;
pub fn popup_restart_available(view: &View) -> bool {
    matches!(view.update.phase, Phase::Ready | Phase::WaitingForTasks) && view.launcher
}
pub fn popup_label(view: &View, l: Language) -> &'static str {
    match view.update.phase {
        Phase::Ready | Phase::WaitingForTasks if popup_restart_available(view) => l.text("重启更新", "Restart & update"),
        Phase::Switching => l.text("正在安全重启", "Restarting safely"),
        Phase::RolledBack => l.text("已恢复可用版本", "Working version restored"),
        _ => l.text("查看应用更新", "View app update"),
    }
}
pub fn popup_icon(view: &View) -> &'static str {
    match view.update.phase {
        Phase::Switching => "icons/clock.svg",
        Phase::RolledBack => "icons/rotate-ccw.svg",
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
        Phase::Ready | Phase::WaitingForTasks => l.text("新版本已就绪", "Update ready"),
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
        Phase::RolledBack=>l.text("新版启动失败，数据已保留。", "The new version could not start. Your data was preserved.").into(),
        Phase::Failed=>{
            let e=view.update.error.as_deref().unwrap_or("");
            if e.contains("SIGNATURE")||e.contains("HASH")||e.contains("IDENTITY")||e.contains("REPLAY") {l.text("更新未通过安全验证，原版本仍可使用。", "The update failed security checks. The current version is still available.").into()}
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
        "app-ready" | "app-preparing" | "app-conflict" | "app-conflict-copied" | "app-help" => Phase::Ready,
        "app-update-feedback" => Phase::WaitingForTasks,
        "app-switching" => Phase::Switching,
        "app-failed" => Phase::Failed,
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
            error: (state == "app-failed").then(|| "E_APP_UPDATE_SIGNATURE".into()),
        },
        launcher: true,
        check_retry_secs: if state == "app-check-cooldown" { 8 } else { 0 },
        preferences:if state=="app-paused"{ameow_next::app_update::service::Preferences{auto_check:false,..Default::default()}}else{Default::default()},
        save_error:(state=="app-save-failed").then(||"E_APP_UPDATE_STATE_WRITE".into()),
        ..Default::default()
    }
}
impl Prototype {
    pub(super) fn app_update_action(&mut self, action: Action, cx: &mut Context<Self>) -> bool {
        let accepted = if let Some(ui) = &self.downloads {
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
    use super::{detail, headline, popup_icon, popup_label, popup_restart_available, preview_view};
    use crate::ui_text::Language;

    #[test]
    fn ready_and_scheduled_updates_keep_the_same_ui_and_require_a_launcher() {
        for state in ["app-ready", "app-preparing", "app-conflict", "app-conflict-copied", "app-update-feedback"] {
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
            assert!(detail(&scheduled, language).is_empty());
        }
        assert_eq!(popup_icon(&ready), popup_icon(&scheduled));
        for state in ["app-switching", "app-rollback", "app-failed"] {
            assert!(!popup_restart_available(&preview_view(state)));
        }
        assert_eq!(popup_label(&preview_view("app-rollback"), Language::Chinese), "已恢复可用版本");
    }
}
