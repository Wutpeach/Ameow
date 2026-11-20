//! Native download backend. One logical queue owns Jobs; presentation reads immutable snapshots.
pub mod download;
pub mod shortcut;
pub mod browser_sessions;
#[cfg(any(target_os = "windows", target_os = "macos"))]
pub mod control;
pub mod app_update;
pub mod third_party_notices;
#[cfg(any(target_os = "windows", target_os = "macos"))]
pub mod file_manager;
#[cfg(any(target_os = "windows", target_os = "macos"))]
pub mod login_startup;
