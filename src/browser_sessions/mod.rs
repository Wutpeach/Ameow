//! Site-scoped browser sessions. No raw credential implements Debug or enters a projection.
pub mod native;
mod protection;
#[cfg(test)]
mod tests;

use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

pub const MAX_MESSAGE: usize = 512 * 1024;
const MAX_DATABASE: u64 = 16 * 1024 * 1024;
type Result<T> = std::result::Result<T, String>;
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn invalid() -> String {
    "E_SESSION_INVALID".into()
}
fn storage() -> String {
    "E_SESSION_STORAGE".into()
}
pub fn id() -> Result<String> {
    use ring::rand::{SecureRandom, SystemRandom};
    let mut bytes = [0u8; 16];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| storage())?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
fn valid_id(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|b| b.is_ascii_hexdigit())
}
pub fn valid_site(site: &str) -> bool {
    site.len() <= 253
        && site.contains('.')
        && site.parse::<std::net::IpAddr>().is_err()
        && psl::domain(site.as_bytes()).is_some_and(|domain| domain.as_bytes() == site.as_bytes())
        && site.split('.').all(|part| {
            !part.is_empty()
                && part.len() <= 63
                && !part.starts_with('-')
                && !part.ends_with('-')
                && part
                    .bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
        })
}
pub fn within(host: &str, site: &str) -> bool {
    host == site
        || host
            .strip_suffix(site)
            .is_some_and(|prefix| prefix.ends_with('.'))
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Cookie {
    pub domain: String,
    pub path: String,
    pub name: String,
    pub value: String,
    pub secure: bool,
    pub http_only: bool,
    pub host_only: bool,
    pub expires: Option<u64>,
}
impl Cookie {
    fn validate(&self, site: &str) -> Result<()> {
        let domain = self.domain.trim_start_matches('.');
        if !within(domain, site)
            || !self.path.starts_with('/')
            || self.path.len() > 4096
            || self.name.len() > 4096
            || self.value.len() > 16384
            || [&self.domain, &self.path, &self.name, &self.value]
                .iter()
                .any(|s| s.chars().any(char::is_control))
            || self.name.chars().any(|c| matches!(c, ';' | '='))
        {
            return Err(invalid());
        }
        Ok(())
    }
    fn line(&self) -> String {
        let domain = self.domain.trim_start_matches('.');
        format!(
            "{}{}{}\t{}\t{}\t{}\t{}\t{}\t{}\n",
            if self.http_only { "#HttpOnly_" } else { "" },
            if self.host_only { "" } else { "." },
            domain,
            if self.host_only { "FALSE" } else { "TRUE" },
            self.path,
            if self.secure { "TRUE" } else { "FALSE" },
            self.expires.unwrap_or(0),
            self.name,
            self.value
        )
    }
}
#[derive(Clone, Serialize, Deserialize)]
struct Session {
    site: String,
    source_id: String,
    source_name: String,
    grant_id: String,
    sequence: u64,
    synced_at: u64,
    cookies: Vec<Cookie>,
    skipped_partitioned: usize,
}
#[derive(Default, Serialize, Deserialize)]
struct Database {
    sessions: BTreeMap<String, Session>,
    #[serde(default)]
    retired: BTreeSet<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct SiteView {
    pub site: String,
    pub source_id: String,
    pub source_name: String,
    pub grant_id: String,
    pub synced_at: u64,
    pub cookie_count: usize,
    pub skipped_partitioned: usize,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Status {
    pub sites: Vec<SiteView>,
    pub error: Option<String>,
    pub notice: Option<String>,
}
impl Session {
    fn view(&self) -> SiteView {
        SiteView {
            site: self.site.clone(),
            source_id: self.source_id.clone(),
            source_name: self.source_name.clone(),
            grant_id: self.grant_id.clone(),
            synced_at: self.synced_at,
            cookie_count: self
                .cookies
                .iter()
                .filter(|c| c.expires.is_none_or(|t| t > now()))
                .count(),
            skipped_partitioned: self.skipped_partitioned,
        }
    }
}
#[derive(Deserialize, Serialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
pub enum Operation {
    List,
    Authorize {
        site: String,
        source_id: String,
        source_name: String,
        grant_id: String,
        replaces: Option<String>,
        cookies: Vec<Cookie>,
        skipped_partitioned: usize,
    },
    Sync {
        site: String,
        source_id: String,
        grant_id: String,
        sequence: u64,
        cookies: Vec<Cookie>,
        skipped_partitioned: usize,
    },
    Revoke {
        site: String,
        source_id: String,
        grant_id: String,
    },
}
#[derive(Clone)]
pub struct Store {
    directory: PathBuf,
}
impl Store {
    pub fn new(data_root: &Path) -> Self {
        Self {
            directory: data_root.join("browser-sessions"),
        }
    }
    fn locked<T>(&self, write: bool, action: impl FnOnce(&mut Database) -> Result<T>) -> Result<T> {
        if !write && !self.directory.exists() {
            return action(&mut Database::default());
        }
        if write {
            protection::directory(&self.directory)?;
        } else {
            crate::download::runtime::check_data_location(&self.directory)
                .map_err(|_| storage())?;
        }
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(self.directory.join("store.lock"))
            .map_err(|_| storage())?;
        let start = Instant::now();
        loop {
            match file.try_lock() {
                Ok(()) => break,
                Err(std::fs::TryLockError::WouldBlock)
                    if start.elapsed() < Duration::from_secs(5) =>
                {
                    std::thread::sleep(Duration::from_millis(10))
                }
                Err(_) => return Err(storage()),
            }
        }
        let path = self.directory.join("sessions.bin");
        let mut database = match File::open(&path) {
            Ok(file) => {
                if file.metadata().map_err(|_| storage())?.len() > MAX_DATABASE {
                    return Err(storage());
                }
                let mut bytes = Vec::new();
                file.take(MAX_DATABASE + 1)
                    .read_to_end(&mut bytes)
                    .map_err(|_| storage())?;
                serde_json::from_slice(&protection::unseal(&self.directory, &bytes)?)
                    .map_err(|_| storage())?
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Database::default(),
            Err(_) => return Err(storage()),
        };
        let result = action(&mut database)?;
        if write {
            let bytes = serde_json::to_vec(&database).map_err(|_| storage())?;
            if bytes.len() > MAX_DATABASE as usize {
                return Err(storage());
            }
            let bytes = protection::seal(&self.directory, &bytes)?;
            let mut temp =
                tempfile::NamedTempFile::new_in(&self.directory).map_err(|_| storage())?;
            temp.write_all(&bytes)
                .and_then(|_| temp.as_file().sync_all())
                .map_err(|_| storage())?;
            temp.persist(&path).map_err(|_| storage())?;
        }
        Ok(result)
    }
    pub fn list(&self) -> Result<Vec<SiteView>> {
        self.locked(false, |db| {
            Ok(db.sessions.values().map(Session::view).collect())
        })
    }
    pub fn remove(&self, site: &str, grant_id: &str) -> Result<()> {
        self.locked(true, |db| {
            if db
                .sessions
                .get(site)
                .is_some_and(|s| s.grant_id == grant_id)
            {
                db.sessions.remove(site);
                db.retired.insert(grant_id.to_owned());
            }
            Ok(())
        })
    }
    pub fn apply(&self, operation: Operation) -> Result<Vec<SiteView>> {
        if matches!(operation, Operation::List) {
            return self.list();
        }
        self.locked(true, |db| {
            match operation {
                Operation::List => unreachable!(),
                Operation::Authorize {
                    site,
                    source_id,
                    source_name,
                    grant_id,
                    replaces,
                    cookies,
                    skipped_partitioned,
                } => {
                    validate(&site, &source_id, &grant_id, &cookies)?;
                    if db.retired.contains(&grant_id) {
                        return Err("E_SESSION_REVOKED".into());
                    }
                    if source_name.len() > 80
                        || source_name.is_empty()
                        || source_name.chars().any(char::is_control)
                    {
                        return Err(invalid());
                    }
                    let current = db.sessions.get(&site);
                    if current.is_some_and(|s| s.grant_id == grant_id && s.source_id == source_id) {
                        return Ok(db.sessions.values().map(Session::view).collect());
                    }
                    if current.map(|s| s.grant_id.as_str()) != replaces.as_deref() {
                        return Err("E_SESSION_SOURCE_CHANGED".into());
                    }
                    if db.retired.len() >= 8192 {
                        return Err("E_SESSION_LIMIT".into());
                    }
                    if current.is_none() && db.sessions.len() >= 128 {
                        return Err("E_SESSION_LIMIT".into());
                    }
                    if let Some(old) = current {
                        db.retired.insert(old.grant_id.clone());
                    }
                    db.sessions.insert(
                        site.clone(),
                        Session {
                            site,
                            source_id,
                            source_name,
                            grant_id,
                            sequence: 0,
                            synced_at: now(),
                            cookies,
                            skipped_partitioned,
                        },
                    );
                }
                Operation::Sync {
                    site,
                    source_id,
                    grant_id,
                    sequence,
                    cookies,
                    skipped_partitioned,
                } => {
                    validate(&site, &source_id, &grant_id, &cookies)?;
                    let Some(session) = db
                        .sessions
                        .get_mut(&site)
                        .filter(|s| s.source_id == source_id && s.grant_id == grant_id)
                    else {
                        return Err("E_SESSION_REVOKED".into());
                    };
                    if sequence <= session.sequence {
                        return Err("E_SESSION_STALE".into());
                    }
                    session.sequence = sequence;
                    session.cookies = cookies;
                    session.synced_at = now();
                    session.skipped_partitioned = skipped_partitioned;
                }
                Operation::Revoke {
                    site,
                    source_id,
                    grant_id,
                } => {
                    if !valid_site(&site) || !valid_id(&source_id) || !valid_id(&grant_id) {
                        return Err(invalid());
                    }
                    let current = db.sessions.get(&site);
                    if current.is_some_and(|s| s.grant_id == grant_id && s.source_id != source_id) {
                        return Err(invalid());
                    }
                    // A revoke can overtake an initial authorize whose receipt was lost.
                    // Retire even unseen grants so that late delivery cannot restore consent.
                    if !db.retired.contains(&grant_id)
                        && db.retired.len() >= 8192
                        && current.is_none()
                    {
                        return Err("E_SESSION_LIMIT".into());
                    }
                    if db
                        .sessions
                        .get(&site)
                        .is_some_and(|s| s.source_id == source_id && s.grant_id == grant_id)
                    {
                        db.sessions.remove(&site);
                    }
                    db.retired.insert(grant_id);
                }
            }
            Ok(db.sessions.values().map(Session::view).collect())
        })
    }
    pub fn snapshot(&self, url: &str, workspace: &Path) -> Result<Option<Attempt>> {
        let url = url::Url::parse(url).map_err(|_| invalid())?;
        let host = url.host_str().ok_or_else(invalid)?;
        let session = self.locked(false, |db| {
            Ok(db
                .sessions
                .values()
                .filter(|s| within(host, &s.site))
                .max_by_key(|s| s.site.len())
                .cloned())
        })?;
        let Some(session) = session else {
            return Ok(None);
        };
        let directory = workspace.join("authentication");
        protection::directory(&directory)?;
        let path = directory.join("session.cookies");
        let mut jar = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|_| storage())?;
        jar.write_all(b"# Netscape HTTP Cookie File\n")
            .map_err(|_| storage())?;
        for cookie in &session.cookies {
            if cookie.expires.is_none_or(|t| t > now()) {
                jar.write_all(cookie.line().as_bytes())
                    .map_err(|_| storage())?;
            }
        }
        Ok(Some(Attempt {
            path,
            store: self.clone(),
            site: session.site,
            grant_id: session.grant_id,
        }))
    }
}
fn validate(site: &str, source: &str, grant: &str, cookies: &[Cookie]) -> Result<()> {
    if !valid_site(site) || !valid_id(source) || !valid_id(grant) || cookies.len() > 2048 {
        return Err(invalid());
    }
    for cookie in cookies {
        cookie.validate(site)?;
    }
    Ok(())
}
#[derive(Clone)]
pub struct Attempt {
    pub path: PathBuf,
    store: Store,
    site: String,
    grant_id: String,
}
impl Attempt {
    pub fn valid(&self) -> bool {
        self.store.list().is_ok_and(|v| {
            v.iter()
                .any(|s| s.site == self.site && s.grant_id == self.grant_id)
        })
    }
    pub fn arguments(&self) -> [String; 2] {
        ["--cookies".into(), self.path.display().to_string()]
    }
    pub fn watch(&self, control: crate::download::process_supervisor::Control) -> Result<Watch> {
        use std::sync::{
            Arc,
            atomic::{AtomicBool, Ordering},
        };
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let attempt = self.clone();
        let owner = std::thread::Builder::new()
            .name("site-authorization-lease".into())
            .spawn(move || {
                while !stopping.load(Ordering::Acquire) {
                    if !attempt.valid() {
                        control.cancel();
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(250));
                }
            })
            .map_err(|_| storage())?;
        Ok(Watch {
            stop,
            owner: Some(owner),
        })
    }
}
pub struct Watch {
    stop: std::sync::Arc<std::sync::atomic::AtomicBool>,
    owner: Option<std::thread::JoinHandle<()>>,
}
impl Drop for Watch {
    fn drop(&mut self) {
        self.stop.store(true, std::sync::atomic::Ordering::Release);
        if let Some(owner) = self.owner.take() {
            let _ = owner.join();
        }
    }
}
