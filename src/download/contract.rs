//! Typed product/execution facts. No downloader wire data crosses this boundary.
use super::{
    diagnostics::Failure,
    progress::TransferProgress,
    request::{Accepted, Identity},
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct IdentityAttestation {
    pub identity: Identity,
    pub aliases: Vec<String>,
}
#[derive(Clone, Debug)]
pub struct ExecutionRequest {
    pub accepted: Accepted,
}
#[derive(Clone, Debug)]
pub enum AdapterEvent {
    Resolving,
    Transferring,
    Finalizing,
    Progress(TransferProgress),
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
    pub height: u64,
    pub codec: VideoCodec,
    pub requires_audio: bool,
    pub height_cap: u64,
}
#[derive(Clone, Debug)]
pub enum VerificationRequirements {
    Video(VideoExpectation),
    Data,
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
    pub video_height: Option<u64>,
    pub video_codec: Option<VideoCodec>,
    pub audio_present: bool,
    pub duration_seconds: Option<f64>,
}
pub type AdapterResult = Result<ProducedArtifact, Failure>;
