//! Assemble checked-in notice sources; never acquire or invent license text.
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, fs, path::Path};

pub const SOURCE: &str = "THIRD_PARTY_NOTICES.md";
pub const INVENTORY: &str = "distribution/license-inputs.json";
pub const PACKAGES: &str = "distribution/notices/rust-dependency-inventory.json";
pub const TEXTS: &[&str] = &[
    "LICENSE",
    "assets/fonts/OFL.txt",
    "distribution/notices/icon-licenses.txt",
    "distribution/notices/rust-dependency-licenses.txt",
    "distribution/notices/rust-standard-library-MIT.txt",
    "distribution/notices/rust-standard-library-Apache-2.0.txt",
    "distribution/notices/rust-standard-library-notices.txt",
];

fn field<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> {
    value[key]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| format!("E_NOTICES_FIELD: {key}"))
}
fn checked(root: &Path, inventory: &Value, path: &str) -> Result<String, String> {
    let records = inventory["materials"]
        .as_array()
        .ok_or("E_NOTICES_INVENTORY")?;
    let mut records = records
        .iter()
        .filter(|r| r["source"].as_str() == Some(path));
    let expected = field(
        records
            .next()
            .ok_or_else(|| format!("E_NOTICES_MISSING_RECORD: {path}"))?,
        "sha256",
    )?;
    if records.next().is_some() {
        return Err(format!("E_NOTICES_DUPLICATE_RECORD: {path}"));
    }
    let bytes = fs::read(root.join(path)).map_err(|e| format!("E_NOTICES_READ: {path}: {e}"))?;
    if !format!("{:x}", Sha256::digest(&bytes)).eq_ignore_ascii_case(expected) {
        return Err(format!("E_NOTICES_HASH: {path}"));
    }
    let text = decode(path, &bytes)?;
    if text.trim().is_empty() || text.contains('\0') {
        return Err(format!("E_NOTICES_EMPTY: {path}"));
    }
    Ok(text)
}

fn decode(path: &str, bytes: &[u8]) -> Result<String, String> {
    if let Ok(text) = std::str::from_utf8(bytes) {
        return Ok(text.to_owned());
    }
    // The pinned AOM Patent License has Windows-1252 smart quotes; keep its raw source untouched.
    let marker =
        b"===== SHA256 7b14a70c194b19dbd0625e7eac839a63200f67484521ce5e8d8244b127e8907a =====";
    if path != TEXTS[3] {
        return Err(format!("E_NOTICES_UTF8: {path}"));
    }
    let start = bytes
        .windows(marker.len())
        .position(|w| w == marker)
        .ok_or("E_NOTICES_ENCODING")?;
    let end = bytes[start + marker.len()..]
        .windows(13)
        .position(|w| w == b"===== SHA256 ")
        .map_or(bytes.len(), |i| start + marker.len() + i);
    let mut normalized = Vec::with_capacity(bytes.len());
    normalized.extend_from_slice(&bytes[..start]);
    for byte in &bytes[start..end] {
        match byte {
            0x93 => normalized.extend_from_slice("“".as_bytes()),
            0x94 => normalized.extend_from_slice("”".as_bytes()),
            _ => normalized.push(*byte),
        }
    }
    normalized.extend_from_slice(&bytes[end..]);
    String::from_utf8(normalized).map_err(|_| format!("E_NOTICES_UTF8: {path}"))
}

// Only the pinned Rust COPYRIGHT-library.html format, not a general HTML renderer.
pub fn standard_library_text(html: &str) -> Result<String, String> {
    let body = html
        .split_once("<body>")
        .and_then(|(_, rest)| rest.split_once("</body>").map(|(body, _)| body))
        .ok_or("E_NOTICES_STDLIB_HTML")?;
    let mut text = String::new();
    let mut rest = body;
    while !rest.is_empty() {
        if let Some(tag) = rest.strip_prefix('<') {
            let (tag, tail) = tag.split_once('>').ok_or("E_NOTICES_STDLIB_TAG")?;
            let name = tag
                .trim_start_matches('/')
                .split_ascii_whitespace()
                .next()
                .ok_or("E_NOTICES_STDLIB_TAG")?;
            if ![
                "h1", "h2", "h3", "ul", "li", "p", "b", "code", "details", "summary", "pre", "div",
                "a",
            ]
            .contains(&name)
            {
                return Err(format!("E_NOTICES_STDLIB_TAG: {name}"));
            }
            if name == "a" && !tag.starts_with('/') {
                if let Some(url) = tag
                    .split_once("href=\"")
                    .and_then(|(_, s)| s.split_once('"').map(|(url, _)| url))
                {
                    if url.starts_with("https://") || url.starts_with("http://") {
                        text.push_str(&format!(" [{url}] "));
                    }
                }
            } else if !["b", "code", "a"].contains(&name) {
                text.push('\n');
            }
            rest = tail;
        } else if let Some(entity) = rest.strip_prefix('&') {
            let (entity, tail) = entity.split_once(';').ok_or("E_NOTICES_STDLIB_ENTITY")?;
            let decoded = match entity {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                "nbsp" => Some(' '),
                s if s.starts_with("#x") => u32::from_str_radix(&s[2..], 16)
                    .ok()
                    .and_then(char::from_u32),
                s if s.starts_with('#') => s[1..].parse().ok().and_then(char::from_u32),
                _ => None,
            }
            .ok_or("E_NOTICES_STDLIB_ENTITY")?;
            text.push(decoded);
            rest = tail;
        } else {
            let len = rest.find(['<', '&']).unwrap_or(rest.len());
            text.push_str(&rest[..len]);
            rest = &rest[len..];
        }
    }
    Ok(text)
}

pub fn assemble(root: &Path, version: &str) -> Result<String, String> {
    let inventory: Value = serde_json::from_slice(
        &fs::read(root.join(INVENTORY)).map_err(|e| format!("E_NOTICES_INVENTORY: {e}"))?,
    )
    .map_err(|e| format!("E_NOTICES_INVENTORY: {e}"))?;
    let source = checked(root, &inventory, SOURCE)?;
    if !source.starts_with("# Third-party notices\n") || !source.contains("{{VERSION}}") {
        return Err("E_NOTICES_SOURCE".into());
    }
    let mut included = BTreeSet::new();
    let mut mapped = false;
    let mut result = String::new();
    for line in source.lines() {
        if let Some(path) = line
            .strip_prefix("<!-- include: ")
            .and_then(|s| s.strip_suffix(" -->"))
        {
            if !TEXTS.contains(&path) || !included.insert(path) {
                return Err(format!("E_NOTICES_INCLUDE: {path}"));
            }
            let text = checked(root, &inventory, path)?;
            result.push_str(&if path == TEXTS[6] {
                standard_library_text(&text)?
            } else {
                text
            });
        } else if line == "<!-- rust-packages -->" {
            if mapped {
                return Err("E_NOTICES_DUPLICATE_PACKAGES".into());
            }
            mapped = true;
            let packages: Value = serde_json::from_str(&checked(root, &inventory, PACKAGES)?)
                .map_err(|e| format!("E_NOTICES_PACKAGES: {e}"))?;
            let entries = packages["packages"]
                .as_array()
                .ok_or("E_NOTICES_PACKAGES")?;
            if entries.is_empty() || packages["packageCount"].as_u64() != Some(entries.len() as u64)
            {
                return Err("E_NOTICES_PACKAGE_COUNT".into());
            }
            for package in entries {
                result.push_str(&format!(
                    "{}@{} — {}\n",
                    field(package, "name")?,
                    field(package, "version")?,
                    field(package, "licenseExpression")?
                ));
                let texts = package["texts"]
                    .as_array()
                    .ok_or("E_NOTICES_PACKAGE_TEXTS")?;
                if texts.is_empty() {
                    result.push_str("  Exact license-text source remains unresolved.\n");
                }
                for text in texts {
                    result.push_str(&format!(
                        "  {}: {}\n",
                        field(text, "name")?,
                        field(text, "bodyAnchor")?
                    ));
                }
            }
        } else if line.contains("<!--") || line.contains("-->") {
            return Err("E_NOTICES_DIRECTIVE".into());
        } else {
            result.push_str(&line.replace("{{VERSION}}", version));
        }
        result.push('\n');
    }
    if included.len() != TEXTS.len() || !mapped {
        return Err("E_NOTICES_INCOMPLETE".into());
    }
    Ok(result)
}
