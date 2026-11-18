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

const HELP: &str = "Ameow CLI\n\nUsage: ameow-cli [--json] [--no-start] [--app PATH] [--instance-root PATH] <command>\n\nCommands:\n  submit URL [--quality highest|balanced|saver] [--output DIR]\n  list | show ID | cancel ID | retry ID | wait ID [--timeout SECONDS]\n  settings | components | diagnose [ID]\n\nA mutation can be replayed with --request-id ID --instance-id ID from its receipt.\nExamples:\n  ameow-cli --json submit https://example.com/media --quality balanced\n  ameow-cli --json wait INSTANCE:JOB --timeout 300\n\nExit: 0 success, 2 invalid input, 3 partial, 4 failed, 5 cancelled, 6 timeout, 7 connection, 8 protocol, 9 rejected.\n";

#[derive(Debug)]
struct Options {
    json: bool,
    no_start: bool,
    app: Option<PathBuf>,
    instance_root: Option<PathBuf>,
    request_id: Option<String>,
    instance_id: Option<String>,
    action: Action,
}

#[derive(Debug)]
enum Action {
    Help,
    Version,
    Request(Command),
    Wait {
        task_id: String,
        timeout: Option<Duration>,
    },
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
    let mut quality = None;
    let mut output_dir = None;
    let mut timeout = None;
    let mut positionals = Vec::new();
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        let mut value = || {
            args.next()
                .ok_or_else(|| invalid(format!("{arg} requires a value")))
        };
        match arg.as_str() {
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
            "--help" | "-h" if positionals.is_empty() => positionals.push("help".into()),
            "--version" | "-V" if positionals.is_empty() => positionals.push("version".into()),
            _ if arg.starts_with('-') => {
                return Err(invalid(format!("unknown or duplicate option {arg}")));
            }
            _ => positionals.push(arg),
        }
    }
    let name = positionals
        .first()
        .map(String::as_str)
        .ok_or_else(|| invalid("missing command; use --help"))?;
    if quality.is_some() && name != "submit"
        || output_dir.is_some() && name != "submit"
        || timeout.is_some() && name != "wait"
        || request_id.is_some() && !matches!(name, "submit" | "cancel" | "retry")
        || instance_id.is_some() != request_id.is_some()
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
            none()?;
            Action::Help
        }
        "version" => {
            none()?;
            Action::Version
        }
        "submit" => Action::Request(Command::Submit {
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
        "settings" => {
            none()?;
            Action::Request(Command::Settings {})
        }
        "components" => {
            none()?;
            Action::Request(Command::Components {})
        }
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
        let launcher = dir.join("AmeowLauncher.exe");
        if launcher.is_file() {
            return Ok(launcher);
        }
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
    let app = if options.instance_root.is_some() {
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
        "Success" => Some(0),
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
    let mut connection = hello(&path);
    if connection
        .as_ref()
        .is_err_and(|e| e.code == "E_NOT_RUNNING")
        && matches!(&options.action, Action::Request(Command::Submit { .. }))
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
    if matches!(&options.action, Action::Request(Command::Submit { .. })) {
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
            Ok((reply, 0))
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
                    return Ok((finish_files(&path, &instance, task_id, reply)?, status));
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

pub fn run() -> i32 {
    let raw_args: Vec<_> = std::env::args_os().skip(1).collect();
    let wants_json = raw_args.iter().any(|arg| arg == "--json");
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
    let options = match parse(args) {
        Ok(options) => options,
        Err(error) => return print_error(wants_json, error.into()),
    };
    match &options.action {
        Action::Help => {
            if options.json {
                println!(
                    "{}",
                    serde_json::json!({"protocol_version": PROTOCOL_VERSION, "ok":true, "result": {"help": HELP}})
                );
            } else {
                print!("{HELP}");
            }
            0
        }
        Action::Version => {
            if options.json {
                println!(
                    "{}",
                    serde_json::json!({"protocol_version": PROTOCOL_VERSION, "ok":true, "result": {"version": env!("CARGO_PKG_VERSION")}})
                );
            } else {
                println!("ameow-cli {}", env!("CARGO_PKG_VERSION"));
            }
            0
        }
        _ => match execute(&options) {
            Ok((response, status)) => {
                if options.json {
                    println!(
                        "{}",
                        serde_json::to_string(&response).expect("serializable response")
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

#[cfg(test)]
mod tests {
    use super::*;
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
