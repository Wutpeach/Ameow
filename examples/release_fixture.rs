//! Explicit local layout/first-boot fixture. Never a production publisher.
#[cfg(all(feature = "app-update-fixture", debug_assertions))]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    use ameow_next::app_update::{
        TARGET, hash,
        release::{self, Build, FileRecord, PublicRoots},
    };
    use std::{
        fs,
        io::Read,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };
    let args: Vec<_> = std::env::args().collect();
    if !(5..=7).contains(&args.len()) {
        return Err("release_fixture <accepted-fixture-app> <accepted-fixture-launcher> <fixture-version> <new-absolute-output> [sequence=1] [issued-unix=now]".into());
    }
    let sequence = args.get(5).map_or(Ok(1), |value| value.parse::<u64>())?;
    let issued = args.get(6).map_or_else(
        || Ok::<u64, Box<dyn std::error::Error>>(SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs()),
        |value| Ok(value.parse()?),
    )?;
    let root = PathBuf::from(&args[4]);
    if !root.is_absolute() {
        return Err("absolute output required".into());
    }
    fs::create_dir(&root)?;
    let input = root.join("input");
    fs::create_dir(&input)?;
    let app = fs::read(&args[1])?;
    let launcher = fs::read(&args[2])?;
    fs::write(input.join("Ameow.exe"), &app)?;
    fs::write(input.join("AmeowLauncher.exe"), &launcher)?;
    let repository = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let requirements: serde_json::Value = serde_json::from_slice(&fs::read(
        repository.join("distribution/license-inputs.json"),
    )?)?;
    let mut notices = Vec::new();
    for material in requirements["materials"].as_array().ok_or("materials")? {
        let source = material["source"].as_str().ok_or("source")?;
        let destination = material["destination"].as_str().ok_or("destination")?;
        let bytes = fs::read(repository.join(source))?;
        let path = input.join(destination);
        fs::create_dir_all(path.parent().ok_or("path")?)?;
        fs::write(path, &bytes)?;
        notices.push(FileRecord::of(destination, &bytes));
    }
    let inventory = fs::read(repository.join("distribution/license-inputs.json"))?;
    fs::create_dir_all(input.join("licenses"))?;
    fs::write(input.join("licenses/license-inputs.json"), &inventory)?;
    notices.push(FileRecord::of("licenses/license-inputs.json", &inventory));
    let trust = PublicRoots {
        schema: 1,
        keys: vec!["d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a".into()],
    };
    // All-zero source identity deliberately identifies a synthetic layout fixture, not a release build.
    let build = Build {
        schema: 1,
        version: args[3].clone(),
        target: TARGET.into(),
        commit: "0".repeat(40),
        tree: "0".repeat(40),
        tag: None,
        dirty: true,
        source_sha256: hash(b"synthetic first-boot layout fixture"),
        cargo_lock_sha256: hash(&fs::read(repository.join("Cargo.lock"))?),
        toolchain: "1.98.1".into(),
        public_gate_b: "blocked".into(),
        license_review: "not-evaluated".into(),
        trust: trust.clone(),
        app: FileRecord::of("Ameow.exe", &app),
        launcher: FileRecord::of("AmeowLauncher.exe", &launcher),
        notices,
    };
    fs::write(
        input.join("release-build.json"),
        serde_json::to_vec_pretty(&build)?,
    )?;
    fs::write(
        root.join("fixture-public-roots.json"),
        serde_json::to_vec_pretty(&trust)?,
    )?;
    let prepared = root.join("prepared");
    let signed = root.join("signed");
    release::prepare(&input, &prepared)?;
    release::sign_fixture(&prepared, &signed, sequence, issued)?;
    release::verify_signed(&signed, &root.join("fixture-public-roots.json"))?;
    let install = root.join("install");
    fs::create_dir(&install)?;
    let mut archive = zip::ZipArchive::new(fs::File::open(signed.join(format!(
        "Ameow-{}-windows-x64-portable-CONTROLLED.zip",
        args[3]
    )))?)?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let relative = entry.enclosed_name().ok_or("unsafe path")?;
        let path = install.join(relative);
        fs::create_dir_all(path.parent().ok_or("path")?)?;
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes)?;
        fs::write(path, bytes)?;
    }
    println!("FIXTURE ONLY: {}", install.display());
    Ok(())
}
#[cfg(not(all(feature = "app-update-fixture", debug_assertions)))]
fn main() {
    eprintln!("Requires explicit debug-only app-update-fixture");
    std::process::exit(2)
}
