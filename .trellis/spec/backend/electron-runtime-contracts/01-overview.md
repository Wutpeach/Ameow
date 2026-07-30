# Electron Runtime Contracts

> Executable contract for replacing Ameow's Tauri-native runtime with Electron main + preload while keeping renderer, browser-extension, config, and release boundaries stable.

---

## Source of Truth

- Renderer call sites:
  - `src/App.tsx`
  - `src/pages/SettingsPage.tsx`
  - `src/pages/ContextMenuPage.tsx`
  - `src/contexts/ThemeContext.tsx`
  - `src/main.tsx`
- Native runtime ownership today:
  - `src-tauri/src/lib.rs`
  - `src-tauri/src/native_i18n.rs`
  - `src-tauri/tauri.conf.json`
- Extension transport:
  - `browser-extension/background.js`
- Release packaging today:
  - `.github/workflows/release.yml`
  - `scripts/run-tauri.mjs`
  - `scripts/package-portable.ps1`
  - `scripts/package-macos-open-source-dmg.mjs`

---

## Core Rules

- Electron main owns tray, single-instance behavior, dialogs, shortcuts, autostart, relaunch, updater, loopback WebSocket transport, and config IO.
- Electron preload is the only renderer-facing desktop bridge. Renderer code must not import `electron`, Node built-ins, or `@tauri-apps/*` after migration starts.
- `src/core` remains runtime-neutral. Core modules may define shared types and pure helpers, but they must not import from `electron/` or `src/electron-runtime/`; Electron runtime modules may depend on core, not the other way around.
- The canonical desktop video-candidate normalizer lives in `src/core/video-candidate-normalization.ts`. Electron adapters such as `electron/videoHintNormalization.mts` should remain thin re-exports or wrappers around that source of truth instead of duplicating normalization rules.
- `electron/main.mts` is an ESM entrypoint; top-level controller construction must not read `const`/`let` bindings declared later in the file. Use function declarations for hoisted adapters, move construction after dependencies are initialized, or pass lazy callbacks that dereference later bindings only when invoked.
- BrowserWindows that expect desktop renderer behavior must keep `preload`, `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: false` aligned with the current preload architecture. If that architecture changes, update this spec in the same task.
- Renderer bootstrap must fail fast when Electron mode is detected but `window.ameow` is missing. Do not silently fall back to plain-web routing inside a desktop window.
- App events moving from Electron main to renderer must use per-event channels (`ameow:event:<event>`) instead of one shared multiplexed event channel.
- Preserve current command names, event names, JSON payload keys, window labels, and extension WebSocket actions unless this file changes in the same task.
- Preserve `settings.json` compatibility and the browser-extension loopback endpoint `127.0.0.1:39527`.
- Main-process command controller wiring should stay dependency-injected. Controllers may be created lazily, but they must not create hidden singleton state or bypass `electron/main.mts` as the composition root.

---
