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
fn held_count(events: &Mutex<Vec<ProcessObservation>>) -> usize {
    lock(events)
        .iter()
        .filter(|event| matches!(event, ProcessObservation::Held(_)))
        .count()
}
fn written_files(root: &std::path::Path) -> usize {
    std::fs::read_dir(root)
        .unwrap()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().starts_with("synthetic-"))
        .count()
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
fn cancel_recovers_held_writer_without_stopping_another_job() {
    let root = fixture::case("cancel-held-writer");
    let other_root = fixture::case("unrelated-job");
    let hooks = TestHooks::default();
    hooks.query_failure.store(true, Ordering::Release);
    let (control, events, worker, _guard) = start(spec(&root, "bounded-writer"), hooks.clone());
    let (other_control, _, other_worker, _other_guard) =
        start(spec(&other_root, "tree"), TestHooks::default());
    fixture::wait_for(
        || held(&events) && written_files(&root) >= 2,
        "Held writer producing files",
    );
    let other_marker = other_root.join("markers.txt");
    fixture::wait_for(|| fixture::tree_ready(&other_marker), "unrelated live tree");
    let other_handles = fixture::retain_tree(&other_marker);
    hooks.query_failure.store(false, Ordering::Release);
    control.cancel();
    fixture::wait_for(|| worker.is_finished(), "cancelled Held writer settlement");
    assert_error_settled(&root, worker, &events, "query failure");
    let settled_files = written_files(&root);
    thread::sleep(Duration::from_millis(200));
    assert_eq!(written_files(&root), settled_files, "writer continued after settlement");
    assert!(!other_worker.is_finished());
    assert!(other_handles.iter().all(|process| !process.stopped()));
    other_control.cancel();
    fixture::wait_for(|| other_worker.is_finished(), "unrelated tree cleanup");
    assert!(other_worker.join().unwrap().unwrap().facts.resources_releasable());
    assert!(other_handles.iter().all(|process| process.stopped()));
}

#[test]
fn cancel_query_failure_remains_held_until_explicit_retry() {
    let root = fixture::case("cancel-query-still-held");
    let hooks = TestHooks::default();
    hooks.query_failure.store(true, Ordering::Release);
    let (control, events, worker, _guard) = start(spec(&root, "bounded-writer"), hooks.clone());
    fixture::wait_for(
        || held(&events) && written_files(&root) >= 2,
        "query Held writer",
    );
    let handles = fixture::retain_tree(&root.join("markers.txt"));
    control.cancel();
    fixture::wait_for(
        || held_count(&events) >= 2 && handles.iter().all(|process| process.stopped()),
        "cancel retry and persistent query failure",
    );
    assert!(!worker.is_finished(), "unknown Job state released the owner");
    hooks.query_failure.store(false, Ordering::Release);
    for _ in 0..3 {
        control.cancel();
        thread::sleep(Duration::from_millis(50));
    }
    assert!(!worker.is_finished(), "repeated cancel silently retried query");
    control.retry_cleanup();
    fixture::wait_for(|| worker.is_finished(), "explicit query cleanup retry");
    assert_error_settled(&root, worker, &events, "query failure");
}

#[test]
fn cancel_terminate_failure_keeps_writer_held_until_explicit_retry() {
    let root = fixture::case("cancel-terminate-still-held");
    let hooks = TestHooks::default();
    hooks.query_failure.store(true, Ordering::Release);
    hooks.terminate_failure.store(true, Ordering::Release);
    let (control, events, worker, _guard) = start(spec(&root, "bounded-writer"), hooks.clone());
    fixture::wait_for(
        || held(&events) && written_files(&root) >= 2,
        "query Held writer",
    );
    let handles = fixture::retain_tree(&root.join("markers.txt"));
    hooks.query_failure.store(false, Ordering::Release);
    control.cancel();
    fixture::wait_for(
        || lock(&events).iter().any(|event| matches!(event, ProcessObservation::Held(reason) if reason.contains("TerminateJobObject failure"))),
        "cancel retry and persistent termination failure",
    );
    assert!(!worker.is_finished());
    assert!(handles.iter().all(|process| !process.stopped()));
    hooks.terminate_failure.store(false, Ordering::Release);
    let before = written_files(&root);
    for _ in 0..3 {
        control.cancel();
        thread::sleep(Duration::from_millis(50));
    }
    assert!(!worker.is_finished(), "repeated cancel silently retried termination");
    assert!(handles.iter().all(|process| !process.stopped()));
    assert!(written_files(&root) > before, "Held writer was not retained live");
    control.retry_cleanup();
    fixture::wait_for(|| worker.is_finished(), "explicit termination cleanup retry");
    assert_error_settled(&root, worker, &events, "TerminateJobObject failure");
    assert!(handles.iter().all(|process| process.stopped()));
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

#[test]
fn cancel_restarts_failed_driver_with_the_retained_owner() {
    let root = fixture::case("outer-owner-cancel");
    let marker = root.join("markers.txt");
    let hooks = TestHooks::default();
    hooks.owner_thread_panic.store(true, Ordering::Release);
    let (control, events, worker, _guard) = start(spec(&root, "tree"), hooks);
    fixture::wait_for(
        || held(&events) && fixture::tree_ready(&marker),
        "failed driver and live owner tree",
    );
    let handles = fixture::retain_tree(&marker);
    control.cancel();
    fixture::wait_for(|| worker.is_finished(), "cancel restarted the driver");
    assert_error_settled(&root, worker, &events, "unexpected owner thread panic");
    assert!(handles.iter().all(|process| process.stopped()));
}

#[test]
fn cancel_restarts_failed_driver_only_once_if_it_panics_again() {
    let root = fixture::case("outer-owner-cancel-repeat-failure");
    let marker = root.join("markers.txt");
    let hooks = TestHooks::default();
    hooks.owner_thread_panic.store(true, Ordering::Release);
    let (control, events, worker, _guard) = start(spec(&root, "tree"), hooks.clone());
    fixture::wait_for(
        || held(&events) && fixture::tree_ready(&marker),
        "failed driver and live owner tree",
    );
    let handles = fixture::retain_tree(&marker);
    hooks.owner_thread_panic.store(true, Ordering::Release);
    control.cancel();
    fixture::wait_for(|| held_count(&events) >= 2, "restarted driver panicked again");
    for _ in 0..3 {
        control.cancel();
        thread::sleep(Duration::from_millis(50));
    }
    assert!(!worker.is_finished(), "repeated cancel silently restarted the driver");
    assert!(handles.iter().all(|process| !process.stopped()));
    control.retry_cleanup();
    fixture::wait_for(|| worker.is_finished(), "explicit retry restarted the driver");
    assert_error_settled(&root, worker, &events, "unexpected owner thread panic");
    assert!(handles.iter().all(|process| process.stopped()));
}
