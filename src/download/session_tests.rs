//! Tests the real Adapter recipes with path-only tool fixtures, not media delivery.
use super::{
    adapter::ExecutionContext,
    adapters::{gallery_dl, yt_dlp},
    contract::ExecutionRequest,
    process_supervisor::Control,
    request::{Accepted, DownloadIntent, Quality},
    runtime::{RuntimeManager, TrustedRuntimeRequirements},
};
use crate::browser_sessions::{Cookie, Operation, Store};
use std::{fs, sync::Arc};
#[test]
fn both_native_adapters_share_the_frozen_jar_and_keep_anonymous_arguments() -> Result<(), String> {
    let root = tempfile::tempdir().unwrap();
    let work = tempfile::tempdir().unwrap();
    let store = Store::new(root.path());
    let source = "a".repeat(32);
    let grant = "b".repeat(32);
    let cookie = |value: &str| Cookie {
        domain: ".example.com".into(),
        path: "/".into(),
        name: "synthetic".into(),
        value: value.into(),
        secure: true,
        http_only: true,
        host_only: false,
        expires: None,
    };
    store.apply(Operation::Authorize {
        site: "example.com".into(),
        source_id: source.clone(),
        source_name: "Isolated Edge".into(),
        grant_id: grant.clone(),
        replaces: None,
        cookies: vec![cookie("SYNTHETIC_V1")],
        skipped_partitioned: 0,
    })?;
    let auth = store
        .snapshot("https://example.com/work", work.path())?
        .unwrap();
    let control = Control::default();
    let empty = TrustedRuntimeRequirements::empty();
    let mut lease = RuntimeManager::new(root.path().join("tools")).prepare(
        &empty,
        &control,
        Arc::new(|_| {}),
        |_| {},
    )?;
    // No fake executable is launched. The unit only observes production argument construction.
    for name in ["deno.exe", "ffmpeg.exe"] {
        Arc::get_mut(&mut lease)
            .unwrap()
            .files
            .insert(name.into(), root.path().join(name));
    }
    let requirements = TrustedRuntimeRequirements::compiled(
        &[("deno.exe", &["--version"]), ("ffmpeg.exe", &["-version"])],
        &[],
    );
    let context = ExecutionContext {
        media_observations: &Default::default(),
        authentication: Some(&auth),
        workspace: work.path(),
        lease: &lease,
        requirements: &requirements,
        control: &control,
        observer: Arc::new(|_| {}),
        admission: Arc::new(|_| Ok(())),
        events: Arc::new(|_| {}),
    };
    let request = ExecutionRequest {
        accepted: Accepted::new(DownloadIntent { clip: None,
            url: "https://example.com/work".into(),
            quality: Quality::Highest,
            output_dir: root.path().into(),
        })?,
        resume: None,
    };
    let observed = Arc::new(std::sync::Mutex::new(Vec::new()));
    let captured = observed.clone();
    let protected = ExecutionContext { admission: Arc::new(move |proof| { captured.lock().unwrap().push(proof.identity.clone()); Ok(()) }), ..context };
    let raw = yt_dlp::identity::proof(&request.accepted, &serde_json::json!({"title":"clip SYNTHETIC_V1 episode"}))?;
    protected.admit(&raw).map_err(|_| "admission failed")?;
    let public = protected.public_identity(&raw.identity)?;
    assert_eq!(observed.lock().unwrap()[0].title, "clip [redacted] episode");
    assert_eq!(public.title, "clip [redacted] episode");
    assert!(!super::output::media_basename(&public.title, &public.id, &Default::default()).contains("SYNTHETIC"));
    let context = protected;
    let resolve = yt_dlp::engine_args(&context, &super::network::Route::Direct, Quality::Highest)?;
    store.apply(Operation::Sync {
        site: "example.com".into(),
        source_id: source,
        grant_id: grant,
        sequence: 1,
        cookies: vec![cookie("SYNTHETIC_V2")],
        skipped_partitioned: 0,
    })?;
    let transfer = yt_dlp::engine_args(&context, &super::network::Route::Direct, Quality::Highest)?;
    assert_eq!(resolve, transfer);
    for args in [resolve, gallery_dl::engine_args(&context, &request, &super::network::Route::Direct)] {
        assert!(args.windows(2).any(|p| p == auth.arguments()));
        assert!(!args.join(" ").contains("SYNTHETIC"));
        assert!(
            args.iter()
                .any(|p| p == "--ignore-config" || p == "--config-ignore")
        );
        assert!(
            !args
                .iter()
                .any(|p| p == "--cookies-from-browser" || p == "--add-header")
        );
    }
    assert!(
        fs::read_to_string(&auth.path)
            .unwrap()
            .contains("SYNTHETIC_V1")
    );
    context.write_evidence(
        "sensitive-stderr.log",
        b"Cookie: SYNTHETIC_V1; Authorization: SYNTHETIC_V2",
    )?;
    assert!(
        !fs::read_to_string(work.path().join("sensitive-stderr.log"))
            .unwrap()
            .contains("SYNTHETIC")
    );
    let anonymous = ExecutionContext {
        authentication: None,
        ..context
    };
    assert!(
        !yt_dlp::engine_args(&anonymous, &super::network::Route::Direct, Quality::Highest)?
            .iter()
            .any(|p| p == "--cookies")
    );
    assert!(
        !gallery_dl::engine_args(&anonymous, &request, &super::network::Route::Direct)
            .iter()
            .any(|p| p == "--cookies")
    );
    Ok(())
}
