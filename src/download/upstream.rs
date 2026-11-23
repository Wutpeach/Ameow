//! Cached metadata checks never acquire or activate a downloader.
use super::{
    contract::Downloader,
    network::{self, Route},
};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const MAX_BODY: u64 = 16 * 1024 * 1024;
const MAX_CACHE: u64 = 64 * 1024;
const COOLDOWN: Duration = Duration::from_secs(5);
const DEADLINE: Duration = Duration::from_secs(30);
const AUTO_INTERVAL_MS: u64 = 86_400_000;
const CACHE_FILE: &str = "upstream-checks.json";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum UpstreamError {
    Route,
    Timeout,
    Connect,
    Http(u16),
    InvalidResponse,
    TooLarge,
    Network,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum Installability {
    #[default]
    Unknown,
    Installable,
    RequiresAmeow,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CachedRelease {
    pub version: String,
    pub installability: Installability,
}

#[derive(Clone, Debug, Default)]
pub struct UpstreamSnapshot {
    pub pending: bool,
    pub worker_running: bool,
    pub checked_at_ms: Option<u64>,
    pub result: Option<Result<String, UpstreamError>>,
    pub cooldown_remaining_ms: u64,
    pub installability: Installability,
    pub last_success: Option<CachedRelease>,
    pub cache_error: bool,
}

#[derive(Default)]
struct ComponentState {
    snapshot: UpstreamSnapshot,
    last_started: Option<Instant>,
    started_at_ms: u64,
    last_attempt_ms: Option<u64>,
    last_seen_version: Option<String>,
}

#[derive(Default)]
struct State {
    components: [ComponentState; 2],
}

#[derive(Default, Serialize, Deserialize)]
struct StoredComponent {
    checked_at_ms: Option<u64>,
    last_attempt_ms: Option<u64>,
    result: Option<Result<CachedRelease, UpstreamError>>,
    last_success: Option<CachedRelease>,
    last_seen_version: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct Stored {
    schema: u32,
    #[serde(default)]
    runtime_identity: String,
    components: [StoredComponent; 2],
}

#[derive(Clone, Default)]
pub struct UpstreamChecker {
    state: Arc<Mutex<State>>,
    root: Option<PathBuf>,
}

fn index(downloader: Downloader) -> usize {
    match downloader {
        Downloader::YtDlp => 0,
        Downloader::GalleryDl => 1,
    }
}

impl UpstreamChecker {
    /// Loads only bounded local results; checking starts when settings requests it.
    pub fn with_root(root: PathBuf) -> Self {
        let checker = Self {
            root: Some(root),
            ..Self::default()
        };
        if let Some(root) = &checker.root {
            match load_cache(root) {
                Ok(Some(stored)) => {
                    let mut state = checker.state.lock().unwrap_or_else(|e| e.into_inner());
                    for (component, stored) in state.components.iter_mut().zip(stored.components) {
                        component.last_attempt_ms = stored.last_attempt_ms;
                        component.last_seen_version = stored.last_seen_version;
                        component.snapshot.checked_at_ms = stored.checked_at_ms;
                        component.snapshot.installability = stored
                            .result
                            .as_ref()
                            .and_then(|r| r.as_ref().ok())
                            .map_or(Installability::Unknown, |r| r.installability);
                        component.snapshot.result = stored.result.map(|r| r.map(|r| r.version));
                        component.snapshot.last_success = stored.last_success;
                    }
                }
                Ok(None) => {}
                Err(()) => {
                    let mut state = checker.state.lock().unwrap_or_else(|e| e.into_inner());
                    for component in &mut state.components {
                        component.snapshot.cache_error = true;
                    }
                }
            }
        }
        checker
    }

    pub fn snapshot(&self) -> UpstreamSnapshot {
        self.snapshot_for(Downloader::YtDlp)
    }

    pub fn snapshot_for(&self, downloader: Downloader) -> UpstreamSnapshot {
        let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let component = &state.components[index(downloader)];
        let mut snapshot = component.snapshot.clone();
        snapshot.worker_running = snapshot.pending;
        if snapshot.pending
            && component
                .last_started
                .is_some_and(|t| t.elapsed() >= DEADLINE)
        {
            snapshot.pending = false;
            snapshot.checked_at_ms = Some(
                component
                    .started_at_ms
                    .saturating_add(DEADLINE.as_millis() as u64),
            );
            snapshot.result = Some(Err(UpstreamError::Timeout));
            snapshot.installability = Installability::Unknown;
        }
        snapshot.cooldown_remaining_ms = component.last_started.map_or(0, |started| {
            COOLDOWN.saturating_sub(started.elapsed()).as_millis() as u64
        });
        snapshot
    }

    pub fn request(&self) -> bool {
        self.request_for(Downloader::YtDlp, true)
    }

    pub fn request_for(&self, downloader: Downloader, manual: bool) -> bool {
        self.request_component_with(downloader, manual, move || query_release(downloader))
    }

    pub fn mark_seen(&self, downloader: Downloader, version: &str) -> bool {
        if normalize_version(downloader, version).as_deref() != Some(version) {
            return false;
        }
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let component = &mut state.components[index(downloader)];
        if component
            .snapshot
            .result
            .as_ref()
            .and_then(|r| r.as_ref().ok())
            .map(String::as_str)
            != Some(version)
            || component.snapshot.installability != Installability::Installable
        {
            return false;
        }
        if component.last_seen_version.as_deref().is_some_and(|seen| {
            compare_versions(downloader, version, seen) != Some(std::cmp::Ordering::Greater)
        }) {
            return true;
        }
        let previous_seen = component.last_seen_version.clone();
        component.last_seen_version = Some(version.into());
        let saved = self.persist(&state);
        if !saved { state.components[index(downloader)].last_seen_version = previous_seen; }
        state.components[index(downloader)].snapshot.cache_error = !saved;
        saved
    }

    pub fn has_unread(&self, downloader: Downloader, current_version: Option<&str>) -> bool {
        let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let component = &state.components[index(downloader)];
        let snapshot = &component.snapshot;
        if snapshot.pending
            && component
                .last_started
                .is_some_and(|at| at.elapsed() >= DEADLINE)
        {
            return false;
        }
        let Some(Ok(version)) = &snapshot.result else {
            return false;
        };
        snapshot.installability == Installability::Installable
            && component.last_seen_version.as_deref().is_none_or(|seen| {
                compare_versions(downloader, version, seen) == Some(std::cmp::Ordering::Greater)
            })
            && current_version.is_some_and(|current| {
                compare_versions(downloader, version, current) == Some(std::cmp::Ordering::Greater)
            })
    }

    fn persist(&self, state: &State) -> bool {
        self.root
            .as_ref()
            .is_none_or(|root| save_cache(root, state).is_ok())
    }

    #[cfg(test)]
    fn request_with(
        &self,
        query: impl FnOnce() -> Result<String, UpstreamError> + Send + 'static,
    ) -> bool {
        self.request_component_with(Downloader::YtDlp, true, move || {
            query().map(|version| CachedRelease {
                version,
                installability: Installability::Installable,
            })
        })
    }

    fn request_component_with(
        &self,
        downloader: Downloader,
        manual: bool,
        query: impl FnOnce() -> Result<CachedRelease, UpstreamError> + Send + 'static,
    ) -> bool {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let component = &mut state.components[index(downloader)];
        let now = now_ms();
        if component.snapshot.pending
            || component
                .last_started
                .is_some_and(|t| t.elapsed() < COOLDOWN)
            || !manual
                && component
                    .last_attempt_ms
                    .is_some_and(|at| now.saturating_sub(at) < AUTO_INTERVAL_MS)
        {
            return false;
        }
        component.snapshot.pending = true;
        component.last_started = Some(Instant::now());
        component.started_at_ms = now;
        component.last_attempt_ms = Some(now);
        let saved = self.persist(&state);
        state.components[index(downloader)].snapshot.cache_error = !saved;
        let checker = self.clone();
        if std::thread::Builder::new()
            .name(format!("{}-release-check", downloader.label()))
            .spawn(move || {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(query))
                    .unwrap_or(Err(UpstreamError::Network));
                let mut state = checker.state.lock().unwrap_or_else(|e| e.into_inner());
                let component = &mut state.components[index(downloader)];
                component.snapshot.pending = false;
                let result = if component
                    .last_started
                    .is_some_and(|t| t.elapsed() >= DEADLINE)
                {
                    component.snapshot.checked_at_ms = Some(
                        component
                            .started_at_ms
                            .saturating_add(DEADLINE.as_millis() as u64),
                    );
                    Err(UpstreamError::Timeout)
                } else {
                    component.snapshot.checked_at_ms = Some(now_ms());
                    result
                };
                component.snapshot.installability = result
                    .as_ref()
                    .map_or(Installability::Unknown, |r| r.installability);
                if let Ok(release) = &result {
                    component.snapshot.last_success = Some(release.clone());
                }
                component.snapshot.result = Some(result.map(|release| release.version));
                let saved = checker.persist(&state);
                state.components[index(downloader)].snapshot.cache_error = !saved;
            })
            .is_err()
        {
            let component = &mut state.components[index(downloader)];
            component.snapshot.pending = false;
            component.snapshot.checked_at_ms = Some(now_ms());
            component.snapshot.result = Some(Err(UpstreamError::Network));
            component.snapshot.installability = Installability::Unknown;
            self.persist(&state);
            return false;
        }
        true
    }
}

fn load_cache(root: &Path) -> Result<Option<Stored>, ()> {
    super::runtime::check_data_location(root).map_err(|_| ())?;
    let path = root.join(CACHE_FILE);
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(()),
    };
    if !super::is_plain_file(&metadata) || metadata.len() > MAX_CACHE {
        return Err(());
    }
    let file = File::open(path).map_err(|_| ())?;
    let mut stored: Stored = serde_json::from_reader(file.take(MAX_CACHE + 1)).map_err(|_| ())?;
    if stored.schema != 1 {
        return Err(());
    }
    for (component, downloader) in stored
        .components
        .iter()
        .zip([Downloader::YtDlp, Downloader::GalleryDl])
    {
        let valid =
            |version: &str| normalize_version(downloader, version).as_deref() == Some(version);
        if component
            .last_seen_version
            .as_deref()
            .is_some_and(|v| !valid(v))
            || component
                .last_success
                .as_ref()
                .is_some_and(|r| !valid(&r.version))
            || component
                .result
                .as_ref()
                .and_then(|r| r.as_ref().ok())
                .is_some_and(|r| !valid(&r.version))
        {
            return Err(());
        }
    }
    invalidate_environment(&mut stored, &runtime_identity());
    Ok(Some(stored))
}

fn runtime_identity() -> String {
    use sha2::Digest;
    let mut hash = sha2::Sha256::new();
    hash.update(b"component-compatibility-v1");
    if let Ok(manifest) = super::runtime::manifest() { hash.update(serde_json::to_vec(&manifest).unwrap_or_default()); }
    hash.update(include_bytes!("macos_gallery.rs"));
    format!("{:x}", hash.finalize())
}

fn invalidate_environment(stored: &mut Stored, identity: &str) {
    if stored.runtime_identity == identity { return; }
    for component in &mut stored.components {
        component.last_attempt_ms = None;
        if let Some(Ok(release)) = &mut component.result { release.installability = Installability::Unknown; }
        if let Some(release) = &mut component.last_success { release.installability = Installability::Unknown; }
    }
    stored.runtime_identity = identity.to_owned();
}

fn save_cache(root: &Path, state: &State) -> Result<(), ()> {
    super::runtime::check_data_location(root).map_err(|_| ())?;
    super::runtime::safe_dir(root).map_err(|_| ())?;
    let stored = Stored {
        schema: 1,
        runtime_identity: runtime_identity(),
        components: std::array::from_fn(|i| {
            let component = &state.components[i];
            StoredComponent {
                checked_at_ms: component.snapshot.checked_at_ms,
                last_attempt_ms: component.last_attempt_ms,
                result: component.snapshot.result.clone().map(|r| {
                    r.map(|version| CachedRelease {
                        version,
                        installability: component.snapshot.installability,
                    })
                }),
                last_success: component.snapshot.last_success.clone(),
                last_seen_version: component.last_seen_version.clone(),
            }
        }),
    };
    let mut file = tempfile::NamedTempFile::new_in(root).map_err(|_| ())?;
    let bytes = serde_json::to_vec(&stored).map_err(|_| ())?;
    file.write_all(&bytes)
        .and_then(|_| file.as_file().sync_all())
        .map_err(|_| ())?;
    file.persist(root.join(CACHE_FILE)).map_err(|_| ())?;
    Ok(())
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

fn read_response(response: impl Read) -> Result<Vec<u8>, UpstreamError> {
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
    Ok(bytes)
}

fn get(url: &str, route: Route, timeout: Duration) -> Result<Vec<u8>, UpstreamError> {
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
        .header(reqwest::header::USER_AGENT, "Ameow")
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .map_err(request_error)?;
    if !response.status().is_success() {
        return Err(UpstreamError::Http(response.status().as_u16()));
    }
    if response.content_length().is_some_and(|n| n > MAX_BODY) {
        return Err(UpstreamError::TooLarge);
    }
    read_response(response)
}

fn fetch_json<T: serde::de::DeserializeOwned>(
    url: &str,
    started: Instant,
) -> Result<T, UpstreamError> {
    let route = network::resolve(url).map_err(|_| UpstreamError::Route)?;
    let remaining = DEADLINE.saturating_sub(started.elapsed());
    if remaining.is_zero() {
        return Err(UpstreamError::Timeout);
    }
    serde_json::from_slice(&get(url, route, remaining.min(Duration::from_secs(15)))?)
        .map_err(|_| UpstreamError::InvalidResponse)
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
    #[cfg(target_os = "macos")]
    #[serde(default)]
    requires_python: Option<String>,
    #[serde(default)]
    requires_dist: Option<Vec<String>>,
}
#[derive(Deserialize)]
struct Distribution {
    yanked: bool,
    #[serde(default)]
    filename: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    digests: std::collections::HashMap<String, String>,
}
#[derive(Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    prerelease: bool,
    assets: Vec<Asset>,
}
#[derive(Deserialize)]
struct Asset {
    name: String,
    size: u64,
    browser_download_url: String,
}

fn project_latest(project: &Project, downloader: Downloader) -> Result<String, UpstreamError> {
    if project.info.name != downloader.label() {
        return Err(UpstreamError::InvalidResponse);
    }
    let latest = normalize_version(downloader, &project.info.version)
        .ok_or(UpstreamError::InvalidResponse)?;
    let files = project
        .releases
        .get(&project.info.version)
        .ok_or(UpstreamError::InvalidResponse)?;
    if !files.iter().any(|file| !file.yanked) {
        return Err(UpstreamError::InvalidResponse);
    }
    if project.releases.iter().any(|(version, files)| {
        files.iter().any(|f| !f.yanked)
            && compare_versions(downloader, version, &latest) == Some(std::cmp::Ordering::Greater)
    }) {
        return Err(UpstreamError::InvalidResponse);
    }
    Ok(latest)
}

pub fn query_latest() -> Result<String, UpstreamError> {
    let project: Project = fetch_json("https://pypi.org/pypi/yt-dlp/json", Instant::now())?;
    project_latest(&project, Downloader::YtDlp)
}

#[cfg(test)]
fn query_route(url: &str, route: Route, timeout: Duration) -> Result<String, UpstreamError> {
    parse_response(get(url, route, timeout)?.as_slice())
}
#[cfg(test)]
fn parse_response(response: impl Read) -> Result<String, UpstreamError> {
    let project: Project = serde_json::from_slice(&read_response(response)?)
        .map_err(|_| UpstreamError::InvalidResponse)?;
    project_latest(&project, Downloader::YtDlp)
}

pub fn query_release(downloader: Downloader) -> Result<CachedRelease, UpstreamError> {
    let started = Instant::now();
    let project: Project = fetch_json(
        &format!("https://pypi.org/pypi/{}/json", downloader.label()),
        started,
    )?;
    let version = project_latest(&project, downloader)?;
    inspect_release(downloader, project, version, started)
}

/// Revalidate the exact clicked version; a newer release appearing meanwhile is not an incompatibility.
pub fn query_installability(downloader: Downloader, version: &str) -> Result<Installability, UpstreamError> {
    #[derive(Deserialize)]
    struct VersionMetadata { info: ProjectInfo, urls: Vec<Distribution> }
    let normalized = normalize_version(downloader, version).ok_or(UpstreamError::InvalidResponse)?;
    let started = Instant::now();
    let metadata: VersionMetadata = fetch_json(&format!("https://pypi.org/pypi/{}/{normalized}/json", downloader.label()), started)?;
    if metadata.info.name != downloader.label()
        || normalize_version(downloader, &metadata.info.version).as_deref() != Some(normalized.as_str())
        || !metadata.urls.iter().any(|file| !file.yanked) { return Err(UpstreamError::InvalidResponse); }
    let project = Project { releases: std::collections::HashMap::from([(metadata.info.version.clone(), metadata.urls)]), info: metadata.info };
    Ok(inspect_release(downloader, project, normalized, started)?.installability)
}

fn inspect_release(downloader: Downloader, project: Project, version: String, started: Instant) -> Result<CachedRelease, UpstreamError> {
    let manifest = super::runtime::manifest().map_err(|_| UpstreamError::InvalidResponse)?;
    let runtime_version = |name: &str| {
        manifest
            .components
            .iter()
            .find(|c| c.name == name)
            .map(|c| c.version.as_str())
    };
    let mut supported = true;
    if downloader == Downloader::YtDlp {
        let deno = project
            .info
            .requires_dist
            .as_deref()
            .unwrap_or_default()
            .iter()
            .find_map(|requirement| {
                let (dependency, marker) = requirement.split_once(';').unwrap_or((requirement, ""));
                let marker = marker.split_whitespace().collect::<String>();
                if !marker.is_empty() && marker != "extra==\"deno\"" && marker != "extra=='deno'" {
                    return None;
                }
                dependency.trim().strip_prefix("deno").map(str::trim)
            });
        supported &= deno
            .zip(runtime_version("deno"))
            .is_some_and(|(required, current)| satisfies(current, required));
    }
    #[cfg(target_os = "macos")]
    {
        supported &= project
            .info
            .requires_python
            .as_deref()
            .zip(runtime_version("python"))
            .is_some_and(|(required, current)| satisfies(current, required));
        supported &= fixed_dependencies_supported(project.info.requires_dist.as_deref().unwrap_or_default());
    }
    let assets_available = if downloader == Downloader::GalleryDl && cfg!(target_os = "macos") {
        project
            .releases
            .get(&project.info.version)
            .is_some_and(|files| {
                files.iter().any(|f| {
                    !f.yanked
                        && f.filename.ends_with("-py3-none-any.whl")
                        && f.size > 0
                        && f.size <= 128 * 1024 * 1024
                        && f.url
                            .starts_with("https://files.pythonhosted.org/packages/")
                        && f.digests.get("sha256").is_some_and(|h| {
                            h.len() == 64 && h.bytes().all(|b| b.is_ascii_hexdigit())
                        })
                })
            })
    } else {
        let (url, base, names): (String, String, Vec<&str>) = match downloader {
            Downloader::YtDlp => (
                format!("https://api.github.com/repos/yt-dlp/yt-dlp/releases/tags/{version}"),
                format!("https://github.com/yt-dlp/yt-dlp/releases/download/{version}/"),
                vec![
                    if cfg!(windows) {
                        "yt-dlp.exe"
                    } else {
                        "yt-dlp"
                    },
                    "SHA2-256SUMS",
                    "SHA2-256SUMS.sig",
                ],
            ),
            Downloader::GalleryDl => (
                format!(
                    "https://codeberg.org/api/v1/repos/mikf/gallery-dl/releases/tags/v{version}"
                ),
                format!("https://codeberg.org/mikf/gallery-dl/releases/download/v{version}/"),
                vec!["gallery-dl.exe", "SHA256SUMS", "SHA256SUMS.sig"],
            ),
        };
        let release: Release = fetch_json(&url, started)?;
        let tag = match downloader {
            Downloader::YtDlp => version.clone(),
            Downloader::GalleryDl => format!("v{version}"),
        };
        if release.tag_name != tag || release.draft || release.prerelease {
            return Err(UpstreamError::InvalidResponse);
        }
        names.iter().all(|name| {
            release.assets.iter().any(|asset| {
                asset.name == *name
                    && asset.size > 0
                    && asset.size <= 128 * 1024 * 1024
                    && asset.browser_download_url == format!("{base}{name}")
            })
        })
    };
    Ok(CachedRelease {
        version,
        installability: if supported && assets_available {
            Installability::Installable
        } else {
            Installability::RequiresAmeow
        },
    })
}

#[cfg(any(test, target_os = "macos"))]
fn fixed_dependencies_supported(requirements: &[String]) -> bool {
    requirements.iter().all(|requirement| {
        let (dependency, marker) = requirement.split_once(';').unwrap_or((requirement, ""));
        let marker = marker.split_whitespace().collect::<String>();
        if marker.contains("extra==") { return true; }
        // Unknown environment expressions need a new validated recipe rather than a guess.
        if !marker.is_empty() { return false; }
        let dependency = dependency.trim();
        let end = dependency.find(|c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '_').unwrap_or(dependency.len());
        let name = dependency[..end].to_ascii_lowercase().replace('_', "-");
        let current = match name.as_str() {
            "requests" => "2.34.2", "idna" => "3.20", "urllib3" => "2.8.0",
            "charset-normalizer" => "3.5.2", "certifi" => "2026.10.23", _ => return false,
        };
        let constraints = dependency[end..].trim().trim_start_matches('(').trim_end_matches(')');
        constraints.is_empty() || satisfies(current, constraints)
    })
}

pub fn normalize_version(downloader: Downloader, version: &str) -> Option<String> {
    match downloader {
        Downloader::YtDlp => normalize_stable_version(version),
        Downloader::GalleryDl => {
            let parts: Vec<_> = version.split('.').collect();
            if parts.len() != 3
                || parts
                    .iter()
                    .any(|p| p.is_empty() || p.len() > 6 || !p.bytes().all(|b| b.is_ascii_digit()))
            {
                return None;
            }
            let parts: Option<Vec<u32>> = parts.iter().map(|p| p.parse().ok()).collect();
            Some(
                parts?
                    .iter()
                    .map(u32::to_string)
                    .collect::<Vec<_>>()
                    .join("."),
            )
        }
    }
}

pub fn compare_versions(
    downloader: Downloader,
    left: &str,
    right: &str,
) -> Option<std::cmp::Ordering> {
    let parts = |value: &str| -> Option<Vec<u32>> {
        normalize_version(downloader, value)?
            .split('.')
            .map(|p| p.parse().ok())
            .collect()
    };
    if downloader == Downloader::YtDlp {
        compare_stable_versions(left, right)
    } else {
        Some(parts(left)?.cmp(&parts(right)?))
    }
}

// Unknown requirement forms are unsupported until Ameow validates that runtime combination.
fn satisfies(current: &str, requirements: &str) -> bool {
    let parts = |value: &str| -> Option<Vec<u32>> {
        let mut parts: Vec<u32> = value
            .trim()
            .split('.')
            .map(str::parse)
            .collect::<Result<_, _>>()
            .ok()?;
        if parts.is_empty() || parts.len() > 4 {
            return None;
        }
        parts.resize(4, 0);
        Some(parts)
    };
    let Some(current) = parts(current) else {
        return false;
    };
    !requirements.is_empty()
        && requirements.split(',').all(|requirement| {
            let requirement = requirement.trim();
            let Some(operator) = [">=", "<=", "!=", "==", ">", "<"]
                .into_iter()
                .find(|op| requirement.starts_with(op))
            else {
                return false;
            };
            let Some(required) = parts(&requirement[operator.len()..]) else {
                return false;
            };
            match operator {
                ">=" => current >= required,
                "<=" => current <= required,
                "!=" => current != required,
                "==" => current == required,
                ">" => current > required,
                _ => current < required,
            }
        })
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
            state.components[0].last_started = Some(Instant::now() - DEADLINE);
            state.components[0].started_at_ms + DEADLINE.as_millis() as u64
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
        checker.state.lock().unwrap().components[0].last_started = Some(Instant::now() - COOLDOWN);
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

    #[test]
    fn daily_limit_survives_restart_and_manual_check_joins_one_worker() {
        let root = tempfile::tempdir().unwrap();
        let checker = UpstreamChecker::with_root(root.path().into());
        assert!(
            checker
                .request_component_with(Downloader::YtDlp, false, || Err(UpstreamError::Connect))
        );
        wait_until_finished(&checker);
        let checker = UpstreamChecker::with_root(root.path().into());
        assert_eq!(checker.snapshot().result, Some(Err(UpstreamError::Connect)));
        assert!(
            !checker.request_component_with(Downloader::YtDlp, false, || panic!(
                "daily retry must not run"
            ))
        );
        let (release_tx, release_rx) = mpsc::channel();
        assert!(
            checker.request_component_with(Downloader::YtDlp, true, move || {
                release_rx.recv_timeout(Duration::from_secs(5)).unwrap();
                Ok(CachedRelease {
                    version: "2026.10.26".into(),
                    installability: Installability::Installable,
                })
            })
        );
        assert!(
            !checker.request_component_with(Downloader::YtDlp, true, || panic!(
                "in-flight must be shared"
            ))
        );
        release_tx.send(()).unwrap();
        wait_until_finished(&checker);
        assert!(checker.has_unread(Downloader::YtDlp, Some("2026.10.01")));
        assert!(checker.mark_seen(Downloader::YtDlp, "2026.10.26"));
        assert_eq!(checker.snapshot().result, Some(Ok("2026.10.26".into())));
        let restored = UpstreamChecker::with_root(root.path().into());
        assert!(!restored.has_unread(Downloader::YtDlp, Some("2026.10.01")));
        assert!(!restored.snapshot().cache_error);
    }

    #[test]
    fn incompatible_release_has_no_unread_and_refresh_failure_is_not_cached_success() {
        let checker = UpstreamChecker::default();
        assert!(
            checker.request_component_with(Downloader::GalleryDl, false, || Ok(CachedRelease {
                version: "1.33.0".into(),
                installability: Installability::RequiresAmeow,
            }))
        );
        let deadline = Instant::now() + Duration::from_secs(5);
        while checker.snapshot_for(Downloader::GalleryDl).worker_running {
            assert!(Instant::now() < deadline);
            std::thread::yield_now();
        }
        assert!(!checker.has_unread(Downloader::GalleryDl, Some("1.32.20")));
        assert!(!checker.mark_seen(Downloader::GalleryDl, "1.33.0"));
        checker.state.lock().unwrap().components[1].last_started = Some(Instant::now() - COOLDOWN);
        assert!(
            checker.request_component_with(Downloader::GalleryDl, true, || Err(
                UpstreamError::Timeout
            ))
        );
        while checker.snapshot_for(Downloader::GalleryDl).worker_running {
            assert!(Instant::now() < deadline);
            std::thread::yield_now();
        }
        let snapshot = checker.snapshot_for(Downloader::GalleryDl);
        assert_eq!(snapshot.result, Some(Err(UpstreamError::Timeout)));
        assert_eq!(snapshot.installability, Installability::Unknown);
        assert_eq!(snapshot.last_success.unwrap().version, "1.33.0");
    }

    #[test]
    fn failed_seen_persistence_keeps_the_update_unread() {
        let root = tempfile::tempdir().unwrap();
        let checker = UpstreamChecker::with_root(root.path().into());
        {
            let mut state = checker.state.lock().unwrap();
            state.components[0].snapshot = UpstreamSnapshot { checked_at_ms: Some(now_ms()),
                result: Some(Ok("2026.10.26".into())), installability: Installability::Installable, ..Default::default() };
        }
        fs::create_dir(root.path().join(CACHE_FILE)).unwrap();
        assert!(!checker.mark_seen(Downloader::YtDlp, "2026.10.26"));
        assert!(checker.snapshot().cache_error);
        assert!(checker.has_unread(Downloader::YtDlp, Some("2026.10.01")));
    }

    #[test]
    fn environment_change_invalidates_installability_but_preserves_seen_version() {
        let mut stored = Stored { schema: 1, runtime_identity: "old".into(), components: Default::default() };
        stored.components[0] = StoredComponent { last_attempt_ms: Some(now_ms()),
            result: Some(Ok(CachedRelease { version: "2026.10.26".into(), installability: Installability::Installable })),
            last_seen_version: Some("2026.10.26".into()), ..Default::default() };
        invalidate_environment(&mut stored, "new");
        assert_eq!(stored.components[0].last_seen_version.as_deref(), Some("2026.10.26"));
        assert!(stored.components[0].last_attempt_ms.is_none());
        assert_eq!(stored.components[0].result.as_ref().unwrap().as_ref().unwrap().installability, Installability::Unknown);
        assert!(fixed_dependencies_supported(&["requests>=2.30".into()]));
        assert!(!fixed_dependencies_supported(&["requests>=3".into()]));
        assert!(!fixed_dependencies_supported(&["new-library>=1".into()]));
    }

    #[test]
    fn downloader_versions_and_runtime_requirements_are_numeric_and_fail_closed() {
        assert_eq!(
            normalize_version(Downloader::GalleryDl, "1.032.20"),
            Some("1.32.20".into())
        );
        assert_eq!(
            compare_versions(Downloader::GalleryDl, "1.33.0", "1.9.99"),
            Some(std::cmp::Ordering::Greater)
        );
        for invalid in ["1.33.0rc1", "v1.33.0", "1.33", "1.33.0.1", "1.33.-1"] {
            assert!(normalize_version(Downloader::GalleryDl, invalid).is_none());
        }
        assert!(satisfies("3.13.18", ">=3.11,<3.14"));
        assert!(satisfies("2.9.8", ">=2.9.8"));
        assert!(!satisfies("2.9.8", ">=2.10"));
        assert!(!satisfies("3.13.18", ">=3.14"));
        assert!(!satisfies("3.13.18", "~=3.13"));
        assert!(!satisfies("3.13.18", ">=3.13,!=3.13.18"));
    }
}
