//! Opt-in packaged-provider gate. No production plugins or download metadata.
//! Run with AMEOW_EJS_GATE_ROOT pointing at a task-owned staged asset directory.
#![cfg(windows)]

#[path = "support/ejs_job.rs"]
mod ejs_job;

use std::{
    env, fs,
    io::{Read, Seek, SeekFrom, Write},
    path::PathBuf,
};

const YTDLP_HASH: &str = "66674953FE251B89F4D08C5F0E35E0728679BD67AB3D7D05C0562AF101DD3E7A";
const DENO_HASH: &str = "E020F3E232BD16E33768DEE528E5983349C962952051CED0A5D58AD42F5D9B33";
const PLAYER_HASH: &str = "ED9A4EA0646332A6B6C973EBE5A915C62C43DB89BB2BB1A31EBA07D906EF8FF7";
const PLUGIN_HASH: &str = "1A90D4F8A566A55AC95087C19E53CF21A5EC3AF315C396308AD1F329F88AB894";
const PLUGIN: &[u8] = include_bytes!("assets/ejs_probe.py");

#[test]
fn native_sha256_known_answers() -> Result<(), String> {
    assert_eq!(
        ejs_job::sha256(&b""[..])?,
        "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855"
    );
    assert_eq!(
        ejs_job::sha256(&b"abc"[..])?,
        "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD"
    );
    Ok(())
}

#[test]
#[ignore = "requires task-owned pinned assets; mutates copies only, never executes them"]
fn tampered_identity_rejected_before_launch() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(env::var("AMEOW_EJS_GATE_ROOT")?).canonicalize()?;
    let negative = root.join(format!("preflight-negative-{}", std::process::id()));
    fs::create_dir(&negative)?;
    let mut evidence = String::new();
    for (label, original, expected) in [
        ("yt-dlp", root.join("assets/yt-dlp.exe"), YTDLP_HASH),
        ("Deno", root.join("assets/deno.exe"), DENO_HASH),
        (
            "player",
            root.join("assets/player-74edf1a3.js"),
            PLAYER_HASH,
        ),
        (
            "test-entry",
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/assets/ejs_probe.py"),
            PLUGIN_HASH,
        ),
    ] {
        evidence.push_str(&ejs_job::verify_file(label, &original, expected)?);
        let copy = negative.join(label);
        fs::copy(&original, &copy)?;
        let mut file = fs::OpenOptions::new().read(true).write(true).open(&copy)?;
        let mut first = [0_u8; 1];
        file.read_exact(&mut first)?;
        first[0] ^= 1;
        file.seek(SeekFrom::Start(0))?;
        file.write_all(&first)?;
        drop(file);
        let rejected = match ejs_job::verify_file(label, &copy, expected) {
            Err(error) if error.contains("SHA-256 mismatch") => error,
            other => return Err(format!("Tampered {label} not rejected: {other:?}").into()),
        };
        evidence.push_str(&format!("{rejected}\n"));
    }
    // This test contains no process-runner call; corrupted copies are retained as evidence.
    evidence.push_str("All four tampered copies rejected; no process launch performed.\n");
    fs::write(negative.join("rejection.txt"), &evidence)?;
    println!(
        ">>> Preflight negative evidence: {}\n{evidence}",
        negative.display()
    );
    Ok(())
}

#[test]
#[ignore = "requires hash-pinned local yt-dlp/Deno/player assets; test-only plugin"]
fn packaged_provider_success_failure_recovery() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(env::var("AMEOW_EJS_GATE_ROOT")?).canonicalize()?;
    let run = root.join(format!("run-{}", std::process::id()));
    fs::create_dir(&run)?;
    let deno = root.join("assets/deno.exe");
    let executable = root.join("assets/yt-dlp.exe");
    let player = root.join("assets/player-74edf1a3.js");
    let mut preflight = String::new();
    for (label, path, expected) in [
        ("yt-dlp", &executable, YTDLP_HASH),
        ("Deno", &deno, DENO_HASH),
        ("player", &player, PLAYER_HASH),
    ] {
        preflight.push_str(&ejs_job::verify_file(label, path, expected)?);
    }
    if ejs_job::sha256(PLUGIN)? != PLUGIN_HASH {
        return Err("preflight embedded test-entry: SHA-256 mismatch; refusing launch".into());
    }
    let plugin = run.join("plugins/local-test/yt_dlp_plugins/extractor");
    fs::create_dir_all(&plugin)?;
    fs::write(plugin.join("ejs_probe.py"), PLUGIN)?;
    preflight.push_str(&ejs_job::verify_file(
        "staged test-entry",
        &plugin.join("ejs_probe.py"),
        PLUGIN_HASH,
    )?);
    fs::write(run.join("preflight.txt"), preflight)?;
    for folder in ["home", "appdata", "localappdata", "temp", "deno-cache"] {
        fs::create_dir(run.join(folder))?;
    }
    let arguments = vec![
        "--ignore-config".into(),
        "--no-plugin-dirs".into(),
        "--plugin-dirs".into(),
        run.join("plugins").to_string_lossy().into_owned(),
        "--no-js-runtimes".into(),
        "--js-runtimes".into(),
        format!("deno:{}", deno.display()),
        "--no-cache-dir".into(),
        "--proxy".into(),
        String::new(),
        "--verbose".into(),
        "--extractor-args".into(),
        "youtube:jsc_trace=true".into(),
        "--skip-download".into(),
        "--no-playlist".into(),
        "ameow-ejs-probe:test".into(),
    ];
    let mut environment: Vec<(String, String)> = vec![
        ("SystemRoot".into(), env::var("SystemRoot")?),
        ("PATH".into(), String::new()),
        ("USERPROFILE".into(), run.join("home").display().to_string()),
        ("APPDATA".into(), run.join("appdata").display().to_string()),
        (
            "LOCALAPPDATA".into(),
            run.join("localappdata").display().to_string(),
        ),
        ("TEMP".into(), run.join("temp").display().to_string()),
        ("TMP".into(), run.join("temp").display().to_string()),
        (
            "DENO_DIR".into(),
            run.join("deno-cache").display().to_string(),
        ),
        ("DENO_NO_UPDATE_CHECK".into(), "1".into()),
        ("DENO_NO_PACKAGE_JSON".into(), "1".into()),
        (
            "AMEOW_EJS_PLAYER".into(),
            root.join("assets/player-74edf1a3.js").display().to_string(),
        ),
        ("AMEOW_EJS_DENO".into(), deno.display().to_string()),
    ];
    environment.sort_by_key(|(key, _)| key.to_uppercase());
    fs::write(
        run.join("invocation.txt"),
        format!("exe={executable:?}\nargv={arguments:#?}\nenv={environment:#?}\n"),
    )?;
    let settlement = ejs_job::run(&executable, &arguments, &environment, &run)?;
    fs::write(run.join("settlement.txt"), format!("{settlement:#?}\n"))?;
    let stdout = fs::read_to_string(run.join("stdout.log"))?;
    let stderr = fs::read_to_string(run.join("stderr.log"))?;
    println!(
        ">>> EJS evidence: {}\n{settlement:#?}\n{stdout}\n{stderr}",
        run.display()
    );
    if settlement.exit_code != 1
        || settlement.root_pid == 0
        || !settlement.membership_before_resume
        || !settlement.root_waited
        || settlement.active_processes != 0
        || !settlement.inherited_log_handles_closed
        || settlement.timed_out
        || !stdout.contains("\"event\": \"gate_result\"")
        || !stdout.contains("\"passed\": true, \"phases\": 3")
        || !stderr.contains("AMEOW_EJS_GATE_PASS_TEST_ONLY_NO_MEDIA")
        || !stderr.contains("Error running deno process (returncode: 1)")
        || !stderr.contains("SyntaxError")
        || settlement.total_processes < 4
    {
        return Err(format!(
            "Packaged-provider gate did not pass; inspect {}",
            run.display()
        )
        .into());
    }
    Ok(())
}
