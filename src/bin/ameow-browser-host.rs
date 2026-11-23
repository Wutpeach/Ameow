#![cfg_attr(target_os = "windows", windows_subsystem = "console")]
use ameow_next::{browser_sessions::native, download::runtime::RuntimeManager};
fn main() {
    #[cfg(windows)]
    match ameow_next::app_update::forward_component("ameow-browser-host.exe") {
        Ok(Some(code)) => std::process::exit(code),
        Err(_) => std::process::exit(1),
        Ok(None) => {}
    }
    let mut args: Vec<_> = std::env::args().collect();
    #[cfg(debug_assertions)]
    if let Some(root) = std::env::var_os("AMEOW_BROWSER_TEST_INSTANCE") {
        args.extend([
            "--instance-root".into(),
            root.to_string_lossy().into_owned(),
        ]);
    }
    let result = if args.get(1).is_some_and(|a| a == "register") {
        native::companion()
            .and_then(|host| native::install(&host))
            .map(|_| ())
    } else if args.get(1).is_some_and(|a| a == native::ORIGIN) {
        let root = if args.iter().any(|a| a == "--instance-root") {
            ameow_next::control::isolated_root(&args)
                .map_err(|e| e.to_string())
                .and_then(|r| r.ok_or_else(|| "E_INSTANCE_ROOT".to_string()))
                .map(|r| (r.join("runtime"), Some(r)))
        } else {
            RuntimeManager::default_root().map(|r| (r, None))
        };
        root.and_then(|(root, instance)| {
            native::serve_with_instance(
                &mut std::io::stdin().lock(),
                &mut std::io::stdout().lock(),
                &root,
                instance,
            )
        })
    } else {
        Err("E_SESSION_ORIGIN".into())
    };
    if result.is_err() {
        std::process::exit(1);
    }
}
