use super::*;
use serde_json::json;

#[test]
fn input_is_current_anonymous_bounded_and_native_formats_are_preserved() {
    let canonical = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
    let metadata = json!({"id":"jNQXAC9IVRw", "webpage_url":"https://wrong.example/", "formats":[{"format_id":"native","url":"https://media.example/current"}]});
    let bytes = input_bytes(&metadata, canonical, false).unwrap().unwrap();
    let input: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(input["webpage_url"], canonical);
    assert_eq!(input["formats"], metadata["formats"]);
    assert!(input_bytes(&metadata, canonical, true).unwrap().is_none());
    assert!(input_bytes(&json!({"title":"x".repeat(METADATA_LIMIT)}), canonical, false).unwrap().is_none());
    let mut args = Vec::new();
    append_input(&mut args, None, canonical);
    assert_eq!(args, ["--", canonical]);
}

#[test]
fn native_input_is_authenticated_and_guard_releases_on_drop() {
    let workspace = tempfile::tempdir().unwrap();
    let path = workspace.path().join("resolved.json");
    fs::write(&path, b"{}").unwrap();
    assert!(AttemptResolution::open(&path, b"[]").is_err());
    let input = AttemptResolution::open(&path, b"{}").unwrap();
    input.validate().unwrap();
    let mut args = Vec::new();
    append_input(&mut args, Some(&input), "https://unused.example/");
    assert_eq!(args, ["--abort-on-error", "--load-info-json", path.to_str().unwrap()]);
    #[cfg(target_os = "macos")]
    {
        use std::os::fd::AsRawFd;
        let contender = File::options().write(true).open(&path).unwrap();
        assert_ne!(unsafe { libc::flock(contender.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) }, 0);
    }
    #[cfg(windows)]
    {
        assert!(File::options().write(true).open(&path).is_err());
        assert!(fs::remove_file(&path).is_err());
    }
    drop(input);
    let writable = fs::OpenOptions::new().write(true).open(&path).unwrap();
    #[cfg(target_os = "macos")]
    {
        use std::os::fd::AsRawFd;
        assert_eq!(unsafe { libc::flock(writable.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) }, 0);
    }
    drop(writable);
    fs::remove_file(path).unwrap();
}

#[cfg(target_os = "macos")]
#[test]
fn input_rejects_same_length_edits_replacements_and_symlinks() {
    use std::{os::unix::fs::symlink, time::SystemTime};
    let workspace = tempfile::tempdir().unwrap();
    let path = workspace.path().join("resolved.json");
    for replacement in [false, true] {
        fs::write(&path, b"{}").unwrap();
        let input = AttemptResolution::open(&path, b"{}").unwrap();
        let modified: SystemTime = fs::metadata(&path).unwrap().modified().unwrap();
        if replacement {
            fs::remove_file(&path).unwrap();
            fs::write(&path, b"{}").unwrap();
        } else {
            fs::write(&path, b"[]").unwrap();
        }
        File::options().write(true).open(&path).unwrap().set_modified(modified).unwrap();
        assert!(input.validate().is_err());
    }
    let link = workspace.path().join("link.json");
    symlink(&path, &link).unwrap();
    assert!(AttemptResolution::open(&link, b"{}").is_err());
}

#[cfg(target_os = "macos")]
mod native;
