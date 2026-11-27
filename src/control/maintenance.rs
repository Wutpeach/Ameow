//! CLI maintenance calls the desktop's existing settings, update and queue owners.
use super::{ControlError, lifecycle::Lifecycle};
use crate::{
    app_update::service::{Action, Handle},
    download::{
        contract::Downloader,
        queue::DownloadCoordinator,
        runtime_update::RuntimeUpdatePhase,
        upstream::{Installability, UpstreamChecker, compare_versions},
    },
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    cell::RefCell,
    path::{Path, PathBuf},
};

pub(super) struct Maintenance {
    pub lifecycle: Lifecycle,
    pub exit_ready: bool,
    updates: Option<Handle>,
    upstream: Option<UpstreamChecker>,
    isolated: bool,
    component_operation: Option<ComponentOperation>,
    root: PathBuf,
    install_receipt: Option<InstallReceipt>,
    instance_id: Option<String>,
    native_preferences: Option<super::native_preferences::Handle>,
}
#[derive(Clone, Serialize, Deserialize)]
pub(super) struct InstallReceipt {
    pub instance_id: String,
    pub operation: Value,
}
fn install_path(root: &Path, id: &str) -> Result<PathBuf, ControlError> {
    if id.len() != 32 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(ControlError::new(
            "E_INVALID_ARGUMENT",
            "operation ID must be 32 hexadecimal characters",
        ));
    }
    Ok(root.join("app-install-receipt.json"))
}
pub(super) fn read_install(root: &Path, id: &str) -> Result<InstallReceipt, ControlError> {
    let bytes = std::fs::read(install_path(root, id)?).map_err(|_| {
        ControlError::new(
            "E_OPERATION_NOT_FOUND",
            "No retained installation operation",
        )
    })?;
    if bytes.len() > 4096 {
        return Err(ControlError::new(
            "E_PROTOCOL",
            "Installation receipt exceeds limit",
        ));
    }
    let receipt: InstallReceipt = serde_json::from_slice(&bytes)
        .map_err(|_| ControlError::new("E_PROTOCOL", "Invalid installation receipt"))?;
    if receipt.operation["id"] != id {
        return Err(ControlError::new(
            "E_OPERATION_CHANGED",
            "A newer installation replaced this receipt",
        ));
    }
    if receipt.operation["action"] != "install"
        || receipt.instance_id.len() != 32
        || !receipt.instance_id.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err(ControlError::new(
            "E_PROTOCOL",
            "Installation receipt identity mismatch",
        ));
    }
    Ok(receipt)
}
pub(super) fn save_install(root: &Path, receipt: &InstallReceipt) -> Result<(), ControlError> {
    use std::io::Write;
    let path = install_path(root, receipt.operation["id"].as_str().unwrap_or(""))?;
    let mut file =
        tempfile::NamedTempFile::new_in(root).map_err(|error| rejected(error.to_string()))?;
    serde_json::to_writer(&mut file, receipt).map_err(|error| rejected(error.to_string()))?;
    file.flush().map_err(|error| rejected(error.to_string()))?;
    file.persist(path)
        .map_err(|error| rejected(error.to_string()))?;
    Ok(())
}
struct ComponentOperation {
    id: String,
    action: String,
    targets: Vec<Downloader>,
    rejected: Vec<(Downloader, String)>,
    requested_versions: Vec<(Downloader, Option<String>)>,
    settled: RefCell<Vec<(Downloader, Value)>>,
    operations: Vec<(Downloader, crate::download::runtime_update::ComponentOperation)>,
}
fn rejected(message: impl Into<String>) -> ControlError {
    ControlError::new("E_REQUEST_REJECTED", message)
}
fn downloader(name: &str) -> Result<Downloader, ControlError> {
    match name {
        "yt-dlp" => Ok(Downloader::YtDlp),
        "gallery-dl" => Ok(Downloader::GalleryDl),
        _ => Err(ControlError::new(
            "E_INVALID_REQUEST",
            "Component must be yt-dlp or gallery-dl",
        )),
    }
}
impl Maintenance {
    pub fn new(root: &Path) -> Self {
        Self {
            lifecycle: Lifecycle::default(),
            exit_ready: false,
            updates: None,
            upstream: None,
            isolated: true,
            component_operation: None,
            root: root.into(),
            install_receipt: None,
            instance_id: None,
            native_preferences: None,
        }
    }
    pub fn attach_native_preferences(&mut self, handle: super::native_preferences::Handle) {
        self.native_preferences = Some(handle);
    }
    pub fn configure_identity(&mut self, instance: &str) {
        self.instance_id = Some(instance.into());
        self.lifecycle
            .configure(&self.root, instance, self.isolated);
    }
    pub fn attach(&mut self, updates: Handle, upstream: UpstreamChecker, isolated: bool) {
        self.updates = Some(updates);
        self.upstream = Some(upstream);
        self.isolated = isolated;
    }
    pub fn available(&self) -> bool {
        self.updates.is_some() && self.upstream.is_some()
    }
    pub fn installed_version(&self) -> Option<String> {
        self.updates
            .as_ref()
            .and_then(Handle::accepted_install_version)
    }
    pub fn diagnostic(&self, text: String) -> String {
        let Some(upstream) = &self.upstream else { return text; };
        let mut lines: Vec<_> = [Downloader::YtDlp, Downloader::GalleryDl].into_iter()
            .map(|component| crate::download::runtime_update::check_diagnostic(component, &upstream.snapshot_for(component))).collect();
        lines.push(text);
        crate::download::runtime_update::bounded_diagnostic(lines.join("\n"))
    }
    pub fn lifecycle_pending(&self) -> bool {
        !self.lifecycle.snapshot(false)["action"].is_null()
    }
    pub fn poll(&mut self, queue: &DownloadCoordinator) {
        self.component_status(queue);
        self.exit_ready |= self.lifecycle.poll(queue);
    }
    pub fn settings(&self, queue: &DownloadCoordinator) -> Value {
        let mut result = json!(queue.snapshot().settings);
        if let Some(updates) = &self.updates {
            let view = updates.snapshot();
            result["app_update"] = if updates.preferences_known() {json!(view.preferences)} else {Value::Null};
            result["app_update_preferences_known"] = json!(updates.preferences_known());
            result["app_update_saving"] = json!(view.saving);
            result["app_update_save_error"] = json!(view.save_error);
            result["operation"] = json!(updates.tracked());
        }
        result["login_startup"] = if self.isolated {
            json!({"available":false,"reason":"isolated_instance"})
        } else {
            match crate::login_startup::read() {
                Ok(state) => json!({"available":true,"state":format!("{state:?}")}),
                Err(error) => json!({"available":false,"error":error}),
            }
        };
        result
    }
    pub fn set_preference(
        &mut self,
        queue: &DownloadCoordinator,
        key: &str,
        value: &Value,
    ) -> Result<Value, ControlError> {
        if self.lifecycle_pending() {
            return Err(ControlError::new(
                "E_APP_UPDATE_BUSY",
                "Desktop is stopping",
            ));
        }
        if matches!(key, "auto_update" | "notify_updates") {
            let enabled = value.as_bool().ok_or_else(|| {
                ControlError::new("E_INVALID_REQUEST", "Preference requires true or false")
            })?;
            let updates = self
                .updates
                .as_ref()
                .ok_or_else(|| rejected("Application update owner unavailable"))?;
            if !updates.preferences_known() { return Err(ControlError::new("E_STARTING", "Application update preferences are not confirmed; query settings and resolve any read error")); }
            let mut preferences = updates.snapshot().preferences;
            if key == "auto_update" {
                preferences.auto_update = enabled;
            } else {
                preferences.notify_updates = enabled;
            }
            updates
                .send_tracked(Action::Save(preferences))
                .map_err(rejected)?;
            return Ok(self.settings(queue));
        }
        if key == "login_startup" {
            if self.isolated {
                return Err(ControlError::new(
                    "E_ACCESS_DENIED",
                    "Isolated instances cannot change system startup registration",
                ));
            }
            let enabled = value.as_bool().ok_or_else(|| {
                ControlError::new("E_INVALID_REQUEST", "login_startup requires true or false")
            })?;
            crate::login_startup::set_enabled(enabled).map_err(rejected)?;
            return Ok(self.settings(queue));
        }
        if !matches!(
            key,
            "quality" | "output_dir" | "theme" | "language" | "tray_icon" | "shortcut"
        ) {
            return Err(ControlError::new(
                "E_INVALID_REQUEST",
                "Unknown preference; use settings --help",
            ));
        }
        let native = self
            .native_preferences
            .as_ref()
            .ok_or_else(|| rejected("Desktop preference owner unavailable"))?;
        if key == "shortcut" {
            let shortcut: crate::shortcut::ShortcutPreference =
                serde_json::from_value(value.clone()).map_err(|_| {
                    ControlError::new("E_INVALID_REQUEST", "Invalid shortcut preference object")
                })?;
            shortcut
                .validate()
                .map_err(|error| ControlError::new("E_INVALID_REQUEST", error))?;
            if shortcut
                .chord
                .as_ref()
                .is_some_and(|chord| chord.platform != crate::shortcut::ShortcutPlatform::current())
            {
                return Err(ControlError::new(
                    "E_INVALID_REQUEST",
                    "shortcut platform differs from the desktop",
                ));
            }
            native.prepare(shortcut).map_err(rejected)?;
        } else {
            native.begin().map_err(rejected)?;
        }
        let saved = (|| {
            let mut settings = queue.snapshot().settings;
            match key {
                "quality" => {
                    settings.quality = match value.as_str() {
                        Some("highest" | "Highest") => crate::download::request::Quality::Highest,
                        Some("balanced" | "Balanced") => {
                            crate::download::request::Quality::Balanced
                        }
                        Some("saver" | "Saver") => crate::download::request::Quality::Saver,
                        _ => {
                            return Err(ControlError::new(
                                "E_INVALID_REQUEST",
                                "quality must be highest, balanced or saver",
                            ));
                        }
                    }
                }
                "output_dir" => {
                    let path = value
                        .as_str()
                        .map(PathBuf::from)
                        .filter(|path| path.is_absolute() && path.as_os_str().len() <= 4096)
                        .ok_or_else(|| {
                            ControlError::new(
                                "E_INVALID_REQUEST",
                                "output_dir must be an absolute existing directory",
                            )
                        })?;
                    settings.output_dir = path;
                }
                "theme" => {
                    settings.theme = serde_json::from_value(value.clone()).map_err(|_| {
                        ControlError::new(
                            "E_INVALID_REQUEST",
                            "theme must be system, light or dark",
                        )
                    })?
                }
                "language" => {
                    settings.language = serde_json::from_value(value.clone()).map_err(|_| {
                        ControlError::new(
                            "E_INVALID_REQUEST",
                            "language must be system, chinese or english",
                        )
                    })?
                }
                "tray_icon" => {
                    settings.tray_icon = serde_json::from_value(value.clone()).map_err(|_| {
                        ControlError::new(
                            "E_INVALID_REQUEST",
                            "tray_icon must be follow_appearance, ameow_blue or apricot",
                        )
                    })?
                }
                "shortcut" => {
                    settings.shortcut = serde_json::from_value(value.clone()).map_err(|_| {
                        ControlError::new(
                            "E_INVALID_REQUEST",
                            "shortcut requires the existing chord object or {\"chord\":null}",
                        )
                    })?;
                    settings
                        .shortcut
                        .validate()
                        .map_err(|error| ControlError::new("E_INVALID_REQUEST", error))?;
                    if settings.shortcut.chord.as_ref().is_some_and(|chord| {
                        chord.platform != crate::shortcut::ShortcutPlatform::current()
                    }) {
                        return Err(ControlError::new(
                            "E_INVALID_REQUEST",
                            "shortcut platform differs from the desktop",
                        ));
                    }
                }
                _ => {
                    return Err(ControlError::new(
                        "E_INVALID_REQUEST",
                        "Unknown preference; use settings --help",
                    ));
                }
            }
            queue.save_settings(settings).map_err(rejected)
        })();
        native
            .complete(
                saved.is_ok(),
                saved
                    .as_ref()
                    .ok()
                    .map(|settings| (settings.clone(), queue.snapshot().revision)),
            )
            .map_err(|error| {
                ControlError::new(
                    "E_NATIVE_PREFERENCE_UNCONFIRMED",
                    format!("{error}; persistence success: {}", saved.is_ok()),
                )
            })?;
        saved?;
        let mut result = self.settings(queue);
        result["saved"] = json!(true);
        Ok(result)
    }
    pub fn components(&self, queue: &DownloadCoordinator) -> Value {
        let snapshot = queue.snapshot();
        let entries: Vec<_> = [Downloader::YtDlp, Downloader::GalleryDl].iter().map(|&component| {
            let check = self.upstream.as_ref().map(|owner| owner.snapshot_for(component));
            json!({"component":component.label(),"update":snapshot.component_update(component),
                "check":check.map(|check| json!({"pending":check.pending,"worker_running":check.worker_running,"checked_at_ms":check.checked_at_ms,"operation_generation":check.operation_generation,"result_generation":check.result_generation,"started_at_ms":check.started_at_ms,"failure":check.failure,"result":check.result,"cooldown_remaining_ms":check.cooldown_remaining_ms,"installability":check.installability,"last_success":check.last_success,"cache_error":check.cache_error,"diagnostic":crate::download::runtime_update::check_diagnostic(component,&check)}))})
        }).collect();
        json!({"preparing":snapshot.preparing,"preparation":snapshot.preparation,"held":snapshot.preparation_held,"owner_lost":snapshot.preparation_owner_lost,"verified_versions":snapshot.verified_runtime_versions,"runtime_update":snapshot.runtime_update,"components":entries,"operation":self.component_status(queue)})
    }
    fn component_status(&self, queue: &DownloadCoordinator) -> Value {
        let Some(operation) = &self.component_operation else {
            return Value::Null;
        };
        let snapshot = queue.snapshot();
        let results: Vec<_> = operation.targets.iter().map(|&component| {
            if let Some((_, result)) = operation.settled.borrow().iter().find(|(target, _)| *target == component) { return result.clone(); }
            if let Some((_, error)) = operation.rejected.iter().find(|(item,_)| *item == component) {
                return json!({"component":component.label(),"done":true,"success":false,"error":error});
            }
            let result = if operation.action == "check" {
                let check = self.upstream.as_ref().unwrap().snapshot_for(component);
                let expected = operation.operations.iter().find(|(target,_)| *target == component).map(|(_,value)| value.operation_generation);
                if expected != Some(check.operation_generation) || check.operation_generation == 0 {
                    let result = json!({"component":component.label(),"done":true,"success":false,"error":"E_OPERATION_CHANGED"});
                    operation.settled.borrow_mut().push((component,result.clone())); return result;
                }
                let finished = !check.pending && !check.worker_running;
                let matched = check.result_generation == check.operation_generation;
                let okay = finished && matched && check.result.as_ref().is_some_and(Result::is_ok);
                json!({"component":component.label(),"done":finished,"success":if finished {Some(okay)} else {None},"operation_generation":check.operation_generation,"result_generation":check.result_generation,"started_at_ms":check.started_at_ms,"failure":check.failure,"result":if matched {check.result} else {None},"error":if finished && !matched {Some("E_RESULT_UNCONFIRMED")} else {None}})
            } else {
                let state = snapshot.component_update(component);
                let expected = operation.operations.iter().find(|(target,_)| *target == component).map(|(_,value)| value.operation_generation);
                if expected != Some(state.operation_generation) || state.operation_generation == 0 || snapshot.runtime_update.downloader != component || state.phase == RuntimeUpdatePhase::Idle {
                    let result = json!({"component":component.label(),"done":true,"success":false,"error":"E_OPERATION_CHANGED"});
                    operation.settled.borrow_mut().push((component,result.clone())); return result;
                }
                let finished = matches!(state.phase, RuntimeUpdatePhase::Activated | RuntimeUpdatePhase::Failed | RuntimeUpdatePhase::RolledBack | RuntimeUpdatePhase::RecoveryRequired);
                let target = operation.requested_versions.iter().find(|(item,_)| *item == component).and_then(|(_,version)| version.as_ref());
                let matches_target = if operation.action == "restore" { state.policy == crate::download::runtime_update::RuntimeSelectionPolicy::FollowAmeow } else { target.is_some() && target == state.active_version.as_ref() };
                let okay = finished && state.phase == RuntimeUpdatePhase::Activated && matches_target;
                json!({"component":component.label(),"done":finished,"success":if finished {Some(okay)} else {None},"phase":state.phase,"operation_generation":state.operation_generation,"started_at_ms":state.started_at_ms,"target_version":target,"active_version":state.active_version,"error":state.error,"failure":state.failure})
            };
            if result["done"] == true { operation.settled.borrow_mut().push((component,result.clone())); }
            result
        }).collect();
        let done = results.iter().all(|result| result["done"] == true);
        let success = results.iter().all(|result| result["success"] == true);
        json!({"id":operation.id,"action":operation.action,"phase":if done {"completed"} else {"pending"},"done":done,"success":if done {Some(success)} else {None},"error":if done && !success {Some("E_COMPONENT_OPERATION_FAILED")} else {None},"results":results})
    }
    pub fn component_action(
        &mut self,
        queue: &DownloadCoordinator,
        action: &str,
        selected: Option<&str>,
    ) -> Result<Value, ControlError> {
        if self.lifecycle_pending() {
            return Err(ControlError::new(
                "E_APP_UPDATE_BUSY",
                "Desktop is stopping",
            ));
        }
        let upstream = self
            .upstream
            .as_ref()
            .ok_or_else(|| rejected("Component owner unavailable"))?;
        if self.component_operation.is_some() && self.component_status(queue)["done"] == false {
            return Err(ControlError::new(
                "E_BUSY",
                "Previous component operation is pending; query components",
            ));
        }
        if !matches!(action, "check" | "update" | "restore") {
            return Err(ControlError::new(
                "E_INVALID_REQUEST",
                "Unknown component action",
            ));
        }
        let targets = match selected {
            Some(name) => vec![downloader(name)?],
            None if action == "check" => vec![Downloader::YtDlp, Downloader::GalleryDl],
            _ => return Err(ControlError::new("E_INVALID_REQUEST", "Choose a component")),
        };
        let mut rejected_targets = Vec::new();
        let mut requested_versions = Vec::new();
        let mut operations = Vec::new();
        let operation_id = super::nonce()?;
        for &component in &targets {
            let result = if action == "check" {
                upstream.request_operation_for(component, true).ok_or_else(|| "E_COMPONENT_BUSY_OR_COOLDOWN".to_owned())
            } else {
                let version = if action == "restore" {
                    requested_versions.push((component, None));
                    None
                } else {
                    let check = upstream.snapshot_for(component);
                    let current = queue.snapshot().component_update(component).active_version;
                    let Some(Ok(version)) = check.result else {
                        return Err(rejected(
                            "Check this component successfully before updating",
                        ));
                    };
                    if check.pending
                        || check.worker_running
                        || check.installability != Installability::Installable
                        || current.as_ref().is_none_or(|current| {
                            compare_versions(component, &version, current)
                                != Some(std::cmp::Ordering::Greater)
                        })
                    {
                        return Err(rejected(
                            "No verified installable newer component; check components and retry",
                        ));
                    }
                    requested_versions.push((component, Some(version.clone())));
                    Some(version)
                };
                queue.request_downloader_operation(component, version)
            };
            match result { Ok(operation) => operations.push((component,operation)), Err(error) => rejected_targets.push((component,error)) }
        }
        self.component_operation = Some(ComponentOperation {
            id: operation_id,
            action: action.into(),
            targets,
            rejected: rejected_targets,
            requested_versions,
            settled: RefCell::new(Vec::new()),
            operations,
        });
        Ok(self.components(queue))
    }
    pub fn app_action(
        &mut self,
        queue: &DownloadCoordinator,
        action: &str,
        allowed: bool,
    ) -> Result<Value, ControlError> {
        if action == "status" {
            return Ok(self.app_status(queue));
        }
        if matches!(action, "quit" | "restart") {
            if self.updates.as_ref().is_some_and(|updates| {
                let view = updates.snapshot();
                view.saving
                    || updates.tracked().is_some_and(|operation| !operation.done)
                    || matches!(
                        view.update.phase,
                        crate::app_update::Phase::Checking
                            | crate::app_update::Phase::Downloading
                            | crate::app_update::Phase::Verifying
                            | crate::app_update::Phase::WaitingForTasks
                            | crate::app_update::Phase::Switching
                    )
            }) {
                return Err(ControlError::new(
                    "E_APP_UPDATE_BUSY",
                    "Wait for the current application maintenance operation first",
                ));
            }
            self.lifecycle.request(action, allowed, queue)?;
            return Ok(self.app_status(queue));
        }
        if !allowed || self.lifecycle_pending() {
            return Err(ControlError::new(
                "E_APP_UPDATE_BUSY",
                "Desktop is stopping or updating",
            ));
        }
        let updates = self
            .updates
            .as_ref()
            .ok_or_else(|| rejected("Application update owner unavailable"))?;
        let command = match action {
            "check" => Action::Check,
            "download" => Action::Download,
            "install" => Action::Restart,
            _ => {
                return Err(ControlError::new(
                    "E_INVALID_REQUEST",
                    "Unknown application action",
                ));
            }
        };
        if action == "install" {
            let id = super::nonce()?;
            let instance_id = self
                .instance_id
                .clone()
                .ok_or_else(|| rejected("Desktop identity unavailable"))?;
            let mut receipt = InstallReceipt {
                instance_id,
                operation: json!({"id":id,"action":"install","phase":"pending","done":false,"success":null,"error":null,"target_version":updates.snapshot().update.version}),
            };
            save_install(&self.root, &receipt)?;
            match updates.send_tracked(command) {
                Ok(tracked_id) => receipt.operation["tracked_id"] = json!(tracked_id),
                Err(error) => {
                    receipt.operation["done"] = json!(true);
                    receipt.operation["success"] = json!(false);
                    receipt.operation["error"] = json!(error);
                    receipt.operation["phase"] = json!("failed");
                    save_install(&self.root, &receipt)?;
                    return Err(rejected(error));
                }
            }
            self.install_receipt = Some(receipt.clone());
            save_install(&self.root,&receipt).map_err(|error| ControlError::new("E_OPERATION_UNCONFIRMED", format!("Installation was requested; operation {id} receipt could not be saved: {error}")))?;
        } else {
            updates.send_tracked(command).map_err(rejected)?;
        }
        Ok(self.app_status(queue))
    }
    fn app_status(&self, queue: &DownloadCoordinator) -> Value {
        let mut result = self.updates.as_ref().map_or_else(
            || json!({"available":false}),
            |updates| json!(updates.snapshot()),
        );
        result["operation"] = if self.lifecycle_pending() {
            self.lifecycle.snapshot(queue.snapshot().stopped)
        } else {
            self.updates
                .as_ref()
                .map_or(Value::Null, |updates| json!(updates.tracked()))
        };
        if let Some(receipt) = &self.install_receipt {
            if result["operation"]["action"] == "install"
                && result["operation"]["id"] == receipt.operation["tracked_id"]
            {
                result["operation"]["tracked_id"] = result["operation"]["id"].clone();
                result["operation"]["id"] = receipt.operation["id"].clone();
                let updated = InstallReceipt {
                    instance_id: receipt.instance_id.clone(),
                    operation: result["operation"].clone(),
                };
                if let Err(error) = save_install(&self.root, &updated) {
                    result["receipt_error"] = json!(error);
                }
            }
        }
        result["queue_stopped"] = json!(queue.snapshot().stopped);
        result
    }
}
