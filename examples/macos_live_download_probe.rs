#[cfg(target_os = "macos")]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    use ameow_next::download::{
        Phase, composition,
        request::{DownloadIntent, Quality},
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
    let coordinator = composition::coordinator(runtime);
    coordinator.accept(DownloadIntent {
        url: arguments[1].to_string_lossy().into_owned(),
        quality: Quality::Balanced,
        output_dir: PathBuf::from(&arguments[2]),
    })?;
    let mut revision = None;
    loop {
        let snapshot = coordinator.snapshot();
        if revision != Some(snapshot.revision) {
            println!("{}", serde_json::to_string(&snapshot)?);
            revision = Some(snapshot.revision);
        }
        if snapshot.phase.terminal() && snapshot.resources_released {
            if snapshot.phase == Phase::Success
                && (snapshot.delivered.is_some()
                    || snapshot.collection.as_ref().is_some_and(|collection| !collection.files.is_empty()))
            {
                return Ok(());
            }
            return Err("download did not complete successfully".into());
        }
        thread::sleep(Duration::from_millis(250));
    }
}

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("This probe requires macOS.");
    std::process::exit(1);
}
