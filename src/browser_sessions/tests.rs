use super::*;
use std::fs;
fn cookie(domain: &str, value: &str) -> Cookie {
    Cookie {
        domain: domain.into(),
        path: "/account".into(),
        name: "synthetic_session".into(),
        value: value.into(),
        secure: true,
        http_only: true,
        host_only: false,
        expires: None,
    }
}
fn authorize(grant: &str, replaces: Option<&str>, value: &str) -> Operation {
    Operation::Authorize {
        site: "example.com".into(),
        source_id: "a".repeat(32),
        source_name: "Microsoft Edge · isolated".into(),
        grant_id: grant.into(),
        replaces: replaces.map(str::to_owned),
        cookies: vec![cookie(".example.com", value)],
        skipped_partitioned: 1,
    }
}
#[test]
fn site_boundary_and_cookie_injection_are_rejected() {
    assert!(!valid_site("co.uk"));
    assert!(!valid_site("github.io"));
    assert!(valid_site("example.co.uk"));
    assert!(valid_site("one.github.io"));
    assert!(within("api.example.com", "example.com"));
    assert!(!within("evilexample.com", "example.com"));
    assert!(!within("example.com.evil.net", "example.com"));
    for domain in [".evil.net", ".evilexample.com", ".com"] {
        assert!(cookie(domain, "synthetic").validate("example.com").is_err());
    }
    assert!(
        cookie(".example.com", "bad\njar\trow")
            .validate("example.com")
            .is_err()
    );
}
#[test]
fn revoke_before_initial_authorize_prevents_late_consent_restore() -> Result<()> {
    let root = tempfile::tempdir().unwrap();
    let store = Store::new(root.path());
    let grant = "d".repeat(32);
    store.apply(Operation::Revoke {
        site: "example.com".into(),
        source_id: "a".repeat(32),
        grant_id: grant.clone(),
    })?;
    assert_eq!(
        store
            .apply(authorize(&grant, None, "late_session"))
            .unwrap_err(),
        "E_SESSION_REVOKED"
    );
    assert!(store.list()?.is_empty());
    Ok(())
}
#[test]
fn protected_offline_store_snapshot_replacement_and_revocation() -> Result<()> {
    let root = tempfile::tempdir().unwrap();
    let store = Store::new(root.path());
    let work = tempfile::tempdir().unwrap();
    assert!(
        store
            .snapshot("https://example.com/page", work.path())?
            .is_none()
    );
    let first = "b".repeat(32);
    let second = "c".repeat(32);
    let secret = "SYNTHETIC_ONLY_9b371_cookie";
    store.apply(authorize(&first, None, secret))?;
    let bytes = fs::read(root.path().join("browser-sessions/sessions.bin")).unwrap();
    assert!(!bytes.windows(secret.len()).any(|w| w == secret.as_bytes()));
    let attempt = store
        .snapshot("https://api.example.com/page", work.path())?
        .unwrap();
    let jar = fs::read_to_string(&attempt.path).unwrap();
    assert!(jar.contains("#HttpOnly_.example.com\tTRUE\t/account\tTRUE\t0\tsynthetic_session\t"));
    let sync = |sequence, value| Operation::Sync {
        site: "example.com".into(),
        source_id: "a".repeat(32),
        grant_id: first.clone(),
        sequence,
        cookies: vec![cookie(".example.com", value)],
        skipped_partitioned: 0,
    };
    store.apply(sync(2, "updated_session"))?;
    assert_eq!(fs::read_to_string(&attempt.path).unwrap(), jar);
    assert!(attempt.valid());
    assert_eq!(
        store.apply(sync(1, "stale")).unwrap_err(),
        "E_SESSION_STALE"
    );
    assert_eq!(
        store.apply(authorize(&second, None, "other")).unwrap_err(),
        "E_SESSION_SOURCE_CHANGED"
    );
    store.apply(authorize(&second, Some(&first), "replacement"))?;
    assert!(!attempt.valid());
    assert_eq!(
        store.apply(sync(3, "stale")).unwrap_err(),
        "E_SESSION_REVOKED"
    );
    assert_eq!(
        store
            .apply(authorize(&first, Some(&second), secret))
            .unwrap_err(),
        "E_SESSION_REVOKED"
    );
    store.remove("example.com", &second)?;
    assert!(store.list()?.is_empty());
    assert_eq!(
        store.apply(authorize(&second, None, secret)).unwrap_err(),
        "E_SESSION_REVOKED"
    );
    assert_eq!(fs::read_to_string(&attempt.path).unwrap(), jar);
    Ok(())
}
#[test]
fn native_frames_are_bounded_and_do_not_echo_credentials() {
    let root = tempfile::tempdir().unwrap();
    let message = serde_json::to_vec(&native::Message {
        version: 1,
        request_id: "fixture-1".into(),
        operation: authorize(&"b".repeat(32), None, "SYNTHETIC_SECRET"),
    })
    .unwrap();
    let bytes = [(message.len() as u32).to_le_bytes().as_slice(), &message].concat();
    let mut output = Vec::new();
    native::serve(&mut std::io::Cursor::new(bytes), &mut output, root.path()).unwrap();
    assert!(!String::from_utf8_lossy(&output).contains("SYNTHETIC_SECRET"));
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&output[4..]).unwrap()["ok"],
        true
    );
    assert!(
        native::serve(
            &mut std::io::Cursor::new((MAX_MESSAGE as u32 + 1).to_le_bytes()),
            &mut Vec::new(),
            root.path()
        )
        .is_err()
    );
}
#[test]
#[ignore = "requires this task's isolated Edge fixture; never reads a daily browser profile"]
fn native_browser_fixture_snapshot() -> Result<()> {
    let instance =
        std::env::var_os("AMEOW_BROWSER_E2E_INSTANCE").ok_or("isolated fixture root required")?;
    let root = PathBuf::from(instance);
    if fs::read(
        root.parent()
            .ok_or("fixture parent missing")?
            .join("SYNTHETIC_FIXTURE.txt"),
    )
    .ok()
    .as_deref()
        != Some(b"Ameow browser session fixture\n")
    {
        return Err("not an owned synthetic fixture".into());
    }
    let stage = std::env::var("AMEOW_BROWSER_E2E_STAGE").map_err(|_| "fixture stage required")?;
    let store = Store::new(&root.join("runtime"));
    let workspace = tempfile::tempdir().unwrap();
    let attempt = store.snapshot("https://www.example.com/fixture", workspace.path())?;
    if stage == "revoked" {
        assert!(attempt.is_none());
        return Ok(());
    }
    let attempt = attempt.ok_or("missing browser authorization")?;
    let jar = fs::read_to_string(attempt.path).map_err(|_| "snapshot unreadable")?;
    match stage.as_str() {
        "v1" => assert!(jar.contains("\tameow_synthetic\tAMEOW_SYNTHETIC_V1\n")),
        "v2" => assert!(jar.contains("\tameow_synthetic\tAMEOW_SYNTHETIC_V2\n")),
        "empty" => assert!(!jar.contains("ameow_synthetic")),
        _ => return Err("unknown synthetic stage".into()),
    }
    assert!(!jar.contains("UNAUTHORIZED_SYNTHETIC"));
    assert!(
        store
            .snapshot(
                "https://evil.net/fixture",
                tempfile::tempdir().unwrap().path()
            )?
            .is_none()
    );
    Ok(())
}
