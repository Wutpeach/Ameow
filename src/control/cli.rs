//! Non-interactive console client for the running desktop queue owner.
use super::{Command, ControlError, PROTOCOL_VERSION, Request, Response, nonce, root, rpc};
use crate::download::request::Quality;
use std::{
    path::{Path, PathBuf},
    process::{Command as Process, Stdio},
    thread,
    time::{Duration, Instant},
};

#[cfg(windows)]
fn quote_windows_argument(value: &[u16], output: &mut Vec<u16>) {
    output.push(b'"' as u16);
    let mut slashes = 0;
    for &unit in value {
        if unit == b'\\' as u16 {
            slashes += 1;
        } else {
            let count = if unit == b'"' as u16 {
                slashes * 2 + 1
            } else {
                slashes
            };
            output.extend(std::iter::repeat_n(b'\\' as u16, count));
            output.push(unit);
            slashes = 0;
        }
    }
    output.extend(std::iter::repeat_n(b'\\' as u16, slashes * 2));
    output.push(b'"' as u16);
}

#[cfg(windows)]
fn spawn_app(process: &Process) -> Result<(), ControlError> {
    use std::{os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::Threading::{CREATE_NO_WINDOW, CreateProcessW, PROCESS_INFORMATION, STARTUPINFOW},
    };
    let mut application: Vec<u16> = process.get_program().encode_wide().collect();
    if application.is_empty() || application.contains(&0) {
        return Err(ControlError::new("E_LAUNCH", "invalid application path"));
    }
    let mut command = Vec::new();
    quote_windows_argument(&application, &mut command);
    for argument in process.get_args() {
        let value: Vec<u16> = argument.encode_wide().collect();
        if value.contains(&0) {
            return Err(ControlError::new(
                "E_LAUNCH",
                "application argument contains NUL",
            ));
        }
        command.push(b' ' as u16);
        quote_windows_argument(&value, &mut command);
    }
    command.push(0);
    if command.len() > 32767 {
        return Err(ControlError::new(
            "E_LAUNCH",
            "application command line is too long",
        ));
    }
    application.push(0);
    let startup = STARTUPINFOW {
        cb: std::mem::size_of::<STARTUPINFOW>() as u32,
        ..Default::default()
    };
    let mut info = PROCESS_INFORMATION::default();
    let created = unsafe {
        CreateProcessW(
            application.as_ptr(),
            command.as_mut_ptr(),
            ptr::null(),
            ptr::null(),
            0,
            CREATE_NO_WINDOW,
            ptr::null(),
            ptr::null(),
            &startup,
            &mut info,
        )
    };
    if created == 0 {
        return Err(ControlError::new(
            "E_LAUNCH",
            format!("cannot start Ameow: {}", std::io::Error::last_os_error()),
        ));
    }
    unsafe {
        CloseHandle(info.hThread);
        CloseHandle(info.hProcess);
    }
    Ok(())
}

#[cfg(not(windows))]
fn spawn_app(process: &mut Process) -> Result<(), ControlError> {
    process
        .spawn()
        .map_err(|e| ControlError::new("E_LAUNCH", format!("cannot start Ameow: {e}")))?;
    Ok(())
}

const HELP: &str = "Ameow CLI\n\nUsage: ameow-cli [--json] [--no-start] [--app PATH] [--instance-root PATH] COMMAND\n\nDownload: inspect URL | submit URL | list | show ID | wait ID | cancel ID | retry ID\nMaintenance: settings | sessions | components | app | diagnose [ID]\nDiscovery: help [COMMAND] | COMMAND --help | version\n\n--json emits one machine-readable result. --no-start prevents automatic startup.\n--app PATH selects an app; --instance-root PATH selects an isolated domain.\nReplay a mutation against the same instance with --request-id ID --instance-id ID.\nExamples: ameow-cli --json inspect https://example.com/media\n          ameow-cli --json wait INSTANCE:JOB --timeout 300\nUse COMMAND --help for options and recovery. Documentation: https://wutpeach.github.io/Ameow/docs/cli/\nExit: 0 success, 2 invalid input, 3 partial, 4 failed, 5 cancelled, 6 timeout, 7 connection, 8 protocol, 9 rejected.\n";

fn command_help(command: &str) -> Option<&'static str> {
    Some(match command {
        "inspect" => "Usage: ameow-cli inspect URL [--quality highest|balanced|saver]\nQueries media through the desktop queue; default quality is highest. Returns task_id; use wait ID to obtain the inspection result. No file is downloaded. Starts the app unless --no-start is set. Requires network and a compatible owner; sessions reports browser authorization status.\n",
        "submit" => "Usage: ameow-cli submit URL [--quality highest|balanced|saver] [--output DIR] [--start-ms N --end-ms N [--precise]]\nOmitted quality and directory use saved defaults. DIR must exist. Both endpoints are integer milliseconds; fast clipping is default, --precise requests exact clipping. Options affect this task only. Returns task_id; wait ID returns final state and files. Starts the app unless --no-start is set.\n",
        "list" | "show" | "wait" | "cancel" | "retry" => "Usage: ameow-cli list | show ID | wait ID [--timeout SECONDS] | cancel ID | retry ID\nID is the instance-bound task_id. wait defaults to no timeout and returns final files only after resource settlement. Timeout or disconnect does not cancel. cancel acknowledges intent; wait for settlement. Retry follows frozen task options. Old instance IDs are rejected.\n",
        "settings" => "Usage: ameow-cli [--json] settings | settings set KEY VALUE | settings wait [--timeout SECONDS]\nReads saved defaults; set persists one existing preference through the desktop owner.\nKeys and values:\n  quality highest|balanced|saver; output_dir ABSOLUTE_EXISTING_DIRECTORY\n  theme system|light|dark; language system|chinese|english\n  tray_icon follow_appearance|ameow_blue|apricot\n  shortcut JSON object as returned by settings, or {\"chord\":null} to clear\n  auto_update true|false; notify_updates true|false; login_startup true|false\nVALUE accepts JSON or a bare string. Quote paths and JSON for your shell.\nQueue preferences return saved:true only after persistence/native confirmation; shortcut first checks native registration and retains the previous setting on failure. Application update preferences save asynchronously: inspect result.operation and use settings wait. login_startup uses the OS registration and is unavailable in isolated instances.\nRequires an existing compatible owner. Reading never starts the app. Task submit options do not change these defaults. Wait has no timeout by default; --timeout accepts 1..2678400 seconds. Timeout exits 6 without cancelling. Busy/validation/save/native errors retain their actual outcome: inspect settings and error.code before retry.\n",
        "sessions" => "Usage: ameow-cli sessions\nRead browser session status and missing authorization conditions. Authorize through the existing browser flow; credentials are never returned.\n",
        "components" => "Usage: ameow-cli [--json] components\n       ameow-cli components check [yt-dlp|gallery-dl]\n       ameow-cli components update COMPONENT | components restore COMPONENT\n       ameow-cli components wait [--timeout SECONDS]\nRead actual preparation, versions, checks and updates from the desktop owner. check uses the official upstream and checks both downloaders when COMPONENT is omitted; busy, cooldown and failure remain per component. update requires a successful check for an installable newer version. restore returns the chosen downloader to Ameow's recommended version. Fixed components update with the application. No arbitrary version or format selection.\nAll mutations may use network/disk and return an operation receipt; acceptance is not activation. Use components wait or query components to inspect each target/active version, stage and error. Wait defaults to no timeout; timeout exits 6 without cancelling. Failed operations exit 4 on wait. A replaced operation is rejected. Requires an existing compatible owner; no automatic startup. On cooldown wait for the reported interval; on failure inspect components/diagnose, correct the condition and explicitly retry.\n",
        "app" => "Usage: ameow-cli [--json] app status|check|download|install|quit|restart\n       ameow-cli app wait [--timeout SECONDS]\n       ameow-cli --instance-id ORIGINAL_INSTANCE --operation-id OPERATION_ID app status|wait [--timeout SECONDS]\nstatus reads the existing application update owner. check fetches the authenticated update feed. download requires Available and prepares/verifies the complete application. install requires Ready and an installed launcher/session, preserves work and waits for safe switching. Development executables without that session cannot install. These commands reuse desktop update trust and preferences.\nquit/restart close admission, allow existing tasks and resources to finish, and use a one-shot observer to confirm process exit/new-owner handshake. They do not force-kill active work. Conflicting application maintenance is rejected.\nMutation success acknowledges a scheduled operation; result.operation contains id/action/phase/done/success/error. Use app wait to confirm. For install/quit/restart, retain the receipt's instance_id and operation.id; --instance-id plus --operation-id resumes status/wait after the original owner exits. Only the most recent installation and lifecycle receipts are retained; old IDs are rejected. New task history is not restored.\nRequires an existing compatible owner. Wait defaults to no timeout; --timeout is 1..2678400 seconds, exits 6 and leaves the operation running. Failures exit 4 on wait. Missing/changed operations and connection errors are explicit; disconnection alone never proves success. Read app status/diagnose and resolve the reported condition before an explicit retry.\n",
        "diagnose" => "Usage: ameow-cli diagnose [ID]\nRead a safe diagnostic for the task or shared preparation; unavailable diagnostics return an error.\n",
        "help" => "Usage: ameow-cli help [COMMAND] | COMMAND --help\n",
        "version" => "Usage: ameow-cli --version | -V | version\nConnected command JSON also reports owner version and capabilities.\n",
        _ => return None,
    })
}

#[derive(Debug)]
struct Options {
    json: bool,
    no_start: bool,
    app: Option<PathBuf>,
    instance_root: Option<PathBuf>,
    request_id: Option<String>,
    instance_id: Option<String>,
    operation_id: Option<String>,
    action: Action,
}

#[derive(Debug)]
enum Action {
    Help(Option<String>),
    Version,
    Request(Command),
    Wait {
        task_id: String,
        timeout: Option<Duration>,
    },
    WaitMaintenance { kind: MaintenanceKind, timeout: Option<Duration> },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum MaintenanceKind { Settings, Components, App }
impl MaintenanceKind {
    fn capability(self) -> &'static str { match self { Self::Settings => "preferences_write_v1", Self::Components => "component_maintenance_v1", Self::App => "app_maintenance_v1" } }
    fn command(self) -> Command { match self { Self::Settings => Command::Settings {}, Self::Components => Command::Components {}, Self::App => Command::AppAction { action: "status".into() } } }
}

fn invalid(message: impl Into<String>) -> ControlError {
    ControlError::new("E_INVALID_ARGUMENT", message)
}

fn parse(args: Vec<String>) -> Result<Options, ControlError> {
    let mut json = false;
    let mut no_start = false;
    let mut app = None;
    let mut instance_root = None;
    let mut request_id = None;
    let mut instance_id = None;
    let mut operation_id = None;
    let mut quality = None;
    let mut output_dir = None;
    let mut start_ms = None;
    let mut end_ms = None;
    let mut timeout = None;
    let mut precise = false;
    let mut wants_help = false;
    let mut positionals = Vec::new();
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        let mut value = || {
            args.next()
                .ok_or_else(|| invalid(format!("{arg} requires a value")))
        };
        match arg.as_str() {
            "--operation-id" if operation_id.is_none() => {
                let id = value()?;
                if id.len() != 32 || !id.bytes().all(|byte| byte.is_ascii_hexdigit()) { return Err(invalid("operation ID must be 32 hexadecimal characters")); }
                operation_id = Some(id.to_ascii_lowercase());
            }
            "--start-ms" if start_ms.is_none() => start_ms = Some(value()?.parse::<u64>().map_err(|_| invalid("start-ms must be nonnegative integer milliseconds"))?),
            "--end-ms" if end_ms.is_none() => end_ms = Some(value()?.parse::<u64>().map_err(|_| invalid("end-ms must be nonnegative integer milliseconds"))?),
            "--precise" if !precise => precise = true,
            "--json" if !json => json = true,
            "--no-start" if !no_start => no_start = true,
            "--app" if app.is_none() => app = Some(PathBuf::from(value()?)),
            "--instance-root" if instance_root.is_none() => {
                instance_root = Some(PathBuf::from(value()?))
            }
            "--request-id" if request_id.is_none() => {
                let id = value()?;
                if !(8..=80).contains(&id.len())
                    || !id
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"-_".contains(&b))
                {
                    return Err(invalid(
                        "request ID must contain 8–80 ASCII letters, digits, '-' or '_'",
                    ));
                }
                request_id = Some(id);
            }
            "--instance-id" if instance_id.is_none() => {
                let id = value()?;
                if id.len() != 32 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
                    return Err(invalid("invalid instance ID"));
                }
                instance_id = Some(id.to_ascii_lowercase());
            }
            "--quality" if quality.is_none() => {
                quality = Some(match value()?.as_str() {
                    "highest" => Quality::Highest,
                    "balanced" => Quality::Balanced,
                    "saver" => Quality::Saver,
                    _ => return Err(invalid("quality must be highest, balanced or saver")),
                })
            }
            "--output" if output_dir.is_none() => {
                let path = PathBuf::from(value()?);
                if path.as_os_str().is_empty() {
                    return Err(invalid("output directory is empty"));
                }
                output_dir = Some(if path.is_absolute() {
                    path
                } else {
                    std::env::current_dir()
                        .map_err(|e| invalid(format!("current directory: {e}")))?
                        .join(path)
                });
            }
            "--timeout" if timeout.is_none() => {
                let secs = value()?
                    .parse::<u64>()
                    .map_err(|_| invalid("timeout must be a positive number of seconds"))?;
                if !(1..=31 * 24 * 60 * 60).contains(&secs) {
                    return Err(invalid("timeout must be between 1 second and 31 days"));
                }
                timeout = Some(Duration::from_secs(secs));
            }
            "--help" | "-h" if !wants_help => wants_help = true,
            "--version" | "-V" if positionals.is_empty() => positionals.push("version".into()),
            _ if arg.starts_with('-') => {
                return Err(invalid(format!("unknown or duplicate option {arg}")));
            }
            _ => positionals.push(arg),
        }
    }
    if wants_help {
        let topic = positionals.first().filter(|name| name.as_str() != "help").cloned()
            .or_else(|| positionals.get(1).cloned());
        if topic.as_deref().is_some_and(|topic| command_help(topic).is_none()) {
            return Err(invalid("unknown help topic"));
        }
        return Ok(Options { json, no_start, app, instance_root, request_id, instance_id, operation_id, action: Action::Help(topic) });
    }
    let name = positionals
        .first()
        .map(String::as_str)
        .ok_or_else(|| invalid("missing command; use --help"))?;
    let maintenance_wait = matches!(name, "settings" | "components" | "app") && positionals.get(1).is_some_and(|arg| arg == "wait") && positionals.len() == 2;
    if operation_id.is_some() && !(name == "app" && positionals.len() == 2 && matches!(positionals[1].as_str(), "wait" | "status") && instance_id.is_some() && request_id.is_none()) {
        return Err(invalid("--operation-id requires app wait/status and --instance-id from the receipt"));
    }
    if quality.is_some() && !matches!(name, "submit" | "inspect")
        || (start_ms.is_some() || end_ms.is_some()) && name != "submit"
        || start_ms.is_some() != end_ms.is_some()
        || precise && (name != "submit" || start_ms.is_none())
        || output_dir.is_some() && name != "submit"
        || timeout.is_some() && name != "wait" && !maintenance_wait
        || request_id.is_some() && maintenance_wait
        || request_id.is_some() && !matches!(name, "submit" | "inspect" | "cancel" | "retry" | "settings" | "components" | "app")
        || request_id.is_some() && instance_id.is_none()
        || instance_id.is_some() && request_id.is_none() && !(name == "inspect" || maintenance_wait || operation_id.is_some())
    {
        return Err(invalid("option does not apply to this command"));
    }
    let one = || -> Result<String, ControlError> {
        if positionals.len() != 2 || positionals[1].is_empty() {
            return Err(invalid(format!("{name} requires one argument")));
        }
        Ok(positionals[1].clone())
    };
    let none = || {
        if positionals.len() == 1 {
            Ok(())
        } else {
            Err(invalid(format!("{name} takes no arguments")))
        }
    };
    let action = match name {
        "help" => {
            if positionals.len() > 2 || positionals.get(1).is_some_and(|topic| command_help(topic).is_none()) {
                return Err(invalid("unknown help topic"));
            }
            Action::Help(positionals.get(1).cloned())
        }
        "version" => {
            none()?;
            Action::Version
        }
        "inspect" => Action::Request(Command::Inspect { url: one()?, quality: quality.unwrap_or(Quality::Highest) }),
        "submit" => Action::Request(Command::Submit {
            clip: start_ms.zip(end_ms).map(|(start_ms, end_ms)| crate::download::request::ClipRange { start_ms, end_ms, precise }.validate().map_err(invalid)).transpose()?,
            url: one()?,
            quality,
            output_dir,
        }),
        "list" => {
            none()?;
            Action::Request(Command::List {})
        }
        "show" => Action::Request(Command::Show { task_id: one()? }),
        "cancel" => Action::Request(Command::Cancel { task_id: one()? }),
        "retry" => Action::Request(Command::Retry { task_id: one()? }),
        "wait" => Action::Wait {
            task_id: one()?,
            timeout,
        },
        "settings" | "components" | "app" if maintenance_wait => Action::WaitMaintenance {
            kind: match name { "settings" => MaintenanceKind::Settings, "components" => MaintenanceKind::Components, _ => MaintenanceKind::App }, timeout,
        },
        "settings" if positionals.len() == 1 => Action::Request(Command::Settings {}),
        "settings" if positionals.len() == 4 && positionals[1] == "set" => {
            let value = serde_json::from_str(&positionals[3])
                .unwrap_or_else(|_| serde_json::Value::String(positionals[3].clone()));
            Action::Request(Command::SetPreference { key: positionals[2].clone(), value })
        }
        "sessions" => { none()?; Action::Request(Command::BrowserSessions {}) }
        "components" if positionals.len() == 1 => Action::Request(Command::Components {}),
        "components" if (positionals.len() == 2 || positionals.len() == 3)
            && matches!(positionals[1].as_str(), "check" | "update" | "restore") => {
            let action = positionals[1].clone();
            let component = positionals.get(2).cloned();
            if component.as_deref().is_some_and(|v| !matches!(v, "yt-dlp" | "gallery-dl"))
                || action != "check" && component.is_none() {
                return Err(invalid("expected component yt-dlp or gallery-dl"));
            }
            Action::Request(Command::ComponentAction { action, component })
        }
        "app" if positionals.len() == 2 && matches!(positionals[1].as_str(), "status" | "check" | "download" | "install" | "quit" | "restart") =>
            Action::Request(Command::AppAction { action: positionals[1].clone() }),
        "diagnose" if positionals.len() <= 2 => Action::Request(Command::Diagnose {
            task_id: positionals.get(1).cloned(),
        }),
        _ => {
            return Err(invalid(format!(
                "unknown command or invalid arguments: {name}"
            )));
        }
    };
    Ok(Options {
        json,
        no_start,
        app,
        instance_root,
        request_id,
        instance_id,
        operation_id,
        action,
    })
}

struct CliError {
    error: ControlError,
    request_id: Option<String>,
    instance_id: Option<String>,
}
impl From<ControlError> for CliError {
    fn from(error: ControlError) -> Self {
        Self {
            error,
            request_id: None,
            instance_id: None,
        }
    }
}

fn request(
    command: Command,
    instance_id: Option<String>,
    request_id: Option<String>,
) -> Result<Request, ControlError> {
    Ok(Request {
        protocol_version: PROTOCOL_VERSION,
        request_id: match request_id {
            Some(v) => v,
            None => nonce()?,
        },
        instance_id,
        command,
    })
}

fn app_path(selected: Option<&Path>) -> Result<PathBuf, ControlError> {
    if let Some(path) = selected {
        #[cfg(windows)]
        return crate::app_update::startup_entry_for(path)
            .map_err(|e| ControlError::new("E_LAUNCH", e));
        #[cfg(not(windows))]
        return Ok(path.to_path_buf());
    }
    let exe = std::env::current_exe().map_err(|e| ControlError::new("E_LAUNCH", e.to_string()))?;
    let dir = exe
        .parent()
        .ok_or_else(|| ControlError::new("E_LAUNCH", "CLI has no parent directory"))?;
    #[cfg(windows)]
    {
        let app = dir.join("Ameow.exe");
        return crate::app_update::startup_entry_for(&app)
            .map_err(|e| ControlError::new("E_LAUNCH", e));
    }
    #[cfg(not(windows))]
    {
        Ok(dir.join("ameow"))
    }
}

fn start_app(options: &Options, instance_root: &Path) -> Result<(), ControlError> {
    let app = if options.instance_root.is_some()
        && !cfg!(all(feature = "app-update-fixture", debug_assertions))
    {
        let selected = options.app.as_ref().ok_or_else(|| {
            ControlError::new(
                "E_LAUNCH",
                "isolated startup requires --app with a development executable",
            )
        })?;
        let resolved = selected
            .canonicalize()
            .map_err(|e| ControlError::new("E_LAUNCH", e.to_string()))?;
        let filename = resolved.file_name().and_then(|v| v.to_str()).unwrap_or("");
        if !(filename.eq_ignore_ascii_case("ameow.exe") || filename == "ameow")
            || resolved.parent().is_some_and(|p| p.join("state.json").is_file())
            || resolved.components().any(|part| {
                let name = part.as_os_str().to_string_lossy().to_ascii_lowercase();
                name == "versions" || name.ends_with(".app")
            })
        {
            return Err(ControlError::new(
                "E_LAUNCH",
                "isolated startup requires the direct development app, not the installed launcher or version",
            ));
        }
        resolved
    } else {
        app_path(options.app.as_deref())?
    };
    #[cfg(all(windows, feature = "app-update-fixture", debug_assertions))]
    if options.instance_root.is_some()
        && app.parent().is_some_and(|p| p.join("state.json").is_file())
    {
        crate::app_update::release::verify_fixture_launcher(&app)
            .map_err(|e| ControlError::new("E_LAUNCH", e))?;
    }
    let mut process = Process::new(app);
    process
        .arg("--cli-launch")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if options.instance_root.is_some() {
        let output = instance_root.join("output");
        std::fs::create_dir_all(&output)
            .map_err(|e| ControlError::new("E_LAUNCH", e.to_string()))?;
        process
            .arg("--instance-root")
            .arg(instance_root)
            .arg("--runtime-root")
            .arg(instance_root.join("runtime"))
            .arg("--settings-path")
            .arg(instance_root.join("settings.json"))
            .arg("--output")
            .arg(output);
    }
    spawn_app(&mut process)
}

fn hello(path: &Path) -> Result<Response, ControlError> {
    rpc(path, &request(Command::Hello {}, None, None)?)
}

fn inspection_ready(result: &serde_json::Value) -> Result<(), ControlError> {
    if result["inspection_v1"].as_bool() != Some(true) {
        return Err(ControlError::new("E_INSPECTION_UNSUPPORTED", "Selected owner does not support metadata inspection; request was not sent"));
    }
    if !startup_ready(result)? { return Err(ControlError::new("E_STARTING", "Selected owner is still starting; request was not sent")); }
    Ok(())
}
fn owner_summary(greeting: &Response) -> serde_json::Value {
    let result = greeting.result.as_ref().unwrap_or(&serde_json::Value::Null);
    serde_json::json!({"instance_id":greeting.instance_id,"protocol_version":greeting.protocol_version,
        "pid":result["pid"].as_u64(),"app_version":result["app_version"].as_str(),"installed_version":result["installed_version"].as_str(),"build_hash":"unknown",
        "startup_pending":result["startup_pending"].as_bool(),"commands_allowed":result["commands_allowed"].as_bool(),
        "capabilities":{"clip_v1":result["clip_v1"].as_bool(),"precise_clip_v1":result["precise_clip_v1"].as_bool(),"inspection_v1":result["inspection_v1"].as_bool(),"browser_sessions_v1":result["browser_sessions_v1"].as_bool(),"preferences_write_v1":result["preferences_write_v1"].as_bool(),"component_maintenance_v1":result["component_maintenance_v1"].as_bool(),"app_maintenance_v1":result["app_maintenance_v1"].as_bool()}})
}

fn response_ok(response: Response) -> Result<Response, ControlError> {
    if response.ok {
        Ok(response)
    } else {
        Err(response
            .error
            .unwrap_or_else(|| ControlError::new("E_PROTOCOL", "error response omitted its error")))
    }
}

fn terminal_exit(phase: &str, resources_released: bool) -> Option<i32> {
    if !resources_released {
        return None;
    }
    match phase {
        "Success" | "Inspected" => Some(0),
        "Partial" => Some(3),
        "Failure" => Some(4),
        "Cancelled" => Some(5),
        _ => None,
    }
}

fn startup_ready(result: &serde_json::Value) -> Result<bool, ControlError> {
    let pending = result
        .get("startup_pending")
        .and_then(|v| v.as_bool())
        .ok_or_else(|| ControlError::new("E_PROTOCOL", "hello omitted startup state"))?;
    let allowed = result
        .get("commands_allowed")
        .and_then(|v| v.as_bool())
        .ok_or_else(|| ControlError::new("E_PROTOCOL", "hello omitted command permission"))?;
    if pending {
        Ok(false)
    } else if allowed {
        Ok(true)
    } else {
        Err(ControlError::new(
            "E_APP_UPDATE_BUSY",
            "Ameow is draining or updating",
        ))
    }
}

fn next_page(
    value: &serde_json::Value,
    key: &str,
    previous: u64,
) -> Result<Option<u64>, ControlError> {
    let field = value
        .get(key)
        .ok_or_else(|| ControlError::new("E_PROTOCOL", format!("missing {key}")))?;
    if field.is_null() {
        return Ok(None);
    }
    let next = field
        .as_u64()
        .filter(|v| *v > previous)
        .ok_or_else(|| ControlError::new("E_PROTOCOL", format!("invalid {key}")))?;
    Ok(Some(next))
}

fn finish_list(path: &Path, instance: &str, mut reply: Response) -> Result<Response, ControlError> {
    let result = reply
        .result
        .as_mut()
        .ok_or_else(|| ControlError::new("E_PROTOCOL", "list omitted result"))?;
    let revision = result
        .get("revision")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| ControlError::new("E_PROTOCOL", "list omitted revision"))?;
    let mut consistent = true;
    let mut cursor = 0;
    while let Some(after) = next_page(result, "next_after", cursor)? {
        let page = response_ok(rpc(
            path,
            &request(
                Command::ListPage { after },
                Some(instance.to_string()),
                None,
            )?,
        )?)?;
        let page = page
            .result
            .ok_or_else(|| ControlError::new("E_PROTOCOL", "list page omitted result"))?;
        let page_revision = page
            .get("revision")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| ControlError::new("E_PROTOCOL", "list page omitted revision"))?;
        consistent &= page_revision == revision;
        let jobs = page
            .get("jobs")
            .and_then(|v| v.as_array())
            .ok_or_else(|| ControlError::new("E_PROTOCOL", "list page omitted jobs"))?;
        result
            .get_mut("jobs")
            .and_then(|v| v.as_array_mut())
            .ok_or_else(|| ControlError::new("E_PROTOCOL", "list omitted jobs"))?
            .extend(jobs.iter().cloned());
        result["next_after"] = page
            .get("next_after")
            .cloned()
            .ok_or_else(|| ControlError::new("E_PROTOCOL", "list page omitted cursor"))?;
        cursor = after;
    }
    result["consistent"] = serde_json::json!(consistent);
    Ok(reply)
}

fn finish_files(
    path: &Path,
    instance: &str,
    task_id: &str,
    mut reply: Response,
) -> Result<Response, ControlError> {
    let result = reply
        .result
        .as_mut()
        .ok_or_else(|| ControlError::new("E_PROTOCOL", "show omitted result"))?;
    let revision = result
        .get("revision")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| ControlError::new("E_PROTOCOL", "show omitted revision"))?;
    let mut cursor = 0;
    while let Some(after) = next_page(result, "next_files_after", cursor)? {
        let after_usize = usize::try_from(after)
            .map_err(|_| ControlError::new("E_PROTOCOL", "invalid file cursor"))?;
        let page = response_ok(rpc(
            path,
            &request(
                Command::Files {
                    task_id: task_id.to_owned(),
                    after: after_usize,
                },
                Some(instance.to_string()),
                None,
            )?,
        )?)?;
        let page = page
            .result
            .ok_or_else(|| ControlError::new("E_PROTOCOL", "files page omitted result"))?;
        if page.get("revision").and_then(|v| v.as_u64()) != Some(revision)
            || page.get("task_id").and_then(|v| v.as_str()) != Some(task_id)
        {
            return Err(ControlError::new(
                "E_SNAPSHOT_CHANGED",
                "task changed while reading files; retry the query",
            ));
        }
        let files = page
            .get("files")
            .and_then(|v| v.as_array())
            .ok_or_else(|| ControlError::new("E_PROTOCOL", "files page omitted files"))?;
        result
            .get_mut("files")
            .and_then(|v| v.as_array_mut())
            .ok_or_else(|| ControlError::new("E_PROTOCOL", "show omitted files"))?
            .extend(files.iter().cloned());
        result["next_files_after"] = page
            .get("next_files_after")
            .cloned()
            .ok_or_else(|| ControlError::new("E_PROTOCOL", "files page omitted cursor"))?;
        cursor = after;
    }
    Ok(reply)
}

fn wait_saved_application(options: &Options, path: &Path, id: &str, expected: &str) -> Result<(Response, i32), CliError> {
    let timeout = match options.action { Action::WaitMaintenance { timeout, .. } => timeout, _ => None };
    let waiting = matches!(options.action, Action::WaitMaintenance { .. });
    let started = Instant::now();
    loop {
        let (instance, mut operation, installation) = match super::lifecycle::read_receipt(path, id) {
            Ok(receipt) => (receipt.instance_id.clone(), serde_json::to_value(receipt).map_err(|_| ControlError::new("E_PROTOCOL", "Invalid lifecycle receipt"))?, false),
            Err(_) => { let receipt = super::maintenance::read_install(path, id)?; (receipt.instance_id, receipt.operation, true) }
        };
        if instance != expected { return Err(ControlError::new("E_INSTANCE_CHANGED", "Operation belongs to a different desktop instance").into()); }
        let mut connected_owner = None;
        if installation && operation["done"] != true {
            if let Ok(greeting) = hello(path).and_then(response_ok) {
                let state = greeting.result.as_ref().unwrap_or(&serde_json::Value::Null);
                connected_owner = Some(owner_summary(&greeting));
                if greeting.instance_id == expected {
                    if let Ok(reply) = rpc(path, &request(Command::AppAction { action:"status".into() }, Some(expected.into()), None)?).and_then(response_ok) {
                        if let Some(current) = reply.result.and_then(|result| result.get("operation").cloned()).filter(|current| current["id"] == id) { operation = current; }
                    }
                } else if state["startup_pending"] == false && state["commands_allowed"] == true {
                    let success = state["app_version"] == operation["target_version"] && state["installed_version"] == operation["target_version"] && operation["target_version"].is_string();
                    operation["done"] = true.into(); operation["success"] = success.into();
                    operation["phase"] = if success {"replacement_owner"} else {"failed"}.into();
                    operation["error"] = if success {serde_json::Value::Null} else {"E_INSTALL_VERSION_MISMATCH".into()};
                    operation["new_instance_id"] = greeting.instance_id.into();
                }
                super::maintenance::save_install(path, &super::maintenance::InstallReceipt { instance_id:instance.clone(), operation:operation.clone() })?;
            }
        }
        let done = operation["done"].as_bool().ok_or_else(|| ControlError::new("E_PROTOCOL", "Operation omitted completion state"))?;
        if done || !waiting {
            let success = if done { Some(operation["success"].as_bool().ok_or_else(|| ControlError::new("E_PROTOCOL", "Completed operation omitted its result"))?) } else { None };
            let status = if waiting && success == Some(false) {4} else {0};
            let req = request(Command::AppAction { action:"status".into() }, Some(instance.clone()), None)?;
            let mut reply = Response::from_result(&req, &instance, Ok(serde_json::json!({"operation":operation})));
            reply.owner = connected_owner;
            return Ok((reply,status));
        }
        if timeout.is_some_and(|limit| started.elapsed() >= limit) {
            return Err(ControlError::new("E_WAIT_TIMEOUT", "Timed out waiting for application operation; result remains unconfirmed and operation continues").into());
        }
        thread::sleep(Duration::from_millis(200));
    }
}

fn execute(options: &Options) -> Result<(Response, i32), CliError> {
    let path = if let Some(path) = &options.instance_root {
        let selected = path
            .to_str()
            .ok_or_else(|| invalid("instance root must be valid Unicode"))?;
        super::isolated_root(&["--instance-root".into(), selected.into()])?
            .ok_or_else(|| invalid("missing instance root"))?
    } else {
        root(None)?
    };
    if let Some(id) = &options.operation_id { return wait_saved_application(options, &path, id, options.instance_id.as_deref().ok_or_else(|| invalid("Missing original instance ID"))?); }
    let mut connection = hello(&path);
    if connection
        .as_ref()
        .is_err_and(|e| e.code == "E_NOT_RUNNING")
        && matches!(&options.action, Action::Request(Command::Submit { .. } | Command::Inspect { .. }))
        && !options.no_start
        && options.instance_id.is_none()
    {
        start_app(options, &path)?;
        let started = Instant::now();
        loop {
            thread::sleep(Duration::from_millis(100));
            connection = hello(&path);
            if !connection
                .as_ref()
                .is_err_and(|e| e.code == "E_NOT_RUNNING")
            {
                break;
            }
            if started.elapsed() >= Duration::from_secs(30) {
                return Err(ControlError::new(
                    "E_LAUNCH_TIMEOUT",
                    "Ameow did not become ready within 30 seconds; an older instance may not support this protocol",
                )
                .into());
            }
        }
    }
    let mut greeting = response_ok(connection?)?;
    let instance = greeting.instance_id.clone();
    if options
        .instance_id
        .as_ref()
        .is_some_and(|expected| expected != &instance)
    {
        return Err(ControlError::new(
            "E_INSTANCE_CHANGED",
            "the expected Ameow instance is no longer running; request was not sent",
        )
        .into());
    }
    if matches!(&options.action, Action::Request(Command::Submit { .. } | Command::Inspect { .. })) {
        if let Action::Request(Command::Submit { clip: Some(range), .. }) = &options.action {
            clip_ready(greeting.result.as_ref().ok_or_else(|| ControlError::new("E_PROTOCOL", "hello omitted result"))?, *range)?;
        }
        let started = Instant::now();
        loop {
            let state = greeting
                .result
                .as_ref()
                .ok_or_else(|| ControlError::new("E_PROTOCOL", "hello omitted result"))?;
            if startup_ready(state)? {
                break;
            }
            if started.elapsed() >= Duration::from_secs(30) {
                return Err(ControlError::new(
                    "E_LAUNCH_TIMEOUT",
                    "Ameow did not finish starting within 30 seconds",
                )
                .into());
            }
            thread::sleep(Duration::from_millis(100));
            greeting = response_ok(hello(&path)?)?;
            if greeting.instance_id != instance {
                return Err(ControlError::new(
                    "E_INSTANCE_CHANGED",
                    "Ameow instance changed during startup; request was not sent",
                )
                .into());
            }
        }
    }
    if matches!(&options.action, Action::Request(Command::Inspect { .. })) {
        inspection_ready(greeting.result.as_ref().ok_or_else(|| ControlError::new("E_PROTOCOL", "hello omitted result"))?)?;
    }
    let capability = match &options.action {
        Action::WaitMaintenance { kind, .. } => Some(kind.capability()),
        Action::Request(Command::SetPreference { .. }) => Some(MaintenanceKind::Settings.capability()),
        Action::Request(Command::ComponentAction { .. }) => Some(MaintenanceKind::Components.capability()),
        Action::Request(Command::AppAction { .. }) => Some(MaintenanceKind::App.capability()),
        _ => None,
    };
    if let Some(capability) = capability {
        if greeting.result.as_ref().and_then(|state| state.get(capability)).and_then(|v| v.as_bool()) != Some(true) {
            return Err(ControlError::new("E_MAINTENANCE_UNSUPPORTED", format!("Owner does not support {capability}; request was not sent")).into());
        }
    }
    let owner = owner_summary(&greeting);
    match &options.action {
        Action::Request(command) => {
            let req = request(
                command.clone(),
                Some(instance.clone()),
                options.request_id.clone(),
            )?;
            let failure = |error| CliError {
                error,
                request_id: Some(req.request_id.clone()),
                instance_id: Some(instance.clone()),
            };
            let mut reply = response_ok(rpc(&path, &req).map_err(failure)?).map_err(failure)?;
            match command {
                Command::List {} => reply = finish_list(&path, &instance, reply)?,
                Command::Show { task_id } => {
                    reply = finish_files(&path, &instance, task_id, reply)?
                }
                _ => {}
            }
            reply.owner = Some(owner.clone());
            Ok((reply, 0))
        }
        Action::WaitMaintenance { kind, timeout } => {
            let start = Instant::now();
            let mut identity: Option<(Option<String>, String)> = None;
            let mut install_target: Option<String> = None;
            loop {
                let req = request(kind.command(), Some(instance.clone()), None)?;
                let response = rpc(&path, &req).and_then(response_ok);
                let mut reply = match response {
                    Ok(reply) => reply,
                    Err(error) if *kind == MaintenanceKind::App && install_target.is_some()
                        && matches!(error.code.as_str(), "E_NOT_RUNNING" | "E_DISCONNECTED" | "E_CONNECTION_TIMEOUT" | "E_INSTANCE_CHANGED") => {
                        if let Ok(next) = hello(&path).and_then(response_ok) {
                            let state = next.result.as_ref().unwrap_or(&serde_json::Value::Null);
                            if next.instance_id != instance && state["app_version"].as_str() == install_target.as_deref() && state["installed_version"].as_str() == install_target.as_deref()
                                && state["startup_pending"] == false {
                                let mut confirmed = next;
                                confirmed.owner = Some(owner_summary(&confirmed));
                                confirmed.result = Some(serde_json::json!({"operation": {"id":identity.as_ref().and_then(|v| v.0.as_deref()), "action":"install", "phase":"replacement_owner", "done":true, "success":true, "target_version":install_target}, "previous_instance_id":instance}));
                                return Ok((confirmed, 0));
                            }
                        }
                        if timeout.is_some_and(|limit| start.elapsed() >= limit) {
                            return Err(ControlError::new("E_WAIT_TIMEOUT", "Timed out waiting for replacement owner; installation result remains unconfirmed").into());
                        }
                        thread::sleep(Duration::from_millis(200));
                        continue;
                    }
                    Err(error) => return Err(error.into()),
                };
                let result = reply.result.as_ref().ok_or_else(|| ControlError::new("E_PROTOCOL", "maintenance response omitted result"))?;
                let operation = result.get("operation").filter(|v| !v.is_null())
                    .ok_or_else(|| ControlError::new("E_OPERATION_NOT_FOUND", "No retained maintenance operation; submit an operation first"))?;
                let action = operation.get("action").and_then(|v| v.as_str())
                    .ok_or_else(|| ControlError::new("E_PROTOCOL", "operation omitted action"))?;
                if *kind == MaintenanceKind::App && matches!(action, "quit" | "restart" | "install") {
                    if let Some(id) = operation["id"].as_str().filter(|id| id.len() == 32) { return wait_saved_application(options, &path, id, &instance); }
                }
                if *kind == MaintenanceKind::Settings && action != "save" {
                    return Err(ControlError::new("E_OPERATION_NOT_FOUND", "No retained preference save operation").into());
                }
                let id = operation.get("id").and_then(|v| v.as_str()).map(str::to_owned);
                let current = (id, action.to_owned());
                if identity.as_ref().is_some_and(|previous| previous != &current) {
                    return Err(ControlError::new("E_OPERATION_CHANGED", "Another operation replaced the one being observed").into());
                }
                if identity.is_none() { identity = Some(current); }
                if *kind == MaintenanceKind::App && action == "install" {
                    install_target = operation.get("target_version").and_then(|v| v.as_str()).map(str::to_owned);
                }
                let done = operation.get("done").and_then(|v| v.as_bool())
                    .ok_or_else(|| ControlError::new("E_PROTOCOL", "operation omitted completion state"))?;
                if done {
                    let success = operation.get("success").and_then(|v| v.as_bool())
                        .ok_or_else(|| ControlError::new("E_PROTOCOL", "completed operation omitted result"))?;
                    reply.owner = Some(owner.clone());
                    return Ok((reply, if success { 0 } else { 4 }));
                }
                if timeout.is_some_and(|limit| start.elapsed() >= limit) {
                    return Err(ControlError::new("E_WAIT_TIMEOUT", "Timed out waiting for maintenance; operation continues").into());
                }
                thread::sleep(Duration::from_millis(200));
            }
        }
        Action::Wait { task_id, timeout } => {
            let start = Instant::now();
            loop {
                let reply = response_ok(rpc(
                    &path,
                    &request(
                        Command::Show {
                            task_id: task_id.clone(),
                        },
                        Some(instance.clone()),
                        None,
                    )?,
                )?)?;
                let result = reply.result.as_ref().ok_or_else(|| {
                    ControlError::new("E_PROTOCOL", "show response omitted its result")
                })?;
                let phase = result
                    .get("phase")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        ControlError::new("E_PROTOCOL", "show response omitted phase")
                    })?;
                let released = result
                    .get("resources_released")
                    .and_then(|v| v.as_bool())
                    .ok_or_else(|| {
                        ControlError::new("E_PROTOCOL", "show response omitted resource settlement")
                    })?;
                if let Some(status) = terminal_exit(phase, released) {
                    let mut reply = finish_files(&path, &instance, task_id, reply)?;
                    reply.owner = Some(owner.clone());
                    return Ok((reply, status));
                }
                if timeout.is_some_and(|limit| start.elapsed() >= limit) {
                    return Err(ControlError::new(
                        "E_WAIT_TIMEOUT",
                        format!("timed out waiting for {task_id}; task continues"),
                    )
                    .into());
                }
                thread::sleep(Duration::from_millis(200));
            }
        }
        _ => unreachable!(),
    }
}

fn error_exit(code: &str) -> i32 {
    match code {
        "E_INVALID_ARGUMENT" | "E_INVALID_REQUEST" | "E_INVALID_TASK_ID" => 2,
        "E_WAIT_TIMEOUT" => 6,
        "E_NOT_RUNNING"
        | "E_DISCONNECTED"
        | "E_LAUNCH"
        | "E_LAUNCH_TIMEOUT"
        | "E_TIMEOUT"
        | "E_CONNECTION_TIMEOUT" => 7,
        "E_PROTOCOL" | "E_VERSION" | "E_PROTOCOL_VERSION" => 8,
        _ => 9,
    }
}

fn print_error(json: bool, failure: CliError) -> i32 {
    let CliError {
        error,
        request_id,
        instance_id,
    } = failure;
    let status = error_exit(&error.code);
    if json {
        println!(
            "{}",
            serde_json::json!({"protocol_version": PROTOCOL_VERSION, "request_id":request_id, "instance_id":instance_id, "ok": false, "error": error})
        );
    } else {
        eprintln!("{}: {}", error.code, error.message);
        if let (Some(request_id), Some(instance_id)) = (request_id, instance_id) {
            eprintln!("Request: {request_id}; instance: {instance_id}");
        }
    }
    status
}

fn clip_ready(hello: &serde_json::Value, range: crate::download::request::ClipRange) -> Result<(), ControlError> {
    if hello["clip_v1"] != true {
        return Err(ControlError::new("E_CLIP_UNSUPPORTED", "Desktop owner does not support clip intervals; request was not sent"));
    }
    if range.precise && hello["precise_clip_v1"] != true {
        return Err(ControlError::new("E_CLIP_UNSUPPORTED", "Desktop owner does not support precise clips; request was not sent"));
    }
    Ok(())
}
#[test]
fn precise_clip_requires_explicit_owner_capability_before_submit() {
    let fast = crate::download::request::ClipRange { start_ms: 1250, end_ms: 4750, precise: false };
    let precise = crate::download::request::ClipRange { precise: true, ..fast };
    assert!(clip_ready(&serde_json::json!({"clip_v1":true}), fast).is_ok());
    for hello in [serde_json::json!({}), serde_json::json!({"clip_v1":true}), serde_json::json!({"clip_v1":true,"precise_clip_v1":false})] {
        assert_eq!(clip_ready(&hello, precise).unwrap_err().code, "E_CLIP_UNSUPPORTED");
    }
    assert!(clip_ready(&serde_json::json!({"clip_v1":true,"precise_clip_v1":true}), precise).is_ok());
}
/// The browser bridge shares CLI startup, handshake and acceptance.
pub(crate) fn browser_submit(instance_root: Option<PathBuf>, url: String, clip: Option<crate::download::request::ClipRange>, request_id: String) -> Result<serde_json::Value, String> {
    if let Some(range) = clip { range.validate()?; }
    let app = if instance_root.is_some() {
        Some(std::env::current_exe().map_err(|_| "E_LAUNCH")?.with_file_name(if cfg!(windows) { "ameow.exe" } else { "ameow" }))
    } else { None };
    let options = Options { json: true, no_start: false, app, instance_root, request_id: Some(request_id), instance_id: None, operation_id: None,
        action: Action::Request(Command::Submit { url, clip, quality: None, output_dir: None }) };
    let (reply, _) = execute(&options).map_err(|e| e.error.code)?;
    reply.result.filter(|v| v["task_id"].is_string()).ok_or_else(|| "E_PROTOCOL".into())
}
pub fn run() -> i32 {
    let raw_args: Vec<_> = std::env::args_os().skip(1).collect();
    let wants_json = raw_args.iter().any(|arg| arg == "--json");
    #[cfg(windows)]
    match crate::app_update::forward_component("ameow-cli.exe") {
        Ok(Some(code)) => return code,
        Err(error) => return print_error(wants_json, ControlError::new("E_LAUNCH", error).into()),
        Ok(None) => {}
    }
    let args: Result<Vec<_>, _> = raw_args.into_iter().map(|arg| arg.into_string()).collect();
    let args = match args {
        Ok(args) => args,
        Err(_) => {
            return print_error(
                wants_json,
                invalid("arguments must be valid Unicode").into(),
            );
        }
    };
    let mut args = args;
    let dev_inspect = args.iter().position(|arg| arg == "dev").filter(|index| args.get(index + 1).is_some_and(|arg| arg == "inspect"));
    if let Some(index) = dev_inspect { args.remove(index); }
    if dev_inspect.is_none() && args.iter().find(|arg| arg.as_str() != "--json").is_some_and(|arg| arg == "dev") {
        #[cfg(all(feature = "dev-tools", debug_assertions))]
        return super::dev::run(args.into_iter().filter(|arg| arg != "--json").skip(1).collect());
        #[cfg(not(all(feature = "dev-tools", debug_assertions)))]
        return print_error(wants_json, ControlError::new("E_DEV_DISABLED", "dev requires a debug build with --features dev-tools").into());
    }
    let options = match parse(args) {
        Ok(options) => options,
        Err(error) => return print_error(wants_json, error.into()),
    };
    if dev_inspect.is_some() && !matches!(&options.action, Action::Help(_)) {
        if !cfg!(all(feature = "dev-tools", debug_assertions)) {
            return print_error(wants_json, ControlError::new("E_DEV_DISABLED", "dev inspect requires debug dev-tools").into());
        }
        if options.instance_id.is_none() || options.app.is_some() {
            return print_error(wants_json, invalid("dev inspect requires --instance-id of an existing owner; --app is not supported").into());
        }
    }
    match &options.action {
        Action::Help(topic) => {
            let help = topic.as_deref().and_then(command_help).unwrap_or(HELP);
            if options.json {
                println!(
                    "{}",
                    serde_json::json!({"protocol_version": PROTOCOL_VERSION, "ok":true, "result": {"help": help}})
                );
            } else {
                print!("{help}");
            }
            0
        }
        Action::Version => {
            if options.json {
                println!(
                    "{}",
                    serde_json::json!({"protocol_version": PROTOCOL_VERSION, "ok":true, "result": {"version": crate::app_update::BUILD_VERSION}})
                );
            } else {
                println!("ameow-cli {}", crate::app_update::BUILD_VERSION);
            }
            0
        }
        _ => match execute(&options) {
            Ok((response, status)) => {
                if options.json {
                    println!(
                        "{}",
                        serde_json::to_string(&{ let mut value = serde_json::to_value(&response).expect("serializable response"); value["client"] = serde_json::json!({"version":crate::app_update::BUILD_VERSION,"protocol_version":PROTOCOL_VERSION}); value }).expect("serializable response")
                    );
                } else if let Some(result) = response.result {
                    println!(
                        "{}",
                        serde_json::to_string_pretty(&result).expect("serializable result")
                    );
                }
                status
            }
            Err(error) => print_error(options.json, error),
        },
    }
}
#[test]
fn application_receipt_can_be_read_after_owner_exit_and_rejects_wrong_identity() {
    let root = tempfile::tempdir().unwrap();
    let id = "a".repeat(32);
    let instance = "b".repeat(32);
    let receipt = super::maintenance::InstallReceipt { instance_id:instance.clone(), operation:serde_json::json!({"id":id,"action":"install","done":true,"success":false,"error":"E_TEST_REJECTED","target_version":"9.0.1"}) };
    super::maintenance::save_install(root.path(), &receipt).unwrap();
    let args = vec!["--json".into(),"--instance-root".into(),root.path().display().to_string(),"--instance-id".into(),instance,"--operation-id".into(),id,"app".into(),"wait".into()];
    let options = parse(args.clone()).unwrap();
    let (reply, code) = execute(&options).map_err(|failure| failure.error).unwrap();
    assert_eq!(code,4);
    assert_eq!(reply.result.unwrap()["operation"]["error"], "E_TEST_REJECTED");
    let mut wrong = args; wrong[4] = "c".repeat(32);
    assert_eq!(execute(&parse(wrong).unwrap()).unwrap_err().error.code,"E_INSTANCE_CHANGED");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inspection_negotiation_and_owner_summary_do_not_infer_support() {
        let old = serde_json::json!({"pid":12,"app_version":"0.5.0","startup_pending":false,"commands_allowed":true});
        assert_eq!(inspection_ready(&old).unwrap_err().code,"E_INSPECTION_UNSUPPORTED");
        let mut current = old.clone(); current["inspection_v1"] = true.into(); current["startup_pending"] = true.into();
        assert_eq!(inspection_ready(&current).unwrap_err().code,"E_STARTING");
        current["startup_pending"] = false.into(); current["commands_allowed"] = false.into();
        assert_eq!(inspection_ready(&current).unwrap_err().code,"E_APP_UPDATE_BUSY");
        current["commands_allowed"] = true.into(); assert!(inspection_ready(&current).is_ok());
        let req = request(Command::Hello {},None,None).unwrap();
        let summary = owner_summary(&Response::from_result(&req,"known-owner",Ok(old)));
        assert_eq!(summary["instance_id"],"known-owner"); assert_eq!(summary["pid"],12);
        assert!(summary["capabilities"]["inspection_v1"].is_null()); assert_eq!(summary["build_hash"],"unknown");
        assert_eq!(terminal_exit("Inspected",true),Some(0)); assert_eq!(terminal_exit("Inspected",false),None);
    }
    #[test]
    fn inspection_and_precise_parser_validate_options() {
        assert!(parse(words(&["inspect", "https://example.com/work"])).is_ok());
        assert!(parse(words(&["inspect", "https://example.com/work", "--output", "D:/Synthetic"])).is_err());
        assert!(parse(words(&["submit", "https://example.com/work", "--precise"])).is_err());
        let precise = parse(words(&["submit", "https://example.com/work", "--start-ms", "100", "--end-ms", "1000", "--precise"])).unwrap();
        assert!(matches!(precise.action, Action::Request(Command::Submit { clip: Some(range), .. }) if range.precise));
        let fast = parse(words(&["submit", "https://example.com/work", "--start-ms", "100", "--end-ms", "1000"])).unwrap();
        assert!(matches!(fast.action, Action::Request(Command::Submit { clip: Some(range), .. }) if !range.precise));
    }
    #[test]
    fn help_and_maintenance_commands_are_discoverable_and_bounded() {
        for args in [&["submit", "--help"][..], &["help", "components"], &["-h"]] {
            assert!(matches!(parse(words(args)).unwrap().action, Action::Help(_)));
        }
        assert!(parse(words(&["settings", "set", "quality", "balanced"])).is_ok());
        assert!(parse(words(&["settings", "set", "shortcut", "{\"chord\":null}"])).is_ok());
        assert!(parse(words(&["components", "update", "yt-dlp"])).is_ok());
        assert!(parse(words(&["components", "restore"])).is_err());
        assert!(parse(words(&["components", "check", "other"])).is_err());
        assert!(parse(words(&["app", "status"])).is_ok());
        for name in ["settings", "components", "app"] {
            assert!(matches!(parse(words(&[name, "wait", "--timeout", "2"])).unwrap().action, Action::WaitMaintenance { .. }));
            assert!(parse(words(&[name, "wait", "--timeout", "0"])).is_err());
        }
        assert!(parse(words(&["components", "check", "--timeout", "2"])).is_err());
        assert!(parse(words(&["app", "wait", "--request-id", "request_1", "--instance-id", "0123456789abcdef0123456789abcdef"])).is_err());
    }
    #[test]
    fn inspection_uses_the_selected_existing_owner_over_normal_transport() {
        let temp=tempfile::tempdir().unwrap(); let root=temp.path().canonicalize().unwrap();
        let queue=crate::download::queue::DownloadCoordinator::update_test_queue(&root);
        let mut server=super::super::Server::start(&root).unwrap(); let id=server.instance_id.clone();
        let options=parse(vec!["inspect".into(),"https://youtu.be/jNQXAC9IVRw".into(),"--instance-root".into(),root.to_string_lossy().into_owned(),"--instance-id".into(),id.clone()]).unwrap();
        let client=thread::spawn(move || execute(&options)); let until=Instant::now()+Duration::from_secs(5);
        while !client.is_finished() && Instant::now()<until { server.poll(&queue,true,false); thread::sleep(Duration::from_millis(5)); }
        let (reply,status)=client.join().unwrap().map_err(|error| error.error.code).unwrap(); assert_eq!(status,0); assert_eq!(reply.instance_id,id);
        assert_eq!(reply.owner.unwrap()["capabilities"]["inspection_v1"],true);
        assert_eq!(queue.snapshot().jobs.len(),1); assert!(queue.snapshot().jobs[0].inspect_only);
        assert!(queue.snapshot().jobs[0].delivered.is_none());
    }
    #[cfg(windows)]
    #[test]
    fn windows_arguments_preserve_quotes_spaces_and_trailing_slashes() {
        #[link(name = "shell32")]
        unsafe extern "system" {
            fn CommandLineToArgvW(command: *const u16, count: *mut i32) -> *mut *mut u16;
        }
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn LocalFree(memory: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
        }
        let values = [
            "ameow.exe",
            "",
            "simple",
            "a b",
            "a\"b",
            "a\\\"b",
            "a\\",
            "中文 路径\\",
        ];
        let mut line = Vec::new();
        for (index, value) in values.iter().enumerate() {
            if index > 0 {
                line.push(b' ' as u16);
            }
            quote_windows_argument(&value.encode_utf16().collect::<Vec<_>>(), &mut line);
        }
        line.push(0);
        let mut count = 0;
        let argv = unsafe { CommandLineToArgvW(line.as_ptr(), &mut count) };
        assert!(!argv.is_null());
        let actual = unsafe { std::slice::from_raw_parts(argv, count as usize) }
            .iter()
            .map(|&arg| {
                let mut len = 0;
                while unsafe { *arg.add(len) } != 0 {
                    len += 1;
                }
                String::from_utf16(unsafe { std::slice::from_raw_parts(arg, len) }).unwrap()
            })
            .collect::<Vec<_>>();
        unsafe {
            LocalFree(argv.cast());
        }
        assert_eq!(actual, values);
    }
    fn words(input: &[&str]) -> Vec<String> {
        input.iter().map(|v| (*v).to_owned()).collect()
    }
    #[cfg(not(feature = "app-update-fixture"))]
    #[test]
    fn ordinary_cli_rejects_isolated_packaged_entries_before_spawn() {
        let temp = tempfile::tempdir().unwrap();
        for name in ["AmeowLauncher.exe", "versions/0.5.0/Ameow.exe", "Ameow.app/Contents/MacOS/ameow"] {
            let app = temp.path().join(name);
            std::fs::create_dir_all(app.parent().unwrap()).unwrap();
            std::fs::write(&app, b"must never execute").unwrap();
            let options = parse(vec!["--instance-root".into(), temp.path().to_string_lossy().into_owned(), "--app".into(), app.to_string_lossy().into_owned(), "submit".into(), "https://example.com/media".into()]).unwrap();
            assert_eq!(start_app(&options, temp.path()).unwrap_err().code, "E_LAUNCH");
        }
    }
    #[test]
    fn parser_rejects_misapplied_duplicate_and_invalid_options() {
        assert!(parse(words(&["list", "--timeout", "1"])).is_err());
        assert!(
            parse(words(&[
                "submit",
                "https://example.com",
                "--json",
                "--json"
            ]))
            .is_err()
        );
        assert!(parse(words(&["wait", "id", "--timeout", "0"])).is_err());
        assert!(parse(words(&["wait", "id", "--timeout", "18446744073709551615"])).is_err());
        assert!(
            parse(words(&[
                "submit",
                "https://example.com",
                "--quality",
                "best"
            ]))
            .is_err()
        );
        assert!(
            parse(words(&[
                "submit",
                "https://example.com",
                "--request-id",
                "invalid id"
            ]))
            .is_err()
        );
        assert!(parse(words(&["--json", "wait", "id", "--timeout", "30"])).is_ok());
    }

    #[test]
    fn replay_requires_valid_bound_id_pair() {
        let instance = "0123456789abcdef0123456789abcdef";
        assert!(
            parse(words(&[
                "cancel",
                "task",
                "--request-id",
                "request_1",
                "--instance-id",
                instance
            ]))
            .is_ok()
        );
        assert!(parse(words(&["cancel", "task", "--request-id", "request_1"])).is_err());
        assert!(
            parse(words(&[
                "cancel",
                "task",
                "--request-id",
                "short",
                "--instance-id",
                instance
            ]))
            .is_err()
        );
        assert!(
            parse(words(&[
                "cancel",
                "task",
                "--request-id",
                "invalid.id",
                "--instance-id",
                instance
            ]))
            .is_err()
        );
        assert!(
            parse(words(&[
                "cancel",
                "task",
                "--request-id",
                "request_1",
                "--instance-id",
                "not-hex"
            ]))
            .is_err()
        );
    }

    #[test]
    fn wait_reports_only_settled_terminal_outcomes() {
        for (phase, code) in [
            ("Success", 0),
            ("Partial", 3),
            ("Failure", 4),
            ("Cancelled", 5),
        ] {
            assert_eq!(terminal_exit(phase, false), None);
            assert_eq!(terminal_exit(phase, true), Some(code));
        }
        assert_eq!(terminal_exit("Downloading", true), None);
    }

    #[test]
    fn startup_waits_only_for_pending_and_rejects_drain() {
        assert!(
            !startup_ready(&serde_json::json!({"startup_pending":true,"commands_allowed":false}))
                .unwrap()
        );
        assert!(
            startup_ready(&serde_json::json!({"startup_pending":false,"commands_allowed":true}))
                .unwrap()
        );
        assert_eq!(
            startup_ready(&serde_json::json!({"startup_pending":false,"commands_allowed":false}))
                .unwrap_err()
                .code,
            "E_APP_UPDATE_BUSY"
        );
        assert!(startup_ready(&serde_json::json!({})).is_err());
    }

    #[test]
    fn paging_requires_a_monotonically_advancing_cursor() {
        assert_eq!(
            next_page(&serde_json::json!({"next_after":null}), "next_after", 0).unwrap(),
            None
        );
        assert_eq!(
            next_page(&serde_json::json!({"next_after":50}), "next_after", 0).unwrap(),
            Some(50)
        );
        assert!(next_page(&serde_json::json!({"next_after":50}), "next_after", 50).is_err());
    }
}
