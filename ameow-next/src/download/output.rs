use super::{
    plan::FormatPlan,
    process_supervisor::{self, Control, ProcessObservation, ProcessSpec},
    runtime::{RuntimeLease, hash},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs::{self, OpenOptions},
    io::{Seek, SeekFrom, Write},
    os::windows::{
        ffi::OsStrExt,
        fs::{MetadataExt, OpenOptionsExt},
        io::AsRawHandle,
    },
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use windows_sys::Win32::Storage::FileSystem::{
    DELETE, FILE_DISPOSITION_INFO, FILE_RENAME_INFO, FILE_RENAME_INFO_0, FileDispositionInfo,
    FileRenameInfo, MoveFileW, SetFileInformationByHandle,
};

pub fn move_no_replace(source: &Path, destination: &Path) -> Result<(), std::io::Error> {
    let a: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let b: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    if unsafe { MoveFileW(a.as_ptr(), b.as_ptr()) } == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VerifiedMedia {
    pub path: PathBuf,
    pub bytes: u64,
    pub sha256: String,
    pub streams: Value,
    #[serde(skip)]
    pub identity_guard: Option<Arc<fs::File>>,
}
pub fn verify(
    path: &Path,
    workspace: &Path,
    plan: &FormatPlan,
    lease: &RuntimeLease,
    control: &Control,
    observer: Arc<dyn Fn(ProcessObservation) + Send + Sync>,
) -> Result<VerifiedMedia, String> {
    let path_metadata =
        fs::symlink_metadata(path).map_err(|e| format!("Final media identity: {e}"))?;
    if !path_metadata.is_file() || path_metadata.file_attributes() & 0x400 != 0 {
        return Err("Final media is not a regular non-reparse file".into());
    }
    let mut identity_guard = OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(path)
        .map_err(|e| format!("Final media identity lease: {e}"))?;
    let metadata = identity_guard
        .metadata()
        .map_err(|e| format!("Final media missing: {e}"))?;
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    if !metadata.is_file()
        || metadata.file_attributes() & 0x400 != 0
        || metadata.len() == 0
        || !canonical.starts_with(workspace.canonicalize().map_err(|e| e.to_string())?)
    {
        return Err("Final media is not one owned, nonempty regular file".into());
    }
    let probe = process_supervisor::run(
        ProcessSpec {
            executable: lease.file("ffprobe.exe")?,
            args: vec![
                "-v".into(),
                "error".into(),
                "-show_streams".into(),
                "-show_format".into(),
                "-of".into(),
                "json".into(),
                canonical.display().to_string(),
            ],
            cwd: workspace.into(),
            env: super::runtime::child_environment(workspace)?,
            stdout_limit: 1024 * 1024,
            stderr_limit: 128 * 1024,
            timeout: Some(Duration::from_secs(30)),
        },
        control,
        observer,
    )?;
    fs::write(workspace.join("ffprobe.json"), &probe.stdout).map_err(|e| e.to_string())?;
    fs::write(workspace.join("ffprobe-stderr.log"), &probe.stderr).map_err(|e| e.to_string())?;
    if probe.exit_code != 0 || probe.facts.stdout_truncated || !probe.facts.resources_releasable() {
        return Err(format!(
            "Media ffprobe failed: {}",
            String::from_utf8_lossy(&probe.stderr)
        ));
    }
    let info: Value =
        serde_json::from_slice(&probe.stdout).map_err(|e| format!("ffprobe JSON: {e}"))?;
    let streams = info["streams"].as_array().ok_or("No ffprobe streams")?;
    if !streams.iter().any(|s| {
        s["codec_type"] == "video"
            && s["width"].as_u64().is_some_and(|w| w > 0)
            && s["height"].as_u64() == Some(plan.height)
            && s["codec_name"]
                .as_str()
                .is_some_and(|name| codec_matches(&plan.video_codec, name))
    }) {
        return Err("Delivered media video dimensions do not match accepted format".into());
    }
    if plan.requires_audio
        && !streams
            .iter()
            .any(|s| s["codec_type"] == "audio" && s["channels"].as_u64().is_some_and(|n| n > 0))
    {
        return Err("Delivered media missing required audio".into());
    }
    if info["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .is_none_or(|n| !n.is_finite() || n <= 0.)
    {
        return Err("Media duration is not valid".into());
    }
    let sha256 = hash(&mut identity_guard)?;
    Ok(VerifiedMedia {
        path: canonical,
        bytes: metadata.len(),
        sha256,
        streams: info,
        identity_guard: Some(Arc::new(identity_guard)),
    })
}
fn codec_matches(expected: &str, actual: &str) -> bool {
    (actual == "h264" && (expected.starts_with("avc") || expected.starts_with("h264")))
        || (actual == "hevc" && (expected.starts_with("hev") || expected.starts_with("hvc")))
        || (actual == "vp9" && (expected.starts_with("vp9") || expected.starts_with("vp09")))
        || (actual == "av1" && (expected.starts_with("av1") || expected.starts_with("av01")))
        || expected == actual
}
#[must_use = "Owned stages require explicit cleanup or successful publication"]
pub struct DestinationStage {
    pub path: PathBuf,
    pub extension: String,
    owned: bool,
    file: Option<fs::File>,
    validated: bool,
    delete_requested: bool,
}
impl DestinationStage {
    pub fn create(media: &VerifiedMedia, destination: &Path, job: u64) -> Result<Self, String> {
        let extension = media
            .path
            .extension()
            .and_then(|s| s.to_str())
            .filter(|s| {
                !s.is_empty() && s.len() < 12 && s.bytes().all(|b| b.is_ascii_alphanumeric())
            })
            .ok_or("Unsupported final media extension")?
            .to_owned();
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        let path = destination.join(format!(".ameow-{job}-{nonce}.partial"));
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .access_mode(0x80000000 | 0x40000000 | DELETE)
            .share_mode(1)
            .create_new(true)
            .open(&path)
            .map_err(|e| format!("Destination exclusive staging: {e}"))?;
        Ok(Self {
            path,
            extension,
            owned: true,
            file: Some(file),
            validated: false,
            delete_requested: false,
        })
    }
    pub fn fill(&mut self, media: &VerifiedMedia) -> Result<(), String> {
        let out = self
            .file
            .as_mut()
            .ok_or("Destination staging handle unavailable")?;
        let mut input =
            fs::File::open(&media.path).map_err(|e| format!("Settled source read: {e}"))?;
        let n =
            std::io::copy(&mut input, &mut *out).map_err(|e| format!("Destination copy: {e}"))?;
        out.flush().map_err(|e| e.to_string())?;
        out.sync_all()
            .map_err(|e| format!("Destination flush: {e}"))?;
        out.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        if n != media.bytes || hash(&mut *out)? != media.sha256 {
            return Err("Destination staged integrity mismatch".into());
        }
        self.validated = true;
        Ok(())
    }
    pub fn owned_path(&self) -> Option<&Path> {
        self.owned.then_some(self.path.as_path())
    }
    pub fn cleanup(&mut self) -> Result<(), String> {
        if !self.owned {
            return Ok(());
        }
        if self.delete_requested {
            return self.confirm_deleted();
        }
        let file = self
            .file
            .as_ref()
            .ok_or("Owned destination stage identity handle missing")?;
        let delete = FILE_DISPOSITION_INFO { DeleteFile: true };
        if unsafe {
            SetFileInformationByHandle(
                file.as_raw_handle(),
                FileDispositionInfo,
                (&delete as *const FILE_DISPOSITION_INFO).cast(),
                std::mem::size_of::<FILE_DISPOSITION_INFO>() as u32,
            )
        } == 0
        {
            return Err(format!(
                "Destination owned partial cleanup retained {}: {}",
                self.path.display(),
                std::io::Error::last_os_error()
            ));
        }
        self.file.take();
        self.delete_requested = true;
        self.confirm_deleted()
    }
    fn confirm_deleted(&mut self) -> Result<(), String> {
        match fs::symlink_metadata(&self.path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                self.owned = false;
                Ok(())
            }
            Ok(_) => Err(format!(
                "Destination deletion remains pending; exact path retained {}",
                self.path.display()
            )),
            Err(error) => Err(format!(
                "Destination deletion absence not established {}: {error}",
                self.path.display()
            )),
        }
    }
    // Caller holds the single coordinator lock across cancellation check, this move, and Success.
    pub fn publish(&mut self, destination: &Path, base: &str) -> Result<PathBuf, String> {
        if !self.owned || !self.validated {
            return Err("Destination stage is not owned and verified".into());
        }
        let safe: String = base
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .take(100)
            .collect();
        if safe.is_empty() {
            return Err("Final filename identity empty".into());
        }
        for collision in 0..10000 {
            let suffix = if collision == 0 {
                String::new()
            } else {
                format!(" ({collision})")
            };
            let final_path = destination.join(format!("{safe}{suffix}.{}", self.extension));
            match rename_owned(
                self.file
                    .as_ref()
                    .ok_or("Owned destination identity missing")?,
                &final_path,
            ) {
                Ok(()) => {
                    self.owned = false;
                    self.path = final_path.clone();
                    self.file.take();
                    return Ok(final_path);
                }
                Err(e) if matches!(e.raw_os_error(), Some(80) | Some(183)) => continue,
                Err(e) => return Err(format!("Destination atomic no-replace publish: {e}")),
            }
        }
        Err("Destination collision bound exceeded".into())
    }
}
fn rename_owned(file: &fs::File, destination: &Path) -> Result<(), std::io::Error> {
    let name: Vec<u16> = destination.as_os_str().encode_wide().collect();
    let size = std::mem::offset_of!(FILE_RENAME_INFO, FileName) + name.len() * 2;
    let mut buffer = vec![0usize; size.div_ceil(std::mem::size_of::<usize>())];
    let info = buffer.as_mut_ptr().cast::<FILE_RENAME_INFO>();
    unsafe {
        (*info).Anonymous = FILE_RENAME_INFO_0 {
            ReplaceIfExists: false,
        };
        (*info).RootDirectory = std::ptr::null_mut();
        (*info).FileNameLength = (name.len() * 2) as u32;
        std::ptr::copy_nonoverlapping(
            name.as_ptr(),
            std::ptr::addr_of_mut!((*info).FileName).cast::<u16>(),
            name.len(),
        );
        if SetFileInformationByHandle(
            file.as_raw_handle(),
            FileRenameInfo,
            info.cast(),
            size as u32,
        ) == 0
        {
            return Err(std::io::Error::last_os_error());
        }
    }
    Ok(())
}
