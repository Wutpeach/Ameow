use super::*;
use crate::download::{request::ClipRange, runtime::{self, RuntimeManager, TrustedRuntimeRequirements}};

#[test]
#[ignore = "Requires pinned local tools via AMEOW_CLIP_TEST_TOOLS and private AMEOW_CLIP_TEST_EVIDENCE; no network/cache preparation"]
fn offline_clip_verifier_checks_duration_modes_and_media_integrity() -> Result<(), String> {
    let tools = std::path::PathBuf::from(std::env::var("AMEOW_CLIP_TEST_TOOLS").map_err(|e| e.to_string())?);
    let evidence = std::path::PathBuf::from(std::env::var("AMEOW_CLIP_TEST_EVIDENCE").map_err(|e| e.to_string())?);
    let root = tempfile::tempdir_in(&evidence).map_err(|e| e.to_string())?;
    // Only the empty test lease writes here; genuine binaries remain guarded in their existing cache.
    let mut lease = RuntimeManager::new(root.path().join("runtime")).prepare(
        &TrustedRuntimeRequirements::empty(), &Control::default(), Arc::new(|_| {}), |_| {},
    )?;
    let mut guards = Vec::new();
    for file in runtime::manifest()?.components.into_iter().flat_map(|c| c.files)
        .filter(|f| matches!(f.name.as_str(), "ffmpeg.exe" | "ffprobe.exe")) {
        let path = tools.join(&file.name);
        guards.push(runtime::check_file(&path, &file.sha256)?);
        Arc::get_mut(&mut lease).unwrap().files.insert(file.name, path);
    }
    assert_eq!(guards.len(), 2);
    let run = |tool: &str, args: Vec<String>, cwd: &Path| {
        let result = process_supervisor::run(ProcessSpec {
            executable: lease.file(tool)?, args, cwd: cwd.into(), env: runtime::child_environment(cwd)?,
            stdout_limit: 1024 * 1024, stderr_limit: 65536, timeout: Some(Duration::from_secs(30)),
        }, &Control::default(), Arc::new(|_| {}))?;
        assert!(result.facts.resources_releasable());
        assert!(!result.facts.stdout_truncated);
        assert_eq!(result.exit_code, 0, "{}", String::from_utf8_lossy(&result.stderr));
        Ok::<_, String>(result.stdout)
    };
    let plan = VideoExpectation { height: Some(48), codec: Some(VideoCodec::H264), height_cap: 1080, requires_audio: true };
    for (name, generated, requested_ms, precise, source, passes) in [
        ("short", "3", 3000, false, Some(600.), true),
        ("long", "125", 125000, false, Some(600.), true),
        ("short-preroll", "13.019", 3000, false, Some(600.), true),
        ("long-preroll", "135.059", 125000, false, Some(600.), true),
        ("short-overrun", "13.6", 3000, false, Some(36000.), false),
        ("long-overrun", "135.6", 125000, false, Some(36000.), false),
        ("short-truncated", "2", 3000, false, Some(600.), false),
        ("long-truncated", "124", 125000, false, Some(600.), false),
        ("whole-source", "13", 3000, false, Some(13.), false),
        ("unknown-source-overrun", "20", 3000, false, None, false),
        ("precise", "3", 3000, true, Some(600.), true),
        ("precise-near-boundary", "3.04", 3000, true, Some(600.), true),
        ("precise-overrun", "3.12", 3000, true, Some(600.), false),
        ("precise-truncated", "2.84", 3000, true, Some(600.), false),
    ] {
        let workspace = tempfile::tempdir_in(root.path()).map_err(|e| e.to_string())?;
        let media = workspace.path().join("fixture.mkv");
        run("ffmpeg.exe", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=64x48:r=25",
            "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", generated,
            "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-n"]
            .into_iter().map(str::to_string).chain([media.display().to_string()]).collect(), workspace.path())?;
        let range = ClipRange { start_ms: 1000, end_ms: 1000 + requested_ms, precise };
        let result = verify_clip(&media, workspace.path(), &plan, range, source, &lease, &Control::default(), Arc::new(|_| {}), "ffprobe.exe");
        let info: Value = serde_json::from_slice(&fs::read(workspace.path().join("ffprobe.json")).map_err(|e| e.to_string())?).unwrap();
        println!("{name}: requested_ms={requested_ms}, duration={}, result={:?}", info["format"]["duration"], result.as_ref().map(|m| (m.bytes, &m.sha256)).map_err(String::as_str));
        assert_eq!(result.is_ok(), passes, "{name}: {result:?}");
        if !passes {
            let prefix = if precise { "E_MEDIA_INVALID:" } else { "E_CLIP_UNSUPPORTED:" };
            assert!(result.as_ref().unwrap_err().starts_with(prefix), "{name}: {result:?}");
        }
        for file in ["ffprobe.json", "media-decode-stderr.log"] {
            let path = workspace.path().join(file);
            if path.exists() { fs::copy(&path, evidence.join(format!("{name}-{file}"))).map_err(|e| e.to_string())?; }
        }
        drop(result);
        if name == "short" {
            let mut wrong = plan.clone(); wrong.codec = Some(VideoCodec::Av1);
            assert!(verify_clip(&media, workspace.path(), &wrong, range, source, &lease, &Control::default(), Arc::new(|_| {}), "ffprobe.exe").unwrap_err().contains("codec differ"));
            let packets: Value = serde_json::from_slice(&run("ffprobe.exe", ["-v", "error", "-select_streams", "v:0", "-read_intervals", "%+#1", "-show_packets", "-of", "json"]
                .into_iter().map(str::to_string).chain([media.display().to_string()]).collect(), workspace.path())?).unwrap();
            let pos: usize = packets["packets"][0]["pos"].as_str().unwrap().parse().unwrap();
            let size: usize = packets["packets"][0]["size"].as_str().unwrap().parse().unwrap();
            let mut damaged = fs::read(&media).map_err(|e| e.to_string())?;
            damaged[pos + size / 2..pos + size].fill(0xff);
            let path = workspace.path().join("damaged.mkv");
            fs::write(&path, damaged).map_err(|e| e.to_string())?;
            // The header is still plausible: rejection must come from complete media decoding.
            drop(verify(&path, workspace.path(), &plan, &lease, &Control::default(), Arc::new(|_| {}), "ffprobe.exe")?);
            let failure = verify_clip(&path, workspace.path(), &plan, range, source, &lease, &Control::default(), Arc::new(|_| {}), "ffprobe.exe").unwrap_err();
            assert!(failure.starts_with("E_MEDIA_INVALID:"), "{failure}");
            println!("wrong-codec rejected; plausible-header damaged media rejected: {failure}");
            fs::copy(workspace.path().join("media-decode-stderr.log"), evidence.join("damaged-decode-stderr.log")).map_err(|e| e.to_string())?;
        }
    }
    drop(guards);
    Ok(())
}
