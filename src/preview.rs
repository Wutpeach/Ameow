//! Opt-in presentation fixtures. This module never constructs a production service.
use ameow_next::download::{queue::{JobPhase, QueueSnapshot}, progress::TransferPhase};
use serde::{Deserialize, Serialize};
use std::{fs, io::Read, path::PathBuf, os::windows::fs::OpenOptionsExt};

pub const CATALOG: &str = include_str!("../scripts/preview-scenes.json");
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Scene { pub name: String, pub surface: String, pub state: String, pub description: String }
pub fn scenes() -> Vec<Scene> { serde_json::from_str(CATALOG).expect("embedded preview catalog") }
pub fn find(name: &str) -> Result<Scene, String> {
    scenes().into_iter().find(|s| s.name == name).ok_or_else(|| format!("未知预览场景：{name}"))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request { step: u64, scene: Option<String>, night: Option<bool>, #[serde(default)] quit: bool }
pub enum Change { Scene(Scene), Quit }
pub struct Session {
    control: Option<PathBuf>, scene: Scene, step: Option<u64>, initial: bool, night: Option<bool>,
}
impl Session {
    pub fn new(control: Option<PathBuf>, name: &str) -> Result<Self, String> {
        Ok(Self { control, scene: find(name)?, step: None, initial: true, night: None })
    }
    pub fn scene(&self) -> &Scene { &self.scene }
    pub fn poll(&mut self) -> Option<Change> {
        if self.initial { self.initial = false; return Some(Change::Scene(self.scene.clone())); }
        let path = self.control.as_ref()?;
        let mut bytes = Vec::new();
        // The launcher atomically replaces this file while the UI polls it.
        fs::OpenOptions::new().read(true).share_mode(7).open(path).ok()?.take(8193).read_to_end(&mut bytes).ok()?;
        if bytes.len() > 8192 { self.ack(Some("预览请求超过 8192 字节")); return None; }
        // The launcher replaces complete requests atomically; tolerate an interrupted writer.
        let request: Request = match serde_json::from_slice(&bytes) {
            Ok(request) => request,
            Err(_) => { self.ack(Some("无法读取预览请求，请检查 JSON 格式")); return None; }
        };
        if self.step.is_some_and(|step| request.step <= step) { return None; }
        self.step = Some(request.step);
        if request.quit { return Some(Change::Quit); }
        match request.scene.as_deref().map(find) {
            Some(Ok(scene)) => { self.scene = scene.clone(); self.night = request.night; Some(Change::Scene(scene)) }
            Some(Err(error)) => { self.ack(Some(&error)); None }
            None => { self.ack(Some("预览请求缺少 scene")); None }
        }
    }
    pub fn ack(&self, error: Option<&str>) {
        if let Some(path) = &self.control {
            let value = serde_json::json!({"step":self.step,"scene":self.scene.name,"night":self.night,"pid":std::process::id(),"error":error,"catalog":serde_json::from_str::<serde_json::Value>(CATALOG).unwrap(),"version":env!("CARGO_PKG_VERSION")});
            if let Err(error) = fs::write(path.with_extension("ack.json"), value.to_string()) { eprintln!("无法写入预览回执：{error}"); }
        }
    }
}

pub fn snapshot(scene: &Scene) -> QueueSnapshot {
    use crate::queue_fixture::{job, snapshot, fifo};
    let mut s = match scene.state.as_str() {
        "resolving" => snapshot(vec![job(1, JobPhase::Resolving, Some(1), None)]),
        "downloading" | "long-title" => snapshot(vec![job(1, JobPhase::Downloading, Some(1), Some(0.46))]),
        "gallery" | "gallery-unknown" => {
            let mut j = job(1, JobPhase::Downloading, Some(1), None);
            j.gallery_progress = Some((4, (scene.state == "gallery").then_some(5)));
            snapshot(vec![j])
        }
        "unknown" | "audio" | "merging" => {
            let mut j = job(1, JobPhase::Downloading, Some(1), None);
            let p = j.transfer_progress.as_mut().unwrap();
            if scene.state == "audio" { p.phase = TransferPhase::Audio; }
            p.merging = scene.state == "merging";
            snapshot(vec![j])
        }
        "success" => snapshot(vec![job(1, JobPhase::Success, Some(1), None)]),
        "partial" | "partial-retry-pending" => snapshot(vec![crate::queue_fixture::partial(Some(5))]),
        "partial-unknown" => snapshot(vec![crate::queue_fixture::partial(None)]),
        "failure" | "copy-failed" | "copied" | "retry-pending" | "retry-refused" => snapshot(vec![job(5, JobPhase::Failure, Some(5), None)]),
        "fallback" => {
            let mut j = job(1, JobPhase::Resolving, Some(1), None);
            j.title = "正在获取作品".into();
            j.message = "Trying alternate downloader".into();
            snapshot(vec![j])
        }
        "unsupported-object" => {
            let mut j = job(5, JobPhase::Failure, Some(5), None);
            j.title = "此链接暂不支持完整提取".into();
            let failure = ameow_next::download::diagnostics::Failure::new(
                ameow_next::download::diagnostics::FailureCode::UnsupportedObject, "resolve");
            j.message = format!("{}: {}", failure.code, failure.reason);
            j.failure = Some(failure);
            snapshot(vec![j])
        }
        "cancelled" => snapshot(vec![job(1, JobPhase::Cancelled, Some(1), None)]),
        "queued" => snapshot(vec![job(1, JobPhase::Queued, None, None)]),
        "validating" => snapshot(vec![job(1, JobPhase::Validating, Some(1), None)]),
        "publishing" => snapshot(vec![job(1, JobPhase::Publishing, Some(1), None)]),
        "held" => snapshot(vec![job(1, JobPhase::Held, Some(1), None)]),
        "concurrent" => fifo(),
        "mixed" | "badge" | "exit-confirm" => {
            let mut s = fifo(); s.jobs.push(job(5, JobPhase::Failure, Some(5), None)); s
        }
        _ => snapshot(Vec::new()),
    };
    if scene.surface == "settings" || scene.surface == "components" || scene.surface == "diagnostics" {
        s = snapshot(Vec::new());
    }
    s.unfinished = s.jobs.iter().filter(|j| !j.phase.terminal()).count();
    s.failures = s.jobs.iter().filter(|j| matches!(j.phase, JobPhase::Failure | JobPhase::Partial)).count();
    s
}

impl crate::Prototype {
    pub(super) fn poll_preview(&mut self, cx: &mut gpui::Context<Self>) {
        if self.native.is_none() { return; }
        let change = self.preview.as_mut().and_then(Session::poll);
        match change {
            Some(Change::Quit) => { if let Some(p) = &self.preview { p.ack(None); } cx.quit(); return; }
            Some(Change::Scene(scene)) => {
                // A fresh scene has no presentation continuity with the last job.
                // set_preview_scene clears selected_job, so an empty next snapshot
                // cannot otherwise retire the previous scene's painted indicator.
                let now = self.now();
                self.model.state(crate::model::Stage::Idle, 0., now);
                self.model.previous = crate::model::Stage::Idle;
                self.model.previous_progress = 0.;
                self.model.progress = crate::model::Progress::new(0., now);
                self.indicator = Default::default();
                if let Some(night) = self.preview.as_ref().and_then(|p| p.night) { self.night = night; }
                if let Some(handle) = self.settings_window.take() { let _ = handle.update(cx, |_, w, _| w.remove_window()); }
                self.close_tray_popup(cx);
                self.surface_menu.close(self.now());
                if let Some(ui) = &mut self.downloads {
                    ui.set_preview_scene(&scene);
                    if let Some(snapshot) = &mut ui.snapshot {
                        std::sync::Arc::make_mut(snapshot).settings.theme = if self.night {
                            ameow_next::download::settings::ThemePreference::Dark
                        } else { ameow_next::download::settings::ThemePreference::Light };
                    }
                }
                self.model.locks.menu = scene.surface != "compact";
                if scene.surface == "compact" { self.model.request_compact(self.now()); }
                else { self.model.set_target(true, self.now()); }
                match scene.surface.as_str() {
                    "settings" | "components" | "diagnostics" => self.apply_preview_settings_scene(&scene, cx),
                    "tray" => self.apply_preview_tray_scene(&scene, cx),
                    "menu" => { self.surface_menu.open(self.now()); }
                    _ => {}
                }
                let error = match scene.surface.as_str() {
                    "settings" | "components" | "diagnostics" if self.settings_window.is_none() => Some("无法打开预览设置窗口"),
                    "tray" if self.tray_popup.is_none() => Some("无法打开预览托盘弹窗"),
                    _ => None,
                };
                if let Some(p) = &self.preview { p.ack(error); }
            }
            None => {}
        }
        let now = self.now();
        if let Some(p) = &self.preview {
            // Refresh only observation timestamps, never progress or production ownership.
            if let Some(ui) = &mut self.downloads { ui.hold_preview_feedback(p.scene(), now); }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn catalog_is_unique_and_snapshots_never_carry_real_download_targets() {
        let scenes = scenes(); let mut names = std::collections::HashSet::new();
        for scene in scenes {
            assert!(names.insert(scene.name.clone())); assert!(!scene.description.is_empty());
            assert_eq!(find(&scene.name).unwrap().state, scene.state);
            let s = snapshot(&scene);
            if scene.state.starts_with("partial") { assert_eq!(s.failures, 1); }
            assert!(s.jobs.iter().all(|j| j.accepted.intent.url.is_empty() && j.accepted.intent.output_dir.as_os_str().is_empty()));
            assert!(s.jobs.iter().filter_map(|j| j.collection.as_ref()).all(|collection|
                collection.directory.is_none() && collection.files.iter().all(|file|
                    file.relative_path.as_os_str().is_empty() && file.delivered.path.as_os_str().is_empty())));
        }
        assert!(find("does-not-exist").is_err());
    }
    #[test]
    fn requests_switch_reject_and_quit_without_touching_another_session() {
        let root = tempfile::tempdir().unwrap(); let path = root.path().join("control.json");
        let mut p = Session::new(Some(path.clone()), "queue.mixed").unwrap(); p.poll();
        fs::write(&path, r#"{"step":1,"scene":"diagnostics.copy-failed","night":true}"#).unwrap();
        assert!(matches!(p.poll(), Some(Change::Scene(_)))); p.ack(None);
        assert_eq!(p.night, Some(true));
        fs::write(&path, r#"{"step":2,"scene":"unknown"}"#).unwrap();
        assert!(p.poll().is_none()); assert_eq!(p.scene().name, "diagnostics.copy-failed");
        assert_eq!(p.night, Some(true));
        let ack: serde_json::Value = serde_json::from_slice(&fs::read(path.with_extension("ack.json")).unwrap()).unwrap();
        assert!(ack["error"].as_str().unwrap().contains("unknown"));
        assert!(p.poll().is_none());
        fs::write(&path, r#"{"step":3,"quit":true}"#).unwrap();
        assert!(matches!(p.poll(), Some(Change::Quit)));
    }
    #[test]
    fn preview_transport_refuses_real_commands() {
        use ameow_next::download::queue::QueueCommand;
        let mut ui = crate::download_ui::DownloadUi::controlled_preview();
        let scene = find("queue.success").unwrap(); ui.set_preview_scene(&scene);
        for command in [QueueCommand::CopyDiagnostic(1), QueueCommand::CopyPreparationDiagnostic,
            QueueCommand::Submit { url: "https://example.invalid/".into() }, QueueCommand::RetryPreparation,
            QueueCommand::UpgradeEngine { version: "2026.11.01".into() }, QueueCommand::RestoreRecommended] {
            assert!(!ui.send(command, 100));
        }
        ui.hold_preview_feedback(&scene, 60_000);
        assert_eq!(ui.snapshot.as_ref().unwrap().jobs[0].phase, JobPhase::Success);
        assert!(!ui.upstream_check_available());
        assert!(!ui.preparation_retry_available());
    }
    #[test]
    fn atomic_control_replacement_survives_concurrent_polling_on_windows() {
        let root = tempfile::tempdir().unwrap(); let path = root.path().join("control.json");
        let mut p = Session::new(Some(path.clone()), "queue.mixed").unwrap(); p.poll();
        let writer = std::thread::spawn(move || {
            for step in 1..=300 {
                let pending = path.with_extension("tmp");
                fs::write(&pending, format!(r#"{{"step":{step},"scene":"full.downloading"}}"#)).unwrap();
                fs::rename(pending, &path).expect("atomic replace must not be denied by preview reader");
            }
        });
        while !writer.is_finished() { p.poll(); std::thread::yield_now(); }
        writer.join().unwrap(); p.poll();
        assert_eq!(p.step, Some(300)); assert_eq!(p.scene().name, "full.downloading");
    }
}
