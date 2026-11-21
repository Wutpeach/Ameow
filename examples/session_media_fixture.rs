//! Synthetic browser-session media fixture; not a general development entry.
use ameow_next::download::{
    preparation::PreparationPhase,
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
            .position(|s| s == name)
            .and_then(|i| args.get(i + 1))
            .cloned()
    };
    let runtime = PathBuf::from(value("--runtime-root").ok_or("synthetic fixture requires --runtime-root")?);
    if !runtime.is_absolute() { return Err("synthetic runtime root must be absolute".into()); }
    let _port = value("--app-update-fixture-media-port").and_then(|p| p.parse::<u16>().ok()).filter(|p| *p != 0)
        .ok_or("synthetic fixture requires a fixed local media port")?;
    if !value("--app-update-fixture-dir").is_some_and(|p| std::path::Path::new(&p).is_dir()) { return Err("synthetic fixture directory missing".into()); }
    let instance = runtime.parent().ok_or("fixture instance root missing")?;
    let selected = ameow_next::control::isolated_root(&["--instance-root".into(), instance.to_string_lossy().into_owned()])?
        .ok_or("fixture instance root missing")?;
    if runtime.canonicalize()? != selected.join("runtime").canonicalize()? { return Err("runtime must belong to the selected isolated fixture".into()); }
    let quality = match value("--quality").as_deref() {
        None | Some("highest") => Quality::Highest,
        Some("balanced") => Quality::Balanced,
        Some("saver") => Quality::Saver,
        _ => return Err("invalid quality".into()),
    };
    let url = value("--url").ok_or("--url required")?;
    if !matches!(url.as_str(), "http://example.com/ameow-issue33-1.mp4" | "http://example.com/ameow-issue33-2.mp4" | "http://example.com/ameow-issue33-3.mp4") { return Err("only fixed synthetic media URLs are supported".into()); }
    let settings = Settings {
        quality,
        output_dir: PathBuf::from(value("--output").ok_or("--output required")?),
        theme: Default::default(), language: Default::default(), tray_icon: Default::default(), shortcut: Default::default(),
    };
    let cancel = value("--cancel-after-ms")
        .map(|s| s.parse::<u64>())
        .transpose()?;
    let cancel_after_progress = value("--cancel-after-progress-ms")
        .map(|s| s.parse::<u64>()).transpose()?;
    // Keep probe settings separate from both the user's defaults and the runtime cache.
    let isolated = tempfile::tempdir()?;
    let coordinator = ameow_next::download::composition::download_coordinator(
        runtime, isolated.path().join("settings.json"), settings.clone(),
    )?;
    let result = (|| -> Result<(), Box<dyn std::error::Error>> {
        coordinator.save_settings(settings)?;
        let clip = match (value("--start-ms"), value("--end-ms")) {
            (Some(start), Some(end)) => Some(ameow_next::download::request::ClipRange { start_ms: start.parse()?, end_ms: end.parse()? }.validate()?),
            (None, None) => None,
            _ => return Err("both --start-ms and --end-ms are required".into()),
        };
        let job = coordinator.submit_clip(url, None, None, clip)?;
        let start = Instant::now();
        let mut revision = None;
        let mut cancelled = false;
        let mut progress_started = None;
        loop {
            let snapshot = coordinator.snapshot();
            if revision != Some(snapshot.revision) {
                println!("{}", serde_json::to_string(&snapshot)?);
                revision = Some(snapshot.revision);
            }
            let item = snapshot.jobs.iter().find(|item| item.job_id == job).ok_or("Job missing")?;
            if item.transfer_progress.as_ref().is_some_and(|p| p.fraction.is_some()) {
                progress_started.get_or_insert_with(Instant::now);
            }
            if item.phase.terminal() {
                if item.phase != JobPhase::Success {
                    if let Some(path) = value("--diagnostic-output")
                        && let ameow_next::download::queue::CommandReply::Diagnostic(text) = coordinator.apply(
                            ameow_next::download::queue::QueueCommand::CopyDiagnostic(job),
                        )
                    {
                        std::fs::write(path, text)?;
                    }
                    return Err(item.message.clone().into());
                }
                return Ok(());
            }
            if snapshot.preparation.phase == PreparationPhase::Failed {
                return Err("Shared runtime preparation failed; see queue snapshot".into());
            }
            if !cancelled && (cancel.is_some_and(|ms| start.elapsed().as_millis() >= ms as u128)
                || cancel_after_progress.zip(progress_started).is_some_and(|(ms, at)| at.elapsed().as_millis() >= ms as u128)) {
                coordinator.cancel(job);
                cancelled = true;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
    })();
    coordinator.stop();
    while !coordinator.snapshot().stopped {
        std::thread::sleep(Duration::from_millis(50));
    }
    println!("{}", serde_json::to_string(&coordinator.snapshot())?);
    result
}
