fn main() {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if let Some(status) = ameow_next::control::lifecycle::observer_main(&args) {
        std::process::exit(status);
    }
    std::process::exit(ameow_next::control::cli::run());
}
