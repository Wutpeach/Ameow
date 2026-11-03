//! Background-only command owner shared by the native bridge and lifecycle regressions.
use super::{Coordinator, Phase, request::DownloadIntent};
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc::{Receiver, RecvTimeoutError},
    },
    time::Duration,
};
pub enum Command {
    Start,
    Cancel,
    Retry,
}
pub fn run(
    backend: Arc<Coordinator>,
    intent: DownloadIntent,
    receiver: Receiver<Command>,
    stop: Arc<AtomicBool>,
    acknowledged: Arc<AtomicBool>,
) {
    let mut cancelled_job = None;
    loop {
        if stop.load(Ordering::Acquire) {
            let snapshot = backend.snapshot();
            if (snapshot.phase.terminal() || snapshot.phase == Phase::Idle)
                && snapshot.resources_released
            {
                acknowledged.store(true, Ordering::Release);
                break;
            }
            if cancelled_job != Some(snapshot.job_id) {
                backend.cancel(snapshot.job_id);
                cancelled_job = Some(snapshot.job_id);
            }
        }
        match receiver.recv_timeout(Duration::from_millis(20)) {
            Ok(Command::Start) if !stop.load(Ordering::Acquire) => {
                let _ = backend.accept(intent.clone());
            }
            Ok(Command::Start) => {}
            Ok(Command::Cancel) => {
                backend.cancel(backend.snapshot().job_id);
            }
            Ok(Command::Retry) => {
                backend.retry_cleanup(backend.snapshot().job_id);
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {
                stop.store(true, Ordering::Release);
                std::thread::sleep(Duration::from_millis(20));
            }
        }
    }
}
