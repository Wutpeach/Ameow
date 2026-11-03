//! Fixed application identity and theme-aware tray resources from the approved exports.
use ameow_next::download::settings::TrayIconPreference;
use std::{cell::RefCell, collections::HashMap};
use windows::{
    core::PCWSTR,
    Win32::{
        Foundation::{HINSTANCE, HWND, LPARAM, WPARAM},
        System::LibraryLoader::GetModuleHandleW,
        UI::{
            HiDpi::{GetDpiForWindow, GetSystemMetricsForDpi},
            WindowsAndMessaging::*,
        },
    },
};

pub fn tray_resource(preference: TrayIconPreference, night: bool) -> u16 {
    match preference {
        TrayIconPreference::FollowAppearance => {
            if night {
                102
            } else {
                101
            }
        }
        TrayIconPreference::AmeowBlue => 103,
        TrayIconPreference::Apricot => 104,
    }
}

pub fn tray_size(requested: i32) -> i32 {
    [16, 20, 24, 32, 40, 48, 64]
        .into_iter()
        .min_by_key(|size| ((size - requested).abs(), -size))
        .unwrap()
}

struct OwnedIcon(HICON);
impl Drop for OwnedIcon {
    fn drop(&mut self) {
        unsafe {
            let _ = DestroyIcon(self.0);
        }
    }
}
thread_local! {
    // All windows/tray live on this UI thread; handles outlive every use until UI shutdown.
    static ICONS: RefCell<HashMap<(u16, i32), OwnedIcon>> = RefCell::new(HashMap::new());
}
pub fn load(resource: u16, size: i32) -> windows::core::Result<HICON> {
    ICONS.with(|icons| {
        let mut icons = icons.borrow_mut();
        if let Some(icon) = icons.get(&(resource, size)) {
            return Ok(icon.0);
        }
        unsafe {
            let module = HINSTANCE(GetModuleHandleW(None)?.0);
            // LR_SHARED caches only by resource name and can return the wrong DPI size.
            let handle = LoadImageW(
                Some(module),
                PCWSTR(resource as usize as *const u16),
                IMAGE_ICON,
                size,
                size,
                LR_DEFAULTCOLOR,
            )?;
            let icon = HICON(handle.0);
            icons.insert((resource, size), OwnedIcon(icon));
            Ok(icon)
        }
    })
}

pub fn set_window(hwnd: HWND) {
    unsafe {
        let dpi = GetDpiForWindow(hwnd).max(96);
        for (kind, metric) in [(ICON_SMALL, SM_CXSMICON), (ICON_BIG, SM_CXICON)] {
            if let Ok(icon) = load(1, GetSystemMetricsForDpi(metric, dpi)) {
                SendMessageW(
                    hwnd,
                    WM_SETICON,
                    Some(WPARAM(kind as usize)),
                    Some(LPARAM(icon.0 as isize)),
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_cache_keeps_requested_sizes_for_the_same_resource() {
        use windows::Win32::Graphics::Gdi::{DeleteObject, GetObjectW, BITMAP, HGDIOBJ};
        for resource in [1, 101, 102, 103, 104] {
            for size in [16, 32, 20, 24, 40, 48, 64] {
                let handle = load(resource, size).expect("embedded brand icon");
                assert_eq!(handle, load(resource, size).unwrap());
                unsafe {
                    let mut info = ICONINFO::default();
                    GetIconInfo(handle, &mut info).unwrap();
                    let mut bitmap = BITMAP::default();
                    let read = GetObjectW(
                        HGDIOBJ(info.hbmColor.0),
                        std::mem::size_of::<BITMAP>() as i32,
                        Some((&mut bitmap as *mut BITMAP).cast()),
                    );
                    let _ = DeleteObject(HGDIOBJ(info.hbmColor.0));
                    let _ = DeleteObject(HGDIOBJ(info.hbmMask.0));
                    assert_ne!(read, 0);
                    assert_eq!((bitmap.bmWidth, bitmap.bmHeight), (size, size));
                }
            }
        }
    }
    #[test]
    fn theme_and_fixed_choices_resolve_independently() {
        assert_eq!(
            tray_resource(TrayIconPreference::FollowAppearance, false),
            101
        );
        assert_eq!(
            tray_resource(TrayIconPreference::FollowAppearance, true),
            102
        );
        for night in [false, true] {
            assert_eq!(tray_resource(TrayIconPreference::AmeowBlue, night), 103);
            assert_eq!(tray_resource(TrayIconPreference::Apricot, night), 104);
        }
    }
    #[test]
    fn tray_uses_exact_delivered_sizes_and_bounded_nearest_fallback() {
        for size in [16, 20, 24, 32, 40, 48, 64] {
            assert_eq!(tray_size(size), size);
        }
        assert_eq!(tray_size(18), 20);
        assert_eq!(tray_size(1), 16);
        assert_eq!(tray_size(96), 64);
    }
}
