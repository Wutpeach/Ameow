use super::contract::VerifiedFacts;
use std::{
    fs,
    path::{Path, PathBuf},
};

pub fn safe_filename(name: &str) -> String {
    let name: String = name
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .take(80)
        .collect();
    let name = name.trim().trim_end_matches(['.', ' ']);
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if name.is_empty() {
        "media".into()
    } else if matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.as_bytes()[3].is_ascii_digit())
    {
        format!("_{name}")
    } else {
        name.into()
    }
}
pub fn media_basename(title: &str, fallback: &str, facts: &VerifiedFacts) -> String {
    let title = title.trim().trim_end_matches(['.', ' ']);
    let name = safe_filename(if title.is_empty() { fallback } else { title });
    let resolution = match (facts.video_width, facts.video_height) {
        (Some(width), Some(height)) if width > 0 && height > 0 => format!("[{width}x{height}]"),
        _ => String::new(),
    };
    let name: String = name.chars().take(80 - resolution.len()).collect();
    format!("{}{resolution}", name.trim_end_matches(['.', ' ']))
}
pub(super) fn collision_suffix(collision: u32) -> String {
    if collision == 0 {
        String::new()
    } else {
        format!(" ({collision})")
    }
}

pub fn collection_directory(destination: &Path, title: &str) -> Result<PathBuf, String> {
    let name = safe_filename(title);
    for collision in 0..10000 {
        let suffix = collision_suffix(collision);
        let path = destination.join(format!("{name}{suffix}"));
        match fs::create_dir(&path) {
            Ok(()) => return Ok(path),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("E_STORAGE: Collection directory: {e}")),
        }
    }
    Err("E_STORAGE: Collection directory collision bound exceeded".into())
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn media_names_keep_source_titles_resolution_and_windows_safe_fallbacks() {
        let facts = VerifiedFacts {
            video_width: Some(1920),
            video_height: Some(1080),
            ..Default::default()
        };
        for (title, expected) in [
            ("原视频名称", "原视频名称[1920x1080]"),
            ("剪辑:示例/第一集", "剪辑_示例_第一集[1920x1080]"),
            (" . ", "BV1234567890[1920x1080]"),
            ("CON", "_CON[1920x1080]"),
        ] {
            assert_eq!(media_basename(title, "BV1234567890", &facts), expected);
        }
        let long = media_basename(&"猫🐈".repeat(100), "id", &facts);
        assert_eq!(long.chars().count(), 80);
        assert!(long.ends_with("[1920x1080]"));
        assert_eq!(
            media_basename("静态图片", "id", &VerifiedFacts::default()),
            "静态图片"
        );
    }

    #[test]
    fn collection_collisions_preserve_existing_files_and_directories() {
        assert_eq!(collision_suffix(0), "");
        assert_eq!(collision_suffix(9999), " (9999)");
        let destination = tempfile::tempdir().unwrap();
        let existing = destination.path().join("作品_名称");
        fs::write(&existing, b"keep existing file").unwrap();
        let first = collection_directory(destination.path(), "作品:名称. ").unwrap();
        let second = collection_directory(destination.path(), "作品:名称. ").unwrap();
        assert_eq!(first, destination.path().join("作品_名称 (1)"));
        assert_eq!(second, destination.path().join("作品_名称 (2)"));
        assert!(first.is_dir() && second.is_dir());
        assert_eq!(fs::read(existing).unwrap(), b"keep existing file");
    }
}
