//! Production dependency proof; private adapter tests are not production escape paths.
use std::{fs, path::Path};

fn production_source(source: String) -> String {
    let mut source = source.replace("\r\n", "\n");
    for name in [
        "tests",
        "ownership_tests",
        "resolve_regressions",
        "requirement_tests",
    ] {
        let marker = format!("mod {name} {{");
        if let Some(start) = source.find(&marker) {
            let end = start
                + source[start..]
                    .find("\n}\n")
                    .expect("closed top-level test module")
                + 3;
            source.replace_range(start..end, "");
        }
    }
    // Test-only compatibility imports are necessary to keep supervisor fixtures unchanged.
    loop {
        let marker = "#[cfg(test)]\nuse ";
        let Some(start) = source.find(marker) else {
            break;
        };
        let end = start + source[start..].find(';').expect("test import terminator") + 1;
        source.replace_range(start..end, "");
    }
    source
}

#[test]
fn core_has_no_private_downloader_protocol_or_selection_dependency() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    for name in [
        "src/download/mod.rs",
        "src/download/queue.rs",
        "src/download/request.rs",
        "src/download/progress.rs",
        "src/download/diagnostics.rs",
        "src/download/contract.rs",
        "src/download/output.rs",
        "src/download_ui.rs",
    ] {
        let source = production_source(fs::read_to_string(root.join(name)).unwrap());
        for private in [
            "plan::",
            "FormatPlan",
            "extractor_key",
            "format_id",
            "_old_archive_ids",
            "requested_formats",
            "AMEOW_PROGRESS",
            "AMEOW_FINAL",
            "--load-info-json",
            "adapters::yt_dlp",
            "RetryWaiting",
            "MAX_ATTEMPTS",
            "retry_after_ms",
        ] {
            assert!(
                !source.contains(private),
                "{name} crosses private boundary: {private}"
            );
        }
    }
    assert!(
        !root.join("src/download/plan.rs").exists(),
        "Rust ranking/replay must be deleted"
    );
}

#[test]
fn shared_services_do_not_branch_on_private_tool_or_wire_names() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    for name in ["src/download/runtime.rs", "src/download/network.rs"] {
        let source = production_source(fs::read_to_string(root.join(name)).unwrap());
        for private in [
            "yt-dlp.exe",
            "deno.exe",
            "ffprobe.exe",
            "DENO_",
            "PYTHONIOENCODING",
            "extractor_key",
            "format_id",
            "FormatPlan",
            "bind_media_routes",
            "adapters::yt_dlp",
        ] {
            assert!(
                !source.contains(private),
                "{name} knows private configuration: {private}"
            );
        }
    }
    let adapter = fs::read_to_string(root.join("src/download/adapters/yt_dlp/mod.rs")).unwrap();
    for bypass in [
        "std::process",
        "Command::new",
        "reqwest",
        "--load-info-json",
        "transfer-input.json",
        "codec_rank",
        "max_by",
    ] {
        assert!(
            !adapter.contains(bypass),
            "adapter revived private bypass: {bypass}"
        );
    }
    let composition = fs::read_to_string(root.join("src/download/composition.rs")).unwrap();
    assert!(composition.contains("YtDlpAdapter"));
}
