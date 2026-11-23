use super::{Manifest, package::MAX_PACKAGE};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    os::unix::fs::{MetadataExt, PermissionsExt, symlink},
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicBool, Ordering},
};

const MAX_MEMBERS: usize = 16_384;
const MAX_PATH: usize = 1024;
const EXECUTABLE: &str = "Ameow.app/Contents/MacOS/ameow";

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Directory,
    File,
    Link,
}

fn cancelled(cancel: Option<&AtomicBool>) -> Result<(), String> {
    if cancel.is_some_and(|flag| flag.load(Ordering::Acquire)) {
        Err("E_APP_UPDATE_CANCELLED".into())
    } else {
        Ok(())
    }
}

fn hash_checked(
    reader: &mut impl Read,
    cancel: Option<&AtomicBool>,
) -> Result<(u64, String), String> {
    let mut digest = Sha256::new();
    let mut size = 0u64;
    let mut buffer = [0; 65536];
    loop {
        cancelled(cancel)?;
        let count = reader
            .read(&mut buffer)
            .map_err(|e| format!("E_APP_UPDATE_READ: {e}"))?;
        if count == 0 {
            break;
        }
        size = size.checked_add(count as u64).ok_or("E_APP_UPDATE_SIZE")?;
        if size > MAX_PACKAGE {
            return Err("E_APP_UPDATE_SIZE".into());
        }
        digest.update(&buffer[..count]);
    }
    Ok((size, format!("{:x}", digest.finalize())))
}

fn member_path(name: &str, directory: bool) -> Result<String, String> {
    if name.len() > MAX_PATH || name.contains(['\\', ':', '\0']) {
        return Err("E_APP_UPDATE_ZIP_PATH".into());
    }
    let name = if directory {
        name.strip_suffix('/').unwrap_or(name)
    } else {
        name
    };
    let parts: Vec<_> = name.split('/').collect();
    if parts.first() != Some(&"Ameow.app")
        || parts
            .iter()
            .any(|part| part.is_empty() || *part == "." || *part == "..")
        || (parts.len() == 1 && !directory)
    {
        return Err("E_APP_UPDATE_ZIP_PATH".into());
    }
    Ok(name.to_string())
}

fn register(
    entries: &mut BTreeMap<String, Kind>,
    folded: &mut BTreeMap<String, String>,
    path: &str,
    kind: Kind,
) -> Result<(), String> {
    let key = path.to_lowercase();
    if folded.get(&key).is_some_and(|existing| existing != path)
        || entries.get(path).is_some_and(|existing| *existing != kind)
    {
        return Err("E_APP_UPDATE_ZIP_DUPLICATE".into());
    }
    folded.insert(key, path.to_string());
    entries.insert(path.to_string(), kind);
    Ok(())
}

fn expected_parents(
    entries: &mut BTreeMap<String, Kind>,
    folded: &mut BTreeMap<String, String>,
    path: &str,
) -> Result<(), String> {
    let mut parent = Path::new(path).parent();
    while let Some(part) = parent {
        if part.as_os_str().is_empty() {
            break;
        }
        register(
            entries,
            folded,
            part.to_str().ok_or("E_APP_UPDATE_ZIP_PATH")?,
            Kind::Directory,
        )?;
        parent = part.parent();
    }
    Ok(())
}

fn read_link_target(reader: &mut impl Read, size: u64) -> Result<PathBuf, String> {
    if size == 0 || size > 4096 {
        return Err("E_APP_UPDATE_ZIP_LINK".into());
    }
    let mut bytes = Vec::new();
    reader
        .take(size + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 != size || bytes.contains(&0) || bytes.contains(&b'\\') {
        return Err("E_APP_UPDATE_ZIP_LINK".into());
    }
    let target = PathBuf::from(String::from_utf8(bytes).map_err(|_| "E_APP_UPDATE_ZIP_LINK")?);
    if target.is_absolute() {
        return Err("E_APP_UPDATE_ZIP_LINK".into());
    }
    Ok(target)
}

fn copy_member(
    reader: &mut impl Read,
    output: &mut File,
    size: u64,
    cancel: Option<&AtomicBool>,
) -> Result<(), String> {
    let mut left = size;
    let mut buffer = [0; 65536];
    while left > 0 {
        cancelled(cancel)?;
        let limit = buffer.len().min(left as usize);
        let count = reader
            .read(&mut buffer[..limit])
            .map_err(|e| e.to_string())?;
        if count == 0 {
            return Err("E_APP_UPDATE_ZIP_SIZE".into());
        }
        output
            .write_all(&buffer[..count])
            .map_err(|e| e.to_string())?;
        left -= count as u64;
    }
    let mut extra = [0];
    if reader.read(&mut extra).map_err(|e| e.to_string())? != 0 {
        return Err("E_APP_UPDATE_ZIP_SIZE".into());
    }
    output.sync_all().map_err(|e| e.to_string())
}

fn actual_entries(
    root: &Path,
    path: &Path,
    found: &mut BTreeMap<String, Kind>,
) -> Result<(), String> {
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    let name = path
        .strip_prefix(root)
        .map_err(|_| "E_APP_UPDATE_ZIP_PATH")?
        .to_str()
        .ok_or("E_APP_UPDATE_ZIP_PATH")?
        .to_string();
    let kind = if meta.is_dir() {
        Kind::Directory
    } else if meta.is_file() {
        if meta.nlink() != 1 {
            return Err("E_APP_UPDATE_BUNDLE_TYPE".into());
        }
        Kind::File
    } else if meta.file_type().is_symlink() {
        Kind::Link
    } else {
        return Err("E_APP_UPDATE_BUNDLE_TYPE".into());
    };
    found.insert(name, kind);
    if meta.is_dir() {
        for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
            actual_entries(root, &entry.map_err(|e| e.to_string())?.path(), found)?;
        }
    }
    Ok(())
}

fn inspect(
    archive: &mut File,
    root: &Path,
    manifest: &Manifest,
    extract: bool,
    cancel: Option<&AtomicBool>,
) -> Result<(), String> {
    archive
        .seek(SeekFrom::Start(0))
        .map_err(|e| e.to_string())?;
    let (size, digest) = hash_checked(archive, cancel)?;
    if size != manifest.package_bytes || digest != manifest.package_sha256 {
        return Err("E_APP_UPDATE_PACKAGE_HASH".into());
    }
    archive
        .seek(SeekFrom::Start(0))
        .map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(archive).map_err(|_| "E_APP_UPDATE_ZIP")?;
    if zip.len() == 0 || zip.len() > MAX_MEMBERS {
        return Err("E_APP_UPDATE_ZIP_MEMBERS".into());
    }
    let mut entries = BTreeMap::new();
    let mut folded = BTreeMap::new();
    let mut explicit = BTreeSet::new();
    let mut links = Vec::new();
    let mut total = 0u64;
    for index in 0..zip.len() {
        cancelled(cancel)?;
        let mut member = zip.by_index(index).map_err(|_| "E_APP_UPDATE_ZIP")?;
        let mode = member
            .unix_mode()
            .unwrap_or(if member.is_dir() { 0o40755 } else { 0o100644 });
        let file_type = mode & 0o170000;
        let kind = if member.is_dir() && (file_type == 0 || file_type == 0o040000) {
            Kind::Directory
        } else if !member.is_dir() && file_type == 0o120000 {
            Kind::Link
        } else if !member.is_dir() && (file_type == 0 || file_type == 0o100000) {
            Kind::File
        } else {
            return Err("E_APP_UPDATE_ZIP_TYPE".into());
        };
        if mode & 0o7000 != 0 {
            return Err("E_APP_UPDATE_ZIP_MODE".into());
        }
        let name = member_path(member.name(), kind == Kind::Directory)?;
        if !explicit.insert(name.clone()) {
            return Err("E_APP_UPDATE_ZIP_DUPLICATE".into());
        }
        expected_parents(&mut entries, &mut folded, &name)?;
        register(&mut entries, &mut folded, &name, kind)?;
        total = total
            .checked_add(member.size())
            .ok_or("E_APP_UPDATE_ZIP_SIZE")?;
        if total > MAX_PACKAGE || (kind == Kind::Directory && member.size() != 0) {
            return Err("E_APP_UPDATE_ZIP_SIZE".into());
        }
        let path = root.join(&name);
        match kind {
            Kind::Directory => {
                if extract {
                    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
                } else {
                    super::macos_fs::directory(&path)?;
                }
            }
            Kind::Link => {
                let size = member.size();
                let target = read_link_target(&mut member, size)?;
                links.push((path, target));
            }
            Kind::File => {
                if extract {
                    fs::create_dir_all(path.parent().ok_or("E_APP_UPDATE_ZIP_PATH")?)
                        .map_err(|e| e.to_string())?;
                    let mut output = OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(&path)
                        .map_err(|e| format!("E_APP_UPDATE_ZIP_FILE: {e}"))?;
                    let size = member.size();
                    copy_member(&mut member, &mut output, size, cancel)?;
                    fs::set_permissions(&path, fs::Permissions::from_mode(mode & 0o777))
                        .map_err(|e| e.to_string())?;
                } else {
                    let mut file = super::macos_fs::regular_file(&path)?;
                    let meta = file.metadata().map_err(|e| e.to_string())?;
                    if !meta.is_file()
                        || meta.nlink() != 1
                        || meta.len() != member.size()
                        || meta.mode() & 0o7777 != mode & 0o777
                    {
                        return Err("E_APP_UPDATE_BUNDLE_FILE".into());
                    }
                    let (_, expected) = hash_checked(&mut member, cancel)?;
                    let (_, actual) = hash_checked(&mut file, cancel)?;
                    if expected != actual {
                        return Err("E_APP_UPDATE_BUNDLE_HASH".into());
                    }
                }
            }
        }
    }
    if extract {
        for (path, target) in &links {
            fs::create_dir_all(path.parent().ok_or("E_APP_UPDATE_ZIP_PATH")?)
                .map_err(|e| e.to_string())?;
            symlink(target, path).map_err(|e| e.to_string())?;
        }
    }
    let bundle = root
        .join("Ameow.app")
        .canonicalize()
        .map_err(|e| e.to_string())?;
    for (path, target) in links {
        if fs::read_link(&path).map_err(|e| e.to_string())? != target
            || !path
                .canonicalize()
                .map_err(|_| "E_APP_UPDATE_ZIP_LINK")?
                .starts_with(&bundle)
        {
            return Err("E_APP_UPDATE_ZIP_LINK".into());
        }
    }
    let mut actual = BTreeMap::new();
    actual_entries(root, &root.join("Ameow.app"), &mut actual)?;
    if actual != entries {
        return Err("E_APP_UPDATE_BUNDLE_MEMBERS".into());
    }
    let exe = root.join(EXECUTABLE);
    let mut executable = super::macos_fs::regular_file(&exe)?;
    let meta = executable.metadata().map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.nlink() != 1 || meta.mode() & 0o111 == 0 {
        return Err("E_APP_UPDATE_EXECUTABLE".into());
    }
    let (size, digest) = hash_checked(&mut executable, cancel)?;
    if size != manifest.exe_bytes || digest != manifest.exe_sha256 {
        return Err("E_APP_UPDATE_EXECUTABLE_HASH".into());
    }
    super::macos_fs::regular_file(&root.join("Ameow.app/Contents/Info.plist"))
        .map_err(|_| "E_APP_UPDATE_BUNDLE_IDENTITY")?;
    let helper = super::macos_fs::regular_file(&root.join("Ameow.app/Contents/MacOS/ameow-updater"))
        .and_then(|file| file.metadata().map_err(|error| error.to_string()))
        .map_err(|_| "E_APP_UPDATE_HELPER_MISSING")?;
    if !helper.is_file() || helper.nlink() != 1 || helper.mode() & 0o111 == 0 {
        return Err("E_APP_UPDATE_HELPER_MISSING".into());
    }
    Ok(())
}

pub(super) fn extract(
    archive: &mut File,
    root: &Path,
    manifest: &Manifest,
    cancel: Option<&AtomicBool>,
) -> Result<(), String> {
    inspect(archive, root, manifest, true, cancel)?;
    inspect(archive, root, manifest, false, cancel)
}

pub(super) fn verify(archive: &mut File, root: &Path, manifest: &Manifest) -> Result<(), String> {
    inspect(archive, root, manifest, false, None)
}

pub(super) fn exchange(first: &Path, second: &Path) -> Result<(), String> {
    use std::os::{fd::AsRawFd, unix::ffi::OsStrExt};
    unsafe extern "C" {
        fn renameatx_np(
            from_fd: std::os::raw::c_int,
            from: *const std::os::raw::c_char,
            to_fd: std::os::raw::c_int,
            to: *const std::os::raw::c_char,
            flags: std::os::raw::c_uint,
        ) -> std::os::raw::c_int;
    }
    if !first.is_absolute()
        || !second.is_absolute()
        || first == second
        || first.starts_with(second)
        || second.starts_with(first)
    {
        return Err("E_APP_UPDATE_SWAP_PATH".into());
    }
    let first_parent = first.parent().ok_or("E_APP_UPDATE_SWAP_PATH")?;
    let second_parent = second.parent().ok_or("E_APP_UPDATE_SWAP_PATH")?;
    let first_dir = super::macos_fs::directory(first_parent)?;
    let second_dir = super::macos_fs::directory(second_parent)?;
    let first_entry = super::macos_fs::child_directory(
        &first_dir, first.file_name().ok_or("E_APP_UPDATE_SWAP_PATH")?,
    )?;
    let second_entry = super::macos_fs::child_directory(
        &second_dir, second.file_name().ok_or("E_APP_UPDATE_SWAP_PATH")?,
    )?;
    if first_entry.metadata().map_err(|e| e.to_string())?.dev()
        != second_entry.metadata().map_err(|e| e.to_string())?.dev() {
        return Err("E_APP_UPDATE_SWAP_PATH".into());
    }
    let first_name = std::ffi::CString::new(
        first
            .file_name()
            .ok_or("E_APP_UPDATE_SWAP_PATH")?
            .as_bytes(),
    )
    .map_err(|_| "E_APP_UPDATE_SWAP_PATH")?;
    let second_name = std::ffi::CString::new(
        second
            .file_name()
            .ok_or("E_APP_UPDATE_SWAP_PATH")?
            .as_bytes(),
    )
    .map_err(|_| "E_APP_UPDATE_SWAP_PATH")?;
    if unsafe {
        renameatx_np(
            first_dir.as_raw_fd(),
            first_name.as_ptr(),
            second_dir.as_raw_fd(),
            second_name.as_ptr(),
            2,
        )
    } != 0
    {
        return Err(format!(
            "E_APP_UPDATE_SWAP: {}",
            std::io::Error::last_os_error()
        ));
    }
    first_dir.sync_all().and_then(|_| second_dir.sync_all())
        .map_err(|error| format!("E_APP_UPDATE_SWAP_SYNC: {error}"))?;
    Ok(())
}

pub(super) fn restore_missing(staged: &Path, installed: &Path) -> Result<(), String> {
    use std::os::{fd::AsRawFd, unix::ffi::OsStrExt};
    unsafe extern "C" {
        fn renameatx_np(from_fd: i32, from: *const std::ffi::c_char,
            to_fd: i32, to: *const std::ffi::c_char, flags: u32) -> i32;
    }
    if !staged.is_absolute() || !installed.is_absolute() || staged == installed {
        return Err("E_APP_UPDATE_SWAP_PATH".into());
    }
    match fs::symlink_metadata(installed) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        _ => return Err("E_APP_UPDATE_SWAP_PATH".into()),
    }
    let source_parent = staged.parent().ok_or("E_APP_UPDATE_SWAP_PATH")?;
    let target_parent = installed.parent().ok_or("E_APP_UPDATE_SWAP_PATH")?;
    let source_dir = super::macos_fs::directory(source_parent)?;
    let target_dir = super::macos_fs::directory(target_parent)?;
    let source = super::macos_fs::child_directory(
        &source_dir, staged.file_name().ok_or("E_APP_UPDATE_SWAP_PATH")?,
    )?.metadata().map_err(|e| e.to_string())?;
    if source.dev() != source_dir.metadata().map_err(|e| e.to_string())?.dev()
        || source.dev() != target_dir.metadata().map_err(|e| e.to_string())?.dev() {
        return Err("E_APP_UPDATE_SWAP_PATH".into());
    }
    let source_name = std::ffi::CString::new(staged.file_name().ok_or("E_APP_UPDATE_SWAP_PATH")?.as_bytes())
        .map_err(|_| "E_APP_UPDATE_SWAP_PATH")?;
    let target_name = std::ffi::CString::new(installed.file_name().ok_or("E_APP_UPDATE_SWAP_PATH")?.as_bytes())
        .map_err(|_| "E_APP_UPDATE_SWAP_PATH")?;
    if unsafe { renameatx_np(source_dir.as_raw_fd(), source_name.as_ptr(),
        target_dir.as_raw_fd(), target_name.as_ptr(), 4) } != 0 {
        return Err(format!("E_APP_UPDATE_SWAP: {}", std::io::Error::last_os_error()));
    }
    source_dir.sync_all().and_then(|_| target_dir.sync_all())
        .map_err(|error| format!("E_APP_UPDATE_SWAP_SYNC: {error}"))
}

fn command(program: &str, args: &[&std::ffi::OsStr]) -> Result<std::process::Output, String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!(
            "E_APP_UPDATE_CODESIGN: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(output)
}

pub(super) fn plist_value(bundle: &Path, key: &str) -> Result<String, String> {
    let plist = bundle.join("Contents/Info.plist");
    let output = command(
        "/usr/bin/plutil",
        &[
            "-extract".as_ref(),
            key.as_ref(),
            "raw".as_ref(),
            "-o".as_ref(),
            "-".as_ref(),
            plist.as_os_str(),
        ],
    )?;
    Ok(String::from_utf8(output.stdout)
        .map_err(|_| "E_APP_UPDATE_BUNDLE_IDENTITY")?
        .trim()
        .to_string())
}

pub(super) fn current_bundle() -> Result<PathBuf, String> {
    let executable = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let bundle = executable
        .parent()
        .and_then(Path::parent)
        .and_then(Path::parent)
        .ok_or("E_APP_UPDATE_BUNDLE_IDENTITY")?
        .to_path_buf();
    if executable != bundle.join("Contents/MacOS/ameow")
        && executable != bundle.join("Contents/MacOS/ameow-updater")
        || bundle.extension().is_none_or(|ext| ext != "app")
    {
        return Err("E_APP_UPDATE_BUNDLE_IDENTITY".into());
    }
    Ok(bundle)
}

fn team(bundle: &Path) -> Result<Option<String>, String> {
    let output = command(
        "/usr/bin/codesign",
        &["-dv".as_ref(), "--verbose=4".as_ref(), bundle.as_os_str()],
    )?;
    let text = String::from_utf8_lossy(&output.stderr);
    let team = text
        .lines()
        .find_map(|line| line.strip_prefix("TeamIdentifier="))
        .ok_or("E_APP_UPDATE_CODESIGN_IDENTITY")?;
    if team == "not set" {
        return Ok(None);
    }
    if team.len() != 10
        || !team
            .bytes()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
    {
        return Err("E_APP_UPDATE_CODESIGN_IDENTITY".into());
    }
    Ok(Some(team.to_string()))
}

fn verify_arm64(path: &Path) -> Result<(), String> {
    fn word(bytes: &[u8], little: bool) -> u32 {
        let value: [u8; 4] = bytes.try_into().unwrap();
        if little {
            u32::from_le_bytes(value)
        } else {
            u32::from_be_bytes(value)
        }
    }
    fn wide(bytes: &[u8], little: bool) -> u64 {
        let value: [u8; 8] = bytes.try_into().unwrap();
        if little {
            u64::from_le_bytes(value)
        } else {
            u64::from_be_bytes(value)
        }
    }
    fn thin(file: &mut File, offset: u64, available: u64) -> Result<bool, String> {
        if available < 32 {
            return Err("E_APP_UPDATE_ARCH".into());
        }
        file.seek(SeekFrom::Start(offset))
            .map_err(|e| e.to_string())?;
        let mut header = [0; 32];
        file.read_exact(&mut header)
            .map_err(|_| "E_APP_UPDATE_ARCH")?;
        let little = match &header[..4] {
            [0xcf, 0xfa, 0xed, 0xfe] => true,
            [0xfe, 0xed, 0xfa, 0xcf] => false,
            _ => return Err("E_APP_UPDATE_ARCH".into()),
        };
        Ok(word(&header[4..8], little) == 0x0100000c)
    }
    let mut file = super::macos_fs::regular_file(path)?;
    let len = file.metadata().map_err(|e| e.to_string())?.len();
    let mut header = [0; 8];
    file.read_exact(&mut header)
        .map_err(|_| "E_APP_UPDATE_ARCH")?;
    let (little, fat64) = match &header[..4] {
        [0xca, 0xfe, 0xba, 0xbe] => (false, false),
        [0xbe, 0xba, 0xfe, 0xca] => (true, false),
        [0xca, 0xfe, 0xba, 0xbf] => (false, true),
        [0xbf, 0xba, 0xfe, 0xca] => (true, true),
        _ => {
            return if thin(&mut file, 0, len)? {
                Ok(())
            } else {
                Err("E_APP_UPDATE_ARCH".into())
            };
        }
    };
    let count = word(&header[4..8], little);
    let entry_size = if fat64 { 32usize } else { 20usize };
    if count == 0 || count > 64 || 8 + count as u64 * entry_size as u64 > len {
        return Err("E_APP_UPDATE_ARCH".into());
    }
    let mut found = None;
    for _ in 0..count {
        let mut entry = [0; 32];
        file.read_exact(&mut entry[..entry_size])
            .map_err(|_| "E_APP_UPDATE_ARCH")?;
        if word(&entry[..4], little) != 0x0100000c {
            continue;
        }
        if found.is_some() {
            return Err("E_APP_UPDATE_ARCH".into());
        }
        let (offset, size) = if fat64 {
            (wide(&entry[8..16], little), wide(&entry[16..24], little))
        } else {
            (
                word(&entry[8..12], little) as u64,
                word(&entry[12..16], little) as u64,
            )
        };
        if offset.checked_add(size).is_none_or(|end| end > len)
            || offset < 8 + count as u64 * entry_size as u64
        {
            return Err("E_APP_UPDATE_ARCH".into());
        }
        found = Some((offset, size));
    }
    let (offset, size) = found.ok_or("E_APP_UPDATE_ARCH")?;
    if thin(&mut file, offset, size)? {
        Ok(())
    } else {
        Err("E_APP_UPDATE_ARCH".into())
    }
}

pub(super) fn verify_codesign(bundle: &Path, manifest: &Manifest) -> Result<(), String> {
    let current = current_bundle()?;
    verify_codesign_against(&current, bundle, manifest)
}

pub(super) fn verify_codesign_against(
    current: &Path,
    bundle: &Path,
    manifest: &Manifest,
) -> Result<(), String> {
    for app in [current, bundle] {
        command(
            "/usr/bin/codesign",
            &[
                "--verify".as_ref(),
                "--deep".as_ref(),
                "--strict".as_ref(),
                app.as_os_str(),
            ],
        )?;
    }
    if plist_value(current, "CFBundleIdentifier")? != "io.github.wutpeach.ameow"
        || plist_value(bundle, "CFBundleIdentifier")? != "io.github.wutpeach.ameow"
        || plist_value(bundle, "CFBundleExecutable")? != "ameow"
        || plist_value(bundle, "CFBundlePackageType")? != "APPL"
        || plist_value(bundle, "CFBundleShortVersionString")? != manifest.version
    {
        return Err("E_APP_UPDATE_BUNDLE_IDENTITY".into());
    }
    for name in ["ameow", "ameow-updater"] {
        let executable = bundle.join("Contents/MacOS").join(name);
        verify_arm64(&executable)?;
    }
    if let Some(current_team) = team(current)? {
        if team(bundle)?.as_deref() != Some(current_team.as_str()) {
            return Err("E_APP_UPDATE_CODESIGN_IDENTITY".into());
        }
        let output = command("/usr/bin/codesign", &["-dr-".as_ref(), current.as_os_str()])?;
        let text = format!(
            "{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        let requirement = text
            .lines()
            .find_map(|line| line.strip_prefix("designated => "))
            .ok_or("E_APP_UPDATE_CODESIGN_IDENTITY")?;
        let test = format!("={requirement}");
        command(
            "/usr/bin/codesign",
            &[
                "--verify".as_ref(),
                "--deep".as_ref(),
                "--strict".as_ref(),
                "-R".as_ref(),
                test.as_ref(),
                bundle.as_os_str(),
            ],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_update::package::{MACOS_ARM_TARGET, hash};
    use std::io::Cursor;

    fn package(extra: &[(&str, &[u8])], link: Option<(&str, &str)>) -> (Manifest, Vec<u8>) {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default().unix_permissions(0o755);
        for (name, bytes) in [
            (EXECUTABLE, &b"main executable"[..]),
            ("Ameow.app/Contents/Info.plist", &b"plist"[..]),
            ("Ameow.app/Contents/MacOS/ameow-updater", &b"helper"[..]),
        ]
        .into_iter()
        .chain(extra.iter().copied())
        {
            writer.start_file(name, options).unwrap();
            writer.write_all(bytes).unwrap();
        }
        if let Some((name, target)) = link {
            writer.add_symlink(name, target, options).unwrap();
        }
        let bytes = writer.finish().unwrap().into_inner();
        let manifest = Manifest {
            schema: 1,
            product: "Ameow".into(), channel: "stable".into(),
            target: MACOS_ARM_TARGET.into(), version: "1.0.0".into(), sequence: 1, issued: 1,
            url: "https://github.com/Wutpeach/Ameow/releases/download/v1.0.0/Ameow-1.0.0-macos-arm64.zip".into(),
            package_bytes: bytes.len() as u64, package_sha256: hash(&bytes),
            exe_bytes: b"main executable".len() as u64, exe_sha256: hash(b"main executable"),
            bundle_sha256: None,
        };
        (manifest, bytes)
    }

    fn open_archive(root: &Path, bytes: &[u8]) -> File {
        let path = root.join("package.zip");
        fs::write(&path, bytes).unwrap();
        OpenOptions::new()
            .read(true)
            .write(true)
            .open(path)
            .unwrap()
    }

    #[test]
    fn verified_bundle_detects_tampering_and_unexpected_files() {
        let root = tempfile::tempdir().unwrap();
        let (manifest, bytes) =
            package(&[("Ameow.app/Contents/Resources/data", b"resource")], None);
        let mut archive = open_archive(root.path(), &bytes);
        extract(&mut archive, root.path(), &manifest, None).unwrap();
        verify(&mut archive, root.path(), &manifest).unwrap();
        let resource = root.path().join("Ameow.app/Contents/Resources/data");
        fs::write(&resource, b"tampered").unwrap();
        assert!(verify(&mut archive, root.path(), &manifest).is_err());
        fs::write(&resource, b"resource").unwrap();
        fs::write(
            root.path().join("Ameow.app/Contents/Resources/extra"),
            b"extra",
        )
        .unwrap();
        assert_eq!(
            verify(&mut archive, root.path(), &manifest).unwrap_err(),
            "E_APP_UPDATE_BUNDLE_MEMBERS"
        );
    }

    #[test]
    fn verification_rejects_a_redirected_resource_directory_even_with_matching_contents() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().canonicalize().unwrap();
        let (manifest, bytes) =
            package(&[("Ameow.app/Contents/Resources/data", b"resource")], None);
        let mut archive = open_archive(&root, &bytes);
        extract(&mut archive, &root, &manifest, None).unwrap();
        let resources = root.join("Ameow.app/Contents/Resources");
        let moved = root.join("outside-resources");
        fs::rename(&resources, &moved).unwrap();
        symlink(&moved, &resources).unwrap();
        let error = verify(&mut archive, &root, &manifest).unwrap_err();
        assert!(error.starts_with("E_APP_UPDATE_PATH_OPEN:"), "{error}");
        assert_eq!(fs::read(moved.join("data")).unwrap(), b"resource");
    }

    #[test]
    fn safe_framework_links_are_supported_but_escaping_links_are_rejected() {
        let root = tempfile::tempdir().unwrap();
        let (manifest, bytes) = package(
            &[(
                "Ameow.app/Contents/Frameworks/F.framework/Versions/A/F",
                b"framework",
            )],
            Some((
                "Ameow.app/Contents/Frameworks/F.framework/Versions/Current",
                "A",
            )),
        );
        let mut archive = open_archive(root.path(), &bytes);
        extract(&mut archive, root.path(), &manifest, None).unwrap();
        verify(&mut archive, root.path(), &manifest).unwrap();

        let root = tempfile::tempdir().unwrap();
        let outside = root.path().join("outside");
        fs::write(&outside, b"outside").unwrap();
        let (manifest, bytes) = package(&[], Some(("Ameow.app/Contents/escape", "../../outside")));
        let mut archive = open_archive(root.path(), &bytes);
        assert!(extract(&mut archive, root.path(), &manifest, None).is_err());
        assert_eq!(fs::read(outside).unwrap(), b"outside");
    }

    #[test]
    fn rejects_traversal_duplicates_tampered_zip_and_cancellation() {
        for extra in [
            vec![("Ameow.app/../outside", &b"bad"[..])],
            vec![("Ameow.app/Contents/MacOS/AMEOW", &b"bad"[..])],
            vec![("Other.app/Contents/file", &b"bad"[..])],
        ] {
            let root = tempfile::tempdir().unwrap();
            let (manifest, bytes) = package(&extra, None);
            let mut archive = open_archive(root.path(), &bytes);
            assert!(extract(&mut archive, root.path(), &manifest, None).is_err());
            assert!(!root.path().join("outside").exists());
        }
        let root = tempfile::tempdir().unwrap();
        let (manifest, mut bytes) = package(&[], None);
        bytes[0] ^= 1;
        let mut archive = open_archive(root.path(), &bytes);
        assert_eq!(
            extract(&mut archive, root.path(), &manifest, None).unwrap_err(),
            "E_APP_UPDATE_PACKAGE_HASH"
        );
        let root = tempfile::tempdir().unwrap();
        let (manifest, bytes) = package(&[], None);
        let mut archive = open_archive(root.path(), &bytes);
        let cancel = AtomicBool::new(true);
        assert_eq!(
            extract(&mut archive, root.path(), &manifest, Some(&cancel)).unwrap_err(),
            "E_APP_UPDATE_CANCELLED"
        );
    }

    #[test]
    fn ad_hoc_signed_bundles_are_verified_without_a_developer_id() {
        fn make_bundle(parent: &Path, name: &str, version: &str) -> PathBuf {
            let bundle = parent.join(name);
            let macos = bundle.join("Contents/MacOS");
            fs::create_dir_all(&macos).unwrap();
            fs::copy("/usr/bin/true", macos.join("ameow")).unwrap();
            fs::copy("/usr/bin/true", macos.join("ameow-updater")).unwrap();
            let plist = format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>io.github.wutpeach.ameow</string>
<key>CFBundleExecutable</key><string>ameow</string><key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>{version}</string></dict></plist>"#
            );
            fs::write(bundle.join("Contents/Info.plist"), plist).unwrap();
            assert!(
                Command::new("/usr/bin/codesign")
                    .args(["--force", "--sign", "-"])
                    .arg(macos.join("ameow-updater"))
                    .status()
                    .unwrap()
                    .success()
            );
            assert!(
                Command::new("/usr/bin/codesign")
                    .args(["--force", "--sign", "-"])
                    .arg(&bundle)
                    .status()
                    .unwrap()
                    .success()
            );
            bundle
        }
        let root = tempfile::tempdir().unwrap();
        let old = make_bundle(root.path(), "old.app", "0.5.0");
        let new = make_bundle(root.path(), "new.app", "1.0.0");
        let (manifest, _) = package(&[], None);
        assert_eq!(team(&old).unwrap(), None);
        verify_codesign_against(&old, &new, &manifest).unwrap();
        fs::write(new.join("Contents/Info.plist"), b"tampered").unwrap();
        assert!(verify_codesign_against(&old, &new, &manifest).is_err());
    }

    #[test]
    fn exchange_keeps_both_complete_bundles_and_can_restore_the_old_one() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap();
        let installed = root.join("Ameow.app");
        let staging = root.join("staging");
        let candidate = staging.join("Ameow.app");
        let user_data = root.join("user-data");
        fs::create_dir(&installed).unwrap();
        fs::create_dir_all(&candidate).unwrap();
        fs::write(&user_data, b"sentinel").unwrap();
        fs::write(installed.join("version"), b"old").unwrap();
        fs::write(candidate.join("version"), b"new").unwrap();
        exchange(&installed, &candidate).unwrap();
        assert_eq!(fs::read(installed.join("version")).unwrap(), b"new");
        assert_eq!(fs::read(candidate.join("version")).unwrap(), b"old");
        exchange(&installed, &candidate).unwrap();
        assert_eq!(fs::read(installed.join("version")).unwrap(), b"old");
        assert_eq!(fs::read(candidate.join("version")).unwrap(), b"new");
        assert_eq!(fs::read(&user_data).unwrap(), b"sentinel");
        let link = root.join("link.app");
        symlink(&candidate, &link).unwrap();
        assert!(exchange(&installed, &link).is_err());
        assert_eq!(fs::read(installed.join("version")).unwrap(), b"old");
    }

    #[test]
    fn arm64_check_rejects_wrong_and_truncated_mach_o() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("binary");
        let mut thin = vec![0; 32];
        thin[..4].copy_from_slice(&[0xcf, 0xfa, 0xed, 0xfe]);
        thin[4..8].copy_from_slice(&0x0100000cu32.to_le_bytes());
        fs::write(&path, &thin).unwrap();
        verify_arm64(&path).unwrap();
        let redirected = root.path().join("redirected");
        symlink(&path, &redirected).unwrap();
        assert!(verify_arm64(&redirected).is_err());
        thin[4..8].copy_from_slice(&0x01000007u32.to_le_bytes());
        fs::write(&path, &thin).unwrap();
        assert!(verify_arm64(&path).is_err());

        let mut fat = vec![0; 64];
        fat[..4].copy_from_slice(&[0xca, 0xfe, 0xba, 0xbe]);
        fat[4..8].copy_from_slice(&1u32.to_be_bytes());
        fat[8..12].copy_from_slice(&0x0100000cu32.to_be_bytes());
        fat[16..20].copy_from_slice(&32u32.to_be_bytes());
        fat[20..24].copy_from_slice(&32u32.to_be_bytes());
        thin[4..8].copy_from_slice(&0x0100000cu32.to_le_bytes());
        fat[32..].copy_from_slice(&thin);
        fs::write(&path, &fat).unwrap();
        verify_arm64(&path).unwrap();
        fat[20..24].copy_from_slice(&33u32.to_be_bytes());
        fs::write(&path, &fat).unwrap();
        assert!(verify_arm64(&path).is_err());
    }
}
