use crate::download::{
    output::{self, VerifiedMedia},
    process_supervisor::{self, Control, ProcessObservation, ProcessSpec},
    runtime::{self, RuntimeLease},
};
use std::{fs, path::Path, sync::Arc, time::Duration};
pub fn verify(
    path: &Path,
    workspace: &Path,
    lease: &RuntimeLease,
    control: &Control,
    observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>,
) -> Result<VerifiedMedia, String> {
    let media = output::verify_data(path, workspace)?;
    decode(&media.path, workspace, lease, control, observer)?;
    Ok(media)
}
pub(super) fn decode(path: &Path, workspace: &Path, lease: &RuntimeLease, control: &Control, observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>) -> Result<(), String> {
    // Decode the completed image; a success event or a valid header alone cannot prove usable content.
    let cancelled = control.is_cancelled();
    let recovery = Control::default();
    let outcome = process_supervisor::run(
        ProcessSpec {
            executable: lease.file("ffmpeg.exe")?,
            args: vec![
                "-nostdin".into(),
                "-v".into(),
                "error".into(),
                "-xerror".into(),
                "-i".into(),
                path.display().to_string(),
                "-map".into(),
                "0:v:0".into(),
                "-f".into(),
                "null".into(),
                "-".into(),
            ],
            cwd: workspace.into(),
            env: runtime::child_environment(workspace)?,
            stdout_limit: 4096,
            stderr_limit: 65536,
            timeout: Some(Duration::from_secs(if cancelled { 1 } else { 30 })),
        },
        if cancelled { &recovery } else { control },
        observer,
    ).map_err(|e| format!("E_MEDIA_UNVERIFIED: image decoder execution: {e}"))?;
    fs::write(workspace.join("media-decode-stderr.log"), &outcome.stderr).map_err(|e| e.to_string())?;
    if !outcome.facts.resources_releasable()
    {
        return Err("E_MEDIA_UNVERIFIED: image decoding evidence incomplete".into());
    }
    if outcome.exit_code != 0 {
        if outcome.facts.stderr_truncated { return Err("E_MEDIA_UNVERIFIED: incomplete decoder failure evidence".into()); }
        return Err("E_MEDIA_INVALID: image could not be completely decoded".into());
    }
    Ok(())
}
