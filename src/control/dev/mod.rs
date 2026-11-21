//! Finite, explicitly isolated development owner. Never compiled into ordinary builds.
mod fixture;
#[cfg(test)]
mod tests;

use super::{ControlError, nonce};
use crate::download::{
    composition,
    preparation::PreparationPhase,
    queue::{DownloadCoordinator, JobPhase, JobSnapshot, QueueSnapshot},
    request::Quality,
    runtime,
    settings::Settings,
};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    thread,
    time::{Duration, Instant},
};

const HELP: &str = "ameow-cli dev (debug + dev-tools only)\n\n  run --root DIR --url URL [--url URL ...] [--quality highest|balanced|saver]\n      [--cancel-job N --cancel-after-ms MS] [--stop-after-ms MS]\n      [--retry-failed] [--duplicate-first] [--timeout SECONDS] [--settle-timeout SECONDS]
      [--fixture-media-port PORT] (three fixed local media URLs only)\n  scenario --root DIR --case success|retry|cancel|stop|held|timeout\n  inspect URL --instance-id ID [--instance-root DIR] [--quality highest|balanced|saver]\n\nrun/scenario own a finite isolated invocation; new root per run, no GUI or attach service.\ninspect connects an explicitly identified existing owner; no auto-start. Observe with show/wait, cancel explicitly, retry a Held inspection to retry cleanup.\nInspection may use network and temporary files; Inspected is metadata only, never a delivered download.\nWrites evidence/identity.json, events.jsonl, result.json. stdout is one JSON result.\nTimeout requests Stop; unconfirmed cleanup returns 6 with stopped=false, never a settlement claim.\n";

#[derive(Debug)]
struct Options {
    root: PathBuf,
    urls: Vec<String>,
    quality: Quality,
    cancel_job: Option<usize>,
    cancel_after: Duration,
    stop_after: Option<Duration>,
    timeout: Duration,
    settle_timeout: Duration,
    retry_failed: bool,
    duplicate_first: bool,
    scenario: Option<String>,
    fixture_media_port: Option<u16>,
}

fn error(code: &str, message: &str) -> ControlError {
    ControlError::new(code, message)
}
fn io_result<T>(result: std::io::Result<T>) -> Result<T, ControlError> {
    result.map_err(|_| {
        error(
            "E_DEV_IO",
            "Cannot read or write the isolated development evidence; inspect directory permissions",
        )
    })
}
fn parse(args: Vec<String>) -> Result<Options, ControlError> {
    let invalid = || {
        error(
            "E_INVALID_ARGUMENT",
            "Invalid dev arguments; use ameow-cli dev --help",
        )
    };
    let mut args = args.into_iter();
    let command = args.next().ok_or_else(invalid)?;
    if !matches!(command.as_str(), "run" | "scenario") {
        return Err(invalid());
    }
    let mut root = None;
    let mut urls = Vec::new();
    let mut quality = Quality::Highest;
    let mut cancel_job = None;
    let mut cancel_after = Duration::from_millis(1000);
    let mut stop_after = None;
    let mut timeout = Duration::from_secs(120);
    let mut settle_timeout = Duration::from_secs(10);
    let mut retry_failed = false;
    let mut duplicate_first = false;
    let mut scenario = None;
    let mut fixture_media_port = None;
    let mut seen = HashSet::new();
    while let Some(flag) = args.next() {
        if flag != "--url" && !seen.insert(flag.clone()) {
            return Err(invalid());
        }
        match flag.as_str() {
            "--retry-failed" => retry_failed = true,
            "--duplicate-first" => duplicate_first = true,
            _ => {
                let value = args
                    .next()
                    .filter(|v| !v.is_empty() && !v.starts_with("--"))
                    .ok_or_else(invalid)?;
                let number = || {
                    value
                        .parse::<u64>()
                        .ok()
                        .filter(|v| *v <= 3_600_000)
                        .ok_or_else(invalid)
                };
                match flag.as_str() {
                    "--root" => root = Some(PathBuf::from(value)),
                    "--url" if urls.len() < 16 => {
                        crate::download::request::validate_public_url(&value)
                            .map_err(|_| invalid())?;
                        urls.push(value);
                    }
                    "--quality" => {
                        quality = match value.as_str() {
                            "highest" => Quality::Highest,
                            "balanced" => Quality::Balanced,
                            "saver" => Quality::Saver,
                            _ => return Err(invalid()),
                        }
                    }
                    "--cancel-job" => {
                        cancel_job = Some(usize::try_from(number()?).map_err(|_| invalid())?)
                    }
                    "--cancel-after-ms" => cancel_after = Duration::from_millis(number()?),
                    "--stop-after-ms" => stop_after = Some(Duration::from_millis(number()?)),
                    "--fixture-media-port" if command == "run" => {
                        let port = number()?;
                        if !(1..=65535).contains(&port) {
                            return Err(invalid());
                        }
                        fixture_media_port = Some(port as u16);
                    }
                    "--timeout" | "--settle-timeout" => {
                        let seconds = number()?;
                        if !(1..=3600).contains(&seconds) {
                            return Err(invalid());
                        }
                        if flag == "--timeout" {
                            timeout = Duration::from_secs(seconds);
                        } else {
                            settle_timeout = Duration::from_secs(seconds);
                        }
                    }
                    "--case"
                        if matches!(
                            value.as_str(),
                            "success" | "retry" | "cancel" | "stop" | "held" | "timeout"
                        ) =>
                    {
                        scenario = Some(value)
                    }
                    _ => return Err(invalid()),
                }
            }
        }
    }
    if command == "scenario" {
        if scenario.is_none()
            || seen
                .iter()
                .any(|f| !matches!(f.as_str(), "--root" | "--case"))
            || !urls.is_empty()
        {
            return Err(invalid());
        }
        urls.push("https://example.invalid/ameow-offline-fixture".into());
        match scenario.as_deref() {
            Some("retry") => retry_failed = true,
            Some("cancel") => {
                cancel_job = Some(1);
                cancel_after = Duration::from_millis(150);
            }
            Some("stop") => stop_after = Some(Duration::from_millis(150)),
            Some("held") => {
                cancel_job = Some(1);
                cancel_after = Duration::from_millis(150);
                stop_after = Some(Duration::from_millis(300));
                settle_timeout = Duration::from_secs(1);
            }
            Some("timeout") => timeout = Duration::from_millis(150),
            _ => duplicate_first = true,
        }
    } else if scenario.is_some() || urls.is_empty() {
        return Err(invalid());
    }
    if cancel_job.is_some_and(|n| n == 0 || n > urls.len())
        || seen.contains("--cancel-after-ms") && cancel_job.is_none()
        || fixture_media_port.is_some()
            && urls
                .iter()
                .any(|url| !crate::download::network::FIXTURE_MEDIA_URLS.contains(&url.as_str()))
    {
        return Err(invalid());
    }
    Ok(Options {
        root: root.ok_or_else(invalid)?,
        urls,
        quality,
        cancel_job,
        cancel_after,
        stop_after,
        timeout,
        settle_timeout,
        retry_failed,
        duplicate_first,
        scenario,
        fixture_media_port,
    })
}

fn prepare_root(path: &Path) -> Result<PathBuf, ControlError> {
    let path = super::future_path(path)?;
    // Check the same production overlap boundary before creating anything.
    for production in [
        runtime::RuntimeManager::default_root(),
        crate::app_update::default_install_root(),
    ] {
        let production =
            super::future_path(&production.map_err(|_| {
                error("E_INSTANCE_ROOT", "Cannot resolve production data boundary")
            })?)?;
        if super::path_contains(&path, &production) || super::path_contains(&production, &path) {
            return Err(error(
                "E_INSTANCE_ROOT",
                "Development root overlaps production data or installation",
            ));
        }
    }
    if path.exists() {
        for item in io_result(fs::read_dir(&path))? {
            let item = io_result(item)?;
            if item.file_name() != "runtime" || !io_result(item.file_type())?.is_dir() {
                return Err(error(
                    "E_DEV_ROOT_USED",
                    "Use a fresh root; only an owned copy of runtime/ may be preseeded",
                ));
            }
        }
    }
    let root = super::isolated_root(&[
        "--instance-root".into(),
        path.to_string_lossy().into_owned(),
    ])?
    .unwrap();
    // Exclusive evidence directory is also the run claim; it is never removed on failure.
    io_result(fs::create_dir(root.join("evidence")))?;
    Ok(root)
}

struct Evidence {
    root: PathBuf,
    instance: String,
    identity: Value,
    log: File,
    started: Instant,
    count: usize,
    truncated: bool,
    requests: HashMap<u64, String>,
    verified_versions: Vec<(String, String)>,
}
impl Evidence {
    fn new(root: PathBuf, options: &Options) -> Result<Self, ControlError> {
        let instance = nonce()?;
        let exe = io_result(std::env::current_exe())?;
        let exe_hash = runtime::hash(io_result(File::open(exe))?)
            .map_err(|_| error("E_DEV_IDENTITY", "Cannot hash executable"))?;
        let identity = json!({"protocol_version":1,"instance_id":instance,"pid":std::process::id(),
            "build":{"version":env!("CARGO_PKG_VERSION"),"source_commit":env!("AMEOW_DEV_BUILD_COMMIT"),"source_sha256":env!("AMEOW_DEV_BUILD_SOURCE_SHA256"),"exe_sha256":exe_hash,"target":crate::app_update::TARGET,"dev_tools":true},
            "mode":if options.scenario.is_some() {"synthetic-adapter-core"} else {"production-adapter"},
            "scenario":options.scenario,"transport":if options.scenario.is_some(){"offline"} else if options.fixture_media_port.is_some(){"fixed-local-fixture"}else{"system-route"},
            "gui":false,"owner":"finite-cli","task_limit":16,
            "timeout_ms":options.timeout.as_millis(),"settle_timeout_ms":options.settle_timeout.as_millis()});
        io_result(fs::write(
            root.join("evidence/identity.json"),
            serde_json::to_vec_pretty(&identity).unwrap(),
        ))?;
        let log = io_result(
            OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(root.join("evidence/events.jsonl")),
        )?;
        Ok(Self {
            root,
            instance,
            identity,
            log,
            started: Instant::now(),
            count: 0,
            truncated: false,
            requests: HashMap::new(),
            verified_versions: Vec::new(),
        })
    }
    fn event(&mut self, kind: &str, value: Value) -> Result<(), ControlError> {
        if self.count >= 2048 {
            self.truncated = true;
            return Ok(());
        }
        let record = json!({"seq":self.count+1,"elapsed_ms":self.started.elapsed().as_millis(),"instance_id":self.instance,"event":kind,"value":value});
        io_result(writeln!(self.log, "{record}"))?;
        io_result(self.log.flush())?;
        self.count += 1;
        Ok(())
    }
    fn mutation(
        &mut self,
        kind: &str,
        job: Option<u64>,
        value: Value,
    ) -> Result<String, ControlError> {
        let request = nonce()?;
        self.event(kind, json!({"request_id":request,"task_id":job.map(|j| format!("{}:{j}",self.instance)),"result":value}))?;
        Ok(request)
    }
    fn state(&self, snapshot: &QueueSnapshot) -> Value {
        json!({"revision":snapshot.revision,"stopping":snapshot.stopping,"stopped":snapshot.stopped,
            "active_slots":snapshot.active_slots,"unfinished":snapshot.unfinished,"preparing":snapshot.preparing,
            "preparation_phase":snapshot.preparation.phase,"preparation_held":snapshot.preparation_held,
            "preparation_owner_lost":snapshot.preparation_owner_lost,"runtime_update_phase":snapshot.runtime_update.phase,
            "preparation_failure":snapshot.preparation.failure.as_ref().map(|f|json!({"component":f.component,"stage":f.stage,"category":f.category,"http_status":f.http_status})),
            "verified_runtime_versions":snapshot.verified_runtime_versions,
            "tasks":snapshot.jobs.iter().map(|j| json!({"task_id":format!("{}:{}",self.instance,j.job_id),"request_id":self.requests.get(&j.job_id),
                "job_id":j.job_id,"revision":j.revision,"attempt":j.attempt,"phase":j.phase,"failure":j.failure.as_ref().map(|f|json!({"code":f.code,"stage":f.stage})),
                "slot_owned":j.slot_owned,"resources_released":j.resources_released,"terminal_count":j.terminal_count,"start_order":j.start_order,
                "progress":j.transfer_progress})).collect::<Vec<_>>()})
    }
    fn finish(
        &mut self,
        snapshot: &QueueSnapshot,
        status: i32,
        reason: Option<&str>,
    ) -> Result<Value, ControlError> {
        let files = snapshot
            .jobs
            .iter()
            .flat_map(|j| job_files(j).into_iter().map(move |f| (j.job_id, f)))
            .collect::<Vec<_>>();
        let mut checked = Vec::new();
        for (job, (path, bytes, sha256)) in files.iter().take(1024) {
            let relative = path.strip_prefix(&self.root).ok().filter(|_| {
                path.canonicalize()
                    .ok()
                    .is_some_and(|p| p.starts_with(&self.root))
            });
            let actual = relative.and_then(|_| {
                fs::metadata(path)
                    .ok()
                    .filter(|m| m.is_file())
                    .map(|m| m.len())
            });
            let actual_hash = relative
                .and_then(|_| File::open(path).ok())
                .and_then(|f| runtime::hash(f).ok());
            checked.push(json!({"task_id":format!("{}:{job}",self.instance),"path":relative,"bytes":bytes,"sha256":sha256,
                "verified_on_disk":actual==Some(*bytes) && actual_hash.as_ref().is_some_and(|h| h.eq_ignore_ascii_case(sha256))}));
        }
        let file_error = checked.iter().any(|f| f["verified_on_disk"] != true);
        let status = if status == 0 && (file_error || files.is_empty() || files.len() > 1024) {
            4
        } else {
            status
        };
        let result = json!({"protocol_version":1,"ok":status==0,"exit_code":status,"error":reason.map(|r|json!({"code":r})),
            "identity":self.identity,"state":self.state(snapshot),"verified_runtime_versions":self.verified_versions,"files":checked,"files_truncated":files.len()>1024,
            "file_verification_failed":file_error,"events_truncated":self.truncated,"elapsed_ms":self.started.elapsed().as_millis(),
            "owner_settled":snapshot.stopped && snapshot.active_slots==0 && snapshot.jobs.iter().all(|j|j.resources_released),
            "evidence":{"identity":"evidence/identity.json","events":"evidence/events.jsonl","result":"evidence/result.json"}});
        self.save(&result)?;
        Ok(result)
    }
    fn save(&self, result: &Value) -> Result<(), ControlError> {
        io_result(fs::write(
            self.root.join("evidence/result.json"),
            serde_json::to_vec_pretty(result).unwrap(),
        ))
    }
}

fn job_files(job: &JobSnapshot) -> Vec<(PathBuf, u64, String)> {
    let mut files = Vec::new();
    if let Some(file) = &job.delivered {
        files.push((file.path.clone(), file.bytes, file.sha256.clone()));
    }
    if let Some(collection) = &job.collection {
        for file in &collection.files {
            files.push((
                file.delivered.path.clone(),
                file.delivered.bytes,
                file.delivered.sha256.clone(),
            ));
        }
    }
    files
}
fn unsettled(snapshot: &QueueSnapshot) -> Option<&'static str> {
    if snapshot.preparation_owner_lost {
        Some("E_OWNER_LOST")
    } else if snapshot.preparation_held || snapshot.jobs.iter().any(|j| j.phase == JobPhase::Held) {
        Some("E_CLEANUP_UNCONFIRMED")
    } else {
        None
    }
}
fn outcome(snapshot: &QueueSnapshot, jobs: &[u64]) -> i32 {
    if !snapshot.stopped
        || snapshot.active_slots != 0
        || snapshot.jobs.iter().any(|j| !j.resources_released)
    {
        return 6;
    }
    let phases: Vec<_> = jobs
        .iter()
        .filter_map(|id| {
            snapshot
                .jobs
                .iter()
                .find(|j| j.job_id == *id)
                .map(|j| j.phase.clone())
        })
        .collect();
    if phases.len() != jobs.len() || phases.contains(&JobPhase::Failure) {
        4
    } else if phases.contains(&JobPhase::Partial) {
        3
    } else if phases.contains(&JobPhase::Cancelled) {
        5
    } else if phases.iter().all(|p| *p == JobPhase::Success) {
        0
    } else {
        6
    }
}

fn execute(options: Options) -> Result<Value, ControlError> {
    let root = prepare_root(&options.root)?;
    let mut evidence = Evidence::new(root.clone(), &options)?;
    evidence.event("started", evidence.identity.clone())?;
    let defaults = Settings {
        shortcut: Default::default(),
        quality: options.quality,
        output_dir: root.join("output"),
        theme: Default::default(),
        language: Default::default(),
        tray_icon: Default::default(),
    };
    let backend = if let Some(case) = &options.scenario {
        DownloadCoordinator::new(
            fixture::services(root.join("runtime"), case),
            root.join("settings.json"),
            defaults.clone(),
        )
    } else {
        composition::download_coordinator(
            root.join("runtime"),
            root.join("settings.json"),
            defaults.clone(),
        )
    };
    let backend = match backend {
        Ok(backend) => backend,
        Err(_) => {
            let result = json!({"protocol_version":1,"ok":false,"exit_code":4,"identity":evidence.identity,"error":{"code":"E_DEV_START"},"owner_settled":false});
            evidence.save(&result)?;
            return Ok(result);
        }
    };
    let mut ids = Vec::new();
    let work = (|| -> Result<(i32, Option<&'static str>), ControlError> {
        backend
            .save_settings(defaults)
            .map_err(|_| error("E_DEV_SETTINGS", "Cannot persist isolated settings"))?;
        for url in &options.urls {
            let id = backend
                .submit(url.clone())
                .map_err(|_| error("E_DEV_SUBMIT", "Queue rejected development input"))?;
            let request =
                evidence.mutation("submitted", Some(id), json!({"input_index":ids.len()+1}))?;
            evidence.requests.insert(id, request);
            ids.push(id);
        }
        if options.duplicate_first {
            let duplicate = backend.submit(options.urls[0].clone());
            evidence.mutation(
                "duplicate",
                Some(ids[0]),
                json!({"rejected":duplicate.is_err()}),
            )?;
            if duplicate.is_ok() {
                return Err(error("E_DEV_DUPLICATE", "Duplicate was accepted"));
            }
        }
        let start = Instant::now();
        let mut revision = None;
        let mut cancelled = false;
        let mut stopping = None;
        let mut retried = HashSet::new();
        let mut reason = None;
        let mut observed_unsettled = None;
        loop {
            let view = backend.snapshot();
            if !view.verified_runtime_versions.is_empty() {
                evidence.verified_versions = view.verified_runtime_versions.clone();
            }
            if revision != Some(view.revision) {
                evidence.event("state", evidence.state(&view))?;
                revision = Some(view.revision);
            }
            let held = unsettled(&view);
            if held != observed_unsettled {
                if let Some(code) = held {
                    eprintln!(
                        "{code}: cleanup is unconfirmed; see evidence/events.jsonl (instance {})",
                        evidence.instance
                    );
                    evidence.event(
                        "cleanup_unconfirmed",
                        json!({"code":code,"state":evidence.state(&view)}),
                    )?;
                }
                observed_unsettled = held;
            }
            if view.stopped {
                return Ok((
                    match reason {
                        Some("E_RUN_TIMEOUT") => 6,
                        Some(_) => 4,
                        None => outcome(&view, &ids),
                    },
                    reason,
                ));
            }
            if let Some(stopped_at) = stopping {
                if Instant::now().duration_since(stopped_at) >= options.settle_timeout {
                    return Ok((6, Some(held.unwrap_or("E_STOP_TIMEOUT"))));
                }
            } else {
                if !cancelled
                    && options.cancel_job.is_some()
                    && start.elapsed() >= options.cancel_after
                {
                    let id = ids[options.cancel_job.unwrap() - 1];
                    let applied = backend.cancel(id);
                    evidence.mutation(
                        "cancel",
                        Some(id),
                        json!({"applied":applied,"settlement_confirmed":false}),
                    )?;
                    cancelled = true;
                }
                let timed_out = start.elapsed() >= options.timeout;
                let explicit_stop = options.stop_after.is_some_and(|t| start.elapsed() >= t);
                let mut retry_queued = false;
                if options.retry_failed && !timed_out && !explicit_stop {
                    for id in &mut ids {
                        if view.jobs.iter().any(|j| {
                            j.job_id == *id
                                && j.resources_released
                                && matches!(j.phase, JobPhase::Failure | JobPhase::Partial)
                        }) && retried.insert(*id)
                        {
                            let prior = *id;
                            let next = backend
                                .retry(prior)
                                .map_err(|_| error("E_DEV_RETRY", "Queue rejected retry"))?;
                            let request = evidence.mutation(
                                "retry",
                                Some(next),
                                json!({"previous_task_id":format!("{}:{prior}",evidence.instance)}),
                            )?;
                            evidence.requests.insert(next, request);
                            retried.insert(next);
                            *id = next;
                            retry_queued = true;
                        }
                    }
                }
                // Gallery retries keep their ID; this snapshot still describes the previous attempt.
                let done = !retry_queued
                    && ids.iter().all(|id| {
                        view.jobs
                            .iter()
                            .any(|j| j.job_id == *id && j.phase.terminal() && j.resources_released)
                    });
                let preparation_failed =
                    view.preparation.phase == PreparationPhase::Failed && !view.preparing;
                if timed_out || explicit_stop || done || preparation_failed {
                    if timed_out {
                        reason = Some("E_RUN_TIMEOUT");
                    } else if preparation_failed {
                        reason = Some("E_PREPARATION_FAILED");
                    }
                    backend.stop();
                    evidence.mutation("stop",None,json!({"reason":reason.unwrap_or(if explicit_stop {"requested"}else{"tasks_settled"}),"settlement_confirmed":false}))?;
                    stopping = Some(Instant::now());
                }
            }
            thread::sleep(Duration::from_millis(25));
        }
    })();
    // Even failures in evidence writing or command admission must request the real Stop.
    backend.stop();
    let (mut status, mut reason) = match work {
        Ok(value) => value,
        Err(ref error) => {
            eprintln!("{}: {}", error.code, error.message);
            (4, Some("E_DEV_EXECUTION"))
        }
    };
    if work.is_err() {
        let until = Instant::now() + options.settle_timeout;
        while !backend.snapshot().stopped && Instant::now() < until {
            thread::sleep(Duration::from_millis(25));
        }
    }
    let final_view = backend.snapshot();
    if !final_view.stopped {
        status = 6;
        reason = Some(unsettled(&final_view).unwrap_or("E_STOP_TIMEOUT"));
    }
    evidence.finish(&final_view, status, reason)
}

pub(super) fn run(args: Vec<String>) -> i32 {
    if args == ["--help"] || args == ["help"] {
        println!(
            "{}",
            json!({"protocol_version":1,"ok":true,"result":{"help":HELP}})
        );
        return 0;
    }
    match parse(args).and_then(execute) {
        Ok(result) => {
            let code = result["exit_code"].as_i64().unwrap_or(4) as i32;
            println!("{result}");
            code
        }
        Err(error) => {
            let code = if error.code == "E_INVALID_ARGUMENT" {
                2
            } else {
                9
            };
            println!(
                "{}",
                json!({"protocol_version":1,"ok":false,"exit_code":code,"error":error})
            );
            code
        }
    }
}
