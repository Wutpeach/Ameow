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
const INSTALL_QUIET_PERIOD: Duration = Duration::from_secs(30);
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Preferences {
    pub auto_update: bool,
    pub notify_updates: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            auto_update: true,
            notify_updates: true,
        }
    }
}
impl<'de> Deserialize<'de> for Preferences {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Stored {
            auto_update: Option<bool>,
            notify_updates: Option<bool>,
            auto_check: Option<bool>,
            auto_download: Option<bool>,
            idle_restart: Option<bool>,
        }
        let stored = Stored::deserialize(deserializer)?;
        Ok(Self {
            auto_update: stored.auto_update.unwrap_or_else(|| {
                stored.auto_check.unwrap_or(true)
                    && stored.auto_download.unwrap_or(true)
                    && stored.idle_restart.unwrap_or(true)
            }),
            notify_updates: stored.notify_updates.unwrap_or(true),
        })
    }
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct View {
    pub update: Snapshot,
    pub preferences: Preferences,
    pub saving: bool,
    pub save_error: Option<String>,
    pub saved: bool,
    pub launcher: bool,
    #[serde(default)]
    pub check_retry_secs:u64,
    #[serde(default)]
    pub check_error: Option<String>,
}
impl View {
    pub fn full_attention(&self) -> bool {
        self.preferences.notify_updates && matches!(self.update.phase,
            Phase::Available | Phase::Downloading | Phase::Verifying | Phase::Ready
                | Phase::WaitingForTasks | Phase::Switching | Phase::Failed | Phase::RolledBack)
    }
    pub fn attention(&self) -> bool {
        matches!(
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
    Later,
    Save(Preferences),
}
struct Shared {
    view: Mutex<View>,
    coordinator: Mutex<Option<Arc<Coordinator>>>,
    cancel: AtomicBool,
    check_pending: AtomicBool,
    manual_restart: AtomicBool,
    waiting: AtomicBool,
    publish_gate: Mutex<()>,
    closing: AtomicBool,
    idle: Mutex<IdleWindow>,
}
struct IdleWindow {
    since: Option<Instant>,
    interaction: Instant,
    revision: Option<u64>,
}
impl Default for IdleWindow {
    fn default() -> Self {
        Self { since: None, interaction: Instant::now(), revision: None }
    }
}
impl IdleWindow {
    fn ready(&mut self, now: Instant, eligible: bool, revision: u64) -> bool {
        if !eligible || self.revision != Some(revision) {
            self.since = eligible.then_some(now);
            self.revision = Some(revision);
            return false;
        }
        let since = *self.since.get_or_insert(now);
        now.duration_since(since) >= INSTALL_QUIET_PERIOD
            && now.duration_since(self.interaction) >= INSTALL_QUIET_PERIOD
    }
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
                check_pending: AtomicBool::new(false),
                manual_restart: AtomicBool::new(false),
                waiting: AtomicBool::new(false),
                publish_gate: Mutex::new(()),
                closing: AtomicBool::new(false),
                idle: Mutex::new(IdleWindow::default()),
            }),
        }
    }
    pub fn snapshot(&self) -> View {
        let mut view = self.shared.view.lock().unwrap().clone();
        if let Some(coordinator) = self.shared.coordinator.lock().unwrap().as_ref() {
            view.update = coordinator.snapshot();
        }
        if self.shared.check_pending.load(Ordering::Acquire)
            && !matches!(view.update.phase, Phase::Downloading | Phase::Verifying | Phase::WaitingForTasks | Phase::Switching)
        {
            view.update.phase = Phase::Checking;
        }
        view
    }
    pub fn user_interaction(&self) {
        *self.shared.idle.lock().unwrap() = IdleWindow::default();
    }
    pub fn send(&self, action: Action) -> bool {
        // Cancellation is observed during an in-flight acquisition before preference persistence.
        match action {
            Action::Check => {
                let view = self.snapshot();
                if self.shared.closing.load(Ordering::Acquire) || view.check_retry_secs > 0
                    || matches!(view.update.phase, Phase::Checking | Phase::Downloading | Phase::Verifying | Phase::WaitingForTasks | Phase::Switching)
                    || self.shared.check_pending.compare_exchange(false,true,Ordering::AcqRel,Ordering::Acquire).is_err()
                { return false; }
                let sent = self.sender.try_send(Action::Check).is_ok();
                if !sent { self.shared.check_pending.store(false,Ordering::Release); }
                sent
            }
            Action::Restart => {
                if !matches!(self.snapshot().update.phase, Phase::Ready | Phase::WaitingForTasks) {
                    return false;
                }
                self.shared.manual_restart.store(true, Ordering::Release);
                true
            }
            Action::Later => {
                self.shared.manual_restart.store(false, Ordering::Release);
                self.shared.waiting.store(false, Ordering::Release);
                true
            }
            Action::Save(p) => {
                let mut view = self.shared.view.lock().unwrap();
                if view.saving || self.shared.closing.load(Ordering::Acquire) {
                    return false;
                }
                if view.preferences.auto_update && !p.auto_update {
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
                    let mut available = None::<(Vec<u8>, Option<String>)>;
                    loop {
                        let action = match receiver.recv_timeout(Duration::from_millis(200)) {
                            Ok(a) => Some(a),
                            Err(mpsc::RecvTimeoutError::Disconnected) => return Ok(()),
                            Err(_) => None,
                        };
                        let elapsed = started.elapsed().as_millis() as u64;
                        shared.view.lock().unwrap().check_retry_secs=schedule.last.map_or(0,|last|last.saturating_add(MANUAL_LIMIT_MS).saturating_sub(elapsed).div_ceil(1000));
                        let mut enabled_automatic = false;
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
                                    enabled_automatic = !v.preferences.auto_update && p.auto_update;
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
                            && control.save_error.is_none()
                            && !control.saving
                            && schedule.due(elapsed);
                        let download = matches!(action, Some(Action::Download))
                            || enabled_automatic
                                && available.is_some();
                        if !manual && !auto && !download {
                            continue;
                        }
                        let previous = coordinator.snapshot();
                        let checking_ready = manual && previous.phase == Phase::Ready;
                        let install_error = if previous.phase == Phase::Ready {
                            previous.error.clone()
                        } else {
                            available.as_ref().and_then(|(_, error)| error.clone())
                        };
                        if !checking_ready && matches!(
                            previous.phase,
                            Phase::Ready | Phase::WaitingForTasks | Phase::Switching
                        ) {
                            if manual { shared.check_pending.store(false,Ordering::Release); }
                            continue;
                        }
                        if shared.closing.load(Ordering::Acquire) || control.saving {
                            if manual { shared.check_pending.store(false,Ordering::Release); }
                            continue;
                        }
                        if manual && !schedule.manual_allowed(elapsed) {
                            shared.check_pending.store(false,Ordering::Release);
                            continue;
                        }
                        shared.cancel.store(false, Ordering::Release);
                        let result = (|| -> Result<(), String> {
                            if !download {
                                schedule.checked(elapsed);
                                {
                                    let mut view = shared.view.lock().unwrap();
                                    view.check_retry_secs=MANUAL_LIMIT_MS/1000;
                                    if manual { view.check_error=None; }
                                }
                                coordinator.set_state(Phase::Checking, None, None);
                                shared.check_pending.store(false,Ordering::Release);
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
                                if let Some(pending) = state.pending.as_ref().filter(|pending| pending.version == m.version) {
                                    coordinator.install().verify_release(pending)?;
                                    available = Some((envelope, install_error.clone()));
                                    coordinator.set_state(Phase::Ready, Some(m.version), install_error.clone());
                                    return Ok(());
                                }
                                available = Some((envelope, install_error.clone()));
                                coordinator.set_state(Phase::Available, Some(m.version), install_error.clone());
                            }
                            if download || prefs.auto_update && control.save_error.is_none() {
                                let (envelope, _) =
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
                                coordinator.set_state(Phase::Ready,coordinator.snapshot().version,install_error.clone());
                            }
                            Ok(())
                        })();
                        let retained = checking_ready && result.is_err() && coordinator.install().state().ok()
                            .and_then(|state| state.pending)
                            .is_some_and(|pending| Some(pending.version.as_str()) == previous.version.as_deref()
                                && coordinator.install().verify_release(&pending).is_ok());
                        match result {
                            Ok(()) => {
                                schedule.finished(elapsed, false);
                            }
                            Err(_) if shared.cancel.load(Ordering::Acquire) => {
                                if retained {
                                    shared.view.lock().unwrap().check_error=Some("E_APP_UPDATE_CANCELLED".into());
                                    coordinator.set_state(Phase::Ready, previous.version, previous.error);
                                    schedule.finished(elapsed, false);
                                    continue;
                                }
                                let version = coordinator.snapshot().version;
                                coordinator.set_state(
                                    if available.is_some() {
                                        Phase::Available
                                    } else {
                                        Phase::Unchecked
                                    },
                                    version,
                                    install_error,
                                );
                                schedule.finished(elapsed, false);
                            }
                            Err(error) => {
                                schedule.finished(elapsed, true);
                                if manual && (retained || coordinator.snapshot().phase == Phase::Checking) {
                                    shared.view.lock().unwrap().check_error=Some("E_APP_UPDATE_CHECK_FAILED".into());
                                }
                                if retained {
                                    coordinator.set_state(Phase::Ready, previous.version, previous.error);
                                    continue;
                                }
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
            self.shared.idle.lock().unwrap().ready(Instant::now(), false, 0);
            return;
        }
        if self.shared.manual_restart.swap(false, Ordering::AcqRel)
            && matches!(view.update.phase, Phase::Ready | Phase::WaitingForTasks)
        {
            self.shared.waiting.store(true, Ordering::Release);
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
        let eligible = view.update.phase == Phase::Ready
            && view.update.error.is_none()
            && view.save_error.is_none()
            && view.preferences.auto_update
            && queue.app_update_idle();
        let revision = if eligible { queue.snapshot().revision } else { 0 };
        if !self.shared.idle.lock().unwrap().ready(Instant::now(), eligible, revision) {
            return;
        }
        if session.coordinator.prepare_restart().is_err(){return;}
        // Recheck settings and atomically arbitrate newly accepted work after candidate hashing.
        let control = self.shared.view.lock().unwrap();
        let mut idle = self.shared.idle.lock().unwrap();
        if !idle.ready(Instant::now(), true, queue.snapshot().revision)
            || self.shared.check_pending.load(Ordering::Acquire) { return; }
        #[cfg(target_os = "macos")]
        if session.is_macos_bundle() {
            if !control.saving && control.save_error.is_none()
                && control.preferences.auto_update && queue.app_update_idle() {
                self.shared.closing.store(true, Ordering::Release);
                session.request_restart();
            }
            return;
        }
        if !control.saving
            && control.save_error.is_none()
            && control.preferences.auto_update
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
        #[cfg(target_os = "macos")]
        let error = if error == "E_APP_UPDATE_AUTHORIZATION_CANCELLED" {
            error
        } else {
            super::macos_helper::record_result(session.coordinator.install(), Err(error))
                .expect_err("recording a failure cannot succeed")
        };
        #[cfg(target_os = "macos")]
        if session.requires_authorized_recovery() || error.starts_with("E_APP_UPDATE_AUTHORIZATION_") {
            let version = session.coordinator.snapshot().version;
            session.coordinator.set_state(Phase::Ready, version, Some(error));
            return;
        }
        session.coordinator.set_state(Phase::Failed, None, Some(error));
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
    let source = match install.trust().target() {
        super::package::WINDOWS_TARGET => "ameow-update-windows-x64.json",
        super::package::MACOS_ARM_TARGET => "ameow-update-macos-arm64.json",
        _ => return Err("E_APP_UPDATE_IDENTITY".into()),
    };
    let mut url = url::Url::parse(&format!(
        "https://github.com/Wutpeach/Ameow/releases/latest/download/{source}"
    ))
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
