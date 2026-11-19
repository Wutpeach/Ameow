//! Execution port. Uses the existing owner, supervisor and immutable runtime lease.
use super::{
    contract::{AdapterEvent, AdapterResult, ExecutionRequest, IdentityAttestation, MediaKind, ProducedBatch},
    diagnostics::{Failure, FailureCode},
    process_supervisor::{self, Control, ProcessObservation, ProcessOutcome, ProcessSpec},
    runtime::{RuntimeLease, RuntimeManager, TrustedRuntimeRequirements},
    verification::VerifierRegistry,
};
use std::{path::Path, sync::Arc, time::Duration};

pub type IdentityAdmission = Arc<dyn Fn(&IdentityAttestation) -> Result<(), String> + Send + Sync>;
pub type EventSink = Arc<dyn Fn(AdapterEvent) + Send + Sync>;
pub trait DownloaderAdapter: Send + Sync {
    fn kind(&self) -> MediaKind;
    fn requirements(&self) -> &TrustedRuntimeRequirements;
    fn execute(&self, request: &ExecutionRequest, context: &ExecutionContext<'_>) -> AdapterResult;
    fn execute_batch(&self, request: &ExecutionRequest, context: &ExecutionContext<'_>) -> Result<ProducedBatch, Failure> {
        self.execute(request, context).map(|artifact| ProducedBatch {
            artifacts: vec![artifact], failure: None, total: Some(1), collection: false, expected_paths: Vec::new(),
        })
    }
    fn evidence_files(&self) -> &[(&str, u64)];
}
#[derive(Clone)]
pub struct DownloadServices {
    pub runtime: Arc<RuntimeManager>,
    pub adapter: Arc<dyn DownloaderAdapter>,
    pub verifiers: Arc<VerifierRegistry>,
}
pub struct ManagedCommand {
    pub tool: &'static str,
    pub args: Vec<String>,
    pub stdout_limit: usize,
    pub stderr_limit: usize,
    pub timeout: Option<Duration>,
}
pub struct ExecutionContext<'a> {
    pub(crate) authentication: Option<&'a crate::browser_sessions::Attempt>,
    pub(crate) workspace: &'a Path,
    pub(crate) lease: &'a RuntimeLease,
    pub(crate) requirements: &'a TrustedRuntimeRequirements,
    pub(crate) control: &'a Control,
    pub(crate) observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>,
    pub(crate) admission: IdentityAdmission,
    pub(crate) events: EventSink,
}
impl ExecutionContext<'_> {
    /// Authenticated wire output stays in memory; no engine-supplied headers reach evidence.
    pub fn write_evidence(&self, name: &str, bytes: &[u8]) -> Result<(), String> {
        std::fs::write(self.workspace.join(name), if self.authentication.is_some() {
            b"Authenticated engine output omitted; see safe attempt diagnostics.\n".as_slice()
        } else { bytes }).map_err(|e| e.to_string())
    }
    pub fn workspace(&self) -> &Path {
        self.workspace
    }
    pub fn cancelled(&self) -> bool {
        if self.authentication.is_some_and(|auth| !auth.valid()) { self.control.cancel(); }
        self.control.is_cancelled()
    }
    pub fn tool(&self, name: &str) -> Result<std::path::PathBuf, String> {
        if !self.requirements.contains(name) {
            return Err("Undeclared tool requirement".into());
        }
        self.lease.file(name)
    }
    pub fn admit(&self, proof: &IdentityAttestation) -> Result<(), Failure> {
        (self.admission)(proof).map_err(|error| Failure::new(if error.starts_with("E_DUPLICATE:") { FailureCode::Duplicate } else { FailureCode::Identity }, "admission"))
    }
    pub fn emit(&self, event: AdapterEvent) {
        (self.events)(event);
    }
    pub fn run(
        &self,
        command: ManagedCommand,
        output: Option<Arc<dyn Fn(ProcessObservation) + Send + Sync>>,
    ) -> Result<ProcessOutcome, String> {
        self.run_command(command, output, #[cfg(target_os = "macos")] None, #[cfg(target_os = "macos")] None)
    }
    #[cfg(target_os = "macos")]
    pub(crate) fn run_ytdlp(
        &self,
        command: ManagedCommand,
        phase: super::adapters::yt_dlp::InvocationPhase,
        resolution: Option<&serde_json::Value>,
        output: Option<Arc<dyn Fn(ProcessObservation) + Send + Sync>>,
    ) -> Result<ProcessOutcome, String> {
        if !matches!(command.tool, "yt-dlp.exe" | "yt-dlp") {
            return Err("Managed yt-dlp invocation requires its declared tool".into());
        }
        self.run_command(command, output, Some(phase), resolution)
    }
    fn run_command(
        &self,
        command: ManagedCommand,
        output: Option<Arc<dyn Fn(ProcessObservation) + Send + Sync>>,
        #[cfg(target_os = "macos")] phase: Option<super::adapters::yt_dlp::InvocationPhase>,
        #[cfg(target_os = "macos")] resolution: Option<&serde_json::Value>,
    ) -> Result<ProcessOutcome, String> {
        if self.cancelled() { return Err("E_CANCELLED: authorization or attempt cancelled".into()); }
        let observer = self.observer.clone();
        let combined = Arc::new(move |event: ProcessObservation| {
            if let Some(output) = &output {
                output(event.clone());
            }
            if !matches!(event, ProcessObservation::Output { .. }) {
                observer(event);
            }
        });
        let executable = self.tool(command.tool)?;
        let args = command.args;
        #[cfg(target_os = "macos")]
        let (executable, args) = if command.tool == "yt-dlp.exe" || command.tool == "yt-dlp" {
            super::runtime::python_zipapp(self.tool(super::runtime::PYTHON_TOOL)?, &executable, args)?
        } else { (executable, args) };
        let spec = ProcessSpec {
            executable,
            args,
            cwd: self.workspace.into(),
            env: self.requirements.environment(self.workspace)?,
            stdout_limit: command.stdout_limit,
            stderr_limit: command.stderr_limit,
            timeout: command.timeout,
        };
        #[cfg(target_os = "macos")]
        if let Some(phase) = phase {
            let completion = super::adapters::yt_dlp::settlement_macos::ManagedCompletion::for_invocation(
                &spec, self.lease, phase, resolution, self.authentication.is_some(),
            )?;
            return process_supervisor::run_managed(spec, completion, self.control, combined);
        }
        process_supervisor::run(spec, self.control, combined)
    }
}
