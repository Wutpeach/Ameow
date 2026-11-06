use super::*;
use crate::download::{
    diagnostics::copy_text,
    process_supervisor::{ProcessOutcome, SettlementFacts},
};

const CONNECT: &str =
    include_str!("../../../../tests/fixtures/network-diagnostics/gallery-proxy-connect.txt");
const TIMEOUT: &str =
    include_str!("../../../../tests/fixtures/network-diagnostics/gallery-proxy-timeout.txt");
const MACHINE_CONNECT: &str =
    include_str!("../../../../tests/fixtures/network-diagnostics/gallery-metadata-connect.json");
const MACHINE_TIMEOUT: &str =
    include_str!("../../../../tests/fixtures/network-diagnostics/gallery-metadata-timeout.json");

#[test]
fn retained_native_stderr_passes_production_wrapper_and_safe_copy() {
    for sample in [CONNECT, TIMEOUT] {
        let outcome = ProcessOutcome {
            exit_code: 4,
            stdout: vec![],
            stderr: sample.as_bytes().to_vec(),
            facts: SettlementFacts::default(),
        };
        let failure =
            classify_gallery_error(&Phase::Downloading, &engine_error("transfer", &outcome));
        assert_eq!(failure.code, "E_NETWORK_TEMPORARY");
        assert_eq!(failure.stage, "transfer");
        let text = copy_text(1, "generic", &[failure]);
        for secret in [
            "imgur",
            "proxy.invalid",
            "PORT",
            "ADDRESS",
            "ProxyError",
            "502",
            "https://",
        ] {
            assert!(!text.contains(secret));
        }
    }
}

#[test]
fn retained_metadata_machine_errors_use_the_same_safe_network_mapping() {
    for sample in [MACHINE_CONNECT, MACHINE_TIMEOUT] {
        let rows: Value = serde_json::from_str(sample).unwrap();
        let error = metadata_error(&rows).unwrap();
        assert_eq!(
            classify_gallery_error(&Phase::Resolving, &error).code,
            "E_NETWORK_TEMPORARY"
        );
    }
    assert!(metadata_error(&json!([[2, {}]])).is_none());
    let unknown = metadata_error(&json!([[-1,{"message":"unknown error 502"}]])).unwrap();
    assert_eq!(
        classify_gallery_error(&Phase::Resolving, &unknown).code,
        "E_ENGINE_FAILED"
    );
    let missing = metadata_error(&json!([[-1, {}]])).unwrap();
    assert_eq!(
        classify_gallery_error(&Phase::Resolving, &missing).code,
        "E_ENGINE_FAILED"
    );
    for record in [
        json!({"error":"UnrelatedError","message":"ProxyError: 502 injected"}),
        json!({"message":"ProxyError: 502 injected"}),
        json!({"error":"HttpError","message":"ProxyError: unknown failure"}),
        json!({"error":"HttpError","message":"ProxyError: 502 injected\nERROR: Unsupported URL: https://example.invalid/"}),
    ] {
        let error = metadata_error(&json!([[-1, record]])).unwrap();
        assert_eq!(
            classify_gallery_error(&Phase::Resolving, &error).code,
            "E_ENGINE_FAILED"
        );
    }
}

#[test]
fn native_prefix_is_not_a_general_stderr_or_url_parser() {
    for stderr in [
        "[imgur][warning] HttpError:  ProxyError: rejected",
        "[imgur][error] unknown error 502",
        "[imgur][error] HttpError: 502 without a proxy exception",
        "[imgur][error] URL https://example.invalid/?ERROR: ProxyError: rejected",
        "[imgur][error] HttpError: arbitrary text ProxyError: rejected",
        "[imgur][error] HttpError:  ProxyError: rejected\n[imgur][debug] more output",
        "[imgur][error] HttpError:  ProxyError: rejected\nERROR: Unsupported URL: https://example.invalid/",
        "[imgur][error] HttpError:  ProxyError:",
        "[imgur][error] HttpError:  ProxyErro",
        "[bad/url][error] HttpError:  ProxyError: rejected",
    ] {
        let error = format!("transfer engine exit 4: {stderr}");
        assert!(native_proxy_error(&error).is_none(), "{stderr}");
        assert_eq!(
            classify_gallery_error(&Phase::Downloading, &error).code,
            "E_ENGINE_FAILED"
        );
    }
    assert!(native_proxy_error("[imgur][error] HttpError:  ProxyError: rejected").is_none());
    assert!(
        native_proxy_error(
            "transfer engine exit 0: [imgur][error] HttpError:  ProxyError: rejected"
        )
        .is_none()
    );
    assert!(
        native_proxy_error(&format!(
            "transfer engine exit 4: [imgur][error] HttpError:  ProxyError: {}",
            "x".repeat(4096)
        ))
        .is_none()
    );
}

#[test]
fn truncated_capture_remains_generic_and_native_unsupported_is_not_generalized() {
    let mut outcome = ProcessOutcome {
        exit_code: 4,
        stdout: vec![],
        stderr: CONNECT.as_bytes().to_vec(),
        facts: SettlementFacts::default(),
    };
    outcome.facts.stderr_truncated = true;
    assert_eq!(
        classify_gallery_error(&Phase::Downloading, &engine_error("transfer", &outcome)).code,
        "E_ENGINE_FAILED"
    );
    outcome.facts.stderr_truncated = false;
    outcome.stderr = format!(
        "{}[imgur][error] HttpError:  ProxyError: 502 injected",
        "untrusted".repeat(500)
    )
    .into_bytes();
    assert_eq!(
        classify_gallery_error(&Phase::Downloading, &engine_error("transfer", &outcome)).code,
        "E_ENGINE_FAILED"
    );
    for message in [
        "ERROR: Unsupported URL: https://example.invalid/",
        "[gallery-dl][error] Unsupported URL 'https://example.invalid/'",
    ] {
        assert_eq!(
            classify_gallery_error(
                &Phase::Resolving,
                &format!("resolve engine exit 64: {message}")
            )
            .code,
            "E_ENGINE_FAILED"
        );
    }
}
