//! One application-embedded native postprocessor; ambient plugin discovery stays disabled.
use crate::download::request::ClipRange;
use serde_json::Value;
use std::{fs::{self, File, OpenOptions}, io::Write, path::Path};

const SOURCE: &[u8] = include_bytes!("bounded_http.py");

/// Keep the source handle alive through execution. Windows permits import reads,
/// while denying replacement/writes to the application-authored module.
pub(super) fn prepare(
    args: &mut Vec<String>,
    workspace: &Path,
    range: Option<ClipRange>,
    resolved: &Value,
) -> Result<Option<File>, String> {
    if range.is_none()
        || resolved["extractor_key"].as_str() != Some("Youtube")
    {
        return Ok(None);
    }
    // This resolve check only avoids loading the helper for unrelated requests.
    // The native before_dl processor gates every actual transfer input again.
    let root = workspace.join("managed-plugins");
    let package = root.join("ameow");
    let namespace = package.join("yt_dlp_plugins");
    let postprocessors = namespace.join("postprocessor");
    for directory in [&root, &package, &namespace, &postprocessors] {
        fs::create_dir(directory).map_err(|e| format!("Managed HTTP postprocessor directory: {e}"))?;
    }
    let mut options = OpenOptions::new();
    options.read(true).write(true).create_new(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(windows_sys::Win32::Storage::FileSystem::FILE_SHARE_READ);
    }
    let mut source = options.open(postprocessors.join("ameow_bounded_http.py"))
        .map_err(|e| format!("Managed HTTP postprocessor source: {e}"))?;
    source.write_all(SOURCE).map_err(|e| format!("Managed HTTP postprocessor source: {e}"))?;
    source.flush().map_err(|e| format!("Managed HTTP postprocessor source: {e}"))?;
    args.extend([
        "--plugin-dirs".into(), root.display().to_string(),
        "--use-postprocessor".into(), "AmeowBoundedHttp:when=before_dl".into(),
    ]);
    Ok(Some(source))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_youtube_sections_load_the_application_owned_processor() {
        for (range, extractor, enabled) in [
            (None, "Youtube", false),
            (Some(ClipRange { start_ms: 0, end_ms: 3000, precise: true }), "Youtube", true),
            (Some(ClipRange { start_ms: 0, end_ms: 3000, precise: false }), "Generic", false),
            (Some(ClipRange { start_ms: 0, end_ms: 3000, precise: false }), "Youtube", true),
        ] {
            let workspace = tempfile::tempdir().unwrap();
            let mut args = vec!["--ignore-config".into(), "--no-plugin-dirs".into()];
            let guard = prepare(&mut args, workspace.path(), range, &json!({"extractor_key":extractor})).unwrap();
            assert_eq!(guard.is_some(), enabled);
            assert_eq!(workspace.path().join("managed-plugins").exists(), enabled);
            assert!(args.iter().any(|arg| arg == "--no-plugin-dirs"));
            if enabled {
                assert_eq!(fs::read(workspace.path().join("managed-plugins/ameow/yt_dlp_plugins/postprocessor/ameow_bounded_http.py")).unwrap(), SOURCE);
                assert!(args.ends_with(&["--use-postprocessor".into(), "AmeowBoundedHttp:when=before_dl".into()]));
                #[cfg(windows)]
                assert!(OpenOptions::new().write(true).open(workspace.path().join("managed-plugins/ameow/yt_dlp_plugins/postprocessor/ameow_bounded_http.py")).is_err());
            }
        }
    }

    #[test]
    fn never_reuses_an_existing_plugin_directory() {
        let workspace = tempfile::tempdir().unwrap();
        let root = workspace.path().join("managed-plugins");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("unrelated"), "preserve").unwrap();
        let mut args = vec![];
        assert!(prepare(&mut args, workspace.path(), Some(ClipRange { start_ms:0,end_ms:3000,precise:false }),
            &json!({"extractor_key":"Youtube"})).is_err());
        assert!(args.is_empty());
        assert_eq!(fs::read_to_string(root.join("unrelated")).unwrap(), "preserve");
    }
}
