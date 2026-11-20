//! Explicit debug fixture, also invoked from a test on Windows.
use super::{Assets, Options, Prototype, download_ui, tokens};
use gpui::{AppContext, Bounds, TitlebarOptions, WindowBackgroundAppearance, WindowBounds, WindowKind, WindowOptions, point, px, size};
use std::{borrow::Cow, io::Write, time::{Duration, Instant}};

#[test]
#[ignore = "uses the desktop; requires explicit user agreement and a fresh task-owned directory"]
fn settings_and_tray() {
    run();
}

pub(super) fn run() {
    let root = std::path::PathBuf::from(std::env::var_os("AMEOW_NATIVE_ACCEPTANCE_DIR").expect("task-owned directory"));
    let marker = root.join(".ameow-owned-native-acceptance");
    let reopen = std::env::var_os("AMEOW_NATIVE_ACCEPTANCE_REOPEN").is_some()
        && std::fs::read(&marker).is_ok_and(|bytes| bytes == b"Ameow private native fixture");
    assert!(root.is_absolute() && (!root.exists() || reopen), "use a fresh task-owned directory");
    std::fs::create_dir_all(&root).unwrap();
    if reopen {
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let predecessor = root.join(format!("before-reopen-{stamp}"));
        std::fs::create_dir(&predecessor).unwrap();
        for name in ["commands.jsonl", "state.json", "states.jsonl", "application-returned.json"] {
            let previous = root.join(name);
            if previous.exists() { std::fs::copy(previous, predecessor.join(name)).unwrap(); }
        }
        if root.join("quit").exists() { std::fs::remove_file(root.join("quit")).unwrap(); }
    }
    std::fs::write(marker, b"Ameow private native fixture").unwrap();
    if std::env::var_os("AMEOW_NATIVE_REGISTRATION_ONLY").is_some() {
        gpui_platform::application().run(move |cx| {
            #[cfg(target_os = "macos")]
            cx.set_activation_policy(gpui::ActivationPolicy::Accessory);
            registration_lifecycle(&root);
            cx.quit();
        });
        return;
    }
    let downloads = download_ui::DownloadUi::native_acceptance(root.clone());
    let mut options = Options::from_args();
    options.fixture = true;
    options.unknown_downloading = true; // Install the normal poll before injecting the real settings transport.
    options.tray_fixture = true;
    options.exit_after_ms = Some(420_000);
    let completion_root = root.clone();
    gpui_platform::application().with_assets(Assets).run(move |cx| {
        #[cfg(target_os = "macos")]
        cx.set_activation_policy(gpui::ActivationPolicy::Accessory);
        gpui_component::init(cx);
        cx.text_system().add_fonts(tokens::LATIN_FONT_BYTES.into_iter().map(Cow::Borrowed).collect()).unwrap();
        let handle = cx.open_window(WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(Bounds::new(point(px(504.),px(304.)),size(px(80.),px(80.))))),
            titlebar: Some(TitlebarOptions { title: Some("Ameow".into()), ..Default::default() }),
            kind: WindowKind::PopUp, show: false, focus: false,
            window_background: WindowBackgroundAppearance::Transparent,
            is_resizable: false, is_minimizable: false, ..Default::default()
        }, move |window, cx| cx.new(|cx| {
            let mut view = Prototype::new(options,window,cx);
            view.downloads = Some(downloads);
            view.unknown_downloading = false;
            view.production_preferences = true;
            view.shortcut_allowed = std::env::var_os("AMEOW_NATIVE_SHORTCUT").is_some();
            view
        })).unwrap();
        cx.spawn(async move |cx| {
            let mut opened = false;
            let started = Instant::now();
            let mut previous = String::new();
            let mut history = std::fs::File::create(root.join("states.jsonl")).unwrap();
            loop {
                cx.background_executor().timer(Duration::from_millis(100)).await;
                let stop = handle.update(cx, |view, _, cx| {
                    if !opened && view.native.is_some() && view.downloads.as_ref().and_then(|ui|ui.settings()).is_some() {
                        view.open_or_focus_settings(cx); opened = true;
                    }
                    let ui = view.downloads.as_ref().unwrap();
                    let controls = view.settings_window.and_then(|handle| handle.update(cx, |root, window, cx| {
                        root.view().clone().downcast::<super::settings_window::SettingsWindow>()
                            .ok().map(|view| view.read(cx).acceptance_snapshot(window, cx))
                    }).ok()).flatten();
                    let state = serde_json::json!({
                        "controls": controls,
                        "settings":ui.settings(), "pending":ui.settings_pending,
                        "status":format!("{:?}",ui.settings_status),
                        "night":view.night, "language":format!("{:?}",view.language),
                        "motion_reduced":view.model.reduced,
                        "hidden":ui.hidden, "queue_open":ui.queue_open,
                        "keyboard_hold":view.model.keyboard_hold, "full":view.model.target_full,
                        "pointer_inside":view.model.pointer, "shortcut_registered":view.shortcut.is_active(),
                        "shortcut_error":view.shortcut.error,
                        "main_focused":view.native.as_ref().is_some_and(super::global_shortcut::focused),
                        "main_bounds":view.native.as_ref().map(super::native::Native::bounds),
                        "stopped":ui.snapshot.as_ref().is_some_and(|s|s.stopped),
                    });
                    let serialized = state.to_string();
                    if serialized != previous {
                        writeln!(history, "{}", serde_json::json!({"ms":started.elapsed().as_millis(),"state":state})).unwrap();
                        history.flush().unwrap();
                        previous = serialized;
                    }
                    let _ = std::fs::write(root.join("state.tmp"),state.to_string());
                    let _ = std::fs::rename(root.join("state.tmp"),root.join("state.json"));
                    if root.join("quit").exists() { cx.quit(); return true; }
                    false
                }).unwrap_or(true);
                if stop { break; }
            }
        }).detach();
    });
    std::fs::write(completion_root.join("application-returned.json"),
        serde_json::json!({"application_run_returned":true}).to_string()).unwrap();
}

// Real OS registrations, with no windows, input injection or clipboard access.
fn registration_lifecycle(root: &std::path::Path) {
    use ameow_next::shortcut::{ShortcutChord, ShortcutPlatform, ShortcutPreference};
    use super::global_shortcut::Controller;
    let chord = |key: &str, windows, macos| ShortcutPreference { chord: Some(ShortcutChord {
        platform: ShortcutPlatform::current(), key: key.into(),
        key_code: if cfg!(target_os = "macos") { macos } else { windows },
        control: true, alt: true, shift: true, command: false,
    }) };
    let old = chord("f9", 0x78, 101);
    let new = chord("f10", 0x79, 109);
    let empty = ShortcutPreference { chord: None };
    let mut evidence = std::fs::File::create(root.join("registration-checks.jsonl")).unwrap();
    let mut passed = |name| { writeln!(evidence, "{}", serde_json::json!({"check":name,"passed":true})).unwrap(); evidence.flush().unwrap(); };
    let check_available = |preference: &ShortcutPreference, available: bool| {
        let mut probe = Controller::default(); probe.observe(preference);
        assert_eq!(probe.is_active(), available, "native registration availability: {:?}", probe.error);
        if !available { assert_eq!(probe.error.as_deref(), Some("taken")); }
        probe.stop();
    };
    let mut owner = Controller::default();
    owner.observe(&old); assert!(owner.is_active(), "{:?}", owner.error);
    check_available(&old, false); passed("exclusive registration reports actual conflict");
    owner.suspend(); check_available(&old, true);
    owner.resume(); check_available(&old, false); passed("recording suspend releases and resume restores");
    owner.prepare(new.clone()).unwrap(); check_available(&new, false);
    owner.complete(false); check_available(&old, false); check_available(&new, true);
    passed("failed save retains old and releases candidate");
    owner.prepare(new.clone()).unwrap(); owner.complete(true);
    check_available(&old, true); check_available(&new, false); passed("successful rebind releases old");
    owner.prepare(empty.clone()).unwrap(); owner.complete(false); check_available(&new, false);
    owner.prepare(empty.clone()).unwrap(); owner.complete(true);
    assert!(!owner.is_active()); check_available(&new, true); passed("clear unregisters only after successful save");
    owner.observe(&old); owner.stop(); check_available(&old, true); passed("explicit stop releases");
    { let mut ending = Controller::default(); ending.observe(&new); assert!(ending.is_active()); }
    check_available(&new, true); passed("instance drop releases");
}
