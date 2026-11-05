use crate::download::{
    Phase,
    adapter::{DownloaderAdapter, ExecutionContext, ManagedCommand},
    contract::{
        AdapterEvent, AdapterResult, ExecutionRequest, IdentityAttestation, MediaKind,
        ProducedArtifact, ProducedBatch, VerificationRequirements,
    },
    diagnostics::{Failure, FailureCode},
    network, output,
    request::{Identity, Object, Site},
    runtime::TrustedRuntimeRequirements,
};
use serde_json::{Value, json};
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
        run(request, context, &mut phase).map_err(|e| {
            let _ = fs::write(
                context.workspace().join("adapter-error.log"),
                e.chars().take(65536).collect::<String>(),
            );
            if context.cancelled() {
                Failure::new(FailureCode::Cancelled, "cleanup")
            } else if e.starts_with("E_RUNTIME:") {
                Failure::new(FailureCode::Runtime, "runtime")
            } else {
                super::yt_dlp::diagnostics::classify(&phase, &e)
            }
        })
    }
}
fn common(
    _context: &ExecutionContext<'_>,
    request: &ExecutionRequest,
) -> Result<Vec<String>, String> {
    let route = network::engine_route(&request.accepted.intent.url)
        .map_err(|e| format!("E_NETWORK_ENGINE_ROUTE_UNSUPPORTED: {e}"))?;
    Ok(vec![
        "--config-ignore".into(),
        "--proxy".into(),
        route.cli(),
        "-o".into(),
        "extractor.ytdl.enabled=false".into(),
        "-o".into(),
        "downloader.ytdl.enabled=false".into(),
        "-o".into(),
        "extractor.imgur.mp4=false".into(),
    ])
}
fn invoke(
    context: &ExecutionContext<'_>,
    args: Vec<String>,
    label: &str,
    callback: Option<
        Arc<dyn Fn(crate::download::process_supervisor::ProcessObservation) + Send + Sync>,
    >,
) -> Result<crate::download::process_supervisor::ProcessOutcome, String> {
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
    fs::write(
        context.workspace().join(format!("{label}-stdout.log")),
        &result.stdout,
    )
    .map_err(|e| format!("E_STORAGE: {e}"))?;
    fs::write(
        context.workspace().join(format!("{label}-stderr.log")),
        &result.stderr,
    )
    .map_err(|e| format!("E_STORAGE: {e}"))?;
    if !result.facts.resources_releasable() {
        return Err("Gallery process not settled".into());
    }
    Ok(result)
}
fn safe_name(meta: &Value) -> Result<PathBuf, String> {
    let name = meta["filename"].as_str().ok_or("Missing filename")?;
    let ext = meta["extension"].as_str().ok_or("Missing extension")?;
    if name.is_empty()
        || name.len() > 180
        || !name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        || !matches!(ext, "jpg" | "jpeg" | "png" | "gif" | "webp")
    {
        return Err("Unsupported image filename or type".into());
    }
    let ext = if ext == "jpeg" { "jpg" } else { ext };
    Ok(PathBuf::from(format!("{name}.{ext}")))
}
fn preflight(
    request: &ExecutionRequest,
    data: &[u8],
) -> Result<(Identity, BTreeMap<PathBuf, Value>), String> {
    let (site, id) = match &request.accepted.object {
        Object::Gallery { site, id } => (*site, id),
        _ => return Err("Wrong adapter".into()),
    };
    let rows: Vec<Value> = serde_json::from_slice(data).map_err(|_| "Invalid gallery metadata")?;
    let mut files = BTreeMap::new();
    let mut title = None;
    let mut expected = None;
    for row in rows {
        let row = row.as_array().ok_or("Invalid gallery row")?;
        match row.first().and_then(Value::as_i64) {
            Some(3) => {
                let m = row.get(2).ok_or("Missing media metadata")?;
                let count = match site {
                    Site::Imgur => {
                        let (kind, target) = id.split_once(':').ok_or("Invalid target")?;
                        if m["category"].as_str() != Some("imgur")
                            || m["subcategory"].as_str() != Some(kind)
                        {
                            return Err("Imgur extractor mismatch".into());
                        }
                        if kind == "image" {
                            if m["id"].as_str() != Some(target) {
                                return Err("Image identity mismatch".into());
                            }
                            1
                        } else if kind == "album" {
                            if m["album"]["id"].as_str() != Some(target) {
                                return Err("Album identity mismatch".into());
                            }
                            m["count"].as_u64().ok_or("Album count missing")? as usize
                        } else {
                            return Err("Unknown target".into());
                        }
                    }
                    Site::Bluesky => {
                        let (actor, post) = id.split_once('/').ok_or("Invalid post")?;
                        if m["category"].as_str() != Some("bluesky")
                            || m["subcategory"].as_str() != Some("post")
                            || m["post_id"].as_str() != Some(post)
                            || !(m["author"]["handle"]
                                .as_str()
                                .is_some_and(|h| h.eq_ignore_ascii_case(actor))
                                || m["author"]["did"].as_str() == Some(actor))
                        {
                            return Err("Post identity mismatch".into());
                        }
                        let embed = &m["embed"];
                        let media = embed.get("media").unwrap_or(embed);
                        if media.get("video").is_some() {
                            return Err("Video posts unsupported".into());
                        }
                        let images = media["images"]
                            .as_array()
                            .ok_or("Post image list missing")?;
                        let filename = m["filename"]
                            .as_str()
                            .ok_or("Post image identity missing")?;
                        let mut image_ids = BTreeSet::new();
                        for image in images {
                            let blob = &image["image"];
                            let cid = blob["ref"]["$link"]
                                .as_str()
                                .or_else(|| blob["cid"].as_str())
                                .ok_or("Post image blob missing")?;
                            if !image_ids.insert(cid)
                                || !blob["mimeType"]
                                    .as_str()
                                    .is_some_and(|m| m.starts_with("image/"))
                            {
                                return Err("Invalid post image blob".into());
                            }
                        }
                        if !image_ids.contains(filename) {
                            return Err("Unexpected post image".into());
                        }
                        images.len()
                    }
                    _ => return Err("Unsupported site".into()),
                };
                if count == 0 || count > 1000 || expected.is_some_and(|n| n != count) {
                    return Err("Invalid collection count".into());
                }
                expected = Some(count);
                title.get_or_insert_with(|| {
                    crate::download::diagnostics::safe_title(
                        m["album"]["title"]
                            .as_str()
                            .or_else(|| m["title"].as_str())
                            .or_else(|| m["text"].as_str())
                            .unwrap_or(id),
                    )
                });
                let path = safe_name(m)?;
                if files.insert(path, m.clone()).is_some() {
                    return Err("Duplicate media filename".into());
                }
            }
            Some(2) => {}
            _ => return Err("Gallery metadata contains error or indirect object".into()),
        }
    }
    if Some(files.len()) != expected {
        return Err("Incomplete gallery media list".into());
    }
    Ok((
        Identity {
            id: id.clone(),
            site,
            title: title.ok_or("Empty gallery")?,
            part: None,
        },
        files,
    ))
}
fn run(
    request: &ExecutionRequest,
    context: &ExecutionContext<'_>,
    phase: &mut Phase,
) -> Result<ProducedBatch, String> {
    context.emit(AdapterEvent::Resolving);
    let mut args = common(context, request)?;
    args.extend([
        "--dump-json".into(),
        "--".into(),
        request.accepted.intent.url.clone(),
    ]);
    let result = invoke(context, args, "resolve", None)?;
    if result.exit_code != 0 {
        return Err(engine_error("resolve", &result));
    }
    if result.facts.stdout_truncated {
        return Err("E_METADATA_TOO_LARGE: gallery metadata capture exceeded bound".into());
    }
    let rows: Value = serde_json::from_slice(&result.stdout)
        .map_err(|_| "E_METADATA_INVALID_JSON: invalid gallery metadata")?;
    if let Some(error) = rows
        .as_array()
        .and_then(|rows| rows.iter().find(|row| row[0].as_i64() == Some(-1)))
    {
        return Err(format!(
            "resolve engine exit 1: ERROR: {}",
            error[1]["message"]
                .as_str()
                .unwrap_or("gallery extraction failed")
        ));
    }
    let (identity, expected) =
        preflight(request, &result.stdout).map_err(|e| format!("E_IDENTITY: {e}"))?;
    let expected_paths: Vec<PathBuf> = expected
        .keys()
        .map(|name| PathBuf::from("gallery-media").join(name))
        .collect();
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
            aliases: vec![identity.canonical_key()],
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
            if !expected.contains_key(Path::new(name)) {
                return Err(
                    "E_IDENTITY: previous collection file missing from current collection".into(),
                );
            }
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
    let pp = json!([{"name":"metadata","mode":"jsonl","event":"after","base-directory":context.workspace().to_string_lossy(),"filename":"gallery-after.jsonl"},{"name":"metadata","mode":"jsonl","event":"skip","base-directory":context.workspace().to_string_lossy(),"filename":"gallery-skip.jsonl"}]);
    let mut args = common(context, request)?;
    args.extend([
        "-o".into(),
        format!("extractor.postprocessors={pp}"),
        "-D".into(),
        root.to_string_lossy().into_owned(),
        "-f".into(),
        "{filename}.{extension}".into(),
        "--".into(),
        request.accepted.intent.url.clone(),
    ]);
    context.emit(AdapterEvent::Transferring);
    *phase = Phase::Downloading;
    let progress_root = context.workspace().to_path_buf();
    let progress_expected = expected.keys().cloned().collect::<BTreeSet<_>>();
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
                        if let Ok(name) = safe_name(&m) {
                            if progress_expected.contains(&name) {
                                names.insert(name);
                            }
                        }
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
            let name = match record_name(line, skip, &expected, &copied) {
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
    let artifacts = paths
        .into_iter()
        .map(|name| ProducedArtifact {
            relative_path: PathBuf::from("gallery-media").join(name),
            identity: identity.clone(),
            kind: MediaKind::Data,
            verification: VerificationRequirements::Data,
        })
        .collect::<Vec<_>>();
    context.emit(AdapterEvent::Files {
        completed: artifacts.len(),
        total: Some(expected.len()),
    });
    let failure = if context.cancelled() {
        Some(Failure::new(FailureCode::Cancelled, "cleanup"))
    } else if result.exit_code != 0 {
        Some(super::yt_dlp::diagnostics::classify(
            &Phase::Downloading,
            &engine_error("transfer", &result),
        ))
    } else if bad || artifacts.len() != expected.len() {
        Some(Failure::new(FailureCode::Unknown, "transfer"))
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
fn same_collection(previous: &[PathBuf], total: Option<usize>, current: &[PathBuf]) -> bool {
    let old: BTreeSet<_> = previous.iter().collect();
    let new: BTreeSet<_> = current.iter().collect();
    old.len() == previous.len()
        && new.len() == current.len()
        && old == new
        && total == Some(new.len())
}
fn record_name(
    line: &[u8],
    skip: bool,
    expected: &BTreeMap<PathBuf, Value>,
    copied: &BTreeSet<PathBuf>,
) -> Result<PathBuf, String> {
    if !line.ends_with(b"\n") {
        return Err("Incomplete record".into());
    }
    let m: Value = serde_json::from_slice(line).map_err(|_| "Invalid record")?;
    let name = safe_name(&m)?;
    let original = expected.get(&name).ok_or("Unexpected record")?;
    if ["category", "subcategory", "id", "post_id"]
        .iter()
        .any(|key| m.get(key) != original.get(key))
        || m["album"]["id"] != original["album"]["id"]
        || m["author"]["did"] != original["author"]["did"]
        || (skip && !copied.contains(&name))
    {
        return Err("Record identity mismatch".into());
    }
    Ok(name)
}
fn engine_error(
    label: &str,
    outcome: &crate::download::process_supervisor::ProcessOutcome,
) -> String {
    let stderr = String::from_utf8_lossy(&outcome.stderr);
    format!(
        "{label} engine exit {}: {}",
        outcome.exit_code,
        stderr
            .chars()
            .rev()
            .take(3000)
            .collect::<String>()
            .chars()
            .rev()
            .collect::<String>()
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::download::request::{Accepted, DownloadIntent, Quality};
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
    fn metadata_rejects_errors_wrong_identity_and_missing_media() {
        let r = request("https://bsky.app/profile/test.example/post/abc123");
        let image = json!({"category":"bluesky","subcategory":"post","post_id":"abc123","author":{"handle":"test.example"},"embed":{"images":[{"image":{"ref":{"$link":"one"},"mimeType":"image/jpeg"}},{"image":{"ref":{"$link":"two"},"mimeType":"image/jpeg"}}]},"filename":"one","extension":"jpeg"});
        let mut other = image.clone();
        other["filename"] = json!("two");
        let rows = json!([
            [2, {}],
            [3, "https://example.test/a", image],
            [3, "https://example.test/b", other]
        ]);
        let (_, files) = preflight(&r, &serde_json::to_vec(&rows).unwrap()).unwrap();
        assert!(files.contains_key(Path::new("one.jpg")));
        let mut missing = rows.clone();
        missing.as_array_mut().unwrap().pop();
        assert!(preflight(&r, &serde_json::to_vec(&missing).unwrap()).is_err());
        let mut error = rows.clone();
        error
            .as_array_mut()
            .unwrap()
            .push(json!([-1, {"error":"failure"}]));
        assert!(preflight(&r, &serde_json::to_vec(&error).unwrap()).is_err());
        let mut wrong = rows.clone();
        wrong[1][2]["post_id"] = json!("other");
        assert!(preflight(&r, &serde_json::to_vec(&wrong).unwrap()).is_err());
    }
    #[test]
    fn accepted_boundaries_exclude_feeds_and_distinguish_album() {
        let single = request("https://imgur.com/abcde");
        let album = request("https://imgur.com/a/abcde");
        assert_ne!(
            single.accepted.object.provisional_key(),
            album.accepted.object.provisional_key()
        );
        for url in [
            "https://imgur.com/",
            "https://imgur.com/gallery/abcde",
            "https://bsky.app/profile/test.example",
            "https://bsky.app/",
        ] {
            assert!(
                Accepted::new(DownloadIntent {
                    url: url.into(),
                    quality: Quality::Balanced,
                    output_dir: std::env::temp_dir()
                })
                .is_err()
            );
        }
    }
    #[test]
    fn machine_records_require_complete_matching_identity_and_verified_skip() {
        let metadata = json!({"category":"bluesky","subcategory":"post","post_id":"abc","author":{"did":"did:plc:one"},"filename":"one","extension":"jpg"});
        let expected = BTreeMap::from([(PathBuf::from("one.jpg"), metadata.clone())]);
        let copied = BTreeSet::from([PathBuf::from("one.jpg")]);
        let mut record = serde_json::to_vec(&metadata).unwrap();
        record.push(b'\n');
        assert_eq!(
            record_name(&record, false, &expected, &BTreeSet::new()).unwrap(),
            PathBuf::from("one.jpg")
        );
        assert!(record_name(&record, true, &expected, &copied).is_ok());
        assert!(record_name(&record, true, &expected, &BTreeSet::new()).is_err());
        assert!(record_name(&record[..record.len() - 1], false, &expected, &copied).is_err());
        assert!(record_name(b"{bad}\n", false, &expected, &copied).is_err());
        let mut wrong = metadata.clone();
        wrong["post_id"] = json!("other");
        let mut wrong_record = serde_json::to_vec(&wrong).unwrap();
        wrong_record.push(b'\n');
        assert!(record_name(&wrong_record, false, &expected, &copied).is_err());
        wrong["filename"] = json!("other");
        let mut unknown = serde_json::to_vec(&wrong).unwrap();
        unknown.push(b'\n');
        assert!(record_name(&unknown, false, &expected, &copied).is_err());
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
    #[test]
    fn pinned_bluesky_jpeg_dump_matches_native_after_filename() {
        let request = request("https://bsky.app/profile/bsky.app/post/3mzhhvhjfwk22");
        let cid = "bafkreiczrhhklt4wsquxzgudjxd7w4rch4tcbb7fkedhg56h3bfvsla2v4";
        let metadata = json!({"category":"bluesky","subcategory":"post","post_id":"3mzhhvhjfwk22","author":{"handle":"bsky.app","did":"did:plc:z72i7hdynmk6r22z27h6tvur"},"embed":{"images":[{"image":{"ref":{"$link":cid},"mimeType":"image/jpeg"}}]},"filename":cid,"extension":"jpeg"});
        let dump = json!([[2, {}], [3, "https://example.test/blob", metadata.clone()]]);
        let (_, expected) = preflight(&request, &serde_json::to_vec(&dump).unwrap()).unwrap();
        let mut after = metadata;
        after["extension"] = json!("jpg");
        let mut line = serde_json::to_vec(&after).unwrap();
        line.push(b'\n');
        assert_eq!(
            record_name(&line, false, &expected, &BTreeSet::new()).unwrap(),
            PathBuf::from("bafkreiczrhhklt4wsquxzgudjxd7w4rch4tcbb7fkedhg56h3bfvsla2v4.jpg")
        );
    }
}
