//! Stable entry owns the child process until exit; it never overwrites a live EXE.
use super::{
    Install, Release,
    store::{atomic_json, exclusive, read_json},
};
use serde::{Deserialize, Serialize};
use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::Path,
    process::Command,
    time::{Duration, Instant},
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Ticket {
    pub nonce: String,
    pub version: String,
    pub install: std::path::PathBuf,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Ready {
    pub nonce: String,
    pub version: String,
    pub pid: u32,
}
pub(crate) fn audit(
    root: &Path,
    event: &str,
    version: &str,
    pid: Option<u32>,
) -> Result<(), String> {
    let mut log = OpenOptions::new()
        .append(true)
        .create(true)
        .open(root.join("launcher.jsonl"))
        .map_err(|e| e.to_string())?;
    writeln!(log, "{}", serde_json::json!({"time": super::store::now(), "event": event, "version":version, "pid":pid})).and_then(|_| log.sync_all()).map_err(|e| e.to_string())
}
fn rollback(install: &Install) -> Result<(), String> {
    let _lock = install.lock()?;
    let mut state = install.load()?;
    if let Some(trial) = state.trial.take() {
        if !state.failed.contains(&trial.manifest_hash) {
            state.failed.push(trial.manifest_hash);
        }
        // Keep a bounded failure ledger; the monotonic sequence also rejects older trials.
        if state.failed.len() > 32 {
            state.failed.remove(0);
        }
        state.pending = None;
        state.last_error = Some(format!(
            "E_APP_UPDATE_ROLLED_BACK: {} did not become Ready",
            trial.version
        ));
        install.save(&state)?;
        audit(&install.root, "rolled-back", &trial.version, None)?;
    }
    Ok(())
}
fn recover_current(install: &Install, release: &Release) -> Result<bool, String> {
    let _lock = install.lock()?;
    let mut state = install.load()?;
    let Some(previous) = state.previous.take() else {
        return Ok(false);
    };
    install.verify_release(&previous)?;
    state.failed.push(release.manifest_hash.clone());
    if state.failed.len() > 32 {
        state.failed.remove(0);
    }
    state.current = Some(previous);
    state.last_error = Some(format!(
        "E_APP_UPDATE_ROLLED_BACK: {} failed on subsequent startup",
        release.version
    ));
    install.save(&state)?;
    audit(
        &install.root,
        "current-version-rolled-back",
        &release.version,
        None,
    )?;
    Ok(true)
}
fn select(install: &Install) -> Result<(Release, bool), String> {
    let _lock = install.lock()?;
    let mut state = install.load()?;
    if let Some(pending) = state.pending.take() {
        if state.failed.contains(&pending.manifest_hash) {
            return Err("E_APP_UPDATE_FAILED_TRIAL".into());
        }
        state.trial = Some(pending.clone());
        install.save(&state)?;
        Ok((pending, true))
    } else {
        Ok((
            state.current.ok_or("E_APP_UPDATE_NO_CURRENT_VERSION")?,
            false,
        ))
    }
}
fn commit_ready(install: &Install, release: &Release, trial: bool) -> Result<(), String> {
    if !trial {
        return Ok(());
    }
    let _lock = install.lock()?;
    let mut state = install.load()?;
    if state.trial.as_ref().map(|r| &r.manifest_hash) != Some(&release.manifest_hash) {
        return Err("E_APP_UPDATE_TRIAL_CHANGED".into());
    }
    state.previous = state.current.take();
    state.current = Some(release.clone());
    state.trial = None;
    state.last_error = None;
    install.save(&state)
}
pub fn run(install: Install, args: &[String], ready_timeout: Duration) -> Result<(), String> {
    let _running = match exclusive(&install.root.join("running.lock")) {
        Ok(lock) => lock,
        Err(error) => {
            #[cfg(windows)]
            if let Ok(crate::login_startup::InstanceAcquire::Duplicate) =
                crate::login_startup::InstanceGuard::acquire_with_restore(
                    !args.iter().any(|a| a == "--login-startup"),
                )
            {
                return Ok(());
            }
            return Err(error);
        }
    };
    // A direct developer app may own the shared identity independently of this launcher.
    #[cfg(windows)]
    match crate::login_startup::InstanceGuard::acquire_with_restore(
        !args.iter().any(|a| a == "--login-startup"),
    )? {
        crate::login_startup::InstanceAcquire::Duplicate => return Ok(()),
        crate::login_startup::InstanceAcquire::Primary(guard) => drop(guard),
    }
    // An interrupted launcher never retries an unconfirmed candidate automatically.
    rollback(&install)?;
    loop {
        let (release, trial) = select(&install)?;
        let _exe_guard: File = match install.verify_release(&release) {
            Ok(guard) => guard,
            Err(error) => {
                audit(&install.root, "executable-rejected", &release.version, None)?;
                if trial {
                    rollback(&install)?;
                    if install.state()?.current.is_some() {
                        continue;
                    }
                } else if recover_current(&install, &release)? {
                    continue;
                }
                return Err(error);
            }
        };
        let mut random = [0; 32];
        ring::rand::SecureRandom::fill(&ring::rand::SystemRandom::new(), &mut random)
            .map_err(|_| "E_APP_UPDATE_RANDOM")?;
        let boot = tempfile::Builder::new()
            .prefix("boot-")
            .tempdir_in(&install.root)
            .map_err(|e| e.to_string())?;
        let ticket = Ticket {
            nonce: random.iter().map(|b| format!("{b:02x}")).collect(),
            version: release.version.clone(),
            install: install.root.clone(),
        };
        atomic_json(&boot.path().join("ticket.json"), &ticket)?;
        let mut command = Command::new(install.release_dir(&release.version)?.join("Ameow.exe"));
        command.args(args).env("AMEOW_LAUNCH_SESSION", boot.path());
        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                audit(&install.root, "spawn-failed", &release.version, None)?;
                if trial {
                    rollback(&install)?;
                    continue;
                }
                if recover_current(&install, &release)? {
                    continue;
                }
                return Err(format!("E_APP_UPDATE_SPAWN: {error}"));
            }
        };
        audit(&install.root, "spawned", &release.version, Some(child.id()))?;
        let deadline = Instant::now() + ready_timeout;
        let mut ready = false;
        let mut abort = false;
        let mut first_ready = None;
        let status = loop {
            if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                break status;
            }
            if !ready && !abort {
                let candidate: Result<Ready, _> = read_json(&boot.path().join("ready.json"));
                if candidate.is_ok_and(|r| {
                    r.nonce == ticket.nonce && r.version == release.version && r.pid == child.id()
                }) {
                    let observed = first_ready.get_or_insert_with(Instant::now);
                    if observed.elapsed() < Duration::from_millis(800) {
                        std::thread::sleep(Duration::from_millis(40));
                        continue;
                    }
                    // Recheck liveness before committing the durable current pointer.
                    if child.try_wait().map_err(|e| e.to_string())?.is_none() {
                        commit_ready(&install, &release, trial)?;
                        atomic_json(&boot.path().join("accepted.json"), &ticket.nonce)?;
                        ready = true;
                        audit(&install.root, "ready", &release.version, Some(child.id()))?;
                    }
                } else if Instant::now() >= deadline {
                    abort = true;
                    atomic_json(&boot.path().join("abort.json"), &ticket.nonce)?;
                    audit(
                        &install.root,
                        "ready-timeout-waiting-for-safe-exit",
                        &release.version,
                        Some(child.id()),
                    )?;
                    // Never kill a process to manufacture a resource-release acknowledgement.
                    // If it cannot exit, this launcher holds the lease and rollback waits.
                }
            }
            std::thread::sleep(Duration::from_millis(40));
        };
        audit(
            &install.root,
            if status.success() {
                "exited"
            } else {
                "exit-failed"
            },
            &release.version,
            Some(child.id()),
        )?;
        if !ready {
            if trial {
                rollback(&install)?;
                if install.state()?.current.is_some() {
                    continue;
                }
            } else if recover_current(&install, &release)? {
                continue;
            }
            return Err("E_APP_UPDATE_NOT_READY".into());
        }
        let restart = read_json::<String>(&boot.path().join("restart.json"))
            .is_ok_and(|nonce| nonce == ticket.nonce);
        if !restart {
            return Ok(());
        }
        audit(
            &install.root,
            "restart-requested-after-process-exit",
            &release.version,
            Some(child.id()),
        )?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_update::{Coordinator, Phase, tests::prepare};
    #[test]
    fn interrupted_trial_rolls_back_once_without_changing_current_or_user_data() {
        let root = tempfile::tempdir().unwrap();
        let install = Install::fixture(root.path().join("program")).unwrap();
        std::fs::write(root.path().join("user-data"), b"sentinel").unwrap();
        prepare(&install, "0.1.0", 1);
        let (baseline, trial) = select(&install).unwrap();
        assert!(trial);
        commit_ready(&install, &baseline, trial).unwrap();
        prepare(&install, "0.1.1", 2);
        let (candidate, _) = select(&install).unwrap();
        // Durable trial survives launcher/process failure before Ready.
        rollback(&install).unwrap();
        rollback(&install).unwrap();
        let state = install.state().unwrap();
        assert_eq!(state.current.unwrap().version, "0.1.0");
        assert_eq!(state.failed, vec![candidate.manifest_hash]);
        assert!(state.pending.is_none() && state.trial.is_none());
        assert_eq!(
            Coordinator::new(install).snapshot().phase,
            Phase::RolledBack
        );
        assert_eq!(
            std::fs::read(root.path().join("user-data")).unwrap(),
            b"sentinel"
        );
    }
    #[test]
    fn subsequent_startup_failure_uses_previous_once_and_cannot_cycle() {
        let root = tempfile::tempdir().unwrap();
        let install = Install::fixture(root.path().into()).unwrap();
        prepare(&install, "0.1.0", 1);
        let (old, trial) = select(&install).unwrap();
        commit_ready(&install, &old, trial).unwrap();
        prepare(&install, "0.1.1", 2);
        let (new, trial) = select(&install).unwrap();
        commit_ready(&install, &new, trial).unwrap();
        assert!(recover_current(&install, &new).unwrap());
        assert_eq!(install.state().unwrap().current.unwrap().version, "0.1.0");
        assert!(!recover_current(&install, &old).unwrap());
        assert_eq!(install.state().unwrap().failed, vec![new.manifest_hash]);
    }
}
