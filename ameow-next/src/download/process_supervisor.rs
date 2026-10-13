//! Windows process-tree ownership. Call run only from a dedicated background worker.
//! Output observations are best effort; capture/draining and cleanup never depend on them.
use std::{
    collections::BTreeMap,
    mem::{size_of, size_of_val},
    os::windows::ffi::OsStrExt,
    path::PathBuf,
    ptr,
    sync::{
        Arc, Mutex, MutexGuard,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, Receiver, SyncSender, TrySendError},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use windows_sys::Win32::{
    Foundation::*,
    Security::SECURITY_ATTRIBUTES,
    Storage::FileSystem::ReadFile,
    System::{JobObjects::*, Pipes::CreatePipe, Threading::*},
};

pub const MAX_STDOUT_CAPTURE: usize = 16 * 1024 * 1024;
const STDOUT_CAP: usize = MAX_STDOUT_CAPTURE;
const STDERR_CAP: usize = 1024 * 1024;
type Callback = Arc<dyn Fn(ProcessObservation) + Send + Sync>;

#[derive(Clone, Debug)]
pub struct ProcessSpec {
    pub executable: PathBuf,
    pub args: Vec<String>,
    pub cwd: PathBuf,
    pub env: Vec<(String, String)>,
    pub stdout_limit: usize,
    pub stderr_limit: usize,
    pub timeout: Option<Duration>,
}

#[derive(Clone, Default)]
pub struct Control {
    cancelled: Arc<AtomicBool>,
    retry_epoch: Arc<AtomicU64>,
}
impl Control {
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
    }
    pub fn retry_cleanup(&self) {
        self.retry_epoch.fetch_add(1, Ordering::AcqRel);
    }
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }
    pub fn cancellation_flag(&self) -> &AtomicBool {
        &self.cancelled
    }
    pub fn cleanup_revision(&self) -> u64 {
        self.retry_epoch.load(Ordering::Acquire)
    }
}

#[derive(Clone, Debug, Default)]
pub struct SettlementFacts {
    pub root_waited: bool,
    pub job_active_zero: bool,
    pub stdout_reader_joined: bool,
    pub stderr_reader_joined: bool,
    pub callback_consumer_joined: bool,
    pub root_pid: Option<u32>,
    pub total_processes: u32,
    pub root_first_observed: bool,
    pub stdout_bytes: u64,
    pub stderr_bytes: u64,
    pub stdout_truncated: bool,
    pub stderr_truncated: bool,
    pub membership_verified_before_resume: bool,
}
impl SettlementFacts {
    pub fn resources_releasable(&self) -> bool {
        self.root_waited
            && self.job_active_zero
            && self.stdout_reader_joined
            && self.stderr_reader_joined
            && self.callback_consumer_joined
    }
}

#[derive(Clone, Debug)]
pub enum ProcessObservation {
    Held(String),
    Output { stderr: bool, sequence: u64, text: String },
    Running { pid: u32 },
    Settled(SettlementFacts),
}

#[derive(Debug)]
pub struct ProcessOutcome {
    pub exit_code: u32,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub facts: SettlementFacts,
}

fn lock<T>(value: &Mutex<T>) -> MutexGuard<'_, T> {
    value
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
fn os_error(operation: &str) -> String {
    format!("{operation}: Win32 {}", unsafe { GetLastError() })
}

// Move owned handles, never control a process by a reused numeric PID.
struct Handle(usize);
impl Handle {
    fn new(raw: HANDLE, operation: &str) -> Result<Self, String> {
        if raw.is_null() || raw == INVALID_HANDLE_VALUE {
            Err(os_error(operation))
        } else {
            Ok(Self(raw as usize))
        }
    }
    fn raw(&self) -> HANDLE {
        self.0 as HANDLE
    }
}
impl Drop for Handle {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.raw()) };
    }
}

struct Attributes {
    storage: Vec<usize>,
    initialized: bool,
}
impl Attributes {
    fn new(handles: &[HANDLE], jobs: &[HANDLE]) -> Result<Self, String> {
        let mut bytes = 0;
        unsafe { InitializeProcThreadAttributeList(ptr::null_mut(), 2, 0, &mut bytes) };
        if bytes == 0 {
            return Err(os_error("attribute sizing"));
        }
        let mut list = Self {
            storage: vec![0; bytes.div_ceil(size_of::<usize>())],
            initialized: false,
        };
        if unsafe { InitializeProcThreadAttributeList(list.raw(), 2, 0, &mut bytes) } == 0 {
            return Err(os_error("attribute initialization"));
        }
        list.initialized = true;
        for (attribute, backing, bytes) in [
            (
                PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
                handles.as_ptr(),
                size_of_val(handles),
            ),
            (
                PROC_THREAD_ATTRIBUTE_JOB_LIST,
                jobs.as_ptr(),
                size_of_val(jobs),
            ),
        ] {
            if unsafe {
                UpdateProcThreadAttribute(
                    list.raw(),
                    0,
                    attribute as usize,
                    backing.cast(),
                    bytes,
                    ptr::null_mut(),
                    ptr::null(),
                )
            } == 0
            {
                return Err(os_error("creation-time Job/strict handle attributes"));
            }
        }
        Ok(list)
    }
    fn raw(&mut self) -> LPPROC_THREAD_ATTRIBUTE_LIST {
        self.storage.as_mut_ptr().cast()
    }
}
impl Drop for Attributes {
    fn drop(&mut self) {
        if self.initialized {
            unsafe { DeleteProcThreadAttributeList(self.raw()) };
        }
    }
}

fn pipe() -> Result<(Handle, Handle), String> {
    let attributes = SECURITY_ATTRIBUTES {
        nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: ptr::null_mut(),
        bInheritHandle: 1,
    };
    let (mut read, mut write) = (ptr::null_mut(), ptr::null_mut());
    if unsafe { CreatePipe(&mut read, &mut write, &attributes, 0) } == 0 {
        return Err(os_error("CreatePipe"));
    }
    Ok((Handle(read as usize), Handle(write as usize)))
}

// The Windows CRT quoting convention, applied to UTF-16 so paths remain lossless.
fn quote(value: &[u16], output: &mut Vec<u16>) {
    output.push(b'"' as u16);
    let mut slashes = 0;
    for &unit in value {
        if unit == b'\\' as u16 {
            slashes += 1;
        } else {
            let count = if unit == b'"' as u16 {
                slashes * 2 + 1
            } else {
                slashes
            };
            output.extend(std::iter::repeat_n(b'\\' as u16, count));
            output.push(unit);
            slashes = 0;
        }
    }
    output.extend(std::iter::repeat_n(b'\\' as u16, slashes * 2));
    output.push(b'"' as u16);
}

#[derive(Clone)]
struct LaunchInput {
    application: Vec<u16>,
    command: Vec<u16>,
    cwd: Vec<u16>,
    environment: Vec<u16>,
}
impl LaunchInput {
    fn new(spec: &ProcessSpec) -> Result<Self, String> {
        if !spec.executable.is_absolute() || !spec.cwd.is_absolute() {
            return Err("process executable and working directory must be absolute".into());
        }
        let mut application: Vec<u16> = spec.executable.as_os_str().encode_wide().collect();
        let mut cwd: Vec<u16> = spec.cwd.as_os_str().encode_wide().collect();
        if application.contains(&0)
            || cwd.contains(&0)
            || spec.args.iter().any(|s| s.contains('\0'))
        {
            return Err("process path/argument contains NUL".into());
        }
        let mut command = Vec::new();
        quote(&application, &mut command);
        for arg in &spec.args {
            command.push(b' ' as u16);
            quote(&arg.encode_utf16().collect::<Vec<_>>(), &mut command);
        }
        command.push(0);
        if command.len() > 32767 {
            return Err("process command exceeds Windows length limit".into());
        }
        application.push(0);
        cwd.push(0);
        let mut ordered = BTreeMap::new();
        for (key, value) in &spec.env {
            if key.is_empty() || key.contains(['=', '\0']) || value.contains('\0') {
                return Err("invalid explicit process environment".into());
            }
            if ordered.insert(key.to_uppercase(), (key, value)).is_some() {
                return Err("duplicate case-insensitive process environment key".into());
            }
        }
        let mut environment = Vec::new();
        for (key, value) in ordered.values() {
            environment.extend(key.encode_utf16());
            environment.push(b'=' as u16);
            environment.extend(value.encode_utf16());
            environment.push(0);
        }
        if environment.is_empty() {
            environment.push(0);
        }
        environment.push(0);
        Ok(Self {
            application,
            command,
            cwd,
            environment,
        })
    }
}

#[derive(Default)]
struct Capture {
    bytes: Vec<u8>,
    drained: u64,
}
#[derive(Default)]
struct ConsumerState {
    status: Mutex<Option<ProcessObservation>>,
    failure: Mutex<Option<String>>,
}

struct Owner {
    job: Option<Handle>,
    process: Option<Handle>,
    primary: Option<Handle>,
    stdout_pipe: Option<Handle>,
    stderr_pipe: Option<Handle>,
    stdout_reader: Option<JoinHandle<Result<(), String>>>,
    stderr_reader: Option<JoinHandle<Result<(), String>>>,
    consumer: Option<JoinHandle<()>>,
    output_sender: Option<SyncSender<ProcessObservation>>,
    consumer_state: Arc<ConsumerState>,
    callback: Callback,
    stdout: Arc<Mutex<Capture>>,
    stderr: Arc<Mutex<Capture>>,
    facts: SettlementFacts,
    exit_code: u32,
    initialized: bool,
    failure: Option<String>,
    consumer_failure_seen: bool,
    held: bool,
    cleanup: bool,
    terminate_sent: bool,
    retry_seen: u64,
    began: Instant,
    #[cfg(test)]
    hooks: TestHooks,
}
impl Owner {
    fn new(callback: Callback, #[cfg(test)] hooks: TestHooks) -> Self {
        Self {
            job: None,
            process: None,
            primary: None,
            stdout_pipe: None,
            stderr_pipe: None,
            stdout_reader: None,
            stderr_reader: None,
            consumer: None,
            output_sender: None,
            consumer_state: Arc::new(ConsumerState::default()),
            callback,
            stdout: Arc::new(Mutex::new(Capture::default())),
            stderr: Arc::new(Mutex::new(Capture::default())),
            facts: SettlementFacts::default(),
            exit_code: 0,
            initialized: false,
            failure: None,
            consumer_failure_seen: false,
            held: false,
            cleanup: false,
            terminate_sent: false,
            retry_seen: 0,
            began: Instant::now(),
            #[cfg(test)]
            hooks,
        }
    }
    fn report_held(&mut self, reason: String, await_retry: bool) {
        match &mut self.failure {
            Some(failure) if !failure.contains(&reason) && failure.len() < 8192 => {
                failure.push_str("; ");
                failure.push_str(&reason);
            }
            None => self.failure = Some(reason.clone()),
            _ => {}
        }
        self.held |= await_retry;
        self.cleanup = true;
        *lock(&self.consumer_state.status) = Some(ProcessObservation::Held(reason));
    }
    fn initialize(
        &mut self,
        input: &mut LaunchInput,
        spec: &ProcessSpec,
        control: &Control,
    ) -> Result<(), String> {
        self.initialized = true;
        let (sender, receiver) = mpsc::sync_channel(32);
        let callback = self.callback.clone();
        let state = self.consumer_state.clone();
        self.consumer = Some(
            thread::Builder::new()
                .name("download-observations".into())
                .spawn(move || consume(receiver, state, callback))
                .map_err(|e| format!("callback consumer creation: {e}"))?,
        );
        self.output_sender = Some(sender);
        self.job = Some(Handle::new(
            unsafe { CreateJobObjectW(ptr::null(), ptr::null()) },
            "CreateJobObjectW",
        )?);
        let job = self.job.as_ref().ok_or("missing Job")?;
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if unsafe {
            SetInformationJobObject(
                job.raw(),
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                size_of_val(&limits) as u32,
            )
        } == 0
        {
            return Err(os_error("Job kill-on-close configuration"));
        }
        let (stdout_read, stdout_write) = pipe()?;
        self.stdout_pipe = Some(stdout_read);
        let (stderr_read, stderr_write) = pipe()?;
        self.stderr_pipe = Some(stderr_read);
        let (stdin_read, stdin_write) = pipe()?;
        for handle in [
            self.stdout_pipe.as_ref(),
            self.stderr_pipe.as_ref(),
            Some(&stdin_write),
        ]
        .into_iter()
        .flatten()
        {
            if unsafe { SetHandleInformation(handle.raw(), HANDLE_FLAG_INHERIT, 0) } == 0 {
                return Err(os_error("parent pipe inheritance"));
            }
        }
        let handles = [stdin_read.raw(), stdout_write.raw(), stderr_write.raw()];
        let jobs = [job.raw()];
        // Both arrays, all handles and aligned backing live through attribute deletion.
        let mut attributes = Attributes::new(&handles, &jobs)?;
        let startup = STARTUPINFOEXW {
            StartupInfo: STARTUPINFOW {
                cb: size_of::<STARTUPINFOEXW>() as u32,
                dwFlags: STARTF_USESTDHANDLES,
                hStdInput: stdin_read.raw(),
                hStdOutput: stdout_write.raw(),
                hStdError: stderr_write.raw(),
                ..Default::default()
            },
            lpAttributeList: attributes.raw(),
        };
        let mut info = PROCESS_INFORMATION::default();
        if unsafe {
            CreateProcessW(
                input.application.as_ptr(),
                input.command.as_mut_ptr(),
                ptr::null(),
                ptr::null(),
                1,
                CREATE_SUSPENDED
                    | CREATE_NO_WINDOW
                    | EXTENDED_STARTUPINFO_PRESENT
                    | CREATE_UNICODE_ENVIRONMENT,
                input.environment.as_ptr().cast(),
                input.cwd.as_ptr(),
                &startup.StartupInfo,
                &mut info,
            )
        } == 0
        {
            return Err(os_error("creation-time Job CreateProcessW"));
        }
        // Infallible transfer immediately after kernel creation, before any other operation.
        self.process = Some(Handle(info.hProcess as usize));
        self.primary = Some(Handle(info.hThread as usize));
        self.facts.root_pid = Some(info.dwProcessId);
        drop(attributes);
        drop(stdout_write);
        drop(stderr_write);
        drop(stdin_read);
        drop(stdin_write);
        let mut member = 0;
        if unsafe { IsProcessInJob(info.hProcess, job.raw(), &mut member) } == 0 || member == 0 {
            return Err(os_error("pre-resume Job membership"));
        }
        self.facts.membership_verified_before_resume = true;
        #[cfg(test)]
        {
            self.hooks.before_resume.store(true, Ordering::Release);
            while self.hooks.pause_before_resume.load(Ordering::Acquire) {
                thread::sleep(Duration::from_millis(2));
            }
        }
        let sender = self
            .output_sender
            .as_ref()
            .ok_or("missing output channel")?;
        if let Some(pipe) = self.stdout_pipe.take() {
            self.stdout_reader = Some(spawn_reader(
                pipe,
                self.stdout.clone(),
                spec.stdout_limit.min(STDOUT_CAP),
                sender.clone(),
                false,
                #[cfg(test)]
                self.hooks.reader_panic.clone(),
            )?);
        }
        if let Some(pipe) = self.stderr_pipe.take() {
            self.stderr_reader = Some(spawn_reader(
                pipe,
                self.stderr.clone(),
                spec.stderr_limit.min(STDERR_CAP),
                sender.clone(),
                true,
                #[cfg(test)]
                Arc::new(AtomicBool::new(false)),
            )?);
        }
        if control.is_cancelled() {
            self.cleanup = true;
            return Ok(());
        }
        if unsafe { ResumeThread(info.hThread) } == u32::MAX {
            return Err(os_error("ResumeThread"));
        }
        self.primary.take();
        *lock(&self.consumer_state.status) = Some(ProcessObservation::Running {
            pid: info.dwProcessId,
        });
        Ok(())
    }

    fn terminate(&mut self) -> Result<(), String> {
        #[cfg(test)]
        if self.hooks.terminate_failure.load(Ordering::Acquire) {
            return Err("test-only persistent TerminateJobObject failure".into());
        }
        if let Some(job) = &self.job
            && unsafe { TerminateJobObject(job.raw(), 1223) } == 0
        {
            return Err(os_error("TerminateJobObject"));
        }
        self.terminate_sent = true;
        Ok(())
    }
    fn observe(&mut self) -> Result<(), String> {
        self.facts.root_waited = match &self.process {
            None => true,
            Some(process) => match unsafe { WaitForSingleObject(process.raw(), 0) } {
                WAIT_OBJECT_0 => {
                    if unsafe { GetExitCodeProcess(process.raw(), &mut self.exit_code) } == 0 {
                        return Err(os_error("root exit code"));
                    }
                    true
                }
                WAIT_TIMEOUT => false,
                _ => return Err(os_error("root WaitForSingleObject")),
            },
        };
        #[cfg(test)]
        if self.hooks.query_failure.load(Ordering::Acquire) {
            return Err("test-only persistent Job accounting query failure".into());
        }
        if let Some(job) = &self.job {
            let mut accounting = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
            if unsafe {
                QueryInformationJobObject(
                    job.raw(),
                    JobObjectBasicAccountingInformation,
                    (&mut accounting as *mut JOBOBJECT_BASIC_ACCOUNTING_INFORMATION).cast(),
                    size_of_val(&accounting) as u32,
                    ptr::null_mut(),
                )
            } == 0
            {
                return Err(os_error("Job accounting query"));
            }
            self.facts.job_active_zero = accounting.ActiveProcesses == 0;
            self.facts.total_processes = accounting.TotalProcesses;
            self.facts.root_first_observed |=
                self.process.is_some() && self.facts.root_waited && accounting.ActiveProcesses > 0;
        } else {
            self.facts.job_active_zero = true;
        }
        Ok(())
    }
    fn join_reader(
        reader: &mut Option<JoinHandle<Result<(), String>>>,
        joined: &mut bool,
    ) -> Result<bool, String> {
        if reader.as_ref().is_some_and(|thread| !thread.is_finished()) {
            return Ok(false);
        }
        if let Some(reader) = reader.take() {
            let result = reader.join();
            *joined = true; // A panic is a known completed join, never a successful reader.
            match result {
                Ok(result) => result?,
                Err(_) => return Err("actual pipe reader panic, joined".into()),
            }
        } else {
            *joined = true;
        }
        Ok(true)
    }
    fn step(
        &mut self,
        spec: &ProcessSpec,
        control: &Control,
    ) -> Result<Option<Result<ProcessOutcome, String>>, String> {
        let epoch = control.retry_epoch.load(Ordering::Acquire);
        if epoch != self.retry_seen {
            self.retry_seen = epoch;
            self.held = false;
            self.cleanup = true;
            self.terminate_sent = false;
        }
        if self.held {
            return Ok(None);
        }
        #[cfg(test)]
        if self.hooks.owner_panic.swap(false, Ordering::AcqRel) {
            panic!("test-only owner operation panic");
        }
        if control.is_cancelled() {
            self.cleanup = true;
        }
        if spec
            .timeout
            .is_some_and(|limit| self.began.elapsed() >= limit)
            && !self.cleanup
        {
            self.report_held(
                "process timeout requested termination; awaiting actual cleanup".into(),
                false,
            );
        }
        let callback_failure = lock(&self.consumer_state.failure).clone();
        if !self.consumer_failure_seen
            && let Some(reason) = callback_failure
        {
            self.consumer_failure_seen = true;
            self.report_held(reason, false);
        }
        for (reader, joined) in [
            (
                &mut self.stdout_reader,
                &mut self.facts.stdout_reader_joined,
            ),
            (
                &mut self.stderr_reader,
                &mut self.facts.stderr_reader_joined,
            ),
        ] {
            // Join a failed reader promptly, then terminate writers. Other readers still drain.
            if reader.as_ref().is_some_and(JoinHandle::is_finished)
                && let Err(error) = Self::join_reader(reader, joined)
            {
                self.failure.get_or_insert(error);
                self.cleanup = true;
            }
        }
        if self.cleanup && !self.terminate_sent {
            self.terminate()?;
        }
        self.observe()?;
        if !self.facts.root_waited || !self.facts.job_active_zero {
            return Ok(None);
        }
        // Failed reader creation can leave a parent read handle; only close after tree-zero.
        self.stdout_pipe.take();
        self.stderr_pipe.take();
        let stdout_done = Self::join_reader(
            &mut self.stdout_reader,
            &mut self.facts.stdout_reader_joined,
        );
        let stderr_done = Self::join_reader(
            &mut self.stderr_reader,
            &mut self.facts.stderr_reader_joined,
        );
        for error in [stdout_done.as_ref().err(), stderr_done.as_ref().err()]
            .into_iter()
            .flatten()
        {
            self.failure.get_or_insert_with(|| error.to_string());
        }
        if !self.facts.stdout_reader_joined || !self.facts.stderr_reader_joined {
            return Ok(None);
        }
        self.output_sender.take();
        if self
            .consumer
            .as_ref()
            .is_some_and(|thread| !thread.is_finished())
        {
            return Ok(None);
        }
        if let Some(consumer) = self.consumer.take()
            && consumer.join().is_err()
        {
            self.failure
                .get_or_insert("actual callback consumer thread panic, joined".into());
        }
        self.facts.callback_consumer_joined = true;
        if let Some(error) = lock(&self.consumer_state.failure).clone() {
            self.failure.get_or_insert(error);
        }
        let mut stdout = lock(&self.stdout);
        let mut stderr = lock(&self.stderr);
        self.facts.stdout_bytes = stdout.drained;
        self.facts.stderr_bytes = stderr.drained;
        self.facts.stdout_truncated = stdout.drained > stdout.bytes.len() as u64;
        self.facts.stderr_truncated = stderr.drained > stderr.bytes.len() as u64;
        if !self.facts.resources_releasable() {
            return Err("internal settlement barrier incomplete".into());
        }
        let facts = self.facts.clone();
        let notification = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            (self.callback)(ProcessObservation::Settled(facts.clone()))
        }));
        if notification.is_err() {
            self.failure
                .get_or_insert("settlement callback panic after all joins".into());
        }
        if let Some(reason) = self.failure.take() {
            return Ok(Some(Err(format!("{reason}; resources settled: {facts:?}"))));
        }
        Ok(Some(Ok(ProcessOutcome {
            exit_code: self.exit_code,
            stdout: std::mem::take(&mut stdout.bytes),
            stderr: std::mem::take(&mut stderr.bytes),
            facts,
        })))
    }
}

fn consume(receiver: Receiver<ProcessObservation>, state: Arc<ConsumerState>, callback: Callback) {
    let mut output_failed = false;
    loop {
        let pending = lock(&state.status).take();
        if let Some(event) = pending
            && std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| callback(event))).is_err()
        {
            *lock(&state.failure) = Some("actual observation callback panic".into());
            output_failed = true;
        }
        match receiver.recv_timeout(Duration::from_millis(10)) {
            Ok(event) if !output_failed => {
                if std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| callback(event)))
                    .is_err()
                {
                    *lock(&state.failure) =
                        Some("actual output callback panic; pipe draining continues".into());
                    output_failed = true;
                }
            }
            Ok(_) | Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                // Deliver the last priority status even when there were no output chunks.
                let pending = lock(&state.status).take();
                if let Some(event) = pending
                    && std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| callback(event)))
                        .is_err()
                {
                    *lock(&state.failure) = Some("actual final observation callback panic".into());
                }
                break;
            }
        }
    }
}

fn spawn_reader(
    pipe: Handle,
    capture: Arc<Mutex<Capture>>,
    limit: usize,
    sender: SyncSender<ProcessObservation>,
    stderr: bool,
    #[cfg(test)] panic_hook: Arc<AtomicBool>,
) -> Result<JoinHandle<Result<(), String>>, String> {
    thread::Builder::new()
        .name(
            if stderr {
                "download-stderr"
            } else {
                "download-stdout"
            }
            .into(),
        )
        .spawn(move || {
            let mut sequence = 0_u64;
            loop {
                let mut bytes = [0; 8192];
                let mut count = 0;
                if unsafe {
                    ReadFile(
                        pipe.raw(),
                        bytes.as_mut_ptr(),
                        bytes.len() as u32,
                        &mut count,
                        ptr::null_mut(),
                    )
                } == 0
                {
                    let error = unsafe { GetLastError() };
                    if error == ERROR_BROKEN_PIPE {
                        return Ok(());
                    }
                    return Err(format!(
                        "{} ReadFile: Win32 {error}",
                        if stderr { "stderr" } else { "stdout" }
                    ));
                }
                if count == 0 {
                    return Ok(());
                }
                #[cfg(test)]
                if panic_hook.swap(false, Ordering::AcqRel) {
                    panic!("test-only pipe reader panic");
                }
                let bytes = &bytes[..count as usize];
                {
                    let mut capture = lock(&capture);
                    capture.drained += bytes.len() as u64;
                    let available = limit.saturating_sub(capture.bytes.len()).min(bytes.len());
                    capture.bytes.extend_from_slice(&bytes[..available]);
                }
                // A full/failed consumer cannot block either native pipe reader.
                sequence = sequence.saturating_add(1);
                match sender.try_send(ProcessObservation::Output {
                    stderr,
                    sequence,
                    text: String::from_utf8_lossy(bytes).into_owned(),
                }) {
                    Ok(()) | Err(TrySendError::Full(_)) | Err(TrySendError::Disconnected(_)) => {}
                }
            }
        })
        .map_err(|error| format!("pipe reader creation: {error}"))
}

fn drive(
    owner: Arc<Mutex<Owner>>,
    mut input: LaunchInput,
    spec: ProcessSpec,
    control: Control,
) -> Result<ProcessOutcome, String> {
    {
        // Owner lives outside the unwind boundary and remains retained by run as well.
        let mut owner = lock(&owner);
        if !owner.initialized {
            let startup = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                owner.initialize(&mut input, &spec, &control)
            }));
            match startup {
                Ok(Ok(())) => {}
                Ok(Err(error)) => owner.report_held(error, false),
                Err(_) => owner.report_held(
                    "owner launch operation panic; retained resources".into(),
                    true,
                ),
            }
        }
    }
    #[cfg(test)]
    if lock(&owner)
        .hooks
        .owner_thread_panic
        .swap(false, Ordering::AcqRel)
    {
        panic!("test-only outer owner thread panic after launch");
    }
    loop {
        {
            let mut owner = lock(&owner);
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                owner.step(&spec, &control)
            }));
            match result {
                Ok(Ok(Some(result))) => return result,
                Ok(Ok(None)) => {}
                Ok(Err(error)) => owner.report_held(error, true),
                Err(_) => owner.report_held(
                    "owner operation panic; retained resources, explicit cleanup retry required"
                        .into(),
                    true,
                ),
            }
        }
        thread::sleep(Duration::from_millis(5));
    }
}

/// Synchronous background-worker API. Never call or join this from GPUI foreground.
/// Every post-creation return proves all settlement barriers, including error returns.
/// Unknown control/query state retains ownership indefinitely until explicit recovery.
pub fn run(
    spec: ProcessSpec,
    control: &Control,
    callback: Callback,
) -> Result<ProcessOutcome, String> {
    run_internal(
        spec,
        control,
        callback,
        #[cfg(test)]
        TestHooks::default(),
    )
}
fn run_internal(
    spec: ProcessSpec,
    control: &Control,
    callback: Callback,
    #[cfg(test)] hooks: TestHooks,
) -> Result<ProcessOutcome, String> {
    // Invalid caller input cannot create a Job or child.
    let input = LaunchInput::new(&spec)?;
    let owner = Arc::new(Mutex::new(Owner::new(
        callback,
        #[cfg(test)]
        hooks,
    )));
    loop {
        let input = input.clone();
        let worker_owner = owner.clone();
        let worker_control = control.clone();
        let worker_spec = spec.clone();
        match thread::Builder::new()
            .name("download-process-owner".into())
            .spawn(move || drive(worker_owner, input, worker_spec, worker_control))
        {
            Ok(worker) => match worker.join() {
                Ok(result) => return result,
                Err(_) => lock(&owner).report_held(
                    "unexpected owner thread panic; outer owner retained".into(),
                    true,
                ),
            },
            Err(error) => {
                let mut owner = lock(&owner);
                if !owner.initialized {
                    return Err(format!("process owner thread creation: {error}"));
                }
                owner.report_held(format!("cleanup owner thread creation: {error}"), true);
            }
        }
        // A worker failure never permits release. A new owner driver uses the same handles.
        let epoch = lock(&owner).retry_seen;
        while control.retry_epoch.load(Ordering::Acquire) == epoch {
            thread::sleep(Duration::from_millis(10));
        }
    }
}

#[cfg(test)]
#[derive(Clone, Default)]
struct TestHooks {
    before_resume: Arc<AtomicBool>,
    pause_before_resume: Arc<AtomicBool>,
    query_failure: Arc<AtomicBool>,
    terminate_failure: Arc<AtomicBool>,
    owner_panic: Arc<AtomicBool>,
    owner_thread_panic: Arc<AtomicBool>,
    reader_panic: Arc<AtomicBool>,
}

/// Allows the coordinator's unit test to verify its genuine lease/workspace retention
/// across a real native Held process. Absent from every production/integration build.
#[cfg(test)]
#[allow(dead_code)]
pub(crate) fn run_with_test_query_failure(
    spec: ProcessSpec,
    control: &Control,
    callback: Callback,
    query_failure: Arc<AtomicBool>,
) -> Result<ProcessOutcome, String> {
    run_internal(
        spec,
        control,
        callback,
        TestHooks {
            query_failure,
            ..TestHooks::default()
        },
    )
}

#[cfg(test)]
#[path = "../../tests/support/windows_process_faults.rs"]
mod fault_tests;
#[cfg(test)]
#[path = "../../tests/support/windows_process_fixture.rs"]
mod capture_fixture;
#[cfg(test)]
mod capture_regressions {
    use super::capture_fixture as fixture;
    use super::*;
    #[test]
    fn transfer_progress_stdout_overflow_is_optional_after_actual_settlement() {
        let root = fixture::case("r7-optional-transfer-output");
        let outcome = run(
            ProcessSpec {
                executable: fixture::fixture(),
                args: vec![
                    "flood".into(),
                    root.join("markers.txt").to_string_lossy().into(),
                ],
                cwd: root,
                env: vec![("PATH".into(), String::new())],
                stdout_limit: 1024,
                stderr_limit: 1024,
                timeout: Some(Duration::from_secs(15)),
            },
            &Control::default(),
            Arc::new(|_| {}),
        )
        .unwrap();
        assert!(outcome.facts.stdout_truncated);
        assert_eq!(outcome.facts.stdout_bytes, 7 * 1024 * 1024);
        assert!(outcome.facts.resources_releasable());
        super::super::validate_engine_outcome(&outcome, "transfer")
            .expect("optional progress capture cannot fail a settled transfer");
        assert!(super::super::parse_final_record(b"AMEOW_FINAL=\"media.mkv\"\n").is_ok());
        assert!(super::super::parse_final_record(b"").is_err());
    }
    #[test]
    fn requested_bounded_eight_mib_capture_accepts_seven_mib_and_still_drains_overflow() {
        let root = fixture::case("r7-finite-capture");
        let spec = ProcessSpec {
            executable: fixture::fixture(),
            args: vec![
                "flood".into(),
                root.join("markers.txt").to_string_lossy().into(),
            ],
            cwd: root.clone(),
            env: vec![("PATH".into(), String::new())],
            stdout_limit: 8 * 1024 * 1024,
            stderr_limit: 1024,
            timeout: Some(Duration::from_secs(15)),
        };
        let outcome = run(spec.clone(), &Control::default(), Arc::new(|_| {})).unwrap();
        fixture::write_record(
            &root,
            "eight-mib-facts.txt",
            format!("{:#?}", outcome.facts),
        );
        assert_eq!(outcome.exit_code, 0);
        assert!(outcome.facts.resources_releasable());
        assert_eq!(outcome.stdout.len(), 7 * 1024 * 1024);
        assert!(!outcome.facts.stdout_truncated);
        let mut bounded = spec;
        bounded.stdout_limit = 1024;
        let outcome = run(bounded, &Control::default(), Arc::new(|_| {})).unwrap();
        assert_eq!(outcome.stdout.len(), 1024);
        assert!(outcome.facts.stdout_truncated);
        assert_eq!(outcome.facts.stdout_bytes, 7 * 1024 * 1024);
        assert!(outcome.facts.resources_releasable());
    }
}
