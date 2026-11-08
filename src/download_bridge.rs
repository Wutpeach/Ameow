//! Opt-in observable window using the same genuine coordinator as headless execution.
use ameow_next::download::{
    Coordinator, Phase, Snapshot,
    bridge_commands::{self, Command},
    request::{DownloadIntent, Quality},
    runtime::RuntimeManager,
};
use gpui::{prelude::*, *};
use std::{
    fs::File,
    io::Write,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, SyncSender},
    },
    time::{Duration, Instant},
};
struct Bridge {
    commands: SyncSender<Command>,
    coordinator: Arc<Coordinator>,
    ticks: u64,
    stop: Arc<AtomicBool>,
    stopped: Arc<AtomicBool>,
    started: Instant,
    exit_after: Option<Duration>,
    log: Option<SyncSender<String>>,
    last_revision: u64,
}
impl Bridge {
    fn new(
        coordinator: Arc<Coordinator>,
        intent: DownloadIntent,
        log: Option<File>,
        exit_after: Option<Duration>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let (commands, receiver) = mpsc::sync_channel(8);
        let backend = coordinator.clone();
        let stop = Arc::new(AtomicBool::new(false));
        let stop_owner = stop.clone();
        let stopped = Arc::new(AtomicBool::new(false));
        let acknowledged = stopped.clone();
        let worker = std::thread::Builder::new()
            .name("download-bridge-commands".into())
            .spawn(move || {
                bridge_commands::run(backend, intent, receiver, stop_owner, acknowledged)
            });
        if let Err(error) = worker {
            eprintln!(">>> Bridge command owner: {error}");
            stop.store(true, Ordering::Release);
            stopped.store(true, Ordering::Release);
        }
        let log = log.and_then(|mut file| {
            let (sender, receiver) = mpsc::sync_channel::<String>(64);
            match std::thread::Builder::new()
                .name("download-bridge-log".into())
                .spawn(move || {
                    while let Ok(line) = receiver.recv() {
                        if writeln!(file, "{line}").and_then(|_| file.flush()).is_err() {
                            break;
                        }
                    }
                }) {
                Ok(_) => Some(sender),
                Err(error) => {
                    eprintln!(">>> Bridge log owner: {error}");
                    None
                }
            }
        });
        let close_stop = stop.clone();
        window.on_window_should_close(cx, move |_, _| {
            close_stop.store(true, Ordering::Release);
            false
        });
        cx.spawn_in(window,async move|entity,cx|{loop{cx.background_executor().timer(Duration::from_millis(16)).await;let done=entity.update_in(cx,|this,_,cx|{this.ticks+=1;let snapshot=this.coordinator.snapshot();
            if this.exit_after.is_some_and(|time|this.started.elapsed()>=time){this.stop.store(true,Ordering::Release);}
            if let Some(log)=&this.log && (snapshot.revision!=this.last_revision||this.ticks%30==0){let _=log.try_send(serde_json::json!({"foreground_ticks":this.ticks,"elapsed_ms":this.started.elapsed().as_millis(),"snapshot":snapshot}).to_string());}
            this.last_revision=snapshot.revision;cx.notify();
            if this.stopped.load(Ordering::Acquire)&&snapshot.resources_released&&(snapshot.phase.terminal()||snapshot.phase==Phase::Idle){cx.quit();true}else{false}
        });if !matches!(done,Ok(false)){break;}}}).detach();
        let _ = commands.try_send(Command::Start);
        Self {
            commands,
            coordinator,
            ticks: 0,
            stop,
            stopped,
            started: Instant::now(),
            exit_after,
            log,
            last_revision: 0,
        }
    }
}
impl Render for Bridge {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let snapshot: Snapshot = self.coordinator.snapshot();
        div()
            .flex()
            .flex_col()
            .gap_3()
            .p_6()
            .size_full()
            .bg(rgb(0x171b21))
            .text_color(rgb(0xe8edf3))
            .child("Ameow · Stage A live download probe")
            .child(format!("Foreground ticks: {}", self.ticks))
            .child(format!(
                "Job {} / attempt {} / revision {}",
                snapshot.job_id, snapshot.attempt, snapshot.revision
            ))
            .child(format!(
                "Phase: {:?} / terminal count {}",
                snapshot.phase, snapshot.terminal_count
            ))
            .child(snapshot.message)
            .child(
                div()
                    .flex()
                    .gap_4()
                    .child(
                        div()
                            .id("cancel")
                            .px_4()
                            .py_2()
                            .bg(rgb(0x394454))
                            .cursor_pointer()
                            .child("Cancel")
                            .on_click(cx.listener(|this, _, _, _| {
                                let _ = this.commands.try_send(Command::Cancel);
                            })),
                    )
                    .child(
                        div()
                            .id("retry-cleanup")
                            .px_4()
                            .py_2()
                            .bg(rgb(0x394454))
                            .cursor_pointer()
                            .child("Retry cleanup")
                            .on_click(cx.listener(|this, _, _, _| {
                                let _ = this.commands.try_send(Command::Retry);
                            })),
                    )
                    .child(
                        div()
                            .id("start")
                            .px_4()
                            .py_2()
                            .bg(rgb(0x394454))
                            .cursor_pointer()
                            .child("Start again")
                            .on_click(cx.listener(|this, _, _, _| {
                                if !this.stop.load(Ordering::Acquire) {
                                    let _ = this.commands.try_send(Command::Start);
                                }
                            })),
                    ),
            )
    }
}
pub fn run() -> Result<(), String> {
    let args: Vec<_> = std::env::args().collect();
    let value = |name: &str| {
        args.iter()
            .position(|s| s == name)
            .and_then(|i| args.get(i + 1))
            .cloned()
    };
    let url = value("--url").ok_or("--download-test-bridge requires --url")?;
    let output = PathBuf::from(value("--output").ok_or("--output required")?);
    let runtime = value("--runtime-root")
        .map(PathBuf::from)
        .map_or_else(RuntimeManager::default_root, Ok)?;
    let quality = match value("--quality").as_deref() {
        None | Some("highest") => Quality::Highest,
        Some("balanced") => Quality::Balanced,
        Some("saver") => Quality::Saver,
        _ => return Err("--quality highest|balanced|saver".into()),
    };
    let log = value("--bridge-log")
        .map(File::create)
        .transpose()
        .map_err(|e| e.to_string())?;
    let exit = value("--safe-exit-after-ms")
        .map(|s| s.parse::<u64>().map(Duration::from_millis))
        .transpose()
        .map_err(|e| e.to_string())?;
    let coordinator = Arc::new(ameow_next::download::composition::coordinator(runtime));
    gpui_platform::application().run(move |cx: &mut App| {
        let result = cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    point(px(100.), px(100.)),
                    size(px(720.), px(380.)),
                ))),
                titlebar: Some(TitlebarOptions {
                    title: Some("Ameow Stage A".into()),
                    ..Default::default()
                }),
                ..Default::default()
            },
            move |window, cx| {
                cx.new(|cx| {
                    Bridge::new(
                        coordinator,
                        DownloadIntent {
                            url,
                            quality,
                            output_dir: output,
                        },
                        log,
                        exit,
                        window,
                        cx,
                    )
                })
            },
        );
        if let Err(error) = result {
            eprintln!(">>> Bridge native window: {error}");
            cx.quit();
        }
        cx.activate(true);
    });
    Ok(())
}
