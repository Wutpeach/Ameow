//! Bounded metadata-only result. No native tokens, URLs or free-form codec names.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Inspection {
    pub identity: super::request::Identity,
    pub duration_seconds: Option<f64>,
    pub selected: Vec<SelectedMedia>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct SelectedMedia {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub video_codec: Option<VideoCodec>,
    pub audio_present: Option<bool>,
    pub bytes: Option<u64>,
    pub size_source: Option<SizeSource>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VideoCodec {
    H264,
    Hevc,
    Vp9,
    Av1,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SizeSource {
    NativeFilesize,
    NativeEstimate,
}
