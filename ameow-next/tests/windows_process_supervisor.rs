#![cfg(windows)]
use ameow_next::download::process_supervisor::{
    self as process, Control, ProcessObservation, ProcessSpec,
};
use std::{
    fs,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};
#[path = "support/windows_process_fixture.rs"]
mod fixture;

fn spec(root: &std::path::Path, mode: &str) -> ProcessSpec {
    ProcessSpec {
        executable: fixture::fixture(),
        args: vec![
            mode.into(),
            root.join("markers.txt").to_string_lossy().into(),
        ],
        cwd: root.to_path_buf(),
        env: vec![("PATH".into(), String::new())],
        stdout_limit: usize::MAX,
        stderr_limit: usize::MAX,
        timeout: None,
    }
}
type Observations = Arc<Mutex<Vec<ProcessObservation>>>;
type Observer = Arc<dyn Fn(ProcessObservation) + Send + Sync>;
fn observer() -> (Observations, Observer) {
    let events = Arc::new(Mutex::new(Vec::new()));
    let observed = events.clone();
    (
        events,
        Arc::new(move |event| observed.lock().unwrap().push(event)),
    )
}
fn assert_settled_once(events: &[ProcessObservation]) {
    let facts: Vec<_> = events
        .iter()
        .filter_map(|event| {
            if let ProcessObservation::Settled(facts) = event {
                Some(facts)
            } else {
                None
            }
        })
        .collect();
    assert_eq!(facts.len(), 1);
    assert!(facts[0].resources_releasable());
}

#[test]
fn root_first_and_closed_stdio_wait_for_descendant_job_zero() {
    let root = fixture::case("root-first");
    let (events, callback) = observer();
    let began = Instant::now();
    let result = process::run(spec(&root, "root-first"), &Control::default(), callback).unwrap();
    assert_eq!(result.exit_code, 0);
    assert!(result.facts.root_first_observed);
    assert!(result.facts.total_processes >= 3);
    assert!(result.facts.resources_releasable());
    assert!(result.facts.membership_verified_before_resume);
    assert!(began.elapsed() >= Duration::from_millis(1000));
    let marker = fixture::marker(&root.join("markers.txt"));
    assert!(
        marker
            .lines()
            .all(|line| line.contains("job=1 console=false"))
    );
    assert_settled_once(&events.lock().unwrap());
    fixture::write_record(
        &root,
        "facts.txt",
        format!(
            "{:#?}\nelapsed={:?}\n{marker}",
            result.facts,
            began.elapsed()
        ),
    );
}

#[test]
fn cancellation_waits_for_root_child_grandchild_and_readers() {
    let root = fixture::case("cancel-tree");
    let marker = root.join("markers.txt");
    let control = Control::default();
    let worker_control = control.clone();
    let input = spec(&root, "tree");
    let (events, callback) = observer();
    let worker = thread::spawn(move || process::run(input, &worker_control, callback));
    fixture::wait_for(
        || fixture::tree_ready(&marker),
        "native descendants started",
    );
    let handles = fixture::retain_tree(&marker);
    assert_eq!(handles.len(), 3);
    control.cancel();
    let result = worker.join().unwrap().unwrap();
    assert_eq!(result.exit_code, 1223);
    assert!(handles.iter().all(|process| process.stopped()));
    assert!(result.facts.resources_releasable());
    assert!(result.facts.total_processes >= 3);
    assert_settled_once(&events.lock().unwrap());
    fixture::write_record(
        &root,
        "facts.txt",
        format!("{:#?}\n{}", result.facts, fixture::marker(&marker)),
    );
}

#[test]
fn flood_is_fully_drained_and_capture_capped_when_observer_ignores_output() {
    let root = fixture::case("ignored-flood");
    let result = process::run(spec(&root, "flood"), &Control::default(), Arc::new(|_| {})).unwrap();
    assert_eq!(result.exit_code, 0);
    assert_eq!(result.facts.stdout_bytes, 7 * 1024 * 1024);
    assert_eq!(result.facts.stderr_bytes, 2 * 1024 * 1024);
    assert_eq!(result.stdout.len(), 4 * 1024 * 1024);
    assert_eq!(result.stderr.len(), 1024 * 1024);
    assert!(result.facts.stdout_truncated && result.facts.stderr_truncated);
    assert!(result.stdout.iter().all(|&byte| byte == b'O'));
    assert!(result.stderr.iter().all(|&byte| byte == b'E'));
    assert!(result.facts.resources_releasable());
    fixture::write_record(&root, "facts.txt", format!("{:#?}", result.facts));
}

#[test]
fn blocked_consumer_cannot_block_draining_and_must_join_before_return() {
    let root = fixture::case("blocked-consumer");
    let marker = root.join("markers.txt");
    let entered = Arc::new(AtomicBool::new(false));
    let release = Arc::new(AtomicBool::new(false));
    let callback_entered = entered.clone();
    let callback_release = release.clone();
    let callback = Arc::new(move |event| {
        if matches!(event, ProcessObservation::Output { .. })
            && !callback_entered.swap(true, Ordering::AcqRel)
        {
            while !callback_release.load(Ordering::Acquire) {
                thread::sleep(Duration::from_millis(2));
            }
        }
    });
    let input = spec(&root, "flood");
    let worker = thread::spawn(move || process::run(input, &Control::default(), callback));
    fixture::wait_for(|| entered.load(Ordering::Acquire), "consumer entered");
    fixture::wait_for(
        || fixture::marker(&marker).contains("flood-done"),
        "all pipe bytes drained despite blocked consumer",
    );
    assert!(
        !worker.is_finished(),
        "return before actual callback consumer join"
    );
    release.store(true, Ordering::Release);
    let result = worker.join().unwrap().unwrap();
    assert_eq!(result.facts.stdout_bytes, 7 * 1024 * 1024);
    assert_eq!(result.facts.stderr_bytes, 2 * 1024 * 1024);
    assert!(result.facts.resources_releasable());
    fixture::write_record(&root, "facts.txt", format!("{:#?}", result.facts));
}

#[test]
fn callback_panic_after_flood_is_known_failure_after_real_joins() {
    let root = fixture::case("callback-panic");
    let marker = root.join("markers.txt");
    let (events, record) = observer();
    let callback = Arc::new(move |event| {
        if matches!(event, ProcessObservation::Output { .. }) {
            fixture::wait_for(
                || fixture::marker(&marker).contains("flood-done"),
                "independent readers drain before callback panic",
            );
            panic!("actual regression consumer panic");
        }
        record(event);
    });
    let error = process::run(spec(&root, "flood"), &Control::default(), callback).unwrap_err();
    assert!(error.contains("callback panic"));
    let events = events.lock().unwrap();
    assert_settled_once(&events);
    let facts = events
        .iter()
        .find_map(|event| {
            if let ProcessObservation::Settled(facts) = event {
                Some(facts)
            } else {
                None
            }
        })
        .unwrap();
    assert_eq!(facts.stdout_bytes, 7 * 1024 * 1024);
    assert_eq!(facts.stderr_bytes, 2 * 1024 * 1024);
    fixture::write_record(&root, "facts.txt", format!("{error}\n{events:#?}"));
}

#[test]
fn missing_executable_is_failed_only_after_job_zero_and_consumer_join() {
    let root = fixture::case("create-failure");
    let mut input = spec(&root, "echo");
    input.executable = root.join("does-not-exist.exe");
    let (events, callback) = observer();
    let error = process::run(input, &Control::default(), callback).unwrap_err();
    assert!(error.contains("CreateProcessW"));
    assert!(!root.join("markers.txt").exists());
    let events = events.lock().unwrap();
    assert_settled_once(&events);
    fixture::write_record(&root, "facts.txt", format!("{error}\n{events:#?}"));
}

#[test]
fn explicit_environment_and_argv_preserve_unicode_quotes_and_trailing_slashes() {
    let root = fixture::case("explicit-env-argv").join("space 中文");
    fs::create_dir_all(&root).unwrap();
    let mut input = spec(&root, "echo");
    input
        .env
        .push(("AMEOW_TEST_ONLY".into(), "explicit 中文".into()));
    let arguments = [
        "",
        "space name",
        "embedded\"quote",
        "trailing\\",
        "\\\"complex 中文",
    ];
    input.args.extend(arguments.iter().map(|arg| (*arg).into()));
    let result = process::run(input, &Control::default(), Arc::new(|_| {})).unwrap();
    let text = String::from_utf8(result.stdout).unwrap();
    assert!(text.starts_with(&format!("{}\n", arguments.join("\n"))));
    assert!(text.contains("PATH=\nTEST=explicit 中文\n"));
    let actual_cwd = text
        .lines()
        .find_map(|line| line.strip_prefix("CWD="))
        .unwrap();
    assert_eq!(
        std::path::Path::new(actual_cwd).canonicalize().unwrap(),
        root.canonicalize().unwrap()
    );
    fixture::write_record(&root, "facts.txt", format!("{:#?}\n{text}", result.facts));
}

#[test]
fn timeout_requests_termination_and_reports_error_with_all_barriers() {
    let root = fixture::case("timeout");
    let mut input = spec(&root, "tree");
    input.timeout = Some(Duration::from_millis(200));
    let (events, callback) = observer();
    let error = process::run(input, &Control::default(), callback).unwrap_err();
    assert!(error.contains("timeout requested termination"));
    assert_settled_once(&events.lock().unwrap());
    fixture::write_record(&root, "facts.txt", error);
}

#[test]
fn strict_handle_list_excludes_other_inheritable_parent_handles() {
    let root = fixture::case("strict-handle-list");
    let sentinel = fixture::InheritableSentinel::new();
    let mut input = spec(&root, "echo");
    input
        .args
        .push(format!("sentinel:{}", sentinel.raw_value()));
    let result = process::run(input, &Control::default(), Arc::new(|_| {})).unwrap();
    let output = String::from_utf8(result.stdout).unwrap();
    assert!(
        output.contains("SENTINEL_SET=0"),
        "unexpected handle inherited: {output}"
    );
    assert!(!sentinel.signaled());
    assert!(result.facts.membership_verified_before_resume);
    assert!(result.facts.resources_releasable());
    fixture::write_record(&root, "facts.txt", format!("{:#?}\n{output}", result.facts));
}
