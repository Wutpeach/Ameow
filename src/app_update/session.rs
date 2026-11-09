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
pub struct Session {
    root: PathBuf,
    ticket: Ticket,
    pub coordinator: std::sync::Arc<Coordinator>,
    pub native_ready: AtomicBool,
    pub accepted: AtomicBool,
    pub quit: AtomicBool,
    sent_ready: AtomicBool,
    restart: AtomicBool,
    #[cfg(all(feature = "app-update-fixture", debug_assertions))]
    control: Option<PathBuf>,
}
impl Session {
    #[cfg(test)]
    pub(super) fn for_test(install:Install)->Self {
        Self {root:install.root.join("test-session"),ticket:Ticket{nonce:"test".into(),version:BUILD_VERSION.into(),install:install.root.clone()},
            coordinator:std::sync::Arc::new(Coordinator::new(install)),native_ready:AtomicBool::new(false),accepted:AtomicBool::new(true),quit:AtomicBool::new(false),sent_ready:AtomicBool::new(false),restart:AtomicBool::new(false),
            #[cfg(all(feature="app-update-fixture",debug_assertions))] control:None}
    }
    pub fn from_env() -> Result<Option<Self>, String> {
        let Some(root) = std::env::var_os("AMEOW_LAUNCH_SESSION").map(PathBuf::from) else {
            return Ok(None);
        };
        plain(&root)?;
        let ticket: Ticket = read_json(&root.join("ticket.json"))?;
        if root.parent() != Some(ticket.install.as_path()) || ticket.version != BUILD_VERSION {
            return Err("E_APP_UPDATE_BOOT_IDENTITY".into());
        }
        let expected = ticket
            .install
            .join("versions")
            .join(&ticket.version)
            .join("Ameow.exe")
            .canonicalize()
            .map_err(|e| e.to_string())?;
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
        Ok(Some(Self {
            root,
            ticket,
            coordinator: std::sync::Arc::new(Coordinator::new(install)),
            native_ready: AtomicBool::new(false),
            accepted: AtomicBool::new(false),
            quit: AtomicBool::new(false),
            sent_ready: AtomicBool::new(false),
            restart: AtomicBool::new(false),
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
        self.accepted.load(Ordering::Acquire) && !self.restart.load(Ordering::Acquire)
    }
    pub fn request_restart(&self) {
        self.restart.store(true, Ordering::Release);
    }
    pub fn cancel_restart(&self, queue: &DownloadCoordinator) -> bool {
        if queue.cancel_app_update_drain() {
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
        if self.native_ready.load(Ordering::Acquire)
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
        if !self.accepted.load(Ordering::Acquire)
            && read_json::<String>(&self.root.join("accepted.json"))
                .is_ok_and(|v| v == self.ticket.nonce)
        {
            self.accepted.store(true, Ordering::Release);
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
                self.request_restart();
            }
            atomic_json(
                &control.with_extension("state.json"),
                &self.coordinator.snapshot(),
            )?;
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
}
