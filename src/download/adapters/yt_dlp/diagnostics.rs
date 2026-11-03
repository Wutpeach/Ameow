use crate::download::{
    Phase,
    diagnostics::{Failure, known},
};
pub fn classify(phase: &Phase, evidence: &str) -> Failure {
    let stage = match phase {
        Phase::Accepted => "admission",
        Phase::Preparing => "runtime",
        Phase::Resolving => "resolve",
        Phase::Downloading => "transfer",
        Phase::Validating => "verify",
        Phase::Publishing => "publish",
        Phase::Held => "cleanup",
        _ => "unknown",
    };
    let lower = evidence.to_ascii_lowercase();
    // Verbose argv/debug output can contain attacker-controlled URL text. Only actual ERROR
    // lines may classify a failed opaque engine. Library/native errors have their own context.
    let engine =
        lower.starts_with("resolve engine exit ") || lower.starts_with("transfer engine exit ");
    let cause = if engine {
        lower
            .lines()
            .filter_map(|line| {
                if line.starts_with("error:") {
                    Some(line)
                } else if line.starts_with("resolve engine exit ")
                    || line.starts_with("transfer engine exit ")
                {
                    line.split_once(':')
                        .map(|(_, error)| error.trim())
                        .filter(|error| error.starts_with("error:"))
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        lower.clone()
    };
    // Status evidence is anchored to actual engine error wording, not arbitrary numbers.
    let code = if evidence.starts_with("E_METADATA_TOO_LARGE:") {
        "E_METADATA_TOO_LARGE"
    } else if evidence.starts_with("E_METADATA_INVALID_JSON:") {
        "E_METADATA_INVALID_JSON"
    } else if evidence.starts_with("E_ENGINE_OUTPUT_LIMIT:") {
        "E_ENGINE_OUTPUT_LIMIT"
    } else if evidence.starts_with("E_DUPLICATE:") {
        "E_DUPLICATE"
    } else if evidence.starts_with("E_IDENTITY:")
        || lower.contains("resolved object mismatch")
        || lower.contains("playlist/multiple/indirect")
        || lower.contains("metadata has no object identity")
        || lower.contains("metadata has no extractor identity")
    {
        "E_IDENTITY"
    } else if evidence.starts_with("E_NETWORK_ENGINE_ROUTE_UNSUPPORTED:") {
        "E_ROUTE_UNSUPPORTED"
    } else if cause.contains("http error 401")
        || cause.contains("this video is private")
        || cause.contains(": private video")
        || cause.contains("members-only")
        || cause.contains("sign in to confirm")
    {
        "E_ACCESS_DENIED"
    } else if cause.contains("video unavailable")
        || cause.contains("video has been removed")
        || cause.contains("video does not exist")
    {
        "E_UNAVAILABLE"
    } else if evidence.starts_with("E_STORAGE:")
        || lower.contains("os error 112)")
        || lower.contains("os error 5)")
        || lower.contains("no space left on device")
        || lower.contains("permission denied")
    {
        "E_STORAGE"
    } else if matches!(phase, Phase::Resolving | Phase::Downloading)
        && cause.contains("http error 429: too many requests")
    {
        "E_RATE_LIMIT"
    } else if matches!(phase, Phase::Resolving | Phase::Downloading)
        && (cause.contains("connection reset by peer")
            || cause.contains("connectionreseterror")
            || cause.contains("timed out")
            || cause.contains("temporary failure in name resolution")
            || cause.contains("http error 502: bad gateway")
            || cause.contains("http error 503: service unavailable")
            || cause.contains("http error 504: gateway timeout"))
    {
        "E_NETWORK_TEMPORARY"
    } else if *phase == Phase::Preparing {
        "E_RUNTIME"
    } else if cause.contains("http error 403: forbidden") {
        "E_HTTP_FORBIDDEN"
    } else if engine {
        "E_ENGINE_FAILED"
    } else {
        "E_UNKNOWN"
    };
    // 403 and unknown failures intentionally never become guesses about network/authentication.
    // Opaque engine stderr cannot establish a real HTTP response header, even if a line looks
    // like one. The current native engine has no verified response-header side channel.
    known(code, stage)
}
