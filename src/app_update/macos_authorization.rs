use std::{
    ffi::{CString, c_char, c_void},
    fs::File,
    os::fd::FromRawFd,
    path::Path,
};

#[repr(C)]
struct AuthorizationItem {
    name: *const c_char,
    value_length: usize,
    value: *mut c_void,
    flags: u32,
}

#[repr(C)]
struct AuthorizationItems {
    count: u32,
    items: *mut AuthorizationItem,
}

#[link(name = "Security", kind = "framework")]
unsafe extern "C" {
    fn AuthorizationCreate(rights: *const AuthorizationItems, environment: *const AuthorizationItems,
        flags: u32, authorization: *mut *mut c_void) -> i32;
    fn AuthorizationCopyRights(authorization: *mut c_void, rights: *const AuthorizationItems,
        environment: *const AuthorizationItems, flags: u32, granted: *mut *mut AuthorizationItems) -> i32;
    fn AuthorizationExecuteWithPrivileges(authorization: *mut c_void, tool: *const c_char,
        flags: u32, arguments: *mut *mut c_char, pipe: *mut *mut libc::FILE) -> i32;
    fn AuthorizationFree(authorization: *mut c_void, flags: u32) -> i32;
}

struct Authorization(*mut c_void);
impl Drop for Authorization {
    fn drop(&mut self) { unsafe { AuthorizationFree(self.0, 1 << 3); } }
}

pub(super) const BOOTSTRAP: &str = r#"set -efu
unset ENV BASH_ENV CDPATH IFS DYLD_INSERT_LIBRARIES DYLD_LIBRARY_PATH DYLD_FRAMEWORK_PATH DYLD_FALLBACK_LIBRARY_PATH DYLD_FALLBACK_FRAMEWORK_PATH DYLD_ROOT_PATH DYLD_VERSIONED_LIBRARY_PATH DYLD_VERSIONED_FRAMEWORK_PATH LD_PRELOAD
PATH=/usr/bin:/bin:/usr/sbin:/sbin
LC_ALL=C
export PATH LC_ALL
umask 077
[ "$#" -eq 3 ] || exit 120
source=$1
expected=$2
image=$3
case "$image" in ameow|ameow-updater) ;; *) exit 120 ;; esac
case "$source" in /*.app) ;; *) exit 120 ;; esac
[ "${#expected}" -eq 40 ] || exit 120
case "$expected" in *[!0123456789abcdef]*) exit 120 ;; esac
ancestor=$source
while [ "$ancestor" != / ]; do
    [ ! -L "$ancestor" ] || exit 121
    ancestor=${ancestor%/*}
    [ -n "$ancestor" ] || ancestor=/
done
private=$(/usr/bin/mktemp -d /private/tmp/ameow-privileged-code.XXXXXXXX)
trap '/bin/rm -rf "$private"' 0
trap 'exit 125' 1 2 15
/usr/bin/ditto --noacl --noextattr "$source" "$private/Ameow.app"
[ -d "$private/Ameow.app" ] && [ ! -L "$private/Ameow.app" ] || exit 121
/usr/sbin/chown -R -P -h "$(/usr/bin/id -u):$(/usr/bin/id -g)" "$private/Ameow.app"
/bin/chmod -R -P a+rX,a-w "$private/Ameow.app"
/usr/bin/codesign --verify --deep --strict --all-architectures "$private/Ameow.app"
actual=$(/usr/bin/codesign --display --verbose=4 --arch arm64 "$private/Ameow.app/Contents/MacOS/$image" 2>&1 | /usr/bin/awk -F= '/^CDHash=/{print $2}')
[ "$actual" = "$expected" ] || exit 122
[ -f "$private/Ameow.app/Contents/MacOS/ameow-updater" ] && [ ! -L "$private/Ameow.app/Contents/MacOS/ameow-updater" ] || exit 121
/bin/chmod 711 "$private"
printf 'BOOTSTRAP %s\n' "$private/Ameow.app"
trap - 0 1 2 15
exec "$private/Ameow.app/Contents/MacOS/ameow-updater" --privileged-worker "$private/Ameow.app"
"#;

pub(super) fn running_cdhash() -> Result<String, String> {
    process_cdhash(std::process::id())
}

pub(super) fn process_cdhash(pid: u32) -> Result<String, String> {
    type CsOps = unsafe extern "C" fn(i32, u32, *mut c_void, usize) -> i32;
    let symbol = unsafe { libc::dlsym(libc::RTLD_DEFAULT, c"csops".as_ptr()) };
    if symbol.is_null() { return Err("E_APP_UPDATE_RUNNING_IDENTITY_UNAVAILABLE".into()); }
    let csops: CsOps = unsafe { std::mem::transmute(symbol) };
    let mut hash = [0u8; 20];
    if pid <= 1 || pid > i32::MAX as u32 { return Err("E_APP_UPDATE_PROCESS_IDENTITY".into()); }
    if unsafe { csops(pid as i32, 5, hash.as_mut_ptr().cast(), hash.len()) } != 0 {
        return Err(format!("E_APP_UPDATE_RUNNING_IDENTITY: {}", std::io::Error::last_os_error()));
    }
    if hash.iter().all(|byte| *byte == 0) { return Err("E_APP_UPDATE_RUNNING_IDENTITY".into()); }
    Ok(hash.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn authorization_error(status: i32) -> String {
    match status {
        -60006 => "E_APP_UPDATE_AUTHORIZATION_CANCELLED".into(),
        -60007 => "E_APP_UPDATE_AUTHORIZATION_INTERACTION_REQUIRED".into(),
        _ => format!("E_APP_UPDATE_AUTHORIZATION: {status}"),
    }
}

fn source_identity(bundle: &Path) -> Result<(String, String), String> {
    if unsafe { libc::geteuid() } == 0 { return Err("E_APP_UPDATE_MAIN_MUST_NOT_RUN_AS_ROOT".into()); }
    super::macos_fs::directory(bundle)?;
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let image = executable.file_name().and_then(|name| name.to_str()).ok_or("E_APP_UPDATE_RUNNING_IDENTITY")?;
    if !matches!(image, "ameow" | "ameow-updater") || executable != bundle.join("Contents/MacOS").join(image) {
        return Err("E_APP_UPDATE_RUNNING_IDENTITY".into());
    }
    Ok((image.into(), running_cdhash()?))
}

pub(super) fn launch(bundle: &Path) -> Result<File, String> {
    use std::os::unix::ffi::OsStrExt;
    let (image, identity) = source_identity(bundle)?;
    let mut raw = std::ptr::null_mut();
    let status = unsafe { AuthorizationCreate(std::ptr::null(), std::ptr::null(), 0, &mut raw) };
    if status != 0 { return Err(authorization_error(status)); }
    let authorization = Authorization(raw);
    let mut item = AuthorizationItem { name: c"system.privilege.admin".as_ptr(),
        value_length: c"/bin/sh".to_bytes().len(), value: c"/bin/sh".as_ptr().cast_mut().cast(), flags: 0 };
    let rights = AuthorizationItems { count: 1, items: &mut item };
    let status = unsafe { AuthorizationCopyRights(authorization.0, &rights, std::ptr::null(), 3, std::ptr::null_mut()) };
    if status != 0 { return Err(authorization_error(status)); }
    let arguments = [CString::new("-p").unwrap(), CString::new("-c").unwrap(), CString::new(BOOTSTRAP).unwrap(),
        CString::new("ameow-authorized-bootstrap").unwrap(),
        CString::new(bundle.as_os_str().as_bytes()).map_err(|_| "E_APP_UPDATE_PATH")?,
        CString::new(identity).unwrap(), CString::new(image).unwrap()];
    let mut pointers = arguments.iter().map(|argument| argument.as_ptr().cast_mut()).collect::<Vec<_>>();
    pointers.push(std::ptr::null_mut());
    let mut pipe = std::ptr::null_mut();
    let status = unsafe { AuthorizationExecuteWithPrivileges(authorization.0, c"/bin/sh".as_ptr(),
        0, pointers.as_mut_ptr(), &mut pipe) };
    if status != 0 { return Err(authorization_error(status)); }
    if pipe.is_null() { return Err("E_APP_UPDATE_AUTHORIZATION_PIPE".into()); }
    let descriptor = unsafe { libc::fcntl(libc::fileno(pipe), libc::F_DUPFD_CLOEXEC, 3) };
    let error = std::io::Error::last_os_error();
    unsafe { libc::fclose(pipe); }
    if descriptor < 0 { return Err(format!("E_APP_UPDATE_AUTHORIZATION_PIPE: {error}")); }
    Ok(unsafe { File::from_raw_fd(descriptor) })
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;
    use std::{fs, io::Write, process::{Command, Stdio}};
    use std::os::unix::fs::symlink;

    #[test]
    fn source_identity_child() {
        if std::env::var_os("AMEOW_SOURCE_IDENTITY_CHILD").is_none() { return; }
        let bundle = super::super::macos::current_bundle().unwrap();
        let (image, identity) = source_identity(&bundle).unwrap();
        assert_eq!(image, "ameow-updater");
        assert_eq!(identity.len(), 40);
        let fingerprint = super::super::macos_transaction::readonly_fingerprint(&bundle).unwrap();
        assert_eq!(fingerprint.len(), 64);
        println!("ordinary-user preserved helper identity and bundle fingerprint verified before AuthorizationCreate");
    }

    #[test]
    fn preserved_helper_preflight_works_through_search_only_ancestors_without_an_installed_target() {
        use std::os::unix::fs::PermissionsExt;
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().canonicalize().unwrap();
        let preserved = root.join("preserved");
        let (bundle, _) = signed_bundle(&preserved);
        let helper = bundle.join("Contents/MacOS/ameow-updater");
        fs::copy(std::env::current_exe().unwrap(), &helper).unwrap();
        assert!(Command::new("/usr/bin/codesign").args(["--force", "--sign", "-", "--timestamp=none"]).arg(&bundle).output().unwrap().status.success());
        let before = super::super::macos_transaction::readonly_fingerprint(&bundle).unwrap();
        fs::set_permissions(&preserved, fs::Permissions::from_mode(0o111)).unwrap();
        let output = Command::new(&helper).args(["--exact", "app_update::macos_authorization::tests::source_identity_child", "--nocapture"])
            .env("AMEOW_SOURCE_IDENTITY_CHILD", "1").output();
        let permissions = fs::metadata(&preserved).unwrap().permissions().mode() & 0o777;
        fs::set_permissions(&preserved, fs::Permissions::from_mode(0o700)).unwrap();
        let output = output.unwrap();
        assert!(output.status.success(), "stdout={} stderr={}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr));
        assert_eq!(permissions, 0o111);
        assert_eq!(super::super::macos_transaction::readonly_fingerprint(&bundle).unwrap(), before);
        assert!(!root.join("Applications/Ameow.app").exists());
    }

    pub(crate) fn signed_bundle(root: &Path) -> (std::path::PathBuf, String) {
        let bundle = root.join("Ameow.app");
        fs::create_dir_all(bundle.join("Contents/MacOS")).unwrap();
        fs::write(bundle.join("Contents/Info.plist"), br#"<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>io.github.wutpeach.ameow</string><key>CFBundleExecutable</key><string>ameow</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>1.0.0</string></dict></plist>"#).unwrap();
        let probe = root.join("probe");
        let mut compiler = Command::new("/usr/bin/clang").args(["-x", "c", "-arch", "arm64", "-mmacosx-version-min=13.0", "-o"])
            .arg(&probe).arg("-").stdin(Stdio::piped()).spawn().unwrap();
        compiler.stdin.take().unwrap().write_all(b"int main(void) { return 0; }\n").unwrap();
        assert!(compiler.wait().unwrap().success());
        for name in ["ameow", "ameow-updater"] {
            fs::copy(&probe, bundle.join("Contents/MacOS").join(name)).unwrap();
        }
        for path in [bundle.join("Contents/MacOS/ameow-updater"), bundle.clone()] {
            let result = Command::new("/usr/bin/codesign").args(["--force", "--sign", "-", "--timestamp=none"]).arg(path).output().unwrap();
            assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stderr));
        }
        let output = Command::new("/usr/bin/codesign").args(["--display", "--verbose=4", "--arch", "arm64"]).arg(&bundle).output().unwrap();
        let hash = String::from_utf8_lossy(&output.stderr).lines().find_map(|line| line.strip_prefix("CDHash=")).unwrap().to_string();
        (bundle, hash)
    }

    #[test]
    fn bootstrap_copies_and_verifies_the_whole_bundle_without_authorization() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().canonicalize().unwrap();
        let (bundle, hash) = signed_bundle(&root);
        let run = || Command::new("/bin/sh").args(["-c", BOOTSTRAP, "bootstrap-test"])
            .arg(&bundle).arg(&hash).arg("ameow").output().unwrap();
        let result = run();
        assert!(result.status.success(), "{} stdout={} stderr={}", result.status, String::from_utf8_lossy(&result.stdout), String::from_utf8_lossy(&result.stderr));
        let text = String::from_utf8(result.stdout).unwrap();
        let snapshot = std::path::PathBuf::from(text.trim().strip_prefix("BOOTSTRAP ").unwrap());
        assert!(snapshot.starts_with("/private/tmp"));
        assert_eq!(super::super::macos_transaction::readonly_fingerprint(&bundle).unwrap(), super::super::macos_transaction::fingerprint(&snapshot).unwrap());
        assert!(Command::new("/bin/chmod").args(["-R", "-P", "u+w"]).arg(&snapshot).status().unwrap().success());
        fs::remove_dir_all(snapshot.parent().unwrap()).unwrap();
        fs::write(bundle.join("Contents/MacOS/ameow-updater"), b"replaced helper").unwrap();
        let rejected = run();
        assert!(!rejected.status.success());
        assert!(!String::from_utf8_lossy(&rejected.stdout).contains("BOOTSTRAP "));
        let redirected = root.join("redirect.app");
        symlink(&bundle, &redirected).unwrap();
        let rejected = Command::new("/bin/sh").args(["-c", BOOTSTRAP, "bootstrap-test"]).arg(redirected).arg(hash).arg("ameow").output().unwrap();
        assert!(!rejected.status.success());
    }

    #[test]
    fn cancellation_and_interaction_required_are_not_treated_as_success() {
        assert_eq!(authorization_error(-60006), "E_APP_UPDATE_AUTHORIZATION_CANCELLED");
        assert_eq!(authorization_error(-60007), "E_APP_UPDATE_AUTHORIZATION_INTERACTION_REQUIRED");
        assert_eq!(authorization_error(-60005), "E_APP_UPDATE_AUTHORIZATION: -60005");
    }

    #[test]
    fn running_identity_matches_the_executing_code_signature() {
        let expected = running_cdhash().unwrap();
        let output = std::process::Command::new("/usr/bin/codesign")
            .args(["--display", "--verbose=4", "--arch", "arm64"])
            .arg(std::env::current_exe().unwrap()).output().unwrap();
        assert!(output.status.success());
        let text = String::from_utf8_lossy(&output.stderr);
        assert_eq!(text.lines().find_map(|line| line.strip_prefix("CDHash=")), Some(expected.as_str()));
    }
}
