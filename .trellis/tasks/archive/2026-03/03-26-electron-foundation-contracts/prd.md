# Electron foundation: runtime contract capture

## Goal

Capture the current Tauri/Rust runtime contracts and define the Electron replacement boundaries so later implementation tasks can execute without reopening architectural decisions.

## Requirements

* Inventory current renderer imports from `@tauri-apps/*` and Tauri plugins.
* Inventory current Rust command/event names, payload shapes, and window labels that the renderer depends on.
* Freeze the browser-extension WebSocket host, port, and action protocol that Electron must serve.
* Freeze the current config JSON schema and identify which keys are compatibility-critical.
* Define the preload API surface that replaces direct Tauri imports in the renderer.
* Define the replacement strategy for:
  * tray
  * shortcut
  * autostart
  * dialogs
  * opener/relaunch
  * updater
  * single-instance behavior
* Define the packaging/updater direction for Electron builder artifacts on Windows and macOS.

## Acceptance Criteria

* [ ] A migration matrix exists that maps current Tauri APIs/plugins/contracts to Electron-owned replacements.
* [ ] The preload bridge surface is explicit enough for renderer migration work to start.
* [ ] The extension transport contract is frozen or any intentional break is documented.
* [ ] The config compatibility stance is explicit.
* [ ] Downstream tasks can implement against this task without reopening core runtime decisions.

## Out of Scope

* Implementing Electron shell code.
* Porting downloader logic.
* Changing user-visible behavior unless required to document a migration boundary.

## Technical Notes

* Key source files:
  * `src/App.tsx`
  * `src/pages/SettingsPage.tsx`
  * `src/contexts/ThemeContext.tsx`
  * `browser-extension/background.js`
  * `src-tauri/src/lib.rs`
  * `src-tauri/tauri.conf.json`
  * `package.json`
* Relevant specs:
  * `.trellis/spec/frontend/type-safety.md`
  * `.trellis/spec/backend/type-safety.md`
  * `.trellis/spec/backend/sidecar-runtime-contracts.md`
  * `.trellis/spec/guides/cross-layer-thinking-guide.md`

## Implementation Notes

* Output artifacts for this task should include:
  * runtime replacement matrix
  * preload API contract
  * extension WS compatibility note
  * config compatibility note
  * packaging/updater ADR-lite
