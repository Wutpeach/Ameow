//! Native download backend. One logical queue owns Jobs; presentation reads immutable snapshots.
pub mod download;
pub mod app_update;
pub mod third_party_notices;
#[cfg(target_os = "windows")]
pub mod login_startup;
