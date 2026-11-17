#[cfg(target_os = "macos")]
fn main() {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if let Err(error) = ameow_next::app_update::macos_helper::run(&args) {
        use std::io::Write;
        let _ = writeln!(std::io::stdout(), "ERROR {error}");
        eprintln!("Ameow updater: {error}");
        std::process::exit(1);
    }
}

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("Ameow updater is only available on macOS.");
    std::process::exit(1);
}
