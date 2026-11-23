//! The native app confirms readiness only after its real window and command owner exist.
use super::{
    BUILD_VERSION, Coordinator, Install,
    launcher::{Ready, Ticket},
    store::{atomic_json, plain, read_json},
};
use crate::download::queue::DownloadCoordinator;
use std::{
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
};
#[cfg(target_os = "macos")]
use std::sync::atomic::AtomicU64;
#[cfg(target_os = "macos")]
use std::{
    io::{BufRead, Read, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Mutex, OnceLock, mpsc},
    time::Instant,
};
#[cfg(all(test, target_os = "macos"))]
use std::time::Duration;
pub struct Session {
    root: PathBuf,
    ticket: Ticket,
    pub coordinator: std::sync::Arc<Coordinator>,
    pub native_ready: AtomicBool,
    pub accepted: AtomicBool,
    pub quit: AtomicBool,
    sent_ready: AtomicBool,
    restart: AtomicBool,
    #[cfg(target_os = "macos")]
    helper: Mutex<Option<MacHelper>>,
    #[cfg(target_os = "macos")]
    owner_sequence: AtomicU64,
    #[cfg(target_os = "macos")]
    owner_attested: AtomicBool,
    #[cfg(target_os = "macos")]
    window_progress: AtomicU64,
    #[cfg(target_os = "macos")]
    accept_ack_sent: AtomicBool,
    #[cfg(target_os = "macos")]
    recovery_required: bool,
    #[cfg(all(feature = "app-update-fixture", debug_assertions))]
    control: Option<PathBuf>,
}

#[cfg(target_os = "macos")]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct OwnerReady {
    pub(super) nonce: String,
    pub(super) version: String,
    pub(super) pid: u32,
    pub(super) sequence: u64,
}

#[cfg(target_os = "macos")]
fn monotonic_millis() -> u64 {
    static ORIGIN: OnceLock<Instant> = OnceLock::new();
    ORIGIN.get_or_init(Instant::now).elapsed().as_millis().min((u64::MAX - 1) as u128) as u64 + 1
}

#[cfg(target_os = "macos")]
struct MacHelper {
    child: Option<Child>,
    input: Option<ChildStdin>,
    response: mpsc::Receiver<Result<String, String>>,
    ready: bool,
    authorization: Option<mpsc::Receiver<Result<super::macos_privileged::Client, String>>>,
    privileged: Option<super::macos_privileged::Client>,
}

#[cfg(target_os = "macos")]
impl MacHelper {
    fn start(bundle: &std::path::Path, updates: &std::path::Path) -> Result<Self, String> {
        let recovery = super::macos_privileged::recovery_marker(updates, bundle)?;
        if recovery.is_some() || super::macos_helper::needs_authorization(bundle)? {
            let bundle = bundle.to_path_buf();
            let updates = updates.to_path_buf();
            let (sender, authorization) = mpsc::sync_channel(1);
            let (_, response) = mpsc::sync_channel(1);
            std::thread::spawn(move || {
                let prepared = (|| {
                    #[cfg(all(feature = "app-update-fixture", debug_assertions))]
                    let install = Install::fixture(updates.clone())?;
                    #[cfg(not(all(feature = "app-update-fixture", debug_assertions)))]
                    let install = Install::production(updates.clone())?;
                    let release = if recovery.is_none() {
                        let release = install.state()?.pending.ok_or("E_APP_UPDATE_NOT_READY")?;
                        install.verify_release(&release)?;
                        Some(release)
                    } else { None };
                    super::macos_privileged::Client::prepare(&bundle, &updates, release, recovery,
                        std::env::args().skip(1).collect())
                })();
                let _ = sender.send(prepared);
            });
            return Ok(Self { child: None, input: None, response, ready: false,
                authorization: Some(authorization), privileged: None });
        }
        let executable = bundle.join("Contents/MacOS/ameow-updater");
        plain(&executable)?;
        let mut command = Command::new(executable);
        command.arg("--apply").args(std::env::args_os().skip(1))
            .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
        let mut child = command.spawn().map_err(|e| format!("E_APP_UPDATE_HELPER: {e}"))?;
        let input = child.stdin.take().ok_or("E_APP_UPDATE_HELPER_PIPE")?;
        let output = child.stdout.take().ok_or("E_APP_UPDATE_HELPER_PIPE")?;
        let (sender, response) = mpsc::sync_channel(1);
        std::thread::spawn(move || {
            let mut line = String::new();
            let result = std::io::BufReader::new(output).take(8192).read_line(&mut line)
                .map(|_| line).map_err(|e| e.to_string());
            let _ = sender.send(result);
        });
        Ok(Self { child: Some(child), input: Some(input), response, ready: false, authorization: None, privileged: None })
    }
    fn poll_ready(&mut self) -> Result<bool, String> {
        if self.ready { return Ok(true); }
        if let Some(authorization) = &self.authorization {
            return match authorization.try_recv() {
                Ok(Ok(client)) => { self.privileged = Some(client); self.ready = true; Ok(true) },
                Ok(Err(error)) => Err(error),
                Err(mpsc::TryRecvError::Empty) => Ok(false),
                Err(mpsc::TryRecvError::Disconnected) => Err("E_APP_UPDATE_AUTHORIZATION_WORKER_EXIT".into()),
            };
        }
        match self.response.try_recv() {
            Ok(Ok(line)) if line.trim_end() == "READY" => { self.ready = true; Ok(true) }
            Ok(Ok(line)) if line.starts_with("ERROR ") => Err(line.trim_end()[6..].to_string()),
            Ok(Ok(_)) | Err(mpsc::TryRecvError::Disconnected) => Err("E_APP_UPDATE_HELPER_EXIT".into()),
            Ok(Err(error)) => Err(format!("E_APP_UPDATE_HELPER: {error}")),
            Err(mpsc::TryRecvError::Empty) => Ok(false),
        }
    }
    fn go(&mut self) -> Result<(), String> {
        if let Some(client) = &mut self.privileged { return client.go(); }
        let mut input = self.input.take().ok_or("E_APP_UPDATE_HELPER_PIPE")?;
        input.write_all(b"GO\n").and_then(|_| input.flush()).map_err(|e| format!("E_APP_UPDATE_HELPER: {e}"))
    }
}

#[cfg(target_os = "macos")]
impl Drop for MacHelper {
    fn drop(&mut self) {
        drop(self.input.take());
        if let Some(mut child) = self.child.take() {
            std::thread::spawn(move || { let _ = child.wait(); });
        }
    }
}

#[cfg(target_os = "macos")]
fn start_recovery(bundle: &std::path::Path, unaccepted_trial: bool) -> Result<(), String> {
    let executable = bundle.join("Contents/MacOS/ameow-updater");
    plain(&executable)?;
    let mode = if unaccepted_trial { "--recover-unaccepted" } else { "--recover" };
    let child = Command::new(executable).arg(mode).args(std::env::args_os().skip(1))
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn()
        .map_err(|e| format!("E_APP_UPDATE_RECOVERY: {e}"))?;
    wait_for_recovery_handshake(child)
}

#[cfg(target_os = "macos")]
fn wait_for_recovery_handshake(mut child: Child) -> Result<(), String> {
    let output = child.stdout.take().ok_or("E_APP_UPDATE_RECOVERY_PIPE")?;
    let mut line = String::new();
    let response = std::io::BufReader::new(output).take(8192).read_line(&mut line);
    match response {
        Ok(_) if line.trim_end() == "READY" => {
            std::thread::spawn(move || { let _ = child.wait(); });
            Ok(())
        }
        response => {
            let _ = child.wait();
            match response {
                Ok(_) if line.starts_with("ERROR ") => Err(line.trim_end()[6..].to_string()),
                _ => Err("E_APP_UPDATE_RECOVERY_HELPER".into()),
            }
        }
    }
}

fn expected_executable(ticket: &Ticket) -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    let path = if let Some(bundle) = &ticket.bundle {
        if !bundle.is_absolute() || bundle.extension().is_none_or(|ext| ext != "app") {
            return Err("E_APP_UPDATE_BOOT_IDENTITY".into());
        }
        let executable = bundle.join("Contents/MacOS/ameow");
        plain(&executable)?;
        executable
    } else {
        ticket.install.join("versions").join(&ticket.version).join("Ameow.exe")
    };
    #[cfg(not(target_os = "macos"))]
    let path = {
        if ticket.bundle.is_some() {
            return Err("E_APP_UPDATE_BOOT_IDENTITY".into());
        }
        ticket.install.join("versions").join(&ticket.version).join("Ameow.exe")
    };
    path.canonicalize().map_err(|e| e.to_string())
}

impl Session {
    #[cfg(test)]
    pub(super) fn for_test(install:Install)->Self {
        Self {root:install.root.join("test-session"),ticket:Ticket{nonce:"test".into(),version:BUILD_VERSION.into(),install:install.root.clone(),bundle:None,supervisor:None,privileged:None},
            coordinator:std::sync::Arc::new(Coordinator::new(install)),native_ready:AtomicBool::new(false),accepted:AtomicBool::new(true),quit:AtomicBool::new(false),sent_ready:AtomicBool::new(false),restart:AtomicBool::new(false),
            #[cfg(target_os="macos")] helper:Mutex::new(None),
            #[cfg(target_os="macos")] owner_sequence:AtomicU64::new(0),
            #[cfg(target_os="macos")] owner_attested:AtomicBool::new(false),
            #[cfg(target_os="macos")] window_progress:AtomicU64::new(0),
            #[cfg(target_os="macos")] accept_ack_sent:AtomicBool::new(false),
            #[cfg(target_os="macos")] recovery_required:false,
            #[cfg(all(feature="app-update-fixture",debug_assertions))] control:None}
    }
    #[cfg(target_os = "macos")]
    fn from_bundle() -> Result<Option<Self>, String> {
        if std::env::args().any(|argument| matches!(argument.as_str(), "--preview" | "--gallery" | "--preview-catalog-out" | "--preview-scene")) {
            return Ok(None);
        }
        let bundle = match super::macos::current_bundle() { Ok(bundle) => bundle, Err(_) => return Ok(None) };
        #[cfg(all(feature = "app-update-fixture", debug_assertions))]
        let install = Install::fixture(super::default_install_root()?)?;
        #[cfg(not(all(feature = "app-update-fixture", debug_assertions)))]
        let install = Install::production(super::default_install_root()?)?;
        let recovery = super::macos_transaction::Journal::load(&install.root, &bundle)?;
        let privileged = super::macos_privileged::recovery_marker(&install.root, &bundle)?;
        if privileged.as_ref().is_some_and(|marker| marker.target != bundle) { return Err("E_APP_UPDATE_PRIVILEGED_JOURNAL".into()); }
        if !bundle.join("Contents/MacOS/ameow-updater").is_file() {
            return if recovery.is_some() { Err("E_APP_UPDATE_RECOVERY_HELPER_MISSING".into()) } else { Ok(None) };
        }
        super::macos_lease::acquire_for_process(&install.root)?;
        if let Some(journal) = &recovery {
            if journal.stage != super::macos_transaction::Stage::RolledBack || !journal.original_is_installed()? {
                start_recovery(&bundle, false)?;
                return Err("E_APP_UPDATE_RECOVERY_STARTED".into());
            }
        }
        let mut bytes = [0u8; 32];
        ring::rand::SecureRandom::fill(&ring::rand::SystemRandom::new(), &mut bytes)
            .map_err(|_| "E_APP_UPDATE_RANDOM")?;
        let nonce: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
        let ticket = Ticket { nonce: nonce.clone(), version: BUILD_VERSION.into(), install: install.root.clone(), bundle: Some(bundle), supervisor: None, privileged: None };
        let coordinator = std::sync::Arc::new(Coordinator::new(install.clone()));
        if let Some(marker) = &privileged {
            let failure = install.state()?.last_error.unwrap_or_else(|| "E_APP_UPDATE_AUTHORIZED_RECOVERY_REQUIRED".into());
            coordinator.set_state(super::Phase::Ready, Some(marker.release.version.clone()), Some(failure));
        }
        Ok(Some(Self {
            root: install.root.join(format!("direct-{nonce}")), ticket,
            coordinator,
            native_ready: AtomicBool::new(false), accepted: AtomicBool::new(true), quit: AtomicBool::new(false),
            sent_ready: AtomicBool::new(true), restart: AtomicBool::new(false), helper: Mutex::new(None),
            owner_sequence: AtomicU64::new(0),
            owner_attested: AtomicBool::new(false),
            window_progress: AtomicU64::new(0),
            accept_ack_sent: AtomicBool::new(false),
            recovery_required: privileged.is_some(),
            #[cfg(all(feature = "app-update-fixture", debug_assertions))] control: None,
        }))
    }
    pub fn from_env() -> Result<Option<Self>, String> {
        let Some(root) = std::env::var_os("AMEOW_LAUNCH_SESSION").map(PathBuf::from) else {
            #[cfg(target_os = "macos")]
            return Self::from_bundle();
            #[cfg(not(target_os = "macos"))]
            return Ok(None);
        };
        plain(&root)?;
        let ticket: Ticket = read_json(&root.join("ticket.json"))?;
        if root.parent() != Some(ticket.install.as_path()) || ticket.version != BUILD_VERSION {
            return Err("E_APP_UPDATE_BOOT_IDENTITY".into());
        }
        let expected = expected_executable(&ticket)?;
        if std::env::current_exe()
            .map_err(|e| e.to_string())?
            .canonicalize()
            .map_err(|e| e.to_string())?
            != expected
        {
            return Err("E_APP_UPDATE_BOOT_EXECUTABLE".into());
        }
        #[cfg(all(feature = "app-update-fixture", debug_assertions))]
        let install = Install::fixture(ticket.install.clone())?;
        #[cfg(not(all(feature = "app-update-fixture", debug_assertions)))]
        let install = Install::production(ticket.install.clone())?;
        #[cfg(target_os = "macos")]
        if ticket.bundle.is_some() {
            if ticket.supervisor.is_none_or(|pid| pid <= 1) { return Err("E_APP_UPDATE_BOOT_IDENTITY".into()); }
            if let Some(token) = &ticket.privileged {
                super::package::unhex(token, 32)?;
                let marker = super::macos_privileged::root_marker(ticket.bundle.as_ref().ok_or("E_APP_UPDATE_BOOT_IDENTITY")?)?
                    .ok_or("E_APP_UPDATE_PRIVILEGED_INDEX")?;
                if marker.token != *token || marker.release.version != ticket.version { return Err("E_APP_UPDATE_BOOT_IDENTITY".into()); }
            }
            super::macos_lease::acquire_for_process(&install.root)?;
        }
        Ok(Some(Self {
            root,
            ticket,
            coordinator: std::sync::Arc::new(Coordinator::new(install)),
            native_ready: AtomicBool::new(false),
            accepted: AtomicBool::new(false),
            quit: AtomicBool::new(false),
            sent_ready: AtomicBool::new(false),
            restart: AtomicBool::new(false),
            #[cfg(target_os = "macos")]
            helper: Mutex::new(None),
            #[cfg(target_os = "macos")]
            owner_sequence: AtomicU64::new(0),
            #[cfg(target_os = "macos")]
            owner_attested: AtomicBool::new(false),
            #[cfg(target_os = "macos")]
            window_progress: AtomicU64::new(0),
            #[cfg(target_os = "macos")]
            accept_ack_sent: AtomicBool::new(false),
            #[cfg(target_os = "macos")]
            recovery_required: false,
            #[cfg(all(feature = "app-update-fixture", debug_assertions))]
            control: {
                let args: Vec<_> = std::env::args().collect();
                args.windows(2)
                    .find(|p| p[0] == "--app-update-control")
                    .map(|p| PathBuf::from(&p[1]))
            },
        }))
    }
    pub fn commands_allowed(&self) -> bool {
        #[cfg(target_os = "macos")]
        if self.recovery_required { return false; }
        self.accepted.load(Ordering::Acquire) && !self.restart.load(Ordering::Acquire)
    }
    pub fn request_restart(&self) {
        self.restart.store(true, Ordering::Release);
    }
    #[cfg(target_os = "macos")]
    pub fn attest_download_owner(&self, ready: bool) {
        self.owner_attested.store(ready, Ordering::Release);
    }
    #[cfg(target_os = "macos")]
    pub fn attest_native_window(&self, ready: bool) {
        self.native_ready.store(ready, Ordering::Release);
        self.window_progress.store(if ready { monotonic_millis() } else { 0 }, Ordering::Release);
    }
    pub fn cancel_restart(&self, queue: &DownloadCoordinator) -> bool {
        if queue.cancel_app_update_drain() {
            #[cfg(target_os = "macos")]
            { self.helper.lock().unwrap().take(); }
            self.restart.store(false, Ordering::Release);
            true
        } else {
            false
        }
    }
    /// Runs on the existing background command owner, never on GPUI's foreground.
    pub fn poll(&self, queue: &DownloadCoordinator) -> Result<(), String> {
        let abort = read_json::<String>(&self.root.join("abort.json"))
            .is_ok_and(|v| v == self.ticket.nonce);
        if abort {
            queue.stop();
            if queue.snapshot().stopped {
                self.quit.store(true, Ordering::Release);
            }
            return Ok(());
        }
        let args: Vec<_> = std::env::args().collect();
        let suppress = cfg!(all(feature = "app-update-fixture", debug_assertions))
            && args
                .windows(2)
                .any(|p| p[0] == "--app-update-suppress-ready" && p[1] == BUILD_VERSION);
        #[cfg(target_os = "macos")]
        let owner_ready = if self.ticket.bundle.is_some() {
            let snapshot = queue.snapshot();
            let now = monotonic_millis();
            let window = self.window_progress.load(Ordering::Acquire);
            self.owner_attested.swap(false, Ordering::AcqRel)
                && queue.app_update_owner_is_active()
                && window != 0 && now.saturating_sub(window) <= 500
                && !snapshot.stopping && !snapshot.stopped && !snapshot.preparation_owner_lost
        } else { true };
        #[cfg(not(target_os = "macos"))]
        let owner_ready = true;
        if self.native_ready.load(Ordering::Acquire)
            && owner_ready
            && !suppress
            && !self.sent_ready.load(Ordering::Acquire)
        {
            atomic_json(
                &self.root.join("ready.json"),
                &Ready {
                    nonce: self.ticket.nonce.clone(),
                    version: BUILD_VERSION.into(),
                    pid: std::process::id(),
                },
            )?;
            self.sent_ready.store(true, Ordering::Release);
        }
        #[cfg(target_os = "macos")]
        if self.ticket.bundle.is_some() && !self.accepted.load(Ordering::Acquire) {
            let path = self.root.join("owner-ready.json");
            if self.native_ready.load(Ordering::Acquire) && owner_ready && !suppress {
                let sequence = self.owner_sequence.fetch_add(1, Ordering::Relaxed).saturating_add(1);
                atomic_json(&path, &OwnerReady { nonce: self.ticket.nonce.clone(),
                    version: BUILD_VERSION.into(), pid: std::process::id(), sequence })?;
            } else if path.exists() {
                std::fs::remove_file(path).map_err(|e| e.to_string())?;
            }
        }
        #[cfg(target_os = "macos")]
        let relaunching = self.ticket.bundle.is_some() && read_json::<String>(&self.root.join("relaunch.json"))
            .is_ok_and(|value| value == self.ticket.nonce);
        #[cfg(target_os = "macos")]
        if relaunching && !self.accepted.load(Ordering::Acquire)
            && owner_ready && self.native_ready.load(Ordering::Acquire)
        {
            if !self.accept_ack_sent.load(Ordering::Acquire) {
                atomic_json(&self.root.join("relaunch-ack.json"), &self.ticket.nonce)?;
                self.accept_ack_sent.store(true, Ordering::Release);
            }
            if read_json::<String>(&self.root.join("finalized.json")).is_ok_and(|value| value == self.ticket.nonce) {
                atomic_json(&self.root.join("final-ack.json"), &self.ticket.nonce)?;
                self.accepted.store(true, Ordering::Release);
            }
        }
        if !self.accepted.load(Ordering::Acquire)
            && read_json::<String>(&self.root.join("accepted.json"))
                .is_ok_and(|v| v == self.ticket.nonce)
        {
            #[cfg(target_os = "macos")]
            if self.ticket.bundle.is_some() {
                if owner_ready && self.native_ready.load(Ordering::Acquire) {
                    if !self.accept_ack_sent.load(Ordering::Acquire) {
                        atomic_json(&self.root.join("accept-ack.json"), &self.ticket.nonce)?;
                        self.accept_ack_sent.store(true, Ordering::Release);
                    }
                    if read_json::<String>(&self.root.join("committed.json"))
                        .is_ok_and(|value| value == self.ticket.nonce) {
                        if self.ticket.privileged.is_none() {
                            let bundle = self.ticket.bundle.as_ref().ok_or("E_APP_UPDATE_BOOT_IDENTITY")?;
                            let mut journal = super::macos_transaction::Journal::load(&self.ticket.install, bundle)?
                                .ok_or("E_APP_UPDATE_NO_RECOVERY")?;
                            journal.accept(&self.ticket.install)?;
                        }
                        #[cfg(all(feature = "app-update-fixture", debug_assertions))]
                        if std::env::var_os("AMEOW_UPDATE_TEST_CRASH_AT")
                            .is_some_and(|value| value == "candidate-after-accept") {
                            std::process::exit(87);
                        }
                        atomic_json(&self.root.join("commit-ack.json"), &self.ticket.nonce)?;
                        if self.ticket.privileged.is_none() || read_json::<String>(&self.root.join("finalized.json"))
                            .is_ok_and(|value| value == self.ticket.nonce) {
                            atomic_json(&self.root.join("final-ack.json"), &self.ticket.nonce)?;
                            self.accepted.store(true, Ordering::Release);
                        }
                    }
                }
            } else {
                self.accepted.store(true, Ordering::Release);
            }
            #[cfg(not(target_os = "macos"))]
            self.accepted.store(true, Ordering::Release);
        }
        #[cfg(target_os = "macos")]
        if !self.accepted.load(Ordering::Acquire)
            && let (Some(bundle), Some(supervisor)) = (&self.ticket.bundle, self.ticket.supervisor)
            && !super::macos_helper::process_alive(supervisor as i32)? {
            queue.stop();
            if queue.snapshot().stopped {
                if self.ticket.privileged.is_none() && !relaunching { start_recovery(bundle, true)?; }
                self.quit.store(true, Ordering::Release);
            }
            return Ok(());
        }
        #[cfg(all(feature = "app-update-fixture", debug_assertions))]
        if self.accepted.load(Ordering::Acquire)
            && let Some(control) = &self.control
        {
            #[derive(serde::Deserialize)]
            struct Request {
                version: String,
                action: String,
            }
            if read_json::<Request>(control)
                .is_ok_and(|v| v.version == BUILD_VERSION && v.action == "restart")
            {
                // A debug request is one-shot, including when the candidate rolls back.
                std::fs::remove_file(control).map_err(|e| e.to_string())?;
                self.request_restart();
            }
            if let Err(error) = atomic_json(
                &control.with_extension("state.json"),
                &self.coordinator.snapshot(),
            ) {
                // Optional fixture observations do not change the real update transaction.
                super::launcher::audit(&self.ticket.install, &format!("fixture-observation-write-failed: {error}"), BUILD_VERSION, Some(std::process::id()))?;
            }
        }
        #[cfg(target_os = "macos")]
        if self.restart.load(Ordering::Acquire) && let Some(bundle) = &self.ticket.bundle {
            let mut helper = self.helper.lock().map_err(|_| "E_APP_UPDATE_OWNER")?;
            if helper.is_none() { *helper = Some(MacHelper::start(bundle, &self.ticket.install)?); }
            let worker = helper.as_mut().ok_or("E_APP_UPDATE_HELPER")?;
            if !worker.poll_ready()? { return Ok(()); }
            let drained = if self.recovery_required {
                let drained = queue.drain_for_app_update();
                self.coordinator.set_state(if drained { super::Phase::Switching } else { super::Phase::WaitingForTasks },
                    self.coordinator.snapshot().version, None);
                drained
            } else { self.coordinator.request_restart(queue)? };
            if drained {
                worker.go()?;
                self.quit.store(true, Ordering::Release);
                helper.take();
            }
            return Ok(());
        }
        if self.restart.load(Ordering::Acquire) && self.coordinator.request_restart(queue)? {
            super::launcher::audit(
                &self.ticket.install,
                "queue-drained-before-restart",
                BUILD_VERSION,
                Some(std::process::id()),
            )?;
            atomic_json(&self.root.join("restart.json"), &self.ticket.nonce)?;
            self.quit.store(true, Ordering::Release);
        }
        Ok(())
    }
    #[cfg(target_os = "macos")]
    pub(crate) fn is_macos_bundle(&self) -> bool { self.ticket.bundle.is_some() }
    #[cfg(target_os = "macos")]
    pub(crate) fn requires_authorized_recovery(&self) -> bool {
        self.recovery_required || self.ticket.bundle.as_ref().is_some_and(|bundle|
            super::macos_privileged::recovery_marker(&self.ticket.install, bundle).is_ok_and(|value| value.is_some()))
    }
}

#[cfg(all(test, feature = "app-update-fixture", debug_assertions))]
mod fixture_tests {
    use super::*;
    #[test]
    fn optional_observation_failure_does_not_replace_a_ready_candidate() {
        let root = tempfile::tempdir().unwrap();
        let install = Install::fixture(root.path().join("install")).unwrap();
        let mut session = Session::for_test(install);
        std::fs::create_dir(&session.root).unwrap();
        let control = root.path().join("control.json");
        std::fs::create_dir(control.with_extension("state.json")).unwrap();
        session.control = Some(control);
        session.coordinator.set_state(super::super::Phase::Ready, Some("9.0.1".into()), None);
        let queue = DownloadCoordinator::update_test_queue(root.path());
        session.poll(&queue).unwrap();
        let snapshot = session.coordinator.snapshot();
        assert_eq!(snapshot.phase, super::super::Phase::Ready);
        assert!(snapshot.error.is_none());
        assert!(std::fs::read_to_string(session.ticket.install.join("launcher.jsonl")).unwrap().contains("fixture-observation-write-failed"));
    }
    #[test]
    fn restart_request_is_consumed_before_a_fallback_can_read_it_again() {
        let root = tempfile::tempdir().unwrap();
        let install = Install::fixture(root.path().join("install")).unwrap();
        super::super::tests::prepare(&install, "9.0.1", 1);
        let mut session = Session::for_test(install);
        std::fs::create_dir(&session.root).unwrap();
        let control = root.path().join("control.json");
        atomic_json(&control, &serde_json::json!({"version":BUILD_VERSION,"action":"restart"})).unwrap();
        session.control = Some(control.clone());
        let queue = DownloadCoordinator::update_test_queue(root.path());
        session.poll(&queue).unwrap();
        assert!(!control.exists());
        assert!(session.restart.load(Ordering::Acquire));
        session.restart.store(false, Ordering::Release);
        session.poll(&queue).unwrap();
        assert!(!session.restart.load(Ordering::Acquire));
    }
}

#[cfg(all(test, target_os = "macos"))]
mod macos_tests {
    use super::*;

    #[test]
    fn bundle_session_requires_the_exact_non_symlink_executable() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap();
        let bundle = root.join("Ameow.app");
        let macos = bundle.join("Contents/MacOS");
        std::fs::create_dir_all(&macos).unwrap();
        let executable = macos.join("ameow");
        std::fs::write(&executable, b"main").unwrap();
        let mut ticket = Ticket { nonce: "nonce".into(), version: BUILD_VERSION.into(),
            install: root.clone(), bundle: Some(bundle), supervisor: None, privileged: None };
        assert_eq!(expected_executable(&ticket).unwrap(), executable);
        std::fs::remove_file(&executable).unwrap();
        std::os::unix::fs::symlink(root.join("outside"), &executable).unwrap();
        assert_eq!(expected_executable(&ticket).unwrap_err(), "E_APP_UPDATE_REPARSE");
        ticket.bundle = Some(root.join("not-an-app"));
        assert_eq!(expected_executable(&ticket).unwrap_err(), "E_APP_UPDATE_BOOT_IDENTITY");
    }

    #[test]
    fn macos_trial_requires_fresh_window_and_download_owner_attestations() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap();
        let install = Install::fixture(root.join("install")).unwrap();
        let bundle = root.join("Ameow.app");
        let staged = root.join(".ameow-update-session").join("Ameow.app");
        std::fs::create_dir_all(&bundle).unwrap();
        std::fs::create_dir_all(&staged).unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(staged.parent().unwrap(), std::fs::Permissions::from_mode(0o700)).unwrap();
        std::fs::write(bundle.join("version"), b"old").unwrap();
        std::fs::write(staged.join("version"), b"new").unwrap();
        let mut journal = super::super::macos_transaction::Journal::create(
            &install.root, &bundle, &staged, "a".repeat(64),
        ).unwrap();
        journal.arm(&install.root).unwrap();
        journal.swap(&install.root).unwrap();
        journal.confirm_with(&install.root, || Ok(())).unwrap();
        let mut session = Session::for_test(install);
        session.ticket.bundle = Some(bundle.clone());
        session.accepted.store(false, Ordering::Release);
        std::fs::create_dir(&session.root).unwrap();
        let queue = DownloadCoordinator::update_test_queue(&root);
        session.attest_native_window(true);
        session.attest_download_owner(true);
        session.poll(&queue).unwrap();
        assert!(!session.root.join("ready.json").exists());
        let mut owner = queue.update_test_start_owner();
        let deadline = Instant::now() + Duration::from_secs(2);
        while queue.app_update_owner_progress() == 0 {
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(10));
        }
        session.attest_native_window(false);
        session.native_ready.store(true, Ordering::Release);
        session.attest_download_owner(true);
        session.poll(&queue).unwrap();
        assert!(!session.root.join("ready.json").exists());
        session.attest_native_window(true);
        session.poll(&queue).unwrap();
        assert!(!session.root.join("ready.json").exists());
        std::thread::sleep(Duration::from_millis(550));
        session.attest_download_owner(true);
        session.poll(&queue).unwrap();
        assert!(!session.root.join("ready.json").exists());
        session.attest_native_window(true);
        session.attest_download_owner(true);
        session.poll(&queue).unwrap();
        assert!(session.root.join("ready.json").exists());
        assert!(session.root.join("owner-ready.json").exists());
        queue.update_test_stop_owner();
        owner.join().unwrap();
        std::thread::sleep(Duration::from_millis(550));
        session.attest_native_window(true);
        session.attest_download_owner(true);
        session.poll(&queue).unwrap();
        assert!(!session.root.join("owner-ready.json").exists());
        let previous = queue.app_update_owner_progress();
        owner = queue.update_test_start_owner();
        let deadline = Instant::now() + Duration::from_secs(2);
        while queue.app_update_owner_progress() == previous {
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(10));
        }
        session.attest_download_owner(false);
        session.poll(&queue).unwrap();
        assert!(!session.root.join("owner-ready.json").exists());
        atomic_json(&session.root.join("accepted.json"), &session.ticket.nonce).unwrap();
        session.attest_native_window(true);
        session.attest_download_owner(true);
        session.poll(&queue).unwrap();
        assert!(session.root.join("accept-ack.json").exists());
        assert!(!session.commands_allowed());
        atomic_json(&session.root.join("committed.json"), &session.ticket.nonce).unwrap();
        session.attest_native_window(true);
        session.attest_download_owner(true);
        session.poll(&queue).unwrap();
        assert!(session.root.join("commit-ack.json").exists());
        assert!(session.commands_allowed());
        assert_eq!(super::super::macos_transaction::Journal::load(&session.ticket.install, &bundle)
            .unwrap().unwrap().stage, super::super::macos_transaction::Stage::Accepted);
        queue.update_test_stop_owner();
        owner.join().unwrap();
    }

    #[test]
    fn macos_relaunch_waits_for_native_owner_and_final_ack_without_accepting_a_candidate() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap();
        let install = Install::fixture(root.join("updates")).unwrap();
        let candidate = super::super::Release { version: "2.0.0".into(), sequence: 2, manifest_hash: "b".repeat(64) };
        let mut state = install.state().unwrap();
        state.pending = Some(candidate.clone());
        install.save(&state).unwrap();
        let mut session = Session::for_test(install.clone());
        session.ticket.bundle = Some(root.join("Ameow.app"));
        session.accepted.store(false, Ordering::Release);
        std::fs::create_dir(&session.root).unwrap();
        atomic_json(&session.root.join("relaunch.json"), &session.ticket.nonce).unwrap();
        let queue = DownloadCoordinator::update_test_queue(&root);
        session.attest_native_window(true);
        session.attest_download_owner(true);
        session.poll(&queue).unwrap();
        assert!(!session.root.join("relaunch-ack.json").exists());
        let owner = queue.update_test_start_owner();
        let deadline = Instant::now() + Duration::from_secs(2);
        while queue.app_update_owner_progress() == 0 {
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(10));
        }
        session.attest_native_window(true);
        session.attest_download_owner(true);
        session.poll(&queue).unwrap();
        assert!(session.root.join("ready.json").exists());
        assert!(session.root.join("relaunch-ack.json").exists());
        assert!(!session.commands_allowed());
        atomic_json(&session.root.join("finalized.json"), &"wrong nonce").unwrap();
        session.attest_native_window(true);
        session.attest_download_owner(true);
        session.poll(&queue).unwrap();
        assert!(!session.commands_allowed());
        atomic_json(&session.root.join("finalized.json"), &session.ticket.nonce).unwrap();
        session.attest_native_window(true);
        session.attest_download_owner(true);
        session.poll(&queue).unwrap();
        assert!(session.commands_allowed());
        assert!(session.root.join("final-ack.json").exists());
        assert!(!session.root.join("commit-ack.json").exists());
        assert_eq!(install.state().unwrap().pending.unwrap().manifest_hash, candidate.manifest_hash);
        queue.update_test_stop_owner();
        owner.join().unwrap();
    }

    #[test]
    fn recovery_waits_for_a_slow_helper_without_killing_it() {
        let child = Command::new("/bin/sh").args(["-c", "sleep 11; printf 'READY\\n'"])
            .stdout(Stdio::piped()).spawn().unwrap();
        assert!(wait_for_recovery_handshake(child).is_ok());
    }

    #[test]
    fn recovery_waits_for_helper_exit_after_an_error() {
        let root = tempfile::tempdir().unwrap();
        let marker = root.path().join("finished");
        let child = Command::new("/bin/sh").arg("-c")
            .arg("printf 'ERROR denied\\n'; sleep 0.2; touch \"$1\"")
            .arg("test").arg(&marker).stdout(Stdio::piped()).spawn().unwrap();
        assert_eq!(wait_for_recovery_handshake(child).unwrap_err(), "denied");
        assert!(marker.exists());
    }
}
