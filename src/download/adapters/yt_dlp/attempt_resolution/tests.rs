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

#[test]
fn settled_diagnostics_keep_typed_facts_and_drop_owned_native_input() {
    use crate::download::{composition, media_observation::Observations, preserve_diagnostics};
    let root = tempfile::tempdir().unwrap();
    let workspace = tempfile::tempdir().unwrap();
    let working = workspace.path().to_path_buf();
    let secret = b"E2_SYNTHETIC_RAW_METADATA_SIGNED_URL_COOKIE";
    let transient = [
        "resolved.json", "media.info.json", "selection.txt", "resolve-argv.json",
        "resolve-stdout.log", "resolve-stderr.log", "transfer-argv.json",
        "transfer-stdout.log", "transfer-stderr.log", "adapter-error.log",
    ];
    let settlement = b"exit_code: 0\nresources_releasable: true\n";
    for prefix in ["", "primary-"] {
        for name in transient { fs::write(working.join(format!("{prefix}{name}")), secret).unwrap(); }
        for name in ["resolve-settlement.txt", "transfer-settlement.txt"] {
            fs::write(working.join(format!("{prefix}{name}")), settlement).unwrap();
        }
    }
    let observations = Observations::default();
    let media = br#"{"width":640,"height":480}"#;
    for name in ["resolve-media.json", "transfer-media.json", "primary-resolve-media.json", "primary-transfer-media.json"] {
        observations.save(&working, name, Some(media.to_vec()));
    }
    let input = AttemptResolution::open(&working.join("resolved.json"), secret).unwrap();
    let services = composition::services(root.path().join("runtime"));
    let archive = preserve_diagnostics(root.path(), &working, 7, services.adapter.evidence_files(), &observations).unwrap();
    for entry in fs::read_dir(&archive).unwrap() {
        let bytes = fs::read(entry.unwrap().path()).unwrap();
        assert!(!bytes.windows(secret.len()).any(|part| part == secret));
    }
    for prefix in ["", "primary-"] {
        for name in transient { assert!(!archive.join(format!("{prefix}{name}")).exists()); }
        for name in ["resolve-media.json", "transfer-media.json"] {
            assert_eq!(fs::read(archive.join(format!("{prefix}{name}"))).unwrap(), media);
        }
        for name in ["resolve-settlement.txt", "transfer-settlement.txt"] {
            assert_eq!(fs::read(archive.join(format!("{prefix}{name}"))).unwrap(), settlement);
        }
    }
    drop(input);
    workspace.close().unwrap();
    assert!(!working.exists());
    assert!(archive.is_dir());
}
