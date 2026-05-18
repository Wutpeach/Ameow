# Cross-Platform Thinking Guide

> Use this checklist before changing scripts, sidecars, or OS-specific backend code.

---

## When to Use

- You add/rename files in `src-tauri/binaries/`.
- You modify `bundle.externalBin` in `src-tauri/tauri.conf.json`.
- You touch Windows-only crates/APIs (`clipboard-win`, `taskkill`, etc.).
- You change runtime commands that depend on system tools (`python3`, `deno`, shell scripts).

---

## Pre-Change Checklist

- [ ] Did I identify all target platforms affected (Windows/macOS/Linux)?
- [ ] Are sidecar names in Rust `sidecar("<name>")` still aligned with `externalBin` prefixes?
- [ ] For each platform, does `src-tauri/binaries/<name>-<target-triple>` exist and have executable permission?
- [ ] Did I guard platform-specific code paths with `#[cfg(...)]`?
- [ ] If a dependency is optional on some platforms, is there an explicit degraded behavior instead of crash?

---

## Build-Time Checks

- [ ] `npm run build` passes.
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml` passes on current platform.
- [ ] No build-script resource errors like `resource path ... doesn't exist`.

---

## Runtime Checks

- [ ] Wrapper scripts resolve local runtime correctly (`.venv` first, system fallback).
- [ ] Python wrapper bootstrap paths handle PEP 668 / externally-managed environments (for example Homebrew Python 3.12+ may require `--user --break-system-packages`).
- [ ] Service health endpoint stays available even when optional dependency is missing.
- [ ] Main app can still start (`npm run tauri dev`) without hard failure.
- [ ] If a packaged desktop renderer boots from `file://.../dist/index.html`, the built HTML references relative assets (`./assets/...`) instead of root-relative `/assets/...`.
- [ ] Renderer code that accepts dropped/pasted `file://` URLs parses them as URIs instead of stripping `file:///` as a plain string, so macOS paths keep their leading `/` and Windows paths still normalize to drive-letter/UNC forms.
- [ ] On Windows, any cleanup of dev/runtime processes targets exact executables or exact command-line signatures; never kill by broad working-directory/path substring matches that can also match `WindowsTerminal.exe` or the current `pwsh.exe`.

### Windows Process Cleanup Gotcha

> **Warning**: On Windows, process cleanup filters that match only on a repo path like `D:\Ameow` can also match the terminal process itself, for example `WindowsTerminal.exe -d "D:\Ameow"` or the currently running `pwsh.exe`.
>
> For local dev cleanup, do not use broad predicates such as "command line contains repo path". Prefer exact targets like:
> - `electron.exe` under the repo's `node_modules/electron/dist/`
> - `node.exe` commands that explicitly include `npm-cli.js run dev`
> - `node.exe` commands that explicitly include the project's dev harness path such as `scripts/run-electron-dev.mjs`
>
> Bad cleanup filters can terminate the active terminal window and kill the current AI/user session mid-debug.

---

## Ameow Runtime Contracts (macOS + Dev Script)

### 1) Transparent main window on macOS

- Files:
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- Contract:
  - If main window uses `"transparent": true`, config must set:
    - `app.macOSPrivateApi = true`
  - Rust dependency must enable:
    - `tauri` feature `macos-private-api`
- Validation and error matrix:
  - Missing `app.macOSPrivateApi`: startup warns transparent window is unsupported on macOS.
  - Missing Cargo feature: build fails with allowlist/feature mismatch and asks for `macos-private-api`.
  - Both present: transparent window starts without that warning.
- Cases:
  - Good: both config + Cargo feature enabled.
  - Base: one side enabled (warning or build failure).
  - Bad: neither enabled while relying on transparent behavior.

### 2) Electron `npm run dev` orchestration contract

- File:
  - `scripts/run-electron-dev.mjs`
- Commands:
  - `npm run dev`
  - `npm run electron:dev`
- Behavior:
  - The dev harness owns three coordinated processes:
    - `vite` on `http://127.0.0.1:1420`
    - `tsc -p tsconfig.electron.json --watch`
    - Electron main process
  - Startup must wait for both:
    - Vite HTTP readiness
    - compiled Electron entries under `dist-electron/electron/*.mjs`
  - Electron child starts with `AMEOW_ELECTRON_DEV_SERVER_URL=http://127.0.0.1:1420`.
  - `Ctrl+C` / `SIGTERM` must terminate all owned child processes; do not leave watcher or Electron orphans behind.
- Validation and error matrix:
  - Vite is not ready yet: Electron launch waits instead of booting against a dead dev server.
  - Electron build output is missing: startup fails with an explicit timeout instead of opening a broken shell.
  - Shutdown path misses one child: the next dev start may inherit stale watcher/Electron processes.
- Cases:
  - Good: `npm run dev` starts Vite, TypeScript watch, then Electron after both prerequisites are ready.
  - Base: renderer HMR continues normally while Electron is restarted only for main-process rebuilds.
  - Bad: developers must manually restart Electron after editing `electron/*.mts` or runtime-core imports.

### 3) macOS global input monitor safety contract

- Files:
  - `src-tauri/src/lib.rs`
  - `src-tauri/Cargo.toml`
- Contract:
  - Treat third-party global input hook callbacks as platform-sensitive and potentially non-main-thread.
  - Do not call AppKit/HIToolbox-sensitive APIs from unknown callback queues.
  - Prefer main-thread-safe polling/dispatch patterns for hover/focus features unless callback threading guarantees are proven.
- Validation and error matrix:
  - Callback path uses non-main queue and touches restricted APIs: can crash with `dispatch_assert_queue` / `SIGTRAP`.
  - Main-thread dispatch + polling path: no callback-queue assertion crash.
  - Hook library removed but behavior retained through cursor polling: hover activation still works without native hook crash risk.
- Cases:
  - Good: hover activation logic runs through main-thread window APIs only.
  - Base: callback performs lightweight filtering but delegates all UI/system calls to main thread.
  - Bad: callback directly invokes APIs that assume main queue affinity.

### 4) macOS crash artifact location

- On modern macOS, app crashes are commonly reported as `.ips` files in:
  - `~/Library/Logs/DiagnosticReports/`
- Do not assume `*.crash` exists.
- First-pass triage commands:
  - `ls -t ~/Library/Logs/DiagnosticReports/main-*.ips | head -n 5`
  - `rg -n "exception|faultingThread|dispatch_assert_queue|SIGTRAP" ~/Library/Logs/DiagnosticReports/main-*.ips`

### 5) macOS shortcut reveal positioning contract

- Files:
  - `src-tauri/src/lib.rs`
- Contract:
  - For shortcut-triggered reveal, apply target window position before `window.show()`.
  - Resolve bounds using the monitor containing cursor (`monitor_from_point`) instead of window's current monitor.
  - Avoid app-level reveal APIs that can transiently restore hidden windows at stale coordinates.
  - Keep reveal path deterministic: `unminimize -> optional set_position -> show -> focus`.
- Validation and error matrix:
  - Position applied after show or app-level reveal runs first: user may see one-frame flash at old location.
  - Position resolved but missing fallback: window still reveals at previous cached coordinates.
  - Deterministic reveal order with optional pre-show position: no visible cross-screen flash during shortcut reveal.
- Cases:
  - Good: shortcut reveal appears once near cursor without intermediate jump.
  - Base: shortcut reveal without cursor-position update still appears once at last window location.
  - Bad: shortcut reveal flashes at old location before settling.

### 6) Windows portable ZIP packaging fallback contract

- Files:
  - `scripts/package-portable.ps1`
  - `src-tauri/target/release/bundle/portable/`
- Contract:
  - Preferred packaging command is `Compress-Archive`.
  - If `Compress-Archive` is blocked or fails due to environment policy, packaging must fallback to `tar -a -c -f ...`.
- Portable package must include:
    - `Ameow.exe`
    - `yt-dlp-x86_64-pc-windows-msvc.exe` under the packaged desktop runtime resources
- Runtime tools that moved to managed bootstrap (`deno`, `ffmpeg`) must not be reintroduced into the portable ZIP as hidden packaging dependencies.
- If a runtime tool is required for packaged behavior, either keep it intentionally bundled (`yt-dlp`) or make the packaged app bootstrap it into `app_config_dir/runtimes/...` deterministically. Do not rely on the developer machine already having it on `PATH`.
- Validation and error matrix:
  - `Compress-Archive` succeeds: normal zip produced.
  - `Compress-Archive` blocked/fails: fallback `tar` path still produces the zip.
  - Missing bundled helper (`yt-dlp`) : script fails fast with explicit file-not-found error.
  - Managed runtime accidentally copied into the ZIP: artifact size regresses and packaging no longer matches first-launch bootstrap contracts.
  - Runtime tool exists only on developer PATH: local test may pass, but shipped portable package is invalid until the tool is either bundled intentionally or bootstrapped by the app.
- Cases:
  - Good: either primary or fallback command creates `Ameow_<version>_windows_x64_portable.zip`.
  - Base: fallback path triggered by policy restrictions but artifact remains valid.
  - Bad: no fallback, packaging aborts when `Compress-Archive` is unavailable.
  - Bad: portable downloads depend on a system-installed `ffmpeg` because managed bootstrap was skipped or the ZIP silently reintroduced stale runtime binaries.

### 7) Windows mixed-monitor shortcut reveal position contract

- Files:
  - `src-tauri/src/lib.rs`
  - `src/App.tsx`
- Contract:
  - Command/API signatures:
    - Rust: `set_window_position(app: AppHandle, x: i32, y: i32) -> Result<(), String>`
    - Frontend: `invoke("set_window_position", { x, y })`
    - Event: `shortcut-show` (frontend listener type `listen<void>("shortcut-show", ...)`)
  - Payload field names:
    - `set_window_position`: `x`, `y` (physical screen coordinates)
  - `set_window_position` command boundary uses **physical** coordinates (`PhysicalPosition`).
  - Frontend callers pass `outerPosition()` values directly without logical/physical conversion.
  - Shortcut reveal anchor is cursor lower-left preference, with clamping inside the monitor that contains cursor.
  - Reveal order stays deterministic: resolve position -> optional `set_position` -> `show`/`focus`.
  - Frontend `shortcut-show` listener must not issue secondary position updates that can override backend shortcut placement.
- Validation and error matrix:
  - Backend uses `LogicalPosition` while frontend passes `outerPosition()` values: mixed-DPI layouts can jump to wrong monitor regions.
  - Frontend listener re-applies position after shortcut reveal: visible second-jump or anchor drift can occur.
  - Monitor selection not based on cursor monitor: position can clamp against wrong monitor bounds.
  - Contract-aligned flow (physical coordinates + cursor monitor clamp + no frontend re-position): stable reveal without cross-screen jump.
- Cases:
  - Good: left-landscape/right-portrait dual-monitor with mixed DPI reveals once near cursor lower-left (or clamped equivalent) with no second jump.
  - Base: cursor near monitor edge still clamps within the cursor monitor and remains deterministic across repeated shortcut presses.
  - Bad: window first appears at stale location then jumps, or lands on the wrong monitor edge/bottom.
- Required tests (with assertion points):
  - `npm run type-check`: no TS error on `listen<void>("shortcut-show", ...)` and no drift in Tauri invoke typing.
  - `npm run lint`: no new frontend lint violations in `src/App.tsx`.
  - `cargo check --manifest-path src-tauri/Cargo.toml`: Rust command signature and position API usage compile.
  - Manual assertion (Windows mixed monitors): shortcut reveal appears once, no second jump, anchor remains cursor lower-left or monitor-clamped equivalent.
  - Manual assertion (focused + inside-window cursor): second shortcut press still hides window without relocation drift.

### 8) Electron dev shutdown contract

- Files:
  - `scripts/run-electron-dev.mjs`
- Commands:
  - `npm run dev`
  - `npm run electron:dev`
- Contract:
  - First `Ctrl+C` must shut down all owned child processes from the Electron dev harness:
    - `vite`
    - `tsc --watch`
    - Electron child
  - Main-process TypeScript rebuilds may restart Electron, but they must not kill the Vite server or the TypeScript watcher.
  - Shutdown logic must clear any pending delayed Electron restart timers before exiting.
- Validation and error matrix:
  - Graceful stop succeeds: script exits without lingering Electron or watcher processes.
  - Rebuild-triggered restart kills Vite as well: renderer dev session becomes unstable and unnecessary full restarts happen.
  - Missing timer cleanup: a queued restart can race with shutdown and relaunch Electron after the terminal is already stopping.
- Cases:
  - Good: one `Ctrl+C` cleanly stops the full Electron dev harness.
  - Base: a successful main-process rebuild restarts only Electron while Vite and `tsc --watch` remain alive.
  - Bad: stopping the terminal leaves a detached Electron process or a live watcher behind.
- Required tests (with assertion points):
  - `node --check scripts/run-electron-dev.mjs`: shutdown/restart path parses cleanly.
  - Manual assertion: run `npm run dev`, press `Ctrl+C` once, confirm Vite, watcher, and Electron all exit.
  - Manual assertion: edit an Electron main-process file during `npm run dev` and confirm only Electron restarts.

### 9) Tauri bundle identifier suffix and config migration contract

- Files:
  - `electron-builder.config.mjs`
  - `electron/main.mts`
- Contract:
  - Electron packaging must keep `appId: "com.ameow.desktop"` aligned with the current product identity.
  - Current runtime reads config from Electron `app.getPath("userData")`.
  - `migrateLegacyConfigIfNeeded()` is currently a no-op. Do not claim automatic migration from legacy FlowSelect config directories unless the runtime implementation is restored in the same change.
  - If legacy config migration is reintroduced in the future, it must not overwrite an already-existing config file in the Ameow user-data directory.
- Validation and error matrix:
  - `appId` drifts from the shipped product identity: packaged metadata, updater assumptions, or OS-level app records can diverge.
  - Spec or release notes claim legacy config auto-migration when runtime does not implement it: operators misdiagnose missing settings carry-over as a regression in a different layer.
  - A future migration writes over an existing Ameow `settings.json`: current-user config is corrupted during rename or identifier transitions.
- Cases:
  - Good: Electron packaging keeps `appId: "com.ameow.desktop"` and runtime config reads from the Ameow user-data directory.
  - Base: a new install starts with `{}` because no `settings.json` exists yet in the Ameow user-data directory.
  - Bad: documentation promises FlowSelect-to-Ameow config migration even though `electron/main.mts` still returns immediately from `migrateLegacyConfigIfNeeded()`.
- Required tests (with assertion points):
  - Inspect `electron-builder.config.mjs`: `appId` remains `com.ameow.desktop`.
  - Inspect `electron/main.mts`: `migrateLegacyConfigIfNeeded()` still matches the documented behavior.
  - Manual assertion (existing user config): if legacy config migration is reintroduced in the future, document the exact old/new directories in the same task; current Electron runtime does not migrate automatically.

### 10) Windows managed CLI hidden-window contract

- Files:
  - `src-tauri/src/lib.rs`
- Contract:
  - Managed console executables launched by the desktop app (`yt-dlp`, `gallery-dl`, selection probes, version checks, similar future download helpers) must share one native Windows hidden-process spawn helper.
  - Do not assume `tauri-plugin-shell` spawn is sufficient for Windows no-flash behavior on retry-heavy or multi-stage downloader paths.
  - Do not combine `CREATE_NO_WINDOW` with `DETACHED_PROCESS`; Windows treats that as “ignore the no-window flag”.
  - If a retry strategy needs different cookies/format selection on Windows, decide that before the real download starts whenever possible. Killing and relaunching a real `yt-dlp` download can still surface visible flashes and transient `.part` artifacts even when child creation is hidden correctly.
  - The shared helper must own:
    - hidden process creation flags
    - stdout/stderr piping back into Rust
    - stable PID capture for cancellation
  - If a new downloader path adds another managed CLI launch, route it through the same helper instead of creating a separate spawn style.
- Validation and error matrix:
  - New Windows CLI path bypasses the shared helper: GUI app may flash one or more transient terminal windows during download/probe/retry.
  - Retry/cookie decision happens only after a real output download already started: the app may still flash and briefly create/delete `.part` files before the final attempt settles.
  - Shared helper used consistently: `highest`/retry-heavy flows remain GUI-only while progress and cancellation keep working.
- Cases:
  - Good: `highest` download resolves any cookie/selection preflight before the main transfer and keeps the GUI free of visible terminal windows.
  - Base: single-process `balanced` download also uses the same helper and keeps consistent cancellation/progress behavior.
  - Bad: one code path uses the helper but another probe/version path uses a different spawn API and still flashes windows.
  - Bad: the app starts a real `highest` download, notices a better cookie-free path mid-flight, then kills and restarts the transfer.

### 11) macOS open-source DMG packaging contract

- Files:
  - `.github/workflows/release.yml`
  - `scripts/package-macos-open-source-dmg.mjs`
  - `distribution/macos/install-guide.txt`
  - `background.png`
  - `app-icon.png`
- Contract:
  - Public macOS releases use an open-source-only unsigned DMG flow. The release workflow must not depend on Apple signing or notarization secrets.
  - The macOS release workflow installs `create-dmg`, builds an app bundle first, packages the latest browser extension ZIP, then creates a custom Finder-styled DMG.
  - The custom DMG includes:
    - `Ameow.app`
    - `Applications` drop link
    - short install guide text
    - `Ameow_<version>_browser_extension.zip`
  - The packaging script derives the DMG volume icon from `app-icon.png` by generating a temporary `.icns` asset during packaging.
  - The DMG background image comes from the repository root `background.png`.
  - DMG artifact names are normalized by architecture label:
    - `x86_64` -> `Ameow_<version>_macos_x64_installer.dmg`
    - `aarch64` -> `Ameow_<version>_macos_arm64_installer.dmg`
- Validation and error matrix:
  - No Apple secrets configured: workflow still produces the unsigned helper DMG for end-user distribution.
  - Workflow omits `create-dmg`: release packaging fails on the macOS job before artifact upload.
  - App bundle or DMG assets are missing: packaging script fails fast with an explicit missing-file error.
  - Browser extension ZIP is built after DMG creation: the custom DMG ships stale or missing extension payload.
  - Architecture labels are not normalized: release artifacts regress to confusing names like `x86_64` or `aarch64` in the published DMG filename.
  - `create-dmg`, `iconutil`, or `sips` unavailable: custom DMG packaging fails after the app bundle build step.
- Cases:
  - Good: DMG opens with Ameow.app, Applications drop link, install guide, and the freshly packaged browser extension ZIP placed at the intended custom coordinates.
  - Base: local packaging regenerates the temporary `.icns` volume icon from the checked-in PNG each run.
  - Bad: release page publishes a DMG with default Finder layout because `create-dmg` styling was skipped.
  - Bad: the DMG bundles a browser extension ZIP from an earlier build instead of the current versioned artifact.
- Required tests (with assertion points):
  - `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release.yml")'`: workflow YAML stays valid.
  - `node --check scripts/package-macos-open-source-dmg.mjs`: packaging script parses cleanly.
  - `create-dmg --help`: required DMG tooling is available on the packaging machine.
  - Inspect release artifacts or packaging output: DMG names use `macos_x64_installer` / `macos_arm64_installer`, not raw Rust target arch labels.
  - `npm run lint`: repo lint baseline remains clean after release workflow/spec updates.
  - `npm run type-check`: frontend type-check remains clean after release workflow/spec updates.

### 12) Electron single-instance contract

- Files:
  - `electron/main.mts`
- Commands:
  - `npm run dev`
  - packaged Electron app launch
- Contract:
  - Electron main must acquire `app.requestSingleInstanceLock()` before creating the main window.
  - If the lock is unavailable, the new process must quit immediately instead of creating a second independent collector instance.
  - When a second launch is redirected to the existing instance, Electron main must handle the `second-instance` event by surfacing the already-running main window instead of silently doing nothing.
  - There is no current development-only opt-out env for this lock; spec must not claim a debug exception that the code does not implement.
- Validation and error matrix:
  - Single-instance lock is skipped: duplicate app launches can create competing tray/window/runtime state.
  - Lock failure does not quit: a hidden second process can linger and confuse autostart/update/runtime ownership.
  - `second-instance` handler does not reveal the existing window: users perceive launch as broken even though the first instance is still alive.
- Cases:
  - Good: launching Ameow twice keeps one process and reveals/focuses the existing window.
  - Base: the first instance is already minimized or hidden, and the second launch restores it.
  - Bad: the second launch exits while the first instance remains hidden with no user-visible recovery.
- Required tests (with assertion points):
  - Electron startup path still calls `app.requestSingleInstanceLock()`.
  - `second-instance` handling still routes to the existing main-window reveal path.
  - Manual assertion: launching Ameow twice results in one live process and one visible main window.

### 13) Electron packaged `file://` renderer asset-base contract

- Files:
  - `vite.config.ts`
  - `electron/main.mts`
  - `dist/index.html`
- Contract:
  - If packaged Electron BrowserWindows load the renderer with `file:///.../dist/index.html#...`, the production Vite build must emit relative asset URLs such as `./assets/...`.
  - Do not ship root-relative `/assets/...` URLs in packaged `dist/index.html`; under `file://` this resolves to `file:///assets/...` instead of the packaged app directory.
  - Development can keep the normal `/` base, but the build output used by packaged Electron must switch to a `file://`-safe base (`"./"` or equivalent).
- Validation and error matrix:
  - Build output uses `./assets/...`: packaged renderer JS/CSS load from the bundled `dist/assets/` directory and the UI mounts normally.
  - Build output uses `/assets/...`: packaged windows can show only their native host background with no React content, which can be misdiagnosed as a transparent-window/compositor bug.
  - Dev works but packaged is blank: treat the build asset base as a first-pass check before investigating DWM, `ready-to-show`, or z-order behavior.
- Cases:
  - Good: `dist/index.html` references `./assets/index-*.js` and `./assets/index-*.css`.
  - Base: dev server continues to serve `/assets/...`, but production build rewrites to relative paths.
  - Bad: packaged Windows testing starts from a blank shell because `index.html` still points at `/assets/...`.
- Required tests (with assertion points):
- `npm run build:renderer`: succeeds and produces `dist/index.html`.
- Inspect `dist/index.html`: script and stylesheet URLs are relative (`./assets/...`), not root-relative.
- Manual assertion (packaged Electron): `main` and `settings` render actual React content instead of only the BrowserWindow host background.

### 14) Electron `npm run dev` main-process restart contract

- Files:
  - `scripts/run-electron-dev.mjs`
- Commands:
  - `npm run dev`
  - `npm run electron:dev`
- Contract:
  - Renderer HMR and Electron main-process reload are separate concerns.
  - `vite` may hot-update renderer code, but TypeScript rebuilds for `electron/main.mts` and runtime-core imports do not affect an already-running Electron main process unless the dev harness explicitly restarts Electron.
  - `scripts/run-electron-dev.mjs` must:
    - perform an initial `tsc -p tsconfig.electron.json`
    - start `tsc --watch`
    - detect successful rebuild completions
    - restart the Electron process after successful main-process rebuilds
  - Do not require developers to remember manual Electron restarts after editing main-process or runtime-core files.
- Validation and error matrix:
  - `tsc --watch` rebuilds but Electron is not restarted: dev session keeps running stale main-process logic even though `dist-electron/` is fresh on disk.
  - Rebuild detection triggers restart only after a successful compile: broken intermediate TypeScript edits should not thrash Electron restarts.
  - Restart logic kills only the Electron child, not the Vite server or the `tsc --watch` process.
- Cases:
  - Good: editing `electron/main.mts` or `src/electron-runtime/service.ts` causes `npm run dev` to log a rebuild-triggered Electron restart and the next interaction uses the new main-process logic.
  - Base: renderer-only edits still update through Vite without unnecessary full Electron restarts.
  - Bad: developers edit main-process code, see new `dist-electron` output on disk, but the running app continues using old in-memory logic with no restart.
- Required tests (with assertion points):
  - `node --check scripts/run-electron-dev.mjs`: script remains syntactically valid.
  - Manual assertion (Electron dev): edit a main-process file, observe restart log output, and confirm the running app behavior changes without manually re-running `npm run dev`.

---

## Use This Code-Spec for Implementation Details

- Backend executable contracts and matrices:
  - `../backend/sidecar-runtime-contracts.md`
