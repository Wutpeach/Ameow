use super::{gallery_dl::GalleryDlAdapter, yt_dlp::YtDlpAdapter};
use crate::download::{
    adapter::{DownloaderAdapter, ExecutionContext},
    contract::{AdapterEvent, AdapterResult, ExecutionRequest, MediaKind, ProducedBatch},
    diagnostics::{Failure, FailureCode},
    process_supervisor::ProcessObservation,
    request::Object,
    runtime::TrustedRuntimeRequirements,
};
use std::{fs, io::Read, os::windows::fs::MetadataExt, path::Path, sync::{Arc, atomic::{AtomicBool, Ordering}}};

pub struct AutomaticAdapter {
    requirements: TrustedRuntimeRequirements,
    video: YtDlpAdapter,
    gallery: GalleryDlAdapter,
}
impl AutomaticAdapter {
    pub fn new(requirements: TrustedRuntimeRequirements) -> Self {
        Self {
            video: YtDlpAdapter::new(requirements.clone()),
            gallery: GalleryDlAdapter::new(requirements.clone()),
            requirements,
        }
    }
    fn select(&self, request: &ExecutionRequest) -> &dyn DownloaderAdapter {
        match request.accepted.object {
            Object::Gallery { .. } => &self.gallery,
            _ => &self.video,
        }
    }
}
fn fallback_allowed(failure: &Failure, admitted: bool, settled: bool, cancelled: bool) -> bool {
    failure.code == "E_UNSUPPORTED_URL" && failure.stage == "resolve"
        && !admitted && settled && !cancelled
}
fn generic_batch(
    request: &ExecutionRequest, context: &ExecutionContext<'_>,
    primary: &dyn DownloaderAdapter, secondary: &dyn DownloaderAdapter,
) -> Result<ProducedBatch, Failure> {
    if request.resume.is_some() { return Err(Failure::new(FailureCode::Identity, "admission")); }
    let directory = context.workspace().join("primary");
    fs::create_dir(&directory).map_err(|_| Failure::new(FailureCode::Storage, "resolve"))?;
    let admitted = Arc::new(AtomicBool::new(false));
    let attempted = admitted.clone();
    let admission = context.admission.clone();
    let settled = Arc::new(AtomicBool::new(false));
    let observed = settled.clone();
    let observer = context.observer.clone();
    let first = ExecutionContext {
        workspace: &directory, lease: context.lease, requirements: context.requirements, control: context.control,
        admission: Arc::new(move |proof| {
            // Even a refused admission may already have frozen queue identity.
            attempted.store(true, Ordering::Release);
            admission(proof)
        }),
        observer: Arc::new(move |event| {
            match &event {
                ProcessObservation::Settled(facts) => observed.store(facts.resources_releasable(), Ordering::Release),
                ProcessObservation::Running { .. } | ProcessObservation::Held(_) => observed.store(false, Ordering::Release),
                _ => {}
            }
            observer(event);
        }),
        events: context.events.clone(),
    };
    let result = primary.execute_batch(request, &first);
    preserve_primary(&directory, context.workspace(), primary.evidence_files())
        .map_err(|_| Failure::new(FailureCode::Storage, "resolve"))?;
    match result {
        Ok(mut batch) => {
            // The verifier still receives paths relative to the original owned workspace.
            for artifact in &mut batch.artifacts { artifact.relative_path = Path::new("primary").join(&artifact.relative_path); }
            for path in &mut batch.expected_paths { *path = Path::new("primary").join(&*path); }
            Ok(batch)
        }
        Err(failure) if fallback_allowed(&failure, admitted.load(Ordering::Acquire), settled.load(Ordering::Acquire), context.cancelled()) => {
            context.emit(AdapterEvent::Fallback);
            if context.cancelled() { return Err(Failure::new(FailureCode::Cancelled, "cleanup")); }
            // Only the second engine may produce results now; it cannot read primary records.
            secondary.execute_batch(request, context)
        }
        Err(failure) => Err(failure),
    }
}
fn preserve_primary(source: &Path, target: &Path, files: &[(&str, u64)]) -> Result<(), String> {
    for &(name, limit) in files {
        if Path::new(name).components().count() != 1 { return Err("Invalid primary evidence name".into()); }
        let path = source.join(name);
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.to_string()),
        };
        if !metadata.is_file() || metadata.file_attributes() & 0x400 != 0 { return Err("Unsafe primary evidence".into()); }
        let destination = target.join(format!("primary-{name}"));
        if metadata.len() > limit {
            fs::write(destination.with_extension("omitted.txt"), b"Primary diagnostic exceeded its bound").map_err(|e| e.to_string())?;
        } else {
            let mut input = fs::File::open(path).map_err(|e| e.to_string())?.take(limit + 1);
            let mut output = fs::OpenOptions::new().write(true).create_new(true).open(destination).map_err(|e| e.to_string())?;
            if std::io::copy(&mut input, &mut output).map_err(|e| e.to_string())? > limit { return Err("Primary evidence changed".into()); }
        }
    }
    Ok(())
}
impl DownloaderAdapter for AutomaticAdapter {
    fn kind(&self) -> MediaKind {
        MediaKind::Video
    }
    fn requirements(&self) -> &TrustedRuntimeRequirements {
        &self.requirements
    }
    fn execute(&self, request: &ExecutionRequest, context: &ExecutionContext<'_>) -> AdapterResult {
        let mut batch = self.execute_batch(request, context)?;
        if let Some(failure) = batch.failure { return Err(failure); }
        if batch.artifacts.len() != 1 { return Err(Failure::new(FailureCode::Media, "verify")); }
        Ok(batch.artifacts.remove(0))
    }
    fn execute_batch(
        &self,
        request: &ExecutionRequest,
        context: &ExecutionContext<'_>,
    ) -> Result<ProducedBatch, Failure> {
        if matches!(request.accepted.object, Object::Generic { .. }) {
            generic_batch(request, context, &self.video, &self.gallery)
        } else {
            self.select(request).execute_batch(request, context)
        }
    }
    fn evidence_files(&self) -> &[(&str, u64)] {
        EVIDENCE
    }
}
const EVIDENCE: &[(&str, u64)] = &[
    ("primary-resolved.json", 32 * 1024 * 1024),
    ("primary-media.info.json", 32 * 1024 * 1024),
    ("primary-selection.txt", 32 * 1024 * 1024),
    ("primary-resolve-argv.json", 8 * 1024 * 1024),
    ("primary-resolve-stdout.log", 32 * 1024 * 1024),
    ("primary-resolve-stderr.log", 1024 * 1024),
    ("primary-resolve-settlement.txt", 65536),
    ("primary-transfer-argv.json", 8 * 1024 * 1024),
    ("primary-transfer-stdout.log", 4 * 1024 * 1024),
    ("primary-transfer-stderr.log", 1024 * 1024),
    ("primary-transfer-settlement.txt", 65536),
    ("primary-final-object.txt", 4096),
    ("primary-adapter-error.log", 65536),
    ("resolved.json", 32 * 1024 * 1024),
    ("media.info.json", 32 * 1024 * 1024),
    ("selection.txt", 32 * 1024 * 1024),
    ("resolve-argv.json", 8 * 1024 * 1024),
    ("resolve-stdout.log", 32 * 1024 * 1024),
    ("resolve-stderr.log", 1024 * 1024),
    ("resolve-settlement.txt", 65536),
    ("transfer-argv.json", 8 * 1024 * 1024),
    ("transfer-stdout.log", 4 * 1024 * 1024),
    ("transfer-stderr.log", 1024 * 1024),
    ("transfer-settlement.txt", 65536),
    ("final-object.txt", 4096),
    ("adapter-error.log", 65536),
    ("gallery-after.jsonl", 8 * 1024 * 1024),
    ("gallery-skip.jsonl", 8 * 1024 * 1024),
    ("resolve-command.json", 8 * 1024 * 1024),
    ("transfer-command.json", 8 * 1024 * 1024),
    ("resolve-settlement.log", 65536),
    ("transfer-settlement.log", 65536),
];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::download::{adapter::IdentityAdmission, contract::{IdentityAttestation, ProducedArtifact, VerificationRequirements}, process_supervisor::{Control, SettlementFacts}, request::{Accepted, DownloadIntent, Identity, Quality, Site}, runtime::RuntimeManager};
    use std::sync::atomic::AtomicUsize;

    struct Fixture { requirements: TrustedRuntimeRequirements, mode: u8, calls: AtomicUsize }
    impl Fixture { fn new(mode: u8) -> Self { Self { requirements: TrustedRuntimeRequirements::empty(), mode, calls: AtomicUsize::new(0) } } }
    impl DownloaderAdapter for Fixture {
        fn kind(&self) -> MediaKind { MediaKind::Data }
        fn requirements(&self) -> &TrustedRuntimeRequirements { &self.requirements }
        fn evidence_files(&self) -> &[(&str,u64)] { &[("resolve-stdout.log", 1024)] }
        fn execute(&self, _: &ExecutionRequest, _: &ExecutionContext<'_>) -> AdapterResult { unreachable!() }
        fn execute_batch(&self, _: &ExecutionRequest, context: &ExecutionContext<'_>) -> Result<ProducedBatch, Failure> {
            self.calls.fetch_add(1, Ordering::AcqRel);
            let identity = Identity { id: "fixture".into(), title: "Fixture".into(), site: Site::Generic, part: None };
            if self.mode == 1 {
                context.admit(&IdentityAttestation { identity: identity.clone(), aliases: vec![] })?;
            }
            if self.mode != 2 {
                (context.observer)(ProcessObservation::Settled(SettlementFacts { root_waited: true, job_active_zero: true, stdout_reader_joined: true, stderr_reader_joined: true, callback_consumer_joined: true, ..Default::default() }));
            }
            if self.mode == 5 { context.control.cancel(); }
            fs::write(context.workspace().join("resolve-stdout.log"), format!("engine {}", self.mode)).unwrap();
            if self.mode == 3 || self.mode == 4 {
                Ok(ProducedBatch { artifacts: vec![ProducedArtifact { relative_path: "media.bin".into(), identity, kind: MediaKind::Data, verification: VerificationRequirements::Data }], failure: (self.mode==4).then(|| Failure::new(FailureCode::Unknown, "transfer")), total: Some(if self.mode==4 { 2 } else { 1 }), collection: self.mode==4, expected_paths: vec!["media.bin".into()] })
            } else { Err(Failure::new(FailureCode::UnsupportedUrl, "resolve")) }
        }
    }
    fn run_fixture(first: u8, second: u8, refuse_admission: bool) -> (bool, usize, Vec<String>, tempfile::TempDir) {
        run_fixture_with_cancel(first, second, refuse_admission, false)
    }
    fn run_fixture_with_cancel(first: u8, second: u8, refuse_admission: bool, cancel_on_fallback: bool) -> (bool, usize, Vec<String>, tempfile::TempDir) {
        let root = tempfile::tempdir().unwrap();
        let work = root.path().join("work"); fs::create_dir(&work).unwrap();
        let control = Control::default();
        let requirements = TrustedRuntimeRequirements::empty();
        let lease = RuntimeManager::new(root.path().join("runtime")).prepare(&requirements, &control, Arc::new(|_| {}), |_| {}).unwrap();
        let events = Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
        let captured = events.clone();
        let event_control = control.clone();
        let admission: IdentityAdmission = Arc::new(move |_| if refuse_admission { Err("E_DUPLICATE: fixture".into()) } else { Ok(()) });
        let context = ExecutionContext { workspace: &work, lease: &lease, requirements: &requirements, control: &control, observer: Arc::new(|_| {}), admission, events: Arc::new(move |event| { if cancel_on_fallback && matches!(event, AdapterEvent::Fallback) { event_control.cancel(); } captured.lock().unwrap().push(format!("{event:?}")); }) };
        let request = ExecutionRequest { accepted: Accepted::new(DownloadIntent { url: "https://example.com/work".into(), quality: Quality::Saver, output_dir: root.path().into() }).unwrap(), resume: None };
        let primary = Fixture::new(first); let secondary = Fixture::new(second);
        let result = generic_batch(&request, &context, &primary, &secondary);
        assert_eq!(primary.calls.load(Ordering::Acquire), 1);
        if first==3 || first==4 {
            let batch = result.as_ref().unwrap();
            assert_eq!(batch.artifacts[0].relative_path, Path::new("primary/media.bin"));
            assert_eq!(batch.expected_paths, [std::path::PathBuf::from("primary/media.bin")]);
        }
        let captured = events.lock().unwrap().clone();
        (result.is_ok(), secondary.calls.load(Ordering::Acquire), captured, root)
    }
    #[test]
    fn fallback_is_single_sequential_and_preserves_separate_engine_records() {
        let (ok, calls, events, root) = run_fixture(0, 0, false);
        assert!(!ok); assert_eq!(calls, 1); assert_eq!(events, ["Fallback"]);
        assert_eq!(fs::read_to_string(root.path().join("work/primary-resolve-stdout.log")).unwrap(), "engine 0");
        assert!(root.path().join("work/primary/resolve-stdout.log").is_file());
        assert!(root.path().join("work/resolve-stdout.log").is_file());
        let (ok, calls, events, _) = run_fixture(0, 3, false);
        assert!(ok); assert_eq!(calls, 1); assert_eq!(events, ["Fallback"]);
    }
    #[test]
    fn cancellation_at_switch_does_not_start_secondary() {
        let (ok, calls, events, _) = run_fixture_with_cancel(0, 3, false, true);
        assert!(!ok);
        assert_eq!(calls, 0);
        assert_eq!(events, ["Fallback"]);
    }
    #[test]
    fn success_partial_admission_unsettled_and_cancelled_results_never_switch() {
        for mode in [1,2,3,4,5] {
            let (_, calls, events, _) = run_fixture(mode, 0, false);
            assert_eq!(calls, 0, "mode {mode}"); assert!(events.is_empty());
        }
        assert_eq!(run_fixture(1,0,true).1, 0);
    }
    #[test]
    fn only_explicit_unsupported_resolution_before_admission_can_fallback() {
        let failure = crate::download::diagnostics::known("E_UNSUPPORTED_URL", "resolve");
        assert!(fallback_allowed(&failure, false, true, false));
        assert!(!fallback_allowed(&failure, true, true, false));
        assert!(!fallback_allowed(&failure, false, false, false));
        assert!(!fallback_allowed(&failure, false, true, true));
        assert!(!fallback_allowed(&crate::download::diagnostics::known("E_UNSUPPORTED_URL", "transfer"), false, true, false));
        for code in ["E_ENGINE_FAILED","E_OBJECT_UNSUPPORTED","E_IDENTITY","E_MEDIA","E_ACCESS_DENIED","E_RATE_LIMIT","E_NETWORK_TEMPORARY","E_CANCELLED","E_STORAGE","E_URL_UNSAFE","E_ROUTE_UNSUPPORTED","E_RUNTIME","E_UNAVAILABLE","E_UNKNOWN"] {
            assert!(!fallback_allowed(&crate::download::diagnostics::known(code, "resolve"), false, true, false), "{code}");
        }
    }
}
