use super::{
    network,
    preparation::{ErrorCategory as E, PreparationFailure as F, PreparationStage as S, RuntimeComponent as C},
    process_supervisor::Control,
    runtime,
};
use sha2::{Digest, Sha256};
use runtime::identity::PathIdentity;
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
    Wheel { name: "gallery.whl", url: "https://files.pythonhosted.org/packages/8f/f7/a80d1aa77cabd8a96aacd1c63c530774e15795fa92e9383757b3161af3d2/gallery_dl-1.32.20-py3-none-any.whl", bytes: 952644, sha256: "E09729C8F24F788AC64A663268603377FBF51D4B97818D49E2150C5D78067709" },
    Wheel { name: "requests.whl", url: "https://files.pythonhosted.org/packages/a0/f4/c67b0b3f1b9245e8d266f0f112c500d50e5b4e83cb6f3b71b6528104182a/requests-2.34.2-py3-none-any.whl", bytes: 73075, sha256: "2A0D60C172F83AC6AB31E4554906C0F3B3588D37B5CB939B1C061F4907E278E0" },
    Wheel { name: "idna.whl", url: "https://files.pythonhosted.org/packages/58/a2/bb081bab032533a855d44de1d56f8e8426114ff1ba5d1f07a438a0a654f8/idna-3.20-py3-none-any.whl", bytes: 69583, sha256: "AB7AE7122974553370F0BDB919E1A960B2CD1BC1EF0276416D896DB81C14582C" },
    Wheel { name: "urllib3.whl", url: "https://files.pythonhosted.org/packages/92/9d/c4e665119135114480843e7ab388fa94d8480650450e6f8e26b70d323a4c/urllib3-2.8.0-py3-none-any.whl", bytes: 135717, sha256: "0CF3CAE568D36AA9576B28DFB35F11328F1CB974CA7647D9475EBB86C75AC6E3" },
    Wheel { name: "charset.whl", url: "https://files.pythonhosted.org/packages/fc/ad/d07d7862a62ffa6d79d68074d14823243dd235a77c45262acbf6adeb28bf/charset_normalizer-3.5.2-py3-none-any.whl", bytes: 68872, sha256: "B6B751274ACB69D77B3323D6B7DBAA3C7FDFC1EB829B7EB61D262F32E1AF9685" },
    Wheel { name: "certifi.whl", url: "https://files.pythonhosted.org/packages/32/d1/a3652fe2c19134d0d15922177821d863cbd7e842d53a21bbe7e8e3a1b5ac/certifi-2026.10.23-py3-none-any.whl", bytes: 135082, sha256: "E9B54DE76E530BB6CF0CCD036787103ACB58FD42BA930EA8BF948DDBAA2F61D1" },
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
    verify_gallery_dependencies(directory, |path, expected| runtime::check_file(path, expected).map(|_| ()))?;
    Ok(())
}

pub(super) fn verify_gallery_dependencies(
    directory: &Path, mut verify: impl FnMut(&Path, &str) -> Result<(), String>,
) -> Result<Vec<PathIdentity>, String> {
    verify(&directory.join("gallery-entry.py"), ENTRY_SHA)?;
    let identity = PathIdentity::capture(&directory.join("gallery-wheels"))?;
    let wheel_dir = fs::symlink_metadata(directory.join("gallery-wheels"))
        .map_err(|error| error.to_string())?;
    if !wheel_dir.is_dir() || wheel_dir.file_type().is_symlink() {
        return Err("Invalid gallery dependency directory".into());
    }
    for wheel in WHEELS {
        let path = directory.join("gallery-wheels").join(wheel.name);
        verify(&path, wheel.sha256)?;
        if fs::symlink_metadata(&path).map_err(|error| error.to_string())?.len() != wheel.bytes {
            return Err("Gallery wheel size mismatch".into());
        }
    }
    identity.validate()?;
    Ok(vec![identity])
}

pub(super) fn verify_python(directory: &Path) -> Result<(), String> {
    verified_python(directory).map(|_| ())
}

pub(super) fn verified_python(directory: &Path) -> Result<Vec<PathIdentity>, String> {
    let (fingerprint, identities) = fingerprint_verified(&directory.join("python"))?;
    if fingerprint != PYTHON_TREE_SHA {
        return Err("Managed Python tree hash mismatch".into());
    }
    Ok(identities)
}

#[cfg(test)]
fn fingerprint(root: &Path) -> Result<String, String> {
    fingerprint_verified(root).map(|(digest, _)| digest)
}

fn fingerprint_verified(root: &Path) -> Result<(String, Vec<PathIdentity>), String> {
    let root_identity = PathIdentity::capture(root)?;
    let metadata = fs::symlink_metadata(root).map_err(|error| error.to_string())?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() { return Err("Invalid Python root".into()); }
    let mut paths = Vec::new();
    let mut total = 0u64;
    collect(root, root, &mut paths, &mut total)?;
    paths.sort_by(|left, right| left.0.cmp(&right.0));
    let mut digest = Sha256::new();
    let mut identities = vec![root_identity];
    for (relative, path, identity) in paths {
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
            identity.validate_handle(&file)?;
            (b'F', contents.finalize().to_vec())
        } else { return Err("Unsupported Python tree entry".into()); };
        digest.update([kind]);
        digest.update((relative.len() as u32).to_be_bytes());
        digest.update(&relative);
        digest.update((value.len() as u32).to_be_bytes());
        digest.update(&value);
        identities.push(identity);
    }
    for identity in &identities { identity.validate()?; }
    Ok((format!("{:X}", digest.finalize()), identities))
}

fn collect(root: &Path, directory: &Path, paths: &mut Vec<(Vec<u8>, PathBuf, PathIdentity)>, total: &mut u64) -> Result<(), String> {
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        let relative = path.strip_prefix(root).map_err(|error| error.to_string())?.as_os_str().as_bytes().to_vec();
        paths.push((relative, path.clone(), PathIdentity::capture(&path)?));
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
    fn verified_tree_rejects_nested_edits_additions_removals_and_link_replacement() {
        for change in ["edit", "add", "remove", "link"] {
            let root = tempfile::tempdir().unwrap();
            fs::create_dir(root.path().join("lib")).unwrap();
            let path = root.path().join("lib/module.py");
            fs::write(&path, b"trusted").unwrap();
            symlink("lib/module.py", root.path().join("entry")).unwrap();
            let (_, identities) = fingerprint_verified(root.path()).unwrap();
            assert!(identities.iter().all(|identity| identity.validate().is_ok()));
            match change {
                "edit" => {
                    let modified = fs::metadata(&path).unwrap().modified().unwrap();
                    fs::write(&path, b"changed").unwrap();
                    File::options().write(true).open(&path).unwrap()
                        .set_times(std::fs::FileTimes::new().set_modified(modified)).unwrap();
                }
                "add" => fs::write(root.path().join("lib/extra.py"), b"injected").unwrap(),
                "remove" => fs::remove_file(&path).unwrap(),
                "link" => {
                    fs::remove_file(root.path().join("entry")).unwrap();
                    symlink("lib/other.py", root.path().join("entry")).unwrap();
                }
                _ => unreachable!(),
            }
            assert!(identities.iter().any(|identity| identity.validate().is_err()), "{change}");
        }
    }

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
