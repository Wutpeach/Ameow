//! Read-only check of the official yt-dlp stable release.
use super::network::{self, Route};
use serde::Deserialize;
use std::{
    io::Read,
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const RELEASE_URL: &str = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";
const MAX_BODY: u64 = 256 * 1024;
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

/// Queries GitHub once, using the current Windows route without fallback.
pub fn query_latest() -> Result<String, UpstreamError> {
    let started = Instant::now();
    let route = network::resolve(RELEASE_URL);
    let remaining = DEADLINE.saturating_sub(started.elapsed());
    if remaining.is_zero() {
        return Err(UpstreamError::Timeout);
    }
    let route = route.map_err(|_| UpstreamError::Route)?;
    query_route(RELEASE_URL, route, remaining.min(Duration::from_secs(15)))
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
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
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
struct Release {
    tag_name: String,
    draft: bool,
    prerelease: bool,
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
    let release: Release =
        serde_json::from_slice(&bytes).map_err(|_| UpstreamError::InvalidResponse)?;
    if release.draft || release.prerelease || !valid_tag(&release.tag_name) {
        return Err(UpstreamError::InvalidResponse);
    }
    Ok(release.tag_name)
}

fn valid_tag(tag: &str) -> bool {
    let (date, patch) = match tag.get(10..) {
        Some("") => (tag, None),
        Some(suffix) => (&tag[..10], Some(suffix)),
        None => return false,
    };
    if let Some(suffix) = patch {
        let Some(number) = suffix.strip_prefix('.') else {
            return false;
        };
        if number.is_empty()
            || number.len() > 6
            || !number.bytes().all(|c| c.is_ascii_digit())
            || !number.bytes().any(|c| c != b'0')
        {
            return false;
        }
    }
    let b = date.as_bytes();
    if b.len() != 10
        || b[4] != b'.'
        || b[7] != b'.'
        || !b
            .iter()
            .enumerate()
            .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
    {
        return false;
    }
    let year = date[0..4].parse::<u32>().unwrap_or(0);
    let month = date[5..7].parse::<u32>().unwrap_or(0);
    let day = date[8..10].parse::<u32>().unwrap_or(0);
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => 0,
    };
    year > 0 && day > 0 && day <= days
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
            local_response("200 OK", "Content-Length: 262145\r\n", ""),
            Err(UpstreamError::TooLarge)
        );
    }

    #[test]
    fn local_http_success_and_connection_refusal() {
        let body = r#"{"tag_name":"2024.02.29","draft":false,"prerelease":false}"#;
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
    fn accepts_only_stable_calendar_tags_and_bounded_json() {
        let json = |tag: &str, draft: bool, prerelease: bool| {
            format!("{{\"tag_name\":\"{tag}\",\"draft\":{draft},\"prerelease\":{prerelease}}}")
        };
        assert_eq!(
            parse_response(json("2024.02.29", false, false).as_bytes()),
            Ok("2024.02.29".into())
        );
        assert_eq!(
            parse_response(json("2021.03.24.1", false, false).as_bytes()),
            Ok("2021.03.24.1".into())
        );
        for tag in [
            "2023.02.29",
            "2024.04.31",
            "2024.13.01",
            "0000.01.01",
            "2024.1.01",
            "2024.01.01.0",
            "2024.01.01.1234567",
            "2024.01.01.-1",
            "2024.01.01.1.2",
        ] {
            assert_eq!(
                parse_response(json(tag, false, false).as_bytes()),
                Err(UpstreamError::InvalidResponse)
            );
        }
        for (draft, prerelease) in [(true, false), (false, true)] {
            assert_eq!(
                parse_response(json("2024.01.01", draft, prerelease).as_bytes()),
                Err(UpstreamError::InvalidResponse)
            );
        }
        assert_eq!(
            parse_response(vec![b' '; MAX_BODY as usize + 1].as_slice()),
            Err(UpstreamError::TooLarge)
        );
        assert_eq!(
            parse_response(b"{}".as_slice()),
            Err(UpstreamError::InvalidResponse)
        );
        for json in [
            r#"{"tag_name":"2024.01.01","draft":false}"#,
            r#"{"tag_name":"2024.01.01","draft":false,"prerelease":false"#,
            r#"{"tag_name":"2024.01.01","tag_name":"2025.01.01","draft":false,"prerelease":false}"#,
            r#"{"tag_name":"2024.01.01<script>","draft":false,"prerelease":false}"#,
            r#"{"tag_name":"２０２４.01.01","draft":false,"prerelease":false}"#,
            r#"{"tag_name":"2024.01.01","draft":"false","prerelease":false}"#,
        ] {
            assert_eq!(
                parse_response(json.as_bytes()),
                Err(UpstreamError::InvalidResponse)
            );
        }
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
