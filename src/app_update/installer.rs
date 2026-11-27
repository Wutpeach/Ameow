//! Narrow, ownership-checked maintenance entry used by the Windows installer.
//! The installer supplies a signed launcher from its verified payload; it never runs
//! an arbitrary program discovered in the destination directory.
use super::{
    BundleFile, Release, SignedManifest, State, Trust, Version, package::hash_reader, store,
};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    path::{Component, Path, PathBuf},
};

const BACKUP: &str = ".ameow-legacy-backup";
const UNINSTALL: &str = ".ameow-uninstall.json";
const HOST: &str = "org.ameow.browser_sessions";

#[derive(Default, Serialize)]
struct Report {
    action: String,
    layout: String,
    completed: Vec<String>,
    retained: Vec<String>,
    remaining: Vec<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Migration {
    state_hash: String,
    launcher_hash: Option<String>,
    files: Vec<BundleFile>,
}
#[derive(Deserialize)]
struct LegacyBaseline {
    members: Vec<BundleFile>,
}
fn legacy_baseline() -> Vec<BundleFile> {
    serde_json::from_str::<LegacyBaseline>(include_str!(
        "../../distribution/legacy-windows-0.5.1.json"
    ))
    .expect("checked-in immutable legacy material is valid")
    .members
}
fn read_migration(backup: &Path) -> Result<Migration, String> {
    let migration: Migration = local_json(&backup.join("migration.json"))?;
    if migration.state_hash.len() != 64
        || !migration.state_hash.bytes().all(|b| b.is_ascii_hexdigit())
        || migration.files.len() > 600
    {
        return Err("E_INSTALLER_BACKUP_RECORD".into());
    }
    for file in &migration.files {
        if file.path.is_empty()
            || file.path.contains(['\\', ':'])
            || file
                .path
                .split('/')
                .any(|p| p.is_empty() || p == "." || p == "..")
            || !([
                "Ameow.exe",
                "AmeowLauncher.exe",
                "ameow-cli.exe",
                "ameow-browser-host.exe",
                "LICENSE",
            ]
            .contains(&file.path.as_str())
                || file.path.starts_with("browser-extension/")
                || file.path.starts_with("licenses/"))
        {
            return Err("E_INSTALLER_BACKUP_PATH".into());
        }
    }
    Ok(migration)
}
fn local_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
    use std::io::Read;
    store::plain(path)?;
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|e| e.to_string())?
        .take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err(format!("E_INSTALLER_METADATA_SIZE: {}", path.display()));
    }
    serde_json::from_slice(&bytes)
        .map_err(|e| format!("E_INSTALLER_METADATA: {}: {e}", path.display()))
}

/// Returns None for ordinary launcher arguments. Reports are written even on failure.
pub fn dispatch(args: &[String]) -> Option<Result<(), String>> {
    if args.first().map(String::as_str) != Some("--installer-maintenance") {
        return None;
    }
    Some((|| {
        if !(args.len() == 4 || args.len() == 5 && args[4] == "--delete-user-data") {
            return Err("E_INSTALLER_ARGUMENTS".into());
        }
        let root = PathBuf::from(&args[2]);
        let report_path = PathBuf::from(&args[3]);
        checked_root(&root)?;
        store::plain(&report_path)?;
        if !report_path.is_absolute() || report_path.starts_with(&root) {
            return Err("E_INSTALLER_REPORT_PATH".into());
        }
        #[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
        let trust = Trust::fixture();
        #[cfg(not(any(test, all(feature = "app-update-fixture", debug_assertions))))]
        let trust = Trust::production()?;
        let mut report = Report {
            action: args[1].clone(),
            ..Default::default()
        };
        let result = if args[1] == "restore-registration" {
            registry::restore_registration(
                &root,
                &report_path.with_extension("arp.json"),
                &mut report,
            )
        } else {
            execute(&root, &trust, &args[1], args.len() == 5, &mut report).and_then(|_| {
                if args[1] == "inspect" {
                    registry::snapshot_other_registration(
                        &root,
                        &report_path.with_extension("arp.json"),
                        &mut report,
                    )?;
                }
                Ok(())
            })
        };
        if let Err(error) = &result {
            report.remaining.push(error.clone());
        }
        let mut text = format!(
            "{}: {}\r\n",
            report.action,
            if result.is_ok() { "OK" } else { "INCOMPLETE" }
        );
        text.push_str(&format!("layout: {}\r\n", report.layout));
        for (label, lines) in [
            ("completed", &report.completed),
            ("retained", &report.retained),
            ("remaining", &report.remaining),
        ] {
            for line in lines {
                text.push_str(&format!("{label}: {line}\r\n"));
            }
        }
        fs::write(&report_path, text).map_err(|e| format!("E_INSTALLER_REPORT: {e}"))?;
        store::atomic_json(&report_path.with_extension("json"), &report)?;
        result
    })())
}

fn checked_root(root: &Path) -> Result<(), String> {
    if !root.is_absolute()
        || root.parent().is_none()
        || root
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
    {
        return Err("E_INSTALLER_ROOT".into());
    }
    store::plain(root)
}
fn digest(path: &Path) -> Result<String, String> {
    store::plain(path)?;
    hash_reader(&mut File::open(path).map_err(|e| format!("{}: {e}", path.display()))?)
        .map(|(_, h)| h)
}
fn read_state(root: &Path) -> Result<Option<State>, String> {
    if root
        .join("state.json")
        .try_exists()
        .map_err(|e| e.to_string())?
    {
        store::read_json(&root.join("state.json")).map(Some)
    } else {
        Ok(None)
    }
}
fn uninstall_receipts(root: &Path, trust: &Trust) -> Result<Vec<SignedManifest>, String> {
    if !root.join(UNINSTALL).exists() {
        return Ok(Vec::new());
    }
    let receipts: Vec<SignedManifest> = local_json(&root.join(UNINSTALL))?;
    if receipts.is_empty() || receipts.len() > 32 {
        return Err("E_INSTALLER_UNINSTALL_RECEIPTS".into());
    }
    for receipt in &receipts {
        owned_bundle(
            trust,
            &serde_json::to_vec(receipt).map_err(|e| e.to_string())?,
        )?;
    }
    Ok(receipts)
}
fn legacy_release(
    root: &Path,
    trust: &Trust,
    release: &Release,
) -> Result<Vec<BundleFile>, String> {
    Version::parse(&release.version)?;
    let directory = root.join("versions").join(&release.version);
    let envelope: SignedManifest = store::read_json(&directory.join("manifest.json"))?;
    let bytes = serde_json::to_vec(&envelope).map_err(|e| e.to_string())?;
    let (_, manifest) = legacy_identity(trust, &bytes)?;
    let expected_url = format!(
        "https://github.com/Wutpeach/Ameow/releases/download/v{}/Ameow-{}-windows-x64.zip",
        release.version, release.version
    );
    if manifest.schema != 1
        || manifest.bundle_sha256.is_some()
        || manifest.url != expected_url
        || manifest.version != release.version
        || manifest.sequence != release.sequence
        || manifest.exe_bytes == 0
        || manifest.exe_bytes > super::package::MAX_PACKAGE
        || super::hash(envelope.payload.as_bytes()) != release.manifest_hash
    {
        return Err("E_INSTALLER_LEGACY_IDENTITY".into());
    }
    let record = BundleFile {
        path: "Ameow.exe".into(),
        bytes: manifest.exe_bytes,
        sha256: manifest.exe_sha256,
    };
    if directory.join(&record.path).exists() {
        verify_file(&directory.join(&record.path), &record)?;
    }
    Ok(vec![record])
}
fn legacy_identity(
    trust: &Trust,
    bytes: &[u8],
) -> Result<(SignedManifest, super::Manifest), String> {
    let result = trust.verify_identity(bytes, None);
    #[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
    let result = result.or_else(|_| Trust::production()?.verify_identity(bytes, None));
    result
}
fn owned_bundle(
    trust: &Trust,
    bytes: &[u8],
) -> Result<(SignedManifest, super::WindowsBundle), String> {
    let result = trust.verify_bundle(bytes, None);
    // Read-only ownership of real old installs in the fixture's isolated filesystem.
    // New candidate acceptance still uses Install::fixture and cannot use these roots.
    #[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
    let result = result.or_else(|_| Trust::production()?.verify_bundle(bytes, None));
    result
}
fn inspect(root: &Path, trust: &Trust, report: &mut Report) -> Result<bool, String> {
    for name in [
        "state.json",
        "entry.json",
        "versions",
        BACKUP,
        "Ameow.exe",
        "AmeowLauncher.exe",
    ] {
        store::plain(&root.join(name))?;
    }
    let Some(state) = read_state(root)? else {
        if !uninstall_receipts(root, trust)?.is_empty() {
            report.layout = "uninstall-in-progress".into();
            return Ok(false);
        }
        if root.join(BACKUP).join("migration.json").is_file() && !root.join("entry.json").exists() {
            let migration = read_migration(&root.join(BACKUP))?;
            if digest(&root.join(BACKUP).join("state.json"))? != migration.state_hash {
                return Err("E_INSTALLER_BACKUP_CHANGED".into());
            }
            report.layout = "legacy-migration-pending".into();
            return Ok(true);
        }
        if [
            "entry.json",
            "Ameow.exe",
            "AmeowLauncher.exe",
            "ameow-cli.exe",
            "ameow-browser-host.exe",
            "browser-extension",
        ]
        .iter()
        .any(|p| root.join(p).exists())
        {
            return Err("E_INSTALLER_UNRECOGNIZED_DESTINATION".into());
        }
        report.layout = "new".into();
        return Ok(false);
    };
    let legacy = !root.join("entry.json").exists();
    if legacy {
        if !root.join("AmeowLauncher.exe").is_file() {
            return Err("E_INSTALLER_UNKNOWN_LEGACY_LAYOUT".into());
        }
        #[cfg(not(any(test, all(feature = "app-update-fixture", debug_assertions))))]
        {
            let launcher = legacy_baseline()
                .into_iter()
                .find(|f| f.path == "AmeowLauncher.exe")
                .ok_or("E_INSTALLER_LEGACY_BASELINE")?;
            verify_file(&root.join(&launcher.path), &launcher)?;
        }
        let releases: Vec<_> = [
            &state.current,
            &state.previous,
            &state.pending,
            &state.trial,
        ]
        .into_iter()
        .flatten()
        .collect();
        if releases.is_empty() {
            return Err("E_INSTALLER_UNKNOWN_LEGACY_STATE".into());
        }
        if ![&state.current, &state.pending, &state.trial]
            .into_iter()
            .flatten()
            .any(|r| {
                root.join("versions")
                    .join(&r.version)
                    .join("Ameow.exe")
                    .is_file()
            })
        {
            return Err("E_INSTALLER_LEGACY_PROGRAM_MISSING".into());
        }
        for release in releases {
            legacy_release(root, trust, release)?;
        }
        report.layout = "legacy-schema1".into();
    } else {
        let (_, bundle) = owned_bundle(
            trust,
            &fs::read(root.join("entry.json")).map_err(|e| e.to_string())?,
        )?;
        if [&state.current, &state.pending, &state.trial]
            .into_iter()
            .flatten()
            .all(|r| r.version != bundle.version)
        {
            // entry.json is the original bootstrap receipt, not an assertion of current.
            report.retained.push(format!(
                "bootstrap {} retained; active state owns version selection",
                bundle.version
            ));
        }
        report.layout = "complete-windows-bundle".into();
    }
    Ok(legacy)
}
fn execute(
    root: &Path,
    trust: &Trust,
    action: &str,
    delete_data: bool,
    report: &mut Report,
) -> Result<(), String> {
    if ![
        "inspect",
        "migrate-legacy",
        "rollback-migration",
        "commit-migration",
        "cleanup",
        "rebind",
    ]
    .contains(&action)
    {
        return Err("E_INSTALLER_ACTION".into());
    }
    if delete_data && action != "cleanup" {
        return Err("E_INSTALLER_ARGUMENTS".into());
    }
    if action == "inspect" {
        inspect(root, trust, report)?;
        return Ok(());
    }
    if !root.is_dir() {
        if action == "migrate-legacy" {
            report.layout = "new".into();
            return Ok(());
        }
        return Err("E_INSTALLER_MISSING_ROOT".into());
    }
    #[cfg(not(any(test, all(feature = "app-update-fixture", debug_assertions))))]
    let _instance = match crate::login_startup::InstanceGuard::acquire_with_restore(false)? {
        crate::login_startup::InstanceAcquire::Duplicate => {
            return Err("E_INSTALLER_RUNNING".into());
        }
        crate::login_startup::InstanceAcquire::Primary(guard) => guard,
    };
    let _running = store::exclusive(&root.join("running.lock"))?;
    let _state_lock = store::exclusive(&root.join("state.lock"))?;
    let result = match action {
        "migrate-legacy" => migrate(root, trust, report),
        "rollback-migration" => rollback(root, report),
        "commit-migration" => commit(root, trust, report),
        "rebind" => registry::rebind(root, report),
        "cleanup" => cleanup(root, trust, delete_data, report),
        _ => unreachable!(),
    };
    drop(_state_lock);
    drop(_running);
    if action == "cleanup" && result.is_ok() {
        for name in ["state.lock", "running.lock"] {
            let path = root.join(name);
            remove_file(&path, None)?;
            report.completed.push(path.display().to_string());
        }
    }
    result
}
fn migrate(root: &Path, trust: &Trust, report: &mut Report) -> Result<(), String> {
    let legacy = inspect(root, trust, report)?;
    if report.layout == "uninstall-in-progress" {
        return Err("E_INSTALLER_FINISH_UNINSTALL_FIRST".into());
    }
    if !legacy {
        return Ok(());
    }
    let backup = root.join(BACKUP);
    let migration: Migration = if backup.exists() {
        read_migration(&backup)?
    } else {
        let mut files = Vec::new();
        for name in [
            "Ameow.exe",
            "AmeowLauncher.exe",
            "ameow-cli.exe",
            "ameow-browser-host.exe",
            "LICENSE",
            "browser-extension",
            "licenses",
        ] {
            inventory(root, &root.join(name), &mut files)?;
        }
        let migration = Migration {
            state_hash: digest(&root.join("state.json"))?,
            launcher_hash: Some(digest(&root.join("AmeowLauncher.exe"))?),
            files,
        };
        fs::create_dir(&backup).map_err(|e| e.to_string())?;
        store::atomic_json(&backup.join("migration.json"), &migration)?;
        migration
    };
    if root.join("state.json").exists() && digest(&root.join("state.json"))? != migration.state_hash
    {
        return Err("E_INSTALLER_BACKUP_CONFLICT".into());
    }
    for record in &migration.files {
        let saved = backup.join("files").join(&record.path);
        if saved.exists() {
            verify_file(&saved, record)?;
        } else {
            verify_file(&root.join(&record.path), record)?;
            fs::create_dir_all(saved.parent().ok_or("E_INSTALLER_BACKUP_PATH")?)
                .map_err(|e| e.to_string())?;
            fs::copy(root.join(&record.path), &saved).map_err(|e| e.to_string())?;
            verify_file(&saved, record)?;
        }
    }
    let state_backup = backup.join("state.json");
    if !state_backup.exists() {
        fs::copy(root.join("state.json"), &state_backup).map_err(|e| e.to_string())?;
    }
    if digest(&state_backup)? != migration.state_hash {
        return Err("E_INSTALLER_BACKUP_CHANGED".into());
    }
    if root.join("state.json").exists() {
        remove_file(&root.join("state.json"), Some(&migration.state_hash))?;
    }
    report
        .completed
        .push("verified legacy state backed up; new signed contract starts independently".into());
    report.retained.push(backup.display().to_string());
    Ok(())
}
fn rollback(root: &Path, report: &mut Report) -> Result<(), String> {
    let backup = root.join(BACKUP);
    if !backup.exists() {
        return Ok(());
    }
    let migration = read_migration(&backup)?;
    if digest(&backup.join("state.json"))? != migration.state_hash {
        return Err("E_INSTALLER_BACKUP_CHANGED".into());
    }
    // Validate every source before replacing any companion. Old files remain byte-for-byte recoverable.
    for record in &migration.files {
        verify_file(&backup.join("files").join(&record.path), record)?;
        store::plain(&root.join(&record.path))?;
    }
    for record in &migration.files {
        let destination = root.join(&record.path);
        fs::create_dir_all(destination.parent().ok_or("E_INSTALLER_BACKUP_PATH")?)
            .map_err(|e| e.to_string())?;
        let mut temporary = tempfile::NamedTempFile::new_in(destination.parent().unwrap())
            .map_err(|e| e.to_string())?;
        std::io::copy(
            &mut File::open(backup.join("files").join(&record.path)).map_err(|e| e.to_string())?,
            temporary.as_file_mut(),
        )
        .map_err(|e| e.to_string())?;
        temporary.as_file().sync_all().map_err(|e| e.to_string())?;
        temporary.persist(&destination).map_err(|e| {
            format!(
                "E_INSTALLER_RESTORE_COMPANION: {}: {e}",
                destination.display()
            )
        })?;
    }
    if root.join("state.json").exists() {
        let new_state = backup.join("rejected-new-state.json");
        if !new_state.exists() {
            fs::copy(root.join("state.json"), new_state).map_err(|e| e.to_string())?;
        }
    }
    if root.join("entry.json").exists() {
        let destination = backup.join("rejected-new-entry.json");
        store::plain(&destination)?;
        if !destination.exists() {
            fs::copy(root.join("entry.json"), &destination).map_err(|e| e.to_string())?;
        }
        remove_file(
            &root.join("entry.json"),
            Some(&digest(&root.join("entry.json"))?),
        )?;
    }
    restore_file(&backup.join("state.json"), &root.join("state.json"))?;
    report.completed.push("legacy state and original launcher/CLI/host/extension restored; legacy version files retained".into());
    Ok(())
}
fn commit(root: &Path, trust: &Trust, report: &mut Report) -> Result<(), String> {
    inspect(root, trust, report)?;
    if report.layout != "complete-windows-bundle" {
        return Err("E_INSTALLER_MIGRATION_NOT_REGISTERED".into());
    }
    if root.join(BACKUP).exists() {
        let migration = read_migration(&root.join(BACKUP))?;
        let _ = migration;
        report.retained.push(format!(
            "{} (migration recovery copy)",
            root.join(BACKUP).display()
        ));
    }
    prune_license_mirrors(root, trust, report)?;
    registry::rebind(root, report)
}
fn prune_license_mirrors(root: &Path, trust: &Trust, report: &mut Report) -> Result<(), String> {
    let versions = root.join("versions");
    store::plain(&versions)?;
    if !versions.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(&versions).map_err(|e| e.to_string())? {
        let directory = entry.map_err(|e| e.to_string())?.path();
        store::plain(&directory)?;
        let receipt = directory.join("bundle.json");
        if !receipt.is_file() {
            continue;
        }
        let (_, bundle) = owned_bundle(trust, &fs::read(&receipt).map_err(|e| e.to_string())?)?;
        if directory.file_name().and_then(|p| p.to_str()) != Some(bundle.version.as_str()) {
            return Err("E_INSTALLER_SLOT_IDENTITY".into());
        }
        for record in bundle
            .files
            .iter()
            .filter(|f| f.path.starts_with("licenses/"))
        {
            let mirror = root.join(&record.path);
            if mirror.is_file() && verify_file(&mirror, record).is_ok() {
                remove_record(&mirror, record, report);
            }
        }
    }
    // The old schema1 app did not sign its companion files. This exact public-ZIP
    // baseline is additional ownership evidence, never a replacement for signatures.
    if root.join(BACKUP).join("migration.json").is_file() {
        let migration = read_migration(&root.join(BACKUP))?;
        for record in legacy_baseline()
            .iter()
            .filter(|f| f.path.starts_with("licenses/"))
        {
            let mirror = root.join(&record.path);
            let saved = root.join(BACKUP).join("files").join(&record.path);
            if migration
                .files
                .iter()
                .any(|f| f.path == record.path && f.sha256 == record.sha256)
                && verify_file(&saved, record).is_ok()
                && mirror.is_file()
                && verify_file(&mirror, record).is_ok()
            {
                remove_record(&mirror, record, report);
            }
        }
    }
    empty_directories(&root.join("licenses"));
    if !report.remaining.is_empty() {
        return Err("E_INSTALLER_LICENSE_PRUNE_INCOMPLETE".into());
    }
    Ok(())
}
fn verify_file(path: &Path, record: &BundleFile) -> Result<(), String> {
    use std::os::windows::fs::OpenOptionsExt;
    store::plain(path)?;
    let _ancestors = guard_ancestors(path)?;
    let mut file = OpenOptions::new()
        .read(true)
        .share_mode(1 | 4)
        .open(path)
        .map_err(|e| format!("{}: {e}", path.display()))?;
    let (bytes, hash) = hash_reader(&mut file)?;
    if bytes != record.bytes || hash != record.sha256 {
        return Err(format!("E_INSTALLER_CHANGED_FILE: {}", path.display()));
    }
    Ok(())
}
fn restore_file(source: &Path, destination: &Path) -> Result<(), String> {
    store::plain(source)?;
    store::plain(destination)?;
    let _source_ancestors = guard_ancestors(source)?;
    let _destination_ancestors = guard_ancestors(destination)?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(destination.parent().ok_or("E_INSTALLER_RESTORE_PATH")?)
            .map_err(|e| e.to_string())?;
    std::io::copy(
        &mut File::open(source).map_err(|e| e.to_string())?,
        temporary.as_file_mut(),
    )
    .map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    temporary
        .persist(destination)
        .map_err(|e| format!("E_INSTALLER_RESTORE: {}: {e}", destination.display()))?;
    Ok(())
}
fn guard_ancestors(path: &Path) -> Result<Vec<File>, String> {
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
    let mut guards = Vec::new();
    for directory in path.ancestors().skip(1) {
        if !directory.exists() {
            continue;
        }
        let guard = OpenOptions::new()
            .read(true)
            .access_mode(0x80)
            .share_mode(1 | 2)
            .custom_flags(0x02000000 | 0x00200000)
            .open(directory)
            .map_err(|e| format!("{}: {e}", directory.display()))?;
        if guard
            .metadata()
            .map_err(|e| e.to_string())?
            .file_attributes()
            & 0x400
            != 0
        {
            return Err(format!("E_INSTALLER_REPARSE: {}", directory.display()));
        }
        guards.push(guard);
    }
    Ok(guards)
}
fn inventory(root: &Path, path: &Path, files: &mut Vec<BundleFile>) -> Result<(), String> {
    store::plain(path)?;
    if !path.try_exists().map_err(|e| e.to_string())? {
        return Ok(());
    }
    if path.is_dir() {
        for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
            inventory(root, &entry.map_err(|e| e.to_string())?.path(), files)?;
        }
    } else {
        let relative = path
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let (bytes, sha256) = hash_reader(&mut File::open(path).map_err(|e| e.to_string())?)?;
        files.push(BundleFile {
            path: relative,
            bytes,
            sha256,
        });
        if files.len() > 600
            || files.iter().map(|f| f.bytes).sum::<u64>() > super::package::MAX_PACKAGE
        {
            return Err("E_INSTALLER_BACKUP_SIZE".into());
        }
    }
    Ok(())
}
fn remove_file(path: &Path, expected: Option<&str>) -> Result<(), String> {
    use std::os::windows::{
        fs::{MetadataExt, OpenOptionsExt},
        io::AsRawHandle,
    };
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_DISPOSITION_INFO, FileDispositionInfo, SetFileInformationByHandle,
    };
    store::plain(path)?;
    if !path.try_exists().map_err(|e| e.to_string())? {
        return Ok(());
    }
    let _ancestors = guard_ancestors(path)?;
    let mut file = OpenOptions::new()
        .read(true)
        .access_mode(0x80000000 | 0x00010000)
        .share_mode(1 | 4)
        .custom_flags(0x00200000)
        .open(path)
        .map_err(|e| format!("{}: {e}", path.display()))?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.file_attributes() & 0x400 != 0 {
        return Err(format!("E_INSTALLER_NOT_FILE: {}", path.display()));
    }
    if let Some(expected) = expected {
        if hash_reader(&mut file)?.1 != expected {
            return Err(format!("E_INSTALLER_CHANGED_FILE: {}", path.display()));
        }
    }
    let disposition = FILE_DISPOSITION_INFO { DeleteFile: true };
    if unsafe {
        SetFileInformationByHandle(
            file.as_raw_handle().cast(),
            FileDispositionInfo,
            (&disposition as *const FILE_DISPOSITION_INFO).cast(),
            std::mem::size_of_val(&disposition) as u32,
        )
    } == 0
    {
        return Err(format!(
            "{}: {}",
            path.display(),
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}
fn remove_record(path: &Path, record: &BundleFile, report: &mut Report) {
    if !path.exists() {
        return;
    }
    match verify_file(path, record).and_then(|_| remove_file(path, Some(&record.sha256))) {
        Ok(()) => report.completed.push(path.display().to_string()),
        Err(error) => report.remaining.push(error),
    }
}
fn empty_directories(path: &Path) {
    if store::plain(path).is_err() {
        return;
    }
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                empty_directories(&entry.path());
            }
        }
    }
    let _ = fs::remove_dir(path);
}
fn cleanup(
    root: &Path,
    trust: &Trust,
    delete_data: bool,
    report: &mut Report,
) -> Result<(), String> {
    inspect(root, trust, report)?;
    let data = data_root(root)?;
    let delete_data = if delete_data {
        match registry::ensure_exclusive_data(root, &data) {
            Ok(()) => true,
            Err(reason) => {
                report.retained.push(format!(
                    "{}: shared data retained: {reason}",
                    data.display()
                ));
                false
            }
        }
    } else {
        false
    };
    let versions = root.join("versions");
    store::plain(&versions)?;
    let mut mirrors = Vec::new();
    let mut slots = Vec::new();
    let mut receipts = uninstall_receipts(root, trust)?;
    if root.join("entry.json").is_file() {
        receipts.push(store::read_json(&root.join("entry.json"))?);
    }
    for receipt in &receipts {
        let (_, bundle) = owned_bundle(
            trust,
            &serde_json::to_vec(receipt).map_err(|e| e.to_string())?,
        )?;
        mirrors.push(bundle.launcher);
        mirrors.extend(bundle.files.into_iter().filter(|f| f.path != "Ameow.exe"));
    }
    if versions.exists() {
        for entry in fs::read_dir(&versions).map_err(|e| e.to_string())? {
            let directory = entry.map_err(|e| e.to_string())?.path();
            let Some(version) = directory.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if Version::parse(version).is_err() || store::plain(&directory).is_err() {
                report.retained.push(directory.display().to_string());
                continue;
            }
            let receipt = directory.join("bundle.json");
            let files = if receipt.is_file() {
                match fs::read(&receipt)
                    .map_err(|e| e.to_string())
                    .and_then(|b| owned_bundle(trust, &b))
                {
                    Ok((_, bundle)) if bundle.version == version => {
                        receipts.push(store::read_json(&receipt)?);
                        mirrors.push(bundle.launcher.clone());
                        mirrors.extend(
                            bundle
                                .files
                                .iter()
                                .filter(|f| f.path != "Ameow.exe")
                                .cloned(),
                        );
                        bundle.files
                    }
                    _ => {
                        report.remaining.push(format!(
                            "E_INSTALLER_UNVERIFIED_SLOT: {}",
                            directory.display()
                        ));
                        continue;
                    }
                }
            } else {
                let manifest: Result<SignedManifest, _> =
                    store::read_json(&directory.join("manifest.json"));
                match manifest.and_then(|e| {
                    legacy_identity(trust, &serde_json::to_vec(&e).map_err(|e| e.to_string())?)
                        .map(|(e, m)| (e, m))
                }) {
                    Ok((envelope, manifest)) => {
                        let release = Release {
                            version: manifest.version,
                            sequence: manifest.sequence,
                            manifest_hash: super::hash(envelope.payload.as_bytes()),
                        };
                        match legacy_release(root, trust, &release) {
                            Ok(f) if release.version == version => f,
                            _ => {
                                report.remaining.push(format!(
                                    "E_INSTALLER_UNVERIFIED_SLOT: {}",
                                    directory.display()
                                ));
                                continue;
                            }
                        }
                    }
                    Err(_) => {
                        report.retained.push(directory.display().to_string());
                        continue;
                    }
                }
            };
            slots.push((directory, files));
        }
    }
    if !report.remaining.is_empty() {
        return Err("E_INSTALLER_UNVERIFIED_OWNERSHIP".into());
    }
    // Validate all known slots before deleting the first member or registration.
    for (directory, files) in &slots {
        for file in files {
            let path = directory.join(&file.path);
            if path.exists() {
                verify_file(&path, file)?;
            }
        }
    }
    if !receipts.is_empty() {
        receipts.sort_by(|a, b| {
            a.payload
                .cmp(&b.payload)
                .then(a.signature.cmp(&b.signature))
        });
        receipts.dedup_by(|a, b| a.payload == b.payload && a.signature == b.signature);
        store::atomic_json(&root.join(UNINSTALL), &receipts)?;
    }
    // A failed optional data purge leaves all program files available for retry.
    if delete_data {
        purge_data(&data, report)?;
    } else {
        report.retained.push(data.display().to_string());
    }
    if !report.remaining.is_empty() {
        return Err("E_INSTALLER_DATA_CLEANUP_INCOMPLETE".into());
    }
    registry::unregister(root, &data, report)?;
    for (directory, files) in &slots {
        for file in files {
            remove_record(&directory.join(&file.path), file, report);
        }
    }
    mirrors.extend(
        legacy_baseline()
            .into_iter()
            .filter(|f| !f.path.starts_with("versions/")),
    );
    mirrors.sort_by_key(|f| f.path == "Ameow.exe");
    for record in mirrors.iter().filter(|f| f.path != "Ameow.exe") {
        let path = root.join(&record.path);
        if report.remaining.is_empty() && path.is_file() && verify_file(&path, &record).is_ok() {
            remove_record(&path, &record, report);
        }
    }
    if report.remaining.is_empty() {
        cleanup_backup(root, report)?;
        for (directory, files) in &slots {
            if files.iter().all(|f| !directory.join(&f.path).exists()) {
                for control in ["manifest.json", "bundle.json"] {
                    let path = directory.join(control);
                    if path.exists() {
                        remove_file(&path, Some(&digest(&path)?))?;
                    }
                }
            }
            empty_directories(directory);
            if directory.exists() {
                report.retained.push(directory.display().to_string());
            }
        }
        for name in ["state.json", "entry.json"] {
            let path = root.join(name);
            if path.is_file() {
                remove_file(&path, Some(&digest(&path)?))?;
                report.completed.push(path.display().to_string());
            }
        }
        for record in mirrors.iter().filter(|f| f.path == "Ameow.exe") {
            let path = root.join("Ameow.exe");
            if path.is_file() && verify_file(&path, record).is_ok() {
                remove_record(&path, record, report);
            }
        }
        if report.remaining.is_empty() && root.join(UNINSTALL).is_file() {
            remove_file(&root.join(UNINSTALL), Some(&digest(&root.join(UNINSTALL))?))?;
        }
    }
    empty_directories(&versions);
    empty_directories(&root.join("staging"));
    empty_directories(&root.join("browser-extension"));
    empty_directories(&root.join("licenses"));
    if !report.remaining.is_empty() {
        return Err("E_INSTALLER_CLEANUP_INCOMPLETE".into());
    }
    Ok(())
}
fn data_root(root: &Path) -> Result<PathBuf, String> {
    #[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
    {
        return Ok(root.join("validation-instance"));
    }
    #[cfg(not(any(test, all(feature = "app-update-fixture", debug_assertions))))]
    {
        let _ = root;
        crate::download::runtime::RuntimeManager::default_root()
    }
}
fn purge_data(data: &Path, report: &mut Report) -> Result<(), String> {
    store::plain(data)?;
    if !data.exists() {
        return Ok(());
    }
    let settings = if data.join("ui-settings.json").is_file() {
        data.join("ui-settings.json")
    } else {
        data.join("settings.json")
    };
    let output = if settings.is_file() {
        let value: serde_json::Value = store::read_json(&settings)?;
        value
            .get("output_dir")
            .and_then(|v| v.as_str())
            .map(PathBuf::from)
    } else {
        None
    };
    let names = [
        "ui-settings.json",
        "settings.json",
        "app-update-settings.json",
        "app-install-receipt.json",
        "lifecycle-receipt.json",
        "lifecycle-receipt.lock",
        "runtime-selection.json",
        "preparation-history.json",
        "prepare.lock",
        "browser-bridge",
        "browser-sessions",
        "jobs",
        "diagnostics",
        "runtime-updates",
        "component-checks",
        "extension-update",
        "ui-settings.downloaders.json",
        "ui-settings.downloaders.invalid",
        "upstream-checks.json",
        "release-proofs",
    ];
    let _prepare = store::exclusive(&data.join("prepare.lock"))?;
    for entry in fs::read_dir(data).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let runtime = name.strip_prefix("runtime-").is_some_and(|s| {
            s.as_bytes()
                .get(..64)
                .is_some_and(|b| b.iter().all(u8::is_ascii_hexdigit))
                && (s.len() == 64
                    || s.get(64..)
                        .is_some_and(|suffix| suffix.starts_with("-recovered-")))
        });
        if name == "prepare.lock" {
            continue;
        }
        let isolated_runtime = cfg!(any(
            test,
            all(feature = "app-update-fixture", debug_assertions)
        )) && name == "runtime";
        if !names.contains(&name) && !runtime && !isolated_runtime {
            report.retained.push(path.display().to_string());
            continue;
        }
        if output.as_ref().is_some_and(|o| overlaps(o, &path)) {
            report
                .retained
                .push(format!("{} (download output)", path.display()));
            continue;
        }
        if name == "jobs" || name == "diagnostics" {
            purge_jobs(&path, report)?;
        } else if runtime {
            purge_runtime(&path, report)?;
        } else if name == "browser-sessions" {
            purge_named(&path, &["sessions.bin", "store.lock"], report)?;
        } else if name == "extension-update" {
            purge_named(&path, &["state.json", "state.lock"], report)?;
        } else if name == "browser-bridge" {
            purge_named(&path, &[&format!("{HOST}.json")], report)?;
        } else if name == "release-proofs" {
            purge_proofs(&path, report)?;
        } else {
            purge_tree(&path, report);
        }
    }
    drop(_prepare);
    remove_file(&data.join("prepare.lock"), None)?;
    empty_directories(data);
    Ok(())
}
fn purge_named(path: &Path, names: &[&str], report: &mut Report) -> Result<(), String> {
    store::plain(path)?;
    for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| names.contains(&n))
        {
            purge_tree(&path, report);
        } else {
            report.retained.push(path.display().to_string());
        }
    }
    empty_directories(path);
    Ok(())
}
fn purge_proofs(path: &Path, report: &mut Report) -> Result<(), String> {
    store::plain(path)?;
    for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.is_file()
            && path.file_name().and_then(|n| n.to_str()).is_some_and(|n| {
                n.ends_with(".proof")
                    && n.bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-')
            })
        {
            purge_tree(&path, report);
        } else {
            report.retained.push(path.display().to_string());
        }
    }
    empty_directories(path);
    Ok(())
}
fn overlaps(a: &Path, b: &Path) -> bool {
    fn key(path: &Path) -> String {
        let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        canonical
            .to_string_lossy()
            .replace('/', &char::from(92).to_string())
            .trim_end_matches(char::from(92))
            .to_lowercase()
    }
    let a = key(a);
    let b = key(b);
    let separator = char::from(92);
    a == b || a.starts_with(&format!("{b}{separator}")) || b.starts_with(&format!("{a}{separator}"))
}
fn purge_jobs(path: &Path, report: &mut Report) -> Result<(), String> {
    store::plain(path)?;
    for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        let owned = path
            .file_name()
            .and_then(|n| n.to_str())
            .and_then(|n| n.strip_prefix("job-"))
            .and_then(|n| n.split_once('-'))
            .is_some_and(|(id, suffix)| {
                !id.is_empty()
                    && id.bytes().all(|b| b.is_ascii_digit())
                    && (6..=12).contains(&suffix.len())
                    && suffix.bytes().all(|b| b.is_ascii_alphanumeric())
            });
        if owned && path.is_dir() {
            purge_tree(&path, report);
        } else {
            report.retained.push(path.display().to_string());
        }
    }
    empty_directories(path);
    Ok(())
}
fn purge_runtime(path: &Path, report: &mut Report) -> Result<(), String> {
    store::plain(path)?;
    let marker = if path.join("complete.json").is_file() {
        path.join("complete.json")
    } else {
        path.join("complete.pending")
    };
    if !marker.is_file() {
        report
            .retained
            .push(format!("{} (unrecognized component cache)", path.display()));
        return Ok(());
    }
    let manifest: crate::download::runtime::Manifest = local_json(&marker)?;
    let expected = path
        .file_name()
        .and_then(|p| p.to_str())
        .and_then(|p| p.strip_prefix("runtime-"))
        .and_then(|p| p.get(..64))
        .ok_or("E_INSTALLER_RUNTIME_IDENTITY")?;
    if !digest(&marker)?.eq_ignore_ascii_case(expected) {
        report.retained.push(format!(
            "{} (component cache identity changed)",
            path.display()
        ));
        return Ok(());
    }
    let mut files = Vec::new();
    for component in manifest.components {
        if !["yt-dlp", "gallery-dl", "deno", "ffmpeg"].contains(&component.name.as_str()) {
            return Err("E_INSTALLER_RUNTIME_COMPONENT".into());
        }
        files.push(format!("{}.artifact", component.name));
        for file in component.files {
            files.push(file.name);
        }
    }
    for name in files {
        let relative = Path::new(&name);
        if relative.is_absolute()
            || relative
                .components()
                .any(|p| !matches!(p, Component::Normal(_)))
        {
            return Err("E_INSTALLER_RUNTIME_PATH".into());
        }
        let file = path.join(relative);
        if file.is_file() {
            purge_tree(&file, report);
        }
    }
    if report.remaining.is_empty() {
        purge_tree(&marker, report);
    }
    empty_directories(path);
    if path.exists() {
        report
            .retained
            .push(format!("{} (other files)", path.display()));
    }
    Ok(())
}
fn cleanup_backup(root: &Path, report: &mut Report) -> Result<(), String> {
    let backup = root.join(BACKUP);
    if !backup.exists() {
        return Ok(());
    }
    let migration = read_migration(&backup)?;
    for name in ["state.json"] {
        let path = backup.join(name);
        if path.is_file() {
            remove_file(&path, Some(&migration.state_hash))?;
            report.completed.push(path.display().to_string());
        }
    }
    if let Some(hash) = migration.launcher_hash {
        let path = root.join("AmeowLauncher.exe");
        if path.is_file() {
            remove_file(&path, Some(&hash))?;
            report.completed.push(path.display().to_string());
        }
    }
    for record in migration.files {
        remove_record(&backup.join("files").join(&record.path), &record, report);
    }
    if !report.remaining.is_empty() {
        return Err("E_INSTALLER_CLEANUP_INCOMPLETE".into());
    }
    let marker = backup.join("migration.json");
    remove_file(&marker, Some(&digest(&marker)?))?;
    empty_directories(&backup);
    if backup.exists() {
        report.retained.push(backup.display().to_string());
    }
    Ok(())
}
/// A failed first Ready after an installer migration can still launch the complete
/// old installation. Its state is restored separately; it is never accepted as a bundle.
pub fn recover_legacy_launch(root: &Path, args: &[String]) -> Result<bool, String> {
    if !root.join(BACKUP).join("migration.json").is_file() {
        return Ok(false);
    }
    let state = read_state(root)?.ok_or("E_INSTALLER_RECOVERY_STATE")?;
    if root.join("entry.json").exists()
        && (state.current.is_some() || state.trial.is_some() || state.pending.is_some())
    {
        return Ok(false);
    }
    let backup = root.join(BACKUP);
    let migration = read_migration(&backup)?;
    if digest(&backup.join("state.json"))? != migration.state_hash {
        return Err("E_INSTALLER_BACKUP_CHANGED".into());
    }
    let legacy: State = store::read_json(&backup.join("state.json"))?;
    #[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
    let trust = Trust::fixture();
    #[cfg(not(any(test, all(feature = "app-update-fixture", debug_assertions))))]
    let trust = Trust::production()?;
    for release in [
        &legacy.current,
        &legacy.previous,
        &legacy.pending,
        &legacy.trial,
    ]
    .into_iter()
    .flatten()
    {
        legacy_release(root, &trust, release)?;
    }
    {
        let _running = store::exclusive(&root.join("running.lock"))?;
        let _state = store::exclusive(&root.join("state.lock"))?;
        rollback(root, &mut Report::default())?;
    }
    #[cfg(any(test, all(feature = "app-update-fixture", debug_assertions)))]
    {
        let _ = args;
        return Err("E_INSTALLER_LEGACY_RECOVERED: original installation restored; fixture never starts the original production launcher".into());
    }
    #[cfg(not(any(test, all(feature = "app-update-fixture", debug_assertions))))]
    {
        // Recovery may execute only the published old companions, not an arbitrary
        // executable that happened to use the legacy launcher filename.
        for record in legacy_baseline().into_iter().filter(|f| {
            [
                "AmeowLauncher.exe",
                "ameow-cli.exe",
                "ameow-browser-host.exe",
            ]
            .contains(&f.path.as_str())
        }) {
            verify_file(&root.join(&record.path), &record)?;
        }
        let status = std::process::Command::new(root.join("AmeowLauncher.exe"))
            .args(args)
            .status()
            .map_err(|e| format!("E_INSTALLER_LEGACY_RECOVERY: {e}"))?;
        if !status.success() {
            return Err(format!(
                "E_INSTALLER_LEGACY_RECOVERY_EXIT: {:?}",
                status.code()
            ));
        }
        Ok(true)
    }
}
fn purge_tree(path: &Path, report: &mut Report) {
    if let Err(e) = store::plain(path) {
        report.remaining.push(format!("{}: {e}", path.display()));
        return;
    }
    let result = if path.is_dir() {
        match fs::read_dir(path) {
            Ok(entries) => {
                for entry in entries {
                    match entry {
                        Ok(e) => purge_tree(&e.path(), report),
                        Err(e) => report.remaining.push(e.to_string()),
                    }
                }
                fs::remove_dir(path).map_err(|e| e.to_string())
            }
            Err(e) => Err(e.to_string()),
        }
    } else {
        remove_file(path, None)
    };
    match result {
        Ok(()) => report.completed.push(path.display().to_string()),
        Err(e) => report.remaining.push(format!("{}: {e}", path.display())),
    }
}

#[path = "installer_registry.rs"]
mod registry;
#[cfg(test)]
#[path = "installer_tests.rs"]
mod tests;
