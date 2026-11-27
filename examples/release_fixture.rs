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
    if !(5..=8).contains(&args.len()) {
        return Err("release_fixture <accepted-fixture-app> <accepted-fixture-launcher> <fixture-version> <new-absolute-output> [sequence=1] [issued-unix=now] [published-0.5.2-notice-baseline-zip]".into());
    }
    let sequence = args.get(5).map_or(Ok(1), |value| value.parse::<u64>())?;
    let issued = args.get(6).map_or_else(
        || {
            Ok::<u64, Box<dyn std::error::Error>>(
                SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs(),
            )
        },
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
    let cli = fs::read(
        PathBuf::from(&args[1])
            .parent()
            .ok_or("fixture app directory")?
            .join("ameow-cli.exe"),
    )?;
    fs::write(input.join("Ameow.exe"), &app)?;
    fs::write(input.join("AmeowLauncher.exe"), &launcher)?;
    fs::write(input.join("ameow-cli.exe"), &cli)?;
    let product = PathBuf::from(&args[1]);
    let product = product.parent().ok_or("fixture app directory")?;
    let mut browser = Vec::new();
    for name in [
        "ameow-browser-host.exe",
        "browser-extension/manifest.json",
        "browser-extension/background.js",
        "browser-extension/popup.js",
        "browser-extension/popup.html",
        "browser-extension/popup.css",
        "browser-extension/build.json",
        "browser-extension/LICENSES.txt",
        "browser-extension/page.js",
        "browser-extension/page.css",
        "browser-extension/ameow-cat.svg",
        "browser-extension/icons/16.png",
        "browser-extension/icons/24.png",
        "browser-extension/icons/32.png",
        "browser-extension/icons/48.png",
        "browser-extension/icons/128.png",
    ] {
        let bytes = fs::read(product.join(name))?;
        let path = input.join(name);
        fs::create_dir_all(path.parent().ok_or("browser asset directory")?)?;
        fs::write(path, &bytes)?;
        browser.push(FileRecord::of(name, &bytes));
    }
    let repository = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut notices = Vec::new();
    if let Some(baseline) = args.get(7) {
        // A controlled size comparison keeps every executable and extension byte
        // identical, substituting only the real immutable old legal material.
        // It is still signed solely by the public RFC fixture key, never shipped.
        let bytes = fs::read(baseline)?;
        if hash(&bytes) != "eed1bfd780d383e2605bbf39e0dcb562d59b5c0d5b9f7c9d002727c93a81b913" {
            return Err("published 0.5.2 notice baseline identity differs".into());
        }
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))?;
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i)?;
            let name = entry.name().to_owned();
            if name != "LICENSE" && !name.starts_with("licenses/") {
                continue;
            }
            let relative = entry
                .enclosed_name()
                .ok_or("unsafe notice baseline member")?;
            if entry.is_dir() {
                continue;
            }
            let path = input.join(relative);
            fs::create_dir_all(path.parent().ok_or("notice baseline path")?)?;
            let mut bytes = Vec::new();
            entry.read_to_end(&mut bytes)?;
            fs::write(path, &bytes)?;
            notices.push(FileRecord::of(&name, &bytes));
        }
        fs::write(root.join("MEASUREMENT-ONLY-OLD-NOTICES.txt"),
            b"Controlled compression comparison only. Old notices are not current legal inputs. Never install or distribute this fixture.\n")?;
    } else {
        let inventory = fs::read(repository.join("distribution/license-inputs.json"))?;
        let requirements: serde_json::Value = serde_json::from_slice(&inventory)?;
        for material in requirements["materials"].as_array().ok_or("materials")? {
            let source = material["source"].as_str().ok_or("source")?;
            let destination = material["destination"].as_str().ok_or("destination")?;
            let bytes = fs::read(repository.join(source))?;
            let path = input.join(destination);
            fs::create_dir_all(path.parent().ok_or("path")?)?;
            fs::write(path, &bytes)?;
            notices.push(FileRecord::of(destination, &bytes));
        }
        fs::create_dir_all(input.join("licenses"))?;
        fs::write(input.join("licenses/license-inputs.json"), &inventory)?;
        notices.push(FileRecord::of("licenses/license-inputs.json", &inventory));
    }
    let trust = PublicRoots {
        schema: 1,
        keys: vec!["d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a".into()],
    };
    // All-zero source identity deliberately identifies a synthetic layout fixture, not a release build.
    let build = Build {
        schema: 3,
        version: args[3].clone(),
        target: TARGET.into(),
        commit: "0".repeat(40),
        tree: "0".repeat(40),
        tag: None,
        dirty: true,
        source_sha256: hash(b"synthetic first-boot layout fixture"),
        cargo_lock_sha256: hash(&fs::read(repository.join("Cargo.lock"))?),
        toolchain: "1.98.1".into(),
        trust: trust.clone(),
        app: FileRecord::of("Ameow.exe", &app),
        launcher: FileRecord::of("AmeowLauncher.exe", &launcher),
        cli: Some(FileRecord::of("ameow-cli.exe", &cli)),
        browser,
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
    let mut archive = zip::ZipArchive::new(fs::File::open(
        signed.join(format!("Ameow-{}-windows-x64-portable.zip", args[3])),
    )?)?;
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
