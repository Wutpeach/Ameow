//! Native download backend. One logical queue owns Jobs; presentation reads immutable snapshots.
pub mod download;
pub mod app_update;
#[cfg(target_os = "windows")]
pub mod login_startup;
