//! Test-only transport: real queue settings owner, isolated disk, no runtime preparation.
use super::{DownloadUi, UiReply, SettingsStatus, Settings, Quality, ThemePreference, LanguagePreference,
    QueueCommand, CommandReply, command_summary, reply_summary, Arc, Mutex, mpsc, File, Write, PathBuf, Duration, Instant};

impl DownloadUi {
    pub(crate) fn native_acceptance(root: PathBuf) -> Self {
        use ameow_next::download::composition;
        std::fs::create_dir_all(root.join("runtime")).unwrap();
        // Invalid selection is an existing fail-closed boundary: no baseline preparation.
        std::fs::write(root.join("runtime/runtime-selection.json"), b"{broken").unwrap();
        let defaults = Settings {
            output_dir: root.clone(), quality: Quality::Balanced,
            theme: ThemePreference::Light, language: LanguagePreference::Chinese,
            tray_icon: Default::default(),
        };
        let backend = composition::download_coordinator(root.join("runtime"), root.join("settings.json"), defaults).unwrap();
        let (commands, receiver) = mpsc::sync_channel(8);
        let (evidence, events) = mpsc::sync_channel(64);
        let (sender, replies) = mpsc::channel();
        let latest = Arc::new(Mutex::new(None));
        let projection = latest.clone();
        std::thread::spawn(move || {
            let mut log = File::create(root.join("commands.jsonl")).unwrap();
            loop {
                match receiver.recv_timeout(Duration::from_millis(40)) {
                    Ok(command) => {
                        writeln!(log, "{}", command_summary(&command)).unwrap();
                        let saving = matches!(&command, QueueCommand::SaveSettings(_));
                        let diagnostic = match &command { QueueCommand::CopyDiagnostic(job) => Some(*job), _ => None };
                        // Keep every network/runtime action outside this test host's command set.
                        let reply = if saving || matches!(&command, QueueCommand::Stop | QueueCommand::CopyDiagnostic(_)) {
                            backend.apply(command)
                        } else { CommandReply::Error("原生验收仅允许设置、诊断与退出".into()) };
                        writeln!(log, "{}", reply_summary(&reply)).unwrap();
                        let event = match reply {
                            CommandReply::Diagnostic(text) => UiReply::Diagnostic { job: diagnostic.unwrap_or(0), text },
                            reply if saving => UiReply::Settings(reply),
                            reply => UiReply::Reply(reply),
                        };
                        let _ = sender.send(event);
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => { backend.stop(); break; }
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                }
                for event in events.try_iter() { writeln!(log, "{event}").unwrap(); }
                log.flush().unwrap();
                let snapshot = backend.snapshot();
                assert!(snapshot.jobs.is_empty() && !snapshot.preparing);
                let stopped = snapshot.stopped;
                *projection.lock().unwrap() = Some(Arc::new(snapshot));
                if stopped { break; }
            }
        });
        let mut ui = Self::with_transport(commands, evidence, replies, latest);
        ui.isolated_settings_acceptance = true;
        ui
    }
}

#[test]
fn isolated_transport_saves_through_real_owner_and_refuses_download_actions() {
    let root = tempfile::tempdir().unwrap();
    let mut ui = DownloadUi::native_acceptance(root.path().into());
    let deadline = Instant::now() + Duration::from_secs(3);
    let spin = |ui: &mut DownloadUi| {
        for reply in ui.poll() { if let UiReply::Settings(reply) = reply { ui.complete_settings(reply); } }
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(10));
    };
    while ui.settings().is_none() { spin(&mut ui); }
    assert!(!ui.upstream_check_available() && !ui.request_upstream_check());
    assert!(ui.request_preferences(ThemePreference::Dark, LanguagePreference::English, 1));
    while ui.settings_pending { spin(&mut ui); }
    assert!(matches!(ui.settings_status, SettingsStatus::Saved));
    let accepted = ui.settings().unwrap();
    assert_eq!(Settings::load(&root.path().join("settings.json"), accepted.clone()).unwrap(), accepted);
    assert!(ui.send(QueueCommand::Submit { url: "https://example.com/video".into() }, 2));
    let reply = ui.replies.recv_timeout(Duration::from_secs(1)).unwrap();
    assert!(matches!(reply, UiReply::Reply(CommandReply::Error(_))));
    assert!(ui.snapshot.as_ref().unwrap().jobs.is_empty());
    assert!(ui.send(QueueCommand::Stop, 3));
    while !ui.snapshot.as_ref().is_some_and(|s| s.stopped) { spin(&mut ui); }
}
