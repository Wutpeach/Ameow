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
    pub(crate) workspace: &'a Path,
    pub(crate) lease: &'a RuntimeLease,
    pub(crate) requirements: &'a TrustedRuntimeRequirements,
    pub(crate) control: &'a Control,
    pub(crate) observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>,
    pub(crate) admission: IdentityAdmission,
    pub(crate) events: EventSink,
}
impl ExecutionContext<'_> {
    pub fn workspace(&self) -> &Path {
        self.workspace
    }
    pub fn cancelled(&self) -> bool {
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
        let observer = self.observer.clone();
        let combined = Arc::new(move |event: ProcessObservation| {
            if let Some(output) = &output {
                output(event.clone());
            }
            if !matches!(event, ProcessObservation::Output { .. }) {
                observer(event);
            }
        });
        process_supervisor::run(
            ProcessSpec {
                executable: self.tool(command.tool)?,
                args: command.args,
                cwd: self.workspace.into(),
                env: self.requirements.environment(self.workspace)?,
                stdout_limit: command.stdout_limit,
                stderr_limit: command.stderr_limit,
                timeout: command.timeout,
            },
            self.control,
            combined,
        )
    }
}
