//! Native product mapping and selected-result attestation, never candidate ranking.
use crate::download::{
    contract::{VideoCodec, VideoExpectation},
    request::Quality,
};
use serde_json::Value;

pub fn expression(quality: Quality) -> &'static str {
    match quality {
        Quality::Highest => "bv*+ba/bv*/b",
        Quality::Balanced => "bv*[height<=?1080]+ba/bv*[height<=?1080]/b[height<=?1080]",
        Quality::Saver => "bv*[height<=?480]+ba/bv*[height<=?480]/b[height<=?480]",
    }
}
pub fn codec(value: &str) -> Result<VideoCodec, String> {
    if value.starts_with("avc") || value.starts_with("h264") {
        Ok(VideoCodec::H264)
    } else if value.starts_with("hev") || value.starts_with("hvc") {
        Ok(VideoCodec::Hevc)
    } else if value.starts_with("vp9") || value.starts_with("vp09") {
        Ok(VideoCodec::Vp9)
    } else if value.starts_with("av01") || value.starts_with("av1") {
        Ok(VideoCodec::Av1)
    } else if !matches!(value, "" | "unknown" | "N/A" | "?")
        && value != "none"
        && value.len() <= 64
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.'))
    {
        Ok(VideoCodec::Other(value.into()))
    } else {
        Err("Selected video codec is missing/invalid".into())
    }
}
pub(super) fn chosen(metadata: &Value) -> Vec<&Value> {
    let selected = metadata
        .get("requested_formats")
        .and_then(Value::as_array)
        .or_else(|| {
            metadata
                .get("requested_downloads")
                .and_then(Value::as_array)
        })
        .map_or_else(
            || vec![metadata],
            |selected| selected.iter().collect::<Vec<_>>(),
        );
    if selected.len() == 1
        && let Some(members) = selected[0]
            .get("requested_formats")
            .and_then(Value::as_array)
    {
        return members.iter().collect();
    }
    selected
}
pub fn expectation(metadata: &Value, quality: Quality) -> VideoExpectation {
    let selected = chosen(metadata);
    let videos: Vec<_> = selected
        .iter()
        .filter(|s| s["vcodec"].as_str().is_some_and(|s| s != "none"))
        .collect();
    let video = (videos.len() == 1).then(|| *videos[0]);
    VideoExpectation {
        height: video.and_then(|v| v["height"].as_u64()).filter(|h| *h > 0),
        codec: video
            .and_then(|v| v["vcodec"].as_str())
            .and_then(|s| codec(s).ok()),
        requires_audio: selected.iter().any(|s| {
            s["acodec"]
                .as_str()
                .is_some_and(|s| !matches!(s, "" | "none" | "unknown" | "N/A" | "?"))
        }),
        height_cap: quality.cap(),
        output: None,
    }
}

pub fn consistent(left: &VideoExpectation, right: &VideoExpectation) -> bool {
    left.height.zip(right.height).is_none_or(|(a, b)| a == b)
        && left
            .codec
            .as_ref()
            .zip(right.codec.as_ref())
            .is_none_or(|(a, b)| {
                matches!(a, VideoCodec::Other(_)) || matches!(b, VideoCodec::Other(_)) || a == b
            })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn native_combined_separate_and_nested_observations_agree() {
        let video = json!({"height":480,"vcodec":"avc1.64001e","acodec":"none"});
        let audio = json!({"vcodec":"none","acodec":"mp4a.40.2"});
        let separate = json!({"requested_formats":[video,audio]});
        let combined = json!({"height":480,"vcodec":"avc1.64001e","acodec":"mp4a.40.2"});
        assert_eq!(
            expectation(&combined, Quality::Saver),
            expectation(&separate, Quality::Saver)
        );
        assert_eq!(
            expectation(&combined, Quality::Saver),
            expectation(&json!({"requested_downloads":[separate]}), Quality::Saver)
        );
    }
    #[test]
    fn unknown_fields_and_private_protocols_never_become_admission_failures() {
        for metadata in [
            json!({}),
            json!({"height":null,"vcodec":null,"acodec":null}),
            json!({"requested_formats":[]}),
            json!({"height":0,"vcodec":"none","url":"native:resource","has_drm":true}),
        ] {
            let facts = expectation(&metadata, Quality::Balanced);
            assert_eq!(facts.height, None);
            assert_eq!(facts.codec, None);
            assert!(!facts.requires_audio);
            assert_eq!(facts.height_cap, 1080);
        }
        let silent = expectation(
            &json!({"height":720,"vcodec":"avc1","acodec":"none"}),
            Quality::Balanced,
        );
        assert_eq!(silent.height, Some(720));
        assert_eq!(silent.codec, Some(VideoCodec::H264));
        assert!(!silent.requires_audio);
        let unknown = expectation(&json!({}), Quality::Balanced);
        assert!(consistent(&silent, &unknown));
        let other = expectation(&json!({"height":480,"vcodec":"avc1"}), Quality::Balanced);
        assert!(!consistent(&silent, &other));
        // An observed cap violation is checked against the real file, not source admission.
        assert_eq!(
            expectation(&json!({"height":1080,"vcodec":"avc1"}), Quality::Saver).height,
            Some(1080)
        );
    }
}
