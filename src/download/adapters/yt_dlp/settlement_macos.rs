use super::{InvocationPhase, RESOLVED_FILE, SELECTION_FILE, SELECTION_PREFIX, TRANSFER_INFO_FILE};
use crate::download::{process_supervisor::ProcessSpec, runtime::{self, RuntimeLease}};
use std::{fs::{self, File}, io::{self, Read}, path::Path};

const MAX_STDOUT_CAPTURE: usize = crate::download::process_supervisor::MAX_STDOUT_CAPTURE;

pub(crate) struct ManagedCompletion {
    phase: InvocationPhase,
    binding: Option<ProcessSpec>,
    _guards: Vec<File>,
}

impl ManagedCompletion {
    pub(crate) fn for_invocation(
        spec: &ProcessSpec,
        lease: &RuntimeLease,
        phase: InvocationPhase,
    ) -> Result<Option<Self>, String> {
        let guards = lease.execution_guards()?;
        for name in ["rtmpdump", "phantomjs"] {
            match fs::symlink_metadata(spec.cwd.join(name)) {
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                _ => return Ok(None),
            }
        }
        if phase == InvocationPhase::Transfer
            && !transfer_record(&spec.cwd.join(RESOLVED_FILE), None)
                .is_some_and(|value| transfer_media_value(&value))
        {
            return Ok(None);
        }
        Ok(Some(Self { phase, binding: Some(spec.clone()), _guards: guards }))
    }

    pub(crate) fn matches_invocation(&self, spec: &ProcessSpec) -> bool {
        self.binding.as_ref() == Some(spec)
    }

    pub(crate) fn accepts_nonzero_exit(&self) -> bool {
        matches!(self.phase, InvocationPhase::Resolve | InvocationPhase::Transfer)
    }

    pub(crate) fn complete(&self, workspace: &Path) -> bool {
        match self.phase {
            InvocationPhase::Resolve => true,
            InvocationPhase::Transfer => transfer_media_completion(workspace),
            #[cfg(test)]
            InvocationPhase::Fixture => true,
        }
    }

    #[cfg(test)]
    pub(crate) fn fixture(phase: InvocationPhase) -> Self {
        Self { phase, binding: None, _guards: Vec::new() }
    }
}

#[cfg(test)]
fn transfer_media_metadata(bytes: &[u8]) -> bool {
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(bytes) else {
        return false;
    };
    transfer_media_value(&value)
}

fn transfer_media_kind(value: &serde_json::Value) -> bool {
    use serde_json::Value;
    if !value.is_object()
        || !matches!(
            value.get("is_live"),
            None | Some(Value::Null | Value::Bool(false))
        )
        || value.get("live_status").is_some_and(|status| {
            !status.is_null() && !matches!(status.as_str(), Some("not_live" | "was_live"))
        })
        || value
            .get("_type")
            .is_some_and(|kind| !kind.is_null() && kind.as_str() != Some("video"))
        || ["entries", "playlist", "playlist_id", "playlist_index"]
            .iter()
            .any(|key| value.get(key).is_some_and(|field| !field.is_null()))
    {
        return false;
    }
    let Some(protocol) = value.get("protocol").and_then(Value::as_str) else {
        return false;
    };
    protocol.split('+').all(|part| {
        matches!(
            part,
            "http" | "https" | "http_dash_segments" | "m3u8" | "m3u8_native" | "f4m" | "ism"
        )
    })
}

fn transfer_media_value(value: &serde_json::Value) -> bool {
    use serde_json::Value;
    if !transfer_media_kind(value) {
        return false;
    }
    let protocol = value["protocol"].as_str().unwrap();
    let mut has_selection = false;
    for key in ["requested_formats", "requested_downloads"] {
        match value.get(key) {
            None | Some(Value::Null) => {}
            Some(Value::Array(selected))
                if !selected.is_empty()
                    && selected.len() <= (if key == "requested_formats" { 2 } else { 1 }) =>
            {
                // yt-dlp removes unchanged parent fields from requested_downloads.
                // A filename summary cannot establish the selected media on its own.
                if selected.iter().all(transfer_media_value) {
                    has_selection = true;
                } else if key != "requested_downloads"
                    || !selected.iter().all(transfer_filename_summary)
                {
                    return false;
                }
            }
            _ => return false,
        }
    }
    if has_selection {
        return true;
    }
    !protocol.contains('+')
        && value
            .get("url")
            .and_then(Value::as_str)
            .is_some_and(|input| {
                url::Url::parse(input).is_ok_and(|url| {
                    matches!(url.scheme(), "http" | "https") && url.host_str().is_some()
                })
            })
}

fn transfer_filename_summary(value: &serde_json::Value) -> bool {
    let Some(summary) = value.as_object() else { return false };
    summary.keys().any(|key| matches!(key.as_str(), "filename" | "_filename"))
        && summary.iter().all(|(key, field)| match key.as_str() {
            "filename" | "_filename" => field.as_str().is_some_and(|name| !name.is_empty()),
            "__write_download_archive" => field.is_boolean() || field.as_str() == Some("ignore"),
            _ => false,
        })
}

fn transfer_record(path: &Path, prefix: Option<&str>) -> Option<serde_json::Value> {
    let metadata = fs::symlink_metadata(path).ok()?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() > MAX_STDOUT_CAPTURE as u64
    {
        return None;
    }
    let file = runtime::open_identity_file(path).ok()?;
    let mut bytes = Vec::new();
    file.take(MAX_STDOUT_CAPTURE as u64 + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() > MAX_STDOUT_CAPTURE {
        return None;
    }
    let record = if let Some(prefix) = prefix {
        if !bytes.ends_with(b"\n") {
            return None;
        }
        let mut lines = std::str::from_utf8(&bytes).ok()?.lines();
        let record = lines.next()?.strip_prefix(prefix)?;
        if lines.next().is_some() {
            return None;
        }
        record.as_bytes()
    } else {
        &bytes
    };
    serde_json::from_slice(record).ok()
}

fn transfer_media_completion(workspace: &Path) -> bool {
    let Some(selection) =
        transfer_record(&workspace.join(SELECTION_FILE), Some(SELECTION_PREFIX))
    else {
        return false;
    };
    let Some(summary) = transfer_record(&workspace.join(TRANSFER_INFO_FILE), None) else {
        return false;
    };
    transfer_media_value(&selection)
        && transfer_media_kind(&summary)
        && summary["protocol"] == selection["protocol"]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::download::process_supervisor::{self, Control};
    use std::{sync::Arc, time::Duration};

    #[test]
    fn changed_invocation_cannot_reuse_completion_or_spawn() {
        let spec = ProcessSpec {
            executable: "/missing/managed-python".into(),
            args: vec!["--owned-argument".into()],
            cwd: "/tmp/owned-attempt".into(),
            env: vec![("PATH".into(), String::new())],
            stdout_limit: 4096,
            stderr_limit: 4096,
            timeout: Some(Duration::from_secs(1)),
        };
        for field in ["executable", "args", "cwd", "env", "timeout"] {
            let completion = ManagedCompletion {
                phase: InvocationPhase::Resolve,
                binding: Some(spec.clone()),
                _guards: Vec::new(),
            };
            assert!(completion.matches_invocation(&spec));
            let mut changed = spec.clone();
            match field {
                "executable" => changed.executable = "/missing/other-python".into(),
                "args" => changed.args.push("--exec=touch /tmp/should-not-run".into()),
                "cwd" => changed.cwd = "/tmp/other-attempt".into(),
                "env" => changed.env.push(("DYLD_INSERT_LIBRARIES".into(), "/tmp/injected.dylib".into())),
                "timeout" => changed.timeout = None,
                _ => unreachable!(),
            }
            let error = process_supervisor::run_managed(
                changed, Some(completion), &Control::default(), Arc::new(|_| {}),
            ).unwrap_err();
            assert_eq!(error, "Managed completion does not match the actual invocation");
        }
    }

    #[test]
    #[ignore = "requires an isolated managed cache and the public W3Schools media sample"]
    fn real_recommended_and_selected_runtime_resolve_transfer_failure_and_cancel() {
        use crate::download::{
            adapter::{DownloaderAdapter, ExecutionContext},
            composition,
            contract::ExecutionRequest,
            process_supervisor::ProcessObservation,
            request::{Accepted, DownloadIntent, Quality},
            runtime::RuntimeManager,
            runtime_update_trust,
        };
        use std::sync::Mutex;

        let root = std::path::PathBuf::from(std::env::var_os("AMEOW_C7_EVIDENCE_ROOT").expect("set isolated evidence root"));
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(root.join("output")).unwrap();
        let cases = root.join(format!("run-{}", std::process::id()));
        fs::create_dir(&cases).unwrap();
        let requirements = composition::requirements();
        let cache = root.join("runtime");
        let recommended = RuntimeManager::new(cache.clone()).prepare(
            &requirements, &Control::default(), Arc::new(|_| {}), |_| {},
        ).unwrap();
        let selected = runtime_update_trust::prepare_candidate(
            cache, "2026.10.26", true, &requirements, &Control::default(), Arc::new(|_| {}), |_| {},
        ).unwrap();
        assert_ne!(recommended.versions, selected.versions);
        assert_ne!(runtime::hash(File::open(recommended.file("yt-dlp").unwrap()).unwrap()).unwrap(),
            runtime::hash(File::open(selected.file("yt-dlp").unwrap()).unwrap()).unwrap());
        let mut results = Vec::new();
        for (label, lease) in [("recommended", recommended), ("selected", selected)] {
            for action in ["transfer", "nonzero", "cancel"] {
                let workspace = cases.join(format!("{label}-{action}"));
                fs::create_dir(&workspace).unwrap();
                let control = Control::default();
                let cancel = control.clone();
                let observations = Arc::new(Mutex::new(Vec::new()));
                let recorded = observations.clone();
                let settlements = Arc::new(Mutex::new(Vec::new()));
                let recorded_settlements = settlements.clone();
                let observer = Arc::new(move |event: ProcessObservation| {
                    if action == "cancel" && matches!(event, ProcessObservation::Running { .. }) {
                        cancel.cancel();
                    }
                    if !matches!(event, ProcessObservation::Output { .. }) {
                        recorded.lock().unwrap().push(format!("{event:?}"));
                    }
                    if let ProcessObservation::Settled(facts) = event {
                        recorded_settlements.lock().unwrap().push(facts);
                    }
                });
                let context = ExecutionContext {
                    workspace: &workspace, lease: &lease, requirements: &requirements,
                    control: &control, observer, admission: Arc::new(|_| Ok(())), events: Arc::new(|_| {}),
                };
                let url = if action == "nonzero" {
                    "https://www.w3schools.com/html/ameow-c7-missing.mp4"
                } else {
                    "https://www.w3schools.com/html/mov_bbb.mp4"
                };
                let accepted = Accepted::new(DownloadIntent { url: url.into(), quality: Quality::Balanced, output_dir: root.join("output") }).unwrap();
                let adapter = super::super::YtDlpAdapter::new(requirements.clone());
                let result = adapter.execute(&ExecutionRequest { accepted, resume: None }, &context);
                let observations = observations.lock().unwrap();
                fs::write(workspace.join("process-observations.json"), serde_json::to_vec_pretty(&*observations).unwrap()).unwrap();
                assert!(!observations.iter().any(|event| event.starts_with("Held(")), "{label}/{action}: {observations:?}");
                let facts = settlements.lock().unwrap();
                assert!(facts.iter().all(|facts| facts.resources_releasable()));
                let settled = facts.len();
                assert_eq!(settled, if action == "transfer" { 2 } else { 1 });
                if action == "transfer" {
                    let artifact = result.as_ref().unwrap();
                    assert!(workspace.join(&artifact.relative_path).metadata().unwrap().len() > 0);
                } else {
                    assert!(result.is_err());
                    if action == "cancel" { assert_eq!(result.as_ref().unwrap_err().code, "E_CANCELLED"); }
                }
                results.push(serde_json::json!({"runtime":label,"versions":lease.versions,"workspace":workspace,"action":action,"settled_processes":settled,"result":format!("{result:?}"),"observations":*observations}));
                fs::write(root.join("real-results.json"), serde_json::to_vec_pretty(&results).unwrap()).unwrap();
            }
        }
    }
    #[test]
    fn retained_filename_summary_uses_parent_media_and_completion_records() {
        let resolved = include_bytes!("../../../../tests/fixtures/yt-dlp-macos/resolved.json");
        assert!(transfer_media_metadata(resolved));
        let workspace = tempfile::tempdir().unwrap();
        fs::write(workspace.path().join(SELECTION_FILE),
            include_bytes!("../../../../tests/fixtures/yt-dlp-macos/selection.txt")).unwrap();
        fs::write(workspace.path().join(TRANSFER_INFO_FILE),
            include_bytes!("../../../../tests/fixtures/yt-dlp-macos/media.info.json")).unwrap();
        assert!(transfer_media_completion(workspace.path()));
    }

    #[test]
    fn filename_summary_cannot_hide_missing_media_or_unknown_download_structure() {
        use serde_json::json;
        let retained: serde_json::Value = serde_json::from_slice(
            include_bytes!("../../../../tests/fixtures/yt-dlp-macos/resolved.json")
        ).unwrap();
        for summary in [
            json!({}), json!("media.mp4"), json!(null),
            json!({"filename":""}), json!({"filename":42}),
            json!({"filename":"media.mp4","__write_download_archive":null}),
            json!({"filename":"media.mp4","unknown":true}),
            json!({"filename":"media.mp4","protocol":"rtmp"}),
            json!({"filename":"media.mp4","requested_formats":[{}]}),
        ] {
            let mut metadata = retained.clone();
            metadata["requested_downloads"] = json!([summary]);
            assert!(!transfer_media_value(&metadata), "{metadata}");
        }
        for (key, invalid) in [
            ("url", json!(null)), ("protocol", json!("https+https")),
            ("requested_formats", json!([{}])),
        ] {
            let mut metadata = retained.clone();
            metadata[key] = invalid;
            assert!(!transfer_media_value(&metadata), "{key}");
        }
        let mut metadata = retained;
        metadata["requested_formats"] = metadata["requested_downloads"].clone();
        assert!(!transfer_media_value(&metadata));
    }

    #[test]
    fn transfer_media_accepts_combined_separate_and_nested_http_without_a_site_list() {
        use serde_json::json;
        let combined = json!({"id":"clip","extractor_key":"Generic","protocol":"https","url":"https://media.example/video.mp4"});
        let separate = json!({
            "id":"BV13x41117TL", "extractor_key":"BiliBili", "protocol":"https+https",
            "requested_formats":[
                {"protocol":"https","url":"https://media.example/video.mp4"},
                {"protocol":"https","url":"https://media.example/audio.m4a"}
            ]
        });
        let nested = json!({"protocol":"https+https","requested_downloads":[separate.clone()]});
        let mut summarized_separate = separate.clone();
        summarized_separate["requested_downloads"] = json!([{"filename":"media.mkv","__write_download_archive":false}]);
        for metadata in [combined, separate, nested, summarized_separate] {
            assert!(transfer_media_metadata(
                &serde_json::to_vec(&metadata).unwrap()
            ));
        }
        let mut nested = json!({"protocol":"https","url":"https://media.example/video.mp4"});
        for _ in 0..32 {
            nested = json!({"protocol":"https","requested_downloads":[nested]});
        }
        assert!(transfer_media_value(&nested));
        for protocol in [
            "http",
            "https",
            "http_dash_segments",
            "m3u8",
            "m3u8_native",
            "f4m",
            "ism",
        ] {
            let metadata = json!({"protocol":protocol,"url":"https://media.example/stream"});
            assert!(transfer_media_metadata(
                &serde_json::to_vec(&metadata).unwrap()
            ));
        }
    }

    #[test]
    fn transfer_media_rejects_live_collections_and_unreviewed_selected_protocols() {
        use serde_json::json;
        let valid = json!({"protocol":"https","url":"https://media.example/video.mp4"});
        for (key, value) in [
            ("is_live", json!(true)),
            ("live_status", json!("is_live")),
            ("_type", json!("playlist")),
            ("entries", json!([])),
            ("playlist_id", json!("collection")),
            ("playlist_index", json!(1)),
            ("protocol", json!("rtmp")),
            ("url", json!("bluray:/disc")),
            ("requested_formats", json!([])),
            ("requested_downloads", json!([valid.clone(), valid.clone()])),
        ] {
            let mut metadata = valid.clone();
            metadata[key] = value;
            assert!(
                !transfer_media_metadata(&serde_json::to_vec(&metadata).unwrap()),
                "{key}"
            );
        }
        let mut metadata =
            json!({"protocol":"https+https","requested_formats":[valid.clone(), valid.clone()]});
        metadata["requested_formats"][1]["protocol"] = json!("file");
        assert!(!transfer_media_metadata(
            &serde_json::to_vec(&metadata).unwrap()
        ));
        let mut metadata = valid;
        metadata["formats"] = json!([{"protocol":"rtmp","url":"rtmp://unused.example/video"}]);
        assert!(transfer_media_metadata(
            &serde_json::to_vec(&metadata).unwrap()
        ));
    }

 }
