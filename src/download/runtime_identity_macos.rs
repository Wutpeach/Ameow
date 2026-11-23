use std::{fs::{self, File, Metadata}, os::unix::fs::MetadataExt, path::{Path, PathBuf}};

#[derive(Clone, Debug, PartialEq, Eq)]
struct Stamp {
    device: u64,
    inode: u64,
    length: u64,
    mode: u32,
    links: u64,
    uid: u32,
    gid: u32,
    modified: (i64, i64),
    changed: (i64, i64),
}
impl From<&Metadata> for Stamp {
    fn from(metadata: &Metadata) -> Self {
        Self {
            device: metadata.dev(), inode: metadata.ino(), length: metadata.len(),
            mode: metadata.mode(), links: metadata.nlink(), uid: metadata.uid(), gid: metadata.gid(),
            modified: (metadata.mtime(), metadata.mtime_nsec()),
            changed: (metadata.ctime(), metadata.ctime_nsec()),
        }
    }
}

#[derive(Clone, Debug)]
pub(crate) struct PathIdentity {
    pub path: PathBuf,
    stamp: Stamp,
}
impl PathIdentity {
    pub fn capture(path: &Path) -> Result<Self, String> {
        let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
        Ok(Self::from_metadata(path, &metadata))
    }
    pub fn from_metadata(path: &Path, metadata: &Metadata) -> Self {
        Self { path: path.into(), stamp: Stamp::from(metadata) }
    }
    pub fn validate(&self) -> Result<(), String> {
        let metadata = fs::symlink_metadata(&self.path).map_err(|error| error.to_string())?;
        self.matches(&metadata)
    }
    pub fn validate_handle(&self, file: &File) -> Result<(), String> {
        self.validate()?;
        self.matches(&file.metadata().map_err(|error| error.to_string())?)
    }
    fn matches(&self, metadata: &Metadata) -> Result<(), String> {
        if Stamp::from(metadata) != self.stamp {
            return Err("Verified runtime identity changed".into());
        }
        Ok(())
    }
}
