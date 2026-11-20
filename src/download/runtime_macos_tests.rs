use super::{
    preferences::Preferences,
    process_supervisor::Control,
    request::{Accepted, DownloadIntent, Quality},
    runtime::{RuntimeManager, TrustedRuntimeRequirements, PYTHON_TOOL, check_data_location, with_test_data_home},
    settings::Settings,
};
use std::{fs, os::unix::fs::symlink, path::PathBuf};

#[test]
fn downloader_requirements_include_the_managed_python() {
    for executable in ["yt-dlp.exe", "gallery-dl.exe"] {
        let requirements = TrustedRuntimeRequirements::compiled(&[(executable, &["--version"])], &[]);
        assert!(requirements.contains(executable));
        assert!(requirements.contains(PYTHON_TOOL));
    }
    let ffprobe = TrustedRuntimeRequirements::compiled(&[("ffprobe.exe", &["-version"])], &[]);
    assert!(!ffprobe.contains(PYTHON_TOOL));
}

#[test]
fn managed_processes_use_the_system_certificate_bundle() {
    let root = tempfile::tempdir().unwrap();
    let requirements = TrustedRuntimeRequirements::compiled(&[("ffprobe.exe", &["-version"])], &[]);
    let environment = requirements.environment(root.path()).unwrap();
    assert!(environment.iter().any(|(key, value)| key == "SSL_CERT_FILE" && value == "/etc/ssl/cert.pem"));
    for name in ["SSL_CERT_FILE", "SSL_CERT_DIR"] {
        let overridden = TrustedRuntimeRequirements::compiled(&[("ffprobe.exe", &["-version"])], &[(name, "untrusted", false)]);
        assert!(overridden.environment(root.path()).is_err());
    }
}

#[test]
fn managed_processes_do_not_override_user_home_variables() {
    let root = tempfile::tempdir().unwrap();
    let requirements = TrustedRuntimeRequirements::compiled(&[("ffprobe.exe", &["-version"])], &[]);
    let environment = requirements.environment(root.path()).unwrap();
    assert!(!environment.iter().any(|(key, _)| matches!(key.as_str(), "HOME" | "home" | "CODEX_HOME")));
    for name in ["HOME", "CODEX_HOME"] {
        let overridden = TrustedRuntimeRequirements::compiled(&[("ffprobe.exe", &["-version"])], &[(name, "untrusted", false)]);
        assert!(overridden.environment(root.path()).is_err());
    }
}

#[test]
fn pinned_ffmpeg_and_ffprobe_share_a_publisher_release() {
    let manifest: serde_json::Value = serde_json::from_str(include_str!("macos-runtime-manifest.json")).unwrap();
    let components = manifest["components"].as_array().unwrap();
    let component = |name: &str| {
        let mut matches = components.iter().filter(|value| value["name"] == name);
        let selected = matches.next().unwrap();
        assert!(matches.next().is_none(), "duplicate {name} component");
        selected
    };
    let ffmpeg = component("ffmpeg");
    let ffprobe = component("ffprobe");
    assert_eq!(ffmpeg["version"], ffprobe["version"]);
    assert_eq!(ffmpeg["source"], ffprobe["source"]);
    let source = url::Url::parse(ffmpeg["source"].as_str().unwrap()).unwrap();
    assert_eq!(source.scheme(), "https");
    let release = source.path().strip_prefix("/info/detail/").unwrap();
    let version = ffmpeg["version"].as_str().unwrap();
    let release_version = release.rsplit('/').next().unwrap().split_once('_').unwrap().1;
    assert_eq!(release_version, version);
    for (name, entry) in [("ffmpeg", ffmpeg), ("ffprobe", ffprobe)] {
        let download = url::Url::parse(entry["url"].as_str().unwrap()).unwrap();
        assert_eq!(download.scheme(), "https");
        assert_eq!(download.host_str(), source.host_str());
        assert_eq!(download.path(), format!("/download/{release}/{name}.zip"));
        let files = entry["files"].as_array().unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0]["archive_path"], name);
        assert_eq!(files[0]["name"], name);
        assert_eq!(files[0]["version_contains"], format!("{name} version {version}"));
    }
}

#[test]
fn legacy_data_and_output_are_rejected_without_changes() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().to_path_buf();
    let legacy = home.join("Library/Application Support/Ameow");
    fs::create_dir_all(legacy.join("child")).unwrap();
    fs::write(legacy.join("settings.json"), b"sentinel").unwrap();
    symlink(&legacy, home.join("legacy-alias")).unwrap();
    symlink(legacy.join("child"), home.join("legacy-child-alias")).unwrap();
    assert_eq!(RuntimeManager::default_root().unwrap(),
        PathBuf::from(std::env::var_os("HOME").unwrap()).join("Library/Application Support/AmeowNative"));
    with_test_data_home(&home, || {
        let legacy = home.join("Library/Application Support/Ameow");
        let native = home.join("Library/Application Support/AmeowNative");
        let alias = home.join("legacy-alias");
        let parent_alias = home.join("legacy-child-alias");
        let through_parent = parent_alias.join("../settings.json");
        for path in [legacy.join("settings.json"), alias.join("settings.json"), through_parent] {
            assert!(check_data_location(&path).is_err(), "{}", path.display());
            assert!(Preferences::load(&path).is_err());
        }
        assert!(check_data_location(&native.join("settings.json")).is_ok());
        let settings_path = native.join("settings.json");
        let settings = Settings {
            quality: Quality::Balanced,
            output_dir: alias.clone(),
            theme: Default::default(),
            language: Default::default(),
            tray_icon: Default::default(), shortcut: Default::default(),
        };
        assert!(Settings::load(&legacy.join("settings.json"), settings.clone()).is_err());
        assert!(settings.persist(&settings_path).is_err());
        assert!(!settings_path.exists());
        let intent = DownloadIntent {
            url: "https://example.com/media".into(),
            quality: Quality::Balanced,
            output_dir: alias,
        };
        assert!(Accepted::new(intent).is_err());
        let manager = RuntimeManager::new(legacy.join("runtime"));
        assert!(manager.prepare_observed(
            &TrustedRuntimeRequirements::empty(), &Control::default(),
            std::sync::Arc::new(|_| {}), |_| {},
        ).is_err());
        assert!(!legacy.join("runtime").exists());
        fs::create_dir_all(&native).unwrap();
        Settings { output_dir: native.clone(), ..settings }.persist(&settings_path).unwrap();
        assert!(settings_path.is_file());
        assert_eq!(fs::read(legacy.join("settings.json")).unwrap(), b"sentinel");
        assert_eq!(fs::read_dir(legacy).unwrap().count(), 2);
    });
}
