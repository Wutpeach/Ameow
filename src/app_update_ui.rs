use crate::{Prototype, ui_text::Language};
use ameow_next::app_update::{
    Phase,
    service::{Action, View},
};
use gpui::*;
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
            Phase::Ready => l.text("新版本已就绪", "Update ready"),
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
        Phase::Ready=>l.text("更新已下载并通过验证，可安全重启安装。", "Downloaded and verified. Restart to install safely.").into(),
        Phase::WaitingForTasks=>l.text("现有任务继续运行，完成并释放资源后重启。", "Existing tasks will finish and release their resources before restarting.").into(),
        Phase::RolledBack=>l.text("新版未能正常启动，已保留原版本和你的数据。", "The new version could not start. Your working version and data were preserved.").into(),
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
        "app-ready" | "app-conflict" | "app-confirm" => Phase::Ready,
        "app-waiting" => Phase::WaitingForTasks,
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
            version: Some("0.3.0".into()),
            downloaded: 24_000_000,
            total: Some(40_000_000),
            error: (state == "app-failed").then(|| "E_APP_UPDATE_SIGNATURE".into()),
        },
        confirmation: state == "app-confirm",
        launcher: true,
        preferences:if state=="app-paused"{ameow_next::app_update::service::Preferences{auto_check:false,..Default::default()}}else{Default::default()},
        save_error:(state=="app-save-failed").then(||"E_APP_UPDATE_STATE_WRITE".into()),
        ..Default::default()
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
