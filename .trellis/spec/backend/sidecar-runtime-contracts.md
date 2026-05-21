# Runtime Binary Contracts

> Executable contracts for bundled Python and managed downloader runtimes across macOS/Windows development environments.

---

## Scenario: Cross-Platform Runtime Resolution For Downloaders

### 1. Scope / Trigger

- Trigger: any change touching bundled Python packaging under `desktop-assets/binaries/`, managed runtime bootstrap, Electron runtime path resolution, or packaging scripts that prepare downloader prerequisites.
- Why this needs code-spec depth: runtime readiness now spans repo-managed bundled Python assets, packaged Electron resource layout, config-dir managed runtimes, and cross-platform process execution.

### 2. Signatures

- Runtime status/version surfaces:
  - `checkYtdlpVersion(...) -> Promise<DownloaderVersionInfo>`
  - `getGalleryDlInfo(...) -> Promise<DownloaderVersionInfo>`
  - `inspectRuntimeDependencyStatus(...) -> RuntimeDependencyStatusSnapshot`
- Bundled runtime preparation scripts:
  - `npm run runtime:ensure:python`
  - `npm run runtime:smoke:python`
  - `npm run runtime:smoke:downloaders`
  - `npm run runtime:smoke:douyin-session`
  - `npm run runtime:verify:macos-package`
  - `node ./scripts/ensure-capability-probe-runtime.mjs --tool <tool>`
- Runtime bootstrap entrypoints:
  - `ensureManagedYtDlpRuntimeReady(...)`
  - `ensureManagedGalleryDlRuntimeReady(...)`
  - `ensureManagedDouyinDlRuntimeReady(...)`
  - `ensureManagedFfmpegRuntimeReady(...)`
  - `ensureManagedDenoRuntimeReady(...)`

### 3. Contracts

- Runtime path resolution:
  - Bundled Python is the only packaged prerequisite for Python downloaders.
  - `yt-dlp`, `gallery-dl`, and `douyin-dl` must resolve from managed per-tool virtualenvs under `app_config_dir/runtimes/<tool>/<target>/venv/...`.
  - Official downloader provenance is represented by pinned Python package sources in `electron/managedPythonPackageManifest.mts`, not by shipping standalone downloader release binaries.
  - Scripts that need managed Python package pins must read the compiled Electron manifest through `scripts/managed-python-package-manifest.mjs`; they must not define a second downloader version/source table.
  - Managed Python venv creation must use Python's default symlink-based layout on macOS. Do not pass `--copies` for macOS python-build-standalone runtimes, because copying the interpreter out of its bundled tree can break loader/runtime lookup and abort during `ensurepip`.
  - Managed Python downloader metadata must record both `bundledPythonVersion` and the concrete `bundledPythonPath`; if either changes, rebuild that downloader venv so app moves or packaged-resource path changes do not leave stale symlinks behind.
  - Repo-managed bundled-Python ensure flows must treat official provenance as part of readiness:
    - use the unified `runtime:ensure:python` entrypoint for local dev/build/package preparation
    - presence of an arbitrary matching `python-<target>` directory is not enough if the runtime has not been stamped by the repo manifest
    - the source-of-truth manifest is `desktop-assets/binaries/.official-python-runtimes.json`
  - Electron runtime path/status resolution for Python downloaders:
    - `python.source` must resolve as `"bundled"` when ready
    - `python.expectedSource` must be `"bundled"`
    - `ytDlp.expectedSource`, `galleryDl.expectedSource`, and `douyinDl.expectedSource` must be `"managed"`
    - downloader managed runtime target paths live under `app_config_dir/runtimes/<tool>/<target>/venv/bin/<entrypoint>` (or `venv/Scripts/<entrypoint>.exe` on Windows)
  - Bundled Python candidate order must include:
    - repo dev tree: `<repoRoot>/desktop-assets/binaries/python-<target>`
    - packaged Electron resources: `<resourceDir>/binaries/python-<target>`
    - packaged Electron app resources: `<resourceDir>/app/desktop-assets/binaries/python-<target>`
    - portable/current exe fallback: `<exeDir>/binaries/python-<target>`
  - Status inspection and bootstrap output must agree on the same managed runtime paths; do not let `runtimePaths.ts` and `managedRuntimeBootstrap.mts` drift.
  - On Windows, app-managed console binaries that stream output back into Rust or Electron (`yt-dlp`, `gallery-dl`, selection probes, version checks) must use one shared hidden-CLI spawn path instead of `tauri-plugin-shell` spawn so multi-process routes do not flash transient console windows.
  - The shared Windows helper must keep `CREATE_NO_WINDOW` intact and must not combine it with `DETACHED_PROCESS`, because that causes the no-window flag to be ignored.
  - App-managed yt-dlp invocations must include `--ignore-config` so portable builds do not inherit host-machine yt-dlp configuration files.
- Managed runtime install contract:
  - App-owned managed runtimes install under `app_config_dir/runtimes/<component>/<target>/`.
  - `python` is a bundled prerequisite and must not enter `missingComponents` or `MANAGED_RUNTIME_BOOTSTRAP_ORDER`.
  - If bundled Python is missing or invalid, runtime gate state must fail early with a reinstall-style error instead of attempting downloader bootstrap.
  - `deno` and `ffmpeg` are resolved from this managed runtime directory, not from bundled/resource or `PATH` fallbacks.
  - Electron startup must not auto-bootstrap managed runtimes before the main window has had a chance to render.
  - Startup may inspect runtime readiness and publish gate state, and if managed runtimes are missing the app should auto-start bootstrap only after the frontend main window is visibly expanded.
  - Compact icon-mode startup does not count as "main window visible" for auto-bootstrap purposes; startup bootstrap must not interrupt the compact first reveal by forcing an immediate expand.
  - The runtime reminder UI may expose hoverable progress/details during automatic bootstrap, but explicit click-to-retry should be reserved for failed or otherwise manual-action states.
  - Runtime gate refresh commands used by Settings/status surfaces must stay inspection-only; a separate bootstrap trigger should start downloads after first paint or explicit retry.
  - Renderer startup auto-bootstrap scheduling must survive gate/status refresh re-renders until the delayed bootstrap callback actually fires; do not mark the current-session startup bootstrap as "already triggered" until the command dispatch begins.
  - If a delayed startup bootstrap callback runs but `start_runtime_dependency_bootstrap` returns `phase: "idle"` or no payload, the renderer may clear the one-shot startup latch and allow one later retry after the window becomes ready again.
  - Managed runtime download/extract temp paths may live inside the target runtime directory, so the parent directory must be created before opening temp files.
  - Managed runtime downloads must validate expected size + sha256 before install and replace the live binary atomically.
  - Electron-owned managed-runtime bootstrap HTTP requests must use Electron session / Chromium network fetch rather than Node global `fetch`, so startup bootstrap respects system proxy, PAC, and any session-level proxy overrides.
  - Downloader managed bootstrap must source Python from bundled runtime bootstrap options; do not fall back to system Python in steady state.
  - Shared Python package bootstrap must use per-tool in-flight promise joining so startup prewarm, settings refresh, and first real download converge on one venv install/rebuild flow per tool.
  - Managed `ffmpeg` and `deno` bootstrap must use component-and-target in-flight promise joining so startup prewarm, yt-dlp engine preparation, and first real download converge on one managed binary install flow per component.
  - `douyin-dl` browser support (`playwright` / Chromium) remains lazy and must not be part of default startup prewarm.
- Runtime contract for `ffmpeg` used by yt-dlp/internal post-processing:
  - `ffmpeg` is no longer bundled into the Windows portable ZIP or treated as a system `PATH` dependency.
  - Runtime must bootstrap `ffmpeg` into `app_config_dir/runtimes/ffmpeg/<target>/` from a pinned FFmpegBin release asset when missing.
  - Current pinned managed asset set is FFmpegBin `8.0.1`:
    - Windows x64 -> `ffmpeg-windows-x64.zip`
    - macOS arm64 -> `ffmpeg-osx-arm64.zip`
    - macOS x64 -> `ffmpeg-osx-x64.zip`
  - The downloaded archive must be checksum/size validated before extracting the required `ffmpeg` and `ffprobe` entries.
  - The install flow should stage both binaries first, then replace the runtime directory so partial writes do not become the steady-state runtime.
  - On Windows, the managed runtime root must expose proxy-front binaries `ffmpeg.exe` / `ffprobe.exe`, while the real extracted console binaries live under `app_config_dir/runtimes/ffmpeg/<target>/real/`.
  - yt-dlp invocations that rely on merged A/V streams must pass `--ffmpeg-location` using the resolved managed runtime path instead of assuming `PATH`.
  - On Windows, `--ffmpeg-location` and any `PATH` prepending meant for third-party tools must point at the proxy-front directory, not the `real/` subdirectory, so yt-dlp child launches stay hidden.
  - Internal Rust ffmpeg invocations (AE normalization, slicing, encoder probe) must use the same managed runtime path and must ensure bootstrap before spawn.
  - On Windows, internal CLI launches for ffmpeg/ffprobe probes and post-processing must use hidden-window process flags so AE-friendly normalization does not flash a transient console window.
  - Failure/cancel paths must remove captured yt-dlp split-stream artifacts such as `*.f30112.mp4` and `*.f30280.m4a`.
  - If the main yt-dlp route fails with `HTTP Error 416` / `Requested Range Not Satisfiable`, runtime must clean stale resume artifacts and retry exactly once with `--no-continue --no-part`.
- Runtime contract for `deno` managed runtime:
  - `deno` is no longer bundled as a packaged Tauri resource or portable helper binary.
  - Runtime must bootstrap `deno` into `app_config_dir/runtimes/deno/<target>/deno(.exe)` from a pinned upstream asset when missing.
  - On Windows, the managed runtime root must expose a proxy-front `deno.exe`, while the real extracted console binary lives under `app_config_dir/runtimes/deno/<target>/real/deno.exe`.
  - Current pinned managed asset set is Deno `2.7.1`:
    - Windows x64 -> `deno-x86_64-pc-windows-msvc.zip`
    - macOS arm64 -> `deno-aarch64-apple-darwin.zip`
    - macOS x64 -> `deno-x86_64-apple-darwin.zip`
  - Download source order should prefer official `dl.deno.land/release/...` URLs and fall back to the matching GitHub release asset if the CDN path fails.
  - The downloaded archive must be checksum/size validated before extracting the single `deno` / `deno.exe` entry.
  - Extraction/install should retry transient failures in the same bootstrap run before surfacing a terminal error to the user.
  - yt-dlp paths that rely on JavaScript runtimes must ensure managed `deno` is ready before spawn and prepend the proxy-front directory to `PATH`, not the `real/` subdirectory.
- Runtime contract for YouTube route:
  - Public/default YouTube runs must start with light mode: `--extractor-args youtube:player_client=android,web`.
  - Extended YouTube compatibility mode must remain available with `--extractor-args youtube:player_js_variant=tv`.
  - Include `--remote-components ejs:github`.
  - Include JavaScript runtimes via repeated args; do not pass `node,deno` as one token.
  - On Windows, prefer managed `deno` before host `node` for app-managed yt-dlp runs: `--js-runtimes deno --js-runtimes node`.
  - On non-Windows, keep the broader compatibility order: `--js-runtimes node --js-runtimes deno`.
  - `pageUrl` or `selectionScope == "current_item"` alone must not force extended mode. Default injected/public YouTube should still attempt light mode first.
  - `forceExtended == true` or an already-attached cookie payload may start directly in extended mode.
  - When light mode fails with login / bot-check / signature / player-extractor errors, runtime may retry exactly once in extended mode.
  - Before the extended retry begins, emit a `preparing` progress update whose `speed` carries a translatable activity token (for example `activity:youtube.retryingCompatibleExtractor`) so the UI distinguishes fallback from the initial resolve phase.
  - If extension cookie file exists, attach it for YouTube URLs as well (`youtube.com`, `youtu.be`) to improve fetch success on 403-prone routes.
  - Temporary Netscape cookie files created from extension-provided cookies must be written under the OS temp directory (`tmpdir()` or equivalent), not `process.cwd()` or packaged resource paths, because packaged macOS apps can run with a read-only current working directory.
- Clipboard contract:
  - `get_clipboard_files()` uses `clipboard-win` only on Windows.
  - On non-Windows: return error string, do not panic/compile-fail.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| bundled `python-<target>` directory missing from packaged resources | runtime status inspection / package smoke | runtime gate fails before downloader bootstrap | rerun `npm run runtime:ensure:python` and repackage |
| non-Windows build imports `clipboard-win` directly | Rust compile step | Compile error unresolved import | Guard import/function logic with `#[cfg(windows)]` |
| bundled Python executable loses exec bit on Unix | runtime process spawn | `Permission denied` on bootstrap or smoke check | restore executable mode during ensure/extract |
| portable package leaves duplicate helper executables at root | package inspection + runtime version check | users can observe stale duplicate files after update | ship helper executables only under `binaries/` |
| installer/resource layout omits `desktop-assets/binaries/python-<target>` | runtime status / startup gate | Python downloaders cannot bootstrap | include the current target bundled Python directory in packaged resources |
| host machine has custom yt-dlp config | packaged download runtime | portable build behaves differently across machines | pass `--ignore-config` on app-managed yt-dlp invocations |
| Electron main-process HTTP downloads use Node global `fetch` instead of Electron session fetch | managed runtime bootstrap / updater / version checks | proxy-configured users bypass system/session proxy settings and remote downloads can appear unusually slow or fail | route requests through Electron session / Chromium network fetch |
| Windows managed downloader path uses a generic shell/plugin spawn | highest-quality or retry-heavy download runtime | one or more transient console windows can flash even though the main app is GUI-only | route the process through the shared native hidden-CLI helper |
| yt-dlp exits 0 after reusing an existing file | packaged/runtime completion normalization | app reports false failure because no final path was captured from stdout | recover final path from `after_move:filepath` report and keep stdout parsing only as fallback |
| non-host packaging prepare tries to execute foreign Python | cross-target packaging prepare | packaging fails on the host before artifact assembly | skip runtime smoke execution for non-host targets while still verifying checksum/extract/manifest |
| managed `deno` runtime missing | app startup / yt-dlp spawn | YouTube-capable yt-dlp path cannot start JS runtime | bootstrap `deno` into `app_config_dir/runtimes/...` before yt-dlp spawn |
| managed `deno` archive checksum mismatch | runtime bootstrap | corrupted runtime would be installed | reject archive and keep runtime missing |
| managed `deno` archive extracted from unvalidated asset | runtime bootstrap | runtime provenance is unclear | validate archive size + sha256 before extraction |
| managed runtime temp archive path lives under a missing target directory | runtime bootstrap temp-file creation | bootstrap fails before the HTTP download actually starts | create the temp path parent directory before opening the temp file |
| managed `ffmpeg` runtime missing | app startup / yt-dlp merge / AE normalize / slicing | download or post-processing cannot spawn media tools | bootstrap `ffmpeg` into `app_config_dir/runtimes/...` before spawn |
| managed `ffmpeg` archive checksum mismatch | runtime bootstrap | corrupted runtime would be installed | reject archive and keep runtime missing |
| managed `ffmpeg` archive is missing `ffmpeg` or `ffprobe` | runtime bootstrap | runtime would be only partially usable | fail install and keep runtime missing until both files are present |
| app launches into compact icon mode with missing managed runtimes | startup bootstrap timing | compact first reveal regresses into an unsolicited main-window expand | defer startup bootstrap until the renderer is in the expanded main-window state |
| startup auto-bootstrap timer is scheduled before gate/status refresh completes | renderer startup timing | effect cleanup can clear the pending timer and the UI stays stuck in missing-runtime `idle` state | keep the delayed timer alive across refresh-driven re-renders and set the one-shot latch only when dispatch begins |
| YouTube returns 403 while non-YouTube works | route-specific runtime behavior | YouTube media fetch fails after extraction | verify `--js-runtimes` arg shape and attach extension cookies when available |
| injected YouTube default path uses bare yt-dlp with no `player_client` extractor args | initial public-video resolve | first attempt frequently fails and total wait time regresses because runtime burns one full failed parse before fallback | keep the default light mode on `youtube:player_client=android,web` |
| every injected/current-item YouTube run forces extended mode just because `pageUrl` exists | initial public-video resolve | public videos pay heavy extractor latency even when no fallback is required | keep page-context-only requests on light mode unless `forceExtended` or cookies require otherwise |
| extension cookie temp file is created relative to `process.cwd()` in a packaged macOS app | app-managed YouTube download startup | writing `<trace>-cookies.txt` fails with `EROFS` before yt-dlp starts | write cookie temp files under `tmpdir()` and clean them up after the run |
| Windows ffmpeg/ffprobe launches use default console flags | AE-friendly post-processing runtime | transient black console window appears during normalization/probing | apply hidden-window flags on Windows CLI child launches |
| stale `.part` / `.ytdl` resume state exists | packaged Bilibili/generic yt-dlp download runtime | retry can fail with HTTP 416 on one machine but not another | clean temp artifacts and retry once without resume support |

### 5. Good / Base / Bad Cases

- Good:
  - `npm run runtime:ensure:python` prepares the official bundled Python runtime for the active package target.
  - `node ./scripts/smoke-python-runtime.mjs` passes and proves `venv`, `pip`, `sqlite3`, and `ssl` are usable from the bundled runtime.
  - `checkYtdlpVersion(...)` reports managed `yt-dlp` plus bundled Python metadata.
  - Windows portable ZIP contains helper executables only under `binaries/`.
  - On Windows, `highest` downloads, YouTube cookie-free probes, and `gallery-dl` runs complete without flashing transient console windows.
  - A clean config directory bootstraps `ffmpeg` into `app_config_dir/runtimes/ffmpeg/<target>/`, and Windows packaged builds can merge yt-dlp split streams without any system-installed ffmpeg.
  - The same managed yt-dlp runtime behaves identically on two Windows machines even if one host has custom yt-dlp config files installed.
  - A prior interrupted Bilibili `highest` download recovers automatically on the next attempt instead of surfacing raw HTTP 416 to the user.
- Base:
  - `yt-dlp` route works for generic platforms while direct path handles Douyin/Xiaohongshu CDN URLs.
- Bad:
  - Bundled Python is missing from packaged resources.
  - Update/download behavior depends on a user-installed Python or shell PATH state.
  - Windows-only crate imports break non-Windows compilation.
  - Download behavior depends on developer machine `PATH` state because managed `ffmpeg` bootstrap never runs.

### 6. Tests Required (with assertion points)

- Build assertions:
  - `npm run build` succeeds.
  - `npm run runtime:ensure:python` succeeds.
- Runtime assertions:
  - `npm run runtime:smoke:python` exits 0 on the host target.
  - `node ./scripts/smoke-python-runtime.mjs --mac zip` fails clearly on a Windows host instead of executing foreign-target Python; use `node ./scripts/ensure-python-runtime.mjs --mac zip` for cross-target preparation.
  - `npm run runtime:smoke:downloaders` exits 0 and verifies fresh per-tool venv creation plus pinned versions for `yt-dlp`, `gallery-dl`, and `douyin-dl`.
  - `npm run runtime:smoke:downloaders` also exercises local HTTP fixture downloads for managed `yt-dlp` and `gallery-dl`, proving those venv entrypoints can produce output files without relying on external sites.
  - With a valid Douyin session cookies file, `npm run runtime:smoke:douyin-session -- <cookies-file> [douyin-url]` exits 0 and verifies the managed `douyin-dl` runtime can download a non-empty media artifact through the same app runtime execution path with `browser_fallback.enabled=false`.
  - `node ./scripts/ensure-capability-probe-runtime.mjs --tool yt-dlp` exits 0.
  - `npm run package:win:dir` and `npm run package:portable:skip-build` succeed on Windows host verification.
  - Packaged Electron resources include `desktop-assets/binaries/python-<target>` for the current target.
  - On macOS package verification, `npm run runtime:verify:macos-package -- <arm64|x64> require-execution` must pass against the built `.app` bundle. This verifies the `.app/Contents/Resources/app/desktop-assets/binaries/python-<target>` layout, Python runtime manifest provenance, compiled `managedPythonPackageManifest.mjs`, packaged `main.mjs` resource-dir wiring, absence of old standalone downloader assets, and packaged Python venv/pip execution on the matching host architecture.
  - Launch the packaged/main app with missing managed runtimes and assert the first visible window appears before any managed-runtime download starts.
  - Launch the app into compact icon mode with missing managed runtimes and assert startup bootstrap waits until the expanded main window is visible instead of forcing an unsolicited first-launch expand.
  - With missing managed runtimes on Electron/macOS startup, allow the initial status/gate refresh to settle and assert the delayed startup bootstrap still transitions from `idle` to `checking`/`downloading` without requiring a manual retry click.
  - Open Settings with missing runtimes and assert status refresh does not start a managed-runtime bootstrap by itself.
  - On a clean config directory without managed runtimes, startup or first yt-dlp JS-runtime use bootstraps `deno` into `app_config_dir/runtimes/deno/<target>/`.
  - On a clean config directory without managed runtimes, startup or first media-tool use bootstraps `ffmpeg` into `app_config_dir/runtimes/ffmpeg/<target>/` with both `ffmpeg` and `ffprobe`.
  - On a Windows portable package without external tooling installed, a merged yt-dlp download produces a single final file and no `.f*` residue.
  - On Windows, a `highest` download path that triggers extra yt-dlp probe/retry work still completes without transient console windows.
  - Trigger a public injected YouTube download with no cookies and assert the first yt-dlp attempt includes `youtube:player_client=android,web` rather than starting in extended mode.
  - Force a retryable YouTube extractor failure and assert runtime emits a retry activity token before the second extended attempt.
  - On Windows with `AE-Friendly Format` enabled, ffmpeg-backed post-processing completes without showing a transient console window.
  - When yt-dlp reports `has already been downloaded`, the app still resolves the existing final file path and emits success instead of `E_OUTPUT_NORMALIZATION_FAILED`.
  - Inspect the Windows portable ZIP and assert bundled Python remains under packaged resources while `ffmpeg` is absent from the artifact because it now bootstraps on first use.

### 7. Wrong vs Correct

#### Wrong

```ts
return childProcess.spawn("python3", ["-m", "venv", targetDir]);
```

```ts
return path.join(resourceDir, "binaries", "yt-dlp.exe");
```

#### Correct

```ts
const bundledPythonPath = resolveBundledPythonRuntime(environment).executable;
await runUtilityCommand(bundledPythonPath, ["-m", "venv", targetDir]);
```

```ts
const bundledPython = resolveBundledPythonRuntime(environment);
const ytDlp = resolveManagedYtDlpRuntimePaths(environment).entrypoint;
```

---

## Scenario: Electron Download Runtime Core

### 1. Scope / Trigger

- Trigger: any change touching the Electron-owned runtime package under `src/electron-runtime/`, shared download payload types in `src/types/videoRuntime.ts`, or the TS/node toolchain needed to compile those files.
- Why this needs code-spec depth: the migration introduces a second native runtime implementation path (`Node/Electron`) that must preserve the same queue, progress, and runtime-dependency contracts currently consumed by the renderer.

### 2. Signatures

- Runtime factory:
  - `createElectronDownloadRuntime(options: ElectronDownloadRuntimeOptions) -> ElectronDownloadRuntime`
- Core methods:
  - `getRuntimeDependencyStatus() -> RuntimeDependencyStatusSnapshot`
  - `getRuntimeDependencyGateState() -> RuntimeDependencyGateStatePayload`
  - `refreshRuntimeDependencyGateState() -> RuntimeDependencyGateStatePayload`
  - `startRuntimeDependencyBootstrap(reason?: string) -> Promise<RuntimeDependencyGateStatePayload>`
  - `queueVideoDownload(request: QueuedVideoDownloadRequest) -> Promise<QueuedVideoDownloadAck>`
  - `cancelDownload(traceId: string) -> Promise<bool>`
- Core files:
  - `src/electron-runtime/service.ts`
  - `src/electron-runtime/runtimePaths.ts`
  - `src/electron-runtime/processRunner.ts`
  - `src/electron-runtime/directDownload.ts`
  - `src/electron-runtime/galleryDlDownload.ts`
  - `src/electron-runtime/ytDlpDownload.ts`
  - `src/types/videoRuntime.ts`

### 3. Contracts

- Electron runtime ownership:
  - The Electron runtime package is intentionally framework-light: no direct `electron` imports, no Tauri imports, and no renderer globals.
  - Main/preload integration may wrap it later, but queueing, runtime-status inspection, and CLI execution contracts live in `src/electron-runtime/`.
- Hidden CLI spawning:
  - Electron-managed CLI processes must use Node `spawn(..., { windowsHide: true })` through the shared helper in `processRunner.ts`.
  - Once the Electron shell is wired to this runtime package, `flowselect-cli-proxy` is no longer the steady-state hidden-process strategy.
  - Do not reintroduce per-tool spawn styles; yt-dlp and gallery-dl launches should share the same hidden-window process path.
  - When `runStreamingCommand(...)` attaches an `AbortSignal` listener, it must remove the listener after child-process settlement so completed tasks do not retain task abort controllers or stream handlers.
- Runtime path resolution:
  - `yt-dlp` remains a bundled runtime resolved from `src-tauri/binaries/` in dev and `binaries/` in packaged layouts.
  - `gallery-dl` remains a bundled runtime resolved from `desktop-assets/binaries/` in dev and `binaries/` in packaged layouts.
  - Local Electron entrypoints that can exercise downloader flows (`npm run dev`, `npm run electron:dev`, `npm run build`, packaging scripts) must run the unified official-downloader ensure flow before launch/package so missing or non-official bundled runtimes fail early instead of surfacing as `spawn ... ENOENT` during a download task.
  - The official bundled-Python ensure flow writes `desktop-assets/binaries/.official-python-runtimes.json`; a stale or hand-dropped `python-<target>` directory without that manifest entry does not satisfy the repo-managed supply-chain contract.
  - `ffmpeg`, `ffprobe`, and `deno` remain managed runtimes resolved from `<configDir>/runtimes/<component>/<target>/...`.
  - On Windows, managed `ffmpeg` and `deno` use `real/` for the actual console binaries.
- Queue and event compatibility:
  - `queueVideoDownload(...)` must preserve `QueuedVideoDownloadAck { accepted, traceId }`.
  - Queue state remains emitted through `video-queue-count` and `video-queue-detail`.
  - Download progress remains emitted through `video-download-progress`.
  - Terminal download settlement remains emitted through `video-download-complete` for both success and failure.
  - Indeterminate `gallery-dl` tasks must not remain renderer-visible `preparing` for the whole run just because the tool does not expose byte-accurate progress.
  - `gallery-dl` runs must emit an early `video-download-progress` payload with `stage: "downloading"` once the child process has started, even if `percent` remains `-1`.
  - For `gallery-dl`, the `speed` field may carry i18n-friendly activity tokens such as `activity:galleryDl.resolvingMedia`, `activity:galleryDl.collectingMetadata`, or `activity:galleryDl.savingFile`; renderer status surfaces should translate those tokens as activity text instead of literal transfer-rate values.
- Executor routing:
  - Direct media URLs (`*.mp4`, `*.mov`, `*.m4v`) use the direct-download executor.
  - The direct-download executor must not return success until the output file stream has accepted all response chunks and the writer has finished/closed.
  - Direct-download stream open/write/flush errors must reject the task, clean the partial output file when present, and let the runtime emit a failed terminal `video-download-complete` event.
  - Provider planning may choose `gallery-dl` as the primary engine for Pinterest-style gallery/image-heavy inputs.
  - Remaining URLs default to the orchestrated `yt-dlp` / `gallery-dl` / `direct` engine ladder rather than site-hardcoded executor branching.
- Toolchain contract:
  - Because `src/electron-runtime/` imports Node built-ins from TypeScript, the repo must carry `@types/node` and include Node types in `tsconfig.json`.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Electron runtime TS files compile without Node types | `npm run type-check` | Node built-ins resolve and NodeJS namespace types are available | Keep `@types/node` in devDependencies and `types: ["node", "vite/client"]` in `tsconfig.json` |
| Electron runtime uses ad hoc spawn flags per downloader | code review / Windows runtime | one route may flash consoles while another stays hidden | route all CLI execution through `processRunner.ts` |
| yt-dlp path lookup prefers a missing dev candidate over an existing packaged candidate | runtime path resolution | packaged app would report a false missing-runtime state | resolve the first existing bundled candidate and only fall back to the first path for error reporting |
| managed ffmpeg status marks ready when only one of `ffmpeg` / `ffprobe` exists | runtime dependency status | media-tool readiness is overstated | require all expected files for the component before returning `state="ready"` |
| pending cancel path only removes the queue row | queue cancel command | renderer can get stuck waiting for terminal settlement | emit `video-download-complete` with a cancelled failure payload when a pending task is removed |
| active cancel path kills the child but leaves queue counts stale | active task cancel | queue badge/progress state lingers | remove active task on settlement and emit refreshed queue count/detail payloads |
| child process completes normally after an abort listener was attached | long-running desktop session | completed tasks retain abort listener closures and can accumulate memory/listener references | remove the exact abort listener in a `finally` path after `close` handling |
| `gallery-dl` emits little or no machine-readable progress detail for a task | renderer progress state | main window can look stuck on `Preparing...` until the task suddenly completes | emit an early indeterminate `downloading` event and map recognized tool lines to short activity labels |
| direct-download output stream cannot open/write/flush | `src/electron-runtime/directDownload.ts` | task rejects and cleans the partial output instead of reporting success before bytes are durable | wait for write callbacks and writer `finished(...)` before returning success |

### 5. Good / Base / Bad Cases

- Good:
  - The Electron runtime package type-checks under the main repo TS config, resolves the current target runtime paths, and passes queue/progress tests without importing `electron`.
  - On Windows, yt-dlp and gallery-dl execution both go through the shared hidden-window spawn helper.
  - Enqueueing three tasks with `maxConcurrent=2` yields two active tasks and one pending task until the first active task settles.
  - A Pinterest `gallery-dl` download transitions from `Preparing...` to a translated activity label backed by runtime tokens such as `activity:galleryDl.resolvingMedia` before completion, even when no numeric percent is available.
- Base:
  - A Pinterest page without a usable direct hint resolves to `gallery-dl`; missing bundled gallery-dl should be surfaced as a runtime dependency failure instead of silently falling through to `yt-dlp`.
  - Runtime dependency bootstrap may be injected by the host integration later; the runtime core keeps the gate-state contract even before the installer/download implementation is attached.
- Bad:
  - A new Electron executor imports `electron` or renderer globals directly.
  - A runtime-status helper reports managed tools as ready when only partial files exist.
  - The Electron runtime silently depends on `flowselect-cli-proxy` even after hidden CLI ownership moved to Node.

### 6. Tests Required (with assertion points)

- `npm run type-check`
  - Node-based runtime files compile under the repo TS config.
- `npm run lint`
  - The new runtime package stays within the repo lint baseline.
- `npm run test`
  - `src/electron-runtime/runtimePaths.test.ts` validates bundled and managed runtime status resolution.
  - `src/electron-runtime/ytDlpProgress.test.ts` validates yt-dlp progress normalization.
  - `src/electron-runtime/galleryDlDownload.test.ts` validates early indeterminate `downloading` events and tokenized `gallery-dl` activity labels.
  - `src/electron-runtime/directDownload.test.ts` validates direct-download referer handling, stream read error preservation, and output-stream write/flush failure rejection.
  - `src/electron-runtime/processRunner.test.ts` validates stream line handling, pre-aborted signals, and abort-listener cleanup after child exit.
  - `src/electron-runtime/service.test.ts` validates queue concurrency and pending cancellation semantics.

### 7. Wrong vs Correct

#### Wrong

```ts
spawn(command, args, {
  shell: true,
});
```

```ts
return {
  ffmpeg: existsSync(ffmpegPath) ? ready(ffmpegPath) : missing("ffmpeg missing"),
  // ffprobe not checked
};
```

#### Correct

```ts
spawn(command, args, {
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
```

```ts
const allExist = candidates.every((candidate) => existsSync(candidate));
if (allExist) {
  return readyStatus(candidates[0], "managed");
}
return missingStatus(`Missing managed ffmpeg runtime. Expected ${JSON.stringify(candidates)}`);
```
