//! Local test-vector signer and controlled install helper. Not a release publisher.
#[cfg(all(feature = "app-update-fixture", debug_assertions))]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    use ameow_next::app_update::{Manifest, TARGET, fixture_envelope, hash};
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 6 {
        return Err("usage: app_update_fixture <install-root> <executable-or-Ameow.app> <version> <sequence> <fixture-output-dir>".into());
    }
    #[cfg(not(target_os = "macos"))]
    let root = PathBuf::from(&args[1]);
    #[cfg(target_os = "macos")]
    let exe = fs::read(PathBuf::from(&args[2]).join("Contents/MacOS/ameow"))?;
    #[cfg(not(target_os = "macos"))]
    let exe = fs::read(&args[2])?;
    let output = PathBuf::from(&args[5]);
    fs::create_dir(&output)?;
    #[cfg(target_os = "macos")]
    let package = macos_package(std::path::Path::new(&args[2]), &output.join("package.zip"))?;
    #[cfg(not(target_os = "macos"))]
    let package = {
        use std::io::{Cursor, Write};
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        zip.start_file("Ameow.exe", zip::write::SimpleFileOptions::default())?;
        zip.write_all(&exe)?;
        zip.finish()?.into_inner()
    };
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
        url: format!(
            "https://github.com/Wutpeach/Ameow/releases/download/v{version}/Ameow-{version}-{}.zip",
            if cfg!(target_os = "macos") { "macos-arm64" } else { "windows-x64" }
        ),
        package_bytes: package.len() as u64,
        package_sha256: hash(&package),
        exe_bytes: exe.len() as u64,
        exe_sha256: hash(&exe),
    };
    let signed = fixture_envelope(&manifest);
    fs::write(output.join("manifest.json"), &signed)?;
    fs::write(output.join("package.zip"), &package)?;
    #[cfg(not(target_os = "macos"))]
    {
        let install = ameow_next::app_update::Install::fixture(root)?;
        install.prepare_fixture(&signed, &mut std::io::Cursor::new(package))?;
        println!("{}", serde_json::to_string_pretty(&install.state()?)?);
    }
    #[cfg(target_os = "macos")]
    println!("{}", serde_json::json!({
        "manifest": output.join("manifest.json"),
        "package": output.join("package.zip"),
        "install_prepared": false,
        "preparation": "The running macOS application verifies and prepares this fixture. The install-root argument is unused."
    }));
    Ok(())
}

#[cfg(all(target_os = "macos", feature = "app-update-fixture", debug_assertions))]
fn macos_package(bundle: &std::path::Path, output: &std::path::Path) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    if bundle.file_name().is_none_or(|name| name != "Ameow.app")
        || !std::fs::symlink_metadata(bundle)?.is_dir()
        || output.try_exists()?
    {
        return Err("Expected a real Ameow.app and an unused archive path".into());
    }
    let result = std::process::Command::new("/usr/bin/ditto")
        .args(["-c", "-k", "--keepParent", "--norsrc"])
        .arg(bundle).arg(output).output()?;
    if !result.status.success() {
        return Err(format!("ditto failed: {}", String::from_utf8_lossy(&result.stderr)).into());
    }
    Ok(std::fs::read(output)?)
}

#[cfg(all(test, target_os = "macos", feature = "app-update-fixture", debug_assertions))]
mod tests {
    use std::{fs, io::{Cursor, Read}, os::unix::fs::{PermissionsExt, symlink}};

    #[test]
    fn macos_archive_preserves_bundle_paths_execute_bits_and_relative_links() {
        let root = tempfile::tempdir().unwrap();
        let bundle = root.path().join("Ameow.app");
        let executable = bundle.join("Contents/MacOS/ameow");
        fs::create_dir_all(executable.parent().unwrap()).unwrap();
        fs::write(&executable, b"fixture").unwrap();
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o755)).unwrap();
        symlink("ameow", executable.with_file_name("alias")).unwrap();
        let output = root.path().join("package.zip");
        let package = super::macos_package(&bundle, &output).unwrap();
        let mut archive = zip::ZipArchive::new(Cursor::new(package)).unwrap();
        assert!(archive.file_names().all(|name| name.starts_with("Ameow.app/")));
        assert_eq!(archive.by_name("Ameow.app/Contents/MacOS/ameow").unwrap().unix_mode().unwrap() & 0o777, 0o755);
        let mut link = archive.by_name("Ameow.app/Contents/MacOS/alias").unwrap();
        assert_eq!(link.unix_mode().unwrap() & 0o170000, 0o120000);
        let mut target = String::new();
        link.read_to_string(&mut target).unwrap();
        assert_eq!(target, "ameow");
        assert!(super::macos_package(&bundle, &output).is_err());
    }
}
#[cfg(not(all(feature = "app-update-fixture", debug_assertions)))]
fn main() {
    eprintln!("Requires debug-only app-update-fixture feature");
    std::process::exit(2);
}
