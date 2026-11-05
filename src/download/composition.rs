//! The only production composition that chooses a concrete downloader.
use super::{
    Coordinator,
    adapter::DownloadServices,
    adapters::automatic::AutomaticAdapter,
    queue::DownloadCoordinator,
    runtime::{RuntimeManager, TrustedRuntimeRequirements},
    settings::Settings,
    verification::VerifierRegistry,
};
use std::{path::PathBuf, sync::Arc};

pub fn requirements() -> TrustedRuntimeRequirements {
    TrustedRuntimeRequirements::compiled(
        &[
            (
                "yt-dlp.exe",
                &["--ignore-config", "--no-plugin-dirs", "--version"],
            ),
            ("gallery-dl.exe", &["--ignore-config", "--version"]),
            ("deno.exe", &["--version"]),
            ("ffmpeg.exe", &["-version"]),
            ("ffprobe.exe", &["-version"]),
        ],
        &[
            ("DENO_DIR", "deno-cache", true),
            ("DENO_NO_UPDATE_CHECK", "1", false),
            ("DENO_NO_PACKAGE_JSON", "1", false),
            ("PYTHONIOENCODING", "utf-8", false),
        ],
    )
}
pub fn services(root: PathBuf) -> DownloadServices {
    DownloadServices {
        runtime: Arc::new(RuntimeManager::new(root)),
        adapter: Arc::new(AutomaticAdapter::new(requirements())),
        verifiers: Arc::new(VerifierRegistry::video_and_images("ffprobe.exe")),
    }
}
pub fn coordinator(root: PathBuf) -> Coordinator {
    Coordinator::new(services(root))
}
pub fn download_coordinator(
    root: PathBuf,
    settings: PathBuf,
    defaults: Settings,
) -> Result<DownloadCoordinator, String> {
    DownloadCoordinator::new(services(root), settings, defaults)
}
