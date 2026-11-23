//! Browser-owned stdio bridge; explicit page submits use the desktop control owner.
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
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PageMessage { version: u32, request_id: String, operation: PageOperation }
#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
enum PageOperation { Submit { url: String, clip: Option<crate::download::request::ClipRange> } }
pub fn serve(input: &mut impl Read, output: &mut impl Write, root: &Path) -> Result<()> {
    serve_with_instance(input, output, root, None)
}
pub fn serve_with_instance(input: &mut impl Read, output: &mut impl Write, root: &Path, instance: Option<PathBuf>) -> Result<()> {
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
        let response = if let Ok(message) = serde_json::from_slice::<PageMessage>(&bytes) {
            if message.version != 1 || message.request_id.len() < 8 || message.request_id.len() > 80
                || !message.request_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
                serde_json::json!({"version":1,"ok":false,"error":"E_SESSION_PROTOCOL"})
            } else {
                let PageOperation::Submit { url, clip } = message.operation;
                match crate::control::cli::browser_submit(instance.clone(), url, clip, message.request_id.clone()) {
                    Ok(accepted) => serde_json::json!({"version":1,"request_id":message.request_id,"ok":true,"accepted":accepted}),
                    Err(code) => serde_json::json!({"version":1,"request_id":message.request_id,"ok":false,"error":code}),
                }
            }
        } else { match serde_json::from_slice::<Message>(&bytes) {
            Ok(message)
                if message.version == 1
                    && message.request_id.len() <= 80
                    && !message.request_id.is_empty()
                    && message
                        .request_id
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'-') =>
            {
                let ping = matches!(&message.operation, Operation::Ping);
                match Store::new(root).apply(message.operation) {
                    Ok(sites) => {
                        let mut response = serde_json::json!({"version":1, "request_id":message.request_id, "ok":true, "sites":sites});
                        if ping {
                            let sha256 = std::env::current_exe()
                                .ok()
                                .and_then(|p| fs::File::open(p).ok())
                                .and_then(|f| crate::download::runtime::hash(f).ok());
                            response["bridge"] = serde_json::json!({"version":env!("CARGO_PKG_VERSION"),"sha256":sha256,"capabilities":["ping","report_failure","page_submit_v1","clip_v1","precise_clip_v1"]});
                        }
                        response
                    }
                    Err(code) => {
                        serde_json::json!({"version":1, "request_id":message.request_id, "ok":false, "error":code})
                    }
                }
            }
            _ => serde_json::json!({"version":1, "ok":false, "error":"E_SESSION_PROTOCOL"}),
        } };
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
    Ok(directory.join(name))
}
pub fn install(host: &Path) -> Result<PathBuf> {
    let contents = installation_manifest(host)?;
    let directory =
        crate::download::runtime::RuntimeManager::default_root()?.join("browser-bridge");
    super::protection::directory(&directory).map_err(|_| "E_SESSION_REGISTRATION")?;
    let manifest = directory.join(format!("{HOST_NAME}.json"));
    fs::write(
        &manifest,
        serde_json::to_vec_pretty(&contents).map_err(|_| "E_SESSION_REGISTRATION")?,
    )
    .map_err(|_| "E_SESSION_REGISTRATION")?;
    register(&manifest).map_err(|_| "E_SESSION_REGISTRATION")?;
    Ok(manifest)
}
pub fn installation_manifest(host: &Path) -> Result<serde_json::Value> {
    let host = host.canonicalize().map_err(|_| "E_SESSION_HOST_MISSING")?;
    let normal = messaging_path(&host)?;
    if !normal.is_file() || normal.canonicalize().map_err(|_| "E_SESSION_HOST_PATH")? != host {
        return Err("E_SESSION_HOST_PATH".into());
    }
    let host = normal;
    probe_host(&host)?;
    Ok(serde_json::json!({
        "name":HOST_NAME, "description":"Ameow site sessions", "path":host,
        "type":"stdio", "allowed_origins":[ORIGIN]
    }))
}
pub fn messaging_path(path: &Path) -> Result<PathBuf> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let text = path.to_str().ok_or("E_SESSION_HOST_PATH")?;
        // Chromium may launch through cmd.exe, which cannot execute verbatim device paths.
        let normal = if text
            .get(..8)
            .is_some_and(|p| p.eq_ignore_ascii_case(r"\\?\UNC\"))
        {
            PathBuf::from(format!(r"\\{}", &text[8..]))
        } else if let Some(drive) = text.strip_prefix(r"\\?\") {
            if !drive
                .as_bytes()
                .first()
                .is_some_and(u8::is_ascii_alphabetic)
                || drive.as_bytes().get(1..3) != Some(b":\\")
            {
                return Err("E_SESSION_HOST_PATH".into());
            }
            PathBuf::from(drive)
        } else {
            path.to_path_buf()
        };
        if !normal.is_absolute()
            || normal.as_os_str().encode_wide().count() >= 260
            || normal.to_string_lossy().starts_with(r"\\.\")
        {
            return Err("E_SESSION_HOST_PATH".into());
        }
        return Ok(normal);
    }
    #[cfg(not(windows))]
    Ok(path.to_path_buf())
}
fn probe_host(host: &Path) -> Result<()> {
    use std::process::{Command, Stdio};
    let mut command = Command::new(host);
    command
        .arg(ORIGIN)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(|_| "E_SESSION_HOST_START")?;
    let data = serde_json::to_vec(&Message {
        version: 1,
        request_id: "installation-probe".into(),
        operation: Operation::Ping,
    })
    .map_err(|_| storage())?;
    let mut input = child.stdin.take().ok_or("E_SESSION_HOST_PROTOCOL")?;
    input
        .write_all(&(data.len() as u32).to_le_bytes())
        .and_then(|_| input.write_all(&data))
        .map_err(|_| "E_SESSION_HOST_PROTOCOL")?;
    drop(input);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
    loop {
        if child
            .try_wait()
            .map_err(|_| "E_SESSION_HOST_PROTOCOL")?
            .is_some()
        {
            break;
        }
        if std::time::Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err("E_SESSION_HOST_TIMEOUT".into());
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    let output = child
        .wait_with_output()
        .map_err(|_| "E_SESSION_HOST_PROTOCOL")?;
    if !output.status.success() || output.stdout.len() < 4 || output.stdout.len() > MAX_MESSAGE {
        return Err("E_SESSION_HOST_PROTOCOL".into());
    }
    let length = u32::from_le_bytes(output.stdout[..4].try_into().unwrap()) as usize;
    let reply: serde_json::Value =
        serde_json::from_slice(&output.stdout[4..]).map_err(|_| "E_SESSION_HOST_PROTOCOL")?;
    let capabilities = reply["bridge"]["capabilities"].as_array();
    if length != output.stdout.len() - 4
        || reply["version"] != 1
        || reply["ok"] != true
        || reply["request_id"] != "installation-probe"
        || !reply["sites"].is_array()
        || !capabilities.is_some_and(|v| {
            v.iter().any(|s| s == "ping") && v.iter().any(|s| s == "report_failure")
        })
    {
        return Err("E_SESSION_HOST_PROTOCOL".into());
    }
    Ok(())
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
