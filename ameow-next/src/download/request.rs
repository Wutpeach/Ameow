use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use url::Url;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum Quality {
    Highest,
    Balanced,
    Saver,
}
impl Quality {
    pub fn cap(self) -> u64 {
        match self {
            Self::Highest => u64::MAX,
            Self::Balanced => 1080,
            Self::Saver => 480,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DownloadIntent {
    pub url: String,
    pub quality: Quality,
    pub output_dir: PathBuf,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum Object {
    Youtube(String),
    Bilibili { id: String, part: Option<u64> },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Accepted {
    pub intent: DownloadIntent,
    pub object: Object,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Identity {
    pub id: String,
    pub title: String,
    pub extractor: String,
}

impl Accepted {
    pub fn new(mut intent: DownloadIntent) -> Result<Self, String> {
        let u = Url::parse(&intent.url).map_err(|e| format!("Request URL: {e}"))?;
        if !matches!(u.scheme(), "http" | "https")
            || !u.username().is_empty()
            || u.password().is_some()
        {
            return Err("Only public HTTP(S) video URLs without credentials are supported".into());
        }
        let host = u.host_str().ok_or("Missing site host")?;
        let segments: Vec<_> = u
            .path_segments()
            .ok_or("Invalid site path")?
            .filter(|s| !s.is_empty())
            .collect();
        let query: Vec<_> = u.query_pairs().collect();
        let object = match host {
            "youtu.be" if segments.len() == 1 => Object::Youtube(segments[0].to_string()),
            "www.youtube.com" | "youtube.com" | "m.youtube.com" => {
                let ids: Vec<_> = query.iter().filter(|(k,_)| k == "v").map(|(_,v)| v.as_ref()).collect();
                let id = if segments.first() == Some(&"watch") && ids.len() == 1 { ids[0] } else if ids.is_empty() && matches!(segments.first(), Some(&"shorts") | Some(&"embed") | Some(&"live")) && segments.len() == 2 { segments[1] } else { return Err("URL must identify exactly one YouTube video".into()); };
                Object::Youtube(id.to_owned())
            },
            "www.bilibili.com" | "bilibili.com" | "m.bilibili.com" => {
                if segments.len()!=2 || segments[0]!="video" { return Err("This Stage A entry requires a canonical Bilibili video URL".into()); }
                let id=segments[1];
                if !((id.starts_with("BV") && id.len()==12 && id.bytes().all(|b| b.is_ascii_alphanumeric())) || (id.starts_with("av") && id[2..].parse::<u64>().is_ok())) { return Err("Invalid Bilibili video ID".into()); }
                let parts: Vec<_> = query.iter().filter(|(k,_)| k=="p").collect();
                if parts.len()>1 { return Err("Ambiguous Bilibili part".into()); }
                let part = parts.first().map(|(_,v)| v.parse::<u64>().map_err(|_| "Invalid Bilibili part")).transpose()?;
                if part==Some(0) { return Err("Bilibili part starts at 1".into()); }
                Object::Bilibili{id:id.to_owned(),part}
            },
            _ => return Err("Unsupported or ambiguous site URL; canonical YouTube/Bilibili single video required".into()),
        };
        if let Object::Youtube(id) = &object
            && (id.len() != 11
                || !id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-'))
        {
            return Err("Invalid YouTube video ID".into());
        }
        intent.output_dir = intent
            .output_dir
            .canonicalize()
            .map_err(|e| format!("Accepted destination: {e}"))?;
        if !intent.output_dir.is_dir() {
            return Err("Output destination must be an existing directory".into());
        }
        Ok(Self { intent, object })
    }
    pub fn identity(&self, metadata: &Value) -> Result<Identity, String> {
        if metadata.get("entries").is_some()
            || metadata
                .get("_type")
                .and_then(Value::as_str)
                .is_some_and(|s| s != "video")
        {
            return Err("Metadata is a playlist/multiple/indirect object".into());
        }
        let id = metadata["id"]
            .as_str()
            .ok_or("Metadata has no object identity")?;
        let extractor = metadata["extractor_key"]
            .as_str()
            .ok_or("Metadata has no extractor identity")?;
        let matches = match &self.object {
            Object::Youtube(expected) => extractor == "Youtube" && id == expected,
            Object::Bilibili { id: expected, part } => {
                let (base, selected) = id
                    .rsplit_once("_p")
                    .map_or((id, None), |(a, b)| (a, b.parse::<u64>().ok()));
                extractor == "BiliBili"
                    && (base == expected
                        || (expected.starts_with("av")
                            && metadata["_old_archive_ids"].as_array().is_some_and(|ids| {
                                let aid = &expected[2..];
                                ids.iter().any(|v| {
                                    v.as_str()
                                        == Some(&format!(
                                            "bilibili {aid}_part{}",
                                            part.unwrap_or(1)
                                        ))
                                })
                            })))
                    && match part {
                        Some(p) => selected == Some(*p),
                        None => selected.is_none(),
                    }
            }
        };
        if !matches {
            return Err(format!(
                "Resolved object mismatch: accepted {:?}, got {extractor}/{id}",
                self.object
            ));
        }
        Ok(Identity {
            id: id.into(),
            title: metadata["title"]
                .as_str()
                .ok_or("Metadata title missing")?
                .into(),
            extractor: extractor.into(),
        })
    }
}
