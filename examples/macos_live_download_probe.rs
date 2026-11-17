#[cfg(target_os = "macos")]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    use ameow_next::download::{
        composition,
        preparation::PreparationPhase,
        queue::JobPhase,
        request::Quality,
        settings::Settings,
        runtime::RuntimeManager,
    };
    use std::{path::PathBuf, thread, time::Duration};

    let arguments: Vec<_> = std::env::args_os().collect();
    if !(3..=4).contains(&arguments.len()) {
        return Err("usage: macos_live_download_probe <URL> <output directory> [runtime directory]".into());
    }
    let runtime = match arguments.get(3) {
        Some(path) => PathBuf::from(path),
        None => RuntimeManager::default_root()?,
    };
    let isolated = tempfile::tempdir()?;
    let settings = Settings {
        quality: Quality::Balanced,
        output_dir: PathBuf::from(&arguments[2]),
        theme: Default::default(), language: Default::default(), tray_icon: Default::default(),
    };
    let coordinator = composition::download_coordinator(
        runtime, isolated.path().join("settings.json"), settings.clone(),
    )?;
    let result = (|| -> Result<(), Box<dyn std::error::Error>> {
        coordinator.save_settings(settings)?;
        let job = coordinator.submit(arguments[1].to_string_lossy().into_owned())?;
        let mut revision = None;
        loop {
            let snapshot = coordinator.snapshot();
            if revision != Some(snapshot.revision) {
                println!("{}", serde_json::to_string(&snapshot)?);
                revision = Some(snapshot.revision);
            }
            let item = snapshot.jobs.iter().find(|item| item.job_id == job).ok_or("Job missing")?;
            if item.phase.terminal() {
                if item.phase == JobPhase::Success
                    && item.resources_released
                    && (item.delivered.is_some()
                        || item.collection.as_ref().is_some_and(|collection| !collection.files.is_empty()))
                {
                    return Ok(());
                }
                return Err("download did not complete successfully".into());
            }
            if snapshot.preparation.phase == PreparationPhase::Failed {
                return Err("Shared runtime preparation failed; see queue snapshot".into());
            }
            thread::sleep(Duration::from_millis(250));
        }
    })();
    coordinator.stop();
    while !coordinator.snapshot().stopped {
        thread::sleep(Duration::from_millis(50));
    }
    println!("{}", serde_json::to_string(&coordinator.snapshot())?);
    result
}

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("This probe requires macOS.");
    std::process::exit(1);
}
