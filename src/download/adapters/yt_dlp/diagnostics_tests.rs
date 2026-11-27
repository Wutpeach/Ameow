use super::*;
use crate::download::diagnostics::copy_text;

#[test]
fn safe_engine_facts_preserve_exit_and_report_without_the_error_payload() {
    for (error, expected) in [
        ("ERROR: HTTP Error 403: Forbidden", EngineReport::Http(403)),
        ("ERROR: HTTP Error 418: Teapot", EngineReport::Http(418)),
        ("ERROR: Unable to download webpage: connection timed out", EngineReport::Timeout),
        ("ERROR: Unable to download webpage: getaddrinfo failed", EngineReport::Dns),
        ("ERROR: Unable to download webpage: SSL: CERTIFICATE_VERIFY_FAILED", EngineReport::Tls),
        ("ERROR: Unable to download media: ConnectionResetError: connection reset by peer", EngineReport::ConnectionReset),
        ("ERROR: Unable to write file: No space left on device", EngineReport::DiskFull),
        ("ERROR: Unable to write file: Permission denied", EngineReport::PermissionDenied),
        ("ERROR: opaque failure", EngineReport::Unknown),
        ("[debug] HTTP Error 403: Forbidden", EngineReport::Unknown),
        ("ERROR: failed at https://example.com/HTTP%20Error%20403?token=PRIVATE", EngineReport::Unknown),
    ] {
        let failure = classify(&Phase::Downloading, &format!("transfer engine exit 42: {error} Cookie: PRIVATE Authorization: PRIVATE https://cdn.example/signed?token=PRIVATE C:\\Private\\file"));
        let engine = failure.engine.as_ref().unwrap();
        assert_eq!(engine.exit_code, 42);
        assert_eq!(engine.report, expected, "{error}");
        assert!(engine.observed_at_ms > 0);
        let text = copy_text(7, "youtube", &[failure]);
        assert!(text.contains("Engine exit code: 42"));
        assert!(!text.contains("PRIVATE") && !text.contains("://") && !text.contains("Cookie"));
        if let EngineReport::Http(status) = expected {
            assert!(text.contains(&format!("HTTP {status} (reported by downloader; response not independently verified)")));
        }
    }
    for (output, expected) in [("", EngineOutput::NoCompleteLines), ("[truncated stderr]", EngineOutput::Truncated)] {
        let failure = classify(&Phase::Resolving, &format!("resolve engine exit 1: {output}"));
        let engine = failure.engine.unwrap();
        assert_eq!(engine.exit_code, 1);
        assert_eq!(engine.report, EngineReport::Unknown);
        assert_eq!(engine.output, expected);
    }
}

const CONNECT: &str =
    include_str!("../../../../tests/fixtures/network-diagnostics/yt-proxy-connect.txt");

#[test]
fn requested_format_unavailable_has_safe_reason_and_requires_complete_native_evidence() {
    let native = "ERROR: [XiaoHongShu] 6b08a8be000000002903d864: Requested format is not available. Use --list-formats for a list of available formats";
    for (phase, label) in [(Phase::Resolving, "resolve"), (Phase::Downloading, "transfer")] {
        for error in [native, "ERROR: Requested format is not available"] {
            let failure = classify(&phase, &format!("{label} engine exit 1: {error}"));
            assert_eq!(failure.code, "E_FORMAT_UNAVAILABLE");
            assert_eq!(failure.engine.as_ref().unwrap().report, EngineReport::FormatUnavailable);
            let text = copy_text(2, "unknown", &[failure]);
            assert!(text.contains("E_FORMAT_UNAVAILABLE") && text.contains("No video format matches the selected quality"));
            assert!(text.contains("submit the link again") && text.contains("keeps its original quality"));
            assert!(text.contains("requested format unavailable (reported by downloader)"));
            assert!(!text.contains("6b08a8be") && !text.contains("--list-formats"));
        }
    }
    for error in [
        "[debug] Requested format is not available",
        "WARNING: Requested format is not available",
        "ERROR: failed at https://example.invalid/Requested-format-is-not-available",
        "ERROR: Unexpected reply: Requested format is not available",
        "ERROR: [XiaoHongShu] https://private.invalid/token: Requested format is not available",
        "ERROR: [XiaoHongShu] OBJECT: Requested format is not available\nERROR: HTTP Error 403: Forbidden",
        "[truncated stderr]",
    ] {
        assert_ne!(classify(&Phase::Resolving, &format!("resolve engine exit 1: {error}")).code, "E_FORMAT_UNAVAILABLE", "{error}");
    }
    assert_ne!(classify(&Phase::Resolving, &format!("resolve engine exit 0: {native}")).code, "E_FORMAT_UNAVAILABLE");
    assert_ne!(classify(&Phase::Validating, &format!("resolve engine exit 1: {native}")).code, "E_FORMAT_UNAVAILABLE");
    let truncated = engine_stderr(native.as_bytes(), true);
    assert_eq!(classify(&Phase::Resolving, &format!("resolve engine exit 1: {truncated}")).code, "E_ENGINE_FAILED");
}
const TIMEOUT: &str =
    include_str!("../../../../tests/fixtures/network-diagnostics/yt-proxy-timeout.txt");

#[test]
fn retained_native_proxy_samples_classify_without_exposing_their_details() {
    for sample in [CONNECT, TIMEOUT] {
        for (phase, label) in [
            (Phase::Resolving, "resolve"),
            (Phase::Downloading, "transfer"),
        ] {
            let failure = classify(&phase, &format!("{label} engine exit 1: {sample}"));
            assert_eq!(failure.code, "E_NETWORK_TEMPORARY");
            assert_eq!(failure.stage, label);
            let text = copy_text(1, "youtube", &[failure]);
            for secret in [
                "OBJECT",
                "proxy.invalid",
                "PORT",
                "ADDRESS",
                "https://",
                "ProxyError",
                "502",
            ] {
                assert!(!text.contains(secret), "{secret}");
            }
        }
    }
}

#[test]
fn proxy_type_does_not_claim_a_target_site_status_or_enable_fallback() {
    for status in [
        "403 Forbidden",
        "401 rejected",
        "429 Too Many Requests",
        "502 rejected",
        "Unsupported URL: https://example.invalid/",
    ] {
        let failure = classify(
            &Phase::Resolving,
            &format!(
                "resolve engine exit 1: ERROR: [youtube] OBJECT: Unable to download webpage: ('Unable to connect to proxy', OSError('Tunnel connection failed: {status}')) (caused by ProxyError(\"connection failed\"))"
            ),
        );
        assert_eq!(failure.code, "E_NETWORK_TEMPORARY");
    }
    for (message, expected) in [
        ("HTTP Error 403: Forbidden", "E_HTTP_FORBIDDEN"),
        ("HTTP Error 502: Bad Gateway", "E_NETWORK_TEMPORARY"),
        ("unknown engine failure 502", "E_ENGINE_FAILED"),
    ] {
        assert_eq!(
            classify(
                &Phase::Downloading,
                &format!("transfer engine exit 1: ERROR: {message}")
            )
            .code,
            expected
        );
    }
}

#[test]
fn proxy_words_in_untrusted_output_and_incomplete_causes_remain_generic() {
    for stderr in [
        "[debug] ProxyError: tunnel failed 502",
        "[debug] ['https://example.invalid/?ERROR: ProxyError: rejected']\nERROR: unknown failure",
        "ERROR: failed at https://example.invalid/ProxyError: rejected",
        "ERROR: unexpected response: ProxyError: rejected",
        "ERROR: [youtube] OBJECT: ProxyError text without a connection exception",
        "ERROR: [youtube] OBJECT: Unable to download webpage: ('Unable to connect to proxy', OSError('Tunnel connection failed: 502')) (caused by ProxyError(",
        "ERROR: ProxyError:",
        "WARNING: untrusted output\nERROR: ProxyError: injected",
        "[debug] untrusted output\nERROR: Unable to download webpage: ('Unable to connect to proxy', OSError('Tunnel connection failed: 502')) (caused by ProxyError(\"connection failed\"))",
        "ERROR: ProxyError: rejected\nERROR: unknown failure",
        "ERROR: [youtube] https://example.invalid/ProxyError: rejected",
    ] {
        assert_eq!(
            classify(
                &Phase::Resolving,
                &format!("resolve engine exit 1: {stderr}")
            )
            .code,
            "E_ENGINE_FAILED",
            "{stderr}"
        );
    }
    assert!(!proxy_failure(&format!(
        "error: proxyerror: {}",
        "x".repeat(3000)
    )));
    assert!(!proxy_failure("error: proxyerror: rejected\0secret"));
    assert_ne!(
        classify(&Phase::Resolving, "ERROR: ProxyError: rejected").code,
        "E_NETWORK_TEMPORARY"
    );
    assert_eq!(
        classify(
            &Phase::Validating,
            "transfer engine exit 1: ERROR: ProxyError: rejected"
        )
        .code,
        "E_ENGINE_FAILED"
    );
}

#[test]
fn exact_native_unsupported_url_and_multiline_safety_are_unchanged() {
    assert_eq!(
        classify(
            &Phase::Resolving,
            "resolve engine exit 1: ERROR: Unsupported URL: https://example.invalid/"
        )
        .code,
        "E_UNSUPPORTED_URL"
    );
    assert_ne!(classify(&Phase::Resolving, "resolve engine exit 1: ERROR: Unsupported URL: https://example.invalid/\nERROR: ProxyError: rejected").code, "E_UNSUPPORTED_URL");
}

#[test]
fn truncated_capture_cannot_promote_a_retained_proxy_error() {
    use crate::download::process_supervisor::{ProcessOutcome, SettlementFacts};
    let mut outcome = ProcessOutcome {
        exit_code: 1,
        stdout: vec![],
        stderr: CONNECT.as_bytes().to_vec(),
        facts: SettlementFacts {
            root_waited: true,
            job_active_zero: true,
            stdout_reader_joined: true,
            stderr_reader_joined: true,
            callback_consumer_joined: true,
            ..Default::default()
        },
    };
    let code = |outcome: &ProcessOutcome| {
        classify(
            &Phase::Resolving,
            &super::super::validate_engine_outcome(outcome, "resolve").unwrap_err(),
        )
        .code
    };
    assert_eq!(code(&outcome), "E_NETWORK_TEMPORARY");
    outcome.facts.stderr_truncated = true;
    assert_eq!(code(&outcome), "E_ENGINE_FAILED");
    outcome.facts.stderr_truncated = false;
    outcome.stderr = format!("{}ERROR: [youtube] OBJECT: Unable to download webpage: ('Unable to connect to proxy', OSError('Tunnel connection failed: 502')) (caused by ProxyError(\"connection failed\"))", "untrusted".repeat(500)).into_bytes();
    assert_eq!(code(&outcome), "E_ENGINE_FAILED");
    for envelope in ["resolve engine exit 0", "resolve engine exit invalid"] {
        assert_eq!(
            classify(
                &Phase::Resolving,
                &format!("{envelope}: ERROR: ProxyError: rejected")
            )
            .code,
            "E_ENGINE_FAILED"
        );
    }
}

#[test]
fn bounded_tail_preserves_complete_unsupported_errors_without_inventing_line_starts() {
    let trusted = "ERROR: Unsupported URL: https://example.invalid/\n";
    let warning = format!("WARNING: {}\n{trusted}", "x".repeat(4000));
    let retained = engine_stderr(warning.as_bytes(), false);
    assert_eq!(retained, trusted);
    assert_eq!(
        classify(
            &Phase::Resolving,
            &format!("resolve engine exit 1: {retained}")
        )
        .code,
        "E_UNSUPPORTED_URL"
    );
    assert_eq!(
        engine_stderr(format!("{}{trusted}", "x".repeat(4000)).as_bytes(), false),
        ""
    );
    let exact_line = format!("{}\n{}", "x".repeat(20), "y".repeat(3000));
    assert_eq!(
        engine_stderr(exact_line.as_bytes(), false),
        "y".repeat(3000)
    );
    assert_eq!(
        engine_stderr("界".repeat(4000).as_bytes(), false),
        "[truncated stderr]"
    );
}
