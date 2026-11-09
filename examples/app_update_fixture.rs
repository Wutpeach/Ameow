//! Local test-vector signer and controlled install helper. Not a release publisher.
#[cfg(all(feature = "app-update-fixture", debug_assertions))]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    use ameow_next::app_update::{Install, Manifest, TARGET, fixture_envelope, hash};
    use std::{
        fs,
        io::{Cursor, Write},
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 6 {
        return Err("usage: app_update_fixture <install-root> <exe> <version> <sequence> <fixture-output-dir>".into());
    }
    let root = PathBuf::from(&args[1]);
    let exe = fs::read(&args[2])?;
    let output = PathBuf::from(&args[5]);
    fs::create_dir(&output)?;
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    zip.start_file("Ameow.exe", zip::write::SimpleFileOptions::default())?;
    zip.write_all(&exe)?;
    let package = zip.finish()?.into_inner();
    let version = args[3].clone();
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let manifest = Manifest {
        schema: 1,
        product: "Ameow".into(),
        channel: "stable".into(),
        target: TARGET.into(),
        version: version.clone(),
        sequence: args[4].parse()?,
        issued: now,
        expires: now + 86400,
        url: format!(
            "https://github.com/Wutpeach/Ameow/releases/download/v{version}/Ameow-{version}-windows-x64.zip"
        ),
        package_bytes: package.len() as u64,
        package_sha256: hash(&package),
        exe_bytes: exe.len() as u64,
        exe_sha256: hash(&exe),
    };
    let signed = fixture_envelope(&manifest);
    fs::write(output.join("manifest.json"), &signed)?;
    fs::write(output.join("package.zip"), &package)?;
    let install = Install::fixture(root)?;
    install.prepare_fixture(&signed, &mut Cursor::new(package))?;
    println!("{}", serde_json::to_string_pretty(&install.state()?)?);
    Ok(())
}
#[cfg(not(all(feature = "app-update-fixture", debug_assertions)))]
fn main() {
    eprintln!("Requires debug-only app-update-fixture feature");
    std::process::exit(2);
}
