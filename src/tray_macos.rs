use crate::native::{self, NativeHandle};
use ameow_next::download::settings::TrayIconPreference;
use objc2::{AnyThread, DefinedClass, MainThreadOnly, define_class, msg_send, rc::Retained, sel};
use objc2_app_kit::{NSBitmapImageRep, NSImage, NSPasteboard, NSPasteboardTypeString, NSStatusBar, NSStatusItem};
use objc2_foundation::{NSData, NSObject, NSObjectProtocol, NSSize, NSString};
use std::{
    cell::{Cell, RefCell},
    path::PathBuf,
};

#[derive(Clone, Copy)]
pub enum TrayEvent {
    Restore,
    TogglePopup,
}

#[derive(Clone, Copy, Default)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}
#[derive(Clone, Copy)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

pub struct PopupAnchor {
    pub icon: Rect,
    pub work: Rect,
    pub dpi: u32,
}

impl PopupAnchor {
    pub fn place(&self, width: f32, height: f32) -> Point {
        Point {
            x: (self.icon.right - width.round() as i32).clamp(
                self.work.left,
                (self.work.right - width.round() as i32).max(self.work.left),
            ),
            y: self.icon.bottom.max(self.work.top).clamp(
                self.work.top,
                (self.work.bottom - height.round() as i32).max(self.work.top),
            ),
        }
    }
    pub fn preview() -> Self {
        let cursor = native::Native::cursor();
        let screen = native::screen_at(cursor);
        let work = rect(native::rect_edges(screen.visibleFrame()));
        Self {
            icon: Rect {
                left: work.right - 40,
                right: work.right - 16,
                top: work.top - 24,
                bottom: work.top,
            },
            work,
            dpi: 96,
        }
    }
}

fn rect(edges: [f32; 4]) -> Rect {
    let [left, top, right, bottom] = edges.map(|value| value.round() as i32);
    Rect {
        left,
        top,
        right,
        bottom,
    }
}

define_class!(
    #[unsafe(super = NSObject)]
    #[thread_kind = MainThreadOnly]
    #[ivars = RefCell<Vec<TrayEvent>>]
    struct TrayTarget;

    unsafe impl NSObjectProtocol for TrayTarget {}

    impl TrayTarget {
        #[unsafe(method(togglePopup:))]
        fn toggle_popup(&self, _sender: &NSObject) {
            self.ivars().borrow_mut().push(TrayEvent::TogglePopup);
        }
    }
);

pub struct Tray {
    item: Retained<NSStatusItem>,
    target: Retained<TrayTarget>,
    resource: Cell<Option<u16>>,
}

fn template_image() -> Result<Retained<NSImage>, String> {
    let image = NSImage::initWithSize(NSImage::alloc(), NSSize::new(18., 18.));
    for bytes in [
        include_bytes!("../assets/brand/tray/macos/ameow-menu-bar-template.png").as_slice(),
        include_bytes!("../assets/brand/tray/macos/ameow-menu-bar-template@2x.png").as_slice(),
    ] {
        let representation = NSBitmapImageRep::initWithData(NSBitmapImageRep::alloc(), &NSData::with_bytes(bytes))
            .ok_or("E_STATUS_IMAGE")?;
        representation.setSize(NSSize::new(18., 18.));
        image.addRepresentation(&representation);
    }
    image.setTemplate(true);
    Ok(image)
}

impl Tray {
    pub fn new() -> Result<Self, String> {
        let target = unsafe {
            msg_send![
                super(TrayTarget::alloc(native::marker()).set_ivars(RefCell::new(Vec::new()))),
                init
            ]
        };
        let item = NSStatusBar::systemStatusBar().statusItemWithLength(26.);
        let tray = Self {
            item,
            target,
            resource: Cell::new(None),
        };
        let button = tray
            .item
            .button(native::marker())
            .ok_or("E_STATUS_BUTTON")?;
        unsafe {
            button.setTarget(Some(&tray.target));
            button.setAction(Some(sel!(togglePopup:)));
        }
        tray.set_image(TrayIconPreference::FollowAppearance, false)?;
        Ok(tray)
    }
    fn set_image(&self, preference: TrayIconPreference, night: bool) -> Result<(), String> {
        let resource = crate::brand_icons::tray_resource(preference,
            night && preference != TrayIconPreference::FollowAppearance);
        if self.resource.get() == Some(resource) {
            return Ok(());
        }
        let image = if preference == TrayIconPreference::FollowAppearance {
            template_image()?
        } else {
            let bytes: &[u8] = match resource {
                103 => include_bytes!("../assets/brand/tray/ameow-blue/32.png"),
                _ => include_bytes!("../assets/brand/tray/apricot/32.png"),
            };
            let image = NSImage::initWithData(NSImage::alloc(), &NSData::with_bytes(bytes))
                .ok_or("E_STATUS_IMAGE")?;
            image.setSize(NSSize::new(18., 18.));
            image.setTemplate(false);
            image
        };
        self.item
            .button(native::marker())
            .ok_or("E_STATUS_BUTTON")?
            .setImage(Some(&image));
        self.resource.set(Some(resource));
        Ok(())
    }
    pub fn poll(&self) -> Vec<TrayEvent> {
        self.target.ivars().borrow_mut().drain(..).collect()
    }
    pub fn set_preferences(
        &mut self,
        _language: crate::ui_text::Language,
        preference: TrayIconPreference,
        night: bool,
    ) -> Result<(), String> {
        self.set_image(preference, night)?;
        self.item
            .button(native::marker())
            .ok_or("E_STATUS_BUTTON")?
            .setToolTip(Some(&NSString::from_str("Ameow")));
        Ok(())
    }
    pub fn popup_anchor(&self) -> PopupAnchor {
        let Some(window) = self
            .item
            .button(native::marker())
            .and_then(|button| button.window())
        else {
            return PopupAnchor::preview();
        };
        let icon = rect(native::rect_edges(window.frame()));
        let screen = window
            .screen()
            .unwrap_or_else(|| native::screen_at(native::Native::cursor()));
        PopupAnchor {
            icon,
            work: rect(native::rect_edges(screen.visibleFrame())),
            dpi: 96,
        }
    }
    pub fn hide(handle: NativeHandle) {
        if let Some(window) = handle.window() {
            window.orderOut(None);
        }
    }
    pub fn restore(handle: NativeHandle) {
        if let Some(window) = handle.window() {
            window.makeKeyAndOrderFront(None);
        }
    }
}

#[cfg(test)]
mod template_tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::ptr::NonNull;

    #[test]
    fn template_preserves_approved_alpha_and_both_native_densities() {
        let image = template_image().unwrap();
        assert!(image.isTemplate());
        assert_eq!(image.size(), NSSize::new(18., 18.));
        let dimensions = image.representations().iter()
            .map(|representation| (representation.pixelsWide(), representation.pixelsHigh(), representation.size()))
            .collect::<Vec<_>>();
        assert_eq!(dimensions, vec![(18, 18, NSSize::new(18., 18.)), (36, 36, NSSize::new(18., 18.))]);
        for (source, template, expected_hash) in [
            (include_bytes!("../assets/brand/tray/macos/ameow-menu-bar-white.png").as_slice(),
                include_bytes!("../assets/brand/tray/macos/ameow-menu-bar-template.png").as_slice(),
                "6ab9fe7a9e761077ef21de0ab4a1d067bbf7734d1a962374e5118483f9af79f3"),
            (include_bytes!("../assets/brand/tray/macos/ameow-menu-bar-white@2x.png").as_slice(),
                include_bytes!("../assets/brand/tray/macos/ameow-menu-bar-template@2x.png").as_slice(),
                "3940ac37b5e5587335842f50a8e9612b2373f9329b03b20a320cbc13f17a3f0c"),
        ] {
            assert_eq!(format!("{:x}", Sha256::digest(source)), expected_hash);
            let source = NSBitmapImageRep::initWithData(NSBitmapImageRep::alloc(), &NSData::with_bytes(source)).unwrap();
            let template = NSBitmapImageRep::initWithData(NSBitmapImageRep::alloc(), &NSData::with_bytes(template)).unwrap();
            assert!(source.hasAlpha() && template.hasAlpha());
            assert_eq!(source.samplesPerPixel(), 4);
            assert_eq!(template.samplesPerPixel(), 4);
            assert_eq!((source.pixelsWide(), source.pixelsHigh()), (template.pixelsWide(), template.pixelsHigh()));
            let mut transparent = false;
            let mut opaque = false;
            for vertical in 0..source.pixelsHigh() {
                for horizontal in 0..source.pixelsWide() {
                    let mut original = [0usize; 4];
                    let mut derived = [0usize; 4];
                    unsafe {
                        source.getPixel_atX_y(NonNull::new(original.as_mut_ptr()).unwrap(), horizontal, vertical);
                        template.getPixel_atX_y(NonNull::new(derived.as_mut_ptr()).unwrap(), horizontal, vertical);
                    }
                    assert_eq!(derived[..3], [0, 0, 0]);
                    assert_eq!(original[3], derived[3]);
                    transparent |= derived[3] == 0;
                    opaque |= derived[3] == 255;
                }
            }
            assert!(transparent && opaque);
        }
    }
}

impl Drop for Tray {
    fn drop(&mut self) {
        if let Some(button) = self.item.button(native::marker()) {
            unsafe {
                button.setTarget(None);
                button.setAction(None);
            }
        }
        NSStatusBar::systemStatusBar().removeStatusItem(&self.item);
    }
}

pub fn downloads_directory() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(|home| PathBuf::from(home).join("Downloads"))
        .ok_or("E_DOWNLOADS_HOME".into())
}

pub fn copy_text(_handle: NativeHandle, text: &str) -> Result<(), String> {
    let clipboard = NSPasteboard::generalPasteboard();
    clipboard.clearContents();
    if clipboard.setString_forType(&NSString::from_str(text), unsafe { NSPasteboardTypeString }) {
        Ok(())
    } else {
        Err("E_CLIPBOARD_WRITE".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn menu_popup_stays_within_display_work_area() {
        let anchor = PopupAnchor {
            icon: Rect {
                left: -30,
                right: -4,
                top: -24,
                bottom: 0,
            },
            work: Rect {
                left: -1200,
                right: 0,
                top: 0,
                bottom: 800,
            },
            dpi: 96,
        };
        let point = anchor.place(248., 172.);
        assert_eq!((point.x, point.y), (-252, 0));
        let point = anchor.place(2000., 2000.);
        assert_eq!((point.x, point.y), (-1200, 0));
    }
}
