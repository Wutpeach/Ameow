//! Explicit local Windows evidence helper; uses the real queue and runtime owners.
use ameow_next::download::{composition, preparation::PreparationPhase, queue::{CommandReply, QueueCommand}, request::Quality, runtime_update::RuntimeUpdatePhase, settings::Settings, upstream};
use std::{path::PathBuf, time::{Duration, Instant}};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    let value = |key: &str| args.iter().position(|a| a == key).and_then(|i| args.get(i + 1)).cloned();
    if args.iter().any(|arg| arg == "--query") {
        println!("{}", serde_json::json!({"event":"pypi","result":format!("{:?}", upstream::query_latest())}));
        return Ok(());
    }
    let root = PathBuf::from(value("--runtime-root").ok_or("--runtime-root required")?);
    let output = PathBuf::from(value("--output").ok_or("--output required")?);
    let action = value("--action").unwrap_or_else(|| "verify".into());
    let backend = composition::download_coordinator(root.clone(), root.join("probe-settings.json"), Settings {quality:Quality::Saver, output_dir:output, theme:Default::default(), language:Default::default(), tray_icon:Default::default()})?;
    let started = Instant::now();
    let mut last = None;
    let mut admitted = false;
    let mut stopping = false;
    let mut failure = false;
    loop {
        let view = backend.snapshot();
        let key = (view.preparation.phase, view.runtime_update.clone(), view.active_slots, view.stopped);
        if last.as_ref() != Some(&key) {
            println!("{}", serde_json::json!({"elapsed_ms":started.elapsed().as_millis(),"preparation":view.preparation,"update":view.runtime_update,"versions":view.verified_runtime_versions,"active_slots":view.active_slots,"stopped":view.stopped}));
            last = Some(key);
        }
        let settled = !view.preparing && view.preparation.phase == PreparationPhase::Ready;
        if !admitted && !stopping && (settled || view.runtime_update.phase == RuntimeUpdatePhase::RecoveryRequired) {
            admitted = true;
            let command = match action.as_str() {
                "upgrade" => Some(QueueCommand::UpgradeEngine {version:value("--version").ok_or("--version required")?}),
                "restore" => Some(QueueCommand::RestoreRecommended),
                "verify" => None,
                _ => return Err("Unknown --action".into()),
            };
            if let Some(command) = command {
                let reply = backend.apply(command);
                println!("{}", serde_json::json!({"event":"admission","reply":format!("{reply:?}")}));
                if !matches!(reply, CommandReply::Applied(true)) {failure=true; backend.stop(); stopping=true;}
                else {continue;} // Observe this command's state before considering a prior Activated snapshot.
            } else {
                failure = view.runtime_update.phase == RuntimeUpdatePhase::RecoveryRequired;
                backend.stop(); stopping=true;
            }
        }
        if admitted && !stopping && matches!(view.runtime_update.phase, RuntimeUpdatePhase::Activated | RuntimeUpdatePhase::Failed | RuntimeUpdatePhase::RolledBack | RuntimeUpdatePhase::RecoveryRequired) {
            failure = view.runtime_update.phase != RuntimeUpdatePhase::Activated;
            backend.stop(); stopping=true;
        }
        if !admitted && !view.preparing && view.preparation.phase == PreparationPhase::Failed {failure=true; backend.stop(); stopping=true;}
        if view.stopped {break;}
        if started.elapsed() > Duration::from_secs(600) { return Err("Native owner has not settled within the evidence deadline; preserve process for investigation".into()); }
        std::thread::sleep(Duration::from_millis(40));
    }
    if failure {Err("Runtime action did not complete; see preserved snapshots".into())} else {Ok(())}
}
