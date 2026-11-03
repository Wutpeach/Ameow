//! Narrow Windows x64 test runner. Creation-time Job and strict inherited files.
//! No pipes/readers/callbacks: child log writers close at Job-zero before files are read.
//! This is not the Stage A production supervisor or its fault matrix.
use std::{
    ffi::c_void,
    fs::OpenOptions,
    io::Read,
    mem::{size_of, zeroed},
    os::windows::io::AsRawHandle,
    path::Path,
    ptr, thread,
    time::{Duration, Instant},
};
type HandleRaw = *mut c_void;

// Windows CNG supplies SHA-256 without adding Cargo dependencies or running a tool.
#[link(name = "bcrypt")]
unsafe extern "system" {
    fn BCryptOpenAlgorithmProvider(
        algorithm: *mut HandleRaw,
        id: *const u16,
        provider: *const u16,
        flags: u32,
    ) -> i32;
    fn BCryptCloseAlgorithmProvider(algorithm: HandleRaw, flags: u32) -> i32;
    fn BCryptCreateHash(
        algorithm: HandleRaw,
        hash: *mut HandleRaw,
        object: *mut u8,
        object_bytes: u32,
        secret: *mut u8,
        secret_bytes: u32,
        flags: u32,
    ) -> i32;
    fn BCryptHashData(hash: HandleRaw, input: *const u8, bytes: u32, flags: u32) -> i32;
    fn BCryptFinishHash(hash: HandleRaw, output: *mut u8, bytes: u32, flags: u32) -> i32;
    fn BCryptDestroyHash(hash: HandleRaw) -> i32;
}
struct Algorithm(HandleRaw);
impl Drop for Algorithm {
    fn drop(&mut self) {
        unsafe {
            BCryptCloseAlgorithmProvider(self.0, 0);
        }
    }
}
struct Hash(HandleRaw);
impl Drop for Hash {
    fn drop(&mut self) {
        unsafe {
            BCryptDestroyHash(self.0);
        }
    }
}
fn cng_result(operation: &str, status: i32) -> Result<(), String> {
    if status < 0 {
        Err(format!("{operation}: NTSTATUS 0x{:08X}", status as u32))
    } else {
        Ok(())
    }
}

pub fn sha256(mut input: impl Read) -> Result<String, String> {
    let mut algorithm_raw = ptr::null_mut();
    cng_result("open native SHA-256", unsafe {
        BCryptOpenAlgorithmProvider(&mut algorithm_raw, wide("SHA256").as_ptr(), ptr::null(), 0)
    })?;
    let algorithm = Algorithm(algorithm_raw);
    let mut hash_raw = ptr::null_mut();
    // Since Windows 7, NULL object/zero size requests CNG-owned allocation until DestroyHash.
    cng_result("create native SHA-256", unsafe {
        BCryptCreateHash(
            algorithm.0,
            &mut hash_raw,
            ptr::null_mut(),
            0,
            ptr::null_mut(),
            0,
            0,
        )
    })?;
    let hash = Hash(hash_raw);
    let mut buffer = [0_u8; 65536];
    loop {
        let bytes = input
            .read(&mut buffer)
            .map_err(|e| format!("read identity input: {e}"))?;
        if bytes == 0 {
            break;
        }
        cng_result("hash identity input", unsafe {
            BCryptHashData(hash.0, buffer.as_ptr(), bytes as u32, 0)
        })?;
    }
    let mut digest = [0_u8; 32];
    cng_result("finish SHA-256", unsafe {
        BCryptFinishHash(hash.0, digest.as_mut_ptr(), digest.len() as u32, 0)
    })?;
    Ok(digest.iter().map(|byte| format!("{byte:02X}")).collect())
}

pub fn verify_file(label: &str, path: &Path, expected: &str) -> Result<String, String> {
    let file = std::fs::File::open(path)
        .map_err(|e| format!("preflight {label}: {}: {e}", path.display()))?;
    let actual = sha256(file)?;
    if actual != expected {
        return Err(format!(
            "preflight {label}: SHA-256 mismatch: expected {expected}, actual {actual}; refusing launch"
        ));
    }
    Ok(format!("{label}: SHA-256 {actual}: {}\n", path.display()))
}

#[repr(C)]
struct Startup {
    cb: u32,
    reserved: *mut u16,
    desktop: *mut u16,
    title: *mut u16,
    x: u32,
    y: u32,
    x_size: u32,
    y_size: u32,
    x_chars: u32,
    y_chars: u32,
    fill: u32,
    flags: u32,
    show: u16,
    reserved_bytes: u16,
    reserved_ptr: *mut u8,
    stdin: HandleRaw,
    stdout: HandleRaw,
    stderr: HandleRaw,
}
#[repr(C)]
struct StartupEx {
    startup: Startup,
    attributes: *mut c_void,
}
#[repr(C)]
struct ProcessInfo {
    process: HandleRaw,
    thread: HandleRaw,
    pid: u32,
    tid: u32,
}
#[repr(C)]
struct BasicLimits {
    process_time: i64,
    job_time: i64,
    flags: u32,
    min_working: usize,
    max_working: usize,
    active_limit: u32,
    affinity: usize,
    priority: u32,
    scheduling: u32,
}
#[repr(C)]
struct ExtendedLimits {
    basic: BasicLimits,
    io: [u64; 6],
    process_memory: usize,
    job_memory: usize,
    peak_process_memory: usize,
    peak_job_memory: usize,
}
#[repr(C)]
#[derive(Default)]
struct Accounting {
    user_time: i64,
    kernel_time: i64,
    period_user_time: i64,
    period_kernel_time: i64,
    page_faults: u32,
    total: u32,
    active: u32,
    terminated: u32,
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn CreateJobObjectW(security: *const c_void, name: *const u16) -> HandleRaw;
    fn SetInformationJobObject(job: HandleRaw, class: i32, info: *const c_void, len: u32) -> i32;
    fn QueryInformationJobObject(
        job: HandleRaw,
        class: i32,
        info: *mut c_void,
        len: u32,
        returned: *mut u32,
    ) -> i32;
    fn InitializeProcThreadAttributeList(
        list: *mut c_void,
        count: u32,
        flags: u32,
        size: *mut usize,
    ) -> i32;
    fn UpdateProcThreadAttribute(
        list: *mut c_void,
        flags: u32,
        attribute: usize,
        value: *const c_void,
        len: usize,
        old: *mut c_void,
        returned: *mut usize,
    ) -> i32;
    fn DeleteProcThreadAttributeList(list: *mut c_void);
    fn SetHandleInformation(handle: HandleRaw, mask: u32, flags: u32) -> i32;
    fn CreateProcessW(
        app: *const u16,
        command: *mut u16,
        process_security: *const c_void,
        thread_security: *const c_void,
        inherit: i32,
        flags: u32,
        env: *const c_void,
        cwd: *const u16,
        startup: *const Startup,
        info: *mut ProcessInfo,
    ) -> i32;
    fn IsProcessInJob(process: HandleRaw, job: HandleRaw, result: *mut i32) -> i32;
    fn ResumeThread(thread: HandleRaw) -> u32;
    fn WaitForSingleObject(handle: HandleRaw, ms: u32) -> u32;
    fn GetExitCodeProcess(process: HandleRaw, exit: *mut u32) -> i32;
    fn TerminateJobObject(job: HandleRaw, exit: u32) -> i32;
    fn CloseHandle(handle: HandleRaw) -> i32;
}

struct Handle(HandleRaw);
impl Drop for Handle {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}
struct Attributes {
    data: Vec<usize>,
    initialized: bool,
}
impl Attributes {
    fn raw(&mut self) -> *mut c_void {
        self.data.as_mut_ptr().cast()
    }
}
impl Drop for Attributes {
    fn drop(&mut self) {
        if self.initialized {
            unsafe {
                DeleteProcThreadAttributeList(self.raw());
            }
        }
    }
}
fn failure(operation: &str) -> String {
    format!("{operation}: {}", std::io::Error::last_os_error())
}
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}
fn quote(s: &str) -> String {
    let mut out = String::from("\"");
    let mut slashes = 0;
    for c in s.chars() {
        if c == '\\' {
            slashes += 1;
            continue;
        }
        out.extend(std::iter::repeat_n(
            '\\',
            if c == '"' { slashes * 2 + 1 } else { slashes },
        ));
        out.push(c);
        slashes = 0;
    }
    out.extend(std::iter::repeat_n('\\', slashes * 2));
    out.push('"');
    out
}
fn accounting(job: &Handle) -> Result<Accounting, String> {
    let mut info = Accounting::default();
    if unsafe {
        QueryInformationJobObject(
            job.0,
            1,
            (&mut info as *mut Accounting).cast(),
            size_of::<Accounting>() as u32,
            ptr::null_mut(),
        )
    } == 0
    {
        return Err(failure("Job accounting"));
    }
    Ok(info)
}

#[derive(Debug)]
pub struct Settlement {
    pub exit_code: u32,
    pub total_processes: u32,
    pub root_pid: u32,
    pub membership_before_resume: bool,
    pub root_waited: bool,
    pub active_processes: u32,
    pub inherited_log_handles_closed: bool,
    pub timed_out: bool,
}

pub fn run(
    executable: &Path,
    args: &[String],
    env: &[(String, String)],
    cwd: &Path,
) -> Result<Settlement, String> {
    // repr(C) declarations follow the x64 Windows SDK layouts. Fail closed on other targets.
    if size_of::<Startup>() != 104 || size_of::<ExtendedLimits>() != 144 {
        return Err("This gate runner requires the Windows x64 ABI".into());
    }
    let job = Handle(unsafe { CreateJobObjectW(ptr::null(), ptr::null()) });
    if job.0.is_null() {
        return Err(failure("CreateJobObjectW"));
    }
    // Zero is a valid initial value for these Windows SDK POD structures.
    let mut limits: ExtendedLimits = unsafe { zeroed() };
    limits.basic.flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE; no breakaway.
    if unsafe {
        SetInformationJobObject(
            job.0,
            9,
            (&limits as *const ExtendedLimits).cast(),
            size_of::<ExtendedLimits>() as u32,
        )
    } == 0
    {
        return Err(failure("Job kill-on-close limits"));
    }
    let stdout = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(cwd.join("stdout.log"))
        .map_err(|e| format!("stdout log: {e}"))?;
    let stderr = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(cwd.join("stderr.log"))
        .map_err(|e| format!("stderr log: {e}"))?;
    let stdin = OpenOptions::new()
        .read(true)
        .open("NUL")
        .map_err(|e| format!("stdin NUL: {e}"))?;
    let handles = [
        stdin.as_raw_handle(),
        stdout.as_raw_handle(),
        stderr.as_raw_handle(),
    ];
    for h in handles {
        if unsafe { SetHandleInformation(h, 1, 1) } == 0 {
            return Err(failure("stdio inheritance"));
        }
    }
    let jobs = [job.0];
    let mut bytes = 0;
    unsafe {
        InitializeProcThreadAttributeList(ptr::null_mut(), 2, 0, &mut bytes);
    }
    if bytes == 0 {
        return Err(failure("attribute size"));
    }
    let mut attributes = Attributes {
        data: vec![0; bytes.div_ceil(size_of::<usize>())],
        initialized: false,
    };
    if unsafe { InitializeProcThreadAttributeList(attributes.raw(), 2, 0, &mut bytes) } == 0 {
        return Err(failure("attribute initialize"));
    }
    attributes.initialized = true;
    for (key, value, len) in [
        (0x20002, handles.as_ptr().cast(), size_of_val(&handles)),
        (0x2000d, jobs.as_ptr().cast(), size_of_val(&jobs)),
    ] {
        if unsafe {
            UpdateProcThreadAttribute(
                attributes.raw(),
                0,
                key,
                value,
                len,
                ptr::null_mut(),
                ptr::null_mut(),
            )
        } == 0
        {
            return Err(failure("creation-time HANDLE_LIST/JOB_LIST"));
        }
    }
    let mut startup: StartupEx = unsafe { zeroed() };
    startup.startup.cb = size_of::<StartupEx>() as u32;
    startup.startup.flags = 0x100; // STARTF_USESTDHANDLES
    startup.startup.stdin = handles[0];
    startup.startup.stdout = handles[1];
    startup.startup.stderr = handles[2];
    startup.attributes = attributes.raw();
    let app = executable.display().to_string();
    let application = wide(&app);
    let mut command = wide(
        &std::iter::once(app.as_str())
            .chain(args.iter().map(String::as_str))
            .map(quote)
            .collect::<Vec<_>>()
            .join(" "),
    );
    let directory = wide(&cwd.display().to_string());
    let mut environment: Vec<u16> = env
        .iter()
        .flat_map(|(k, v)| wide(&format!("{k}={v}")))
        .collect();
    environment.push(0);
    let mut info: ProcessInfo = unsafe { zeroed() };
    // SUSPENDED | NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT | UNICODE_ENVIRONMENT
    if unsafe {
        CreateProcessW(
            application.as_ptr(),
            command.as_mut_ptr(),
            ptr::null(),
            ptr::null(),
            1,
            0x08080404,
            environment.as_ptr().cast(),
            directory.as_ptr(),
            &startup.startup,
            &mut info,
        )
    } == 0
    {
        let error = failure("CreateProcessW");
        let count = accounting(&job)?;
        return Err(format!("{error}; failed-start Job active={}", count.active));
    }
    let process = Handle(info.process);
    let primary = Handle(info.thread);
    let mut member = 0;
    let membership = unsafe { IsProcessInJob(process.0, job.0, &mut member) } != 0 && member != 0;
    let resumed = membership && unsafe { ResumeThread(primary.0) } != u32::MAX;
    let launch_error = if !membership {
        Some(failure("pre-resume Job membership"))
    } else if !resumed {
        Some(failure("ResumeThread"))
    } else {
        None
    };
    let started = Instant::now();
    let mut timed_out = false;
    let mut terminated = false;
    let mut root_waited = false;
    loop {
        let wait = unsafe { WaitForSingleObject(process.0, 0) };
        if wait == 0 {
            root_waited = true;
        }
        let count = accounting(&job);
        if let Ok(count) = &count
            && root_waited
            && count.active == 0
        {
            break;
        }
        if launch_error.is_some()
            || wait == u32::MAX
            || count.is_err()
            || started.elapsed() > Duration::from_secs(30)
        {
            timed_out = started.elapsed() > Duration::from_secs(30);
            if !terminated {
                if unsafe { TerminateJobObject(job.0, 1223) } == 0 {
                    // Retain ownership; never claim settlement or release task assets.
                    eprintln!(">>> HELD: Job termination failed; awaiting verifiable settlement");
                } else {
                    terminated = true;
                }
            }
            if started.elapsed() > Duration::from_secs(40) {
                // An unknown kernel-control state is a gate blocker, not successful cleanup.
                // Keep handles and stdio ownership alive for explicit recovery.
                std::mem::forget(job);
                std::mem::forget(process);
                std::mem::forget(primary);
                std::mem::forget(stdin);
                std::mem::forget(stdout);
                std::mem::forget(stderr);
                return Err(
                    "HELD: root wait/Job zero not proven; retained handles, preserve workspace"
                        .into(),
                );
            }
        }
        thread::sleep(Duration::from_millis(10));
    }
    let count = accounting(&job)?;
    let mut exit_code = 0;
    if unsafe { GetExitCodeProcess(process.0, &mut exit_code) } == 0 {
        return Err(failure("root exit code"));
    }
    // No parent pipes or reader/callback threads exist; logs become immutable at this barrier.
    drop(stdin);
    drop(stdout);
    drop(stderr);
    if let Some(error) = launch_error {
        return Err(format!("{error}; root waited, Job zero, logs closed"));
    }
    Ok(Settlement {
        exit_code,
        total_processes: count.total,
        root_pid: info.pid,
        membership_before_resume: membership,
        root_waited,
        active_processes: count.active,
        inherited_log_handles_closed: true,
        timed_out,
    })
}
