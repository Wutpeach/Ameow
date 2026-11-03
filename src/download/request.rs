use serde::{Deserialize, Serialize};
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
    BilibiliShort { code: String, part: Option<u64> },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Accepted {
    pub intent: DownloadIntent,
    pub object: Object,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum Site {
    Youtube,
    Bilibili,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Identity {
    pub id: String,
    pub title: String,
    pub site: Site,
    pub part: Option<u64>,
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
        if query.iter().any(|(key, _)| {
            matches!(
                key.as_ref(),
                "list" | "playlist" | "season_id" | "series_id"
            )
        }) {
            return Err("Playlist/series URLs do not identify one media object".into());
        }
        let parts: Vec<_> = query.iter().filter(|(key, _)| key == "p").collect();
        if parts.len() > 1 {
            return Err("Ambiguous Bilibili part".into());
        }
        let part = parts
            .first()
            .map(|(_, value)| value.parse::<u64>().map_err(|_| "Invalid Bilibili part"))
            .transpose()?;
        if part == Some(0) {
            return Err("Bilibili part starts at 1".into());
        }
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
            "b23.tv" | "www.b23.tv" if segments.len() == 1 && !segments[0].is_empty() && segments[0].len() <= 64 && segments[0].bytes().all(|b| b.is_ascii_alphanumeric()) => Object::BilibiliShort { code: segments[0].into(), part },
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
}

pub fn valid_bv(id: &str) -> bool {
    id.starts_with("BV") && id.len() == 12 && id.bytes().all(|b| b.is_ascii_alphanumeric())
}
impl Object {
    pub fn provisional_key(&self) -> String {
        match self {
            Self::Youtube(id) => format!("youtube:{id}"),
            Self::Bilibili { id, part } => format!(
                "bilibili:{id}:{}",
                part.map_or_else(|| "single".into(), |p| p.to_string())
            ),
            Self::BilibiliShort { code, part } => format!(
                "b23:{code}:{}",
                part.map_or_else(|| "single".into(), |p| p.to_string())
            ),
        }
    }
    pub fn site(&self) -> &'static str {
        match self {
            Self::Youtube(_) => "youtube",
            _ => "bilibili",
        }
    }
}
impl Identity {
    pub fn canonical_key(&self) -> String {
        match self.site {
            Site::Youtube => format!("youtube:{}", self.id),
            Site::Bilibili => format!("bilibili:{}:{}", self.id, self.part.unwrap_or(1)),
        }
    }
}
