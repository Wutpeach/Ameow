//! Development-only scene browser. Every scene runs in an owned preview process.
use crate::{preview, tokens};
use gpui::{prelude::*, *};
use gpui_base::{Button, Root};
use std::{fs, path::PathBuf, process::{Child, Command, Stdio}, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};
use std::os::windows::process::CommandExt;

const SOURCE: &str = env!("CARGO_MANIFEST_DIR");
const HIDDEN: u32 = 0x08000000;

struct PreviewProcess {
    child: Child,
    _directory: tempfile::TempDir,
    control: PathBuf,
    step: u64,
    pending: Option<Instant>,
}
impl PreviewProcess {
    fn start() -> anyhow::Result<Self> {
        let directory = tempfile::Builder::new().prefix("ameow-gallery-").tempdir()?;
        let control = directory.path().join("control.json");
        let log = fs::File::create(directory.path().join("stderr.log"))?;
        let child = Command::new(std::env::current_exe()?)
            .args(["--preview", "--preview-scene", "compact.idle", "--preview-control"])
            .arg(&control).arg("--reduced").current_dir(SOURCE)
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(log)
            .creation_flags(HIDDEN).spawn()?;
        Ok(Self { child, _directory: directory, control, step: 0, pending: None })
    }
    fn select(&mut self, scene: &str, night: bool) -> anyhow::Result<()> {
        self.step += 1;
        let pending = self.control.with_extension("tmp");
        fs::write(&pending, serde_json::to_vec(&serde_json::json!({"step":self.step,"scene":scene,"night":night}))?)?;
        let deadline = Instant::now() + Duration::from_millis(100);
        loop {
            match fs::rename(&pending, &self.control) {
                Ok(()) => break,
                Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied && Instant::now() < deadline => std::thread::sleep(Duration::from_millis(5)),
                Err(error) => return Err(error.into()),
            }
        }
        self.pending = Some(Instant::now());
        Ok(())
    }
    fn poll(&mut self, scene: &str, night: bool) -> anyhow::Result<bool> {
        if let Some(status) = self.child.try_wait()? { anyhow::bail!("预览已退出（{status}），请点击“重新打开预览”"); }
        let Some(started) = self.pending else { return Ok(false); };
        if started.elapsed() > Duration::from_secs(20) { self.pending = None; anyhow::bail!("场景切换超时，请重新选择场景"); }
        let Ok(bytes) = fs::read(self.control.with_extension("ack.json")) else { return Ok(false); };
        let Ok(ack) = serde_json::from_slice::<serde_json::Value>(&bytes) else { return Ok(false); };
        if ack["step"].as_u64() != Some(self.step) || ack["pid"].as_u64() != Some(self.child.id() as u64) { return Ok(false); }
        self.pending = None;
        if let Some(error) = ack["error"].as_str() { anyhow::bail!("无法切换场景：{error}"); }
        if ack["scene"].as_str() != Some(scene) || ack["night"].as_bool() != Some(night) { anyhow::bail!("场景或主题回执不匹配"); }
        Ok(true)
    }
}
impl Drop for PreviewProcess {
    fn drop(&mut self) {
        self.step += 1;
        let pending = self.control.with_extension("tmp");
        let _ = fs::write(&pending, serde_json::json!({"step":self.step,"quit":true}).to_string());
        let _ = fs::rename(pending, &self.control);
        let until = Instant::now() + Duration::from_millis(350);
        while Instant::now() < until {
            if self.child.try_wait().ok().flatten().is_some() { return; }
            std::thread::sleep(Duration::from_millis(10));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

struct Gallery {
    scenes: Vec<preview::Scene>,
    surface: String,
    selected: usize,
    night: bool,
    session: Option<PreviewProcess>,
    notice: String,
    error: bool,
    accepted_at: Option<Instant>,
    output: PathBuf,
    image: Option<PathBuf>,
    capture: Option<(Child, PathBuf, PathBuf)>,
    batch: Option<(Child, PathBuf, PathBuf)>,
    serial: u64,
    scroll: ScrollHandle,
}
fn group_name(surface: &str) -> &'static str {
    match surface {
        "compact" => "Compact", "full" => "Full", "queue" => "队列",
        "settings" => "设置", "components" => "组件管理", "diagnostics" => "诊断",
        "tray" => "托盘", "menu" => "菜单", "overlay" => "退出确认", _ => "其他",
    }
}
impl Gallery {
    fn new(output: PathBuf, cx: &mut Context<Self>) -> Self {
        let scenes = preview::scenes();
        let surface = scenes[0].surface.clone();
        let mut this = Self {
            scenes, surface, selected: 0, night: false, session: None,
            notice: String::new(), error: false, accepted_at: None,
            output, image: None, capture: None, batch: None, serial: 0, scroll: ScrollHandle::new(),
        };
        match PreviewProcess::start() {
            Ok(process) => { this.session = Some(process); this.select(0); }
            Err(error) => { this.error = true; this.notice = format!("无法打开隔离预览：{error}"); }
        }
        cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor().timer(Duration::from_millis(100)).await;
                if this.update(cx, |this, cx| { this.poll(); cx.notify(); }).is_err() { break; }
            }
        }).detach();
        this
    }
    fn select(&mut self, index: usize) {
        if self.capture.is_some() || self.batch.is_some() { return; }
        self.selected = index;
        self.image = None;
        self.accepted_at = None;
        self.error = false;
        if self.session.is_none() {
            match PreviewProcess::start() {
                Ok(session) => self.session = Some(session),
                Err(error) => { self.error = true; self.notice = format!("无法打开隔离预览：{error}，请重试"); return; }
            }
        }
        if let Some(session) = &mut self.session {
            match session.select(&self.scenes[index].name, self.night) {
                Ok(()) => self.notice = "正在切换场景…".into(),
                Err(error) => { self.error = true; self.notice = format!("无法切换场景：{error}"); }
            }
        }
    }
    fn poll(&mut self) {
        if let Some(result) = self.session.as_mut().map(|session| session.poll(&self.scenes[self.selected].name, self.night)) {
            match result {
                Ok(true) => { self.accepted_at = Some(Instant::now()); self.notice = "真实预览窗口已切换，可查看或截图".into(); }
                Err(error) => { self.session = None; self.error = true; self.accepted_at = None; self.notice = error.to_string(); }
                _ => {}
            }
        }
        let finished = self.capture.as_mut().and_then(|(child, _, _)| child.try_wait().transpose());
        if let Some(result) = finished {
            let (mut child, path, log) = self.capture.take().unwrap();
            match result {
                Ok(status) if status.success() => { self.error = false; self.notice = format!("截图已保存：{}", path.display()); self.image = Some(path); }
                _ => { let _ = child.kill(); let _ = child.wait(); self.error = true; self.notice = format!("截图失败，请检查日志：{}", log.display()); }
            }
        }
        let finished = self.batch.as_mut().and_then(|(child, _, _)| child.try_wait().transpose());
        if let Some(result) = finished {
            let (mut child, output, _) = self.batch.take().unwrap();
            let manifest = fs::read(output.join("manifest.json")).ok()
                .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok());
            match result {
                Ok(status) if status.success() && manifest.as_ref().is_some_and(|m| m["complete"] == true) => { self.error = false; self.notice = format!("截图总览已保存：{}", output.join("index.html").display()); }
                _ if manifest.as_ref().is_some_and(|m| m["status"] == "cancelled") => { self.error = false; self.notice = format!("已取消，已完成的证据保留在：{}", output.display()); }
                _ => { let _ = child.kill(); let _ = child.wait(); self.error = true; self.notice = format!("批量截图未完成，已保留证据；日志：{}", output.with_extension("log").display()); }
            }
        } else if let Some((_, output, cancel)) = &self.batch {
            if !cancel.exists() {
                if let Ok(bytes) = fs::read(output.join("manifest.json")) {
                    if let Ok(manifest) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                        let done = manifest["captures"].as_array().map_or(0, Vec::len);
                        self.notice = format!("正在截图 {done}/{}；可点击“取消截图”，已完成的证据会保留。", manifest["expected_count"]);
                    }
                }
            }
        }
    }
    fn capture(&mut self) {
        if !self.ready() { return; }
        self.error = false;
        let Some(session) = &self.session else { return; };
        self.serial += 1;
        let theme = if self.night { "dark" } else { "light" };
        let path = self.output.join(format!("{theme}-{}-{}.png", self.scenes[self.selected].name, self.serial));
        let log = path.with_extension("log");
        let spawn = (|| -> anyhow::Result<Child> {
            fs::create_dir_all(&self.output)?;
            let file = fs::File::create(&log)?;
            Ok(Command::new("python").arg(PathBuf::from(SOURCE).join("scripts/preview_capture.py"))
                .arg("--pid").arg(session.child.id().to_string())
                .arg("--scene").arg(&self.scenes[self.selected].name)
                .arg("--exe").arg(std::env::current_exe()?).arg("--output").arg(&path)
                .arg("--receipt").arg(session.control.with_extension("ack.json")).arg("--present")
                .current_dir(SOURCE).stdin(Stdio::null()).stdout(Stdio::null()).stderr(file)
                .creation_flags(HIDDEN).spawn()?)
        })();
        match spawn {
            Ok(child) => { self.notice = "正在截取真实窗口…".into(); self.capture = Some((child, path, log)); }
            Err(error) => { self.error = true; self.notice = format!("无法启动截图：{error}；需要本机 Python 与 Pillow"); }
        }
    }
    fn ready(&self) -> bool {
        self.session.is_some() && self.capture.is_none() && self.batch.is_none() && self.accepted_at.is_some_and(|at| at.elapsed() >= Duration::from_millis(500))
    }
    fn capture_all(&mut self, current_group: bool) {
        if !self.ready() { return; }
        self.error = false;
        self.serial += 1;
        let output = self.output.join(format!("all-{}", self.serial));
        let cancel = output.with_extension("cancel");
        let spawn = (|| -> anyhow::Result<Child> {
            fs::create_dir_all(&self.output)?;
            let file = fs::File::create(output.with_extension("log"))?;
            let mut command = Command::new("python");
            command.arg(PathBuf::from(SOURCE).join("scripts/gallery.py"))
                .arg("--exe").arg(std::env::current_exe()?).args(["--all","--theme","both","--settle","0.8"])
                .arg("--output").arg(&output).arg("--cancel-file").arg(&cancel)
                .current_dir(SOURCE).stdin(Stdio::null()).stdout(file.try_clone()?).stderr(file)
                .creation_flags(HIDDEN);
            if current_group { command.arg("--surface").arg(&self.surface); }
            Ok(command.spawn()?)
        })();
        match spawn {
            Ok(child) => { self.notice = "正在生成双主题截图，可点击“取消截图”。".into(); self.batch = Some((child, output, cancel)); }
            Err(error) => { self.error = true; self.notice = format!("无法启动批量截图：{error}"); }
        }
    }
    fn cancel_batch(&mut self) {
        if let Some((_, _, cancel)) = &self.batch {
            match fs::write(cancel, "cancel") {
                Ok(()) => self.notice = "正在取消并关闭本轮预览…".into(),
                Err(error) => { self.error = true; self.notice = format!("无法取消截图：{error}，请重试"); }
            }
        }
    }
    fn button(&self, id: impl Into<ElementId>, label: impl Into<SharedString>, selected: bool) -> Button {
        let p = tokens::Palette::new(self.night);
        Button::new(id).accessibility_label(label).h(px(32.)).px(px(10.))
            .rounded(px(tokens::CONTROL_RADIUS)).border_1().border_color(if selected { p.blue } else { p.control_border() })
            .bg(if selected { p.badge } else { p.surface }).text_color(p.primary_text())
            .font(tokens::desktop_ui_font()).text_size(px(13.)).line_height(px(20.))
            .hover(move |s| s.bg(p.badge)).focus(move |s| s.border_color(p.blue))
    }
}
impl Drop for Gallery {
    fn drop(&mut self) {
        if let Some((child, _, _)) = &mut self.capture { let _ = child.kill(); let _ = child.wait(); }
        if let Some((child, _, cancel)) = &mut self.batch {
            let _ = fs::write(cancel, "cancel");
            let until = Instant::now() + Duration::from_secs(5);
            while Instant::now() < until {
                if child.try_wait().ok().flatten().is_some() { return; }
                std::thread::sleep(Duration::from_millis(20));
            }
            // The CLI's kill-on-close Job also settles its owned preview.
            let _ = child.kill(); let _ = child.wait();
        }
    }
}
impl Render for Gallery {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        tokens::sync_kit_theme(self.night, cx);
        let p = tokens::Palette::new(self.night);
        let busy = self.capture.is_some() || self.batch.is_some();
        let mut groups = Vec::<String>::new();
        for scene in &self.scenes { if !groups.contains(&scene.surface) { groups.push(scene.surface.clone()); } }
        let mut sidebar = div().w(px(144.)).flex_none().p(px(12.)).flex().flex_col().gap(px(6.)).border_r_1().border_color(p.border);
        for (index, group) in groups.into_iter().enumerate() {
            let label = group_name(&group);
            let count = self.scenes.iter().filter(|s| s.surface == group).count();
            let text = format!("{label}  {count}");
            sidebar = sidebar.child(self.button(("gallery-group",index), text.clone(), group == self.surface)
                .disabled(busy).w_full().justify_start().child(text)
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.surface = group.clone(); this.scroll.set_offset(point(px(0.),px(0.)));
                    if let Some(index) = this.scenes.iter().position(|s| s.surface == group) { this.select(index); }
                    cx.notify();
                })));
        }
        let mut list = div().id("gallery-scenes").w(px(280.)).flex_none().h_full().overflow_y_scroll()
            .track_scroll(&self.scroll).p(px(12.)).flex().flex_col().gap(px(6.)).border_r_1().border_color(p.border);
        for (index, scene) in self.scenes.iter().enumerate().filter(|(_,s)| s.surface == self.surface) {
            let label = scene.name.clone();
            list = list.child(self.button(("gallery-scene",index), label.clone(), index == self.selected)
                .disabled(busy).w_full().h_auto().min_h(px(52.)).py(px(6.)).flex_col().items_start().gap(px(4.))
                .child(div().text_size(px(12.)).child(label))
                .child(div().text_size(px(12.)).text_color(p.neutral).child(scene.description.clone()))
                .on_click(cx.listener(move |this, _, _, cx| { this.select(index); cx.notify(); })));
        }
        let scene = &self.scenes[self.selected];
        let detail = div().flex_1().min_w(px(0.)).h_full().p(px(20.)).flex().flex_col().gap(px(12.))
            .child(div().text_size(px(18.)).font_weight(FontWeight::MEDIUM).child(scene.name.clone()))
            .child(div().text_color(p.neutral).child(scene.description.clone()))
            .child(div().flex().flex_wrap().gap(px(8.))
                .child(self.button("gallery-light","浅色",!self.night).disabled(busy).child("浅色")
                    .on_click(cx.listener(|this,_,_,cx|{this.night=false;this.select(this.selected);cx.notify();})))
                .child(self.button("gallery-dark","深色",self.night).disabled(busy).child("深色")
                    .on_click(cx.listener(|this,_,_,cx|{this.night=true;this.select(this.selected);cx.notify();})))
                .when(self.session.is_none(), |s| s.child(self.button("gallery-reopen","重新打开预览",false).disabled(busy).child("重新打开预览")
                    .on_click(cx.listener(|this,_,_,cx|{this.select(this.selected);cx.notify();})))))
            .child(div().flex().flex_wrap().gap(px(8.))
                .child(self.button("gallery-capture","截图",false).disabled(!self.ready()).child("截图")
                    .on_click(cx.listener(|this,_,_,cx|{this.capture();cx.notify();})))
                .child(self.button("gallery-capture-group","本分类截图",false).disabled(!self.ready()).child("本分类截图")
                    .on_click(cx.listener(|this,_,_,cx|{this.capture_all(true);cx.notify();})))
                .child(self.button("gallery-capture-all","全部截图",false).disabled(!self.ready()).child("全部截图")
                    .on_click(cx.listener(|this,_,_,cx|{this.capture_all(false);cx.notify();})))
                .when(self.batch.is_some(), |s| s.child(self.button("gallery-cancel","取消截图",false).child("取消截图")
                    .on_click(cx.listener(|this,_,_,cx|{this.cancel_batch();cx.notify();})))))
            .child(div().text_size(px(12.)).text_color(if self.error { p.red } else { p.neutral }).child(self.notice.clone()))
            .child(div().flex_1().min_h(px(100.)).flex().items_center().justify_center().border_1().border_color(p.border)
                .rounded(px(8.)).overflow_hidden()
                .when_some(self.image.clone(), |s,path| s.child(img(path).max_w_full().max_h_full().object_fit(ObjectFit::Contain)))
                .when(self.image.is_none(), |s| s.child(div().p(px(16.)).text_color(p.neutral).child("在真实预览窗口中检查交互，或点击“截图”在此查看。"))))
            .child(div().text_size(px(12.)).text_color(p.neutral)
                .child(format!("“本分类截图”截取当前分类的双主题状态；“全部截图”会依次显示 {} 个真实窗口，约 3–5 分钟，请在桌面空闲时使用。", self.scenes.len()*2)));
        div().size_full().bg(p.surface).text_color(p.primary_text()).font(tokens::desktop_ui_font())
            .text_size(px(13.)).line_height(px(20.)).flex().flex_col()
            .child(div().h(px(64.)).px(px(20.)).flex().items_center().justify_between().border_b_1().border_color(p.border)
                .child(div().text_size(px(20.)).font_weight(FontWeight::MEDIUM).child("Ameow Gallery"))
                .child(div().text_size(px(12.)).text_color(p.neutral).child(format!("{} 个真实场景 · 隔离预览", self.scenes.len()))))
            .child(div().flex_1().min_h(px(0.)).flex().child(sidebar).child(list).child(detail))
    }
}

pub fn run() -> anyhow::Result<()> {
    let args: Vec<_> = std::env::args().collect();
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
    let output = args.iter().position(|a| a == "--gallery-output").and_then(|i| args.get(i+1)).map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(SOURCE).join(format!("evidence/gallery-{stamp}")));
    gpui_platform::application().with_assets(crate::Assets).run(move |cx| {
        gpui_base::init(cx);
        cx.text_system().add_fonts(tokens::LATIN_FONT_BYTES.into_iter().map(std::borrow::Cow::Borrowed).collect()).expect("Gallery fonts");
        cx.open_window(WindowOptions {
            titlebar: Some(TitlebarOptions { title: Some("Ameow Gallery".into()), ..Default::default() }),
            window_bounds: Some(WindowBounds::Windowed(Bounds::centered(None,size(px(1024.),px(720.)),cx))),
            window_min_size: Some(size(px(840.),px(520.))),
            ..Default::default()
        }, move |window,cx| {
            window.on_window_should_close(cx,|_,cx|{cx.quit();true});
            let view = cx.new(|cx|Gallery::new(output,cx));
            cx.new(|cx|Root::new(view,window,cx))
        }).expect("Gallery native window");
        cx.activate(true);
    });
    Ok(())
}
