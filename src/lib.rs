//! Native download backend. One logical queue owns Jobs; presentation reads immutable snapshots.
#[cfg(all(feature = "dev-tools", not(debug_assertions)))]
compile_error!("dev-tools must never be used in a release build");
pub mod download;
#[cfg(any(target_os = "windows", target_os = "macos"))]
pub mod control;
pub mod app_update;
pub mod third_party_notices;
#[cfg(any(target_os = "windows", target_os = "macos"))]
pub mod file_manager;
#[cfg(any(target_os = "windows", target_os = "macos"))]
pub mod login_startup;
