use super::*;
use crate::download::{adapter::{ExecutionContext, ManagedCommand}, composition, process_supervisor::{Control, ProcessObservation}, request::Quality, runtime::RuntimeManager};
use std::{io::{Read, Write}, net::{TcpListener, TcpStream}, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, thread, time::Duration};

struct Server {
    address: std::net::SocketAddr,
    counts: Arc<Mutex<(usize, usize)>>,
    stop: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
}
impl Server {
    fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let counts = Arc::new(Mutex::new((0, 0)));
        let recorded = counts.clone();
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let thread = thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                if stopping.load(Ordering::SeqCst) { break; }
                stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
                let mut request = [0; 8192];
                let Ok(length) = stream.read(&mut request) else { continue };
                let request = String::from_utf8_lossy(&request[..length]);
                let expired = request.lines().next().unwrap_or("").contains("/expired.mp4");
                let mut counts = recorded.lock().unwrap();
                if expired { counts.0 += 1; } else { counts.1 += 1; }
                drop(counts);
                let body = if expired { Vec::new() } else { vec![b'm'; 8192] };
                let status = if expired { "403 Forbidden" } else { "200 OK" };
                let _ = write!(stream, "HTTP/1.1 {status}\r\nContent-Type: video/mp4\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len());
                if !request.starts_with("HEAD ") { let _ = stream.write_all(&body); }
            }
        });
        Self { address, counts, stop, thread: Some(thread) }
    }
}
impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        let _ = TcpStream::connect(self.address);
        self.thread.take().unwrap().join().unwrap();
    }
}

#[test]
#[ignore = "Requires task-owned genuine runtime cache via AMEOW_RUNTIME_TEST_ROOT; loopback only, no accounts"]
fn pinned_native_input_healthy_expired_and_cancel_settle_without_rust_retry() -> Result<(), String> {
    use super::super::super::{InvocationPhase, SELECTION_FILE, SELECTION_PREFIX, TRANSFER_INFO_FILE, engine_args, read_selections};
    let root = PathBuf::from(std::env::var("AMEOW_RUNTIME_TEST_ROOT").map_err(|error| error.to_string())?);
    let requirements = composition::requirements();
    let lease = RuntimeManager::new(root.clone()).prepare(&requirements, &Control::default(), Arc::new(|_| {}), |_| {})?;
    let server = Server::start();
    for mode in ["healthy", "expired", "cancel"] {
        let workspace = tempfile::tempdir_in(&root).map_err(|error| error.to_string())?;
        let control = Control::default();
        let cancel = control.clone();
        let settlements = Arc::new(Mutex::new(Vec::new()));
        let recorded = settlements.clone();
        let context = ExecutionContext {
            media_observations: &Default::default(), authentication: None,
            workspace: workspace.path(), lease: &lease, requirements: &requirements,
            control: &control, observer: Arc::new(move |event| {
                if mode == "cancel" && matches!(event, ProcessObservation::Running { .. }) { cancel.cancel(); }
                if let ProcessObservation::Settled(facts) = event { recorded.lock().unwrap().push(facts); }
            }), admission: Arc::new(|_| Ok(())), events: Arc::new(|_| {}),
        };
        let canonical = format!("http://{}/fresh.mp4", server.address);
        let source = if mode == "expired" { format!("http://{}/expired.mp4", server.address) } else { canonical.clone() };
        let metadata = json!({"id":"fresh", "title":"owned fixture", "extractor":"generic", "extractor_key":"Generic",
            "protocol":"http", "url":source, "ext":"mp4", "format_id":"native", "vcodec":"avc1", "acodec":"aac"});
        let bytes = input_bytes(&metadata, &canonical, false)?.unwrap();
        let path = workspace.path().join("resolved.json");
        fs::write(&path, &bytes).map_err(|error| error.to_string())?;
        let input = AttemptResolution::open(&path, &bytes)?;
        for name in [SELECTION_FILE, "final-object.txt"] { fs::write(workspace.path().join(name), b"").unwrap(); }
        let mut args = engine_args(&context, &crate::download::network::Route::Direct, Quality::Saver)?;
        args.extend(["--no-simulate".into(), "--fixup".into(), "never".into(), "--no-write-info-json".into(), "--no-overwrites".into(),
            "--output".into(), workspace.path().join("media.%(ext)s").display().to_string(),
            "--print-to-file".into(), format!("before_dl:{SELECTION_PREFIX}%()j"), workspace.path().join(SELECTION_FILE).display().to_string(),
            "--print-to-file".into(), "after_move:AMEOW_FINAL=%(filepath)j".into(), workspace.path().join("final-object.txt").display().to_string(),
            "--print-to-file".into(), "after_move:%()j".into(), workspace.path().join(TRANSFER_INFO_FILE).display().to_string()]);
        append_input(&mut args, Some(&input), &canonical);
        let before = *server.counts.lock().unwrap();
        input.validate()?;
        let outcome = context.run_ytdlp(ManagedCommand { tool:"yt-dlp.exe", args, stdout_limit:65536, stderr_limit:65536,
            timeout:Some(Duration::from_secs(15)) }, InvocationPhase::Transfer, Some(&metadata), None)?;
        input.validate()?;
        assert!(outcome.facts.resources_releasable(), "mode={mode}");
        assert_eq!(settlements.lock().unwrap().len(), 1, "mode={mode}");
        if mode != "cancel" {
            assert_eq!(outcome.exit_code, 0, "mode={mode}; {}", String::from_utf8_lossy(&outcome.stderr).replace(&format!("http://{}/", server.address), "<owned>/"));
            let selections = read_selections(&workspace.path().join(SELECTION_FILE))?;
            assert_eq!(selections.len(), if mode == "expired" { 2 } else { 1 });
            assert!(selections.iter().all(|row| row["id"] == "fresh"));
            assert!(workspace.path().join(TRANSFER_INFO_FILE).is_file());
            let summary: Value = serde_json::from_slice(&fs::read(workspace.path().join(TRANSFER_INFO_FILE)).unwrap()).unwrap();
            assert_eq!(summary["url"], canonical);
            assert_eq!(fs::read(workspace.path().join("media.mp4")).unwrap(), vec![b'm'; 8192]);
            let after = *server.counts.lock().unwrap();
            if mode == "healthy" { assert_eq!(after, (before.0, before.1 + 1)); }
            else { assert_eq!(after.0, before.0 + 1); assert!(after.1 > before.1); }
        } else { assert!(control.is_cancelled()); }
        drop(input);
    }
    Ok(())
}
