//! cfg(test)-only hooks at production owner/Win32 boundaries, with real native trees.
use super::*;
#[path = "windows_process_fixture.rs"]
mod fixture;

struct RecoveryGuard {
    hooks: TestHooks,
    control: Control,
}
impl Drop for RecoveryGuard {
    fn drop(&mut self) {
        self.hooks
            .pause_before_resume
            .store(false, Ordering::Release);
        self.hooks.query_failure.store(false, Ordering::Release);
        self.hooks.terminate_failure.store(false, Ordering::Release);
        self.hooks.owner_panic.store(false, Ordering::Release);
        self.hooks
            .owner_thread_panic
            .store(false, Ordering::Release);
        self.control.cancel();
        self.control.retry_cleanup();
    }
}
fn spec(root: &std::path::Path, mode: &str) -> ProcessSpec {
    ProcessSpec {
        executable: fixture::fixture(),
        args: vec![
            mode.into(),
            root.join("markers.txt").to_string_lossy().into(),
        ],
        cwd: root.to_path_buf(),
        env: vec![("PATH".into(), String::new())],
        stdout_limit: STDOUT_CAP,
        stderr_limit: STDERR_CAP,
        timeout: None,
    }
}
type StartedProcess = (
    Control,
    Arc<Mutex<Vec<ProcessObservation>>>,
    JoinHandle<Result<ProcessOutcome, String>>,
    RecoveryGuard,
);
fn start(input: ProcessSpec, hooks: TestHooks) -> StartedProcess {
    let control = Control::default();
    let worker_control = control.clone();
    let events = Arc::new(Mutex::new(Vec::new()));
    let recorded = events.clone();
    let worker_hooks = hooks.clone();
    let worker = thread::spawn(move || {
        run_internal(
            input,
            &worker_control,
            Arc::new(move |event| lock(&recorded).push(event)),
            worker_hooks,
        )
    });
    let guard = RecoveryGuard {
        hooks,
        control: control.clone(),
    };
    (control, events, worker, guard)
}
fn held(events: &Mutex<Vec<ProcessObservation>>) -> bool {
    lock(events)
        .iter()
        .any(|event| matches!(event, ProcessObservation::Held(_)))
}
fn assert_error_settled(
    root: &std::path::Path,
    worker: JoinHandle<Result<ProcessOutcome, String>>,
    events: &Mutex<Vec<ProcessObservation>>,
    reason: &str,
) {
    let error = worker.join().unwrap().unwrap_err();
    assert!(error.contains(reason), "{error}");
    let events = lock(events);
    let settled: Vec<_> = events
        .iter()
        .filter_map(|event| {
            if let ProcessObservation::Settled(facts) = event {
                Some(facts)
            } else {
                None
            }
        })
        .collect();
    assert_eq!(settled.len(), 1);
    assert!(settled[0].resources_releasable());
    fixture::write_record(root, "facts.txt", format!("{error}\n{events:#?}"));
}

#[test]
fn native_marker_cannot_run_before_membership_and_resume() {
    let root = fixture::case("pre-resume");
    let hooks = TestHooks::default();
    hooks.pause_before_resume.store(true, Ordering::Release);
    let (_, _, worker, _guard) = start(spec(&root, "echo"), hooks.clone());
    fixture::wait_for(
        || hooks.before_resume.load(Ordering::Acquire),
        "verified atomic membership checkpoint",
    );
    thread::sleep(Duration::from_millis(75));
    assert!(
        !root.join("markers.txt").exists(),
        "user code ran while primary thread suspended"
    );
    hooks.pause_before_resume.store(false, Ordering::Release);
    let result = worker.join().unwrap().unwrap();
    assert!(result.facts.membership_verified_before_resume);
    assert!(root.join("markers.txt").exists());
    fixture::write_record(&root, "facts.txt", format!("{:#?}", result.facts));
}

#[test]
fn cancel_during_suspended_launch_never_runs_user_code() {
    let root = fixture::case("launch-cancel-race");
    let hooks = TestHooks::default();
    hooks.pause_before_resume.store(true, Ordering::Release);
    let (control, events, worker, _guard) = start(spec(&root, "tree"), hooks.clone());
    fixture::wait_for(
        || hooks.before_resume.load(Ordering::Acquire),
        "suspended launch",
    );
    control.cancel();
    hooks.pause_before_resume.store(false, Ordering::Release);
    let result = worker.join().unwrap().unwrap();
    assert_eq!(result.exit_code, 1223);
    assert!(result.facts.resources_releasable());
    assert!(!root.join("markers.txt").exists());
    assert!(
        !lock(&events)
            .iter()
            .any(|event| matches!(event, ProcessObservation::Running { .. }))
    );
    fixture::write_record(&root, "facts.txt", format!("{:#?}", result.facts));
}

#[test]
fn persistent_query_retains_tree_and_requires_recovery_plus_explicit_retry() {
    let root = fixture::case("query-held");
    let marker = root.join("markers.txt");
    let hooks = TestHooks::default();
    hooks.query_failure.store(true, Ordering::Release);
    let (control, events, worker, _guard) = start(spec(&root, "tree"), hooks.clone());
    fixture::wait_for(
        || held(&events) && fixture::tree_ready(&marker),
        "Held live tree",
    );
    let handles = fixture::retain_tree(&marker);
    control.retry_cleanup();
    thread::sleep(Duration::from_millis(75));
    assert!(!worker.is_finished(), "query failure released ownership");
    // The genuine retry may terminate the tree, but lack of query proof still retains owner.
    hooks.query_failure.store(false, Ordering::Release);
    thread::sleep(Duration::from_millis(75));
    assert!(
        !worker.is_finished(),
        "fault removal silently bypassed explicit retry"
    );
    control.retry_cleanup();
    assert_error_settled(&root, worker, &events, "query failure");
    assert!(handles.iter().all(|process| process.stopped()));
}

#[test]
fn persistent_terminate_failure_retains_live_child_and_grandchild_until_recovery() {
    let root = fixture::case("terminate-held");
    let marker = root.join("markers.txt");
    let hooks = TestHooks::default();
    hooks.terminate_failure.store(true, Ordering::Release);
    let mut input = spec(&root, "tree");
    input.timeout = Some(Duration::from_millis(30));
    let (control, events, worker, _guard) = start(input, hooks.clone());
    fixture::wait_for(|| fixture::tree_ready(&marker), "real descendants");
    let handles = fixture::retain_tree(&marker);
    control.cancel();
    fixture::wait_for(|| held(&events), "failed termination Held");
    control.retry_cleanup();
    thread::sleep(Duration::from_millis(75));
    assert!(!worker.is_finished());
    assert!(
        handles.iter().all(|process| !process.stopped()),
        "owner drop killed tree without proof"
    );
    hooks.terminate_failure.store(false, Ordering::Release);
    thread::sleep(Duration::from_millis(75));
    assert!(!worker.is_finished());
    assert!(handles.iter().all(|process| !process.stopped()));
    control.retry_cleanup();
    assert_error_settled(&root, worker, &events, "TerminateJobObject failure");
    assert!(handles.iter().all(|process| process.stopped()));
}

#[test]
fn precreate_failure_with_unknown_job_zero_holds_without_false_terminal() {
    let root = fixture::case("create-query-held");
    let hooks = TestHooks::default();
    hooks.query_failure.store(true, Ordering::Release);
    let mut input = spec(&root, "echo");
    input.executable = root.join("missing.exe");
    let (control, events, worker, _guard) = start(input, hooks.clone());
    fixture::wait_for(|| held(&events), "failed-create query Held");
    thread::sleep(Duration::from_millis(75));
    assert!(!worker.is_finished());
    assert!(
        !lock(&events)
            .iter()
            .any(|event| matches!(event, ProcessObservation::Settled(_)))
    );
    assert!(!root.join("markers.txt").exists());
    hooks.query_failure.store(false, Ordering::Release);
    control.retry_cleanup();
    assert_error_settled(&root, worker, &events, "CreateProcessW");
}

#[test]
fn owner_operation_panic_retains_handles_and_cleanup_driver_recovers() {
    let root = fixture::case("owner-panic-held");
    let marker = root.join("markers.txt");
    let hooks = TestHooks::default();
    hooks.owner_panic.store(true, Ordering::Release);
    let (control, events, worker, _guard) = start(spec(&root, "tree"), hooks);
    fixture::wait_for(
        || held(&events) && fixture::tree_ready(&marker),
        "panic Held and live owner tree",
    );
    let handles = fixture::retain_tree(&marker);
    thread::sleep(Duration::from_millis(100));
    assert!(!worker.is_finished());
    assert!(
        handles.iter().all(|process| !process.stopped()),
        "unwind dropped kill-on-close owner"
    );
    control.retry_cleanup();
    assert_error_settled(&root, worker, &events, "owner operation panic");
    assert!(handles.iter().all(|process| process.stopped()));
}

#[test]
fn actual_reader_panic_is_joined_and_never_returns_false_success() {
    let root = fixture::case("reader-panic");
    let hooks = TestHooks::default();
    hooks.reader_panic.store(true, Ordering::Release);
    let (_, events, worker, _guard) = start(spec(&root, "flood"), hooks);
    assert_error_settled(&root, worker, &events, "reader panic");
}

#[test]
fn outer_owner_thread_panic_retains_resources_for_new_driver() {
    let root = fixture::case("outer-owner-thread-panic");
    let marker = root.join("markers.txt");
    let hooks = TestHooks::default();
    hooks.owner_thread_panic.store(true, Ordering::Release);
    let (control, events, worker, _guard) = start(spec(&root, "tree"), hooks);
    fixture::wait_for(
        || held(&events) && fixture::tree_ready(&marker),
        "outer owner unwind Held",
    );
    let handles = fixture::retain_tree(&marker);
    thread::sleep(Duration::from_millis(100));
    assert!(!worker.is_finished());
    assert!(handles.iter().all(|process| !process.stopped()));
    control.retry_cleanup();
    assert_error_settled(&root, worker, &events, "unexpected owner thread panic");
    assert!(handles.iter().all(|process| process.stopped()));
}
