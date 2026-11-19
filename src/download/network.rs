//! Read-only system route resolution. No ambient env proxy or fallback.
use serde::{Deserialize, Serialize};
use std::{
    fs::OpenOptions,
    io::{Read, Write},
    path::Path,
    ptr,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use url::Url;
#[cfg(windows)]
use windows_sys::Win32::{Foundation::GlobalFree, Networking::WinHttp::*};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum Route {
    Direct,
    Proxy(String),
}
impl Route {
    pub fn cli(&self) -> String {
        match self {
            Self::Direct => String::new(),
            Self::Proxy(s) => s.clone(),
        }
    }
}
#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}
#[cfg(windows)]
unsafe fn take_wide(p: *mut u16) -> Option<String> {
    if p.is_null() {
        return None;
    }
    let mut len = 0;
    unsafe {
        while *p.add(len) != 0 {
            len += 1;
        }
        let text = String::from_utf16_lossy(std::slice::from_raw_parts(p, len));
        GlobalFree(p.cast());
        Some(text)
    }
}
pub fn parse_proxy(proxy: &str, scheme: &str) -> Result<Route, String> {
    if proxy.trim().is_empty() {
        return Err("Empty named proxy result".into());
    }
    let fields: Vec<_> = proxy
        .split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();
    let selected = if fields.iter().any(|s| s.contains('=')) {
        let candidates: Vec<_> = fields
            .iter()
            .filter_map(|s| s.split_once('='))
            .filter(|(k, _)| *k == scheme)
            .map(|(_, v)| v)
            .collect();
        if candidates.len() != 1 {
            return Err("OS proxy map does not specify one route for requested scheme".into());
        }
        candidates[0]
    } else {
        if fields.len() != 1 {
            return Err("Multiple OS proxy routes are unsupported".into());
        }
        fields[0]
    };
    if selected.chars().any(char::is_whitespace) || selected.contains(',') {
        return Err("Multiple/unsupported OS proxy result".into());
    }
    let normalized = if selected.contains("://") {
        selected.to_owned()
    } else {
        format!("http://{selected}")
    };
    let p = Url::parse(&normalized).map_err(|e| format!("OS proxy URL: {e}"))?;
    if !matches!(p.scheme(), "http" | "https")
        || p.host_str().is_none()
        || !p.username().is_empty()
        || p.password().is_some()
        || p.path() != "/"
        || p.query().is_some()
    {
        return Err("Only one unauthenticated HTTP(S) proxy is supported".into());
    }
    Ok(Route::Proxy(normalized))
}
#[cfg(any(windows, test))]
fn bypass(host: &str, patterns: &str) -> Result<bool, String> {
    let host = host.to_ascii_lowercase();
    let mut matched = false;
    for pattern in patterns.split(';').map(str::trim).filter(|s| !s.is_empty()) {
        if pattern == "<local>" {
            if !host.contains('.') {
                matched = true;
            }
            continue;
        }
        if !pattern
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'*' | b'.' | b'-' | b':'))
        {
            return Err("OS proxy bypass pattern unsupported; refusing route guess".into());
        }
        // Windows host wildcard, including prefix/suffix and private IPv4 ranges. No regex/PAC.
        let pattern = pattern.to_ascii_lowercase();
        let (mut p, mut h, mut star, mut saved) = (0, 0, None, 0);
        let (pattern, hostname) = (pattern.as_bytes(), host.as_bytes());
        while h < hostname.len() {
            if p < pattern.len() && pattern[p] == hostname[h] {
                p += 1;
                h += 1;
            } else if p < pattern.len() && pattern[p] == b'*' {
                star = Some(p);
                p += 1;
                saved = h;
            } else if let Some(position) = star {
                p = position + 1;
                saved += 1;
                h = saved;
            } else {
                break;
            }
        }
        while p < pattern.len() && pattern[p] == b'*' {
            p += 1;
        }
        matched |= h == hostname.len() && p == pattern.len();
    }
    Ok(matched)
}
#[cfg(windows)]
pub fn resolve(input: &str) -> Result<Route, String> {
    let url = Url::parse(input).map_err(|e| format!("Network URL: {e}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Unsupported network scheme".into());
    }
    let mut config = WINHTTP_CURRENT_USER_IE_PROXY_CONFIG::default();
    if unsafe { WinHttpGetIEProxyConfigForCurrentUser(&mut config) } == 0 {
        return Err(format!(
            "Windows proxy config: {}",
            std::io::Error::last_os_error()
        ));
    }
    let auto = unsafe { take_wide(config.lpszAutoConfigUrl) };
    let proxy = unsafe { take_wide(config.lpszProxy) };
    let excluded = unsafe { take_wide(config.lpszProxyBypass) };
    if config.fAutoDetect != 0 || auto.is_some() {
        let session = unsafe {
            WinHttpOpen(
                wide("Ameow Next/Stage A").as_ptr(),
                WINHTTP_ACCESS_TYPE_NO_PROXY,
                ptr::null(),
                ptr::null(),
                0,
            )
        };
        if session.is_null() {
            return Err("WinHTTP route session failed".into());
        }
        let auto_wide = auto.as_deref().map(wide);
        let mut options = WINHTTP_AUTOPROXY_OPTIONS {
            dwFlags: if auto.is_some() {
                WINHTTP_AUTOPROXY_CONFIG_URL
            } else {
                WINHTTP_AUTOPROXY_AUTO_DETECT
            },
            dwAutoDetectFlags: WINHTTP_AUTO_DETECT_TYPE_DHCP | WINHTTP_AUTO_DETECT_TYPE_DNS_A,
            lpszAutoConfigUrl: auto_wide.as_ref().map_or(ptr::null(), |s| s.as_ptr()),
            fAutoLogonIfChallenged: 0,
            ..Default::default()
        };
        let mut info = WINHTTP_PROXY_INFO::default();
        unsafe {
            WinHttpSetTimeouts(session, 10000, 10000, 10000, 10000);
        }
        let succeeded = unsafe {
            WinHttpGetProxyForUrl(session, wide(input).as_ptr(), &mut options, &mut info)
        };
        let error = std::io::Error::last_os_error();
        let resolved = unsafe { take_wide(info.lpszProxy) };
        let resolved_bypass = unsafe { take_wide(info.lpszProxyBypass) };
        unsafe {
            WinHttpCloseHandle(session);
        }
        if succeeded == 0 {
            return Err(format!(
                "Windows automatic route unresolved: {error}; no direct fallback"
            ));
        }
        if resolved_bypass
            .as_deref()
            .map(|s| bypass(url.host_str().unwrap_or(""), s))
            .transpose()?
            .unwrap_or(false)
        {
            return Ok(Route::Direct);
        }
        return match info.dwAccessType {
            WINHTTP_ACCESS_TYPE_NO_PROXY => Ok(Route::Direct),
            WINHTTP_ACCESS_TYPE_NAMED_PROXY => parse_proxy(
                resolved.as_deref().ok_or("PAC returned no named route")?,
                url.scheme(),
            ),
            _ => Err("Unsupported Windows automatic route".into()),
        };
    }
    if excluded
        .as_deref()
        .map(|s| bypass(url.host_str().unwrap_or(""), s))
        .transpose()?
        .unwrap_or(false)
    {
        return Ok(Route::Direct);
    }
    match proxy {
        None => Ok(Route::Direct),
        Some(proxy) => parse_proxy(&proxy, url.scheme()),
    }
}
/// The engine cannot delegate its opaque requests back to the OS resolver. Restrict it to a
/// static configuration whose bypass does not match the accepted origin. Native media requests use this explicit accepted-origin route; unrelated bypass entries do not block public videos. This does not attest every future redirect/CDN request.
pub fn engine_route(input: &str) -> Result<Route, String> {
    // Local media evidence only: keep production URL checks and real engines, while
    // an explicit debug update fixture serves these fixed public-origin test paths.
    #[cfg(all(feature = "app-update-fixture", debug_assertions))]
    {
        let args: Vec<_> = std::env::args().collect();
        if let Some(route) = fixture_media_route(input, &args) { return Ok(route); }
    }
    platform_engine_route(input)
}
#[cfg(all(feature = "app-update-fixture", debug_assertions))]
pub(crate) fn fixture_media_route(input: &str, args: &[String]) -> Option<Route> {
    if !matches!(input, "http://example.com/ameow-issue33-1.mp4" | "https://example.com/ameow-issue33-1.mp4"
        | "http://example.com/ameow-issue33-2.mp4" | "http://example.com/ameow-issue33-3.mp4") { return None; }
    if !args.windows(2).any(|p| p[0] == "--app-update-fixture-dir" && std::path::Path::new(&p[1]).is_dir()) { return None; }
    let port = args.windows(2).find(|p| p[0] == "--app-update-fixture-media-port")?
        [1].parse::<u16>().ok().filter(|port| *port != 0)?;
    Some(Route::Proxy(format!("http://127.0.0.1:{port}")))
}
#[cfg(windows)]
fn platform_engine_route(input: &str) -> Result<Route, String> {
    let mut config = WINHTTP_CURRENT_USER_IE_PROXY_CONFIG::default();
    if unsafe { WinHttpGetIEProxyConfigForCurrentUser(&mut config) } == 0 {
        return Err(format!(
            "Windows engine proxy config: {}",
            std::io::Error::last_os_error()
        ));
    }
    let auto = unsafe { take_wide(config.lpszAutoConfigUrl) };
    let proxy = unsafe { take_wide(config.lpszProxy) };
    let excluded = unsafe { take_wide(config.lpszProxyBypass) };
    static_engine_route(
        input,
        config.fAutoDetect != 0 || auto.is_some(),
        proxy.as_deref(),
        excluded.as_deref(),
    )
}
#[cfg(target_os = "macos")]
pub fn resolve(input: &str) -> Result<Route, String> {
    macos::resolve(input, false)
}
#[cfg(target_os = "macos")]
fn platform_engine_route(input: &str) -> Result<Route, String> {
    macos::resolve(input, true)
}
#[cfg(not(any(windows, target_os = "macos")))]
pub fn resolve(_: &str) -> Result<Route, String> {
    Err("System proxy resolution unsupported on this platform; no fallback".into())
}
#[cfg(not(any(windows, target_os = "macos")))]
fn platform_engine_route(input: &str) -> Result<Route, String> {
    resolve(input)
}
#[cfg(any(windows, test))]
fn static_engine_route(
    input: &str,
    automatic: bool,
    proxy: Option<&str>,
    excluded: Option<&str>,
) -> Result<Route, String> {
    if automatic {
        return Err("Automatic/PAC routes cannot bind opaque engine requests; no fallback".into());
    }
    if let Some(proxy) = proxy {
        let url = Url::parse(input).map_err(|e| format!("Network URL: {e}"))?;
        if !matches!(url.scheme(), "http" | "https") {
            return Err("Unsupported network scheme".into());
        }
        if excluded
            .map(|patterns| bypass(url.host_str().unwrap_or(""), patterns))
            .transpose()?
            .unwrap_or(false)
        {
            return Err(
                "Accepted origin matches proxy bypass; opaque engine route unsupported; no fallback"
                    .into(),
            );
        }
        let http = parse_proxy(proxy, "http")?;
        let https = parse_proxy(proxy, "https")?;
        if http != https {
            return Err("Scheme-sensitive proxy routes unsupported by engine".into());
        }
        Ok(https)
    } else {
        resolve(input)
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use std::{ffi::c_void, time::Instant};

    type Cf = *const c_void;
    type Callback = unsafe extern "C" fn(*mut c_void, Cf, Cf);

    #[repr(C)]
    struct Context {
        version: isize,
        info: *mut c_void,
        retain: Option<unsafe extern "C" fn(Cf) -> Cf>,
        release: Option<unsafe extern "C" fn(Cf)>,
        description: Option<unsafe extern "C" fn(Cf) -> Cf>,
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFRelease(value: Cf);
        fn CFRetain(value: Cf) -> Cf;
        fn CFGetTypeID(value: Cf) -> usize;
        fn CFEqual(left: Cf, right: Cf) -> u8;
        fn CFStringGetTypeID() -> usize;
        fn CFArrayGetTypeID() -> usize;
        fn CFDictionaryGetTypeID() -> usize;
        fn CFNumberGetTypeID() -> usize;
        fn CFURLGetTypeID() -> usize;
        fn CFStringCreateWithBytes(
            allocator: Cf,
            bytes: *const u8,
            length: isize,
            encoding: u32,
            external: u8,
        ) -> Cf;
        fn CFStringGetLength(value: Cf) -> isize;
        fn CFStringGetMaximumSizeForEncoding(length: isize, encoding: u32) -> isize;
        fn CFStringGetCString(value: Cf, buffer: *mut i8, size: isize, encoding: u32) -> u8;
        fn CFURLCreateWithString(allocator: Cf, string: Cf, base: Cf) -> Cf;
        fn CFArrayGetCount(array: Cf) -> isize;
        fn CFArrayGetValueAtIndex(array: Cf, index: isize) -> Cf;
        fn CFDictionaryGetValue(dictionary: Cf, key: Cf) -> Cf;
        fn CFDictionaryGetCount(dictionary: Cf) -> isize;
        fn CFDictionaryGetKeysAndValues(dictionary: Cf, keys: *mut Cf, values: *mut Cf);
        fn CFNumberGetValue(number: Cf, kind: isize, value: *mut c_void) -> u8;
        fn CFRunLoopGetCurrent() -> Cf;
        fn CFRunLoopAddSource(run_loop: Cf, source: Cf, mode: Cf);
        fn CFRunLoopRemoveSource(run_loop: Cf, source: Cf, mode: Cf);
        fn CFRunLoopSourceInvalidate(source: Cf);
        fn CFRunLoopRunInMode(mode: Cf, seconds: f64, return_after_source: u8) -> i32;
    }

    #[link(name = "CFNetwork", kind = "framework")]
    unsafe extern "C" {
        fn CFNetworkCopySystemProxySettings() -> Cf;
        fn CFNetworkCopyProxiesForURL(url: Cf, settings: Cf) -> Cf;
        fn CFNetworkExecuteProxyAutoConfigurationURL(
            pac: Cf,
            url: Cf,
            callback: Callback,
            context: *mut Context,
        ) -> Cf;
        fn CFNetworkExecuteProxyAutoConfigurationScript(
            script: Cf,
            url: Cf,
            callback: Callback,
            context: *mut Context,
        ) -> Cf;
        static kCFProxyTypeKey: Cf;
        static kCFProxyTypeNone: Cf;
        static kCFProxyTypeHTTP: Cf;
        static kCFProxyTypeHTTPS: Cf;
        static kCFProxyTypeAutoConfigurationURL: Cf;
        static kCFProxyTypeAutoConfigurationJavaScript: Cf;
        static kCFProxyHostNameKey: Cf;
        static kCFProxyPortNumberKey: Cf;
        static kCFProxyUsernameKey: Cf;
        static kCFProxyPasswordKey: Cf;
        static kCFProxyAutoConfigurationURLKey: Cf;
        static kCFProxyAutoConfigurationJavaScriptKey: Cf;
    }

    struct Owned(Cf);
    impl Owned {
        fn new(value: Cf) -> Result<Self, String> {
            if value.is_null() {
                Err("macOS proxy API returned no result; no fallback".into())
            } else {
                Ok(Self(value))
            }
        }
    }
    impl Drop for Owned {
        fn drop(&mut self) {
            unsafe { CFRelease(self.0) }
        }
    }
    struct Scheduled {
        source: Owned,
        mode: Owned,
        run_loop: Cf,
    }
    impl Drop for Scheduled {
        fn drop(&mut self) {
            unsafe {
                CFRunLoopSourceInvalidate(self.source.0);
                CFRunLoopRemoveSource(self.run_loop, self.source.0, self.mode.0);
            }
        }
    }
    fn string(value: &str) -> Result<Owned, String> {
        Owned::new(unsafe {
            CFStringCreateWithBytes(
                ptr::null(),
                value.as_ptr(),
                value.len() as isize,
                0x08000100,
                0,
            )
        })
    }
    fn check_type(value: Cf, expected: usize) -> Result<Cf, String> {
        if value.is_null() || unsafe { CFGetTypeID(value) } != expected {
            Err("Malformed macOS proxy result; no fallback".into())
        } else {
            Ok(value)
        }
    }
    fn text(value: Cf) -> Result<String, String> {
        check_type(value, unsafe { CFStringGetTypeID() })?;
        let size =
            unsafe { CFStringGetMaximumSizeForEncoding(CFStringGetLength(value), 0x08000100) };
        if !(0..=65536).contains(&size) {
            return Err("macOS proxy string is too large".into());
        }
        let mut bytes = vec![0_u8; size as usize + 1];
        if unsafe {
            CFStringGetCString(
                value,
                bytes.as_mut_ptr().cast(),
                bytes.len() as isize,
                0x08000100,
            )
        } == 0
        {
            return Err("Invalid macOS proxy string".into());
        }
        let length = bytes
            .iter()
            .position(|byte| *byte == 0)
            .ok_or("Invalid macOS proxy string")?;
        let result =
            String::from_utf8(bytes[..length].to_vec()).map_err(|_| "Invalid macOS proxy UTF-8")?;
        if result.encode_utf16().count() as isize != unsafe { CFStringGetLength(value) } {
            return Err("Embedded NUL in macOS proxy string".into());
        }
        Ok(result)
    }
    fn number(value: Cf) -> Result<i64, String> {
        check_type(value, unsafe { CFNumberGetTypeID() })?;
        let mut result = 0_i64;
        if unsafe { CFNumberGetValue(value, 4, (&mut result as *mut i64).cast()) } == 0 {
            return Err("Invalid macOS proxy number".into());
        }
        Ok(result)
    }
    fn get(dictionary: Cf, key: Cf) -> Cf {
        unsafe { CFDictionaryGetValue(dictionary, key) }
    }
    fn setting(dictionary: Cf, key: &str) -> Result<Cf, String> {
        Ok(get(dictionary, string(key)?.0))
    }
    fn enabled(settings: Cf, key: &str) -> Result<bool, String> {
        let value = setting(settings, key)?;
        Ok(!value.is_null() && number(value)? != 0)
    }
    fn same_policy(settings: Cf, scoped: Cf) -> Result<(), String> {
        check_type(scoped, unsafe { CFDictionaryGetTypeID() })?;
        let mut keys = vec!["ExceptionsList".to_owned()];
        for flag in [
            "ExcludeSimpleHostnames",
            "ProxyAutoDiscoveryEnable",
            "ProxyAutoConfigEnable",
            "HTTPEnable",
            "HTTPSEnable",
            "SOCKSEnable",
        ] {
            if enabled(settings, flag)? != enabled(scoped, flag)? {
                return Err(
                    "Different scoped macOS proxy policies unsupported; no fallback".into(),
                );
            }
        }
        for prefix in ["HTTP", "HTTPS", "SOCKS"] {
            if enabled(settings, &format!("{prefix}Enable"))? {
                keys.extend([format!("{prefix}Proxy"), format!("{prefix}Port")]);
            }
        }
        if enabled(settings, "ProxyAutoConfigEnable")? {
            keys.extend([
                "ProxyAutoConfigURLString".into(),
                "ProxyAutoConfigJavaScript".into(),
            ]);
        }
        for key in keys {
            let global = setting(settings, &key)?;
            let scoped = setting(scoped, &key)?;
            if global.is_null() != scoped.is_null()
                || (!global.is_null() && unsafe { CFEqual(global, scoped) } == 0)
            {
                return Err(
                    "Different scoped macOS proxy policies unsupported; no fallback".into(),
                );
            }
        }
        for key in ["__SCOPED__", "__SUPPLEMENTAL__"] {
            if !setting(scoped, key)?.is_null() {
                return Err("Nested scoped macOS proxy policies unsupported; no fallback".into());
            }
        }
        Ok(())
    }
    fn uniform_policy(settings: Cf) -> Result<(), String> {
        let scoped = setting(settings, "__SCOPED__")?;
        if !scoped.is_null() {
            check_type(scoped, unsafe { CFDictionaryGetTypeID() })?;
            let count = unsafe { CFDictionaryGetCount(scoped) };
            if !(0..=1024).contains(&count) {
                return Err("Too many macOS proxy scopes".into());
            }
            let mut values = vec![ptr::null(); count as usize];
            unsafe { CFDictionaryGetKeysAndValues(scoped, ptr::null_mut(), values.as_mut_ptr()) };
            for value in values {
                same_policy(settings, value)?;
            }
        }
        let supplemental = setting(settings, "__SUPPLEMENTAL__")?;
        if !supplemental.is_null() {
            check_type(supplemental, unsafe { CFArrayGetTypeID() })?;
            let count = unsafe { CFArrayGetCount(supplemental) };
            if !(0..=1024).contains(&count) {
                return Err("Too many macOS supplemental proxy policies".into());
            }
            for index in 0..count {
                same_policy(settings, unsafe {
                    CFArrayGetValueAtIndex(supplemental, index)
                })?;
            }
        }
        Ok(())
    }
    fn url(value: &Url) -> Result<Owned, String> {
        let value = string(value.as_str())?;
        Owned::new(unsafe { CFURLCreateWithString(ptr::null(), value.0, ptr::null()) })
    }
    fn first(proxies: Cf) -> Result<Cf, String> {
        check_type(proxies, unsafe { CFArrayGetTypeID() })?;
        if unsafe { CFArrayGetCount(proxies) } < 1 {
            return Err("Empty macOS proxy routes unsupported; no fallback".into());
        }
        check_type(unsafe { CFArrayGetValueAtIndex(proxies, 0) }, unsafe {
            CFDictionaryGetTypeID()
        })
    }
    fn is_type(proxy: Cf, kind: Cf) -> bool {
        let value = get(proxy, unsafe { kCFProxyTypeKey });
        !value.is_null() && unsafe { CFEqual(value, kind) } != 0
    }
    fn named_route(proxy: Cf) -> Result<Route, String> {
        if !get(proxy, unsafe { kCFProxyUsernameKey }).is_null()
            || !get(proxy, unsafe { kCFProxyPasswordKey }).is_null()
        {
            return Err("Credential-bearing macOS proxy unsupported".into());
        }
        if is_type(proxy, unsafe { kCFProxyTypeNone }) {
            return Ok(Route::Direct);
        }
        if !is_type(proxy, unsafe { kCFProxyTypeHTTP })
            && !is_type(proxy, unsafe { kCFProxyTypeHTTPS })
        {
            return Err("Unsupported macOS proxy type; no fallback".into());
        }
        let host = text(get(proxy, unsafe { kCFProxyHostNameKey }))?;
        let port = number(get(proxy, unsafe { kCFProxyPortNumberKey }))?;
        endpoint(host, port)
    }
    fn endpoint(host: String, port: i64) -> Result<Route, String> {
        if !(1..=65535).contains(&port)
            || host.is_empty()
            || host.chars().any(|value| {
                value.is_whitespace() || matches!(value, '/' | '@' | '?' | '#' | ';' | ',' | '=')
            })
        {
            return Err("Invalid macOS proxy endpoint".into());
        }
        let host = if host.contains(':') && !host.starts_with('[') {
            format!("[{host}]")
        } else {
            host
        };
        parse_proxy(&format!("http://{host}:{port}"), "https")
    }
    #[derive(Default)]
    struct PacResult {
        complete: bool,
        proxies: Option<Owned>,
    }
    unsafe extern "C" fn pac_result(client: *mut c_void, proxies: Cf, error: Cf) {
        let result = unsafe { &mut *client.cast::<PacResult>() };
        if error.is_null() && !proxies.is_null() {
            result.proxies = Some(Owned(unsafe { CFRetain(proxies) }));
        }
        result.complete = true;
    }
    fn pac_route(proxy: Cf, target: Cf, timeout: Duration) -> Result<Route, String> {
        let mut result = PacResult::default();
        let mut context = Context {
            version: 0,
            info: (&mut result as *mut PacResult).cast(),
            retain: None,
            release: None,
            description: None,
        };
        let mode = string("AmeowProxyResolution")?;
        let source = if is_type(proxy, unsafe { kCFProxyTypeAutoConfigurationURL }) {
            let pac = check_type(
                get(proxy, unsafe { kCFProxyAutoConfigurationURLKey }),
                unsafe { CFURLGetTypeID() },
            )?;
            unsafe {
                CFNetworkExecuteProxyAutoConfigurationURL(pac, target, pac_result, &mut context)
            }
        } else if is_type(proxy, unsafe { kCFProxyTypeAutoConfigurationJavaScript }) {
            let script = check_type(
                get(proxy, unsafe { kCFProxyAutoConfigurationJavaScriptKey }),
                unsafe { CFStringGetTypeID() },
            )?;
            unsafe {
                CFNetworkExecuteProxyAutoConfigurationScript(
                    script,
                    target,
                    pac_result,
                    &mut context,
                )
            }
        } else {
            return named_route(proxy);
        };
        let scheduled = Scheduled {
            source: Owned::new(source)?,
            mode,
            run_loop: unsafe { CFRunLoopGetCurrent() },
        };
        unsafe { CFRunLoopAddSource(scheduled.run_loop, scheduled.source.0, scheduled.mode.0) };
        let started = Instant::now();
        while !result.complete && started.elapsed() < timeout {
            unsafe {
                CFRunLoopRunInMode(
                    scheduled.mode.0,
                    timeout
                        .saturating_sub(started.elapsed())
                        .as_secs_f64()
                        .min(0.1),
                    1,
                )
            };
        }
        drop(scheduled);
        if !result.complete {
            return Err("macOS PAC resolution timed out; no fallback".into());
        }
        let proxies = result
            .proxies
            .ok_or("macOS PAC resolution failed; no fallback")?;
        check_type(proxies.0, unsafe { CFArrayGetTypeID() })?;
        if unsafe { CFArrayGetCount(proxies.0) } != 1 {
            return Err("Multiple/empty macOS PAC routes unsupported; no fallback".into());
        }
        let proxy = first(proxies.0)?;
        named_route(proxy)
    }
    fn route(settings: Cf, input: &Url, automatic: bool) -> Result<Route, String> {
        let target = url(input)?;
        let proxies = Owned::new(unsafe { CFNetworkCopyProxiesForURL(target.0, settings) })?;
        let proxy = first(proxies.0)?;
        if !automatic
            && (is_type(proxy, unsafe { kCFProxyTypeAutoConfigurationURL })
                || is_type(proxy, unsafe { kCFProxyTypeAutoConfigurationJavaScript }))
        {
            return Err(
                "Automatic/PAC routes cannot bind opaque engine requests; no fallback".into(),
            );
        }
        pac_route(proxy, target.0, Duration::from_secs(10))
    }
    fn resolve_settings(settings: Cf, input: &Url, engine: bool) -> Result<Route, String> {
        check_type(settings, unsafe { CFDictionaryGetTypeID() })?;
        if enabled(settings, "ProxyAutoDiscoveryEnable")? {
            return Err("macOS proxy auto-discovery unsupported; no fallback".into());
        }
        for prefix in ["HTTP", "HTTPS", "SOCKS"] {
            if enabled(settings, &format!("{prefix}Enable"))? {
                endpoint(
                    text(setting(settings, &format!("{prefix}Proxy"))?)?,
                    number(setting(settings, &format!("{prefix}Port"))?)?,
                )?;
            }
        }
        uniform_policy(settings)?;
        if enabled(settings, "ProxyAutoConfigEnable")? {
            if engine {
                return Err(
                    "Automatic/PAC routes cannot bind opaque engine requests; no fallback".into(),
                );
            }
            let location = setting(settings, "ProxyAutoConfigURLString")?;
            let script = setting(settings, "ProxyAutoConfigJavaScript")?;
            if (location.is_null() || text(location)?.is_empty())
                && (script.is_null() || text(script)?.is_empty())
            {
                return Err("macOS PAC configuration is missing its source; no fallback".into());
            }
        }
        if !engine {
            return route(settings, input, true);
        }
        let mut http = input.clone();
        http.set_scheme("http")
            .map_err(|_| "Invalid engine scheme")?;
        let mut https = input.clone();
        https
            .set_scheme("https")
            .map_err(|_| "Invalid engine scheme")?;
        let http = route(settings, &http, false)?;
        let https = route(settings, &https, false)?;
        if http != https {
            return Err("Scheme-sensitive proxy routes unsupported by engine".into());
        }
        if http == Route::Direct
            && (enabled(settings, "HTTPEnable")?
                || enabled(settings, "HTTPSEnable")?
                || enabled(settings, "SOCKSEnable")?)
        {
            return Err("Accepted origin matches proxy bypass; opaque engine route unsupported; no fallback".into());
        }
        Ok(http)
    }
    pub(super) fn resolve(input: &str, engine: bool) -> Result<Route, String> {
        let input = Url::parse(input).map_err(|_| "Invalid network URL")?;
        if !matches!(input.scheme(), "http" | "https")
            || input.host_str().is_none()
            || !input.username().is_empty()
            || input.password().is_some()
        {
            return Err("Unsupported network URL".into());
        }
        let settings = Owned::new(unsafe { CFNetworkCopySystemProxySettings() })?;
        resolve_settings(settings.0, &input, engine)
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[link(name = "CoreFoundation", kind = "framework")]
        unsafe extern "C" {
            fn CFDataCreate(allocator: Cf, bytes: *const u8, length: isize) -> Cf;
            fn CFPropertyListCreateWithData(
                allocator: Cf,
                data: Cf,
                options: usize,
                format: *mut isize,
                error: *mut Cf,
            ) -> Cf;
        }
        fn settings(body: &str) -> Owned {
            let xml =
                format!(r#"<?xml version="1.0"?><plist version="1.0"><dict>{body}</dict></plist>"#);
            let data =
                Owned::new(unsafe { CFDataCreate(ptr::null(), xml.as_ptr(), xml.len() as isize) })
                    .unwrap();
            Owned::new(unsafe {
                CFPropertyListCreateWithData(
                    ptr::null(),
                    data.0,
                    0,
                    ptr::null_mut(),
                    ptr::null_mut(),
                )
            })
            .unwrap()
        }
        fn static_settings(extra: &str) -> Owned {
            settings(&format!(
                "<key>HTTPEnable</key><integer>1</integer><key>HTTPProxy</key><string>127.0.0.1</string><key>HTTPPort</key><integer>7890</integer><key>HTTPSEnable</key><integer>1</integer><key>HTTPSProxy</key><string>127.0.0.1</string><key>HTTPSPort</key><integer>7890</integer>{extra}"
            ))
        }
        #[test]
        fn macos_system_static_routes_and_bypass_preserve_engine_boundary() {
            let target = Url::parse("https://www.youtube.com/watch?v=test").unwrap();
            let direct = settings("");
            assert_eq!(
                resolve_settings(direct.0, &target, false).unwrap(),
                Route::Direct
            );
            assert_eq!(
                resolve_settings(direct.0, &target, true).unwrap(),
                Route::Direct
            );
            let proxy =
                static_settings("<key>ExceptionsList</key><array><string>*.local</string></array>");
            for engine in [false, true] {
                assert_eq!(
                    resolve_settings(proxy.0, &target, engine).unwrap(),
                    Route::Proxy("http://127.0.0.1:7890".into())
                );
            }
            let bypassed = static_settings(
                "<key>ExceptionsList</key><array><string>*.youtube.com</string></array>",
            );
            assert_eq!(
                resolve_settings(bypassed.0, &target, false).unwrap(),
                Route::Direct
            );
            assert!(resolve_settings(bypassed.0, &target, true).is_err());
        }
        #[test]
        fn macos_unrepresentable_routes_fail_closed() {
            let target = Url::parse("https://example.com/test").unwrap();
            for body in [
                "<key>ProxyAutoDiscoveryEnable</key><integer>1</integer>",
                "<key>ProxyAutoConfigEnable</key><integer>1</integer>",
                "<key>SOCKSEnable</key><integer>1</integer><key>SOCKSProxy</key><string>localhost</string><key>SOCKSPort</key><integer>1080</integer>",
                "<key>HTTPSEnable</key><integer>1</integer>",
                "<key>HTTPSEnable</key><integer>1</integer><key>HTTPSProxy</key><string>user:secret@localhost</string><key>HTTPSPort</key><integer>7890</integer>",
            ] {
                let config = settings(body);
                assert!(resolve_settings(config.0, &target, false).is_err());
                assert!(resolve_settings(config.0, &target, true).is_err());
            }
            let config = settings(
                "<key>HTTPEnable</key><integer>1</integer><key>HTTPProxy</key><string>localhost</string><key>HTTPPort</key><integer>7890</integer>",
            );
            assert!(resolve_settings(config.0, &target, true).is_err());
            let config = settings(
                "<key>__SCOPED__</key><dict><key>en0</key><dict><key>ProxyAutoDiscoveryEnable</key><integer>1</integer></dict></dict>",
            );
            assert!(resolve_settings(config.0, &target, false).is_err());
            assert!(resolve_settings(config.0, &target, true).is_err());
            for input in [
                "file:///tmp/a",
                "https://user:secret@example.com",
                "invalid",
            ] {
                assert!(resolve(input, false).is_err());
            }
        }
        #[test]
        fn macos_scoped_policies_must_agree_and_endpoints_cannot_carry_credentials() {
            let target = Url::parse("https://example.com/test").unwrap();
            let same = settings(
                "<key>__SCOPED__</key><dict><key>en0</key><dict/></dict><key>__SUPPLEMENTAL__</key><array><dict><key>__MATCH_DOMAIN__</key><string>example.com</string></dict></array>",
            );
            for engine in [false, true] {
                assert_eq!(
                    resolve_settings(same.0, &target, engine).unwrap(),
                    Route::Direct
                );
            }
            let different =
                static_settings("<key>__SCOPED__</key><dict><key>en0</key><dict/></dict>");
            assert!(resolve_settings(different.0, &target, false).is_err());
            assert!(resolve_settings(different.0, &target, true).is_err());
            for host in [
                "user:password@localhost",
                "localhost/path",
                "localhost#fragment",
                "localhost?query",
                "localhost;other",
                "local host",
            ] {
                assert!(endpoint(host.into(), 7890).is_err());
            }
            assert!(endpoint("localhost".into(), 0).is_err());
            assert!(endpoint("localhost".into(), 65536).is_err());
            assert_eq!(
                endpoint("::1".into(), 7890).unwrap(),
                Route::Proxy("http://[::1]:7890".into())
            );
            assert!(text(string("localhost\0hidden").unwrap().0).is_err());
        }
        #[test]
        fn macos_pac_executes_real_script_and_does_not_fallback_on_failure() {
            let target = Url::parse("https://example.com/test").unwrap();
            let target_cf = url(&target).unwrap();
            for (script, expected) in [
                (
                    "function FindProxyForURL(url, host) { return 'DIRECT'; }",
                    Some(Route::Direct),
                ),
                (
                    "function FindProxyForURL(url, host) { return host == 'example.com' ? 'PROXY 127.0.0.1:7890' : 'DIRECT'; }",
                    Some(Route::Proxy("http://127.0.0.1:7890".into())),
                ),
                (
                    "function FindProxyForURL(url, host) { return 'SOCKS localhost:1080'; }",
                    None,
                ),
                ("function FindProxyForURL(url, host) { return ''; }", None),
                (
                    "function FindProxyForURL(url, host) { return 'INVALID'; }",
                    None,
                ),
                (
                    "function FindProxyForURL(url, host) { return 'PROXY localhost:7890; DIRECT'; }",
                    None,
                ),
                ("invalid javascript", None),
            ] {
                let config = settings(&format!(
                    "<key>ProxyAutoConfigEnable</key><integer>1</integer><key>ProxyAutoConfigJavaScript</key><string>{script}</string>"
                ));
                let proxies =
                    Owned::new(unsafe { CFNetworkCopyProxiesForURL(target_cf.0, config.0) })
                        .unwrap();
                let proxy = first(proxies.0).unwrap();
                let result = pac_route(proxy, target_cf.0, Duration::from_secs(3));
                match expected {
                    Some(expected) => assert_eq!(result.unwrap(), expected),
                    None => assert!(result.is_err()),
                }
                assert!(resolve_settings(config.0, &target, true).is_err());
                assert!(pac_route(proxy, target_cf.0, Duration::ZERO).is_err());
            }
        }
        #[test]
        fn macos_pac_url_is_fetched_and_failures_do_not_use_static_or_direct_routes() {
            use std::net::TcpListener;
            let target = Url::parse("https://example.com/test").unwrap();
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            listener.set_nonblocking(true).unwrap();
            let server = std::thread::spawn(move || {
                let started = Instant::now();
                while started.elapsed() < Duration::from_secs(5) {
                    match listener.accept() {
                        Ok((mut socket, _)) => {
                            socket
                                .set_read_timeout(Some(Duration::from_secs(2)))
                                .unwrap();
                            socket
                                .set_write_timeout(Some(Duration::from_secs(2)))
                                .unwrap();
                            let mut request = [0_u8; 4096];
                            let size = socket.read(&mut request).unwrap();
                            if request.first() == Some(&0x16) {
                                continue;
                            }
                            let request = String::from_utf8_lossy(&request[..size]);
                            assert!(request.contains("/proxy.pac"), "{request:?}");
                            let script = "function FindProxyForURL(url, host) { return 'PROXY 127.0.0.1:7890'; }";
                            write!(socket, "HTTP/1.1 200 OK\r\nContent-Type: application/x-ns-proxy-autoconfig\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{script}", script.len()).unwrap();
                            return;
                        }
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            std::thread::sleep(Duration::from_millis(5))
                        }
                        Err(error) => panic!("{error}"),
                    }
                }
                panic!("PAC URL was not fetched");
            });
            let config = static_settings(&format!(
                "<key>ProxyAutoConfigEnable</key><integer>1</integer><key>ProxyAutoConfigURLString</key><string>http://{address}/proxy.pac</string>"
            ));
            assert_eq!(
                resolve_settings(config.0, &target, false).unwrap(),
                Route::Proxy("http://127.0.0.1:7890".into())
            );
            server.join().unwrap();
            let unused = TcpListener::bind("127.0.0.1:0").unwrap();
            let closed = unused.local_addr().unwrap();
            drop(unused);
            let config = static_settings(&format!(
                "<key>ProxyAutoConfigEnable</key><integer>1</integer><key>ProxyAutoConfigURLString</key><string>http://{closed}/proxy.pac</string>"
            ));
            assert!(resolve_settings(config.0, &target, false).is_err());
        }
        #[test]
        #[ignore = "reads the host proxy settings; run explicitly on the validation host"]
        fn macos_current_system_route_is_read_without_changing_settings() {
            let config = Owned::new(unsafe { CFNetworkCopySystemProxySettings() }).unwrap();
            let target = Url::parse("https://example.com/").unwrap();
            let route = resolve_settings(config.0, &target, false);
            assert!(route.is_ok(), "{route:?}");
        }
        #[test]
        #[ignore = "requires public HTTPS access with the host system proxy"]
        fn macos_live_https_acquisition_uses_current_system_route() {
            let input = "https://example.com/";
            let route = super::super::resolve(input).unwrap();
            let mut builder = reqwest::blocking::Client::builder()
                .no_proxy()
                .timeout(Duration::from_secs(20));
            if let Route::Proxy(proxy) = &route {
                builder = builder.proxy(reqwest::Proxy::all(proxy).unwrap());
            }
            let expected = builder
                .build()
                .unwrap()
                .get(input)
                .send()
                .unwrap()
                .error_for_status()
                .unwrap()
                .bytes()
                .unwrap();
            assert!(!expected.is_empty());
            let root = tempfile::tempdir().unwrap();
            let output = root.path().join("acquired");
            let mut observed = Vec::new();
            acquire(
                input,
                &output,
                expected.len() as u64,
                &AtomicBool::new(false),
                |_, route| observed.push(route.clone()),
            )
            .unwrap();
            assert_eq!(std::fs::read(output).unwrap(), expected);
            assert_eq!(observed, vec![route]);
        }
        #[test]
        #[ignore = "requires public HTTPS access without a proxy"]
        fn macos_live_https_direct_route_transfers_real_bytes() {
            let input = Url::parse("https://example.com/").unwrap();
            let config = settings("");
            assert_eq!(
                resolve_settings(config.0, &input, false).unwrap(),
                Route::Direct
            );
            let response = reqwest::blocking::Client::builder()
                .no_proxy()
                .timeout(Duration::from_secs(20))
                .build()
                .unwrap()
                .get(input)
                .send()
                .unwrap()
                .error_for_status()
                .unwrap();
            assert!(!response.bytes().unwrap().is_empty());
        }
    }
}

pub fn acquire(
    input: &str,
    path: &Path,
    expected_bytes: u64,
    cancel: &AtomicBool,
    observed: impl FnMut(&str, &Route),
) -> Result<(), String> {
    acquire_observed(input, path, expected_bytes, cancel, observed, |_, _| {}).map_err(|error| {
        format!(
            "Runtime acquisition: {} HTTP {:?}",
            error.category.label(),
            error.http_status
        )
    })
}
#[derive(Debug)]
pub(crate) struct AcquisitionError {
    pub category: super::preparation::ErrorCategory,
    pub http_status: Option<u16>,
}
impl From<super::preparation::ErrorCategory> for AcquisitionError {
    fn from(category: super::preparation::ErrorCategory) -> Self {
        Self {
            category,
            http_status: None,
        }
    }
}
fn request_error(error: reqwest::Error) -> AcquisitionError {
    use super::preparation::ErrorCategory as E;
    (if error.is_timeout() {
        E::Timeout
    } else if error.is_connect() {
        E::Connect
    } else {
        E::Unknown
    })
    .into()
}
pub(crate) fn acquire_observed(
    input: &str,
    path: &Path,
    expected_bytes: u64,
    cancel: &AtomicBool,
    mut observed: impl FnMut(&str, &Route),
    progress: impl FnMut(u64, Option<u64>),
) -> Result<(), AcquisitionError> {
    use super::preparation::ErrorCategory as E;
    let mut url = Url::parse(input).map_err(|_| E::Unknown)?;
    for _ in 0..8 {
        if cancel.load(Ordering::Acquire) {
            return Err(E::Cancelled.into());
        }
        if url.scheme() != "https" {
            return Err(E::Http.into());
        }
        let route = resolve(url.as_str()).map_err(|_| E::ProxyRouting)?;
        let mut public_url = url.clone();
        public_url.set_query(None);
        observed(public_url.as_str(), &route);
        let mut builder = reqwest::blocking::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(300));
        if let Route::Proxy(proxy) = route {
            builder = builder.proxy(reqwest::Proxy::all(proxy).map_err(|_| E::ProxyRouting)?);
        }
        let response = builder
            .build()
            .map_err(request_error)?
            .get(url.clone())
            .header("User-Agent", "Ameow-Next/0.1")
            .send()
            .map_err(request_error)?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .ok_or(E::Http)?
                .to_str()
                .map_err(|_| E::Http)?;
            url = url.join(location).map_err(|_| E::Http)?;
            continue;
        }
        if !response.status().is_success() {
            return Err(AcquisitionError {
                category: E::Http,
                http_status: Some(response.status().as_u16()),
            });
        }
        return store_artifact(response, path, expected_bytes, cancel, progress);
    }
    Err(E::Http.into())
}
fn store_artifact(
    mut response: impl Read,
    path: &Path,
    expected_bytes: u64,
    cancel: &AtomicBool,
    mut progress: impl FnMut(u64, Option<u64>),
) -> Result<(), AcquisitionError> {
    use super::preparation::ErrorCategory as E;
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|e| E::io(&e))?;
    let mut total = 0_u64;
    // The compiled manifest is an exact artifact byte contract, independent of HTTP headers.
    progress(0, Some(expected_bytes));
    let mut last_progress = std::time::Instant::now();
    let mut buffer = [0_u8; 65536];
    loop {
        if cancel.load(Ordering::Acquire) {
            return Err(E::Cancelled.into());
        }
        let n = response.read(&mut buffer).map_err(|e| {
            let mut source = std::error::Error::source(&e);
            while let Some(cause) = source {
                if let Some(request) = cause.downcast_ref::<reqwest::Error>() {
                    if request.is_timeout() {
                        return E::Timeout;
                    }
                    if request.is_connect() {
                        return E::Connect;
                    }
                }
                source = cause.source();
            }
            if e.kind() == std::io::ErrorKind::TimedOut {
                E::Timeout
            } else {
                E::Unknown
            }
        })?;
        if n == 0 {
            break;
        }
        total += n as u64;
        if total > expected_bytes {
            return Err(E::Size.into());
        }
        file.write_all(&buffer[..n]).map_err(|e| E::io(&e))?;
        if last_progress.elapsed() >= Duration::from_millis(200) {
            progress(total, Some(expected_bytes));
            last_progress = std::time::Instant::now();
        }
    }
    if total != expected_bytes {
        return Err(E::Size.into());
    }
    file.sync_all().map_err(|e| E::io(&e))?;
    progress(total, Some(expected_bytes));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn acquisition_rejects_plain_http_and_cancellation_before_creating_a_file() {
        use super::super::preparation::ErrorCategory as E;
        let root = tempfile::tempdir().unwrap();
        for (input, cancelled, category) in [
            ("http://example.com/runtime", false, E::Http),
            ("https://example.com/runtime", true, E::Cancelled),
        ] {
            let path = root.path().join("rejected");
            let error = acquire_observed(
                input,
                &path,
                1,
                &AtomicBool::new(cancelled),
                |_, _| panic!("unexpected request"),
                |_, _| {},
            )
            .unwrap_err();
            assert_eq!(error.category, category);
            assert!(!path.exists());
        }
    }
    #[test]
    fn r12_acquisition_stream_has_real_bytes_and_distinct_size_timeout_cancel_errors() {
        use super::super::preparation::ErrorCategory as E;
        let root = tempfile::tempdir().unwrap();
        let cancel = AtomicBool::new(false);
        let mut samples = Vec::new();
        let path = root.path().join("valid");
        store_artifact(
            std::io::Cursor::new(b"abc"),
            &path,
            3,
            &cancel,
            |bytes, total| samples.push((bytes, total)),
        )
        .unwrap();
        assert_eq!(std::fs::read(path).unwrap(), b"abc");
        assert_eq!(samples, vec![(0, Some(3)), (3, Some(3))]);
        for (name, bytes, expected) in [
            ("short", b"ab".as_slice(), 3),
            ("large", b"abcd".as_slice(), 3),
        ] {
            assert_eq!(
                store_artifact(
                    std::io::Cursor::new(bytes),
                    &root.path().join(name),
                    expected,
                    &cancel,
                    |_, _| {}
                )
                .unwrap_err()
                .category,
                E::Size
            );
        }
        struct TimedOut;
        impl Read for TimedOut {
            fn read(&mut self, _: &mut [u8]) -> std::io::Result<usize> {
                Err(std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    "private raw message",
                ))
            }
        }
        assert_eq!(
            store_artifact(
                TimedOut,
                &root.path().join("timeout"),
                3,
                &cancel,
                |_, _| {}
            )
            .unwrap_err()
            .category,
            E::Timeout
        );
        cancel.store(true, Ordering::Release);
        assert_eq!(
            store_artifact(
                std::io::Cursor::new(b"abc"),
                &root.path().join("cancelled"),
                3,
                &cancel,
                |_, _| {}
            )
            .unwrap_err()
            .category,
            E::Cancelled
        );
    }
    #[test]
    fn public_video_routes_allow_unrelated_static_bypass() -> Result<(), String> {
        for input in [
            "https://www.youtube.com/watch?v=jNQXAC9IVRw",
            "https://www.bilibili.com/video/BV1vL411G7N7",
        ] {
            for patterns in [
                None,
                Some(""),
                Some("<local>;localhost;127.*;10.*;172.2*;*.local"),
            ] {
                assert_eq!(
                    static_engine_route(
                        input,
                        false,
                        Some("http=localhost:7897;https=localhost:7897"),
                        patterns,
                    )?,
                    Route::Proxy("http://localhost:7897".into()),
                );
            }
        }
        Ok(())
    }
    #[test]
    fn relevant_bypass_and_unrepresentable_engine_routes_remain_rejected() {
        let input = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
        for patterns in [
            "*.youtube.com",
            "www.youtube.com",
            "*",
            "localhost;bad?pattern",
        ] {
            assert!(
                static_engine_route(input, false, Some("localhost:7897"), Some(patterns)).is_err()
            );
        }
        assert!(static_engine_route(input, true, Some("localhost:7897"), None).is_err());
        for proxy in [
            "",
            "a:1;b:2",
            "socks5://localhost:1",
            "http://user:pass@localhost:1",
            "https=a:1;https=b:2",
            "http=a:1;https=b:2",
        ] {
            assert!(static_engine_route(input, false, Some(proxy), Some("<local>;127.*")).is_err());
        }
    }
    #[test]
    fn windows_suffix_prefix_wildcards_match_without_ignoring_invalid_patterns()
    -> Result<(), String> {
        assert!(bypass("www.zhihu.com", "*zhihu.com")?);
        assert!(bypass("172.29.1.2", "172.2*")?);
        assert!(bypass("HOST.LOCAL", "*.local")?);
        assert!(!bypass("github.com", "*zhihu.com;127.*;*.local")?);
        assert!(bypass("github.com", "*;bad?pattern").is_err());
        Ok(())
    }
}
