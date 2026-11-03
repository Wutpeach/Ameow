#![allow(dead_code)]
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{
        OnceLock,
        atomic::{AtomicU64, Ordering},
    },
    thread,
    time::{Duration, Instant},
};
use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
use windows_sys::Win32::{Foundation::*, System::Threading::*};

static FIXTURE: OnceLock<PathBuf> = OnceLock::new();
static CASE: AtomicU64 = AtomicU64::new(0);
pub fn session_root() -> PathBuf {
    std::env::var_os("AMEOW_PROCESS_EVIDENCE_ROOT").map(PathBuf::from).unwrap_or_else(||
        PathBuf::from("D:/Ameow/.trellis/tasks/10-10-tra23-r1-stage-a-rust-download-kernel/research/stage-a-process"))
        .join(format!("run-{}", std::process::id()))
        // This helper is included by several modules, each with its own OnceLock.
        // Keep their compiler outputs and case counters independent under parallel tests.
        .join(module_path!().replace("::", "-"))
}
pub fn fixture() -> PathBuf {
    FIXTURE
        .get_or_init(|| {
            let root = session_root().join("helper");
            fs::create_dir_all(&root).unwrap();
            let executable = root.join("windows-process-tree.exe");
            let source = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/windows_process_tree.rs");
            let compiler = std::env::var_os("RUSTC")
                .map(PathBuf::from)
                .unwrap_or_else(|| {
                    PathBuf::from(std::env::var_os("USERPROFILE").unwrap())
                        .join(".cargo/bin/rustc.exe")
                });
            let output = Command::new(compiler)
                .args(["--edition=2024", "-C", "opt-level=1"])
                .arg(&source)
                .arg("-o")
                .arg(&executable)
                .output()
                .unwrap();
            fs::write(root.join("rustc-stdout.log"), &output.stdout).unwrap();
            fs::write(root.join("rustc-stderr.log"), &output.stderr).unwrap();
            assert!(output.status.success(), "native fixture compilation failed");
            executable
        })
        .clone()
}
pub fn case(name: &str) -> PathBuf {
    let root = session_root().join(format!("{}-{name}", CASE.fetch_add(1, Ordering::Relaxed)));
    fs::create_dir_all(&root).unwrap();
    root
}
pub fn wait_for(mut predicate: impl FnMut() -> bool, reason: &str) {
    let began = Instant::now();
    while !predicate() {
        assert!(
            began.elapsed() < Duration::from_secs(10),
            "timed out: {reason}"
        );
        thread::sleep(Duration::from_millis(5));
    }
}
pub fn marker(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_default()
}
pub fn tree_ready(path: &Path) -> bool {
    let text = marker(path);
    text.contains("root ") && text.contains("child ") && text.contains("grandchild ")
}
pub struct RetainedProcess(usize);
impl RetainedProcess {
    pub fn open(pid: u32) -> Self {
        let raw = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };
        assert!(!raw.is_null(), "cannot retain exact fixture PID {pid}");
        Self(raw as usize)
    }
    pub fn stopped(&self) -> bool {
        match unsafe { WaitForSingleObject(self.0 as HANDLE, 0) } {
            WAIT_OBJECT_0 => true,
            WAIT_TIMEOUT => false,
            other => panic!("retained process wait failed: {other}"),
        }
    }
}
impl Drop for RetainedProcess {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.0 as HANDLE) };
    }
}
pub fn retain_tree(path: &Path) -> Vec<RetainedProcess> {
    marker(path)
        .lines()
        .filter(|line| !line.starts_with("flood-done"))
        .map(|line| RetainedProcess::open(line.split_whitespace().nth(1).unwrap().parse().unwrap()))
        .collect()
}
pub fn write_record(root: &Path, name: &str, text: impl AsRef<[u8]>) {
    fs::write(root.join(name), text).unwrap();
}

pub struct InheritableSentinel(usize);
impl InheritableSentinel {
    pub fn new() -> Self {
        let attributes = SECURITY_ATTRIBUTES {
            nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: std::ptr::null_mut(),
            bInheritHandle: 1,
        };
        let raw = unsafe { CreateEventW(&attributes, 1, 0, std::ptr::null()) };
        assert!(!raw.is_null());
        Self(raw as usize)
    }
    pub fn raw_value(&self) -> usize {
        self.0
    }
    pub fn signaled(&self) -> bool {
        unsafe { WaitForSingleObject(self.0 as HANDLE, 0) == WAIT_OBJECT_0 }
    }
}
impl Drop for InheritableSentinel {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.0 as HANDLE) };
    }
}
