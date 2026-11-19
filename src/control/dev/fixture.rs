//! Fixed offline adapter fixtures. Production commands never select these services.
use crate::download::{
    adapter::{DownloadServices, DownloaderAdapter, ExecutionContext},
    contract::{
        AdapterEvent, AdapterResult, ExecutionRequest, IdentityAttestation, MediaKind,
        ProducedArtifact, VerificationRequirements,
    },
    diagnostics::{Failure, FailureCode},
    runtime::{RuntimeManager, TrustedRuntimeRequirements},
    verification::VerifierRegistry,
};
use std::{
    fs,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

struct Fixture {
    case: String,
    attempts: AtomicUsize,
    requirements: TrustedRuntimeRequirements,
}
impl DownloaderAdapter for Fixture {
    #[cfg(test)]
    fn execute_batch(
        &self,
        request: &ExecutionRequest,
        context: &ExecutionContext<'_>,
    ) -> Result<crate::download::contract::ProducedBatch, Failure> {
        use crate::download::{
            contract::ProducedBatch,
            request::{Identity, Object},
        };
        if !self.case.starts_with("gallery-") {
            return self
                .execute(request, context)
                .map(|artifact| ProducedBatch {
                    artifacts: vec![artifact],
                    failure: None,
                    total: Some(1),
                    collection: false,
                    expected_paths: Vec::new(),
                });
        }
        let Object::Gallery { site, id } = &request.accepted.object else {
            panic!("Gallery fixture input");
        };
        let identity = Identity {
            id: id.clone(),
            site: *site,
            title: "Ameow gallery fixture".into(),
            part: None,
        };
        context.admit(&IdentityAttestation {
            aliases: vec![identity.canonical_key()],
            identity: identity.clone(),
        })?;
        context.emit(AdapterEvent::Transferring);
        let first = self.attempts.fetch_add(1, Ordering::AcqRel) == 0;
        if !first {
            // Keep the retry active so a stale completion decision reliably cancels it.
            let until = Instant::now() + Duration::from_millis(150);
            while Instant::now() < until {
                if context.cancelled() {
                    return Err(Failure::new(FailureCode::Cancelled, "cleanup"));
                }
                thread::sleep(Duration::from_millis(5));
            }
        }
        let count = if first {
            usize::from(self.case == "gallery-partial")
        } else {
            2
        };
        let mut artifacts = Vec::new();
        for n in 0..count {
            let relative_path = PathBuf::from(format!("image-{n}.bin"));
            fs::write(
                context.workspace().join(&relative_path),
                format!("Ameow gallery fixture {n}"),
            )
            .unwrap();
            artifacts.push(ProducedArtifact {
                relative_path,
                identity: identity.clone(),
                kind: MediaKind::Data,
                verification: VerificationRequirements::Data,
            });
        }
        Ok(ProducedBatch {
            artifacts,
            failure: first.then(|| Failure::new(FailureCode::Unknown, "transfer")),
            total: Some(2),
            collection: true,
            expected_paths: vec!["image-0.bin".into(), "image-1.bin".into()],
        })
    }
    fn kind(&self) -> MediaKind {
        MediaKind::Data
    }
    fn requirements(&self) -> &TrustedRuntimeRequirements {
        &self.requirements
    }
    fn evidence_files(&self) -> &[(&str, u64)] {
        &[]
    }
    fn execute(&self, request: &ExecutionRequest, context: &ExecutionContext<'_>) -> AdapterResult {
        let identity=crate::download::adapters::yt_dlp::identity::attest(&request.accepted,
            &serde_json::json!({"id":"offline-fixture","extractor_key":"Fixture","title":"Ameow offline fixture","webpage_url":request.accepted.intent.url}))
            .map_err(|_|Failure::new(FailureCode::Identity,"admission"))?;
        context.emit(AdapterEvent::Resolving);
        context.admit(&IdentityAttestation {
            aliases: vec![identity.canonical_key()],
            identity: identity.clone(),
        })?;
        context.emit(AdapterEvent::Transferring);
        if self.case == "held" {
            panic!("Explicit offline dev fixture: owner panic after admission");
        }
        if self.case == "retry" && self.attempts.fetch_add(1, Ordering::AcqRel) == 0 {
            return Err(Failure::new(FailureCode::Unknown, "transfer"));
        }
        // This is an offline core fixture; it spawns no native downloader process.
        let until = Instant::now() + Duration::from_millis(250);
        while Instant::now() < until || matches!(self.case.as_str(), "cancel" | "stop" | "timeout")
        {
            if context.cancelled() {
                return Err(Failure::new(FailureCode::Cancelled, "cleanup"));
            }
            thread::sleep(Duration::from_millis(10));
        }
        fs::write(
            context.workspace().join("fixture.bin"),
            b"Ameow offline core fixture\n",
        )
        .map_err(|_| Failure::new(FailureCode::Storage, "transfer"))?;
        Ok(ProducedArtifact {
            relative_path: PathBuf::from("fixture.bin"),
            identity,
            kind: MediaKind::Data,
            verification: VerificationRequirements::Data,
        })
    }
}
pub(super) fn services(root: PathBuf, case: &str) -> DownloadServices {
    DownloadServices {
        runtime: Arc::new(RuntimeManager::new(root)),
        adapter: Arc::new(Fixture {
            case: case.into(),
            attempts: AtomicUsize::new(0),
            requirements: TrustedRuntimeRequirements::empty(),
        }),
        verifiers: Arc::new(VerifierRegistry::data()),
    }
}
