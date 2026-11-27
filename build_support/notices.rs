//! Assemble checked-in notice sources; never acquire or invent license text.
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, fs, path::Path};

pub const SOURCE: &str = "THIRD_PARTY_NOTICES.md";
pub const INVENTORY: &str = "distribution/license-inputs.json";
pub const MACOS_INVENTORY: &str = "distribution/macos-license-inputs.json";
pub const MACOS_TEXTS: &[&str] = &[
    "src/download/macos-runtime-notice-inputs.md",
    "src/download/macos-runtime-licenses.txt",
    "assets/runtime-GPL-3.0.txt",
];
pub const TEXTS: &[&str] = &[
    "LICENSE",
    "assets/fonts/OFL.txt",
    "distribution/notices/icon-licenses.txt",
    "distribution/notices/rust-notices.txt",
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
    let text = String::from_utf8(bytes).map_err(|_| format!("E_NOTICES_UTF8: {path}"))?;
    if text.trim().is_empty() || text.contains('\0') {
        return Err(format!("E_NOTICES_EMPTY: {path}"));
    }
    Ok(text)
}

pub fn assemble(root: &Path, version: &str) -> Result<String, String> {
    let target =
        std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_else(|_| std::env::consts::OS.into());
    if target == "macos" {
        println!("cargo:rerun-if-changed={MACOS_INVENTORY}");
        for path in MACOS_TEXTS {
            println!("cargo:rerun-if-changed={path}");
        }
    }
    assemble_for_target(root, version, &target)
}

pub fn assemble_for_target(root: &Path, version: &str, target: &str) -> Result<String, String> {
    let inventory: Value = serde_json::from_slice(
        &fs::read(root.join(INVENTORY)).map_err(|e| format!("E_NOTICES_INVENTORY: {e}"))?,
    )
    .map_err(|e| format!("E_NOTICES_INVENTORY: {e}"))?;
    let source = checked(root, &inventory, SOURCE)?;
    if !source.starts_with("# Third-party notices\n") || !source.contains("{{VERSION}}") {
        return Err("E_NOTICES_SOURCE".into());
    }
    let mut included = BTreeSet::new();
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
            result.push_str(&text);
        } else if line.contains("<!--") || line.contains("-->") {
            return Err("E_NOTICES_DIRECTIVE".into());
        } else {
            result.push_str(&line.replace("{{VERSION}}", version));
        }
        result.push('\n');
    }
    if included.len() != TEXTS.len() {
        return Err("E_NOTICES_INCOMPLETE".into());
    }
    if target == "macos" {
        let inventory: Value = serde_json::from_slice(
            &fs::read(root.join(MACOS_INVENTORY))
                .map_err(|e| format!("E_NOTICES_INVENTORY: {e}"))?,
        )
        .map_err(|e| format!("E_NOTICES_INVENTORY: {e}"))?;
        let mut extra = String::new();
        for path in MACOS_TEXTS {
            extra.push_str(&checked(root, &inventory, path)?);
            if !extra.ends_with('\n') {
                extra.push('\n');
            }
            extra.push('\n');
        }
        let end = format!("End of third-party notices for Ameow {version}.\n");
        if !result.ends_with(&end) {
            return Err("E_NOTICES_END".into());
        }
        result.insert_str(result.len() - end.len(), &extra);
    }
    Ok(result)
}
