use crate::download::{
    Phase,
    adapter::{DownloaderAdapter, ExecutionContext, ManagedCommand},
    contract::{
        AdapterEvent, AdapterResult, ExecutionRequest, IdentityAttestation, MediaKind,
        ProducedArtifact, ProducedBatch, VerificationRequirements,
    },
    diagnostics::{Failure, FailureCode},
    network, output,
    request::{Accepted, Identity, Object, Site},
    runtime::TrustedRuntimeRequirements,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Component, Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

pub struct GalleryDlAdapter {
    requirements: TrustedRuntimeRequirements,
}
impl GalleryDlAdapter {
    pub fn new(requirements: TrustedRuntimeRequirements) -> Self {
        Self { requirements }
    }
}
const EVIDENCE: &[(&str, u64)] = &[
    ("resolve-stdout.log", 16 * 1024 * 1024),
    ("resolve-stderr.log", 1024 * 1024),
    ("transfer-stdout.log", 4 * 1024 * 1024),
    ("transfer-stderr.log", 1024 * 1024),
    ("gallery-after.jsonl", 8 * 1024 * 1024),
    ("gallery-skip.jsonl", 8 * 1024 * 1024),
    ("adapter-error.log", 65536),
    ("resolve-command.json", 65536),
    ("transfer-command.json", 65536),
    ("resolve-settlement.log", 65536),
    ("transfer-settlement.log", 65536),
];
impl DownloaderAdapter for GalleryDlAdapter {
    fn kind(&self) -> MediaKind {
        MediaKind::Data
    }
    fn requirements(&self) -> &TrustedRuntimeRequirements {
        &self.requirements
    }
    fn evidence_files(&self) -> &[(&str, u64)] {
        EVIDENCE
    }
    fn execute(&self, request: &ExecutionRequest, context: &ExecutionContext<'_>) -> AdapterResult {
        let mut batch = self.execute_batch(request, context)?;
        if let Some(failure) = batch.failure {
            return Err(failure);
        }
        if batch.artifacts.len() != 1 {
            return Err(Failure::new(FailureCode::Media, "verify"));
        }
        Ok(batch.artifacts.remove(0))
    }
    fn execute_batch(
        &self,
        request: &ExecutionRequest,
        context: &ExecutionContext<'_>,
    ) -> Result<ProducedBatch, Failure> {
        if context.tool("gallery-dl.exe").is_err() {
            return Err(Failure::new(FailureCode::Runtime, "runtime"));
        }
        let mut phase = Phase::Resolving;
        let mut native_unsupported = false;
        run(request, context, &mut phase, &mut native_unsupported).map_err(|e| {
            let _ = context.write_evidence("adapter-error.log", e.chars().take(65536).collect::<String>().as_bytes());
            if context.cancelled() {
                Failure::new(FailureCode::Cancelled, "cleanup")
            } else if e.starts_with("E_RUNTIME:") {
                Failure::new(FailureCode::Runtime, "runtime")
            } else if native_unsupported {
                Failure::new(FailureCode::UnsupportedUrl, "resolve")
            } else {
                classify_gallery_error(&phase, &e)
            }
        })
    }
}
fn classify_gallery_error(phase: &Phase, error: &str) -> Failure {
    if let Some(stage) = native_proxy_error(error)
        && matches!((phase, stage), (Phase::Resolving, "resolve") | (Phase::Downloading, "transfer"))
    {
        return crate::download::diagnostics::known("E_NETWORK_TEMPORARY", stage);
    }
    let failure = super::yt_dlp::diagnostics::classify(phase, error);
    if failure.code == "E_UNSUPPORTED_URL" {
        crate::download::diagnostics::known("E_ENGINE_FAILED", &failure.stage)
    } else {
        failure
    }
}
fn native_proxy_error(error: &str) -> Option<&'static str> {
    if error.len() > 4096 {
        return None;
    }
    let (envelope, stderr) = error.split_once(": ")?;
    let (stage, exit) = if let Some(exit) = envelope.strip_prefix("resolve engine exit ") {
        ("resolve", exit)
    } else {
        ("transfer", envelope.strip_prefix("transfer engine exit ")?)
    };
    if exit.parse::<u32>().ok()? == 0 {
        return None;
    }
    let line = stderr.trim_end_matches(['\r', '\n']);
    if line.chars().any(char::is_control) {
        return None;
    }
    let (extractor, message) = line.strip_prefix('[')?.split_once("][error] ")?;
    if extractor.is_empty() || extractor.len() > 64
        || !extractor.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-'))
    {
        return None;
    }
    // Accept only the pinned native HttpError/ProxyError line, never arbitrary log text.
    let message = message.strip_prefix("HttpError:")?.trim_start();
    let details = message.strip_prefix("ProxyError: ")?;
    // These are the two retained requests ProxyError shapes. Do not infer a target HTTP status.
    if details.strip_prefix("502 ").is_some_and(|reason| !reason.trim().is_empty())
        || (details.starts_with("(<HTTPSConnection(host='")
            && details.contains(" timed out. (connect timeout=") && details.ends_with("')"))
    {
        Some(stage)
    } else {
        None
    }
}
fn metadata_error(rows: &Value) -> Option<String> {
    let error = rows.as_array()?.iter().find(|row| row[0].as_i64() == Some(-1))?;
    let message = error[1]["message"].as_str().unwrap_or("gallery extraction failed");
    if error[1]["error"].as_str() == Some("HttpError")
        && message.trim_start().starts_with("ProxyError:")
    {
        return Some(format!("resolve engine exit 1: [gallery-dl][error] HttpError: {message}"));
    }
    Some(format!("resolve engine exit 1: ERROR: {message}"))
}
fn native_unsupported_url(
    outcome: &crate::download::process_supervisor::ProcessOutcome,
    url: &str,
) -> bool {
    if outcome.exit_code != 64
        || outcome.facts.stdout_truncated
        || outcome.facts.stderr_truncated
        || !outcome.stdout.is_empty()
    {
        return false;
    }
    let line = format!("[gallery-dl][error] Unsupported URL '{url}'");
    outcome.stderr == format!("{line}\r\n").as_bytes()
        || outcome.stderr == format!("{line}\n").as_bytes()
}
fn common(
    context: &ExecutionContext<'_>,
    request: &ExecutionRequest,
) -> Result<Vec<String>, String> {
    let route = network::engine_route(&request.accepted.intent.url)
        .map_err(|e| format!("E_NETWORK_ENGINE_ROUTE_UNSUPPORTED: {e}"))?;
    Ok(engine_args(context, request, &route))
}
pub(crate) fn engine_args(
    context: &ExecutionContext<'_>,
    request: &ExecutionRequest,
    route: &network::Route,
) -> Vec<String> {
    let mut args = vec![
        "--config-ignore".into(),
        "--proxy".into(),
        route.cli(),
        "-o".into(),
        "extractor.ytdl.enabled=false".into(),
        "-o".into(),
        "downloader.ytdl.enabled=false".into(),
    ];
    args.extend(["-o".into(), "extractor.metadata-url=ameow_source".into(),
        "-o".into(), "extractor.metadata-path=ameow_path".into(),
        "--range".into(), if matches!(request.accepted.object, Object::Generic { .. }) { "1-2" } else { "1-1001" }.into()]);
    if let Some(auth) = context.authentication {
        args.extend(auth.arguments());
    }
    args
}
fn invoke(
    context: &ExecutionContext<'_>,
    args: Vec<String>,
    label: &str,
    callback: Option<
        Arc<dyn Fn(crate::download::process_supervisor::ProcessObservation) + Send + Sync>,
    >,
) -> Result<crate::download::process_supervisor::ProcessOutcome, String> {
    fs::write(
        context.workspace().join(format!("{label}-command.json")),
        serde_json::to_vec(&args).map_err(|e| format!("E_STORAGE: {e}"))?,
    )
    .map_err(|e| format!("E_STORAGE: {e}"))?;
    let result = context
        .run(
            ManagedCommand {
                tool: "gallery-dl.exe",
                args,
                stdout_limit: if label == "resolve" {
                    16 * 1024 * 1024
                } else {
                    4 * 1024 * 1024
                },
                stderr_limit: 1024 * 1024,
                timeout: None,
            },
            callback,
        )
        .map_err(|e| format!("E_RUNTIME: {e}"))?;
    context.write_evidence(&format!("{label}-stdout.log"), &result.stdout)?;
    context.write_evidence(&format!("{label}-stderr.log"), &result.stderr)?;
    fs::write(
        context.workspace().join(format!("{label}-settlement.log")),
        format!("exit_code: {}\n{:#?}\n", result.exit_code, result.facts),
    )
    .map_err(|e| format!("E_STORAGE: {e}"))?;
    if !result.facts.resources_releasable() {
        return Err("Gallery process not settled".into());
    }
    Ok(result)
}
fn resolved(result: &crate::download::process_supervisor::ProcessOutcome, url: &str, generic: bool, native_unsupported: &mut bool) -> Result<(), String> {
    if result.exit_code != 0 {
        *native_unsupported = generic && native_unsupported_url(result, url);
        return Err(engine_error("resolve", result));
    }
    if result.facts.stdout_truncated { return Err("E_METADATA_TOO_LARGE: gallery metadata capture exceeded bound".into()); }
    let rows: Value = serde_json::from_slice(&result.stdout).map_err(|_| "E_METADATA_INVALID_JSON: invalid gallery metadata")?;
    if let Some(error) = metadata_error(&rows) { return Err(error); }
    Ok(())
}
// Native item keys support collection retry; source type/codec/count are observations.
fn item_key(meta: &Value, source: &str) -> PathBuf {
    let native = ["filename", "id", "image_key"].iter().find_map(|key| {
        meta.get(*key).filter(|v| !v.is_null() && v.as_str() != Some(""))
    });
    let value = native.cloned().unwrap_or_else(|| json!(source));
    PathBuf::from(format!("item-{:x}", Sha256::digest(serde_json::to_vec(&value).unwrap())))
}
fn preflight(request: &ExecutionRequest, data: &[u8]) -> Result<(Identity, BTreeMap<PathBuf, Value>), String> {
    let rows: Vec<Value> = serde_json::from_slice(data).map_err(|_| "E_METADATA_INVALID_JSON: invalid gallery metadata")?;
    let mut files = BTreeMap::new();
    let mut title = None;
    for row in rows {
        match row[0].as_i64() {
            Some(2) => {},
            Some(3) => {
                let source = row[1].as_str().ok_or("E_METADATA_INVALID_JSON: missing native source")?;
                let mut meta = row[2].clone();
                check_known_identity(&request.accepted, &meta)?;
                meta.as_object_mut().ok_or("E_METADATA_INVALID_JSON: missing native item")?
                    .insert("ameow_source".into(), json!(source));
                title = title.or_else(|| meta["album"]["title"].as_str().or_else(|| meta["title"].as_str()).or_else(|| meta["text"].as_str()).map(str::to_owned));
                if files.insert(item_key(&meta, source), meta).is_some() {
                    return Err("E_OBJECT_UNSUPPORTED: duplicate native media items".into());
                }
            },
            Some(-1) => return Err(metadata_error(&json!([row])).unwrap_or_else(|| "resolve engine exit 1: ERROR: gallery extraction failed".into())),
            _ => return Err("E_OBJECT_UNSUPPORTED: native extraction did not resolve a complete media object".into()),
        }
    }
    let generic = matches!(request.accepted.object, Object::Generic { .. });
    if files.is_empty() || files.len() > 1000 || (generic && files.len() != 1) {
        return Err("E_OBJECT_UNSUPPORTED: expected one media object or a bounded known gallery".into());
    }
    let (site, id) = match &request.accepted.object {
        Object::Gallery { site, id } => (*site, id.clone()),
        Object::Generic { url } => (Site::Generic, format!("{:x}", Sha256::digest(url.as_bytes()))),
        _ => return Err("Wrong adapter".into()),
    };
    Ok((Identity { title: title.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| id.clone()), id, site, part: None }, files))
}
fn check_known_identity(accepted: &Accepted, meta: &Value) -> Result<(), String> {
    let Object::Gallery { site, id } = &accepted.object else { return Ok(()); };
    let (actual, expected) = match site {
        Site::Imgur => {
            let (kind, id) = id.split_once(':').ok_or("E_IDENTITY: invalid accepted gallery")?;
            (if kind == "album" { meta["ameow_album_id"].as_str().or_else(|| meta["album"]["id"].as_str()) } else { meta["id"].as_str() }, id)
        },
        Site::Bluesky => (meta["post_id"].as_str(), id.rsplit_once('/').ok_or("E_IDENTITY: invalid accepted post")?.1),
        _ => return Ok(()),
    };
    if actual.filter(|s| !s.is_empty()).is_some_and(|s| s != expected) { return Err("E_IDENTITY: native object differs from accepted gallery".into()); }
    Ok(())
}
fn record_name(line: &[u8], skip: bool, expected: &BTreeMap<PathBuf, Value>, copied: &BTreeSet<PathBuf>, root: &Path, accepted: &Accepted) -> Result<PathBuf, String> {
    if !line.ends_with(b"\n") { return Err("Incomplete native record".into()); }
    let meta: Value = serde_json::from_slice(line).map_err(|_| "Invalid native record")?;
    let source = meta["ameow_source"].as_str().unwrap_or("");
    check_known_identity(accepted, &meta)?;
    if !matches!(accepted.object, Object::Generic { .. }) && !expected.contains_key(&item_key(&meta, source)) {
        return Err("Native item differs from resolved collection".into());
    }
    let path = PathBuf::from(meta["ameow_path"].as_str().ok_or("Missing native final path")?);
    let metadata = fs::symlink_metadata(&path).map_err(|_| "Native final path missing")?;
    if !crate::download::is_plain_file(&metadata) { return Err("Native final path is not a regular non-reparse file".into()); }
    let path = path.canonicalize().map_err(|_| "Native final path missing")?;
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let relative = path.strip_prefix(root).map_err(|_| "Native final path escaped owned media directory")?;
    if relative.components().count() != 1 || !matches!(relative.components().next(), Some(Component::Normal(_))) {
        return Err("Native final path is not one owned filename".into());
    }
    if skip && !copied.contains(relative) { return Err("Unverified native skip".into()); }
    Ok(relative.into())
}
fn run(
    request: &ExecutionRequest,
    context: &ExecutionContext<'_>,
    phase: &mut Phase,
    native_unsupported: &mut bool,
) -> Result<ProducedBatch, String> {
    let generic = matches!(request.accepted.object, Object::Generic { .. });
    if generic {
        if request.resume.is_some() {
            return Err("E_IDENTITY: generic resume unsupported".into());
        }
        super::yt_dlp::check_generic_destination(&request.accepted)?;
    }
    context.emit(AdapterEvent::Resolving);
    let mut args = common(context, request)?;
    args.extend([
        "--resolve-json".into(),
        "--".into(),
        request.accepted.intent.url.clone(),
    ]);
    let result = invoke(context, args, "resolve", None)?;
    resolved(&result, &request.accepted.intent.url, generic, native_unsupported)?;
    let (identity, expected) =
        preflight(request, &result.stdout)?;
    let expected_paths = collection_paths(&expected);
    if let Some(resume) = &request.resume {
        if !same_collection(&resume.expected_paths, resume.total, &expected_paths) {
            return Err("E_IDENTITY: collection contents changed since previous attempt".into());
        }
    }
    context.emit(AdapterEvent::Files {
        completed: 0,
        total: Some(expected.len()),
    });
    context
        .admit(&IdentityAttestation {
            aliases: if generic {
                vec![
                    identity.canonical_key(),
                    request.accepted.object.provisional_key(),
                ]
            } else {
                vec![identity.canonical_key()]
            },
            identity: identity.clone(),
        })
        .map_err(|e| format!("{}: {}", e.code, e.reason))?;
    let root = context.workspace().join("gallery-media");
    fs::create_dir(&root).map_err(|e| format!("E_STORAGE: {e}"))?;
    let mut copied = BTreeSet::new();
    if let Some(resume) = &request.resume {
        for item in &resume.files {
            let rel = &item.relative_path;
            if rel.components().count() != 2
                || !matches!(rel.components().next(), Some(Component::Normal(n)) if n == "gallery-media")
            {
                return Err("E_IDENTITY: invalid previous collection path".into());
            }
            let name = rel.file_name().ok_or("Invalid resume path")?;
            let delivered = &item.delivered;
            let parent = delivered.path.parent().ok_or("Invalid delivered path")?;
            let verified = output::verify_data(&delivered.path, parent)
                .map_err(|e| format!("E_STORAGE: {e}"))?;
            if verified.bytes != delivered.bytes || verified.sha256 != delivered.sha256 {
                return Err("E_STORAGE: previously delivered file changed".into());
            }
            let target = root.join(name);
            let mut source =
                fs::File::open(&verified.path).map_err(|e| format!("E_STORAGE: {e}"))?;
            let mut destination = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)
                .map_err(|e| format!("E_STORAGE: {e}"))?;
            std::io::copy(&mut source, &mut destination).map_err(|e| format!("E_STORAGE: {e}"))?;
            drop(destination);
            let copy =
                output::verify_data(&target, &root).map_err(|e| format!("E_STORAGE: {e}"))?;
            if copy.bytes != verified.bytes || copy.sha256 != verified.sha256 {
                return Err("E_STORAGE: resume copy mismatch".into());
            }
            copied.insert(PathBuf::from(name));
        }
    }
    if generic {
        super::yt_dlp::check_generic_destination(&request.accepted)?;
    }
    let mut pp = json!([{"name":"metadata","mode":"jsonl","event":"after","base-directory":context.workspace().to_string_lossy(),"filename":"gallery-after.jsonl"},{"name":"metadata","mode":"jsonl","event":"skip","base-directory":context.workspace().to_string_lossy(),"filename":"gallery-skip.jsonl"}]);
    for entry in pp.as_array_mut().unwrap() {
        entry["include"] = json!(["ameow_path", "ameow_source", "id", "filename", "image_key", "post_id", "ameow_album_id"]);
    }
    pp.as_array_mut().unwrap().insert(0, json!({"name":"metadata", "mode":"modify", "event":["after", "skip"], "fields":{"ameow_album_id":"{album[id]}"}}));
    let mut args = common(context, request)?;
    args.extend([
        "-o".into(),
        format!("extractor.postprocessors={pp}"),
        "-D".into(),
        root.to_string_lossy().into_owned(),
        "--".into(),
        request.accepted.intent.url.clone(),
    ]);
    context.emit(AdapterEvent::Transferring);
    *phase = Phase::Downloading;
    let progress_root = context.workspace().to_path_buf();
    let progress_media_root = root.clone();
    let progress_expected = expected.clone();
    let progress_copied = copied.clone();
    let progress_accepted = request.accepted.clone();
    let events = context.events.clone();
    let previous = AtomicUsize::new(0);
    let callback = Arc::new(move |event| {
        if !matches!(
            event,
            crate::download::process_supervisor::ProcessObservation::Output { .. }
        ) {
            return;
        }
        let mut names = BTreeSet::new();
        for record in ["gallery-after.jsonl", "gallery-skip.jsonl"] {
            if let Ok(bytes) = fs::read(progress_root.join(record)) {
                if bytes.len() > 8 * 1024 * 1024 {
                    continue;
                }
                for line in bytes.split(|b| *b == b'\n') {
                    if let Ok(m) = serde_json::from_slice::<Value>(line) {
                        let mut complete = serde_json::to_vec(&m).unwrap(); complete.push(b'\n');
                        if let Ok(name) = record_name(&complete, record == "gallery-skip.jsonl", &progress_expected, &progress_copied, &progress_media_root, &progress_accepted) { names.insert(name); }
                    }
                }
            }
        }
        let count = names.len();
        if count > previous.fetch_max(count, Ordering::Relaxed) {
            events(AdapterEvent::Files {
                completed: count,
                total: Some(progress_expected.len()),
            });
        }
    });
    let result = invoke(context, args, "transfer", Some(callback))?;
    let mut paths = BTreeSet::new();
    let mut bad = false;
    for (file, skip) in [("gallery-after.jsonl", false), ("gallery-skip.jsonl", true)] {
        let bytes = match fs::read(context.workspace().join(file)) {
            Ok(b) if b.len() <= 8 * 1024 * 1024 => b,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            _ => {
                bad = true;
                continue;
            }
        };
        if !bytes.is_empty() && !bytes.ends_with(b"\n") {
            bad = true;
        }
        for line in bytes
            .split_inclusive(|b| *b == b'\n')
            .filter(|line| !line.is_empty() && line.ends_with(b"\n"))
        {
            let name = match record_name(line, skip, &expected, &copied, &root, &request.accepted) {
                Ok(v) => v,
                Err(_) => {
                    bad = true;
                    continue;
                }
            };
            if !paths.insert(name.clone()) {
                bad = true;
                continue;
            }
            if output::verify_data(&root.join(&name), &root).is_err() {
                paths.remove(&name);
                bad = true;
            }
        }
    }
    // A retry may acquire or lose authorization; public item paths must keep the same scheme.
    paths = neutral_paths(&root, paths, &copied)?;
    let artifacts = paths
        .into_iter()
        .map(|name| ProducedArtifact {
            relative_path: PathBuf::from("gallery-media").join(name),
            identity: identity.clone(),
            kind: MediaKind::Data,
            verification: VerificationRequirements::Media { height_cap: request.accepted.intent.quality.cap() },
        })
        .collect::<Vec<_>>();
    context.emit(AdapterEvent::Files {
        completed: artifacts.len(),
        total: Some(expected.len()),
    });
    let failure = if context.cancelled() {
        Some(Failure::new(FailureCode::Cancelled, "cleanup"))
    } else if result.exit_code != 0 {
        Some(classify_gallery_error(
            &Phase::Downloading,
            &engine_error("transfer", &result),
        ))
    } else if bad || artifacts.len() != expected.len()
    {
        Some(crate::download::diagnostics::known("E_MEDIA_UNVERIFIED", "verify"))
    } else {
        None
    };
    context.emit(AdapterEvent::Finalizing);
    Ok(ProducedBatch {
        artifacts,
        failure,
        total: Some(expected.len()),
        collection: true,
        expected_paths,
    })
}
fn collection_paths(expected: &BTreeMap<PathBuf, Value>) -> Vec<PathBuf> {
    // item_key already hashes native identity; never key the collection by authentication.
    expected.keys().map(|name| PathBuf::from("gallery-media").join(name)).collect()
}
fn neutral_name(name: &Path) -> PathBuf {
    PathBuf::from(format!("item-{:x}.data", Sha256::digest(name.as_os_str().as_encoded_bytes())))
}
fn neutral_paths(root: &Path, paths: BTreeSet<PathBuf>, copied: &BTreeSet<PathBuf>) -> Result<BTreeSet<PathBuf>, String> {
    let mut result = BTreeSet::new();
    for name in paths {
        let neutral = neutral_name(&name);
        // Prior verified copies belong to this attempt; engine output may replace them on retry.
        if copied.contains(&neutral) { fs::remove_file(root.join(&neutral)).map_err(|_| "E_STORAGE: resume item cleanup failed")?; }
        output::move_no_replace(&root.join(name), &root.join(&neutral)).map_err(|_| "E_STORAGE: cannot neutralize native item name")?;
        result.insert(neutral);
    }
    Ok(result)
}
fn same_collection(previous: &[PathBuf], total: Option<usize>, current: &[PathBuf]) -> bool {
    let old: BTreeSet<_> = previous.iter().collect();
    let new: BTreeSet<_> = current.iter().collect();
    old.len() == previous.len()
        && new.len() == current.len()
        && old == new
        && total == Some(new.len())
}
fn engine_error(
    label: &str,
    outcome: &crate::download::process_supervisor::ProcessOutcome,
) -> String {
    let stderr = super::yt_dlp::diagnostics::engine_stderr(
        &outcome.stderr, outcome.facts.stderr_truncated,
    );
    format!("{label} engine exit {}: {stderr}", outcome.exit_code)
}

#[cfg(test)]
#[path = "diagnostics_tests.rs"]
mod diagnostic_regressions;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn authenticated_native_names_are_opaque_and_stable_on_resume() {
        let root = tempfile::tempdir().unwrap();
        let original = PathBuf::from("private-response-name.png");
        fs::write(root.path().join(&original), b"first").unwrap();
        let first = neutral_paths(root.path(), BTreeSet::from([original.clone()]), &BTreeSet::new()).unwrap();
        let name = first.first().unwrap();
        assert_eq!(name, &neutral_name(&original), "expected collection paths and delivered item keys share the opaque name");
        assert!(!name.to_string_lossy().contains("private-response"));
        fs::write(root.path().join(&original), b"updated").unwrap();
        let next = neutral_paths(root.path(), BTreeSet::from([original]), &first).unwrap();
        assert_eq!(next, first);
        assert_eq!(fs::read(root.path().join(name)).unwrap(), b"updated");
    }
    #[test]
    fn collection_retry_identity_is_independent_of_authorization() {
        let request = request("https://bsky.app/profile/test.example/post/abc123");
        let rows = json!([[3,"https://cdn.test/image.jpg",{"filename":"normal-image","post_id":"abc123"}]]);
        let (_, expected) = preflight(&request, &serde_json::to_vec(&rows).unwrap()).unwrap();
        let previous = collection_paths(&expected);
        // Both first attempt and retry call the same auth-independent key/path functions.
        let (_, refreshed) = preflight(&request, &serde_json::to_vec(&rows).unwrap()).unwrap();
        assert!(same_collection(&previous, Some(1), &collection_paths(&refreshed)));
        let mut changed = rows; changed[0][2]["filename"] = json!("different-item");
        let (_, changed) = preflight(&request, &serde_json::to_vec(&changed).unwrap()).unwrap();
        assert!(!same_collection(&previous, Some(1), &collection_paths(&changed)));
    }
    use crate::download::request::{Accepted, DownloadIntent, Quality};
    #[test]
    fn only_exact_native_gallery_unsupported_output_allows_fallback() {
        use crate::download::process_supervisor::{ProcessOutcome, SettlementFacts};
        let url = "https://example.com/";
        let mut outcome = ProcessOutcome {
            exit_code: 64,
            stdout: vec![],
            stderr: format!("[gallery-dl][error] Unsupported URL '{url}'\r\n").into_bytes(),
            facts: SettlementFacts::default(),
        };
        assert!(native_unsupported_url(&outcome, url));
        assert!(!native_unsupported_url(
            &outcome,
            "https://example.com/other"
        ));
        outcome.exit_code = 1;
        assert!(!native_unsupported_url(&outcome, url));
        outcome.exit_code = 64;
        outcome.stdout.push(b' ');
        assert!(!native_unsupported_url(&outcome, url));
        outcome.stdout.clear();
        outcome.facts.stderr_truncated = true;
        assert!(!native_unsupported_url(&outcome, url));
        outcome.facts.stderr_truncated = false;
        outcome.facts.stdout_truncated = true;
        assert!(!native_unsupported_url(&outcome, url));
        outcome.facts.stdout_truncated = false;
        outcome.stderr.extend_from_slice(b"extra\n");
        assert!(!native_unsupported_url(&outcome, url));
        assert_eq!(
            classify_gallery_error(
                &Phase::Resolving,
                "resolve engine exit 1: ERROR: Unsupported URL: https://example.com/"
            )
            .code,
            "E_ENGINE_FAILED"
        );
    }
    fn request(url: &str) -> ExecutionRequest {
        let output = std::env::temp_dir();
        ExecutionRequest {
            accepted: Accepted::new(DownloadIntent {
                url: url.into(),
                quality: Quality::Balanced,
                output_dir: output,
            })
            .unwrap(),
            resume: None,
        }
    }
    #[test]
    fn native_single_media_does_not_require_fixture_fields_extensions_or_types() {
        let request = request("https://imgbox.com/qHhw7lpG");
        for metadata in [json!({}), json!({"title":null,"extension":"","height":null,"type":null,"image_count":null}), json!({"filename":"任意名称","extension":"avif","is_video":true,"is_playable":true})] {
            let rows = json!([[2, {}], [2, {"native":"additional directory"}], [3, "native:opaque", metadata]]);
            let (identity, files) = preflight(&request, &serde_json::to_vec(&rows).unwrap()).unwrap();
            assert_eq!(files.len(), 1); assert_eq!(identity.site, Site::Generic); assert!(!identity.title.is_empty());
        }
        for rows in [json!([]), json!([[3,"a",{}],[3,"b",{}]]), json!([[-1,{"message":"real native error"}]]), json!([[6,"other",{}]])] {
            assert!(preflight(&request, &serde_json::to_vec(&rows).unwrap()).is_err());
        }
    }
    #[test]
    fn success_with_warning_continues_but_real_native_errors_and_truncation_fail() {
        use crate::download::process_supervisor::{ProcessOutcome, SettlementFacts};
        let request = request("https://example.com/work");
        let mut result = ProcessOutcome { exit_code: 0, stdout: serde_json::to_vec(&json!([[3,"opaque:media",{}]])).unwrap(), stderr: b"[native][warning] optional metadata missing\n".to_vec(), facts: SettlementFacts::default() };
        let mut unsupported = false;
        resolved(&result, &request.accepted.intent.url, true, &mut unsupported).unwrap();
        assert!(preflight(&request, &result.stdout).is_ok()); assert!(!unsupported);
        result.facts.stderr_truncated = true; assert!(resolved(&result, &request.accepted.intent.url, true, &mut unsupported).is_ok());
        result.facts.stdout_truncated = true; assert!(resolved(&result, &request.accepted.intent.url, true, &mut unsupported).is_err());
        result.facts.stdout_truncated = false; result.stdout = serde_json::to_vec(&json!([[-1,{"error":"HttpError","message":"real extraction failure"}]])).unwrap();
        assert!(resolved(&result, &request.accepted.intent.url, true, &mut unsupported).is_err());
        result.exit_code = 1; assert!(resolved(&result, &request.accepted.intent.url, true, &mut unsupported).is_err());
    }
    #[test]
    fn known_gallery_uses_native_items_without_private_post_schema() {
        let request = request("https://bsky.app/profile/test.example/post/abc123");
        let rows = json!([[3,"opaque:a",{"filename":"one","extension":null}],[3,"opaque:b",{"filename":"two","extension":"mp4"}]]);
        let (_, expected) = preflight(&request, &serde_json::to_vec(&rows).unwrap()).unwrap();
        assert_eq!(expected.len(), 2);
        let mut wrong = rows.clone(); wrong[0][2]["post_id"] = json!("other");
        assert!(preflight(&request, &serde_json::to_vec(&wrong).unwrap()).unwrap_err().starts_with("E_IDENTITY:"));
        let mut changed = rows.clone(); changed[1][2]["filename"] = json!("changed");
        let (_, changed) = preflight(&request, &serde_json::to_vec(&changed).unwrap()).unwrap();
        let paths = |files: &BTreeMap<PathBuf,Value>| files.keys().cloned().collect::<Vec<_>>();
        assert!(!same_collection(&paths(&expected), Some(2), &paths(&changed)));
    }
    #[test]
    fn native_final_paths_preserve_ownership_and_only_verified_skips() {
        let root = tempfile::tempdir().unwrap();
        let request = request("https://bsky.app/profile/test.example/post/abc123");
        let owned = root.path().join("native-name.avif"); fs::write(&owned, b"owned").unwrap();
        let expected = BTreeMap::from([(item_key(&json!({"filename":"one"}), ""), json!({"filename":"one"}))]);
        let line = |path: &Path| { let mut line = serde_json::to_vec(&json!({"filename":"one","ameow_path":path})).unwrap(); line.push(b'\n'); line };
        let record = line(&owned); let empty = BTreeSet::new();
        assert_eq!(record_name(&record, false, &expected, &empty, root.path(), &request.accepted).unwrap(), PathBuf::from("native-name.avif"));
        assert!(record_name(&record, true, &expected, &empty, root.path(), &request.accepted).is_err());
        let copied = BTreeSet::from([PathBuf::from("native-name.avif")]);
        assert!(record_name(&record, true, &expected, &copied, root.path(), &request.accepted).is_ok());
        assert!(record_name(&record[..record.len()-1], false, &expected, &empty, root.path(), &request.accepted).is_err());
        let outside = tempfile::NamedTempFile::new().unwrap();
        assert!(record_name(&line(outside.path()), false, &expected, &empty, root.path(), &request.accepted).is_err());
        assert!(record_name(b"{bad}\n", false, &expected, &empty, root.path(), &request.accepted).is_err());
    }
    #[test]
    fn resume_rejects_changed_full_collection_even_with_equal_count() {
        let old = vec![
            PathBuf::from("gallery-media/a.jpg"),
            PathBuf::from("gallery-media/b.jpg"),
        ];
        let changed = vec![
            PathBuf::from("gallery-media/a.jpg"),
            PathBuf::from("gallery-media/c.jpg"),
        ];
        assert!(same_collection(&old, Some(2), &old));
        assert!(!same_collection(&old, Some(2), &changed));
        assert!(!same_collection(&old, None, &old));
    }
}
