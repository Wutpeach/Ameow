//! Local desktop control. The transport carries requests; the desktop command owner applies them.
pub mod cli;
#[cfg(test)]
#[path = "tests.rs"]
mod integration_tests;
mod transport;

use crate::download::{
    queue::{CommandReply, DownloadCoordinator, JobSnapshot, QueueCommand},
    request::Quality,
    runtime::RuntimeManager,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::{Duration, Instant},
};

pub const PROTOCOL_VERSION: u32 = 1;
const MAX_REQUEST: usize = 16 * 1024;
const MAX_RESPONSE: usize = 4 * 1024 * 1024;
const MAX_CONNECTIONS: usize = 8;
const MAX_MUTATIONS: usize = 1024;
const DEADLINE: Duration = Duration::from_secs(10);

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ControlError {
    pub code: String,
    pub message: String,
}
impl ControlError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}
impl std::fmt::Display for ControlError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for ControlError {}
fn io_error(error: io::Error) -> ControlError {
    let code = match error.kind() {
        io::ErrorKind::NotFound | io::ErrorKind::ConnectionRefused => "E_NOT_RUNNING",
        io::ErrorKind::PermissionDenied => "E_ACCESS_DENIED",
        io::ErrorKind::TimedOut => "E_CONNECTION_TIMEOUT",
        io::ErrorKind::InvalidData | io::ErrorKind::InvalidInput => "E_PROTOCOL",
        _ => "E_DISCONNECTED",
    };
    ControlError::new(code, error.to_string())
}
pub fn nonce() -> Result<String, ControlError> {
    use ring::rand::{SecureRandom, SystemRandom};
    let mut bytes = [0u8; 16];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| ControlError::new("E_IDENTITY", "Cannot generate instance identity"))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
pub fn root(path: Option<PathBuf>) -> Result<PathBuf, ControlError> {
    let path = path
        .map_or_else(RuntimeManager::default_root, Ok)
        .map_err(|e| ControlError::new("E_INSTANCE_ROOT", e))?;
    crate::download::runtime::check_data_location(&path)
        .map_err(|e| ControlError::new("E_INSTANCE_ROOT", e))?;
    std::fs::create_dir_all(&path).map_err(io_error)?;
    path.canonicalize().map_err(io_error)
}
/// Isolation selects the complete data domain, never just a second mutex.
pub fn isolated_root(args: &[String]) -> Result<Option<PathBuf>, ControlError> {
    let Some(at) = args.iter().position(|arg| arg == "--instance-root") else {
        return Ok(None);
    };
    let selected = args.get(at + 1).ok_or_else(|| {
        ControlError::new("E_INSTANCE_ROOT", "--instance-root requires a directory")
    })?;
    let isolated = future_path(Path::new(selected))?;
    for production in [
        RuntimeManager::default_root(),
        crate::app_update::default_install_root(),
    ] {
        let production =
            future_path(&production.map_err(|e| ControlError::new("E_INSTANCE_ROOT", e))?)?;
        if path_contains(&isolated, &production) || path_contains(&production, &isolated) {
            return Err(ControlError::new(
                "E_INSTANCE_ROOT",
                "Isolated data must not overlap production data or installation",
            ));
        }
    }
    for (flag, expected) in [
        ("--runtime-root", isolated.join("runtime")),
        ("--settings-path", isolated.join("settings.json")),
        ("--output", isolated.join("output")),
    ] {
        if let Some(at) = args.iter().position(|arg| arg == flag) {
            let actual = args.get(at + 1).map(PathBuf::from).ok_or_else(|| {
                ControlError::new("E_INSTANCE_ROOT", "Missing isolated data path")
            })?;
            if actual != expected {
                return Err(ControlError::new(
                    "E_INSTANCE_ROOT",
                    format!(
                        "{flag} must be {} for this isolated instance",
                        expected.display()
                    ),
                ));
            }
        }
    }
    root(Some(isolated.clone()))?;
    std::fs::create_dir_all(isolated.join("output")).map_err(io_error)?;
    Ok(Some(isolated))
}
/// Isolated packaged fixtures keep the real Windows Ready gate without a production session.
pub fn launch_session(args: &[String]) -> Result<Option<crate::app_update::session::Session>, String> {
    if args.iter().any(|arg| arg == "--instance-root") {
        if std::env::var_os("AMEOW_LAUNCH_SESSION").is_none() {
            return Ok(None);
        }
        if !cfg!(all(windows, feature = "app-update-fixture", debug_assertions)) {
            return Err("E_INSTANCE_ROOT: isolated instances require a direct development executable".into());
        }
    }
    crate::app_update::session::Session::from_env()
}
fn future_path(path: &Path) -> Result<PathBuf, ControlError> {
    let path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().map_err(io_error)?.join(path)
    };
    let mut current = path.as_path();
    let mut tail = Vec::new();
    while !current.exists() {
        tail.push(
            current
                .file_name()
                .ok_or_else(|| ControlError::new("E_INSTANCE_ROOT", "Invalid data path"))?
                .to_os_string(),
        );
        current = current
            .parent()
            .ok_or_else(|| ControlError::new("E_INSTANCE_ROOT", "Invalid data path"))?;
    }
    let mut resolved = current.canonicalize().map_err(io_error)?;
    for part in tail.into_iter().rev() {
        resolved.push(part);
    }
    Ok(resolved)
}
fn path_contains(path: &Path, parent: &Path) -> bool {
    let mut parts = path.components();
    parent.components().all(|component| {
        let Some(actual) = parts.next() else {
            return false;
        };
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            let a: Vec<_> = actual.as_os_str().encode_wide().collect();
            let b: Vec<_> = component.as_os_str().encode_wide().collect();
            unsafe {
                windows_sys::Win32::Globalization::CompareStringOrdinal(
                    a.as_ptr(),
                    a.len() as i32,
                    b.as_ptr(),
                    b.len() as i32,
                    1,
                ) == windows_sys::Win32::Globalization::CSTR_EQUAL
            }
        }
        #[cfg(target_os = "macos")]
        {
            actual
                .as_os_str()
                .as_encoded_bytes()
                .eq_ignore_ascii_case(component.as_os_str().as_encoded_bytes())
        }
    })
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "command", rename_all = "snake_case", deny_unknown_fields)]
pub enum Command {
    Hello {},
    List {},
    ListPage {
        after: u64,
    },
    Show {
        task_id: String,
    },
    Files {
        task_id: String,
        after: usize,
    },
    Submit {
        url: String,
        quality: Option<Quality>,
        output_dir: Option<PathBuf>,
    },
    Cancel {
        task_id: String,
    },
    Retry {
        task_id: String,
    },
    Settings {},
    Components {},
    Diagnose {
        task_id: Option<String>,
    },
}
impl Command {
    fn mutation(&self) -> bool {
        matches!(
            self,
            Self::Submit { .. } | Self::Cancel { .. } | Self::Retry { .. }
        )
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub protocol_version: u32,
    pub request_id: String,
    pub instance_id: Option<String>,
    pub command: Command,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Response {
    pub protocol_version: u32,
    pub request_id: String,
    pub instance_id: String,
    pub ok: bool,
    pub result: Option<Value>,
    pub error: Option<ControlError>,
}
impl Response {
    fn from_result(request: &Request, instance: &str, result: Result<Value, ControlError>) -> Self {
        let (ok, value, error) = match result {
            Ok(v) => (true, Some(v), None),
            Err(e) => (false, None, Some(e)),
        };
        Self {
            protocol_version: PROTOCOL_VERSION,
            request_id: request.request_id.clone(),
            instance_id: instance.into(),
            ok,
            result: value,
            error,
        }
    }
}
fn transfer(stream: &mut impl Read, bytes: &mut [u8], deadline: Instant) -> io::Result<()> {
    let mut at = 0;
    while at < bytes.len() {
        if Instant::now() >= deadline {
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "Local control read timed out",
            ));
        }
        match stream.read(&mut bytes[at..]) {
            Ok(0) => return Err(io::ErrorKind::UnexpectedEof.into()),
            Ok(n) => at += n,
            Err(e)
                if matches!(
                    e.kind(),
                    io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
                ) =>
            {
                std::thread::sleep(Duration::from_millis(5))
            }
            Err(e) => return Err(e),
        }
    }
    Ok(())
}
fn read_frame(stream: &mut impl Read, limit: usize, deadline: Instant) -> io::Result<Vec<u8>> {
    let mut length = [0; 4];
    transfer(stream, &mut length, deadline)?;
    let length = u32::from_le_bytes(length) as usize;
    if length == 0 || length > limit {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Control frame exceeds size limit",
        ));
    }
    let mut bytes = vec![0; length];
    transfer(stream, &mut bytes, deadline)?;
    Ok(bytes)
}
fn write_frame(
    stream: &mut impl Write,
    bytes: &[u8],
    limit: usize,
    deadline: Instant,
) -> io::Result<()> {
    if bytes.is_empty() || bytes.len() > limit {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Control frame exceeds size limit",
        ));
    }
    let frame = [(bytes.len() as u32).to_le_bytes().as_slice(), bytes].concat();
    let mut at = 0;
    while at < frame.len() {
        if Instant::now() >= deadline {
            return Err(io::ErrorKind::TimedOut.into());
        }
        match stream.write(&frame[at..]) {
            Ok(0) => return Err(io::ErrorKind::WriteZero.into()),
            Ok(n) => at += n,
            Err(e)
                if matches!(
                    e.kind(),
                    io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
                ) =>
            {
                std::thread::sleep(Duration::from_millis(5))
            }
            Err(e) => return Err(e),
        }
    }
    Ok(())
}
pub fn rpc(root: &Path, request: &Request) -> Result<Response, ControlError> {
    let mut stream = transport::connect(root).map_err(io_error)?;
    let deadline = Instant::now() + DEADLINE;
    let bytes =
        serde_json::to_vec(request).map_err(|e| ControlError::new("E_PROTOCOL", e.to_string()))?;
    write_frame(&mut stream, &bytes, MAX_REQUEST, deadline).map_err(io_error)?;
    let bytes = read_frame(&mut stream, MAX_RESPONSE, deadline).map_err(io_error)?;
    let response: Response = serde_json::from_slice(&bytes)
        .map_err(|e| ControlError::new("E_PROTOCOL", e.to_string()))?;
    if response.protocol_version != PROTOCOL_VERSION {
        return Err(ControlError::new(
            "E_PROTOCOL_VERSION",
            "Unsupported desktop control protocol",
        ));
    }
    if response.request_id != request.request_id {
        return Err(ControlError::new(
            "E_PROTOCOL",
            "Response request identity mismatch",
        ));
    }
    if response.ok
        && request
            .instance_id
            .as_ref()
            .is_some_and(|id| id != &response.instance_id)
    {
        return Err(ControlError::new(
            "E_INSTANCE_CHANGED",
            "Desktop instance changed",
        ));
    }
    Ok(response)
}
struct Envelope {
    request: Request,
    response: mpsc::SyncSender<Response>,
}
struct StoppableStream<T> {
    stream: T,
    stop: Arc<AtomicBool>,
}
impl<T: Read> Read for StoppableStream<T> {
    fn read(&mut self, bytes: &mut [u8]) -> io::Result<usize> {
        if self.stop.load(Ordering::Acquire) {
            return Err(io::ErrorKind::ConnectionAborted.into());
        }
        self.stream.read(bytes)
    }
}
impl<T: Write> Write for StoppableStream<T> {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if self.stop.load(Ordering::Acquire) {
            return Err(io::ErrorKind::ConnectionAborted.into());
        }
        self.stream.write(bytes)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.stream.flush()
    }
}
fn serve_connection(
    stream: impl Read + Write,
    identity: &str,
    sender: &mpsc::SyncSender<Envelope>,
    stopping: Arc<AtomicBool>,
) {
    let mut stream = StoppableStream {
        stream,
        stop: stopping.clone(),
    };
    let deadline = Instant::now() + DEADLINE;
    let bytes = match read_frame(&mut stream, MAX_REQUEST, deadline) {
        Ok(bytes) => bytes,
        Err(_) => return,
    };
    let request = match serde_json::from_slice::<Request>(&bytes) {
        Ok(request) => request,
        Err(_) => {
            let response = Response {
                protocol_version: PROTOCOL_VERSION,
                request_id: String::new(),
                instance_id: identity.into(),
                ok: false,
                result: None,
                error: Some(ControlError::new("E_PROTOCOL", "Invalid control request")),
            };
            if let Ok(bytes) = serde_json::to_vec(&response) {
                let _ = write_frame(&mut stream, &bytes, MAX_RESPONSE, deadline);
            }
            return;
        }
    };
    let (reply, result) = mpsc::sync_channel(1);
    let fallback = request.clone();
    let response = match sender.try_send(Envelope {
        request,
        response: reply,
    }) {
        Ok(()) => loop {
            match result.recv_timeout(Duration::from_millis(10)) {
                Ok(response) => break response,
                Err(mpsc::RecvTimeoutError::Timeout)
                    if !stopping.load(Ordering::Acquire) && Instant::now() < deadline =>
                {
                    continue;
                }
                _ => {
                    break Response::from_result(
                        &fallback,
                        identity,
                        Err(ControlError::new(
                            "E_DISCONNECTED",
                            "Desktop command owner did not reply; request may have been accepted",
                        )),
                    );
                }
            }
        },
        Err(_) => Response::from_result(
            &fallback,
            identity,
            Err(ControlError::new(
                "E_BUSY",
                "Desktop command boundary unavailable",
            )),
        ),
    };
    let mut bytes = serde_json::to_vec(&response).unwrap_or_default();
    if bytes.len() > MAX_RESPONSE {
        bytes = serde_json::to_vec(&Response::from_result(
            &fallback,
            identity,
            Err(ControlError::new(
                "E_RESULT_TOO_LARGE",
                "Use show for individual tasks",
            )),
        ))
        .unwrap();
    }
    let _ = write_frame(
        &mut stream,
        &bytes,
        MAX_RESPONSE,
        Instant::now() + Duration::from_secs(2),
    );
}
pub struct Server {
    pub instance_id: String,
    receiver: mpsc::Receiver<Envelope>,
    cache: HashMap<String, (Vec<u8>, Response)>,
    stop: Arc<AtomicBool>,
    worker: Option<std::thread::JoinHandle<()>>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
impl Server {
    pub fn start(root: &Path) -> Result<Self, ControlError> {
        let listener = transport::Listener::bind(root).map_err(io_error)?;
        let instance_id = nonce()?;
        let identity = instance_id.clone();
        let (sender, receiver) = mpsc::sync_channel::<Envelope>(16);
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let worker = std::thread::Builder::new()
            .name("desktop-local-control".into())
            .spawn(move || {
                let mut connections: Vec<std::thread::JoinHandle<()>> =
                    Vec::with_capacity(MAX_CONNECTIONS);
                while !stopping.load(Ordering::Acquire) {
                    let mut index = 0;
                    while index < connections.len() {
                        if connections[index].is_finished() {
                            let _ = connections.swap_remove(index).join();
                        } else {
                            index += 1;
                        }
                    }
                    if connections.len() == MAX_CONNECTIONS {
                        std::thread::sleep(Duration::from_millis(10));
                        continue;
                    }
                    let stream = match listener.accept() {
                        Ok(Some(stream)) => stream,
                        Ok(None) => {
                            std::thread::sleep(Duration::from_millis(10));
                            continue;
                        }
                        Err(_) => break,
                    };
                    let connection_stop = stopping.clone();
                    let identity = identity.clone();
                    let requests = sender.clone();
                    match std::thread::Builder::new()
                        .name("desktop-control-connection".into())
                        .spawn(move || {
                            serve_connection(stream, &identity, &requests, connection_stop);
                        }) {
                        Ok(connection) => connections.push(connection),
                        Err(_) => break,
                    }
                }
                stopping.store(true, Ordering::Release);
                for connection in connections {
                    let _ = connection.join();
                }
            })
            .map_err(io_error)?;
        Ok(Self {
            instance_id,
            receiver,
            cache: HashMap::new(),
            stop,
            worker: Some(worker),
        })
    }
    /// Runs on the very same desktop thread as GUI commands and update arbitration.
    pub fn poll(
        &mut self,
        queue: &DownloadCoordinator,
        commands_allowed: bool,
        startup_pending: bool,
    ) -> Vec<(Option<u64>, CommandReply)> {
        let mut notices = Vec::new();
        for _ in 0..16 {
            let Ok(envelope) = self.receiver.try_recv() else {
                break;
            };
            let (mut response, notice) = self.handle(&envelope.request, queue, commands_allowed);
            if matches!(envelope.request.command, Command::Hello {})
                && let Some(result) = &mut response.result
            {
                result["startup_pending"] = json!(startup_pending);
            }
            let _ = envelope.response.send(response);
            if let Some(notice) = notice {
                notices.push(notice);
            }
        }
        notices
    }
    fn validate(&self, request: &Request) -> Result<(), ControlError> {
        if request.protocol_version != PROTOCOL_VERSION {
            return Err(ControlError::new(
                "E_PROTOCOL_VERSION",
                "Expected protocol version 1",
            ));
        }
        if request.request_id.len() < 8
            || request.request_id.len() > 80
            || !request
                .request_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return Err(ControlError::new(
                "E_INVALID_REQUEST",
                "request_id must be 8..80 ASCII letters, digits, hyphens or underscores",
            ));
        }
        if !matches!(request.command, Command::Hello {})
            && request.instance_id.as_deref() != Some(&self.instance_id)
        {
            return Err(ControlError::new(
                "E_INSTANCE_CHANGED",
                "Request belongs to a different desktop session",
            ));
        }
        Ok(())
    }
    fn handle(
        &mut self,
        request: &Request,
        queue: &DownloadCoordinator,
        allowed: bool,
    ) -> (Response, Option<(Option<u64>, CommandReply)>) {
        if let Err(error) = self.validate(request) {
            return (
                Response::from_result(request, &self.instance_id, Err(error)),
                None,
            );
        }
        let fingerprint = serde_json::to_vec(&request.command).unwrap();
        if let Some((previous, reply)) = self.cache.get(&request.request_id) {
            return if *previous == fingerprint {
                (reply.clone(), None)
            } else {
                (
                    Response::from_result(
                        request,
                        &self.instance_id,
                        Err(ControlError::new(
                            "E_REQUEST_CONFLICT",
                            "request_id already used for a different command",
                        )),
                    ),
                    None,
                )
            };
        }
        if request.command.mutation() && self.cache.len() >= MAX_MUTATIONS {
            return (
                Response::from_result(
                    request,
                    &self.instance_id,
                    Err(ControlError::new(
                        "E_REQUEST_LIMIT",
                        "Session write-request capacity reached; reads remain available",
                    )),
                ),
                None,
            );
        }
        let mut notice = None;
        let result = self.execute(&request.command, queue, allowed, &mut notice);
        let response = Response::from_result(request, &self.instance_id, result);
        if request.command.mutation() {
            self.cache
                .insert(request.request_id.clone(), (fingerprint, response.clone()));
        }
        (response, notice)
    }
    fn job_id(&self, task: &str) -> Result<u64, ControlError> {
        let (instance, id) = task.split_once(':').ok_or_else(|| {
            ControlError::new("E_INVALID_TASK_ID", "Expected instance:job task ID")
        })?;
        if instance != self.instance_id {
            return Err(ControlError::new(
                "E_INSTANCE_CHANGED",
                "Task belongs to a previous desktop session",
            ));
        }
        id.parse::<u64>()
            .ok()
            .filter(|id| *id > 0)
            .ok_or_else(|| ControlError::new("E_INVALID_TASK_ID", "Invalid queue job ID"))
    }
    fn execute(
        &self,
        command: &Command,
        queue: &DownloadCoordinator,
        allowed: bool,
        notice: &mut Option<(Option<u64>, CommandReply)>,
    ) -> Result<Value, ControlError> {
        let snapshot = queue.snapshot();
        let find = |task: &str| -> Result<&JobSnapshot, ControlError> {
            let id = self.job_id(task)?;
            snapshot
                .jobs
                .iter()
                .find(|j| j.job_id == id)
                .ok_or_else(|| {
                    ControlError::new(
                        "E_TASK_NOT_FOUND",
                        "Task is not retained in this desktop session",
                    )
                })
        };
        let apply = |command: QueueCommand| -> Result<CommandReply, ControlError> {
            if !allowed && !matches!(command, QueueCommand::Cancel(_)) {
                return Err(ControlError::new(
                    "E_APP_UPDATE_BUSY",
                    "Application update is starting or draining",
                ));
            }
            match queue.apply(command) {
                CommandReply::Error(error) => Err(ControlError::new("E_REQUEST_REJECTED", error)),
                reply => Ok(reply),
            }
        };
        match command {
            Command::Hello {} => Ok(
                json!({"pid":std::process::id(),"app_version":crate::app_update::BUILD_VERSION,"commands_allowed":allowed,"startup_pending":false}),
            ),
            Command::List {} | Command::ListPage { .. } => {
                let after = match command {
                    Command::ListPage { after } => *after,
                    _ => 0,
                };
                let jobs: Vec<_> = snapshot
                    .jobs
                    .iter()
                    .filter(|j| j.job_id > after)
                    .take(50)
                    .collect();
                let next = jobs
                    .last()
                    .filter(|last| snapshot.jobs.iter().any(|j| j.job_id > last.job_id))
                    .map(|j| j.job_id);
                Ok(
                    json!({"revision":snapshot.revision,"jobs":jobs.iter().map(|j| job_summary(&self.instance_id,j)).collect::<Vec<_>>(),"next_after":next}),
                )
            }
            Command::Show { task_id } => Ok(job_view(&self.instance_id, find(task_id)?)),
            Command::Files { task_id, after } => {
                let job = find(task_id)?;
                Ok(file_page(&self.instance_id, job, *after))
            }
            Command::Settings {} => Ok(json!(snapshot.settings)),
            Command::Components {} => Ok(
                json!({"preparing":snapshot.preparing,"preparation":snapshot.preparation,"held":snapshot.preparation_held,"owner_lost":snapshot.preparation_owner_lost,"verified_versions":snapshot.verified_runtime_versions,"runtime_update":snapshot.runtime_update}),
            ),
            Command::Diagnose { task_id } => {
                let reply = match task_id {
                    Some(task) => queue.apply(QueueCommand::CopyDiagnostic(find(task)?.job_id)),
                    None => queue.apply(QueueCommand::CopyPreparationDiagnostic),
                };
                match reply {
                    CommandReply::Diagnostic(text) => Ok(json!({"text":text})),
                    CommandReply::Error(e) => Err(ControlError::new("E_REQUEST_REJECTED", e)),
                    _ => Err(ControlError::new(
                        "E_REQUEST_REJECTED",
                        "No diagnostic available",
                    )),
                }
            }
            Command::Submit {
                url,
                quality,
                output_dir,
            } => {
                if url.len() > 8192
                    || output_dir
                        .as_ref()
                        .is_some_and(|p| !p.is_absolute() || p.as_os_str().len() > 4096)
                {
                    return Err(ControlError::new(
                        "E_INVALID_REQUEST",
                        "URL or absolute output directory exceeds boundary limits",
                    ));
                }
                let reply = apply(QueueCommand::SubmitWithOptions {
                    url: url.clone(),
                    quality: *quality,
                    output_dir: output_dir.clone(),
                })?;
                let CommandReply::Accepted(id) = reply else {
                    return Err(ControlError::new(
                        "E_REQUEST_REJECTED",
                        "Submission was not accepted",
                    ));
                };
                *notice = Some((None, reply));
                Ok(json!({"task_id":format!("{}:{id}",self.instance_id),"job_id":id}))
            }
            Command::Cancel { task_id } => {
                let id = find(task_id)?.job_id;
                let reply = apply(QueueCommand::Cancel(id))?;
                if !matches!(reply, CommandReply::Applied(true)) {
                    return Err(ControlError::new(
                        "E_REQUEST_REJECTED",
                        "Task cannot be cancelled in its current state",
                    ));
                }
                Ok(json!({"task_id":task_id,"applied":true}))
            }
            Command::Retry { task_id } => {
                let source = find(task_id)?.job_id;
                let reply = apply(QueueCommand::Retry(source))?;
                let CommandReply::Accepted(id) = reply else {
                    return Err(ControlError::new(
                        "E_REQUEST_REJECTED",
                        "Task cannot be retried in its current state",
                    ));
                };
                *notice = Some((Some(source), reply));
                Ok(json!({"task_id":format!("{}:{id}",self.instance_id),"job_id":id}))
            }
        }
    }
}
fn job_view(instance: &str, job: &JobSnapshot) -> Value {
    let mut value = job_summary(instance, job);
    let page = file_page(instance, job, 0);
    value["files"] = page["files"].clone();
    value["next_files_after"] = page["next_files_after"].clone();
    value
}
fn job_summary(instance: &str, job: &JobSnapshot) -> Value {
    json!({"task_id":format!("{instance}:{}",job.job_id),"job_id":job.job_id,"revision":job.revision,"attempt":job.attempt,"phase":job.phase,
        "accepted":job.accepted,"identity":job.identity,"title":job.title,"message":job.message,"failure":job.failure,"engine":job.engine,
        "transfer_progress":job.transfer_progress,"gallery_progress":job.gallery_progress,"cancellation_requested":job.cancellation_requested,"slot_owned":job.slot_owned,"resources_released":job.resources_released,
        "collection":job.collection.as_ref().map(|c|json!({"directory":c.directory,"total":c.total,"saved_files":c.files.len()}))})
}
fn file_page(instance: &str, job: &JobSnapshot, after: usize) -> Value {
    let single = job
        .delivered
        .iter()
        .map(|f| json!({"path":f.path,"bytes":f.bytes,"sha256":f.sha256}));
    let collection = job.collection.iter().flat_map(|c| c.files.iter()).map(
        |f| json!({"path":f.delivered.path,"bytes":f.delivered.bytes,"sha256":f.delivered.sha256}),
    );
    let total = job.delivered.iter().count() + job.collection.as_ref().map_or(0, |c| c.files.len());
    let files: Vec<_> = single.chain(collection).skip(after).take(100).collect();
    let next = after.checked_add(files.len()).filter(|n| *n < total);
    json!({"task_id":format!("{instance}:{}",job.job_id),"revision":job.revision,"files":files,"next_files_after":next})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn frame_limits_and_truncation_are_rejected() {
        let mut oversized = std::io::Cursor::new((MAX_REQUEST as u32 + 1).to_le_bytes());
        assert_eq!(
            read_frame(&mut oversized, MAX_REQUEST, Instant::now() + DEADLINE)
                .unwrap_err()
                .kind(),
            io::ErrorKind::InvalidData
        );
        let mut truncated = std::io::Cursor::new(vec![8, 0, 0, 0, 1]);
        assert!(read_frame(&mut truncated, MAX_REQUEST, Instant::now() + DEADLINE).is_err());
    }
    #[test]
    fn protocol_rejects_unknown_commands_and_fields() {
        assert!(serde_json::from_value::<Command>(json!({"command":"stop"})).is_err());
        assert!(
            serde_json::from_value::<Command>(json!({"command":"settings","write":true})).is_err()
        );
    }
}
