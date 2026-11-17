use super::{
    network,
    preparation::{ErrorCategory as E, PreparationFailure as F, PreparationStage as S, RuntimeComponent as C},
    process_supervisor::Control,
    runtime,
};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::unix::{ffi::OsStrExt, fs::{PermissionsExt, symlink}},
    path::{Component, Path, PathBuf},
};

const LAUNCHER: &str = "#!/bin/sh\nbase=${0%/*}\nexec \"$base/python/bin/python3.13\" -I -B \"$base/gallery-entry.py\" \"$@\"\n";
const LAUNCHER_SHA: &str = "006B2522083767789CFE0F1D9B4E5A8BEEC14C319642F348A06FC0786AB5C20C";
const ENTRY: &str = "import os, sys\nbase = os.path.dirname(os.path.abspath(__file__))\nsys.path[:0] = [os.path.join(base, \"gallery-wheels\", name) for name in (\"gallery.whl\", \"requests.whl\", \"idna.whl\", \"urllib3.whl\", \"charset.whl\", \"certifi.whl\")]\nfrom gallery_dl import main\nmain()\n";
const ENTRY_SHA: &str = "3ED9C4A36EC304BEA6BAC893E276A808751E91C851890FE14A23C0CFD6533874";
const PYTHON_TREE_SHA: &str = "44CE2149BB026BDE6CBDA051E8C60B4DEDE84C5F16D8EAB7DE1B032C654F5E73";
const MAX_ENTRIES: usize = 4096;
const MAX_UNPACKED: u64 = 512 * 1024 * 1024;

struct Wheel { name: &'static str, url: &'static str, bytes: u64, sha256: &'static str }

const WHEELS: &[Wheel] = &[
    Wheel { name: "gallery.whl", url: "https://files.pythonhosted.org/packages/5d/c3/87c38fa0d392455a14b3f32b8a3acf0887ced4689a7b5fc6e0d9f761213f/gallery_dl-1.32.19-py3-none-any.whl", bytes: 946594, sha256: "F6B1EB5E9A7409A988B754335D99DBB1873E130D133ED5D164D32E5E645D1C50" },
    Wheel { name: "requests.whl", url: "https://files.pythonhosted.org/packages/1e/db/4254e3eabe8020b458f1a747140d32277ec7a271daf1d235b70dc0b4e6e3/requests-2.32.5-py3-none-any.whl", bytes: 64738, sha256: "2462F94637A34FD532264295E186976DB0F5D453D1CDD31473C85A6A161AFFB6" },
    Wheel { name: "idna.whl", url: "https://files.pythonhosted.org/packages/76/c6/c88e154df9c4e1a2a66ccf0005a88dfb2650c1dffb6f5ce603dfbd452ce3/idna-3.10-py3-none-any.whl", bytes: 70442, sha256: "946D195A0D259CBBA61165E88E65941F16E9B36EA6DDB97F00452BAE8B1287D3" },
    Wheel { name: "urllib3.whl", url: "https://files.pythonhosted.org/packages/a7/c2/fe1e52489ae3122415c51f387e221dd0773709bad6c6cdaa599e8a2c5185/urllib3-2.5.0-py3-none-any.whl", bytes: 129795, sha256: "E6B01673C0FA6A13E374B50871808EB3BF7046C4B125B216F6BF1CC604CFF0DC" },
    Wheel { name: "charset.whl", url: "https://files.pythonhosted.org/packages/8a/1f/f041989e93b001bc4e44bb1669ccdcf54d3f00e628229a85b08d330615c5/charset_normalizer-3.4.3-py3-none-any.whl", bytes: 53175, sha256: "CE571AB16D890D23B5C278547BA694193A45011FF86A9162A71307ED9F86759A" },
    Wheel { name: "certifi.whl", url: "https://files.pythonhosted.org/packages/9a/3c/c17fb3ca2d9c3acff52e30b309f538586f9f5b9c9cf454f3845fc9af4881/certifi-2026.2.25-py3-none-any.whl", bytes: 153684, sha256: "027692E4402AD994F1C42E52A4997A9763C646B73E4096E4D5D6DB8AF1D6F0FA" },
];

fn fail(stage: S, category: E) -> F { F::new(C::GalleryDl, stage, category) }

pub(super) fn extract_tar_file(archive: &Path, member: &str, destination: &Path) -> Result<(), String> {
    let file = File::open(archive).map_err(|error| error.to_string())?;
    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(file));
    let mut found = false;
    for item in archive.entries().map_err(|error| error.to_string())? {
        let mut item = item.map_err(|error| error.to_string())?;
        if item.path().map_err(|error| error.to_string())?.as_ref() != Path::new(member) { continue; }
        if found || !item.header().entry_type().is_file() || item.size() > MAX_UNPACKED {
            return Err("Invalid or duplicate archive member".into());
        }
        let mut output = OpenOptions::new().write(true).create_new(true).open(destination)
            .map_err(|error| error.to_string())?;
        std::io::copy(&mut item, &mut output).map_err(|error| error.to_string())?;
        output.sync_all().map_err(|error| error.to_string())?;
        found = true;
    }
    if found { Ok(()) } else { Err("Archive member missing".into()) }
}

pub(super) fn extract_python(archive: &Path, directory: &Path, control: &Control) -> Result<(), F> {
    let fail = |stage, category| F::new(C::Runtime, stage, category);
    let file = File::open(archive).map_err(|error| F::io(C::Runtime, S::Extract, error))?;
    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(file));
    let mut count = 0usize;
    let mut total = 0u64;
    for entry in archive.entries().map_err(|_| fail(S::Extract, E::Extract))? {
        if control.is_cancelled() { return Err(fail(S::Extract, E::Cancelled)); }
        let mut entry = entry.map_err(|_| fail(S::Extract, E::Extract))?;
        count += 1;
        total = total.checked_add(entry.size()).ok_or_else(|| fail(S::Extract, E::Size))?;
        if count > MAX_ENTRIES || total > MAX_UNPACKED { return Err(fail(S::Extract, E::Size)); }
        let path = entry.path().map_err(|_| fail(S::Extract, E::Extract))?;
        if !matches!(path.components().next(), Some(Component::Normal(name)) if name == "python")
            || !path.components().all(|part| matches!(part, Component::Normal(_))) {
            return Err(fail(S::Extract, E::Extract));
        }
        let kind = entry.header().entry_type();
        if kind.is_symlink() {
            let link = entry.link_name().map_err(|_| fail(S::Extract, E::Extract))?
                .ok_or_else(|| fail(S::Extract, E::Extract))?;
            if !link.components().all(|part| matches!(part, Component::Normal(_))) {
                return Err(fail(S::Extract, E::Extract));
            }
        } else if !kind.is_file() && !kind.is_dir() {
            return Err(fail(S::Extract, E::Extract));
        }
        if !entry.unpack_in(directory).map_err(|_| fail(S::Extract, E::Extract))? {
            return Err(fail(S::Extract, E::Extract));
        }
    }
    make_readonly(&directory.join("python"))
        .map_err(|error| F::io(C::Runtime, S::Extract, error))?;
    verify_python(directory).map_err(|_| fail(S::Verify, E::Hash))
}

pub(super) fn extract_gallery(archive: &Path, directory: &Path, control: &Control) -> Result<(), F> {
    let wheel_dir = directory.join("gallery-wheels");
    fs::create_dir(&wheel_dir).map_err(|error| F::io(C::GalleryDl, S::Extract, error))?;
    for wheel in WHEELS {
        let path = wheel_dir.join(wheel.name);
        if wheel.name == "gallery.whl" {
            fs::copy(archive, &path).map_err(|error| F::io(C::GalleryDl, S::Extract, error))?;
        } else {
            network::acquire_observed(wheel.url, &path, wheel.bytes, control.cancellation_flag(), |_, _| {}, |_, _| {})
                .map_err(|error| {
                    let mut failure = fail(S::Acquire, error.category);
                    failure.http_status = error.http_status;
                    failure
                })?;
        }
        runtime::check_file(&path, wheel.sha256).map_err(|_| fail(S::Verify, E::Hash))?;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o444))
            .map_err(|error| F::io(C::GalleryDl, S::Extract, error))?;
    }
    write_file(&directory.join("gallery-entry.py"), ENTRY.as_bytes(), 0o444)
        .map_err(|error| F::io(C::GalleryDl, S::Extract, error))?;
    write_file(&directory.join("gallery-dl"), LAUNCHER.as_bytes(), 0o555)
        .map_err(|error| F::io(C::GalleryDl, S::Extract, error))?;
    fs::set_permissions(&wheel_dir, fs::Permissions::from_mode(0o700))
        .map_err(|error| F::io(C::GalleryDl, S::Extract, error))?;
    verify_gallery(directory).map_err(|_| fail(S::Verify, E::Hash))
}

fn write_file(path: &Path, content: &[u8], mode: u32) -> std::io::Result<()> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(content)?;
    file.sync_all()?;
    fs::set_permissions(path, fs::Permissions::from_mode(mode))
}

fn make_readonly(path: &Path) -> std::io::Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() { return Ok(()); }
    if metadata.is_dir() {
        for entry in fs::read_dir(path)? { make_readonly(&entry?.path())?; }
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
    } else if metadata.is_file() {
        let mode = if metadata.permissions().mode() & 0o111 != 0 { 0o555 } else { 0o444 };
        fs::set_permissions(path, fs::Permissions::from_mode(mode))
    } else {
        Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "unsupported Python bundle entry"))
    }
}

pub(super) fn verify_gallery(directory: &Path) -> Result<(), String> {
    runtime::check_file(&directory.join("gallery-dl"), LAUNCHER_SHA)?;
    runtime::check_file(&directory.join("gallery-entry.py"), ENTRY_SHA)?;
    let wheel_dir = fs::symlink_metadata(directory.join("gallery-wheels"))
        .map_err(|error| error.to_string())?;
    if !wheel_dir.is_dir() || wheel_dir.file_type().is_symlink() {
        return Err("Invalid gallery dependency directory".into());
    }
    for wheel in WHEELS {
        let guard = runtime::check_file(&directory.join("gallery-wheels").join(wheel.name), wheel.sha256)?;
        if guard.metadata().map_err(|error| error.to_string())?.len() != wheel.bytes {
            return Err("Gallery wheel size mismatch".into());
        }
    }
    Ok(())
}

pub(super) fn verify_python(directory: &Path) -> Result<(), String> {
    if fingerprint(&directory.join("python"))? != PYTHON_TREE_SHA {
        return Err("Managed Python tree hash mismatch".into());
    }
    Ok(())
}

fn fingerprint(root: &Path) -> Result<String, String> {
    let metadata = fs::symlink_metadata(root).map_err(|error| error.to_string())?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() { return Err("Invalid Python root".into()); }
    let mut paths = Vec::new();
    let mut total = 0u64;
    collect(root, root, &mut paths, &mut total)?;
    paths.sort_by(|left, right| left.0.cmp(&right.0));
    let mut digest = Sha256::new();
    for (relative, path) in paths {
        let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
        let (kind, value) = if metadata.file_type().is_symlink() {
            (b'L', fs::read_link(&path).map_err(|error| error.to_string())?.as_os_str().as_bytes().to_vec())
        } else if metadata.is_dir() {
            (b'D', Vec::new())
        } else if metadata.is_file() {
            let mut file = runtime::open_identity_file(&path).map_err(|error| error.to_string())?;
            let mut contents = Sha256::new();
            let mut buffer = [0u8; 65536];
            loop {
                let count = file.read(&mut buffer).map_err(|error| error.to_string())?;
                if count == 0 { break; }
                contents.update(&buffer[..count]);
            }
            (b'F', contents.finalize().to_vec())
        } else { return Err("Unsupported Python tree entry".into()); };
        digest.update([kind]);
        digest.update((relative.len() as u32).to_be_bytes());
        digest.update(&relative);
        digest.update((value.len() as u32).to_be_bytes());
        digest.update(&value);
    }
    Ok(format!("{:X}", digest.finalize()))
}

fn collect(root: &Path, directory: &Path, paths: &mut Vec<(Vec<u8>, PathBuf)>, total: &mut u64) -> Result<(), String> {
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        let relative = path.strip_prefix(root).map_err(|error| error.to_string())?.as_os_str().as_bytes().to_vec();
        paths.push((relative, path.clone()));
        if paths.len() > MAX_ENTRIES { return Err("Python tree entry limit exceeded".into()); }
        let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
        if metadata.is_file() {
            *total = total.checked_add(metadata.len()).ok_or("Python tree size overflow")?;
            if *total > MAX_UNPACKED { return Err("Python tree size limit exceeded".into()); }
        }
        if metadata.is_dir() && !metadata.file_type().is_symlink() { collect(root, &path, paths, total)?; }
    }
    Ok(())
}

pub(super) fn copy_python(source: &Path, target: &Path) -> Result<(), String> {
    verify_python(source)?;
    copy_tree(&source.join("python"), &target.join("python"))?;
    verify_python(target)
}

pub(super) fn copy_gallery(source: &Path, target: &Path) -> Result<(), String> {
    verify_gallery(source)?;
    copy_tree(&source.join("gallery-wheels"), &target.join("gallery-wheels"))?;
    for name in ["gallery-dl", "gallery-entry.py"] {
        fs::copy(source.join(name), target.join(name)).map_err(|error| error.to_string())?;
    }
    verify_gallery(target)
}

fn copy_tree(source: &Path, target: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(source).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        symlink(fs::read_link(source).map_err(|error| error.to_string())?, target).map_err(|error| error.to_string())
    } else if metadata.is_dir() {
        fs::create_dir(target).map_err(|error| error.to_string())?;
        for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            copy_tree(&entry.path(), &target.join(entry.file_name()))?;
        }
        fs::set_permissions(target, metadata.permissions()).map_err(|error| error.to_string())
    } else if metadata.is_file() {
        fs::copy(source, target).map(|_| ()).map_err(|error| error.to_string())
    } else { Err("Unsupported Python bundle entry".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_entrypoints_match_their_pins() {
        assert_eq!(runtime::hash(LAUNCHER.as_bytes()).unwrap(), LAUNCHER_SHA);
        assert_eq!(runtime::hash(ENTRY.as_bytes()).unwrap(), ENTRY_SHA);
    }

    #[test]
    fn python_fingerprint_detects_file_and_link_changes() {
        let root = tempfile::tempdir().unwrap();
        let python = root.path().join("python");
        fs::create_dir(&python).unwrap();
        fs::write(python.join("runtime"), b"original").unwrap();
        symlink("runtime", python.join("python3")).unwrap();
        let expected = fingerprint(&python).unwrap();
        fs::write(python.join("runtime"), b"modified").unwrap();
        assert_ne!(fingerprint(&python).unwrap(), expected);
        fs::write(python.join("runtime"), b"original").unwrap();
        fs::remove_file(python.join("python3")).unwrap();
        symlink("elsewhere", python.join("python3")).unwrap();
        assert_ne!(fingerprint(&python).unwrap(), expected);
    }
}
