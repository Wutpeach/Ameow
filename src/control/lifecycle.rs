//! Graceful desktop shutdown and a bounded, one-shot restart observer.
use crate::download::queue::DownloadCoordinator;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Receipt {
    pub pid: u32,
    pub id: String,
    pub instance_id: String,
    pub action: String,
    pub phase: String,
    pub done: bool,
    pub success: Option<bool>,
    pub error: Option<String>,
    pub new_instance_id: Option<String>,
}
fn valid_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit())
}
fn receipt_path(root: &Path, id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) {
        return Err("E_LIFECYCLE_ID".into());
    }
    Ok(root.join("lifecycle-receipt.json"))
}
/// Read a bounded receipt by the operation id supplied by this instance.
pub fn read_receipt(root: &Path, id: &str) -> Result<Receipt, String> {
    use std::io::Read;
    let path = receipt_path(root, id)?;
    let guard = receipt_guard(root)?;
    guard
        .lock_shared()
        .map_err(|error| receipt_io_error("read lock", &error))?;
    let file = std::fs::File::open(path).map_err(|_| "E_LIFECYCLE_RECEIPT")?;
    let mut bytes = Vec::new();
    file.take(4097)
        .read_to_end(&mut bytes)
        .map_err(|_| "E_LIFECYCLE_RECEIPT")?;
    if bytes.len() > 4096 {
        return Err("E_LIFECYCLE_RECEIPT".into());
    }
    let receipt: Receipt = serde_json::from_slice(&bytes).map_err(|_| "E_LIFECYCLE_RECEIPT")?;
    if receipt.id != id
        || !valid_id(&receipt.instance_id)
        || !matches!(receipt.action.as_str(), "quit" | "restart")
    {
        return Err("E_LIFECYCLE_RECEIPT".into());
    }
    Ok(receipt)
}
fn receipt_io_error(operation: &str, error: &std::io::Error) -> String {
    format!(
        "E_LIFECYCLE_RECEIPT: {operation} (os={:?}, kind={:?})",
        error.raw_os_error(),
        error.kind()
    )
}
fn receipt_guard(root: &Path) -> Result<std::fs::File, String> {
    // Windows can deny replacement while another process has the receipt open.
    // Lock a stable sibling so readers and the atomic rename cannot overlap.
    std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(root.join("lifecycle-receipt.lock"))
        .map_err(|error| receipt_io_error("lock file", &error))
}
fn write_receipt(root: &Path, receipt: &Receipt) -> Result<(), String> {
    use std::io::Write;
    let path = receipt_path(root, &receipt.id)?;
    let guard = receipt_guard(root)?;
    guard
        .lock()
        .map_err(|error| receipt_io_error("write lock", &error))?;
    let mut file = tempfile::NamedTempFile::new_in(root)
        .map_err(|error| receipt_io_error("create", &error))?;
    serde_json::to_writer(&mut file, receipt).map_err(|_| "E_LIFECYCLE_RECEIPT")?;
    file.flush()
        .map_err(|error| receipt_io_error("flush", &error))?;
    file.into_temp_path()
        .persist(path)
        .map_err(|error| receipt_io_error("replace", &error.error))?;
    Ok(())
}

#[derive(Default)]
pub struct Lifecycle {
    root: Option<PathBuf>,
    instance: Option<String>,
    isolated: bool,
    operation: Option<Receipt>,
    notified: bool,
}
impl Lifecycle {
    pub fn configure(&mut self, root: &Path, instance: &str, isolated: bool) {
        self.root = Some(root.to_path_buf());
        self.instance = Some(instance.to_owned());
        self.isolated = isolated;
    }
    pub fn request(
        &mut self,
        action: &str,
        allowed: bool,
        queue: &DownloadCoordinator,
    ) -> Result<Value, super::ControlError> {
        let err = |message: String| super::ControlError::new("E_LIFECYCLE", message);
        if !allowed || self.operation.is_some() {
            return Err(super::ControlError::new(
                "E_APP_UPDATE_BUSY",
                "Desktop is already stopping or updating",
            ));
        }
        if !matches!(action, "quit" | "restart") {
            return Err(super::ControlError::new(
                "E_INVALID_REQUEST",
                "Invalid lifecycle action",
            ));
        }
        let root = self
            .root
            .as_ref()
            .ok_or_else(|| err("Desktop lifecycle owner is unavailable".into()))?;
        let instance = self
            .instance
            .as_ref()
            .ok_or_else(|| err("Desktop identity is unavailable".into()))?;
        let id = super::nonce()?;
        let mut receipt = Receipt {
            pid: std::process::id(),
            id: id.clone(),
            instance_id: instance.clone(),
            action: action.into(),
            phase: "starting_observer".into(),
            done: false,
            success: None,
            error: None,
            new_instance_id: None,
        };
        write_receipt(root, &receipt).map_err(err)?;
        let current = std::env::current_exe().map_err(|e| err(e.to_string()))?;
        // Use this version's helper; an older stable CLI may not know the private observer mode.
        let cli = current
            .parent()
            .ok_or_else(|| err("Missing app directory".into()))?
            .join(if cfg!(windows) {
                "ameow-cli.exe"
            } else {
                "ameow-cli"
            });
        let mut helper = Command::new(cli);
        helper
            .arg("--internal-lifecycle-observer")
            .arg(root)
            .arg(&id)
            .arg(std::process::id().to_string())
            .arg(&current)
            .arg(if self.isolated { "isolated" } else { "normal" })
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            helper.creation_flags(0x08000000);
        }
        let mut child = helper
            .spawn()
            .map_err(|e| err(format!("Cannot start lifecycle observer: {e}")))?;
        let start = Instant::now();
        loop {
            if let Ok(state) = read_receipt(root, &id) {
                if state.phase == "waiting_for_exit" {
                    receipt = state;
                    break;
                }
                if state.done {
                    return Err(err(state
                        .error
                        .unwrap_or_else(|| "Lifecycle observer failed".into())));
                }
            }
            if child.try_wait().ok().flatten().is_some()
                || start.elapsed() >= Duration::from_secs(5)
            {
                return Err(err(
                    "Lifecycle observer did not become ready; desktop remains running".into(),
                ));
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        self.arm(queue, receipt)
    }
    fn arm(
        &mut self,
        queue: &DownloadCoordinator,
        mut receipt: Receipt,
    ) -> Result<Value, super::ControlError> {
        receipt.phase = "armed".into();
        write_receipt(
            self.root.as_ref().expect("configured lifecycle owner"),
            &receipt,
        )
        .map_err(|message| super::ControlError::new("E_LIFECYCLE", message))?;
        self.operation = Some(receipt);
        // Close GUI and CLI admission before acknowledging the request. The next
        // desktop poll may process a GUI command before it polls this lifecycle.
        queue.drain_for_app_update();
        Ok(self.snapshot(queue.snapshot().stopped))
    }
    pub fn snapshot(&self, stopped: bool) -> Value {
        match &self.operation {
            Some(op) => {
                let mut result = json!(op);
                result["phase"] = json!(if stopped {
                    "queue_stopped"
                } else {
                    "waiting_for_tasks"
                });
                result
            }
            None => json!({"action":null,"phase":"idle","done":false,"success":null}),
        }
    }
    pub fn poll(&mut self, queue: &DownloadCoordinator) -> bool {
        if self.operation.is_some() && !self.notified && queue.drain_for_app_update() {
            self.notified = true;
            return true;
        }
        false
    }
}

#[cfg(windows)]
struct ProcessHandle(std::os::windows::io::OwnedHandle);
#[cfg(windows)]
impl ProcessHandle {
    fn open(pid: u32) -> Result<Self, String> {
        use std::os::windows::io::FromRawHandle;
        use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_SYNCHRONIZE};
        let handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };
        if handle.is_null() {
            return Err("E_LIFECYCLE_PROCESS".into());
        }
        Ok(Self(unsafe {
            std::os::windows::io::OwnedHandle::from_raw_handle(handle)
        }))
    }
    fn wait(&self) -> Result<(), String> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::{
            Foundation::WAIT_OBJECT_0, System::Threading::WaitForSingleObject,
        };
        if unsafe { WaitForSingleObject(self.0.as_raw_handle(), 31 * 24 * 60 * 60 * 1000) }
            == WAIT_OBJECT_0
        {
            Ok(())
        } else {
            Err("E_LIFECYCLE_PROCESS".into())
        }
    }
}
#[cfg(target_os = "macos")]
struct ProcessHandle(u32);
#[cfg(target_os = "macos")]
impl ProcessHandle {
    fn open(pid: u32) -> Result<Self, String> {
        if pid == 0 || unsafe { libc::kill(pid as i32, 0) } != 0 {
            Err("E_LIFECYCLE_PROCESS".into())
        } else {
            Ok(Self(pid))
        }
    }
    fn wait(&self) -> Result<(), String> {
        let started = Instant::now();
        loop {
            if unsafe { libc::kill(self.0 as i32, 0) } != 0 {
                return if std::io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH) {
                    Ok(())
                } else {
                    Err("E_LIFECYCLE_PROCESS".into())
                };
            }
            if started.elapsed() >= Duration::from_secs(31 * 24 * 60 * 60) {
                return Err("E_LIFECYCLE_PROCESS_TIMEOUT".into());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }
}

/// Internal CLI-only mode. Returns None for ordinary CLI invocations.
pub fn observer_main(args: &[std::ffi::OsString]) -> Option<i32> {
    if args
        .first()
        .is_none_or(|arg| arg != "--internal-lifecycle-observer")
    {
        return None;
    }
    Some(observer(args).map(|_| 0).unwrap_or(1))
}
fn observer(args: &[std::ffi::OsString]) -> Result<(), String> {
    if args.len() != 6 {
        return Err("E_LIFECYCLE_ARGUMENT".into());
    }
    let root = PathBuf::from(&args[1])
        .canonicalize()
        .map_err(|_| "E_LIFECYCLE_ROOT")?;
    let id = args[2].to_str().ok_or("E_LIFECYCLE_ID")?;
    let pid: u32 = args[3]
        .to_str()
        .ok_or("E_LIFECYCLE_PROCESS")?
        .parse()
        .map_err(|_| "E_LIFECYCLE_PROCESS")?;
    let app = PathBuf::from(&args[4]);
    let isolated = match args[5].to_str() {
        Some("isolated") => true,
        Some("normal") => false,
        _ => return Err("E_LIFECYCLE_ARGUMENT".into()),
    };
    let helper = std::env::current_exe().map_err(|_| "E_LIFECYCLE_PATH")?;
    let expected = helper
        .parent()
        .ok_or("E_LIFECYCLE_PATH")?
        .join(if cfg!(windows) { "Ameow.exe" } else { "ameow" });
    if !app
        .canonicalize()
        .ok()
        .zip(expected.canonicalize().ok())
        .is_some_and(|(a, b)| a == b)
    {
        return Err("E_LIFECYCLE_PATH".into());
    }
    let mut receipt = read_receipt(&root, id)?;
    if receipt.phase != "starting_observer" || receipt.done {
        return Err("E_LIFECYCLE_RECEIPT".into());
    }
    if receipt.pid != pid || pid == 0 {
        return Err("E_LIFECYCLE_PROCESS_IDENTITY".into());
    }
    let process = ProcessHandle::open(pid)?;
    receipt.phase = "waiting_for_exit".into();
    write_receipt(&root, &receipt)?;
    let armed = Instant::now();
    loop {
        if read_receipt(&root, id).is_ok_and(|r| r.phase == "armed") {
            break;
        }
        if armed.elapsed() >= Duration::from_secs(6) {
            return Err("E_LIFECYCLE_NOT_ARMED".into());
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    let result = (|| -> Result<(), String> {
        process.wait()?;
        if receipt.action == "quit" {
            return Ok(());
        }
        receipt.phase = "starting".into();
        write_receipt(&root, &receipt)?;
        let entry = crate::app_update::startup_entry_for(&app)?;
        let mut command = Command::new(entry);
        command
            .arg("--cli-launch")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        if isolated {
            command
                .arg("--instance-root")
                .arg(&root)
                .arg("--runtime-root")
                .arg(root.join("runtime"))
                .arg("--settings-path")
                .arg(root.join("settings.json"))
                .arg("--output")
                .arg(root.join("output"));
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().map_err(|_| "E_LIFECYCLE_START")?;
        let started = Instant::now();
        while started.elapsed() < Duration::from_secs(30) {
            let request = super::Request {
                protocol_version: super::PROTOCOL_VERSION,
                request_id: super::nonce().map_err(|_| "E_LIFECYCLE_ID")?,
                instance_id: None,
                command: super::Command::Hello {},
            };
            if let Ok(reply) = super::rpc(&root, &request) {
                if reply.ok
                    && reply.instance_id != receipt.instance_id
                    && reply.result.as_ref().is_some_and(|r| {
                        r["startup_pending"] == false && r["commands_allowed"] == true
                    })
                {
                    receipt.new_instance_id = Some(reply.instance_id);
                    return Ok(());
                }
            }
            // The stable launcher may still be releasing its old-instance lease.
            if child.try_wait().map_err(|_| "E_LIFECYCLE_START")?.is_some() {
                std::thread::sleep(Duration::from_millis(250));
                child = command.spawn().map_err(|_| "E_LIFECYCLE_START")?;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        Err("E_LIFECYCLE_NEW_OWNER_UNCONFIRMED".into())
    })();
    receipt.done = true;
    receipt.success = Some(result.is_ok());
    receipt.phase = if result.is_ok() {
        "completed"
    } else {
        "failed"
    }
    .into();
    receipt.error = result.err();
    write_receipt(&root, &receipt)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn receipt_atomic_handoff_preserves_complete_data_while_observed() {
        let root = tempfile::tempdir().unwrap();
        let mut receipt = Receipt {
            pid: std::process::id(),
            id: "a".repeat(32),
            instance_id: "b".repeat(32),
            action: "quit".into(),
            phase: "starting_observer".into(),
            done: false,
            success: None,
            error: None,
            new_instance_id: None,
        };
        write_receipt(root.path(), &receipt).unwrap();
        let observing = std::sync::atomic::AtomicBool::new(true);
        std::thread::scope(|scope| {
            let reader = scope.spawn(|| {
                while observing.load(std::sync::atomic::Ordering::Relaxed) {
                    let current = read_receipt(root.path(), &"a".repeat(32)).unwrap();
                    assert_eq!(current.instance_id, "b".repeat(32));
                    std::thread::yield_now();
                }
            });
            for phase in ["waiting_for_exit", "armed", "completed"]
                .into_iter()
                .cycle()
                .take(200)
            {
                receipt.phase = phase.into();
                if let Err(error) = write_receipt(root.path(), &receipt) {
                    observing.store(false, std::sync::atomic::Ordering::Relaxed);
                    reader.join().unwrap();
                    panic!("{error}");
                }
            }
            observing.store(false, std::sync::atomic::Ordering::Relaxed);
            reader.join().unwrap();
        });
        assert_eq!(
            read_receipt(root.path(), &receipt.id).unwrap().phase,
            receipt.phase
        );
    }
    #[test]
    fn receipt_is_bounded_and_bound_to_the_requested_operation() {
        let root = tempfile::tempdir().unwrap();
        let receipt = Receipt {
            pid: std::process::id(),
            id: "a".repeat(32),
            instance_id: "b".repeat(32),
            action: "restart".into(),
            phase: "waiting_for_exit".into(),
            done: false,
            success: None,
            error: None,
            new_instance_id: None,
        };
        write_receipt(root.path(), &receipt).unwrap();
        assert_eq!(
            read_receipt(root.path(), &receipt.id).unwrap().instance_id,
            receipt.instance_id
        );
        assert!(read_receipt(root.path(), "../outside").is_err());
        std::fs::write(
            receipt_path(root.path(), &receipt.id).unwrap(),
            vec![b'x'; 4097],
        )
        .unwrap();
        assert!(read_receipt(root.path(), &receipt.id).is_err());
    }
    #[test]
    fn drain_does_not_cancel_existing_tasks_or_claim_process_exit() {
        let root = tempfile::tempdir().unwrap();
        let queue = DownloadCoordinator::update_test_queue(root.path());
        let job = queue.submit("https://youtu.be/00000000001".into()).unwrap();
        let mut lifecycle = Lifecycle::default();
        lifecycle.operation = Some(Receipt {
            pid: std::process::id(),
            id: "a".repeat(32),
            instance_id: "b".repeat(32),
            action: "quit".into(),
            phase: "armed".into(),
            done: false,
            success: None,
            error: None,
            new_instance_id: None,
        });
        assert!(!lifecycle.poll(&queue));
        let state = queue.snapshot();
        assert!(!state.stopping);
        assert!(
            !state
                .jobs
                .iter()
                .find(|item| item.job_id == job)
                .unwrap()
                .phase
                .terminal()
        );
        assert!(queue.submit("https://youtu.be/00000000002".into()).is_err());
        assert_eq!(lifecycle.snapshot(true)["done"], false);
    }
    #[test]
    fn accepted_lifecycle_closes_gui_admission_before_any_poll() {
        for action in ["quit", "restart"] {
            let root = tempfile::tempdir().unwrap();
            let queue = DownloadCoordinator::update_test_queue(root.path());
            let job = queue.submit("https://youtu.be/00000000001".into()).unwrap();
            let mut lifecycle = Lifecycle::default();
            lifecycle.configure(root.path(), &"b".repeat(32), true);
            let reply = lifecycle
                .arm(
                    &queue,
                    Receipt {
                        pid: std::process::id(),
                        id: "a".repeat(32),
                        instance_id: "b".repeat(32),
                        action: action.into(),
                        phase: "waiting_for_exit".into(),
                        done: false,
                        success: None,
                        error: None,
                        new_instance_id: None,
                    },
                )
                .unwrap();
            assert_eq!(reply["action"], action);
            assert_eq!(reply["done"], false);
            // The GUI submits straight to the coordinator. No lifecycle/server
            // poll has happened between acceptance and this new submission.
            assert!(
                queue
                    .submit("https://youtu.be/00000000002".into())
                    .unwrap_err()
                    .starts_with("E_STOPPING")
            );
            assert!(
                queue
                    .retry(job)
                    .unwrap_err()
                    .starts_with("E_APP_UPDATE_DRAINING")
            );
            let state = queue.snapshot();
            assert!(!state.stopping);
            assert!(
                !state
                    .jobs
                    .iter()
                    .find(|item| item.job_id == job)
                    .unwrap()
                    .phase
                    .terminal()
            );
        }
    }
}
