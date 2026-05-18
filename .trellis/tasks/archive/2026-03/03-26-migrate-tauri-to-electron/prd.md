# brainstorm: migrate desktop runtime from tauri to electron

## Goal

Replace the current Tauri + Rust desktop runtime with an Electron + Node runtime without losing the FlowSelect product surface. The migration must preserve the current floating-window UX, browser-extension connectivity, download pipeline, and release behavior while removing Tauri from development, runtime, and packaging workflows.

## What I already know

* FlowSelect currently ships as a Tauri desktop app with a React renderer under `src/` and a Rust backend under `src-tauri/`.
* The renderer imports Tauri APIs directly from `@tauri-apps/api/*` and Tauri plugins for events, commands, window control, clipboard, dialog, updater, and process relaunch.
* Native desktop integrations currently live in Rust/Tauri, including tray, global shortcut, autostart, single-instance handling, dialog orchestration, updater behavior, and the browser-extension WebSocket server.
* The browser extension talks to the desktop app over `ws://127.0.0.1:39527` and uses a request/response action protocol implemented in `browser-extension/background.js` and `src-tauri/src/lib.rs`.
* Download orchestration, yt-dlp/ffmpeg process management, and output-path/config persistence are implemented inside `src-tauri/src/lib.rs`.
* Packaging and release tooling currently assumes Tauri through `package.json`, `scripts/run-tauri.mjs`, `scripts/dev-all.mjs`, `src-tauri/tauri.conf.json`, and release/update artifacts.
* There is no meaningful Electron runtime already present in the repo.
* The approved migration direction is:
  * full Node/Electron ownership instead of keeping Rust as a long-lived service
  * one-shot cutover instead of a staged production migration
  * Windows and macOS parity designed from the start

## Requirements

* Replace Tauri runtime ownership with an Electron architecture split into:
  * Electron main process
  * preload bridge
  * existing React renderer migrated away from direct Tauri imports
* Preserve the current product surface:
  * floating main window
  * settings window
  * context menu window
  * browser-extension integration
  * download queue and progress behavior
  * output-folder/config persistence
  * release/update path
* Define a typed app-owned desktop bridge so renderer code no longer depends on `@tauri-apps/*`.
* Preserve the browser-extension WebSocket host/port and action contract by default.
* Preserve existing user config JSON shape by default.
* Rebuild native integrations in Electron:
  * tray
  * global shortcut
  * autostart
  * dialog/open-folder flows
  * updater
  * relaunch
  * single-instance behavior
* Port downloader and sidecar orchestration to Node/Electron services with equivalent progress, cancellation, and file-output semantics.
* Replace Tauri dev/build/release commands and packaging with Electron equivalents.
* Remove Tauri as a runtime/build dependency only after Electron parity is verified.

## Acceptance Criteria

* [ ] A new parent migration task exists with child tasks that break the work into executable phases.
* [ ] The parent PRD captures the approved migration direction, scope, constraints, and defaults.
* [ ] The migration work is split into explicit execution tracks for contracts, shell/bridge, native integrations, download runtime, release cutover, and final cleanup.
* [ ] The parent task records relevant repo constraints, code patterns, and files likely to change.
* [ ] The parent task is the active Trellis current task so later implementation work can continue directly from it.

## Out of Scope

* Actually rewriting the app into Electron in this task.
* Product redesign unrelated to the runtime migration.
* Breaking the browser-extension protocol or config schema without a later explicit ADR.
* Supporting Linux in the first migration wave.

## Technical Notes

### Relevant Specs

* `.trellis/spec/frontend/hook-guidelines.md`: current renderer contract relies heavily on `invoke()` and `listen()` lifecycles that must be replaced with an app-owned bridge.
* `.trellis/spec/frontend/type-safety.md`: command/event typing is a cross-layer contract and must be preserved during bridge replacement.
* `.trellis/spec/backend/type-safety.md`: Rust command/event surfaces show the current backend contract that Electron must replace.
* `.trellis/spec/backend/error-handling.md`: backend/user-facing failures currently resolve to descriptive string errors and that behavior should remain stable.
* `.trellis/spec/backend/logging-guidelines.md`: process-heavy runtime work uses structured `>>>` logging conventions that the Node migration should retain.
* `.trellis/spec/backend/sidecar-runtime-contracts.md`: current runtime binary and managed-runtime behavior define the downloader/sidecar expectations Electron must either preserve or replace intentionally.
* `.trellis/spec/guides/cross-layer-thinking-guide.md`: the migration crosses renderer, native runtime, extension transport, and release infrastructure.
* `.trellis/spec/guides/cross-platform-thinking-guide.md`: Windows/macOS packaging and native integrations must be designed together instead of patched in later.

### Code Patterns Found

* Direct renderer-to-runtime command/event pattern:
  * `src/App.tsx`
  * `src/pages/SettingsPage.tsx`
  * `src/contexts/ThemeContext.tsx`
* Native runtime ownership of desktop integrations and extension transport:
  * `src-tauri/src/lib.rs`
* Browser-extension reconnect and request protocol:
  * `browser-extension/background.js`
* Packaging/release wrappers around Tauri:
  * `package.json`
  * `scripts/run-tauri.mjs`
  * `scripts/dev-all.mjs`

### Files To Modify

* `package.json`: replace Tauri scripts/dependencies with Electron equivalents.
* `src/`: migrate renderer imports and window/runtime interactions to the new preload bridge.
* `browser-extension/background.js`: keep transport compatibility with the new Electron-owned desktop server.
* `scripts/`: replace Tauri dev/build/package wrappers and update release automation.
* `.github/workflows/`: update build/release pipeline assumptions.
* `README.md` and `README.en.md`: update runtime/build/install docs once the cutover is real.
* `src-tauri/`: remove only after parity and release migration are complete.

## Technical Approach

### 1. Freeze contracts first

* Inventory every current Tauri command, event, window action, and plugin-dependent flow.
* Freeze the browser-extension WebSocket protocol and current config schema before implementation work starts.
* Define the preload API surface that will replace direct `@tauri-apps/*` imports.

### 2. Build the Electron shell around the existing renderer

* Introduce Electron main/preload entrypoints and a typed desktop bridge.
* Preserve the current React surface and migrate it off Tauri incrementally at the source level, even though product rollout is a one-shot cutover.

### 3. Port native integrations into Electron main services

* Move tray, shortcut, autostart, dialog, updater, relaunch, and extension WebSocket ownership into Electron main process code.
* Keep extension host/port and action names stable by default.

### 4. Port download/runtime orchestration into Node

* Rebuild yt-dlp, ffmpeg, and sidecar orchestration using Node child-process services.
* Preserve current progress, cancellation, retry, output-path, and AE-friendly post-processing semantics unless a later task intentionally changes product behavior.

### 5. Cut over packaging and release

* Replace Tauri build/package/release/update tooling with Electron equivalents.
* Default packaging target:
  * Windows NSIS installer
  * macOS DMG + zip/update artifacts

### 6. Verify parity before removing Tauri

* Run a feature-parity matrix across desktop surfaces, download flows, extension sync, and update/build behavior.
* Remove Tauri only after Electron release flow and regression checks are green.

## Decision (ADR-lite)

**Context**: FlowSelect has deep Tauri coupling across renderer APIs, native integrations, download orchestration, extension transport, and release tooling. A migration plan without an explicit runtime direction would leave too many architectural decisions open for implementation.

**Decision**:

* Migrate to Electron with full Node/Electron ownership of the desktop runtime.
* Treat the work as a one-shot cutover instead of a production gradual migration.
* Design Windows and macOS parity from the start.
* Preserve browser-extension transport and config schema by default.
* Use a typed preload bridge as the sole renderer-facing desktop API surface.

**Consequences**:

* This is not a shell swap. It is a full desktop runtime rewrite with packaging and infrastructure implications.
* Contract capture must happen before shell/native/download tasks proceed.
* Tauri removal is a final cleanup task, not an early implementation step.

## Implementation Plan

* Phase 1: `03-26-electron-foundation-contracts`
  * capture Tauri/Electron contract replacement matrix
  * freeze preload API surface, extension WS contract, config schema, and packaging assumptions
* Phase 2A: `03-26-electron-shell-bridge`
  * introduce Electron app shell, preload, and renderer bridge migration
* Phase 2B: `03-26-electron-native-integrations`
  * port tray, shortcuts, dialogs, updater, relaunch, autostart, and extension transport
* Phase 2C: `03-26-electron-download-runtime`
  * port downloader/sidecar/process orchestration into Node/Electron services
* Phase 3: `03-26-electron-release-cutover`
  * move dev/build/release/update tooling to Electron packaging
* Phase 4: `03-26-electron-verify-cleanup`
  * run parity verification and remove obsolete Tauri codepaths

## Parallel Workstreams

* Parent task: `03-26-migrate-tauri-to-electron`
* Child tasks:
  * `03-26-electron-foundation-contracts`
  * `03-26-electron-shell-bridge`
  * `03-26-electron-native-integrations`
  * `03-26-electron-download-runtime`
  * `03-26-electron-release-cutover`
  * `03-26-electron-verify-cleanup`
* Execution rule:
  * foundation goes first
  * shell-bridge, native-integrations, and download-runtime may proceed in parallel after foundation
  * release-cutover starts after the implementation tracks converge
  * verify-cleanup runs last
