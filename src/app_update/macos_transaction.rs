use super::{macos, package::MAX_PACKAGE, store::{atomic_json, plain, read_json}};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::Read,
    os::unix::{ffi::OsStrExt, fs::{MetadataExt, PermissionsExt}},
    path::{Path, PathBuf},
};

const JOURNAL: &str = "macos-transaction.json";
const MAX_ENTRIES: usize = 16_384;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub(super) enum Stage {
    Prepared,
    Armed,
    Swapping,
    Swapped,
    Confirmed,
    Accepted,
    RolledBack,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Journal {
    schema: u32,
    pub(super) installed: PathBuf,
    pub(super) staged: PathBuf,
    pub(super) manifest_hash: String,
    original_hash: String,
    candidate_hash: String,
    pub(super) stage: Stage,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum Placement {
    OriginalInstalled,
    CandidateInstalled,
}

fn frame(digest: &mut Sha256, bytes: &[u8]) {
    digest.update((bytes.len() as u64).to_be_bytes());
    digest.update(bytes);
}

pub(super) fn fingerprint(path: &Path) -> Result<String, String> {
    fingerprint_modes(path, false)
}

pub(super) fn readonly_fingerprint(path: &Path) -> Result<String, String> {
    fingerprint_modes(path, true)
}

fn fingerprint_modes(path: &Path, readonly: bool) -> Result<String, String> {
    fn mode(value: u32, readonly: bool) -> Result<u32, String> {
        if !readonly || value & 0o170000 == 0o120000 { return Ok(value & 0o7777); }
        if value & 0o7000 != 0 { return Err("E_APP_UPDATE_BUNDLE_MODE".into()); }
        Ok(if value & 0o170000 == 0o040000 || value & 0o111 != 0 { 0o555 } else { 0o444 })
    }
    fn unchanged(before: &std::fs::Metadata, after: &std::fs::Metadata) -> bool {
        before.dev() == after.dev() && before.ino() == after.ino()
            && before.len() == after.len() && before.mode() == after.mode()
            && before.mtime() == after.mtime() && before.mtime_nsec() == after.mtime_nsec()
            && before.ctime() == after.ctime() && before.ctime_nsec() == after.ctime_nsec()
    }
    fn matches_entry(opened: &std::fs::Metadata, entry: &libc::stat) -> bool {
        opened.dev() == entry.st_dev as u64 && opened.ino() == entry.st_ino
            && opened.mode() == entry.st_mode as u32 && opened.len() == entry.st_size as u64
            && opened.mtime() == entry.st_mtime && opened.mtime_nsec() == entry.st_mtime_nsec
            && opened.ctime() == entry.st_ctime && opened.ctime_nsec() == entry.st_ctime_nsec
    }
    fn visit_directory(
        directory: &File, relative: &Path, digest: &mut Sha256,
        entries: &mut usize, bytes: &mut u64, depth: usize, readonly: bool,
    ) -> Result<(), String> {
        if depth > 256 { return Err("E_APP_UPDATE_BUNDLE_SIZE".into()); }
        let before = directory.metadata().map_err(|error| error.to_string())?;
        frame(digest, relative.as_os_str().as_bytes());
        digest.update(mode(before.mode(), readonly)?.to_be_bytes());
        digest.update(b"d");
        let mut children = super::macos_fs::entries(directory)?;
        children.sort_by(|left, right| left.as_bytes().cmp(right.as_bytes()));
        for name in children {
            *entries += 1;
            if *entries > MAX_ENTRIES { return Err("E_APP_UPDATE_BUNDLE_SIZE".into()); }
            let child_path = relative.join(&name);
            if child_path.as_os_str().as_bytes().len() > 4096 { return Err("E_APP_UPDATE_BUNDLE_PATH".into()); }
            let meta = super::macos_fs::child_metadata(directory, &name)?;
            match meta.st_mode & libc::S_IFMT {
                libc::S_IFDIR => {
                    let child = super::macos_fs::child_directory(directory, &name)?;
                    if !matches_entry(&child.metadata().map_err(|error| error.to_string())?, &meta) {
                        return Err("E_APP_UPDATE_BUNDLE_CHANGED".into());
                    }
                    visit_directory(&child, &child_path, digest, entries, bytes, depth + 1, readonly)?;
                }
                libc::S_IFREG => {
                    let mut file = super::macos_fs::child_regular_file(directory, &name)?;
                    let opened = file.metadata().map_err(|error| error.to_string())?;
                    if !matches_entry(&opened, &meta) { return Err("E_APP_UPDATE_BUNDLE_CHANGED".into()); }
                    *bytes = bytes.checked_add(opened.len()).ok_or("E_APP_UPDATE_BUNDLE_SIZE")?;
                    if *bytes > MAX_PACKAGE { return Err("E_APP_UPDATE_BUNDLE_SIZE".into()); }
                    frame(digest, child_path.as_os_str().as_bytes());
                    digest.update(mode(opened.mode(), readonly)?.to_be_bytes());
                    digest.update(b"f");
                    digest.update(opened.len().to_be_bytes());
                    let mut buffer = [0; 65536];
                    let mut read = 0u64;
                    loop {
                        let count = file.read(&mut buffer).map_err(|error| error.to_string())?;
                        if count == 0 { break; }
                        read = read.checked_add(count as u64).ok_or("E_APP_UPDATE_BUNDLE_SIZE")?;
                        if read > opened.len() { return Err("E_APP_UPDATE_BUNDLE_CHANGED".into()); }
                        digest.update(&buffer[..count]);
                    }
                    let after = file.metadata().map_err(|error| error.to_string())?;
                    if read != opened.len() || after.nlink() != 1 || !unchanged(&opened, &after) {
                        return Err("E_APP_UPDATE_BUNDLE_CHANGED".into());
                    }
                }
                libc::S_IFLNK => {
                    let target = super::macos_fs::child_link(directory, &name)?;
                    let after = super::macos_fs::child_metadata(directory, &name)?;
                    if meta.st_dev != after.st_dev || meta.st_ino != after.st_ino
                        || meta.st_mode != after.st_mode || meta.st_size != after.st_size
                        || meta.st_mtime != after.st_mtime || meta.st_mtime_nsec != after.st_mtime_nsec
                        || meta.st_ctime != after.st_ctime || meta.st_ctime_nsec != after.st_ctime_nsec {
                        return Err("E_APP_UPDATE_BUNDLE_CHANGED".into());
                    }
                    frame(digest, child_path.as_os_str().as_bytes());
                    digest.update(((meta.st_mode as u32) & 0o7777).to_be_bytes());
                    digest.update(b"l");
                    frame(digest, target.as_bytes());
                }
                _ => return Err("E_APP_UPDATE_BUNDLE_TYPE".into()),
            }
        }
        if !unchanged(&before, &directory.metadata().map_err(|error| error.to_string())?) {
            return Err("E_APP_UPDATE_BUNDLE_CHANGED".into());
        }
        Ok(())
    }
    let root = super::macos_fs::directory(path)?;
    let meta = root.metadata().map_err(|error| error.to_string())?;
    let mut digest = Sha256::new();
    let mut entries = 1;
    let mut bytes = 0;
    visit_directory(&root, Path::new(""), &mut digest, &mut entries, &mut bytes, 0, readonly)?;
    let current = super::macos_fs::directory(path)?.metadata().map_err(|error| error.to_string())?;
    if !unchanged(&meta, &current) { return Err("E_APP_UPDATE_BUNDLE_CHANGED".into()); }
    Ok(format!("{:x}", digest.finalize()))
}

impl Journal {
    pub(super) fn exists(root: &Path) -> Result<bool, String> {
        root.join(JOURNAL).try_exists().map_err(|e| e.to_string())
    }
    fn validate_paths(&self, expected: &Path) -> Result<(), String> {
        if self.schema != 1 || self.installed != expected || !self.installed.is_absolute()
            || self.installed.extension().is_none_or(|extension| extension != "app")
            || self.staged.file_name().is_none_or(|name| name != "Ameow.app") {
            return Err("E_APP_UPDATE_JOURNAL_IDENTITY".into());
        }
        let parent = self.installed.parent().ok_or("E_APP_UPDATE_JOURNAL_IDENTITY")?;
        let staging = self.staged.parent().ok_or("E_APP_UPDATE_JOURNAL_IDENTITY")?;
        if staging.parent() != Some(parent)
            || !staging.file_name().and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with(".ameow-update-") && name.len() > 14) {
            return Err("E_APP_UPDATE_JOURNAL_IDENTITY".into());
        }
        plain(&self.installed)?;
        plain(&self.staged)?;
        match fs::symlink_metadata(staging) {
            Ok(meta) => {
                unsafe extern "C" { fn geteuid() -> u32; }
                if !meta.is_dir() || meta.uid() != unsafe { geteuid() } || meta.mode() & 0o777 != 0o700 {
                    return Err("E_APP_UPDATE_JOURNAL_IDENTITY".into());
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound
                && matches!(self.stage, Stage::Accepted | Stage::RolledBack) => {}
            Err(error) => return Err(error.to_string()),
        }
        super::package::unhex(&self.manifest_hash, 32)?;
        super::package::unhex(&self.original_hash, 32)?;
        super::package::unhex(&self.candidate_hash, 32)?;
        if self.original_hash == self.candidate_hash {
            return Err("E_APP_UPDATE_JOURNAL_IDENTITY".into());
        }
        Ok(())
    }

    fn persist(&self, root: &Path) -> Result<(), String> {
        atomic_json(&root.join(JOURNAL), self)?;
        File::open(root).and_then(|directory| directory.sync_all())
            .map_err(|e| format!("E_APP_UPDATE_JOURNAL_SYNC: {e}"))
    }

    pub(super) fn create(root: &Path, installed: &Path, staged: &Path, manifest_hash: String) -> Result<Self, String> {
        let path = root.join(JOURNAL);
        if path.try_exists().map_err(|e| e.to_string())? { return Err("E_APP_UPDATE_JOURNAL_BUSY".into()); }
        let journal = Self {
            schema: 1, installed: installed.to_path_buf(), staged: staged.to_path_buf(), manifest_hash,
            original_hash: fingerprint(installed)?, candidate_hash: fingerprint(staged)?,
            stage: Stage::Prepared,
        };
        journal.validate_paths(installed)?;
        journal.persist(root)?;
        Ok(journal)
    }

    pub(super) fn load(root: &Path, installed: &Path) -> Result<Option<Self>, String> {
        let journal = Self::load_for_recovery(root)?;
        if let Some(journal) = &journal { journal.validate_paths(installed)?; }
        Ok(journal)
    }

    pub(super) fn load_for_recovery(root: &Path) -> Result<Option<Self>, String> {
        let path = root.join(JOURNAL);
        if !path.try_exists().map_err(|e| e.to_string())? { return Ok(None); }
        let journal: Self = read_json(&path)?;
        journal.validate_paths(&journal.installed)?;
        Ok(Some(journal))
    }

    pub(super) fn placement(&self) -> Result<Placement, String> {
        let installed = fingerprint(&self.installed)?;
        let staged = fingerprint(&self.staged)?;
        if installed == self.original_hash && staged == self.candidate_hash {
            Ok(Placement::OriginalInstalled)
        } else if installed == self.candidate_hash && staged == self.original_hash {
            Ok(Placement::CandidateInstalled)
        } else {
            Err("E_APP_UPDATE_JOURNAL_CONTENTS".into())
        }
    }

    pub(super) fn original_is_installed(&self) -> Result<bool, String> {
        match fs::symlink_metadata(&self.installed) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(error.to_string()),
            Ok(_) => Ok(fingerprint(&self.installed)? == self.original_hash),
        }
    }

    pub(super) fn original_is_staged(&self) -> Result<bool, String> {
        match fs::symlink_metadata(&self.staged) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(error.to_string()),
            Ok(_) => Ok(fingerprint(&self.staged)? == self.original_hash),
        }
    }

    pub(super) fn arm(&mut self, root: &Path) -> Result<(), String> {
        if self.stage != Stage::Prepared || self.placement()? != Placement::OriginalInstalled {
            return Err("E_APP_UPDATE_JOURNAL_STAGE".into());
        }
        self.stage = Stage::Armed;
        self.persist(root)
    }

    pub(super) fn swap(&mut self, root: &Path) -> Result<(), String> {
        if self.stage != Stage::Armed || self.placement()? != Placement::OriginalInstalled {
            return Err("E_APP_UPDATE_JOURNAL_STAGE".into());
        }
        self.stage = Stage::Swapping;
        self.persist(root)?;
        #[cfg(all(feature = "app-update-fixture", debug_assertions))]
        if std::env::var_os("AMEOW_UPDATE_TEST_CRASH_AT").is_some_and(|value| value == "before-exchange") {
            std::process::exit(86);
        }
        macos::exchange(&self.installed, &self.staged)?;
        #[cfg(all(feature = "app-update-fixture", debug_assertions))]
        if std::env::var_os("AMEOW_UPDATE_TEST_CRASH_AT").is_some_and(|value| value == "after-exchange") {
            std::process::exit(86);
        }
        if self.placement()? != Placement::CandidateInstalled {
            return Err("E_APP_UPDATE_JOURNAL_CONTENTS".into());
        }
        self.stage = Stage::Swapped;
        self.persist(root)
    }

    pub(super) fn confirm_with(&mut self, root: &Path, prove_ready: impl FnOnce() -> Result<(), String>) -> Result<(), String> {
        if self.stage != Stage::Swapped || self.placement()? != Placement::CandidateInstalled {
            return Err("E_APP_UPDATE_JOURNAL_STAGE".into());
        }
        prove_ready()?;
        self.stage = Stage::Confirmed;
        self.persist(root)
    }

    pub(super) fn revoke_unaccepted_confirmation(&mut self, root: &Path) -> Result<(), String> {
        if self.stage != Stage::Confirmed || !self.original_is_staged()? {
            return Err("E_APP_UPDATE_JOURNAL_STAGE".into());
        }
        self.stage = Stage::Swapped;
        self.persist(root)
    }

    pub(super) fn accept(&mut self, root: &Path) -> Result<(), String> {
        if !matches!(self.stage, Stage::Confirmed | Stage::Accepted)
            || self.placement()? != Placement::CandidateInstalled {
            return Err("E_APP_UPDATE_JOURNAL_STAGE".into());
        }
        if self.stage == Stage::Accepted { return Ok(()); }
        self.stage = Stage::Accepted;
        self.persist(root)
    }

    pub(super) fn rollback(&mut self, root: &Path) -> Result<(), String> {
        if matches!(self.stage, Stage::Confirmed | Stage::Accepted) { return Err("E_APP_UPDATE_JOURNAL_COMMITTED".into()); }
        match self.placement() {
            Ok(Placement::CandidateInstalled) => {
                macos::exchange(&self.installed, &self.staged)?;
                if self.placement()? != Placement::OriginalInstalled {
                    return Err("E_APP_UPDATE_JOURNAL_CONTENTS".into());
                }
            }
            Ok(Placement::OriginalInstalled) => {}
            Err(error) => {
                if !self.original_is_installed()? {
                    if !self.original_is_staged()? { return Err(error); }
                    match fs::symlink_metadata(&self.installed) {
                        Err(missing) if missing.kind() == std::io::ErrorKind::NotFound => {
                            macos::restore_missing(&self.staged, &self.installed)?;
                        }
                        Ok(metadata) if metadata.is_dir() => macos::exchange(&self.installed, &self.staged)?,
                        _ => return Err(error),
                    }
                    if !self.original_is_installed()? { return Err("E_APP_UPDATE_JOURNAL_CONTENTS".into()); }
                }
            }
        }
        self.stage = Stage::RolledBack;
        self.persist(root)
    }

    pub(super) fn finish(&self, root: &Path) -> Result<(), String> {
        let installed_hash = fingerprint(&self.installed)?;
        match self.stage {
            Stage::Accepted if installed_hash == self.candidate_hash => {}
            Stage::RolledBack if installed_hash == self.original_hash => {}
            _ => return Err("E_APP_UPDATE_JOURNAL_STAGE".into()),
        }
        let directory = self.staged.parent().ok_or("E_APP_UPDATE_JOURNAL_IDENTITY")?;
        if directory.exists() {
            plain(directory)?;
            let parent = directory.parent().ok_or("E_APP_UPDATE_JOURNAL_IDENTITY")?;
            let _probe = tempfile::Builder::new().prefix(".ameow-cleanup-probe-")
                .permissions(fs::Permissions::from_mode(0o700)).tempdir_in(parent)
                .map_err(|e| format!("E_APP_UPDATE_CLEANUP: {e}"))?;
            for entry in fs::read_dir(directory).map_err(|e| e.to_string())? {
                if entry.map_err(|e| e.to_string())?.file_name() != "Ameow.app" {
                    return Err("E_APP_UPDATE_JOURNAL_CONTENTS".into());
                }
            }
            if self.staged.exists() {
                let expected = if self.stage == Stage::Accepted { &self.original_hash } else { &self.candidate_hash };
                if fingerprint(&self.staged)? != *expected {
                    return Err("E_APP_UPDATE_JOURNAL_CONTENTS".into());
                }
            }
            fs::remove_dir_all(directory).map_err(|e| format!("E_APP_UPDATE_CLEANUP: {e}"))?;
            File::open(directory.parent().ok_or("E_APP_UPDATE_JOURNAL_IDENTITY")?)
                .and_then(|parent| parent.sync_all()).map_err(|e| e.to_string())?;
        }
        match fs::remove_file(root.join(JOURNAL)) {
            Ok(()) => {},
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {},
            Err(error) => return Err(error.to_string()),
        }
        File::open(root).and_then(|directory| directory.sync_all()).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anchored_fingerprint_preserves_the_existing_journal_format() {
        use std::os::unix::fs::symlink;
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().canonicalize().unwrap();
        let bundle = root.join("Ameow.app");
        fs::create_dir(&bundle).unwrap();
        fs::set_permissions(&bundle, fs::Permissions::from_mode(0o755)).unwrap();
        fs::write(bundle.join("data"), b"old").unwrap();
        fs::set_permissions(bundle.join("data"), fs::Permissions::from_mode(0o644)).unwrap();
        symlink("data", bundle.join("link")).unwrap();
        let link = std::ffi::CString::new(bundle.join("link").as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::lchmod(link.as_ptr(), 0o777) }, 0);
        assert_eq!(fingerprint(&bundle).unwrap(),
            "764d27abd978a1ba9256aae562c8579393e40ddb9db1de8c460a343419421806");
        let redirected = root.join("redirected.app");
        symlink(&bundle, &redirected).unwrap();
        assert!(fingerprint(&redirected).is_err());
        assert_eq!(fs::read(bundle.join("data")).unwrap(), b"old");
    }

    fn setup() -> (tempfile::TempDir, PathBuf, PathBuf, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let installed = root.join("Ameow.app");
        let staged = root.join(".ameow-update-abcdef").join("Ameow.app");
        let state = root.join("state");
        fs::create_dir_all(&installed).unwrap();
        fs::create_dir_all(&staged).unwrap();
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(staged.parent().unwrap(), fs::Permissions::from_mode(0o700)).unwrap();
        fs::create_dir(&state).unwrap();
        fs::write(installed.join("version"), b"old").unwrap();
        fs::write(staged.join("version"), b"new").unwrap();
        fs::write(root.join("user-data"), b"sentinel").unwrap();
        (temp, installed, staged, state)
    }

    #[test]
    fn recovers_before_during_and_after_exchange_without_touching_user_data() {
        for cut in 0..5 {
            let (_temp, installed, staged, state) = setup();
            let mut journal = Journal::create(&state, &installed, &staged, "a".repeat(64)).unwrap();
            if cut > 0 { journal.arm(&state).unwrap(); }
            if cut == 2 || cut == 3 {
                journal.stage = Stage::Swapping;
                journal.persist(&state).unwrap();
            }
            if cut == 3 {
                macos::exchange(&installed, &staged).unwrap();
            }
            if cut == 4 { journal.swap(&state).unwrap(); }
            let mut recovered = Journal::load(&state, &installed).unwrap().unwrap();
            recovered.rollback(&state).unwrap();
            assert_eq!(fs::read(installed.join("version")).unwrap(), b"old");
            assert_eq!(fs::read(staged.join("version")).unwrap(), b"new");
            assert_eq!(fs::read(installed.parent().unwrap().join("user-data")).unwrap(), b"sentinel");
            assert_eq!(recovered.stage, Stage::RolledBack);
        }
    }

    #[test]
    fn confirmation_keeps_the_old_bundle_and_prevents_rollback() {
        let (_temp, installed, staged, state) = setup();
        let mut journal = Journal::create(&state, &installed, &staged, "b".repeat(64)).unwrap();
        journal.arm(&state).unwrap();
        journal.swap(&state).unwrap();
        journal.confirm_with(&state, || Ok(())).unwrap();
        assert_eq!(fs::read(installed.join("version")).unwrap(), b"new");
        assert_eq!(fs::read(staged.join("version")).unwrap(), b"old");
        assert_eq!(journal.rollback(&state).unwrap_err(), "E_APP_UPDATE_JOURNAL_COMMITTED");
        assert_eq!(journal.finish(&state).unwrap_err(), "E_APP_UPDATE_JOURNAL_STAGE");
        journal.accept(&state).unwrap();
        assert_eq!(Journal::load(&state, &installed).unwrap().unwrap().stage, Stage::Accepted);
        assert_eq!(journal.revoke_unaccepted_confirmation(&state).unwrap_err(), "E_APP_UPDATE_JOURNAL_STAGE");
        journal.finish(&state).unwrap();
        assert!(!staged.exists());
        assert!(Journal::load(&state, &installed).unwrap().is_none());
        assert_eq!(fs::read(installed.parent().unwrap().join("user-data")).unwrap(), b"sentinel");
    }

    #[test]
    fn unaccepted_confirmation_can_be_revoked_before_restoring_the_old_bundle() {
        let (_temp, installed, staged, state) = setup();
        let mut journal = Journal::create(&state, &installed, &staged, "6".repeat(64)).unwrap();
        journal.arm(&state).unwrap();
        journal.swap(&state).unwrap();
        journal.confirm_with(&state, || Ok(())).unwrap();
        let mut recovered = Journal::load(&state, &installed).unwrap().unwrap();
        assert_eq!(recovered.stage, Stage::Confirmed);
        assert_eq!(recovered.finish(&state).unwrap_err(), "E_APP_UPDATE_JOURNAL_STAGE");
        recovered.revoke_unaccepted_confirmation(&state).unwrap();
        recovered.rollback(&state).unwrap();
        assert_eq!(fs::read(installed.join("version")).unwrap(), b"old");
    }

    #[test]
    fn refuses_tampering_and_untrusted_recovery_paths() {
        let (_temp, installed, staged, state) = setup();
        let mut journal = Journal::create(&state, &installed, &staged, "c".repeat(64)).unwrap();
        fs::write(staged.join("version"), b"tampered").unwrap();
        assert_eq!(journal.arm(&state).unwrap_err(), "E_APP_UPDATE_JOURNAL_CONTENTS");
        assert_eq!(fs::read(installed.join("version")).unwrap(), b"old");
        assert!(Journal::load(&state, &state.join("Other.app")).is_err());
    }

    #[test]
    fn refuses_cleanup_if_a_foreign_file_appeared_in_the_staging_directory() {
        let (_temp, installed, staged, state) = setup();
        let mut journal = Journal::create(&state, &installed, &staged, "d".repeat(64)).unwrap();
        journal.rollback(&state).unwrap();
        let foreign = staged.parent().unwrap().join("keep-me");
        fs::write(&foreign, b"data").unwrap();
        assert_eq!(journal.finish(&state).unwrap_err(), "E_APP_UPDATE_JOURNAL_CONTENTS");
        assert_eq!(fs::read(foreign).unwrap(), b"data");
        assert_eq!(fs::read(installed.join("version")).unwrap(), b"old");
    }

    #[test]
    fn cleanup_can_resume_after_the_staging_directory_was_removed() {
        let (_temp, installed, staged, state) = setup();
        let mut journal = Journal::create(&state, &installed, &staged, "e".repeat(64)).unwrap();
        journal.arm(&state).unwrap();
        journal.swap(&state).unwrap();
        journal.confirm_with(&state, || Ok(())).unwrap();
        journal.accept(&state).unwrap();
        fs::remove_dir_all(staged.parent().unwrap()).unwrap();
        let recovered = Journal::load_for_recovery(&state).unwrap().unwrap();
        recovered.finish(&state).unwrap();
        assert_eq!(fs::read(installed.join("version")).unwrap(), b"new");
        assert!(Journal::load_for_recovery(&state).unwrap().is_none());
    }

    #[test]
    fn failed_final_readiness_proof_keeps_the_old_bundle_recoverable() {
        let (_temp, installed, staged, state) = setup();
        let mut journal = Journal::create(&state, &installed, &staged, "f".repeat(64)).unwrap();
        journal.arm(&state).unwrap();
        journal.swap(&state).unwrap();
        assert_eq!(journal.confirm_with(&state, || Err("not ready".into())).unwrap_err(), "not ready");
        let mut recovered = Journal::load(&state, &installed).unwrap().unwrap();
        assert_eq!(recovered.stage, Stage::Swapped);
        recovered.rollback(&state).unwrap();
        assert_eq!(fs::read(installed.join("version")).unwrap(), b"old");
    }

    #[test]
    fn failed_cleanup_keeps_the_original_and_staged_candidate_intact() {
        let (_temp, installed, staged, state) = setup();
        let mut journal = Journal::create(&state, &installed, &staged, "9".repeat(64)).unwrap();
        journal.rollback(&state).unwrap();
        let parent = installed.parent().unwrap();
        fs::set_permissions(parent, fs::Permissions::from_mode(0o555)).unwrap();
        assert!(journal.finish(&state).is_err());
        assert_eq!(fs::read(staged.join("version")).unwrap(), b"new");
        assert!(Journal::load(&state, &installed).unwrap().unwrap().original_is_installed().unwrap());
        fs::set_permissions(parent, fs::Permissions::from_mode(0o700)).unwrap();
        journal.finish(&state).unwrap();
        assert!(Journal::load(&state, &installed).unwrap().is_none());
    }

    #[test]
    fn damaged_candidate_does_not_prevent_the_intact_original_from_being_retained() {
        let (_temp, installed, staged, state) = setup();
        let mut journal = Journal::create(&state, &installed, &staged, "8".repeat(64)).unwrap();
        journal.arm(&state).unwrap();
        fs::write(staged.join("version"), b"damaged").unwrap();
        journal.rollback(&state).unwrap();
        assert!(journal.original_is_installed().unwrap());
        assert_eq!(journal.finish(&state).unwrap_err(), "E_APP_UPDATE_JOURNAL_CONTENTS");
        assert_eq!(fs::read(staged.join("version")).unwrap(), b"damaged");
        assert_eq!(Journal::load(&state, &installed).unwrap().unwrap().stage, Stage::RolledBack);
    }

    #[test]
    fn restores_original_when_installed_candidate_is_damaged_or_missing() {
        for missing in [false, true] {
            let (_temp, installed, staged, state) = setup();
            let mut journal = Journal::create(&state, &installed, &staged, "7".repeat(64)).unwrap();
            journal.arm(&state).unwrap();
            journal.swap(&state).unwrap();
            if missing { fs::remove_dir_all(&installed).unwrap(); }
            else { fs::write(installed.join("version"), b"damaged").unwrap(); }
            let mut recovered = Journal::load_for_recovery(&state).unwrap().unwrap();
            recovered.rollback(&state).unwrap();
            assert_eq!(fs::read(installed.join("version")).unwrap(), b"old");
            if missing {
                recovered.finish(&state).unwrap();
                assert!(Journal::load(&state, &installed).unwrap().is_none());
            } else {
                assert_eq!(fs::read(staged.join("version")).unwrap(), b"damaged");
                assert_eq!(recovered.finish(&state).unwrap_err(), "E_APP_UPDATE_JOURNAL_CONTENTS");
            }
        }
    }
}
