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
pub fn verify_clip(
    path: &Path, workspace: &Path, expected: &VideoExpectation,
    range: crate::download::request::ClipRange, source_duration: Option<f64>, lease: &RuntimeLease, control: &Control,
    observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>, probe_tool: &str,
) -> Result<VerifiedMedia, String> {
    range.validate()?;
    let media = verify(path, workspace, expected, lease, control, observer.clone(), probe_tool)?;
    let info: Value = serde_json::from_slice(&fs::read(workspace.join("ffprobe.json")).map_err(|e| e.to_string())?)
        .map_err(|_| "E_MEDIA_UNVERIFIED: clip probe unavailable")?;
    let duration = positive(&info["format"]["duration"]).ok_or("E_MEDIA_UNVERIFIED: clip duration missing")?;
    let frame_seconds = info["streams"].as_array().and_then(|streams| streams.iter().find(|s| s["codec_type"] == "video"))
        .and_then(|stream| stream["avg_frame_rate"].as_str()).and_then(|rate| rate.split_once('/'))
        .and_then(|(num, den)| Some(den.parse::<f64>().ok()? / num.parse::<f64>().ok()?))
        .filter(|frame| frame.is_finite() && *frame > 0.);
    let tolerance = if range.precise {
        Some(frame_seconds.ok_or("E_MEDIA_UNVERIFIED: precise clip frame timing unavailable")? + 0.05)
    } else { None };
    validate_clip_duration(duration, range, source_duration, tolerance)?;
    let decoded = decoded_duration(path, workspace, lease, control, observer, true)?;
    validate_clip_duration(decoded, range, source_duration, tolerance)?;
    Ok(media)
}
fn validate_clip_duration(duration: f64, range: crate::download::request::ClipRange, source_duration: Option<f64>, precise_tolerance: Option<f64>) -> Result<(), String> {
    // Fast copy keeps a 10s preroll budget plus 0.5s for packet/mux rounding, independent of source length.
    let requested = range.duration_seconds();
    if range.precise {
        let tolerance = precise_tolerance.ok_or("E_MEDIA_UNVERIFIED: precise clip timing unavailable")?;
        return if duration.is_finite() && duration > 0. && (duration - requested).abs() <= tolerance
            && !source_duration.is_some_and(|source| requested < source - 1. && duration >= source - 0.25) { Ok(()) }
            else { Err("E_MEDIA_INVALID: precise clip differs from the selected duration".into()) };
    }
    if !duration.is_finite()
        || duration < (requested - 0.25).max(0.001) || duration > requested + 10.5
        || source_duration.is_some_and(|source| requested < source - 1. && duration >= source - 0.25) {
        return Err("E_CLIP_UNSUPPORTED: fast cut is outside the bounded keyframe interval".into());
    }
    Ok(())
}
#[cfg(test)]
mod clip_tests {
    use super::*;
    #[test]
    fn fast_clip_allows_gop_slack_but_rejects_whole_or_truncated_output() {
        let range = crate::download::request::ClipRange { start_ms: 301250, end_ms: 309750, precise: false };
        for duration in [8.5, 9.75, 12., 19.] { assert!(validate_clip_duration(duration, range, Some(600.), None).is_ok()); }
        for duration in [0., 3., 19.5, 600., f64::NAN] { assert!(validate_clip_duration(duration, range, Some(600.), None).is_err()); }
        assert!(validate_clip_duration(600., range, None, None).is_err());
        let short = crate::download::request::ClipRange { start_ms: 1250, end_ms: 4750, precise: false };
        assert!(validate_clip_duration(8., short, Some(8.), None).is_err());
        let precise = crate::download::request::ClipRange { precise: true, ..short };
        for duration in [3.48, 3.5, 3.56] { assert!(validate_clip_duration(duration, precise, Some(8.), Some(0.09)).is_ok()); }
        for duration in [3., 3.75, 8., f64::NAN] { assert!(validate_clip_duration(duration, precise, Some(8.), Some(0.09)).is_err()); }
    }
    #[test]
    fn fast_clip_accepts_observed_preroll_muxing_without_scaling_to_source_length() {
        // Recorded native copy outputs: identical packets and complete decode, across request configurations.
        for (requested_ms, observed) in [(3000, 13.019), (125000, 135.059)] {
            let range = crate::download::request::ClipRange { start_ms: 30000, end_ms: 30000 + requested_ms, precise: false };
            for source in [None, Some(213.), Some(36000.)] {
                assert!(validate_clip_duration(observed, range, source, None).is_ok(), "{requested_ms}ms -> {observed}s, source {source:?}");
                for invalid in [requested_ms as f64 / 1000. - 0.3, requested_ms as f64 / 1000. + 10.6] {
                    assert!(validate_clip_duration(invalid, range, source, None).is_err());
                }
            }
            assert!(validate_clip_duration(observed, crate::download::request::ClipRange { precise: true, ..range }, Some(213.), Some(0.09)).is_err());
        }
    }
    #[test]
    fn precise_clip_keeps_frame_plus_fifty_ms_boundary() {
        let range = crate::download::request::ClipRange { start_ms: 30000, end_ms: 33000, precise: true };
        for duration in [2.911, 3.089] { assert!(validate_clip_duration(duration, range, Some(600.), Some(1. / 25. + 0.05)).is_ok()); }
        for duration in [2.909, 3.091, 13.019] { assert!(validate_clip_duration(duration, range, Some(600.), Some(1. / 25. + 0.05)).is_err()); }
        assert!(validate_clip_duration(3., range, Some(600.), None).is_err());
    }
}
#[cfg(all(test, windows))]
#[path = "video_clip_tests.rs"]
mod native_clip_tests;
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
            output: None,
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
    #[cfg(target_os = "macos")]
    let probe_path = crate::download::output::probe_input(&media, &probe_dir)?;
    #[cfg(not(target_os = "macos"))]
    let probe_path = probe_dir.join("media");
    #[cfg(not(target_os = "macos"))]
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
            false,
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
    if let Some(output) = &expected.output {
        let audio: Vec<_> = streams.iter().filter(|s| s["codec_type"] == "audio").collect();
        if width != output.width || height != output.height
            || audio.len() != output.audio_channels.len()
            || audio.iter().zip(&output.audio_channels).any(|(s, channels)| s["channels"].as_u64() != Some(*channels)) {
            return Err("E_MEDIA_INVALID: output dimensions or selected audio tracks/channels differ".into());
        }
        if let Some(fps) = output.fps {
            let actual = ratio(&video["avg_frame_rate"]).or_else(|| ratio(&video["r_frame_rate"]));
            if actual.is_none_or(|actual| (actual - fps).abs() > (fps * 0.01).max(0.02)) {
                return Err("E_MEDIA_INVALID: output frame rate differs from selected video".into());
            }
        }
        let mp4_brand = info["format"]["tags"]["major_brand"].as_str()
            .is_some_and(|brand| !brand.trim().is_empty() && brand.trim() != "qt");
        if output.compatible_mp4 && (actual_extension(info).as_deref() != Some("mp4") || !mp4_brand
            || codec != "h264" || video["pix_fmt"] != "yuv420p"
            || !matches!(video["profile"].as_str(), Some("Baseline" | "Constrained Baseline" | "Main" | "High"))
            || audio.iter().any(|s| s["codec_name"] != "aac" || s["profile"] != "LC")) {
            return Err("E_MEDIA_INVALID: delivered media does not satisfy compatible MP4".into());
        }
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
    clip: bool,
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
            args: ["-nostdin", "-v", "error", "-xerror", "-stats_period", "10", "-i"]
                .into_iter()
                .map(str::to_string)
                .chain([path.display().to_string()])
                .chain(
                    [
                        "-map",
                        "0:v:0",
                        "-map",
                        "0:a?",
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
            timeout: if control.is_cancelled() { Some(Duration::from_secs(1)) } else if clip { None } else { Some(Duration::from_secs(30)) },
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
            output: None,
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
    #[test]
    fn compatible_output_checks_actual_tracks_pixels_dimensions_and_fps() {
        let mut info = video();
        info["format"]["format_name"] = json!("mov,mp4,m4a,3gp,3g2,mj2");
        info["format"]["tags"]["major_brand"] = json!("isom");
        info["streams"][0]["pix_fmt"] = json!("yuv420p");
        info["streams"][0]["profile"] = json!("High");
        info["streams"][0]["avg_frame_rate"] = json!("60000/1001");
        info["streams"].as_array_mut().unwrap().push(json!({"codec_type":"audio","codec_name":"aac","profile":"LC","channels":6}));
        let mut plan = expected();
        plan.output = Some(crate::download::contract::VideoOutputExpectation {
            compatible_mp4: true, width: 64, height: 48, fps: Some(60000. / 1001.), audio_channels: vec![6],
        });
        assert!(facts(&info, &plan).is_ok());
        for (key, value) in [("codec_name", json!("vp9")), ("pix_fmt", json!("yuv420p10le")),
            ("profile", json!("High 4:4:4 Predictive")), ("width", json!(32)), ("avg_frame_rate", json!("30/1"))] {
            let mut invalid = info.clone();
            invalid["streams"][0][key] = value;
            assert!(facts(&invalid, &plan).is_err(), "{key}");
        }
        for (key, value) in [("codec_name", json!("opus")), ("profile", json!("HE-AAC")), ("channels", json!(2))] {
            let mut invalid = info.clone(); invalid["streams"][1][key] = value;
            assert!(facts(&invalid, &plan).is_err(), "{key}");
        }
        let mut missing = info.clone(); missing["streams"].as_array_mut().unwrap().pop();
        assert!(facts(&missing, &plan).is_err());
        let mut extra = info.clone(); extra["streams"].as_array_mut().unwrap().push(info["streams"][1].clone());
        assert!(facts(&extra, &plan).is_err());
        let mut mkv = info.clone(); mkv["format"]["format_name"] = json!("matroska,webm");
        assert!(facts(&mkv, &plan).is_err());
        let mut quicktime = info.clone(); quicktime["format"]["tags"]["major_brand"] = json!("qt  ");
        assert!(facts(&quicktime, &plan).is_err());
        plan.output.as_mut().unwrap().compatible_mp4 = false;
        assert!(facts(&mkv, &plan).is_ok());
        plan.output.as_mut().unwrap().audio_channels.clear();
        assert!(facts(&missing, &plan).is_ok());
    }
}
