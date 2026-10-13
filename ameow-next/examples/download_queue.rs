//! Local evidence helper using the real logical coordinator. JSON output contains local paths.
use ameow_next::download::{
    queue::JobPhase,
    request::Quality,
    settings::Settings,
};
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    let value = |name: &str| {
        args.iter()
            .position(|arg| arg == name)
            .and_then(|index| args.get(index + 1))
            .cloned()
    };
    let root = PathBuf::from(value("--runtime-root").ok_or("--runtime-root required")?);
    let output = PathBuf::from(value("--output").ok_or("--output required")?);
    let settings_path = value("--settings")
        .map(PathBuf::from)
        .unwrap_or_else(|| root.join("queue-defaults.json"));
    let quality = match value("--quality").as_deref() {
        None | Some("saver") => Quality::Saver,
        Some("balanced") => Quality::Balanced,
        Some("highest") => Quality::Highest,
        _ => return Err("Unknown quality".into()),
    };
    let backend = ameow_next::download::composition::download_coordinator(
        root,
        settings_path,
        Settings {
            quality,
            output_dir: output.clone(),
        },
    )?;
    backend.save_settings(Settings {
        quality,
        output_dir: output,
    })?;
    let urls: Vec<_> = args
        .iter()
        .enumerate()
        .filter(|(_, arg)| arg.as_str() == "--url")
        .filter_map(|(index, _)| args.get(index + 1))
        .cloned()
        .collect();
    if urls.is_empty() {
        return Err("At least one --url required".into());
    }
    for url in &urls {
        let job = backend.submit(url.clone())?;
        println!("{}", serde_json::json!({"event":"submitted","job":job}));
    }
    if args.iter().any(|arg| arg == "--duplicate-first") {
        println!(
            "{}",
            serde_json::json!({"event":"active_duplicate","result":backend.submit(urls[0].clone())})
        );
    }
    let cancel_job = value("--cancel-job")
        .map(|s| s.parse::<u64>())
        .transpose()?;
    let cancel_ms = value("--cancel-after-ms")
        .map(|s| s.parse::<u64>())
        .transpose()?
        .unwrap_or(1000);
    let stop_ms = value("--stop-after-ms")
        .map(|s| s.parse::<u64>())
        .transpose()?;
    let start = Instant::now();
    let mut revision = u64::MAX;
    let mut cancelled = false;
    let mut stopping = false;
    loop {
        let view = backend.snapshot();
        if view.revision != revision {
            println!("{}", serde_json::to_string(&view)?);
            revision = view.revision;
        }
        if !cancelled && start.elapsed().as_millis() >= cancel_ms as u128 {
            if let Some(job) = cancel_job {
                println!(
                    "{}",
                    serde_json::json!({"event":"cancel","job":job,"applied":backend.cancel(job)})
                );
            }
            cancelled = true;
        }
        if !stopping
            && (view.unfinished == 0
                || stop_ms.is_some_and(|ms| start.elapsed().as_millis() >= ms as u128))
        {
            backend.stop();
            stopping = true;
        }
        if view.stopped {
            for job in &view.jobs {
                if job.phase == JobPhase::Failure {
                    println!(
                        "{}",
                        serde_json::json!({"event":"safe_diagnostic","job":job.job_id,"text":backend.diagnostic(job.job_id)?})
                    );
                }
            }
            println!(
                "{}",
                serde_json::json!({"event":"stopped","success":view.jobs.iter().filter(|j|j.phase==JobPhase::Success).count(),"failure":view.failures,"active_slots":view.active_slots})
            );
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    Ok(())
}
