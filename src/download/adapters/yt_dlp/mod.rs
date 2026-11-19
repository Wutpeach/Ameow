//! Pinned native downloader integration. All private protocols stay in this adapter.
pub mod diagnostics;
pub mod identity;
pub mod progress;
pub mod selection;
#[cfg(target_os = "macos")]
pub(crate) mod settlement_macos;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum InvocationPhase {
    Resolve,
    Transfer,
    #[cfg(all(test, target_os = "macos"))]
    Fixture,
}
impl InvocationPhase {
    fn label(self) -> &'static str {
        match self {
            Self::Resolve => "resolve",
            Self::Transfer => "transfer",
            #[cfg(all(test, target_os = "macos"))]
            Self::Fixture => "fixture",
        }
    }
}
use crate::download::{
    Phase,
    adapter::{DownloaderAdapter, ExecutionContext, ManagedCommand},
    contract::{
        AdapterEvent, AdapterResult, ExecutionRequest, MediaKind, ProducedArtifact,
        VerificationRequirements, VideoExpectation,
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
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

const RESOLVED_FILE: &str = "resolved.json";
const TRANSFER_INFO_FILE: &str = "media.info.json";
const SELECTION_FILE: &str = "selection.txt";
const SELECTION_PREFIX: &str = "AMEOW_SELECTION=";
// Native output-template projection excludes request headers, URLs and downloader Cookie data.
const SAFE_METADATA: &str = "%(.{id,title,extractor_key,_type,_old_archive_ids,width,height,vcodec,acodec,format_id,fps,tbr,duration,ext,protocol,is_live,live_status,playlist_index})j";

const METADATA_LIMIT: usize = process_supervisor::MAX_STDOUT_CAPTURE;
const EVIDENCE: &[(&str, u64)] = &[
    (RESOLVED_FILE, METADATA_LIMIT as u64),
    (TRANSFER_INFO_FILE, METADATA_LIMIT as u64),
    (SELECTION_FILE, METADATA_LIMIT as u64),
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
    ("resolve-media.json", 65536),
    ("transfer-media.json", 65536),
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
            let bytes = invoke(context, args, None, InvocationPhase::Resolve, #[cfg(target_os = "macos")] None)?;
            let metadata = parse_metadata(&bytes)?;
            media_observation(context, "resolve-media.json", &metadata)?;
            check_generic_object(accepted, &metadata)?;
            let proof =
                identity::proof(accepted, &metadata).map_err(|e| format!("E_IDENTITY: {e}"))?;
            context
                .admit(&proof)
                .map_err(|failure| format!("{}: {}", failure.code, failure.reason))?;
            context.write_evidence(RESOLVED_FILE, &bytes)?;
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
            for name in ["final-object.txt", SELECTION_FILE] {
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
                if context.authentication.is_some() { "--no-write-info-json" } else { "--write-info-json" }.into(),
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
                format!("before_dl:{SELECTION_PREFIX}{}", if context.authentication.is_some() { SAFE_METADATA } else { "%()j" }),
                working.join(SELECTION_FILE).display().to_string(),
                "--print-to-file".into(),
                "after_move:AMEOW_FINAL=%(filepath)j".into(),
                working.join("final-object.txt").display().to_string(),
                "--".into(),
                canonical,
            ]);
            if context.authentication.is_some() {
                let end = args.len() - 2;
                args.splice(end..end, ["--print-to-file".into(), format!("after_move:{SAFE_METADATA}"), working.join(TRANSFER_INFO_FILE).display().to_string()]);
            }
            let timeline = progress::Timeline::from_args();
            let feed = Mutex::new((false, progress::ProgressFeed::selected(&Value::Null).with_timeline(timeline.clone())));
            let selected_path = working.join(SELECTION_FILE);
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
            let record = invoke(context, args, Some(output), InvocationPhase::Transfer, #[cfg(target_os = "macos")] Some(&metadata))?;
            phase = Phase::Validating;
            let final_path = parse_final_record(&record)?;
            let final_metadata = fs::symlink_metadata(&final_path).map_err(|e| e.to_string())?;
            if !crate::download::is_plain_file(&final_metadata) {
                return Err("E_MEDIA_UNVERIFIED: final path is not a regular non-reparse file".into());
            }
            let canonical_path = final_path.canonicalize().map_err(|e| e.to_string())?;
            let canonical_workspace = working.canonicalize().map_err(|e| e.to_string())?;
            let relative_path = canonical_path
                .strip_prefix(&canonical_workspace)
                .map_err(|_| "Final object escaped owned workspace")?
                .to_path_buf();
            let actual = read_metadata_file(&working.join(TRANSFER_INFO_FILE)).map_err(|error| {
                if error.starts_with("E_METADATA_") { error } else { format!("E_MEDIA_UNVERIFIED: native metadata unavailable: {error}") }
            })?;
            media_observation(context, "transfer-media.json", &actual)?;
            check_generic_object(accepted, &actual)?;
            let actual_proof =
                identity::proof(accepted, &actual).map_err(|e| format!("E_IDENTITY: {e}"))?;
            if actual_proof.identity.canonical_key() != proof.identity.canonical_key()
                || !identity::consistent(&metadata, &actual) {
                return Err("E_IDENTITY: transfer differs from admitted object".into());
            }
            let before = read_selection(&working.join(SELECTION_FILE)).ok();
            let video = transfer_expectation(&actual, before.as_ref(), accepted.intent.quality)?;
            context.emit(AdapterEvent::Finalizing);
            Ok(ProducedArtifact {
                relative_path,
                identity: actual_proof.identity,
                kind: MediaKind::Video,
                verification: VerificationRequirements::Video(video),
            })
        })();
        result.map_err(|error: String| {
            let _ = context.write_evidence("adapter-error.log", error.chars().take(65536).collect::<String>().as_bytes());
            if context.cancelled() {
                Failure::new(FailureCode::Cancelled, "cleanup")
            } else {
                diagnostics::classify(&phase, &error)
            }
        })
    }
}
fn media_observation(context: &ExecutionContext<'_>, name: &str, metadata: &Value) -> Result<(), String> {
    // Only typed media measurements are durable for authenticated attempts. No wire
    // URLs, headers, titles, format tokens or free-form extractor strings are copied.
    let measurement = |value: &Value| {
        let codec = value["vcodec"].as_str().and_then(|s| selection::codec(s).ok()).and_then(|codec| match codec {
            crate::download::contract::VideoCodec::H264 => Some("h264"),
            crate::download::contract::VideoCodec::Hevc => Some("hevc"),
            crate::download::contract::VideoCodec::Vp9 => Some("vp9"),
            crate::download::contract::VideoCodec::Av1 => Some("av1"), _ => None,
        });
        serde_json::json!({"width":value["width"].as_u64(),"height":value["height"].as_u64(),"fps":value["fps"].as_f64(),"tbr":value["tbr"].as_f64(),"video_codec":codec,
            "audio_present":value["acodec"].as_str().is_some_and(|s| !matches!(s,""|"none"|"unknown"|"N/A"|"?"))})
    };
    let formats: Vec<_> = metadata["formats"].as_array().into_iter().flatten().take(128).map(&measurement).collect();
    let selected: Vec<_> = selection::chosen(metadata).into_iter().map(measurement).collect();
    fs::write(context.workspace().join(name), serde_json::to_vec_pretty(&serde_json::json!({"formats":formats,"selected":selected})).map_err(|e|e.to_string())?).map_err(|e|e.to_string())
}
fn transfer_expectation(actual: &Value, before: Option<&Value>, quality: crate::download::request::Quality) -> Result<VideoExpectation, String> {
    let mut video = selection::expectation(actual, quality);
    if let Some(before) = before {
        if !identity::consistent(before, actual) { return Err("E_IDENTITY: contradictory native object records".into()); }
        let observed = selection::expectation(before, quality);
        if !selection::consistent(&observed, &video) { return Err("E_MEDIA_INVALID: contradictory native selected media observations".into()); }
        video.height = video.height.or(observed.height);
        if video.codec.is_none() || matches!(video.codec, Some(crate::download::contract::VideoCodec::Other(_))) { video.codec = observed.codec.or(video.codec); }
        video.requires_audio |= observed.requires_audio;
    }
    Ok(video)
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
        && identity::is_collection(value)
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
pub(crate) fn engine_args(
    context: &ExecutionContext<'_>,
    route: &network::Route,
    quality: crate::download::request::Quality,
) -> Result<Vec<String>, String> {
    let mut args = vec![
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
        "--format".into(),
        selection::expression(quality).into(),
        "--format-sort".into(),
        "height,+vcodec:avc".into(),
        "--format-sort-force".into(),
    ];
    if let Some(auth) = context.authentication { args.extend(auth.arguments()); }
    else { args.push("--verbose".into()); }
    Ok(args)
}
fn invoke(
    context: &ExecutionContext<'_>,
    args: Vec<String>,
    output: Option<Arc<dyn Fn(ProcessObservation) + Send + Sync>>,
    invocation: InvocationPhase,
    #[cfg(target_os = "macos")] resolution: Option<&Value>,
) -> Result<Vec<u8>, String> {
    let label = invocation.label();
    let working = context.workspace();
    fs::write(
        working.join(format!("{label}-argv.json")),
        serde_json::to_vec_pretty(&args).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let command = ManagedCommand {
        tool: "yt-dlp.exe",
        args,
        stdout_limit: if label == "resolve" {
            METADATA_LIMIT
        } else {
            4 * 1024 * 1024
        },
        stderr_limit: 1024 * 1024,
        timeout: None,
    };
    #[cfg(target_os = "macos")]
    let outcome = context.run_ytdlp(command, invocation, resolution, output)?;
    #[cfg(not(target_os = "macos"))]
    let outcome = context.run(command, output)?;
    context.write_evidence(&format!("{label}-stdout.log"), &outcome.stdout)?;
    context.write_evidence(&format!("{label}-stderr.log"), &outcome.stderr)?;
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
    if !super::super::is_plain_file(&meta) {
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
    if !super::super::is_plain_file(&meta) || meta.len() > METADATA_LIMIT as u64
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
        .and_then(|line| line.strip_prefix(SELECTION_PREFIX))
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
            diagnostics::engine_stderr(&outcome.stderr, outcome.facts.stderr_truncated)
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
            selection::expectation(&parsed, request::Quality::Balanced).height,
            Some(1080)
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
    fn optional_before_dl_can_be_missing_or_sparse_while_known_contradictions_fail() {
        let actual = json!({"id":"one","height":null,"vcodec":"unknown","acodec":null});
        for before in [None, Some(json!({})), Some(json!({"height":null,"acodec":"unknown"}))] {
            let selected = transfer_expectation(&actual, before.as_ref(), Quality::Balanced).unwrap();
            assert_eq!(selected.height, None); assert_eq!(selected.codec, None); assert!(!selected.requires_audio);
        }
        let before = json!({"id":"one","height":720,"vcodec":"avc1","acodec":"aac"});
        let selected = transfer_expectation(&actual, Some(&before), Quality::Balanced).unwrap();
        assert_eq!(selected.height, Some(720)); assert!(selected.requires_audio);
        assert_eq!(selected.codec, Some(crate::download::contract::VideoCodec::H264));
        assert!(transfer_expectation(&json!({"id":"other"}), Some(&before), Quality::Balanced).unwrap_err().starts_with("E_IDENTITY:"));
        assert!(transfer_expectation(&json!({"height":480,"vcodec":"h264"}), Some(&before), Quality::Balanced).unwrap_err().starts_with("E_MEDIA_INVALID:"));
    }
    #[test]
    fn generic_exposes_bounded_collections_and_rejects_even_one_or_empty_entry() {
        let a = accepted("https://example.com/work");
        let mut args = vec!["--no-playlist".into(), "--ignore-config".into()];
        generic_args(&mut args, &a, true);
        assert!(!args.iter().any(|arg| arg == "--no-playlist"));
        assert!(args.windows(3).any(|w| w == ["--yes-playlist", "--playlist-end", "2"]));
        assert!(args.iter().any(|arg| arg == "--flat-playlist"));
        for v in [json!({"entries":[]}), json!({"entries":[{"id":"one"}]}), json!({"_type":"playlist"})] {
            let error = check_generic_object(&a, &v).unwrap_err();
            assert_eq!(diagnostics::classify(&Phase::Resolving, &error).code, "E_OBJECT_UNSUPPORTED");
        }
        assert!(check_generic_object(&a, &json!({"_type":"video","playlist_id":null})).is_ok());
        for v in [json!({}), json!({"_type":null}), json!({"playlist_index":null}), json!({"entries":null})] {
            assert!(check_generic_object(&a, &v).is_ok());
            assert!(identity::attest(&a, &v).is_ok());
        }
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
