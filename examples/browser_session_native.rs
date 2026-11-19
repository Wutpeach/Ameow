//! Local synthetic storage/stdio check, packaged separately for an explicit Mac GUI launch.
//! Uses the production session module and helper. It does not open a browser or download.
use ameow_next::browser_sessions::{
    self as sessions, Cookie, Operation, Store,
    native::{self, Message},
};
use serde_json::{Value, json};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

fn exchange(host: &Path, root: &Path, operation: Operation) -> Result<(), String> {
    let bytes = serde_json::to_vec(&Message {
        version: 1,
        request_id: "synthetic-local-check".into(),
        operation,
    })
    .map_err(|_| "E_CHECK_PROTOCOL")?;
    let mut child = Command::new(host)
        .args([native::ORIGIN, "--instance-root"])
        .arg(root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "E_CHECK_HOST_START")?;
    let mut input = child.stdin.take().ok_or("E_CHECK_STDIN")?;
    input
        .write_all(&(bytes.len() as u32).to_le_bytes())
        .and_then(|_| input.write_all(&bytes))
        .map_err(|_| "E_CHECK_STDIN")?;
    drop(input);
    let output = child.wait_with_output().map_err(|_| "E_CHECK_HOST_WAIT")?;
    if !output.status.success() || output.stdout.len() < 4 {
        return Err("E_CHECK_HOST_EXIT".into());
    }
    let response: Value =
        serde_json::from_slice(&output.stdout[4..]).map_err(|_| "E_CHECK_PROTOCOL")?;
    if response["ok"] != true {
        return Err(response["error"]
            .as_str()
            .unwrap_or("E_CHECK_PROTOCOL")
            .to_owned());
    }
    Ok(())
}
fn run(
    host: &Path,
    root: &Path,
    grant: &str,
    checks: &mut Vec<&'static str>,
) -> Result<(), String> {
    let cookie = |value: &str| Cookie {
        domain: ".example.com".into(),
        path: "/".into(),
        name: "ameow_synthetic".into(),
        value: value.into(),
        secure: true,
        http_only: true,
        host_only: false,
        expires: None,
    };
    exchange(
        host,
        root,
        Operation::Authorize {
            site: "example.com".into(),
            source_id: "a".repeat(32),
            source_name: "Local synthetic check".into(),
            grant_id: grant.into(),
            replaces: None,
            cookies: vec![cookie("AMEOW_SYNTHETIC_LOCAL_V1")],
            skipped_partitioned: 0,
        },
    )?;
    checks.push("product native helper created the encrypted test session");
    let store = Store::new(&root.join("runtime"));
    if store.list()?.len() != 1 {
        return Err("E_CHECK_LIST".into());
    }
    checks.push(
        "checker process read the same protected store through the production session module",
    );
    let workspace = tempfile::tempdir_in(root).map_err(|_| "E_CHECK_WORKSPACE")?;
    let first = store
        .snapshot("https://www.example.com/test", workspace.path())?
        .ok_or("E_CHECK_SNAPSHOT")?;
    if !fs::read(&first.path)
        .map_err(|_| "E_CHECK_READ")?
        .windows(24)
        .any(|v| v == b"AMEOW_SYNTHETIC_LOCAL_V1")
    {
        return Err("E_CHECK_COOKIE".into());
    }
    exchange(
        host,
        root,
        Operation::Sync {
            site: "example.com".into(),
            source_id: "a".repeat(32),
            grant_id: grant.into(),
            sequence: 1,
            cookies: vec![cookie("AMEOW_SYNTHETIC_LOCAL_V2")],
            skipped_partitioned: 0,
        },
    )?;
    let second_work = tempfile::tempdir_in(root).map_err(|_| "E_CHECK_WORKSPACE")?;
    let second = store
        .snapshot("https://example.com/test", second_work.path())?
        .ok_or("E_CHECK_SNAPSHOT")?;
    if fs::read(&first.path).map_err(|_| "E_CHECK_READ")?
        == fs::read(&second.path).map_err(|_| "E_CHECK_READ")?
    {
        return Err("E_CHECK_REFRESH".into());
    }
    checks.push("native refresh reached a new snapshot while the old snapshot stayed fixed");
    exchange(
        host,
        root,
        Operation::Revoke {
            site: "example.com".into(),
            source_id: "a".repeat(32),
            grant_id: grant.into(),
        },
    )?;
    if first.valid() || second.valid() || !store.list()?.is_empty() {
        return Err("E_CHECK_REVOKE".into());
    }
    checks.push("revocation invalidated both authorization leases");
    Ok(())
}
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let value = |flag: &str| {
        args.iter()
            .position(|a| a == flag)
            .and_then(|i| args.get(i + 1))
            .map(PathBuf::from)
    };
    let executable = std::env::current_exe().expect("checker executable");
    let parent = executable.parent().expect("checker directory");
    let base = value("--root").unwrap_or_else(|| {
        parent
            .parent()
            .and_then(Path::parent)
            .and_then(Path::parent)
            .unwrap()
            .join("session-check-results")
    });
    fs::create_dir_all(&base).expect("checker result directory");
    let root = base.join("validation-instance");
    if !root.exists() {
        fs::create_dir(&root).expect("owned checker run directory");
        fs::write(
            root.join("SYNTHETIC_FIXTURE.txt"),
            b"Ameow local synthetic session check\n",
        )
        .expect("fixture marker");
    } else {
        assert_eq!(
            fs::read(root.join("SYNTHETIC_FIXTURE.txt")).expect("owned fixture marker"),
            b"Ameow local synthetic session check\n"
        );
    }
    let host = value("--host").unwrap_or_else(|| {
        parent.join(if cfg!(windows) {
            "ameow-browser-host.exe"
        } else {
            "ameow-browser-host"
        })
    });
    let grant = sessions::id().expect("synthetic grant");
    let mut checks = Vec::new();
    let result = run(&host, &root, &grant, &mut checks);
    let revoked = exchange(
        &host,
        &root,
        Operation::Revoke {
            site: "example.com".into(),
            source_id: "a".repeat(32),
            grant_id: grant,
        },
    )
    .is_ok();
    let cleanup = if revoked {
        cleanup(&root)
    } else {
        Err("E_CHECK_CLEANUP_REVOKE_NOT_CONFIRMED".into())
    };
    let directory = root.join("runtime/browser-sessions");
    use sha2::{Digest, Sha256};
    let report = json!({"schema":1,"fixture":true,"result":if result.is_ok(){"PASS"}else{"FAIL"},"error":result.err(),"checks":checks,
        "coverage":"production session module and native helper in a GUI-launchable synthetic bundle; does not exercise the full GPUI desktop or browser consent", "root":root,"ui_reporting_enabled":!args.iter().any(|a|a=="--no-ui"),
        "executable":executable,"executable_sha256":ameow_next::download::runtime::hash(fs::File::open(&executable).unwrap()).unwrap(),
        "helper":host,"helper_sha256":fs::File::open(&host).ok().and_then(|f|ameow_next::download::runtime::hash(f).ok()),
        "keychain_service":"org.ameow.browser-sessions","keychain_account":format!("{:x}",Sha256::digest(directory.as_os_str().as_encoded_bytes())),
        "keychain_ui_policy":"default interaction policy; no unlock/reset or global ACL operation", "cleanup":cleanup});
    let path = base.join("latest-result.json");
    fs::write(&path, serde_json::to_vec_pretty(&report).unwrap()).expect("write safe report");
    println!("{}", serde_json::to_string(&report).unwrap());
    #[cfg(target_os = "macos")]
    if !args.iter().any(|a| a == "--no-ui") {
        let _ = Command::new("/usr/bin/osascript").args(["-e", "display dialog \"验证结果已保存。请将 latest-result.json 交给任务来源。\" with title \"Ameow Session Check\" buttons {\"好\"} default button \"好\""]).status();
        let _ = Command::new("/usr/bin/open").arg("-R").arg(path).status();
    }
    if report["result"] != "PASS" {
        std::process::exit(1);
    }
}
fn cleanup(root: &Path) -> Result<(), String> {
    let directory = root.join("runtime/browser-sessions");
    if !Store::new(&root.join("runtime")).list()?.is_empty() {
        return Err("E_CHECK_CLEANUP_NONEMPTY".into());
    }
    #[cfg(target_os = "macos")]
    delete_test_key(&directory)?;
    for name in ["sessions.bin", "store.lock"] {
        fs::remove_file(directory.join(name)).map_err(|_| "E_CHECK_CLEANUP_FILE")?;
    }
    Ok(())
}
#[cfg(target_os = "macos")]
fn delete_test_key(directory: &Path) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    use std::{
        ffi::{CString, c_char, c_void},
        ptr,
    };
    type Ref = *const c_void;
    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFStringCreateWithCString(a: Ref, s: *const c_char, e: u32) -> Ref;
        fn CFDictionaryCreate(
            a: Ref,
            k: *const Ref,
            v: *const Ref,
            n: isize,
            kc: Ref,
            vc: Ref,
        ) -> Ref;
        fn CFRelease(v: Ref);
    }
    #[link(name = "Security", kind = "framework")]
    unsafe extern "C" {
        fn SecItemDelete(q: Ref) -> i32;
        static kSecClass: Ref;
        static kSecClassGenericPassword: Ref;
        static kSecAttrService: Ref;
        static kSecAttrAccount: Ref;
    }
    let account = CString::new(format!(
        "{:x}",
        Sha256::digest(directory.as_os_str().as_encoded_bytes())
    ))
    .unwrap();
    unsafe {
        let service = CFStringCreateWithCString(
            ptr::null(),
            c"org.ameow.browser-sessions".as_ptr(),
            0x08000100,
        );
        let account = CFStringCreateWithCString(ptr::null(), account.as_ptr(), 0x08000100);
        let keys = [kSecClass, kSecAttrService, kSecAttrAccount];
        let values = [kSecClassGenericPassword, service, account];
        let query = CFDictionaryCreate(
            ptr::null(),
            keys.as_ptr(),
            values.as_ptr(),
            3,
            ptr::null(),
            ptr::null(),
        );
        let result = SecItemDelete(query);
        CFRelease(query);
        CFRelease(account);
        CFRelease(service);
        if matches!(result, 0 | -25300) {
            Ok(())
        } else {
            Err(format!("E_CHECK_CLEANUP_KEYCHAIN_{result}"))
        }
    }
}
