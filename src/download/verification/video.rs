use crate::download::{contract::{MediaKind, VideoCodec, VideoExpectation, VerifiedFacts}, output::{VerifiedMedia, verify_data}, process_supervisor::{self, Control, ProcessObservation, ProcessSpec}, runtime::RuntimeLease};
use serde_json::Value;
use std::{fs, path::Path, sync::Arc, time::Duration};
pub(crate) const EVIDENCE: &[(&str, u64)] = &[
    ("ffprobe.json", 1024 * 1024),
    ("ffprobe-stderr.log", 1024 * 1024),
];
pub fn verify(
    path: &Path,
    workspace: &Path,
    expected: &VideoExpectation,
    lease: &RuntimeLease,
    control: &Control,
    observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>,
    probe_tool: &str,
) -> Result<VerifiedMedia, String> {
    let mut verified = verify_data(path, workspace)?;
    let canonical = &verified.path;
    let probe = process_supervisor::run(
        ProcessSpec {
            executable: lease.file(probe_tool)?,
            args: vec![
                "-v".into(),
                "error".into(),
                "-show_streams".into(),
                "-show_format".into(),
                "-of".into(),
                "json".into(),
                canonical.display().to_string(),
            ],
            cwd: workspace.into(),
            env: crate::download::runtime::child_environment(workspace)?,
            stdout_limit: 1024 * 1024,
            stderr_limit: 128 * 1024,
            timeout: Some(Duration::from_secs(30)),
        },
        control,
        observer,
    )?;
    fs::write(workspace.join("ffprobe.json"), &probe.stdout).map_err(|e| e.to_string())?;
    fs::write(workspace.join("ffprobe-stderr.log"), &probe.stderr).map_err(|e| e.to_string())?;
    if probe.exit_code != 0 || probe.facts.stdout_truncated || !probe.facts.resources_releasable() {
        return Err(format!(
            "Media ffprobe failed: {}",
            String::from_utf8_lossy(&probe.stderr)
        ));
    }
    let info: Value =
        serde_json::from_slice(&probe.stdout).map_err(|e| format!("ffprobe JSON: {e}"))?;
    let streams = info["streams"].as_array().ok_or("No ffprobe streams")?;
    if !streams.iter().any(|s| {
        s["codec_type"] == "video"
            && s["width"].as_u64().is_some_and(|w| w > 0)
            && s["height"].as_u64() == Some(expected.height)
            && s["codec_name"]
                .as_str()
                .is_some_and(|name| codec_matches(&expected.codec, name))
    }) {
        return Err("Delivered media video dimensions do not match accepted format".into());
    }
    if expected.requires_audio
        && !streams
            .iter()
            .any(|s| s["codec_type"] == "audio" && s["channels"].as_u64().is_some_and(|n| n > 0))
    {
        return Err("Delivered media missing required audio".into());
    }
    if info["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .is_none_or(|n| !n.is_finite() || n <= 0.)
    {
        return Err("Media duration is not valid".into());
    }
    if expected.height == 0 || expected.height > expected.height_cap {
        return Err("Delivered media violates frozen quality cap".into());
    }
    verified.kind = MediaKind::Video;
    verified.facts = VerifiedFacts {
        video_height: Some(expected.height),
        video_codec: Some(expected.codec.clone()),
        audio_present: true,
        duration_seconds: info["format"]["duration"]
            .as_str()
            .and_then(|s| s.parse().ok()),
    };
    Ok(verified)
}
fn codec_matches(expected: &VideoCodec, actual: &str) -> bool {
    match expected {
        VideoCodec::H264 => actual == "h264",
        VideoCodec::Hevc => actual == "hevc",
        VideoCodec::Vp9 => actual == "vp9",
        VideoCodec::Av1 => actual == "av1",
        VideoCodec::Other(name) => name == actual,
    }
}
