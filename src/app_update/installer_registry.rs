use super::*;
use std::ptr;
use windows_sys::Win32::{
    Foundation::{ERROR_FILE_NOT_FOUND, ERROR_NO_MORE_ITEMS},
    System::Registry::*,
};

struct Key(HKEY);
impl Drop for Key {
    fn drop(&mut self) {
        unsafe {
            RegCloseKey(self.0);
        }
    }
}
fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}
fn scope() -> &'static str {
    if cfg!(any(
        test,
        all(feature = "app-update-fixture", debug_assertions)
    )) {
        r"Software\Ameow\InstallerValidation"
    } else {
        ""
    }
}
fn path(root: &Path, relative: &str) -> String {
    if scope().is_empty() {
        relative.into()
    } else {
        let prefix = if cfg!(test) {
            format!(
                r"{}\Tests\{}",
                scope(),
                super::super::hash(root.to_string_lossy().as_bytes())
            )
        } else {
            scope().into()
        };
        format!(r"{prefix}\{relative}")
    }
}
fn open(path: &str, write: bool) -> Result<Option<Key>, String> {
    let mut key = ptr::null_mut();
    let status = unsafe {
        if write {
            RegCreateKeyExW(
                HKEY_CURRENT_USER,
                wide(path).as_ptr(),
                0,
                ptr::null(),
                0,
                KEY_QUERY_VALUE | KEY_SET_VALUE,
                ptr::null(),
                &mut key,
                ptr::null_mut(),
            )
        } else {
            RegOpenKeyExW(
                HKEY_CURRENT_USER,
                wide(path).as_ptr(),
                0,
                KEY_QUERY_VALUE,
                &mut key,
            )
        }
    };
    if status == ERROR_FILE_NOT_FOUND {
        Ok(None)
    } else if status != 0 {
        Err(format!("E_INSTALLER_REGISTRY: {path}: {status}"))
    } else {
        Ok(Some(Key(key)))
    }
}
fn get(path: &str, name: &str) -> Result<Option<String>, String> {
    let Some(key) = open(path, false)? else {
        return Ok(None);
    };
    let mut kind = 0;
    let mut size = 0;
    let status = unsafe {
        RegQueryValueExW(
            key.0,
            wide(name).as_ptr(),
            ptr::null(),
            &mut kind,
            ptr::null_mut(),
            &mut size,
        )
    };
    if status == ERROR_FILE_NOT_FOUND {
        return Ok(None);
    }
    if status != 0 || kind != REG_SZ || size > 65536 || size % 2 != 0 {
        return Err(format!(r"E_INSTALLER_REGISTRY_VALUE: {path}\{name}"));
    }
    let mut value = vec![0u16; size as usize / 2];
    let status = unsafe {
        RegQueryValueExW(
            key.0,
            wide(name).as_ptr(),
            ptr::null(),
            &mut kind,
            value.as_mut_ptr().cast(),
            &mut size,
        )
    };
    if status != 0 || kind != REG_SZ {
        return Err(format!(
            r"E_INSTALLER_REGISTRY_VALUE: {path}\{name}: {status}"
        ));
    }
    value.truncate(size as usize / 2);
    if value.last() == Some(&0) {
        value.pop();
    }
    String::from_utf16(&value)
        .map(Some)
        .map_err(|_| format!("E_INSTALLER_REGISTRY_ENCODING: {path}"))
}
fn set(path: &str, name: &str, value: &str) -> Result<(), String> {
    let key = open(path, true)?.ok_or("E_INSTALLER_REGISTRY")?;
    let value = wide(value);
    let status = unsafe {
        RegSetValueExW(
            key.0,
            wide(name).as_ptr(),
            0,
            REG_SZ,
            value.as_ptr().cast(),
            (value.len() * 2) as u32,
        )
    };
    if status != 0 {
        return Err(format!("E_INSTALLER_REGISTRY_WRITE: {path}: {status}"));
    }
    Ok(())
}
fn delete(path: &str, name: &str) -> Result<(), String> {
    let mut handle = ptr::null_mut();
    let status = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            wide(path).as_ptr(),
            0,
            KEY_QUERY_VALUE | KEY_SET_VALUE,
            &mut handle,
        )
    };
    if status == ERROR_FILE_NOT_FOUND {
        return Ok(());
    }
    if status != 0 {
        return Err(format!("E_INSTALLER_REGISTRY_OPEN: {path}: {status}"));
    }
    let key = Key(handle);
    let status = unsafe { RegDeleteValueW(key.0, wide(name).as_ptr()) };
    if status != 0 && status != ERROR_FILE_NOT_FOUND {
        return Err(format!(
            r"E_INSTALLER_REGISTRY_DELETE: {path}\{name}: {status}"
        ));
    }
    Ok(())
}
fn delete_empty_key(path: &str, report: &mut Report) -> Result<(), String> {
    let Some(key) = open(path, false)? else {
        return Ok(());
    };
    let mut subkeys = 0;
    let mut values = 0;
    let status = unsafe {
        RegQueryInfoKeyW(
            key.0,
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null(),
            &mut subkeys,
            ptr::null_mut(),
            ptr::null_mut(),
            &mut values,
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
        )
    };
    if status != 0 {
        return Err(format!("E_INSTALLER_REGISTRY_INVENTORY: {path}: {status}"));
    }
    drop(key);
    if subkeys != 0 || values != 0 {
        report
            .retained
            .push(format!("{path} (other registry members)"));
        return Ok(());
    }
    let status = unsafe { RegDeleteKeyW(HKEY_CURRENT_USER, wide(path).as_ptr()) };
    if status != 0 && status != ERROR_FILE_NOT_FOUND {
        return Err(format!("E_INSTALLER_REGISTRY_DELETE_KEY: {path}: {status}"));
    }
    Ok(())
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct RegistryValue {
    name: String,
    kind: u32,
    data: Vec<u8>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct RegistrationSnapshot {
    uninstalling: PathBuf,
    owner: PathBuf,
    values: Vec<RegistryValue>,
}
fn uninstall_key(root: &Path) -> String {
    let id = if cfg!(any(
        test,
        all(feature = "app-update-fixture", debug_assertions)
    )) {
        "Ameow.B.FullUpdate.Validation_is1"
    } else {
        "Ameow.Rust_is1"
    };
    // Inno's fixture AppId is already isolated; do not prepend the maintenance namespace.
    let relative = format!(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{id}");
    if cfg!(test) {
        path(root, &relative)
    } else {
        relative
    }
}
pub(super) fn snapshot_other_registration(
    root: &Path,
    snapshot: &Path,
    report: &mut Report,
) -> Result<(), String> {
    let key_path = uninstall_key(root);
    let Some(owner) = get(&key_path, "InstallLocation")?.map(PathBuf::from) else {
        return Ok(());
    };
    if same(&owner, root) {
        return Ok(());
    }
    if snapshot.exists() {
        let saved: RegistrationSnapshot = store::read_json(snapshot)?;
        if !same(&saved.uninstalling, root) || !same(&saved.owner, &owner) {
            return Err("E_INSTALLER_ARP_SNAPSHOT_EXISTS".into());
        }
        return Ok(());
    }
    if !get(&key_path, "DisplayName")?.is_some_and(|s| s.starts_with("Ameow")) {
        return Err("E_INSTALLER_ARP_OWNER".into());
    }
    let key = open(&key_path, false)?.ok_or("E_INSTALLER_ARP_CHANGED")?;
    let mut values = Vec::new();
    let mut index = 0;
    loop {
        let mut name = vec![0u16; 16384];
        let mut name_len = name.len() as u32;
        let mut data = vec![0u8; 65536];
        let mut data_len = data.len() as u32;
        let mut kind = 0;
        let status = unsafe {
            RegEnumValueW(
                key.0,
                index,
                name.as_mut_ptr(),
                &mut name_len,
                ptr::null(),
                &mut kind,
                data.as_mut_ptr(),
                &mut data_len,
            )
        };
        if status == ERROR_NO_MORE_ITEMS {
            break;
        }
        if status != 0 || values.len() > 128 {
            return Err(format!("E_INSTALLER_ARP_SNAPSHOT: {status}"));
        }
        name.truncate(name_len as usize);
        data.truncate(data_len as usize);
        values.push(RegistryValue {
            name: String::from_utf16(&name).map_err(|_| "E_INSTALLER_ARP_ENCODING")?,
            kind,
            data,
        });
        index += 1;
    }
    store::atomic_json(
        snapshot,
        &RegistrationSnapshot {
            uninstalling: root.into(),
            owner: owner.clone(),
            values,
        },
    )?;
    report.retained.push(format!(
        "uninstall registration belongs to {}; restoration snapshot prepared",
        owner.display()
    ));
    Ok(())
}
pub(super) fn restore_registration(
    root: &Path,
    snapshot: &Path,
    report: &mut Report,
) -> Result<(), String> {
    if !snapshot.exists() {
        return Ok(());
    }
    // ARP snapshots can contain more than 64 KiB of typed metadata, with a strict local bound.
    store::plain(snapshot)?;
    let bytes = fs::read(snapshot).map_err(|e| e.to_string())?;
    if bytes.len() > 1024 * 1024 {
        return Err("E_INSTALLER_ARP_SNAPSHOT_SIZE".into());
    }
    let saved: RegistrationSnapshot =
        serde_json::from_slice(&bytes).map_err(|_| "E_INSTALLER_ARP_SNAPSHOT")?;
    if !same(&saved.uninstalling, root) || same(&saved.owner, root) || saved.values.len() > 128 {
        return Err("E_INSTALLER_ARP_SNAPSHOT_OWNER".into());
    }
    let key_path = uninstall_key(root);
    if let Some(owner) = get(&key_path, "InstallLocation")? {
        if same(Path::new(&owner), &saved.owner) {
            return Ok(());
        }
        return Err("E_INSTALLER_ARP_CHANGED; newer registration retained".into());
    }
    let key = open(&key_path, true)?.ok_or("E_INSTALLER_ARP_RESTORE")?;
    for value in saved.values {
        if value.name.contains('\0') || value.data.len() > 65536 {
            return Err("E_INSTALLER_ARP_SNAPSHOT_VALUE".into());
        }
        let status = unsafe {
            RegSetValueExW(
                key.0,
                wide(&value.name).as_ptr(),
                0,
                value.kind,
                value.data.as_ptr(),
                value.data.len() as u32,
            )
        };
        if status != 0 {
            return Err(format!("E_INSTALLER_ARP_RESTORE: {}: {status}", value.name));
        }
    }
    report.completed.push(format!(
        "other installation's original typed uninstall registration restored: {}",
        saved.owner.display()
    ));
    Ok(())
}
fn command(root: &Path, launcher: &str) -> String {
    format!("\"{}\" --login-startup", root.join(launcher).display())
}
fn same(a: &Path, b: &Path) -> bool {
    fn normal(p: &Path) -> String {
        let slash = char::from(92);
        let prefix = format!("{slash}{slash}?{slash}");
        p.to_string_lossy()
            .replace('/', &slash.to_string())
            .trim_start_matches(prefix.as_str())
            .trim_end_matches(slash)
            .to_lowercase()
    }
    normal(a) == normal(b)
}
fn ledger(root: &Path) -> String {
    path(root, r"Software\Ameow\Installations")
}
fn ledger_name(root: &Path) -> String {
    super::super::hash(root.to_string_lossy().to_lowercase().as_bytes())
}
fn host_owned(host: &Path, root: &Path) -> bool {
    if same(host, &root.join("ameow-browser-host.exe")) {
        return true;
    }
    let Some(dir) = host.parent() else {
        return false;
    };
    host.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.eq_ignore_ascii_case("ameow-browser-host.exe"))
        && dir
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|v| Version::parse(v).is_ok())
        && dir
            .parent()
            .is_some_and(|p| same(p, &root.join("versions")))
}
fn manifest(data: &Path) -> PathBuf {
    data.join("browser-bridge").join(format!("{HOST}.json"))
}
fn manifest_owner(data: &Path) -> Result<Option<PathBuf>, String> {
    let file = manifest(data);
    if !file.try_exists().map_err(|e| e.to_string())? {
        return Ok(None);
    }
    let value: serde_json::Value = store::read_json(&file)?;
    value
        .get("path")
        .and_then(|p| p.as_str())
        .map(|p| Some(PathBuf::from(p)))
        .ok_or("E_INSTALLER_NATIVE_HOST_OWNER".into())
}
pub(super) fn rebind(root: &Path, report: &mut Report) -> Result<(), String> {
    let run = path(root, r"Software\Microsoft\Windows\CurrentVersion\Run");
    let old = command(root, "AmeowLauncher.exe");
    let new = command(root, "Ameow.exe");
    if get(&run, "Ameow")?.is_some_and(|value| value.eq_ignore_ascii_case(&old)) {
        set(&run, "Ameow", &new)?;
        report
            .completed
            .push("this installation's startup target changed to Ameow.exe".into());
    }
    set(&ledger(root), &ledger_name(root), &root.to_string_lossy())?;
    report
        .completed
        .push("installation ownership recorded".into());
    Ok(())
}
pub(super) fn ensure_exclusive_data(root: &Path, data: &Path) -> Result<(), String> {
    let ledger = ledger(root);
    if let Some(key) = open(&ledger, false)? {
        let mut index = 0;
        loop {
            let mut name = vec![0u16; 256];
            let mut count = name.len() as u32;
            let status = unsafe {
                RegEnumValueW(
                    key.0,
                    index,
                    name.as_mut_ptr(),
                    &mut count,
                    ptr::null(),
                    ptr::null_mut(),
                    ptr::null_mut(),
                    ptr::null_mut(),
                )
            };
            if status == ERROR_NO_MORE_ITEMS {
                break;
            }
            if status != 0 {
                return Err(format!("E_INSTALLER_INSTALLATION_INVENTORY: {status}"));
            }
            name.truncate(count as usize);
            let name =
                String::from_utf16(&name).map_err(|_| "E_INSTALLER_INSTALLATION_INVENTORY")?;
            if let Some(other) = get(&ledger, &name)? {
                let other = PathBuf::from(other);
                if !same(&other, root)
                    && (other.join("Ameow.exe").is_file()
                        || other.join("AmeowLauncher.exe").is_file())
                {
                    return Err(format!("E_INSTALLER_SHARED_USER_DATA: {}", other.display()));
                }
            }
            index += 1;
        }
    }
    let uninstall = uninstall_key(root);
    if let Some(location) = get(&uninstall, "InstallLocation")? {
        let other = PathBuf::from(location);
        if !same(&other, root) && other.is_dir() {
            return Err(format!("E_INSTALLER_SHARED_USER_DATA: {}", other.display()));
        }
    }
    if let Some(host) = manifest_owner(data)? {
        if !host_owned(&host, root) {
            return Err(format!(
                "E_INSTALLER_SHARED_NATIVE_HOST: {}",
                host.display()
            ));
        }
    }
    let run = path(root, r"Software\Microsoft\Windows\CurrentVersion\Run");
    if let Some(value) = get(&run, "Ameow")? {
        if ![
            command(root, "Ameow.exe"),
            command(root, "AmeowLauncher.exe"),
        ]
        .iter()
        .any(|c| value.eq_ignore_ascii_case(c))
        {
            return Err(format!("E_INSTALLER_SHARED_STARTUP: {value}"));
        }
    }
    Ok(())
}
pub(super) fn unregister(root: &Path, data: &Path, report: &mut Report) -> Result<(), String> {
    let run = path(root, r"Software\Microsoft\Windows\CurrentVersion\Run");
    if get(&run, "Ameow")?.is_some_and(|value| {
        [
            command(root, "Ameow.exe"),
            command(root, "AmeowLauncher.exe"),
        ]
        .iter()
        .any(|c| value.eq_ignore_ascii_case(c))
    }) {
        delete(&run, "Ameow")?;
        delete(
            &path(
                root,
                r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run",
            ),
            "Ameow",
        )?;
        report
            .completed
            .push("this installation's startup registration".into());
    }
    if manifest_owner(data)?.is_some_and(|host| host_owned(&host, root)) {
        let file = manifest(data);
        for browser in [r"Microsoft\Edge", r"Google\Chrome", "Chromium"] {
            let key = path(
                root,
                &format!(r"Software\{browser}\NativeMessagingHosts\{HOST}"),
            );
            if get(&key, "")?.is_some_and(|p| same(Path::new(&p), &file)) {
                delete(&key, "")?;
                delete_empty_key(&key, report)?;
                report.completed.push(key);
            }
        }
        remove_file(&file, Some(&digest(&file)?))?;
        report.completed.push(file.display().to_string());
    }
    delete(&ledger(root), &ledger_name(root))?;
    delete_empty_key(&ledger(root), report)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    struct TestRegistry(PathBuf);
    impl Drop for TestRegistry {
        fn drop(&mut self) {
            let prefix = path(&self.0, "")
                .trim_end_matches(char::from(92))
                .to_string();
            assert!(prefix.starts_with(scope()));
            unsafe {
                RegDeleteTreeW(HKEY_CURRENT_USER, wide(&prefix).as_ptr());
            }
        }
    }
    #[test]
    fn host_ownership_requires_exact_stable_or_versioned_companion() {
        let root = Path::new(r"D:\Apps 中文\Ameow");
        assert!(host_owned(&root.join("ameow-browser-host.exe"), root));
        assert!(host_owned(
            &root.join("versions/0.5.3/ameow-browser-host.exe"),
            root
        ));
        assert!(!host_owned(
            &root.join("other/ameow-browser-host.exe"),
            root
        ));
        assert!(!host_owned(
            Path::new(r"D:\Apps 中文\Ameow Other\ameow-browser-host.exe"),
            root
        ));
    }
    #[test]
    fn native_cleanup_retains_unknown_named_values_and_subkeys() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path();
        let _registry_cleanup = TestRegistry(root.into());
        let data = root.join("validation-instance");
        fs::create_dir_all(data.join("browser-bridge")).unwrap();
        let file = manifest(&data);
        fs::write(
            &file,
            serde_json::to_vec(&serde_json::json!({"path": root.join("ameow-browser-host.exe")}))
                .unwrap(),
        )
        .unwrap();
        let key = path(
            root,
            &format!(r"Software\Microsoft\Edge\NativeMessagingHosts\{HOST}"),
        );
        set(&key, "", &file.to_string_lossy()).unwrap();
        set(&key, "Unrelated", "keep named value").unwrap();
        let child = format!(r"{key}\UnrelatedChild");
        set(&child, "", "keep subkey").unwrap();
        unregister(root, &data, &mut Report::default()).unwrap();
        assert!(get(&key, "").unwrap().is_none());
        assert_eq!(
            get(&key, "Unrelated").unwrap().as_deref(),
            Some("keep named value")
        );
        assert_eq!(get(&child, "").unwrap().as_deref(), Some("keep subkey"));
    }
}
