//! Application updates are independent of managed media components and user data.
//! No public publisher key is provisioned yet: production acquisition fails closed.
pub mod launcher;
pub mod release;
mod package;
pub mod service;
pub mod session;
mod store;
use crate::download::queue::DownloadCoordinator;
#[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
pub use package::fixture_envelope;
pub use package::hash;
pub use package::{BUILD_VERSION, Manifest, SignedManifest, TARGET, Trust, Version};
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Mutex};
pub use store::{Install, Release, State};

#[cfg(all(feature = "app-update-fixture", not(debug_assertions)))]
compile_error!("app-update-fixture must never be used in a release build");

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum Phase {
    #[default]
    Unchecked,
    NoUpdate,
    Available,
    Unavailable,
    Checking,
    Downloading,
    Verifying,
    Ready,
    WaitingForTasks,
    Switching,
    Failed,
    RolledBack,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Snapshot {
    pub phase: Phase,
    pub version: Option<String>,
    pub error: Option<String>,
    #[serde(default)]
    pub downloaded: u64,
    #[serde(default)]
    pub total: Option<u64>,
}
/// One command owner; all future surfaces read this projection and use these actions.
pub struct Coordinator {
    install: Install,
    view: Mutex<Snapshot>,
    operation: Mutex<()>,
    restart_release: Mutex<Option<(String, std::fs::File)>>,
}
impl Coordinator {
    pub fn new(install: Install) -> Self {
        let view = match install.state() {
            Ok(state) if state.last_error.is_some() => Snapshot {
                phase: Phase::RolledBack,
                version: state.current.map(|r| r.version),
                error: state.last_error,
                ..Default::default()
            },
            Ok(state) if state.pending.is_some() => Snapshot {
                phase: Phase::Ready,
                version: state.pending.map(|r| r.version),
                error: None,
                ..Default::default()
            },
            Ok(_) => Snapshot::default(),
            Err(error) => Snapshot {
                phase: Phase::Failed,
                version: None,
                error: Some(error),
                ..Default::default()
            },
        };
        Self {
            install,
            view: Mutex::new(view),
            operation: Mutex::new(()),
            restart_release: Mutex::new(None),
        }
    }
    pub fn snapshot(&self) -> Snapshot {
        self.view.lock().unwrap().clone()
    }
    fn publish(&self, phase: Phase, version: Option<String>, error: Option<String>) {
        *self.view.lock().unwrap() = Snapshot {
            phase,
            version,
            error,
            ..Default::default()
        };
    }
    /// The checker supplies a signed envelope, never an arbitrary executable URL.
    pub fn set_state(&self, phase: Phase, version: Option<String>, error: Option<String>) {
        self.publish(phase, version, error);
    }
    pub fn install(&self) -> &Install {
        &self.install
    }
    pub fn prepare(&self, envelope: &[u8]) -> Result<(), String> {
        let _operation = self.operation.lock().map_err(|_| "E_APP_UPDATE_OWNER")?;
        self.publish(Phase::Checking, None, None);
        let result = self.install.prepare_https(envelope, |phase, version| {
            self.publish(phase, Some(version), None)
        });
        if let Err(error) = &result {
            self.publish(Phase::Failed, None, Some(error.clone()));
        }
        result
    }
    pub fn no_update(&self) {
        let _operation = self.operation.lock().unwrap();
        self.publish(Phase::NoUpdate, None, None);
    }
    /// Does not cancel jobs. Admission closes atomically with settings persistence.
    /// Only the real queue's stopped acknowledgement permits application exit.
    pub fn request_restart(&self, queue: &DownloadCoordinator) -> Result<bool, String> {
        let _operation = self.operation.lock().map_err(|_| "E_APP_UPDATE_OWNER")?;
        let release=self.guard_pending()?;
        let safe = queue.drain_for_app_update();
        self.publish(
            if safe { Phase::Switching } else { Phase::WaitingForTasks },
            Some(release.version),None,
        );
        Ok(safe)
    }
    /// Hash the candidate on the command owner before acquiring any UI/activity gates.
    pub(crate) fn prepare_restart(&self)->Result<(),String>{
        let _operation=self.operation.lock().map_err(|_|"E_APP_UPDATE_OWNER")?;
        self.guard_pending().map(|_|())
    }
    fn guard_pending(&self)->Result<Release,String>{
        let state = self.install.state()?;
        let release = state.pending.as_ref().ok_or("E_APP_UPDATE_NOT_READY")?;
        let mut verified = self
            .restart_release
            .lock()
            .map_err(|_| "E_APP_UPDATE_OWNER")?;
        if verified.as_ref().map(|(digest, _)| digest) != Some(&release.manifest_hash) {
            *verified = Some((
                release.manifest_hash.clone(),
                self.install.verify_release(release)?,
            ));
        }
        Ok(release.clone())
    }
}

pub fn default_install_root() -> Result<PathBuf, String> {
    Ok(
        PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("E_APP_UPDATE_LOCALAPPDATA")?)
            .join("Programs/Ameow"),
    )
}
/// Installed versions always register the stable launcher, even after a switch.
/// Uninstalled developer builds keep their current executable as the entry.
pub fn startup_entry() -> Result<PathBuf, String> {
    startup_entry_for(&std::env::current_exe().map_err(|e| e.to_string())?)
}
pub fn startup_entry_for(exe: &std::path::Path) -> Result<PathBuf, String> {
    if let Some(versions) = exe.parent().and_then(|p| p.parent())
        && versions.file_name().is_some_and(|p| p == "versions")
    {
        let entry = versions
            .parent()
            .ok_or("E_APP_UPDATE_LAYOUT")?
            .join("AmeowLauncher.exe");
        if !entry.is_file() {
            return Err("E_APP_UPDATE_LAUNCHER_MISSING".into());
        }
        return Ok(entry);
    }
    Ok(exe.to_path_buf())
}
#[cfg(test)]
mod tests;
