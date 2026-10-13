//! Native product mapping and selected-result attestation, never candidate ranking.
use crate::download::{
    contract::{VideoCodec, VideoExpectation},
    request::Quality,
};
use serde_json::Value;

pub fn expression(quality: Quality) -> &'static str {
    match quality {
        Quality::Highest => "bv*+ba/b",
        Quality::Balanced => "bv*[height<=1080]+ba/b[height<=1080]",
        Quality::Saver => "bv*[height<=480]+ba/b[height<=480]",
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
    } else if !value.is_empty()
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
    let selected = metadata.get("requested_formats").and_then(Value::as_array)
        .or_else(|| metadata.get("requested_downloads").and_then(Value::as_array))
        .map_or_else(|| vec![metadata], |selected| selected.iter().collect::<Vec<_>>());
    if selected.len() == 1 && let Some(members) = selected[0].get("requested_formats").and_then(Value::as_array) { return members.iter().collect(); }
    selected
}
pub fn expectation(metadata: &Value, quality: Quality) -> Result<VideoExpectation, String> {
    let selected = chosen(metadata);
    if selected.is_empty() || selected.len() > 2 { return Err("Ambiguous native selected streams".into()); }
    let videos: Vec<_> = selected.iter().filter(|s| s["vcodec"].as_str().is_some_and(|s| s != "none")).collect();
    if videos.len() != 1 || !selected.iter().any(|s| s["acodec"].as_str().is_some_and(|s| !s.is_empty() && s != "none")) { return Err("Native selection lacks exactly one video and required audio".into()); }
    let video = videos[0];
    let height = video["height"]
        .as_u64()
        .filter(|h| *h > 0 && *h <= quality.cap())
        .ok_or("Native selected height violates product quality")?;
    if video["has_drm"] == true {
        return Err("DRM media is not a public deliverable".into());
    }
    Ok(VideoExpectation {
        height,
        codec: codec(video["vcodec"].as_str().ok_or("Selected codec missing")?)?,
        requires_audio: true,
        height_cap: quality.cap(),
    })
}
pub fn public_sources(metadata: &Value) -> Result<(), String> {
    for selected in chosen(metadata) {
        if let Some(value) = selected["url"].as_str() {
            let url = url::Url::parse(value).map_err(|_| "Invalid selected media source")?;
            if !matches!(url.scheme(), "http" | "https")
                || !url.username().is_empty()
                || url.password().is_some()
            {
                return Err("Selected media source is not public HTTP(S)".into());
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn actual_native_combined_separate_and_nested_downloads_project_same_facts() {
        let video = json!({"height":480,"vcodec":"avc1.64001e","acodec":"none"});
        let audio = json!({"vcodec":"none","acodec":"mp4a.40.2"});
        let separate = json!({"requested_formats":[video,audio]});
        let combined = json!({"height":480,"vcodec":"avc1.64001e","acodec":"mp4a.40.2"});
        let nested = json!({"requested_downloads":[separate]});
        let expected = expectation(&combined, Quality::Saver).unwrap();
        assert_eq!(expected, expectation(&separate, Quality::Saver).unwrap());
        assert_eq!(expected, expectation(&nested, Quality::Saver).unwrap());
        for invalid in [
            video.clone(),
            json!({"requested_formats":[video.clone(),video]}),
            json!({"requested_formats":[]}),
            json!({"height":1080,"vcodec":"avc1","acodec":"aac"}),
        ] {
            assert!(expectation(&invalid, Quality::Saver).is_err());
        }
    }
}
