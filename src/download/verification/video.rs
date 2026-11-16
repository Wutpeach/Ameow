use crate::download::{
    contract::{MediaKind, VerifiedFacts, VideoCodec, VideoExpectation},
    output::{VerifiedMedia, verify_data},
    process_supervisor::{self, Control, ProcessObservation, ProcessSpec},
    runtime::RuntimeLease,
};
use serde_json::Value;
use std::{fs, path::Path, sync::Arc, time::Duration};
pub(crate) const EVIDENCE: &[(&str, u64)] = &[
    ("ffprobe.json", 1024 * 1024),
    ("ffprobe-stderr.log", 1024 * 1024),
    ("media-decode-stderr.log", 65536),
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
    inspect(
        path, workspace, expected, false, lease, control, observer, probe_tool,
    )
}
pub(super) fn verify_media(
    path: &Path,
    workspace: &Path,
    cap: u64,
    lease: &RuntimeLease,
    control: &Control,
    observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>,
    probe_tool: &str,
) -> Result<VerifiedMedia, String> {
    inspect(
        path,
        workspace,
        &VideoExpectation {
            height: None,
            codec: None,
            requires_audio: false,
            height_cap: cap,
        },
        true,
        lease,
        control,
        observer,
        probe_tool,
    )
}
fn inspect(
    path: &Path,
    workspace: &Path,
    expected: &VideoExpectation,
    allow_image: bool,
    lease: &RuntimeLease,
    control: &Control,
    observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>,
    probe_tool: &str,
) -> Result<VerifiedMedia, String> {
    let mut media = verify_data(path, workspace)?;
    // Native image2 probing can prefer a misleading suffix over video bytes. Probe the
    // same guarded object through an extension-free owned alias, retained until workspace cleanup.
    let probe_dir = tempfile::Builder::new()
        .prefix("media-probe-")
        .tempdir_in(workspace)
        .map_err(|e| e.to_string())?
        .keep();
    let probe_path = probe_dir.join("media");
    if fs::hard_link(&media.path, &probe_path).is_err() {
        let copied = fs::copy(&media.path, &probe_path)
            .map_err(|e| format!("E_MEDIA_UNVERIFIED: probe input: {e}"))?;
        if copied != media.bytes {
            return Err("E_MEDIA_UNVERIFIED: incomplete probe input".into());
        }
    }
    let recovery = Control::default();
    let probe_control = if control.is_cancelled() {
        &recovery
    } else {
        control
    };
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
                probe_path.display().to_string(),
            ],
            cwd: workspace.into(),
            env: crate::download::runtime::child_environment(workspace)?,
            stdout_limit: 1024 * 1024,
            stderr_limit: 128 * 1024,
            timeout: Some(Duration::from_secs(if control.is_cancelled() {
                1
            } else {
                30
            })),
        },
        probe_control,
        observer.clone(),
    )
    .map_err(|e| format!("E_MEDIA_UNVERIFIED: ffprobe execution: {e}"))?;
    fs::write(workspace.join("ffprobe.json"), &probe.stdout).map_err(|e| e.to_string())?;
    fs::write(workspace.join("ffprobe-stderr.log"), &probe.stderr).map_err(|e| e.to_string())?;
    if probe.facts.stdout_truncated || !probe.facts.resources_releasable() {
        return Err("E_MEDIA_UNVERIFIED: incomplete ffprobe evidence".into());
    }
    if probe.exit_code != 0 {
        return Err("E_MEDIA_INVALID: ffprobe could not read delivered media".into());
    }
    let info: Value = serde_json::from_slice(&probe.stdout)
        .map_err(|_| "E_MEDIA_UNVERIFIED: invalid ffprobe JSON")?;
    if allow_image && is_image(&info) {
        super::image::decode(&probe_path, workspace, lease, control, observer)?;
        media.facts.extension = actual_extension(&info);
        return Ok(media);
    }
    media.facts = facts(&info, expected)?;
    if media.facts.duration_seconds.is_none() {
        media.facts.duration_seconds = Some(decoded_duration(
            &probe_path,
            workspace,
            lease,
            control,
            observer,
        )?);
    }
    media.kind = MediaKind::Video;
    Ok(media)
}
fn positive(value: &Value) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_str()?.parse().ok())
        .filter(|n| n.is_finite() && *n > 0.)
}
fn ratio(value: &Value) -> Option<f64> {
    let (a, b) = value.as_str()?.split_once('/')?;
    let value = a.parse::<f64>().ok()? / b.parse::<f64>().ok()?;
    (value.is_finite() && value > 0.).then_some(value)
}
pub(super) fn facts(info: &Value, expected: &VideoExpectation) -> Result<VerifiedFacts, String> {
    let streams = info["streams"]
        .as_array()
        .ok_or("E_MEDIA_UNVERIFIED: missing stream evidence")?;
    let video = streams
        .iter()
        .find(|s| s["codec_type"] == "video" && s["disposition"]["attached_pic"] != 1)
        .ok_or("E_OBJECT_UNSUPPORTED: delivered object is not an image or video")?;
    let width = video["width"]
        .as_u64()
        .filter(|n| *n > 0)
        .ok_or("E_MEDIA_UNVERIFIED: missing actual width")?;
    let height = video["height"]
        .as_u64()
        .filter(|n| *n > 0)
        .ok_or("E_MEDIA_UNVERIFIED: missing actual height")?;
    if height > expected.height_cap {
        return Err("E_MEDIA_INVALID: delivered video exceeds frozen quality cap".into());
    }
    if expected.height.is_some_and(|h| h != height) {
        return Err("E_MEDIA_INVALID: selected and actual video height differ".into());
    }
    let codec = video["codec_name"]
        .as_str()
        .filter(|s| !matches!(*s, "" | "unknown" | "N/A"))
        .ok_or("E_MEDIA_UNVERIFIED: missing actual video codec")?;
    if expected
        .codec
        .as_ref()
        .is_some_and(|c| !codec_matches(c, codec))
    {
        return Err("E_MEDIA_INVALID: selected and actual video codec differ".into());
    }
    let audio_present = streams
        .iter()
        .any(|s| s["codec_type"] == "audio" && s["channels"].as_u64() != Some(0));
    if expected.requires_audio && !audio_present {
        return Err("E_MEDIA_INVALID: delivered media missing selected audio".into());
    }
    let duration = positive(&info["format"]["duration"])
        .or_else(|| positive(&video["duration"]))
        .or_else(|| {
            positive(&video["duration_ts"])
                .zip(ratio(&video["time_base"]))
                .map(|(t, b)| t * b)
        })
        .or_else(|| {
            positive(&video["nb_frames"])
                .zip(ratio(&video["avg_frame_rate"]))
                .map(|(n, r)| n / r)
        })
        .filter(|n| n.is_finite() && *n > 0.);
    Ok(VerifiedFacts {
        video_width: Some(width),
        video_height: Some(height),
        video_codec: Some(actual_codec(codec)),
        audio_present,
        duration_seconds: duration,
        extension: actual_extension(info),
    })
}
fn decoded_duration(
    path: &Path,
    workspace: &Path,
    lease: &RuntimeLease,
    control: &Control,
    observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>,
) -> Result<f64, String> {
    let recovery = Control::default();
    let decode_control = if control.is_cancelled() {
        &recovery
    } else {
        control
    };
    let outcome = process_supervisor::run(
        ProcessSpec {
            executable: lease.file("ffmpeg.exe")?,
            args: ["-nostdin", "-v", "error", "-xerror", "-i"]
                .into_iter()
                .map(str::to_string)
                .chain([path.display().to_string()])
                .chain(
                    [
                        "-map",
                        "0:v:0",
                        "-progress",
                        "pipe:1",
                        "-nostats",
                        "-f",
                        "null",
                        "-",
                    ]
                    .into_iter()
                    .map(str::to_string),
                )
                .collect(),
            cwd: workspace.into(),
            env: crate::download::runtime::child_environment(workspace)?,
            stdout_limit: 65536,
            stderr_limit: 65536,
            timeout: Some(Duration::from_secs(if control.is_cancelled() {
                1
            } else {
                30
            })),
        },
        decode_control,
        observer,
    )
    .map_err(|e| format!("E_MEDIA_UNVERIFIED: decode execution: {e}"))?;
    fs::write(workspace.join("media-decode-stderr.log"), &outcome.stderr)
        .map_err(|e| e.to_string())?;
    if !outcome.facts.resources_releasable() || outcome.facts.stdout_truncated {
        return Err("E_MEDIA_UNVERIFIED: incomplete decode evidence".into());
    }
    if outcome.exit_code != 0 {
        return Err("E_MEDIA_INVALID: video decoding failed".into());
    }
    String::from_utf8_lossy(&outcome.stdout)
        .lines()
        .filter_map(|line| line.strip_prefix("out_time_us=")?.parse::<f64>().ok())
        .filter(|n| n.is_finite() && *n > 0.)
        .reduce(f64::max)
        .map(|n| n / 1_000_000.)
        .ok_or_else(|| "E_MEDIA_UNVERIFIED: no positive media timing evidence".into())
}
fn actual_codec(codec: &str) -> VideoCodec {
    match codec {
        "h264" => VideoCodec::H264,
        "hevc" => VideoCodec::Hevc,
        "vp9" => VideoCodec::Vp9,
        "av1" => VideoCodec::Av1,
        other => VideoCodec::Other(other.into()),
    }
}
fn codec_matches(expected: &VideoCodec, actual: &str) -> bool {
    match expected {
        VideoCodec::H264 => actual == "h264",
        VideoCodec::Hevc => actual == "hevc",
        VideoCodec::Vp9 => actual == "vp9",
        VideoCodec::Av1 => actual == "av1",
        // Unmapped extractor spelling cannot establish a contradiction with ffprobe naming.
        VideoCodec::Other(_) => true,
    }
}
fn is_image(info: &Value) -> bool {
    info["format"]["format_name"].as_str().is_some_and(|names| {
        names
            .split(',')
            .any(|s| s.ends_with("_pipe") || matches!(s, "image2" | "gif" | "apng" | "webp"))
    }) || info["format"]["tags"]["major_brand"]
        .as_str()
        .is_some_and(|s| matches!(s.trim(), "avif" | "avis" | "mif1" | "msf1"))
}
fn actual_extension(info: &Value) -> Option<String> {
    let format = info["format"]["format_name"].as_str()?.split(',').next()?;
    let ext = match format {
        "mov" => {
            if is_image(info) {
                match info["streams"]
                    .as_array()?
                    .iter()
                    .find(|s| s["codec_type"] == "video")?["codec_name"]
                    .as_str()?
                {
                    "av1" => "avif",
                    "hevc" => "heic",
                    _ => return None,
                }
            } else {
                "mp4"
            }
        }
        "mpegts" => "ts",
        "matroska" => "mkv",
        "image2" => return None,
        "jpeg_pipe" => "jpg",
        other => other.strip_suffix("_pipe").unwrap_or(other),
    };
    (!ext.is_empty() && ext.len() < 12 && ext.bytes().all(|b| b.is_ascii_alphanumeric()))
        .then(|| ext.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn expected() -> VideoExpectation {
        VideoExpectation {
            height: None,
            codec: None,
            requires_audio: false,
            height_cap: 1080,
        }
    }
    fn video() -> Value {
        json!({"streams":[{"codec_type":"video","codec_name":"h264","width":64,"height":48,"duration":"1"}],"format":{"format_name":"matroska,webm"}})
    }
    #[test]
    fn actual_facts_do_not_require_source_metadata_or_format_duration() {
        let mut info = video();
        let facts = facts(&info, &expected()).unwrap();
        assert_eq!(facts.duration_seconds, Some(1.));
        assert_eq!(facts.video_height, Some(48));
        assert!(!facts.audio_present);
        info["streams"][0]
            .as_object_mut()
            .unwrap()
            .remove("duration");
        info["streams"][0]["nb_frames"] = json!(25);
        info["streams"][0]["avg_frame_rate"] = json!("25/1");
        assert_eq!(
            super::facts(&info, &expected()).unwrap().duration_seconds,
            Some(1.)
        );
        info["streams"][0]["avg_frame_rate"] = json!("0/0");
        assert_eq!(
            super::facts(&info, &expected()).unwrap().duration_seconds,
            None
        );
    }
    #[test]
    fn actual_cap_missing_selected_audio_and_contradictions_still_fail() {
        let mut plan = expected();
        plan.height_cap = 47;
        assert!(
            facts(&video(), &plan)
                .unwrap_err()
                .starts_with("E_MEDIA_INVALID:")
        );
        plan = expected();
        plan.requires_audio = true;
        assert!(
            facts(&video(), &plan)
                .unwrap_err()
                .contains("selected audio")
        );
        plan = expected();
        plan.height = Some(49);
        assert!(facts(&video(), &plan).is_err());
        plan = expected();
        plan.codec = Some(VideoCodec::Av1);
        assert!(facts(&video(), &plan).is_err());
        let mut info = video();
        info["streams"][0]["width"] = Value::Null;
        assert!(
            facts(&info, &expected())
                .unwrap_err()
                .starts_with("E_MEDIA_UNVERIFIED:")
        );
        assert!(
            facts(&json!({"streams":[{"codec_type":"audio"}]}), &expected())
                .unwrap_err()
                .starts_with("E_OBJECT_UNSUPPORTED:")
        );
    }
    #[test]
    fn native_probe_type_routes_images_and_video_without_extension_guesses() {
        for name in ["png_pipe", "tiff_pipe", "gif", "image2"] {
            assert!(is_image(&json!({"format":{"format_name":name}})));
        }
        assert!(is_image(
            &json!({"format":{"format_name":"mov,mp4,m4a,3gp,3g2,mj2","tags":{"major_brand":"avif"}}})
        ));
        assert!(!is_image(&video()));
        assert!(!is_image(&json!({"format":{"format_name":"mov,mp4"}})));
    }
}
