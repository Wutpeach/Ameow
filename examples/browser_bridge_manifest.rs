//! Connection-only installer fixture: no session store or browser permissions.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    use ameow_next::browser_sessions::native;
    use std::{fs::OpenOptions, io::Write, path::PathBuf};
    let args: Vec<_> = std::env::args_os().collect();
    if args.len() != 3 {
        return Err("browser_bridge_manifest <product-host> <new-absolute-json>".into());
    }
    let output = PathBuf::from(&args[2]);
    if !output.is_absolute() {
        return Err("absolute fixture manifest path required".into());
    }
    let mut manifest = native::installation_manifest(&PathBuf::from(&args[1]))?;
    manifest["name"] = format!("{}.fixture", native::HOST_NAME).into();
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(output)?
        .write_all(&serde_json::to_vec_pretty(&manifest)?)?;
    Ok(())
}
