//! Production GPUI command boundary. Initialization, persistence and polling stay off the UI.
use ameow_next::download::{
    preparation::{ErrorCategory, PreparationPhase, PreparationSnapshot, PreparationStage},
    queue::{
        CommandReply, JobPhase, JobSnapshot, QueueCommand, QueueSnapshot,
    },
    request::Quality,
    runtime::RuntimeManager,
    settings::{Settings, ThemePreference, LanguagePreference, TrayIconPreference},
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
    Retry { source: u64, reply: CommandReply },
    RowCommand { job: u64, cleanup: bool, reply: CommandReply },
    PreparationRetry(CommandReply),
    RuntimeUpdate(CommandReply),
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
    pub language: crate::ui_text::Language,
    commands: SyncSender<QueueCommand>,
    evidence: SyncSender<serde_json::Value>,
    last_evidence_ms: u64,
    replies: Receiver<UiReply>,
    latest: Arc<Mutex<Option<Arc<QueueSnapshot>>>>,
    pub snapshot: Option<Arc<QueueSnapshot>>,
    pub startup_error: Option<String>,
    pub settings_pending: bool,
    pub settings_status: SettingsStatus,
    acknowledged_settings: Option<Settings>,
    pub queue_open: bool,
    pub exit_open: bool,
    pub exit_when_stopped: bool,
    exit_intent: ExitIntent,
    pub hidden: bool,
    pub selected_job: Option<u64>,
    selected_presentation: Option<(u64, u32, JobPhase)>,
    pub selected_fraction: Option<f32>,
    presentation: crate::queue_presentation::Presentation,
    queue_scroll: gpui::ScrollHandle,
    fixture: bool,
    preview_scenes: Option<SyncSender<&'static str>>,
    row_notices: std::collections::HashMap<u64, (&'static str, u64)>,
    queue_visible_ids: Vec<u64>,
    title_browse: Option<TitleBrowse>,
    hovered_action: Option<QueueActionHint>,
    action_focus: Vec<QueueActionFocus>,
    retry_pending: std::collections::HashSet<u64>,
    pub feedback: Option<(String, u64)>,
    pub preparation_hovered: bool,
    preparation_retry_pending: bool,
    preparation_copied_at: Option<u64>,
    pub preparation_copy_pending: bool,
    pub preparation_status: Option<(String, bool)>,
    pub upstream: ameow_next::download::upstream::UpstreamChecker,
    pub engine_command_pending: bool,
    pub engine_notice: Option<bool>,
}
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub enum SettingsStatus {
    #[default]
    Idle,
    Saving,
    Saved,
    Failed(String),
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
                ameow_next::download::composition::download_coordinator(root, settings_path, Settings { quality: Quality::Balanced, output_dir, theme: Default::default(), language: Default::default(), tray_icon: Default::default() })
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
                        let updating_runtime = matches!(&command, QueueCommand::UpgradeEngine { .. } | QueueCommand::RestoreRecommended);
                        let retry_source = match &command { QueueCommand::Retry(id) => Some(*id), _ => None };
                        let row_command = match &command {
                            QueueCommand::Cancel(id) => Some((*id, false)),
                            QueueCommand::RetryCleanup(id) => Some((*id, true)),
                            _ => None,
                        };
                        let reply = coordinator.apply(command);
                        append_evidence(&mut evidence, &started, reply_summary(&reply));
                        let event = match reply {
                            CommandReply::Diagnostic(text) => UiReply::Diagnostic { job: diagnostic_job.unwrap_or(0), text },
                            reply if saving => UiReply::Settings(reply),
                            reply if retrying_preparation => UiReply::PreparationRetry(reply),
                            reply if updating_runtime => UiReply::RuntimeUpdate(reply),
                            reply if retry_source.is_some() => UiReply::Retry { source: retry_source.unwrap(), reply },
                            reply if row_command.is_some() => {
                                let (job, cleanup) = row_command.unwrap();
                                UiReply::RowCommand { job, cleanup, reply }
                            }
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
                            "preparation_owner_lost":snapshot.preparation_owner_lost,"preparation":snapshot.preparation,
                            "verified_runtime_versions":snapshot.verified_runtime_versions,"preparation_retry_allowed":snapshot.preparation_retry_allowed,"runtime_update":snapshot.runtime_update,"jobs":jobs})).and_then(|_| file.flush());
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
        Self::with_transport(commands, evidence, replies, latest)
    }
    pub fn fixture(path: PathBuf) -> Self {
        Self::fixture_transport(Some(path), false)
    }
    pub fn preview() -> Self {
        let mut ui = Self::fixture_transport(None, true);
        ui.queue_open = true;
        ui
    }
    fn fixture_transport(path: Option<PathBuf>, preview: bool) -> Self {
        let (commands, receiver) = mpsc::sync_channel(64);
        let (evidence, evidence_receiver) = mpsc::sync_channel(64);
        let (sender, replies) = mpsc::channel();
        let latest = Arc::new(Mutex::new(None));
        let (scenes, scene_receiver) = mpsc::sync_channel(16);
        crate::queue_fixture::start(path, scene_receiver, receiver, evidence_receiver, sender, latest.clone());
        let mut ui = Self::with_transport(commands, evidence, replies, latest);
        ui.fixture = true;
        ui.preview_scenes = preview.then_some(scenes);
        ui
    }
    fn with_transport(
        commands: SyncSender<QueueCommand>, evidence: SyncSender<serde_json::Value>,
        replies: Receiver<UiReply>, latest: Arc<Mutex<Option<Arc<QueueSnapshot>>>>,
    ) -> Self {
        Self {
            language: Default::default(),
            commands,
            evidence,
            last_evidence_ms: 0,
            replies,
            latest,
            snapshot: None,
            startup_error: None,
            settings_pending: false,
            settings_status: SettingsStatus::Idle,
            acknowledged_settings: None,
            queue_open: false,
            exit_open: false,
            exit_when_stopped: false,
            exit_intent: ExitIntent::default(),
            hidden: false,
            selected_job: None,
            selected_presentation: None,
            selected_fraction: None,
            presentation: Default::default(),
            queue_scroll: gpui::ScrollHandle::new(),
            fixture: false,
            preview_scenes: None,
            row_notices: Default::default(),
            queue_visible_ids: Vec::new(),
            title_browse: None,
            hovered_action: None,
            action_focus: Vec::new(),
            retry_pending: Default::default(),
            feedback: None,
            preparation_hovered: false,
            preparation_retry_pending: false,
            preparation_copied_at: None,
            preparation_copy_pending: false,
            preparation_status: None,
            upstream: Default::default(),
            engine_command_pending: false,
            engine_notice: None,
        }
    }
    pub(super) fn evidence(&self, value: serde_json::Value) {
        let _ = self.evidence.try_send(value);
    }
    pub fn send(&mut self, command: QueueCommand, now: u64) -> bool {
        if self.fixture && matches!(command, QueueCommand::Submit { .. } | QueueCommand::SaveSettings(_) | QueueCommand::RetryPreparation | QueueCommand::UpgradeEngine { .. } | QueueCommand::RestoreRecommended) {
            self.feedback = Some(("Fixture · 不受理真实下载或设置写入".into(), now));
            return false;
        }
        match self.commands.try_send(command) {
            Ok(()) => true,
            Err(error) => {
                let (mpsc::TrySendError::Full(command) | mpsc::TrySendError::Disconnected(command)) = error;
                match command {
                    QueueCommand::Cancel(job) => {
                        self.complete_row_command(job, false, &CommandReply::Applied(false), now);
                    }
                    QueueCommand::RetryCleanup(job) => {
                        self.complete_row_command(job, true, &CommandReply::Applied(false), now);
                    }
                    QueueCommand::Retry(job) | QueueCommand::CopyDiagnostic(job) => {
                        self.set_row_notice(job, "操作未受理，请重试", now);
                    }
                    _ => {}
                }
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
        self.acknowledged_settings.clone().or_else(|| self.snapshot
            .as_ref()
            .map(|snapshot| snapshot.settings.clone()))
    }
    pub fn preparation_retry_available(&self) -> bool {
        !self.fixture && !self.preparation_retry_pending
            && self.snapshot.as_ref().is_some_and(|s| s.preparation_retry_allowed)
    }
    pub fn upstream_check_available(&self) -> bool {
        !self.fixture
    }
    pub fn preparation_status_at(&self, now: u64) -> Option<(String, bool)> {
        self.preparation_status.as_ref().filter(|(message, danger)| {
            *danger || message == "正在复制组件诊断" || message == "正在请求重新准备组件"
                || (message == "已复制组件诊断" && self.preparation_copied_at.is_some_and(|at| now.saturating_sub(at) < 2000))
        }).cloned()
    }
    pub fn request_upstream_check(&self) -> bool {
        let accepted = self.upstream_check_available() && self.upstream.request();
        self.evidence(serde_json::json!({"type":"upstream_check_admission","accepted":accepted,"fixture":self.fixture}));
        accepted
    }
    pub fn request_engine_update(&mut self, version: Option<String>, now: u64) -> bool {
        if self.fixture || self.engine_command_pending { return false; }
        if let Some(version) = &version {
            let query = self.upstream.snapshot();
            let current = self.snapshot.as_ref().and_then(|s| s.verified_runtime_versions.iter().find(|(name, _)| name == "yt-dlp")).map(|(_, v)| v.as_str());
            if query.pending || query.worker_running
                || query.checked_at_ms.is_none_or(|at| ameow_next::download::progress::now_ms().saturating_sub(at) > 600_000)
                || query.result.as_ref().and_then(|r| r.as_ref().ok()) != Some(version)
                || current.is_none_or(|current| ameow_next::download::upstream::compare_stable_versions(version, current) != Some(std::cmp::Ordering::Greater)) {
                self.engine_notice = Some(false);
                return false;
            }
        }
        let command = version.map_or(QueueCommand::RestoreRecommended, |version| QueueCommand::UpgradeEngine { version });
        self.engine_command_pending = self.send(command, now);
        self.engine_notice = if self.engine_command_pending { None } else { Some(false) };
        self.engine_command_pending
    }
    pub fn retry_preparation(&mut self, now: u64) {
        if !self.preparation_retry_available() { return; }
        self.preparation_retry_pending = self.send(QueueCommand::RetryPreparation, now);
        self.preparation_status = Some((if self.preparation_retry_pending { "正在请求重新准备组件" } else { "操作未受理，请稍后重试" }.into(), !self.preparation_retry_pending));
    }
    pub fn copy_preparation_diagnostic(&mut self, now: u64) {
        if self.preparation_copy_pending || self.snapshot.is_none() { return; }
        self.preparation_copy_pending = self.send(QueueCommand::CopyPreparationDiagnostic, now);
        self.preparation_status = Some((if self.preparation_copy_pending { "正在复制组件诊断" } else { "操作未受理，请稍后重试" }.into(), !self.preparation_copy_pending));
    }
    pub fn background_actions_available(&self) -> bool {
        !self.queue_open && !self.exit_open && !self.settings_pending
    }
    fn complete_settings(&mut self,reply:CommandReply,now:u64) {
        if let CommandReply::SettingsSaved(settings)=&reply {self.acknowledged_settings=Some(settings.clone());}
        self.settings_pending=false;
        self.settings_status=match &reply {
            CommandReply::SettingsSaved(_) => SettingsStatus::Saved,
            CommandReply::Error(error) => SettingsStatus::Failed(format!("保存失败，默认设置未更改。{error}")),
            _ => SettingsStatus::Failed("设置未保存，请重试".into()),
        };
        self.feedback=Some((match reply {CommandReply::SettingsSaved(_)=>"默认设置已保存".into(),CommandReply::Error(error)=>error,_=>"设置未保存，请重新查看".into()},now));
    }
    fn request_quality(&mut self,quality:Quality,now:u64) -> bool {
        if self.settings_pending{return false;}
        let Some(mut settings)=self.settings() else{return false;};
        settings.quality=quality;self.request_settings(settings,now)
    }
    pub fn request_preferences(&mut self, theme: ThemePreference, language: LanguagePreference, now: u64) -> bool {
        if self.settings_pending { return false; }
        let Some(mut settings) = self.settings() else {
            self.settings_status = SettingsStatus::Failed("下载设置尚未就绪，请稍后重试".into());
            return false;
        };
        settings.theme = theme;
        settings.language = language;
        self.request_settings(settings, now)
    }
    pub fn request_tray_icon(&mut self, tray_icon: TrayIconPreference, now: u64) -> bool {
        if self.settings_pending { return false; }
        let Some(mut settings) = self.settings() else {
            self.settings_status = SettingsStatus::Failed("下载设置尚未就绪，请稍后重试".into());
            return false;
        };
        settings.tray_icon = tray_icon;
        self.request_settings(settings, now)
    }
    fn request_settings(&mut self, settings:Settings, now:u64) -> bool {
        self.settings_pending=self.send(QueueCommand::SaveSettings(settings),now);
        self.settings_status=if self.settings_pending {SettingsStatus::Saving} else {SettingsStatus::Failed("保存未受理，请稍后重试".into())};
        self.settings_pending
    }
    pub fn request_output_directory(&mut self, path:PathBuf, now:u64) -> bool {
        if self.settings_pending {return false;}
        let Some(mut settings)=self.settings() else {
            self.settings_status=SettingsStatus::Failed("下载设置尚未就绪，请稍后重试".into());return false;
        };
        // Use the current ACK after a possibly long-lived native picker.
        settings.output_dir=path;self.request_settings(settings,now)
    }
    fn request_menu_exit(&mut self) {
        self.evidence(serde_json::json!({"type":"exit-request","source":"main-menu"}));
        self.exit_intent.request();
    }
    fn present(
        &mut self,
        model: &mut crate::model::Model,
        indicator: &mut indicator::Indicator,
        now: u64,
    ) {
        let Some(snapshot) = self.snapshot.clone() else {
            return;
        };
        let chosen = self
            .presentation
            .update(&snapshot, self.queue_open, now)
            .and_then(|id| snapshot.jobs.iter().find(|job| job.job_id == id))
            .cloned()
            .or_else(|| self.preview_scenes.as_ref().and_then(|_| {
                (snapshot.jobs.len() == 1 && snapshot.jobs[0].phase.terminal()).then(|| snapshot.jobs[0].clone())
            }));
        self.sync_queue_rows(now);
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
            let changed = self.selected_presentation.as_ref() != Some(&presentation);
            if self
                .selected_presentation
                .as_ref()
                .is_none_or(|(id, attempt, _)| *id != job.job_id || *attempt != job.attempt)
            {
                // Reset only presentation continuity; accepted shell geometry and hover stay intact.
                *indicator = indicator::Indicator::default();
                model.state(Stage::Idle, 0., now);
                model.previous = Stage::Idle;
                model.previous_progress = 0.;
                model.progress = Progress::new(0., now);
                self.selected_job = Some(job.job_id);
            }
            self.selected_presentation = Some(presentation);
            let fraction = if job.phase == JobPhase::Downloading {
                presentation_fraction(
                    job.transfer_progress.as_ref(),
                    ameow_next::download::progress::now_ms(),
                )
            } else {
                None
            };
            self.selected_fraction = fraction;
            if let Some(fraction) = fraction { model.progress.retarget(fraction, now); }
            if changed || !job.phase.terminal() {
                model.state(
                    stage,
                    if stage == Stage::Success {
                        1.
                    } else {
                        fraction.unwrap_or(model.progress.target)
                    },
                    now,
                );
            }
        } else if self.selected_job.take().is_some() {
            self.selected_presentation = None;
            self.selected_fraction = None;
            model.state(Stage::Idle, 0., now);
        }
    }
    pub fn preview_key(&mut self, key: &str) -> bool {
        if self.preview_scenes.is_some() && key.eq_ignore_ascii_case("q") {
            self.queue_open = !self.queue_open;
            self.title_browse = None;
            self.hovered_action = None;
            self.action_focus.clear();
            return true;
        }
        let Some(scenes) = &self.preview_scenes else { return false; };
        let scene = match key {
            "0" => "0", "1" => "1", "2" => "2", "3" => "3", "4" => "4", "5" => "5",
            "6" => "6", "7" => "7", "8" => "8", "9" => "9", _ => return false,
        };
        let _ = scenes.try_send(scene);
        self.presentation = Default::default();
        self.selected_presentation = None;
        self.queue_open = matches!(scene, "8" | "9");
        self.title_browse = None;
        self.hovered_action = None;
        self.action_focus.clear();
        true
    }
    /// None means there is no Full feedback element, including fixture idle.
    fn feedback_message(&self) -> Option<&str> {
        self.feedback.as_ref().map(|(text, _)| text.as_str())
            .filter(|text| !text.is_empty())
            .or(self.startup_error.as_deref().filter(|text| !text.is_empty()))
            .or_else(|| {
                if self.snapshot.as_ref().is_some_and(|snapshot| snapshot.stopping) {
                    Some("已关闭新任务受理，正在安全停止")
                } else if self.snapshot.is_none() && !self.fixture {
                    Some("正在读取下载设置…")
                } else { None }
            })
    }
    pub fn badge(&self) -> Option<(usize, bool, bool)> {
        self.snapshot
            .as_ref()
            .and_then(|snapshot| badge_counts(snapshot.unfinished, self.presentation.failures(snapshot)))
    }
    fn complete_diagnostic(&mut self, job: u64, result: Result<(), String>, now: u64) -> bool {
        if job == 0 {
            self.preparation_copy_pending = false;
            self.preparation_status = Some((if result.is_ok() { "已复制组件诊断" } else { "无法复制组件诊断，请重试" }.into(), result.is_err()));
        }
        match result {
            Ok(()) => {
                if job == 0 {
                    self.preparation_copied_at = Some(now);
                    self.feedback = Some(("已复制组件诊断".into(), now));
                } else {
                    self.set_row_notice(job, "诊断已复制", now);
                    self.feedback = Some((format!("已复制任务 {job} 的诊断"), now));
                }
                true
            }
            Err(error) => {
                if job != 0 { self.set_row_notice(job, "复制失败，请重试", now); }
                self.feedback = Some((error, now));
                false
            }
        }
    }
    fn complete_retry(&mut self, source: u64, reply: &CommandReply, now: u64) {
        self.retry_pending.remove(&source);
        self.presentation.retry_reply(source, reply);
        if let CommandReply::Accepted(job) = reply {
            // The source Failure retires on acceptance; the new waiting row owns this notice.
            self.set_row_notice(*job, "已加入下载队列", now);
        } else {
            self.set_row_notice(source, "重试未受理", now);
        }
        self.feedback = Some((match reply {
            CommandReply::Accepted(_) => "已加入下载队列".into(),
            CommandReply::Error(error) => error.clone(),
            _ => "任务状态已变化，请重新查看".into(),
        }, now));
    }
    fn row_notice(&self, job: u64, now: u64) -> Option<&'static str> {
        self.row_notices.get(&job).filter(|(_, at)| now < at + 5000).map(|(text, _)| *text)
    }
    fn row_title(&self, job: &JobSnapshot, now: u64) -> String {
        self.row_notice(job.job_id, now).map(|text| local_text(self.language, text)).unwrap_or_else(||
            if job.title.is_empty() { format!("{} {}", self.language.text("任务", "Job"), job.job_id) } else { job.title.clone() })
    }
    fn set_row_notice(&mut self, job: u64, text: &'static str, now: u64) {
        if self.title_browse.as_ref().is_some_and(|browse| browse.job == job) {
            self.title_browse = None;
        }
        self.row_notices.insert(job, (text, now));
    }
    fn complete_row_command(&mut self, job: u64, cleanup: bool, reply: &CommandReply, now: u64) {
        if matches!(reply, CommandReply::Applied(true)) { return; }
        let text = if cleanup { "清理未受理，请重试" } else { "取消未受理，请重试" };
        if job == 0 {
            // Shared preparation cleanup addresses owner0; retain feedback on its visible Held rows.
            let rows: Vec<_> = self.snapshot.as_ref().into_iter().flat_map(|s| &s.jobs)
                .filter(|j| j.phase == JobPhase::Held && !j.slot_owned).map(|j| j.job_id).collect();
            for id in rows { self.set_row_notice(id, text, now); }
        } else {
            self.set_row_notice(job, text, now);
        }
        self.feedback = Some((text.into(), now));
    }
}
fn append_evidence(file: &mut Option<File>, started: &Instant, mut event: serde_json::Value) {
    if let Some(file) = file {
        event["elapsed_ms"] = serde_json::json!(started.elapsed().as_millis());
        let _ = writeln!(file, "{event}").and_then(|_| file.flush());
    }
}
pub(crate) fn command_summary(command: &QueueCommand) -> serde_json::Value {
    match command {
        QueueCommand::Submit { .. } => serde_json::json!({"type":"command","command":"submit"}),
        QueueCommand::SaveSettings(settings) => {
            serde_json::json!({"type":"command","command":"save-settings","quality":settings.quality,"theme":settings.theme,"language":settings.language,"tray_icon":settings.tray_icon})
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
        QueueCommand::UpgradeEngine { version } => serde_json::json!({"type":"command","command":"upgrade-engine","version":version}),
        QueueCommand::RestoreRecommended => serde_json::json!({"type":"command","command":"restore-recommended"}),
    }
}
fn reply_summary(reply: &CommandReply) -> serde_json::Value {
    match reply {
        CommandReply::Accepted(job) => {
            serde_json::json!({"type":"reply","reply":"accepted","job":job})
        }
        CommandReply::SettingsSaved(settings) => {
            serde_json::json!({"type":"reply","reply":"settings-saved","quality":settings.quality,"theme":settings.theme,"language":settings.language,"tray_icon":settings.tray_icon})
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
fn local_text(language: crate::ui_text::Language, text: &str) -> String {
    if language == crate::ui_text::Language::Chinese { return language.message(text); }
    let translated = match text {
        "等待下载" => "Queued",
        "准备下载组件" => "Setup",
        "解析视频" => "Resolving",
        "合并中" => "Merging",
        "下载中" => "Downloading",
        "校验媒体" => "Checking",
        "保存文件" => "Saving",
        "清理待确认" => "Cleanup?",
        "下载完成" => "Done",
        "下载失败" => "Failed",
        "已取消" => "Cancelled",
        "准备异常，清理未确认" => "Setup: cleanup unconfirmed",
        "正在等待组件清理" => "Waiting for cleanup",
        "组件准备失败，等待重试" => "Setup failed; retry",
        "音频下载中" => "Downloading audio",
        "处理中" => "Processing",
        "下载中 · 估算" => "Downloading · est.",
        "清理未确认" => "Cleanup?",
        "等待组件清理" => "Cleanup",
        "组件准备失败" => "Setup failed",
        "重试" => "Retry",
        "复制诊断" => "Copy",
        "清除记录" => "Clear",
        "取消" => "Cancel",
        "重试清理" => "Retry clean",
        "准备下载" => "Preparing",
        "正在安全停止" => "Stopping safely",
        "检查缓存" => "Checking cache",
        "下载组件" => "Download tools",
        "校验完整性" => "Verifying",
        "解压组件" => "Extracting",
        "检查版本" => "Checking version",
        "准备就绪" => "Ready",
        "组件已就绪" => "Tools ready",
        "连接超时" => "Connection timed out",
        "连接失败" => "Connection failed",
        "系统路由不受支持" => "Unsupported system routing",
        "服务器响应失败" => "Server error",
        "组件大小不符" => "Incorrect component size",
        "完整性校验失败" => "Integrity check failed",
        "解压失败" => "Extraction failed",
        "存储权限不足" => "Permission denied",
        "组件检查失败" => "Component check failed",
        "存储失败" => "Storage error",
        "准备已停止" => "Setup stopped",
        "原因尚未确认" => "Cause unknown",
        "检查连接后可重试，或复制诊断。" => "Check your connection and retry, or copy diagnostics.",
        "检查现有系统路由，未尝试直连。" => "Check system routing. A direct connection was not attempted.",
        "稍后可手动重试，或复制诊断。" => "Retry later or copy diagnostics.",
        "可手动重试，或复制诊断。" => "Retry or copy diagnostics.",
        "检查组件目录权限后可重试。" => "Check component folder permissions and retry.",
        "检查可用空间和目录权限后可重试。" => "Check available space and folder permissions.",
        "组件尚未准备完成。" => "Setup is incomplete.",
        "复制诊断以进一步检查，或手动重试。" => "Copy diagnostics for investigation or retry.",
        "准备线程异常结束，清理未确认，暂不能安全退出。" => "Setup stopped unexpectedly. Cleanup is unconfirmed; cannot safely quit yet.",
        "清理尚未确认，存活任务仍保留资源，可重试清理。" => "Cleanup is unconfirmed. Running tasks hold resources; retry cleanup.",
        "正在等待下载进程与文件收束。" => "Waiting for download processes and files to settle.",
        "继续运行，或停止所有任务后退出。" => "Continue, or stop all tasks and quit.",
        "保存失败，请重试" => "Save failed. Retry.",
        "正在保存画质…" => "Saving quality…",
        "暂时无法保存，请稍后重试" => "Cannot save yet. Retry later.",
        "无法启动下载命令处理，请重新打开 Ameow" => "Download service failed to start. Reopen Ameow.",
        "Fixture · 不受理真实下载或设置写入" => "Fixture · downloads and settings disabled",
        "操作未受理，请重试" => "Action rejected. Retry.",
        "操作未受理，请稍后重试" => "Action rejected. Retry later.",
        "设置未保存，请重试" => "Settings not saved. Retry.",
        "默认设置已保存" => "Settings saved",
        "设置未保存，请重新查看" => "Settings not saved. Check again.",
        "保存未受理，请稍后重试" => "Save rejected. Retry later.",
        "下载设置尚未就绪，请稍后重试" => "Settings not ready. Retry later.",
        "已关闭新任务受理，正在安全停止" => "Stopping safely; new tasks disabled",
        "正在读取下载设置…" => "Loading settings…",
        "已复制组件诊断" => "Component diagnostic copied",
        "诊断已复制" => "Diagnostic copied",
        "复制失败，请重试" => "Copy failed. Retry.",
        "已加入下载队列" => "Added to queue",
        "重试未受理" => "Retry rejected",
        "任务状态已变化，请重新查看" => "Task changed. Check again.",
        "清理未受理，请重试" => "Cleanup rejected. Retry.",
        "取消未受理，请重试" => "Cancel rejected. Retry.",
        "已重新准备组件" => "Component setup restarted",
        "组件状态已变化，请重新查看" => "Component state changed. Check again.",
        "窗口尚未就绪" => "Window not ready",
        "该视频已在下载队列中" => "Video already in queue",
        "准备线程异常结束，清理未确认，暂不能下载" => "Setup stopped unexpectedly; cleanup unconfirmed.",
        "请复制一个视频链接后粘贴" => "Copy a video link and paste it",
        "托盘不可用，请保持窗口打开" => "Tray unavailable. Keep this window open.",
        "无法打开下载目录，请稍后重试" => "Could not open downloads folder. Retry.",
        "正在保存默认设置，请稍后再试" => "Saving settings. Try again shortly.",
        "请拖入一个可写文件夹" => "Drop a writable folder",
        _ => {
            if let Some(rate) = text.strip_prefix("下载 ") { return format!("Downloading {rate}"); }
            if let Some(rate) = text.strip_prefix("估算 ") { return format!("Est. {rate}"); }
            if let Some(job) = text.strip_prefix("已复制任务 ").and_then(|s| s.strip_suffix(" 的诊断")) { return format!("Copied diagnostic for job {job}"); }
            return language.message(text);
        }
    };
    translated.to_owned()
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
    if sample.is_some_and(|sample| sample.merging) { return "合并中".into(); }
    if let Some(sample) = sample {
        match sample.phase {
            ameow_next::download::progress::TransferPhase::Audio => return "音频下载中".into(),
            ameow_next::download::progress::TransferPhase::Processing => return "处理中".into(),
            _ => {}
        }
    }
    let Some(speed) = sample.and_then(|sample| sample.speed_at(now)) else {
        return if sample.is_some_and(|s| s.estimated_total_bytes.is_some() && s.recent(now)) { "下载中 · 估算" } else { "下载中" }.into();
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
        format!("{} {value:.1}{unit}", if sample.is_some_and(|s| s.estimated_total_bytes.is_some() && s.recent(now)) { "估算" } else { "下载" })
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
impl DownloadUi {
    fn sync_queue_rows(&mut self, now: u64) {
        let next: Vec<_> = self.snapshot.as_ref().into_iter().flat_map(|s| &s.jobs)
            .filter(|job| self.presentation.visible(job, now)).map(|job| job.job_id).collect();
        let offset = self.queue_scroll.offset();
        let y = anchored_queue_offset(&self.queue_visible_ids, &next, f32::from(offset.y));
        self.queue_scroll.set_offset(point(offset.x, px(y)));
        if self.title_browse.as_ref().is_some_and(|browse| !next.contains(&browse.job)
            || self.snapshot.as_ref().is_none_or(|s| s.jobs.iter().find(|j| j.job_id == browse.job)
                .is_none_or(|j| j.title.replace(['\n', '\r', '\t'], " ") != browse.title
                    || j.phase != browse.phase || j.attempt != browse.attempt
                    || queue_title_width(queue_row_icons(j, s.preparation_held).len()) != browse.slot))) { self.title_browse = None; }
        self.queue_visible_ids = next;
        self.sync_action_hints(now);
    }
    pub(super) fn queue_animation_delay(&mut self, now: u64, reduced: bool) -> Option<u64> {
        self.sync_action_hints(now);
        if !self.queue_open || reduced || self.title_browse.as_ref().is_some_and(|browse|
            browse.scroll_y != f32::from(self.queue_scroll.offset().y)) {
            self.title_browse = None;
        }
        self.title_browse.as_ref().and_then(|browse| browse.delay(now))
    }
}
const QUEUE_ROW_HEIGHT: f32 = 56.;
const QUEUE_CONTENT_WIDTH: f32 = 180.;
const QUEUE_ICON_SIZE: f32 = 24.;
const QUEUE_ICON_GAP: f32 = 2.;
const QUEUE_LINE_GAP: f32 = 4.;
const QUEUE_TRACK_WIDTH: f32 = 122.;
const QUEUE_STATUS_WIDTH: f32 = QUEUE_CONTENT_WIDTH - QUEUE_TRACK_WIDTH - QUEUE_LINE_GAP;
fn queue_action_width(count: usize) -> f32 {
    count as f32 * QUEUE_ICON_SIZE + count.saturating_sub(1) as f32 * QUEUE_ICON_GAP
}
fn queue_title_width(count: usize) -> f32 {
    QUEUE_CONTENT_WIDTH - queue_action_width(count) - if count > 0 { QUEUE_LINE_GAP } else { 0. }
}
fn queue_text_width(text: &str, size: f32, weight: FontWeight, window: &Window) -> f32 {
    let mut font = crate::tokens::ui_font();
    font.weight = weight;
    let run = TextRun { len: text.len(), font, color: transparent_black(),
        background_color: None, underline: None, strikethrough: None };
    f32::from(window.text_system().shape_line(text.to_owned().into(), px(size), &[run], None).width)
}
const TITLE_WAIT_MS: u64 = 700;
const TITLE_PIXELS_PER_MS: f32 = 0.014;
#[derive(Clone, Debug)]
struct TitleBrowse {
    job: u64,
    phase: JobPhase,
    attempt: u32,
    title: String,
    slot: f32,
    started: u64,
    overflow: f32,
    scroll_y: f32,
}
impl TitleBrowse {
    fn new(job: &JobSnapshot, title: String, width: f32, slot: f32, started: u64, scroll_y: f32) -> Option<Self> {
        let overflow = width - slot;
        (overflow > 0.5 && overflow.is_finite()).then_some(Self {
            job: job.job_id, phase: job.phase.clone(), attempt: job.attempt, title, slot, started, overflow, scroll_y,
        })
    }
    fn offset(&self, now: u64) -> f32 {
        (now.saturating_sub(self.started + TITLE_WAIT_MS) as f32 * TITLE_PIXELS_PER_MS).min(self.overflow)
    }
    fn delay(&self, now: u64) -> Option<u64> {
        if now < self.started + TITLE_WAIT_MS {
            Some(self.started + TITLE_WAIT_MS - now)
        } else {
            (self.offset(now) < self.overflow).then_some(16)
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum QueueIcon { Retry, Copy, Clear, Cancel, Cleanup }
#[derive(Clone, Debug, PartialEq, Eq)]
struct QueueActionHint {
    job: u64,
    phase: JobPhase,
    attempt: u32,
    slot_owned: bool,
    icon: QueueIcon,
}
impl QueueActionHint {
    fn new(job: &JobSnapshot, icon: QueueIcon) -> Self {
        Self { job: job.job_id, phase: job.phase.clone(), attempt: job.attempt, slot_owned: job.slot_owned, icon }
    }
}
struct QueueActionFocus {
    action: QueueActionHint,
    handle: FocusHandle,
}
fn queue_row_icons(job: &JobSnapshot, preparation_held: bool) -> &'static [QueueIcon] {
    match job.phase {
        JobPhase::Failure => &[QueueIcon::Retry, QueueIcon::Copy, QueueIcon::Clear],
        JobPhase::Success | JobPhase::Cancelled => &[],
        JobPhase::Held if job.slot_owned || preparation_held => &[QueueIcon::Cancel, QueueIcon::Cleanup],
        _ => &[QueueIcon::Cancel],
    }
}
fn queue_progress_label(job: &JobSnapshot, fraction: Option<f32>, now: u64) -> String {
    if job.phase != JobPhase::Downloading { return phase_label(job); }
    let label = transfer_label(job.transfer_progress.as_ref(), now);
    let Some(fraction) = fraction else { return label; };
    let percent = format!("{}{}%",
        if job.transfer_progress.as_ref().is_some_and(|s| s.estimated_total_bytes.is_some()) { "≈" } else { "" },
        (fraction * 100.).floor() as u32);
    // The phase is already conveyed by the blue track; keep percent and measured rate legible.
    match label.split_once(' ') {
        Some(("下载" | "估算", rate)) if rate.ends_with("/s") => format!("{percent} {rate}"),
        _ => percent,
    }
}
fn queue_row_status(job: &JobSnapshot, snapshot: &QueueSnapshot, fraction: Option<f32>, now: u64) -> String {
    if snapshot.preparation_owner_lost && !job.slot_owned && !job.phase.terminal() {
        "清理未确认".into()
    } else if job.phase == JobPhase::Preparing {
        // Queue-only concise copy fits the fixed status slot. Other surfaces retain details.
        if snapshot.preparation_held {
            "等待组件清理".into()
        } else if snapshot.preparation.phase == PreparationPhase::Failed {
            "组件准备失败".into()
        } else {
            phase_label(job)
        }
    } else if job.phase == JobPhase::Failure {
        "下载失败".into()
    } else {
        queue_progress_label(job, fraction, now)
    }
}
impl QueueIcon {
    fn name(self) -> &'static str {
        match self { Self::Retry => "retry", Self::Copy => "copy", Self::Clear => "clear", Self::Cancel => "cancel", Self::Cleanup => "cleanup" }
    }
    fn label(self) -> &'static str {
        match self { Self::Retry => "重试", Self::Copy => "复制诊断", Self::Clear => "清除记录", Self::Cancel => "取消", Self::Cleanup => "重试清理" }
    }
}
impl DownloadUi {
    fn action_hint_allowed(&self, action: &QueueActionHint, now: u64) -> bool {
        self.row_action_allowed(action.job, action.icon, now)
            && self.snapshot.as_ref().is_some_and(|s| s.jobs.iter().any(|j|
                j.job_id == action.job && j.phase == action.phase && j.attempt == action.attempt
                    && j.slot_owned == action.slot_owned
                    && queue_row_icons(j, s.preparation_held).contains(&action.icon)))
    }
    fn sync_action_hints(&mut self, now: u64) {
        if self.hovered_action.as_ref().is_some_and(|action| !self.action_hint_allowed(action, now)) {
            self.hovered_action = None;
        }
        // Dropping invalid handles also prevents a reopened/replaced row inheriting old focus.
        let mut focus = std::mem::take(&mut self.action_focus);
        focus.retain(|entry| self.action_hint_allowed(&entry.action, now));
        self.action_focus = focus;
    }
    fn prepare_action_focus(&mut self, now: u64, cx: &mut Context<Prototype>) {
        self.sync_action_hints(now);
        let actions: Vec<_> = self.snapshot.as_ref().into_iter().flat_map(|s| s.jobs.iter()
            .flat_map(|job| queue_row_icons(job, s.preparation_held).iter()
                .map(move |&icon| QueueActionHint::new(job, icon))))
            .filter(|action| self.action_hint_allowed(action, now)).collect();
        for action in actions {
            if !self.action_focus.iter().any(|entry| entry.action == action) {
                // GPUI does not copy div tab settings onto an explicitly tracked handle.
                self.action_focus.push(QueueActionFocus { action, handle: cx.focus_handle().tab_index(0).tab_stop(true) });
            }
        }
    }
    fn hover_action(&mut self, action: &QueueActionHint, hovered: bool, now: u64) {
        if hovered && self.action_hint_allowed(action, now) {
            self.hovered_action = Some(action.clone());
        } else if self.hovered_action.as_ref() == Some(action) {
            self.hovered_action = None;
        }
    }
    fn row_action_label(&self, job: u64, focused: Option<&QueueActionHint>, now: u64) -> Option<&'static str> {
        // A pointer over an action takes precedence; leaving falls back to real keyboard focus.
        self.hovered_action.as_ref().filter(|action| action.job == job && self.action_hint_allowed(action, now))
            .or_else(|| focused.filter(|action| action.job == job && self.action_hint_allowed(action, now)))
            .map(|action| action.icon.label())
    }
    fn row_action_allowed(&self, id: u64, icon: QueueIcon, now: u64) -> bool {
        let Some(snapshot) = &self.snapshot else { return false; };
        let Some(job) = snapshot.jobs.iter().find(|j| j.job_id == id) else { return false; };
        if !self.queue_open || !self.presentation.visible(job, now) { return false; }
        match icon {
            QueueIcon::Retry | QueueIcon::Copy | QueueIcon::Clear =>
                job.phase == JobPhase::Failure && !self.retry_pending.contains(&id),
            QueueIcon::Cancel => !job.phase.terminal() && (!snapshot.preparation_owner_lost || job.slot_owned),
            QueueIcon::Cleanup => job.phase == JobPhase::Held &&
                (job.slot_owned || snapshot.preparation_held && !snapshot.preparation_owner_lost),
        }
    }
    fn activate_row_action(&mut self, id: u64, icon: QueueIcon, now: u64) {
        // Check current authority again, including a keyboard/click racing a snapshot or Retry reply.
        if !self.row_action_allowed(id, icon, now) { return; }
        self.title_browse = None;
        match icon {
            QueueIcon::Clear => {
                self.presentation.clear(id);
                self.sync_queue_rows(now);
                self.evidence(serde_json::json!({"type":"presentation-clear","job":id}));
            }
            QueueIcon::Retry => {
                if self.send(QueueCommand::Retry(id), now) { self.retry_pending.insert(id); }
            }
            QueueIcon::Copy => { self.send(QueueCommand::CopyDiagnostic(id), now); }
            QueueIcon::Cancel => { self.send(QueueCommand::Cancel(id), now); }
            QueueIcon::Cleanup => {
                let slot_owned = self.snapshot.as_ref().is_some_and(|s| s.jobs.iter().any(|j| j.job_id == id && j.slot_owned));
                self.send(QueueCommand::RetryCleanup(if slot_owned { id } else { 0 }), now);
            }
        }
    }
}
// Native outline vectors at14px, with a shared1.2px stroke. No platform font glyphs.
fn queue_icon_drawing(icon: QueueIcon, color: Hsla) -> impl IntoElement {
    canvas(|_, _, _| (), move |bounds, _, window, _| {
        let paths: &[&[(f32, f32)]] = match icon {
            QueueIcon::Retry | QueueIcon::Cleanup => &[
                &[(11.8, 5.3), (10.5, 3.4), (8.5, 2.4), (6.1, 2.5), (4.1, 3.7), (3.1, 5.8), (3.2, 8.2), (4.6, 10.3), (6.7, 11.2), (9.1, 10.8), (10.8, 9.3)],
                &[(11.8, 2.3), (11.8, 5.5), (8.6, 5.5)],
            ],
            QueueIcon::Copy => &[
                &[(5., 5.), (11.5, 5.), (11.5, 11.5), (5., 11.5), (5., 5.)],
                &[(8.5, 2.5), (2.5, 2.5), (2.5, 8.5)],
            ],
            QueueIcon::Clear => &[
                &[(2.4, 4.), (11.6, 4.)], &[(5., 4.), (5., 2.5), (9., 2.5), (9., 4.)],
                &[(3.5, 4.), (4.1, 11.5), (9.9, 11.5), (10.5, 4.)],
                &[(5.7, 6.2), (5.9, 9.3)], &[(8.3, 6.2), (8.1, 9.3)],
            ],
            QueueIcon::Cancel => &[&[(3.5, 3.5), (10.5, 10.5)], &[(10.5, 3.5), (3.5, 10.5)]],
        };
        for points in paths {
            let mut path = PathBuilder::stroke(px(1.2));
            for (index, (x, y)) in points.iter().enumerate() {
                let point = bounds.origin + point(px(*x), px(*y));
                if index == 0 { path.move_to(point); } else { path.line_to(point); }
            }
            if let Ok(path) = path.build() { window.paint_path(path, color); }
        }
    }).size(px(14.))
}
fn anchored_queue_offset(previous: &[u64], next: &[u64], offset: f32) -> f32 {
    let first = ((-offset).max(0.) / QUEUE_ROW_HEIGHT).floor() as usize;
    previous.iter().enumerate().skip(first).find_map(|(old_index, id)| {
        next.iter().position(|next_id| next_id == id).map(|new_index|
            (offset + (old_index as f32 - new_index as f32) * QUEUE_ROW_HEIGHT).min(0.))
    }).unwrap_or(offset)
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
#[derive(Clone, Copy)]
enum MenuIcon { Empty, Back, Forward, Check, Quality, Hide, Settings, Exit }
fn surface_menu_icon(icon: MenuIcon, color: Hsla) -> impl IntoElement {
    canvas(|_, _, _| (), move |bounds, _, window, _| {
        let paths: &[&[(f32, f32)]] = match icon {
            MenuIcon::Empty => &[],
            MenuIcon::Back => &[&[(9.5, 3.5), (5., 8.), (9.5, 12.5)]],
            MenuIcon::Forward => &[&[(6., 4.), (10., 8.), (6., 12.)]],
            MenuIcon::Check => &[&[(3., 8.), (6.5, 11.5), (13., 4.5)]],
            MenuIcon::Quality => &[&[(2.5, 4.), (13.5, 4.)], &[(2.5, 8.), (13.5, 8.)], &[(2.5, 12.), (13.5, 12.)], &[(6., 2.5), (6., 5.5)], &[(10., 6.5), (10., 9.5)], &[(5., 10.5), (5., 13.5)]],
            MenuIcon::Hide => &[&[(8., 2.), (8., 10.)], &[(4.5, 6.5), (8., 10.), (11.5, 6.5)], &[(2.5, 9.), (2.5, 13.), (13.5, 13.), (13.5, 9.)]],
            MenuIcon::Exit => &[&[(6., 3.), (2.5, 3.), (2.5, 13.), (6., 13.)], &[(6., 8.), (13.5, 8.)], &[(10., 4.5), (13.5, 8.), (10., 11.5)]],
            MenuIcon::Settings => &[&[(2.5, 5.), (13.5, 5.)], &[(2.5, 11.), (13.5, 11.)], &[(5., 2.5), (5., 7.5)], &[(10.5, 8.5), (10.5, 13.5)]],
        };
        for points in paths {
            let mut path = PathBuilder::stroke(px(1.2));
            for (index, (x, y)) in points.iter().enumerate() {
                let position = bounds.origin + point(px(*x), px(*y));
                if index == 0 { path.move_to(position); } else { path.line_to(position); }
            }
            if let Ok(path) = path.build() { window.paint_path(path, color); }
        }
    }).size(px(16.)).flex_none()
}
impl Prototype {
    pub(super) fn poll_downloads(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let now = self.now();
        // A removed/disabled action can release the last focused handle. Restore the existing
        // root only in that case, so queue return and scene changes keep keyboard navigation live.
        if window.focused(cx).is_none() { window.focus(&self.focus); }
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
                TrayEvent::Restore => { self.close_tray_popup(cx); self.restore_downloads(window, cx); }
                TrayEvent::TogglePopup => self.toggle_tray_popup(cx),
            }
        }
        let actions = std::mem::take(&mut *self.tray_actions.borrow_mut());
        for action in actions {
            if let Some(ui) = &self.downloads { ui.evidence(serde_json::json!({"type":"tray-popup-action","action":format!("{action:?}")})); }
            match action {
                crate::tray_popup::Action::Status => { self.restore_downloads(window, cx); self.open_queue(cx); }
                crate::tray_popup::Action::Open => self.restore_downloads(window, cx),
                crate::tray_popup::Action::Settings => self.open_or_focus_settings(cx),
                crate::tray_popup::Action::Exit => { self.restore_downloads(window, cx); if let Some(ui) = &mut self.downloads { ui.request_menu_exit(); } }
                crate::tray_popup::Action::Closed => {}
            }
        }
        let Some(ui) = &mut self.downloads else {
            return;
        };
        let mut menu_saved = false;
        for reply in ui.poll() {
            match reply {
                UiReply::RuntimeUpdate(reply) => {
                    ui.engine_command_pending = false;
                    ui.engine_notice = Some(matches!(reply, CommandReply::Applied(true)));
                }
                UiReply::Retry { source, reply } => {
                    ui.evidence(serde_json::json!({"type":"retry-reply","source":source,"accepted":matches!(reply, CommandReply::Accepted(_))}));
                    ui.complete_retry(source, &reply, now);
                }
                UiReply::RowCommand { job, cleanup, reply } => {
                    ui.complete_row_command(job, cleanup, &reply, now);
                }
                UiReply::PreparationRetry(reply) => {
                    ui.preparation_retry_pending = false;
                    ui.preparation_status = Some((match &reply {
                        CommandReply::Applied(true) => "已请求重新准备组件",
                        _ => "组件状态已变化，请重新查看",
                    }.into(), !matches!(&reply, CommandReply::Applied(true))));
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
                    if let Some(generation) = self.menu_save_generation.take() {
                        menu_saved = self.surface_menu.saved(generation, matches!(reply, CommandReply::SettingsSaved(_)), now);
                    }
                    ui.complete_settings(reply,now);
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
                    if ui.complete_diagnostic(job, result, now) && job != 0 {
                        self.copied_at = Some(now);
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
            ui.present(&mut self.model, &mut self.indicator, now);
        }
        if now >= ui.last_evidence_ms + if ui.fixture { 100 } else { 200 } {
            ui.last_evidence_ms = now;
            let upstream = ui.upstream.snapshot();
            ui.evidence(serde_json::json!({"type":"presentation","selected_job":ui.selected_job,"stage":format!("{:?}",self.model.stage),
                "upstream":{"pending":upstream.pending,"worker_running":upstream.worker_running,"checked_at_ms":upstream.checked_at_ms,
                    "result":upstream.result.as_ref().map(|result|match result {Ok(version)=>serde_json::json!({"stable_release":version}),Err(error)=>serde_json::json!({"error":format!("{error:?}")})})},
                "selected_attempt":ui.selected_presentation.as_ref().map(|(_, attempt, _)| *attempt),"primary_fraction":ui.selected_fraction,
                "tween_fraction":self.model.progress.sample(now),"displayed_percent":ui.selected_fraction.map(|_| ((if self.model.reduced { self.model.progress.target } else { self.model.progress.sample(now) }).min(0.99) * 100.).round() as u32),
                "observed_at_ms":ameow_next::download::progress::now_ms(),
                "fullness":self.model.fullness,"queue_open":ui.queue_open,"exit_open":ui.exit_open,"hidden":ui.hidden,"badge":ui.badge(),
                "menu_page":self.surface_menu.name(),"menu_selected":self.surface_menu.selected,
                "menu_pending":ui.settings_pending,"menu_hint":self.surface_menu.hint.is_some(),"visual_offset":self.visual_offset,
                "visible_rows":ui.snapshot.as_ref().map(|s| s.jobs.iter().filter(|j| ui.presentation.visible(j, now)).map(|j| j.job_id).collect::<Vec<_>>()),
                "queue_scroll":[f32::from(ui.queue_scroll.offset().x), f32::from(ui.queue_scroll.offset().y)],
                "preparation_visible":ui.snapshot.as_ref().is_some_and(|s| preparation_visible(s, ameow_next::download::progress::now_ms())),
                "preparation_hovered":ui.preparation_hovered}));
        }
        // Hidden main windows do not render, but settings and tray projections still observe us.
        self.refresh_preferences();
        if menu_saved { self.close_menu(cx); }
        self.process_exit_request(window, cx);
        self.model.tick(now);
        cx.notify();
    }
    pub(super) fn restore_downloads(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(native) = &self.native {
            tray::Tray::restore(native.hwnd);
        }
        if let Some(ui) = &mut self.downloads {
            ui.hidden = false;
        }
        // Windows Tray::restore already shows and requests foreground; its native
        // WM_ACTIVATE updates GPUI's active state. Activating again through GPUI
        // would replay the hidden startup placement and synthesize global Alt.
        #[cfg(not(target_os = "windows"))]
        window.activate_window();
        window.focus(&self.focus);
        self.model.pointer(true, self.now());
        cx.notify();
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
                self.surface_menu.close(now);self.background_clicks.reset();
                if let Some(ui) = &mut self.downloads {
                    ui.queue_open = false;
                    ui.title_browse = None;
                    ui.presentation.close_queue();
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
        self.surface_menu.close(now);self.background_clicks.reset();
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
                    ui.title_browse = None;
                ui.presentation.close_queue();
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
                    ui.title_browse = None;
                    ui.presentation.close_queue();
                    ui.exit_open = false;
                    ui.exit_when_stopped = false;
                }
                self.close_menu(cx);
            }
            "t" | "T" => {
                let now = self.now();
                if let Some(ui) = &mut self.downloads && let Some(settings) = ui.settings() {
                    ui.request_preferences(if self.night { ThemePreference::Light } else { ThemePreference::Dark }, settings.language, now);
                }
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
                return Some(local_text(ui.language, "正在安全停止"));
            }
            if let Some(job) = ui
                .selected_job
                .and_then(|id| snapshot.jobs.iter().find(|job| job.job_id == id))
            {
                return Some(local_text(ui.language, &if job.phase == JobPhase::Downloading {
                    transfer_label(
                        job.transfer_progress.as_ref(),
                        ameow_next::download::progress::now_ms(),
                    )
                } else {
                    preparation_wait_label(&job.phase, snapshot).unwrap_or_else(|| phase_label(job))
                }));
            }
        }
        Some(local_text(ui.language, "准备下载"))
    }
    pub(super) fn surface_menu_action(&mut self, action: crate::context_menu::Action, cx: &mut Context<Self>) {
        use crate::context_menu::Action;
        let now = self.now();
        self.background_clicks.reset();
        match action {
            Action::Back => {
                if self.surface_menu.back(now) { self.close_menu(cx); }
            }
            Action::OpenQuality => {
                let quality = self.downloads.as_ref().and_then(|ui| ui.settings()).map(|s| s.quality);
                self.surface_menu.quality(quality, now);
            }
            Action::Quality(quality) => {
                if let Some(ui) = &mut self.downloads {
                    if ui.request_quality(quality, now) {
                        self.menu_save_generation = Some(self.surface_menu.generation());
                        self.surface_menu.hint = Some("正在保存画质…".into());
                    } else if !ui.settings_pending {
                        self.surface_menu.hint = Some("暂时无法保存，请稍后重试".into());
                    }
                }
            }
            Action::Hide => self.hide_downloads(cx),
            Action::Settings => {
                self.close_menu(cx);
                self.open_or_focus_settings(cx);
            }
            Action::Exit => {
                self.close_menu(cx);
                if let Some(ui) = &mut self.downloads { ui.request_menu_exit(); }
            }
        }
        cx.notify();
    }
    pub(super) fn surface_menu_page(&self, cx: &mut Context<Self>) -> AnyElement {
        use crate::context_menu::{Action, Page};
        let p = Palette::new(self.night);
        let g = self.model.geometry();
        let now = self.now();
        let language = self.downloads.as_ref().map_or_else(Default::default, |ui| ui.language);
        let quality_page = self.surface_menu.page == Some(Page::Quality);
        let back = div().id("surface-menu-back").size(px(28.)).flex_none()
            .flex().items_center().justify_center().rounded(px(5.)).cursor_pointer()
            .hover(move |s| s.bg(p.badge))
            .child(surface_menu_icon(MenuIcon::Back, p.neutral))
            .on_mouse_down(MouseButton::Left, cx.listener(|this, _, _, cx| {
                this.background_clicks.reset(); cx.stop_propagation();
            }))
            .on_click(cx.listener(|this, _, _, cx| this.surface_menu_action(Action::Back, cx)));
        let header = div().absolute().left(px(12.)).top(px(12.)).w(px(176.)).h(px(28.))
            .flex().items_center().gap(px(6.)).child(back)
            .child(div().id("surface-menu-header-drag").h_full().flex_1().flex().items_center()
                .text_size(px(12.)).text_color(p.neutral).child(if quality_page { language.text("画质", "Quality") } else { "" })
                .on_mouse_down(MouseButton::Left, cx.listener(|this, _, window, cx| {
                    this.background_clicks.reset(); window.focus(&this.focus);
                    this.drag = Some((crate::native::Native::cursor(), this.anchor));
                    this.model.locks.drag = true; this.model.locks_changed(this.now());
                    cx.stop_propagation(); cx.notify();
                })));
        let list = div().absolute().left(px(12.)).top(px(44.)).w(px(176.)).h(px(152.))
            .overflow_hidden()
            .children(self.surface_menu.pages(now, self.model.reduced).into_iter().map(|(page, x, interactive)| {
                self.surface_menu_rows(page, x, interactive, cx)
            }));
        div().id("surface-menu-page").absolute().left(px(g.gutter)).top(px(g.gutter))
            .size(px(200.)).rounded(px(20.)).overflow_hidden()
            .opacity(self.surface_menu.content_alpha(now, self.model.reduced))
            // The whole page consumes background presses; only the header above starts dragging.
            .on_mouse_down(MouseButton::Left, cx.listener(|this, _, _, cx| {
                this.background_clicks.reset(); cx.stop_propagation();
            }))
            .on_mouse_down(MouseButton::Right, cx.listener(|_, _, _, cx| cx.stop_propagation()))
            .on_mouse_up(MouseButton::Left, cx.listener(|this, _, _, cx| {
                if this.drag.take().is_some() {
                    this.model.locks.drag = false; this.model.locks_changed(this.now()); cx.notify();
                }
            }))
            .child(header).child(list).into_any_element()
    }
    fn surface_menu_rows(&self, page: crate::context_menu::Page, x: f32, interactive: bool, cx: &mut Context<Self>) -> AnyElement {
        use crate::context_menu::{Menu, Page};
        let p = Palette::new(self.night);
        let now = self.now();
        let quality = self.downloads.as_ref().and_then(|ui| ui.settings()).map(|s| s.quality);
        let busy = self.downloads.as_ref().is_none_or(|ui| ui.settings_pending || ui.settings().is_none());
        let language = self.downloads.as_ref().map_or_else(Default::default, |ui| ui.language);
        let labels: &[(&str, &str, MenuIcon)] = if page == Page::Primary {
            &[(language.text("画质", "Quality"), "", MenuIcon::Quality), (language.text("隐藏到托盘", "Hide to tray"), "", MenuIcon::Hide), (language.text("设置", "Settings"), "", MenuIcon::Settings), (language.text("退出 Ameow", "Quit Ameow"), "", MenuIcon::Exit)]
        } else {
            &[("Highest", language.text("最高可得", "Best available"), MenuIcon::Empty), ("Balanced", "≤1080p", MenuIcon::Empty), ("Saver", "≤480p", MenuIcon::Empty)]
        };
        let (stride, height) = Menu::row_metrics(page);
        let mut rows = div().absolute().left(px(x)).top(px(0.)).w(px(176.)).h(px(152.));
        for (index, &(label, detail, icon)) in labels.iter().enumerate() {
            let marker = page == Page::Quality && quality == Some([Quality::Highest, Quality::Balanced, Quality::Saver][index]);
            let highlight = if interactive { self.surface_menu.highlight(index, now, self.model.reduced) } else { 0. };
            let disabled = page == Page::Quality && busy;
            let color = if page == Page::Primary && index == 3 { p.red } else { p.neutral };
            let row = div().id(SharedString::from(format!("surface-menu-{}-{index}", if page == Page::Primary { "primary" } else { "quality" })))
                .absolute().left(px(0.)).top(px(index as f32 * stride)).w(px(176.)).h(px(height))
                .px(px(8.)).flex().items_center().gap(px(10.)).rounded(px(6.))
                .bg(p.neutral.opacity(highlight * if p.night { 0.12 } else { 0.06 }))
                .text_color(color).opacity(if disabled { 0.5 } else { 1. })
                .when(!disabled, |row| row.cursor_pointer())
                .child(surface_menu_icon(if marker { MenuIcon::Check } else { icon }, if marker { p.blue } else { color }))
                .child(div().flex_1().min_w(px(0.)).flex().flex_col().justify_center()
                    .text_size(px(12.)).line_height(px(17.)).child(label)
                    .when(!detail.is_empty(), |s| s.child(div().text_size(px(10.)).line_height(px(13.)).opacity(0.75).child(detail))))
                .when(page == Page::Primary && index == 0, |s| s.child(surface_menu_icon(MenuIcon::Forward, p.neutral)))
                .when(interactive, |row| row
                    .on_mouse_down(MouseButton::Left, cx.listener(|this, _, _, cx| {
                        this.background_clicks.reset(); cx.stop_propagation();
                    }))
                    .on_hover(cx.listener(move |this, inside, _, cx| {
                        this.surface_menu.hover(index, *inside, this.now()); cx.notify();
                    }))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if this.surface_menu.page == Some(page) && !disabled
                            && let Some(action) = Menu::action(page, index) { this.surface_menu_action(action, cx); }
                    })));
            rows = rows.child(row);
        }
        if interactive && let Some(hint) = &self.surface_menu.hint {
            rows = rows.child(div().absolute().top(px(132.)).w(px(176.)).h(px(20.)).px(px(3.))
                .flex().items_center().text_size(px(10.)).text_color(p.neutral).truncate().child(local_text(language, hint)));
        }
        rows.into_any_element()
    }
    fn hide_downloads(&mut self,cx:&mut Context<Self>) {
        self.close_menu(cx);let now=self.now();
        if self.tray.is_none(){if let Some(ui)=&mut self.downloads{ui.feedback=Some(("托盘不可用，请保持窗口打开".into(),now));}}
        else if let Some(native)=&self.native {tray::Tray::hide(native.hwnd);if let Some(ui)=&mut self.downloads{ui.hidden=true;}}
    }
    pub(super) fn open_output_directory(&mut self,cx:&mut Context<Self>) {
        let Some(path)=self.downloads.as_ref().and_then(|ui|ui.settings()).map(|s|s.output_dir) else{return;};
        let task=cx.background_executor().spawn(async move {
            let explorer=std::env::var_os("WINDIR").map(PathBuf::from).unwrap_or_else(||PathBuf::from("C:/Windows")).join("explorer.exe");
            std::process::Command::new(explorer).arg(path).spawn().is_ok()
        });
        cx.spawn(async move |this,cx|{let success=task.await;let _=this.update(cx,|this,cx|{let now=this.now();if let Some(ui)=&mut this.downloads{ui.evidence(serde_json::json!({"type":"open-output-directory","launched":success}));if !success{ui.feedback=Some(("无法打开下载目录，请稍后重试".into(),now));}}cx.notify();});}).detach();
    }
    pub(super) fn drop_output_directory(&mut self,paths:&[PathBuf],cx:&mut Context<Self>) {
        let now=self.now();let Some(ui)=&mut self.downloads else{return;};
        if ui.settings_pending {ui.feedback=Some(("正在保存默认设置，请稍后再试".into(),now));return;}
        let Some(path)=crate::surface_actions::single_drop(paths) else{ui.feedback=Some(("请拖入一个可写文件夹".into(),now));return;};
        ui.request_output_directory(path,now);
        self.close_menu(cx);
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
    fn queue_icon(&self, id: u64, icon: QueueIcon, enabled: bool, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.night);
        let enabled = enabled && self.downloads.as_ref().is_some_and(|ui| ui.row_action_allowed(id, icon, self.now()));
        let focus = self.downloads.as_ref().and_then(|ui| ui.action_focus.iter()
            .find(|entry| entry.action.job == id && entry.action.icon == icon))
            .map(|entry| (entry.action.clone(), entry.handle.clone()));
        let color = if icon == QueueIcon::Clear { p.red.opacity(0.8) } else { p.neutral };
        div().id(SharedString::from(format!("{}-{id}", icon.name())))
            .size(px(QUEUE_ICON_SIZE)).flex_none().flex().items_center().justify_center()
            .rounded(px(4.)).border_1().border_color(transparent_black())
            .child(queue_icon_drawing(icon, color.opacity(if enabled { 1. } else { 0.35 })))
            .when(enabled, |button| button
                .focusable().tab_index(0).cursor_pointer()
                .when_some(focus, |button, (action, handle)| button
                    .track_focus(&handle)
                    .on_hover(cx.listener(move |this, hovered: &bool, _, cx| {
                        let now = this.now();
                        if let Some(ui) = &mut this.downloads { ui.hover_action(&action, *hovered, now); }
                        cx.notify();
                    })))
                .hover(move |s| s.bg(p.badge))
                .active(move |s| s.bg(p.border))
                .focus(move |s| s.border_color(p.blue))
                .on_mouse_down(MouseButton::Left, cx.listener(|_, _, _, cx| cx.stop_propagation()))
                // GPUI sends focused Enter/Space key-up through this same click handler.
                .on_click(cx.listener(move |this, _, _, cx| {
                    let now = this.now();
                    if let Some(ui) = &mut this.downloads { ui.activate_row_action(id, icon, now); }
                    cx.notify();
                })))
            .into_any_element()
    }
    fn queue_title(&self, id: u64, title: String, slot: f32, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        // Shape the same font/size inside the first line's actual remaining viewport.
        let title = title.replace(['\n', '\r', '\t'], " ");
        let width = queue_text_width(&title, 10., FontWeight::MEDIUM, window);
        let ui = self.downloads.as_ref().unwrap();
        let notice = ui.row_notice(id, self.now()).is_some();
        let browse = ui.title_browse.as_ref().filter(|b| !notice && b.job == id && b.title == title && b.slot == slot && !self.model.reduced);
        let offset = browse.map_or(0., |b| b.offset(self.now()));
        let moving = browse.is_some_and(|b| self.now() >= b.started + TITLE_WAIT_MS);
        div().id(SharedString::from(format!("title-{id}")))
            .relative().h(px(14.)).w(px(slot)).flex_none().overflow_hidden()
            .text_size(px(10.)).line_height(px(14.)).font_weight(FontWeight::MEDIUM)
            .child(if moving {
                div().absolute().left(px(-offset)).top_0().w(px(width.max(slot)))
                    .whitespace_nowrap().child(title.clone())
            } else {
                div().w_full().truncate().child(title.clone())
            })
            .on_hover(cx.listener(move |this, hovered: &bool, _, cx| {
                let now = this.now();
                let reduced = this.model.reduced;
                if let Some(ui) = &mut this.downloads {
                    if *hovered && !reduced && ui.row_notice(id, now).is_none() {
                        ui.title_browse = ui.snapshot.as_ref().and_then(|s| s.jobs.iter().find(|j| j.job_id == id))
                            .and_then(|job| TitleBrowse::new(job, title.clone(), width, slot, now, f32::from(ui.queue_scroll.offset().y)));
                    } else if ui.title_browse.as_ref().is_some_and(|b| b.job == id) { ui.title_browse = None; }
                }
                cx.notify();
            }))
            .into_any_element()
    }
    pub(super) fn queue_panel(&mut self, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.night);
        let g = self.model.geometry();
        let now = self.now();
        let transfer_now = ameow_next::download::progress::now_ms();
        if let Some(ui) = &mut self.downloads { ui.prepare_action_focus(now, cx); }
        let ui = self.downloads.as_ref().unwrap();
        let focused = ui.action_focus.iter().find(|entry| entry.handle.is_focused(window)).map(|entry| &entry.action);
        let snapshot = ui.snapshot.as_ref();
        let executing = snapshot.map_or(0, |s| {
            s.jobs
                .iter()
                .filter(|j| j.slot_owned && !j.phase.terminal())
                .count()
        });
        let waiting = snapshot.map_or(0, |s| s.unfinished.saturating_sub(executing));
        let preparation_held = snapshot.is_some_and(|s| s.preparation_held);
        let rows: Vec<_> = snapshot
            .into_iter()
            .flat_map(|s| &s.jobs)
            .filter(|job| ui.presentation.visible(job, now))
            .map(|job| {
                let id = job.job_id;
                let failure = job.phase == JobPhase::Failure;
                let success = job.phase == JobPhase::Success;
                let held = job.phase == JobPhase::Held && (job.slot_owned || preparation_held);
                let preparation_wait = snapshot.and_then(|s| preparation_wait_label(&job.phase, s));
                let fraction = if success {
                    Some(1.)
                } else if job.phase == JobPhase::Downloading {
                    presentation_fraction(job.transfer_progress.as_ref(), transfer_now)
                } else {
                    None
                };
                let color = if failure || preparation_wait.is_some() {
                    p.red
                } else if success {
                    p.green
                } else if !job.slot_owned || held {
                    p.neutral
                } else {
                    p.blue
                };
                let title = ui.row_title(job, now);
                // Hints replace only text in a fixed slot; the fill still uses current snapshot facts.
                // Actual command outcomes remain in the separate first-line title viewport.
                let row_status = local_text(ui.language, &ui.row_action_label(id, focused, now).map(str::to_owned)
                    .unwrap_or_else(|| queue_row_status(job, snapshot.unwrap(), fraction, transfer_now)));
                let icons = queue_row_icons(job, preparation_held);
                let title_width = queue_title_width(icons.len());
                let mut first_line = div().h(px(24.)).w_full().flex_none().flex().items_center().gap(px(QUEUE_LINE_GAP))
                    .child(self.queue_title(id, title, title_width, window, cx));
                if !icons.is_empty() {
                    let mut actions = div().w(px(queue_action_width(icons.len()))).flex_none().flex().items_center().gap(px(QUEUE_ICON_GAP));
                    for &icon in icons {
                        actions = actions.child(self.queue_icon(id, icon, true, cx));
                    }
                    first_line = first_line.child(actions);
                }
                div()
                    .id(SharedString::from(format!("job-{id}")))
                    .h(px(QUEUE_ROW_HEIGHT)).min_h(px(QUEUE_ROW_HEIGHT)).flex_shrink_0()
                    .w_full().flex().flex_col().justify_center().gap(px(QUEUE_LINE_GAP))
                    .border_b_1().border_color(p.border)
                    .hover(move |s| s.bg(p.badge.opacity(0.45)))
                    .child(first_line)
                    .child(div().h(px(14.)).w_full().flex_none().flex().items_center().gap(px(QUEUE_LINE_GAP))
                        .child(div().h(px(3.)).w(px(QUEUE_TRACK_WIDTH)).flex_none().rounded(px(2.)).bg(p.border.opacity(0.7))
                            .when_some(fraction, |track, f| track.child(div().h_full().w(relative(f)).rounded(px(2.)).bg(color))))
                        .child(div().h(px(14.)).w(px(QUEUE_STATUS_WIDTH)).flex_none().truncate()
                            .text_right()
                            .text_size(px(8.)).line_height(px(14.)).font_weight(FontWeight::NORMAL)
                            .text_color(color)
                            .child(row_status)))

            })
            .collect();
        let empty = rows.is_empty();
        div()
            .absolute()
            .left(px(g.gutter + 10.))
            .top(px(g.gutter + 10.))
            .w(px(QUEUE_CONTENT_WIDTH))
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
                    .text_size(px(10.))
                    .font_weight(FontWeight::MEDIUM)
                    .child(if ui.fixture { ui.language.text("队列 · Fixture", "Queue · Fixture") } else { ui.language.text("下载队列", "Downloads") })
                    .child(self.row_action(
                        "queue-back".into(),
                        ui.language.text("返回", "Back"),
                        false,
                        cx,
                        |this, cx| {
                            if let Some(ui) = &mut this.downloads {
                                ui.queue_open = false;
                    ui.title_browse = None;
                                ui.presentation.close_queue();
                            }
                            this.close_menu(cx);
                        },
                    )),
            )
            .child(
                div()
                    .h(px(16.))
                    .text_size(px(9.))
                    .child(format!("{} {executing} · {} {waiting}", ui.language.text("执行", "Active"), ui.language.text("等待", "Waiting"))),
            )
            .child(
                div()
                    .id("download-queue-scroll")
                    .h(px(140.))
                    .overflow_y_scroll()
                    .track_scroll(&ui.queue_scroll)
                    .on_scroll_wheel(cx.listener(|this, _, _, cx| {
                        if let Some(ui) = &mut this.downloads { ui.title_browse = None; }
                        cx.notify();
                    }))
                    .when(empty, |list| {
                        list.child(
                            div()
                                .pt(px(20.))
                                .text_size(px(10.))
                                .child(if ui.fixture { ui.language.text("Fixture · 0–9 切换预览", "Fixture · 0–9 preview") } else { ui.language.text("队列为空，Ctrl+V 粘贴视频链接", "Empty · Ctrl+V to paste a link") }),
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
        let language = self.downloads.as_ref().map_or_else(Default::default, |ui| ui.language);
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
                language.text("清理未确认", "Cleanup unconfirmed")
            } else if stopping {
                language.text("正在安全停止", "Stopping safely")
            } else {
                language.text("下载仍在进行", "Downloads in progress")
            })
            .child(div().text_size(px(10.)).child(local_text(language, exit_cleanup_message(
                unresolved,
                !targets.is_empty(),
                stopping,
            ))))
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .gap(px(5.))
                    .child(self.row_action(
                        "exit-continue".into(),
                        if stopping {
                            language.text("返回队列", "Queue")
                        } else {
                            language.text("继续运行", "Continue")
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
                            language.text("停止并退出", "Stop & quit"),
                            true,
                            cx,
                            |this, cx| this.stop_and_exit(cx),
                        ))
                    })
                    .when(!targets.is_empty(), |actions| {
                        actions.child(self.row_action(
                            "exit-retry-cleanup".into(),
                            language.text("重试清理", "Retry cleanup"),
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
        let can_retry = ui.preparation_retry_available();
        let component = preparation
            .failure
            .as_ref()
            .map(|failure| failure.component)
            .or(preparation.component)
            .map_or("下载组件", |component| component.label());
        let component = local_text(ui.language, component);
        let headline = if snapshot.preparation_owner_lost {
            "准备异常，清理未确认".into()
        } else if snapshot.preparation_held {
            "正在等待组件清理".into()
        } else if failed {
            format!("{component} {}", ui.language.text("准备失败", "setup failed"))
        } else if ready {
            "组件已就绪".into()
        } else {
            format!("{component} · {}", local_text(ui.language, preparation_stage(preparation.stage)))
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
                    .child(local_text(ui.language, &headline)),
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
                format!("{bytes} · {}", ui.language.text("总量未知", "total unknown"))
            });
        }
        if let Some(failure) = &preparation.failure {
            let (reason, suggestion) = preparation_failure_copy(failure.category);
            let reason = local_text(ui.language, reason);
            let suggestion = local_text(ui.language, suggestion);
            details = details
                .child(
                    div().child(format!(
                        "{} · {reason}{}",
                        local_text(ui.language, preparation_stage(failure.stage)),
                        failure
                            .http_status
                            .map_or(String::new(), |status| format!(" ({status})"))
                    )),
                )
                .child(div().child(suggestion));
        } else if snapshot.preparation_owner_lost {
            details = details.child(ui.language.text("准备线程异常结束，清理未确认，暂不能继续。", "Setup stopped unexpectedly; cleanup is unconfirmed."));
        } else if snapshot.preparation_held {
            details = details.child(ui.language.text("资源尚未收束，可从退出面板查看清理状态。", "Resources are still held. See the exit panel."));
        } else if !ready {
            details = details.child(ui.language.text("后台准备中，仍可粘贴视频链接", "Setup runs in the background. You can paste a link."));
        }
        if failed {
            let copied = ui
                .preparation_copied_at
                .is_some_and(|at| now.saturating_sub(at) < 2000);
            let mut actions = div().flex().gap(px(5.));
            if can_retry {
                actions = actions.child(self.row_action(
                    "preparation-retry".into(),
                    ui.language.text("重试", "Retry"),
                    false,
                    cx,
                    |this, cx| {
                        let now = this.now();
                        if let Some(ui) = &mut this.downloads {
                            ui.retry_preparation(now);
                        }
                        cx.notify();
                    },
                ));
            }
            details = details.child(actions.child(self.row_action(
                "preparation-copy".into(),
                if copied { ui.language.text("已复制", "Copied") } else { ui.language.text("复制诊断", "Copy diagnostic") },
                false,
                cx,
                |this, cx| {
                    let now = this.now();
                    if let Some(ui) = &mut this.downloads {
                        ui.copy_preparation_diagnostic(now);
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
    pub(super) fn download_feedback(&self, opacity: f32) -> Option<AnyElement> {
        let ui = self.downloads.as_ref()?;
        let message = local_text(ui.language, ui.feedback_message()?);
        let p = Palette::new(self.night);
        let g = self.model.geometry();
        Some(div()
            .id("download-feedback")
            .absolute()
            .left(px(g.gutter + if self.preparation_indicator_visible() { 42. } else { 10. }))
            .top(px(g.gutter + 162.))
            .w(px(if self.preparation_indicator_visible() { 148. } else { 180. }))
            .max_h(px(30.))
            .opacity(opacity)
            .overflow_y_scroll()
            .text_size(px(8.))
            .line_height(px(12.))
            .text_color(p.neutral)
            .child(message)
            .into_any_element())
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
    #[test]
    fn preferences_use_latest_ack_and_wait_for_save_reply() {
        use super::*;
        let (commands, receiver) = mpsc::sync_channel(2);
        let (evidence, _) = mpsc::sync_channel(1);
        let (_, replies) = mpsc::channel();
        let mut ui = DownloadUi::with_transport(commands, evidence, replies, Arc::new(Mutex::new(None)));
        let mut acknowledged = exit_snapshot().settings;
        acknowledged.quality = Quality::Saver;
        ui.acknowledged_settings = Some(acknowledged.clone());
        assert!(ui.request_preferences(ThemePreference::Dark, LanguagePreference::English, 1));
        assert!(!ui.request_preferences(ThemePreference::Light, LanguagePreference::Chinese, 2));
        let QueueCommand::SaveSettings(requested) = receiver.try_recv().unwrap() else { panic!("settings command") };
        assert_eq!(requested.quality, acknowledged.quality);
        assert_eq!(requested.output_dir, acknowledged.output_dir);
        assert_eq!(requested.theme, ThemePreference::Dark);
        assert_eq!(requested.language, LanguagePreference::English);
        assert_eq!(ui.settings(), Some(acknowledged));
        ui.complete_settings(CommandReply::SettingsSaved(requested.clone()), 3);
        assert_eq!(ui.settings(), Some(requested));
        assert!(!ui.settings_pending);
    }
    #[test]
    fn tray_icon_waits_for_ack_and_preserves_previous_value_on_failure() {
        use super::*;
        let (mut ui, receiver) = row_ui(JobPhase::Failure, false);
        let old = ui.settings().unwrap();
        assert!(ui.request_tray_icon(TrayIconPreference::AmeowBlue, 1));
        assert!(!ui.request_tray_icon(TrayIconPreference::Apricot, 2));
        let QueueCommand::SaveSettings(requested) = receiver.try_recv().unwrap() else { panic!("settings command") };
        assert_eq!(requested.tray_icon, TrayIconPreference::AmeowBlue);
        assert_eq!(ui.settings(), Some(old.clone()));
        ui.complete_settings(CommandReply::Error("E_SETTINGS_SAVE".into()), 3);
        assert_eq!(ui.settings(), Some(old));
        assert!(ui.request_tray_icon(TrayIconPreference::Apricot, 4));
        let QueueCommand::SaveSettings(requested) = receiver.try_recv().unwrap() else { panic!("settings command") };
        ui.complete_settings(CommandReply::SettingsSaved(requested.clone()), 5);
        assert_eq!(ui.settings(), Some(requested));
    }
    #[test]
    fn localized_queue_copy_keeps_unknown_text_and_formats_speed() {
        use super::local_text;
        use crate::ui_text::Language;
        assert_eq!(local_text(Language::English, "等待下载"), "Queued");
        assert_eq!(local_text(Language::English, "下载 1.2MB/s"), "Downloading 1.2MB/s");
        assert_eq!(local_text(Language::Chinese, "等待下载"), "等待下载");
    }
    #[test]
    fn directory_save_waits_for_ack_preserves_fresh_quality_and_recovers_after_rejection() {
        use super::*;
        let (mut ui, receiver) = row_ui(JobPhase::Failure, false);
        let old = ui.settings().unwrap();
        let fresh = Settings { quality: Quality::Saver, ..old.clone() };
        ui.complete_settings(CommandReply::SettingsSaved(fresh.clone()), 1);
        assert!(ui.request_output_directory(PathBuf::from("new-folder"), 2));
        assert_eq!(ui.settings_status, SettingsStatus::Saving);
        assert_eq!(ui.settings().unwrap(), fresh);
        assert!(!ui.request_quality(Quality::Highest, 3));
        assert!(!ui.request_output_directory(PathBuf::from("conflict"), 4));
        let QueueCommand::SaveSettings(requested) = receiver.try_recv().unwrap() else { panic!("settings command") };
        assert_eq!(requested.quality, Quality::Saver);
        ui.complete_settings(CommandReply::Error("E_SETTINGS_SAVE".into()), 5);
        assert_eq!(ui.settings().unwrap(), fresh);
        assert!(matches!(ui.settings_status, SettingsStatus::Failed(_)));
        assert!(!ui.settings_pending);
        assert!(ui.request_output_directory(PathBuf::from("retry-folder"), 6));
        let QueueCommand::SaveSettings(mut requested) = receiver.try_recv().unwrap() else { panic!("settings command") };
        requested.output_dir = PathBuf::from("canonical-ack");
        ui.complete_settings(CommandReply::SettingsSaved(requested.clone()), 7);
        assert_eq!(ui.settings().unwrap(), requested);
        assert_eq!(ui.settings_status, SettingsStatus::Saved);
        drop(receiver);
        assert!(!ui.request_output_directory(PathBuf::from("disconnected"), 8));
        assert!(!ui.settings_pending);
        assert_eq!(ui.settings().unwrap(), requested);
        assert!(matches!(ui.settings_status, SettingsStatus::Failed(_)));
    }
    #[test]
    fn main_menu_exit_enters_the_shared_idle_and_inflight_settlement_reducer() {
        use super::*;
        let (mut ui, _) = row_ui(JobPhase::Downloading, true);
        ui.request_menu_exit();
        assert_eq!(ui.exit_intent.resolve(ui.snapshot.as_deref(), false), Some(ExitAction::Confirm));
        // Continue consumes the intent without requesting a stop.
        assert_eq!(ui.exit_intent.resolve(ui.snapshot.as_deref(), false), None);
        let mut idle = crate::queue_fixture::snapshot(Vec::new());
        idle.preparing = false; idle.preparation_held = false; idle.preparation_owner_lost = false;
        ui.snapshot = Some(Arc::new(idle));
        ui.request_menu_exit();
        assert_eq!(ui.exit_intent.resolve(ui.snapshot.as_deref(), false), Some(ExitAction::Stop));
        assert_eq!(ui.exit_intent.resolve(ui.snapshot.as_deref(), false), None);
        let mut stopped = (**ui.snapshot.as_ref().unwrap()).clone(); stopped.stopped = true;
        ui.snapshot = Some(Arc::new(stopped)); ui.request_menu_exit();
        assert_eq!(ui.exit_intent.resolve(ui.snapshot.as_deref(), false), Some(ExitAction::Quit));
    }
    #[test]
    fn full_idle_has_no_feedback_but_real_loading_errors_stopping_and_receipts_remain() {
        use super::*;
        let (mut ui, _) = row_ui(JobPhase::Success, false);
        assert_eq!(ui.feedback_message(), None);
        ui.fixture = true;
        assert_eq!(ui.feedback_message(), None);
        ui.snapshot = None;
        assert_eq!(ui.feedback_message(), None);
        ui.fixture = false;
        assert_eq!(ui.feedback_message(), Some("正在读取下载设置…"));
        ui.startup_error = Some("E_STARTUP".into());
        assert_eq!(ui.feedback_message(), Some("E_STARTUP"));
        ui.feedback = Some(("目录设置未保存".into(), 100));
        assert_eq!(ui.feedback_message(), Some("目录设置未保存"));
        ui.feedback = Some((String::new(), 100));
        assert_eq!(ui.feedback_message(), Some("E_STARTUP"));
        ui.feedback = None;
        ui.startup_error = None;
        let mut snapshot = crate::queue_fixture::snapshot(Vec::new());
        snapshot.stopping = true;
        ui.snapshot = Some(Arc::new(snapshot));
        assert_eq!(ui.feedback_message(), Some("已关闭新任务受理，正在安全停止"));
        ui.feedback = Some(("默认设置已保存".into(), 200));
        assert_eq!(ui.feedback_message(), Some("默认设置已保存"));
        ui.feedback = None;
        ui.snapshot = Some(Arc::new(crate::queue_fixture::snapshot(Vec::new())));
        assert_eq!(ui.feedback_message(), None);
    }

    #[test]
    fn background_directory_open_waits_for_settings_ack_and_recovers_on_failure() {
        use super::*;
        let (mut ui, _) = row_ui(JobPhase::Failure, false);
        ui.queue_open = false;
        assert!(ui.background_actions_available());
        let old = ui.settings().unwrap();
        ui.settings_pending = true;
        assert!(!ui.background_actions_available());
        ui.complete_settings(CommandReply::Error("E_SETTINGS_SAVE".into()), 100);
        assert!(ui.background_actions_available());
        assert_eq!(ui.settings().unwrap(), old);
        ui.settings_pending = true;
        let newer = Settings { output_dir: PathBuf::from("acknowledged-folder"), ..old };
        ui.complete_settings(CommandReply::SettingsSaved(newer.clone()), 200);
        assert!(ui.background_actions_available());
        assert_eq!(ui.settings().unwrap(), newer);
        ui.exit_open = true;
        assert!(!ui.background_actions_available());
    }
    #[test]
    fn next_quality_save_keeps_acknowledged_folder_before_snapshot_catches_up() {
        use super::*;
        let (mut ui,receiver)=row_ui(JobPhase::Failure,false);
        let old=ui.snapshot.as_ref().unwrap().settings.clone();
        let newer=Settings{quality:Quality::Balanced,output_dir:PathBuf::from("new-acknowledged-folder"),theme:Default::default(),language:Default::default(), tray_icon:Default::default()};
        ui.settings_pending=true;ui.complete_settings(CommandReply::SettingsSaved(newer.clone()),100);
        assert_eq!(ui.snapshot.as_ref().unwrap().settings,old);
        ui.request_quality(Quality::Saver,101);
        let QueueCommand::SaveSettings(requested)=receiver.try_recv().unwrap() else{panic!("expected settings action")};
        assert_eq!(requested.output_dir,newer.output_dir);assert_eq!(requested.quality,Quality::Saver);
    }
    fn row_ui(phase: super::JobPhase, slot: bool) -> (super::DownloadUi, super::Receiver<super::QueueCommand>) {
        use super::*;
        let (commands, receiver) = mpsc::sync_channel(8);
        let (evidence, _) = mpsc::sync_channel(1);
        let (_, replies) = mpsc::channel();
        let mut ui = DownloadUi::with_transport(commands, evidence, replies, Arc::new(Mutex::new(None)));
        ui.queue_open = true;
        ui.snapshot = Some(Arc::new(crate::queue_fixture::snapshot(vec![crate::queue_fixture::job(5, phase, slot.then_some(5), None)])));
        (ui, receiver)
    }
    #[test]
    fn title_browse_is_overflow_only_delayed_slow_bounded_and_has_no_idle_loop() {
        use super::*;
        let job = crate::queue_fixture::job(5, JobPhase::Failure, Some(5), None);
        assert!(TitleBrowse::new(&job, "短标题".into(), 40., 100., 100, 0.).is_none());
        assert!(TitleBrowse::new(&job, "fits".into(), 100., 100., 100, 0.).is_none());
        let browse = TitleBrowse::new(&job, "long".into(), 128., 100., 100, 0.).unwrap();
        assert_eq!(browse.offset(799), 0.);
        assert_eq!(browse.delay(100), Some(700));
        assert_eq!(browse.delay(800), Some(16));
        assert!((browse.offset(1800) - 14.).abs() < 0.001);
        assert_eq!(browse.offset(2800), 28.);
        assert_eq!(browse.offset(99999), 28.);
        assert_eq!(browse.delay(2800), None);
    }
    #[test]
    fn title_browse_retires_on_motion_preference_scroll_close_removal_and_content_replacement() {
        use super::*;
        for reason in 0..5 {
            let (mut ui, _) = row_ui(JobPhase::Failure, false);
            let title = ui.snapshot.as_ref().unwrap().jobs[0].title.clone();
            ui.title_browse = TitleBrowse::new(&ui.snapshot.as_ref().unwrap().jobs[0], title, 200., 100., 0, 0.);
            match reason {
                0 => { ui.queue_animation_delay(800, true); }
                1 => { ui.queue_scroll.set_offset(point(px(0.), px(-1.))); ui.queue_animation_delay(800, false); }
                2 => { ui.queue_open = false; ui.queue_animation_delay(800, false); }
                3 => { ui.presentation.clear(5); ui.sync_queue_rows(800); }
                _ => { Arc::make_mut(ui.snapshot.as_mut().unwrap()).jobs[0].title = "changed".into(); ui.sync_queue_rows(800); }
            }
            assert!(ui.title_browse.is_none(), "stale title after lifecycle case {reason}");
            assert_eq!(ui.queue_animation_delay(900, false), None);
        }
    }
    #[test]
    fn first_line_gives_title_only_actual_action_space_and_second_line_keeps_a_track() {
        use super::*;
        for (phase, expected_icons, expected_title) in [
            (JobPhase::Success, 0, 180.), (JobPhase::Downloading, 1, 152.),
            (JobPhase::Held, 2, 126.), (JobPhase::Failure, 3, 100.),
        ] {
            let job = crate::queue_fixture::job(5, phase, Some(5), None);
            let count = queue_row_icons(&job, false).len();
            assert_eq!(count, expected_icons);
            assert_eq!(queue_title_width(count), expected_title);
            assert_eq!(queue_title_width(count) + queue_action_width(count)
                + if count > 0 { QUEUE_LINE_GAP } else { 0. }, 180.);
            // A 128px shaped title overflows a Failure, but fits Downloading and Success.
            let browse = TitleBrowse::new(&job, "same title".into(), 128., expected_title, 0, 0.);
            assert_eq!(browse.is_some(), expected_title < 128.);
        }
        assert_eq!(QUEUE_TRACK_WIDTH, 122.);
        assert_eq!(QUEUE_STATUS_WIDTH, 54.);
        assert_eq!(QUEUE_TRACK_WIDTH + QUEUE_LINE_GAP + QUEUE_STATUS_WIDTH, 180.);
    }
    #[test]
    fn enabled_action_labels_follow_hover_and_focus_without_sending_commands() {
        use super::*;
        for (phase, icons) in [(JobPhase::Failure, vec![QueueIcon::Retry, QueueIcon::Copy, QueueIcon::Clear]),
            (JobPhase::Downloading, vec![QueueIcon::Cancel]), (JobPhase::Held, vec![QueueIcon::Cancel, QueueIcon::Cleanup])] {
            let (mut ui, receiver) = row_ui(phase, true);
            for icon in icons {
                let action = QueueActionHint::new(&ui.snapshot.as_ref().unwrap().jobs[0], icon);
                ui.hover_action(&action, true, 100);
                assert_eq!(ui.row_action_label(5, None, 100), Some(icon.label()));
                ui.hover_action(&action, false, 101);
                assert_eq!(ui.row_action_label(5, None, 101), None);
                assert_eq!(ui.row_action_label(5, Some(&action), 101), Some(icon.label()));
                assert_eq!(ui.row_action_label(5, None, 102), None, "blur restores genuine state");
                assert_eq!(QUEUE_TRACK_WIDTH + QUEUE_LINE_GAP + QUEUE_STATUS_WIDTH, 180.);
            }
            assert!(receiver.try_recv().is_err());
        }
    }
    #[test]
    fn hover_takes_precedence_over_focus_and_leaving_restores_current_progress() {
        use super::*;
        let (mut ui, _) = row_ui(JobPhase::Failure, true);
        let job = &ui.snapshot.as_ref().unwrap().jobs[0];
        let retry = QueueActionHint::new(job, QueueIcon::Retry);
        let copy = QueueActionHint::new(job, QueueIcon::Copy);
        ui.hover_action(&copy, true, 100);
        assert_eq!(ui.row_action_label(5, Some(&retry), 100), Some("复制诊断"));
        ui.hover_action(&retry, false, 101);
        assert_eq!(ui.row_action_label(5, Some(&retry), 101), Some("复制诊断"));
        ui.hover_action(&copy, false, 102);
        assert_eq!(ui.row_action_label(5, Some(&retry), 102), Some("重试"));
        assert_eq!(ui.row_action_label(5, None, 103), None);
        let (mut ui, _) = row_ui(JobPhase::Downloading, true);
        Arc::make_mut(ui.snapshot.as_mut().unwrap()).jobs[0] = crate::queue_fixture::job(5, JobPhase::Downloading, Some(5), Some(0.34));
        let job = &ui.snapshot.as_ref().unwrap().jobs[0];
        let at = job.transfer_progress.as_ref().unwrap().observed_at_ms;
        let cancel = QueueActionHint::new(job, QueueIcon::Cancel);
        ui.hover_action(&cancel, true, 100);
        let sample = Arc::make_mut(ui.snapshot.as_mut().unwrap()).jobs[0].transfer_progress.as_mut().unwrap();
        sample.fraction = Some(0.61);
        sample.bytes_per_second = Some(2_500_000.);
        ui.sync_queue_rows(101);
        assert_eq!(ui.row_action_label(5, None, 101), Some("取消"));
        let s = ui.snapshot.as_ref().unwrap();
        let fraction = presentation_fraction(s.jobs[0].transfer_progress.as_ref(), at);
        assert_eq!(fraction, Some(0.61), "authoritative fill updates behind the hint");
        assert!(QUEUE_TRACK_WIDTH * fraction.unwrap() > QUEUE_TRACK_WIDTH * 0.34);
        ui.hover_action(&cancel, false, 102);
        assert_eq!(ui.row_action_label(5, None, 102), None);
        let s = ui.snapshot.as_ref().unwrap();
        assert_eq!(queue_row_status(&s.jobs[0], s, fraction, at), "61% 2.5MB/s");
    }
    #[test]
    fn stale_or_disabled_action_intents_never_leak_to_replaced_or_reopened_rows() {
        use super::*;
        for reason in 0..7 {
            let (mut ui, _) = row_ui(JobPhase::Failure, true);
            let action = QueueActionHint::new(&ui.snapshot.as_ref().unwrap().jobs[0], QueueIcon::Copy);
            ui.hover_action(&action, true, 100);
            match reason {
                0 => ui.queue_open = false,
                1 => Arc::make_mut(ui.snapshot.as_mut().unwrap()).jobs[0].phase = JobPhase::Downloading,
                2 => Arc::make_mut(ui.snapshot.as_mut().unwrap()).jobs[0].attempt += 1,
                3 => Arc::make_mut(ui.snapshot.as_mut().unwrap()).jobs[0].slot_owned = true,
                4 => { ui.retry_pending.insert(5); }
                5 => ui.presentation.clear(5),
                _ => Arc::make_mut(ui.snapshot.as_mut().unwrap()).jobs[0].job_id = 6,
            }
            ui.sync_queue_rows(101);
            assert!(ui.hovered_action.is_none(), "stale hover reason {reason}");
            assert_eq!(ui.row_action_label(5, Some(&action), 101), None);
            ui.hover_action(&action, true, 102);
            assert!(ui.hovered_action.is_none());
            if reason == 0 {
                ui.queue_open = true;
                assert_eq!(ui.row_action_label(5, None, 103), None);
            }
        }
        let (mut ui, _) = row_ui(JobPhase::Held, false);
        let action = QueueActionHint::new(&ui.snapshot.as_ref().unwrap().jobs[0], QueueIcon::Cleanup);
        ui.hover_action(&action, true, 100);
        assert_eq!(ui.row_action_label(5, Some(&action), 100), None);
    }
    #[test]
    fn title_browse_retires_when_action_width_phase_or_attempt_changes() {
        use super::*;
        for reason in 0..3 {
            let (mut ui, _) = row_ui(JobPhase::Held, true);
            let job = &ui.snapshot.as_ref().unwrap().jobs[0];
            ui.title_browse = TitleBrowse::new(job, job.title.clone(), 250., 126., 0, 0.);
            let job = &mut Arc::make_mut(ui.snapshot.as_mut().unwrap()).jobs[0];
            match reason {
                0 => job.slot_owned = false, // Two actions become one, without a phase change.
                1 => job.phase = JobPhase::Downloading,
                _ => job.attempt += 1,
            }
            ui.sync_queue_rows(800);
            assert!(ui.title_browse.is_none());
            assert_eq!(ui.queue_animation_delay(800, false), None);
        }
    }
    #[test]
    fn compact_progress_status_keeps_integer_percent_and_only_live_video_rate() {
        use super::*;
        use ameow_next::download::progress::TransferPhase;
        let mut job = crate::queue_fixture::job(1, JobPhase::Downloading, Some(1), Some(0.46));
        let now = job.transfer_progress.as_ref().unwrap().observed_at_ms;
        assert_eq!(queue_progress_label(&job, presentation_fraction(job.transfer_progress.as_ref(), now), now), "46% 1.2MB/s");
        job.transfer_progress.as_mut().unwrap().estimated_total_bytes = Some(100);
        assert_eq!(queue_progress_label(&job, presentation_fraction(job.transfer_progress.as_ref(), now), now), "≈46% 1.2MB/s");
        job.transfer_progress.as_mut().unwrap().bytes_per_second = None;
        assert_eq!(queue_progress_label(&job, presentation_fraction(job.transfer_progress.as_ref(), now), now), "≈46%");
        for (phase, label) in [(TransferPhase::Audio, "音频下载中"), (TransferPhase::Processing, "处理中")] {
            job.transfer_progress.as_mut().unwrap().phase = phase;
            assert_eq!(queue_progress_label(&job, presentation_fraction(job.transfer_progress.as_ref(), now), now), label);
        }
        job.transfer_progress.as_mut().unwrap().phase = TransferPhase::Primary;
        assert_eq!(queue_progress_label(&job, presentation_fraction(job.transfer_progress.as_ref(), now + 2000), now + 2000), "下载中");
        job.phase = JobPhase::Queued;
        assert_eq!(queue_progress_label(&job, None, now), "等待下载");
        job.phase = JobPhase::Success;
        assert_eq!(queue_progress_label(&job, Some(1.), now), "下载完成");
    }
    #[test]
    fn command_notice_preserves_live_second_line_and_restores_unbrowsed_title_at_deadline() {
        use super::*;
        let (mut ui, _) = row_ui(JobPhase::Downloading, true);
        let snapshot = Arc::make_mut(ui.snapshot.as_mut().unwrap());
        snapshot.jobs[0] = crate::queue_fixture::job(5, JobPhase::Downloading, Some(5), Some(0.34));
        let job = &snapshot.jobs[0];
        let transfer_now = job.transfer_progress.as_ref().unwrap().observed_at_ms;
        let title = job.title.clone();
        ui.title_browse = TitleBrowse::new(job, title.clone(), 250., 152., 0, 0.);
        let status = |ui: &DownloadUi, at| {
            let s = ui.snapshot.as_ref().unwrap();
            let j = &s.jobs[0];
            queue_row_status(j, s, presentation_fraction(j.transfer_progress.as_ref(), at), at)
        };
        assert_eq!(status(&ui, transfer_now), "34% 1.2MB/s");
        ui.complete_row_command(5, false, &CommandReply::Applied(false), 100);
        assert!(ui.title_browse.is_none());
        assert_eq!(ui.row_title(&ui.snapshot.as_ref().unwrap().jobs[0], 100), "取消未受理，请重试");
        assert_eq!(status(&ui, transfer_now), "34% 1.2MB/s");
        let sample = Arc::make_mut(ui.snapshot.as_mut().unwrap()).jobs[0].transfer_progress.as_mut().unwrap();
        sample.fraction = Some(0.61);
        sample.bytes_per_second = Some(2_500_000.);
        assert_eq!(status(&ui, transfer_now), "61% 2.5MB/s");
        assert_eq!(ui.row_title(&ui.snapshot.as_ref().unwrap().jobs[0], 5099), "取消未受理，请重试");
        assert_eq!(ui.row_title(&ui.snapshot.as_ref().unwrap().jobs[0], 5100), title);
        assert_eq!(ui.queue_animation_delay(5100, false), None);
        // Genuine freshness and phase changes remain visible during and after a notice.
        assert_eq!(status(&ui, transfer_now + 2000), "下载中");
        Arc::make_mut(ui.snapshot.as_mut().unwrap()).jobs[0].phase = JobPhase::Validating;
        assert_eq!(status(&ui, transfer_now), "校验媒体");
    }
    #[test]
    fn failure_status_is_friendly_and_notices_keep_diagnostic_authority() {
        use super::*;
        use ameow_next::download::diagnostics::{Failure, FailureCode};
        let (mut ui, _) = row_ui(JobPhase::Failure, false);
        for code in [FailureCode::Media, FailureCode::Runtime, FailureCode::Storage, FailureCode::Unknown] {
            let s = Arc::make_mut(ui.snapshot.as_mut().unwrap());
            s.jobs[0].failure = Some(Failure::new(code, "verify"));
            let failure = s.jobs[0].failure.clone();
            assert_eq!(queue_row_status(&s.jobs[0], s, None, 100), "下载失败");
            assert_eq!(queue_row_icons(&s.jobs[0], false), &[QueueIcon::Retry, QueueIcon::Copy, QueueIcon::Clear]);
            for result in [Err("OS clipboard busy".into()), Ok(())] {
                let success = result.is_ok();
                assert_eq!(ui.complete_diagnostic(5, result, 100), success);
                let s = ui.snapshot.as_ref().unwrap();
                assert_eq!(queue_row_status(&s.jobs[0], s, None, 100), "下载失败");
                assert_eq!(ui.row_title(&s.jobs[0], 100), if success { "诊断已复制" } else { "复制失败，请重试" });
                assert_eq!(s.jobs[0].failure, failure);
            }
        }
        Arc::make_mut(ui.snapshot.as_mut().unwrap()).jobs[0].failure = None;
        let s = ui.snapshot.as_ref().unwrap();
        assert_eq!(queue_row_status(&s.jobs[0], s, None, 100), "下载失败");
    }
    #[test]
    fn retry_results_and_shared_cleanup_refusal_are_visible_on_current_rows() {
        use super::*;
        let (mut ui, _) = row_ui(JobPhase::Failure, false);
        ui.complete_retry(5, &CommandReply::Error("E_RETRY".into()), 100);
        let old = &ui.snapshot.as_ref().unwrap().jobs[0];
        assert_eq!(ui.row_title(old, 100), "重试未受理");
        assert!(ui.presentation.visible(old, 100));
        let new = crate::queue_fixture::job(6, JobPhase::Queued, None, None);
        Arc::make_mut(ui.snapshot.as_mut().unwrap()).jobs.push(new.clone());
        ui.complete_retry(5, &CommandReply::Accepted(6), 101);
        assert!(!ui.presentation.visible(&ui.snapshot.as_ref().unwrap().jobs[0], 101));
        assert_eq!(ui.row_title(&new, 101), "已加入下载队列");
        assert_eq!(queue_row_status(&new, ui.snapshot.as_ref().unwrap(), None, 101), "等待下载");
        assert_eq!(ui.row_title(&new, 5101), new.title);
        let (mut ui, receiver) = row_ui(JobPhase::Held, false);
        Arc::make_mut(ui.snapshot.as_mut().unwrap()).preparation_held = true;
        ui.complete_row_command(0, true, &CommandReply::Applied(false), 100);
        assert_eq!(ui.row_title(&ui.snapshot.as_ref().unwrap().jobs[0], 100), "清理未受理，请重试");
        drop(receiver);
        assert!(!ui.send(QueueCommand::RetryCleanup(0), 200));
        assert_eq!(ui.row_notice(5, 200), Some("清理未受理，请重试"));
    }
    #[test]
    fn direct_retry_blocks_duplicates_and_retires_only_after_accept_even_when_queue_closed() {
        use super::*;
        let (mut ui, receiver) = row_ui(JobPhase::Failure, false);
        ui.activate_row_action(5, QueueIcon::Retry, 100);
        ui.activate_row_action(5, QueueIcon::Retry, 101);
        assert!(matches!(receiver.try_recv(), Ok(QueueCommand::Retry(5))));
        assert!(receiver.try_recv().is_err());
        assert_eq!(ui.badge(), Some((1, true, false)));
        ui.complete_retry(5, &CommandReply::Error("refused".into()), 102);
        assert!(ui.row_action_allowed(5, QueueIcon::Retry, 102));
        assert_eq!(ui.badge(), Some((1, true, false)));
        assert_eq!(ui.row_notice(5, 102), Some("重试未受理"));
        ui.activate_row_action(5, QueueIcon::Retry, 103);
        ui.queue_open = false;
        ui.complete_retry(5, &CommandReply::Accepted(6), 104);
        assert_eq!(ui.badge(), None);
        assert!(!ui.presentation.visible(&ui.snapshot.as_ref().unwrap().jobs[0], 104));
        assert_eq!(ui.snapshot.as_ref().unwrap().jobs[0].phase, JobPhase::Failure);
    }
    #[test]
    fn refused_command_transport_keeps_failure_visible_and_actions_retryable() {
        use super::*;
        let (mut ui, receiver) = row_ui(JobPhase::Failure, false);
        for _ in 0..8 { ui.commands.try_send(QueueCommand::Cancel(99)).unwrap(); }
        ui.activate_row_action(5, QueueIcon::Retry, 100);
        assert_eq!(ui.row_notice(5, 100), Some("操作未受理，请重试"));
        assert!(ui.row_action_allowed(5, QueueIcon::Retry, 100));
        assert_eq!(ui.badge(), Some((1, true, false)));
        while receiver.try_recv().is_ok() {}
        ui.activate_row_action(5, QueueIcon::Retry, 101);
        assert!(matches!(receiver.try_recv(), Ok(QueueCommand::Retry(5))));
        assert!(!ui.row_action_allowed(5, QueueIcon::Retry, 101));
        ui.complete_retry(5, &CommandReply::Error("refused".into()), 102);
        drop(receiver);
        ui.activate_row_action(5, QueueIcon::Retry, 103);
        assert_eq!(ui.row_notice(5, 103), Some("操作未受理，请重试"));
        assert!(ui.row_action_allowed(5, QueueIcon::Retry, 103));
        assert_eq!(ui.badge(), Some((1, true, false)));
        ui.activate_row_action(5, QueueIcon::Copy, 104);
        assert_ne!(ui.row_notice(5, 104), Some("诊断已复制"));
        ui.activate_row_action(5, QueueIcon::Clear, 105);
        assert_eq!(ui.badge(), None);
        assert!(ui.snapshot.as_ref().unwrap().jobs[0].failure.is_some());
    }
    #[test]
    fn shared_owner_loss_preserves_independent_live_attempt_cleanup() {
        use super::*;
        let (mut ui, receiver) = row_ui(JobPhase::Held, true);
        Arc::make_mut(ui.snapshot.as_mut().unwrap()).preparation_owner_lost = true;
        ui.activate_row_action(5, QueueIcon::Cleanup, 100);
        assert!(matches!(receiver.try_recv(), Ok(QueueCommand::RetryCleanup(5))));
        ui.activate_row_action(5, QueueIcon::Cancel, 101);
        assert!(matches!(receiver.try_recv(), Ok(QueueCommand::Cancel(5))));
    }
    #[test]
    fn copy_acknowledges_real_result_and_clear_only_changes_session_presentation() {
        use super::*;
        let (mut ui, receiver) = row_ui(JobPhase::Failure, false);
        ui.activate_row_action(5, QueueIcon::Copy, 100);
        assert!(matches!(receiver.try_recv(), Ok(QueueCommand::CopyDiagnostic(5))));
        assert_eq!(ui.row_notice(5, 100), None);
        assert!(!ui.complete_diagnostic(5, Err("OS clipboard busy".into()), 101));
        assert_eq!(ui.row_notice(5, 101), Some("复制失败，请重试"));
        assert!(ui.complete_diagnostic(5, Ok(()), 102));
        assert_eq!(ui.row_notice(5, 102), Some("诊断已复制"));
        ui.activate_row_action(5, QueueIcon::Clear, 103);
        assert_eq!(ui.badge(), None);
        assert!(ui.snapshot.as_ref().unwrap().jobs[0].failure.is_some());
        assert!(receiver.try_recv().is_err(), "Clear must never send a backend/file command");
        ui.activate_row_action(5, QueueIcon::Retry, 104);
        assert!(receiver.try_recv().is_err(), "stale removed-row events have no authority");
    }
    #[test]
    fn held_and_owner_lost_rows_keep_cleanup_and_cancel_permissions() {
        use super::*;
        let (mut ui, receiver) = row_ui(JobPhase::Held, true);
        for icon in [QueueIcon::Retry, QueueIcon::Copy, QueueIcon::Clear] {
            ui.activate_row_action(5, icon, 100);
        }
        assert!(receiver.try_recv().is_err());
        ui.activate_row_action(5, QueueIcon::Cleanup, 101);
        assert!(matches!(receiver.try_recv(), Ok(QueueCommand::RetryCleanup(5))));
        let s = Arc::make_mut(ui.snapshot.as_mut().unwrap());
        s.jobs[0].slot_owned = false;
        s.preparation_held = true;
        ui.activate_row_action(5, QueueIcon::Cleanup, 102);
        assert!(matches!(receiver.try_recv(), Ok(QueueCommand::RetryCleanup(0))));
        Arc::make_mut(ui.snapshot.as_mut().unwrap()).preparation_owner_lost = true;
        ui.activate_row_action(5, QueueIcon::Cleanup, 103);
        ui.activate_row_action(5, QueueIcon::Cancel, 103);
        assert!(receiver.try_recv().is_err());
        ui.queue_open = false;
        assert!(!ui.row_action_allowed(5, QueueIcon::Cleanup, 104));
    }
    #[test]
    fn fixture_refuses_real_submit_and_persistence_before_transport() {
        use super::*;
        let (commands, receiver) = mpsc::sync_channel(8);
        let (evidence, _) = mpsc::sync_channel(1);
        let (_, replies) = mpsc::channel();
        let mut ui = DownloadUi::with_transport(commands, evidence, replies, Arc::new(Mutex::new(None)));
        ui.fixture = true;
        for command in [QueueCommand::Submit { url: "https://youtu.be/jNQXAC9IVRw".into() },
            QueueCommand::SaveSettings(Settings { quality: Quality::Balanced, output_dir: PathBuf::new(), theme: Default::default(), language: Default::default(), tray_icon: Default::default() }),
            QueueCommand::RetryPreparation] {
            assert!(!ui.send(command, 100));
            assert!(receiver.try_recv().is_err());
        }
        assert!(ui.send(QueueCommand::Cancel(3), 100));
        assert!(matches!(receiver.try_recv(), Ok(QueueCommand::Cancel(3))));
        assert!(!ui.preview_key("8"), "ordinary production transport has no numeric scene keys");
    }
    #[test]
    fn primary_estimate_correction_tweens_to_new_fact_and_audio_hides_numeric_progress() {
        use super::*;
        use ameow_next::download::progress::TransferPhase;
        let (commands, _) = mpsc::sync_channel(1);
        let (evidence, _) = mpsc::sync_channel(1);
        let (_, replies) = mpsc::channel();
        let mut ui = DownloadUi::with_transport(commands, evidence, replies, Arc::new(Mutex::new(None)));
        let mut model = crate::model::Model::new(0, false);
        let mut indicator = indicator::Indicator::default();
        let mut s = crate::queue_fixture::snapshot(vec![crate::queue_fixture::job(3, JobPhase::Downloading, Some(3), Some(0.8))]);
        ui.snapshot = Some(Arc::new(s.clone()));
        ui.present(&mut model, &mut indicator, 0);
        assert_eq!(model.progress.sample(1000), 0.8);
        let sample = s.jobs[0].transfer_progress.as_mut().unwrap();
        sample.fraction = Some(0.4);
        sample.exact_total_bytes = None;
        sample.estimated_total_bytes = Some(200);
        ui.snapshot = Some(Arc::new(s.clone()));
        ui.present(&mut model, &mut indicator, 1000);
        assert_eq!(model.progress.sample(1000), 0.8);
        assert!(model.progress.sample(1110) < 0.8 && model.progress.sample(1110) > 0.4);
        assert_eq!(model.progress.sample(1220), 0.4);
        let sample = s.jobs[0].transfer_progress.as_mut().unwrap();
        assert!(transfer_label(Some(sample), sample.observed_at_ms).contains("估算"));
        sample.phase = TransferPhase::Audio;
        assert_eq!(presentation_fraction(Some(sample), sample.observed_at_ms), None);
        assert_eq!(transfer_label(Some(sample), sample.observed_at_ms), "音频下载中");
        sample.phase = TransferPhase::Processing;
        assert_eq!(presentation_fraction(Some(sample), sample.observed_at_ms), None);
        assert_eq!(transfer_label(Some(sample), sample.observed_at_ms), "处理中");
        ui.snapshot = Some(Arc::new(s));
        ui.present(&mut model, &mut indicator, 1300);
        assert_eq!(ui.selected_fraction, None);
        assert_eq!(model.stage, Stage::Downloading);
    }
    #[test]
    fn retiring_rows_preserves_visible_anchor_and_partial_row_offset() {
        use super::anchored_queue_offset;
        assert_eq!(anchored_queue_offset(&[1,2,3,4,5,6,7], &[2,3,4,5,6,7], -260.), -204.);
        assert_eq!(anchored_queue_offset(&[1,2,3,4], &[1,2,3], -70.), -70.);
        assert_eq!(anchored_queue_offset(&[1,2,3,4], &[1,3,4], -70.), -14.);
        assert_eq!(anchored_queue_offset(&[1,2,3], &[2,3], 0.), 0.);
    }
    #[test]
    fn rejected_row_commands_show_feedback_without_retiring_failure() {
        use super::*;
        for disconnected in [false, true] {
            for command in [QueueCommand::Retry(5), QueueCommand::CopyDiagnostic(5),
                QueueCommand::Cancel(5), QueueCommand::RetryCleanup(5)] {
                let (commands, receiver) = mpsc::sync_channel(1);
                commands.try_send(QueueCommand::Cancel(9)).unwrap();
                let receiver = if disconnected { None } else { Some(receiver) };
                let (evidence, _) = mpsc::sync_channel(1);
                let (_, replies) = mpsc::channel();
                let mut ui = DownloadUi::with_transport(commands, evidence, replies, Arc::new(Mutex::new(None)));
                ui.queue_open = true;
                let failed = crate::queue_fixture::job(5, JobPhase::Failure, Some(5), None);
                ui.snapshot = Some(Arc::new(crate::queue_fixture::snapshot(vec![failed.clone()])));
                let expected = match &command {
                    QueueCommand::Cancel(_) => "取消未受理，请重试",
                    QueueCommand::RetryCleanup(_) => "清理未受理，请重试",
                    _ => "操作未受理，请重试",
                };
                assert!(!ui.send(command, 100));
                assert_eq!(ui.row_notice(5, 100), Some(expected));
                assert_eq!(ui.row_notice(5, 5099), Some(expected));
                assert_eq!(ui.row_notice(5, 5100), None);
                assert!(ui.presentation.visible(&failed, 100));
                assert_eq!(ui.badge(), Some((1, true, false)));
                drop(receiver);
            }
        }
    }
    #[test]
    fn production_ring_projection_preserves_known_progress_across_unknown_and_processing() {
        use super::*;
        let (commands, _) = mpsc::sync_channel(1);
        let (evidence, _) = mpsc::sync_channel(1);
        let (_, replies) = mpsc::channel();
        let mut ui =
            DownloadUi::with_transport(commands, evidence, replies, Arc::new(Mutex::new(None)));
        let mut model = crate::model::Model::new(0, false);
        let mut indicator = indicator::Indicator::default();
        let mut s = crate::queue_fixture::snapshot(vec![crate::queue_fixture::job(
            3,
            JobPhase::Downloading,
            Some(3),
            Some(0.6),
        )]);
        ui.snapshot = Some(Arc::new(s.clone()));
        ui.present(&mut model, &mut indicator, 0);
        assert_eq!(ui.selected_fraction, Some(0.6));
        assert_eq!(model.progress.sample(1000), 0.6);
        s.jobs[0].transfer_progress = None;
        ui.snapshot = Some(Arc::new(s.clone()));
        ui.present(&mut model, &mut indicator, 1000);
        assert_eq!(ui.selected_fraction, None);
        assert_eq!(model.progress.sample(1000), 0.6);
        s.jobs[0] = crate::queue_fixture::job(3, JobPhase::Downloading, Some(3), Some(0.8));
        ui.snapshot = Some(Arc::new(s.clone()));
        ui.present(&mut model, &mut indicator, 1100);
        assert_eq!(ui.selected_fraction, Some(0.8));
        assert_eq!(model.progress.sample(1100), 0.6);
        assert!(model.progress.sample(1210) > 0.6);
        assert_eq!(model.progress.sample(1320), 0.8);
        for phase in [JobPhase::Validating, JobPhase::Publishing, JobPhase::Held] {
            s.jobs[0].phase = phase;
            ui.snapshot = Some(Arc::new(s.clone()));
            ui.present(&mut model, &mut indicator, 1400);
            assert_eq!(ui.selected_fraction, None);
            assert_eq!(model.stage, Stage::Downloading);
        }
        s.jobs[0] = crate::queue_fixture::job(3, JobPhase::Success, Some(3), None);
        ui.snapshot = Some(Arc::new(s));
        ui.present(&mut model, &mut indicator, 1500);
        assert_eq!(model.stage, Stage::Success);
        // Repeated production polls must not restart the terminal retention.
        ui.present(&mut model, &mut indicator, 2900);
        ui.present(&mut model, &mut indicator, 3000);
        assert_eq!(model.stage, Stage::Idle);
    }
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
                theme: Default::default(), language: Default::default(), tray_icon: Default::default(),
            },
            unfinished: 0,
            failures: 0,
            active_slots: 0,
            preparing: false,
            preparation_held: false,
            preparation_owner_lost: false,
            verified_runtime_versions: Vec::new(),
            runtime_update: Default::default(),
            preparation_retry_allowed: false,
            stopping: false,
            stopped: false,
            main_job: None,
            preparation: Default::default(),
        }
    }
    #[test]
    fn r7_component_actions_share_gating_and_wait_for_clipboard_completion() {
        use std::sync::{Arc, Mutex, mpsc};
        use ameow_next::download::queue::QueueCommand;
        let (commands, receive) = mpsc::sync_channel(8);
        let (evidence, _) = mpsc::sync_channel(8);
        let (_, replies) = mpsc::channel();
        let mut ui = super::DownloadUi::with_transport(commands, evidence, replies, Arc::new(Mutex::new(None)));
        let mut snapshot = exit_snapshot();
        ui.snapshot = Some(Arc::new(snapshot.clone()));
        ui.retry_preparation(1);
        assert!(receive.try_recv().is_err());
        snapshot.preparation_retry_allowed = true;
        ui.snapshot = Some(Arc::new(snapshot));
        ui.retry_preparation(2);
        assert!(matches!(receive.try_recv(), Ok(QueueCommand::RetryPreparation)));
        ui.retry_preparation(3);
        assert!(receive.try_recv().is_err());
        ui.copy_preparation_diagnostic(4);
        assert!(matches!(receive.try_recv(), Ok(QueueCommand::CopyPreparationDiagnostic)));
        ui.copy_preparation_diagnostic(5);
        assert!(receive.try_recv().is_err());
        assert!(ui.preparation_status.as_ref().unwrap().0.contains("正在复制"));
        assert!(!ui.complete_diagnostic(0, Err("clipboard failure".into()), 6));
        assert!(!ui.preparation_copy_pending);
        assert!(ui.preparation_status.as_ref().unwrap().1);
        ui.copy_preparation_diagnostic(7);
        assert!(matches!(receive.try_recv(), Ok(QueueCommand::CopyPreparationDiagnostic)));
        assert!(ui.complete_diagnostic(0, Ok(()), 8));
        assert!(!ui.preparation_status.as_ref().unwrap().1);
        assert!(ui.preparation_status_at(2007).is_some());
        assert!(ui.preparation_status_at(2008).is_none());
        ui.fixture = true;
        assert!(!ui.upstream_check_available());
        assert!(!ui.request_upstream_check());
        assert!(ui.upstream.snapshot().checked_at_ms.is_none());
        assert!(!ui.preparation_retry_available());
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
    fn concise_queue_safety_status_preserves_preparation_failure_and_uncertain_cleanup() {
        use super::*;
        let mut snapshot = exit_snapshot();
        let mut job = crate::queue_fixture::job(5, JobPhase::Preparing, None, None);
        snapshot.preparation.phase = PreparationPhase::Preparing;
        assert_eq!(queue_row_status(&job, &snapshot, None, 100), "准备下载组件");
        snapshot.preparation.phase = PreparationPhase::Failed;
        assert_eq!(queue_row_status(&job, &snapshot, None, 100), "组件准备失败");
        // Failure is shared preparation failure, not a media terminal or implicit retry grant.
        assert_eq!(job.phase, JobPhase::Preparing);
        assert!(!job.resources_released);
        assert_eq!(preparation_wait_label(&job.phase, &snapshot).as_deref(), Some("组件准备失败，等待重试"));
        snapshot.preparation_held = true;
        assert_eq!(queue_row_status(&job, &snapshot, None, 100), "等待组件清理");
        snapshot.preparation_owner_lost = true;
        assert_eq!(queue_row_status(&job, &snapshot, None, 100), "清理未确认");
        assert_eq!(preparation_wait_label(&job.phase, &snapshot).as_deref(), Some("准备异常，清理未确认"));
        job.phase = JobPhase::Held;
        assert_eq!(queue_row_status(&job, &snapshot, None, 100), "清理未确认");
        job.slot_owned = true;
        assert_eq!(queue_row_status(&job, &snapshot, None, 100), "清理待确认");
        // Unrelated preparation owner loss does not replace a final media failure or its details.
        let failed = crate::queue_fixture::job(6, JobPhase::Failure, Some(6), None);
        let failure = failed.failure.clone();
        assert_eq!(queue_row_status(&failed, &snapshot, None, 100), "下载失败");
        assert_eq!(failed.failure, failure);
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
            ..Default::default()
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
            theme: Default::default(), language: Default::default(), tray_icon: Default::default(),
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
            verified_runtime_versions: Vec::new(),
            runtime_update: Default::default(),
            preparation_retry_allowed: false,
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
