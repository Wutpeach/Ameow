use super::*;
use crate::download::{composition, process_supervisor::Control, request::{ClipRange, Quality}, runtime::RuntimeManager};

#[test]
fn output_receipt_is_separate_from_source_codec_and_rejects_dimension_changes() {
    let source = serde_json::json!({"width":1920,"height":1080,"vcodec":"vp9","acodec":"opus",
        "_ameow_output":{"compatible_mp4":true,"width":1920,"height":1080,"fps":60.,"audio_channels":[6,2]}});
    assert_eq!(selection::expectation(&source, Quality::Highest).codec, Some(crate::download::contract::VideoCodec::Vp9));
    let output = output_expectation(&source).unwrap();
    assert!(output.compatible_mp4);
    assert_eq!(output.audio_channels, vec![6, 2]);
    assert!(output_expectation(&serde_json::json!({})).is_err());
    let mut wrong = source.clone(); wrong["_ameow_output"]["width"] = serde_json::json!(1280);
    assert!(output_expectation(&wrong).unwrap_err().starts_with("E_MEDIA_INVALID:"));
    let mut silent = source.clone(); silent["_ameow_output"]["audio_channels"] = serde_json::json!([]);
    assert!(output_expectation(&silent).unwrap().audio_channels.is_empty());
}

#[test]
#[ignore = "Scheduled existing-media verification; requires AMEOW_RUNTIME_TEST_ROOT, AMEOW_EXISTING_MEDIA and AMEOW_EXISTING_MEDIA_EVIDENCE_ROOT"]
fn native_existing_media_rejects_saver_cap_and_accepts_balanced() -> Result<(), String> {
    let runtime_root = PathBuf::from(std::env::var("AMEOW_RUNTIME_TEST_ROOT").map_err(|e| e.to_string())?);
    let source = PathBuf::from(std::env::var("AMEOW_EXISTING_MEDIA").map_err(|e| e.to_string())?);
    let evidence = PathBuf::from(std::env::var("AMEOW_EXISTING_MEDIA_EVIDENCE_ROOT").map_err(|e| e.to_string())?);
    let requirements = composition::requirements();
    let lease = RuntimeManager::new(runtime_root).prepare(&requirements, &Control::default(), Arc::new(|_| {}), |_| {})?;
    fs::create_dir(&evidence).map_err(|e| e.to_string())?;
    let mut expected = selection::expectation(&serde_json::json!({}), Quality::Saver);
    let saver_workspace = evidence.join("saver");
    fs::create_dir(&saver_workspace).map_err(|e| e.to_string())?;
    let saver_source = saver_workspace.join("source.mkv");
    fs::hard_link(&source, &saver_source).map_err(|e| e.to_string())?;
    let rejected = crate::download::verification::video::verify(&saver_source, &saver_workspace, &expected,
        &lease, &Control::default(), Arc::new(|_| {}), "ffprobe.exe").unwrap_err();
    assert_eq!(rejected, "E_MEDIA_INVALID: delivered video exceeds frozen quality cap");
    expected.height_cap = Quality::Balanced.cap();
    let balanced_workspace = evidence.join("balanced");
    fs::create_dir(&balanced_workspace).map_err(|e| e.to_string())?;
    let balanced_source = balanced_workspace.join("source.mkv");
    fs::hard_link(&source, &balanced_source).map_err(|e| e.to_string())?;
    let accepted = crate::download::verification::video::verify(&balanced_source, &balanced_workspace, &expected,
        &lease, &Control::default(), Arc::new(|_| {}), "ffprobe.exe")?;
    assert_eq!((accepted.facts.video_width, accepted.facts.video_height), (Some(1920), Some(1080)));
    fs::write(evidence.join("result.json"), serde_json::to_vec_pretty(&serde_json::json!({
        "source":source, "runner":std::env::current_exe().map_err(|e| e.to_string())?,
        "saver_cap":Quality::Saver.cap(), "saver_error":rejected,
        "balanced_cap":Quality::Balanced.cap(), "balanced_facts":accepted.facts,
        "scope":"Existing owned public sample, production verifier only, no network/download or output policy change"
    })).unwrap()).map_err(|e| e.to_string())?;
    Ok(())
}

#[test]
#[ignore = "Scheduled managed media check; requires AMEOW_RUNTIME_TEST_ROOT and AMEOW_MP4_NATIVE_ROOT"]
fn native_compatible_outputs_use_production_verifier_and_processing_cancel_settles() -> Result<(), String> {
    use std::{sync::atomic::{AtomicBool, Ordering}, thread, time::{Duration, Instant}};
    let root = PathBuf::from(std::env::var("AMEOW_RUNTIME_TEST_ROOT").map_err(|e| e.to_string())?);
    let media_root = PathBuf::from(std::env::var("AMEOW_MP4_NATIVE_ROOT").map_err(|e| e.to_string())?);
    let requirements = composition::requirements();
    let lease = RuntimeManager::new(root.clone()).prepare(&requirements, &Control::default(), Arc::new(|_| {}), |_| {})?;
    for name in ["copy", "audio", "video", "both", "silent", "multi-audio", "fast", "fast-vp8", "precise", "precise-multi", "merge", "sixty", "quicktime", "hdr-preserve"] {
        let result = read_metadata_file(&media_root.join(name).join("result.json"))?;
        let mut expected = selection::expectation(&result, Quality::Highest);
        expected.output = Some(output_expectation(&result)?);
        if expected.output.as_ref().unwrap().compatible_mp4 { expected.codec = Some(crate::download::contract::VideoCodec::H264); }
        let path = PathBuf::from(result["filepath"].as_str().ok_or("sample path missing")?);
        let workspace = media_root.join(name).join("production-verifier");
        fs::create_dir(&workspace).map_err(|e| e.to_string())?;
        let owned_path = workspace.join(path.file_name().ok_or("sample filename missing")?);
        fs::hard_link(&path, &owned_path).map_err(|e| e.to_string())?;
        let verified = if matches!(name, "fast" | "fast-vp8" | "precise" | "precise-multi") {
            crate::download::verification::video::verify_clip(&owned_path, &workspace, &expected, ClipRange { start_ms:1250, end_ms:4750, precise:name.starts_with("precise") }, Some(8.),
                &lease, &Control::default(), Arc::new(|_| {}), "ffprobe.exe")?
        } else {
            crate::download::verification::video::verify(&owned_path, &workspace, &expected, &lease, &Control::default(), Arc::new(|_| {}), "ffprobe.exe")?
        };
        assert_eq!(verified.facts.extension.as_deref(), Some(if name == "hdr-preserve" { "mkv" } else { "mp4" }));
        drop(verified);
    }
    let workspace = media_root.join("processing-cancel");
    fs::create_dir(&workspace).map_err(|e| e.to_string())?;
    let control = Control::default();
    let settled = Arc::new(Mutex::new(Vec::new()));
    let observed = settled.clone();
    let context = ExecutionContext { media_observations:&Default::default(), authentication:None, workspace:&workspace, lease:&lease, requirements:&requirements, control:&control,
        observer:Arc::new(move |event| if let ProcessObservation::Settled(facts) = event { lock_facts(&observed).push(facts); }),
        admission:Arc::new(|_| Ok(())), events:Arc::new(|_| {}) };
    let source = media_root.join("vp9.mkv");
    let metadata = serde_json::json!({"id":"owned","title":"owned","extractor":"generic","extractor_key":"Generic",
        "url":url::Url::from_file_path(&source).map_err(|_| "file URL")?.as_str(),
        "protocol":"file","ext":"mkv","format_id":"owned","vcodec":"vp9","acodec":"opus"});
    let input = workspace.join("input.json");
    fs::write(&input, serde_json::to_vec(&metadata).unwrap()).map_err(|e| e.to_string())?;
    let mut args = engine_args(&context, &network::Route::Direct, Quality::Highest)?;
    let _guards = bounded_http::prepare(&mut args, &workspace, None, &metadata)?;
    args.extend(["--enable-file-urls".into(), "--no-simulate".into(), "--no-write-info-json".into(),
        "--output".into(), workspace.join("media.%(ext)s").display().to_string(), "--load-info-json".into(), input.display().to_string()]);
    let cancel = control.clone();
    let watch = workspace.join("media.compatible.temp.mp4");
    let stopped = Arc::new(AtomicBool::new(false));
    let stopping = stopped.clone();
    let watcher = thread::spawn(move || {
        let started = Instant::now();
        while started.elapsed() < Duration::from_secs(20) && !stopping.load(Ordering::SeqCst) {
            if fs::metadata(&watch).is_ok_and(|m| m.len() > 0) { cancel.cancel(); return true; }
            thread::sleep(Duration::from_millis(5));
        }
        false
    });
    let outcome = context.run(ManagedCommand { tool:"yt-dlp.exe", args, stdout_limit:65536, stderr_limit:65536, timeout:Some(Duration::from_secs(30)) }, None);
    stopped.store(true, Ordering::SeqCst);
    let cancelled_during_output = watcher.join().map_err(|_| "cancel watcher panicked")?;
    let outcome = outcome?;
    assert!(cancelled_during_output && control.is_cancelled());
    assert!(outcome.facts.resources_releasable());
    assert!(outcome.facts.total_processes >= 2);
    assert_eq!(lock_facts(&settled).len(), 1);
    let facts = &outcome.facts;
    fs::write(workspace.join("settlement.json"), serde_json::to_vec_pretty(&serde_json::json!({
        "cancelled_after_output_open":cancelled_during_output,"root_pid":facts.root_pid,"total_processes":facts.total_processes,
        "root_waited":facts.root_waited,"job_active_zero":facts.job_active_zero,"stdout_reader_joined":facts.stdout_reader_joined,
        "stderr_reader_joined":facts.stderr_reader_joined,"callback_consumer_joined":facts.callback_consumer_joined
    })).unwrap()).map_err(|e| e.to_string())?;
    Ok(())
}

fn lock_facts(value: &Mutex<Vec<process_supervisor::SettlementFacts>>) -> std::sync::MutexGuard<'_, Vec<process_supervisor::SettlementFacts>> {
    crate::download::lock(value)
}
