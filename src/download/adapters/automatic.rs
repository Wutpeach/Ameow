use super::{gallery_dl::GalleryDlAdapter, yt_dlp::YtDlpAdapter};
use crate::download::{
    adapter::{DownloaderAdapter, ExecutionContext},
    contract::{AdapterResult, ExecutionRequest, MediaKind, ProducedBatch},
    diagnostics::Failure,
    request::Object,
    runtime::TrustedRuntimeRequirements,
};

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
// A fallback is eligible only with verified independent coverage of the exact object.
fn fallback_allowed(
    independent_engine: bool,
    exact_scope: bool,
    failure_code: &str,
    previous_fallbacks: usize,
) -> bool {
    independent_engine
        && exact_scope
        && previous_fallbacks == 0
        && matches!(failure_code, "E_UNAVAILABLE" | "E_ENGINE_FAILED")
}
fn fallback_for(
    object: &Object,
    failure_code: &str,
    previous_fallbacks: usize,
) -> Option<MediaKind> {
    // No supported object currently has a proven equivalent independent extractor.
    let candidate = match object {
        Object::Youtube(_)
        | Object::Bilibili { .. }
        | Object::BilibiliShort { .. }
        | Object::Gallery { .. } => None,
    };
    candidate
        .filter(|(independent, exact, _)| {
            fallback_allowed(*independent, *exact, failure_code, previous_fallbacks)
        })
        .map(|(_, _, kind)| kind)
}
impl DownloaderAdapter for AutomaticAdapter {
    fn kind(&self) -> MediaKind {
        MediaKind::Video
    }
    fn requirements(&self) -> &TrustedRuntimeRequirements {
        &self.requirements
    }
    fn execute(&self, request: &ExecutionRequest, context: &ExecutionContext<'_>) -> AdapterResult {
        self.select(request).execute(request, context)
    }
    fn execute_batch(
        &self,
        request: &ExecutionRequest,
        context: &ExecutionContext<'_>,
    ) -> Result<ProducedBatch, Failure> {
        let result = self.select(request).execute_batch(request, context);
        match &result {
            Err(failure) => match fallback_for(&request.accepted.object, &failure.code, 0) {
                Some(MediaKind::Video) => self.video.execute_batch(request, context),
                Some(MediaKind::Data) => self.gallery.execute_batch(request, context),
                None => result,
            },
            Ok(_) => result,
        }
    }
    fn evidence_files(&self) -> &[(&str, u64)] {
        EVIDENCE
    }
}
const EVIDENCE: &[(&str, u64)] = &[
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
];

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fallback_requires_independent_exact_coverage_recoverable_failure_and_one_attempt() {
        assert!(fallback_allowed(true, true, "E_UNAVAILABLE", 0));
        assert!(!fallback_allowed(false, true, "E_UNAVAILABLE", 0));
        assert!(!fallback_allowed(true, false, "E_UNAVAILABLE", 0));
        assert!(!fallback_allowed(true, true, "E_CANCELLED", 0));
        assert!(!fallback_allowed(true, true, "E_UNAVAILABLE", 1));
        assert!(fallback_for(&Object::Youtube("abcdefghijk".into()), "E_UNAVAILABLE", 0).is_none());
        assert!(
            fallback_for(
                &Object::Gallery {
                    site: crate::download::request::Site::Imgur,
                    id: "album:abcde".into()
                },
                "E_ENGINE_FAILED",
                0
            )
            .is_none()
        );
    }
}
