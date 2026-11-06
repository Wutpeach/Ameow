use crate::download::{
    Phase,
    diagnostics::{Failure, known},
};
pub(crate) fn engine_stderr(stderr: &[u8], truncated: bool) -> String {
    if truncated {
        return "[truncated stderr]".into();
    }
    let text = String::from_utf8_lossy(stderr);
    let start = text
        .char_indices()
        .rev()
        .nth(2999)
        .map_or(0, |(index, _)| index);
    if start == 0 || text.as_bytes()[start - 1] == b'\n' {
        return text[start..].into();
    }
    // Keep complete source lines only: a cut in arbitrary content must not invent an error prefix.
    text[start..].find('\n').map_or_else(
        || "[truncated stderr]".into(),
        |newline| text[start + newline + 1..].into(),
    )
}

fn proxy_failure(cause: &str) -> bool {
    if cause.len() > 3000 || cause.chars().any(char::is_control) {
        return false;
    }
    let Some(mut message) = cause.strip_prefix("error:").map(str::trim_start) else {
        return false;
    };
    let Some(rest) = message.strip_prefix('[') else {
        return false;
    };
    let Some((extractor, rest)) = rest.split_once("] ") else {
        return false;
    };
    let Some((object, rest)) = rest.split_once(": ") else {
        return false;
    };
    let native_key = |key: &str, bound| {
        !key.is_empty()
            && key.len() <= bound
            && key
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.'))
    };
    if !native_key(extractor, 64) || !native_key(object, 256) {
        return false;
    }
    message = rest;
    let Some(details) = message
        .strip_prefix("unable to download api page: ")
        .or_else(|| message.strip_prefix("unable to download webpage: "))
    else {
        return false;
    };
    let Some((connection, exception)) = details.split_once(" (caused by proxyerror(") else {
        return false;
    };
    connection.starts_with("('unable to connect to proxy', ")
        && connection.ends_with(')')
        && exception
            .split("; please report this issue on")
            .next()
            .is_some_and(|exception| exception.trim_end().ends_with("))"))
}

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
    let failed_engine = lower
        .split_once(": ")
        .and_then(|(envelope, _)| {
            envelope
                .strip_prefix("resolve engine exit ")
                .or_else(|| envelope.strip_prefix("transfer engine exit "))?
                .parse::<u32>()
                .ok()
        })
        .is_some_and(|exit| exit != 0);
    if failed_engine
        && evidence.len() <= 4096
        && matches!(phase, Phase::Resolving | Phase::Downloading)
        && proxy_failure(&cause)
    {
        return known("E_NETWORK_TEMPORARY", stage);
    }
    // Status evidence is anchored to actual engine error wording, not arbitrary numbers.
    let code = if evidence.starts_with("E_OBJECT_UNSUPPORTED:") {
        "E_OBJECT_UNSUPPORTED"
    } else if evidence.starts_with("E_URL_UNSAFE:") {
        "E_URL_UNSAFE"
    } else if evidence.starts_with("E_NETWORK_TEMPORARY:") {
        "E_NETWORK_TEMPORARY"
    } else if engine
        && cause
            .strip_prefix("error: unsupported url: ")
            .is_some_and(|input| {
                !input.chars().any(char::is_whitespace)
                    && url::Url::parse(input).is_ok_and(|url| {
                        matches!(url.scheme(), "https" | "http") && url.host_str().is_some()
                    })
            })
    {
        "E_UNSUPPORTED_URL"
    } else if evidence.starts_with("E_METADATA_TOO_LARGE:") {
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

#[cfg(test)]
#[path = "diagnostics_tests.rs"]
mod tests;
