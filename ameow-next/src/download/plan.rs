use super::request::Quality;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FormatPlan {
    pub selector: String,
    pub height: u64,
    pub video_codec: String,
    pub audio_codec: String,
    pub requires_audio: bool,
}
fn codec_rank(s: &str) -> u8 {
    if s.starts_with("avc") || s.starts_with("h264") {
        4
    } else if s.starts_with("hev") || s.starts_with("hvc") || s.starts_with("hevc") {
        3
    } else if s.starts_with("vp9") || s.starts_with("vp09") {
        2
    } else if s.starts_with("av01") || s.starts_with("av1") {
        1
    } else {
        0
    }
}
fn format_id(v: &Value) -> Option<&str> {
    v["format_id"].as_str().filter(|s| {
        !s.is_empty()
            && s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
    })
}
pub fn select(metadata: &Value, quality: Quality) -> Result<FormatPlan, String> {
    let formats = metadata["formats"]
        .as_array()
        .ok_or("No formats in single-object metadata")?;
    let video = formats
        .iter()
        .filter(|f| {
            format_id(f).is_some()
                && f["has_drm"] != true
                && f["vcodec"].as_str().is_some_and(|s| s != "none")
                && f["height"]
                    .as_u64()
                    .is_some_and(|h| h > 0 && h <= quality.cap())
        })
        .max_by(|a, b| {
            let key = |v: &Value| {
                (
                    v["height"].as_u64().unwrap_or(0),
                    codec_rank(v["vcodec"].as_str().unwrap_or("")),
                    v["width"].as_u64().unwrap_or(0),
                    (v["tbr"].as_f64().unwrap_or(0.) * 100.) as u64,
                )
            };
            key(a).cmp(&key(b))
        })
        .ok_or("No playable video fits the accepted quality cap")?;
    let has_audio = video["acodec"].as_str().is_some_and(|s| s != "none");
    let audio = if has_audio {
        video
    } else {
        formats
            .iter()
            .filter(|f| {
                format_id(f).is_some()
                    && f["has_drm"] != true
                    && f["vcodec"].as_str() == Some("none")
                    && f["acodec"].as_str().is_some_and(|s| s != "none")
            })
            .max_by(|a, b| {
                a["abr"]
                    .as_f64()
                    .unwrap_or(0.)
                    .total_cmp(&b["abr"].as_f64().unwrap_or(0.))
            })
            .ok_or("Selected video has no trustworthy companion audio")?
    };
    let video_id = format_id(video).ok_or("Unsafe video format ID")?;
    Ok(FormatPlan {
        selector: if has_audio {
            video_id.into()
        } else {
            format!(
                "{video_id}+{}",
                format_id(audio).ok_or("Unsafe audio format ID")?
            )
        },
        height: video["height"].as_u64().ok_or("Video height missing")?,
        video_codec: video["vcodec"]
            .as_str()
            .ok_or("Video codec missing")?
            .into(),
        audio_codec: audio["acodec"]
            .as_str()
            .ok_or("Audio codec missing")?
            .into(),
        requires_audio: true,
    })
}
/// Only data needed for the frozen formats reaches --load-info-json. Never preserve extracted
/// filesystem/download bookkeeping or credential headers supplied by metadata.
pub fn transfer_input(metadata: &Value, plan: &FormatPlan) -> Result<Value, String> {
    let mut object = serde_json::Map::new();
    for name in [
        "id",
        "title",
        "extractor",
        "extractor_key",
        "webpage_url",
        "duration",
        "_old_archive_ids",
    ] {
        if let Some(value) = metadata.get(name) {
            object.insert(name.into(), value.clone());
        }
    }
    let source = metadata["formats"].as_array().ok_or("Formats missing")?;
    let mut formats = Vec::new();
    for id in plan.selector.split('+') {
        let format = source
            .iter()
            .find(|f| f["format_id"].as_str() == Some(id))
            .ok_or("Selected format missing")?;
        let mut selected = serde_json::Map::new();
        for name in [
            "format_id",
            "url",
            "ext",
            "protocol",
            "vcodec",
            "acodec",
            "height",
            "width",
            "fps",
            "tbr",
            "vbr",
            "abr",
            "asr",
            "audio_channels",
            "filesize",
            "filesize_approx",
        ] {
            if let Some(value) = format.get(name) {
                selected.insert(name.into(), value.clone());
            }
        }
        if let Some(url) = format["url"].as_str() {
            validate_public_url(url)?;
        } else {
            return Err("Selected format URL missing".into());
        }
        if let Some(fragments) = format["fragments"].as_array() {
            let mut clean_fragments = Vec::new();
            for fragment in fragments {
                validate_public_url(fragment["url"].as_str().ok_or("Fragment URL missing")?)?;
                let mut clean = serde_json::Map::new();
                for key in ["url", "duration"] {
                    if let Some(value) = fragment.get(key) {
                        clean.insert(key.into(), value.clone());
                    }
                }
                clean_fragments.push(Value::Object(clean));
            }
            selected.insert("fragments".into(), Value::Array(clean_fragments));
        }
        if let Some(headers) = format.get("http_headers").or(metadata.get("http_headers")) {
            let mut clean = serde_json::Map::new();
            for (key, value) in headers.as_object().ok_or("Invalid media headers")? {
                let text = value.as_str().ok_or("Invalid media header value")?;
                if matches!(
                    key.to_ascii_lowercase().as_str(),
                    "cookie" | "authorization" | "proxy-authorization"
                ) {
                    return Err("Credential media header unsupported".into());
                }
                if text.contains(['\r', '\n']) {
                    return Err("Invalid media header newline".into());
                }
                if matches!(
                    key.to_ascii_lowercase().as_str(),
                    "user-agent" | "referer" | "origin" | "accept" | "accept-language"
                ) {
                    clean.insert(key.clone(), value.clone());
                }
            }
            selected.insert("http_headers".into(), Value::Object(clean));
        }
        formats.push(Value::Object(selected));
    }
    object.insert("formats".into(), Value::Array(formats));
    Ok(Value::Object(object))
}
fn validate_public_url(input: &str) -> Result<(), String> {
    let url = url::Url::parse(input).map_err(|e| format!("Media URL: {e}"))?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Only absolute public HTTP(S) media URL is supported".into());
    }
    Ok(())
}
