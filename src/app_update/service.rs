//! One background owner for policy/persistence; GPUI only reads projections and sends actions.
use super::{
    BUILD_VERSION, Coordinator, Install, Phase, Snapshot, Version,
    session::Session,
    store::{atomic_json, now, read_json},
};
use crate::download::queue::DownloadCoordinator;
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::{Duration, Instant},
};

const STARTUP_MS: u64 = 30_000;
const PERIOD_MS: u64 = 6 * 60 * 60 * 1000;
const MANUAL_LIMIT_MS: u64 = 10_000;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Preferences {
    pub auto_check: bool,
    pub auto_download: bool,
    pub idle_restart: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            auto_check: true,
            auto_download: true,
            idle_restart: false,
        }
    }
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct View {
    pub update: Snapshot,
    pub preferences: Preferences,
    pub saving: bool,
    pub save_error: Option<String>,
    pub saved: bool,
    pub confirmation: bool,
    pub launcher: bool,
    #[serde(default)]
    pub check_retry_secs:u64,
}
impl View {
    pub fn attention(&self) -> bool {
        self.confirmation
            || matches!(
                self.update.phase,
                Phase::Ready | Phase::WaitingForTasks | Phase::Switching | Phase::RolledBack
            )
    }
}
#[derive(Clone, Debug)]
pub enum Action {
    Check,
    Download,
    Restart,
    Wait,
    Later,
    Save(Preferences),
}
struct Shared {
    view: Mutex<View>,
    coordinator: Mutex<Option<Arc<Coordinator>>>,
    cancel: AtomicBool,
    manual_restart: AtomicBool,
    waiting: AtomicBool,
    publish_gate: Mutex<()>,
    closing: AtomicBool,
}
#[derive(Clone)]
pub struct Handle {
    shared: Arc<Shared>,
    sender: mpsc::SyncSender<Action>,
}
impl Default for Handle {
    fn default() -> Self {
        Self::inert(View::default())
    }
}
impl Handle {
    pub fn inert(view: View) -> Self {
        let (sender, _) = mpsc::sync_channel(1);
        Self {
            sender,
            shared: Arc::new(Shared {
                view: Mutex::new(view),
                coordinator: Mutex::new(None),
                cancel: AtomicBool::new(false),
                manual_restart: AtomicBool::new(false),
                waiting: AtomicBool::new(false),
                publish_gate: Mutex::new(()),
                closing: AtomicBool::new(false),
            }),
        }
    }
    pub fn snapshot(&self) -> View {
        let mut view = self.shared.view.lock().unwrap().clone();
        if let Some(coordinator) = self.shared.coordinator.lock().unwrap().as_ref() {
            view.update = coordinator.snapshot();
        }
        view
    }
    pub fn send(&self, action: Action) -> bool {
        // Cancellation is observed during an in-flight acquisition before preference persistence.
        match action {
            Action::Restart => {
                if self.snapshot().update.phase != Phase::Ready {
                    return false;
                }
                self.shared.manual_restart.store(true, Ordering::Release);
                true
            }
            Action::Wait => {
                if !self.snapshot().confirmation {
                    return false;
                }
                self.shared.waiting.store(true, Ordering::Release);
                self.shared.view.lock().unwrap().confirmation = false;
                true
            }
            Action::Later => {
                self.shared.manual_restart.store(false, Ordering::Release);
                self.shared.waiting.store(false, Ordering::Release);
                self.shared.view.lock().unwrap().confirmation = false;
                true
            }
            Action::Save(p) => {
                let mut view = self.shared.view.lock().unwrap();
                if view.saving || self.shared.closing.load(Ordering::Acquire) {
                    return false;
                }
                if !p.auto_check || !p.auto_download {
                    let _publish = self.shared.publish_gate.lock().unwrap();
                    self.shared.cancel.store(true, Ordering::Release);
                }
                view.saving = true;
                view.saved = false;
                view.save_error = None;
                let sent = self.sender.try_send(Action::Save(p)).is_ok();
                if !sent {
                    view.saving = false;
                    view.save_error = Some("E_APP_UPDATE_OWNER_UNAVAILABLE".into());
                }
                sent
            }
            action => self.sender.try_send(action).is_ok(),
        }
    }
    pub fn start(
        settings: PathBuf,
        session: Option<Arc<Session>>,
        fixture: Option<PathBuf>,
    ) -> Self {
        Self::start_with(settings,session,fixture,None)
    }
    fn start_with(settings:PathBuf,session:Option<Arc<Session>>,fixture:Option<PathBuf>,install:Option<Install>)->Self {
        let mut handle = Self::default();
        let (sender, receiver) = mpsc::sync_channel(8);
        handle.sender = sender;
        handle.shared.view.lock().unwrap().launcher = session.is_some();
        let shared = handle.shared.clone();
        std::thread::Builder::new()
            .name("application-update-owner".into())
            .spawn(move || {
                let result = (|| -> Result<(), String> {
                    let coordinator = if let Some(install)=install {Arc::new(Coordinator::new(install))} else if let Some(session) = &session {
                        session.coordinator.clone()
                    } else {
                        Arc::new(Coordinator::new(Install::production(
                            super::default_install_root()?,
                        )?))
                    };
                    *shared.coordinator.lock().unwrap() = Some(coordinator.clone());
                    let prefs_path = settings.with_file_name("app-update-settings.json");
                    let preferences = if prefs_path.exists() {
                        read_json(&prefs_path)
                    } else {
                        Ok(Preferences::default())
                    };
                    match preferences {
                        Ok(p) => shared.view.lock().unwrap().preferences = p,
                        Err(e) => shared.view.lock().unwrap().save_error = Some(e),
                    }
                    let started = Instant::now();
                    let mut schedule = Schedule::default();
                    let mut available = None::<Vec<u8>>;
                    loop {
                        let action = match receiver.recv_timeout(Duration::from_millis(200)) {
                            Ok(a) => Some(a),
                            Err(mpsc::RecvTimeoutError::Disconnected) => return Ok(()),
                            Err(_) => None,
                        };
                        let elapsed = started.elapsed().as_millis() as u64;
                        shared.view.lock().unwrap().check_retry_secs=schedule.last.map_or(0,|last|last.saturating_add(MANUAL_LIMIT_MS).saturating_sub(elapsed).div_ceil(1000));
                        if let Some(Action::Save(p)) = &action {
                            {
                                let mut v = shared.view.lock().unwrap();
                                v.saving = true;
                                v.saved = false;
                                v.save_error = None;
                            }
                            let result = (|| {
                                std::fs::create_dir_all(
                                    prefs_path.parent().ok_or("E_APP_UPDATE_SETTINGS")?,
                                )
                                .map_err(|e| e.to_string())?;
                                atomic_json(&prefs_path, p)
                            })();
                            let mut v = shared.view.lock().unwrap();
                            v.saving = false;
                            match result {
                                Ok(()) => {
                                    v.preferences = p.clone();
                                    v.saved = true;
                                }
                                Err(e) => v.save_error = Some(e),
                            }
                            shared.cancel.store(false, Ordering::Release);
                        }
                        let control = shared.view.lock().unwrap().clone();
                        let prefs = control.preferences;
                        let manual = matches!(action, Some(Action::Check));
                        let auto = action.is_none()
                            && prefs.auto_check
                            && control.save_error.is_none()
                            && !control.saving
                            && schedule.due(elapsed);
                        let download = matches!(action, Some(Action::Download))
                            || matches!(action, Some(Action::Save(_)))
                                && prefs.auto_check
                                && prefs.auto_download
                                && available.is_some();
                        if !manual && !auto && !download {
                            continue;
                        }
                        if matches!(
                            coordinator.snapshot().phase,
                            Phase::Ready | Phase::WaitingForTasks | Phase::Switching
                        ) {
                            continue;
                        }
                        if shared.closing.load(Ordering::Acquire) || control.saving {
                            continue;
                        }
                        if manual && !schedule.manual_allowed(elapsed) {
                            continue;
                        }
                        shared.cancel.store(false, Ordering::Release);
                        let result = (|| -> Result<(), String> {
                            if !download {
                                schedule.checked(elapsed);
                                shared.view.lock().unwrap().check_retry_secs=MANUAL_LIMIT_MS/1000;
                                coordinator.set_state(Phase::Checking, None, None);
                                let envelope = read_source(
                                    coordinator.install(),
                                    fixture.as_deref(),
                                    &shared.cancel,
                                )?;
                                if shared.cancel.load(Ordering::Acquire) {
                                    return Err("E_APP_UPDATE_CANCELLED".into());
                                }
                                let (signed, m) = coordinator
                                    .install()
                                    .trust()
                                    .verify(&envelope, Some(now()))?;
                                let state=coordinator.install().state()?;
                                let digest=super::hash(signed.payload.as_bytes());
                                if state.failed.contains(&digest) {
                                    coordinator.set_state(Phase::RolledBack,state.current.map(|r|r.version),state.last_error);available=None;return Ok(());
                                }
                                if m.sequence<state.highest_sequence || m.sequence==state.highest_sequence && digest!=state.highest_manifest {return Err("E_APP_UPDATE_REPLAY".into());}
                                if Version::parse(&m.version)? <= Version::parse(BUILD_VERSION)? {
                                    coordinator.no_update();
                                    available = None;
                                    return Ok(());
                                }
                                available = Some(envelope);
                                coordinator.set_state(Phase::Available, Some(m.version), None);
                            }
                            if download || prefs.auto_check && prefs.auto_download {
                                let envelope =
                                    available.as_ref().ok_or("E_APP_UPDATE_CHECK_FIRST")?;
                                let result = coordinator.install().prepare_observed(
                                    envelope,
                                    &shared.cancel,
                                    |phase, version, n, total| {
                                        // Ready becomes visible only after the install transaction releases its lock.
                                        if phase==Phase::Ready{return;}
                                        let mut view = coordinator.view.lock().unwrap();
                                        *view = Snapshot {
                                            phase,
                                            version: Some(version),
                                            error: None,
                                            downloaded: n,
                                            total,
                                        };
                                    },
                                    fixture.as_deref(),
                                    &shared.publish_gate,
                                );
                                result?;
                                coordinator.set_state(Phase::Ready,coordinator.snapshot().version,None);
                            }
                            Ok(())
                        })();
                        match result {
                            Ok(()) => {
                                schedule.finished(elapsed, false);
                            }
                            Err(_) if shared.cancel.load(Ordering::Acquire) => {
                                let version = coordinator.snapshot().version;
                                coordinator.set_state(
                                    if available.is_some() {
                                        Phase::Available
                                    } else {
                                        Phase::Unchecked
                                    },
                                    version,
                                    None,
                                );
                                schedule.finished(elapsed, false);
                            }
                            Err(error) => {
                                schedule.finished(elapsed, true);
                                coordinator.set_state(
                                    if error == "E_APP_UPDATE_TRUST_NOT_CONFIGURED" {
                                        Phase::Unavailable
                                    } else {
                                        Phase::Failed
                                    },
                                    coordinator.snapshot().version,
                                    Some(error),
                                );
                            }
                        }
                    }
                })();
                if let Err(error) = result {
                    if let Some(c) = shared.coordinator.lock().unwrap().as_ref() {
                        c.set_state(Phase::Failed, None, Some(error));
                    } else {
                        shared.view.lock().unwrap().update = Snapshot {
                            phase: Phase::Failed,
                            error: Some(error),
                            ..Default::default()
                        };
                    }
                }
            })
            .expect("application update owner");
        handle
    }
    /// Called on the existing queue command thread; it never performs network I/O.
    pub fn poll(
        &self,
        queue: &DownloadCoordinator,
        session: Option<&Session>,
    ) {
        let Some(session) = session else {
            return;
        };
        if !session.accepted.load(Ordering::Acquire) {
            return;
        }
        let view = self.snapshot();
        if view.saving {
            return;
        }
        if self.shared.manual_restart.swap(false, Ordering::AcqRel)
            && view.update.phase == Phase::Ready
        {
            if queue.app_update_idle() {
                self.shared.waiting.store(true, Ordering::Release);
            } else {
                self.shared.view.lock().unwrap().confirmation = true;
            }
        }
        if self.shared.waiting.load(Ordering::Acquire) {
            let control = self.shared.view.lock().unwrap();
            if control.saving {
                return;
            }
            self.shared.closing.store(true, Ordering::Release);
            session.request_restart();
        } else if view.update.phase == Phase::WaitingForTasks {
            if session.cancel_restart(queue) {
                self.shared.closing.store(false, Ordering::Release);
                session
                    .coordinator
                    .set_state(Phase::Ready, view.update.version, None);
            }
        }
        if view.update.phase != Phase::Ready
            || view.confirmation
            || view.save_error.is_some()
            || !view.preferences.idle_restart
            || !queue.app_update_idle()
        {
            return;
        }
        if session.coordinator.prepare_restart().is_err(){return;}
        // Recheck settings and atomically arbitrate newly accepted work after candidate hashing.
        let control = self.shared.view.lock().unwrap();
        if !control.saving
            && control.save_error.is_none()
            && !control.confirmation
            && control.preferences.idle_restart
            && queue.begin_idle_app_update()
        {
            self.shared.closing.store(true, Ordering::Release);
            session.request_restart();
        }
    }
    pub fn restart_failed(&self, queue: &DownloadCoordinator, session: &Session, error: String) {
        self.shared.waiting.store(false, Ordering::Release);
        if session.cancel_restart(queue) {
            self.shared.closing.store(false, Ordering::Release);
        }
        session
            .coordinator
            .set_state(Phase::Failed, None, Some(error));
    }
}
#[derive(Debug)]
struct Schedule {
    next: u64,
    last: Option<u64>,
    failures: u32,
}
impl Default for Schedule {
    fn default() -> Self {
        Self {
            next: STARTUP_MS,
            last: None,
            failures: 0,
        }
    }
}
impl Schedule {
    fn due(&self, now: u64) -> bool {
        now >= self.next
    }
    fn manual_allowed(&self, now: u64) -> bool {
        self.last
            .is_none_or(|last| now >= last.saturating_add(MANUAL_LIMIT_MS))
    }
    fn checked(&mut self, now: u64) {
        self.last = Some(now);
    }
    fn finished(&mut self, now: u64, failed: bool) {
        self.failures = if failed {
            self.failures.saturating_add(1)
        } else {
            0
        };
        self.next = now.saturating_add(if failed {
            backoff(self.failures)
        } else {
            PERIOD_MS
        });
    }
}
fn backoff(failures: u32) -> u64 {
    (60_000u64.saturating_mul(1u64 << failures.min(9))).min(PERIOD_MS)
}
#[cfg(test)]
mod tests;
fn read_source(
    install: &Install,
    fixture: Option<&Path>,
    cancel: &AtomicBool,
) -> Result<Vec<u8>, String> {
    if !install.trust().configured() {
        return Err("E_APP_UPDATE_TRUST_NOT_CONFIGURED".into());
    }
    #[cfg(any(test,all(feature = "app-update-fixture", debug_assertions)))]
    if let Some(root) = fixture {
        use std::io::Read;
        let mut bytes=Vec::new();std::fs::File::open(root.join("manifest.json")).and_then(|f|f.take(16385).read_to_end(&mut bytes)).map_err(|e| format!("E_APP_UPDATE_SOURCE: {e}"))?;
        if bytes.len()>16384{return Err("E_APP_UPDATE_MANIFEST_SIZE".into());}return Ok(bytes);
    }
    let _ = fixture;
    let mut url = url::Url::parse(
        "https://github.com/Wutpeach/Ameow/releases/latest/download/ameow-update-windows-x64.json",
    )
    .unwrap();
    use std::io::Read;
    for _ in 0..8 {
        if cancel.load(Ordering::Acquire) {
            return Err("E_APP_UPDATE_CANCELLED".into());
        }
        if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
            return Err("E_APP_UPDATE_ORIGIN".into());
        }
        let route = crate::download::network::resolve(url.as_str())?;
        let mut builder = reqwest::blocking::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(30));
        if let crate::download::network::Route::Proxy(proxy) = route {
            builder = builder.proxy(reqwest::Proxy::all(proxy).map_err(|e| e.to_string())?);
        }
        let response = builder
            .build()
            .and_then(|c| c.get(url.clone()).header("User-Agent", "Ameow").send())
            .map_err(|e| format!("E_APP_UPDATE_NETWORK: {e}"))?;
        if response.status().is_redirection() {
            url = url
                .join(
                    response
                        .headers()
                        .get("location")
                        .and_then(|h| h.to_str().ok())
                        .ok_or("E_APP_UPDATE_REDIRECT")?,
                )
                .map_err(|e| e.to_string())?;
            continue;
        }
        if !response.status().is_success() {
            return Err(format!("E_APP_UPDATE_HTTP: {}", response.status()));
        }
        let mut bytes = Vec::new();
        response
            .take(16385)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > 16384 {
            return Err("E_APP_UPDATE_MANIFEST_SIZE".into());
        }
        return Ok(bytes);
    }
    Err("E_APP_UPDATE_REDIRECT".into())
}
