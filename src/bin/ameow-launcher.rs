#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
use ameow_next::app_update::{self, Install};
fn main() {
    let root = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()));
    let result = (|| {
        let root = root.ok_or("E_APP_UPDATE_LAUNCHER_PATH")?;
        let args: Vec<_> = std::env::args().skip(1).collect();
        #[cfg(windows)]
        if let Some(result) = app_update::installer::dispatch(&args) { return result; }
        #[cfg(all(feature = "app-update-fixture", debug_assertions))]
        let install = Install::fixture(root.clone())?;
        #[cfg(not(all(feature = "app-update-fixture", debug_assertions)))]
        let install = Install::production(root.clone())?;
        if args.first().is_some_and(|arg| arg == "--register-installed-version") {
            if args.len() != 2 { return Err("E_APP_UPDATE_INSTALL_ARGUMENTS".into()); }
            return install.register_installed_version(&args[1]);
        }
        let timeout = if cfg!(all(feature = "app-update-fixture", debug_assertions)) {
            8
        } else {
            60
        };
        let result = app_update::launcher::run(install, &args, std::time::Duration::from_secs(timeout));
        #[cfg(windows)]
        if result.is_err() && app_update::installer::recover_legacy_launch(&root, &args)? { return Ok(()); }
        result
    })();
    if let Err(error) = result {
        eprintln!("Ameow Launcher: {error}");
        std::process::exit(1);
    }
}
