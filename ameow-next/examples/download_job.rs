use ameow_next::download::{
    request::{DownloadIntent, Quality},
    runtime::RuntimeManager,
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
    let runtime = value("--runtime-root")
        .map(PathBuf::from)
        .map_or_else(RuntimeManager::default_root, Ok)?;
    let quality = match value("--quality").as_deref() {
        None | Some("highest") => Quality::Highest,
        Some("balanced") => Quality::Balanced,
        Some("saver") => Quality::Saver,
        _ => return Err("invalid quality".into()),
    };
    let coordinator = ameow_next::download::composition::coordinator(runtime);
    let job = coordinator.accept(DownloadIntent {
        url: value("--url").ok_or("--url required")?,
        quality,
        output_dir: PathBuf::from(value("--output").ok_or("--output required")?),
    })?;
    let cancel = value("--cancel-after-ms")
        .map(|s| s.parse::<u64>())
        .transpose()?;
    let start = Instant::now();
    let mut revision = 0;
    let mut cancelled = false;
    loop {
        let snapshot = coordinator.snapshot();
        if snapshot.revision != revision {
            println!("{}", serde_json::to_string(&snapshot)?);
            revision = snapshot.revision;
        }
        if snapshot.phase.terminal() {
            if snapshot.phase != ameow_next::download::Phase::Success {
                return Err(snapshot.message.into());
            }
            break;
        }
        if !cancelled && cancel.is_some_and(|ms| start.elapsed().as_millis() >= ms as u128) {
            coordinator.cancel(job);
            cancelled = true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    Ok(())
}
