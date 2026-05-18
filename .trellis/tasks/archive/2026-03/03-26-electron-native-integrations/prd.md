# Electron native integrations and extension transport

## Goal

Port native desktop integrations and extension-facing transport from Tauri/Rust into Electron main-process services while preserving current product behavior.

## Requirements

* Replace Tauri implementations for:
  * tray/menu behavior
  * global shortcut
  * autostart
  * single-instance behavior
  * dialog/open-folder flows
  * relaunch/open external URL
  * updater checks and install flow
* Move the local browser-extension WebSocket server into Electron main process.
* Preserve the current extension host, port, and action contract unless an ADR explicitly changes it.
* Preserve current theme/language/config synchronization paths across windows and extension surfaces.

## Acceptance Criteria

* [ ] Extension can connect to the Electron-owned local WebSocket server without protocol changes by default.
* [ ] Tray, shortcut, autostart, dialog, relaunch, and updater behaviors have Electron-owned implementations.
* [ ] Multi-window and extension-facing state sync still works after the native integration port.
* [ ] Tauri plugin ownership for these capabilities is removable after this task and downstream dependencies land.

## Out of Scope

* Porting the downloader/ffmpeg/yt-dlp runtime.
* Packaging/release cutover.

## Technical Notes

* Key files:
  * `browser-extension/background.js`
  * `src-tauri/src/lib.rs`
  * `src/App.tsx`
  * `src/pages/SettingsPage.tsx`
  * `src/pages/ContextMenuPage.tsx`
* Relevant specs:
  * `.trellis/spec/backend/type-safety.md`
  * `.trellis/spec/backend/error-handling.md`
  * `.trellis/spec/backend/logging-guidelines.md`
  * `.trellis/spec/guides/cross-layer-thinking-guide.md`

## Implementation Notes

* Protocol compatibility is the default. Any extension transport break must be documented and coordinated with extension-side migration work.
