use crate::download::{request::{Accepted, Identity, Site, Object, valid_bv, validate_public_url}, contract::IdentityAttestation};
use serde_json::Value;
use sha2::{Digest, Sha256};
pub fn attest(accepted: &Accepted, metadata: &Value) -> Result<Identity, String> {
        if let Object::Generic { url } = &accepted.object {
            if metadata.get("entries").is_some()
                || metadata.get("_type").is_some_and(|v| v.as_str() != Some("video"))
                || ["playlist_id", "playlist_count", "playlist_index", "n_entries"].iter().any(|key| metadata.get(*key).is_some_and(|v| !v.is_null()))
            { return Err("Metadata is a playlist/multiple/indirect object".into()); }
            let field = |name: &str, max: usize| -> Result<&str, String> {
                let value = metadata.get(name).and_then(Value::as_str).ok_or_else(|| format!("Metadata missing {name}"))?;
                if value.trim().is_empty() || value.len() > max || !value.bytes().all(|b| (0x20..=0x7e).contains(&b)) {
                    return Err(format!("Invalid metadata {name}"));
                }
                Ok(value)
            };
            let id = field("id", 256)?;
            let extractor = field("extractor_key", 128)?;
            let webpage = metadata.get("webpage_url").and_then(Value::as_str).ok_or("Metadata webpage URL missing")?;
            if validate_public_url(webpage)?.as_str() != url { return Err("Metadata webpage URL mismatch".into()); }
            let tuple = serde_json::to_vec(&(url, extractor, id)).map_err(|_| "Metadata identity serialization failed")?;
            return Ok(Identity {
                id: format!("{:x}", Sha256::digest(tuple)),
                title: crate::download::diagnostics::safe_title(metadata["title"].as_str().ok_or("Metadata title missing")?),
                site: Site::Generic, part: None,
            });
        }
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
        let matches = match &accepted.object {
            Object::Youtube(expected) => extractor == "Youtube" && id == expected,
            Object::Bilibili { id: expected, part } => {
                let (base, selected) = id
                    .rsplit_once("_p")
                    .map_or((id, None), |(a, b)| (a, b.parse::<u64>().ok()));
                extractor == "BiliBili"
                    && valid_bv(base)
                    && (!id.contains("_p") || selected.is_some())
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
            Object::BilibiliShort { part, .. } => {
                let (base, selected) = id
                    .rsplit_once("_p")
                    .map_or((id, None), |(base, part)| (base, part.parse::<u64>().ok()));
                extractor == "BiliBili"
                    && valid_bv(base)
                    && (!id.contains("_p") || selected.is_some())
                    && match part {
                        Some(p) => selected == Some(*p),
                        None => selected.is_none(),
                    }
            }
            Object::Gallery { .. } => false,
            Object::Generic { .. } => unreachable!(),
        };
        if !matches {
            return Err(format!(
                "Resolved object mismatch: accepted {:?}, got {extractor}/{id}",
                accepted.object
            ));
        }
        Ok(Identity {
            id: if extractor == "BiliBili" {
                id.rsplit_once("_p").map_or(id, |(base, _)| base)
            } else {
                id
            }.into(),
            part: if extractor == "BiliBili" { Some(id.rsplit_once("_p").and_then(|(_, p)| p.parse().ok()).unwrap_or(1)) } else { None },
            title: crate::download::diagnostics::safe_title(
                metadata["title"].as_str().ok_or("Metadata title missing")?,
            ),
            site: if extractor == "Youtube" { Site::Youtube } else { Site::Bilibili },
        })
    }
pub fn proof(accepted: &Accepted, metadata: &Value) -> Result<IdentityAttestation, String> {
    let identity = attest(accepted, metadata)?;
    let mut aliases = vec![identity.canonical_key()];
    if identity.site == Site::Generic { aliases.push(accepted.object.provisional_key()); }
    if identity.site == Site::Bilibili {
        if !metadata["id"].as_str().unwrap_or("").contains("_p") {
            aliases.push(format!("bilibili:{}:single", identity.id));
        }
        if let Some(ids) = metadata["_old_archive_ids"].as_array() {
            for old in ids.iter().take(16).filter_map(Value::as_str) {
                if let Some((aid, part)) = old
                    .strip_prefix("bilibili ")
                    .and_then(|old| old.split_once("_part"))
                    && let (Ok(aid), Ok(part)) = (aid.parse::<u64>(), part.parse::<u64>())
                    && part == identity.part.unwrap_or(1)
                {
                    aliases.push(format!("bilibili:av{aid}:{part}"));
                    if !metadata["id"].as_str().unwrap_or("").contains("_p") {
                        aliases.push(format!("bilibili:av{aid}:single"));
                    }
                }
            }
        }
    }
    aliases.truncate(16);
    Ok(IdentityAttestation { identity, aliases })
}
pub fn canonical_url(accepted: &Accepted, identity: &Identity) -> String {
    match identity.site {
        Site::Youtube => format!("https://www.youtube.com/watch?v={}", identity.id),
        Site::Bilibili => match &accepted.object {
            Object::Bilibili { part: None, .. } | Object::BilibiliShort { part: None, .. } => format!("https://www.bilibili.com/video/{}/", identity.id),
            _ => format!("https://www.bilibili.com/video/{}/?p={}", identity.id, identity.part.unwrap_or(1)),
        },
        Site::Imgur | Site::Bluesky => String::new(),
        Site::Generic => match &accepted.object { Object::Generic { url } => url.clone(), _ => String::new() },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::download::request::{DownloadIntent, Quality};
    use serde_json::json;

    fn generic(url: &str) -> Accepted {
        Accepted::new(DownloadIntent { url: url.into(), quality: Quality::Balanced, output_dir: std::env::temp_dir() }).unwrap()
    }
    #[test]
    fn generic_identity_requires_same_single_object_and_binds_all_identity_parts() {
        let a = generic("https://example.com/media?x=1#fragment");
        let base = json!({"id": "123", "extractor_key": "Example", "title": "Title", "webpage_url": "https://example.com/media?x=1#other"});
        let p = proof(&a, &base).unwrap();
        assert_eq!(canonical_url(&a, &p.identity), "https://example.com/media?x=1");
        assert!(p.aliases.contains(&a.object.provisional_key()));
        for (key, value) in [("id", json!(null)), ("id", json!("")), ("extractor_key", json!("bad\nname")), ("_type", json!(1)), ("_type", json!("url")), ("entries", json!([])), ("playlist_id", json!("x")), ("playlist_count", json!(1)), ("playlist_index", json!(1)), ("n_entries", json!(1)), ("webpage_url", json!(null)), ("webpage_url", json!("https://other.example/media"))] {
            let mut m = base.clone(); m[key] = value; assert!(attest(&a, &m).is_err(), "{key}: {m}");
        }
        for (key, value) in [("id", "456"), ("extractor_key", "Other")] {
            let mut m = base.clone(); m[key] = json!(value); assert_ne!(p.identity.id, attest(&a, &m).unwrap().id);
        }
        let b = generic("https://other.example/media?x=1");
        let mut m = base.clone(); m["webpage_url"] = json!("https://other.example/media?x=1");
        assert_ne!(p.identity.id, attest(&b, &m).unwrap().id);
    }

    #[test]
    fn youtube_id_containing_part_like_text_is_preserved_through_canonical_transfer() {
        let output = tempfile::tempdir().unwrap();
        let accepted = Accepted::new(DownloadIntent {
            url: "https://www.youtube.com/watch?v=abc_p123456".into(),
            quality: Quality::Balanced,
            output_dir: output.path().into(),
        })
        .unwrap();
        let proof = proof(
            &accepted,
            &json!({
                "id": "abc_p123456",
                "extractor_key": "Youtube",
                "title": "Synthetic identity fixture"
            }),
        )
        .unwrap();
        assert_eq!(proof.identity.id, "abc_p123456");
        assert_eq!(proof.identity.part, None);
        assert_eq!(proof.identity.canonical_key(), "youtube:abc_p123456");
        assert_eq!(
            canonical_url(&accepted, &proof.identity),
            accepted.intent.url
        );
    }
}
