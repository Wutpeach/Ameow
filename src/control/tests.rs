use super::*;

#[cfg(all(feature = "dev-tools", windows))]
pub(crate) fn retry_inspection_cleanup_for_test(queue: &DownloadCoordinator, job: u64) {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().canonicalize().unwrap();
    let mut server = Server::start(&path).unwrap();
    let instance = server.instance_id.clone();
    let client = std::thread::spawn(move || rpc(&path, &request(&instance, "cleanup_retry_01", Command::Retry {task_id:format!("{instance}:{job}")})));
    let until = Instant::now() + Duration::from_secs(5);
    while !client.is_finished() && Instant::now() < until { server.poll(queue, false, false); std::thread::sleep(Duration::from_millis(5)); }
    let reply = client.join().unwrap().unwrap();
    assert!(reply.ok, "{reply:?}");
    let result = reply.result.unwrap();
    assert_eq!(result["cleanup_retry"], true);
    assert_eq!(result["job_id"], job);
}

fn isolated_server() -> Server {
    let (_, receiver) = mpsc::sync_channel(1);
    Server {
        instance_id: "instance_current".into(),
        receiver,
        cache: HashMap::new(),
        stop: Arc::new(AtomicBool::new(false)),
        worker: None,
    }
}

fn request(instance: &str, id: &str, command: Command) -> Request {
    Request {
        protocol_version: PROTOCOL_VERSION,
        request_id: id.into(),
        instance_id: Some(instance.into()),
        command,
    }
}

fn submit() -> Command {
    Command::Submit {
        clip: None,
        url: "https://youtu.be/jNQXAC9IVRw".into(),
        quality: None,
        output_dir: None,
    }
}
#[test]
fn clip_changes_conflict_with_the_original_request_receipt() {
    let root = tempfile::tempdir().unwrap();
    let queue = DownloadCoordinator::update_test_queue(root.path());
    let mut server = isolated_server();
    let mut command = submit();
    if let Command::Submit { clip, .. } = &mut command { *clip = Some(crate::download::request::ClipRange { start_ms: 1250, end_ms: 4750, precise: false }); }
    let req = request("instance_current", "clip_request_01", command.clone());
    let (first, _) = server.handle(&req, &queue, true);
    let (replay, notice) = server.handle(&req, &queue, true);
    assert_eq!(serde_json::to_value(first).unwrap(), serde_json::to_value(replay).unwrap());
    assert!(notice.is_none());
    if let Command::Submit { clip, .. } = &mut command { clip.as_mut().unwrap().precise = true; }
    let changed = request("instance_current", "clip_request_01", command);
    assert_eq!(error(server.handle(&changed, &queue, true).0), "E_REQUEST_CONFLICT");
}

fn error(response: Response) -> String {
    assert!(!response.ok);
    response.error.expect("error response").code
}

#[test]
fn version_instance_and_task_identity_are_checked_before_execution() {
    let temp = tempfile::tempdir().unwrap();
    let queue = DownloadCoordinator::update_test_queue(temp.path());
    let mut server = isolated_server();
    let mut req = request("instance_current", "request_01", Command::List {});
    req.protocol_version += 1;
    assert_eq!(
        error(server.handle(&req, &queue, true).0),
        "E_PROTOCOL_VERSION"
    );
    req.protocol_version = PROTOCOL_VERSION;
    req.instance_id = Some("instance_previous".into());
    assert_eq!(
        error(server.handle(&req, &queue, true).0),
        "E_INSTANCE_CHANGED"
    );
    for (task, expected) in [
        ("nocolon", "E_INVALID_TASK_ID"),
        ("instance_current:0", "E_INVALID_TASK_ID"),
        ("instance_current:no", "E_INVALID_TASK_ID"),
        ("instance_previous:1", "E_INSTANCE_CHANGED"),
        ("instance_current:99", "E_TASK_NOT_FOUND"),
    ] {
        let req = request(
            "instance_current",
            "request_02",
            Command::Show {
                task_id: task.into(),
            },
        );
        assert_eq!(error(server.handle(&req, &queue, true).0), expected);
    }
    assert!(queue.snapshot().jobs.is_empty());
}

#[test]
fn duplicate_mutation_is_replayed_and_conflicts_and_capacity_are_rejected() {
    let temp = tempfile::tempdir().unwrap();
    let queue = DownloadCoordinator::update_test_queue(temp.path());
    let mut server = isolated_server();
    let req = request("instance_current", "request_01", submit());
    let (first, notice) = server.handle(&req, &queue, true);
    assert!(first.ok);
    assert!(notice.is_some());
    let (second, notice) = server.handle(&req, &queue, true);
    assert!(second.ok);
    assert_eq!(first.result, second.result);
    assert!(notice.is_none());
    assert_eq!(queue.snapshot().jobs.len(), 1);
    let conflict = request(
        "instance_current",
        "request_01",
        Command::Cancel {
            task_id: "instance_current:1".into(),
        },
    );
    assert_eq!(
        error(server.handle(&conflict, &queue, true).0),
        "E_REQUEST_CONFLICT"
    );
    assert!(!queue.snapshot().jobs[0].phase.terminal());
    let fingerprint = serde_json::to_vec(&req.command).unwrap();
    while server.cache.len() < MAX_MUTATIONS {
        server.cache.insert(
            format!("filled_{:04}", server.cache.len()),
            (fingerprint.clone(), first.clone()),
        );
    }
    let full = request("instance_current", "request_03", submit());
    assert_eq!(
        error(server.handle(&full, &queue, true).0),
        "E_REQUEST_LIMIT"
    );
    let read = request("instance_current", "request_04", Command::List {});
    assert!(server.handle(&read, &queue, true).0.ok);
    assert_eq!(queue.snapshot().jobs.len(), 1);
}

#[test]
fn update_gate_denies_submissions_but_permits_cancellation_and_reads() {
    let temp = tempfile::tempdir().unwrap();
    let queue = DownloadCoordinator::update_test_queue(temp.path());
    let mut server = isolated_server();
    let denied = request("instance_current", "request_01", submit());
    assert_eq!(
        error(server.handle(&denied, &queue, false).0),
        "E_APP_UPDATE_BUSY"
    );
    assert!(queue.snapshot().jobs.is_empty());
    let accepted = request("instance_current", "request_02", submit());
    assert!(server.handle(&accepted, &queue, true).0.ok);
    let list = request("instance_current", "request_03", Command::List {});
    assert!(server.handle(&list, &queue, false).0.ok);
    let cancel = request(
        "instance_current",
        "request_04",
        Command::Cancel {
            task_id: "instance_current:1".into(),
        },
    );
    assert!(server.handle(&cancel, &queue, false).0.ok);
    assert_eq!(
        queue.snapshot().jobs[0].phase,
        crate::download::queue::JobPhase::Cancelled
    );
}

#[test]
fn real_local_transport_preserves_request_and_session_identity() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let queue = DownloadCoordinator::update_test_queue(&root);
    let mut server = Server::start(&root).unwrap();
    let identity = server.instance_id.clone();
    let client_root = root.clone();
    let client_identity = identity.clone();
    let client = std::thread::spawn(move || {
        let req = request(&client_identity, "wire_request_01", Command::List {});
        rpc(&client_root, &req)
    });
    let deadline = Instant::now() + Duration::from_secs(5);
    while !client.is_finished() && Instant::now() < deadline {
        server.poll(&queue, true, false);
        std::thread::sleep(Duration::from_millis(5));
    }
    assert!(client.is_finished(), "local control response timed out");
    let response = client.join().unwrap().unwrap();
    assert!(response.ok);
    assert_eq!(response.request_id, "wire_request_01");
    assert_eq!(response.instance_id, identity);
    assert_eq!(response.result.unwrap()["jobs"], json!([]));
}

#[test]
fn simultaneous_clients_receive_their_own_responses() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let queue = DownloadCoordinator::update_test_queue(&root);
    let mut server = Server::start(&root).unwrap();
    let barrier = Arc::new(std::sync::Barrier::new(3));
    let mut clients = Vec::new();
    for index in 0..2 {
        let path = root.clone();
        let instance = server.instance_id.clone();
        let barrier = barrier.clone();
        clients.push(std::thread::spawn(move || {
            let id = format!("parallel_request_{index}");
            let req = request(&instance, &id, Command::List {});
            barrier.wait();
            (id, rpc(&path, &req))
        }));
    }
    barrier.wait();
    let deadline = Instant::now() + Duration::from_secs(5);
    while clients.iter().any(|c| !c.is_finished()) && Instant::now() < deadline {
        server.poll(&queue, true, false);
        std::thread::sleep(Duration::from_millis(5));
    }
    assert!(
        clients.iter().all(|c| c.is_finished()),
        "parallel clients timed out"
    );
    for client in clients {
        let (id, response) = client.join().unwrap();
        let response = response.unwrap();
        assert!(response.ok);
        assert_eq!(response.request_id, id);
        assert_eq!(response.instance_id, server.instance_id);
    }
}

#[test]
fn partial_frame_does_not_block_another_clients_submission() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let queue = DownloadCoordinator::update_test_queue(&root);
    let mut server = Server::start(&root).unwrap();
    let mut stalled = transport::connect(&root).unwrap();
    stalled.write_all(&[32, 0]).unwrap();
    std::thread::sleep(Duration::from_millis(30));
    let client_root = root.clone();
    let instance = server.instance_id.clone();
    let client = std::thread::spawn(move || {
        rpc(
            &client_root,
            &request(&instance, "healthy_request_01", submit()),
        )
    });
    let deadline = Instant::now() + Duration::from_secs(2);
    while !client.is_finished() && Instant::now() < deadline {
        server.poll(&queue, true, false);
        std::thread::sleep(Duration::from_millis(5));
    }
    let timely = client.is_finished();
    drop(stalled);
    drop(server);
    let response = client.join().unwrap();
    assert!(timely, "a partial frame blocked a healthy submission");
    let response = response.unwrap();
    assert!(response.ok);
    assert_eq!(response.result.unwrap()["job_id"], 1);
    assert_eq!(queue.snapshot().jobs.len(), 1);
}

#[test]
fn dropping_server_with_idle_connected_client_releases_listener() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let server = Server::start(&root).unwrap();
    let _idle_clients: Vec<_> = (0..=MAX_CONNECTIONS)
        .map(|_| transport::connect(&root).unwrap())
        .collect();
    std::thread::sleep(Duration::from_millis(50));
    let dropper = std::thread::spawn(move || drop(server));
    let deadline = Instant::now() + Duration::from_secs(3);
    while !dropper.is_finished() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(5));
    }
    assert!(dropper.is_finished(), "server drop blocked on idle client");
    dropper.join().unwrap();
    let replacement = Server::start(&root).expect("listener should be released at drop");
    drop(replacement);
}

#[test]
fn list_pages_preserve_all_queue_ids_with_bounded_responses() {
    let temp = tempfile::tempdir().unwrap();
    let queue = DownloadCoordinator::update_test_queue(temp.path());
    for index in 0..137 {
        queue
            .submit(format!("https://example.com/media/{index}"))
            .unwrap();
    }
    let mut server = isolated_server();
    let mut after = 0;
    let mut collected = Vec::new();
    loop {
        let req = request(
            "instance_current",
            "page_request",
            Command::ListPage { after },
        );
        let response = server.handle(&req, &queue, true).0;
        assert!(response.ok);
        assert!(serde_json::to_vec(&response).unwrap().len() < MAX_RESPONSE);
        let page = response.result.unwrap();
        collected.extend(
            page["jobs"]
                .as_array()
                .unwrap()
                .iter()
                .map(|job| job["job_id"].as_u64().unwrap()),
        );
        match page["next_after"].as_u64() {
            Some(next) => {
                assert!(next > after);
                after = next;
            }
            None => break,
        }
    }
    assert_eq!(collected, (1..=137).collect::<Vec<u64>>());
}

#[test]
fn file_pages_preserve_all_collection_paths_with_bounded_responses() {
    use crate::download::{
        contract::{CollectionFile, CollectionState, MediaKind, VerifiedFacts},
        output::VerifiedMedia,
    };
    let temp = tempfile::tempdir().unwrap();
    let queue = DownloadCoordinator::update_test_queue(temp.path());
    queue.submit("https://youtu.be/jNQXAC9IVRw".into()).unwrap();
    let mut job = queue.snapshot().jobs[0].clone();
    let expected: Vec<_> = (0..257)
        .map(|i| temp.path().join(format!("file-{i:04}.jpg")))
        .collect();
    job.collection = Some(CollectionState {
        files: expected
            .iter()
            .map(|path| CollectionFile {
                relative_path: path.file_name().unwrap().into(),
                delivered: VerifiedMedia {
                    path: path.clone(),
                    bytes: 1,
                    sha256: "a".repeat(64),
                    kind: MediaKind::Data,
                    facts: VerifiedFacts::default(),
                    identity_guard: None,
                },
            })
            .collect(),
        total: Some(expected.len()),
        ..Default::default()
    });
    let mut after = 0;
    let mut collected = Vec::new();
    loop {
        let page = file_page("instance_current", &job, after);
        assert!(serde_json::to_vec(&page).unwrap().len() < MAX_RESPONSE);
        collected.extend(
            page["files"]
                .as_array()
                .unwrap()
                .iter()
                .map(|file| PathBuf::from(file["path"].as_str().unwrap())),
        );
        match page["next_files_after"].as_u64() {
            Some(next) => {
                assert!(next as usize > after);
                after = next as usize;
            }
            None => break,
        }
    }
    assert_eq!(collected, expected);
}

#[test]
fn isolated_root_rejects_production_overlap_and_divergent_overrides() {
    for production in [
        RuntimeManager::default_root().unwrap(),
        crate::app_update::default_install_root().unwrap(),
    ] {
        let candidate = production.join("cli-isolation-test-never-created");
        let args = vec![
            "--instance-root".into(),
            candidate.to_string_lossy().into_owned(),
        ];
        assert_eq!(isolated_root(&args).unwrap_err().code, "E_INSTANCE_ROOT");
        assert!(!candidate.exists());
    }
    let temp = tempfile::tempdir().unwrap();
    let selected = temp.path().join("isolated");
    for flag in ["--runtime-root", "--settings-path", "--output"] {
        let args = vec![
            "--instance-root".into(),
            selected.to_string_lossy().into_owned(),
            flag.into(),
            temp.path().join("elsewhere").to_string_lossy().into_owned(),
        ];
        assert_eq!(isolated_root(&args).unwrap_err().code, "E_INSTANCE_ROOT");
        assert!(!selected.exists());
    }
}
