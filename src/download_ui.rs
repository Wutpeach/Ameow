//! Production GPUI command boundary. Initialization, persistence and polling stay off the UI.
use crate::ui_tooltip::TooltipExt as _;
#[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
#[path = "native_settings_transport.rs"]
mod native_settings_transport;
use ameow_next::download::{
    preparation::{ErrorCategory, PreparationPhase, PreparationSnapshot, PreparationStage},
    queue::{
        CancelOutcome, CancelReceipt, CommandReply, JobPhase, JobSnapshot, QueueCommand, QueueSnapshot,
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
    AppUpdate(ameow_next::app_update::service::Handle),
    ComponentOwners { upstream: ameow_next::download::upstream::UpstreamChecker, root: PathBuf, directory: Option<PathBuf> },
    Extension(ameow_next::browser_sessions::extension::Snapshot),
    Reply(CommandReply),
    Retry { source: u64, reply: CommandReply },
    RowCommand { job: u64, cleanup: bool, reply: CommandReply },
    Cancel { job: u64, receipt: CancelReceipt },
    PreparationRetry(CommandReply),
    RuntimeUpdate(CommandReply),
    BrowserBridge(Result<(), String>),
    Settings(CommandReply),
    Diagnostic { job: u64, text: String },
    StartupError(String),
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ExitAction {
    Quit,
    Stop,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum ExitIssue {
    Cleanup,
    OwnerLost,
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
            } else {
                ExitAction::Stop
            }
        };
        self.pending = false;
        Some(action)
    }
}
pub struct DownloadUi {
    #[cfg(all(feature="app-update-fixture",debug_assertions))]
    update_ui_step:Option<u64>,
    pub updates: ameow_next::app_update::service::Handle,
    pub app_update: Option<Arc<ameow_next::app_update::session::Session>>,
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
    settings_from_shortcut: bool,
    directory_drop_pending: bool,
    acknowledged_settings: Option<Settings>,
    pub queue_open: bool,
    pub exit_open: bool,
    pub exit_when_stopped: bool,
    exit_issue: Option<ExitIssue>,
    exit_intent: ExitIntent,
    pub hidden: bool,
    pub selected_job: Option<u64>,
    selected_presentation: Option<(u64, u32, JobPhase)>,
    pub selected_fraction: Option<f32>,
    presentation: crate::queue_presentation::Presentation,
    queue_scroll: gpui::ScrollHandle,
    fixture: bool,
    #[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
    isolated_settings_acceptance: bool,
    named_preview: Option<crate::preview::Scene>,
    preview_scenes: Option<SyncSender<&'static str>>,
    row_notices: std::collections::HashMap<u64, (&'static str, u64)>,
    queue_visible_ids: Vec<u64>,
    title_browse: Option<TitleBrowse>,
    hovered_action: Option<QueueActionHint>,
    action_focus: Vec<QueueActionFocus>,
    retry_pending: std::collections::HashSet<u64>,
    cancel_pending: std::collections::HashMap<u64, (u32, CancelFeedback)>,
    cancel_blocked: std::collections::HashMap<u64, u32>,
    pub preparation_hovered: bool,
    preparation_retry_pending: bool,
    preparation_copied_at: Option<u64>,
    pub preparation_copy_pending: bool,
    pub preparation_status: Option<(String, bool)>,
    pub upstream: ameow_next::download::upstream::UpstreamChecker,
    pub extension: ameow_next::browser_sessions::extension::Snapshot,
    component_root: Option<PathBuf>,
    extension_directory: Option<PathBuf>,
    checks_when_ready: bool,
    pub engine_command_pending: bool,
    pub engine_notice: Option<bool>,
    pub bridge_config_pending: bool,
    pub bridge_config_result: Option<Result<(), String>>,
}
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub enum SettingsStatus {
    #[default]
    Idle,
    Saving,
    Saved,
    Failed(String),
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CancelFeedback { Sending, Accepted }
impl DownloadUi {
    pub fn start() -> Self {
        let launch = ameow_next::control::launch_session(&std::env::args().collect::<Vec<_>>()).expect("validated launcher session").map(Arc::new);
        let worker_launch = launch.clone();
        let (commands, receiver) = mpsc::sync_channel(64);
        let (evidence, evidence_receiver) = mpsc::sync_channel(64);
        let (sender, replies) = mpsc::channel();
        let latest = Arc::new(Mutex::new(None));
        let projection = latest.clone();
        let error_sender = sender.clone();
        let result = std::thread::Builder::new().name("gpui-download-commands".into()).spawn(move || {
            let args: Vec<_> = std::env::args().collect();
            let value = |name: &str| args.iter().position(|arg| arg == name).and_then(|index| args.get(index + 1)).cloned();
            let mut component_root = None;
            let setup = (|| {
                let isolated = ameow_next::control::isolated_root(&args).map_err(|e|e.to_string())?;
                let root = match &isolated { Some(root) => root.join("runtime"), None => value("--runtime-root").map(PathBuf::from).map_or_else(RuntimeManager::default_root, Ok)? };
                component_root = Some(root.clone());
                use ameow_next::download::preparation::RuntimeRootSource;
                let root_source = if isolated.is_some() { RuntimeRootSource::IsolatedInstance }
                    else if value("--runtime-root").is_some() { RuntimeRootSource::ExplicitRuntimeRoot }
                    else if cfg!(windows) { RuntimeRootSource::DefaultLocalAppData }
                    else { RuntimeRootSource::DefaultApplicationSupport };
                let settings_path = match &isolated { Some(root) => root.join("settings.json"), None => value("--settings-path").map(PathBuf::from).unwrap_or_else(|| root.join("ui-settings.json")) };
                let output_dir = match &isolated { Some(root) => root.join("output"), None => value("--output").map(PathBuf::from).map_or_else(crate::tray::downloads_directory, Ok)? };
                let defaults = Settings { quality: Quality::Balanced, output_dir, theme: Default::default(), language: Default::default(), tray_icon: Default::default(), shortcut: Default::default() };
                #[cfg(all(windows, debug_assertions, feature = "cancel-fixture"))]
                if let Some(origin) = value("--cancel-fixture") {
                    if isolated.is_none() { return Err("Cancel fixture requires --instance-root".into()); }
                    let services = ameow_next::download::cancel_fixture::services(root, &origin, &value("--cancel-fixture-mode").unwrap_or_else(|| "native".into()))?;
                    return ameow_next::download::queue::DownloadCoordinator::new(services, settings_path, defaults);
                }
                let services = ameow_next::download::composition::services_with_root_source(root, root_source);
                ameow_next::download::queue::DownloadCoordinator::new(services, settings_path, defaults)
            })();
            let coordinator = match setup {
                Ok(coordinator) => coordinator,
                Err(error) => {
                    let _ = sender.send(UiReply::StartupError(error));
                    // Construction failed before any queue/native owner was started.
                    if let Some(session) = &worker_launch { session.quit.store(true, std::sync::atomic::Ordering::Release); }
                    return;
                }
            };
            let component_root = component_root.expect("runtime root resolved");
            let extension_directory = ameow_next::browser_sessions::native::extension_directory().ok();
            let _ = sender.send(UiReply::ComponentOwners { upstream: ameow_next::download::upstream::UpstreamChecker::with_root(component_root.clone()), root: component_root.clone(), directory: extension_directory.clone() });
            let mut extension_checked = Instant::now() - Duration::from_secs(2);
            let mut evidence = value("--queue-evidence").and_then(|path| {
                #[cfg(all(feature="app-update-fixture",debug_assertions))]
                if value("--app-update-fixture-dir").is_some(){return std::fs::OpenOptions::new().create(true).append(true).open(path).ok();}
                File::create(path).ok()
            });
            if let Some(file)=&mut evidence{let _=writeln!(file,"{}",serde_json::json!({"type":"application-start","pid":std::process::id(),"version":ameow_next::app_update::BUILD_VERSION}));}
            let settings_path=value("--instance-root").map(|root|PathBuf::from(root).join("settings.json")).or_else(||value("--settings-path").map(PathBuf::from)).unwrap_or_else(||RuntimeManager::default_root().unwrap().join("ui-settings.json"));
            #[cfg(all(feature="app-update-fixture",debug_assertions))]
            let update_fixture=value("--app-update-fixture-dir").map(PathBuf::from);
            #[cfg(not(all(feature="app-update-fixture",debug_assertions)))]
            let update_fixture=None;
            let updates=if value("--instance-root").is_some() && (update_fixture.is_none() || worker_launch.is_none()) { ameow_next::app_update::service::Handle::default() } else { ameow_next::app_update::service::Handle::start(settings_path,worker_launch.clone(),update_fixture) };
            let _=sender.send(UiReply::AppUpdate(updates.clone()));
            let started = Instant::now();
            let control_root = ameow_next::control::root(value("--instance-root").map(PathBuf::from));
            let mut control = match control_root.and_then(|root| ameow_next::control::Server::start(&root)) {
                Ok(server) => {
                    append_evidence(&mut evidence, &started, serde_json::json!({"type":"control-start","pid":std::process::id(),"instance_id":server.instance_id,"protocol_version":ameow_next::control::PROTOCOL_VERSION}));
                    Some(server)
                },
                Err(error) => {
                    append_evidence(&mut evidence, &started, serde_json::json!({"type":"control-error","code":error.code}));
                    None
                }
            };
            let mut last_revision = None;
            for pair in args.windows(2).filter(|pair| pair[0] == "--queue-submit") {
                if worker_launch.is_some() { continue; }
                let command = QueueCommand::Submit { url:pair[1].clone() };
                append_evidence(&mut evidence, &started, command_summary(&command));
                let reply = coordinator.apply(command);
                append_evidence(&mut evidence, &started, reply_summary(&reply));
                let _ = sender.send(UiReply::Reply(reply));
            }
            let mut disconnected = false;
            loop {
                if extension_checked.elapsed() >= Duration::from_secs(1) {
                    if let Some(directory) = &extension_directory
                        && let Ok(state) = ameow_next::browser_sessions::extension::snapshot(&component_root, directory) {
                        let _ = sender.send(UiReply::Extension(state));
                    }
                    extension_checked = Instant::now();
                }
                match receiver.recv_timeout(Duration::from_millis(80)) {
                    Ok(command) => {
                        if worker_launch.as_ref().is_some_and(|s| !s.commands_allowed())
                            && !matches!(&command, QueueCommand::Stop | QueueCommand::Cancel(_) | QueueCommand::RetryCleanup(_) | QueueCommand::CopyDiagnostic(_) | QueueCommand::CopyPreparationDiagnostic) {
                            let event = if matches!(&command, QueueCommand::InstallBrowserBridge) {
                                UiReply::BrowserBridge(Err("E_APP_UPDATE_STARTING_OR_DRAINING".into()))
                            } else { UiReply::Reply(CommandReply::Error("E_APP_UPDATE_STARTING_OR_DRAINING".into())) };
                            let _ = sender.send(event);
                            continue;
                        }
                        append_evidence(&mut evidence, &started, command_summary(&command));
                        let diagnostic_job = match &command { QueueCommand::CopyDiagnostic(job) => Some(*job), _ => None };
                        let saving = matches!(&command, QueueCommand::SaveSettings(_));
                        let retrying_preparation = matches!(&command, QueueCommand::RetryPreparation);
                        let updating_runtime = matches!(&command, QueueCommand::UpgradeEngine { .. } | QueueCommand::RestoreRecommended | QueueCommand::UpgradeDownloader { .. } | QueueCommand::RestoreRecommendedDownloader { .. });
                        let configuring_bridge = matches!(&command, QueueCommand::InstallBrowserBridge);
                        let retry_source = match &command { QueueCommand::Retry(id) => Some(*id), _ => None };
                        let row_command = match &command {
                            QueueCommand::Cancel(id) => Some((*id, false)),
                            QueueCommand::RetryCleanup(id) => Some((*id, true)),
                            _ => None,
                        };
                        let (reply, cancellation) = match command {
                            QueueCommand::Cancel(id) => {
                                let receipt = coordinator.cancel_receipt(id);
                                (CommandReply::Applied(receipt.outcome == CancelOutcome::Accepted), Some(receipt))
                            },
                            command => (coordinator.apply(command), None),
                        };
                        append_evidence(&mut evidence, &started, reply_summary(&reply));
                        let event = match reply {
                            CommandReply::Diagnostic(text) => UiReply::Diagnostic { job: diagnostic_job.unwrap_or(0), text },
                            reply if saving => UiReply::Settings(reply),
                            reply if retrying_preparation => UiReply::PreparationRetry(reply),
                            reply if updating_runtime => UiReply::RuntimeUpdate(reply),
                            reply if configuring_bridge => UiReply::BrowserBridge(
                                if matches!(reply, CommandReply::Applied(true)) { Ok(()) }
                                else { Err(coordinator.snapshot().browser_sessions.notice.unwrap_or_else(|| "E_SESSION_REGISTRATION".into())) }),
                            reply if retry_source.is_some() => UiReply::Retry { source: retry_source.unwrap(), reply },
                            reply if row_command.is_some() => {
                                let (job, cleanup) = row_command.unwrap();
                                if let Some(receipt) = cancellation { UiReply::Cancel { job, receipt } }
                                else { UiReply::RowCommand { job, cleanup, reply } }
                            }
                            reply => UiReply::Reply(reply),
                        };
                        let _ = sender.send(event);
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(mpsc::RecvTimeoutError::Disconnected) => { disconnected = true; coordinator.stop(); std::thread::sleep(Duration::from_millis(80)); }
                }
                for event in evidence_receiver.try_iter() { append_evidence(&mut evidence, &started, event); }
                if let Some(control) = &mut control {
                    let allowed = worker_launch.as_ref().is_none_or(|session| session.commands_allowed());
                    let startup_pending = worker_launch.as_ref().is_some_and(|session| !session.accepted.load(std::sync::atomic::Ordering::Acquire));
                    for (source, reply) in control.poll(&coordinator, allowed, startup_pending) {
                        append_evidence(&mut evidence, &started, reply_summary(&reply));
                        let event = match source { Some(source) => UiReply::Retry { source, reply }, None => UiReply::Reply(reply) };
                        let _ = sender.send(event);
                    }
                }
                #[cfg(target_os = "macos")]
                if let Some(session) = &worker_launch { session.attest_download_owner(!disconnected); }
                updates.poll(&coordinator,worker_launch.as_deref());
                if let Some(session) = &worker_launch && let Err(error) = session.poll(&coordinator) {
                    append_evidence(&mut evidence, &started, serde_json::json!({"type":"app-update-error","error":error}));
                    updates.restart_failed(&coordinator,session,error);
                }
                let snapshot = Arc::new(coordinator.snapshot());
                if last_revision != Some(snapshot.revision) {
                    if let Some(file) = &mut evidence {
                        // Local review evidence intentionally excludes media URLs and private directories.
                        let jobs: Vec<_> = snapshot.jobs.iter().map(|job| serde_json::json!({
                            "job":job.job_id, "revision":job.revision, "attempt":job.attempt, "phase":job.phase, "accepted_quality":job.accepted.intent.quality,
                            "preferred_engine":if matches!(&job.accepted.object, ameow_next::download::request::Object::Generic { .. }) { Some(job.accepted.preferred_engine) } else { None }, "engine":job.engine,
                            "slot_owned":job.slot_owned, "resources_released":job.resources_released,
                            "start_order":job.start_order, "terminal_count":job.terminal_count, "events":job.events,
                            "transfer_progress":job.transfer_progress,"gallery_progress":job.gallery_progress,
                            "saved_files":job.collection.as_ref().map(|c| c.files.len()),"total_files":job.collection.as_ref().and_then(|c| c.total)
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
            if let Some(session) = &launch { session.quit.store(true, std::sync::atomic::Ordering::Release); }
            let _ = error_sender.send(UiReply::StartupError(
                "无法启动下载命令处理，请重新打开 Ameow".into(),
            ));
        }
        let mut ui = Self::with_transport(commands, evidence, replies, latest);
        ui.app_update = launch;
        ui
    }
    pub fn fixture(path: PathBuf) -> Self {
        Self::fixture_transport(Some(path), false)
    }
    pub fn controlled_preview() -> Self {
        let (commands, _) = mpsc::sync_channel(1);
        let (evidence, _) = mpsc::sync_channel(1);
        let (_, replies) = mpsc::channel();
        let mut ui = Self::with_transport(commands, evidence, replies, Arc::new(Mutex::new(None)));
        ui.fixture = true;
        ui
    }
    pub fn set_preview_scene(&mut self, scene: &crate::preview::Scene) {
        self.updates = ameow_next::app_update::service::Handle::inert(
            crate::app_update_ui::preview_view(if scene.state == "extension-update" { "app-manual-quiet" } else { &scene.state }),
        );
        self.named_preview = Some(scene.clone());
        self.extension = if scene.state == "extension-update" { ameow_next::browser_sessions::extension::Snapshot { pending: true, unread: true, needs_reload: true, ..Default::default() } } else { Default::default() };
        self.preparation_hovered = scene.surface == "full" && scene.name.ends_with("-popover");
        self.snapshot = Some(Arc::new(crate::preview::snapshot(scene)));
        self.presentation = Default::default();
        self.selected_presentation = None;
        self.selected_job = None;
        self.queue_open = scene.surface == "queue";
        self.exit_open = false;
        self.exit_issue = None;
        self.exit_when_stopped = scene.surface == "overlay" && scene.state.starts_with("exit-");
        self.sync_exit_issue();
        self.startup_error = None;
        self.settings_status = SettingsStatus::Idle;
        self.settings_from_shortcut = false;
        self.settings_pending = scene.surface == "menu" && scene.state == "saving";
        self.directory_drop_pending = false;
        self.row_notices.clear();
        self.retry_pending.clear();
        self.cancel_pending.clear();
        self.cancel_blocked.clear();
        self.preparation_status = None;
        self.preparation_copy_pending = false;
        self.preparation_copied_at = None;
        self.engine_notice = None;
        self.engine_command_pending = false;
        self.queue_scroll.set_offset(point(px(0.), px(0.)));
        self.queue_visible_ids.clear();
        self.title_browse = None;
        self.action_focus.clear();
    }
    pub fn hold_preview_feedback(&mut self, scene: &crate::preview::Scene, now: u64) {
        if scene.state == "app-conflict-copied" {
            self.preparation_copied_at = Some(now);
        }
        if let Some(s) = &mut self.snapshot {
            for job in &mut Arc::make_mut(s).jobs {
                if let Some(p) = &mut job.transfer_progress { p.observed_at_ms = ameow_next::download::progress::now_ms(); }
            }
        }
        if scene.surface == "queue" {
            match scene.state.as_str() {
                "copied" => self.set_row_notice(5, "诊断已复制", now),
                "copy-failed" => self.set_row_notice(5, "复制失败，请重试", now),
                "retry-refused" => self.set_row_notice(5, "重试未受理", now),
                "retry-pending" | "partial-retry-pending" => { self.retry_pending.insert(5); }
                _ => {}
            }
        }
    }
    fn presentation_time(&self, now: u64) -> u64 { if self.named_preview.is_some() { 0 } else { now } }
    fn row_visible(&self, job: &JobSnapshot, now: u64) -> bool { self.presentation.visible(job, self.presentation_time(now)) }
    fn queue_available(&self, now: u64) -> bool {
        self.snapshot.as_ref().is_some_and(|s| s.jobs.iter().any(|job| self.row_visible(job, now)))
    }
    fn dismiss_empty_queue(&mut self, now: u64) -> bool {
        if !self.queue_open || self.queue_available(now) { return false; }
        self.queue_open = false;
        self.title_browse = None;
        self.presentation.close_queue();
        true
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
            settings_from_shortcut: false,
            directory_drop_pending: false,
            acknowledged_settings: None,
            queue_open: false,
            exit_open: false,
            exit_when_stopped: false,
            exit_issue: None,
            exit_intent: ExitIntent::default(),
            hidden: false,
            selected_job: None,
            selected_presentation: None,
            selected_fraction: None,
            presentation: Default::default(),
            queue_scroll: gpui::ScrollHandle::new(),
            fixture: false,
            #[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
            isolated_settings_acceptance: false,
            named_preview: None,
            preview_scenes: None,
            row_notices: Default::default(),
            queue_visible_ids: Vec::new(),
            title_browse: None,
            hovered_action: None,
            action_focus: Vec::new(),
            retry_pending: Default::default(),
            cancel_pending: Default::default(),
            cancel_blocked: Default::default(),
            preparation_hovered: false,
            preparation_retry_pending: false,
            preparation_copied_at: None,
            preparation_copy_pending: false,
            preparation_status: None,
            upstream: Default::default(),
            #[cfg(all(feature="app-update-fixture",debug_assertions))]
            update_ui_step:None,
            updates: Default::default(),
            app_update: None,
            extension: Default::default(),
            component_root: None, extension_directory: None, checks_when_ready: false,
            engine_command_pending: false,
            engine_notice: None,
            bridge_config_pending: false,
            bridge_config_result: None,
        }
    }
    pub(super) fn evidence(&self, value: serde_json::Value) {
        let _ = self.evidence.try_send(value);
    }
    pub fn send(&mut self, command: QueueCommand, now: u64) -> bool {
        if self.app_update.as_ref().is_some_and(|s| !s.commands_allowed())
            && !matches!(&command, QueueCommand::Stop | QueueCommand::Cancel(_) | QueueCommand::RetryCleanup(_) | QueueCommand::CopyDiagnostic(_) | QueueCommand::CopyPreparationDiagnostic) { return false; }
        if self.named_preview.is_some() { return false; }
        if self.fixture && matches!(command, QueueCommand::Submit { .. } | QueueCommand::SubmitWithOptions { .. } | QueueCommand::SaveSettings(_) | QueueCommand::RetryPreparation | QueueCommand::UpgradeEngine { .. } | QueueCommand::RestoreRecommended | QueueCommand::UpgradeDownloader { .. } | QueueCommand::RestoreRecommendedDownloader { .. } | QueueCommand::InstallBrowserBridge | QueueCommand::RemoveBrowserSession { .. }) {
            return false;
        }
        let cancel = match &command { QueueCommand::Cancel(job) => Some(*job), _ => None };
        let configuring_bridge = matches!(&command, QueueCommand::InstallBrowserBridge);
        if configuring_bridge && self.bridge_config_pending { return false; }
        match self.commands.try_send(command) {
            Ok(()) => {
                if configuring_bridge { self.bridge_config_pending = true; self.bridge_config_result = None; }
                if let Some(job) = cancel {
                    self.row_notices.remove(&job);
                    let attempt = self.snapshot.as_ref().and_then(|s| s.jobs.iter().find(|j| j.job_id == job)).map_or(0, |j| j.attempt);
                    self.cancel_pending.insert(job, (attempt, CancelFeedback::Sending));
                }
                true
            },
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
    fn fail_startup(&mut self, error: String) {
        if self.bridge_config_pending {
            self.bridge_config_pending = false;
            self.bridge_config_result = Some(Err(error.clone()));
        }
        self.startup_error = Some(error);
    }
    pub fn preparation_retry_available(&self) -> bool {
        !self.fixture && !self.preparation_retry_pending
            && self.snapshot.as_ref().is_some_and(|s| s.preparation_retry_allowed)
    }
    pub fn upstream_check_available(&self) -> bool {
        #[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
        if self.isolated_settings_acceptance { return false; }
        !self.fixture
    }
    pub fn preparation_status_at(&self, now: u64) -> Option<(String, bool)> {
        self.preparation_status.as_ref().filter(|(message, danger)| {
            *danger || message == "正在复制组件诊断" || message == "正在请求重新准备组件"
                || (message == "已复制组件诊断" && self.preparation_copied_at.is_some_and(|at| now.saturating_sub(at) < crate::ui_motion::COPY_FEEDBACK_MS))
        }).cloned()
    }
    pub fn request_downloader_check(&self, downloader: ameow_next::download::contract::Downloader, manual: bool) -> bool {
        self.upstream_check_available() && self.upstream.request_for(downloader, manual)
    }
    pub fn request_component_checks(&mut self) {
        self.checks_when_ready = true;
        if self.component_root.is_none() || !self.upstream_check_available() { return; }
        for downloader in [ameow_next::download::contract::Downloader::YtDlp, ameow_next::download::contract::Downloader::GalleryDl] {
            self.upstream.request_for(downloader, false);
        }
    }
    pub fn request_downloader_update(&mut self, downloader: ameow_next::download::contract::Downloader, version: Option<String>, now: u64) -> bool {
        use ameow_next::download::upstream::{Installability, compare_versions};
        if self.fixture || self.engine_command_pending { return false; }
        if let Some(version) = &version {
            let query = self.upstream.snapshot_for(downloader);
            let current = self.snapshot.as_ref().and_then(|s| s.verified_runtime_versions.iter().find(|(name, _)| name == downloader.label())).map(|(_, v)| v.as_str());
            if query.pending || query.worker_running || query.installability != Installability::Installable
                || query.checked_at_ms.is_none()
                || query.result.as_ref().and_then(|r| r.as_ref().ok()) != Some(version)
                || current.is_none_or(|current| compare_versions(downloader, version, current) != Some(std::cmp::Ordering::Greater)) {
                self.engine_notice = Some(false);
                return false;
            }
        }
        let command = version.map_or(QueueCommand::RestoreRecommendedDownloader { downloader }, |version| QueueCommand::UpgradeDownloader { downloader, version });
        self.engine_command_pending = self.send(command, now);
        self.engine_notice = if self.engine_command_pending { None } else { Some(false) };
        self.engine_command_pending
    }
    pub fn extension_pending(&self) -> bool { self.extension.pending }
    pub fn component_locations(&self) -> Option<(PathBuf, PathBuf)> { Some((self.component_root.clone()?, self.extension_directory.clone()?)) }
    pub fn retry_preparation(&mut self, now: u64) {
        if !self.preparation_retry_available() { return; }
        self.preparation_retry_pending = self.send(QueueCommand::RetryPreparation, now);
        self.preparation_status = Some((if self.preparation_retry_pending { "正在请求重新准备组件" } else { "操作未受理，请稍后重试" }.into(), !self.preparation_retry_pending));
    }
    pub fn copy_preparation_diagnostic(&mut self, now: u64) {
        if self.preparation_copy_pending || self.snapshot.is_none() { return; }
        self.preparation_copied_at = None;
        if self.named_preview.is_some() { self.complete_diagnostic(0, Ok(()), now); return; }
        self.preparation_copy_pending = self.send(QueueCommand::CopyPreparationDiagnostic, now);
        self.preparation_status = Some((if self.preparation_copy_pending { "正在复制组件诊断" } else { "操作未受理，请稍后重试" }.into(), !self.preparation_copy_pending));
    }
    pub fn background_actions_available(&self) -> bool {
        !self.queue_open && !self.exit_open && !self.settings_pending
    }
    fn complete_settings(&mut self,reply:CommandReply, _now:u64) -> bool {
        let directory_saved = self.directory_drop_pending && matches!(&reply, CommandReply::SettingsSaved(_));
        self.directory_drop_pending = false;
        if let CommandReply::SettingsSaved(settings)=&reply {self.acknowledged_settings=Some(settings.clone());}
        self.settings_pending=false;
        self.settings_status=match &reply {
            CommandReply::SettingsSaved(_) => SettingsStatus::Saved,
            CommandReply::Error(error) => SettingsStatus::Failed(format!("保存失败，默认设置未更改。{error}")),
            _ => SettingsStatus::Failed("设置未保存，请重试".into()),
        };
        directory_saved
    }
    fn request_quality(&mut self,quality:Quality,now:u64) -> bool {
        if self.settings_pending{return false;}
        let Some(mut settings)=self.settings() else{return false;};
        settings.quality=quality;self.request_settings(settings,now)
    }
    pub fn request_preferences(&mut self, theme: ThemePreference, language: LanguagePreference, now: u64) -> bool {
        if self.settings_pending { return false; }
        let Some(mut settings) = self.settings() else {
            self.settings_from_shortcut = false;
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
            self.settings_from_shortcut = false;
            self.settings_status = SettingsStatus::Failed("下载设置尚未就绪，请稍后重试".into());
            return false;
        };
        settings.tray_icon = tray_icon;
        self.request_settings(settings, now)
    }
    pub fn request_shortcut(&mut self, shortcut: ameow_next::shortcut::ShortcutPreference, now: u64) -> bool {
        if self.settings_pending { return false; }
        let Some(mut settings) = self.settings() else { return false; };
        settings.shortcut = shortcut;
        let admitted = self.request_settings(settings, now);
        self.settings_from_shortcut = true;
        admitted
    }
    pub fn shortcut_save_failed(&self) -> bool {
        self.settings_from_shortcut && matches!(self.settings_status, SettingsStatus::Failed(_))
    }
    fn request_settings(&mut self, settings:Settings, now:u64) -> bool {
        self.settings_from_shortcut = false;
        self.settings_pending=self.send(QueueCommand::SaveSettings(settings),now);
        self.settings_status=if self.settings_pending {SettingsStatus::Saving} else {SettingsStatus::Failed("保存未受理，请稍后重试".into())};
        self.settings_pending
    }
    pub fn request_output_directory(&mut self, path:PathBuf, now:u64) -> bool {
        if self.settings_pending {return false;}
        let Some(mut settings)=self.settings() else {
            self.settings_from_shortcut = false;
            self.settings_status=SettingsStatus::Failed("下载设置尚未就绪，请稍后重试".into());return false;
        };
        // Use the current ACK after a possibly long-lived native picker.
        settings.output_dir=path;self.request_settings(settings,now)
    }
    fn request_dropped_directory(&mut self, paths:&[PathBuf], now:u64) {
        if self.settings_pending { return; }
        if let Some(path) = crate::surface_actions::single_drop(paths) {
            self.directory_drop_pending = self.request_output_directory(path, now);
        }
    }
    fn request_menu_exit(&mut self) {
        self.evidence(serde_json::json!({"type":"exit-request","source":"main-menu"}));
        self.exit_intent.request();
    }
    fn request_exit_stop(&mut self, now: u64) -> bool {
        if self.exit_when_stopped { return true; }
        if !self.send(QueueCommand::Stop, now) {
            self.exit_intent.request();
            return false;
        }
        self.exit_when_stopped = true;
        self.exit_open = false;
        self.queue_open = false;
        self.title_browse = None;
        self.presentation.close_queue();
        self.sync_exit_issue();
        true
    }
    pub(super) fn exit_issue(&self) -> Option<ExitIssue> { self.exit_issue }
    fn sync_exit_issue(&mut self) {
        let issue = self.snapshot.as_deref()
            .filter(|_| self.exit_when_stopped).and_then(exit_issue);
        if issue.is_some() && issue != self.exit_issue {
            self.exit_open = true;
            self.queue_open = false;
            self.title_browse = None;
            self.presentation.close_queue();
        } else if issue.is_none() {
            self.exit_open = false;
        }
        self.exit_issue = issue;
    }
    fn dismiss_exit_issue(&mut self) { self.exit_open = false; }
    fn present(
        &mut self,
        model: &mut crate::model::Model,
        indicator: &mut indicator::Indicator,
        now: u64,
    ) {
        let Some(snapshot) = self.snapshot.clone() else {
            return;
        };
        self.cancel_pending.retain(|id, (attempt, feedback)| snapshot.jobs.iter().any(|job|
            job.job_id == *id && !job.phase.terminal() && !job.cancellation_requested
                && (*feedback == CancelFeedback::Sending || job.attempt <= *attempt)));
        self.cancel_blocked.retain(|id, attempt| snapshot.jobs.iter().any(|job|
            job.job_id == *id && job.attempt <= *attempt));
        let chosen = self
            .presentation
            .update(&snapshot, self.queue_open, if self.named_preview.is_some() { 0 } else { now })
            .and_then(|id| snapshot.jobs.iter().find(|job| job.job_id == id))
            .cloned()
            .or_else(|| (self.preview_scenes.is_some() || self.named_preview.is_some()).then_some(()).and_then(|_| {
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
                JobPhase::Partial => Stage::Partial,
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
            let fraction = if job.phase == JobPhase::Downloading && job.gallery_progress.is_none()
                && self.cancel_feedback(&job).is_none() {
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
        } else if self.selected_job.is_some() && !model.success_feedback_pending(now) {
            self.selected_job = None;
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
    pub fn badge(&self) -> Option<(usize, bool, bool)> {
        self.snapshot
            .as_ref()
            .and_then(|snapshot| badge_counts(snapshot.jobs.iter().filter(|job| !job.inspect_only && !job.phase.terminal()).count(), self.presentation.failures(snapshot)))
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
                } else {
                    self.set_row_notice(job, "诊断已复制", now);
                }
                true
            }
            Err(_) => {
                if job == 0 { self.preparation_copied_at = None; }
                if job != 0 { self.set_row_notice(job, "复制失败，请重试", now); }
                false
            }
        }
    }
    fn complete_retry(&mut self, source: u64, reply: &CommandReply, now: u64) {
        self.retry_pending.remove(&source);
        if matches!(reply, CommandReply::Accepted(_)) {
            self.cancel_pending.remove(&source);
            self.cancel_blocked.remove(&source);
            self.row_notices.remove(&source);
        }
        self.presentation.retry_reply(source, reply);
        if let CommandReply::Accepted(job) = reply {
            // The source Failure retires on acceptance; the new waiting row owns this notice.
            self.set_row_notice(*job, "已加入下载队列", now);
        } else {
            self.set_row_notice(source, "重试未受理", now);
        }
    }
    fn row_notice(&self, job: u64, now: u64) -> Option<&'static str> {
        self.row_notices.get(&job).filter(|(_, at)| now < at + 5000).map(|(text, _)| *text)
    }
    fn row_copied(&self, job: u64, now: u64) -> bool {
        self.row_notices.get(&job).is_some_and(|(text, at)|
            *text == "诊断已复制" && now.saturating_sub(*at) < crate::ui_motion::COPY_FEEDBACK_MS)
    }
    fn row_title(&self, job: &JobSnapshot, now: u64) -> String {
        self.row_notice(job.job_id, now).map(|text| local_text(self.language, text)).unwrap_or_else(||
            {
                let title = if job.title.is_empty() { format!("{} {}", self.language.text("任务", "Job"), job.job_id) } else { job.title.clone() };
                if job.phase == JobPhase::Partial { format!("{} · {title}", self.language.text("部分完成", "Partial")) } else { title }
            })
    }
    fn set_row_notice(&mut self, job: u64, text: &'static str, now: u64) {
        if self.title_browse.as_ref().is_some_and(|browse| browse.job == job) {
            self.title_browse = None;
        }
        self.row_notices.insert(job, (text, now));
    }
    fn complete_row_command(&mut self, job: u64, cleanup: bool, reply: &CommandReply, now: u64) {
        if !cleanup {
            self.cancel_pending.remove(&job);
            if matches!(reply, CommandReply::Applied(true)) {
                let attempt = self.snapshot.as_ref().and_then(|s| s.jobs.iter().find(|j| j.job_id == job)).map_or(0, |j| j.attempt);
                self.cancel_pending.insert(job, (attempt, CancelFeedback::Accepted));
                return;
            }
        } else if matches!(reply, CommandReply::Applied(true)) { return; }
        let text = if cleanup { "清理未受理，请重试" } else { "取消未受理，请重试" };
        if job == 0 {
            // Shared preparation cleanup addresses owner0; retain feedback on its visible Held rows.
            let rows: Vec<_> = self.snapshot.as_ref().into_iter().flat_map(|s| &s.jobs)
                .filter(|j| j.phase == JobPhase::Held && !j.slot_owned).map(|j| j.job_id).collect();
            for id in rows { self.set_row_notice(id, text, now); }
        } else {
            self.set_row_notice(job, text, now);
        }
    }
    fn cancel_feedback(&self, job: &JobSnapshot) -> Option<&'static str> {
        if job.phase.terminal() { return None; }
        if self.cancel_pending.get(&job.job_id).is_some_and(|(_, feedback)| *feedback == CancelFeedback::Sending) {
            return Some("正在发送取消…");
        }
        if job.phase == JobPhase::Held { return job.cancellation_requested.then_some("清理待确认"); }
        (job.cancellation_requested || self.cancel_pending.contains_key(&job.job_id)).then_some("正在取消…")
    }
    fn cancel_allowed(&self, id: u64) -> bool {
        self.snapshot.as_ref().is_some_and(|s| s.jobs.iter().any(|job| job.job_id == id
            && !job.phase.terminal() && !job.cancellation_requested && !self.cancel_pending.contains_key(&id)
            && self.cancel_blocked.get(&id).is_none_or(|attempt| *attempt < job.attempt)
            && (!s.preparation_owner_lost || job.slot_owned)))
    }
    fn complete_cancel(&mut self, id: u64, attempt: Option<u32>, outcome: CancelOutcome, now: u64) {
        if self.snapshot.as_ref().is_some_and(|s| s.jobs.iter().any(|job|
            job.job_id == id && attempt.is_some_and(|attempt| job.attempt > attempt))) {
            if self.cancel_pending.get(&id).is_some_and(|(pending, _)| attempt.is_some_and(|attempt| *pending <= attempt)) {
                self.cancel_pending.remove(&id);
            }
            return;
        }
        if outcome == CancelOutcome::Accepted {
            self.cancel_blocked.remove(&id);
            self.cancel_pending.insert(id, (attempt.unwrap_or(0), CancelFeedback::Accepted));
            return;
        }
        self.cancel_pending.remove(&id);
        if let Some(attempt) = attempt { self.cancel_blocked.insert(id, attempt); }
        let text = match outcome {
            CancelOutcome::AlreadyCommitted => "文件已保存，无法取消",
            CancelOutcome::Terminal => "任务已结束",
            CancelOutcome::OwnerUnavailable => "执行异常，清理未确认",
            CancelOutcome::UnknownJob => "任务不存在",
            CancelOutcome::Accepted => unreachable!(),
        };
        self.set_row_notice(id, text, now);
    }
    fn request_cancel(&mut self, id: u64, now: u64) {
        if self.cancel_allowed(id) { self.send(QueueCommand::Cancel(id), now); }
    }
    fn main_label(&self, job: &JobSnapshot, snapshot: &QueueSnapshot, now: u64) -> String {
        if let Some(feedback) = self.cancel_feedback(job) { return feedback.into(); }
        if let Some(notice) = self.row_notice(job.job_id, now).filter(|text| matches!(*text,
            "取消未受理，请重试" | "文件已保存，无法取消" | "任务已结束" | "执行异常，清理未确认" | "任务不存在")) {
            return notice.into();
        }
        if job.phase == JobPhase::Downloading {
            if let Some((count, total)) = job.gallery_progress { gallery_progress_label(count, total) }
            else { transfer_label(job.transfer_progress.as_ref(), ameow_next::download::progress::now_ms()) }
        } else { preparation_wait_label(&job.phase, snapshot).unwrap_or_else(|| phase_label(job)) }
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
        QueueCommand::Inspect { .. } => serde_json::json!({"type":"command","command":"inspect"}),
        QueueCommand::InstallBrowserBridge => serde_json::json!({"type":"command","command":"install-browser-bridge"}),
        QueueCommand::RemoveBrowserSession { .. } => serde_json::json!({"type":"command","command":"remove-browser-session"}),
        QueueCommand::Submit { .. } | QueueCommand::SubmitWithOptions { .. } => serde_json::json!({"type":"command","command":"submit"}),
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
        QueueCommand::UpgradeDownloader { downloader, version } => serde_json::json!({"type":"command","command":"upgrade-downloader","downloader":downloader,"version":version}),
        QueueCommand::RestoreRecommendedDownloader { downloader } => serde_json::json!({"type":"command","command":"restore-recommended-downloader","downloader":downloader}),
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
        "暂不支持" => "Unsupported",
        "链接不可用" => "Invalid link",
        "尝试备用组件" => "Trying alternate",
        "部分完成" => "Partial",
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
        "正在发送取消…" => "Sending cancel…",
        "正在取消…" => "Cancelling…",
        "切片中" => "Clipping",
        "文件已保存，无法取消" => "File saved; cannot cancel",
        "任务已结束" => "Job already ended",
        "任务不存在" => "Job not found",
        "执行异常，清理未确认" => "Execution lost; cleanup unconfirmed",
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
            if let Some(count) = text.strip_prefix("已保存 ") { return format!("Saved {count}"); }
            if let Some(count) = text.strip_prefix("已下载 ") { return format!("Downloaded {}", count.trim_end_matches('个')); }
            if let Some(rate) = text.strip_prefix("下载 ") { return format!("Downloading {rate}"); }
            if let Some(rate) = text.strip_prefix("处理速度 ") { return format!("Processing {rate}"); }
            if let Some(rate) = text.strip_prefix("估算 ") { return format!("Est. {rate}"); }
            if let Some(job) = text.strip_prefix("已复制任务 ").and_then(|s| s.strip_suffix(" 的诊断")) { return format!("Copied diagnostic for job {job}"); }
            return language.message(text);
        }
    };
    translated.to_owned()
}

pub fn phase_label(job: &JobSnapshot) -> String {
    if job.cancellation_requested && !job.phase.terminal() && job.phase != JobPhase::Held {
        return "正在取消…".into();
    }
    match job.phase {
        JobPhase::Queued => "等待下载".into(),
        JobPhase::Preparing => "准备下载组件".into(),
        JobPhase::Resolving => if job.message == "Trying alternate downloader" { "尝试备用组件" } else { "解析视频" }.into(),
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
        JobPhase::Inspected => "解析完成".into(),
        JobPhase::Success => "下载完成".into(),
        JobPhase::Failure => match job.failure.as_ref().map(|f| f.code.as_str()) {
            Some("E_OBJECT_UNSUPPORTED" | "E_UNSUPPORTED_URL") => "暂不支持".into(),
            Some("E_URL_UNSAFE") => "链接不可用".into(),
            _ => "下载失败".into(),
        },
        JobPhase::Partial => "部分完成".into(),
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
            ameow_next::download::progress::TransferPhase::Clip => return sample.media_speed_at(now)
                .filter(|speed| *speed < 1000.)
                .map_or_else(|| "切片中".into(), |speed| format!("处理速度 {speed:.1}×")),
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
    let preparation = &snapshot.preparation;
    // Optional replacement work stays in settings while the existing runtime remains usable.
    if !snapshot.verified_runtime_versions.is_empty() && !snapshot.preparation_held && !snapshot.preparation_owner_lost
        && preparation.phase != PreparationPhase::Failed
        && snapshot.runtime_update.phase != ameow_next::download::runtime_update::RuntimeUpdatePhase::Idle {
        return false;
    }
    // Local cache checks are quiet; only work from this attempt can earn a success hint.
    let setup = preparation.phase == PreparationPhase::Downloading
        || preparation.failure.is_some()
        || matches!(preparation.stage, PreparationStage::Acquire | PreparationStage::Verify | PreparationStage::Extract)
        || preparation.history.iter().any(|event| event.attempt == preparation.attempt
            && (event.category.is_some()
                || matches!(event.stage, PreparationStage::Acquire | PreparationStage::Verify | PreparationStage::Extract)));
    snapshot.preparation_held
        || snapshot.preparation_owner_lost
        || match preparation.phase {
            PreparationPhase::Idle => false,
            PreparationPhase::Failed => true,
            PreparationPhase::Ready => {
                setup && now.saturating_sub(preparation.updated_at_ms) < PREPARATION_SUCCESS_MS
            }
            _ => setup,
        }
}
fn preparation_popup_visible(snapshot: &QueueSnapshot, now: u64, update_attention: bool) -> bool {
    preparation_visible(snapshot, now)
        && (!update_attention || snapshot.preparation.phase != PreparationPhase::Ready
            || snapshot.preparation_held || snapshot.preparation_owner_lost)
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
impl DownloadUi {
    fn sync_queue_rows(&mut self, now: u64) {
        let next: Vec<_> = self.snapshot.as_ref().into_iter().flat_map(|s| &s.jobs)
            .filter(|job| self.row_visible(job, now)).map(|job| job.job_id).collect();
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
        JobPhase::Failure | JobPhase::Partial => &[QueueIcon::Retry, QueueIcon::Copy, QueueIcon::Clear],
        JobPhase::Success | JobPhase::Cancelled => &[],
        JobPhase::Held if job.slot_owned || preparation_held => &[QueueIcon::Cancel, QueueIcon::Cleanup],
        _ => &[QueueIcon::Cancel],
    }
}
fn queue_progress_label(job: &JobSnapshot, fraction: Option<f32>, now: u64) -> String {
    if job.phase != JobPhase::Downloading || job.cancellation_requested { return phase_label(job); }
    if let Some((count, total)) = job.gallery_progress { return gallery_progress_label(count, total); }
    let label = transfer_label(job.transfer_progress.as_ref(), now);
    let Some(fraction) = fraction else { return label; };
    let percent = format!("{}{}%",
        if job.transfer_progress.as_ref().is_some_and(|s| s.estimated_total_bytes.is_some()) { "≈" } else { "" },
        (fraction * 100.).floor() as u32);
    // The phase is already conveyed by the blue track; keep percent and measured rate legible.
    match label.split_once(' ') {
        Some(("下载" | "估算", rate)) if rate.ends_with("/s") => format!("{percent} {rate}"),
        Some(("处理速度", rate)) if rate.ends_with('×') => format!("{percent} {rate}"),
        _ => percent,
    }
}
fn gallery_progress_label(count: usize, total: Option<usize>) -> String {
    match total {
        Some(total) => format!("已下载 {count}/{total}"),
        None => format!("已下载 {count}个"),
    }
}
fn queue_row_status(job: &JobSnapshot, snapshot: &QueueSnapshot, fraction: Option<f32>, now: u64) -> String {
    if snapshot.preparation_owner_lost && !job.slot_owned && !job.phase.terminal() {
        "清理未确认".into()
    } else if job.cancellation_requested && !job.phase.terminal() {
        phase_label(job)
    } else if job.phase == JobPhase::Preparing {
        // Queue-only concise copy fits the fixed status slot. Other surfaces retain details.
        if snapshot.preparation_held {
            "等待组件清理".into()
        } else if snapshot.preparation.phase == PreparationPhase::Failed {
            "组件准备失败".into()
        } else {
            phase_label(job)
        }
    } else if job.phase == JobPhase::Partial {
        match &job.collection {
            Some(collection) => match collection.total {
                Some(total) => format!("已保存 {}/{total}", collection.files.len()),
                None => format!("已保存 {}", collection.files.len()),
            },
            None => "部分完成".into(),
        }
    } else if job.phase == JobPhase::Failure {
        phase_label(job)
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
        if !self.queue_open || !self.row_visible(job, now) { return false; }
        match icon {
            QueueIcon::Retry | QueueIcon::Copy | QueueIcon::Clear =>
                matches!(job.phase, JobPhase::Failure | JobPhase::Partial) && !self.retry_pending.contains(&id),
            QueueIcon::Cancel => self.cancel_allowed(id),
            QueueIcon::Cleanup => job.phase == JobPhase::Held
                && !self.cancel_pending.get(&id).is_some_and(|(_, feedback)| *feedback == CancelFeedback::Sending) &&
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
            QueueIcon::Copy => {
                self.row_notices.remove(&id);
                if self.named_preview.is_some() { self.complete_diagnostic(id, Ok(()), now); }
                else { self.send(QueueCommand::CopyDiagnostic(id), now); }
            }
            QueueIcon::Cancel => self.request_cancel(id, now),
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
fn preparation_failure_copy(category: ErrorCategory, http_status: Option<u16>, l: crate::ui_text::Language) -> &'static str {
    match category {
        ErrorCategory::Timeout => l.text("连接超时，请检查网络。", "The connection timed out. Check your network."),
        ErrorCategory::Connect => l.text("无法连接，请检查网络。", "Cannot connect. Check your network."),
        ErrorCategory::ProxyRouting => l.text("无法使用代理，请检查代理设置。", "Cannot use the proxy. Check your proxy settings."),
        ErrorCategory::Http => match http_status {
            Some(404) => l.text("未找到组件下载文件。", "The component download file was not found."),
            Some(403) => l.text("下载请求被拒绝。", "The download request was refused."),
            Some(429) => l.text("请求过于频繁，请稍后重试。", "Too many requests. Try again later."),
            _ => l.text("暂时无法获取组件。", "The component is temporarily unavailable."),
        },
        ErrorCategory::Size | ErrorCategory::Hash => l.text("下载的组件文件未通过验证。", "The downloaded component file could not be verified."),
        ErrorCategory::Extract => l.text("无法解压组件文件。", "The component file could not be extracted."),
        ErrorCategory::Permission => l.text("无法访问组件文件夹，请检查权限。", "Cannot access the component folder. Check its permissions."),
        ErrorCategory::Probe => l.text("组件暂时无法使用。", "The component cannot be used right now."),
        ErrorCategory::Storage => l.text("无法保存组件，请检查空间和权限。", "Cannot save the component. Check disk space and permissions."),
        ErrorCategory::Cancelled => l.text("需要时可重新准备。", "You can set it up again when needed."),
        ErrorCategory::Unknown => l.text("暂时无法确认失败原因。", "The cause could not be determined."),
    }
}

fn preparation_popup_copy(snapshot: &QueueSnapshot, l: crate::ui_text::Language) -> (String, Option<&'static str>) {
    if snapshot.preparation_owner_lost {
        return (l.text("组件暂时不可用", "Components unavailable").into(),
            Some(l.text("组件未能正常停止，暂时无法重试。", "The components did not stop correctly. Retry is unavailable.")));
    }
    if snapshot.preparation_held {
        return (l.text("正在清理组件", "Cleaning up components").into(),
            Some(l.text("清理完成前暂时无法重试。", "Wait for cleanup to finish before retrying.")));
    }
    let preparation = &snapshot.preparation;
    if preparation.phase == PreparationPhase::Ready {
        return (l.text("组件已就绪", "Components ready").into(), None);
    }
    let component = preparation.failure.as_ref().map(|f| f.component).or(preparation.component)
        .filter(|c| *c != ameow_next::download::preparation::RuntimeComponent::Runtime)
        .map_or(l.text("下载组件", "Download tools"), |c| c.label());
    if preparation.phase == PreparationPhase::Failed {
        let failure = preparation.failure.as_ref();
        let category = failure.map_or(ErrorCategory::Unknown, |f| f.category);
        let status = if category == ErrorCategory::Cancelled {
            l.text("准备已停止", "setup stopped")
        } else {
            l.text("准备失败", "setup failed")
        };
        return (format!("{component} {status}"), Some(preparation_failure_copy(
            category, failure.and_then(|f| f.http_status), l)));
    }
    let stage = match preparation.stage {
        PreparationStage::Cache => l.text("准备中…", "preparing…"),
        PreparationStage::Acquire => l.text("下载中…", "downloading…"),
        PreparationStage::Verify => l.text("验证中…", "verifying…"),
        PreparationStage::Extract => l.text("安装中…", "installing…"),
        PreparationStage::Probe => l.text("检查中…", "checking…"),
        PreparationStage::Publish => l.text("即将就绪…", "finishing setup…"),
    };
    (format!("{component} {stage}"), Some(l.text(
        "准备期间仍可粘贴视频链接。", "You can still paste video links during setup.")))
}
use crate::{
    Prototype, indicator,
    model::{Progress, Stage},
    tokens::Palette,
    tray::{self, TrayEvent},
};
use gpui::{prelude::*, *};

fn queue_activity_summary(executing: usize, waiting: usize, l: crate::ui_text::Language) -> String {
    match (executing, waiting) {
        (0, 0) => String::new(),
        (active, 0) => format!("{} {active}", l.text("进行中", "Active")),
        (0, queued) => format!("{} {queued}", l.text("等待", "Waiting")),
        (active, queued) => format!("{} {active} · {} {queued}", l.text("进行中", "Active"), l.text("等待", "Waiting")),
    }
}
const FULL_CLOSE_HIT_SIZE: f32 = 28.;
const FULL_CLOSE_TOP: f32 = 8.;
const FULL_CLOSE_SIDE: f32 = 12.;
#[derive(Clone, Copy)]
enum MenuIcon { Close, Hide, Settings, Exit }
fn surface_menu_icon(icon: MenuIcon, color: Hsla) -> AnyElement {
    let asset = match icon {
        MenuIcon::Close => Some("icons/x.svg"),
        MenuIcon::Hide => Some("icons/eye-off.svg"),
        MenuIcon::Settings => Some("icons/settings.svg"),
        MenuIcon::Exit => None,
    };
    if let Some(asset) = asset {
        return svg().path(asset).size(px(16.)).text_color(color).flex_none().into_any_element();
    }
    canvas(|_, _, _| (), move |bounds, _, window, _| {
        let paths: &[&[(f32, f32)]] = &[
            &[(6., 3.), (2.5, 3.), (2.5, 13.), (6., 13.)],
            &[(6., 8.), (13.5, 8.)], &[(10., 4.5), (13.5, 8.), (10., 11.5)],
        ];
        for points in paths {
            let mut path = PathBuilder::stroke(px(1.2));
            for (index, (x, y)) in points.iter().enumerate() {
                let position = bounds.origin + point(px(*x), px(*y));
                if index == 0 { path.move_to(position); } else { path.line_to(position); }
            }
            if let Ok(path) = path.build() { window.paint_path(path, color); }
        }
    }).size(px(16.)).flex_none().into_any_element()
}
impl Prototype {
    /// Debug fixture opens a real surface; all update actions still require native UI input.
    #[cfg(all(feature="app-update-fixture",debug_assertions))]
    fn poll_update_ui_fixture(&mut self,cx:&mut Context<Self>){
        let Some(ui)=self.downloads.as_mut()else{return;};
        if !ui.app_update.as_ref().is_some_and(|s|s.accepted.load(std::sync::atomic::Ordering::Acquire)){return;}
        let args:Vec<_>=std::env::args().collect();
        let Some(path)=args.windows(2).find(|p|p[0]=="--app-update-ui-control").map(|p|PathBuf::from(&p[1]))else{return;};
        #[derive(serde::Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Open{step:u64,surface:String,#[serde(default)]url:Option<String>,#[serde(default)]version:Option<String>}
        use std::io::Read;
        let Ok(file)=File::open(&path)else{return;};
        let mut bytes=Vec::new();if file.take(4097).read_to_end(&mut bytes).is_err()||bytes.len()>4096{return;}
        let Ok(request)=serde_json::from_slice::<Open>(&bytes)else{return;};
        if ui.update_ui_step.is_some_and(|s|s>=request.step){return;}
        ui.update_ui_step=Some(request.step);
        match request.surface.as_str(){
            "submit" => {
                if request.version.as_deref() != Some(ameow_next::app_update::BUILD_VERSION) { return; }
                if let Some(url) = request.url {
                    let now = self.now();
                    if let Some(ui) = &mut self.downloads { ui.send(QueueCommand::Submit { url }, now); }
                }
            },
            "about"=>self.open_update_settings(cx),
            "tray"=>self.toggle_tray_popup(cx),
            _=>return,
        }
        if let Some(ui)=&self.downloads{ui.evidence(serde_json::json!({"type":"fixture-open-surface","surface":request.surface,"step":request.step}));}
    }
    pub(super) fn poll_downloads(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        #[cfg(all(feature="app-update-fixture",debug_assertions))]
        self.poll_update_ui_fixture(cx);
        if let Some(session) = self.downloads.as_ref().and_then(|ui| ui.app_update.as_ref()) {
            #[cfg(target_os = "macos")]
            session.attest_native_window(
                self.native.as_ref().is_some_and(|native| native.ready_for_update())
                    && self.downloads.as_ref().is_some_and(|ui| ui.snapshot.is_some()),
            );
            #[cfg(not(target_os = "macos"))]
            if self.native.is_some() && self.downloads.as_ref().is_some_and(|ui| ui.snapshot.is_some()) {
                session.native_ready.store(true, std::sync::atomic::Ordering::Release);
            }
            if session.quit.load(std::sync::atomic::Ordering::Acquire) { cx.quit(); return; }
        }
        self.poll_preview(cx);
        let now = self.now();
        // A removed/disabled action can release the last focused handle. Restore the existing
        // root only in that case, so queue return and scene changes keep keyboard navigation live.
        if window.focused(cx).is_none() { window.focus(&self.focus, cx); }
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
                #[cfg(target_os = "windows")]
                TrayEvent::Restore => { self.close_tray_popup(cx); self.restore_downloads(window, cx); }
                #[cfg(target_os = "windows")]
                TrayEvent::TogglePopup => self.toggle_tray_popup(cx),
                #[cfg(target_os = "macos")]
                TrayEvent::Menu(action) => self.tray_actions.borrow_mut().push(action),
            }
        }
        let actions = std::mem::take(&mut *self.tray_actions.borrow_mut());
        for action in actions {
            if let Some(ui) = &self.downloads { ui.evidence(serde_json::json!({"type":"tray-popup-action","action":format!("{action:?}")})); }
            match action {
                crate::tray_popup::Action::Status => {
                    self.restore_downloads(window, cx);
                    if !self.show_exit_issue(cx) { self.open_queue(cx); }
                }
                crate::tray_popup::Action::Update => {
                    if self.downloads.as_ref().is_some_and(|u| {
                        crate::app_update_ui::popup_restart_available(&u.updates.snapshot())
                    }) {
                        self.app_update_action(
                            ameow_next::app_update::service::Action::Restart,
                            cx,
                        );
                    }
                    self.open_update_settings(cx); }
                crate::tray_popup::Action::Open => self.restore_downloads(window, cx),
                crate::tray_popup::Action::Settings => self.open_or_focus_settings(cx),
                crate::tray_popup::Action::Exit => { if let Some(ui) = &mut self.downloads { ui.request_menu_exit(); } }
                crate::tray_popup::Action::Closed => {}
            }
        }
        let Some(ui) = &mut self.downloads else {
            return;
        };
        for reply in ui.poll() {
            match reply {
                UiReply::AppUpdate(handle) => ui.updates = handle,
                UiReply::ComponentOwners { upstream, root, directory } => {
                    ui.upstream = upstream; ui.component_root = Some(root); ui.extension_directory = directory;
                    if ui.checks_when_ready { ui.request_component_checks(); }
                }
                UiReply::Extension(state) => ui.extension = state,
                UiReply::RuntimeUpdate(reply) => {
                    ui.engine_command_pending = false;
                    ui.engine_notice = Some(matches!(reply, CommandReply::Applied(true)));
                }
                UiReply::BrowserBridge(result) => {
                    ui.bridge_config_pending = false;
                    ui.bridge_config_result = Some(result);
                }
                UiReply::Retry { source, reply } => {
                    ui.evidence(serde_json::json!({"type":"retry-reply","source":source,"accepted":matches!(reply, CommandReply::Accepted(_))}));
                    ui.complete_retry(source, &reply, now);
                }
                UiReply::RowCommand { job, cleanup, reply } => {
                    ui.complete_row_command(job, cleanup, &reply, now);
                }
                UiReply::Cancel { job, receipt } => {
                    ui.complete_cancel(job, receipt.attempt, receipt.outcome, now);
                }
                UiReply::PreparationRetry(reply) => {
                    ui.preparation_retry_pending = false;
                    ui.preparation_status = Some((match &reply {
                        CommandReply::Applied(true) => "已请求重新准备组件",
                        _ => "组件状态已变化，请重新查看",
                    }.into(), !matches!(&reply, CommandReply::Applied(true))));
                }
                UiReply::StartupError(error) => {
                    ui.fail_startup(error);
                }
                UiReply::Settings(reply) => {
                    self.shortcut.complete(matches!(&reply, CommandReply::SettingsSaved(_)));
                    if let Some(generation) = self.menu_save_generation.take() {
                        self.surface_menu.saved(generation, matches!(reply, CommandReply::SettingsSaved(_)));
                    }
                    if ui.complete_settings(reply, now) && !ui.hidden { self.model.directory_saved(now); }
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

                UiReply::Reply(_reply) => {},
            }
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
        let queue_closed = ui.dismiss_empty_queue(now);
        let was_exit_open = ui.exit_open;
        ui.sync_exit_issue();
        if queue_closed || ui.exit_open != was_exit_open {
            self.model.locks.menu = ui.exit_open || ui.queue_open || self.surface_menu.is_open();
            self.model.locks_changed(now);
        }
        if now >= ui.last_evidence_ms + if ui.fixture { 100 } else { 200 } {
            ui.last_evidence_ms = now;
            let upstream = ui.upstream.snapshot();
            ui.evidence(serde_json::json!({"type":"presentation","selected_job":ui.selected_job,"stage":format!("{:?}",self.model.stage),
                "upstream":{"pending":upstream.pending,"worker_running":upstream.worker_running,"checked_at_ms":upstream.checked_at_ms,
                    "result":upstream.result.as_ref().map(|result|match result {Ok(version)=>serde_json::json!({"stable_release":version}),Err(error)=>serde_json::json!({"error":format!("{error:?}")})})},
                "selected_attempt":ui.selected_presentation.as_ref().map(|(_, attempt, _)| *attempt),"primary_fraction":ui.selected_fraction,
                "selected_status":ui.snapshot.as_ref().and_then(|s| s.jobs.iter().find(|j| Some(j.job_id) == ui.selected_job).map(|j| ui.main_label(j, s, now))),
                "cancellation_rows":ui.snapshot.as_ref().map(|s| s.jobs.iter().filter(|j| ui.row_visible(j, now)).map(|j| serde_json::json!({"job":j.job_id,"cancellation_requested":j.cancellation_requested,"cancel_enabled":ui.cancel_allowed(j.job_id),"status":ui.cancel_feedback(j).map(str::to_owned).unwrap_or_else(||queue_row_status(j,s,None,now))})).collect::<Vec<_>>()),
                "tween_fraction":self.model.progress.sample(now),"displayed_percent":ui.selected_fraction.map(|_| ((if self.model.reduced { self.model.progress.target } else { self.model.progress.sample(now) }).min(0.99) * 100.).round() as u32),
                "observed_at_ms":ameow_next::download::progress::now_ms(),
                "fullness":self.model.fullness,"queue_open":ui.queue_open,"exit_open":ui.exit_open,"hidden":ui.hidden,"badge":ui.badge(),
                "menu_page":self.surface_menu.name(),"menu_selected":self.surface_menu.selected,
                "menu_pending":ui.settings_pending,"menu_hint":self.surface_menu.hint.is_some(),"visual_offset":self.visual_offset,
                "visible_rows":ui.snapshot.as_ref().map(|s| s.jobs.iter().filter(|j| ui.row_visible(j, now)).map(|j| j.job_id).collect::<Vec<_>>()),
                "queue_scroll":[f32::from(ui.queue_scroll.offset().x), f32::from(ui.queue_scroll.offset().y)],
                "preparation_visible":ui.snapshot.as_ref().is_some_and(|s| preparation_visible(s, ameow_next::download::progress::now_ms())),
                "preparation_hovered":ui.preparation_hovered}));
        }
        // Hidden main windows do not render, but settings and tray projections still observe us.
        self.refresh_preferences();
        self.process_exit_request(cx);
        self.model.tick(now);
        cx.notify();
    }
    pub(super) fn restore_downloads(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.focus_downloads(window, cx);
        self.model.pointer(true, self.now());
    }
    fn focus_downloads(&mut self, window: &mut Window, cx: &mut Context<Self>) {
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
        window.focus(&self.focus, cx);
        cx.notify();
    }
    pub(super) fn toggle_shortcut(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.native.is_none() || self.model.locks.drag || self.model.locks.drop
            || self.downloads.as_ref().is_none_or(|ui| ui.exit_intent.pending || ui.exit_when_stopped) { return; }
        if self.settings_window.is_some_and(|handle| handle.update(cx, |root, _, cx| {
            root.view().clone().downcast::<crate::settings_window::SettingsWindow>().ok()
                .is_some_and(|view| view.read(cx).shortcut_blocked())
        }).unwrap_or(false)) { return; }
        let hidden = self.downloads.as_ref().is_some_and(|ui| ui.hidden);
        let hide = !hidden && self.model.target_full && crate::global_shortcut::focused(self.native.as_ref().unwrap());
        if let Some(ui) = &self.downloads { ui.evidence(serde_json::json!({"type":"summon-shortcut","action":if hide {"hide"} else {"show"},"hidden_before":hidden})); }
        if hide {
            self.hide_downloads(cx);
        } else {
            let cursor = crate::native::Native::cursor();
            let native = self.native.as_ref().unwrap();
            let scale = native.scale_at(cursor);
            let work = native.work_area_at(cursor);
            self.hide_downloads(cx);
            self.anchor = crate::model::summon_anchor(cursor, scale, work);
            let geometry = crate::model::Geometry::at(if self.model.reduced { 1. } else { 0. });
            // Only native geometry waits here; download and settings arbitration continue.
            self.shortcut_positioning = true;
            let positioned = self.native.as_mut().unwrap().prepare_summon(self.anchor, scale, geometry, cx);
            self.shortcut_reveal = cx.spawn_in(window, async move |this, cx| {
                let positioned = positioned.await;
                let _ = this.update_in(cx, |this, window, cx| {
                    this.shortcut_positioning = false;
                    if let Err(error) = positioned {
                        if let Some(ui) = &this.downloads { ui.evidence(serde_json::json!({"type":"summon-position-failed","error":error})); }
                        cx.notify();
                        return; // A later shortcut retries placement; do not present old coordinates as success.
                    }
                    if this.downloads.as_ref().is_none_or(|ui| ui.exit_intent.pending || ui.exit_when_stopped) { return; }
                    let now = this.now();
                    this.model.summon(now);
                    this.clamped_target = true;
                    this.spring_hover = Default::default();
                    this.visual_offset = [0., 0.];
                    this.focus_downloads(window, cx);
                    this.model.pointer(this.native.as_ref().is_some_and(crate::native::Native::inside), now);
                    if let Some(ui) = &this.downloads { ui.evidence(serde_json::json!({"type":"summon-positioned", "cursor":cursor,
                        "anchor":this.anchor,"work":work,"scale":scale,"fullness":this.model.fullness,"reduced":this.model.reduced,
                        "native_bounds":this.native.as_ref().map(crate::native::Native::bounds)})); }
                    cx.notify();
                });
            });
        }
        cx.notify();
    }
    fn process_exit_request(&mut self, cx: &mut Context<Self>) {
        let action = self.downloads.as_mut().and_then(|ui| {
            ui.exit_intent.resolve(ui.snapshot.as_deref(), ui.startup_error.is_some())
        });
        match action {
            Some(ExitAction::Quit) => {
                cx.quit();
            }
            Some(ExitAction::Stop) => {
                self.stop_and_exit(cx);
            }
            None => return,
        }
        cx.notify();
    }
    pub(super) fn stop_and_exit(&mut self, cx: &mut Context<Self>) {
        self.shortcut.stop();
        if self.preview.is_some() { cx.quit(); return; }
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
            if !ui.request_exit_stop(now) {
                return;
            }
        }
        self.hide_downloads(cx);
    }
    fn dismiss_exit_issue(&mut self, cx: &mut Context<Self>) {
        if let Some(ui) = &mut self.downloads {
            ui.dismiss_exit_issue();
        }
        self.close_menu(cx);
    }
    fn show_exit_issue(&mut self, cx: &mut Context<Self>) -> bool {
        let Some(ui) = &mut self.downloads else { return false; };
        if ui.exit_issue().is_none() { return false; }
        ui.exit_open = true;
        ui.queue_open = false;
        ui.title_browse = None;
        ui.presentation.close_queue();
        self.surface_menu.close(self.now());
        self.model.locks.menu = true;
        self.model.locks_changed(self.now());
        cx.notify();
        true
    }
    pub(super) fn production_key(&mut self, key: &str, cx: &mut Context<Self>) {
        match key {
            "escape" => {
                let overlay = self.downloads.as_ref().is_some_and(|ui| ui.queue_open || ui.exit_open);
                if let Some(ui) = &mut self.downloads {
                    ui.queue_open = false;
                    ui.title_browse = None;
                    ui.presentation.close_queue();
                    ui.dismiss_exit_issue();
                }
                self.close_menu(cx);
                if !overlay { self.model.keyboard(false, self.now()); }
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
        if self.preview.is_some() { return; }
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
            }
        }
        cx.notify();
    }
    pub(super) fn cancel_main(&mut self, cx: &mut Context<Self>) {
        let now = self.now();
        if let Some(ui) = &mut self.downloads
            && let Some(job) = ui.selected_job
        {
            ui.request_cancel(job, now);
        }
        cx.notify();
    }
    pub(super) fn main_cancel_allowed(&self) -> bool {
        self.downloads.as_ref().is_none_or(|ui| ui.selected_job.is_some_and(|id| ui.cancel_allowed(id)))
    }
    pub(super) fn copy_download(&mut self, cx: &mut Context<Self>) {
        let now = self.now();
        if let Some(ui) = &mut self.downloads
            && let Some(job) = ui.selected_job
        {
            if self.preview.is_some() {
                // The Full action is available while the queue is closed.
                if ui.complete_diagnostic(job, Ok(()), now) { self.copied_at = Some(now); }
            } else { ui.send(QueueCommand::CopyDiagnostic(job), now); }
        }
        cx.notify();
    }
    pub(super) fn open_queue(&mut self, cx: &mut Context<Self>) {
        let now = self.now();
        let Some(ui) = &mut self.downloads else { return; };
        if !ui.queue_available(now) { return; }
        ui.queue_open = true;
        ui.exit_open = false;
        self.model.locks.menu = true;
        self.model.locks_changed(now);
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
                return Some(local_text(ui.language, &ui.main_label(job, snapshot, self.now())));
            }
        }
        Some(local_text(ui.language, "准备下载"))
    }
    pub(super) fn surface_menu_action(&mut self, action: crate::context_menu::Action, cx: &mut Context<Self>) {
        use crate::context_menu::Action;
        let now = self.now();
        self.background_clicks.reset();
        match action {
            Action::Close => self.close_menu(cx),
            Action::Quality(quality) => {
                if let Some(ui) = &mut self.downloads {
                    if ui.settings_pending || ui.settings().is_some_and(|s| s.quality == quality) { return; }
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
        use crate::context_menu::Action;
        let p = Palette::new(self.night);
        let g = self.model.geometry();
        let now = self.now();
        let language = self.downloads.as_ref().map_or_else(Default::default, |ui| ui.language);
        let saving = self.downloads.as_ref().is_some_and(|ui| ui.settings_pending);
        let quality_help = self.surface_menu.hint.as_ref().map(|hint| local_text(language, hint))
            .or_else(|| saving.then(|| language.text("正在保存设置…", "Saving settings…").to_owned()));
        let quality_status = quality_help.map(|help| {
            div().id("surface-menu-quality-status").size(px(20.)).flex_none()
                .flex().items_center().justify_center().rounded(px(4.))
                .child(svg().path(if saving { "icons/loader-circle.svg" } else { "icons/circle-alert.svg" })
                    .size(px(12.)).text_color(if saving { p.neutral } else { p.red }))
                .tooltip_above(&self.tooltips, move |_, cx| cx.new(|_| crate::settings_window::HelpTooltip {
                    text: help.clone(), night: p.night,
                }).into())
                .on_mouse_down(MouseButton::Left, cx.listener(|this, _, _, cx| {
                    this.background_clicks.reset(); cx.stop_propagation();
                }))
        });
        let close = div().id("surface-menu-close").size(px(FULL_CLOSE_HIT_SIZE)).flex_none()
            .flex().items_center().justify_center().cursor_pointer()
            .child(div().size(px(crate::tokens::FULL_CLOSE_DISC_SIZE)).flex_none().flex().items_center().justify_center().rounded_full()
                .border_1().border_color(if self.surface_menu.keyboard_selected(6) { p.neutral } else { transparent_black() })
                .bg(p.badge.opacity(self.surface_menu.highlight(6, now, self.model.reduced)))
                .child(surface_menu_icon(MenuIcon::Close, p.neutral)))
            .on_mouse_down(MouseButton::Left, cx.listener(|this, _, _, cx| {
                this.background_clicks.reset(); cx.stop_propagation();
            }))
            .on_hover(cx.listener(|this, inside, _, cx| {
                this.surface_menu.hover(6, *inside, this.now()); cx.notify();
            }))
            .on_click(cx.listener(|this, _, _, cx| this.surface_menu_action(Action::Close, cx)));
        let header = div().absolute().left(px(FULL_CLOSE_SIDE)).right(px(FULL_CLOSE_SIDE))
            .top(px(FULL_CLOSE_TOP)).h(px(FULL_CLOSE_HIT_SIZE))
            .flex().items_center().gap(px(6.))
            .child(div().id("surface-menu-header-drag").h_full().flex_1().pl(px(8.)).flex().items_center().gap(px(4.))
                .text_size(px(12.)).text_color(p.neutral).child(language.text("画质", "Quality"))
                .when_some(quality_status, |header, status| header.child(status))
                .on_mouse_down(MouseButton::Left, cx.listener(|this, _, window, cx| {
                    this.background_clicks.reset(); window.focus(&this.focus, cx);
                    this.drag = Some((crate::native::Native::cursor(), this.anchor));
                    this.model.locks.drag = true; this.model.locks_changed(this.now());
                    cx.stop_propagation(); cx.notify();
                })))
            .child(close);
        div().id("surface-menu-page").absolute().left(px(g.gutter)).top(px(g.gutter))
            .size(px(200.)).rounded(px(20.)).overflow_hidden()
            .top(px(g.gutter + (1. - self.surface_menu.menu_alpha(now, self.model.reduced)) * 4.))
            .opacity(self.surface_menu.menu_alpha(now, self.model.reduced))
            .when(!self.surface_menu.is_open(), |s| s
                .capture_any_mouse_down(cx.listener(|this, event: &MouseDownEvent, _, cx| {
                    if event.button == MouseButton::Right { this.show_context_menu(cx); }
                    cx.stop_propagation();
                }))
                .capture_key_down(|_, _, cx| cx.stop_propagation()))
            // Only the nonbutton header starts dragging; all other menu presses stay local.
            .on_mouse_down(MouseButton::Left, cx.listener(|this, _, _, cx| {
                this.background_clicks.reset(); cx.stop_propagation();
            }))
            .on_mouse_down(MouseButton::Right, cx.listener(|_, _, _, cx| cx.stop_propagation()))
            .on_mouse_up(MouseButton::Left, cx.listener(|this, _, _, cx| {
                if this.drag.take().is_some() {
                    this.model.locks.drag = false; this.model.locks_changed(this.now()); cx.notify();
                }
            }))
            .child(header).child(self.surface_menu_rows(cx)).into_any_element()
    }
    fn surface_menu_rows(&self, cx: &mut Context<Self>) -> AnyElement {
        use crate::context_menu::Menu;
        let p = Palette::new(self.night);
        let now = self.now();
        let quality = self.downloads.as_ref().and_then(|ui| ui.settings()).map(|s| s.quality);
        let busy = self.downloads.as_ref().is_none_or(|ui| ui.settings_pending || ui.settings().is_none());
        let language = self.downloads.as_ref().map_or_else(Default::default, |ui| ui.language);
        let selected = quality.map(|q| match q { Quality::Highest => 0., Quality::Balanced => 1., Quality::Saver => 2. });
        let segment_x = self.ui_motion.value("menu-quality-position", selected.unwrap_or(1.));
        let mut segments = div().absolute().left(px(12.)).top(px(0.)).w(px(176.)).h(px(32.))
            .flex().items_center().gap(px(2.)).p(px(2.)).rounded(px(7.))
            .border_1().border_color(p.border)
            .when(selected.is_some(), |s| s.child(div().absolute().left(px(2. + segment_x * (170. / 3.)))
                .top(px(2.)).w(px(164. / 3.)).h(px(26.)).rounded(px(4.)).bg(p.badge)));
        for (index, (value, label, help)) in [
            (Quality::Highest, language.text("最高", "Best"), language.text("最高可得", "Best available")),
            (Quality::Balanced, language.text("均衡", "Balanced"), language.text("最高 1080p", "Up to 1080p")),
            (Quality::Saver, language.text("省流", "Saver"), language.text("最高 480p", "Up to 480p")),
        ].into_iter().enumerate() {
            let checked = quality == Some(value);
            let highlight = self.surface_menu.highlight(index, now, self.model.reduced);
            let button = div().id(SharedString::from(format!("surface-menu-quality-{index}")))
                .h_full().flex_1().min_w(px(0.)).flex().items_center().justify_center()
                .rounded(px(4.)).border_1()
                .border_color(if self.surface_menu.keyboard_selected(index) { p.neutral.opacity(0.6) } else { transparent_black() })
                .bg(p.neutral.opacity(highlight * if p.night { 0.1 } else { 0.04 }))
                .text_size(px(12.)).text_color(p.primary_text())
                .font_weight(if checked { FontWeight::MEDIUM } else { FontWeight::NORMAL })
                .opacity(if busy { 0.5 } else { 1. })
                .tooltip_above(&self.tooltips, move |_, cx| cx.new(|_| crate::settings_window::HelpTooltip { text: help.into(), night: p.night }).into())
                .when(!busy, |button| button.cursor_pointer())
                .on_mouse_down(MouseButton::Left, cx.listener(|this, _, _, cx| {
                    this.background_clicks.reset(); cx.stop_propagation();
                }))
                .on_hover(cx.listener(move |this, inside, _, cx| {
                    this.surface_menu.hover(index, *inside, this.now()); cx.notify();
                }))
                .on_click(cx.listener(move |this, _, _, cx| {
                    if this.surface_menu.is_open() && !busy
                        && let Some(action) = Menu::action(index) { this.surface_menu_action(action, cx); }
                }))
                .child(label);
            segments = segments.child(button);
        }
        let mut content = div().absolute().left(px(0.)).top(px(40.)).w(px(200.)).h(px(160.)).child(segments)
            .child(div().absolute().left(px(12.)).top(px(105.)).w(px(176.)).h(px(1.)).bg(p.border));
        let hovered = self.surface_menu.active_item().filter(|i| (3..=5).contains(i));
        let hover_y = self.ui_motion.value("menu-row-position", match hovered { Some(4) => 70., Some(5) => 110., _ => 38. });
        let hover_alpha = self.ui_motion.presence("menu-row-highlight", hovered.is_some()).alpha;
        content = content.child(div().absolute().left(px(12.)).top(px(hover_y)).w(px(176.)).h(px(30.))
            .rounded(px(6.)).bg(p.neutral.opacity(hover_alpha * if p.night { 0.12 } else { 0.06 })));
        for (index, top, label, icon) in [
            (3, 38., language.text("设置", "Settings"), MenuIcon::Settings),
            (4, 70., language.text("隐藏到托盘", "Hide to tray"), MenuIcon::Hide),
            (5, 110., language.text("退出", "Quit"), MenuIcon::Exit),
        ] {
            let highlight = self.surface_menu.highlight(index, now, self.model.reduced);
            let color = if index == 5 && highlight > 0. { p.red } else { p.neutral };
            let row = div().id(SharedString::from(format!("surface-menu-action-{index}")))
                .absolute().left(px(12.)).top(px(top)).w(px(176.)).h(px(30.))
                .px(px(8.)).flex().items_center().gap(px(10.)).rounded(px(6.))
                .border_1().border_color(if self.surface_menu.keyboard_selected(index) { color.opacity(0.5) } else { transparent_black() })
                .when(index == 5, |s| s.bg(p.red.opacity(highlight * if p.night { 0.05 } else { 0.025 })))
                .text_size(px(12.)).text_color(color).cursor_pointer()
                .child(surface_menu_icon(icon, color)).child(label)
                .on_mouse_down(MouseButton::Left, cx.listener(|this, _, _, cx| {
                    this.background_clicks.reset(); cx.stop_propagation();
                }))
                .on_hover(cx.listener(move |this, inside, _, cx| {
                    this.surface_menu.hover(index, *inside, this.now()); cx.notify();
                }))
                .on_click(cx.listener(move |this, _, _, cx| {
                    if this.surface_menu.is_open()
                        && let Some(action) = Menu::action(index) { this.surface_menu_action(action, cx); }
                }));
            content = content.child(row);
        }
        content.into_any_element()
    }
    pub(super) fn hide_downloads(&mut self,cx:&mut Context<Self>) {
        self.shortcut_reveal = gpui::Task::ready(());
        self.shortcut_positioning = false;
        self.model.keyboard(false, self.now());
        self.end_external_drop(cx);
        self.model.clear_directory(self.now());
        self.close_menu(cx);
        if self.tray.is_some() && let Some(native)=&self.native {tray::Tray::hide(native.hwnd);if let Some(ui)=&mut self.downloads{ui.hidden=true;}}
    }
    pub(super) fn open_output_directory(&mut self,cx:&mut Context<Self>) {
        if self.preview.is_some() { return; }
        let Some(path)=self.downloads.as_ref().and_then(|ui|ui.settings()).map(|s|s.output_dir) else{return;};
        let task=cx.background_executor().spawn(async move {
            ameow_next::file_manager::open_directory(&path).is_ok()
        });
        cx.spawn(async move |this,cx|{let success=task.await;let _=this.update(cx,|this,cx|{if let Some(ui)=&mut this.downloads{ui.evidence(serde_json::json!({"type":"open-output-directory","launched":success}));}cx.notify();});}).detach();
    }
    pub(super) fn drop_output_directory(&mut self,paths:&[PathBuf],cx:&mut Context<Self>) {
        if self.preview.is_some() { return; }
        let now=self.now();let Some(ui)=&mut self.downloads else{return;};
        ui.request_dropped_directory(paths,now);
        self.close_menu(cx);
    }
    fn queue_icon(&self, id: u64, icon: QueueIcon, enabled: bool, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.night);
        let copied = icon == QueueIcon::Copy && self.downloads.as_ref().is_some_and(|ui| ui.row_copied(id, self.now()));
        let enabled = enabled && self.downloads.as_ref().is_some_and(|ui| ui.row_action_allowed(id, icon, self.now()));
        let focus = self.downloads.as_ref().and_then(|ui| ui.action_focus.iter()
            .find(|entry| entry.action.job == id && entry.action.icon == icon))
            .map(|entry| (entry.action.clone(), entry.handle.clone()));
        let color = if icon == QueueIcon::Clear { p.red.opacity(0.8) } else { p.neutral };
        let drawing = if icon == QueueIcon::Copy {
            let arrival = self.ui_motion.change(format!("queue-copy-icon:{id}"), copied);
            svg().path(if copied { "icons/check.svg" } else { "icons/copy.svg" })
                .size(px(14.)).opacity(0.4 + 0.6 * arrival).text_color(color.opacity(if enabled { 1. } else { 0.35 })).into_any_element()
        } else { queue_icon_drawing(icon, color.opacity(if enabled { 1. } else { 0.35 })).into_any_element() };
        let button_id = SharedString::from(format!("{}-{id}", icon.name()));
        let cancel = icon == QueueIcon::Cancel;
        div().id(button_id.clone()).group(button_id.clone())
            .size(px(QUEUE_ICON_SIZE)).flex_none().flex().items_center().justify_center()
            .rounded_full().border_1().border_color(transparent_black())
            .role(Role::Button).aria_label(local_text(self.language, if copied { "已复制" } else { icon.label() }))
            .child(if cancel {
                div().id("queue-cancel-disc").size(px(crate::tokens::FULL_CLOSE_DISC_SIZE)).flex_none()
                    .flex().items_center().justify_center().rounded_full()
                    .when(enabled, |circle| circle
                        .group_hover(button_id.clone(), move |s| crate::tokens::icon_hover(s, p))
                        .group_active(button_id, move |s| s.bg(p.border)))
                    .child(drawing).into_any_element()
            } else { drawing })
            .when(enabled, |button| button
                .focusable().tab_index(0).cursor_pointer()
                .when_some(focus, |button, (action, handle)| button
                    .track_focus(&handle)
                    .on_hover(cx.listener(move |this, hovered: &bool, _, cx| {
                        let now = this.now();
                        if let Some(ui) = &mut this.downloads { ui.hover_action(&action, *hovered, now); }
                        cx.notify();
                    })))
                .when(!cancel, |button| button
                    .hover(move |s| crate::tokens::icon_hover(s, p))
                    .active(move |s| s.bg(p.border)))
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
        let mut row_jobs = self.downloads.as_ref().and_then(|ui| ui.snapshot.as_ref()).map_or_else(Vec::new, |s| s.jobs.clone());
        for (index, old) in self.queue_motion_rows.iter().enumerate() {
            if !row_jobs.iter().any(|job| job.job_id == old.job_id)
                && self.ui_motion.presence(format!("queue-row:{}", old.job_id), false).visible() {
                row_jobs.insert(index.min(row_jobs.len()), old.clone());
            }
        }
        self.queue_motion_rows = row_jobs.clone();
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
        let summary = queue_activity_summary(executing, waiting, ui.language);
        let preparation_held = snapshot.is_some_and(|s| s.preparation_held);
        let rows: Vec<_> = row_jobs.iter().filter_map(|job| {
                let id = job.job_id;
                let visible = snapshot.is_some_and(|s| s.jobs.iter().any(|j| j.job_id == id)) && ui.row_visible(job, now);
                let presence = self.ui_motion.presence(format!("queue-row:{id}"), visible);
                if !presence.visible() { return None; }
                let failure = matches!(job.phase, JobPhase::Failure | JobPhase::Partial);
                let success = job.phase == JobPhase::Success;
                let held = job.phase == JobPhase::Held && (job.slot_owned || preparation_held);
                let preparation_wait = snapshot.and_then(|s| preparation_wait_label(&job.phase, s));
                let fraction = if success {
                    Some(1.)
                } else if job.phase == JobPhase::Downloading && job.gallery_progress.is_none()
                    && ui.cancel_feedback(job).is_none() {
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
                let row_status = local_text(ui.language, &ui.cancel_feedback(job).filter(|label| *label != "清理待确认")
                    .or_else(|| ui.row_action_label(id, focused, now)).map(str::to_owned)
                    .unwrap_or_else(|| snapshot.map_or_else(String::new, |snapshot| queue_row_status(job, snapshot, fraction, transfer_now))));
                let icons = queue_row_icons(job, preparation_held);
                let title_width = queue_title_width(icons.len());
                let mut first_line = div().h(px(24.)).w_full().flex_none().flex().items_center().gap(px(QUEUE_LINE_GAP))
                    .child(self.queue_title(id, title, title_width, window, cx));
                if !icons.is_empty() {
                    let mut actions = div().w(px(queue_action_width(icons.len()))).flex_none().flex().items_center().gap(px(QUEUE_ICON_GAP));
                    for &icon in icons {
                        actions = actions.child(self.queue_icon(id, icon, visible, cx));
                    }
                    first_line = first_line.child(actions);
                }
                Some(div()
                    .id(SharedString::from(format!("job-{id}")))
                    .h(px(QUEUE_ROW_HEIGHT * presence.alpha)).min_h(px(QUEUE_ROW_HEIGHT * presence.alpha)).flex_shrink_0()
                    .overflow_hidden().opacity(presence.alpha)
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
                            .child(row_status))))

            })
            .collect();
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
                    .h(px(40.))
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .text_size(px(10.))
                    .font_weight(FontWeight::MEDIUM)
                    .child(gpui_base::Button::new("queue-back")
                        .accessibility_label(ui.language.text("返回", "Back"))
                        .size(px(24.)).flex_none().flex().items_center().justify_center()
                        .rounded_full().border_1().border_color(transparent_black()).text_color(p.neutral)
                        .cursor_pointer().hover(move |s| crate::tokens::icon_hover(s, p)).focus(move |s| s.border_color(p.neutral))
                        .tooltip_above(&self.tooltips, {
                            let label = ui.language.text("返回", "Back");
                            move |_, cx| cx.new(|_| crate::settings_window::HelpTooltip { text: label.into(), night: p.night }).into()
                        })
                        .child(svg().path("icons/arrow-left.svg").size(px(14.)).text_color(p.neutral))
                        .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                        .on_click(cx.listener(|this, _, window, cx| {
                            if let Some(ui) = &mut this.downloads {
                                ui.queue_open = false;
                                ui.title_browse = None;
                                ui.presentation.close_queue();
                            }
                            this.close_menu(cx);
                            window.focus(&this.focus, cx);
                        })))
                    .child(div().flex_1().min_w(px(0.)).child(ui.language.text("队列", "Queue")))
                    .when(!summary.is_empty(), |header| header.child(
                        div().id("queue-activity").flex_none().h(px(22.)).px(px(6.))
                            .flex().items_center().gap(px(8.)).rounded(px(6.)).bg(p.badge)
                            .text_size(px(10.)).font_weight(FontWeight::NORMAL)
                            .aria_label(summary.clone())
                            .tooltip_above(&self.tooltips, move |_, cx| cx.new(|_| crate::settings_window::HelpTooltip {
                                text: summary.clone(), night: p.night,
                            }).into())
                            .when(executing > 0, |badge| badge.child(div().flex().items_center().gap(px(4.))
                                .child(svg().path("icons/download.svg").size(px(12.)).text_color(p.blue))
                                .child(executing.to_string())))
                            .when(waiting > 0, |badge| badge.child(div().flex().items_center().gap(px(4.))
                                .child(svg().path("icons/clock.svg").size(px(12.)).text_color(p.neutral))
                                .child(waiting.to_string()))))),
            )
            .child(
                div()
                    .id("download-queue-scroll")
                    .h(px(140.))
                    .overflow_y_scroll()
                    .track_scroll(&ui.queue_scroll)
                    .on_scroll(cx.listener(|this, _, _, cx| {
                        if let Some(ui) = &mut this.downloads { ui.title_browse = None; }
                        cx.notify();
                    }))
                    .children(rows),
            )
            .into_any_element()
    }
    pub(super) fn exit_panel(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.night);
        let g = self.model.geometry();
        let Some(ui) = &self.downloads else { return div().into_any_element(); };
        let Some(issue) = ui.exit_issue() else { return div().into_any_element(); };
        let language = ui.language;
        let targets = ui.snapshot.as_deref().map_or_else(Vec::new, cleanup_targets);
        let retry_notice = targets.iter().find_map(|job| {
            if *job == 0 {
                ui.preparation_status.as_ref().filter(|(_, danger)| *danger).map(|(text, _)| text.as_str())
            } else { ui.row_notice(*job, self.now()) }
        });
        let message = retry_notice.map_or_else(|| issue.message(language).to_owned(), |text| local_text(language, text));
        let task_details = issue != ExitIssue::OwnerLost && targets.iter().any(|job| *job != 0);
        let details_label = if task_details {
            language.text("查看队列", "View queue")
        } else { language.text("查看诊断", "View diagnostics") };
        let status_label = if retry_notice.is_some() { language.text("请查看详情", "See details") }
            else { issue.label(language) };
        let icon_button = |id: &'static str, icon: &'static str, label: String| {
            let dismiss = icon == "icons/x.svg";
            let retry = icon == "icons/rotate-cw.svg";
            gpui_base::Button::new(id).accessibility_label(label.clone())
                .group(id).size(px(if dismiss { FULL_CLOSE_HIT_SIZE } else { crate::tokens::SMALL_ICON_BUTTON_SIZE })).flex_none()
                .flex().items_center().justify_center()
                .rounded_full().border_1().border_color(transparent_black())
                .cursor_pointer()
                .when(!dismiss && !retry, |button| button.bg(p.badge)
                    .hover(move |s| crate::tokens::icon_hover(s, p)).active(move |s| s.bg(p.border)))
                .focus(move |s| s.border_color(p.neutral))
                .when(!dismiss, |button| button.tooltip_above(&self.tooltips, move |_, cx| cx.new(|_| crate::settings_window::HelpTooltip {
                    text: label.clone(), night: p.night,
                }).into()))
                .child(div().size(px(if dismiss { crate::tokens::FULL_CLOSE_DISC_SIZE } else if retry { crate::tokens::FULL_ACTION_SIZE } else { crate::tokens::ICON_SIZE })).flex_none()
                    .flex().items_center().justify_center()
                    .rounded_full()
                    .when(dismiss, |circle| circle.group_hover(id, move |s| crate::tokens::icon_hover(s, p)))
                    .when(retry, |circle| circle.group_hover(id, move |s| crate::tokens::icon_hover(s, p)))
                    .child(svg().path(icon).size(px(if retry { 12. } else { crate::tokens::ICON_SIZE })).text_color(p.neutral)))
        };
        div()
            .absolute().left(px(g.gutter)).top(px(g.gutter)).size(px(g.surface))
            .text_color(p.primary_text()).text_size(px(10.)).line_height(px(14.))
            .child(div().absolute().left(px(52.)).top(px(61.)).w(px(96.)).h(px(103.))
                .child(crate::indicator::cleanup_attention(p, status_label))
                .when(!targets.is_empty(), |content| content.child(
                    icon_button("exit-retry-cleanup", "icons/rotate-cw.svg", language.text("重试清理", "Retry cleanup").into())
                        .absolute().left(px(36.)).top(px(79.))
                        .on_click(cx.listener(|this, _, _, cx| {
                            let now = this.now();
                            if let Some(ui) = &mut this.downloads {
                                let targets = ui.snapshot.as_deref().map_or_else(Vec::new, cleanup_targets);
                                for job in targets { ui.send(QueueCommand::RetryCleanup(job), now); }
                            }
                            cx.notify();
                        })))))
            .child(icon_button("exit-details", "icons/info.svg", format!("{message} · {details_label}"))
                .absolute().left(px(12.)).bottom(px(12.))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.dismiss_exit_issue(cx);
                    if task_details { this.open_queue(cx); } else { this.open_component_settings(cx); }
                })))
            .child(icon_button("exit-dismiss", "icons/x.svg", language.text("收起提示", "Dismiss").into())
                .absolute().right(px(FULL_CLOSE_SIDE)).top(px(FULL_CLOSE_TOP))
                .on_click(cx.listener(|this, _, _, cx| this.dismiss_exit_issue(cx))))
            .on_mouse_down(MouseButton::Left, cx.listener(|_, _, _, cx| cx.stop_propagation()))
            .into_any_element()
    }
    fn application_update_button(
        &self,
        update: &ameow_next::app_update::service::View,
        language: crate::ui_text::Language,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let p = Palette::new(self.night);
        let enabled = crate::app_update_ui::popup_action(update).is_some();
        let label = crate::app_update_ui::full_label(update, language);
        let headline = crate::app_update_ui::headline(update, language);
        let detail = crate::app_update_ui::detail(update, language);
        let tooltip = if detail.is_empty() { headline.clone() } else { format!("{headline}\n{detail}") };
        gpui_base::Button::new("application-update")
            .accessibility_label(format!("{headline}，{label}"))
            .disabled(!enabled)
            .w_full().min_h(px(36.)).h_auto().px(px(10.)).py(px(8.))
            .flex().flex_col().items_start().gap(px(4.))
            .rounded(px(8.)).border_1().border_color(transparent_black())
            .text_color(p.primary_text()).text_size(px(10.)).line_height(px(14.))
            .when(enabled, |button| button.cursor_pointer().hover(move |s| s.bg(p.badge)).active(move |s| s.bg(p.border)))
            .focus(move |s| s.border_color(p.neutral))
            .tooltip_above(&self.tooltips, move |_, cx| cx.new(|_| crate::settings_window::HelpTooltip {
                text: tooltip.clone(), night: p.night,
            }).into())
            .child(div().w_full().flex().items_center().gap(px(5.))
                .child(svg().path(crate::app_update_ui::popup_icon(update)).size(px(12.)).flex_none().text_color(p.neutral))
                .child(div().flex_1().min_w(px(0.)).text_color(p.neutral).truncate()
                    .child(update.update.version.clone().unwrap_or_default()))
                .child(div().flex_none().font_weight(FontWeight::MEDIUM).child(label)))
            .when(update.update.phase == ameow_next::app_update::Phase::Downloading, |button|
                button.child(div().pl(px(17.)).text_color(p.neutral).child(detail)))
            .on_mouse_down(MouseButton::Left, cx.listener(|_, _, _, cx| cx.stop_propagation()))
            .on_click(cx.listener(|this, _, _, cx| this.full_update_action(cx)))
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
                        || self
                            .downloads
                            .as_ref()
                            .is_some_and(|ui| ui.updates.snapshot().full_attention() || ui.extension_pending())
                })
    }
    pub(super) fn preparation_animation_delay(&self) -> Option<u64> {
        let snapshot = self.downloads.as_ref()?.snapshot.as_ref()?;
        let preparation = &snapshot.preparation;
        (self.preparation_indicator_visible()
            && preparation_visible(snapshot, ameow_next::download::progress::now_ms())
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
        let update = ui.updates.snapshot();
        let update_attention = update.full_attention();
        let extension_attention = ui.extension_pending();
        let p = Palette::new(self.night);
        let g = self.model.geometry();
        let failed = preparation.phase == PreparationPhase::Failed
            || snapshot.preparation_held
            || snapshot.preparation_owner_lost;
        let ready = preparation.phase == PreparationPhase::Ready && !failed;
        let component_visible = preparation_popup_visible(snapshot, ameow_next::download::progress::now_ms(), update_attention || extension_attention);
        let update_only = update_attention && !component_visible;
        let extension_only = extension_attention && !component_visible && !update_attention;
        let popup = self.ui_motion.presence("full-preparation-popup", ui.preparation_hovered && (!ready || update_attention || extension_attention));
        let fraction = preparation_fraction(preparation);
        let now = self.now();
        let can_retry = ui.preparation_retry_available();
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
            .flex()
            .flex_col()
            .rounded(px(9.))
            .bg(p.surface)
            .border_1()
            .border_color(p.border)
            .text_color(p.neutral)
            .text_size(px(9.));
        if component_visible {
            let mut component_details = div().p(px(9.)).flex().flex_col().gap(px(5.));
            let (headline, message) = preparation_popup_copy(snapshot, ui.language);
            let copied = ui.preparation_copied_at
                .is_some_and(|at| now.saturating_sub(at) < crate::ui_motion::COPY_FEEDBACK_MS);
            let copy_arrival = self.ui_motion.change("preparation-copy-icon", copied);
            let copy_label = if ui.preparation_copy_pending {
                ui.language.text("正在复制…", "Copying…")
            } else if copied {
                ui.language.text("已复制", "Copied")
            } else {
                ui.language.text("复制诊断", "Copy diagnostic")
            };
            let mut title = div().flex_1().flex().items_center().gap(px(6.)).min_w(px(0.))
                .child(div().flex_1().min_w(px(0.)).font_weight(FontWeight::MEDIUM)
                    .text_size(px(10.)).line_height(px(14.)).text_color(p.primary_text()).child(headline));
            if failed {
                title = title.child(gpui_base::Button::new("preparation-copy")
                        .accessibility_label(copy_label).disabled(ui.preparation_copy_pending)
                        .size(px(24.)).flex_none().flex().items_center().justify_center()
                        .rounded(px(4.)).border_1().border_color(transparent_black())
                        .cursor_pointer().hover(move |s| crate::tokens::icon_hover(s, p)).active(move |s| s.bg(p.border))
                        .focus(move |s| s.border_color(p.neutral))
                        .opacity(if ui.preparation_copy_pending { 0.5 } else { 1. })
                        .tooltip_above(&self.tooltips, move |_, cx| cx.new(|_| crate::settings_window::HelpTooltip {
                            text: copy_label.into(), night: p.night,
                        }).into())
                        .child(svg().path(if copied { "icons/check.svg" } else { "icons/copy.svg" })
                            .size(px(crate::tokens::ICON_SIZE)).opacity(0.4 + 0.6 * copy_arrival).text_color(p.neutral))
                        .on_mouse_down(MouseButton::Left, cx.listener(|_, _, _, cx| cx.stop_propagation()))
                        .on_click(cx.listener(|this, _, _, cx| {
                            let now = this.now();
                            if let Some(ui) = &mut this.downloads { ui.copy_preparation_diagnostic(now); }
                            cx.notify();
                        })));
            }
            component_details = component_details.child(div().flex().items_center().gap(px(4.))
                .child(div().size(px(4.)).flex_none().rounded_full().bg(color)).child(title));
            if preparation.phase == PreparationPhase::Downloading && !failed {
                let bytes = preparation_bytes(preparation.downloaded_bytes);
                let progress = if let Some(fraction) = fraction {
                    format!(
                        "{bytes} / {} · {:.0}%",
                        preparation_bytes(preparation.total_bytes.unwrap()),
                        (fraction * 100.).floor()
                    )
                } else {
                    format!("{} {bytes}", ui.language.text("已下载", "Downloaded"))
                };
                component_details = component_details.child(div().pl(px(8.)).child(progress));
            }
            if let Some(message) = message {
                component_details = component_details.child(div().pl(px(8.)).child(message));
            }
            if failed && can_retry {
                component_details = component_details.child(div().flex().justify_end().child(
                    gpui_base::Button::new("preparation-retry")
                        .accessibility_label(ui.language.text("重试准备组件", "Retry component setup"))
                        .min_h(px(24.)).px(px(8.)).flex().items_center().rounded(px(5.))
                        .border_1().border_color(transparent_black()).bg(p.badge)
                        .text_size(px(10.)).text_color(p.primary_text()).cursor_pointer()
                        .hover(move |s| s.bg(p.border)).focus(move |s| s.border_color(p.neutral))
                        .child(ui.language.text("重试", "Retry"))
                        .on_mouse_down(MouseButton::Left, cx.listener(|_, _, _, cx| cx.stop_propagation()))
                        .on_click(cx.listener(|this, _, _, cx| {
                            let now = this.now();
                            if let Some(ui) = &mut this.downloads {
                                ui.retry_preparation(now);
                            }
                            cx.notify();
                        })),
                ));
            }
            details = details.child(component_details);
        }
        if update_attention {
            details = details.child(div()
                .when(component_visible, |s| s.border_t_1().border_color(p.border))
                .child(self.application_update_button(&update, ui.language, cx)));
        }
        if extension_attention {
            let label = ui.language.text("浏览器扩展需要重载", "Reload browser extension");
            details = details.child(gpui_base::Button::new("extension-update")
                .accessibility_label(label).w_full().min_h(px(36.)).h_auto().px(px(10.)).py(px(8.))
                .flex().items_center().gap(px(6.)).rounded(px(8.)).border_1().border_color(transparent_black())
                .when(component_visible || update_attention, |s| s.border_t_1().border_color(p.border))
                .text_color(p.primary_text()).text_size(px(10.)).line_height(px(14.))
                .cursor_pointer().hover(move |s| s.bg(p.badge)).active(move |s| s.bg(p.border))
                .focus(move |s| s.border_color(p.neutral))
                .child(svg().path("icons/blocks.svg").size(px(12.)).flex_none().text_color(p.neutral))
                .child(label)
                .on_mouse_down(MouseButton::Left, cx.listener(|_, _, _, cx| cx.stop_propagation()))
                .on_click(cx.listener(|this, _, _, cx| this.open_component_settings(cx))));
        }
        div()
            .id("component-preparation-indicator")
            .absolute()
            .left(px(g.gutter + 12.))
            .bottom(px(g.gutter + 12.))
            .w(px(if popup.visible() { 176. } else { 24. },
            ))
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
            .when(popup.visible(), |indicator| {
                // Keep the popover, bridge and ring inside one real hover hitbox.
                indicator.child(div().relative().top(px(popup.travel(4.))).opacity(popup.alpha).pb(px(6.))
                    .when(!popup.open, |s| s.capture_any_mouse_down(|_, _, cx| cx.stop_propagation())
                        .capture_key_down(|_, _, cx| cx.stop_propagation())).child(details))
            },
            )
            .child(
                gpui_base::Button::new("component-preparation-status")
                    .accessibility_label(if update_only {
                        format!("{}，{}", crate::app_update_ui::headline(&update, ui.language), crate::app_update_ui::full_label(&update, ui.language))
                    } else if extension_only { ui.language.text("浏览器扩展需要重载", "Reload browser extension").into() }
                    else { ui.language.text("组件状态", "Component status").into() })
                    .disabled(!extension_only && (!update_only || crate::app_update_ui::popup_action(&update).is_none()))
                    .relative()
                    .size(px(crate::tokens::SMALL_ICON_BUTTON_SIZE))
                    .flex_none()
                    .rounded_full()
                    .bg(p.badge)
                    .hover(move |s| crate::tokens::icon_hover(s, p))
                    .when(extension_only || update_only && crate::app_update_ui::popup_action(&update).is_some(), |button| button.cursor_pointer())
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if update_only { this.full_update_action(cx); }
                        else if extension_only { this.open_component_settings(cx); }
                    }))
                    .when(!update_only && !extension_only, |ring| ring.child(indicator::preparation_ring(
                        p,
                        fraction,
                        failed,
                        ready,
                        now,
                        self.model.reduced,
                    )))
                    .when(extension_only, |ring| ring.child(svg().path("icons/blocks.svg")
                        .absolute().left(px(4.)).top(px(4.)).size(px(crate::tokens::ICON_SIZE)).text_color(p.neutral)))
                    .when(update_only, |ring| ring.child(
                        svg().path(crate::app_update_ui::popup_icon(&update))
                            .absolute().left(px(4.)).top(px(4.)).size(px(crate::tokens::ICON_SIZE))
                            .text_color(p.neutral)))
                    .when(failed && !update_only && !extension_only, |ring| {
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
                    .when(ready && !update_only && !extension_only, |ring| {
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
pub(super) fn exit_issue(snapshot: &QueueSnapshot) -> Option<ExitIssue> {
    if snapshot.stopped { None }
    else if snapshot.preparation_owner_lost { Some(ExitIssue::OwnerLost) }
    else if !cleanup_targets(snapshot).is_empty() { Some(ExitIssue::Cleanup) }
    else { None }
}
impl ExitIssue {
    fn label(self, language: crate::ui_text::Language) -> &'static str {
        match self {
            Self::OwnerLost => language.text("清理未确认", "Cleanup unconfirmed"),
            Self::Cleanup => language.text("等待清理", "Cleanup pending"),
        }
    }
    fn message(self, language: crate::ui_text::Language) -> &'static str {
        match self {
            Self::OwnerLost => language.text("组件清理未确认", "Component cleanup is unconfirmed"),
            Self::Cleanup => language.text("任务资源尚未释放", "Task resources are still in use"),
        }
    }
}
#[cfg(test)]
mod tests {
    use super::{ErrorCategory, PreparationPhase, PreparationStage};
    #[test]
    fn optional_component_update_stays_in_settings_but_cleanup_fault_remains_visible() {
        use ameow_next::download::runtime_update::RuntimeUpdatePhase;
        let mut snapshot = crate::queue_fixture::snapshot(Vec::new());
        snapshot.verified_runtime_versions = vec![("yt-dlp".into(), "2026.10.01".into())];
        snapshot.runtime_update.phase = RuntimeUpdatePhase::Downloading;
        snapshot.preparation.phase = PreparationPhase::Downloading;
        snapshot.preparation.stage = PreparationStage::Acquire;
        assert!(!super::preparation_visible(&snapshot, 0));
        snapshot.preparation_held = true;
        assert!(super::preparation_visible(&snapshot, 0));
        snapshot.preparation_held = false;
        snapshot.preparation_owner_lost = true;
        assert!(super::preparation_visible(&snapshot, 0));
        snapshot.preparation_owner_lost = false;
        snapshot.verified_runtime_versions.clear();
        snapshot.preparation.phase = PreparationPhase::Failed;
        assert!(super::preparation_visible(&snapshot, 0));
    }
    #[test]
    #[ignore = "Replays a task-owned real queue trace from AMEOW_PROGRESS_QUEUE_TRACE; no window or synthetic byte values"]
    fn real_queue_trace_updates_existing_main_and_row_progress() {
        use super::*;
        let path = std::env::var("AMEOW_PROGRESS_QUEUE_TRACE").unwrap();
        let snapshots: Vec<QueueSnapshot> = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        let (commands, _) = mpsc::sync_channel(1);
        let (evidence, _) = mpsc::sync_channel(1);
        let (_, replies) = mpsc::channel();
        let latest = Arc::new(Mutex::new(None));
        let mut ui = DownloadUi::with_transport(commands, evidence, replies, latest.clone());
        ui.queue_open = true;
        let mut model = crate::model::Model::new(0, true);
        let mut indicator = indicator::Indicator::default();
        let mut fractions = Vec::new();
        for (index, mut snapshot) in snapshots.into_iter().enumerate() {
            let at = ameow_next::download::progress::now_ms();
            // Replay only refreshes the observation clock; bytes, totals and phases are recorded facts.
            for job in &mut snapshot.jobs {
                if let Some(sample) = &mut job.transfer_progress { sample.observed_at_ms = at; }
            }
            *latest.lock().unwrap() = Some(Arc::new(snapshot));
            ui.poll();
            ui.present(&mut model, &mut indicator, index as u64 * 250);
            if let Some(fraction) = ui.selected_fraction {
                let snapshot = ui.snapshot.as_ref().unwrap();
                let job = snapshot.jobs.iter().find(|j| Some(j.job_id) == ui.selected_job).unwrap();
                let sample = job.transfer_progress.as_ref().unwrap();
                assert_eq!(model.progress.target, fraction);
                let row = queue_row_status(job, snapshot, Some(fraction), at);
                assert!(row.contains('%'));
                let main = transfer_label(Some(sample), at);
                if sample.phase == ameow_next::download::progress::TransferPhase::Clip {
                    assert_eq!(sample.speed_at(at), None);
                    if sample.media_speed_at(at).is_some_and(|s| s < 1000.) {
                        assert!(row.ends_with('×') && main.starts_with("处理速度 "));
                    }
                }
                println!("{}", serde_json::json!({"bytes":sample.downloaded_bytes,"fraction":fraction,"ring_target":model.progress.target,"row":row,"main":main}));
                fractions.push(fraction);
            }
        }
        fractions.dedup();
        assert!(fractions.len() >= 3, "real trace must contain changing live primary progress");
    }

    #[test]
    fn partial_rows_show_verified_counts_and_failure_actions() {
        use super::*;
        use crate::ui_text::Language;
        for (total, expected) in [(Some(5), "已保存 4/5"), (None, "已保存 4")] {
            let job = crate::queue_fixture::partial(total);
            let snapshot = crate::queue_fixture::snapshot(vec![job.clone()]);
            assert_eq!(phase_label(&job), "部分完成");
            assert_eq!(queue_row_status(&job, &snapshot, None, 0), expected);
            assert_eq!(queue_row_icons(&job, false), &[QueueIcon::Retry, QueueIcon::Copy, QueueIcon::Clear]);
            assert!(local_text(Language::English, expected).starts_with("Saved 4"));
        }
        assert_eq!(local_text(Language::English, "部分完成"), "Partial");
    }
    #[test]
    fn gallery_progress_uses_counts_instead_of_a_percentage() {
        use super::*;
        use crate::ui_text::Language;
        let mut job = crate::queue_fixture::job(1, JobPhase::Downloading, Some(1), Some(0.6));
        for (total, expected) in [(Some(5), "已下载 4/5"), (None, "已下载 4个")] {
            job.gallery_progress = Some((4, total));
            assert_eq!(queue_progress_label(&job, Some(0.6), 0), expected);
            assert!(local_text(Language::English, expected).starts_with("Downloaded 4"));
        }
    }
    #[test]
    fn named_preview_holds_success_and_feedback_without_changing_production_deadlines() {
        use super::*;
        let mut ui = DownloadUi::controlled_preview();
        let mut model = crate::model::Model::new(0, true);
        let mut indicator = indicator::Indicator::default();
        ui.set_preview_scene(&crate::preview::find("queue.success").unwrap());
        ui.present(&mut model, &mut indicator, 100);
        ui.present(&mut model, &mut indicator, 60_000);
        assert!(ui.row_visible(&ui.snapshot.as_ref().unwrap().jobs[0], 60_000));
        let scene = crate::preview::find("queue.copy-failed").unwrap();
        ui.set_preview_scene(&scene); ui.hold_preview_feedback(&scene, 60_000);
        assert_eq!(ui.row_notice(5, 60_001), Some("复制失败，请重试"));
        ui.set_preview_scene(&crate::preview::find("queue.downloading").unwrap());
        assert!(ui.row_notices.is_empty()); assert!(ui.retry_pending.is_empty());
    }
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
        ui.complete_settings(CommandReply::SettingsSaved(requested.clone()), 0);
        assert_eq!(ui.settings(), Some(requested));
        assert!(!ui.settings_pending);
    }
    #[test]
    fn settings_ack_round_trip_uses_real_store_and_recovers_after_write_failure() {
        use super::*;
        use ameow_next::download::{composition, queue::DownloadCoordinator};
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("settings.json");
        let defaults = Settings { output_dir: root.path().into(), ..exit_snapshot().settings };
        let backend = composition::download_coordinator(root.path().join("runtime"), path.clone(), defaults.clone()).unwrap();
        let (commands, receiver) = mpsc::sync_channel(2);
        let (evidence, _) = mpsc::sync_channel(1);
        let (_, replies) = mpsc::channel();
        let mut ui = DownloadUi::with_transport(commands, evidence, replies, Arc::new(Mutex::new(None)));
        ui.snapshot = Some(Arc::new(backend.snapshot()));
        assert!(ui.request_preferences(ThemePreference::Dark, LanguagePreference::English, 1));
        assert!(ui.settings_pending);
        assert_eq!(ui.settings().unwrap(), defaults);
        let reply = backend.apply(receiver.recv_timeout(Duration::from_secs(1)).unwrap());
        let persisted = Settings::load(&path, defaults.clone()).unwrap();
        assert_eq!(persisted.theme, ThemePreference::Dark);
        assert_eq!(persisted.language, LanguagePreference::English);
        assert_eq!(ui.settings().unwrap(), defaults, "disk success alone is not a UI ACK");
        ui.complete_settings(reply, 0);
        assert_eq!(ui.settings().unwrap(), persisted);
        assert!(!ui.settings_pending);

        // Block atomic replacement with a directory; keep the accepted bytes intact.
        let accepted_bytes = std::fs::read(&path).unwrap();
        let held = root.path().join("accepted-settings.json");
        std::fs::rename(&path, &held).unwrap();
        std::fs::create_dir(&path).unwrap();
        assert!(ui.request_tray_icon(TrayIconPreference::Apricot, 2));
        let failure = backend.apply(receiver.recv_timeout(Duration::from_secs(1)).unwrap());
        std::fs::remove_dir(&path).unwrap();
        std::fs::rename(&held, &path).unwrap();
        assert!(matches!(failure, CommandReply::Error(_)));
        ui.complete_settings(failure, 0);
        assert!(!ui.settings_pending);
        assert!(matches!(ui.settings_status, SettingsStatus::Failed(_)));
        assert_eq!(ui.settings().unwrap(), persisted);
        assert_eq!(backend.snapshot().settings, persisted);
        assert_eq!(std::fs::read(&path).unwrap(), accepted_bytes);

        assert!(ui.request_tray_icon(TrayIconPreference::Apricot, 3));
        ui.complete_settings(backend.apply(receiver.recv_timeout(Duration::from_secs(1)).unwrap()), 0);
        let acknowledged = ui.settings().unwrap();
        assert_eq!(acknowledged.tray_icon, TrayIconPreference::Apricot);
        assert_eq!(acknowledged.theme, ThemePreference::Dark);
        assert_eq!(acknowledged.quality, defaults.quality);
        assert_eq!(acknowledged.output_dir, defaults.output_dir);
        let output = root.path().join("dropped-output");
        std::fs::create_dir(&output).unwrap();
        ui.request_dropped_directory(&[output.clone()], 10);
        let saved = backend.apply(receiver.recv_timeout(Duration::from_secs(1)).unwrap());
        assert!(ui.directory_drop_pending, "persistence is not yet a UI acknowledgement");
        assert_eq!(ui.settings(), Some(acknowledged.clone()));
        assert!(ui.complete_settings(saved, 30));
        let acknowledged = ui.settings().unwrap();
        assert_eq!(acknowledged.output_dir, output.canonicalize().unwrap());
        let accepted_bytes = std::fs::read(&path).unwrap();
        for invalid in [path.clone(), root.path().join("missing-directory")] {
            ui.request_dropped_directory(&[invalid], 40);
            let rejected = backend.apply(receiver.recv_timeout(Duration::from_secs(1)).unwrap());
            assert!(matches!(&rejected, CommandReply::Error(_)));
            assert!(!ui.complete_settings(rejected, 50));
            assert_eq!(ui.settings(), Some(acknowledged.clone()));
            assert_eq!(std::fs::read(&path).unwrap(), accepted_bytes);
        }
        fn stop(backend: &DownloadCoordinator) {
            backend.stop();
            let deadline = Instant::now()+Duration::from_secs(3);
            while !backend.snapshot().stopped {
                assert!(Instant::now() < deadline, "idle coordinator must stop");
                std::thread::sleep(Duration::from_millis(10));
            }
        }
        stop(&backend);
        let reopened = composition::download_coordinator(root.path().join("runtime"), path, defaults).unwrap();
        assert_eq!(reopened.snapshot().settings, acknowledged);
        assert!(reopened.snapshot().jobs.is_empty());
        assert!(!reopened.snapshot().preparing);
        stop(&reopened);
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
        ui.complete_settings(CommandReply::Error("E_SETTINGS_SAVE".into()), 0);
        assert_eq!(ui.settings(), Some(old));
        assert!(ui.request_tray_icon(TrayIconPreference::Apricot, 4));
        let QueueCommand::SaveSettings(requested) = receiver.try_recv().unwrap() else { panic!("settings command") };
        ui.complete_settings(CommandReply::SettingsSaved(requested.clone()), 0);
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
        ui.complete_settings(CommandReply::SettingsSaved(fresh.clone()), 0);
        assert!(ui.request_output_directory(PathBuf::from("new-folder"), 2));
        assert_eq!(ui.settings_status, SettingsStatus::Saving);
        assert_eq!(ui.settings().unwrap(), fresh);
        assert!(!ui.request_quality(Quality::Highest, 3));
        assert!(!ui.request_output_directory(PathBuf::from("conflict"), 4));
        let QueueCommand::SaveSettings(requested) = receiver.try_recv().unwrap() else { panic!("settings command") };
        assert_eq!(requested.quality, Quality::Saver);
        ui.complete_settings(CommandReply::Error("E_SETTINGS_SAVE".into()), 0);
        assert_eq!(ui.settings().unwrap(), fresh);
        assert!(matches!(ui.settings_status, SettingsStatus::Failed(_)));
        assert!(!ui.settings_pending);
        assert!(ui.request_output_directory(PathBuf::from("retry-folder"), 6));
        let QueueCommand::SaveSettings(mut requested) = receiver.try_recv().unwrap() else { panic!("settings command") };
        requested.output_dir = PathBuf::from("canonical-ack");
        ui.complete_settings(CommandReply::SettingsSaved(requested.clone()), 0);
        assert_eq!(ui.settings().unwrap(), requested);
        assert_eq!(ui.settings_status, SettingsStatus::Saved);
        drop(receiver);
        assert!(!ui.request_output_directory(PathBuf::from("disconnected"), 8));
        assert!(!ui.settings_pending);
        assert_eq!(ui.settings().unwrap(), requested);
        assert!(matches!(ui.settings_status, SettingsStatus::Failed(_)));
    }
    #[test]
    fn full_menu_quality_repeats_after_ack_without_changing_frozen_jobs() {
        use super::*;
        let (mut ui, receiver) = row_ui(JobPhase::Failure, false);
        let frozen = ui.snapshot.as_ref().unwrap().jobs[0].accepted.intent.quality;
        let mut menu = crate::context_menu::Menu::default();
        menu.open(Some(ui.settings().unwrap().quality), 0);
        let generation = menu.generation();
        for quality in [Quality::Highest, Quality::Saver, Quality::Balanced] {
            let previous = ui.settings().unwrap().quality;
            assert!(ui.request_quality(quality, 10));
            assert_eq!(ui.settings().unwrap().quality, previous);
            assert!(!ui.request_quality(previous, 11));
            let QueueCommand::SaveSettings(settings) = receiver.try_recv().unwrap() else { panic!("settings command") };
            assert_eq!(settings.quality, quality);
            menu.hint = Some("saving".into());
            ui.complete_settings(CommandReply::SettingsSaved(settings), 20);
            menu.saved(generation, true);
            assert_eq!(ui.settings().unwrap().quality, quality);
            assert!(!ui.settings_pending);
            assert!(menu.is_open());
            assert!(menu.hint.is_none());
            assert_eq!(ui.snapshot.as_ref().unwrap().jobs[0].accepted.intent.quality, frozen);
        }
        assert!(ui.request_quality(Quality::Saver, 30));
        receiver.try_recv().unwrap();
        ui.complete_settings(CommandReply::Error("E_SETTINGS_SAVE".into()), 40);
        menu.saved(generation, false);
        assert_eq!(ui.settings().unwrap().quality, Quality::Balanced);
        assert!(menu.is_open() && menu.hint.is_some());
        assert!(!ui.settings_pending);
        assert!(ui.request_quality(Quality::Saver, 50));
    }
    #[test]
    fn dropped_directory_feedback_waits_for_its_own_ack_and_expires() {
        use super::*;
        let (mut ui, receiver) = row_ui(JobPhase::Downloading, true);
        ui.queue_open = false;
        let mut model = crate::model::Model::new(0, true);
        let old = ui.settings().unwrap();
        ui.request_dropped_directory(&["candidate".into()], 10);
        assert!(ui.settings_pending);
        assert!(model.directory.is_none());
        assert_eq!(ui.settings(), Some(old.clone()));
        ui.request_dropped_directory(&["ignored-while-pending".into()], 11);
        let QueueCommand::SaveSettings(mut saved) = receiver.try_recv().unwrap() else { panic!("settings command") };
        assert!(receiver.try_recv().is_err());
        saved.output_dir = "canonical-owner-path".into();
        assert!(ui.complete_settings(CommandReply::SettingsSaved(saved.clone()), 100));
        model.directory_saved(100);
        assert!(!ui.complete_settings(CommandReply::SettingsSaved(saved.clone()), 101), "duplicate or unrelated ACK cannot replay feedback");
        assert_eq!(ui.settings(), Some(saved.clone()));
        model.tick(100 + Stage::Success.retention() - 1);
        assert_eq!(model.directory.unwrap().feedback, indicator::DirectoryFeedback::Saved);
        model.tick(100 + Stage::Success.retention());
        assert!(model.directory.is_none());
        ui.request_dropped_directory(&["another".into()], 200);
        let _ = receiver.try_recv().unwrap();
        assert!(!ui.complete_settings(CommandReply::Error("E_SETTINGS_SAVE".into()), 210));
        assert_eq!(ui.settings(), Some(saved));
        assert!(matches!(ui.settings_status, SettingsStatus::Failed(_)));
        assert!(ui.request_quality(Quality::Saver, 220));
        let QueueCommand::SaveSettings(preferences) = receiver.try_recv().unwrap() else { panic!("settings command") };
        assert!(!ui.complete_settings(CommandReply::SettingsSaved(preferences), 230), "other setting saves cannot confirm a folder drop");
        for paths in [vec![], vec!["one".into(), "two".into()]] {
            ui.request_dropped_directory(&paths, 240);
            assert!(!ui.settings_pending);
            assert!(!ui.directory_drop_pending);
            assert!(receiver.try_recv().is_err());
        }
        drop(receiver);
        ui.request_dropped_directory(&["disconnected".into()], 250);
        assert!(!ui.settings_pending);
        assert!(!ui.directory_drop_pending);
        assert!(matches!(ui.settings_status, SettingsStatus::Failed(_)));
    }
    #[test]
    fn main_menu_exit_enters_the_shared_idle_and_inflight_settlement_reducer() {
        use super::*;
        let (mut ui, _) = row_ui(JobPhase::Downloading, true);
        ui.request_menu_exit();
        assert_eq!(ui.exit_intent.resolve(ui.snapshot.as_deref(), false), Some(ExitAction::Stop));
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
    fn ordinary_exit_stops_once_without_opening_a_panel() {
        use super::*;
        for phase in [JobPhase::Downloading, JobPhase::Queued, JobPhase::Preparing, JobPhase::Failure] {
            let (mut ui, receiver) = row_ui(phase, false);
            assert!(ui.request_exit_stop(100));
            assert!(ui.exit_when_stopped);
            assert!(!ui.exit_open);
            assert_eq!(ui.exit_issue(), None);
            assert!(matches!(receiver.try_recv(), Ok(QueueCommand::Stop)));
            assert!(ui.request_exit_stop(101));
            assert!(receiver.try_recv().is_err());
            Arc::make_mut(ui.snapshot.as_mut().unwrap()).stopping = true;
            ui.sync_exit_issue();
            assert!(!ui.exit_open, "ordinary stopping is not an exit error");
        }
        let (mut ui, receiver) = row_ui(JobPhase::Failure, false);
        ui.snapshot = Some(Arc::new(exit_snapshot()));
        assert!(ui.request_exit_stop(100));
        assert!(matches!(receiver.try_recv(), Ok(QueueCommand::Stop)));
        assert!(!ui.exit_open);
    }
    #[test]
    fn a_full_stop_channel_keeps_the_exit_request_until_it_can_be_sent() {
        use super::*;
        let (mut ui, receiver) = row_ui(JobPhase::Downloading, true);
        for _ in 0..8 { ui.commands.try_send(QueueCommand::Cancel(99)).unwrap(); }
        assert!(!ui.request_exit_stop(100));
        assert!(!ui.exit_when_stopped);
        assert!(!ui.exit_open);
        assert_eq!(ui.exit_intent.resolve(ui.snapshot.as_deref(), false), Some(ExitAction::Stop));
        for _ in 0..8 { receiver.try_recv().unwrap(); }
        assert!(ui.request_exit_stop(101));
        assert!(matches!(receiver.try_recv(), Ok(QueueCommand::Stop)));
        assert!(ui.exit_when_stopped);
        assert!(!ui.exit_open);
    }
    #[test]
    fn dismissing_an_exit_issue_keeps_shutdown_pending_and_does_not_reopen_it() {
        use super::*;
        let (mut ui, receiver) = row_ui(JobPhase::Held, true);
        ui.sync_exit_issue();
        assert!(!ui.exit_open, "a running task is not an exit request");
        assert!(ui.request_exit_stop(100));
        assert!(matches!(receiver.try_recv(), Ok(QueueCommand::Stop)));
        assert_eq!(ui.exit_issue(), Some(ExitIssue::Cleanup));
        assert!(ui.exit_open);
        ui.dismiss_exit_issue();
        ui.sync_exit_issue();
        assert!(!ui.exit_open);
        assert!(ui.exit_when_stopped);
        Arc::make_mut(ui.snapshot.as_mut().unwrap()).preparation_owner_lost = true;
        ui.sync_exit_issue();
        assert_eq!(ui.exit_issue(), Some(ExitIssue::OwnerLost));
        assert!(ui.exit_open, "a different cleanup issue remains discoverable");
        let snapshot = Arc::make_mut(ui.snapshot.as_mut().unwrap());
        snapshot.preparation_owner_lost = false;
        snapshot.jobs[0].phase = JobPhase::Cancelled;
        snapshot.jobs[0].slot_owned = false;
        snapshot.jobs[0].resources_released = true;
        snapshot.stopping = true;
        ui.sync_exit_issue();
        assert_eq!(ui.exit_issue(), None);
        assert!(!ui.exit_open);
        assert!(ui.exit_when_stopped);
        assert!(!ui.snapshot.as_ref().unwrap().stopped, "only the backend confirms completion");
    }
    #[test]
    fn exit_previews_show_only_real_cleanup_issues_and_reset_between_scenes() {
        use super::*;
        let mut ui = DownloadUi::controlled_preview();
        for (name, expected, targets) in [
            ("overlay.exit-cleanup", ExitIssue::Cleanup, vec![1]),
            ("overlay.exit-unconfirmed", ExitIssue::OwnerLost, vec![]),
        ] {
            ui.set_preview_scene(&crate::preview::find(name).unwrap());
            assert!(ui.exit_open);
            assert!(ui.exit_when_stopped);
            assert_eq!(ui.exit_issue(), Some(expected));
            assert_eq!(cleanup_targets(ui.snapshot.as_deref().unwrap()), targets);
            assert!(!ui.send(QueueCommand::Stop, 100));
            assert!(!ui.send(QueueCommand::RetryCleanup(1), 100));
        }
        ui.set_preview_scene(&crate::preview::find("full.downloading").unwrap());
        assert!(!ui.exit_open);
        assert!(!ui.exit_when_stopped);
        assert_eq!(ui.exit_issue(), None);
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
        ui.complete_settings(CommandReply::Error("E_SETTINGS_SAVE".into()), 0);
        assert!(ui.background_actions_available());
        assert_eq!(ui.settings().unwrap(), old);
        ui.settings_pending = true;
        let newer = Settings { output_dir: PathBuf::from("acknowledged-folder"), ..old };
        ui.complete_settings(CommandReply::SettingsSaved(newer.clone()), 0);
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
        let newer=Settings{quality:Quality::Balanced,output_dir:PathBuf::from("new-acknowledged-folder"),theme:Default::default(),language:Default::default(), tray_icon:Default::default(), shortcut: Default::default()};
        ui.settings_pending=true;ui.complete_settings(CommandReply::SettingsSaved(newer.clone()), 0);
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
    fn cancellation_feedback_is_immediate_and_survives_reply_and_progress_refresh() {
        use super::*;
        let (mut ui, receiver) = row_ui(JobPhase::Downloading, true);
        ui.request_cancel(5, 100);
        assert!(matches!(receiver.try_recv(), Ok(QueueCommand::Cancel(5))));
        let job = &ui.snapshot.as_ref().unwrap().jobs[0];
        assert_eq!(ui.cancel_feedback(job), Some("正在发送取消…"));
        assert_eq!(ui.main_label(job, ui.snapshot.as_ref().unwrap(), 100), "正在发送取消…");
        ui.request_cancel(5, 101);
        assert!(receiver.try_recv().is_err());
        ui.complete_row_command(5, false, &CommandReply::Applied(true), 102);
        assert_eq!(ui.cancel_feedback(&ui.snapshot.as_ref().unwrap().jobs[0]), Some("正在取消…"));
        let mut model = crate::model::Model::new(0, true);
        let mut indicator = indicator::Indicator::default();
        for phase in [JobPhase::Downloading, JobPhase::Validating, JobPhase::Publishing] {
            let snapshot = Arc::make_mut(ui.snapshot.as_mut().unwrap());
            snapshot.jobs[0].phase = phase;
            snapshot.jobs[0].cancellation_requested = true;
            ui.present(&mut model, &mut indicator, 103);
            let snapshot = ui.snapshot.as_ref().unwrap();
            assert_eq!(ui.selected_fraction, None);
            assert_eq!(ui.main_label(&snapshot.jobs[0], snapshot, 103), "正在取消…");
            assert_eq!(queue_row_status(&snapshot.jobs[0], snapshot, Some(0.8), 103), "正在取消…");
            assert!(!ui.cancel_allowed(5));
        }
    }
    #[test]
    fn cancellation_rejection_restores_actions_and_held_keeps_cleanup_available() {
        use super::*;
        let (mut ui, receiver) = row_ui(JobPhase::Downloading, true);
        ui.request_cancel(5, 100);
        receiver.try_recv().unwrap();
        ui.complete_row_command(5, false, &CommandReply::Applied(false), 101);
        assert!(ui.cancel_allowed(5));
        assert_eq!(ui.row_notice(5, 101), Some("取消未受理，请重试"));
        let snapshot = ui.snapshot.as_ref().unwrap();
        assert_eq!(ui.main_label(&snapshot.jobs[0], snapshot, 101), "取消未受理，请重试");
        drop(receiver);
        ui.request_cancel(5, 102);
        assert!(ui.cancel_allowed(5), "a disconnected channel must not strand a pending state");
        let snapshot = Arc::make_mut(ui.snapshot.as_mut().unwrap());
        snapshot.jobs[0].phase = JobPhase::Held;
        snapshot.jobs[0].cancellation_requested = true;
        assert_eq!(ui.cancel_feedback(&ui.snapshot.as_ref().unwrap().jobs[0]), Some("清理待确认"));
        assert!(!ui.row_action_allowed(5, QueueIcon::Cancel, 103));
        assert!(ui.row_action_allowed(5, QueueIcon::Cleanup, 103));
        let snapshot = Arc::make_mut(ui.snapshot.as_mut().unwrap());
        snapshot.jobs[0].phase = JobPhase::Cancelled;
        assert_eq!(phase_label(&snapshot.jobs[0]), "已取消");
        let job = snapshot.jobs[0].clone();
        assert_eq!(ui.cancel_feedback(&job), None);
    }
    #[test]
    fn authoritative_cancel_refusal_blocks_stale_download_snapshot_only_for_its_attempt() {
        use super::*;
        for (outcome, expected) in [
            (CancelOutcome::AlreadyCommitted, "文件已保存，无法取消"),
            (CancelOutcome::OwnerUnavailable, "执行异常，清理未确认"),
            (CancelOutcome::Terminal, "任务已结束"),
        ] {
            let (mut ui, receiver) = row_ui(JobPhase::Downloading, true);
            let attempt = ui.snapshot.as_ref().unwrap().jobs[0].attempt;
            ui.request_cancel(5, 100);
            receiver.try_recv().unwrap();
            ui.complete_cancel(5, Some(attempt), outcome, 101);
            assert_eq!(ui.row_notice(5, 101), Some(expected));
            assert!(!ui.cancel_allowed(5), "the reply carries facts absent from a stale queue snapshot");
            let snapshot = ui.snapshot.as_ref().unwrap();
            assert_eq!(ui.main_label(&snapshot.jobs[0], snapshot, 101), expected);
            Arc::make_mut(ui.snapshot.as_mut().unwrap()).jobs[0].attempt += 1;
            assert!(ui.cancel_allowed(5), "an old refusal cannot disable a new attempt");
            ui.request_cancel(5, 102);
            receiver.try_recv().unwrap();
            ui.complete_cancel(5, Some(attempt), CancelOutcome::OwnerUnavailable, 103);
            assert_eq!(ui.cancel_feedback(&ui.snapshot.as_ref().unwrap().jobs[0]), Some("正在发送取消…"),
                "a late previous-attempt reply cannot replace current feedback");
        }
    }
    #[test]
    fn cancel_receipt_bridges_newer_authority_and_clears_finished_attempt_feedback() {
        use super::*;
        let (mut ui, receiver) = row_ui(JobPhase::Downloading, true);
        Arc::make_mut(ui.snapshot.as_mut().unwrap()).jobs[0].attempt = 0;
        ui.request_cancel(5, 100);
        receiver.try_recv().unwrap();
        ui.complete_cancel(5, Some(1), CancelOutcome::AlreadyCommitted, 101);
        let mut model = crate::model::Model::new(0, true);
        let mut indicator = indicator::Indicator::default();
        ui.present(&mut model, &mut indicator, 102);
        assert!(!ui.cancel_allowed(5), "a newer authoritative refusal survives an older projection");
        assert!(!ui.cancel_pending.contains_key(&5));
        Arc::make_mut(ui.snapshot.as_mut().unwrap()).jobs[0].attempt = 1;
        ui.present(&mut model, &mut indicator, 103);
        assert!(!ui.cancel_allowed(5));
        Arc::make_mut(ui.snapshot.as_mut().unwrap()).jobs[0].attempt = 2;
        ui.present(&mut model, &mut indicator, 104);
        assert!(ui.cancel_allowed(5));
        ui.request_cancel(5, 105);
        receiver.try_recv().unwrap();
        Arc::make_mut(ui.snapshot.as_mut().unwrap()).jobs[0].attempt = 3;
        ui.complete_cancel(5, Some(2), CancelOutcome::Accepted, 106);
        assert!(ui.cancel_allowed(5), "an old reply retires its own pending feedback");
        assert!(!ui.cancel_pending.contains_key(&5));
    }
    #[test]
    fn queue_returns_to_full_after_last_visible_row_is_cleared() {
        use super::*;
        let (mut ui, _) = row_ui(JobPhase::Failure, false);
        assert!(ui.queue_available(100));
        assert!(!ui.dismiss_empty_queue(100));
        ui.presentation.clear(5);
        assert!(ui.dismiss_empty_queue(101));
        assert!(!ui.queue_open);
        assert!(!ui.queue_available(101));
        assert_eq!(ui.snapshot.as_ref().unwrap().jobs.len(), 1);
        let (mut ui, _) = row_ui(JobPhase::Queued, false);
        assert!(!ui.dismiss_empty_queue(100));
        assert!(ui.queue_open);
        Arc::make_mut(ui.snapshot.as_mut().unwrap()).jobs.clear();
        assert!(ui.dismiss_empty_queue(101));
        assert!(!ui.queue_open);
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
    fn gallery_copy_feedback_is_local_and_repeatable_without_backend_commands() {
        use super::*;
        let mut ui = DownloadUi::controlled_preview();
        let (commands, receive) = mpsc::sync_channel(8);
        ui.commands = commands;
        ui.set_preview_scene(&crate::preview::find("queue.failure").unwrap());
        ui.activate_row_action(5, QueueIcon::Copy, 100);
        assert!(ui.row_copied(5, 100));
        ui.activate_row_action(5, QueueIcon::Copy, 1900);
        assert!(ui.row_copied(5, 2100), "a repeated copy renews the visible feedback");
        assert!(!ui.row_copied(5, 3900));
        ui.copy_preparation_diagnostic(4000);
        assert_eq!(ui.preparation_status_at(4000), Some(("已复制组件诊断".into(), false)));
        assert_eq!(ui.preparation_status_at(6000), None);
        assert!(receive.try_recv().is_err(), "Gallery must not reach the backend or clipboard");
        assert!(!ui.complete_diagnostic(0, Err("clipboard busy".into()), 6100));
        assert_eq!(ui.preparation_copied_at, None, "failure cannot leave an earlier success icon");
    }
    #[test]
    fn copy_acknowledges_real_result_and_clear_only_changes_session_presentation() {
        use super::*;
        let (mut ui, receiver) = row_ui(JobPhase::Failure, false);
        ui.activate_row_action(5, QueueIcon::Copy, 100);
        assert!(matches!(receiver.try_recv(), Ok(QueueCommand::CopyDiagnostic(5))));
        assert_eq!(ui.row_notice(5, 100), None);
        assert!(!ui.row_copied(5, 100));
        assert!(!ui.complete_diagnostic(5, Err("OS clipboard busy".into()), 101));
        assert_eq!(ui.row_notice(5, 101), Some("复制失败，请重试"));
        assert!(!ui.row_copied(5, 101));
        assert!(ui.complete_diagnostic(5, Ok(()), 102));
        assert_eq!(ui.row_notice(5, 102), Some("诊断已复制"));
        assert!(ui.row_copied(5, 102));
        assert!(!ui.row_copied(5, 102 + crate::ui_motion::COPY_FEEDBACK_MS));
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
            QueueCommand::SaveSettings(Settings { quality: Quality::Balanced, output_dir: PathBuf::new(), theme: Default::default(), language: Default::default(), tray_icon: Default::default(), shortcut: Default::default() }),
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
        model.tick(3000);
        assert_eq!(model.stage, Stage::Success);
        ui.present(&mut model, &mut indicator, 3090);
        model.tick(3090);
        assert!(model.success_alpha(3090) < 1.);
        ui.present(&mut model, &mut indicator, 3180);
        assert_eq!(model.stage, Stage::Idle);
    }
    #[test]
    fn fresh_task_preempts_success_fade_at_the_existing_foreground_handoff() {
        use super::*;
        let mut ui = DownloadUi::controlled_preview();
        let mut model = crate::model::Model::new(0, false);
        let mut indicator = indicator::Indicator::default();
        let mut s = crate::queue_fixture::snapshot(vec![crate::queue_fixture::job(3, JobPhase::Downloading, Some(3), Some(0.6))]);
        ui.snapshot = Some(Arc::new(s.clone()));
        ui.present(&mut model, &mut indicator, 0);
        s.jobs[0].phase = JobPhase::Success;
        ui.snapshot = Some(Arc::new(s.clone()));
        ui.present(&mut model, &mut indicator, 100);
        ui.present(&mut model, &mut indicator, 1600); model.tick(1600);
        assert_eq!(model.stage, Stage::Success);
        s.jobs.push(crate::queue_fixture::job(4, JobPhase::Downloading, Some(4), Some(0.2)));
        ui.snapshot = Some(Arc::new(s));
        ui.present(&mut model, &mut indicator, 1650); model.tick(1780);
        assert_eq!(ui.selected_job, Some(4));
        assert_eq!(model.stage, Stage::Downloading);
        assert_eq!(model.success_alpha(1780), 1.);
    }
    use super::badge_counts;
    use super::{ExitAction, ExitIntent, ExitIssue, cleanup_targets, exit_issue};
    use ameow_next::download::{
        queue::{JobPhase, JobSnapshot, QueueSnapshot},
        request::{Accepted, DownloadIntent, Quality},
        settings::Settings,
    };
    use core::prelude::v1::test;
    fn exit_snapshot() -> QueueSnapshot {
        QueueSnapshot {
            browser_sessions: Default::default(),
            revision: 1,
            jobs: Vec::new(),
            settings: Settings {
                quality: Quality::Balanced,
                output_dir: std::env::temp_dir(),
                theme: Default::default(), language: Default::default(), tray_icon: Default::default(), shortcut: Default::default(),
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
        assert!(!ui.request_downloader_check(ameow_next::download::contract::Downloader::YtDlp, true));
        assert!(ui.upstream.snapshot().checked_at_ms.is_none());
        assert!(!ui.preparation_retry_available());
    }
    #[test]
    fn component_status_is_transient_on_success_and_persistent_on_failure() {
        use ameow_next::download::preparation::PreparationPhase;
        let mut snapshot = exit_snapshot();
        assert!(!super::preparation_visible(&snapshot, 100));
        snapshot.preparation = crate::preview::snapshot(&crate::preview::find("full.components-downloading").unwrap()).preparation;
        assert!(super::preparation_visible(&snapshot, 100));
        // Component preparation never contributes to media counts.
        assert_eq!(badge_counts(snapshot.unfinished, snapshot.failures), None);
        snapshot.preparation.phase = PreparationPhase::Ready;
        snapshot.preparation.stage = PreparationStage::Publish;
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
    fn cached_startup_checks_and_success_stay_quiet_despite_earlier_downloads() {
        let mut snapshot = crate::preview::snapshot(&crate::preview::find("full.components-checking").unwrap());
        assert!(!snapshot.preparation.history.is_empty());
        for (phase, stage) in [
            (PreparationPhase::Preparing, PreparationStage::Cache),
            (PreparationPhase::Verifying, PreparationStage::Probe),
            (PreparationPhase::Ready, PreparationStage::Publish),
        ] {
            snapshot.preparation.phase = phase;
            snapshot.preparation.stage = stage;
            snapshot.preparation.updated_at_ms = 100;
            assert!(!super::preparation_visible(&snapshot, 100));
            assert!(!super::preparation_popup_visible(&snapshot, 100, true));
        }
        snapshot.preparation.phase = PreparationPhase::Verifying;
        snapshot.preparation.stage = PreparationStage::Probe;
        snapshot.preparation_held = true;
        assert!(super::preparation_visible(&snapshot, 100));
        snapshot.preparation_held = false;
        snapshot.preparation_owner_lost = true;
        assert!(super::preparation_visible(&snapshot, 100));
        snapshot.preparation_owner_lost = false;
        snapshot.preparation.phase = PreparationPhase::Failed;
        assert!(super::preparation_visible(&snapshot, 100));
    }
    #[test]
    fn actual_setup_remains_visible_through_local_probes_and_repair() {
        let mut snapshot = crate::preview::snapshot(&crate::preview::find("full.components-downloading").unwrap());
        snapshot.preparation.phase = PreparationPhase::Verifying;
        snapshot.preparation.stage = PreparationStage::Probe;
        assert!(super::preparation_visible(&snapshot, 100));
        snapshot.preparation.history.clear();
        assert!(!super::preparation_visible(&snapshot, 100));
        snapshot.preparation.stage = PreparationStage::Extract;
        assert!(super::preparation_visible(&snapshot, 100));
        let mut event = crate::preview::snapshot(&crate::preview::find("full.components-downloading").unwrap())
            .preparation.history.remove(0);
        event.stage = PreparationStage::Cache;
        event.phase = PreparationPhase::Preparing;
        event.category = Some(ErrorCategory::Hash);
        snapshot.preparation.stage = PreparationStage::Probe;
        snapshot.preparation.history.push(event);
        assert!(super::preparation_visible(&snapshot, 100));
    }
    #[test]
    fn update_popup_only_includes_components_that_need_attention() {
        use super::preparation_popup_visible;
        use ameow_next::download::preparation::PreparationPhase;
        let mut snapshot = exit_snapshot();
        assert!(!preparation_popup_visible(&snapshot, 100, true));
        snapshot.preparation = crate::preview::snapshot(&crate::preview::find("full.components-downloading").unwrap()).preparation;
        for phase in [PreparationPhase::Preparing, PreparationPhase::Downloading,
            PreparationPhase::Verifying, PreparationPhase::Failed] {
            snapshot.preparation.phase = phase;
            assert!(preparation_popup_visible(&snapshot, 100, true));
        }
        snapshot.preparation.phase = PreparationPhase::Ready;
        snapshot.preparation.stage = PreparationStage::Publish;
        snapshot.preparation.updated_at_ms = 100;
        assert!(preparation_popup_visible(&snapshot, 100, false));
        assert!(!preparation_popup_visible(&snapshot, 1900, false));
        assert!(!preparation_popup_visible(&snapshot, 100, true));
        snapshot.preparation_held = true;
        assert!(preparation_popup_visible(&snapshot, 100, true));
        snapshot.preparation_held = false;
        snapshot.preparation_owner_lost = true;
        assert!(preparation_popup_visible(&snapshot, 100, true));
        snapshot.stopping = true;
        assert!(!preparation_popup_visible(&snapshot, 100, true));
    }
    #[test]
    fn hiding_app_updates_keeps_component_faults_and_recovery_visible() {
        let mut update = crate::app_update_ui::preview_view("app-ready");
        update.preferences.notify_updates = false;
        assert!(!update.full_attention());
        for state in ["app-conflict", "app-preparing"] {
            let scene = crate::preview::find(&format!("full.{state}")).unwrap();
            let snapshot = crate::preview::snapshot(&scene);
            assert!(super::preparation_visible(&snapshot, 100));
            assert!(super::preparation_popup_visible(&snapshot, 100, update.full_attention()));
        }
    }
    #[test]
    fn preparation_popup_uses_plain_causes_for_each_component_and_http_failure() {
        use super::*;
        use ameow_next::download::preparation::{PreparationFailure, RuntimeComponent};
        use crate::ui_text::Language;
        let mut snapshot = exit_snapshot();
        snapshot.preparation.phase = PreparationPhase::Failed;
        snapshot.preparation.failure = Some(PreparationFailure {
            component: RuntimeComponent::Ffmpeg, stage: PreparationStage::Acquire,
            category: ErrorCategory::Http, http_status: Some(404), operation: None, raw_os_error: None,
            message: "raw HTTP 404 backend detail".into(), suggestion: "raw suggestion".into(),
        });
        for (component, label) in [(RuntimeComponent::Ffmpeg, "FFmpeg"),
            (RuntimeComponent::YtDlp, "yt-dlp"), (RuntimeComponent::GalleryDl, "gallery-dl"), (RuntimeComponent::Deno, "Deno")] {
            snapshot.preparation.failure.as_mut().unwrap().component = component;
            assert_eq!(preparation_popup_copy(&snapshot, Language::Chinese),
                (format!("{label} 准备失败"), Some("未找到组件下载文件。")));
        }
        for language in [Language::Chinese, Language::English] {
            for status in [None, Some(403), Some(404), Some(429), Some(500)] {
                snapshot.preparation.failure.as_mut().unwrap().http_status = status;
                let (_, message) = preparation_popup_copy(&snapshot, language);
                let message = message.unwrap();
                assert!(!message.contains("HTTP") && !message.contains("raw"));
                assert!(!message.chars().any(|c| c.is_ascii_digit()));
                assert_eq!(message == language.text("未找到组件下载文件。",
                    "The component download file was not found."), status == Some(404));
            }
        }
    }
    #[test]
    fn preparation_popup_prioritizes_cleanup_and_does_not_claim_ready_early() {
        use super::*;
        use crate::ui_text::Language;
        let mut snapshot = exit_snapshot();
        snapshot.preparation.phase = PreparationPhase::Failed;
        snapshot.preparation_held = true;
        assert_eq!(preparation_popup_copy(&snapshot, Language::Chinese),
            ("正在清理组件".into(), Some("清理完成前暂时无法重试。")));
        snapshot.preparation_owner_lost = true;
        assert_eq!(preparation_popup_copy(&snapshot, Language::Chinese),
            ("组件暂时不可用".into(), Some("组件未能正常停止，暂时无法重试。")));
        snapshot.preparation_held = false;
        snapshot.preparation_owner_lost = false;
        snapshot.preparation.phase = PreparationPhase::Verifying;
        snapshot.preparation.stage = PreparationStage::Publish;
        assert!(preparation_popup_copy(&snapshot, Language::Chinese).0.contains("即将就绪"));
        snapshot.preparation.phase = PreparationPhase::Ready;
        assert_eq!(preparation_popup_copy(&snapshot, Language::Chinese), ("组件已就绪".into(), None));
        for language in [Language::Chinese, Language::English] {
            for category in [ErrorCategory::Timeout, ErrorCategory::Connect, ErrorCategory::ProxyRouting,
                ErrorCategory::Http, ErrorCategory::Size, ErrorCategory::Hash, ErrorCategory::Extract,
                ErrorCategory::Permission, ErrorCategory::Probe, ErrorCategory::Storage,
                ErrorCategory::Cancelled, ErrorCategory::Unknown] {
                assert!(!preparation_failure_copy(category, None, language).is_empty());
            }
        }
    }
    #[test]
    fn queue_summary_only_reports_nonzero_work() {
        use crate::ui_text::Language;
        assert!(super::queue_activity_summary(0, 0, Language::Chinese).is_empty());
        assert_eq!(super::queue_activity_summary(3, 1, Language::Chinese), "进行中 3 · 等待 1");
        assert_eq!(super::queue_activity_summary(0, 2, Language::Chinese), "等待 2");
        assert_eq!(super::queue_activity_summary(1, 0, Language::English), "Active 1");
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
    fn early_close_requests_safe_stop_for_work_and_uncertain_owners() {
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
            assert_eq!(exit.resolve(Some(&snapshot), false), Some(ExitAction::Stop));
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
    fn clip_progress_uses_media_multiplier_and_obeys_cancel_and_freshness() {
        use super::*;
        use ameow_next::download::progress::{TransferPhase, TransferProgress};
        use crate::ui_text::Language;
        let mut job = crate::queue_fixture::job(1, JobPhase::Downloading, Some(1), None);
        job.transfer_progress = Some(TransferProgress {
            phase: TransferPhase::Clip, fraction: Some(0.5), media_speed: Some(0.713),
            observed_at_ms: 100, ..Default::default()
        });
        let sample = job.transfer_progress.as_ref();
        assert_eq!(presentation_fraction(sample, 100), Some(0.5));
        assert_eq!(transfer_label(sample, 100), "处理速度 0.7×");
        assert_eq!(queue_progress_label(&job, presentation_fraction(sample, 100), 100), "50% 0.7×");
        assert_eq!(local_text(Language::English, &transfer_label(sample, 100)), "Processing 0.7×");
        assert_eq!(local_text(Language::English, &transfer_label(sample, 2100)), "Clipping");
        assert_eq!(queue_progress_label(&job, presentation_fraction(sample, 2100), 2100), "切片中");
        job.cancellation_requested = true;
        assert_eq!(queue_progress_label(&job, Some(0.5), 100), "正在取消…");
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
            theme: Default::default(), language: Default::default(), tray_icon: Default::default(), shortcut: Default::default(),
        };
        let mut snapshot = QueueSnapshot {
            browser_sessions: Default::default(),
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
        assert_eq!(exit_issue(&snapshot), Some(ExitIssue::OwnerLost));
        let message = ExitIssue::OwnerLost.message(crate::ui_text::Language::Chinese);
        assert!(message.contains("清理未确认"));
        assert!(!message.contains("保留资源"));
        assert!(!message.contains("重试"));
        snapshot.jobs.push(JobSnapshot {
            inspect_only: false, inspection: None,
            job_id: 7,
            cancellation_requested: false,
            revision: 1,
            attempt: 1,
            phase: JobPhase::Held,
            accepted: Accepted::new(DownloadIntent { clip: None,
                url: "https://youtu.be/00000000007".into(),
                quality: Quality::Balanced,
                output_dir: root.path().into(),
            })
            .unwrap(),
            identity: None,
            engine: None,
            title: String::new(),
            message: String::new(),
            failure: None,
            transfer_progress: None,
            delivered: None,
            collection: None,
            gallery_progress: None,
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
        assert_eq!(exit_issue(&snapshot), Some(ExitIssue::Cleanup));
    }
}

#[cfg(test)]
mod shortcut_settings_tests {
    use super::{DownloadUi, Settings, Quality, ThemePreference, LanguagePreference, TrayIconPreference,
        QueueCommand, CommandReply, Arc, Mutex, mpsc, PathBuf};
    #[test]
    fn bridge_configuration_waits_for_its_own_reply_and_rejects_duplicates() {
        let (commands, receiver) = mpsc::sync_channel(1);
        let (evidence, _) = mpsc::sync_channel(1);
        let (_, replies) = mpsc::channel();
        let mut ui = DownloadUi::with_transport(commands, evidence, replies, Arc::new(Mutex::new(None)));
        ui.bridge_config_result = Some(Ok(())); // A previous configuration cannot finish this request.
        assert!(ui.send(QueueCommand::InstallBrowserBridge, 1));
        assert!(ui.bridge_config_pending);
        assert!(ui.bridge_config_result.is_none());
        assert!(!ui.send(QueueCommand::InstallBrowserBridge, 2));
        assert!(matches!(receiver.try_recv().unwrap(), QueueCommand::InstallBrowserBridge));
        assert!(receiver.try_recv().is_err());
        ui.fail_startup("E_SESSION_STORAGE".into());
        assert!(!ui.bridge_config_pending);
        assert_eq!(ui.bridge_config_result, Some(Err("E_SESSION_STORAGE".into())));
        drop(receiver);
        assert!(!ui.send(QueueCommand::InstallBrowserBridge, 3));
        assert!(!ui.bridge_config_pending);
    }
    #[test]
    fn shortcut_settings_publish_only_after_ack_and_preserve_other_preferences() {
        let (commands, receiver) = mpsc::sync_channel(2);
        let (evidence, _) = mpsc::sync_channel(1);
        let (_, replies) = mpsc::channel();
        let mut ui = DownloadUi::with_transport(commands, evidence, replies, Arc::new(Mutex::new(None)));
        let old = Settings { quality: Quality::Saver, output_dir: PathBuf::from("owned-output"),
            theme: ThemePreference::Dark, language: LanguagePreference::English,
            tray_icon: TrayIconPreference::Apricot, shortcut: Default::default() };
        ui.acknowledged_settings = Some(old.clone());
        let preference = ameow_next::shortcut::ShortcutPreference { chord: Some(ameow_next::shortcut::ShortcutChord {
            platform: ameow_next::shortcut::ShortcutPlatform::Windows, key: "f9".into(), key_code: 0x78,
            control: true, alt: true, shift: true, command: false }) };
        assert!(ui.request_shortcut(preference.clone(), 1));
        assert!(!ui.request_shortcut(Default::default(), 2));
        let QueueCommand::SaveSettings(requested) = receiver.try_recv().unwrap() else { panic!("save command") };
        assert_eq!(ui.settings(), Some(old.clone()));
        assert_eq!(requested, Settings { shortcut: preference.clone(), ..old.clone() });
        ui.complete_settings(CommandReply::Error("owned write failure".into()), 3);
        assert_eq!(ui.settings(), Some(old.clone()));
        assert!(ui.shortcut_save_failed());
        assert!(ui.request_shortcut(preference, 4));
        let QueueCommand::SaveSettings(requested) = receiver.try_recv().unwrap() else { panic!("save command") };
        ui.complete_settings(CommandReply::SettingsSaved(requested.clone()), 5);
        assert!(!ui.shortcut_save_failed());
        assert_eq!(ui.settings(), Some(requested.clone()));
        assert!(!ui.settings_pending);
        let clear = ameow_next::shortcut::ShortcutPreference { chord: None };
        assert!(ui.request_shortcut(clear.clone(), 6));
        let _ = receiver.try_recv().unwrap();
        ui.complete_settings(CommandReply::Error("owned clear failure".into()), 7);
        assert!(ui.shortcut_save_failed());
        assert_eq!(ui.settings(), Some(requested));
        assert!(ui.request_shortcut(clear, 8));
        let QueueCommand::SaveSettings(cleared) = receiver.try_recv().unwrap() else { panic!("clear command") };
        ui.complete_settings(CommandReply::SettingsSaved(cleared), 9);
        assert!(ui.settings().unwrap().shortcut.chord.is_none());
    }
    #[test]
    fn shortcut_failure_source_survives_editing_and_does_not_hide_other_settings_failures() {
        let (commands, receiver) = mpsc::sync_channel(2);
        let (evidence, _) = mpsc::sync_channel(1);
        let (_, replies) = mpsc::channel();
        let mut ui = DownloadUi::with_transport(commands, evidence, replies, Arc::new(Mutex::new(None)));
        ui.acknowledged_settings = Some(Settings { quality: Quality::Saver, output_dir: PathBuf::from("owned-output"),
            theme: Default::default(), language: Default::default(), tray_icon: Default::default(), shortcut: Default::default() });
        assert!(ui.request_shortcut(ameow_next::shortcut::ShortcutPreference { chord: None }, 1));
        let _ = receiver.try_recv().unwrap();
        ui.complete_settings(CommandReply::Error("owned shortcut failure".into()), 2);
        assert!(ui.shortcut_save_failed());
        let mut registration = crate::global_shortcut::Controller::default();
        registration.error = Some("save".into());
        registration.suspend(); registration.resume(); // Editing may clear registration error, not save provenance.
        assert!(registration.error.is_none());
        assert!(ui.shortcut_save_failed());
        assert!(ui.request_preferences(ThemePreference::Dark, LanguagePreference::English, 3));
        let _ = receiver.try_recv().unwrap();
        ui.complete_settings(CommandReply::Error("owned other settings failure".into()), 4);
        assert!(matches!(ui.settings_status, super::SettingsStatus::Failed(_)));
        assert!(!ui.shortcut_save_failed());
        drop(receiver);
        assert!(!ui.request_shortcut(ameow_next::shortcut::ShortcutPreference { chord: None }, 5));
        assert!(ui.shortcut_save_failed());
        assert!(!ui.request_preferences(ThemePreference::Dark, LanguagePreference::English, 6));
        assert!(!ui.shortcut_save_failed());
    }
}
