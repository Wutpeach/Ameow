use super::*;
use crate::download::{
    inspection::{SizeSource, VideoCodec},
    request::{DownloadIntent, Quality},
};
use serde_json::json;

#[test]
fn selected_summary_is_bounded_typed_and_preserves_unknowns() {
    let accepted = Accepted::new(DownloadIntent {
        clip: None,
        url: "https://youtu.be/jNQXAC9IVRw".into(),
        quality: Quality::Balanced,
        output_dir: std::env::temp_dir(),
    })
    .unwrap();
    let entries = vec![
        json!({"width":1920,"height":1080,"vcodec":"avc1.640028","acodec":"none",
        "filesize":1234,"filesize_approx":1300,"format_id":"SYNTHETIC_SECRET",
        "url":"https://cdn.example/video?signature=SYNTHETIC_SECRET",
        "http_headers":{"Authorization":"SYNTHETIC_SECRET"}});
        10
    ];
    let metadata = json!({"id":"jNQXAC9IVRw","extractor_key":"Youtube","title":"Safe title",
        "duration":12.5,"requested_downloads":[{"requested_formats":entries}]});
    let identity = identity::proof(&accepted, &metadata).unwrap().identity;
    let summary = inspection_summary(identity, &metadata);
    assert_eq!(summary.selected.len(), 8);
    assert_eq!(summary.duration_seconds, Some(12.5));
    assert_eq!(summary.selected[0].video_codec, Some(VideoCodec::H264));
    assert_eq!(summary.selected[0].audio_present, Some(false));
    assert_eq!(
        summary.selected[0].size_source,
        Some(SizeSource::NativeFilesize)
    );
    assert_eq!(summary.selected[0].bytes, Some(1234));
    let serialized = serde_json::to_string(&summary).unwrap();
    assert!(!serialized.contains("SYNTHETIC_SECRET"));
    assert!(!serialized.contains("format_id"));
    assert!(!serialized.contains("http_headers"));

    let unknown = inspection_summary(
        summary.identity,
        &json!({"width":0,"height":u64::MAX,
        "vcodec":"secret-codec","acodec":"unknown","filesize":0,"filesize_approx":88}),
    );
    let media = &unknown.selected[0];
    assert_eq!(
        (
            media.width,
            media.height,
            media.video_codec.clone(),
            media.audio_present
        ),
        (None, None, None, None)
    );
    assert_eq!(
        (media.bytes, media.size_source.clone()),
        (Some(88), Some(SizeSource::NativeEstimate))
    );
    assert_eq!(unknown.duration_seconds, None);
    assert!(
        !serde_json::to_string(&unknown)
            .unwrap()
            .contains("secret-codec")
    );
}

#[test]
fn inspection_recipe_resolves_only_and_exposes_generic_collections() {
    for url in ["https://youtu.be/jNQXAC9IVRw", "https://example.com/work"] {
        let accepted = Accepted::new(DownloadIntent {
            clip: None,
            url: url.into(),
            quality: Quality::Saver,
            output_dir: std::env::temp_dir(),
        })
        .unwrap();
        let mut args = vec!["--no-playlist".into()];
        resolve_args(&mut args, &accepted);
        assert!(args.contains(&"--dump-single-json".to_owned()));
        assert!(args.contains(&"--skip-download".to_owned()));
        assert!(!args.contains(&"--no-simulate".to_owned()));
        assert!(!args.contains(&"--print-to-file".to_owned()));
        assert_eq!(args.last().unwrap(), url);
        if matches!(accepted.object, Object::Generic { .. }) {
            assert!(args.contains(&"--flat-playlist".to_owned()));
            assert!(args.contains(&"--yes-playlist".to_owned()));
            assert!(check_generic_object(&accepted, &json!({"entries":[]})).is_err());
        }
    }
}

#[cfg(windows)]
#[test]
fn supervised_inspection_runs_only_resolve_and_retains_no_raw_output() -> Result<(), String> {
    use crate::download::{adapter::ExecutionContext, runtime::RuntimeManager};
    let root = tempfile::tempdir().map_err(|e| e.to_string())?;
    let work = tempfile::tempdir().map_err(|e| e.to_string())?;
    let source = root.path().join("fixture.rs");
    let fixture = root.path().join("fixture.exe");
    fs::write(&source, r##"
        fn main() {
            let args: Vec<String> = std::env::args().collect();
            std::fs::write("invoked.txt", b"once").unwrap();
            if !args.iter().any(|a| a == "--skip-download") || args.iter().any(|a| a == "--no-simulate") {
                std::fs::write("transfer.bin", b"unexpected").unwrap();
                std::process::exit(1);
            }
            eprintln!("Authorization: SYNTHETIC_PRIVATE");
            if std::path::Path::new("bad-json").exists() { println!("{{"); return; }
            println!("{}", r#"{"id":"jNQXAC9IVRw","extractor_key":"Youtube","title":"Authorization: Bearer OTHER_SECRET","duration":3,"requested_formats":[{"height":720,"vcodec":"avc1","url":"https://cdn.example/?sig=SYNTHETIC_PRIVATE"}]}"#);
        }
    "##).map_err(|e| e.to_string())?;
    let compiler = std::env::var_os("RUSTC")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("USERPROFILE").unwrap()).join(".cargo/bin/rustc.exe")
        });
    let compiled = std::process::Command::new(compiler)
        .args(["--edition=2024", "-o"])
        .arg(&fixture)
        .arg(&source)
        .output()
        .map_err(|e| e.to_string())?;
    if !compiled.status.success() {
        return Err(String::from_utf8_lossy(&compiled.stderr).into_owned());
    }
    let control = process_supervisor::Control::default();
    let empty = TrustedRuntimeRequirements::empty();
    let mut lease = RuntimeManager::new(root.path().join("tools")).prepare(
        &empty,
        &control,
        Arc::new(|_| {}),
        |_| {},
    )?;
    for (name, path) in [
        ("deno.exe", root.path().join("deno.exe")),
        ("ffmpeg.exe", root.path().join("ffmpeg.exe")),
        ("yt-dlp.exe", fixture),
    ] {
        Arc::get_mut(&mut lease)
            .unwrap()
            .files
            .insert(name.into(), path);
    }
    let requirements = TrustedRuntimeRequirements::compiled(
        &[
            ("deno.exe", &["--version"]),
            ("ffmpeg.exe", &["-version"]),
            ("yt-dlp.exe", &["--version"]),
        ],
        &[],
    );
    let admitted = Arc::new(Mutex::new(Vec::new()));
    let captured = admitted.clone();
    let context = ExecutionContext {
        authentication: None,
        workspace: work.path(),
        lease: &lease,
        requirements: &requirements,
        control: &control,
        observer: Arc::new(|_| {}),
        admission: Arc::new(move |proof| {
            captured.lock().unwrap().push(proof.identity.clone());
            Ok(())
        }),
        events: Arc::new(|_| {}),
    };
    let accepted = Accepted::new(DownloadIntent {
        clip: None,
        url: "https://youtu.be/jNQXAC9IVRw".into(),
        quality: Quality::Balanced,
        output_dir: root.path().into(),
    })?;
    let summary = inspect_resolve(&accepted, &context, &network::Route::Direct, &mut None)?;
    assert_eq!(summary.selected[0].height, Some(720));
    assert_eq!(summary.identity.title, "");
    assert_eq!(admitted.lock().unwrap()[0].title, "");
    assert!(work.path().join("invoked.txt").is_file());
    assert!(!work.path().join("transfer.bin").exists());
    assert!(
        !serde_json::to_string(&summary)
            .unwrap()
            .contains("SYNTHETIC_PRIVATE")
    );
    assert!(
        !serde_json::to_string(&summary)
            .unwrap()
            .contains("OTHER_SECRET")
    );
    assert!(
        !serde_json::to_string(&*admitted.lock().unwrap())
            .unwrap()
            .contains("OTHER_SECRET")
    );
    for name in [
        "resolved.json",
        "resolve-stdout.log",
        "resolve-stderr.log",
        "resolve-argv.json",
        "final-object.txt",
    ] {
        assert!(
            !work.path().join(name).exists(),
            "unexpected evidence {name}"
        );
    }
    fs::write(work.path().join("bad-json"), b"").map_err(|e| e.to_string())?;
    let failure = YtDlpAdapter::new(requirements.clone()).inspect(&ExecutionRequest { accepted, resume: None }, &context).unwrap_err();
    assert_eq!(failure.code, "E_METADATA_INVALID_JSON");
    assert_eq!(failure.engine.as_ref().unwrap().exit_code, 0);
    assert_eq!(failure.engine.as_ref().unwrap().stage, Some(crate::download::diagnostics::EngineStage::Resolve));
    let copy = crate::download::diagnostics::copy_text(1, "youtube", &[failure]);
    assert!(copy.contains("Engine phase: resolve") && copy.contains("Engine exit code: 0"));
    assert!(!copy.contains("SYNTHETIC_PRIVATE") && !copy.contains("OTHER_SECRET"));
    Ok(())
}

#[cfg(windows)]
#[test]
fn authenticated_identity_and_recipe_do_not_expose_cookie_values() -> Result<(), String> {
    use crate::{
        browser_sessions::{Cookie, Operation, Store},
        download::{adapter::ExecutionContext, runtime::RuntimeManager},
    };
    let root = tempfile::tempdir().map_err(|e| e.to_string())?;
    let work = tempfile::tempdir().map_err(|e| e.to_string())?;
    let store = Store::new(root.path());
    store.apply(Operation::Authorize {
        site: "example.com".into(),
        source_id: "a".repeat(32),
        source_name: "Synthetic".into(),
        grant_id: "b".repeat(32),
        replaces: None,
        cookies: vec![Cookie {
            domain: ".example.com".into(),
            path: "/".into(),
            name: "synthetic".into(),
            value: "COOKIE_SECRET_XYZ".into(),
            secure: true,
            http_only: true,
            host_only: false,
            expires: None,
        }],
        skipped_partitioned: 0,
    })?;
    let auth = store
        .snapshot("https://example.com/work", work.path())?
        .ok_or("snapshot missing")?;
    let control = process_supervisor::Control::default();
    let empty = TrustedRuntimeRequirements::empty();
    let mut lease = RuntimeManager::new(root.path().join("tools")).prepare(
        &empty,
        &control,
        Arc::new(|_| {}),
        |_| {},
    )?;
    for name in ["deno.exe", "ffmpeg.exe"] {
        Arc::get_mut(&mut lease)
            .unwrap()
            .files
            .insert(name.into(), root.path().join(name));
    }
    let requirements = TrustedRuntimeRequirements::compiled(
        &[("deno.exe", &["--version"]), ("ffmpeg.exe", &["-version"])],
        &[],
    );
    let admitted = Arc::new(Mutex::new(Vec::new()));
    let captured = admitted.clone();
    let context = ExecutionContext {
        authentication: Some(&auth),
        workspace: work.path(),
        lease: &lease,
        requirements: &requirements,
        control: &control,
        observer: Arc::new(|_| {}),
        admission: Arc::new(move |proof| {
            captured.lock().unwrap().push(proof.identity.clone());
            Ok(())
        }),
        events: Arc::new(|_| {}),
    };
    let accepted = Accepted::new(DownloadIntent {
        clip: None,
        url: "https://example.com/work".into(),
        quality: Quality::Balanced,
        output_dir: root.path().into(),
    })?;
    let metadata = json!({"title":"Authorization: Bearer OTHER_SECRET COOKIE_SECRET_XYZ","url":"https://cdn.example/?sig=COOKIE_SECRET_XYZ",
        "http_headers":{"Authorization":"COOKIE_SECRET_XYZ"}, "duration":1});
    let mut proof = identity::proof(&accepted, &metadata)?;
    proof.identity.title.clear();
    context.admit(&proof).map_err(|e| e.code)?;
    let summary = inspection_summary(context.public_identity(&proof.identity)?, &metadata);
    assert_eq!(summary.identity.title, "");
    for output in [
        serde_json::to_string(&summary).unwrap(),
        serde_json::to_string(&*admitted.lock().unwrap()).unwrap(),
    ] {
        assert!(!output.contains("COOKIE_SECRET_XYZ"));
        assert!(!output.contains("OTHER_SECRET"));
    }
    let mut args = engine_args(&context, &network::Route::Direct, Quality::Balanced)?;
    resolve_args(&mut args, &accepted);
    assert!(args.windows(2).any(|pair| pair == auth.arguments()));
    assert!(!args.join(" ").contains("COOKIE_SECRET_XYZ"));
    assert!(!args.contains(&"--no-simulate".to_owned()));
    Ok(())
}
