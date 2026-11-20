//! Typed product/execution facts. No downloader wire data crosses this boundary.
use super::{
    diagnostics::Failure,
    progress::TransferProgress,
    request::{Accepted, Identity},
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Downloader {
    #[default]
    YtDlp,
    GalleryDl,
}
impl Downloader {
    pub fn other(self) -> Self {
        match self { Self::YtDlp => Self::GalleryDl, Self::GalleryDl => Self::YtDlp }
    }
    pub fn label(self) -> &'static str {
        match self { Self::YtDlp => "yt-dlp", Self::GalleryDl => "gallery-dl" }
    }
}

#[derive(Clone, Debug)]
pub struct IdentityAttestation {
    pub identity: Identity,
    pub aliases: Vec<String>,
}
#[derive(Clone, Debug)]
pub struct ExecutionRequest {
    pub accepted: Accepted,
    pub resume: Option<CollectionState>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CollectionState {
    pub directory: Option<PathBuf>,
    pub files: Vec<CollectionFile>,
    pub total: Option<usize>,
    #[serde(default)]
    pub expected_paths: Vec<PathBuf>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CollectionFile {
    pub relative_path: PathBuf,
    pub delivered: super::output::VerifiedMedia,
}
#[derive(Clone, Debug)]
pub struct ProducedBatch {
    pub artifacts: Vec<ProducedArtifact>,
    pub failure: Option<Failure>,
    pub total: Option<usize>,
    pub collection: bool,
    pub expected_paths: Vec<PathBuf>,
}
#[derive(Clone, Debug)]
pub enum AdapterEvent {
    Resolving,
    Engine(Downloader),
    Fallback,
    Transferring,
    Finalizing,
    Progress(TransferProgress),
    Files { completed: usize, total: Option<usize> },
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum MediaKind {
    Video,
    Data,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum VideoCodec {
    H264,
    Hevc,
    Vp9,
    Av1,
    Other(String),
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VideoExpectation {
    pub height: Option<u64>,
    pub codec: Option<VideoCodec>,
    // Reflect native selection; a video without a selected audio stream is valid.
    pub requires_audio: bool,
    pub height_cap: u64,
}
#[derive(Clone, Debug)]
pub enum VerificationRequirements {
    Video(VideoExpectation),
    Clip { video: VideoExpectation, range: super::request::ClipRange, source_duration: Option<f64> },
    Media { height_cap: u64 },
    Data,
}
impl VerificationRequirements {
    pub fn height_cap(&self) -> Option<u64> {
        match self { Self::Video(video) | Self::Clip { video, .. } => Some(video.height_cap), Self::Media { height_cap } => Some(*height_cap), Self::Data => None }
    }
}
#[derive(Clone, Debug)]
pub struct ProducedArtifact {
    pub relative_path: PathBuf,
    pub identity: Identity,
    pub kind: MediaKind,
    pub verification: VerificationRequirements,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct VerifiedFacts {
    #[serde(default)]
    pub extension: Option<String>,
    pub video_width: Option<u64>,
    pub video_height: Option<u64>,
    pub video_codec: Option<VideoCodec>,
    pub audio_present: bool,
    pub duration_seconds: Option<f64>,
}
pub type AdapterResult = Result<ProducedArtifact, Failure>;
