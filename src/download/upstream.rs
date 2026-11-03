//! Read-only check of the official yt-dlp stable release.
use super::network::{self, Route};
use serde::Deserialize;
use std::{
    io::Read,
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Copy)]
enum Source {
    YtDlpPyPi,
}

impl Source {
    fn url(self) -> &'static str {
        match self {
            Self::YtDlpPyPi => "https://pypi.org/pypi/yt-dlp/json",
        }
    }
}

const MAX_BODY: u64 = 16 * 1024 * 1024;
const COOLDOWN: Duration = Duration::from_secs(5);
const DEADLINE: Duration = Duration::from_secs(30);

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum UpstreamError {
    Route,
    Timeout,
    Connect,
    Http(u16),
    InvalidResponse,
    TooLarge,
    Network,
}

#[derive(Clone, Debug, Default)]
pub struct UpstreamSnapshot {
    pub pending: bool,
    pub worker_running: bool,
    pub checked_at_ms: Option<u64>,
    pub result: Option<Result<String, UpstreamError>>,
    pub cooldown_remaining_ms: u64,
}

#[derive(Default)]
struct State {
    snapshot: UpstreamSnapshot,
    last_started: Option<Instant>,
    started_at_ms: u64,
}

#[derive(Clone, Default)]
pub struct UpstreamChecker {
    state: Arc<Mutex<State>>,
}

impl UpstreamChecker {
    pub fn snapshot(&self) -> UpstreamSnapshot {
        let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let mut snapshot = state.snapshot.clone();
        snapshot.worker_running = snapshot.pending;
        if snapshot.pending && state.last_started.is_some_and(|t| t.elapsed() >= DEADLINE) {
            snapshot.pending = false;
            snapshot.checked_at_ms = Some(
                state
                    .started_at_ms
                    .saturating_add(DEADLINE.as_millis() as u64),
            );
            snapshot.result = Some(Err(UpstreamError::Timeout));
        }
        snapshot.cooldown_remaining_ms = state.last_started.map_or(0, |started| {
            COOLDOWN.saturating_sub(started.elapsed()).as_millis() as u64
        });
        snapshot
    }

    pub fn request(&self) -> bool {
        self.request_with(query_latest)
    }

    fn request_with(
        &self,
        query: impl FnOnce() -> Result<String, UpstreamError> + Send + 'static,
    ) -> bool {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if state.snapshot.pending || state.last_started.is_some_and(|t| t.elapsed() < COOLDOWN) {
            return false;
        }
        state.snapshot.pending = true;
        state.last_started = Some(Instant::now());
        state.started_at_ms = now_ms();
        let shared = Arc::clone(&self.state);
        if std::thread::Builder::new()
            .name("yt-dlp-release-check".into())
            .spawn(move || {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(query))
                    .unwrap_or(Err(UpstreamError::Network));
                let mut state = shared.lock().unwrap_or_else(|e| e.into_inner());
                state.snapshot.pending = false;
                if state.last_started.is_some_and(|t| t.elapsed() >= DEADLINE) {
                    state.snapshot.checked_at_ms = Some(
                        state
                            .started_at_ms
                            .saturating_add(DEADLINE.as_millis() as u64),
                    );
                    state.snapshot.result = Some(Err(UpstreamError::Timeout));
                } else {
                    state.snapshot.checked_at_ms = Some(now_ms());
                    state.snapshot.result = Some(result);
                }
            })
            .is_err()
        {
            state.snapshot.pending = false;
            state.snapshot.checked_at_ms = Some(now_ms());
            state.snapshot.result = Some(Err(UpstreamError::Network));
            return false;
        }
        true
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u64::MAX as u128) as u64
}

fn request_error(error: reqwest::Error) -> UpstreamError {
    if error.is_timeout() {
        UpstreamError::Timeout
    } else if error.is_connect() {
        UpstreamError::Connect
    } else {
        UpstreamError::Network
    }
}

/// Queries the official PyPI project once using the current Windows route.
pub fn query_latest() -> Result<String, UpstreamError> {
    let started = Instant::now();
    let source = Source::YtDlpPyPi;
    let route = network::resolve(source.url());
    let remaining = DEADLINE.saturating_sub(started.elapsed());
    if remaining.is_zero() {
        return Err(UpstreamError::Timeout);
    }
    let route = route.map_err(|_| UpstreamError::Route)?;
    query_route(source.url(), route, remaining.min(Duration::from_secs(15)))
}

fn query_route(url: &str, route: Route, timeout: Duration) -> Result<String, UpstreamError> {
    let mut builder = reqwest::blocking::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(timeout);
    if let Route::Proxy(proxy) = route {
        builder = builder.proxy(reqwest::Proxy::all(proxy).map_err(|_| UpstreamError::Route)?);
    }
    let response = builder
        .build()
        .map_err(request_error)?
        .get(url)
        .header(reqwest::header::USER_AGENT, "Ameow-Next/0.1")
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .map_err(request_error)?;
    if !response.status().is_success() {
        return Err(UpstreamError::Http(response.status().as_u16()));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_BODY)
    {
        return Err(UpstreamError::TooLarge);
    }
    parse_response(response)
}

#[derive(Deserialize)]
struct Project {
    info: ProjectInfo,
    releases: std::collections::HashMap<String, Vec<Distribution>>,
}

#[derive(Deserialize)]
struct ProjectInfo {
    name: String,
    version: String,
}

#[derive(Deserialize)]
struct Distribution {
    yanked: bool,
}

fn parse_response(response: impl Read) -> Result<String, UpstreamError> {
    let mut bytes = Vec::new();
    response
        .take(MAX_BODY + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| {
            let mut source: Option<&(dyn std::error::Error + 'static)> = Some(&error);
            while let Some(cause) = source {
                if let Some(request) = cause.downcast_ref::<reqwest::Error>() {
                    if request.is_timeout() {
                        return UpstreamError::Timeout;
                    }
                    if request.is_connect() {
                        return UpstreamError::Connect;
                    }
                }
                source = cause.source();
            }
            if error.kind() == std::io::ErrorKind::TimedOut {
                UpstreamError::Timeout
            } else {
                UpstreamError::Network
            }
        })?;
    if bytes.len() as u64 > MAX_BODY {
        return Err(UpstreamError::TooLarge);
    }
    let project: Project =
        serde_json::from_slice(&bytes).map_err(|_| UpstreamError::InvalidResponse)?;
    if project.info.name != "yt-dlp" {
        return Err(UpstreamError::InvalidResponse);
    }
    let latest =
        normalize_stable_version(&project.info.version).ok_or(UpstreamError::InvalidResponse)?;
    let files = project
        .releases
        .get(&project.info.version)
        .ok_or(UpstreamError::InvalidResponse)?;
    if !files.iter().any(|file| !file.yanked) {
        return Err(UpstreamError::InvalidResponse);
    }
    for (version, files) in &project.releases {
        if files.iter().any(|file| !file.yanked)
            && compare_stable_versions(version, &latest) == Some(std::cmp::Ordering::Greater)
        {
            return Err(UpstreamError::InvalidResponse);
        }
    }
    Ok(latest)
}

/// Converts a stable yt-dlp calendar version to its release-asset spelling.
pub fn normalize_stable_version(version: &str) -> Option<String> {
    let parts: Vec<_> = version.split('.').collect();
    if !(parts.len() == 3 || parts.len() == 4)
        || parts[0].len() != 4
        || parts[1].is_empty()
        || parts[1].len() > 2
        || parts[2].is_empty()
        || parts[2].len() > 2
        || parts
            .iter()
            .any(|part| !part.bytes().all(|c| c.is_ascii_digit()))
    {
        return None;
    }
    let year: u32 = parts[0].parse().ok()?;
    let month: u32 = parts[1].parse().ok()?;
    let day: u32 = parts[2].parse().ok()?;
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => 0,
    };
    if year == 0 || day == 0 || day > days {
        return None;
    }
    let patch = if parts.len() == 4 {
        if parts[3].is_empty() || parts[3].len() > 6 {
            return None;
        }
        let patch: u32 = parts[3].parse().ok()?;
        if patch == 0 {
            return None;
        }
        format!(".{patch}")
    } else {
        String::new()
    };
    Some(format!("{year:04}.{month:02}.{day:02}{patch}"))
}

/// Compares stable calendar versions; malformed or pre-release inputs are incomparable.
pub fn compare_stable_versions(left: &str, right: &str) -> Option<std::cmp::Ordering> {
    fn components(version: &str) -> Option<(u32, u32, u32, u32)> {
        let normalized = normalize_stable_version(version)?;
        let mut parts = normalized.split('.').map(str::parse::<u32>);
        Some((
            parts.next()?.ok()?,
            parts.next()?.ok()?,
            parts.next()?.ok()?,
            parts.next().transpose().ok()?.unwrap_or(0),
        ))
    }
    Some(components(left)?.cmp(&components(right)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{io::Write, net::TcpListener, sync::mpsc};

    fn local_response(status: &str, headers: &str, body: &str) -> Result<String, UpstreamError> {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let response = format!("HTTP/1.1 {status}\r\n{headers}\r\n{body}");
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0; 2048];
            let _ = stream.read(&mut request);
            let _ = stream.write_all(response.as_bytes());
        });
        let result = query_route(
            &format!("http://{address}/"),
            Route::Direct,
            Duration::from_secs(15),
        );
        server.join().unwrap();
        result
    }

    #[test]
    fn http_failures_and_redirect_are_typed_without_following() {
        for status in ["403 Forbidden", "429 Too Many Requests", "302 Found"] {
            let code = status[..3].parse().unwrap();
            assert_eq!(
                local_response(
                    status,
                    "Location: http://127.0.0.1:1/\r\nContent-Length: 0\r\n",
                    ""
                ),
                Err(UpstreamError::Http(code))
            );
        }
        assert_eq!(
            local_response(
                "200 OK",
                &format!("Content-Length: {}\r\n", MAX_BODY + 1),
                ""
            ),
            Err(UpstreamError::TooLarge)
        );
    }

    #[test]
    fn local_http_success_and_connection_refusal() {
        let body = r#"{"info":{"name":"yt-dlp","version":"2024.2.29"},"releases":{"2024.2.29":[{"yanked":false}]}}"#;
        assert_eq!(
            local_response(
                "200 OK",
                &format!("Content-Length: {}\r\n", body.len()),
                body
            ),
            Ok("2024.02.29".into())
        );
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        drop(listener);
        assert_eq!(
            query_route(
                &format!("http://{address}/"),
                Route::Direct,
                Duration::from_secs(15)
            ),
            Err(UpstreamError::Connect)
        );
    }

    #[test]
    fn body_read_timeout_is_classified_without_exposing_details() {
        struct TimedOut;
        impl Read for TimedOut {
            fn read(&mut self, _: &mut [u8]) -> std::io::Result<usize> {
                Err(std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    "private detail",
                ))
            }
        }
        assert_eq!(parse_response(TimedOut), Err(UpstreamError::Timeout));
    }

    #[test]
    fn stable_versions_are_normalized_and_compared_numerically() {
        assert_eq!(
            normalize_stable_version("2026.3.17"),
            Some("2026.03.17".into())
        );
        assert_eq!(
            normalize_stable_version("2021.03.24.1"),
            Some("2021.03.24.1".into())
        );
        assert_eq!(
            compare_stable_versions("2024.1.1.10", "2024.01.01.2"),
            Some(std::cmp::Ordering::Greater)
        );
        assert_eq!(
            compare_stable_versions("2024.1.1", "2024.01.01"),
            Some(std::cmp::Ordering::Equal)
        );
        for tag in [
            "2023.02.29",
            "2024.04.31",
            "2024.13.01",
            "0000.01.01",
            "2024.01.01.0",
            "2024.01.01.1234567",
            "2024.01.01.-1",
            "2024.01.01.1.2",
            "2024.01.01.dev1",
            "2024.01.01rc1",
            "２０２４.01.01",
        ] {
            assert_eq!(normalize_stable_version(tag), None, "{tag}");
            assert_eq!(compare_stable_versions(tag, "2024.01.01"), None);
        }
    }

    #[test]
    fn pypi_identity_latest_and_non_yanked_files_are_required() {
        let json = |name: &str, latest: &str, releases: &str| {
            format!(r#"{{"info":{{"name":"{name}","version":"{latest}"}},"releases":{releases}}}"#)
        };
        let valid = r#"{"2026.3.17":[{"yanked":false}],"2026.3.18rc1":[{"yanked":false}],"2026.3.19":[{"yanked":true}]}"#;
        assert_eq!(
            parse_response(json("yt-dlp", "2026.3.17", valid).as_bytes()),
            Ok("2026.03.17".into())
        );
        for (name, latest, releases) in [
            ("other", "2026.3.17", valid),
            ("yt-dlp", "2026.3.17rc1", valid),
            ("yt-dlp", "2026.3.18", valid),
            ("yt-dlp", "2026.3.19", valid),
            ("yt-dlp", "2026.3.17", r#"{"2026.3.17":[]}"#),
            (
                "yt-dlp",
                "2026.3.17",
                r#"{"2026.3.17":[{"yanked":false}],"2026.3.18":[{"yanked":false}]}"#,
            ),
        ] {
            assert_eq!(
                parse_response(json(name, latest, releases).as_bytes()),
                Err(UpstreamError::InvalidResponse)
            );
        }
        for invalid in [
            "{}",
            r#"{"info":{"name":"yt-dlp","version":"2026.3.17"},"releases":{"2026.3.17":[{}]}}"#,
            "{",
        ] {
            assert_eq!(
                parse_response(invalid.as_bytes()),
                Err(UpstreamError::InvalidResponse)
            );
        }
        assert_eq!(
            parse_response(vec![b' '; MAX_BODY as usize + 1].as_slice()),
            Err(UpstreamError::TooLarge)
        );
    }

    fn wait_until_finished(checker: &UpstreamChecker) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while checker.snapshot().worker_running {
            assert!(
                Instant::now() < deadline,
                "checker did not finish before deadline"
            );
            std::thread::yield_now();
        }
    }

    #[test]
    fn deadline_shows_timeout_until_worker_finishes_and_discards_late_result() {
        let checker = UpstreamChecker::default();
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        assert!(checker.request_with(move || {
            started_tx.send(()).unwrap();
            release_rx.recv_timeout(Duration::from_secs(5)).unwrap();
            Ok("2024.01.01".into())
        }));
        started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        let expected_time = {
            let mut state = checker.state.lock().unwrap();
            state.last_started = Some(Instant::now() - DEADLINE);
            state.started_at_ms + DEADLINE.as_millis() as u64
        };
        let snapshot = checker.snapshot();
        assert!(!snapshot.pending);
        assert!(snapshot.worker_running);
        assert_eq!(snapshot.result, Some(Err(UpstreamError::Timeout)));
        assert_eq!(snapshot.checked_at_ms, Some(expected_time));
        assert!(!checker.request_with(|| Ok("unexpected".into())));
        release_tx.send(()).unwrap();
        wait_until_finished(&checker);
        let snapshot = checker.snapshot();
        assert!(!snapshot.pending);
        assert!(!snapshot.worker_running);
        assert_eq!(snapshot.result, Some(Err(UpstreamError::Timeout)));
        assert_eq!(snapshot.checked_at_ms, Some(expected_time));
    }

    #[test]
    fn cloned_checker_coalesces_requests_retains_result_and_recovers() {
        let checker = UpstreamChecker::default();
        let (started_tx, started_rx) = mpsc::channel();
        let (finish_tx, finish_rx) = mpsc::channel();
        assert!(checker.request_with(move || {
            started_tx.send(()).unwrap();
            finish_rx.recv_timeout(Duration::from_secs(5)).unwrap();
            Err(UpstreamError::Connect)
        }));
        started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert!(checker.snapshot().pending);
        assert!(!checker.clone().request_with(|| Ok("unexpected".into())));
        finish_tx.send(()).unwrap();
        wait_until_finished(&checker);
        assert_eq!(checker.snapshot().result, Some(Err(UpstreamError::Connect)));
        assert!(!checker.request_with(|| Ok("unexpected".into())));
        checker.state.lock().unwrap().last_started = Some(Instant::now() - COOLDOWN);
        let (release_tx, release_rx) = mpsc::channel();
        assert!(checker.request_with(move || {
            release_rx.recv_timeout(Duration::from_secs(5)).unwrap();
            Ok("2024.01.01".into())
        }));
        assert_eq!(checker.snapshot().result, Some(Err(UpstreamError::Connect)));
        release_tx.send(()).unwrap();
        wait_until_finished(&checker);
        let snapshot = checker.snapshot();
        assert_eq!(snapshot.result, Some(Ok("2024.01.01".into())));
        assert!(snapshot.checked_at_ms.is_some());
    }
}
