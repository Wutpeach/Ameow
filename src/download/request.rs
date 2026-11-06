use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::net::IpAddr;
use sha2::{Digest, Sha256};
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
    Gallery { site: Site, id: String },
    Generic { url: String },
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
    Imgur,
    Bluesky,
    Generic,
}

pub(crate) fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            !(a == 0 || a == 10 || a == 127 || a >= 224
                || (a == 100 && (64..=127).contains(&b))
                || (a == 169 && b == 254) || (a == 172 && (16..=31).contains(&b))
                || (a == 192 && (b == 168 || b == 0 || (b == 88 && c == 99)))
                || (a == 198 && (b == 18 || b == 19 || (b == 51 && c == 100)))
                || (a == 203 && b == 0 && c == 113))
        }
        IpAddr::V6(ip) => {
            if let Some(v4) = ip.to_ipv4_mapped() { return is_public_ip(v4.into()); }
            let s = ip.segments();
            (s[0] & 0xe000) == 0x2000
                && !(s[0] == 0x2001 && (s[1] < 0x0200 || s[1] == 0x0db8))
                && !(s[0] == 0x2002)
                && !(s[0] == 0x3fff && (s[1] & 0xf000) == 0)
        }
    }
}

pub(crate) fn validate_public_url(input: &str) -> Result<Url, String> {
    if input.len() > 8192 { return Err("URL is too long".into()); }
    let mut url = Url::parse(input).map_err(|e| format!("Request URL: {e}"))?;
    if !matches!(url.scheme(), "http" | "https") || !url.username().is_empty() || url.password().is_some() {
        return Err("Only public HTTP(S) media URLs without credentials are supported".into());
    }
    match url.host().ok_or("Missing site host")? {
        url::Host::Ipv4(ip) if !is_public_ip(ip.into()) => return Err("Non-public host".into()),
        url::Host::Ipv6(ip) if !is_public_ip(ip.into()) => return Err("Non-public host".into()),
        url::Host::Domain(host) => {
            let host = host.trim_end_matches('.');
            if !host.contains('.') || ["localhost", "local", "internal", "lan", "home"].iter().any(|suffix| host == *suffix || host.ends_with(&format!(".{suffix}"))) {
                return Err("Non-public host".into());
            }
        }
        _ => {}
    }
    url.set_fragment(None);
    if url.as_str().len() > 8192 { return Err("URL is too long".into()); }
    Ok(url)
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
        let u = validate_public_url(&intent.url)?;
        let host = u.host_str().ok_or("Missing site host")?.trim_end_matches('.');
        let segments: Vec<_> = u
            .path_segments()
            .ok_or("Invalid site path")?
            .filter(|s| !s.is_empty())
            .collect();
        let query: Vec<_> = u.query_pairs().collect();
        let known_video = matches!(host, "youtu.be" | "www.youtube.com" | "youtube.com" | "m.youtube.com" | "www.bilibili.com" | "bilibili.com" | "m.bilibili.com" | "b23.tv" | "www.b23.tv");
        if known_video && query.iter().any(|(key, _)| {
            matches!(
                key.as_ref(),
                "list" | "playlist" | "season_id" | "series_id"
            )
        }) {
            return Err("Playlist/series URLs do not identify one media object".into());
        }
        let parts: Vec<_> = query.iter().filter(|(key, _)| key == "p" && matches!(host, "b23.tv" | "www.b23.tv")).collect();
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
            "imgur.com" | "www.imgur.com" if query.is_empty() => {
                let (kind, id) = match segments.as_slice() { [id] => ("image", *id), ["a", id] => ("album", *id), _ => return Err("Imgur URL must identify one image or album".into()) };
                if !matches!(id.len(), 5 | 7) || !id.bytes().all(|b| b.is_ascii_alphanumeric()) || (kind == "image" && matches!(id, "gallery" | "search" | "about")) { return Err("Invalid Imgur ID".into()); }
                Object::Gallery { site: Site::Imgur, id: format!("{kind}:{id}") }
            },
            "bsky.app" if query.is_empty() => {
                let ["profile", handle, "post", id] = segments.as_slice() else { return Err("Bluesky URL must identify one post".into()); };
                if handle.is_empty() || handle.len() > 253 || !handle.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b':')) || id.is_empty() || id.len() > 32 || !id.bytes().all(|b| b.is_ascii_alphanumeric()) { return Err("Invalid Bluesky post identity".into()); }
                Object::Gallery { site: Site::Bluesky, id: format!("{handle}/{id}") }
            },
            "youtu.be" | "b23.tv" | "www.b23.tv" | "imgur.com" | "www.imgur.com" | "bsky.app" => return Err("Invalid known site URL".into()),
            _ => Object::Generic { url: u.to_string() },
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
            Self::Gallery { site, id } => format!("gallery:{}:{id}", match site { Site::Imgur => "imgur", Site::Bluesky => "bluesky", _ => "invalid" }),
            Self::Generic { url } => format!("generic-url:{:x}", Sha256::digest(url.as_bytes())),
        }
    }
    pub fn site(&self) -> &'static str {
        match self {
            Self::Youtube(_) => "youtube",
            Self::Bilibili { .. } | Self::BilibiliShort { .. } => "bilibili",
            Self::Gallery { site: Site::Imgur, .. } => "imgur",
            Self::Gallery { site: Site::Bluesky, .. } => "bluesky",
            Self::Gallery { .. } => "invalid",
            Self::Generic { .. } => "generic",
        }
    }
}
impl Identity {
    pub fn canonical_key(&self) -> String {
        match self.site {
            Site::Youtube => format!("youtube:{}", self.id),
            Site::Bilibili => format!("bilibili:{}:{}", self.id, self.part.unwrap_or(1)),
            Site::Imgur => format!("gallery:imgur:{}", self.id),
            Site::Bluesky => format!("gallery:bluesky:{}", self.id),
            Site::Generic => format!("generic:{}", self.id),
        }
    }
}

#[cfg(test)]
mod generic_tests {
    use super::*;
    fn accept(url: &str) -> Result<Accepted, String> {
        Accepted::new(DownloadIntent { url: url.into(), quality: Quality::Balanced, output_dir: std::env::temp_dir() })
    }
    #[test]
    fn public_url_boundary_and_normalization() {
        for url in ["http://localhost/a", "http://x.local/a", "http://x.internal/a", "http://x.lan/a", "http://x.home/a", "http://intranet/a", "http://127.0.0.1/a", "http://10.1.2.3/a", "http://169.254.1.1/a", "http://[::1]/a", "http://[::ffff:192.168.1.1]/a", "https://user@example.com/a", "file://example.com/a"] {
            assert!(validate_public_url(url).is_err(), "{url}");
        }
        assert!(validate_public_url(&format!("https://example.com/{}", "x".repeat(8192))).is_err());
        assert!(is_public_ip("8.8.8.8".parse().unwrap()));
        assert!(is_public_ip("2606:4700:4700::1111".parse().unwrap()));
        assert!(!is_public_ip("2001:db8::1".parse().unwrap()));
        let accepted = accept("HTTPS://Example.COM:443/a?p=bad&list=x#secret").unwrap();
        assert_eq!(accepted.object, Object::Generic { url: "https://example.com/a?p=bad&list=x".into() });
        assert!(accepted.object.provisional_key().starts_with("generic-url:"));
        assert!(!accepted.object.provisional_key().contains("example"));
    }
    #[test]
    fn known_sites_do_not_fall_through() {
        for url in ["https://youtu.be/", "https://b23.tv/invalid/path", "https://youtube.com/playlist", "https://bilibili.com/invalid", "https://imgur.com/a/abcde?x=1", "https://bsky.app/?x=1"] { assert!(accept(url).is_err(), "{url}"); }
        assert!(accept("https://youtu.be/abcdefghijk?p=not-a-number").is_ok());
        assert!(accept("https://b23.tv/abc?p=not-a-number").is_err());
    }
}
