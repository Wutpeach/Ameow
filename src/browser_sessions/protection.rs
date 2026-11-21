use super::{Result, storage};
use std::{fs, path::Path};

pub fn directory(path: &Path) -> Result<()> {
    crate::download::runtime::check_data_location(path).map_err(|_| storage())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| storage())?;
    }
    platform::directory(path)
}
pub use platform::{seal, unseal};

#[cfg(windows)]
mod platform {
    use super::*;
    use std::{
        mem,
        os::windows::{
            ffi::OsStrExt,
            io::{AsRawHandle, FromRawHandle, OwnedHandle},
        },
        ptr,
    };
    use windows_sys::Win32::{
        Foundation::{ERROR_ALREADY_EXISTS, GetLastError, LocalFree},
        Security::{
            Authorization::{
                ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
            },
            Cryptography::{
                CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData, CryptUnprotectData,
            },
            DACL_SECURITY_INFORMATION, GetTokenInformation, PROTECTED_DACL_SECURITY_INFORMATION,
            SECURITY_ATTRIBUTES, SetFileSecurityW, TOKEN_QUERY, TOKEN_USER, TokenUser,
        },
        Storage::FileSystem::CreateDirectoryW,
        System::Threading::{GetCurrentProcess, OpenProcessToken},
    };
    pub fn directory(path: &Path) -> Result<()> {
        unsafe {
            let mut token = ptr::null_mut();
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
                return Err(storage());
            }
            let token = OwnedHandle::from_raw_handle(token);
            let mut size = 0;
            GetTokenInformation(
                token.as_raw_handle(),
                TokenUser,
                ptr::null_mut(),
                0,
                &mut size,
            );
            if size == 0 {
                return Err(storage());
            }
            let mut bytes = vec![0u64; (size as usize).div_ceil(8)];
            if GetTokenInformation(
                token.as_raw_handle(),
                TokenUser,
                bytes.as_mut_ptr().cast(),
                size,
                &mut size,
            ) == 0
            {
                return Err(storage());
            }
            let mut sid = ptr::null_mut();
            if ConvertSidToStringSidW((*(bytes.as_ptr().cast::<TOKEN_USER>())).User.Sid, &mut sid)
                == 0
            {
                return Err(storage());
            }
            let mut len = 0;
            while *sid.add(len) != 0 {
                len += 1;
            }
            let sid_text = String::from_utf16_lossy(std::slice::from_raw_parts(sid, len));
            LocalFree(sid.cast());
            let sddl: Vec<_> = format!("D:P(A;OICI;FA;;;{sid_text})")
                .encode_utf16()
                .chain(Some(0))
                .collect();
            let mut descriptor = ptr::null_mut();
            if ConvertStringSecurityDescriptorToSecurityDescriptorW(
                sddl.as_ptr(),
                1,
                &mut descriptor,
                ptr::null_mut(),
            ) == 0
            {
                return Err(storage());
            }
            let attributes = SECURITY_ATTRIBUTES {
                nLength: mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
                lpSecurityDescriptor: descriptor,
                bInheritHandle: 0,
            };
            let wide: Vec<_> = path.as_os_str().encode_wide().chain(Some(0)).collect();
            let created = CreateDirectoryW(wide.as_ptr(), &attributes) != 0;
            let result = created
                || (GetLastError() == ERROR_ALREADY_EXISTS
                    && SetFileSecurityW(
                        wide.as_ptr(),
                        DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
                        descriptor,
                    ) != 0);
            LocalFree(descriptor);
            if result { Ok(()) } else { Err(storage()) }
        }
    }
    fn crypt(bytes: &[u8], encrypt: bool) -> Result<Vec<u8>> {
        let input = CRYPT_INTEGER_BLOB {
            cbData: bytes.len().try_into().map_err(|_| storage())?,
            pbData: bytes.as_ptr().cast_mut(),
        };
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: ptr::null_mut(),
        };
        unsafe {
            let ok = if encrypt {
                CryptProtectData(
                    &input,
                    ptr::null(),
                    ptr::null(),
                    ptr::null_mut(),
                    ptr::null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output,
                )
            } else {
                CryptUnprotectData(
                    &input,
                    ptr::null_mut(),
                    ptr::null(),
                    ptr::null_mut(),
                    ptr::null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output,
                )
            };
            if ok == 0 {
                return Err(storage());
            }
            let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
            LocalFree(output.pbData.cast());
            Ok(result)
        }
    }
    pub fn seal(_: &Path, bytes: &[u8]) -> Result<Vec<u8>> {
        crypt(bytes, true)
    }
    pub fn unseal(_: &Path, bytes: &[u8]) -> Result<Vec<u8>> {
        crypt(bytes, false)
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    use ring::{
        aead,
        rand::{SecureRandom, SystemRandom},
    };
    use sha2::{Digest, Sha256};
    use std::{
        ffi::{c_char, c_void},
        os::unix::fs::{DirBuilderExt, PermissionsExt},
        ptr,
    };
    type Ref = *const c_void;
    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFStringCreateWithCString(allocator: Ref, text: *const c_char, encoding: u32) -> Ref;
        fn CFDataCreate(allocator: Ref, bytes: *const u8, length: isize) -> Ref;
        fn CFDataGetLength(data: Ref) -> isize;
        fn CFDataGetBytePtr(data: Ref) -> *const u8;
        fn CFDictionaryCreate(
            allocator: Ref,
            keys: *const Ref,
            values: *const Ref,
            count: isize,
            key_callbacks: Ref,
            value_callbacks: Ref,
        ) -> Ref;
        fn CFArrayCreate(allocator: Ref, values: *const Ref, count: isize, callbacks: Ref) -> Ref;
        fn CFRelease(value: Ref);
        static kCFBooleanTrue: Ref;
    }
    #[link(name = "Security", kind = "framework")]
    unsafe extern "C" {
        fn SecItemAdd(attributes: Ref, result: *mut Ref) -> i32;
        fn SecItemCopyMatching(query: Ref, result: *mut Ref) -> i32;
        fn SecTrustedApplicationCreateFromPath(path: *const c_char, application: *mut Ref) -> i32;
        fn SecAccessCreate(descriptor: Ref, trusted: Ref, access: *mut Ref) -> i32;
        static kSecClass: Ref;
        static kSecClassGenericPassword: Ref;
        static kSecAttrService: Ref;
        static kSecAttrAccount: Ref;
        static kSecReturnData: Ref;
        static kSecValueData: Ref;
        static kSecAttrAccessible: Ref;
        static kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly: Ref;
        static kSecAttrAccess: Ref;
    }
    struct Owned(Ref);
    impl Drop for Owned {
        fn drop(&mut self) {
            unsafe {
                CFRelease(self.0);
            }
        }
    }
    fn keychain_error(status: i32) -> String {
        format!("E_SESSION_KEYCHAIN_{status}")
    }
    unsafe fn dictionary(keys: &[Ref], values: &[Ref]) -> Owned {
        Owned(unsafe {
            CFDictionaryCreate(
                ptr::null(),
                keys.as_ptr(),
                values.as_ptr(),
                keys.len() as isize,
                ptr::null(),
                ptr::null(),
            )
        })
    }
    pub fn directory(path: &Path) -> Result<()> {
        if !path.exists() {
            fs::DirBuilder::new()
                .mode(0o700)
                .create(path)
                .map_err(|_| storage())?;
        }
        let meta = fs::symlink_metadata(path).map_err(|_| storage())?;
        use std::os::unix::fs::MetadataExt;
        if !meta.is_dir() || meta.uid() != unsafe { libc::geteuid() } {
            return Err(storage());
        }
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|_| storage())
    }
    fn key(directory: &Path, create: bool) -> Result<[u8; 32]> {
        let account = std::ffi::CString::new(format!(
            "{:x}",
            Sha256::digest(directory.as_os_str().as_encoded_bytes())
        ))
        .map_err(|_| storage())?;
        unsafe {
            let service = Owned(CFStringCreateWithCString(
                ptr::null(),
                c"org.ameow.browser-sessions".as_ptr(),
                0x08000100,
            ));
            let account = Owned(CFStringCreateWithCString(
                ptr::null(),
                account.as_ptr(),
                0x08000100,
            ));
            let query = dictionary(
                &[kSecClass, kSecAttrService, kSecAttrAccount, kSecReturnData],
                &[
                    kSecClassGenericPassword,
                    service.0,
                    account.0,
                    kCFBooleanTrue,
                ],
            );
            let mut data = ptr::null();
            let status = SecItemCopyMatching(query.0, &mut data);
            if status == 0 {
                let data = Owned(data);
                if CFDataGetLength(data.0) != 32 {
                    return Err(storage());
                }
                return std::slice::from_raw_parts(CFDataGetBytePtr(data.0), 32)
                    .try_into()
                    .map_err(|_| storage());
            }
            if status != -25300 || !create {
                return Err(keychain_error(status));
            }
            let mut key = [0u8; 32];
            SystemRandom::new().fill(&mut key).map_err(|_| storage())?;
            let data = Owned(CFDataCreate(ptr::null(), key.as_ptr(), 32));
            // Both product executables share this key. Explicit trusted applications avoid
            // a Keychain prompt on each ordinary browser-to-desktop handoff.
            let executable = std::env::current_exe().map_err(|_| storage())?;
            let parent = executable.parent().ok_or_else(storage)?;
            let mut paths = vec![executable.clone()];
            for name in ["ameow", "ameow-browser-host"] {
                let path = parent.join(name);
                if path != executable && path.is_file() {
                    paths.push(path);
                }
            }
            let mut trusted = Vec::new();
            for path in paths {
                let path = std::ffi::CString::new(path.as_os_str().as_encoded_bytes())
                    .map_err(|_| storage())?;
                let mut application = ptr::null();
                if SecTrustedApplicationCreateFromPath(path.as_ptr(), &mut application) != 0 {
                    return Err(storage());
                }
                trusted.push(Owned(application));
            }
            let values: Vec<_> = trusted.iter().map(|v| v.0).collect();
            let list = Owned(CFArrayCreate(
                ptr::null(),
                values.as_ptr(),
                values.len() as isize,
                ptr::null(),
            ));
            let mut access = ptr::null();
            if SecAccessCreate(service.0, list.0, &mut access) != 0 {
                return Err(storage());
            }
            let access = Owned(access);
            let attributes = dictionary(
                &[
                    kSecClass,
                    kSecAttrService,
                    kSecAttrAccount,
                    kSecValueData,
                    kSecAttrAccessible,
                    kSecAttrAccess,
                ],
                &[
                    kSecClassGenericPassword,
                    service.0,
                    account.0,
                    data.0,
                    kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
                    access.0,
                ],
            );
            let status = SecItemAdd(attributes.0, ptr::null_mut());
            if status == -25299 {
                return self::key(directory, false);
            }
            if status != 0 {
                return Err(keychain_error(status));
            }
            Ok(key)
        }
    }
    pub fn seal(directory: &Path, bytes: &[u8]) -> Result<Vec<u8>> {
        let key = aead::LessSafeKey::new(
            aead::UnboundKey::new(&aead::AES_256_GCM, &key(directory, true)?)
                .map_err(|_| storage())?,
        );
        let mut nonce = [0u8; 12];
        SystemRandom::new()
            .fill(&mut nonce)
            .map_err(|_| storage())?;
        let mut output = bytes.to_vec();
        key.seal_in_place_append_tag(
            aead::Nonce::assume_unique_for_key(nonce),
            aead::Aad::from(b"Ameow browser sessions v1"),
            &mut output,
        )
        .map_err(|_| storage())?;
        Ok([nonce.as_slice(), output.as_slice()].concat())
    }
    pub fn unseal(directory: &Path, bytes: &[u8]) -> Result<Vec<u8>> {
        if bytes.len() < 28 {
            return Err(storage());
        }
        let key = aead::LessSafeKey::new(
            aead::UnboundKey::new(&aead::AES_256_GCM, &key(directory, false)?)
                .map_err(|_| storage())?,
        );
        let mut output = bytes[12..].to_vec();
        let opened = key
            .open_in_place(
                aead::Nonce::try_assume_unique_for_key(&bytes[..12]).map_err(|_| storage())?,
                aead::Aad::from(b"Ameow browser sessions v1"),
                &mut output,
            )
            .map_err(|_| storage())?;
        Ok(opened.to_vec())
    }
}
