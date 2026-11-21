use super::*;
#[test]
#[ignore = "Requires task-owned genuine runtime cache via AMEOW_RUNTIME_TEST_ROOT; no network or account"]
fn native_safe_selection_preserves_separate_progress_without_private_metadata() -> Result<(), String> {
    use crate::download::{composition, process_supervisor::{Control, ProcessSpec}, runtime::RuntimeManager};
    use serde_json::json;
    let root = PathBuf::from(std::env::var("AMEOW_RUNTIME_TEST_ROOT").map_err(|e| e.to_string())?);
    let work = tempfile::tempdir_in(&root).map_err(|e| e.to_string())?;
    let requirements = composition::requirements();
    let control = Control::default();
    let lease = RuntimeManager::new(root).prepare(&requirements, &control, Arc::new(|_| {}), |_| {})?;
    let secret = "SYNTHETIC_PRIVATE_METADATA";
    let video = json!({"format_id":"v","ext":"mp4","protocol":"https","vcodec":"avc1","acodec":"none","height":240,
        "url":format!("https://example.com/video?token={secret}"),"http_headers":{"Cookie":secret}});
    let audio = json!({"format_id":"a","ext":"m4a","protocol":"https","vcodec":"none","acodec":"aac",
        "url":format!("https://example.com/audio?token={secret}"),"http_headers":{"Authorization":secret}});
    for separate in [false, true] {
        let mut metadata = json!({"id":"fixture","title":secret,"extractor_key":"Generic","extractor":"generic",
            "format_id":"muxed","protocol":"https","vcodec":"avc1","acodec":"aac","height":240,
            "url":format!("https://example.com/media?token={secret}")});
        if separate {
            metadata["format_id"] = json!("v+a");
            metadata["protocol"] = json!("https+https");
            metadata["requested_formats"] = json!([video, audio]);
            metadata["formats"] = json!([video, audio]);
        }
        let info = work.path().join("input.json");
        fs::write(&info, serde_json::to_vec(&metadata).unwrap()).map_err(|e| e.to_string())?;
        let outcome = process_supervisor::run(ProcessSpec {
            executable: lease.file("yt-dlp.exe")?,
            args: vec!["--ignore-config".into(),"--no-plugin-dirs".into(),"--simulate".into(),
                "--load-info-json".into(),info.display().to_string(),"--output-na-placeholder".into(),"null".into(),
                "--print".into(),SAFE_SELECTION.into()],
            cwd: work.path().into(), env: requirements.environment(work.path())?,
            stdout_limit: 65536, stderr_limit: 65536, timeout: Some(std::time::Duration::from_secs(15)),
        }, &control, Arc::new(|_| {}))?;
        validate_engine_outcome(&outcome, "selection-fixture")?;
        assert!(!String::from_utf8_lossy(&outcome.stdout).contains(secret));
        let record = work.path().join(SELECTION_FILE);
        fs::write(&record, [SELECTION_PREFIX.as_bytes(), &outcome.stdout].concat()).map_err(|e| e.to_string())?;
        let selected = read_selection(&record)?;
        let mut feed = progress::ProgressFeed::selected(&selected);
        for (sequence, bytes) in [25, 50, 75].into_iter().enumerate() {
            let line = format!("AMEOW_PROGRESS={}\n", json!({"status":"downloading","format_id":if separate {"v"} else {selected["format_id"].as_str().unwrap()},
                "downloaded_bytes":bytes,"total_bytes":100,"total_bytes_estimate":null,"speed":10}));
            let sample = feed.push(false, sequence as u64 + 1, &line, sequence as u64 * 250)
                .unwrap_or_else(|| panic!("Missing primary progress: separate={separate}, selected={selected}"));
            assert_eq!(sample.phase, crate::download::progress::TransferPhase::Primary);
            assert_eq!(sample.fraction, Some(bytes as f32 / 100.));
        }
    }
    Ok(())
}
#[test]
fn only_one_complete_bounded_native_selection_can_attest_progress_or_final_result() {
    let root = tempfile::tempdir().unwrap();
    let record = root.path().join(SELECTION_FILE);
    fs::write(&record, b"AMEOW_SELECTION={\"height\":480}\n").unwrap();
    assert_eq!(read_selection(&record).unwrap()["height"], 480);
    for bytes in [
        b"".as_slice(),
        b"AMEOW_SELECTION={}",
        b"AMEOW_SELECTION={}\nAMEOW_SELECTION={}\n",
        b"AMEOW_SELECTION={broken}\n",
        b"unmarked={}\n",
    ] {
        fs::write(&record, bytes).unwrap();
        assert!(read_selection(&record).is_err());
    }
    fs::write(&record, vec![b'x'; METADATA_LIMIT + 1]).unwrap();
    assert!(read_selection(&record).is_err());
}
