//! Optional typed media evidence. Only bytes completely saved by this attempt may be archived.
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::{self, Read, Write},
    path::Path,
    sync::Mutex,
};

#[derive(Default)]
pub(crate) struct Observations(Mutex<BTreeMap<&'static str, Option<[u8; 32]>>>);

fn name(value: &str) -> Option<&'static str> {
    match value {
        "resolve-media.json" => Some("resolve-media.json"),
        "transfer-media.json" => Some("transfer-media.json"),
        "primary-resolve-media.json" => Some("primary-resolve-media.json"),
        "primary-transfer-media.json" => Some("primary-transfer-media.json"),
        _ => None,
    }
}
pub(crate) fn optional(value: &str) -> bool {
    name(value).is_some()
}

impl Observations {
    pub(crate) fn save(&self, directory: &Path, filename: &'static str, bytes: Option<Vec<u8>>) {
        let digest = bytes.and_then(|bytes| {
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(directory.join(filename))
                .ok()?;
            file.write_all(&bytes).ok()?;
            Some(Sha256::digest(&bytes).into())
        });
        super::lock(&self.0).insert(filename, digest);
    }

    /// Primary promotion moves the fact as well as the file, so unused root aliases stay absent.
    pub(crate) fn preserve(
        &self,
        source: &Path,
        target: &Path,
        from: &str,
        to: &str,
        limit: u64,
    ) -> u64 {
        let (Some(from), Some(to)) = (name(from), name(to)) else {
            return 0;
        };
        let mut records = super::lock(&self.0);
        let expected = if from == to {
            records.get(from).copied()
        } else {
            records.remove(from)
        };
        if expected.is_none()
            && fs::symlink_metadata(source.join(from))
                .is_err_and(|e| e.kind() == io::ErrorKind::NotFound)
        {
            return 0; // This stage/alias was never produced (e.g. transfer after a resolve failure).
        }
        let copied = expected.flatten().and_then(|digest| {
            let result = copy_complete(&source.join(from), &target.join(to), digest, limit);
            if result
                .as_ref()
                .is_err_and(|e| e.kind() == io::ErrorKind::FileTooLarge)
            {
                let _ = fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(target.join(format!("{to}.omitted.txt")))
                    .and_then(|mut file| file.write_all(b"Bounded media observation omitted\n"));
            }
            result.ok()
        });
        records.insert(to, copied.and(expected.flatten()));
        copied.unwrap_or(0)
    }

    pub(crate) fn summary(&self) -> String {
        let records = super::lock(&self.0);
        let mut summary = String::new();
        for phase in ["resolve", "transfer"] {
            if records.iter().any(|(name, digest)| {
                name.trim_start_matches("primary-").starts_with(phase) && digest.is_none()
            }) {
                summary.push_str(&format!(
                    "\nmedia_observation phase={phase} status=unavailable\n"
                ));
            }
        }
        summary
    }

    pub(crate) fn append_summary(&self, directory: &Path, remaining: u64) {
        let summary = self.summary();
        if summary.is_empty() || summary.len() as u64 > remaining {
            return;
        }
        let path = directory.join("attempt-error.log");
        let mut options = fs::OpenOptions::new();
        options.append(true).create(true);
        no_follow(&mut options);
        if let Ok(mut file) = options.open(path)
            && file.metadata().is_ok_and(|m| {
                super::is_plain_file(&m)
                    && m.len().saturating_add(summary.len() as u64) <= 8 * 1024 * 1024
            })
        {
            let _ = file.write_all(summary.as_bytes());
        }
    }
}

fn no_follow(options: &mut fs::OpenOptions) {
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options
            .custom_flags(windows_sys::Win32::Storage::FileSystem::FILE_FLAG_OPEN_REPARSE_POINT)
            .share_mode(1);
    }
    #[cfg(target_os = "macos")]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
}

fn copy_complete(source: &Path, target: &Path, digest: [u8; 32], limit: u64) -> io::Result<u64> {
    let metadata = fs::symlink_metadata(source)?;
    if !super::is_plain_file(&metadata) {
        return Err(io::ErrorKind::InvalidData.into());
    }
    if metadata.len() > limit {
        return Err(io::ErrorKind::FileTooLarge.into());
    }
    let mut options = fs::OpenOptions::new();
    options.read(true);
    no_follow(&mut options);
    let file = options.open(source)?;
    if !super::is_plain_file(&file.metadata()?) {
        return Err(io::ErrorKind::InvalidData.into());
    }
    let mut bytes = Vec::new();
    file.take(limit + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        return Err(io::ErrorKind::FileTooLarge.into());
    }
    if bytes.len() as u64 != metadata.len() || <[u8; 32]>::from(Sha256::digest(&bytes)) != digest {
        return Err(io::ErrorKind::InvalidData.into());
    }
    // Failed temporary bytes remain owned by workspace cleanup, including its Held barrier.
    let mut output =
        tempfile::NamedTempFile::new_in(source.parent().ok_or(io::ErrorKind::InvalidInput)?)?;
    output.write_all(&bytes)?;
    output.persist_noclobber(target).map_err(|e| e.error)?;
    Ok(bytes.len() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    const RESOLVE: &str = "resolve-media.json";
    const PRIMARY: &str = "primary-resolve-media.json";
    const SAFE: &[u8] = br#"{"formats":[],"selected":[]}"#;

    #[test]
    fn complete_observation_reaches_primary_and_final_archive() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("primary");
        fs::create_dir(&source).unwrap();
        let observations = Observations::default();
        observations.save(&source, RESOLVE, Some(SAFE.to_vec()));
        crate::download::adapters::automatic::preserve_primary(
            &source,
            root.path(),
            &[(RESOLVE, 65536)],
            &observations,
        )
        .unwrap();
        let archive = super::super::preserve_diagnostics(
            root.path(),
            root.path(),
            1,
            &[(RESOLVE, 65536), (PRIMARY, 65536)],
            &observations,
        )
        .unwrap();
        assert_eq!(fs::read(archive.join(PRIMARY)).unwrap(), SAFE);
        assert!(!archive.join(RESOLVE).exists());
        assert!(observations.summary().is_empty());
    }

    #[test]
    fn failed_save_and_changed_or_unreadable_files_never_reenter_archive() {
        for fault in ["write", "missing", "partial", "directory", "copy"] {
            let root = tempfile::tempdir().unwrap();
            let source = root.path().join("primary");
            fs::create_dir(&source).unwrap();
            let observations = Observations::default();
            if fault == "write" {
                fs::write(source.join(RESOLVE), b"{partial-secret").unwrap();
            }
            observations.save(&source, RESOLVE, Some(SAFE.to_vec()));
            match fault {
                "missing" => fs::remove_file(source.join(RESOLVE)).unwrap(),
                "partial" => fs::write(source.join(RESOLVE), b"{partial-secret").unwrap(),
                "directory" => {
                    fs::remove_file(source.join(RESOLVE)).unwrap();
                    fs::create_dir(source.join(RESOLVE)).unwrap();
                }
                "copy" => fs::create_dir(root.path().join(PRIMARY)).unwrap(),
                _ => {}
            }
            crate::download::adapters::automatic::preserve_primary(
                &source,
                root.path(),
                &[(RESOLVE, 65536)],
                &observations,
            )
            .unwrap();
            let archive = super::super::preserve_diagnostics(
                root.path(),
                root.path(),
                1,
                &[(PRIMARY, 65536)],
                &observations,
            )
            .unwrap();
            assert!(!archive.join(PRIMARY).exists(), "{fault}");
            assert_eq!(
                fs::read_to_string(archive.join("attempt-error.log")).unwrap(),
                "\nmedia_observation phase=resolve status=unavailable\n"
            );
        }
    }

    #[test]
    fn final_archive_faults_and_limits_are_optional_but_core_evidence_errors_are_not() {
        for fault in ["missing", "partial", "directory", "limit"] {
            let root = tempfile::tempdir().unwrap();
            let observations = Observations::default();
            observations.save(root.path(), "transfer-media.json", Some(SAFE.to_vec()));
            match fault {
                "missing" => fs::remove_file(root.path().join("transfer-media.json")).unwrap(),
                "partial" => {
                    fs::write(root.path().join("transfer-media.json"), b"unsafe-secret").unwrap()
                }
                "directory" => {
                    fs::remove_file(root.path().join("transfer-media.json")).unwrap();
                    fs::create_dir(root.path().join("transfer-media.json")).unwrap();
                }
                _ => {}
            }
            let archive = super::super::preserve_diagnostics(
                root.path(),
                root.path(),
                1,
                &[(
                    "transfer-media.json",
                    if fault == "limit" { 1 } else { 65536 },
                )],
                &observations,
            )
            .unwrap();
            assert!(!archive.join("transfer-media.json").exists());
            assert!(
                fs::read_to_string(archive.join("attempt-error.log"))
                    .unwrap()
                    .contains("phase=transfer status=unavailable")
            );
            if fault == "limit" {
                assert!(archive.join("transfer-media.json.omitted.txt").is_file());
            }
            fs::create_dir(root.path().join("media.info.json")).unwrap();
            assert!(
                super::super::preserve_diagnostics(
                    root.path(),
                    root.path(),
                    2,
                    &[("media.info.json", 65536)],
                    &observations
                )
                .is_err()
            );
            assert!(
                crate::download::adapters::automatic::preserve_primary(
                    root.path(),
                    root.path(),
                    &[("media.info.json", 65536)],
                    &observations
                )
                .is_err()
            );
        }
    }

    #[cfg(windows)]
    #[test]
    fn locked_source_is_omitted_and_summary_storage_is_never_required() {
        use std::os::windows::fs::OpenOptionsExt;
        let root = tempfile::tempdir().unwrap();
        let target = tempfile::tempdir().unwrap();
        let observations = Observations::default();
        observations.save(root.path(), RESOLVE, Some(SAFE.to_vec()));
        let locked = fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(root.path().join(RESOLVE))
            .unwrap();
        assert_eq!(
            observations.preserve(root.path(), target.path(), RESOLVE, PRIMARY, 65536),
            0
        );
        fs::create_dir(target.path().join("attempt-error.log")).unwrap();
        observations.append_summary(target.path(), u64::MAX);
        assert_eq!(
            observations.summary(),
            "\nmedia_observation phase=resolve status=unavailable\n"
        );
        drop(locked);
    }

    #[test]
    fn links_are_neither_written_through_nor_archived() {
        let root = tempfile::tempdir().unwrap();
        let target = tempfile::tempdir().unwrap();
        let outside = target.path().join("outside");
        fs::write(&outside, b"private-secret").unwrap();
        #[cfg(windows)]
        let link = |path: &Path| std::os::windows::fs::symlink_file(&outside, path).unwrap();
        #[cfg(target_os = "macos")]
        let link = |path: &Path| std::os::unix::fs::symlink(&outside, path).unwrap();
        let observations = Observations::default();
        link(&root.path().join(RESOLVE));
        observations.save(root.path(), RESOLVE, Some(SAFE.to_vec()));
        assert_eq!(
            observations.preserve(root.path(), target.path(), RESOLVE, PRIMARY, 65536),
            0
        );
        assert_eq!(fs::read(&outside).unwrap(), b"private-secret");
        assert!(!target.path().join(PRIMARY).exists());
        fs::remove_file(root.path().join(RESOLVE)).unwrap();
        observations.save(root.path(), RESOLVE, Some(SAFE.to_vec()));
        fs::remove_file(root.path().join(RESOLVE)).unwrap();
        link(&root.path().join(RESOLVE));
        assert_eq!(
            observations.preserve(root.path(), target.path(), RESOLVE, PRIMARY, 65536),
            0
        );
    }

    #[test]
    fn unavailable_summary_respects_file_and_archive_budgets() {
        let root = tempfile::tempdir().unwrap();
        let observations = Observations::default();
        observations.save(root.path(), RESOLVE, None);
        observations.append_summary(root.path(), 1);
        assert!(!root.path().join("attempt-error.log").exists());
        let file = fs::File::create(root.path().join("attempt-error.log")).unwrap();
        file.set_len(8 * 1024 * 1024).unwrap();
        drop(file);
        observations.append_summary(root.path(), u64::MAX);
        assert_eq!(
            fs::metadata(root.path().join("attempt-error.log"))
                .unwrap()
                .len(),
            8 * 1024 * 1024
        );
    }
}
