//! Browser-owned short-lived stdio bridge. It never starts a GUI or downloads.
use super::{MAX_MESSAGE, Operation, Result, Store, storage};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};
pub const HOST_NAME: &str = "org.ameow.browser_sessions";
pub const EXTENSION_ID: &str = "icedkidcbbbijndplfofcbhikohlcool";
pub const ORIGIN: &str = "chrome-extension://icedkidcbbbijndplfofcbhikohlcool/";
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Message {
    pub version: u32,
    pub request_id: String,
    pub operation: Operation,
}
pub fn serve(input: &mut impl Read, output: &mut impl Write, root: &Path) -> Result<()> {
    loop {
        let mut length = [0u8; 4];
        match input.read(&mut length[..1]) {
            Ok(0) => return Ok(()),
            Ok(_) => input
                .read_exact(&mut length[1..])
                .map_err(|_| "E_SESSION_FRAME")?,
            Err(_) => return Err("E_SESSION_FRAME".into()),
        }
        let length = u32::from_le_bytes(length) as usize;
        if length == 0 || length > MAX_MESSAGE {
            return Err("E_SESSION_FRAME".into());
        }
        let mut bytes = vec![0; length];
        input
            .read_exact(&mut bytes)
            .map_err(|_| "E_SESSION_FRAME")?;
        let response = match serde_json::from_slice::<Message>(&bytes) {
            Ok(message)
                if message.version == 1
                    && message.request_id.len() <= 80
                    && !message.request_id.is_empty()
                    && message
                        .request_id
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'-') =>
            {
                match Store::new(root).apply(message.operation) {
                    Ok(sites) => {
                        serde_json::json!({"version":1, "request_id":message.request_id, "ok":true, "sites":sites})
                    }
                    Err(code) => {
                        serde_json::json!({"version":1, "request_id":message.request_id, "ok":false, "error":code})
                    }
                }
            }
            _ => serde_json::json!({"version":1, "ok":false, "error":"E_SESSION_PROTOCOL"}),
        };
        let bytes = serde_json::to_vec(&response).map_err(|_| storage())?;
        output
            .write_all(&(bytes.len() as u32).to_le_bytes())
            .and_then(|_| output.write_all(&bytes))
            .and_then(|_| output.flush())
            .map_err(|_| "E_SESSION_FRAME")?;
    }
}
pub fn companion() -> Result<PathBuf> {
    let directory = std::env::current_exe()
        .map_err(|_| storage())?
        .parent()
        .ok_or_else(storage)?
        .to_path_buf();
    let name = if cfg!(windows) {
        "ameow-browser-host.exe"
    } else {
        "ameow-browser-host"
    };
    let sibling = directory.join(name);
    if sibling.is_file() {
        return Ok(sibling);
    }
    // Windows application updates keep the bridge beside the stable launcher/CLI.
    if directory
        .parent()
        .and_then(Path::file_name)
        .is_some_and(|name| name == "versions")
    {
        return Ok(directory
            .parent()
            .and_then(Path::parent)
            .ok_or_else(storage)?
            .join(name));
    }
    Ok(sibling)
}
pub fn install(host: &Path) -> Result<PathBuf> {
    let host = host.canonicalize().map_err(|_| "E_SESSION_HOST_MISSING")?;
    let directory =
        crate::download::runtime::RuntimeManager::default_root()?.join("browser-bridge");
    super::protection::directory(&directory)?;
    let manifest = directory.join(format!("{HOST_NAME}.json"));
    fs::write(
        &manifest,
        serde_json::to_vec_pretty(&serde_json::json!({
            "name":HOST_NAME, "description":"Ameow site sessions", "path":host,
            "type":"stdio", "allowed_origins":[ORIGIN]
        }))
        .map_err(|_| storage())?,
    )
    .map_err(|_| storage())?;
    register(&manifest)?;
    Ok(manifest)
}
pub fn extension_directory() -> Result<PathBuf> {
    let host = companion()?;
    let parent = host.parent().ok_or_else(storage)?;
    let sibling = parent.join("browser-extension");
    if sibling.join("manifest.json").is_file() {
        return Ok(sibling);
    }
    #[cfg(target_os = "macos")]
    {
        let resources = parent
            .parent()
            .ok_or_else(storage)?
            .join("Resources/browser-extension");
        if resources.join("manifest.json").is_file() {
            return Ok(resources);
        }
    }
    #[cfg(debug_assertions)]
    {
        let development = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("browser-extension/dist");
        if development.join("manifest.json").is_file() {
            return Ok(development);
        }
    }
    Err("E_SESSION_HOST_MISSING".into())
}
pub fn refresh_registration(data_root: &Path) -> Result<()> {
    let default = crate::download::runtime::RuntimeManager::default_root()?;
    if data_root == default
        && default
            .join("browser-bridge")
            .join(format!("{HOST_NAME}.json"))
            .is_file()
    {
        install(&companion()?)?;
    }
    Ok(())
}
#[cfg(windows)]
fn register(manifest: &Path) -> Result<()> {
    use std::{os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::System::Registry::*;
    let value: Vec<_> = manifest.as_os_str().encode_wide().chain(Some(0)).collect();
    for browser in [r"Microsoft\Edge", r"Google\Chrome", "Chromium"] {
        let name: Vec<_> = format!(r"Software\{browser}\NativeMessagingHosts\{HOST_NAME}")
            .encode_utf16()
            .chain(Some(0))
            .collect();
        let mut key = ptr::null_mut();
        unsafe {
            if RegCreateKeyExW(
                HKEY_CURRENT_USER,
                name.as_ptr(),
                0,
                ptr::null(),
                0,
                KEY_SET_VALUE,
                ptr::null(),
                &mut key,
                ptr::null_mut(),
            ) != 0
            {
                return Err(storage());
            }
            let result = RegSetValueExW(
                key,
                ptr::null(),
                0,
                REG_SZ,
                value.as_ptr().cast(),
                (value.len() * 2) as u32,
            );
            RegCloseKey(key);
            if result != 0 {
                return Err(storage());
            }
        }
    }
    Ok(())
}
#[cfg(target_os = "macos")]
fn register(manifest: &Path) -> Result<()> {
    let home = PathBuf::from(std::env::var_os("HOME").ok_or_else(storage)?);
    for browser in ["Microsoft Edge", "Google/Chrome", "Chromium"] {
        let directory = home
            .join("Library/Application Support")
            .join(browser)
            .join("NativeMessagingHosts");
        fs::create_dir_all(&directory).map_err(|_| storage())?;
        fs::copy(manifest, directory.join(format!("{HOST_NAME}.json"))).map_err(|_| storage())?;
    }
    Ok(())
}
