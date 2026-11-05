//! Verification is selected by declared media kind; publication remains shared.
pub mod video;
mod image;
use super::{
    contract::{MediaKind, ProducedArtifact, VerificationRequirements},
    output::{self, VerifiedMedia},
    process_supervisor::{Control, ProcessObservation},
    runtime::RuntimeLease,
};
use std::{path::Path, sync::Arc};

pub struct VerifierRegistry {
    video_probe: Option<&'static str>,
    data: bool,
    images: bool,
}
impl VerifierRegistry {
    pub fn evidence_files(&self) -> &[(&str, u64)] {
        if self.video_probe.is_some() {
            video::EVIDENCE
        } else {
            &[]
        }
    }
    pub fn video(probe: &'static str) -> Self {
        Self {
            video_probe: Some(probe),
            data: false,
            images: false,
        }
    }
    pub fn video_and_images(probe: &'static str) -> Self {
        Self { video_probe: Some(probe), data: true, images: true }
    }
    #[cfg(test)]
    pub(crate) fn data() -> Self {
        Self {
            video_probe: None,
            data: true,
            images: false,
        }
    }
    pub fn verify(
        &self,
        artifact: &ProducedArtifact,
        workspace: &Path,
        lease: &RuntimeLease,
        control: &Control,
        observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>,
    ) -> Result<VerifiedMedia, String> {
        if artifact.relative_path.as_os_str().is_empty()
            || !artifact
                .relative_path
                .components()
                .all(|c| matches!(c, std::path::Component::Normal(_)))
        {
            return Err("Artifact path must be owned workspace-relative".into());
        }
        let path = workspace.join(&artifact.relative_path);
        match (&artifact.kind, &artifact.verification) {
            (MediaKind::Video, VerificationRequirements::Video(expected)) => video::verify(&path, workspace, expected, lease, control, observer, self.video_probe.ok_or("No declared video verifier")?),
            (MediaKind::Data, VerificationRequirements::Data) if self.images => image::verify(&path, workspace, lease, control, observer),
            (MediaKind::Data, VerificationRequirements::Data) if self.data => output::verify_data(&path, workspace),
            _ => Err("Undeclared or mismatched artifact verification kind".into()),
        }
    }
}
