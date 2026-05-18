# Electron download runtime and sidecars

## Goal

Rebuild the current Rust-managed download runtime as Node/Electron services without regressing yt-dlp, ffmpeg, sidecar, queue, progress, cancellation, and output semantics.

## Requirements

* Replace Rust ownership of:
  * download queue orchestration
  * yt-dlp invocation
  * ffmpeg/ffprobe invocation
  * direct-download flows
  * runtime-sidecar orchestration
  * progress and completion emission
  * cancel/retry behavior
* Preserve current queue, progress, and file-output behavior unless an explicit follow-up task changes product behavior.
* Define whether existing helper binaries such as `flowselect-cli-proxy` are still required under Electron.
* Keep browser-extension-triggered download flows compatible with the new runtime services.
* Keep Windows/macOS runtime behavior aligned from the start.

## Acceptance Criteria

* [ ] Electron-owned services can execute and manage downloader/media tool processes.
* [ ] Progress, completion, and cancellation semantics remain compatible with current renderer expectations.
* [ ] Runtime sidecar/tool ownership is explicit for Windows and macOS.
* [ ] The Rust/Tauri downloader/runtime layer is removable after this task and downstream release work land.

## Out of Scope

* Renderer shell migration.
* Tray/updater/autostart porting.
* Final release pipeline cutover.

## Technical Notes

* Key files:
  * `src-tauri/src/lib.rs`
  * `src-tauri/runtime-proxy/`
  * `src-tauri/binaries/`
  * `scripts/build-runtime-proxies.mjs`
  * `scripts/build-pinterest-sidecar.mjs`
  * `scripts/package-portable.ps1`
* Relevant specs:
  * `.trellis/spec/backend/sidecar-runtime-contracts.md`
  * `.trellis/spec/backend/error-handling.md`
  * `.trellis/spec/backend/logging-guidelines.md`
  * `.trellis/spec/backend/type-safety.md`
  * `.trellis/spec/guides/cross-platform-thinking-guide.md`

## Implementation Notes

* Full Node ownership is the approved default. Retaining Rust as a long-lived backend is out of scope unless a later ADR reopens that decision.
