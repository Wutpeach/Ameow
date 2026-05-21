# Directory Structure

> How backend/runtime code is organized in Ameow.

---

## Overview

The backend is no longer a single-file Rust app. Runtime ownership is split across:

- `electron/` for Electron main-process orchestration, runtime bootstrap, and command bridges
- `src/electron-runtime/` for framework-light runtime logic such as queueing, path resolution, downloader execution, and progress normalization
- `scripts/` for build/package/runtime preparation flows
- `src-tauri/` for the remaining native/Tauri-owned integrations that have not moved into Electron

The downloader stack now treats bundled Python as the packaged prerequisite and installs Python downloaders into per-tool virtual environments under the app config directory.

---

## Directory Layout

```text
electron/
├── main.mts                       # Electron main entrypoint and desktop orchestration
├── managedRuntimeBootstrap.mts    # Managed runtime installers/bootstrap
├── runtimeDependencyGate.mts      # Runtime gate state machine
└── downloaderVersionInfo.mts      # Downloader/runtime diagnostics

src/
└── electron-runtime/
    ├── service.ts                 # Download queue/runtime service
    ├── runtimePaths.ts            # Bundled/managed runtime path resolution
    ├── ytDlpDownload.ts           # yt-dlp executor
    ├── galleryDlDownload.ts       # gallery-dl executor
    └── processRunner.ts           # Shared hidden CLI execution helpers

desktop-assets/
└── binaries/
    ├── python-<target>/           # Bundled CPython runtime prepared by repo scripts
    └── .official-python-runtimes.json

scripts/
├── python-runtime.mjs             # Bundled Python fetch/verify/extract logic
├── ensure-python-runtime.mjs      # Local ensure entrypoint
├── smoke-python-runtime.mjs       # Bundled Python smoke checks
├── ensure-capability-probe-runtime.mjs
└── run-electron-package.mjs       # Packaging wrapper that prepares bundled Python first

src-tauri/
├── src/                           # Legacy/native integrations still owned by Rust/Tauri
├── Cargo.toml
└── tauri.conf.json
```

---

## Module Organization

Runtime/download responsibilities are organized by boundary:

1. **Electron main ownership**
   - IPC command bridging
   - window/tray/updater/config integration
   - runtime dependency gate state publishing
2. **Framework-light runtime core**
   - queue ownership
   - downloader routing/execution
   - runtime path inspection
   - progress/event normalization
3. **Managed runtime bootstrap**
   - bundled Python validation
   - per-tool venv bootstrap for `yt-dlp`, `gallery-dl`, and `douyin-dl`
   - managed `ffmpeg` and `deno` downloads
4. **Build/package preparation**
   - ensuring the official bundled Python runtime exists for the current package target
   - smoke checks for bundled Python capability (`venv`, `pip`, `sqlite3`, `ssl`)

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Functions | camelCase / verb-first helpers in TS, snake_case in Rust | `ensureManagedYtDlpRuntimeReady` / `get_clipboard_files` |
| Types | PascalCase | `RuntimeDependencyStatusSnapshot` |
| Constants | SCREAMING_SNAKE | `MANAGED_RUNTIME_BOOTSTRAP_ORDER` |
| Commands | stable string command ids | `"start_runtime_dependency_bootstrap"` |

---

## Examples

**Well-structured runtime boundary**:
- `electron/managedRuntimeBootstrap.mts` keeps downloader bootstrap logic independent from Electron globals by taking injected options.
- `src/electron-runtime/runtimePaths.ts` is the shared source of truth for bundled Python and managed downloader path resolution.
- `electron/runtimeDependencyGate.mts` keeps `python` as a bundled prerequisite while restricting bootstrap order to managed components only.
