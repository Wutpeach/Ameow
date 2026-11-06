//! Pinned native downloader integration. All private protocols stay in this adapter.
pub mod diagnostics;
pub mod identity;
pub mod progress;
pub mod selection;
use crate::download::{
    Phase,
    adapter::{DownloaderAdapter, ExecutionContext, ManagedCommand},
    contract::{
        AdapterEvent, AdapterResult, ExecutionRequest, MediaKind, ProducedArtifact,
        VerificationRequirements,
    },
    diagnostics::{Failure, FailureCode},
    network,
    process_supervisor::{self, ProcessObservation},
    runtime::TrustedRuntimeRequirements,
    request::{Accepted, Object},
};
use serde_json::Value;
use std::{
    fs::{self, File},
    io::Read,
    net::ToSocketAddrs,
    os::windows::fs::MetadataExt,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

const METADATA_LIMIT: usize = process_supervisor::MAX_STDOUT_CAPTURE;
const EVIDENCE: &[(&str, u64)] = &[
    ("resolved.json", METADATA_LIMIT as u64),
    ("media.info.json", METADATA_LIMIT as u64),
    ("selection.txt", METADATA_LIMIT as u64),
    ("resolve-argv.json", 8 * 1024 * 1024),
    ("resolve-stdout.log", METADATA_LIMIT as u64),
    ("resolve-stderr.log", 1024 * 1024),
    ("resolve-settlement.txt", 65536),
    ("transfer-argv.json", 8 * 1024 * 1024),
    ("transfer-stdout.log", 4 * 1024 * 1024),
    ("transfer-stderr.log", 1024 * 1024),
    ("transfer-settlement.txt", 65536),
    ("final-object.txt", 4096),
    ("adapter-error.log", 65536),
];
pub struct YtDlpAdapter {
    requirements: TrustedRuntimeRequirements,
}
impl YtDlpAdapter {
    pub fn new(requirements: TrustedRuntimeRequirements) -> Self {
        Self { requirements }
    }
}
impl DownloaderAdapter for YtDlpAdapter {
    fn kind(&self) -> MediaKind {
        MediaKind::Video
    }
    fn requirements(&self) -> &TrustedRuntimeRequirements {
        &self.requirements
    }
    fn evidence_files(&self) -> &[(&str, u64)] {
        EVIDENCE
    }
    fn execute(&self, request: &ExecutionRequest, context: &ExecutionContext<'_>) -> AdapterResult {
        let accepted = &request.accepted;
        let working = context.workspace();
        let mut phase = Phase::Resolving;
        let result = (|| {
            if context.cancelled() {
                return Err("Cancelled before extraction".into());
            }
            context.emit(AdapterEvent::Resolving);
            check_generic_destination(accepted)?;
            let route = network::engine_route(&accepted.intent.url)
                .map_err(|e| format!("E_NETWORK_ENGINE_ROUTE_UNSUPPORTED: {e}"))?;
            let mut args = engine_args(context, &route, accepted.intent.quality)?;
            generic_args(&mut args, accepted, true);
            args.extend([
                "--dump-single-json".into(),
                "--skip-download".into(),
                "--".into(),
                accepted.intent.url.clone(),
            ]);
            let bytes = invoke(context, args, None, "resolve")?;
            let metadata = parse_metadata(&bytes)?;
            check_generic_object(accepted, &metadata)?;
            let proof =
                identity::proof(accepted, &metadata).map_err(|e| format!("E_IDENTITY: {e}"))?;
            selection::expectation(&metadata, accepted.intent.quality)?;
            selection::public_sources(&metadata)?;
            context
                .admit(&proof)
                .map_err(|failure| format!("{}: {}", failure.code, failure.reason))?;
            fs::write(working.join("resolved.json"), &bytes).map_err(|e| e.to_string())?;
            let canonical = identity::canonical_url(accepted, &proof.identity);
            if network::engine_route(&canonical)
                .map_err(|e| format!("E_NETWORK_ENGINE_ROUTE_UNSUPPORTED: {e}"))?
                != route
            {
                return Err("E_NETWORK_ENGINE_ROUTE_UNSUPPORTED: canonical origin differs from accepted route".into());
            }
            if context.cancelled() {
                return Err("Cancelled before media transfer".into());
            }
            phase = Phase::Downloading;
            context.emit(AdapterEvent::Transferring);
            check_generic_destination(accepted)?;
            for name in ["final-object.txt", "selection.txt"] {
                fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(working.join(name))
                    .map_err(|e| e.to_string())?;
            }
            let mut args = engine_args(context, &route, accepted.intent.quality)?;
            generic_args(&mut args, accepted, false);
            args.extend([
                "--no-simulate".into(),
                "--merge-output-format".into(),
                "mkv".into(),
                "--remux-video".into(),
                "mkv".into(),
                "--output".into(),
                working.join("media.%(ext)s").display().to_string(),
                "--write-info-json".into(),
                "--no-overwrites".into(),
                "--newline".into(),
                "--progress".into(),
                "--progress-delta".into(),
                "0.2".into(),
                "--output-na-placeholder".into(),
                "null".into(),
                "--progress-template".into(),
                progress::DOWNLOAD_TEMPLATE.into(),
                "--progress-template".into(),
                progress::PP_TEMPLATE.into(),
                "--print-to-file".into(),
                "before_dl:AMEOW_SELECTION=%()j".into(),
                working.join("selection.txt").display().to_string(),
                "--print-to-file".into(),
                "after_move:AMEOW_FINAL=%(filepath)j".into(),
                working.join("final-object.txt").display().to_string(),
                "--".into(),
                canonical,
            ]);
            let timeline = progress::Timeline::from_args();
            let feed = Mutex::new((false, progress::ProgressFeed::selected(&Value::Null).with_timeline(timeline.clone())));
            let selected_path = working.join("selection.txt");
            let expected = proof.identity.canonical_key();
            let accepted_for_progress = accepted.clone();
            let events = context.events.clone();
            let output = Arc::new(move |event: ProcessObservation| {
                if let ProcessObservation::Output {
                    stderr,
                    sequence,
                    text,
                } = event
                {
                    let mut state = crate::download::lock(&feed);
                    if !state.0
                        && let Ok(value) = read_selection(&selected_path)
                        && let Ok(proof) = identity::proof(&accepted_for_progress, &value)
                        && proof.identity.canonical_key() == expected
                        && selection::expectation(&value, accepted_for_progress.intent.quality)
                            .is_ok()
                    {
                        state.1 = progress::ProgressFeed::selected(&value).with_timeline(timeline.clone());
                        state.0 = true;
                    }
                    if let Some(sample) =
                        state
                            .1
                            .push(stderr, sequence, &text, crate::download::progress::now_ms())
                    {
                        events(AdapterEvent::Progress(sample));
                    }
                }
            });
            let record = invoke(context, args, Some(output), "transfer")?;
            let final_path = parse_final_record(&record)?;
            let canonical_path = final_path.canonicalize().map_err(|e| e.to_string())?;
            let canonical_workspace = working.canonicalize().map_err(|e| e.to_string())?;
            let relative_path = canonical_path
                .strip_prefix(&canonical_workspace)
                .map_err(|_| "Final object escaped owned workspace")?
                .to_path_buf();
            let actual = read_metadata_file(&working.join("media.info.json"))?;
            check_generic_object(accepted, &actual)?;
            let actual_proof =
                identity::proof(accepted, &actual).map_err(|e| format!("E_IDENTITY: {e}"))?;
            if actual_proof.identity.canonical_key() != proof.identity.canonical_key() {
                return Err("E_IDENTITY: transfer differs from admitted object".into());
            }
            let video = selection::expectation(&actual, accepted.intent.quality)?;
            let selection_path = working.join("selection.txt");
            if fs::symlink_metadata(&selection_path)
                .map_err(|e| e.to_string())?
                .len()
                > 0
            {
                let before = read_selection(&selection_path)?;
                let before_proof =
                    identity::proof(accepted, &before).map_err(|e| format!("E_IDENTITY: {e}"))?;
                if before_proof.identity.canonical_key() != actual_proof.identity.canonical_key() {
                    return Err("E_IDENTITY: contradictory native object records".into());
                }
                if selection::expectation(&before, accepted.intent.quality)? != video {
                    return Err("Contradictory native selected media observations".into());
                }
            }
            selection::public_sources(&actual)?;
            context.emit(AdapterEvent::Finalizing);
            Ok(ProducedArtifact {
                relative_path,
                identity: actual_proof.identity,
                kind: MediaKind::Video,
                verification: VerificationRequirements::Video(video),
            })
        })();
        result.map_err(|error: String| {
            let _ = fs::write(
                working.join("adapter-error.log"),
                error.chars().take(65536).collect::<String>(),
            );
            if context.cancelled() {
                Failure::new(FailureCode::Cancelled, "cleanup")
            } else {
                diagnostics::classify(&phase, &error)
            }
        })
    }
}
fn generic_args(args: &mut Vec<String>, accepted: &Accepted, resolving: bool) {
    if !matches!(accepted.object, Object::Generic { .. }) { return; }
    // Expose collections instead of letting --no-playlist silently select one item.
    args.retain(|arg| arg != "--no-playlist");
    args.extend(["--yes-playlist".into(), "--playlist-end".into(), "2".into()]);
    if resolving { args.push("--flat-playlist".into()); }
}
fn check_generic_object(accepted: &Accepted, value: &Value) -> Result<(), String> {
    if matches!(accepted.object, Object::Generic { .. })
        && (value.get("entries").is_some()
            || value.get("_type").is_some_and(|kind| kind.as_str() != Some("video"))
            || ["playlist_id", "playlist_count", "playlist_index", "n_entries"].iter()
                .any(|key| value.get(*key).is_some_and(|v| !v.is_null())))
    {
        return Err("E_OBJECT_UNSUPPORTED: a complete single object could not be established".into());
    }
    Ok(())
}
pub(super) fn check_generic_destination(accepted: &Accepted) -> Result<(), String> {
    let Object::Generic { url } = &accepted.object else { return Ok(()); };
    let url = crate::download::request::validate_public_url(url)
        .map_err(|_| "E_URL_UNSAFE: destination is not a public HTTP(S) URL")?;
    let addresses = match url.host().ok_or("E_URL_UNSAFE: missing host")? {
        url::Host::Ipv4(ip) => vec![ip.into()],
        url::Host::Ipv6(ip) => vec![ip.into()],
        url::Host::Domain(host) => (host, url.port_or_known_default().ok_or("E_URL_UNSAFE: missing port")?)
            .to_socket_addrs().map_err(|_| "E_NETWORK_TEMPORARY: destination lookup failed")?
            .map(|address| address.ip()).collect(),
    };
    check_public_addresses(&addresses)
}
fn check_public_addresses(addresses: &[std::net::IpAddr]) -> Result<(), String> {
    if addresses.is_empty() || addresses.iter().any(|ip| !crate::download::request::is_public_ip(*ip)) {
        return Err("E_URL_UNSAFE: destination resolved to a non-public address".into());
    }
    Ok(())
}
fn engine_args(
    context: &ExecutionContext<'_>,
    route: &network::Route,
    quality: crate::download::request::Quality,
) -> Result<Vec<String>, String> {
    Ok(vec![
        "--ignore-config".into(),
        "--no-plugin-dirs".into(),
        "--no-js-runtimes".into(),
        "--js-runtimes".into(),
        format!("deno:{}", context.tool("deno.exe")?.display()),
        "--cache-dir".into(),
        context
            .workspace()
            .join("engine-cache")
            .display()
            .to_string(),
        "--no-playlist".into(),
        "--proxy".into(),
        route.cli(),
        "--ffmpeg-location".into(),
        context
            .tool("ffmpeg.exe")?
            .parent()
            .ok_or("Runtime parent missing")?
            .display()
            .to_string(),
        "--abort-on-unavailable-fragments".into(),
        "--verbose".into(),
        "--format".into(),
        selection::expression(quality).into(),
        "--format-sort".into(),
        "height,+vcodec:avc".into(),
        "--format-sort-force".into(),
    ])
}
fn invoke(
    context: &ExecutionContext<'_>,
    args: Vec<String>,
    output: Option<Arc<dyn Fn(ProcessObservation) + Send + Sync>>,
    label: &str,
) -> Result<Vec<u8>, String> {
    let working = context.workspace();
    fs::write(
        working.join(format!("{label}-argv.json")),
        serde_json::to_vec_pretty(&args).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let outcome = context.run(
        ManagedCommand {
            tool: "yt-dlp.exe",
            args,
            stdout_limit: if label == "resolve" {
                METADATA_LIMIT
            } else {
                4 * 1024 * 1024
            },
            stderr_limit: 1024 * 1024,
            timeout: None,
        },
        output,
    )?;
    fs::write(working.join(format!("{label}-stdout.log")), &outcome.stdout)
        .map_err(|e| e.to_string())?;
    fs::write(working.join(format!("{label}-stderr.log")), &outcome.stderr)
        .map_err(|e| e.to_string())?;
    fs::write(
        working.join(format!("{label}-settlement.txt")),
        format!("{:?}", outcome.facts),
    )
    .map_err(|e| e.to_string())?;
    validate_engine_outcome(&outcome, label)?;
    if label == "transfer" {
        let mut bytes = Vec::new();
        File::open(working.join("final-object.txt"))
            .map_err(|_| "Transfer final object record missing")?
            .take(4097)
            .read_to_end(&mut bytes)
            .map_err(|_| "Transfer final record unreadable")?;
        parse_final_record(&bytes)?;
        Ok(bytes)
    } else {
        Ok(outcome.stdout)
    }
}
fn read_metadata_file(path: &Path) -> Result<Value, String> {
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.file_attributes() & 0x400 != 0 {
        return Err("Metadata is not a regular non-reparse owned file".into());
    }
    if meta.len() > METADATA_LIMIT as u64 {
        return Err("E_METADATA_TOO_LARGE: native metadata file exceeds bound".into());
    }
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|e| e.to_string())?
        .take(METADATA_LIMIT as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    parse_metadata(&bytes)
}
fn read_selection(path: &Path) -> Result<Value, String> {
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.file_attributes() & 0x400 != 0 || meta.len() > METADATA_LIMIT as u64
    {
        return Err("Native selection record type/bound".into());
    }
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|e| e.to_string())?
        .take(METADATA_LIMIT as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if !bytes.ends_with(b"\n") || bytes.len() > METADATA_LIMIT {
        return Err("Incomplete or oversized native selection observation".into());
    }
    let text = std::str::from_utf8(&bytes).map_err(|_| "Selection UTF8")?;
    let mut lines = text.lines();
    let record = lines
        .next()
        .and_then(|line| line.strip_prefix("AMEOW_SELECTION="))
        .ok_or("Selection marker missing")?;
    if lines.next().is_some() {
        return Err("Multiple native selection observations".into());
    }
    parse_metadata(record.as_bytes())
}
pub(crate) fn parse_final_record(bytes: &[u8]) -> Result<PathBuf, String> {
    if bytes.len() > 4096 {
        return Err("Transfer final object record exceeds bound".into());
    }
    let text =
        std::str::from_utf8(bytes).map_err(|_| "Transfer final object record invalid UTF-8")?;
    let mut lines = text.lines();
    let record = lines
        .next()
        .and_then(|line| line.strip_prefix("AMEOW_FINAL="))
        .ok_or("Transfer final object record invalid")?;
    if lines.next().is_some() {
        return Err("Transfer did not report exactly one final object".into());
    }
    serde_json::from_str(record).map_err(|_| "Transfer final object path invalid JSON".into())
}
fn parse_metadata(bytes: &[u8]) -> Result<Value, String> {
    if bytes.len() > process_supervisor::MAX_STDOUT_CAPTURE {
        return Err("E_METADATA_TOO_LARGE: complete metadata capture exceeded bound".into());
    }
    serde_json::from_slice(bytes)
        .map_err(|_| "E_METADATA_INVALID_JSON: complete output is invalid JSON".into())
}
pub(crate) fn validate_engine_outcome(
    outcome: &process_supervisor::ProcessOutcome,
    label: &str,
) -> Result<(), String> {
    if !outcome.facts.resources_releasable() {
        return Err("Engine resources were not verifiably settled".into());
    }
    if outcome.exit_code != 0 {
        return Err(format!(
            "{label} engine exit {}: {}",
            outcome.exit_code,
            String::from_utf8_lossy(&outcome.stderr)
                .chars()
                .rev()
                .take(3000)
                .collect::<String>()
                .chars()
                .rev()
                .collect::<String>()
        ));
    }
    // Transfer progress is optional. Its stdout prefix cannot decide success: the bounded
    // final-object record is checked independently after settlement, then identity/media verify.
    if outcome.facts.stdout_truncated && label != "transfer" {
        return Err(if label == "resolve" {
            "E_METADATA_TOO_LARGE: complete metadata capture exceeded bound".into()
        } else {
            "E_ENGINE_OUTPUT_LIMIT: complete engine output capture exceeded bound".into()
        });
    }
    Ok(())
}

#[cfg(test)]
mod protocol_regressions {
use super::*;
use crate::download::{request::{self, Accepted, DownloadIntent}};
    #[test]
    fn closed_final_record_bounds_and_no_progress_are_independent_of_optional_stdout() {
        let outcome = process_supervisor::ProcessOutcome {
            exit_code: 0,
            stdout: Vec::new(),
            stderr: Vec::new(),
            facts: process_supervisor::SettlementFacts {
                root_waited: true,
                job_active_zero: true,
                stdout_reader_joined: true,
                stderr_reader_joined: true,
                callback_consumer_joined: true,
                ..Default::default()
            },
        };
        validate_engine_outcome(&outcome, "transfer").unwrap();
        assert_eq!(
            parse_final_record(b"AMEOW_FINAL=\"media.mkv\"\n").unwrap(),
            PathBuf::from("media.mkv")
        );
        for record in [
            b"".as_slice(),
            b"AMEOW_FINAL=invalid\n",
            b"AMEOW_FINAL=\"media.mkv\"\nAMEOW_FINAL=\"other.mkv\"\n",
            b"unmarked\n",
            b"AMEOW_FINAL=\"partial\n",
        ] {
            assert!(parse_final_record(record).is_err());
        }
        assert!(parse_final_record(&vec![b'x'; 4097]).is_err());
        let root = tempfile::tempdir().unwrap();
        let record = root.path().join("final-object.txt");
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&record)
            .unwrap();
        fs::write(&record, b"sentinel").unwrap();
        assert!(
            fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&record)
                .is_err()
        );
        assert_eq!(fs::read(&record).unwrap(), b"sentinel");
    }
    #[test]
    fn metadata_regressions_large_complete_identity_selection_and_bounded_archive()
    -> Result<(), String> {
        let root = tempfile::tempdir().map_err(|e| e.to_string())?;
        let working = root.path().join("working");
        fs::create_dir(&working).map_err(|e| e.to_string())?;
        let mut metadata = serde_json::json!({"id":"jNQXAC9IVRw","extractor_key":"Youtube","title":"public","requested_formats":[{"format_id":"v","height":1080,"vcodec":"avc1","acodec":"aac","url":"https://cdn.example/video","protocol":"https"}]});
        metadata["bounded_fixture_padding"] = Value::String("x".repeat(12 * 1024 * 1024));
        let bytes = serde_json::to_vec(&metadata).map_err(|e| e.to_string())?;
        assert!(bytes.len() > 4 * 1024 * 1024);
        let parsed = parse_metadata(&bytes)?;
        let accepted = Accepted::new(DownloadIntent {
            url: "https://youtu.be/jNQXAC9IVRw".into(),
            quality: request::Quality::Balanced,
            output_dir: root.path().into(),
        })?;
        assert_eq!(identity::attest(&accepted, &parsed)?.id, "jNQXAC9IVRw");
        assert_eq!(
            selection::expectation(&parsed, request::Quality::Balanced)?.height,
            1080
        );
        fs::write(working.join("resolve-stdout.log"), &bytes).map_err(|e| e.to_string())?;
        let archived = crate::download::preserve_diagnostics(root.path(), &working, 1, EVIDENCE)?;
        assert_eq!(
            fs::read(archived.join("resolve-stdout.log")).map_err(|e| e.to_string())?,
            bytes
        );
        let overflow = vec![b'x'; process_supervisor::MAX_STDOUT_CAPTURE + 1];
        let failure = parse_metadata(&overflow).unwrap_err();
        assert!(failure.starts_with("E_METADATA_TOO_LARGE:"));
        fs::write(working.join("resolve-stdout.log"), overflow).map_err(|e| e.to_string())?;
        fs::write(working.join("attempt-error.log"), &failure).map_err(|e| e.to_string())?;
        let archived = crate::download::preserve_diagnostics(root.path(), &working, 2, EVIDENCE)?;
        assert!(archived.join("resolve-stdout.log.omitted.txt").is_file());
        assert_eq!(
            fs::read_to_string(archived.join("attempt-error.log")).map_err(|e| e.to_string())?,
            failure
        );
        assert!(
            parse_metadata(b"{invalid but complete}")
                .unwrap_err()
                .starts_with("E_METADATA_INVALID_JSON:")
        );
        Ok(())
    }
    #[test]
    fn metadata_regressions_exit_zero_overflow_invalid_and_nonzero_remain_distinct() {
        let mut outcome = process_supervisor::ProcessOutcome {
            exit_code: 0,
            stdout: b"{}".to_vec(),
            stderr: Vec::new(),
            facts: process_supervisor::SettlementFacts {
                root_waited: true,
                job_active_zero: true,
                stdout_reader_joined: true,
                stderr_reader_joined: true,
                callback_consumer_joined: true,
                stdout_truncated: true,
                ..Default::default()
            },
        };
        assert_eq!(
            diagnostics::classify(
                &Phase::Resolving,
                &validate_engine_outcome(&outcome, "resolve").unwrap_err()
            )
            .code,
            "E_METADATA_TOO_LARGE"
        );
        outcome.exit_code = 1;
        outcome.stderr = b"ERROR: unknown engine failure".to_vec();
        assert_eq!(
            diagnostics::classify(
                &Phase::Resolving,
                &validate_engine_outcome(&outcome, "resolve").unwrap_err()
            )
            .code,
            "E_ENGINE_FAILED"
        );
        outcome.stderr = b"ERROR: HTTP Error 403: Forbidden".to_vec();
        let forbidden = diagnostics::classify(
            &Phase::Downloading,
            &validate_engine_outcome(&outcome, "transfer").unwrap_err(),
        );
        assert_eq!(forbidden.code, "E_HTTP_FORBIDDEN");
        outcome.exit_code = 0;
        outcome.facts.stdout_truncated = false;
        assert!(validate_engine_outcome(&outcome, "resolve").is_ok());
    }
}

#[cfg(test)]
mod selection_record_tests {
    use super::*;
    #[test]
    fn only_one_complete_bounded_native_selection_can_attest_progress_or_final_result() {
        let root = tempfile::tempdir().unwrap();
        let record = root.path().join("selection.txt");
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
}

#[cfg(test)]
mod generic_tests {
    use super::*;
    use crate::download::request::{DownloadIntent, Quality};
    use serde_json::json;
    fn accepted(url: &str) -> Accepted {
        Accepted::new(DownloadIntent { url: url.into(), quality: Quality::Balanced, output_dir: std::env::temp_dir() }).unwrap()
    }
    #[test]
    fn generic_exposes_bounded_collections_and_rejects_even_one_or_empty_entry() {
        let a = accepted("https://example.com/work");
        let mut args = vec!["--no-playlist".into(), "--ignore-config".into()];
        generic_args(&mut args, &a, true);
        assert!(!args.iter().any(|arg| arg == "--no-playlist"));
        assert!(args.windows(3).any(|w| w == ["--yes-playlist", "--playlist-end", "2"]));
        assert!(args.iter().any(|arg| arg == "--flat-playlist"));
        for v in [json!({"entries":[]}), json!({"entries":[{"id":"one"}]}), json!({"_type":"url"}), json!({"_type":null}), json!({"playlist_index":1})] {
            let error = check_generic_object(&a, &v).unwrap_err();
            assert_eq!(diagnostics::classify(&Phase::Resolving, &error).code, "E_OBJECT_UNSUPPORTED");
        }
        assert!(check_generic_object(&a, &json!({"_type":"video","playlist_id":null})).is_ok());
        assert!(identity::attest(&a, &json!({})).is_err());
        let known = accepted("https://youtu.be/jNQXAC9IVRw");
        let mut known_args = vec!["--no-playlist".into()];
        generic_args(&mut known_args, &known, true);
        assert_eq!(known_args, ["--no-playlist"]);
    }
    #[test]
    fn generic_destination_rejects_empty_private_and_mixed_dns_answers() {
        for addresses in [vec![], vec!["127.0.0.1"], vec!["8.8.8.8", "192.168.1.1"], vec!["::1"], vec!["2001:db8::1"]] {
            let ips: Vec<_> = addresses.iter().map(|a| a.parse().unwrap()).collect();
            assert!(check_public_addresses(&ips).is_err());
        }
        assert!(check_public_addresses(&["8.8.8.8".parse().unwrap(), "2606:4700:4700::1111".parse().unwrap()]).is_ok());
        assert!(check_generic_destination(&accepted("https://[2606:4700:4700::1111]/work")).is_ok());
    }
    #[test]
    fn unsupported_engine_error_cannot_be_spoofed_by_verbose_argv() {
        for evidence in [
            "resolve engine exit 1: ERROR: HTTP Error 429: Too Many Requests (unsupported URL: https://example.com/)",
            "resolve engine exit 1: ERROR: download failed at https://example.com/?unsupported URL: injected",
            "resolve engine exit 1: ERROR: Unsupported URL: https://example.com/\nERROR: other error",
            "resolve engine exit 1: ERROR: Unsupported URL: not-a-url",
        ] {
            assert_ne!(diagnostics::classify(&Phase::Resolving, evidence).code, "E_UNSUPPORTED_URL");
        }
        assert_eq!(diagnostics::classify(&Phase::Resolving, "resolve engine exit 1: ERROR: Unsupported URL: https://example.com/").code, "E_UNSUPPORTED_URL");
        assert_eq!(diagnostics::classify(&Phase::Resolving, "resolve engine exit 1: [debug] URL unsupported url: fake\nERROR: other error").code, "E_ENGINE_FAILED");
    }
}
