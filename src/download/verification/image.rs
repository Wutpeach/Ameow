use crate::download::{
    output::{self, VerifiedMedia},
    process_supervisor::{self, Control, ProcessObservation, ProcessSpec},
    runtime::{self, RuntimeLease},
};
use std::{fs::File, io::Read, path::Path, sync::Arc, time::Duration};

fn supported_header(bytes: &[u8]) -> bool {
    bytes.starts_with(b"\x89PNG\r\n\x1a\n")
        || bytes.starts_with(b"\xff\xd8\xff")
        || bytes.starts_with(b"GIF87a")
        || bytes.starts_with(b"GIF89a")
        || (bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"))
        || (bytes.get(4..8) == Some(b"ftyp")
            && matches!(bytes.get(8..12), Some(b"avif") | Some(b"avis")))
}
pub fn verify(
    path: &Path,
    workspace: &Path,
    lease: &RuntimeLease,
    control: &Control,
    observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>,
) -> Result<VerifiedMedia, String> {
    let media = output::verify_data(path, workspace)?;
    let mut header = [0; 32];
    let length = File::open(&media.path)
        .and_then(|mut f| f.read(&mut header))
        .map_err(|e| e.to_string())?;
    if !supported_header(&header[..length]) {
        return Err("Image has an unsupported or invalid file signature".into());
    }
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
                media.path.display().to_string(),
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
    )?;
    if outcome.exit_code != 0
        || !outcome.facts.resources_releasable()
        || outcome.facts.stderr_truncated
    {
        return Err("Image could not be completely decoded".into());
    }
    Ok(media)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn html_and_partial_headers_are_not_images() {
        assert!(!supported_header(b"<html>access denied</html>"));
        assert!(!supported_header(b"\x89PNG"));
        assert!(supported_header(b"\x89PNG\r\n\x1a\n"));
        assert!(supported_header(b"RIFFxxxxWEBP"));
    }
}
