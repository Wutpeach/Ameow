//! Windows per-user login registration and single-instance signaling.
use std::{ffi::OsStr, os::windows::ffi::OsStrExt, path::Path, ptr};
use windows_sys::Win32::{
    Foundation::{
        CloseHandle, ERROR_ALREADY_EXISTS, ERROR_FILE_NOT_FOUND, ERROR_MORE_DATA, ERROR_SUCCESS,
        GetLastError, HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT,
    },
    System::{
        Registry::{
            HKEY, HKEY_CURRENT_USER, KEY_QUERY_VALUE, KEY_SET_VALUE, REG_BINARY,
            REG_OPTION_NON_VOLATILE, REG_SZ, RegCloseKey, RegCreateKeyExW, RegDeleteValueW,
            RegOpenKeyExW, RegQueryValueExW, RegSetValueExW,
        },
        Threading::{CreateEventW, CreateMutexW, SetEvent, WaitForSingleObject},
    },
};

const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const APPROVAL_KEY: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
// Production uses one identity across installed versions and the stable launcher.
const VALUE: &str = "Ameow";
const LEGACY_VALUE: &str = "AmeowNext";
const MUTEX: &str = r"Local\Ameow.SingleInstance";
const RESTORE_EVENT: &str = r"Local\Ameow.Restore";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StartupState {
    Disabled,
    Enabled,
    Stale,
}

fn wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(Some(0)).collect()
}
fn command(exe: &Path) -> Result<String, String> {
    let path = exe.to_str().ok_or("Executable path is not Unicode")?;
    if path.contains('\"') || path.contains('\0') {
        return Err("Invalid executable path".into());
    }
    Ok(format!("\"{path}\" --login-startup"))
}
fn classify(value: Option<&str>, exe: &Path) -> Result<StartupState, String> {
    match value {
        None => Ok(StartupState::Disabled),
        Some(value) if exe.is_file() && value.eq_ignore_ascii_case(&command(exe)?) => {
            Ok(StartupState::Enabled)
        }
        Some(_) => Ok(StartupState::Stale),
    }
}
struct Key(HKEY);
impl Drop for Key {
    fn drop(&mut self) {
        unsafe {
            RegCloseKey(self.0);
        }
    }
}
fn error(action: &str, code: u32) -> String {
    format!("{action} failed (Windows error {code})")
}
fn open(path: &str, write: bool) -> Result<Option<Key>, String> {
    let mut key = ptr::null_mut();
    let status = unsafe {
        if write {
            RegCreateKeyExW(
                HKEY_CURRENT_USER,
                wide(path).as_ptr(),
                0,
                ptr::null_mut(),
                REG_OPTION_NON_VOLATILE,
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
    } else if status == ERROR_SUCCESS {
        Ok(Some(Key(key)))
    } else {
        Err(error("Open startup registry key", status))
    }
}
fn read_raw(path: &str, name: &str) -> Result<Option<(u32, Vec<u8>)>, String> {
    let Some(key) = open(path, false)? else {
        return Ok(None);
    };
    let name = wide(name);
    for _ in 0..3 {
        let mut kind = 0;
        let mut size = 0;
        let status = unsafe {
            RegQueryValueExW(
                key.0,
                name.as_ptr(),
                ptr::null_mut(),
                &mut kind,
                ptr::null_mut(),
                &mut size,
            )
        };
        if status == ERROR_FILE_NOT_FOUND {
            return Ok(None);
        }
        if status != ERROR_SUCCESS {
            return Err(error("Read startup value", status));
        }
        if size > 65536 {
            return Err("Startup registry value is too large".into());
        }
        let mut data = vec![0u8; (size as usize).max(1)];
        let status = unsafe {
            RegQueryValueExW(
                key.0,
                name.as_ptr(),
                ptr::null_mut(),
                &mut kind,
                data.as_mut_ptr(),
                &mut size,
            )
        };
        if status == ERROR_MORE_DATA {
            continue;
        }
        if status == ERROR_FILE_NOT_FOUND {
            return Ok(None);
        }
        if status != ERROR_SUCCESS {
            return Err(error("Read startup value", status));
        }
        data.truncate(size as usize);
        return Ok(Some((kind, data)));
    }
    Err("Startup registry value changed repeatedly while reading".into())
}
fn read_value(path: &str, name: &str) -> Result<Option<String>, String> {
    let Some((kind, data)) = read_raw(path, name)? else {
        return Ok(None);
    };
    if kind != REG_SZ || data.len() % 2 != 0 {
        return Ok(Some(String::new()));
    }
    let mut chars: Vec<u16> = data
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    if chars.last() == Some(&0) {
        chars.pop();
    }
    Ok(Some(String::from_utf16(&chars).unwrap_or_default()))
}
fn ensure_approved(path: &str, name: &str) -> Result<(), String> {
    let Some((kind, data)) = read_raw(path, name)? else {
        return Ok(());
    };
    if kind != REG_BINARY || data.len() != 12 {
        return Err("无法读取 Windows 启动应用的批准状态".into());
    }
    match data[0] {
        2 | 6 => Ok(()),
        3 | 7 => Err("Ameow 已被 Windows 禁用，请在 Windows 设置的启动应用中启用 Ameow".into()),
        _ => Err("无法识别 Windows 启动应用的批准状态".into()),
    }
}
fn read_at(path: &str, name: &str, exe: &Path) -> Result<StartupState, String> {
    classify(read_value(path, name)?.as_deref(), exe)
}
fn set_at(path: &str, name: &str, exe: &Path, enabled: bool) -> Result<StartupState, String> {
    let key = open(path, true)?.ok_or("Cannot open startup registry key")?;
    let name_w = wide(name);
    let status = unsafe {
        if enabled {
            let value = wide(&command(exe)?);
            RegSetValueExW(
                key.0,
                name_w.as_ptr(),
                0,
                REG_SZ,
                value.as_ptr().cast(),
                (value.len() * 2) as u32,
            )
        } else {
            RegDeleteValueW(key.0, name_w.as_ptr())
        }
    };
    if status != ERROR_SUCCESS && !(status == ERROR_FILE_NOT_FOUND && !enabled) {
        return Err(error("Change startup value", status));
    }
    let state = read_at(path, name, exe)?;
    if state
        != if enabled {
            StartupState::Enabled
        } else {
            StartupState::Disabled
        }
    {
        return Err("Startup value verification failed".into());
    }
    Ok(state)
}
pub fn read() -> Result<StartupState, String> {
    let exe = crate::app_update::startup_entry()?;
    let state = read_at(RUN_KEY, VALUE, &exe)?;
    if state == StartupState::Disabled && read_value(RUN_KEY, LEGACY_VALUE)?.is_some() {
        return Ok(StartupState::Stale);
    }
    if state == StartupState::Enabled {
        ensure_approved(APPROVAL_KEY, VALUE)?;
    }
    Ok(state)
}
pub fn set_enabled(enabled: bool) -> Result<StartupState, String> {
    let exe = crate::app_update::startup_entry()?;
    let state = set_at(RUN_KEY, VALUE, &exe, enabled)?;
    if enabled {
        ensure_approved(APPROVAL_KEY, VALUE)?;
    }
    retire_legacy_at(RUN_KEY)?;
    Ok(state)
}
fn retire_legacy_at(path: &str) -> Result<(), String> {
    let Some(value) = read_value(path, LEGACY_VALUE)? else { return Ok(()); };
    let executable = value.strip_prefix('"').and_then(|v| v.strip_suffix("\" --login-startup"));
    let owned = executable.and_then(|v| Path::new(v).file_name()).and_then(|v| v.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("ameow.exe") || name.eq_ignore_ascii_case("ameow-next.exe"));
    if !owned { return Err("E_STARTUP_LEGACY_CONFLICT: Unrecognized legacy startup command; preserved".into()); }
    let key = open(path, true)?.ok_or("E_STARTUP_KEY")?;
    let code = unsafe { RegDeleteValueW(key.0, wide(LEGACY_VALUE).as_ptr()) };
    if code != ERROR_SUCCESS && code != ERROR_FILE_NOT_FOUND { return Err(error("Retire legacy startup", code)); }
    if read_value(path, LEGACY_VALUE)?.is_some() { return Err("E_STARTUP_LEGACY_VERIFY".into()); }
    Ok(())
}

pub enum InstanceAcquire {
    Primary(InstanceGuard),
    Duplicate,
}
pub struct InstanceGuard {
    mutex: HANDLE,
    event: HANDLE,
}
impl InstanceGuard {
    pub fn acquire_with_restore(restore: bool) -> Result<InstanceAcquire, String> {
        Self::acquire_named(MUTEX, RESTORE_EVENT, restore)
    }
    fn acquire_named(
        mutex_name: &str,
        event_name: &str,
        restore: bool,
    ) -> Result<InstanceAcquire, String> {
        unsafe {
            // Event exists before the mutex, allowing signals during UI startup.
            let event = CreateEventW(ptr::null(), 0, 0, wide(event_name).as_ptr());
            if event.is_null() {
                return Err(error("Create restore signal", GetLastError()));
            }
            let mutex = CreateMutexW(ptr::null(), 0, wide(mutex_name).as_ptr());
            if mutex.is_null() {
                let e = GetLastError();
                CloseHandle(event);
                return Err(error("Create instance mutex", e));
            }
            if GetLastError() == ERROR_ALREADY_EXISTS {
                let ok = if restore { SetEvent(event) } else { 1 };
                let e = if ok == 0 {
                    GetLastError()
                } else {
                    ERROR_SUCCESS
                };
                CloseHandle(mutex);
                CloseHandle(event);
                if ok == 0 {
                    return Err(error("Signal existing instance", e));
                }
                Ok(InstanceAcquire::Duplicate)
            } else {
                Ok(InstanceAcquire::Primary(Self { mutex, event }))
            }
        }
    }
    pub fn take_restore_request(&self) -> Result<bool, String> {
        match unsafe { WaitForSingleObject(self.event, 0) } {
            WAIT_OBJECT_0 => Ok(true),
            WAIT_TIMEOUT => Ok(false),
            _ => Err(error("Read restore signal", unsafe { GetLastError() })),
        }
    }
}
impl Drop for InstanceGuard {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.event);
            CloseHandle(self.mutex);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Scratch(String);
    impl Drop for Scratch {
        fn drop(&mut self) {
            if let Ok(Some(key)) = open(&self.0, true) {
                unsafe {
                    RegDeleteValueW(key.0, wide("test").as_ptr());
                }
                drop(key);
                unsafe {
                    windows_sys::Win32::System::Registry::RegDeleteKeyW(
                        HKEY_CURRENT_USER,
                        wide(&self.0).as_ptr(),
                    );
                }
            }
        }
    }
    #[test]
    fn duplicate_signals_primary() {
        let mutex = format!(r"Local\AmeowNext.TestMutex.{}", std::process::id());
        let event = format!(r"Local\AmeowNext.TestEvent.{}", std::process::id());
        let InstanceAcquire::Primary(primary) =
            InstanceGuard::acquire_named(&mutex, &event, true).unwrap()
        else {
            panic!("first instance was not primary")
        };
        assert!(!primary.take_restore_request().unwrap());
        assert!(matches!(
            InstanceGuard::acquire_named(&mutex, &event, false).unwrap(),
            InstanceAcquire::Duplicate
        ));
        assert!(!primary.take_restore_request().unwrap());
        assert!(matches!(
            InstanceGuard::acquire_named(&mutex, &event, true).unwrap(),
            InstanceAcquire::Duplicate
        ));
        assert!(primary.take_restore_request().unwrap());
        assert!(!primary.take_restore_request().unwrap());
        drop(primary);
        assert!(matches!(
            InstanceGuard::acquire_named(&mutex, &event, true).unwrap(),
            InstanceAcquire::Primary(_)
        ));
    }
    #[test]
    fn command_and_classification() {
        let exe = std::env::current_exe().unwrap();
        let expected = command(&exe).unwrap();
        assert!(expected.starts_with('\"') && expected.ends_with("\" --login-startup"));
        assert_eq!(classify(None, &exe).unwrap(), StartupState::Disabled);
        assert_eq!(
            classify(Some(&expected), &exe).unwrap(),
            StartupState::Enabled
        );
        assert_eq!(
            classify(Some("other command"), &exe).unwrap(),
            StartupState::Stale
        );
        assert_eq!(
            classify(Some(&expected), Path::new(r"Z:\missing\ameow.exe")).unwrap(),
            StartupState::Stale
        );
    }
    #[test]
    fn isolated_registry_round_trip() {
        let scratch = Scratch(format!(
            r"Software\AmeowNextTests\Startup-{}",
            std::process::id()
        ));
        let path = &scratch.0;
        let exe = std::env::current_exe().unwrap();
        assert_eq!(
            set_at(&path, "test", &exe, true).unwrap(),
            StartupState::Enabled
        );
        assert_eq!(read_at(&path, "test", &exe).unwrap(), StartupState::Enabled);
        assert_eq!(
            set_at(&path, "test", &exe, false).unwrap(),
            StartupState::Disabled
        );
        let key = open(path, true).unwrap().unwrap();
        let mut bytes = [0u8; 12];
        bytes[0] = 3;
        assert_eq!(
            unsafe {
                RegSetValueExW(
                    key.0,
                    wide("test").as_ptr(),
                    0,
                    REG_BINARY,
                    bytes.as_ptr(),
                    bytes.len() as u32,
                )
            },
            ERROR_SUCCESS
        );
        assert!(
            ensure_approved(path, "test")
                .unwrap_err()
                .contains("启动应用")
        );
        assert_eq!(read_at(path, "test", &exe).unwrap(), StartupState::Stale);
        bytes[0] = 2;
        assert_eq!(
            unsafe {
                RegSetValueExW(
                    key.0,
                    wide("test").as_ptr(),
                    0,
                    REG_BINARY,
                    bytes.as_ptr(),
                    bytes.len() as u32,
                )
            },
            ERROR_SUCCESS
        );
        assert!(ensure_approved(path, "test").is_ok());
        bytes[0] = 99;
        assert_eq!(
            unsafe {
                RegSetValueExW(
                    key.0,
                    wide("test").as_ptr(),
                    0,
                    REG_BINARY,
                    bytes.as_ptr(),
                    bytes.len() as u32,
                )
            },
            ERROR_SUCCESS
        );
        assert!(ensure_approved(path, "test").is_err());
        assert!(command(Path::new("bad\"path")).is_err());
    }
    #[test]
    fn isolated_registry_retires_only_recognized_ameow_legacy_commands() {
        let scratch = Scratch(format!(r"Software\AmeowTests\LegacyStartup-{}", std::process::id()));
        let root = tempfile::tempdir().unwrap();
        let exe = root.path().join("Ameow.exe"); std::fs::write(&exe, b"test-only").unwrap();
        set_at(&scratch.0, LEGACY_VALUE, &exe, true).unwrap();
        retire_legacy_at(&scratch.0).unwrap();
        assert!(read_value(&scratch.0, LEGACY_VALUE).unwrap().is_none());
        let foreign = root.path().join("Other.exe"); std::fs::write(&foreign, b"test-only").unwrap();
        set_at(&scratch.0, LEGACY_VALUE, &foreign, true).unwrap();
        assert!(retire_legacy_at(&scratch.0).is_err());
        assert_eq!(read_value(&scratch.0, LEGACY_VALUE).unwrap(), Some(command(&foreign).unwrap()));
        set_at(&scratch.0, LEGACY_VALUE, &foreign, false).unwrap();
    }
}
