//! Explicitly invoked native acceptance host; absent from the product EXE.
use super::{Assets, Options, Prototype, download_ui, tokens};
use gpui::{AppContext, Bounds, TitlebarOptions, WindowBackgroundAppearance, WindowBounds, WindowKind, WindowOptions, point, px, size};
use std::{borrow::Cow, time::Duration};

#[test]
#[ignore = "uses the desktop; requires explicit user agreement and a fresh task-owned directory"]
fn settings_and_tray() {
    let root = std::path::PathBuf::from(std::env::var_os("AMEOW_NATIVE_ACCEPTANCE_DIR").expect("task-owned directory"));
    assert!(root.is_absolute() && !root.exists(), "use a fresh absolute directory");
    std::fs::create_dir_all(&root).unwrap();
    let downloads = download_ui::DownloadUi::native_acceptance(root.clone());
    let mut options = Options::from_args();
    options.fixture = true;
    options.unknown_downloading = true; // Install the normal poll before injecting the real settings transport.
    options.tray_fixture = true;
    options.reduced = true;
    options.exit_after_ms = Some(420_000);
    let completion_root = root.clone();
    gpui_platform::application().with_assets(Assets).run(move |cx| {
        gpui_base::init(cx);
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
            view
        })).unwrap();
        cx.spawn(async move |cx| {
            let mut opened = false;
            loop {
                cx.background_executor().timer(Duration::from_millis(100)).await;
                let stop = handle.update(cx, |view, _, cx| {
                    if !opened && view.native.is_some() && view.downloads.as_ref().and_then(|ui|ui.settings()).is_some() {
                        view.open_or_focus_settings(cx); opened = true;
                    }
                    let ui = view.downloads.as_ref().unwrap();
                    let state = serde_json::json!({
                        "settings":ui.settings(), "pending":ui.settings_pending,
                        "status":format!("{:?}",ui.settings_status),
                        "night":view.night, "language":format!("{:?}",view.language),
                        "hidden":ui.hidden, "queue_open":ui.queue_open,
                        "stopped":ui.snapshot.as_ref().is_some_and(|s|s.stopped),
                    });
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
