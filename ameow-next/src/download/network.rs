//! Read-only Windows route resolution. No ambient env proxy or fallback.
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
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}
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
/// Freeze one representable route for every selected URL/fragment before handing metadata to
/// the engine. Opaque manifests cannot prove per-request PAC routing and therefore fail closed.
pub fn bind_media_routes(
    metadata: &serde_json::Value,
    plan: &super::plan::FormatPlan,
    accepted: &str,
) -> Result<Route, String> {
    let route = engine_route(accepted)?;
    let formats = metadata["formats"]
        .as_array()
        .ok_or("Media formats missing")?;
    for id in plan.selector.split('+') {
        let format = formats
            .iter()
            .find(|f| f["format_id"].as_str() == Some(id))
            .ok_or("Frozen selected format missing")?;
        if format["protocol"]
            .as_str()
            .is_some_and(|p| !matches!(p, "http" | "https" | "http_dash_segments"))
        {
            return Err("Opaque media protocol cannot bind Windows per-request route".into());
        }
        let mut urls = Vec::new();
        if let Some(url) = format["url"].as_str() {
            urls.push(url.to_owned());
        }
        if let Some(fragments) = format["fragments"].as_array() {
            for fragment in fragments {
                if let Some(url) = fragment["url"].as_str() {
                    urls.push(url.to_owned());
                } else {
                    return Err("Relative/implicit media fragment route unsupported".into());
                }
            }
        }
        if urls.is_empty() {
            return Err("Selected format has no explicit media request URL".into());
        }
        for url in urls {
            if resolve(&url)? != route {
                return Err(
                    "Windows media URLs require differing routes; refusing engine route guess"
                        .into(),
                );
            }
        }
    }
    Ok(route)
}
/// The engine cannot delegate its opaque requests back to WinHTTP. Restrict it to a
/// static configuration with no URL-sensitive bypass, then explicitly override ambient proxy.
pub fn engine_route(input: &str) -> Result<Route, String> {
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
    if config.fAutoDetect != 0 || auto.is_some() {
        return Err("Automatic/PAC routes cannot bind opaque engine requests; no fallback".into());
    }
    if excluded.as_deref().is_some_and(|s| !s.trim().is_empty()) {
        return Err(
            "URL-sensitive proxy bypass cannot bind opaque engine requests; no fallback".into(),
        );
    }
    if let Some(proxy) = proxy {
        let http = parse_proxy(&proxy, "http")?;
        let https = parse_proxy(&proxy, "https")?;
        if http != https {
            return Err("Scheme-sensitive proxy routes unsupported by engine".into());
        }
        Ok(https)
    } else {
        resolve(input)
    }
}

pub fn acquire(
    input: &str,
    path: &Path,
    expected_bytes: u64,
    cancel: &AtomicBool,
    mut observed: impl FnMut(&str, &Route),
) -> Result<(), String> {
    let mut url = Url::parse(input).map_err(|e| e.to_string())?;
    for _ in 0..8 {
        if cancel.load(Ordering::Acquire) {
            return Err("Runtime acquisition cancelled".into());
        }
        if url.scheme() != "https" {
            return Err("Runtime download requires trusted HTTPS redirects".into());
        }
        let route = resolve(url.as_str())?;
        let mut public_url = url.clone();
        public_url.set_query(None);
        observed(public_url.as_str(), &route);
        let mut builder = reqwest::blocking::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(300));
        if let Route::Proxy(proxy) = route {
            builder = builder.proxy(reqwest::Proxy::all(proxy).map_err(|e| e.to_string())?);
        }
        let mut response = builder
            .build()
            .map_err(|e| format!("Runtime HTTP client: {e}"))?
            .get(url.clone())
            .header("User-Agent", "Ameow-Next/0.1")
            .send()
            .map_err(|e| format!("Runtime HTTPS request: {e}"))?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .ok_or("Runtime redirect missing location")?
                .to_str()
                .map_err(|e| e.to_string())?;
            url = url.join(location).map_err(|e| e.to_string())?;
            continue;
        }
        if !response.status().is_success() {
            return Err(format!("Runtime HTTPS status {}", response.status()));
        }
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(path)
            .map_err(|e| format!("Runtime exclusive staging: {e}"))?;
        let mut total = 0_u64;
        let mut buffer = [0_u8; 65536];
        loop {
            if cancel.load(Ordering::Acquire) {
                return Err("Runtime acquisition cancelled".into());
            }
            let n = response
                .read(&mut buffer)
                .map_err(|e| format!("Runtime HTTP stream: {e}"))?;
            if n == 0 {
                break;
            }
            total += n as u64;
            if total > expected_bytes {
                return Err("Runtime artifact exceeds fixed size".into());
            }
            file.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
        }
        if total != expected_bytes {
            return Err(format!(
                "Runtime artifact size mismatch {total}/{expected_bytes}"
            ));
        }
        file.sync_all().map_err(|e| e.to_string())?;
        return Ok(());
    }
    Err("Runtime redirect bound exceeded".into())
}
#[cfg(test)]
mod tests {
    use super::*;
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
