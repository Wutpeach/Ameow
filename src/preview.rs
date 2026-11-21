//! Opt-in presentation fixtures. This module never constructs a production service.
use ameow_next::download::{queue::{JobPhase, QueueSnapshot}, progress::TransferPhase};
use serde::{Deserialize, Serialize};
use std::{fs, io::Read, path::PathBuf};
#[cfg(windows)]
use std::os::windows::fs::OpenOptionsExt;

pub const CATALOG: &str = include_str!("../scripts/preview-scenes.json");
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Scene { pub name: String, pub surface: String, pub state: String, pub description: String }
impl Scene {
    pub fn directory_feedback(&self) -> Option<crate::indicator::DirectoryFeedback> {
        if self.surface != "full" { return None; }
        match self.state.as_str() {
            "directory-hover" => Some(crate::indicator::DirectoryFeedback::Receiving),
            "directory-saved" => Some(crate::indicator::DirectoryFeedback::Saved),
            _ => None,
        }
    }
}
pub fn scenes() -> Vec<Scene> { serde_json::from_str(CATALOG).expect("embedded preview catalog") }
pub fn find(name: &str) -> Result<Scene, String> {
    // Keep old automation addresses working without duplicating the visible Gallery entry.
    let canonical = if name == "settings.browser-connect-demo" { "settings.browser-connect" } else { name };
    let mut scene = scenes().into_iter().find(|s| s.name == canonical).ok_or_else(|| format!("未知预览场景：{name}"))?;
    scene.name = name.to_owned();
    Ok(scene)
}

fn mascot_transition(model: &mut crate::model::Model, reveal: &mut crate::mascot_reveal::Reveal, state: &str, now: u64) -> bool {
    let enter = match state { "mascot-enter" => true, "mascot-exit" => false, _ => return false };
    // An explicitly selected replay gets a fresh fixture; production never resets its progress.
    let reduced = model.reduced;
    model.set_target(enter, now);
    model.set_reduced(true, now);
    model.set_reduced(reduced, now);
    *reveal = Default::default();
    reveal.sample(now, enter, model.fullness, true, true);
    if enter { model.request_compact(now); } else {
        model.set_target(true, now);
        reveal.sample(now, true, model.fullness, true, reduced);
    }
    true
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request { step: u64, scene: Option<String>, night: Option<bool>, reduced: Option<bool>, english: Option<bool>, #[serde(default)] quit: bool }
pub enum Change { Scene(Scene), Quit }
pub struct Session {
    control: Option<PathBuf>, scene: Scene, step: Option<u64>, initial: bool, night: Option<bool>, reduced: Option<bool>, english: Option<bool>,
}
impl Session {
    pub fn new(control: Option<PathBuf>, name: &str) -> Result<Self, String> {
        Ok(Self { control, scene: find(name)?, step: None, initial: true, night: None, reduced: None, english: None })
    }
    pub fn scene(&self) -> &Scene { &self.scene }
    pub fn poll(&mut self) -> Option<Change> {
        if self.initial { self.initial = false; return Some(Change::Scene(self.scene.clone())); }
        let path = self.control.as_ref()?;
        let mut bytes = Vec::new();
        // The launcher atomically replaces this file while the UI polls it.
        let mut options = fs::OpenOptions::new();
        options.read(true);
        #[cfg(windows)]
        options.share_mode(7);
        options.open(path).ok()?.take(8193).read_to_end(&mut bytes).ok()?;
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
            Some(Ok(scene)) => { self.scene = scene.clone(); self.night = request.night; self.reduced = request.reduced; self.english = request.english; Some(Change::Scene(scene)) }
            Some(Err(error)) => { self.ack(Some(&error)); None }
            None => { self.ack(Some("预览请求缺少 scene")); None }
        }
    }
    pub fn ack(&self, error: Option<&str>) {
        if let Some(path) = &self.control {
            let value = serde_json::json!({"step":self.step,"scene":self.scene.name,"night":self.night,"reduced":self.reduced,"english":self.english,"pid":std::process::id(),"error":error,"catalog":serde_json::from_str::<serde_json::Value>(CATALOG).unwrap(),"version":env!("CARGO_PKG_VERSION")});
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
        "concurrent" | "app-conflict" | "app-conflict-copied" | "app-update-feedback" => fifo(),
        "exit-cleanup" => {
            let mut s = snapshot(vec![job(1, JobPhase::Held, Some(1), None)]);
            s.stopping = true;
            s
        }
        "exit-unconfirmed" => {
            let mut s = snapshot(Vec::new());
            s.stopping = true;
            s.preparation_owner_lost = true;
            s
        }
        "mixed" | "badge" => {
            let mut s = fifo(); s.jobs.push(job(5, JobPhase::Failure, Some(5), None)); s
        }
        _ => snapshot(Vec::new()),
    };
    if matches!(scene.state.as_str(), "app-conflict" | "app-conflict-copied") {
        s.preparation.phase = ameow_next::download::preparation::PreparationPhase::Failed;
    }
    if matches!(scene.state.as_str(), "components-checking" | "components-ready" | "components-downloading" | "app-self-check" | "app-preparing") {
        use ameow_next::download::preparation::{PreparationEvent, PreparationPhase, PreparationStage, RuntimeComponent};
        let downloading = matches!(scene.state.as_str(), "components-downloading" | "app-preparing");
        let ready = scene.state == "components-ready";
        s.preparing = !ready;
        let preparation = &mut s.preparation;
        preparation.attempt = 2;
        preparation.phase = if downloading { PreparationPhase::Downloading } else if ready { PreparationPhase::Ready } else { PreparationPhase::Verifying };
        preparation.stage = if downloading { PreparationStage::Acquire } else if ready { PreparationStage::Publish } else { PreparationStage::Probe };
        preparation.component = Some(RuntimeComponent::YtDlp);
        preparation.updated_at_ms = ameow_next::download::progress::now_ms();
        preparation.downloaded_bytes = if downloading { 25_000_000 } else { 0 };
        preparation.total_bytes = downloading.then_some(40_000_000);
        preparation.history.push(PreparationEvent {
            attempt: if downloading { preparation.attempt } else { preparation.attempt - 1 },
            timestamp_ms: 0, phase: PreparationPhase::Downloading,
            component: Some(RuntimeComponent::YtDlp), stage: PreparationStage::Acquire,
            category: None, http_status: None, downloaded_bytes: 25_000_000, total_bytes: Some(40_000_000),
        });
    }
    if scene.surface == "settings" || scene.surface == "components" || scene.surface == "diagnostics" {
        s = snapshot(Vec::new());
    }
    if scene.surface == "menu" {
        s.settings.quality = match scene.state.as_str() {
            "highest" => ameow_next::download::request::Quality::Highest,
            "saver" => ameow_next::download::request::Quality::Saver,
            _ => ameow_next::download::request::Quality::Balanced,
        };
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
                self.clear_directory_drag();
                self.model.locks.drop = false;
                self.model.clear_directory(now);
                if let Some(reduced) = self.preview.as_ref().and_then(|p| p.reduced) { self.model.set_reduced(reduced, now); }
                self.model.state(crate::model::Stage::Idle, 0., now);
                self.model.previous = crate::model::Stage::Idle;
                self.model.previous_progress = 0.;
                self.model.progress = crate::model::Progress::new(0., now);
                self.indicator = Default::default();
                if let Some(night) = self.preview.as_ref().and_then(|p| p.night) { self.night = night; }
                if let Some(english) = self.preview.as_ref().and_then(|p| p.english) {
                    self.language = if english { crate::ui_text::Language::English } else { crate::ui_text::Language::Chinese };
                }
                if let Some(handle) = self.settings_window.take() { let _ = handle.update(cx, |_, w, _| w.remove_window()); }
                self.close_tray_popup(cx);
                self.surface_menu.close(self.now());
                if let Some(ui) = &mut self.downloads {
                    ui.set_preview_scene(&scene);
                    ui.language = self.language;
                    if let Some(snapshot) = &mut ui.snapshot {
                        std::sync::Arc::make_mut(snapshot).settings.theme = if self.night {
                            ameow_next::download::settings::ThemePreference::Dark
                        } else { ameow_next::download::settings::ThemePreference::Light };
                    }
                }
                self.model.locks.menu = scene.surface != "compact" && scene.surface != "full";
                if !mascot_transition(&mut self.model, &mut self.mascot_reveal, &scene.state, now) {
                    if scene.surface == "compact" { self.model.request_compact(now); }
                    else { self.model.set_target(true, now); }
                }
                if let Some(feedback) = scene.directory_feedback() { self.model.preview_directory(feedback, now); }
                match scene.surface.as_str() {
                    "settings" | "components" | "diagnostics" => self.apply_preview_settings_scene(&scene, cx),
                    "tray" => self.apply_preview_tray_scene(&scene, cx),
                    "menu" => {
                        let quality = self.downloads.as_ref().and_then(|ui| ui.settings()).map(|s| s.quality);
                        self.surface_menu.open(quality, self.now());
                        self.surface_menu.hint = match scene.state.as_str() {
                            "saving" => Some("正在保存画质…".into()),
                            "save-failed" => Some("保存失败，请重试".into()),
                            _ => None,
                        };
                    }
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
    fn mascot_scenes_replay_tail_entrance_and_hide_at_the_full_target() {
        let mut model = crate::model::Model::new(0, false);
        let mut reveal = crate::mascot_reveal::Reveal::default();
        assert!(mascot_transition(&mut model, &mut reveal, "mascot-enter", 0));
        assert_eq!(model.fullness, 1.);
        assert!(!model.target_full);
        for now in (0..500).step_by(16) {
            model.tick(now);
            reveal.sample(now, model.target_full, model.fullness, true, false);
        }
        assert!(reveal.progress > 0. && reveal.progress < 1.);
        model.set_target(true, 496);
        assert_eq!(reveal.sample(496, true, model.fullness, true, false), None);
        assert_eq!((reveal.progress, reveal.alpha()), (0., 0.));
        assert!(mascot_transition(&mut model, &mut reveal, "mascot-exit", 500));
        assert_eq!(model.fullness, 0.);
        assert!(model.target_full);
        assert_eq!(reveal.progress, 0.);
        model.set_reduced(true, 500);
        reveal.sample(500, model.target_full, model.fullness, true, true);
        assert_eq!(reveal.progress, 0.);
    }
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
        assert!(find("queue.empty").is_err());
    }
    #[test]
    fn browser_setup_has_one_visible_entry_and_preserves_legacy_transport_address() {
        let catalog = scenes();
        assert_eq!(catalog.iter().filter(|s| s.name.starts_with("settings.browser-connect")).count(), 1);
        let canonical = find("settings.browser-connect").unwrap();
        let legacy = find("settings.browser-connect-demo").unwrap();
        assert_eq!(legacy.state, canonical.state);
        assert_eq!(legacy.name, "settings.browser-connect-demo");
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("control.json");
        let mut session = Session::new(Some(path.clone()), &legacy.name).unwrap();
        assert!(matches!(session.poll(), Some(Change::Scene(_))));
        session.ack(None);
        let ack: serde_json::Value = serde_json::from_slice(&fs::read(path.with_extension("ack.json")).unwrap()).unwrap();
        assert_eq!(ack["scene"], legacy.name);
        assert!(snapshot(&legacy).jobs.is_empty());
    }
    #[test]
    fn requests_switch_reject_and_quit_without_touching_another_session() {
        let root = tempfile::tempdir().unwrap(); let path = root.path().join("control.json");
        let mut p = Session::new(Some(path.clone()), "queue.mixed").unwrap(); p.poll();
        fs::write(&path, r#"{"step":1,"scene":"diagnostics.copy-failed","night":true,"reduced":false,"english":true}"#).unwrap();
        assert!(matches!(p.poll(), Some(Change::Scene(_)))); p.ack(None);
        assert_eq!(p.night, Some(true));
        let ack: serde_json::Value = serde_json::from_slice(&fs::read(path.with_extension("ack.json")).unwrap()).unwrap();
        assert_eq!(ack["reduced"], false);
        assert_eq!(ack["english"], true);
        fs::write(&path, r#"{"step":2,"scene":"unknown","reduced":true}"#).unwrap();
        assert!(p.poll().is_none()); assert_eq!(p.scene().name, "diagnostics.copy-failed");
        assert_eq!(p.night, Some(true));
        assert_eq!(p.reduced, Some(false));
        assert_eq!(p.english, Some(true));
        let ack: serde_json::Value = serde_json::from_slice(&fs::read(path.with_extension("ack.json")).unwrap()).unwrap();
        assert!(ack["error"].as_str().unwrap().contains("unknown"));
        assert!(p.poll().is_none());
        fs::write(&path, r#"{"step":3,"scene":"diagnostics.copy-failed","night":true,"reduced":true,"english":false}"#).unwrap();
        assert!(matches!(p.poll(), Some(Change::Scene(_)))); p.ack(None);
        let ack: serde_json::Value = serde_json::from_slice(&fs::read(path.with_extension("ack.json")).unwrap()).unwrap();
        assert_eq!(ack["reduced"], true);
        assert_eq!(ack["english"], false);
        fs::write(&path, r#"{"step":4,"quit":true}"#).unwrap();
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
    fn directory_scenes_hold_the_shared_feedback_without_production_commands_or_ack() {
        use crate::{download_ui::DownloadUi, indicator::DirectoryFeedback};
        use ameow_next::download::queue::QueueCommand;
        for (name, feedback) in [
            ("full.directory-hover", DirectoryFeedback::Receiving),
            ("full.directory-saved", DirectoryFeedback::Saved),
        ] {
            let scene = find(name).unwrap();
            let mut ui = DownloadUi::controlled_preview();
            let mut model = crate::model::Model::new(0, true);
            ui.set_preview_scene(&scene);
            model.preview_directory(feedback, 0);
            assert!(ui.snapshot.as_ref().unwrap().jobs.is_empty());
            for now in [0, 2_000, 60_000] {
                ui.hold_preview_feedback(&scene, now);
                model.tick(now);
                assert_eq!(model.directory.unwrap().feedback, feedback);
                assert_eq!(model.stage, crate::model::Stage::Idle);
                assert!(!ui.settings_pending, "preview does not create a save request");
            }
            assert!(!ui.request_output_directory("never-written".into(), 60_000));
            assert!(!ui.send(QueueCommand::SaveSettings(ui.settings().unwrap()), 60_000));
            assert!(!ui.send(QueueCommand::Submit { url: "https://example.invalid".into() }, 60_000));
            assert!(!ui.upstream_check_available());
            ui.set_preview_scene(&find("full.idle").unwrap());
            model.clear_directory(60_001);
            assert!(model.directory.is_none());
        }
    }
    #[test]
    fn menu_scene_switches_restore_acknowledged_quality_and_retire_pending_state() {
        use ameow_next::download::{request::Quality, queue::QueueCommand};
        let mut ui = crate::download_ui::DownloadUi::controlled_preview();
        for (name, quality, pending) in [
            ("menu.highest", Quality::Highest, false),
            ("menu.saving", Quality::Balanced, true),
            ("menu.save-failed", Quality::Balanced, false),
            ("menu.saver", Quality::Saver, false),
            ("menu.root", Quality::Balanced, false),
        ] {
            ui.set_preview_scene(&find(name).unwrap());
            assert_eq!(ui.settings().unwrap().quality, quality);
            assert_eq!(ui.settings_pending, pending);
            assert!(!ui.send(QueueCommand::SaveSettings(ui.settings().unwrap()), 100));
            assert_eq!(ui.settings().unwrap().quality, quality);
        }
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
