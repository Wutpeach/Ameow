//! Production GPUI command boundary. Initialization, persistence and polling stay off the UI.
use ameow_next::download::{
    preparation::{ErrorCategory, PreparationPhase, PreparationSnapshot, PreparationStage},
    queue::{
        CommandReply, JobPhase, JobSnapshot, QueueCommand, QueueSnapshot,
    },
    request::Quality,
    runtime::RuntimeManager,
    settings::Settings,
};
use std::{
    fs::File,
    io::Write,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        mpsc::{self, Receiver, SyncSender},
    },
    time::{Duration, Instant},
};

pub enum UiReply {
    Reply(CommandReply),
    PreparationRetry(CommandReply),
    Settings(CommandReply),
    Diagnostic { job: u64, text: String },
    StartupError(String),
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ExitAction {
    Quit,
    Stop,
    Confirm,
}
#[derive(Default)]
struct ExitIntent {
    pending: bool,
}
impl ExitIntent {
    fn request(&mut self) {
        self.pending = true;
    }
    fn resolve(
        &mut self,
        snapshot: Option<&QueueSnapshot>,
        startup_failed: bool,
    ) -> Option<ExitAction> {
        if !self.pending {
            return None;
        }
        let action = if startup_failed {
            ExitAction::Quit
        } else {
            // Unknown startup state is not active work or a safe-stop acknowledgement.
            let snapshot = snapshot?;
            if snapshot.stopped {
                ExitAction::Quit
            } else if snapshot.unfinished == 0
                && !snapshot.preparing
                && !snapshot.preparation_held
                && !snapshot.preparation_owner_lost
            {
                ExitAction::Stop
            } else {
                ExitAction::Confirm
            }
        };
        self.pending = false;
        Some(action)
    }
}
pub struct DownloadUi {
    commands: SyncSender<QueueCommand>,
    evidence: SyncSender<serde_json::Value>,
    last_evidence_ms: u64,
    replies: Receiver<UiReply>,
    latest: Arc<Mutex<Option<Arc<QueueSnapshot>>>>,
    pub snapshot: Option<Arc<QueueSnapshot>>,
    pub startup_error: Option<String>,
    pub settings_pending: bool,
    pub folder_pending: bool,
    pub queue_open: bool,
    pub exit_open: bool,
    pub exit_when_stopped: bool,
    exit_intent: ExitIntent,
    pub hidden: bool,
    pub selected_job: Option<u64>,
    selected_presentation: Option<(u64, u32, JobPhase)>,
    pub selected_fraction: Option<f32>,
    pub seen_terminals: std::collections::HashSet<u64>,
    pub feedback: Option<(String, u64)>,
    pub preparation_hovered: bool,
    preparation_retry_pending: bool,
    preparation_copied_at: Option<u64>,
}
impl DownloadUi {
    pub fn start() -> Self {
        let (commands, receiver) = mpsc::sync_channel(64);
        let (evidence, evidence_receiver) = mpsc::sync_channel(64);
        let (sender, replies) = mpsc::channel();
        let latest = Arc::new(Mutex::new(None));
        let projection = latest.clone();
        let error_sender = sender.clone();
        let result = std::thread::Builder::new().name("gpui-download-commands".into()).spawn(move || {
            let args: Vec<_> = std::env::args().collect();
            let value = |name: &str| args.iter().position(|arg| arg == name).and_then(|index| args.get(index + 1)).cloned();
            let setup = (|| {
                let root = value("--runtime-root").map(PathBuf::from).map_or_else(RuntimeManager::default_root, Ok)?;
                let settings_path = value("--settings-path").map(PathBuf::from).unwrap_or_else(|| root.join("ui-settings.json"));
                let output_dir = value("--output").map(PathBuf::from).map_or_else(crate::tray::downloads_directory, Ok)?;
                ameow_next::download::composition::download_coordinator(root, settings_path, Settings { quality: Quality::Balanced, output_dir })
            })();
            let coordinator = match setup {
                Ok(coordinator) => coordinator,
                Err(error) => { let _ = sender.send(UiReply::StartupError(error)); return; }
            };
            let mut evidence = value("--queue-evidence").and_then(|path| File::create(path).ok());
            let started = Instant::now();
            let mut last_revision = None;
            for pair in args.windows(2).filter(|pair| pair[0] == "--queue-submit") {
                let command = QueueCommand::Submit { url:pair[1].clone() };
                append_evidence(&mut evidence, &started, command_summary(&command));
                let reply = coordinator.apply(command);
                append_evidence(&mut evidence, &started, reply_summary(&reply));
                let _ = sender.send(UiReply::Reply(reply));
            }
            let mut disconnected = false;
            loop {
                match receiver.recv_timeout(Duration::from_millis(80)) {
                    Ok(command) => {
                        append_evidence(&mut evidence, &started, command_summary(&command));
                        let diagnostic_job = match &command { QueueCommand::CopyDiagnostic(job) => Some(*job), _ => None };
                        let saving = matches!(&command, QueueCommand::SaveSettings(_));
                        let retrying_preparation = matches!(&command, QueueCommand::RetryPreparation);
                        let reply = coordinator.apply(command);
                        append_evidence(&mut evidence, &started, reply_summary(&reply));
                        let event = match reply {
                            CommandReply::Diagnostic(text) => UiReply::Diagnostic { job: diagnostic_job.unwrap_or(0), text },
                            reply if saving => UiReply::Settings(reply),
                            reply if retrying_preparation => UiReply::PreparationRetry(reply),
                            reply => UiReply::Reply(reply),
                        };
                        let _ = sender.send(event);
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(mpsc::RecvTimeoutError::Disconnected) => { disconnected = true; coordinator.stop(); std::thread::sleep(Duration::from_millis(80)); }
                }
                for event in evidence_receiver.try_iter() { append_evidence(&mut evidence, &started, event); }
                let snapshot = Arc::new(coordinator.snapshot());
                if last_revision != Some(snapshot.revision) {
                    if let Some(file) = &mut evidence {
                        // Local review evidence intentionally excludes media URLs and private directories.
                        let jobs: Vec<_> = snapshot.jobs.iter().map(|job| serde_json::json!({
                            "job":job.job_id, "revision":job.revision, "attempt":job.attempt, "phase":job.phase, "accepted_quality":job.accepted.intent.quality,
                            "slot_owned":job.slot_owned, "resources_released":job.resources_released,
                            "start_order":job.start_order, "terminal_count":job.terminal_count, "events":job.events,
                            "transfer_progress":job.transfer_progress
                        })).collect();
                        let _ = writeln!(file, "{}", serde_json::json!({"type":"queue","elapsed_ms":started.elapsed().as_millis(),
                            "revision":snapshot.revision,"unfinished":snapshot.unfinished,"failures":snapshot.failures,
                            "active_slots":snapshot.active_slots,"main_job":snapshot.main_job,"stopping":snapshot.stopping,
                            "stopped":snapshot.stopped,"preparing":snapshot.preparing,"preparation_held":snapshot.preparation_held,
                            "preparation_owner_lost":snapshot.preparation_owner_lost,"preparation":snapshot.preparation,"jobs":jobs})).and_then(|_| file.flush());
                    }
                    last_revision = Some(snapshot.revision);
                }
                let stopped = snapshot.stopped;
                *projection.lock().unwrap_or_else(|error| error.into_inner()) = Some(snapshot);
                if stopped && disconnected { break; }
            }
        });
        if result.is_err() {
            let _ = error_sender.send(UiReply::StartupError(
                "无法启动下载命令处理，请重新打开 Ameow".into(),
            ));
        }
        Self {
            commands,
            evidence,
            last_evidence_ms: 0,
            replies,
            latest,
            snapshot: None,
            startup_error: None,
            settings_pending: false,
            folder_pending: false,
            queue_open: false,
            exit_open: false,
            exit_when_stopped: false,
            exit_intent: ExitIntent::default(),
            hidden: false,
            selected_job: None,
            selected_presentation: None,
            selected_fraction: None,
            seen_terminals: Default::default(),
            feedback: None,
            preparation_hovered: false,
            preparation_retry_pending: false,
            preparation_copied_at: None,
        }
    }
    fn evidence(&self, value: serde_json::Value) {
        let _ = self.evidence.try_send(value);
    }
    pub fn send(&mut self, command: QueueCommand, now: u64) -> bool {
        match self.commands.try_send(command) {
            Ok(()) => true,
            Err(_) => {
                self.feedback = Some(("操作未受理，请稍后重试".into(), now));
                false
            }
        }
    }
    pub fn poll(&mut self) -> Vec<UiReply> {
        if let Ok(latest) = self.latest.try_lock()
            && let Some(next) = latest.as_ref()
            && self
                .snapshot
                .as_ref()
                .is_none_or(|previous| next.revision >= previous.revision)
        {
            self.snapshot = Some(next.clone());
        }
        self.replies.try_iter().collect()
    }
    pub fn settings(&self) -> Option<Settings> {
        self.snapshot
            .as_ref()
            .map(|snapshot| snapshot.settings.clone())
    }
    pub fn badge(&self) -> Option<(usize, bool, bool)> {
        self.snapshot
            .as_ref()
            .and_then(|snapshot| badge_counts(snapshot.unfinished, snapshot.failures))
    }
}
fn append_evidence(file: &mut Option<File>, started: &Instant, mut event: serde_json::Value) {
    if let Some(file) = file {
        event["elapsed_ms"] = serde_json::json!(started.elapsed().as_millis());
        let _ = writeln!(file, "{event}").and_then(|_| file.flush());
    }
}
fn command_summary(command: &QueueCommand) -> serde_json::Value {
    match command {
        QueueCommand::Submit { .. } => serde_json::json!({"type":"command","command":"submit"}),
        QueueCommand::SaveSettings(settings) => {
            serde_json::json!({"type":"command","command":"save-settings","quality":settings.quality})
        }
        QueueCommand::Cancel(job) => {
            serde_json::json!({"type":"command","command":"cancel","job":job})
        }
        QueueCommand::Retry(job) => {
            serde_json::json!({"type":"command","command":"retry","job":job})
        }
        QueueCommand::RetryCleanup(job) => {
            serde_json::json!({"type":"command","command":"retry-cleanup","job":job})
        }
        QueueCommand::CopyDiagnostic(job) => {
            serde_json::json!({"type":"command","command":"copy-diagnostic","job":job})
        }
        QueueCommand::Stop => serde_json::json!({"type":"command","command":"stop"}),
        QueueCommand::RetryPreparation => serde_json::json!({"type":"command","command":"retry-preparation"}),
        QueueCommand::CopyPreparationDiagnostic => serde_json::json!({"type":"command","command":"copy-preparation-diagnostic"}),
    }
}
fn reply_summary(reply: &CommandReply) -> serde_json::Value {
    match reply {
        CommandReply::Accepted(job) => {
            serde_json::json!({"type":"reply","reply":"accepted","job":job})
        }
        CommandReply::SettingsSaved(settings) => {
            serde_json::json!({"type":"reply","reply":"settings-saved","quality":settings.quality})
        }
        CommandReply::Applied(applied) => {
            serde_json::json!({"type":"reply","reply":"applied","applied":applied})
        }
        CommandReply::Stopping => serde_json::json!({"type":"reply","reply":"stopping"}),
        CommandReply::Diagnostic(_) => serde_json::json!({"type":"reply","reply":"diagnostic"}),
        CommandReply::Error(error) => {
            serde_json::json!({"type":"reply","reply":"error","code":error.split(':').next().filter(|code|code.starts_with("E_")&&code.len()<64).unwrap_or("E_COMMAND")})
        }
    }
}
pub fn badge_counts(unfinished: usize, failures: usize) -> Option<(usize, bool, bool)> {
    (unfinished >= 2 || failures > 0).then_some((
        unfinished.saturating_add(failures),
        failures > 0,
        unfinished > 0,
    ))
}
pub fn phase_label(job: &JobSnapshot) -> String {
    match job.phase {
        JobPhase::Queued => "等待下载".into(),
        JobPhase::Preparing => "准备下载组件".into(),
        JobPhase::Resolving => "解析视频".into(),
        JobPhase::Downloading => if job
            .transfer_progress
            .as_ref()
            .is_some_and(|sample| sample.merging)
        {
            "合并中"
        } else {
            "下载中"
        }
        .into(),
        JobPhase::Validating => "校验媒体".into(),
        JobPhase::Publishing => "保存文件".into(),
        JobPhase::Held => "清理待确认".into(),
        JobPhase::Success => "下载完成".into(),
        JobPhase::Failure => "下载失败".into(),
        JobPhase::Cancelled => "已取消".into(),
    }
}
fn preparation_wait_label(phase: &JobPhase, snapshot: &QueueSnapshot) -> Option<String> {
    if *phase != JobPhase::Preparing {
        return None;
    }
    if snapshot.preparation_owner_lost {
        return Some("准备异常，清理未确认".into());
    }
    if snapshot.preparation_held {
        return Some("正在等待组件清理".into());
    }
    (snapshot.preparation.phase == PreparationPhase::Failed)
        .then(|| "组件准备失败，等待重试".into())
}
fn transfer_label(
    sample: Option<&ameow_next::download::progress::TransferProgress>,
    now: u64,
) -> String {
    if sample.is_some_and(|sample| sample.merging) {
        return "合并中".into();
    }
    let Some(speed) = sample.and_then(|sample| sample.speed_at(now)) else {
        return "下载中".into();
    };
    let (value, unit) = if speed >= 1_000_000_000. {
        (speed / 1_000_000_000., "GB/s")
    } else if speed >= 1_000_000. {
        (speed / 1_000_000., "MB/s")
    } else {
        (speed / 1_000., "KB/s")
    };
    if value > 999. {
        "下载中".into()
    } else {
        format!("下载 {value:.1}{unit}")
    }
}
fn presentation_fraction(
    sample: Option<&ameow_next::download::progress::TransferProgress>,
    now: u64,
) -> Option<f32> {
    sample
        .and_then(|sample| sample.fraction_at(now))
        .map(|fraction| fraction.min(0.99))
}
const PREPARATION_SUCCESS_MS: u64 = 1800;
fn preparation_visible(snapshot: &QueueSnapshot, now: u64) -> bool {
    if snapshot.stopping || snapshot.stopped {
        return false;
    }
    snapshot.preparation_held
        || snapshot.preparation_owner_lost
        || match snapshot.preparation.phase {
            PreparationPhase::Idle => false,
            PreparationPhase::Ready => {
                now.saturating_sub(snapshot.preparation.updated_at_ms) < PREPARATION_SUCCESS_MS
            }
            _ => true,
        }
}
fn preparation_fraction(preparation: &PreparationSnapshot) -> Option<f32> {
    if preparation.phase != PreparationPhase::Downloading {
        return None;
    }
    preparation
        .total_bytes
        .filter(|total| *total > 0 && preparation.downloaded_bytes <= *total)
        .map(|total| (preparation.downloaded_bytes as f64 / total as f64) as f32)
}
fn preparation_stage(stage: PreparationStage) -> &'static str {
    match stage {
        PreparationStage::Cache => "检查缓存",
        PreparationStage::Acquire => "下载组件",
        PreparationStage::Verify => "校验完整性",
        PreparationStage::Extract => "解压组件",
        PreparationStage::Probe => "检查版本",
        PreparationStage::Publish => "准备就绪",
    }
}
fn preparation_bytes(bytes: u64) -> String {
    if bytes >= 1_000_000 {
        format!("{:.1} MB", bytes as f64 / 1_000_000.)
    } else if bytes >= 1000 {
        format!("{:.1} KB", bytes as f64 / 1000.)
    } else {
        format!("{bytes} B")
    }
}
fn preparation_failure_copy(category: ErrorCategory) -> (&'static str, &'static str) {
    match category {
        ErrorCategory::Timeout => ("连接超时", "检查连接后可重试，或复制诊断。"),
        ErrorCategory::Connect => ("连接失败", "检查连接后可重试，或复制诊断。"),
        ErrorCategory::ProxyRouting => ("系统路由不受支持", "检查现有系统路由，未尝试直连。"),
        ErrorCategory::Http => ("服务器响应失败", "稍后可手动重试，或复制诊断。"),
        ErrorCategory::Size => ("组件大小不符", "可手动重试，或复制诊断。"),
        ErrorCategory::Hash => ("完整性校验失败", "可手动重试，或复制诊断。"),
        ErrorCategory::Extract => ("解压失败", "可手动重试，或复制诊断。"),
        ErrorCategory::Permission => ("存储权限不足", "检查组件目录权限后可重试。"),
        ErrorCategory::Probe => ("组件检查失败", "可手动重试，或复制诊断。"),
        ErrorCategory::Storage => ("存储失败", "检查可用空间和目录权限后可重试。"),
        ErrorCategory::Cancelled => ("准备已停止", "组件尚未准备完成。"),
        ErrorCategory::Unknown => ("原因尚未确认", "复制诊断以进一步检查，或手动重试。"),
    }
}
use crate::{
    Prototype, indicator,
    model::{Progress, Stage},
    tokens::Palette,
    tray::{self, TrayEvent},
};
use gpui::{prelude::*, *};
impl Prototype {
    pub(super) fn poll_downloads(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let now = self.now();
        if self
            .close_requested
            .swap(false, std::sync::atomic::Ordering::AcqRel)
            && let Some(ui) = &mut self.downloads
        {
            ui.exit_intent.request();
        }
        let events = self
            .tray
            .as_ref()
            .map(|tray| tray.poll())
            .unwrap_or_default();
        for event in events {
            match event {
                TrayEvent::Restore => self.restore_downloads(window, cx),
                TrayEvent::Exit => {
                    if let Some(ui) = &mut self.downloads {
                        ui.exit_intent.request();
                    }
                }
            }
        }
        let Some(ui) = &mut self.downloads else {
            return;
        };
        for reply in ui.poll() {
            match reply {
                UiReply::PreparationRetry(reply) => {
                    ui.preparation_retry_pending = false;
                    ui.feedback = Some((match reply {
                        CommandReply::Applied(true) => "已重新准备组件".into(),
                        CommandReply::Error(error) => error,
                        _ => "组件状态已变化，请重新查看".into(),
                    }, now));
                }
                UiReply::StartupError(error) => {
                    ui.startup_error = Some(error.clone());
                    ui.feedback = Some((error, now));
                }
                UiReply::Settings(reply) => {
                    ui.settings_pending = false;
                    ui.feedback = Some((
                        match reply {
                            CommandReply::SettingsSaved(_) => "默认设置已保存".into(),
                            CommandReply::Error(error) => error,
                            _ => "设置未保存，请重新查看".into(),
                        },
                        now,
                    ));
                }
                UiReply::Diagnostic { job, text } => {
                    let result = self
                        .native
                        .as_ref()
                        .ok_or("窗口尚未就绪".into())
                        .and_then(|native| tray::copy_text(native.hwnd, &text));
                    ui.evidence(
                        serde_json::json!({"type":"clipboard","job":job,"success":result.is_ok()}),
                    );
                    match result {
                        Ok(()) => {
                            if job == 0 {
                                ui.preparation_copied_at = Some(now);
                                ui.feedback = Some(("已复制组件诊断".into(), now));
                            } else {
                                self.copied_at = Some(now);
                                ui.feedback = Some((format!("已复制任务 {job} 的诊断"), now));
                            }
                        }
                        Err(error) => {
                            ui.feedback = Some((error, now));
                        }
                    }
                }
                UiReply::Reply(reply) => match reply {
                    CommandReply::Accepted(_) => {
                        ui.feedback = Some(("已加入下载队列".into(), now));
                    }
                    CommandReply::SettingsSaved(_) => {
                        ui.feedback = Some(("默认设置已保存".into(), now));
                    }
                    CommandReply::Error(error) => {
                        ui.feedback = Some((
                            if error.starts_with("E_DUPLICATE") {
                                "该视频已在下载队列中".into()
                            } else if error.starts_with("E_RUNTIME_OWNER_LOST") {
                                "准备线程异常结束，清理未确认，暂不能下载".into()
                            } else {
                                error
                            },
                            now,
                        ));
                    }
                    CommandReply::Applied(false) => {
                        ui.feedback = Some(("任务状态已变化，请重新查看".into(), now));
                    }
                    _ => {}
                },
            }
        }
        if ui.feedback.as_ref().is_some_and(|(_, at)| now >= at + 5000) {
            ui.feedback = None;
        }
        if self.model.fullness < 0.98 || self.model.locks.menu || self.model.locks.drag || self.model.locks.drop {
            ui.preparation_hovered = false;
        }
        let snapshot = ui.snapshot.clone();
        if let Some(snapshot) = snapshot {
            if ui.exit_when_stopped && snapshot.stopped {
                cx.quit();
                return;
            }
            let newest_terminal = snapshot
                .jobs
                .iter()
                .rfind(|job| job.phase.terminal() && !ui.seen_terminals.contains(&job.job_id))
                .cloned();
            for job in snapshot.jobs.iter().filter(|job| job.phase.terminal()) {
                ui.seen_terminals.insert(job.job_id);
            }
            let chosen = snapshot
                .main_job
                .and_then(|id| snapshot.jobs.iter().find(|job| job.job_id == id))
                .cloned()
                .or_else(|| newest_terminal.clone())
                .or_else(|| {
                    snapshot
                        .jobs
                        .iter()
                        .find(|job| !job.phase.terminal())
                        .cloned()
                });
            if let Some(job) = chosen {
                let stage = match job.phase {
                    JobPhase::Downloading
                    | JobPhase::Validating
                    | JobPhase::Publishing
                    | JobPhase::Held => Stage::Downloading,
                    JobPhase::Success => Stage::Success,
                    JobPhase::Failure => Stage::Failure,
                    JobPhase::Cancelled => Stage::Cancelled,
                    _ => Stage::Resolving,
                };
                let presentation = (job.job_id, job.attempt, job.phase.clone());
                if ui.selected_presentation.as_ref() != Some(&presentation) {
                    // Reset only presentation continuity; accepted shell geometry and hover stay intact.
                    self.indicator = indicator::Indicator::default();
                    self.model.state(Stage::Idle, 0., now);
                    self.model.previous = Stage::Idle;
                    self.model.previous_progress = 0.;
                    self.model.progress = Progress::new(0., now);
                    ui.selected_job = Some(job.job_id);
                    ui.selected_presentation = Some(presentation);
                }
                let fraction = if job.phase == JobPhase::Downloading {
                    presentation_fraction(
                        job.transfer_progress.as_ref(),
                        ameow_next::download::progress::now_ms(),
                    )
                } else {
                    None
                };
                if ui.selected_fraction.is_some() != fraction.is_some() {
                    self.model.progress = Progress::new(0., now);
                }
                ui.selected_fraction = fraction;
                self.model
                    .state(stage, if stage == Stage::Success { 1. } else { fraction.unwrap_or(0.) }, now);
            }
        }
        if now >= ui.last_evidence_ms + 1000 {
            ui.last_evidence_ms = now;
            ui.evidence(serde_json::json!({"type":"presentation","selected_job":ui.selected_job,"stage":format!("{:?}",self.model.stage),
                "selected_attempt":ui.selected_presentation.as_ref().map(|(_, attempt, _)| *attempt),"whole_fraction":ui.selected_fraction,
                "fullness":self.model.fullness,"queue_open":ui.queue_open,"exit_open":ui.exit_open,"hidden":ui.hidden,"badge":ui.badge(),
                "preparation_visible":ui.snapshot.as_ref().is_some_and(|s| preparation_visible(s, ameow_next::download::progress::now_ms())),
                "preparation_hovered":ui.preparation_hovered}));
        }
        self.process_exit_request(window, cx);
        self.model.tick(now);
        cx.notify();
    }
    fn restore_downloads(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(native) = &self.native {
            tray::Tray::restore(native.hwnd);
        }
        if let Some(ui) = &mut self.downloads {
            ui.hidden = false;
        }
        window.activate_window();
        window.focus(&self.focus);
        self.model.pointer(true, self.now());
        cx.notify();
    }
    fn request_exit(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(ui) = &mut self.downloads {
            ui.exit_intent.request();
        }
        self.process_exit_request(window, cx);
    }
    fn process_exit_request(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let now = self.now();
        let action = self.downloads.as_mut().and_then(|ui| {
            ui.exit_intent.resolve(ui.snapshot.as_deref(), ui.startup_error.is_some())
        });
        match action {
            Some(ExitAction::Quit) => {
                cx.quit();
            }
            Some(ExitAction::Stop) => {
                self.stop_and_exit(cx);
                if let Some(ui) = &mut self.downloads
                    && !ui.exit_when_stopped
                {
                    // Retain the request if the bounded command channel is temporarily full.
                    ui.exit_intent.request();
                }
            }
            Some(ExitAction::Confirm) => {
                if let Some(ui) = &mut self.downloads {
                    ui.queue_open = false;
                    ui.exit_open = true;
                    ui.hidden = false;
                }
                if let Some(native) = &self.native {
                    native.show_without_activation();
                }
                // WM_CLOSE may be programmatic: never use GPUI's Windows activation
                // path here, which synthesizes global Alt input before taking foreground.
                window.focus(&self.focus);
                self.model.pointer(true, now);
                self.model.locks.menu = true;
                self.model.locks_changed(now);
            }
            None => return,
        }
        cx.notify();
    }
    pub(super) fn stop_and_exit(&mut self, cx: &mut Context<Self>) {
        let now = self.now();
        if let Some(ui) = &mut self.downloads {
            if ui.startup_error.is_some()
                || ui
                    .snapshot
                    .as_ref()
                    .is_some_and(|snapshot| snapshot.stopped)
            {
                cx.quit();
                return;
            }
            if ui.send(QueueCommand::Stop, now) {
                ui.exit_when_stopped = true;
                ui.exit_open = true;
                ui.queue_open = false;
            }
            self.model.locks.menu = true;
            self.model.locks_changed(now);
        }
    }
    fn continue_running(&mut self, cx: &mut Context<Self>) {
        if let Some(ui) = &mut self.downloads {
            ui.exit_open = false;
            ui.exit_when_stopped = false;
        }
        self.close_menu(cx);
    }
    pub(super) fn production_key(&mut self, key: &str, cx: &mut Context<Self>) {
        match key {
            "escape" => {
                if let Some(ui) = &mut self.downloads {
                    ui.queue_open = false;
                    ui.exit_open = false;
                    ui.exit_when_stopped = false;
                }
                self.close_menu(cx);
            }
            "t" | "T" => {
                self.night = !self.night;
                cx.notify();
            }
            "r" | "R" => {
                self.model.set_reduced(!self.model.reduced, self.now());
                cx.notify();
            }
            _ => {}
        }
    }
    pub(super) fn paste_download(&mut self, cx: &mut Context<Self>) {
        let now = self.now();
        let text = cx.read_from_clipboard().and_then(|item| item.text());
        if let Some(ui) = &mut self.downloads {
            if let Some(text) = text {
                ui.send(
                    QueueCommand::Submit {
                        url: text.trim().to_owned(),
                    },
                    now,
                );
            } else {
                ui.feedback = Some(("请复制一个视频链接后粘贴".into(), now));
            }
        }
        cx.notify();
    }
    pub(super) fn cancel_main(&mut self, cx: &mut Context<Self>) {
        let now = self.now();
        if let Some(ui) = &mut self.downloads
            && let Some(job) = ui.selected_job
        {
            ui.send(QueueCommand::Cancel(job), now);
        }
        cx.notify();
    }
    pub(super) fn copy_download(&mut self, cx: &mut Context<Self>) {
        let now = self.now();
        if let Some(ui) = &mut self.downloads
            && let Some(job) = ui.selected_job
        {
            ui.send(QueueCommand::CopyDiagnostic(job), now);
        }
        cx.notify();
    }
    pub(super) fn open_queue(&mut self, cx: &mut Context<Self>) {
        if let Some(ui) = &mut self.downloads {
            ui.queue_open = true;
            ui.exit_open = false;
        }
        self.model.locks.menu = true;
        self.model.locks_changed(self.now());
        cx.notify();
    }
    pub(super) fn live_label(&self) -> Option<String> {
        let ui = self.downloads.as_ref()?;
        if let Some(snapshot) = &ui.snapshot {
            if snapshot.stopping {
                return Some("正在安全停止".into());
            }
            if let Some(job) = ui
                .selected_job
                .and_then(|id| snapshot.jobs.iter().find(|job| job.job_id == id))
            {
                return Some(if job.phase == JobPhase::Downloading {
                    transfer_label(
                        job.transfer_progress.as_ref(),
                        ameow_next::download::progress::now_ms(),
                    )
                } else {
                    preparation_wait_label(&job.phase, snapshot).unwrap_or_else(|| phase_label(job))
                });
            }
        }
        Some("准备下载".into())
    }
    fn save_quality(&mut self, quality: Quality, cx: &mut Context<Self>) {
        let now = self.now();
        if let Some(ui) = &mut self.downloads {
            if ui.settings_pending || ui.folder_pending {
                return;
            }
            if let Some(mut settings) = ui.settings() {
                settings.quality = quality;
                ui.settings_pending = ui.send(QueueCommand::SaveSettings(settings), now);
            }
        }
        self.close_menu(cx);
    }
    fn choose_directory(&mut self, cx: &mut Context<Self>) {
        let Some(ui) = &mut self.downloads else {
            return;
        };
        if ui.settings_pending || ui.folder_pending || ui.settings().is_none() {
            return;
        }
        ui.folder_pending = true;
        let picker = cx.prompt_for_paths(PathPromptOptions {
            files: false,
            directories: true,
            multiple: false,
            prompt: Some("选择下载目录".into()),
        });
        cx.spawn(async move |this, cx| {
            let result = picker.await;
            let _ = this.update(cx, |this, cx| {
                let now = this.now();
                if let Some(ui) = &mut this.downloads {
                    ui.folder_pending = false;
                    match result {
                        Ok(Ok(Some(paths))) => {
                            if let (Some(path), Some(mut settings)) =
                                (paths.into_iter().next(), ui.settings())
                            {
                                settings.output_dir = path;
                                ui.settings_pending =
                                    ui.send(QueueCommand::SaveSettings(settings), now);
                            }
                        }
                        Ok(Ok(None)) => {}
                        _ => {
                            ui.feedback = Some(("无法打开目录选择，请重试".into(), now));
                        }
                    }
                }
                this.close_menu(cx);
            });
        })
        .detach();
        cx.notify();
    }
    pub(super) fn download_menu(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.night);
        let g = self.model.geometry();
        let quality = self
            .downloads
            .as_ref()
            .and_then(|ui| ui.settings())
            .map(|settings| settings.quality);
        let busy = self
            .downloads
            .as_ref()
            .is_some_and(|ui| ui.settings_pending || ui.folder_pending || ui.snapshot.is_none());
        let labels = [
            ("highest", "最高可得", Quality::Highest),
            ("balanced", "Balanced · ≤1080p", Quality::Balanced),
            ("saver", "Saver · ≤480p", Quality::Saver),
        ];
        div()
            .absolute()
            .left(px(g.gutter + 10.))
            .top(px(g.gutter + 10.))
            .w(px(180.))
            .p(px(5.))
            .bg(p.badge)
            .border_1()
            .border_color(p.border)
            .rounded(px(9.))
            .text_size(px(10.))
            .text_color(p.neutral)
            .children(labels.into_iter().map(|(id, label, level)| {
                div()
                    .id(id)
                    .h(px(20.))
                    .px(px(6.))
                    .flex()
                    .items_center()
                    .justify_between()
                    .rounded(px(4.))
                    .cursor_pointer()
                    .opacity(if busy { 0.5 } else { 1. })
                    .hover(move |s| s.bg(p.surface))
                    .child(label)
                    .child(if quality == Some(level) { "✓" } else { "" })
                    .on_mouse_down(
                        MouseButton::Left,
                        cx.listener(|_, _, _, cx| cx.stop_propagation()),
                    )
                    .on_click(cx.listener(move |this, _, _, cx| this.save_quality(level, cx)))
            }))
            .child(self.menu_action(
                "folder",
                if busy {
                    "正在保存默认设置…"
                } else {
                    "下载目录…"
                },
                cx,
                |this, _, cx| this.choose_directory(cx),
            ))
            .child(self.menu_action("queue", "下载队列", cx, |this, _, cx| {
                this.open_queue(cx)
            }))
            .child(
                self.menu_action("theme", "切换 Light / Night", cx, |this, _, cx| {
                    this.night = !this.night;
                    this.close_menu(cx);
                }),
            )
            .child(
                self.menu_action("compact", "收起为 Compact", cx, |this, _, cx| {
                    let now = this.now();
                    this.close_menu(cx);
                    this.model.request_compact(now);
                    cx.notify();
                }),
            )
            .child(self.menu_action("hide", "隐藏到托盘", cx, |this, _, cx| {
                let now = this.now();
                if this.tray.is_none() {
                    if let Some(ui) = &mut this.downloads {
                        ui.feedback = Some(("托盘不可用，请保持窗口打开".into(), now));
                    }
                } else if let Some(native) = &this.native {
                    tray::Tray::hide(native.hwnd);
                    if let Some(ui) = &mut this.downloads {
                        ui.hidden = true;
                    }
                }
                this.close_menu(cx);
            }))
            .child(
                self.menu_action("exit", "退出 Ameow", cx, |this, window, cx| {
                    this.request_exit(window, cx)
                }),
            )
            .into_any_element()
    }
    fn menu_action(
        &self,
        id: &'static str,
        label: &'static str,
        cx: &mut Context<Self>,
        action: impl Fn(&mut Self, &mut Window, &mut Context<Self>) + 'static,
    ) -> AnyElement {
        let p = Palette::new(self.night);
        div()
            .id(id)
            .h(px(20.))
            .px(px(6.))
            .flex()
            .items_center()
            .rounded(px(4.))
            .cursor_pointer()
            .hover(move |s| s.bg(p.surface))
            .child(label)
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|_, _, _, cx| cx.stop_propagation()),
            )
            .on_click(cx.listener(move |this, _, window, cx| action(this, window, cx)))
            .into_any_element()
    }
    fn row_action(
        &self,
        id: String,
        label: &'static str,
        danger: bool,
        cx: &mut Context<Self>,
        action: impl Fn(&mut Self, &mut Context<Self>) + 'static,
    ) -> AnyElement {
        let p = Palette::new(self.night);
        div()
            .id(SharedString::from(id))
            .h(px(20.))
            .px(px(5.))
            .flex()
            .items_center()
            .rounded(px(5.))
            .bg(p.badge)
            .text_color(if danger { p.red } else { p.neutral })
            .text_size(px(9.))
            .cursor_pointer()
            .hover(move |s| s.bg(p.border))
            .child(label)
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|_, _, _, cx| cx.stop_propagation()),
            )
            .on_click(cx.listener(move |this, _, _, cx| action(this, cx)))
            .into_any_element()
    }
    pub(super) fn queue_panel(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.night);
        let g = self.model.geometry();
        let snapshot = self.downloads.as_ref().and_then(|ui| ui.snapshot.clone());
        let jobs = snapshot
            .as_ref()
            .map(|snapshot| snapshot.jobs.clone())
            .unwrap_or_default();
        let owner_lost = snapshot
            .as_ref()
            .is_some_and(|snapshot| snapshot.preparation_owner_lost);
        let preparation_held = snapshot
            .as_ref()
            .is_some_and(|snapshot| snapshot.preparation_held);
        let rows: Vec<_> = jobs
            .into_iter()
            .filter(|job| !matches!(job.phase, JobPhase::Success | JobPhase::Cancelled))
            .map(|job| {
                let id = job.job_id;
                let failure = job.phase == JobPhase::Failure;
                let unresolved = owner_lost && !job.slot_owned && !job.phase.terminal();
                let held = job.phase == JobPhase::Held && (job.slot_owned || preparation_held);
                let cleanup_job = if job.slot_owned { id } else { 0 };
                let preparation_wait = snapshot.as_ref().and_then(|snapshot| {
                    preparation_wait_label(&job.phase, snapshot)
                });
                let mut row = div()
                    .id(SharedString::from(format!("job-{id}")))
                    .flex()
                    .flex_col()
                    .gap(px(3.))
                    .py(px(6.))
                    .border_b_1()
                    .border_color(p.border)
                    .child(
                        div()
                            .w_full()
                            .truncate()
                            .text_size(px(10.))
                            .font_weight(FontWeight::MEDIUM)
                            .child(if job.title.is_empty() {
                                format!("任务 {id}")
                            } else {
                                job.title.clone()
                            }),
                    )
                    .child(
                        div()
                            .flex()
                            .justify_between()
                            .text_size(px(9.))
                            .text_color(if failure || preparation_wait.is_some() {
                                p.red
                            } else if held {
                                p.neutral
                            } else {
                                p.blue
                            })
                            .child(if unresolved {
                                "准备异常，清理未确认".into()
                            } else {
                                preparation_wait.clone().unwrap_or_else(|| phase_label(&job))
                            })
                            .child(format!("#{id}")),
                    );
                if preparation_wait.is_some() && !unresolved && !held {
                    if let Some(reason) = snapshot.as_ref().and_then(|s| s.preparation.failure.as_ref()) {
                        row = row.child(div().text_size(px(9.)).child(format!(
                            "{} · {} · {}",
                            reason.component.label(),
                            preparation_stage(reason.stage),
                            preparation_failure_copy(reason.category).0,
                        )));
                    }
                    row = row.child(div().text_size(px(9.)).child("关闭队列后，从左下角重试组件"));
                }
                if let Some(reason) = job.failure.as_ref().filter(|_| failure) {
                    row = row
                        .child(
                            div()
                                .text_size(px(9.))
                                .child(format!("{} · {}", reason.code, reason.reason)),
                        )
                        .child(
                            div()
                                .text_size(px(9.))
                                .text_color(p.neutral)
                                .child(reason.suggestion.clone()),
                        );
                }
                let actions = if failure {
                    div()
                        .flex()
                        .gap(px(5.))
                        .child(self.row_action(
                            format!("retry-{id}"),
                            "重试",
                            false,
                            cx,
                            move |this, cx| {
                                let now = this.now();
                                if let Some(ui) = &mut this.downloads {
                                    ui.send(QueueCommand::Retry(id), now);
                                }
                                cx.notify();
                            },
                        ))
                        .child(self.row_action(
                            format!("copy-{id}"),
                            "复制诊断",
                            false,
                            cx,
                            move |this, cx| {
                                let now = this.now();
                                if let Some(ui) = &mut this.downloads {
                                    ui.send(QueueCommand::CopyDiagnostic(id), now);
                                }
                                cx.notify();
                            },
                        ))
                } else if unresolved {
                    div()
                        .text_size(px(9.))
                        .text_color(p.neutral)
                        .child("暂不能继续或安全退出")
                } else {
                    div()
                        .flex()
                        .gap(px(5.))
                        .child(self.row_action(
                            format!("cancel-{id}"),
                            "取消",
                            true,
                            cx,
                            move |this, cx| {
                                let now = this.now();
                                if let Some(ui) = &mut this.downloads {
                                    ui.send(QueueCommand::Cancel(id), now);
                                }
                                cx.notify();
                            },
                        ))
                        .when(held, |actions| {
                            actions.child(self.row_action(
                                format!("cleanup-{id}"),
                                "重试清理",
                                false,
                                cx,
                                move |this, cx| {
                                    let now = this.now();
                                    if let Some(ui) = &mut this.downloads {
                                        ui.send(QueueCommand::RetryCleanup(cleanup_job), now);
                                    }
                                    cx.notify();
                                },
                            ))
                        })
                };
                row.child(actions)
            })
            .collect();
        let empty = rows.is_empty();
        div()
            .absolute()
            .left(px(g.gutter + 10.))
            .top(px(g.gutter + 10.))
            .w(px(180.))
            .h(px(180.))
            .bg(p.surface)
            .text_color(p.neutral)
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|_, _, _, cx| cx.stop_propagation()),
            )
            .child(
                div()
                    .h(px(24.))
                    .flex()
                    .items_center()
                    .justify_between()
                    .text_size(px(11.))
                    .font_weight(FontWeight::MEDIUM)
                    .child("下载队列")
                    .child(self.row_action(
                        "queue-back".into(),
                        "返回",
                        false,
                        cx,
                        |this, cx| {
                            if let Some(ui) = &mut this.downloads {
                                ui.queue_open = false;
                            }
                            this.close_menu(cx);
                        },
                    )),
            )
            .child(
                div()
                    .id("download-queue-scroll")
                    .h(px(140.))
                    .overflow_y_scroll()
                    .when(empty, |list| {
                        list.child(
                            div()
                                .pt(px(20.))
                                .text_size(px(10.))
                                .child("队列为空，Ctrl+V 粘贴视频链接"),
                        )
                    })
                    .children(rows),
            )
            .into_any_element()
    }
    pub(super) fn exit_panel(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.night);
        let g = self.model.geometry();
        let stopping = self.downloads.as_ref().is_some_and(|ui| {
            ui.exit_when_stopped
                || ui
                    .snapshot
                    .as_ref()
                    .is_some_and(|snapshot| snapshot.stopping)
        });
        let snapshot = self.downloads.as_ref().and_then(|ui| ui.snapshot.clone());
        let targets = snapshot
            .as_ref()
            .map_or_else(Vec::new, |snapshot| cleanup_targets(snapshot));
        let unresolved = snapshot
            .as_ref()
            .is_some_and(|snapshot| snapshot.preparation_owner_lost);
        div()
            .absolute()
            .left(px(g.gutter + 14.))
            .top(px(g.gutter + 58.))
            .w(px(172.))
            .flex()
            .flex_col()
            .gap(px(8.))
            .text_color(p.neutral)
            .text_size(px(11.))
            .child(if unresolved {
                "清理未确认"
            } else if stopping {
                "正在安全停止"
            } else {
                "下载仍在进行"
            })
            .child(div().text_size(px(10.)).child(exit_cleanup_message(
                unresolved,
                !targets.is_empty(),
                stopping,
            )))
            .child(
                div()
                    .flex()
                    .gap(px(5.))
                    .child(self.row_action(
                        "exit-continue".into(),
                        if stopping {
                            "返回队列"
                        } else {
                            "继续运行"
                        },
                        false,
                        cx,
                        move |this, cx| {
                            this.continue_running(cx);
                            if stopping {
                                this.open_queue(cx);
                            }
                        },
                    ))
                    .when(!stopping, |actions| {
                        actions.child(self.row_action(
                            "stop-exit".into(),
                            "停止并退出",
                            true,
                            cx,
                            |this, cx| this.stop_and_exit(cx),
                        ))
                    })
                    .when(!targets.is_empty(), |actions| {
                        actions.child(self.row_action(
                            "exit-retry-cleanup".into(),
                            "重试清理",
                            false,
                            cx,
                            |this, cx| {
                                let now = this.now();
                                if let Some(ui) = &mut this.downloads {
                                    let snapshot = ui.snapshot.clone();
                                    if let Some(snapshot) = snapshot {
                                        for job in cleanup_targets(&snapshot) {
                                            ui.send(QueueCommand::RetryCleanup(job), now);
                                        }
                                    }
                                }
                                cx.notify();
                            },
                        ))
                    }),
            )
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|_, _, _, cx| cx.stop_propagation()),
            )
            .into_any_element()
    }
    pub(super) fn preparation_indicator_visible(&self) -> bool {
        self.model.fullness >= 0.98
            && !self.model.locks.menu
            && !self.model.locks.drag
            && !self.model.locks.drop
            && self
                .downloads
                .as_ref()
                .and_then(|ui| ui.snapshot.as_ref())
                .is_some_and(|snapshot| {
                    preparation_visible(snapshot, ameow_next::download::progress::now_ms())
                })
    }
    pub(super) fn preparation_animation_delay(&self) -> Option<u64> {
        let preparation = &self.downloads.as_ref()?.snapshot.as_ref()?.preparation;
        (self.preparation_indicator_visible()
            && !self.model.reduced
            && matches!(
                preparation.phase,
                PreparationPhase::Preparing
                    | PreparationPhase::Downloading
                    | PreparationPhase::Verifying
            )
            && preparation_fraction(preparation).is_none())
        .then_some(32)
    }
    pub(super) fn preparation_indicator(&self, cx: &mut Context<Self>) -> AnyElement {
        let Some(ui) = &self.downloads else {
            return div().into_any_element();
        };
        let Some(snapshot) = &ui.snapshot else {
            return div().into_any_element();
        };
        let preparation = &snapshot.preparation;
        let p = Palette::new(self.night);
        let g = self.model.geometry();
        let failed = preparation.phase == PreparationPhase::Failed
            || snapshot.preparation_held
            || snapshot.preparation_owner_lost;
        let ready = preparation.phase == PreparationPhase::Ready && !failed;
        let fraction = preparation_fraction(preparation);
        let now = self.now();
        let can_retry = preparation.phase == PreparationPhase::Failed
            && !snapshot.preparation_held
            && !snapshot.preparation_owner_lost
            && !snapshot.stopping
            && !ui.preparation_retry_pending;
        let component = preparation
            .failure
            .as_ref()
            .map(|failure| failure.component)
            .or(preparation.component)
            .map_or("下载组件", |component| component.label());
        let headline = if snapshot.preparation_owner_lost {
            "准备异常，清理未确认".into()
        } else if snapshot.preparation_held {
            "正在等待组件清理".into()
        } else if failed {
            format!("{component} 准备失败")
        } else if ready {
            "组件已就绪".into()
        } else {
            format!("{component} · {}", preparation_stage(preparation.stage))
        };
        let color = if failed {
            p.red
        } else if ready {
            p.green
        } else {
            p.orange
        };
        let mut details = div()
            .id("component-preparation-details")
            .w(px(176.))
            .max_h(px(142.))
            .overflow_y_scroll()
            .p(px(9.))
            .flex()
            .flex_col()
            .gap(px(5.))
            .rounded(px(9.))
            .bg(p.surface)
            .border_1()
            .border_color(p.border)
            .text_color(p.neutral)
            .text_size(px(9.))
            .child(
                div()
                    .font_weight(FontWeight::MEDIUM)
                    .text_size(px(10.))
                    .text_color(color)
                    .child(headline),
            );
        if preparation.phase == PreparationPhase::Downloading {
            let bytes = preparation_bytes(preparation.downloaded_bytes);
            details = details.child(if let Some(fraction) = fraction {
                format!(
                    "{bytes} / {} · {:.0}%",
                    preparation_bytes(preparation.total_bytes.unwrap()),
                    (fraction * 100.).floor()
                )
            } else {
                format!("{bytes} · 总量未知")
            });
        }
        if let Some(failure) = &preparation.failure {
            let (reason, suggestion) = preparation_failure_copy(failure.category);
            details = details
                .child(
                    div().child(format!(
                        "{} · {reason}{}",
                        preparation_stage(failure.stage),
                        failure
                            .http_status
                            .map_or(String::new(), |status| format!(" ({status})"))
                    )),
                )
                .child(div().child(suggestion));
        } else if snapshot.preparation_owner_lost {
            details = details.child("准备线程异常结束，清理未确认，暂不能继续。");
        } else if snapshot.preparation_held {
            details = details.child("资源尚未收束，可从退出面板查看清理状态。");
        } else if !ready {
            details = details.child("后台准备中，仍可粘贴视频链接");
        }
        if failed {
            let copied = ui
                .preparation_copied_at
                .is_some_and(|at| now.saturating_sub(at) < 2000);
            let mut actions = div().flex().gap(px(5.));
            if can_retry {
                actions = actions.child(self.row_action(
                    "preparation-retry".into(),
                    "重试",
                    false,
                    cx,
                    |this, cx| {
                        let now = this.now();
                        if let Some(ui) = &mut this.downloads {
                            ui.preparation_retry_pending = ui.send(QueueCommand::RetryPreparation, now);
                        }
                        cx.notify();
                    },
                ));
            }
            details = details.child(actions.child(self.row_action(
                "preparation-copy".into(),
                if copied { "已复制" } else { "复制诊断" },
                false,
                cx,
                |this, cx| {
                    let now = this.now();
                    if let Some(ui) = &mut this.downloads {
                        ui.send(QueueCommand::CopyPreparationDiagnostic, now);
                    }
                    cx.notify();
                },
            )));
        }
        div()
            .id("component-preparation-indicator")
            .absolute()
            .left(px(g.gutter + 12.))
            .bottom(px(g.gutter + 12.))
            .w(px(if ui.preparation_hovered && !ready { 176. } else { 24. }))
            .flex()
            .flex_col()
            .items_start()
            .on_hover(cx.listener(|this, hovered, _, cx| {
                if let Some(ui) = &mut this.downloads {
                    ui.preparation_hovered = *hovered;
                }
                cx.notify();
            }))
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|_, _, _, cx| cx.stop_propagation()),
            )
            .when(ui.preparation_hovered && !ready, |indicator| {
                // Keep the popover, bridge and ring inside one real hover hitbox.
                indicator.child(div().pb(px(6.)).child(details))
            })
            .child(
                div()
                    .relative()
                    .size(px(24.))
                    .flex_none()
                    .rounded_full()
                    .bg(p.badge)
                    .child(indicator::preparation_ring(
                        p,
                        fraction,
                        failed,
                        ready,
                        now,
                        self.model.reduced,
                    ))
                    .when(failed, |ring| {
                        ring.child(
                            div()
                                .absolute()
                                .inset_0()
                                .flex()
                                .items_center()
                                .justify_center()
                                .text_size(px(10.))
                                .text_color(p.red)
                                .child("!"),
                        )
                    })
                    .when(ready, |ring| {
                        ring.child(
                            svg()
                                .path("icons/check.svg")
                                .absolute()
                                .left(px(7.))
                                .top(px(7.))
                                .size(px(10.))
                                .text_color(p.green),
                        )
                    }),
            )
            .into_any_element()
    }
    pub(super) fn download_feedback(&self) -> AnyElement {
        let p = Palette::new(self.night);
        let g = self.model.geometry();
        let ui = self.downloads.as_ref();
        let message = ui
            .and_then(|ui| {
                ui.feedback
                    .as_ref()
                    .map(|(text, _)| text.clone())
                    .or_else(|| ui.startup_error.clone())
            })
            .unwrap_or_else(|| {
                if ui.is_some_and(|ui| {
                    ui.snapshot
                        .as_ref()
                        .is_some_and(|snapshot| snapshot.stopping)
                }) {
                    "已关闭新任务受理，正在安全停止".into()
                } else if ui.is_some_and(|ui| ui.snapshot.is_some()) {
                    "Ctrl+V 粘贴视频链接 · 右键设置".into()
                } else {
                    "正在读取下载设置…".into()
                }
            });
        div()
            .absolute()
            .left(px(g.gutter + if self.preparation_indicator_visible() { 42. } else { 10. }))
            .top(px(g.gutter + 174.))
            .w(px(if self.preparation_indicator_visible() { 148. } else { 180. }))
            .h(px(16.))
            .truncate()
            .text_size(px(8.))
            .text_color(p.neutral)
            .child(message)
            .into_any_element()
    }
}
fn cleanup_targets(snapshot: &QueueSnapshot) -> Vec<u64> {
    let mut targets = Vec::new();
    if snapshot.preparation_held && !snapshot.preparation_owner_lost {
        targets.push(0);
    }
    targets.extend(
        snapshot.jobs.iter().filter_map(|job| {
            (job.phase == JobPhase::Held && job.slot_owned).then_some(job.job_id)
        }),
    );
    targets
}
fn exit_cleanup_message(unresolved: bool, cleanup_available: bool, stopping: bool) -> &'static str {
    if unresolved {
        "准备线程异常结束，清理未确认，暂不能安全退出。"
    } else if cleanup_available {
        "清理尚未确认，存活任务仍保留资源，可重试清理。"
    } else if stopping {
        "正在等待下载进程与文件收束。"
    } else {
        "继续运行，或停止所有任务后退出。"
    }
}
#[cfg(test)]
mod tests {
    use super::badge_counts;
    use super::{ExitAction, ExitIntent, cleanup_targets, exit_cleanup_message};
    use ameow_next::download::{
        queue::{JobPhase, JobSnapshot, QueueSnapshot},
        request::{Accepted, DownloadIntent, Quality},
        settings::Settings,
    };
    use core::prelude::v1::test;
    fn exit_snapshot() -> QueueSnapshot {
        QueueSnapshot {
            revision: 1,
            jobs: Vec::new(),
            settings: Settings {
                quality: Quality::Balanced,
                output_dir: std::env::temp_dir(),
            },
            unfinished: 0,
            failures: 0,
            active_slots: 0,
            preparing: false,
            preparation_held: false,
            preparation_owner_lost: false,
            stopping: false,
            stopped: false,
            main_job: None,
            preparation: Default::default(),
        }
    }
    #[test]
    fn component_status_is_transient_on_success_and_persistent_on_failure() {
        use ameow_next::download::preparation::PreparationPhase;
        let mut snapshot = exit_snapshot();
        assert!(!super::preparation_visible(&snapshot, 100));
        snapshot.preparation.phase = PreparationPhase::Downloading;
        assert!(super::preparation_visible(&snapshot, 100));
        // Component preparation never contributes to media counts.
        assert_eq!(badge_counts(snapshot.unfinished, snapshot.failures), None);
        snapshot.preparation.phase = PreparationPhase::Ready;
        snapshot.preparation.updated_at_ms = 100;
        assert!(super::preparation_visible(&snapshot, 1899));
        assert!(!super::preparation_visible(&snapshot, 1900));
        snapshot.preparation.phase = PreparationPhase::Failed;
        assert!(super::preparation_visible(&snapshot, 50_000));
        snapshot.preparation_owner_lost = true;
        snapshot.preparation.phase = PreparationPhase::Idle;
        assert!(super::preparation_visible(&snapshot, 50_000));
        snapshot.stopping = true;
        assert!(!super::preparation_visible(&snapshot, 50_000));
    }
    #[test]
    fn component_percentage_requires_real_download_bytes_and_known_total() {
        use ameow_next::download::preparation::{PreparationPhase, PreparationSnapshot};
        let mut preparation = PreparationSnapshot {
            phase: PreparationPhase::Downloading, downloaded_bytes: 25, ..Default::default()
        };
        assert_eq!(super::preparation_fraction(&preparation), None);
        preparation.total_bytes = Some(100);
        assert_eq!(super::preparation_fraction(&preparation), Some(0.25));
        preparation.total_bytes = Some(0);
        assert_eq!(super::preparation_fraction(&preparation), None);
        preparation.total_bytes = Some(20);
        assert_eq!(super::preparation_fraction(&preparation), None);
        preparation.total_bytes = Some(100);
        preparation.phase = PreparationPhase::Verifying;
        assert_eq!(super::preparation_fraction(&preparation), None);
        preparation.phase = PreparationPhase::Ready;
        assert_eq!(super::preparation_fraction(&preparation), None);
    }
    #[test]
    fn waiting_job_label_distinguishes_component_failure_retry_and_owner_loss() {
        let mut snapshot = exit_snapshot();
        snapshot.preparation.phase = super::PreparationPhase::Failed;
        assert_eq!(super::preparation_wait_label(&JobPhase::Preparing, &snapshot).as_deref(),
            Some("组件准备失败，等待重试"));
        assert_eq!(super::preparation_wait_label(&JobPhase::Downloading, &snapshot), None);
        snapshot.preparation.phase = super::PreparationPhase::Preparing;
        assert_eq!(super::preparation_wait_label(&JobPhase::Preparing, &snapshot), None);
        snapshot.preparation_owner_lost = true;
        assert_eq!(super::preparation_wait_label(&JobPhase::Preparing, &snapshot).as_deref(),
            Some("准备异常，清理未确认"));
        snapshot.preparation_owner_lost = false;
        snapshot.preparation_held = true;
        assert_eq!(super::preparation_wait_label(&JobPhase::Preparing, &snapshot).as_deref(),
            Some("正在等待组件清理"));
    }
    #[test]
    fn early_close_waits_for_idle_startup_then_requires_safe_stop() {
        let mut exit = ExitIntent::default();
        exit.request();
        assert_eq!(exit.resolve(None, false), None);
        assert_eq!(exit.resolve(None, false), None);
        let mut snapshot = exit_snapshot();
        assert_eq!(exit.resolve(Some(&snapshot), false), Some(ExitAction::Stop));
        assert_eq!(exit.resolve(Some(&snapshot), false), None);
        snapshot.stopping = true;
        exit.request();
        assert_ne!(exit.resolve(Some(&snapshot), false), Some(ExitAction::Quit));
        snapshot.stopped = true;
        exit.request();
        assert_eq!(exit.resolve(Some(&snapshot), false), Some(ExitAction::Quit));
    }
    #[test]
    fn early_close_requires_confirmation_for_work_and_uncertain_owners() {
        let idle = exit_snapshot();
        let mut unfinished = idle.clone();
        unfinished.unfinished = 1;
        unfinished.active_slots = 1;
        let mut preparing = idle.clone();
        preparing.preparing = true;
        let mut held = idle.clone();
        held.preparation_held = true;
        held.stopping = true;
        let mut owner_lost = idle;
        owner_lost.preparation_owner_lost = true;
        owner_lost.stopping = true;
        for snapshot in [unfinished, preparing, held, owner_lost] {
            let mut exit = ExitIntent::default();
            exit.request();
            assert_eq!(exit.resolve(None, false), None);
            assert_eq!(exit.resolve(Some(&snapshot), false), Some(ExitAction::Confirm));
            // Continuing does not reopen the confirmation when the next projection arrives.
            assert_eq!(exit.resolve(Some(&snapshot), false), None);
        }
    }
    #[test]
    fn early_close_quits_after_startup_failure_without_a_second_request() {
        let mut exit = ExitIntent::default();
        exit.request();
        assert_eq!(exit.resolve(None, false), None);
        assert_eq!(exit.resolve(None, true), Some(ExitAction::Quit));
        assert_eq!(exit.resolve(None, true), None);
    }
    #[test]
    fn transfer_label_uses_live_measurement_and_never_finished_or_stale_speed() {
        use ameow_next::download::progress::TransferProgress;
        let mut sample = TransferProgress {
            downloaded_bytes: 1,
            exact_total_bytes: None,
            bytes_per_second: Some(1_250_000.),
            fraction: None,
            observed_at_ms: 10,
            merging: false,
        };
        assert_eq!(super::transfer_label(Some(&sample), 10), "下载 1.2MB/s");
        assert_eq!(super::transfer_label(Some(&sample), 2010), "下载中");
        assert_eq!(super::transfer_label(None, 10), "下载中");
        assert_eq!(super::presentation_fraction(Some(&sample), 10), None);
        sample.fraction = Some(1.);
        assert_eq!(super::presentation_fraction(Some(&sample), 10), Some(0.99));
        assert_eq!(super::presentation_fraction(Some(&sample), 2010), None);
        sample.bytes_per_second = None;
        assert_eq!(super::transfer_label(Some(&sample), 10), "下载中");
        sample.merging = true;
        assert_eq!(super::transfer_label(Some(&sample), 10), "合并中");
    }
    #[test]
    fn operational_badge_uses_total_with_failure_exception() {
        assert_eq!(badge_counts(0, 0), None);
        assert_eq!(badge_counts(1, 0), None);
        assert_eq!(badge_counts(2, 0), Some((2, false, true)));
        assert_eq!(badge_counts(5, 0), Some((5, false, true)));
        assert_eq!(badge_counts(0, 1), Some((1, true, false)));
        assert_eq!(badge_counts(0, 2), Some((2, true, false)));
        assert_eq!(badge_counts(1, 1), Some((2, true, true)));
        assert_eq!(badge_counts(5, 1), Some((6, true, true)));
    }
    #[test]
    fn owner_lost_exit_has_honest_copy_and_only_independent_attempt_retry() {
        let root = tempfile::tempdir().unwrap();
        let settings = Settings {
            quality: Quality::Balanced,
            output_dir: root.path().into(),
        };
        let mut snapshot = QueueSnapshot {
            revision: 1,
            jobs: Vec::new(),
            settings,
            unfinished: 1,
            failures: 0,
            active_slots: 0,
            preparing: false,
            preparation_held: true,
            preparation_owner_lost: true,
            stopping: true,
            stopped: false,
            main_job: None,
            preparation: Default::default(),
        };
        assert!(cleanup_targets(&snapshot).is_empty());
        let message = exit_cleanup_message(true, false, true);
        assert!(message.contains("清理未确认"));
        assert!(message.contains("暂不能安全退出"));
        assert!(!message.contains("保留资源"));
        assert!(!message.contains("重试"));
        snapshot.jobs.push(JobSnapshot {
            job_id: 7,
            revision: 1,
            attempt: 1,
            phase: JobPhase::Held,
            accepted: Accepted::new(DownloadIntent {
                url: "https://youtu.be/00000000007".into(),
                quality: Quality::Balanced,
                output_dir: root.path().into(),
            })
            .unwrap(),
            identity: None,
            title: String::new(),
            message: String::new(),
            failure: None,
            transfer_progress: None,
            delivered: None,
            slot_owned: true,
            resources_released: false,
            start_order: Some(1),
            terminal_count: 0,
            events: Vec::new(),
        });
        assert_eq!(cleanup_targets(&snapshot), vec![7]);
        snapshot.jobs[0].slot_owned = false;
        assert!(
            cleanup_targets(&snapshot).is_empty(),
            "shared-preparation rows are not attempt retry recipients"
        );
        snapshot.preparation_owner_lost = false;
        assert_eq!(cleanup_targets(&snapshot), vec![0]);
        assert!(exit_cleanup_message(false, true, true).contains("可重试清理"));
    }
}
