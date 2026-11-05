use ameow_next::download::{
    Phase,
    network::{Route, parse_proxy},
    output::{DestinationStage, VerifiedMedia},
    composition, contract::{MediaKind, VerifiedFacts, VideoExpectation, VideoCodec},
    adapters::yt_dlp::{identity, selection},
    process_supervisor::Control,
    request::{Accepted, DownloadIntent, Quality},
    runtime::{RuntimeManager, check_file, hash},
};
use serde_json::{json, Value};
trait NativeFixture { fn identity(&self, metadata: &Value) -> Result<ameow_next::download::request::Identity, String>; }
impl NativeFixture for Accepted { fn identity(&self, metadata: &Value) -> Result<ameow_next::download::request::Identity, String> { identity::attest(self, metadata) } }
use std::{
    fs,
    sync::Arc,
    time::{Duration, Instant},
};

fn accepted(url: &str, root: &std::path::Path) -> Result<Accepted, String> {
    Accepted::new(DownloadIntent {
        url: url.into(),
        quality: Quality::Balanced,
        output_dir: root.into(),
    })
}
#[test]
fn public_url_acceptance_fixes_one_identity_and_destination() -> Result<(), String> {
    let root = tempfile::tempdir().map_err(|e| e.to_string())?;
    for url in [
        "https://youtu.be/jNQXAC9IVRw",
        "https://www.youtube.com/watch?v=jNQXAC9IVRw",
        "https://youtube.com/shorts/jNQXAC9IVRw",
    ] {
        let a = accepted(url, root.path())?;
        assert_eq!(a.intent.url, url);
        assert_eq!(
            a.intent.output_dir,
            root.path().canonicalize().map_err(|e| e.to_string())?
        );
        assert!(
            a.identity(&json!({"id":"jNQXAC9IVRw","extractor_key":"Youtube","title":"public"}))
                .is_ok()
        );
        assert!(
            a.identity(&json!({"id":"differentid","extractor_key":"Youtube","title":"public"}))
                .is_err()
        );
    }
    for url in [
        "file:///media",
        "https://user:pass@youtube.com/watch?v=jNQXAC9IVRw",
        "https://youtube.com/watch?v=jNQXAC9IVRw&v=dQw4w9WgXcQ",
        "https://youtu.be/jNQXAC9IVRw/other",
        "https://bilibili.com/video/BV1vL411G7N7?p=1&p=2",
        "https://bilibili.com/video/BV1vL411G7N7?p=0",
    ] {
        assert!(accepted(url, root.path()).is_err(), "{url}");
    }
    Ok(())
}
#[test]
fn bilibili_part_and_playlist_ambiguity_fail_before_download() -> Result<(), String> {
    let root = tempfile::tempdir().map_err(|e| e.to_string())?;
    let single = accepted("https://bilibili.com/video/BV1vL411G7N7", root.path())?;
    let metadata = json!({"id":"BV1vL411G7N7","extractor_key":"BiliBili","title":"public"});
    assert!(single.identity(&metadata).is_ok());
    assert!(
        single
            .identity(
                &json!({"id":"BV1vL411G7N7_p1","extractor_key":"BiliBili","title":"anthology"})
            )
            .is_err()
    );
    assert!(single.identity(&json!({"entries":[metadata]})).is_err());
    let part = accepted("https://bilibili.com/video/BV1vL411G7N7?p=2", root.path())?;
    assert!(
        part.identity(&json!({"id":"BV1vL411G7N7_p2","extractor_key":"BiliBili","title":"public"}))
            .is_ok()
    );
    assert!(
        part.identity(&json!({"id":"BV1vL411G7N7_p1","extractor_key":"BiliBili","title":"public"}))
            .is_err()
    );
    Ok(())
}
#[test]
fn native_selected_facts_require_video_audio_and_frozen_quality() -> Result<(), String> {
    let actual = json!({"requested_formats":[{"height":1080,"vcodec":"avc1","acodec":"none"},{"vcodec":"none","acodec":"opus"}]});
    let expected = selection::expectation(&actual, Quality::Balanced)?;
    assert_eq!(expected.height, 1080);
    assert_eq!(expected.codec, VideoCodec::H264);
    assert!(expected.requires_audio);
    assert!(selection::expectation(&actual, Quality::Saver).is_err());
    assert!(
        selection::expectation(
            &json!({"height":480,"vcodec":"h264","acodec":"none"}),
            Quality::Saver
        )
        .is_err()
    );
    assert!(
        selection::expectation(
            &json!({"height":0,"vcodec":"h264","acodec":"aac"}),
            Quality::Highest
        )
        .is_err()
    );
    Ok(())
}
#[test]
fn static_proxy_result_is_explicit_and_ambiguous_routes_are_rejected() -> Result<(), String> {
    assert_eq!(
        parse_proxy("http=localhost:7897;https=localhost:7897", "https")?,
        Route::Proxy("http://localhost:7897".into())
    );
    for route in [
        "",
        "a:1;b:2",
        "PROXY a:1 DIRECT",
        "socks5://localhost:1",
        "http://user:pass@localhost:1",
        "https=a:1;https=b:2",
    ] {
        assert!(parse_proxy(route, "https").is_err(), "{route}");
    }
    Ok(())
}
fn media(root: &std::path::Path) -> Result<VerifiedMedia, String> {
    let path = root.join("sample.mkv");
    fs::write(&path, b"settled output bytes").map_err(|e| e.to_string())?;
    Ok(VerifiedMedia {
        path,
        bytes: 20,
        sha256: hash(&b"settled output bytes"[..])?,
        kind: MediaKind::Data,
        facts: VerifiedFacts::default(),
        identity_guard: None,
    })
}
#[test]
fn delivery_never_replaces_existing_files_and_cleans_only_owned_partial() -> Result<(), String> {
    let source = tempfile::tempdir().map_err(|e| e.to_string())?;
    let dest = tempfile::tempdir().map_err(|e| e.to_string())?;
    let m = media(source.path())?;
    fs::write(dest.path().join("video.mkv"), b"existing user file").map_err(|e| e.to_string())?;
    fs::write(dest.path().join(".ameow-other.partial"), b"not owned").map_err(|e| e.to_string())?;
    let mut stage = DestinationStage::create(&m, dest.path(), 1)?;
    stage.fill(&m)?;
    assert!(fs::write(&stage.path, b"external corruption").is_err());
    assert!(fs::remove_file(&stage.path).is_err());
    assert!(fs::rename(&stage.path, dest.path().join("external-rename.mkv")).is_err());
    let delivered = stage.publish(dest.path(), "video")?;
    drop(stage);
    assert_eq!(delivered, dest.path().join("video (1).mkv"));
    assert_eq!(
        fs::read(dest.path().join("video.mkv")).map_err(|e| e.to_string())?,
        b"existing user file"
    );
    let mut cancelled = DestinationStage::create(&m, dest.path(), 2)?;
    cancelled.fill(&m)?;
    let partial = cancelled.path.clone();
    cancelled.cleanup()?;
    drop(cancelled);
    assert!(!partial.exists());
    assert!(dest.path().join(".ameow-other.partial").exists());
    let mut pending = DestinationStage::create(&m, dest.path(), 4)?;
    pending.fill(&m)?;
    let other_reader = fs::File::open(&pending.path).map_err(|e| e.to_string())?;
    assert!(pending.cleanup().is_err());
    assert!(pending.owned_path().is_some());
    drop(other_reader);
    pending.cleanup()?;
    assert!(pending.owned_path().is_none());
    assert!(DestinationStage::create(&m, &dest.path().join("missing"), 3).is_err());
    assert_eq!(
        fs::read(delivered).map_err(|e| e.to_string())?,
        b"settled output bytes"
    );
    Ok(())
}
#[test]
fn publication_preserves_exact_filename_and_no_clobber_across_utf16_lengths() -> Result<(), String>
{
    let source = tempfile::tempdir().map_err(|e| e.to_string())?;
    let m = media(source.path())?;
    for length in 0..16 {
        let dest = tempfile::tempdir().map_err(|e| e.to_string())?;
        let destination = dest.path().canonicalize().map_err(|e| e.to_string())?;
        let base = format!("video{}", "x".repeat(length));
        let existing = destination.join(format!("{base}.mkv"));
        let collision = destination.join(format!("{base} (1).mkv"));
        fs::write(&existing, b"existing user file").map_err(|e| e.to_string())?;
        fs::write(&collision, b"second existing user file").map_err(|e| e.to_string())?;
        let mut stage = DestinationStage::create(&m, &destination, length as u64 + 1)?;
        stage.fill(&m)?;
        let delivered = stage.publish(&destination, &base)?;
        assert_eq!(delivered, destination.join(format!("{base} (2).mkv")));
        assert_eq!(
            hash(fs::File::open(&delivered).map_err(|e| e.to_string())?)?,
            m.sha256
        );
        assert_eq!(
            fs::metadata(&delivered).map_err(|e| e.to_string())?.len(),
            m.bytes
        );
        assert_eq!(
            fs::read(&existing).map_err(|e| e.to_string())?,
            b"existing user file"
        );
        assert_eq!(
            fs::read(&collision).map_err(|e| e.to_string())?,
            b"second existing user file"
        );
        assert_eq!(
            fs::read_dir(&destination)
                .map_err(|e| e.to_string())?
                .count(),
            3
        );
    }
    Ok(())
}
#[test]
fn hash_lease_rejects_corruption_and_prevents_live_mutation() -> Result<(), String> {
    let root = tempfile::tempdir().map_err(|e| e.to_string())?;
    let file = root.path().join("runtime.exe");
    fs::write(&file, b"trusted bytes").map_err(|e| e.to_string())?;
    let expected = hash(&b"trusted bytes"[..])?;
    let lease = check_file(&file, &expected)?;
    assert!(fs::write(&file, b"tamper").is_err());
    assert!(fs::remove_file(&file).is_err());
    drop(lease);
    fs::write(&file, b"tamper").map_err(|e| e.to_string())?;
    assert!(check_file(&file, &expected).is_err());
    Ok(())
}
#[test]
fn failed_job_has_one_terminal_releases_ownership_and_rejects_stale_cancel() -> Result<(), String> {
    let root = tempfile::tempdir().map_err(|e| e.to_string())?;
    let invalid = root.path().join("file");
    fs::write(&invalid, b"not directory").map_err(|e| e.to_string())?;
    let coordinator = composition::coordinator(invalid);
    for n in 1..=2 {
        let job = coordinator.accept(DownloadIntent {
            url: "https://youtu.be/jNQXAC9IVRw".into(),
            quality: Quality::Saver,
            output_dir: root.path().into(),
        })?;
        assert_eq!(job, n);
        let start = Instant::now();
        loop {
            let s = coordinator.snapshot();
            if s.phase.terminal() {
                assert_eq!(s.phase, Phase::Failure);
                assert_eq!(s.terminal_count, 1);
                assert!(s.resources_released);
                assert!(s.workspace.is_none());
                break;
            }
            if start.elapsed() > Duration::from_secs(5) {
                return Err("No terminal".into());
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(!coordinator.cancel(job));
        assert!(!coordinator.cancel(job + 1));
    }
    Ok(())
}
#[test]
#[ignore = "Requires genuine production-prepared cache, supplied via AMEOW_RUNTIME_TEST_ROOT"]
fn genuine_runtime_reuse_verifies_pins_and_lease() -> Result<(), String> {
    let root = std::env::var("AMEOW_RUNTIME_TEST_ROOT").map_err(|e| e.to_string())?;
    let manager = RuntimeManager::new(root.into());
    let lease = manager.prepare(&composition::requirements(), &Control::default(), Arc::new(|_| {}), |s| {
        println!(">>> {s}")
    })?;
    let file = lease.file("deno.exe")?;
    assert!(fs::write(&file, b"tamper").is_err());
    let reused = manager.prepare(&composition::requirements(), &Control::default(), Arc::new(|_| {}), |s| {
        println!(">>> {s}")
    })?;
    assert_eq!(lease.digest, reused.digest);
    drop(lease);
    drop(reused);
    let fresh = RuntimeManager::new(manager.root.clone()).prepare(
        &composition::requirements(),
        &Control::default(),
        Arc::new(|_| {}),
        |_| {},
    )?;
    assert!(fresh.file("ffprobe.exe")?.exists());
    Ok(())
}
#[test]
fn native_sources_reject_local_files_and_credentials_without_metadata_replay() -> Result<(), String>
{
    let mut selected =
        json!({"height":480,"vcodec":"h264","acodec":"aac","url":"https://media.example/video"});
    selection::public_sources(&selected)?;
    for bad in [
        "file:///C:/outside",
        "https://user:password@media.example/video",
    ] {
        selected["url"] = json!(bad);
        assert!(selection::public_sources(&selected).is_err());
    }
    let root = tempfile::tempdir().map_err(|e| e.to_string())?;
    let outside = tempfile::tempdir().map_err(|e| e.to_string())?;
    let path = outside.path().join("sentinel");
    fs::write(&path, b"existing user data").map_err(|e| e.to_string())?;
    assert!(ameow_next::download::output::verify_data(&path, root.path()).is_err());
    assert_eq!(
        fs::read(path).map_err(|e| e.to_string())?,
        b"existing user data"
    );
    Ok(())
}
#[test]
#[ignore = "Requires genuine production-prepared cache via AMEOW_RUNTIME_TEST_ROOT"]
fn genuine_cache_corruption_is_rejected_without_executing_tampered_runtime() -> Result<(), String> {
    let root = std::path::PathBuf::from(
        std::env::var("AMEOW_RUNTIME_TEST_ROOT").map_err(|e| e.to_string())?,
    );
    let manager = RuntimeManager::new(root.clone());
    let lease = manager.prepare(
        &composition::requirements(),
        &Control::default(),
        Arc::new(|_| {}),
        |_| {},
    )?;
    let digest = lease.digest.clone();
    let copy = tempfile::tempdir_in(&root).map_err(|e| e.to_string())?;
    let target = copy.path().join(format!("runtime-{digest}"));
    fs::create_dir(&target).map_err(|e| e.to_string())?;
    for name in [
        "yt-dlp.exe",
        "deno.exe",
        "ffmpeg.exe",
        "ffprobe.exe",
        "gallery-dl.exe",
        "complete.json",
    ] {
        fs::copy(
            root.join(format!("runtime-{digest}")).join(name),
            target.join(name),
        )
        .map_err(|e| e.to_string())?;
    }
    fs::write(target.join("complete.json"), b"incomplete").map_err(|e| e.to_string())?;
    let error = RuntimeManager::new(copy.path().into())
        .prepare(
            &composition::requirements(),
            &Control::default(),
            Arc::new(|_| {}),
            |_| {},
        )
        .err()
        .ok_or("Bad marker accepted")?;
    assert!(error.contains("completion manifest mismatch"));
    fs::copy(
        root.join(format!("runtime-{digest}")).join("complete.json"),
        target.join("complete.json"),
    )
    .map_err(|e| e.to_string())?;
    fs::write(target.join("deno.exe"), b"tampered executable not to run")
        .map_err(|e| e.to_string())?;
    let error = RuntimeManager::new(copy.path().into())
        .prepare(
            &composition::requirements(),
            &Control::default(),
            Arc::new(|_| {}),
            |_| {},
        )
        .err()
        .ok_or("Bad binary accepted")?;
    assert!(error.contains("SHA-256 mismatch"));
    Ok(())
}
#[test]
#[ignore = "Requires genuine production-prepared cache via AMEOW_RUNTIME_TEST_ROOT"]
fn pinned_ffprobe_verifies_real_video_audio_and_rejects_wrong_plan() -> Result<(), String> {
    use ameow_next::download::{
        process_supervisor::{self, ProcessSpec},
        runtime,
    };
    let root = std::path::PathBuf::from(
        std::env::var("AMEOW_RUNTIME_TEST_ROOT").map_err(|e| e.to_string())?,
    );
    let lease =
        RuntimeManager::new(root.clone()).prepare(&composition::requirements(), &Control::default(), Arc::new(|_| {}), |_| {})?;
    let workspace = tempfile::tempdir_in(root).map_err(|e| e.to_string())?;
    let media = workspace.path().join("fixture.mkv");
    let result = process_supervisor::run(
        ProcessSpec {
            executable: lease.file("ffmpeg.exe")?,
            args: vec![
                "-nostdin",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc=size=64x48:rate=5",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=44100",
                "-t",
                "1",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-n",
            ]
            .into_iter()
            .map(str::to_string)
            .chain(Some(media.display().to_string()))
            .collect(),
            cwd: workspace.path().into(),
            env: runtime::child_environment(workspace.path())?,
            stdout_limit: 1024,
            stderr_limit: 128 * 1024,
            timeout: Some(Duration::from_secs(30)),
        },
        &Control::default(),
        Arc::new(|_| {}),
    )?;
    assert_eq!(
        result.exit_code,
        0,
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert!(result.facts.resources_releasable());
    let mut plan = VideoExpectation {
        height: 48,
        codec: VideoCodec::H264,
        height_cap: 1080,
        requires_audio: true,
    };
    let verified = ameow_next::download::verification::video::verify(
        &media,
        workspace.path(),
        &plan,
        &lease,
        &Control::default(),
        Arc::new(|_| {}),
        "ffprobe.exe",
    )?;
    assert!(verified.bytes > 0);
    assert!(fs::write(&media, b"external corruption").is_err());
    assert!(fs::remove_file(&media).is_err());
    let destination = tempfile::tempdir().map_err(|e| e.to_string())?;
    let mut stage = DestinationStage::create(&verified, destination.path(), 1)?;
    stage.fill(&verified)?;
    let delivered = stage.publish(destination.path(), "fixture")?;
    assert!(delivered.is_file());
    plan.height = 1080;
    assert!(
        ameow_next::download::verification::video::verify(
            &media,
            workspace.path(),
            &plan,
            &lease,
            &Control::default(),
            Arc::new(|_| {}),
            "ffprobe.exe"
        )
        .is_err()
    );
    println!(
        ">>> Synthetic fixture only: bytes={} sha256={} facts={:?}",
        verified.bytes, verified.sha256, verified.facts
    );
    Ok(())
}
