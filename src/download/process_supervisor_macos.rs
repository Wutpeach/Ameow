use super::adapters::yt_dlp::settlement_macos::ManagedCompletion;
use std::{
    collections::BTreeSet,
    ffi::{CString, c_char, c_int, c_short, c_void},
    io::{self, PipeReader, Read},
    os::{
        fd::{AsRawFd, FromRawFd, OwnedFd},
        unix::ffi::OsStrExt,
    },
    path::PathBuf,
    ptr,
    sync::{
        Arc, Mutex, MutexGuard,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, Receiver, SyncSender},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

pub const MAX_STDOUT_CAPTURE: usize = 16 * 1024 * 1024;
const STDERR_CAP: usize = 1024 * 1024;
type Callback = Arc<dyn Fn(ProcessObservation) + Send + Sync>;

#[derive(Clone, Debug, PartialEq, Eq)]
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
    pub total_processes_exact: bool,
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
    Output {
        stderr: bool,
        sequence: u64,
        text: String,
    },
    Running {
        pid: u32,
    },
    Settled(SettlementFacts),
}

#[derive(Debug)]
pub struct ProcessOutcome {
    pub exit_code: u32,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub facts: SettlementFacts,
}

#[repr(C, packed(4))]
#[derive(Clone, Copy)]
struct Kevent {
    ident: usize,
    filter: i16,
    flags: u16,
    fflags: u32,
    data: isize,
    udata: *mut c_void,
}

impl Default for Kevent {
    fn default() -> Self {
        Self {
            ident: 0,
            filter: 0,
            flags: 0,
            fflags: 0,
            data: 0,
            udata: ptr::null_mut(),
        }
    }
}

#[repr(C)]
struct Timespec {
    seconds: i64,
    nanoseconds: i64,
}

#[repr(C)]
struct Sigaction {
    handler: usize,
    mask: u32,
    flags: c_int,
}

unsafe extern "C" {
    fn posix_spawn(
        pid: *mut c_int,
        path: *const c_char,
        actions: *const *mut c_void,
        attributes: *const *mut c_void,
        argv: *const *mut c_char,
        env: *const *mut c_char,
    ) -> c_int;
    fn posix_spawnattr_init(attributes: *mut *mut c_void) -> c_int;
    fn posix_spawnattr_destroy(attributes: *mut *mut c_void) -> c_int;
    fn posix_spawnattr_setflags(attributes: *mut *mut c_void, flags: c_short) -> c_int;
    fn posix_spawnattr_setsigmask(attributes: *mut *mut c_void, mask: *const u32) -> c_int;
    fn posix_spawnattr_setsigdefault(attributes: *mut *mut c_void, mask: *const u32) -> c_int;
    fn posix_spawn_file_actions_init(actions: *mut *mut c_void) -> c_int;
    fn posix_spawn_file_actions_destroy(actions: *mut *mut c_void) -> c_int;
    fn posix_spawn_file_actions_adddup2(
        actions: *mut *mut c_void,
        source: c_int,
        target: c_int,
    ) -> c_int;
    fn posix_spawn_file_actions_addopen(
        actions: *mut *mut c_void,
        target: c_int,
        path: *const c_char,
        flags: c_int,
        mode: u16,
    ) -> c_int;
    fn posix_spawn_file_actions_addchdir_np(
        actions: *mut *mut c_void,
        path: *const c_char,
    ) -> c_int;
    fn kqueue() -> c_int;
    fn kevent(
        queue: c_int,
        changes: *const Kevent,
        change_count: c_int,
        events: *mut Kevent,
        event_count: c_int,
        timeout: *const Timespec,
    ) -> c_int;
    fn fcntl(fd: c_int, command: c_int, ...) -> c_int;
    fn getpgid(pid: c_int) -> c_int;
    fn getsid(pid: c_int) -> c_int;
    fn kill(pid: c_int, signal: c_int) -> c_int;
    fn waitpid(pid: c_int, status: *mut c_int, options: c_int) -> c_int;
    fn sigaction(signal: c_int, action: *const Sigaction, old: *mut Sigaction) -> c_int;
    fn proc_listpids(kind: u32, type_info: u32, buffer: *mut c_void, size: c_int) -> c_int;
}

const NOTE_FORK: u32 = 0x4000_0000;
const NOTE_EXIT: u32 = 0x8000_0000;
const SIGINT: c_int = 2;
const SIGKILL: c_int = 9;
const SIGCONT: c_int = 19;

fn lock<T>(value: &Mutex<T>) -> MutexGuard<'_, T> {
    value
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn checked(result: c_int, operation: &str) -> Result<(), String> {
    if result == 0 {
        Ok(())
    } else {
        Err(format!(
            "{operation}: {}",
            io::Error::from_raw_os_error(result)
        ))
    }
}

fn syscall_error(operation: &str) -> String {
    format!("{operation}: {}", io::Error::last_os_error())
}

struct Launch {
    executable: CString,
    cwd: CString,
    args: Vec<CString>,
    env: Vec<CString>,
}

impl Launch {
    fn new(spec: &ProcessSpec) -> Result<Self, String> {
        if !spec.executable.is_absolute() || !spec.cwd.is_absolute() {
            return Err("process executable and working directory must be absolute".into());
        }
        let executable = CString::new(spec.executable.as_os_str().as_bytes())
            .map_err(|_| "process executable contains NUL")?;
        let cwd = CString::new(spec.cwd.as_os_str().as_bytes())
            .map_err(|_| "process working directory contains NUL")?;
        let mut args = vec![executable.clone()];
        for arg in &spec.args {
            args.push(CString::new(arg.as_bytes()).map_err(|_| "process argument contains NUL")?);
        }
        let mut names = BTreeSet::new();
        let mut env = Vec::new();
        for (name, value) in &spec.env {
            if name.is_empty() || name.contains(['=', '\0']) || !names.insert(name) {
                return Err("process environment has an invalid or duplicate name".into());
            }
            env.push(
                CString::new(format!("{name}={value}"))
                    .map_err(|_| "process environment contains NUL")?,
            );
        }
        Ok(Self {
            executable,
            cwd,
            args,
            env,
        })
    }
}

struct SpawnAttributes(*mut c_void);
impl Drop for SpawnAttributes {
    fn drop(&mut self) {
        unsafe {
            posix_spawnattr_destroy(&mut self.0);
        }
    }
}

struct SpawnActions(*mut c_void);
impl Drop for SpawnActions {
    fn drop(&mut self) {
        unsafe {
            posix_spawn_file_actions_destroy(&mut self.0);
        }
    }
}

fn duplicate_writer(fd: c_int) -> Result<OwnedFd, String> {
    let raw = unsafe { fcntl(fd, 67, 3) };
    if raw < 0 {
        return Err(syscall_error("F_DUPFD_CLOEXEC"));
    }
    Ok(unsafe { OwnedFd::from_raw_fd(raw) })
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
    pid: Option<c_int>,
    queue: Option<OwnedFd>,
    stdout_pipe: Option<PipeReader>,
    stderr_pipe: Option<PipeReader>,
    stdout_reader: Option<JoinHandle<Result<(), String>>>,
    stderr_reader: Option<JoinHandle<Result<(), String>>>,
    consumer: Option<JoinHandle<()>>,
    sender: Option<SyncSender<ProcessObservation>>,
    consumer_state: Arc<ConsumerState>,
    stdout: Arc<Mutex<Capture>>,
    stderr: Arc<Mutex<Capture>>,
    callback: Callback,
    facts: SettlementFacts,
    initialized: bool,
    resumed: bool,
    root_exited: bool,
    descendants_unproven: bool,
    descendants_held_reported: bool,
    trusted_contract: Option<ManagedCompletion>,
    trusted_exit_proven: bool,
    trusted_wait_status: Option<c_int>,
    trusted_completion: bool,
    trusted_rejected: bool,
    observation_lost: bool,
    terminate_sent: bool,
    interrupted_at: Option<Instant>,
    termination_retry_required: bool,
    cleanup: bool,
    failure: Option<String>,
    retry_seen: u64,
    exit_code: u32,
    root_wait_status: Option<c_int>,
    began: Instant,
    #[cfg(test)]
    query_failure: Arc<AtomicBool>,
}

impl Owner {
    fn new(callback: Callback, #[cfg(test)] query_failure: Arc<AtomicBool>) -> Self {
        Self {
            pid: None,
            queue: None,
            stdout_pipe: None,
            stderr_pipe: None,
            stdout_reader: None,
            stderr_reader: None,
            consumer: None,
            sender: None,
            consumer_state: Arc::new(ConsumerState::default()),
            stdout: Arc::new(Mutex::new(Capture::default())),
            stderr: Arc::new(Mutex::new(Capture::default())),
            callback,
            facts: SettlementFacts::default(),
            initialized: false,
            resumed: false,
            root_exited: false,
            descendants_unproven: false,
            descendants_held_reported: false,
            trusted_contract: None,
            trusted_exit_proven: false,
            trusted_wait_status: None,
            trusted_completion: false,
            trusted_rejected: false,
            observation_lost: false,
            terminate_sent: false,
            interrupted_at: None,
            termination_retry_required: false,
            cleanup: false,
            failure: None,
            retry_seen: 0,
            exit_code: 0,
            root_wait_status: None,
            began: Instant::now(),
            #[cfg(test)]
            query_failure,
        }
    }

    fn report_held(&mut self, reason: String) {
        let changed = match &mut self.failure {
            Some(failure) if !failure.contains(&reason) && failure.len() < 8192 => {
                failure.push_str("; ");
                failure.push_str(&reason);
                true
            }
            None => {
                self.failure = Some(reason);
                true
            }
            _ => false,
        };
        if changed {
            *lock(&self.consumer_state.status) = Some(ProcessObservation::Held(
                self.failure.as_ref().unwrap().clone(),
            ));
        }
    }

    fn held(&mut self, reason: String) {
        self.report_held(reason);
        self.cleanup = true;
    }

    fn initialize(
        &mut self,
        launch: &Launch,
        spec: &ProcessSpec,
        control: &Control,
    ) -> Result<(), String> {
        self.initialized = true;
        let (sender, receiver) = mpsc::sync_channel(32);
        let state = self.consumer_state.clone();
        let callback = self.callback.clone();
        self.consumer = Some(
            thread::Builder::new()
                .name("download-observations".into())
                .spawn(move || consume(receiver, state, callback))
                .map_err(|error| format!("callback consumer creation: {error}"))?,
        );
        self.sender = Some(sender);
        if control.is_cancelled() {
            return Err("Cancelled before process creation".into());
        }

        let mut disposition = Sigaction {
            handler: 0,
            mask: 0,
            flags: 0,
        };
        if unsafe { sigaction(20, ptr::null(), &mut disposition) } != 0 {
            return Err(syscall_error("SIGCHLD disposition query"));
        }
        if disposition.handler != 0 || disposition.flags & 0x0020 != 0 {
            return Err(
                "SIGCHLD must retain owned child wait status (default, without SA_NOCLDWAIT)"
                    .into(),
            );
        }
        let queue = unsafe { kqueue() };
        if queue < 0 {
            return Err(syscall_error("kqueue"));
        }
        self.queue = Some(unsafe { OwnedFd::from_raw_fd(queue) });
        if unsafe { fcntl(queue, 2, 1) } < 0 {
            return Err(syscall_error("kqueue FD_CLOEXEC"));
        }
        let (stdout_read, stdout_write) = io::pipe().map_err(|error| error.to_string())?;
        self.stdout_pipe = Some(stdout_read);
        let (stderr_read, stderr_write) = io::pipe().map_err(|error| error.to_string())?;
        self.stderr_pipe = Some(stderr_read);
        let stdout_write = duplicate_writer(stdout_write.as_raw_fd())?;
        let stderr_write = duplicate_writer(stderr_write.as_raw_fd())?;
        let mut raw_attributes = ptr::null_mut();
        checked(
            unsafe { posix_spawnattr_init(&mut raw_attributes) },
            "spawn attributes",
        )?;
        let mut attributes = SpawnAttributes(raw_attributes);
        checked(
            unsafe {
                posix_spawnattr_setflags(&mut attributes.0, 0x4000 | 0x0080 | 0x0400 | 0x000c)
            },
            "spawn flags",
        )?;
        checked(
            unsafe { posix_spawnattr_setsigmask(&mut attributes.0, &0) },
            "spawn signal mask",
        )?;
        checked(
            unsafe { posix_spawnattr_setsigdefault(&mut attributes.0, &u32::MAX) },
            "spawn signal defaults",
        )?;
        let mut raw_actions = ptr::null_mut();
        checked(
            unsafe { posix_spawn_file_actions_init(&mut raw_actions) },
            "spawn file actions",
        )?;
        let mut actions = SpawnActions(raw_actions);
        checked(
            unsafe {
                posix_spawn_file_actions_addopen(&mut actions.0, 0, c"/dev/null".as_ptr(), 0, 0)
            },
            "spawn stdin",
        )?;
        checked(
            unsafe {
                posix_spawn_file_actions_adddup2(&mut actions.0, stdout_write.as_raw_fd(), 1)
            },
            "spawn stdout",
        )?;
        checked(
            unsafe {
                posix_spawn_file_actions_adddup2(&mut actions.0, stderr_write.as_raw_fd(), 2)
            },
            "spawn stderr",
        )?;
        checked(
            unsafe { posix_spawn_file_actions_addchdir_np(&mut actions.0, launch.cwd.as_ptr()) },
            "spawn cwd",
        )?;
        let args: Vec<_> = launch
            .args
            .iter()
            .map(|value| value.as_ptr().cast_mut())
            .chain([ptr::null_mut()])
            .collect();
        let env: Vec<_> = launch
            .env
            .iter()
            .map(|value| value.as_ptr().cast_mut())
            .chain([ptr::null_mut()])
            .collect();
        let mut pid = 0;
        let result = unsafe {
            posix_spawn(
                &mut pid,
                launch.executable.as_ptr(),
                &actions.0,
                &attributes.0,
                args.as_ptr(),
                env.as_ptr(),
            )
        };
        if result == 0 {
            self.pid = Some(pid);
        }
        checked(result, "posix_spawn suspended")?;
        self.facts.root_pid = Some(pid as u32);
        self.facts.total_processes = 1;
        self.facts.total_processes_exact = true;
        if unsafe { getpgid(pid) } != pid || unsafe { getsid(pid) } != pid {
            return Err("suspended child process group and session could not be verified".into());
        }
        let change = Kevent {
            ident: pid as usize,
            filter: -5,
            flags: 0x0001 | 0x0020,
            fflags: NOTE_FORK | NOTE_EXIT,
            ..Kevent::default()
        };
        if unsafe { kevent(queue, &change, 1, ptr::null_mut(), 0, ptr::null()) } < 0 {
            return Err(syscall_error(
                "register suspended child fork/exit observation",
            ));
        }
        self.facts.membership_verified_before_resume = true;
        self.start_readers(spec)?;
        if control.is_cancelled() {
            return Err("Cancelled before process resume".into());
        }
        self.resumed = true;
        if unsafe { kill(pid, SIGCONT) } != 0 {
            return Err(syscall_error("resume owned child"));
        }
        *lock(&self.consumer_state.status) = Some(ProcessObservation::Running { pid: pid as u32 });
        self.began = Instant::now();
        Ok(())
    }

    fn start_readers(&mut self, spec: &ProcessSpec) -> Result<(), String> {
        for stderr in [false, true] {
            let pipe = if stderr {
                &mut self.stderr_pipe
            } else {
                &mut self.stdout_pipe
            };
            let Some(pipe) = pipe.take() else { continue };
            let capture = if stderr {
                self.stderr.clone()
            } else {
                self.stdout.clone()
            };
            let limit = if stderr {
                spec.stderr_limit.min(STDERR_CAP)
            } else {
                spec.stdout_limit.min(MAX_STDOUT_CAPTURE)
            };
            let sender = self
                .sender
                .as_ref()
                .ok_or("missing observation sender")?
                .clone();
            let reader = thread::Builder::new()
                .name(
                    if stderr {
                        "download-stderr"
                    } else {
                        "download-stdout"
                    }
                    .into(),
                )
                .spawn(move || read_pipe(pipe, capture, limit, sender, stderr))
                .map_err(|error| format!("pipe reader creation: {error}"))?;
            if stderr {
                self.stderr_reader = Some(reader);
            } else {
                self.stdout_reader = Some(reader);
            }
        }
        Ok(())
    }

    fn observe(&mut self) -> Result<(), String> {
        if self.pid.is_none() || self.facts.root_waited {
            return Ok(());
        }
        #[cfg(test)]
        if self.query_failure.load(Ordering::Acquire) {
            return Err("test-only process query failure; owner retained".into());
        }
        if self.resumed && !self.root_exited {
            let mut event = Kevent::default();
            let timeout = Timespec {
                seconds: 0,
                nanoseconds: 0,
            };
            let result = unsafe {
                kevent(
                    self.queue
                        .as_ref()
                        .ok_or("missing process observation queue")?
                        .as_raw_fd(),
                    ptr::null(),
                    0,
                    &mut event,
                    1,
                    &timeout,
                )
            };
            if result < 0 {
                if io::Error::last_os_error().kind() == io::ErrorKind::Interrupted {
                    return Ok(());
                }
                self.observation_lost = true;
                return Err(syscall_error("owned process observation"));
            }
            if result > 0 {
                if event.flags & 0x4000 != 0
                    || event.ident != self.pid.unwrap() as usize
                    || event.filter != -5
                {
                    self.observation_lost = true;
                    return Err("owned process observation identity/error is unprovable".into());
                }
                if event.fflags & NOTE_FORK != 0 {
                    self.descendants_unproven = true;
                    self.facts.total_processes = 2;
                    self.facts.total_processes_exact = false;
                }
                self.root_exited |= event.fflags & NOTE_EXIT != 0;
            }
        }
        Ok(())
    }

    fn terminate(&mut self) -> Result<(), String> {
        if self.terminate_sent || self.facts.root_waited {
            return Ok(());
        }
        let Some(pid) = self.pid else { return Ok(()) };
        if self.root_exited && !self.descendants_unproven && !self.observation_lost {
            return Ok(());
        }
        let group_result = unsafe { kill(-pid, SIGKILL) };
        let group_error =
            if group_result != 0 && io::Error::last_os_error().raw_os_error() != Some(3) {
                Some(syscall_error("terminate owned process group"))
            } else {
                None
            };
        let root_result = unsafe { kill(pid, SIGKILL) };
        if root_result != 0 && io::Error::last_os_error().raw_os_error() != Some(3) {
            return Err(syscall_error("terminate owned root"));
        }
        if let Some(reason) = group_error {
            return Err(reason);
        }
        self.terminate_sent = true;
        Ok(())
    }

    fn request_cancellation(&mut self) -> Result<(), String> {
        if !self.cleanup
            && !self.observation_lost
            && !self.trusted_rejected
        {
            if self.trusted_exit_proven {
                return Ok(());
            }
            if let Some(grace) = self.trusted_contract.as_ref().and_then(ManagedCompletion::interrupt_grace)
                && self.resumed && !self.facts.root_waited
            {
                if self.interrupted_at.is_none() {
                    if unsafe { kill(self.pid.ok_or("missing owned root")?, SIGINT) } != 0 {
                        return Err(syscall_error("interrupt owned managed root"));
                    }
                    self.interrupted_at = Some(Instant::now());
                }
                if self.interrupted_at.is_some_and(|began| began.elapsed() < grace) {
                    return Ok(());
                }
            }
        }
        self.cleanup = true;
        Ok(())
    }

    fn snapshot_root_exit(&mut self) -> Result<bool, String> {
        let Some(pid) = self.pid else { return Ok(true) };
        if self.facts.root_waited {
            return Ok(true);
        }
        let mut info: libc::siginfo_t = unsafe { std::mem::zeroed() };
        let result = unsafe {
            libc::waitid(
                libc::P_PID,
                pid as libc::id_t,
                &mut info,
                libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
            )
        };
        if result != 0 {
            if io::Error::last_os_error().kind() == io::ErrorKind::Interrupted {
                return Ok(false);
            }
            self.observation_lost = true;
            return Err(syscall_error("inspect owned root exit without reaping"));
        }
        if info.si_pid == 0 {
            return Ok(false);
        }
        if info.si_pid != pid {
            self.observation_lost = true;
            return Err("owned root exit identity is unprovable".into());
        }
        if self.resumed && !self.root_exited {
            if let Err(reason) = self.observe() {
                self.observation_lost = true;
                return Err(reason);
            }
            if !self.root_exited {
                self.observation_lost = true;
                return Err("owned root exited before fork/exit observation was available".into());
            }
        }
        if !self.descendants_unproven
            || self.trusted_contract.is_none()
            || self.cleanup
            || self.observation_lost
            || self.trusted_rejected
            || self.trusted_exit_proven
        {
            return Ok(true);
        }
        let ordinary_completion = self.trusted_contract.as_ref()
            .is_some_and(ManagedCompletion::accepts_nonzero_exit);
        if info.si_code != libc::CLD_EXITED || (info.si_status != 0 && !ordinary_completion) {
            self.trusted_rejected = true;
            return Err("trusted root did not complete with its expected normal exit".into());
        }
        let mut members = [0 as c_int; 64];
        let size = std::mem::size_of_val(&members) as c_int;
        let listed = unsafe { proc_listpids(2, pid as u32, members.as_mut_ptr().cast(), size) };
        if listed < 0 {
            self.trusted_rejected = true;
            return Err(syscall_error("inspect owned process group"));
        }
        if listed as usize != std::mem::size_of::<c_int>() || members[0] != pid {
            self.trusted_rejected = true;
            return Err("owned process group is not provably limited to the unreaped root".into());
        }
        self.trusted_wait_status = Some(info.si_status << 8);
        self.trusted_exit_proven = true;
        Ok(true)
    }

    fn check_trusted_completion(&self, spec: &ProcessSpec) -> Result<bool, String> {
        if !self.facts.root_waited
            || !self.trusted_exit_proven
            || !self.facts.stdout_reader_joined
            || !self.facts.stderr_reader_joined
        {
            return Ok(false);
        }
        let contract = self
            .trusted_contract
            .as_ref()
            .ok_or("missing trusted component contract")?;
        if self.root_wait_status.is_none() || self.root_wait_status != self.trusted_wait_status {
            return Err("owned root wait status disagreed with trusted normal exit".into());
        }
        let complete = if self.interrupted_at.is_some() {
            contract.complete_interrupted(&spec.cwd, self.pid.ok_or("missing owned root")? as u32, self.exit_code)
        } else { contract.complete(&spec.cwd, self.exit_code) };
        if !complete {
            return Err("managed component completion evidence is missing or unsupported".into());
        }
        Ok(true)
    }

    fn wait_root(&mut self) -> Result<(), String> {
        if self.facts.root_waited {
            return Ok(());
        }
        let Some(pid) = self.pid else {
            self.facts.root_waited = true;
            self.facts.job_active_zero = true;
            return Ok(());
        };
        let mut status = 0;
        let result = unsafe { waitpid(pid, &mut status, 1) };
        if result < 0 {
            if io::Error::last_os_error().kind() == io::ErrorKind::Interrupted {
                return Ok(());
            }
            self.observation_lost = true;
            return Err(syscall_error("wait owned root"));
        }
        if result == pid {
            if self.resumed && !self.root_exited {
                if let Err(reason) = self.observe() {
                    self.observation_lost = true;
                    self.report_held(reason);
                }
            }
            self.facts.root_waited = true;
            self.root_wait_status = Some(status);
            self.exit_code = if status & 0x7f == 0 {
                ((status >> 8) & 0xff) as u32
            } else {
                128 + (status & 0x7f) as u32
            };
            if self.resumed && !self.root_exited {
                self.observation_lost = true;
                self.report_held("owned root was reaped without its exit observation".into());
            }
            if self.trusted_exit_proven && self.trusted_wait_status != Some(status) {
                self.trusted_exit_proven = false;
                self.observation_lost = true;
                self.report_held(
                    "owned root wait status disagreed with trusted normal exit".into(),
                );
            }
            if self.descendants_unproven
                && self.trusted_contract.is_some()
                && !self.trusted_exit_proven
                && !self.trusted_rejected
                && !self.cleanup
            {
                self.trusted_rejected = true;
                self.report_held(
                    "owned root was reaped before trusted exit and group evidence was captured"
                        .into(),
                );
            }
        }
        Ok(())
    }

    fn tick(
        &mut self,
        spec: &ProcessSpec,
        control: &Control,
    ) -> Result<Option<Result<ProcessOutcome, String>>, String> {
        let revision = control.cleanup_revision();
        if revision != self.retry_seen {
            self.retry_seen = revision;
            self.termination_retry_required = false;
            if self.descendants_unproven {
                self.cleanup = true;
            }
            if !self.facts.root_waited {
                self.terminate_sent = false;
            }
        }
        if spec
            .timeout
            .is_some_and(|limit| self.began.elapsed() >= limit)
            && !self.cleanup
        {
            self.held("process timeout requested termination; actual wait, fork evidence, pipe and thread joins still required".into());
        }
        if let Some(reason) = lock(&self.consumer_state.failure).clone() {
            self.failure.get_or_insert(reason);
            self.cleanup = true;
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
            if let Err(reason) = join_reader(reader, joined) {
                self.failure.get_or_insert(reason);
                self.cleanup = true;
            }
        }
        if let Err(reason) = self.observe() {
            self.observation_lost = true;
            self.held(reason);
        }
        let wait_ready = match self.snapshot_root_exit() {
            Ok(ready) => ready,
            Err(reason) => {
                self.report_held(reason);
                true
            }
        };
        if control.is_cancelled() && !self.trusted_completion {
            if let Err(reason) = self.request_cancellation() {
                self.held(reason);
            }
        }
        if self.cleanup && !self.termination_retry_required {
            if let Err(reason) = self.terminate() {
                self.termination_retry_required = true;
                self.held(reason);
            }
        }
        if wait_ready || self.root_exited || self.observation_lost || !self.resumed {
            if let Err(reason) = self.wait_root() {
                self.held(reason);
            }
        }
        if self.observation_lost {
            self.facts.total_processes_exact = false;
        }
        if self.facts.root_waited
            && self.trusted_exit_proven
            && !self.trusted_completion
            && !self.cleanup
            && !self.observation_lost
            && !self.trusted_rejected
        {
            match self.check_trusted_completion(spec) {
                Ok(true) => self.trusted_completion = true,
                Ok(false) => {}
                Err(reason) => {
                    self.trusted_rejected = true;
                    self.report_held(reason);
                }
            }
        }
        if self.facts.root_waited
            && self.descendants_unproven
            && !self.trusted_completion
            && (!self.trusted_exit_proven
                || self.cleanup
                || self.observation_lost
                || self.trusted_rejected)
            && !self.descendants_held_reported
        {
            self.descendants_held_reported = true;
            self.report_held("root exited after observed fork; descendant settlement is unproven; retaining owner and leases".into());
        }
        if self.cleanup && !self.termination_retry_required {
            if let Err(reason) = self.terminate() {
                self.termination_retry_required = true;
                self.held(reason);
            }
        }
        if self.facts.root_waited {
            self.facts.job_active_zero =
                (!self.descendants_unproven || self.trusted_completion) && !self.observation_lost;
        } else {
            return Ok(None);
        }
        self.stdout_pipe.take();
        self.stderr_pipe.take();
        if !self.facts.stdout_reader_joined || !self.facts.stderr_reader_joined {
            return Ok(None);
        }
        self.sender.take();
        if self
            .consumer
            .as_ref()
            .is_some_and(|consumer| !consumer.is_finished())
        {
            return Ok(None);
        }
        if let Some(consumer) = self.consumer.take() {
            if consumer.join().is_err() {
                self.failure
                    .get_or_insert("callback consumer panic, joined".into());
            }
        }
        self.facts.callback_consumer_joined = true;
        if let Some(reason) = lock(&self.consumer_state.failure).clone() {
            self.failure.get_or_insert(reason);
        }
        let mut stdout = lock(&self.stdout);
        let mut stderr = lock(&self.stderr);
        self.facts.stdout_bytes = stdout.drained;
        self.facts.stderr_bytes = stderr.drained;
        self.facts.stdout_truncated = stdout.drained > stdout.bytes.len() as u64;
        self.facts.stderr_truncated = stderr.drained > stderr.bytes.len() as u64;
        if !self.facts.job_active_zero {
            return Ok(None);
        }
        let facts = self.facts.clone();
        if std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            (self.callback)(ProcessObservation::Settled(facts.clone()))
        }))
        .is_err()
        {
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

fn join_reader(
    reader: &mut Option<JoinHandle<Result<(), String>>>,
    joined: &mut bool,
) -> Result<(), String> {
    if reader.as_ref().is_some_and(|reader| !reader.is_finished()) {
        return Ok(());
    }
    if let Some(reader) = reader.take() {
        let result = reader.join();
        *joined = true;
        result.map_err(|_| "pipe reader panic, joined".to_string())??;
    } else {
        *joined = true;
    }
    Ok(())
}

fn read_pipe(
    mut pipe: PipeReader,
    capture: Arc<Mutex<Capture>>,
    limit: usize,
    sender: SyncSender<ProcessObservation>,
    stderr: bool,
) -> Result<(), String> {
    let mut sequence = 0u64;
    loop {
        let mut buffer = [0; 8192];
        let count = match pipe.read(&mut buffer) {
            Ok(0) => return Ok(()),
            Ok(count) => count,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(format!("pipe read: {error}")),
        };
        {
            let mut capture = lock(&capture);
            capture.drained = capture.drained.saturating_add(count as u64);
            let retained = count.min(limit.saturating_sub(capture.bytes.len()));
            capture.bytes.extend_from_slice(&buffer[..retained]);
        }
        sequence = sequence.saturating_add(1);
        let _ = sender.try_send(ProcessObservation::Output {
            stderr,
            sequence,
            text: String::from_utf8_lossy(&buffer[..count]).into_owned(),
        });
    }
}

fn consume(receiver: Receiver<ProcessObservation>, state: Arc<ConsumerState>, callback: Callback) {
    let mut output_failed = false;
    loop {
        let pending = lock(&state.status).take();
        if let Some(event) = pending {
            if std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| callback(event))).is_err() {
                *lock(&state.failure) = Some("observation callback panic".into());
                output_failed = true;
            }
        }
        match receiver.recv_timeout(Duration::from_millis(10)) {
            Ok(event) if !output_failed => {
                if std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| callback(event)))
                    .is_err()
                {
                    *lock(&state.failure) =
                        Some("output callback panic; pipe draining continues".into());
                    output_failed = true;
                }
            }
            Ok(_) | Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                if let Some(event) = lock(&state.status).take() {
                    if std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| callback(event)))
                        .is_err()
                    {
                        *lock(&state.failure) = Some("observation callback panic".into());
                    }
                }
                break;
            }
        }
    }
}

pub fn run(
    spec: ProcessSpec,
    control: &Control,
    callback: Callback,
) -> Result<ProcessOutcome, String> {
    run_internal(
        spec,
        control,
        callback,
        None,
        #[cfg(test)]
        Arc::new(AtomicBool::new(false)),
    )
}

pub(crate) fn run_managed(
    spec: ProcessSpec,
    completion: Option<ManagedCompletion>,
    control: &Control,
    callback: Callback,
) -> Result<ProcessOutcome, String> {
    if completion.as_ref().is_some_and(|contract| !contract.matches_invocation(&spec)) {
        return Err("Managed completion does not match the actual invocation".into());
    }
    run_internal(spec, control, callback, completion, #[cfg(test)] Arc::new(AtomicBool::new(false)))
}

fn run_internal(
    spec: ProcessSpec,
    control: &Control,
    callback: Callback,
    completion: Option<ManagedCompletion>,
    #[cfg(test)] query_failure: Arc<AtomicBool>,
) -> Result<ProcessOutcome, String> {
    let launch = Arc::new(Launch::new(&spec)?);
    let owner = Arc::new(Mutex::new(Owner::new(
        callback,
        #[cfg(test)]
        query_failure,
    )));
    lock(&owner).trusted_contract = completion;
    loop {
        let worker_owner = owner.clone();
        let worker_launch = launch.clone();
        let worker_spec = spec.clone();
        let worker_control = control.clone();
        match thread::Builder::new()
            .name("download-process-owner".into())
            .spawn(move || {
                loop {
                    let result = {
                        let mut owner = lock(&worker_owner);
                        if !owner.initialized {
                            if let Err(reason) =
                                owner.initialize(&worker_launch, &worker_spec, &worker_control)
                            {
                                owner.held(reason);
                            }
                            #[cfg(test)]
                            if worker_spec.env.iter().any(|(name, value)| {
                                name == "AMEOW_TEST_OWNER_PANIC" && value == "1"
                            }) {
                                panic!("test-only process owner unwind after launch");
                            }
                        }
                        owner.tick(&worker_spec, &worker_control)
                    };
                    match result {
                        Ok(Some(result)) => return result,
                        Err(reason) => lock(&worker_owner).held(reason),
                        Ok(None) => {}
                    }
                    thread::sleep(Duration::from_millis(10));
                }
            }) {
            Ok(worker) => match worker.join() {
                Ok(result) => return result,
                Err(_) => {
                    let mut owner = lock(&owner);
                    if owner.resumed && !owner.facts.root_waited {
                        owner.observation_lost = true;
                    }
                    owner.held("process owner panic; outer owner retained for explicit cleanup retry; observation continuity unproven".into());
                }
            },
            Err(error) => {
                let mut owner = lock(&owner);
                if !owner.initialized {
                    return Err(format!("process owner thread creation: {error}"));
                }
                owner.held(format!("cleanup owner thread creation: {error}"));
            }
        }
        let revision = lock(&owner).retry_seen;
        while control.cleanup_revision() == revision {
            thread::sleep(Duration::from_millis(10));
        }
    }
}

#[cfg(test)]
pub(crate) fn run_with_test_query_failure(
    spec: ProcessSpec,
    control: &Control,
    callback: Callback,
    query_failure: Arc<AtomicBool>,
) -> Result<ProcessOutcome, String> {
    run_internal(spec, control, callback, None, query_failure)
}

#[cfg(test)]
mod macos_tests {
    use super::*;
    use super::super::adapters::yt_dlp::InvocationPhase;
    use std::{
        fs,
        io::Write,
        os::unix::process::CommandExt,
        process::{Command, Stdio},
    };

    unsafe extern "C" {
        fn setsid() -> c_int;
    }

    fn fixture_name() -> String {
        format!(
            "{}::child_fixture",
            module_path!().split_once("::").unwrap().1
        )
    }

    fn spec(mode: &str) -> ProcessSpec {
        ProcessSpec {
            executable: std::env::current_exe().unwrap(),
            args: vec!["--exact".into(), fixture_name(), "--nocapture".into()],
            cwd: std::env::temp_dir(),
            env: vec![("AMEOW_SUPERVISOR_FIXTURE".into(), mode.into())],
            stdout_limit: 8 * 1024 * 1024,
            stderr_limit: STDERR_CAP,
            timeout: Some(Duration::from_secs(10)),
        }
    }

    fn trust_fixture(owner: &mut Owner) {
        owner.trusted_contract = Some(ManagedCompletion::fixture(InvocationPhase::Fixture));
    }

    fn wait_for_unreaped_exit(owner: &Owner, deadline: Instant) {
        let pid = owner.pid.unwrap();
        loop {
            let mut info: libc::siginfo_t = unsafe { std::mem::zeroed() };
            assert_eq!(
                unsafe {
                    libc::waitid(
                        libc::P_PID,
                        pid as libc::id_t,
                        &mut info,
                        libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
                    )
                },
                0
            );
            if info.si_pid == pid {
                return;
            }
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        }
    }

    fn launch(
        spec: ProcessSpec,
        control: Control,
    ) -> (
        Receiver<ProcessObservation>,
        Receiver<Result<ProcessOutcome, String>>,
    ) {
        let (events_sender, events) = mpsc::channel();
        let (done_sender, done) = mpsc::channel();
        thread::spawn(move || {
            let result = run(
                spec,
                &control,
                Arc::new(move |event| {
                    let _ = events_sender.send(event);
                }),
            );
            let _ = done_sender.send(result);
        });
        (events, done)
    }

    fn await_event(
        events: &Receiver<ProcessObservation>,
        predicate: impl Fn(&ProcessObservation) -> bool,
    ) {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let event = events
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))
                .unwrap();
            if predicate(&event) {
                break;
            }
        }
    }

    #[test]
    fn child_fixture() {
        let Ok(mode) = std::env::var("AMEOW_SUPERVISOR_FIXTURE") else {
            return;
        };
        match mode.as_str() {
            "capture" => {
                let stdout_buffer = vec![b'o'; 7 * 1024 * 1024];
                let stderr_buffer = vec![b'e'; 2 * 1024 * 1024];
                let stdout_worker =
                    thread::spawn(move || io::stdout().write_all(&stdout_buffer).unwrap());
                io::stderr().write_all(&stderr_buffer).unwrap();
                stdout_worker.join().unwrap();
            }
            "sleep" => thread::sleep(Duration::from_secs(30)),
            "exit7" => std::process::exit(7),
            "environment" => {
                assert!(std::env::var_os("HOME").is_none());
                assert_eq!(
                    std::env::var("AMEOW_LITERAL").unwrap(),
                    "space ' quote \" $() 中文"
                );
                println!("CWD={}", std::env::current_dir().unwrap().display());
            }
            "fork" | "fork-ignore-interrupt" => {
                if mode == "fork-ignore-interrupt" {
                    let action = Sigaction { handler: 1, mask: 0, flags: 0 };
                    assert_eq!(unsafe { sigaction(SIGINT, &action, ptr::null_mut()) }, 0);
                }
                let mut child = Command::new("/bin/sleep").arg("30").spawn().unwrap();
                println!("AMEOW_FORK_RUNNING");
                io::stdout().flush().unwrap();
                child.wait().unwrap();
            }
            "fork-interrupt-complete" | "fork-interrupt-cancelled" | "fork-cancel-record-no-interrupt" => {
                static INTERRUPTED: AtomicBool = AtomicBool::new(false);
                extern "C" fn interrupted(_: c_int) {
                    INTERRUPTED.store(true, Ordering::Release);
                }
                let action = Sigaction { handler: interrupted as *const () as usize, mask: 0, flags: 0 };
                assert_eq!(unsafe { sigaction(SIGINT, &action, ptr::null_mut()) }, 0);
                let mut child = Command::new("/bin/sleep").arg("0.1").spawn().unwrap();
                child.wait().unwrap();
                while mode != "fork-cancel-record-no-interrupt" && !INTERRUPTED.load(Ordering::Acquire) {
                    thread::sleep(Duration::from_millis(5));
                }
                if mode != "fork-interrupt-complete" {
                    if std::env::var_os("AMEOW_SKIP_CANCEL_RECEIPT").is_none() {
                        let receipt = serde_json::json!({"schema":1,"nonce":"fixture",
                            "root_pid":std::process::id(),"kind":"cancelled","work_creation_closed":true,
                            "workers_joined":true,"direct_children_waited":true,"reaped":[]});
                        fs::write("transfer-cancel.json", format!("{receipt}\n")).unwrap();
                    }
                    std::process::exit(130);
                }
                std::process::exit(1);
            }
            "fork-short" => {
                let mut child = Command::new("/bin/sleep").arg("0.3").spawn().unwrap();
                println!("AMEOW_FORK_RUNNING");
                io::stdout().flush().unwrap();
                child.wait().unwrap();
            }
            "fork-complete" => {
                let mut child = Command::new("/bin/sleep").arg("0.05").spawn().unwrap();
                child.wait().unwrap();
                println!("AMEOW_FORK_COMPLETED");
            }
            "fork-failure" => {
                let mut child = Command::new("/bin/sleep").arg("0.05").spawn().unwrap();
                child.wait().unwrap();
                std::process::exit(1);
            }
            "fork-gated" => {
                let mut child = Command::new("/bin/sleep").arg("0.05").spawn().unwrap();
                child.wait().unwrap();
                let gate = PathBuf::from(std::env::var_os("AMEOW_EXIT_GATE").unwrap());
                while !gate.exists() {
                    thread::sleep(Duration::from_millis(5));
                }
            }
            "fork-exit" => {
                Command::new("/bin/sleep").arg("0.05").spawn().unwrap();
            }
            "orphan-work" => {
                Command::new(std::env::current_exe().unwrap())
                    .args(["--exact", &fixture_name(), "--nocapture"])
                    .env_clear()
                    .env("AMEOW_SUPERVISOR_FIXTURE", "orphan-worker")
                    .env(
                        "AMEOW_ORPHAN_MARKER",
                        std::env::var_os("AMEOW_ORPHAN_MARKER").unwrap(),
                    )
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .unwrap();
            }
            "orphan-worker" => {
                thread::sleep(Duration::from_millis(350));
                fs::write(
                    std::env::var_os("AMEOW_ORPHAN_MARKER").unwrap(),
                    b"descendant completed work",
                )
                .unwrap();
            }
            "escape" => {
                let mut command = Command::new(std::env::current_exe().unwrap());
                command
                    .args(["--exact", &fixture_name(), "--nocapture"])
                    .env_clear()
                    .env("AMEOW_SUPERVISOR_FIXTURE", "escaped-child")
                    .env(
                        "AMEOW_ESCAPE_MARKER",
                        std::env::var_os("AMEOW_ESCAPE_MARKER").unwrap(),
                    )
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null());
                unsafe {
                    command.pre_exec(|| {
                        if setsid() < 0 {
                            return Err(io::Error::last_os_error());
                        }
                        Ok(())
                    });
                }
                let mut child = command.spawn().unwrap();
                child.wait().unwrap();
            }
            "escaped-child" => {
                thread::sleep(Duration::from_millis(150));
                fs::write(
                    std::env::var_os("AMEOW_ESCAPE_MARKER").unwrap(),
                    b"escaped child reached end",
                )
                .unwrap();
            }
            _ => panic!("unknown fixture mode"),
        }
        io::stdout().flush().unwrap();
        io::stderr().flush().unwrap();
        std::process::exit(0);
    }

    #[test]
    fn native_exit_and_isolated_environment_have_actual_settlement() {
        let outcome = run(spec("exit7"), &Control::default(), Arc::new(|_| {})).unwrap();
        assert_eq!(outcome.exit_code, 7);
        assert!(outcome.facts.resources_releasable());
        assert!(outcome.facts.membership_verified_before_resume);
        let mut environment = spec("environment");
        environment
            .env
            .push(("AMEOW_LITERAL".into(), "space ' quote \" $() 中文".into()));
        let outcome = run(environment, &Control::default(), Arc::new(|_| {})).unwrap();
        assert_eq!(outcome.exit_code, 0);
        assert!(String::from_utf8_lossy(&outcome.stdout).contains("CWD="));
        assert!(outcome.facts.resources_releasable());
    }

    #[test]
    fn both_pipes_drain_after_bounded_capture_overflow() {
        let mut bounded = spec("capture");
        bounded.stdout_limit = 1024;
        bounded.stderr_limit = 2048;
        let outcome = run(bounded, &Control::default(), Arc::new(|_| {})).unwrap();
        assert_eq!(outcome.exit_code, 0);
        assert_eq!(outcome.stdout.len(), 1024);
        assert_eq!(outcome.stderr.len(), 2048);
        assert!(outcome.facts.stdout_bytes >= 7 * 1024 * 1024);
        assert_eq!(outcome.facts.stderr_bytes, 2 * 1024 * 1024);
        assert!(outcome.facts.stdout_truncated && outcome.facts.stderr_truncated);
        assert!(outcome.facts.resources_releasable());
        let outcome = run(spec("capture"), &Control::default(), Arc::new(|_| {})).unwrap();
        assert_eq!(outcome.stdout.len() as u64, outcome.facts.stdout_bytes);
        assert!(!outcome.facts.stdout_truncated);
    }

    #[test]
    fn cancelled_and_timed_out_roots_require_wait_and_all_joins() {
        let control = Control::default();
        let (events, done) = launch(spec("sleep"), control.clone());
        await_event(&events, |event| {
            matches!(event, ProcessObservation::Running { .. })
        });
        control.cancel();
        let outcome = done.recv_timeout(Duration::from_secs(5)).unwrap().unwrap();
        assert_eq!(outcome.exit_code, 128 + SIGKILL as u32);
        assert!(outcome.facts.resources_releasable());
        let mut timed = spec("sleep");
        timed.timeout = Some(Duration::from_millis(30));
        let (events, done) = launch(timed, Control::default());
        assert!(
            done.recv_timeout(Duration::from_secs(5))
                .unwrap()
                .unwrap_err()
                .contains("resources settled")
        );
        assert!(events.try_iter().any(|event| matches!(event, ProcessObservation::Settled(facts) if facts.resources_releasable())));
    }

    #[test]
    fn spawned_root_has_its_own_session_and_process_group() {
        let control = Control::default();
        let (events, done) = launch(spec("sleep"), control.clone());
        let pid = loop {
            if let ProcessObservation::Running { pid } =
                events.recv_timeout(Duration::from_secs(5)).unwrap()
            {
                break pid as c_int;
            }
        };
        assert_eq!(unsafe { getpgid(pid) }, pid);
        assert_eq!(unsafe { getsid(pid) }, pid);
        control.cancel();
        assert!(
            done.recv_timeout(Duration::from_secs(5))
                .unwrap()
                .unwrap()
                .facts
                .resources_releasable()
        );
    }

    #[test]
    fn fork_remains_held_after_group_kill_and_cleanup_retry() {
        let control = Control::default();
        let (events, done) = launch(spec("fork"), control.clone());
        await_event(
            &events,
            |event| matches!(event, ProcessObservation::Output { text, .. } if text.contains("AMEOW_FORK_RUNNING")),
        );
        assert!(done.recv_timeout(Duration::from_millis(100)).is_err());
        assert!(
            !events
                .try_iter()
                .any(|event| matches!(event, ProcessObservation::Held(_)))
        );
        control.cancel();
        await_event(
            &events,
            |event| matches!(event, ProcessObservation::Held(reason) if reason.contains("observed fork")),
        );
        control.retry_cleanup();
        assert!(done.recv_timeout(Duration::from_millis(200)).is_err());
        assert!(
            !events
                .try_iter()
                .any(|event| matches!(event, ProcessObservation::Settled(_)))
        );
    }

    #[test]
    fn fork_can_finish_work_but_root_exit_and_eof_do_not_release_ownership() {
        let (events, done) = launch(spec("fork-complete"), Control::default());
        await_event(
            &events,
            |event| matches!(event, ProcessObservation::Output { text, .. } if text.contains("AMEOW_FORK_COMPLETED")),
        );
        await_event(
            &events,
            |event| matches!(event, ProcessObservation::Held(reason) if reason.contains("observed fork")),
        );
        assert!(done.recv_timeout(Duration::from_millis(150)).is_err());
        assert!(
            !events
                .try_iter()
                .any(|event| matches!(event, ProcessObservation::Settled(_)))
        );
    }

    #[test]
    fn trusted_synchronous_fork_settles_only_after_wait_group_and_joins() {
        let spec = spec("fork-complete");
        let control = Control::default();
        let mut owner = Owner::new(Arc::new(|_| {}), Arc::new(AtomicBool::new(false)));
        trust_fixture(&mut owner);
        owner
            .initialize(&Launch::new(&spec).unwrap(), &spec, &control)
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        let result = loop {
            if let Some(result) = owner.tick(&spec, &control).unwrap() {
                break result.unwrap();
            }
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(10));
        };
        assert_eq!(result.exit_code, 0);
        assert!(result.facts.resources_releasable());
        assert!(!result.facts.total_processes_exact);
        assert!(owner.trusted_completion);
    }

    #[test]
    fn trusted_exit_is_reaped_while_reader_join_is_pending() {
        let spec = spec("fork-complete");
        let control = Control::default();
        let mut owner = Owner::new(Arc::new(|_| {}), Arc::new(AtomicBool::new(false)));
        trust_fixture(&mut owner);
        owner
            .initialize(&Launch::new(&spec).unwrap(), &spec, &control)
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        wait_for_unreaped_exit(&owner, deadline);
        owner.stdout_reader.take().unwrap().join().unwrap().unwrap();
        let release = Arc::new(AtomicBool::new(false));
        let reader_release = release.clone();
        owner.stdout_reader = Some(thread::spawn(move || {
            while !reader_release.load(Ordering::Acquire) {
                thread::sleep(Duration::from_millis(5));
            }
            Ok(())
        }));
        assert!(owner.tick(&spec, &control).unwrap().is_none());
        assert!(owner.descendants_unproven && owner.trusted_exit_proven);
        assert!(owner.facts.root_waited && !owner.facts.stdout_reader_joined);
        assert!(matches!(owner.check_trusted_completion(&spec), Ok(false)));
        assert_eq!(owner.root_wait_status, Some(0));
        release.store(true, Ordering::Release);
        let outcome = loop {
            if let Some(outcome) = owner.tick(&spec, &control).unwrap() {
                break outcome.unwrap();
            }
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        };
        assert!(outcome.facts.resources_releasable());
    }

    #[test]
    fn held_after_delayed_reader_reports_and_joins_consumer() {
        let spec = spec("fork-complete");
        let control = Control::default();
        let (events_sender, events) = mpsc::channel();
        let mut owner = Owner::new(
            Arc::new(move |event| {
                let _ = events_sender.send(event);
            }),
            Arc::new(AtomicBool::new(false)),
        );
        owner.trusted_contract = Some(ManagedCompletion::fixture(InvocationPhase::Transfer));
        owner
            .initialize(&Launch::new(&spec).unwrap(), &spec, &control)
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        wait_for_unreaped_exit(&owner, deadline);
        owner.stdout_reader.take().unwrap().join().unwrap().unwrap();
        let release = Arc::new(AtomicBool::new(false));
        let reader_release = release.clone();
        owner.stdout_reader = Some(thread::spawn(move || {
            while !reader_release.load(Ordering::Acquire) {
                thread::sleep(Duration::from_millis(5));
            }
            Ok(())
        }));
        assert!(owner.tick(&spec, &control).unwrap().is_none());
        assert!(owner.facts.root_waited && owner.trusted_exit_proven);
        release.store(true, Ordering::Release);
        while !owner.facts.callback_consumer_joined {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        }
        assert!(owner.trusted_rejected && !owner.facts.resources_releasable());
        assert!(
            events
                .try_iter()
                .any(|event| matches!(event, ProcessObservation::Held(_)))
        );
    }

    #[test]
    fn pending_exit_waits_for_a_snapshot_before_reaping_trusted_fork() {
        let gate =
            std::env::temp_dir().join(format!("ameow-supervisor-exit-gate-{}", std::process::id()));
        let _ = fs::remove_file(&gate);
        let mut spec = spec("fork-gated");
        spec.env.push((
            "AMEOW_EXIT_GATE".into(),
            gate.to_string_lossy().into_owned(),
        ));
        let control = Control::default();
        let mut owner = Owner::new(Arc::new(|_| {}), Arc::new(AtomicBool::new(false)));
        trust_fixture(&mut owner);
        owner
            .initialize(&Launch::new(&spec).unwrap(), &spec, &control)
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !owner.descendants_unproven {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        }
        assert!(!owner.snapshot_root_exit().unwrap());
        assert!(!owner.facts.root_waited && !owner.observation_lost);
        fs::write(&gate, b"exit").unwrap();
        wait_for_unreaped_exit(&owner, deadline);
        let outcome = loop {
            if let Some(outcome) = owner.tick(&spec, &control).unwrap() {
                break outcome.unwrap();
            }
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        };
        assert!(owner.trusted_exit_proven && outcome.facts.resources_releasable());
        fs::remove_file(gate).unwrap();
    }

    #[test]
    fn wait_can_consume_a_queued_exit_after_reaping() {
        let spec = spec("exit7");
        let control = Control::default();
        let mut owner = Owner::new(Arc::new(|_| {}), Arc::new(AtomicBool::new(false)));
        owner
            .initialize(&Launch::new(&spec).unwrap(), &spec, &control)
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        wait_for_unreaped_exit(&owner, deadline);
        assert!(!owner.root_exited);
        owner.wait_root().unwrap();
        assert!(owner.facts.root_waited && owner.root_exited && !owner.observation_lost);
        assert_eq!(owner.root_wait_status, Some(7 << 8));
        let outcome = loop {
            if let Some(outcome) = owner.tick(&spec, &control).unwrap() {
                break outcome.unwrap();
            }
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        };
        assert_eq!(outcome.exit_code, 7);
        assert!(outcome.facts.resources_releasable());
    }

    #[test]
    fn cancellation_after_trusted_root_and_readers_finish_still_settles() {
        let spec = spec("fork-complete");
        let control = Control::default();
        let mut owner = Owner::new(Arc::new(|_| {}), Arc::new(AtomicBool::new(false)));
        trust_fixture(&mut owner);
        owner
            .initialize(&Launch::new(&spec).unwrap(), &spec, &control)
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            owner.observe().unwrap();
            join_reader(
                &mut owner.stdout_reader,
                &mut owner.facts.stdout_reader_joined,
            )
            .unwrap();
            join_reader(
                &mut owner.stderr_reader,
                &mut owner.facts.stderr_reader_joined,
            )
            .unwrap();
            if owner.root_exited
                && owner.facts.stdout_reader_joined
                && owner.facts.stderr_reader_joined
            {
                break;
            }
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        }
        assert!(owner.descendants_unproven);
        control.cancel();
        let outcome = loop {
            if let Some(outcome) = owner.tick(&spec, &control).unwrap() {
                break outcome.unwrap();
            }
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        };
        assert_eq!(outcome.exit_code, 0);
        assert!(owner.trusted_completion && !owner.terminate_sent);
        assert!(outcome.facts.resources_releasable());
    }

    #[test]
    fn trusted_fork_with_nonzero_root_remains_held() {
        let spec = spec("fork-failure");
        let control = Control::default();
        let mut owner = Owner::new(Arc::new(|_| {}), Arc::new(AtomicBool::new(false)));
        trust_fixture(&mut owner);
        owner
            .initialize(&Launch::new(&spec).unwrap(), &spec, &control)
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !owner.trusted_rejected {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        }
        assert!(owner.root_exited && owner.descendants_unproven);
        assert!(owner.facts.root_waited && !owner.facts.resources_releasable());
        assert_eq!(owner.root_wait_status, Some(1 << 8));
        while !owner.facts.callback_consumer_joined {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        }
        assert!(owner.facts.stdout_reader_joined && owner.facts.stderr_reader_joined);
    }

    #[test]
    fn trusted_resolve_nonzero_reaps_before_pending_reader_and_requires_all_joins() {
        let spec = spec("fork-failure");
        let control = Control::default();
        let mut owner = Owner::new(Arc::new(|_| {}), Arc::new(AtomicBool::new(false)));
        owner.trusted_contract = Some(ManagedCompletion::fixture(InvocationPhase::Resolve));
        owner
            .initialize(&Launch::new(&spec).unwrap(), &spec, &control)
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        wait_for_unreaped_exit(&owner, deadline);
        owner.stdout_reader.take().unwrap().join().unwrap().unwrap();
        let release = Arc::new(AtomicBool::new(false));
        let reader_release = release.clone();
        owner.stdout_reader = Some(thread::spawn(move || {
            while !reader_release.load(Ordering::Acquire) {
                thread::sleep(Duration::from_millis(5));
            }
            Ok(())
        }));
        assert!(owner.tick(&spec, &control).unwrap().is_none());
        assert!(owner.descendants_unproven && owner.trusted_exit_proven);
        assert!(owner.facts.root_waited && !owner.facts.stdout_reader_joined);
        assert_eq!(owner.trusted_wait_status, Some(1 << 8));
        assert_eq!(owner.root_wait_status, Some(1 << 8));
        assert!(!owner.facts.resources_releasable());
        release.store(true, Ordering::Release);
        let outcome = loop {
            if let Some(outcome) = owner.tick(&spec, &control).unwrap() {
                break outcome.unwrap();
            }
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        };
        assert_eq!(outcome.exit_code, 1);
        assert!(owner.trusted_completion && !owner.terminate_sent);
        assert!(outcome.facts.resources_releasable());
    }

    #[test]
    fn trusted_transfer_normal_exits_require_actual_supported_media_and_all_joins() {
        let valid = br#"{"protocol":"https+https","requested_formats":[{"protocol":"https","url":"https://media.example/video.mp4"},{"protocol":"https","url":"https://media.example/audio.m4a"}]}"#;
        let unsupported = br#"{"protocol":"bluray","url":"bluray:/disc"}"#;
        for (case_name, mode, metadata, settles) in [
            ("success", "fork-complete", Some(valid.as_slice()), true),
            ("failure", "fork-failure", Some(valid.as_slice()), true),
            ("preselection-failure", "fork-failure", None, true),
            ("empty-success", "fork-complete", None, false),
            ("missing", "fork-complete", None, false),
            (
                "missing-selection",
                "fork-complete",
                Some(valid.as_slice()),
                false,
            ),
            (
                "current-and-recovery",
                "fork-complete",
                Some(valid.as_slice()),
                true,
            ),
            (
                "unsupported-current-valid-recovery",
                "fork-complete",
                Some(valid.as_slice()),
                false,
            ),
            (
                "invalid-current-valid-recovery",
                "fork-complete",
                Some(valid.as_slice()),
                false,
            ),
            (
                "third-selection",
                "fork-complete",
                Some(valid.as_slice()),
                false,
            ),
            (
                "incomplete-selection",
                "fork-complete",
                Some(valid.as_slice()),
                false,
            ),
            (
                "changed-protocol",
                "fork-complete",
                Some(valid.as_slice()),
                false,
            ),
            (
                "unsupported",
                "fork-complete",
                Some(unsupported.as_slice()),
                false,
            ),
        ] {
            let workspace = std::env::temp_dir().join(format!(
                "ameow-supervisor-transfer-{}-{case_name}",
                std::process::id()
            ));
            fs::create_dir(&workspace).unwrap();
            if matches!(case_name, "preselection-failure" | "empty-success") {
                fs::write(workspace.join("selection.txt"), []).unwrap();
                fs::write(workspace.join("final-object.txt"), []).unwrap();
            }
            if let Some(metadata) = metadata {
                fs::write(workspace.join("media.info.json"), metadata).unwrap();
                if case_name != "missing-selection" {
                    let selection_count = match case_name {
                        "current-and-recovery"
                        | "unsupported-current-valid-recovery"
                        | "invalid-current-valid-recovery" => 2,
                        "third-selection" => 3,
                        _ => 1,
                    };
                    let mut record = Vec::new();
                    for selection_index in 0..selection_count {
                        let selection = match (case_name, selection_index) {
                            ("unsupported-current-valid-recovery", 0) => unsupported.as_slice(),
                            ("invalid-current-valid-recovery", 0) => b"{broken}".as_slice(),
                            _ => metadata,
                        };
                        record.extend_from_slice(b"AMEOW_SELECTION=");
                        record.extend_from_slice(selection);
                        record.push(b'\n');
                    }
                    if case_name == "incomplete-selection" {
                        record.pop();
                    }
                    fs::write(workspace.join("selection.txt"), record).unwrap();
                }
                if settles {
                    fs::write(
                        workspace.join("media.info.json"),
                        br#"{"protocol":"https+https"}"#,
                    )
                    .unwrap();
                }
                if case_name == "changed-protocol" {
                    fs::write(
                        workspace.join("media.info.json"),
                        br#"{"protocol":"http+https"}"#,
                    )
                    .unwrap();
                }
            }
            let mut spec = spec(mode);
            spec.cwd = workspace.clone();
            let control = Control::default();
            let mut owner = Owner::new(Arc::new(|_| {}), Arc::new(AtomicBool::new(false)));
            owner.trusted_contract = Some(ManagedCompletion::fixture(InvocationPhase::Transfer));
            owner
                .initialize(&Launch::new(&spec).unwrap(), &spec, &control)
                .unwrap();
            let deadline = Instant::now() + Duration::from_secs(5);
            let outcome = loop {
                if let Some(outcome) = owner.tick(&spec, &control).unwrap() {
                    break Some(outcome.unwrap());
                }
                if owner.facts.root_waited
                    && owner.facts.callback_consumer_joined
                    && owner.trusted_rejected
                {
                    break None;
                }
                assert!(Instant::now() < deadline);
                thread::sleep(Duration::from_millis(5));
            };
            assert!(
                owner.facts.root_waited
                    && owner.facts.stdout_reader_joined
                    && owner.facts.stderr_reader_joined
                    && owner.facts.callback_consumer_joined
            );
            assert_eq!(owner.facts.resources_releasable(), settles, "{case_name}");
            assert!(!owner.terminate_sent);
            let exit_code = if mode == "fork-failure" { 1 } else { 0 };
            assert_eq!(owner.root_wait_status, Some((exit_code as c_int) << 8), "{case_name}");
            if settles {
                assert_eq!(outcome.unwrap().exit_code, exit_code);
                assert_eq!(owner.root_wait_status, owner.trusted_wait_status);
                assert!(owner.trusted_completion);
            } else {
                assert!(outcome.is_none() && owner.trusted_rejected);
            }
            drop(owner);
            fs::remove_dir_all(workspace).unwrap();
        }
    }

    #[test]
    fn transfer_cancellation_needs_this_interrupt_receipt_and_all_kernel_barriers() {
        for (interrupt, record, settles) in [(true, true, true), (true, false, false), (false, true, false)] {
            let workspace = tempfile::tempdir().unwrap();
            let mut spec = spec(if interrupt { "fork-interrupt-cancelled" } else { "fork-cancel-record-no-interrupt" });
            spec.cwd = workspace.path().into();
            if !record { spec.env.push(("AMEOW_SKIP_CANCEL_RECEIPT".into(), "1".into())); }
            let control = Control::default();
            let mut owner = Owner::new(Arc::new(|_| {}), Arc::new(AtomicBool::new(false)));
            owner.trusted_contract = Some(ManagedCompletion::cancellation_fixture());
            owner.initialize(&Launch::new(&spec).unwrap(), &spec, &control).unwrap();
            let deadline = Instant::now() + Duration::from_secs(5);
            while !owner.descendants_unproven {
                assert!(owner.tick(&spec, &control).unwrap().is_none());
                assert!(Instant::now() < deadline);
                thread::sleep(Duration::from_millis(5));
            }
            if interrupt { control.cancel(); }
            let outcome = loop {
                if let Some(outcome) = owner.tick(&spec, &control).unwrap() { break Some(outcome.unwrap()); }
                if owner.facts.root_waited && owner.facts.callback_consumer_joined && owner.trusted_rejected { break None; }
                assert!(Instant::now() < deadline);
                thread::sleep(Duration::from_millis(5));
            };
            assert_eq!(owner.facts.resources_releasable(), settles);
            assert_eq!(owner.trusted_completion, settles);
            assert!(owner.trusted_exit_proven && owner.facts.root_waited);
            assert_eq!(owner.root_wait_status, Some(130 << 8));
            assert_eq!(owner.trusted_wait_status, owner.root_wait_status);
            assert!(owner.facts.stdout_reader_joined && owner.facts.stderr_reader_joined && owner.facts.callback_consumer_joined);
            assert_eq!(owner.interrupted_at.is_some(), interrupt);
            assert!(!owner.terminate_sent);
            assert_eq!(outcome.is_some(), settles);
        }
    }

    #[test]
    fn transfer_interrupt_deadline_is_one_opportunity_and_never_resets() {
        let spec = spec("fork-ignore-interrupt");
        let control = Control::default();
        let mut owner = Owner::new(Arc::new(|_| {}), Arc::new(AtomicBool::new(false)));
        owner.trusted_contract = Some(ManagedCompletion::cancellation_fixture());
        owner.initialize(&Launch::new(&spec).unwrap(), &spec, &control).unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !owner.descendants_unproven {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        }
        control.cancel(); owner.request_cancellation().unwrap();
        let first = owner.interrupted_at.unwrap();
        owner.request_cancellation().unwrap();
        assert_eq!(owner.interrupted_at, Some(first));
        assert!(!owner.cleanup);
        owner.interrupted_at = Some(Instant::now() - Duration::from_secs(16));
        let expired = owner.interrupted_at;
        owner.request_cancellation().unwrap();
        assert!(owner.cleanup);
        assert_eq!(owner.interrupted_at, expired);
        while !owner.facts.root_waited || !owner.facts.callback_consumer_joined {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        }
        assert!(owner.terminate_sent && !owner.facts.resources_releasable());
        assert_eq!(owner.root_wait_status, Some(SIGKILL));
    }

    #[test]
    fn trusted_managed_call_cancelled_during_fork_reaps_and_joins_but_remains_held() {
        for phase in [InvocationPhase::Resolve, InvocationPhase::Transfer] {
            let spec = spec("fork-ignore-interrupt");
            let control = Control::default();
            let mut owner = Owner::new(Arc::new(|_| {}), Arc::new(AtomicBool::new(false)));
            owner.trusted_contract = Some(ManagedCompletion::fixture(phase));
            owner
                .initialize(&Launch::new(&spec).unwrap(), &spec, &control)
                .unwrap();
            let deadline = Instant::now() + Duration::from_secs(5);
            while !owner.descendants_unproven {
                assert!(owner.tick(&spec, &control).unwrap().is_none());
                assert!(Instant::now() < deadline);
                thread::sleep(Duration::from_millis(5));
            }
            control.cancel();
            while !owner.facts.root_waited || !owner.facts.callback_consumer_joined {
                assert!(owner.tick(&spec, &control).unwrap().is_none());
                assert!(Instant::now() < deadline);
                thread::sleep(Duration::from_millis(5));
            }
            assert!(owner.cleanup && owner.terminate_sent);
            assert!(owner.facts.stdout_reader_joined && owner.facts.stderr_reader_joined);
            assert!(!owner.trusted_completion && !owner.facts.resources_releasable());
            assert_eq!(owner.root_wait_status, Some(SIGKILL));
        }
    }

    #[test]
    fn interrupted_resolve_settles_only_after_normal_exit_group_snapshot_wait_and_joins() {
        let spec = spec("fork-interrupt-complete");
        let control = Control::default();
        let mut owner = Owner::new(Arc::new(|_| {}), Arc::new(AtomicBool::new(false)));
        owner.trusted_contract = Some(ManagedCompletion::fixture(InvocationPhase::Resolve));
        owner.initialize(&Launch::new(&spec).unwrap(), &spec, &control).unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !owner.descendants_unproven {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        }
        control.cancel();
        let outcome = loop {
            if let Some(outcome) = owner.tick(&spec, &control).unwrap() {
                break outcome.unwrap();
            }
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        };
        assert!(control.is_cancelled() && owner.interrupted_at.is_some());
        assert!(owner.trusted_completion && owner.trusted_exit_proven);
        assert_eq!(owner.root_wait_status, Some(1 << 8));
        assert_eq!(owner.root_wait_status, owner.trusted_wait_status);
        assert!(!owner.cleanup && !owner.terminate_sent);
        assert_eq!(outcome.exit_code, 1);
        assert!(outcome.facts.resources_releasable());
    }

    #[test]
    fn interrupted_resolve_with_signal_exit_reaps_and_joins_but_remains_held() {
        let spec = spec("fork");
        let control = Control::default();
        let mut owner = Owner::new(Arc::new(|_| {}), Arc::new(AtomicBool::new(false)));
        owner.trusted_contract = Some(ManagedCompletion::fixture(InvocationPhase::Resolve));
        owner.initialize(&Launch::new(&spec).unwrap(), &spec, &control).unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !owner.descendants_unproven {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        }
        control.cancel();
        while !owner.facts.root_waited || !owner.facts.callback_consumer_joined {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        }
        assert!(owner.interrupted_at.is_some() && owner.trusted_rejected);
        assert!(owner.facts.stdout_reader_joined && owner.facts.stderr_reader_joined);
        assert_eq!(owner.root_wait_status, Some(SIGINT));
        assert!(!owner.trusted_completion && !owner.facts.resources_releasable());
    }

    #[test]
    fn lost_observation_cannot_use_trusted_normal_completion() {
        let spec = spec("fork-complete");
        let control = Control::default();
        let mut owner = Owner::new(Arc::new(|_| {}), Arc::new(AtomicBool::new(false)));
        trust_fixture(&mut owner);
        owner
            .initialize(&Launch::new(&spec).unwrap(), &spec, &control)
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !owner.descendants_unproven && Instant::now() < deadline {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            thread::sleep(Duration::from_millis(5));
        }
        assert!(owner.descendants_unproven);
        owner.observation_lost = true;
        while !owner.root_exited && Instant::now() < deadline {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            thread::sleep(Duration::from_millis(5));
        }
        assert!(owner.root_exited);
        assert!(!owner.trusted_completion && !owner.facts.resources_releasable());
        if !owner.facts.root_waited {
            let mut status = 0;
            assert_eq!(
                unsafe { waitpid(owner.pid.unwrap(), &mut status, 0) },
                owner.pid.unwrap()
            );
        }
        owner.sender.take();
        if let Some(reader) = owner.stdout_reader.take() {
            reader.join().unwrap().unwrap();
        }
        if let Some(reader) = owner.stderr_reader.take() {
            reader.join().unwrap().unwrap();
        }
        owner.consumer.take().unwrap().join().unwrap();
    }

    #[test]
    fn unresolved_normal_exit_retains_owner_without_killing_live_descendant() {
        let marker =
            std::env::temp_dir().join(format!("ameow-supervisor-orphan-{}", std::process::id()));
        let _ = fs::remove_file(&marker);
        let mut spec = spec("orphan-work");
        spec.env.push((
            "AMEOW_ORPHAN_MARKER".into(),
            marker.to_string_lossy().into_owned(),
        ));
        let control = Control::default();
        let mut owner = Owner::new(Arc::new(|_| {}), Arc::new(AtomicBool::new(false)));
        owner.trusted_contract = Some(ManagedCompletion::fixture(InvocationPhase::Resolve));
        owner
            .initialize(&Launch::new(&spec).unwrap(), &spec, &control)
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            if owner.facts.root_waited {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
        assert!(owner.root_exited && owner.descendants_unproven);
        assert!(owner.trusted_rejected);
        assert!(!owner.cleanup && owner.facts.root_waited);
        assert!(!owner.facts.resources_releasable());
        control.retry_cleanup();
        assert!(owner.tick(&spec, &control).unwrap().is_none());
        assert!(!owner.terminate_sent);
        while !marker.exists() && Instant::now() < deadline {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(fs::read(&marker).unwrap(), b"descendant completed work");
        while !owner.facts.callback_consumer_joined {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        }
        fs::remove_file(marker).unwrap();
    }

    #[test]
    fn signaled_root_with_unproven_descendant_remains_held() {
        let spec = spec("fork-short");
        let control = Control::default();
        let mut owner = Owner::new(Arc::new(|_| {}), Arc::new(AtomicBool::new(false)));
        owner.trusted_contract = Some(ManagedCompletion::fixture(InvocationPhase::Transfer));
        owner
            .initialize(&Launch::new(&spec).unwrap(), &spec, &control)
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !owner.descendants_unproven && Instant::now() < deadline {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            thread::sleep(Duration::from_millis(10));
        }
        assert!(owner.descendants_unproven);
        assert_eq!(unsafe { kill(owner.pid.unwrap(), SIGKILL) }, 0);
        while !owner.root_exited && Instant::now() < deadline {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            thread::sleep(Duration::from_millis(10));
        }
        assert!(owner.root_exited);
        assert!(!owner.cleanup && owner.facts.root_waited);
        assert!(!owner.trusted_exit_proven);
        assert!(!owner.facts.resources_releasable());
        control.retry_cleanup();
        assert!(owner.tick(&spec, &control).unwrap().is_none());
        assert!(owner.cleanup);
        assert!(!owner.terminate_sent);
        while !owner.facts.callback_consumer_joined {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        }
    }

    #[test]
    fn setsid_escape_and_closed_pipes_never_prove_tree_zero() {
        let marker =
            std::env::temp_dir().join(format!("ameow-supervisor-escape-{}", std::process::id()));
        let _ = fs::remove_file(&marker);
        let mut escaped = spec("escape");
        escaped.env.push((
            "AMEOW_ESCAPE_MARKER".into(),
            marker.to_string_lossy().into_owned(),
        ));
        let control = Control::default();
        let (events_sender, events) = mpsc::channel();
        let mut owner = Owner::new(
            Arc::new(move |event| {
                let _ = events_sender.send(event);
            }),
            Arc::new(AtomicBool::new(false)),
        );
        owner
            .initialize(&Launch::new(&escaped).unwrap(), &escaped, &control)
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !marker.exists() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(fs::read(&marker).unwrap(), b"escaped child reached end");
        while Instant::now() < deadline {
            assert!(owner.tick(&escaped, &control).unwrap().is_none());
            if owner.root_exited
                && owner.facts.stdout_reader_joined
                && owner.facts.stderr_reader_joined
            {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
        assert!(
            owner.root_exited
                && owner.facts.root_waited
                && !owner.cleanup
                && owner.facts.stdout_reader_joined
                && owner.facts.stderr_reader_joined
        );
        assert!(owner.descendants_unproven);
        assert!(!owner.facts.job_active_zero);
        assert!(!owner.facts.resources_releasable());
        control.cancel();
        control.retry_cleanup();
        assert!(owner.tick(&escaped, &control).unwrap().is_none());
        if !owner.facts.root_waited {
            let mut status = 0;
            assert_eq!(
                unsafe { waitpid(owner.pid.unwrap(), &mut status, 0) },
                owner.pid.unwrap()
            );
        }
        owner.sender.take();
        if let Some(consumer) = owner.consumer.take() {
            consumer.join().unwrap();
        }
        assert!(
            !events
                .try_iter()
                .any(|event| matches!(event, ProcessObservation::Settled(_)))
        );
        fs::remove_file(marker).unwrap();
    }

    #[test]
    fn coalesced_fork_and_exit_remain_held() {
        let spec = spec("fork-exit");
        let control = Control::default();
        let (events_sender, events) = mpsc::channel();
        let mut owner = Owner::new(
            Arc::new(move |event| {
                let _ = events_sender.send(event);
            }),
            Arc::new(AtomicBool::new(false)),
        );
        owner
            .initialize(&Launch::new(&spec).unwrap(), &spec, &control)
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !owner.facts.callback_consumer_joined {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        }
        assert!(owner.descendants_unproven && owner.root_exited);
        assert!(owner.facts.root_waited && !owner.cleanup);
        assert_eq!(owner.root_wait_status, Some(0));
        assert!(owner.facts.stdout_reader_joined && owner.facts.stderr_reader_joined);
        assert!(!owner.facts.job_active_zero && !owner.facts.resources_releasable());
        let observations: Vec<_> = events.try_iter().collect();
        assert!(
            observations
                .iter()
                .any(|event| matches!(event, ProcessObservation::Held(_)))
        );
        assert!(
            !observations
                .iter()
                .any(|event| matches!(event, ProcessObservation::Settled(_)))
        );
    }

    #[test]
    fn blocked_callback_cannot_stop_pipe_drain_but_prevents_return_until_joined() {
        let blocked = Arc::new(AtomicBool::new(true));
        let callback_blocked = blocked.clone();
        let (entered_sender, entered) = mpsc::sync_channel(1);
        let (done_sender, done) = mpsc::channel();
        thread::spawn(move || {
            let result = run(
                spec("capture"),
                &Control::default(),
                Arc::new(move |event| {
                    if matches!(event, ProcessObservation::Output { .. })
                        && callback_blocked.load(Ordering::Acquire)
                    {
                        let _ = entered_sender.try_send(());
                        while callback_blocked.load(Ordering::Acquire) {
                            thread::sleep(Duration::from_millis(5));
                        }
                    }
                }),
            );
            done_sender.send(result).unwrap();
        });
        entered.recv_timeout(Duration::from_secs(5)).unwrap();
        assert!(done.recv_timeout(Duration::from_millis(100)).is_err());
        blocked.store(false, Ordering::Release);
        let outcome = done.recv_timeout(Duration::from_secs(5)).unwrap().unwrap();
        assert!(outcome.facts.resources_releasable());
        assert!(outcome.facts.stdout_bytes >= 7 * 1024 * 1024);
    }

    #[test]
    fn callback_panic_drains_and_joins_before_error() {
        let (events_sender, events) = mpsc::channel();
        let result = run(
            spec("capture"),
            &Control::default(),
            Arc::new(move |event| {
                if matches!(event, ProcessObservation::Output { .. }) {
                    panic!("intentional callback panic")
                }
                events_sender.send(event).unwrap();
            }),
        );
        assert!(result.unwrap_err().contains("resources settled"));
        assert!(events.try_iter().any(|event| matches!(event, ProcessObservation::Settled(facts) if facts.resources_releasable())));
    }

    #[test]
    fn lost_observation_still_reaps_root_and_joins_observers() {
        let query_failure = Arc::new(AtomicBool::new(false));
        let control = Control::default();
        let (events_sender, events) = mpsc::channel();
        let spec = spec("exit7");
        let mut owner = Owner::new(
            Arc::new(move |event| {
                let _ = events_sender.send(event);
            }),
            query_failure.clone(),
        );
        owner
            .initialize(&Launch::new(&spec).unwrap(), &spec, &control)
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        wait_for_unreaped_exit(&owner, deadline);
        query_failure.store(true, Ordering::Release);
        assert!(owner.tick(&spec, &control).unwrap().is_none());
        assert!(owner.facts.root_waited && owner.observation_lost && !owner.root_exited);
        assert_eq!(owner.root_wait_status, Some(7 << 8));
        assert!(!owner.terminate_sent && !owner.facts.resources_releasable());
        query_failure.store(false, Ordering::Release);
        control.retry_cleanup();
        while !owner.facts.callback_consumer_joined {
            assert!(owner.tick(&spec, &control).unwrap().is_none());
            assert!(Instant::now() < deadline);
            thread::sleep(Duration::from_millis(5));
        }
        assert!(owner.facts.stdout_reader_joined && owner.facts.stderr_reader_joined);
        assert!(
            !owner.facts.job_active_zero
                && !owner.facts.total_processes_exact
                && !owner.terminate_sent
        );
        assert!(
            events
                .try_iter()
                .any(|event| matches!(event, ProcessObservation::Held(_)))
        );
    }

    #[test]
    fn owner_unwind_retains_native_resources_and_retry_cannot_erase_uncertainty() {
        let mut spec = spec("sleep");
        spec.env.push(("AMEOW_TEST_OWNER_PANIC".into(), "1".into()));
        let control = Control::default();
        let (events, done) = launch(spec, control.clone());
        await_event(
            &events,
            |event| matches!(event, ProcessObservation::Held(reason) if reason.contains("owner panic")),
        );
        control.cancel();
        control.retry_cleanup();
        assert!(done.recv_timeout(Duration::from_millis(150)).is_err());
        assert!(
            !events
                .try_iter()
                .any(|event| matches!(event, ProcessObservation::Settled(_)))
        );
    }

    #[test]
    fn invalid_input_and_failed_spawn_do_not_leave_resources() {
        let mut invalid = spec("exit7");
        invalid.args.push("nul\0arg".into());
        assert!(
            run(invalid, &Control::default(), Arc::new(|_| {}))
                .unwrap_err()
                .contains("NUL")
        );
        let mut missing = spec("exit7");
        missing.executable = PathBuf::from("/nonexistent/ameow-supervisor-fixture");
        assert!(
            run(missing, &Control::default(), Arc::new(|_| {}))
                .unwrap_err()
                .contains("resources settled")
        );
    }
}
