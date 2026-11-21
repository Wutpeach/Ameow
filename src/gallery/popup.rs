//! Gallery launcher for the real HTML Popup workbench; never runs product services.
use std::{fs, io::Read, path::PathBuf, process::{Child, Command, Stdio}, time::{Duration, Instant}};

pub const URL: &str = "http://127.0.0.1:4322/";

#[derive(Default, PartialEq)]
enum State { #[default] Idle, Starting, Ready, Stopped, Failed }

#[derive(Default)]
pub struct PopupPreview {
    state: State,
    session: Option<Session>,
    pub message: String,
}
struct Session {
    child: Child,
    directory: tempfile::TempDir,
    started: Instant,
    ready: bool,
    owned: bool,
}
#[derive(serde::Deserialize)]
struct Receipt {
    state: String,
    url: Option<String>,
    owned: Option<bool>,
    message: Option<String>,
}

impl PopupPreview {
    pub fn starting(&self) -> bool { self.state == State::Starting }
    pub fn ready(&self) -> bool { self.state == State::Ready }
    pub fn failed(&self) -> bool { self.state == State::Failed }
    pub fn can_stop(&self) -> bool { self.ready() && self.session.as_ref().is_some_and(|s| s.owned) }
    pub fn status(&self) -> &'static str {
        match self.state {
            State::Idle => "未启动", State::Starting => "启动中", State::Ready => "运行中",
            State::Stopped => "已停止", State::Failed => "不可用",
        }
    }
    pub fn open(&mut self) -> Option<&'static str> {
        if self.starting() { return None; }
        if self.ready() && self.session.as_mut().is_some_and(|s| matches!(s.child.try_wait(), Ok(None))) { return Some(URL); }
        self.session = None;
        self.message.clear();
        let start = (|| -> anyhow::Result<Session> {
            let directory = tempfile::Builder::new().prefix("ameow-popup-preview-").tempdir()?;
            let log = fs::File::create(directory.path().join("stderr.log"))?;
            let mut command = Command::new("node");
            command.arg(PathBuf::from(super::SOURCE).join("browser-extension/preview/launch.mjs"))
                .arg("--receipt").arg(directory.path().join("receipt.json"))
                .current_dir(super::SOURCE).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(log);
            let child = super::hide_console(&mut command).spawn()
                .map_err(|error| anyhow::anyhow!("无法启动 Node.js：{error}。请安装 Node.js 并重新打开 Gallery。"))?;
            Ok(Session { child, directory, started: Instant::now(), ready: false, owned: false })
        })();
        match start {
            Ok(session) => { self.session = Some(session); self.state = State::Starting; }
            Err(error) => { self.state = State::Failed; self.message = error.to_string(); }
        }
        None
    }
    pub fn poll(&mut self) -> Option<&'static str> {
        let result = self.session.as_mut()?.poll();
        match result {
            Ok(true) => { self.state = State::Ready; Some(URL) }
            Ok(false) => None,
            Err(error) => {
                self.session = None;
                self.state = State::Failed;
                self.message = error.to_string();
                None
            }
        }
    }
    pub fn stop(&mut self) {
        self.session = None;
        self.state = State::Stopped;
        self.message.clear();
    }
}
impl Session {
    fn poll(&mut self) -> anyhow::Result<bool> {
        let receipt = fs::read(self.directory.path().join("receipt.json")).ok()
            .and_then(|bytes| serde_json::from_slice::<Receipt>(&bytes).ok());
        if let Some(receipt) = &receipt {
            if receipt.state == "error" { anyhow::bail!("{}", receipt.message.as_deref().unwrap_or("预览服务不可用，请重试。")); }
        }
        if let Some(status) = self.child.try_wait()? {
            let mut log = String::new();
            if let Ok(file) = fs::File::open(self.directory.path().join("stderr.log")) { let _ = file.take(2048).read_to_string(&mut log); }
            anyhow::bail!("预览服务已退出（{status}）。{}", log.trim());
        }
        if !self.ready {
            if let Some(receipt) = receipt {
                anyhow::ensure!(receipt.state == "ready" && receipt.url.as_deref() == Some(URL) && receipt.owned.is_some(), "预览回执不匹配，请重新打开。");
                self.owned = receipt.owned.unwrap_or(false);
                self.ready = true;
                return Ok(true);
            }
            anyhow::ensure!(self.started.elapsed() < Duration::from_secs(20), "预览启动超时，请重试。");
        }
        Ok(false)
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        // EOF asks the controller to close only its own listener. Reused servers survive.
        self.child.stdin.take();
        let until = Instant::now() + Duration::from_millis(350);
        while Instant::now() < until {
            if self.child.try_wait().ok().flatten().is_some() { return; }
            std::thread::sleep(Duration::from_millis(10));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
