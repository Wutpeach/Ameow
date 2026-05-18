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
- `electron/main.mts` is an ESM entrypoint; top-level controller construction must not read `const`/`let` bindings declared later in the file. Use function declarations for hoisted adapters, move construction after dependencies are initialized, or pass lazy callbacks that dereference later bindings only when invoked.
- BrowserWindows that expect desktop renderer behavior must keep `preload`, `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: false` aligned with the current preload architecture. If that architecture changes, update this spec in the same task.
- Renderer bootstrap must fail fast when Electron mode is detected but `window.ameow` is missing. Do not silently fall back to plain-web routing inside a desktop window.
- App events moving from Electron main to renderer must use per-event channels (`ameow:event:<event>`) instead of one shared multiplexed event channel.
- Preserve current command names, event names, JSON payload keys, window labels, and extension WebSocket actions unless this file changes in the same task.
- Preserve `settings.json` compatibility and the browser-extension loopback endpoint `127.0.0.1:39527`.

---

## Scenario: Electron Foundation Replacement Contract

### 1. Scope / Trigger

- Trigger: Any task that ports Ameow runtime ownership from Tauri/Rust into Electron main + preload.
- Why this needs code-spec depth: This migration crosses renderer, native runtime, browser extension, config persistence, and release packaging boundaries. Small drift at any one boundary can silently break the app even if local compilation still passes.

### 2. Signatures

Window labels:

```ts
type AmeowWindowLabel = "main" | "settings" | "context-menu" | "ui-lab";
```

Fixed runtime endpoints / paths:

```ts
type AmeowWsEndpoint = "ws://127.0.0.1:39527";
type AmeowConfigFileName = "settings.json";
```

Preload source-of-truth type:

```ts
type AmeowElectronBridge =
  import("../../src/types/electronBridge").AmeowElectronBridge;
```

Electron-only IPC channels introduced by the preload bridge:

```ts
type AmeowEventChannel = `ameow:event:${AmeowAppEvent}`;
type AmeowCurrentWindowPositionChannel = "ameow:current-window:set-position";
```

Startup-mode contract:

```ts
type AmeowStartupWindowMode = "compact" | "full";
```

Required preload surface summary:

```ts
interface AmeowElectronBridge {
  commands: {
    invoke<TResult>(
      command: AmeowRendererCommand,
      payload?: Record<string, unknown>,
    ): Promise<TResult>;
  };
  events: {
    on<TPayload>(
      event: AmeowAppEvent,
      listener: (event: { payload: TPayload }) => void,
    ): Promise<() => void>;
    emit<TPayload>(event: AmeowRendererEvent, payload: TPayload): Promise<void>;
  };
  windows: {
    has(label: AmeowWindowLabel): Promise<boolean>;
    focus(label: AmeowWindowLabel): Promise<void>;
    close(label: "settings" | "context-menu" | "ui-lab"): Promise<void>;
    openSettings(options: AmeowSecondaryWindowOptions): Promise<void>;
    openContextMenu(options: AmeowContextMenuWindowOptions): Promise<void>;
    openUiLab(options: AmeowSecondaryWindowOptions): Promise<void>;
  };
  currentWindow: AmeowCurrentWindowApi;
  system: AmeowSystemApi;
  clipboard: {
    readImage(): Promise<AmeowClipboardImage | null>;
  };
  updater: {
    check(): Promise<AppUpdateInfo | null>;
    downloadAndInstall(): Promise<void>;
  };
}
```

Current-window surface addition:

```ts
interface AmeowCurrentWindowApi {
  startupWindowMode(): AmeowStartupWindowMode;
}
```

Typed bounds-animation contract:

```ts
interface AmeowCurrentWindowApi {
  animateBounds(
    bounds: AmeowBounds,
    options?: { durationMs?: number; transitionToken?: number },
  ): Promise<{ transitionToken: number | null }>;
}
```

Current-window interaction-mode contract:

```ts
type AmeowCurrentWindowInteractionMode = "interactive" | "compact-passthrough";

interface AmeowCurrentWindowApi {
  setInteractionMode(mode: AmeowCurrentWindowInteractionMode): void;
}
```

Current renderer-facing command names that must remain stable through the preload bridge:

```ts
type AmeowRendererCommand =
  | "begin_open_output_folder_from_context_menu"
  | "begin_pick_output_folder_from_context_menu"
  | "broadcast_theme"
  | "cancel_download"
  | "cancel_transcode"
  | "check_ytdlp_version"
  | "dev_ui_lab_apply_scenario"
  | "download_image"
  | "export_support_log"
  | "get_autostart"
  | "get_clipboard_files"
  | "get_config"
  | "get_current_shortcut"
  | "get_gallery_dl_info"
  | "get_runtime_dependency_gate_state"
  | "get_runtime_dependency_status"
  | "open_current_output_folder"
  | "open_folder"
  | "process_files"
  | "queue_pasted_video_download"
  | "queue_video_download"
  | "refresh_runtime_dependency_gate_state"
  | "resolve_xiaohongshu_drag_media"
  | "register_shortcut"
  | "remove_transcode"
  | "reset_rename_counter"
  | "save_config"
  | "save_data_url"
  | "set_autostart"
  | "set_window_position"
  | "set_window_size"
  | "start_runtime_dependency_bootstrap";
```

Current extension request/response envelope:

```json
{
  "action": "video_selected_v2",
  "data": {
    "requestId": "req-123"
  }
}
```

```json
{
  "success": true,
  "message": "Download queued",
  "data": {
    "requestId": "req-123"
  }
}
```

Extension injection-debug config WS actions:

```json
{
  "action": "get_extension_debug_config",
  "data": {
    "requestId": "req-123"
  }
}
```

```json
{
  "success": true,
  "message": null,
  "data": {
    "action": "extension_debug_config_info",
    "enabled": true,
    "requestId": "req-123"
  }
}
```

```json
{
  "action": "extension_debug_config_changed",
  "data": {
    "enabled": true
  }
}
```

### 3. Contracts

#### Replacement Matrix

| Current Tauri/runtime surface | Current owner | Electron replacement | Contract |
|------------------------------|---------------|----------------------|----------|
| `@tauri-apps/api/core.invoke` | Renderer -> Rust command | `window.ameow.commands.invoke` | Keep command names + payload keys stable. |
| `@tauri-apps/api/event.listen` / `emit` | Renderer/global event bus | `window.ameow.events.on` / `emit` | Keep event names + payload shapes stable. |
| `WebviewWindow.getByLabel(...)` | Renderer | `window.ameow.windows.has` / `focus` | Keep labels `main`, `settings`, `context-menu`. |
| `new WebviewWindow("settings", ...)` | Renderer | `window.ameow.windows.openSettings(...)` | BrowserWindow creation is main-owned only. |
| `new WebviewWindow("context-menu", ...)` | Renderer | `window.ameow.windows.openContextMenu(...)` | BrowserWindow creation is main-owned only. |

#### Folder-Open Command Contract

- Commands:
  - `open_current_output_folder`
  - `open_folder`
- Electron API boundary:
  - `shell.openPath(path)` returns an empty string on success and a non-empty error string on failure.

## Scenario: Electron Download Command Bridge Contract

### 1. Scope / Trigger

- Trigger: Any task that changes Electron download command dispatch, browser-extension pasted-video resolution, or `src/electron-runtime` queue ownership.
- Why this needs code-spec depth: Download requests cross renderer IPC, extension WebSocket, Electron main, runtime dependency bootstrap, queue state, progress events, and terminal completion events.

### 2. Signatures

Renderer commands:

```ts
type ElectronDownloadCommand =
  | "queue_video_download"
  | "queue_pasted_video_download"
  | "cancel_download"
  | "cancel_transcode"
  | "retry_transcode"
  | "remove_transcode"
  | "get_runtime_dependency_status"
  | "get_runtime_dependency_gate_state"
  | "refresh_runtime_dependency_gate_state"
  | "start_runtime_dependency_bootstrap"
  | "check_ytdlp_version"
  | "get_gallery_dl_info";
```

Pasted-video extension request:

```json
{
  "action": "resolve_pasted_video_selection",
  "data": {
    "requestId": "pasted-video-selection-1",
    "url": "https://example.com/watch",
    "pageUrl": "https://example.com/watch",
    "siteHint": "youtube"
  }
}
```

Pasted-video extension result:

```json
{
  "action": "pasted_video_selection_result",
  "data": {
    "correlationRequestId": "pasted-video-selection-1",
    "success": true,
    "url": "https://example.com/watch",
    "pageUrl": "https://example.com/watch",
    "videoUrl": "https://cdn.example/video.mp4",
    "videoCandidates": [],
    "cookies": "# Netscape HTTP Cookie File",
    "selectionScope": "current_item",
    "ytdlpQualityPreference": "balanced",
    "extensionData": {
      "youtube": {
        "source": "pasted"
      }
    }
  }
}
```

### 3. Contracts

- `electron/main.mts` owns IPC/WS entrypoints but must not own a separate video download queue, `yt-dlp` spawn runner, or `yt-dlp` progress parser.
- `electron/videoDownloadCommands.mts` is the Electron command bridge for download commands.
- `src/electron-runtime/service.ts` remains the only owner of video queue state, queue concurrency, cancellation, progress emission, terminal `video-download-complete`, telemetry, and transcode follow-up.
- `electron/extensionRequestBridge.mts` owns pasted-video extension request correlation, timeout cleanup, result normalization, and shutdown rejection.
- `queue_pasted_video_download` may use extension-assisted pre-resolution, but the resolved payload must be enqueued through the same runtime queue path as `queue_video_download`.
- `video_selected_v2` WebSocket requests must enqueue through the Electron download command bridge, not through a second queue implementation.
- Managed runtime bootstrap invoked by `src/electron-runtime` must wait for the managed runtime install/check path to finish before returning a refreshed runtime dependency snapshot.

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| `queue_video_download` receives a valid HTTP(S) URL | Normalize payload and call `runtime.queueVideoDownload()` |
| `queue_video_download` receives a missing/invalid URL | Reject before queueing |
| `queue_pasted_video_download` extension resolution succeeds with a URL | Merge extension payload and enqueue through runtime |
| `queue_pasted_video_download` extension disconnected, times out, fails, or returns no URL | Log fallback and enqueue the original URL through runtime |
| `pasted_video_selection_result` missing `correlationRequestId` | Return failed WS ack with `missing_correlation_request_id` |
| `pasted_video_selection_result` has unknown correlation id | Return failed WS ack with `unknown_correlation_request` |
| App is quitting with pending pasted-video requests | Reject pending bridge promises and clear timers |
| Active runtime download is cancelled | Runtime emits terminal `video-download-complete` failure/cancel payload |

### 5. Good / Base / Bad Cases

- Good: YouTube pasted URL asks the extension for page context, receives a resolved URL/metadata payload without cookies, and enqueues through `src/electron-runtime`.
- Base: Generic pasted URL has no extension-assisted site hint and enqueues directly through `src/electron-runtime`.
- Bad: Reintroducing `activeVideoDownloads`, `pendingVideoDownloads`, `child_process.spawn("yt-dlp", ...)`, or `--progress-template` handling in `electron/main.mts`.

### 6. Tests Required

- `electron/extensionRequestBridge.test.mts`: request broadcast, correlation resolution, unknown/missing correlation failure, timeout/shutdown cleanup.
- `electron/videoDownloadCommands.test.mts`: normal queue dispatch, pasted assisted success, pasted assisted fallback, cancellation dispatch.
- `src/electron-runtime/commandRouter.test.ts`: payload normalization and runtime queue invocation stay stable.
- Full pre-commit verification: `npm test`, `npm run type-check`, `npm run lint`, and `git diff --check`.

### 7. Wrong vs Correct

#### Wrong

```ts
// electron/main.mts
pendingVideoDownloads.push(task);
spawn(ytdlpPath, ["--progress-template", "..."]);
```

#### Correct

```ts
// electron/main.mts
return getVideoDownloadCommandBridge().invoke("queue_video_download", payload);
```

## Scenario: Release-Pinned Managed Downloader Runtime Contract

## Scenario: Electron Managed Runtime Bootstrap Module Contract

### 1. Scope / Trigger

- Trigger: Any task that changes managed runtime path resolution, pinned runtime downloads, checksum verification, runtime install steps, or the Electron runtime dependency gate bootstrap callback path.
- Why this needs code-spec depth: The flow crosses Electron main, managed runtime installers, runtime status inspection, renderer recovery UI, network download behavior, filesystem replacement, and release-pinned checksum policy.

### 2. Signatures

Bootstrap module:

```ts
// electron/managedRuntimeBootstrap.mts
type ManagedRuntimeStage = "checking" | "downloading" | "installing" | "verifying";

type ManagedRuntimeActivity = {
  component: RuntimeDependencyManagedComponent;
  stage: ManagedRuntimeStage;
  downloadedBytes?: number | null;
  totalBytes?: number | null;
};

type ManagedRuntimeBootstrapOptions = {
  configDir: string;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  fetch: typeof fetch;
  log?(message: string): void;
  onActivity?(activity: ManagedRuntimeActivity): void | Promise<void>;
  now?(): number;
};

function currentManagedRuntimeTarget(
  platform?: NodeJS.Platform,
  arch?: NodeJS.Architecture,
): string;

function ensureManagedYtDlpRuntimeReady(
  trigger: string,
  options: ManagedRuntimeBootstrapOptions & { forceReinstall?: boolean },
): Promise<string>;

function ensureManagedGalleryDlRuntimeReady(
  trigger: string,
  options: ManagedRuntimeBootstrapOptions & { forceReinstall?: boolean },
): Promise<string>;

function ensureManagedFfmpegRuntimeReady(
  trigger: string,
  options: ManagedRuntimeBootstrapOptions,
): Promise<string>;

function ensureManagedDenoRuntimeReady(
  trigger: string,
  options: ManagedRuntimeBootstrapOptions,
): Promise<string>;
```

Electron main adapter:

```ts
// electron/main.mts
function buildManagedRuntimeBootstrapOptions(
  missingComponents?: RuntimeDependencyManagedComponent[],
): ManagedRuntimeBootstrapOptions;
```

### 3. Contracts

- `electron/main.mts` owns runtime dependency gate state, UI Lab overrides, IPC command entrypoints, log routing, and event emission.
- `electron/managedRuntimeBootstrap.mts` owns managed runtime target/path helpers, pinned downloader release metadata, Deno/FFmpeg artifact specs, release asset lookup, runtime asset download, checksum verification, archive extraction, executable chmod, file replacement, and downloader latest-cache writing.
- Bootstrap functions must receive Electron-specific dependencies through `ManagedRuntimeBootstrapOptions`; they must not import `app`, `BrowserWindow`, IPC handlers, or renderer event emitters.
- `buildManagedRuntimeBootstrapOptions(...)` must pass `configDir: getUserDataDir()`, `platform: process.platform`, `arch: process.arch`, `fetch: fetchWithDesktopSession`, `logInfo`, and an `onActivity` adapter into `updateRuntimeDependencyGateDownloadActivity(...)`.
- `ensureMissingManagedRuntimesReady(...)` must call managed bootstrap functions in `MANAGED_RUNTIME_BOOTSTRAP_ORDER`-compatible dependency order: `ytDlp`, `galleryDl`, `ffmpeg`, then `deno`, with a fresh runtime status snapshot between components.
- Runtime path helpers in `managedRuntimeBootstrap.mts` must stay consistent with `src/electron-runtime/runtimePaths.ts` so status inspection and installer output point at the same files.
- `resolvePinnedDownloaderRelease(...)` must throw for unsupported downloader tool ids instead of returning `undefined`.
- `replaceFile(...)` must preserve the old Electron main algorithm: try `unlink(target)`, then `rename(temp, target)`, and fall back to `copyFile(temp, target)` plus cleanup.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Existing managed runtime binary exists | `ensureManaged*RuntimeReady(...)` | Return existing path without downloading | Keep gate state unchanged except later refreshed status |
| Missing Deno/FFmpeg runtime | `select*RuntimeArtifactSpec(...)` + download/extract | Download pinned archive, verify size/checksum, extract executable(s), chmod on non-Windows, replace final file | Surface activity stages through `onActivity` |
| Missing Windows `yt-dlp` / `gallery-dl` | pinned release lookup | Fetch pinned GitHub release, select platform asset, verify checksum, install release binary | Write latest-cache JSON after successful replace |
| Missing macOS `yt-dlp` | `ensureManagedYtDlpRuntimeReady(...)` | Delegate to `ensureManagedYtDlpReady(...)` Python package bootstrap with same target/version | Report install stages through `onActivity` |
| Unsupported platform/arch | `currentManagedRuntimeTarget(...)` | Throw unsupported managed runtime target error | Gate surfaces bootstrap failure |
| Unsupported downloader tool id | `resolvePinnedDownloaderRelease(...)` | Throw `Unsupported pinned downloader tool: <id>` | Do not continue with undefined metadata |
| Download stalls or all fallback URLs fail | `downloadRuntimeAssetWithFallbacks(...)` | Remove temp file and throw `Failed to download managed <component> runtime: ...` | Gate remains recoverable for retry |
| Checksum or size mismatch | `verifyDownloadedRuntimeAsset(...)` | Throw mismatch error before replacing final binary | Leave existing final binary untouched |

### 5. Good / Base / Bad Cases

- Good: `electron/main.mts` creates options once per component install and the bootstrap module reports `downloading`, `verifying`, and `installing` through `onActivity`.
- Base: all runtimes already exist, so bootstrap functions return paths and no network request is made.
- Bad: importing `app.getPath(...)` or `updateRuntimeDependencyGateDownloadActivity(...)` inside `managedRuntimeBootstrap.mts`, which would couple installer logic back to Electron main state.
- Bad: changing `managedYtDlpPaths(...)` without updating `runtimePaths.ts`, causing status inspection to report missing while installer wrote a different path.

## Scenario: Electron Global Proxy URL Contract

### 1. Scope / Trigger

- Trigger: Any task that changes desktop-side proxy behavior for bootstrap, update checks, or Electron-owned fetch requests.
- Why this needs code-spec depth: Proxy handling crosses persisted config, Electron session wiring, managed runtime bootstrap, update checks, and desktop-side downloads.

### 2. Signatures

Persisted config keys:

```ts
type DesktopProxyConfigKeys =
  | "globalProxyEnabled"
  | "globalProxyUrl";
```

Validation helper boundary:

```ts
type GlobalProxyValidationErrorCode =
  | "missing_url"
  | "invalid_url"
  | "unsupported_protocol"
  | "auth_unsupported"
  | "path_unsupported";
```

Electron main ownership:

```ts
async function applyConfiguredDesktopProxy(
  config?: Record<string, unknown> | null,
): Promise<void>
```

### 3. Contracts

- The first shipped proxy setting is global-only. It applies one proxy URL to the desktop network session used by Electron-owned fetch paths.
- Supported proxy URL schemes are:
  - `http://`
  - `https://`
  - `socks4://`
  - `socks5://`
- The first version must reject:
  - embedded username/password auth
  - PAC URLs / PAC mode
  - path/query/hash fragments on the proxy URL
  - per-feature proxy routing
- `fetchWithDesktopSession(...)` remains the shared network entrypoint for managed runtime bootstrap, update checks, and other Electron-owned desktop fetches.
- Proxy configuration is applied through `session.defaultSession.setProxy(...)`, not by rewriting each fetch call individually.
- When custom proxy is disabled, Electron must return to `mode: "system"` proxy behavior.
- When custom proxy is enabled and valid, Electron must use `mode: "fixed_servers"` with the normalized proxy URL and keep local bypass rules for `localhost`, `127.0.0.1`, and `::1`.
- Saving config through `save_config` must re-apply proxy settings immediately so users do not need manual JSON edits or app restarts just to switch ports.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| `globalProxyEnabled !== true` | config validation | Proxy is treated as disabled | Apply `mode: "system"` |
| Enabled but empty URL | config validation | Reject save/apply | Surface `missing_url` |
| URL missing scheme or malformed | config validation | Reject save/apply | Surface `invalid_url` |
| URL uses unsupported protocol | config validation | Reject save/apply | Surface `unsupported_protocol` |
| URL embeds auth credentials | config validation | Reject save/apply | Surface `auth_unsupported` |
| URL includes path/query/hash | config validation | Reject save/apply | Surface `path_unsupported` |
| Valid proxy URL | Electron session apply | Desktop session uses fixed proxy servers | Continue shared session-backed fetch flow |

### 5. Good / Base / Bad Cases

- Good: user enables custom proxy with `http://127.0.0.1:7897`, saves settings, and managed runtime bootstrap / update checks use the configured proxy immediately.
- Base: user leaves custom proxy disabled, so Electron continues using ambient system/environment proxy behavior.
- Bad: one feature uses the configured proxy while another still bypasses it with direct `globalThis.fetch`.
- Bad: a settings save accepts `http://user:pass@127.0.0.1:7897` even though auth is not supported in this first version.

### 6. Tests Required

- `src/config/globalProxy.test.ts`
  - valid URL normalization
  - invalid/missing/unsupported URL rejection
  - auth/path rejection
- `electron/configStore.test.mts`
  - arbitrary proxy config keys persist through config store reads
- `npm run type-check`
  - main-process and settings-page wiring compile
- `npm run lint`
  - settings page remains lint-clean

### 7. Wrong vs Correct

#### Wrong

```ts
await fetch(url, init);
```

#### Correct

```ts
await fetchWithDesktopSession(url, init);
```

Why wrong:
- A direct fetch path can silently bypass the configured Electron desktop proxy and reintroduce environment-specific network failures.

### 6. Tests Required

- `electron/managedRuntimeBootstrap.test.mts`: target/path resolution, pinned metadata, unsupported tool guard, asset selection, Deno/FFmpeg artifact specs, cache writing, and file replacement behavior when touched.
- `src/electron-runtime/runtimePaths.test.ts`: managed runtime status paths remain aligned with bootstrap install paths.
- `npx tsc -p tsconfig.electron.json --noEmit`: validates `.mts` imports and new module types despite `electron/main.mts` using `// @ts-nocheck`.
- Full pre-commit verification for this boundary: `npm test`, `npm run type-check`, `npm run lint`, and `git diff --check`.

### 7. Wrong vs Correct

#### Wrong

```ts
// electron/managedRuntimeBootstrap.mts
import { app } from "electron";

const configDir = app.getPath("userData");
await updateRuntimeDependencyGateDownloadActivity(...);
```

#### Correct

```ts
// electron/main.mts
function buildManagedRuntimeBootstrapOptions(missingComponents = []) {
  return {
    configDir: getUserDataDir(),
    platform: process.platform,
    arch: process.arch,
    fetch: fetchWithDesktopSession,
    onActivity(activity) {
      return updateRuntimeDependencyGateDownloadActivity(
        missingComponents,
        activity.component,
        activity.stage,
        activity.downloadedBytes ?? null,
        activity.totalBytes ?? null,
      );
    },
  };
}
```

### Design Decision: Internal CLI Engine Manifests

**Context**: Ameow borrows the useful part of `media-downloader`'s multi-engine model by centralizing static CLI engine knowledge, but engine selection still belongs to Ameow providers/orchestration.

**Decision**: Static CLI invocation data for internal engines lives in `src/electron-runtime/engineManifest.ts`. Runtime modules such as `ytDlpDownload.ts` and `galleryDlDownload.ts` may keep execution-specific behavior, progress parsing, retry policy, cleanup, and output normalization, but should not reintroduce duplicated static flags or format profiles.

**Contracts**:
- `yt-dlp` manifest owns config isolation (`--ignore-config`), base/progress/encoding flags, `after_move` print keys, YouTube light/extended extractor args, remote component args, retry activity token, and quality format profiles.
- `gallery-dl` manifest owns config isolation (`--config-ignore`), base metadata flags, output filename/directory flags, sidecar extensions, line-tail limit, and default resolving activity token.
- Manifests are internal and versioned with the app; they are not user-installable engine plugins.
- Engine manifests must not own provider routing, browser-extension payload compatibility, runtime dependency bootstrap, cancellation semantics, or terminal completion-event behavior.
- Command planning modules (`src/electron-runtime/ytDlpCommandPlan.ts`, `src/electron-runtime/galleryDlCommandPlan.ts`) own pure argument/output planning derived from manifests and execution context. Download runtime modules still own cookie temp-file lifecycle, process spawning, stdout/stderr progress parsing, retry policy, cleanup, and result normalization.
- Command planning validation failures must throw `InvalidCommandPlanError` from `src/electron-runtime/commandPlanErrors.ts`.
- Runtime downloaders must map expected `InvalidCommandPlanError` failures to `DownloadRuntimeError("E_INVALID_ENGINE_PLAN", ...)` before spawning a CLI or issuing a direct network request.
- Runtime downloaders must preserve existing `DownloadRuntimeError` instances after local cleanup so orchestrator fallback/classification logic can use the original `code` and `classification`.
- If `yt-dlp` exits successfully but does not report an `after_move:filepath`, `runYtDlpDownload(...)` must throw `DownloadRuntimeError("E_OUTPUT_NOT_FOUND", ...)`, not a plain `Error`.

**Tests Required**:
- Manifest tests must assert host-config isolation flags remain present.
- Existing runtime tests must continue asserting generated yt-dlp/gallery-dl command arguments for YouTube modes, cookies, output templates, and progress behavior.
- Command-plan tests must cover argument order, platform-specific YouTube JS runtime ordering, clip download section formatting/output stems, source URL validation, and sidecar classification.
- Runtime tests must assert invalid command plans do not spawn sidecars and surface `E_INVALID_ENGINE_PLAN`.
- Runtime tests must assert direct/yt-dlp paths preserve `DownloadRuntimeError` codes after cleanup.

#### Wrong

```ts
const args = ["--ignore-config", "--encoding", "utf-8", "--progress"];
```

#### Correct

```ts
const manifest = getCliEngineManifest("yt-dlp");
const args = [
  ...manifest.configIsolationArgs,
  ...manifest.encodingArgs,
  ...manifest.progressArgs,
];
```

```ts
try {
  commandPlan = createYtdlpCommandPlan(context);
} catch (error) {
  if (!(error instanceof InvalidCommandPlanError)) {
    throw error;
  }
  throw new DownloadRuntimeError("E_INVALID_ENGINE_PLAN", error.message);
}
```

### 1. Scope / Trigger

- Trigger: Any change to downloader runtime packaging, `yt-dlp` / `gallery-dl` bootstrap, or runtime dependency gate behavior.
- Why this needs code-spec depth: The flow spans release packaging, Electron main, shared runtime status types, renderer recovery UI, and download execution. A stale bundled/runtime assumption can ship missing downloaders or expose unsupported manual update commands.

### 2. Signatures

Managed runtime component ids:

```ts
type RuntimeDependencyManagedComponent =
  | "ytDlp"
  | "galleryDl"
  | "ffmpeg"
  | "deno";
```

Renderer commands:

```ts
type AmeowRendererCommand =
  | "check_ytdlp_version"
  | "get_gallery_dl_info"
  | "get_runtime_dependency_status"
  | "get_runtime_dependency_gate_state"
  | "refresh_runtime_dependency_gate_state"
  | "start_runtime_dependency_bootstrap";
```

Downloader info payloads:

```ts
type YtdlpVersionInfo = {
  current: string;
  latest: string | null;
  updateAvailable: boolean | null;
  latestError: string | null;
  source?: "managed" | "missing";
  path?: string | null;
  pythonVersion?: string | null;
  pythonPath?: string | null;
  pythonSupportsLatestStable?: boolean | null;
  updateChannel?: "managed_python_package" | "managed_release" | "unavailable";
};

type GalleryDlInfo = {
  current: string;
  latest: string | null;
  updateAvailable: boolean | null;
  latestError: string | null;
  source: "managed" | "missing";
  path: string | null;
  updateChannel: "managed_release" | "unavailable";
};
```

### 3. Contracts

- Installers must not package `desktop-assets/binaries/yt-dlp-*` or `desktop-assets/binaries/gallery-dl-*`.
- Release workflows must not pre-download downloader binaries for packaging.
- `electron/main.mts` owns the release-pinned downloader versions and checksums in `PINNED_DOWNLOADER_RELEASES`.
- `inspectRuntimeDependencyStatus(...)` must report both `ytDlp` and `galleryDl` as `expectedSource: "managed"` when absent.
- `start_runtime_dependency_bootstrap` must include missing `ytDlp` and `galleryDl` in `missingComponents`, then download/configure them from the pinned release source.
- Settings must not expose downloader cards, downloader versions, or manual downloader update commands. Recovery stays in the main-window runtime gate.
- The preload command union must not expose `update_ytdlp` or `update_gallery_dl`.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Fresh install has no downloader binaries | `inspectRuntimeDependencyStatus(...)` | `ytDlp` / `galleryDl` are `missing`, `expectedSource: "managed"` | Runtime gate can bootstrap both |
| Runtime bootstrap starts with missing downloaders | `start_runtime_dependency_bootstrap` | Gate enters `downloading`, current/next component uses `ytDlp` / `galleryDl` ids | Download pinned assets or pinned Python package |
| Pinned asset checksum mismatches | `verifyDownloadedRuntimeAsset(...)` | Bootstrap fails with checksum error and no final binary replace | Surface failure through `runtime-dependency-gate-state` |
| Settings page renders | `src/pages/SettingsPage.tsx` | No downloader management section appears | User cannot manually update downloaders |
| Renderer attempts obsolete update command | `src/types/electronBridge.ts` / `handleCommand` | Type union rejects it; runtime throws unsupported command if manually invoked | Use runtime bootstrap instead |
| Package build runs | `electron-builder.config.mjs` / release workflow | App package contains app assets, not downloader binaries | First launch prepares runtimes |

### 5. Good/Base/Bad Cases

- Good: `galleryDl` missing -> `missingComponents: ["galleryDl"]` -> main window starts bootstrap -> pinned asset downloads into `userData/runtimes/gallery-dl/<target>/...`.
- Base: all managed runtimes exist -> gate reports `ready`; no downloader network request is made.
- Bad: adding `desktop-assets/binaries/gallery-dl-*` back to Electron Builder `files` makes packaging pass locally but breaks the first-launch managed-runtime contract.
- Bad: exposing `update_ytdlp` in `AmeowRendererCommand` reintroduces a user-managed update surface that bypasses release-pinned runtime policy.

### 6. Tests Required

- `src/electron-runtime/runtimePaths.test.ts`: assert missing/ready `ytDlp` and `galleryDl` use managed paths and `expectedSource: "managed"`.
- `src/electron-runtime/runtimeDependencyGate.test.ts`: assert missing managed downloader components keep the gate recoverable, not fatal.
- `src/utils/runtimeDependencyGate.test.ts`: assert frontend startup bootstrap detection includes `galleryDl`.
- `npm run type-check`: catches preload/type drift after command union or payload changes.
- `npm run lint`: catches frontend dead code after removing settings surfaces.

### 7. Wrong vs Correct

#### Wrong

```ts
type AmeowRendererCommand =
  | "start_runtime_dependency_bootstrap"
  | "update_ytdlp"
  | "update_gallery_dl";
```

#### Correct

```ts
type AmeowRendererCommand =
  | "get_runtime_dependency_status"
  | "start_runtime_dependency_bootstrap";
```

#### Wrong

```js
files: [
  "desktop-assets/binaries/yt-dlp-*",
  "desktop-assets/binaries/gallery-dl-*",
];
```

#### Correct

```js
files: [
  "dist/**/*",
  "dist-electron/**/*",
  "locales/**/*",
];
```
- Contract:
  - Do not treat `shell.openPath(...)` as throw-only. A non-empty return value is a command failure and must be converted into a thrown error for the preload/renderer caller.
  - `open_current_output_folder` must resolve the configured output directory and ensure the directory exists before trying to open it, so first-use macOS flows can still reveal the folder in Finder.
  - `open_folder` must reject blank paths instead of silently passing `""` to Electron.
- Validation and error matrix:
  - Existing directory + empty `openPath` result: command succeeds and Finder/File Explorer opens the folder.
  - Missing default output directory + `open_current_output_folder`: command creates the directory and then opens it successfully.
  - Non-empty `openPath` result such as `"The file doesn’t exist."`: command throws a descriptive error instead of silently doing nothing.
  - Blank folder path: command throws `Path is required`.
- Required tests:
  - Unit test the helper that wraps `shell.openPath(...)` and assert empty-string success vs non-empty-string failure.

#### Compact Passthrough Interaction Contract

- Renderer entry point:
  - `src/App.tsx`
  - collapse settle path calls `desktopCurrentWindow.setInteractionMode("compact-passthrough")`
- Main-process IPC handler:
  - `electron/main.mts`
  - channel: `ameow:current-window:set-interaction-mode`
- Allowed native calls for `"compact-passthrough"`:
  - `win.setIgnoreMouseEvents(true, { forward: true })`
  - `win.setFocusable(false)`
- Forbidden native call for `"compact-passthrough"`:
  - `win.blur()`

Why:
- On the transparent main BrowserWindow, `blur()` can introduce a post-animation native flash after the renderer collapse motion has already finished.
- `setIgnoreMouseEvents(true, { forward: true })` and `setFocusable(false)` preserve passthrough behavior without reintroducing that flash in current Windows/macOS validation.

Validation and error matrix:

| Condition | Expected Behavior | Action |
|-----------|-------------------|--------|
| Collapse motion finishes, then compact passthrough is applied with `ignoreMouseEvents + setFocusable(false)` | No end-frame flash; transparent gutter clicks pass through | Allowed path |
| Compact passthrough additionally calls `win.blur()` | Main window may flash after the motion appears complete | Reject / remove `blur()` |
| Renderer motion still flashes when native interaction settle is disabled | Root cause is not the native settle path | Continue renderer/compositor debugging |

Good / Base / Bad cases:
- Good:
  - Compact collapse stays visually stable and passthrough still works.
  - Compact hotspot entry still expands correctly after `setFocusable(false)`.
- Base:
  - The window no longer steals pointer input in transparent gutter areas.
- Bad:
  - Collapse appears stable until the native settle runs, then the whole compact shell flashes once.
  - Engineers keep tuning renderer motion while the real regression lives in the native interaction handoff.

Required tests:
- Manual:
  - collapse to compact with passthrough enabled and confirm no post-animation flash
  - compact transparent-area click-through still works
  - compact hotspot hover-expand still works after `setFocusable(false)`
- Automated:
  - `npm run test -- compactPointerHotspot mainWindowTransitionToken mainWindowMode startupWindowState`
  - Unit test the “ensure directory first” path used by `open_current_output_folder`.
  - Manual macOS check: double-clicking the main panel opens the configured/default output folder even when it has not been created before.
| `getCurrentWindow()` / `currentMonitor()` / `PhysicalPosition` | Renderer | `window.ameow.currentWindow.*` + `window.ameow.system.currentMonitor()` | Keep logical-coordinate contract at renderer boundary. |
| `plugin-dialog.open(...)` | Renderer plugin call | `window.ameow.system.openDialog(...)` | Dialogs stay main-owned. |
| `plugin-opener.openUrl(...)` | Renderer plugin call | `window.ameow.system.openExternal(...)` | External opens stay main-owned. |
| `plugin-process.relaunch()` | Renderer plugin call | `window.ameow.system.relaunch()` | Relaunch stays main-owned. |
| `plugin-updater.check()` / `Update.downloadAndInstall(...)` | Renderer plugin call | `window.ameow.updater.check()` / `downloadAndInstall()` | Do not leak raw Electron updater handles into renderer. |
| `plugin-clipboard-manager.readImage()` | Renderer plugin call | `window.ameow.clipboard.readImage()` | Return serializable pixel payload only. |
| Tauri tray/plugin runtime | Rust/Tauri | Electron main (`Tray`, `Menu`, `globalShortcut`, login-item/autostart, single-instance lock, dialog, shell, ws`) | Preserve user-visible behavior unless this spec documents an intentional break. |

#### Window Ownership Contract

- `main` remains the canonical primary window label.
- `settings` and `context-menu` remain the stable user-facing secondary window labels.
- `ui-lab` is a development-only secondary window label:
  - available only when `!app.isPackaged`
  - not exposed through production UI entry points or packaged runtime flows
- `main` keeps the current compact shell behavior:
  - transparent where the platform compositor can render it reliably
  - always-on-top
  - non-resizable
  - close request hides instead of quitting
- On Windows, the first startup reveal for `main` must use full native bounds (`200x200`) instead of a cold-start compact native shell.
- The first transition into compact mode after launch must come from the normal idle compact path, not from an immediate startup-only full-to-compact handoff that runs before the window has settled.
- On packaged Windows builds, compact Ameow windows should preserve transparent parity with development builds by default, including `main` and `settings`. An opaque fallback background is reserved only for explicit diagnostics / escape-hatch runs enabled through the global fallback switch.
- `main`, `settings`, `context-menu`, and other compact utility windows should default to `show: false` and reveal only after `ready-to-show` or `did-finish-load`, with a bounded timeout fallback for machines that never emit the ideal paint signal.
- Startup reveal gating may differ by environment:
  - packaged `main` should keep the full reveal handshake, including the renderer-ready wait used to avoid showing a half-booted desktop shell
  - development `main` may reveal on the first stable paint / initial reveal signal and must not hold first show behind the full renderer-ready handshake
- If a window closes before those reveal signals or timeout complete, the wait path must resolve quietly and skip listener cleanup against destroyed `BrowserWindow` or destroyed `webContents` handles.
- On Windows, Ameow desktop windows are tray-first utility surfaces:
  - `main` must set `skipTaskbar: true`
  - secondary utility windows should default to `skipTaskbar: true` unless a product requirement explicitly opts one into taskbar visibility
- Single-instance behavior stays:
  - if a second instance launches, Electron must focus/show `main`
- Tray behavior stays:
  - tray left-click shows `main`

#### Download Output Naming Contract

- Runtime-owned video downloads in `src/electron-runtime/service.ts` must reserve one output stem per task before engine execution starts.
- The shared stem builder is `buildOutputStem(...)` in `src/electron-runtime/runtimeUtils.ts`; engines must consume the pre-reserved `context.outputStem` instead of inventing per-engine names.
- Title-first contract:
  - when a request provides a usable title, that cleaned title is the primary video output stem for all providers, including Pinterest
  - provider-specific fallback stems such as `pinterest_<shortId>` are used only when title metadata is absent
  - `gallery-dl` routes must not add a blocking pre-download metadata probe just to improve naming; they should start the real download immediately and, if needed, rename after completion from emitted sidecar metadata
  - post-download `gallery-dl` naming may read sidecars named `<stem>.info.json`, `<stem>.json`, `<final-media-name>.info.json`, `<final-media-name>.json`, or bare `info.json`
  - when `gallery-dl` metadata exposes both a username/account handle and a stable short post identifier (for example Instagram `post_shortcode`), runtime should prefer a short `author - shortId` stem over a long description/caption
- Collision handling contract:
  - if the preferred stem already exists on disk, runtime must allocate the next available suffixed variant before the downloader starts
  - active in-memory tasks must also reserve stems, so concurrent same-title or same-pattern tasks cannot pick the same filename
  - sidecar artifacts such as `.txt`, `.json`, `.part`, and `.ytdl` do not count as occupied final outputs
  - once a `gallery-dl` task has used sidecar metadata for naming, runtime should remove those transient metadata sidecars from the output directory on success so the user only sees the final media file
- Config compatibility:
  - when `renameMediaOnDownload === true` or legacy `videoKeepOriginalName === false`, all resource saves must route through the shared rename-rule allocator instead of provider-specific stems
  - `download_image(...)`, `save_data_url(...)`, and `process_files(...)` in `electron/main.mts` share the same rename-rule entrypoint so screenshots and copied files follow the same global rename toggle
  - tray menu contains `show`, `settings`, `quit`
  - tray labels continue to resolve from native locale resources
  - Windows tray and BrowserWindow icons should resolve from packaged app assets, preferring `desktop-assets/icons/icon.ico` so dev and packaged runs do not fall back to the default Electron icon

#### Foreground Task Window Restore Contract

- When a foreground task or direct-processing feedback flow such as download, transcode, image save, or file copy restores `main` from compact icon mode, renderer state must not switch to full-mode visuals before the native BrowserWindow bounds have returned to the full shell size.
- If `main` is still in compact native bounds (`windowResized === true` or equivalent), restore the native bounds first through `currentWindow.animateBounds(...)` or a shared helper that owns that contract, then clear minimized/full-mode renderer state.
- If multiple async compact/full requests can overlap, renderer must attach a monotonic transition token to `currentWindow.animateBounds(...)` and must ignore any completion whose echoed token is no longer current before committing `setIsMinimized(false)`, `setWindowResized(false)`, or compact-shrink follow-up.
- Download, transcode, and direct-processing feedback paths must share the same restore helper so renderer/native ordering cannot drift between task types.
- If a foreground task forced `main` out of compact mode, completion/cancel settlement should return the shell to compact behavior once the transient success/error indicator finishes and no other foreground-task lock remains.
- Once `main` is already in full native bounds, repeated progress events must not trigger redundant resize work or re-arm focus/idle side effects unnecessarily.
- User-triggered native repositions such as the global `shortcut-show` path may move the BrowserWindow before renderer expansion logic runs:
  - Electron main may set the new `main` bounds directly before emitting `shortcut-show`
  - renderer must treat `shortcut-show` as a synchronization signal and refresh its cached `currentWindow.outerPosition()` before the next compact/full `animateBounds(...)` request
  - otherwise the next idle compact can shrink back to stale pre-shortcut coordinates instead of the new shortcut anchor point

#### Dev-only UI Lab Contract

- Electron main may expose a dev-only `ui-lab` window through `window.ameow.windows.openUiLab(...)`.
- Electron preload/main may expose the dev-only renderer command:
  - `dev_ui_lab_apply_scenario`
- Packaged builds must reject UI Lab entry points:
  - `ameow:window:open-ui-lab`
  - `dev_ui_lab_apply_scenario`
- UI Lab must drive the real main window instead of rendering duplicate status widgets:
  - scenario application may emit the existing queue/transcode/runtime app events
  - scenario application may temporarily override `get_runtime_dependency_status`, `get_runtime_dependency_gate_state`, `refresh_runtime_dependency_gate_state`, and `start_runtime_dependency_bootstrap`
- While any UI Lab runtime override is active, emitted `runtime-dependency-gate-state` events must keep reflecting the override payload instead of leaking live bootstrap updates back into the preview.
- Non-runtime UI Lab scenarios (`download-*`, `transcode-*`, `mixed-*`) must apply a ready runtime override before emitting task progress so missing live runtimes do not pollute those previews with an unrelated runtime indicator.
- Before each scenario, Electron main must emit `ui-lab-reset` so the main window clears mock progress, queue, and retry/success indicator state before applying new preview data.
- UI Lab scenario application must not reuse the normal `shortcut-show` renderer event path after `showMainWindow()`:
  - preview activation is its own contract, not a user shortcut replay
  - renderer-side shortcut show logic may arm idle/minimize flows that race with preview state application
- While UI Lab preview mode is active, renderer visual state must be forced to full main-window mode until `ui-lab-reset` restores live state:
  - minimized shell clip-path, minimized icon branch, and shrink-on-animation-complete paths must stay suppressed even if internal minimize state is still settling
  - preview tooling must never show task/status content inside the compact circular shell
- `ui-lab-reset` is a main-to-renderer app event only; renderer must not emit it back over `window.ameow.events.emit(...)`.

#### Autostart Contract

- Renderer-facing command names stay:
  - `get_autostart`
  - `set_autostart`
- Autostart remains runtime-owned OS state and must not be mirrored into `settings.json`.
- On Windows, Electron main must read and write login-item settings against the current executable path with an explicit empty `args` array so the query path matches the write path.
- On Windows, Electron main must use a stable registry entry name `Ameow` when writing startup registration so toggling the feature reuses one predictable startup item across installs and updates.
- On Windows, `executableWillLaunchAtLogin` is the source of truth for whether the current executable will actually launch at login. `openAtLogin` alone is not sufficient because it can stay truthy while Startup Approved state or argument matching drifts.
- When Windows returns matching `launchItems` for the current executable or the stable `Ameow` entry name, Ameow should surface autostart as enabled only if at least one matching item is still `enabled`.
- On macOS, keep the existing `openAtLogin` read/write behavior; do not widen this contract with Windows-only fields.

#### BrowserWindow + Preload Availability Contract

- `main`, `settings`, and `context-menu` must all load the same Electron preload bridge when they render Ameow UI.
- Desktop startup state needed before first React render, including whether the main window intentionally launched in compact icon mode, must come from the Electron-owned bridge contract rather than renderer-side first-frame size heuristics.
- Packaged startup work that still belongs on the critical path before first reveal should reuse one parsed startup-config snapshot for all native consumers that need the same config fields during that boot, including:
  - BrowserWindow theme selection
  - tray label/bootstrap language
  - shortcut registration
- Development startup should keep first reveal focused on showing `main`; non-critical native bootstrap tasks such as config-dir creation, tray refresh, and shortcut registration may run immediately after reveal as deferred best-effort work instead of blocking first paint.
- Renderer-side non-critical startup work such as runtime status/gate refresh, automatic managed-runtime bootstrap, and update checks must wait until the initial full-window reveal has settled or a bounded fallback delay has elapsed.
- If a user initiates a foreground action before deferred startup work runs, the renderer may fetch the required runtime state on demand for that action instead of waiting for the deferred startup queue.
- Under the current architecture, each BrowserWindow must set:
  - `preload: <electron preload path>`
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: false`
- Route construction must preserve hash routing for Electron renderer windows in both dev and packaged mode so secondary routes resolve consistently.
- Packaged Electron renderer builds that load via `file:///.../dist/index.html#...` must emit relative asset URLs (`./assets/...`) in `dist/index.html`.
- Do not ship root-relative `/assets/...` URLs in packaged renderer HTML; that causes BrowserWindows to show only the native host background while JS/CSS fail to load from the app bundle.
- Renderer bootstrap must treat Electron detection (`file:` URL or Electron user agent) as a hard contract:
  - if `window.ameow` exists, continue with desktop bootstrap
  - if `window.ameow` is missing, render an explicit bridge-failure state and stop booting the normal app shell

#### Extension Injection Debug Config Contract

- Canonical persisted config key: `extensionInjectionDebugEnabled`.
- The desktop Settings window is the source of truth for that flag; browser-extension local storage is a mirrored cache only.
- Renderer keeps the existing raw-JSON config flow:
  - `get_config` returns the raw string
  - renderer toggles `config.extensionInjectionDebugEnabled`
  - `save_config` persists the raw string
- Electron main must compare previous and next effective values when `save_config` writes settings:
  - when the effective value changes, broadcast `extension_debug_config_changed`
  - when the value does not change, do not broadcast redundant WS churn
- Browser extension background must request the current value on WS connect with `get_extension_debug_config` so already-open tabs resynchronize after extension reloads or desktop reconnects.
- Content scripts must observe the mirrored extension storage key instead of polling the desktop app directly.
- Dev-only page tooling such as injection-debug overlays or draggable diagnostics panels must remain hidden until this flag is `true`.

#### Renderer Event Delivery Contract

- Electron main must emit app events on `ameow:event:<eventName>`.
- Electron preload `events.on(event, listener)` must subscribe only to the event-specific channel for that event name.
- The renderer-facing callback payload stays `{ payload }`; do not add a second `event` discriminator field that forces renderer-side filtering.
- Every `events.on(...)` implementation must return an unsubscribe cleanup that removes the exact same listener from the exact same channel.
- Do not route unrelated events through one shared `"ameow:event"` channel. That pattern scales listener count badly and can trigger `MaxListenersExceededWarning` during normal UI usage.

#### Frameless Window Movement Contract

- Renderer drag activation may wait for a movement threshold, but once dragging starts it must derive movement from screen-space pointer deltas plus the window's initial outer position.
- Read `currentWindow.outerPosition()` once when drag becomes active; do not re-query window coordinates on every move.
- High-frequency movement updates must go through `currentWindow.setPosition({ x, y })`, implemented as fire-and-forget IPC (`ipcRenderer.send(...)` / `ipcMain.on(...)`).
- Short icon-mode window morphs (`80x80 <-> 200x200`) must use `currentWindow.animateBounds({ x, y, width, height }, { durationMs })` against the existing main BrowserWindow.
- Do not reintroduce a dedicated `window-transition-overlay` BrowserWindow for icon-mode expand; Windows DWM cross-window handoff is not the supported contract for Ameow.
- Renderer may batch window-position writes with `requestAnimationFrame`, but it must not await request/response IPC inside `pointermove`.
- `currentWindow.startDragging()` is not the hot-path mechanism for Ameow's custom frameless drag contract on Electron.
- `pointerup`, `pointercancel`, blur-adjacent cleanup, and other drag-end paths must always clear pending drag state so the window cannot get stuck mid-drag.
- Frameless secondary windows that do not use the main window's manual drag system (for example `ui-lab`) must expose an explicit Chromium drag region on their shell/header and mark interactive controls such as close buttons as `no-drag`.

#### Managed Runtime Bootstrap Network Contract

- Small metadata lookups in the managed runtime bootstrap path, such as the Pinterest runtime manifest request, must fail explicitly after a bounded timeout instead of waiting forever on network stalls.
- Managed runtime asset downloads must use a stall timeout that resets on successful byte progress; if no progress arrives within the timeout window, bootstrap must transition the gate to `failed` with a concrete error message.
- Runtime bootstrap timeout handling must preserve the existing gate contract:
  - active work reports `checking` or `downloading`
  - timeout/fetch failure reports `failed`
  - successful completion still refreshes the live runtime snapshot and gate state

#### Browser Extension WebSocket Contract

- Fixed bind target:
  - host: `127.0.0.1`
  - port: `39527`
- Request envelope:
  - top-level `action: string`
  - optional `data: object`
- Response envelope:
  - `success: boolean`
  - `message?: string | null`
  - `data?: object | null`
- Correlation contract:
  - if the request includes `data.requestId`, the response must echo `data.requestId`
  - failure responses participating in request correlation must include `data.code`
- Inbound actions to preserve:
  - `ping`
  - `get_theme`
  - `get_language`
  - `sync_download_preferences`
  - `save_image`
  - `save_data_url`
  - `pasted_video_selection_result`
  - `protected_image_resolution_result`
  - `video_selected_v2`
- Outbound actions to preserve:
  - `request_download_preferences`
  - `resolve_pasted_video_selection`
  - `theme_info`
  - `theme_changed`
  - `language_info`
  - `language_changed`
  - `start_picker`
  - `stop_picker`
  - `resolve_protected_image`
- `video_selected_v2` payload fields to preserve:
  - `url`
  - `pageUrl`
  - `title`
  - `videoUrl`
  - `videoCandidates`
  - `selectionScope`
  - `clipStartSec`
  - `clipEndSec`
  - `ytdlpQualityPreference`
  - `cookies`
  - `requestId`
- `resolve_xiaohongshu_drag_media` renderer command contract:
  - request fields:
    - `url`
    - `pageUrl?`
    - `detailUrl?`
    - `sourcePageUrl?`
    - `token?`
    - `noteId?`
    - `imageUrl?`
    - `mediaType?`
    - `videoIntentConfidence?`
    - `videoIntentSources?`
    - `cookies?`
  - response shape:
    - `kind: "video" | "image" | "unknown"`
    - `pageUrl`
    - `detailUrl?`
    - `sourcePageUrl?`
    - `imageUrl`
    - `videoUrl`
    - `videoCandidates`
    - `videoIntentConfidence?`
    - `videoIntentSources?`
- `save_image` payload fields to preserve when the extension asks Electron main to perform an authenticated protected-image download:
  - `url`
  - `targetDir?`
  - `originalFilename?`
  - `requestHeaders?`
  - `referrer?`
- Extension-side image-only page buttons may also reuse the same `save_image` websocket action when the page has no verified video asset. Do not add a parallel Electron websocket action just for "image note" variants when the existing `save_image` contract already covers authenticated image fetch.
- Generic browser-extension media triggers may normalize into either `video_selected_v2` or `save_image`; do not add a third Electron websocket action just for right-click or popup-triggered "current media" requests.
- Extension-internal trigger messages for the generic browser-entry layer must stay inside the extension boundary:
  - `download_current_video`
  - `ameow_resolve_video_selection`
  - `ameow_resolve_pasted_video_selection`
  - `resolve_xiaohongshu_context_media`
  - `save_image_from_page`
- `queue_pasted_video_download` renderer command contract:
  - request fields:
    - `url`
    - `pageUrl?`
    - `siteHint?`
  - behavior:
    - Electron main must try extension-assisted pasted selection first for supported site hints before falling back to the plain `queue_video_download` path.
    - Current supported extension-assisted pasted site hints:
      - `bilibili`
      - `douyin`
      - `youtube`
      - `twitter-x`
      - `pinterest`
      - `xiaohongshu`
    - When extension-assisted resolution succeeds, the final queued payload must be normalized through the same `video_selected_v2` forwarding path used by injected-button downloads so `pageUrl`, `selectionScope`, `clipStartSec`, `clipEndSec`, `extensionData`, and cookie policy stay aligned.
- Right-click/current-media title contract:
  - Feed/profile/list pages must not fallback from a missing card-local title to `document.title` before sending `video_selected_v2`.
  - A title may be forwarded only when it was recovered from the local card/dialog/article subtree that produced the media request.
  - When no scoped title exists, the extension should omit `title` and let runtime naming fall back to canonical page URL / note id / downstream metadata.
- Xiaohongshu right-click precision contract:
  - `browser-extension/xiaohongshu-detector.js` right-click scoping must prefer the smallest visible single-note container around the clicked anchor.
  - Scope expansion must stop before a parent container that contains multiple note URLs, otherwise image/video resolution can drift to an adjacent card.
- Xiaohongshu drag token/detail contract:
  - `browser-extension/xiaohongshu-page-bridge.js` is a page-world bridge that must stay listed in MV3 `web_accessible_resources`.
  - `browser-extension/xiaohongshu-contextmenu-guard.js` must inject that bridge at `document_start`, listen for `AMEOW_XIAOHONGSHU_NOTE_LINKS`, and persist the latest `noteId -> { detailUrl, xsecToken, xsecSource }` cache for later content-script reads.
  - `browser-extension/xiaohongshu-detector.js` drag/context payloads must prefer a cached tokenized `detailUrl` over bare `/explore/<noteId>` links or profile-note URLs.
  - `electron/main.mts` must forward `detailUrl` end-to-end when requesting extension-side drag resolution.
  - Tokenized `detailUrl` is a higher-trust canonical hint than drag-time cover image hints. If `detailUrl` contains `xsec_token`, desktop fallback must continue note-aware resolution before finalizing an image download.
- Xiaohongshu video routing contract:
  - Video downloads must enqueue a yt-dlp-compatible note URL, not a direct `xhscdn` URL or extracted m3u8/mp4 candidate.
  - Valid yt-dlp sources are `https://www.xiaohongshu.com/explore/<hexId>` and `https://www.xiaohongshu.com/discovery/item/<hexId>` with optional query parameters.
  - Tokenized `discovery/item/<hexId>?xsec_token=...` detail URLs are preferred when already available.
  - Profile-note URLs must normalize to `/explore/<hexId>` before provider execution.
  - The generic runtime queue must not fetch Xiaohongshu pages/API responses only to discover direct video candidates before provider resolution.
- `requestHeaders` for `save_image` are an Electron-owned allowlist contract:
  - allowed keys: `Accept`, `Cookie`, `Origin`, `Referer`, `User-Agent`
  - all other extension-supplied header keys must be ignored before main-process fetch
- Xiaohongshu protected-image desktop fetch contract:
  - bare CDN-host roots such as `https://sns-webpic-qc.xhscdn.com/` are invalid image targets and must be rejected before download/fallback fetch attempts
  - for `xhscdn` image requests whose page/referrer host is `xiaohongshu.com` or `xhslink.com`, Electron main should prefer `Origin: https://www.xiaohongshu.com` with `referrer: ""` / `referrerPolicy: "no-referrer"` on the Chromium-session fetch path instead of forcing a note-page referrer that Chromium can reject as invalid
- Twitter/X image drag contract:
  - renderer-side page context for X image drags must canonicalize `https://x.com/<user>/status/<id>/photo/<n>` back to `https://x.com/<user>/status/<id>` before passing `pageUrl` into `download_image`
  - deterministic `pbs.twimg.com/media/...?...&name=<variant>` image URLs should upgrade to `name=orig` before generic `maxurl` probing so the image path does not depend on extractor heuristics
  - for `pbs.twimg.com` image requests whose page/referrer host is `x.com` or `twitter.com`, Electron main must not force a full page `Referer` or `Origin` header on the Chromium-session fetch path because Chromium may reject even the canonical status URL as an invalid referrer for image fetches
  - if Chromium-session fetch still fails for a public X image request, Electron main may fall back to a plain Node `http/https` request using the sanitized header set rather than the browser session referrer contract
- Protected-image fallback order is part of the transport contract:
  1. renderer `download_image`
  2. Electron direct download
  3. extension `resolve_protected_image`
  4. content-script local export
  5. page bridge fetch
  6. extension background fetch
  7. authenticated Electron `save_image` with forwarded `requestHeaders` / `referrer`
  8. extension reports `protected_image_resolution_result`
- The page-bridge asset `browser-extension/protected-image-page-bridge.js` must stay listed in MV3 `web_accessible_resources`; otherwise CSP-protected sites can break the protected-image fallback before step 5.

Validation and error matrix:

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Site CSP blocks inline bridge injection | MV3 content script + manifest | Page bridge still loads from `chrome.runtime.getURL(...)` | Keep `protected-image-page-bridge.js` in `web_accessible_resources` |
| Content script and page bridge both fail to read bytes | `browser-extension/background.js` fallback chain | Extension tries background fetch, then authenticated `save_image` | Report only the final correlated result back to Electron |
| Extension button targets an image-only page/note | `browser-extension/*-detector.js` -> `background.js` -> `electron/main.mts` | Extension skips `video_selected_v2` and maps directly to `save_image` with page-derived `referrer`/headers | Reuse existing `save_image` action instead of inventing a new Electron websocket contract |
| Browser right-click hits an image resource or an image-only note | `browser-extension/background.js` context-menu path | Extension routes to `save_image` instead of forcing the selection through `video_selected_v2` | Reuse `save_image_from_page` / `save_image`; do not invoke video runtimes for image-only targets |
| Xiaohongshu homepage/feed right-click starts on one note card while the nearest large parent contains multiple cards | `browser-extension/xiaohongshu-detector.js` scope resolution | Resolved image/video belongs to the clicked card only | Stop scope expansion before the first multi-note parent |
| Xiaohongshu feed/profile page has no scoped card title | `browser-extension/xiaohongshu-detector.js` -> `background.js` -> `src/electron-runtime/service.ts` | Request omits `title`, so runtime naming falls back to canonical URL/id instead of page title pollution | Never fallback to feed/profile `document.title` for right-click naming |
| Xiaohongshu drag payload initially says `mediaType: "image"` but bridge cache later exposes a tokenized `detailUrl` plus medium/high video intent | `browser-extension/xiaohongshu-detector.js` -> `background.js` -> `electron/main.mts` | Desktop still treats the note as video-eligible and queues the canonical note URL instead of finalizing the cover image immediately | Let tokenized `detailUrl` + confidence override the earlier weak image guess |
| Dragged Xiaohongshu card payload exposes only a note page URL plus an ambiguous cover image | renderer `resolve_xiaohongshu_drag_media` -> Electron main -> runtime page fetch | Desktop resolves the note page to canonical media before deciding image vs video | Prefer canonical page media over card-cover heuristics; tokenized `detailUrl` is the preferred canonical page hint |
| Xiaohongshu image drag resolves to a bare `xhscdn` host root or Chromium rejects the note page as an invalid referrer | renderer `download_image` -> `electron/main.mts` protected-image fetch | Desktop must reject the bare root as invalid and, for real Xiaohongshu CDN image requests, avoid a note-page referrer that Chromium blocks | Filter CDN roots before image selection; use origin-only Xiaohongshu headers plus `no-referrer` session fetch fallback |
| X image drag comes from an overlay page like `/status/<id>/photo/1` | renderer image drop parsing -> `download_image` | Desktop image download receives the canonical status permalink instead of the overlay URL | Canonicalize X overlay URLs before forwarding `pageUrl` |
| `pbs.twimg.com` request is valid but Chromium rejects the X status referrer as invalid | `electron/main.mts` image download fetch | Desktop still attempts the image download without forcing a referrer contract that Chromium blocks | Drop `Referer`/`Origin` for public X image requests and keep a non-session HTTP fallback |
| X dragged image URL is a low-resolution `name=small` / `name=medium` variant | renderer `upgradeImageUrl` | Download path upgrades to `name=orig` before fetch | Prefer deterministic `pbs.twimg.com` variant rewriting ahead of generic `maxurl` |
| Xiaohongshu page bridge asset is omitted from MV3 resources or not injected at `document_start` | `browser-extension/manifest.json` + `xiaohongshu-contextmenu-guard.js` | Feed/profile API responses are missed, so `detailUrl` stays bare or null and video drag fallback regresses | Keep `xiaohongshu-page-bridge.js` in `web_accessible_resources` and inject it before page feed requests fire |
| Bare Xiaohongshu CDN MP4 enters the generic video queue without a note URL | `src/sites/xiaohongshu.ts` provider routing | The Xiaohongshu provider must not claim it solely from the CDN host; generic fallback may handle it as an ordinary URL | Require a canonical note URL or explicit Xiaohongshu note context before using the Xiaohongshu provider |
| Extension sends unexpected request header names | `electron/main.mts` `save_image` path | Main process drops unapproved headers before fetch | Restrict to the allowlist |
| Authenticated desktop download succeeds after browser-context failure | `protected_image_resolution_result` correlation | Original `download_image` call resolves with the saved path instead of timing out | Resolve the pending protected-image request once |

Good / Base / Bad cases:
- Good:
  - Weibo protected-image drag fails canvas export and browser-context fetches, then succeeds through authenticated `save_image` with forwarded cookies and referrer.
  - Dragging an image from `https://x.com/<user>/status/<id>/photo/1` downloads the `pbs.twimg.com` asset through the image path using the canonical status permalink, not the overlay URL.
  - Right-clicking a Xiaohongshu feed card resolves one local note URL, routes image-only notes to `save_image`, routes video notes to `video_selected_v2`, and either keeps a scoped card title or omits `title` entirely.
- Base:
  - Public image download still uses the normal `download_image` path with no `save_image` metadata.
  - An image-only site button may reuse `save_image` as long as the extension still preserves the existing payload fields and request correlation semantics.
  - Generic context-menu and popup triggers may stay extension-internal as long as they eventually normalize into either `video_selected_v2` or `save_image`.
  - Ambiguous Xiaohongshu drag payloads may defer final classification to `resolve_xiaohongshu_drag_media`, which may upgrade cover-image hints into a video queue decision when a tokenized `detailUrl` and video intent are present.
  - Xiaohongshu homepage card drag may remain image-only only when no scoped video signal, no tokenized `detailUrl`, and no medium/high video intent were recovered.
- Bad:
  - Extension forwards arbitrary header names to Electron main.
  - Renderer forwards `https://x.com/<user>/status/<id>/photo/1` as the final X image `pageUrl`, causing Chromium referrer validation to reject the request path.
  - Electron main forces a full X/Twitter `Referer` onto `pbs.twimg.com` image fetches even after Chromium has proven that referrer invalid for the request.
  - Image-only notes are forced through `video_selected_v2`, causing the runtime to invoke `yt-dlp` on a page with no video formats.
  - A generic right-click/current-media trigger falls back to `document.title` from a feed/profile page and pollutes output naming for an otherwise precise card-scoped request.
  - Xiaohongshu right-click scoping expands into a multi-card parent and resolves media from an adjacent note instead of the clicked card.
  - Renderer trusts the dragged cover image as the source of truth for Xiaohongshu cards without first checking whether the note page actually resolves to video.
  - Renderer or Electron downloads a Xiaohongshu cover image while a tokenized `detailUrl` and medium/high video intent are still available for yt-dlp note routing.
  - A previous Xiaohongshu detail-view video pollutes a later homepage card drag because re-resolution trusted document-wide `performance` or script signals without card-local scope or note-linked `detailUrl`.
  - Electron main changes the protected-image action names or payload keys without updating this contract in the same task.

Required tests and assertion points:
- Browser-extension checks:
  - Right-click a Xiaohongshu image-only homepage card and assert the request routes to `save_image` instead of `video_selected_v2`.
  - Right-click a Xiaohongshu video homepage card and assert the resolved `pageUrl` belongs to the clicked note instead of a sibling card or parent feed/profile URL.
  - Right-click a Xiaohongshu homepage card with no reliable card-local title and assert the forwarded request omits `title`.
- Regression checks:
  - Keep the existing Xiaohongshu drag-resolution checks proving that document-global stale media alone cannot upgrade an image card to video.
  - Add/keep checks proving that a cached tokenized `detailUrl` survives drag payload parsing and reaches Electron `resolve_xiaohongshu_drag_media`.
  - Add/keep checks proving that bare `xhscdn` host roots are rejected as image hints in renderer/runtime parsing.
  - Add/keep checks proving that Xiaohongshu protected-image desktop fetch uses the origin-only / no-referrer fallback instead of a note-page referrer on the Chromium session path.
  - Add/keep checks proving that `normalizeVideoPageUrl(...)` canonicalizes X `/photo/<n>` overlay URLs back to the status permalink.
  - Add/keep checks proving that X `pbs.twimg.com` image URLs upgrade to `name=orig` before generic `maxurl` probing.
  - Manually verify a Xiaohongshu waterfall video drag still queues the canonical note URL when the extension result returns only `kind: "image"` plus a tokenized `detailUrl` and medium video intent.
  - Manually drag a real X image and verify the app shows a loading indicator during transfer, then settles into a short success state only after the file is written.
  - Reload the extension after manifest/background changes and assert the generic context-menu entry still appears for supported `video`, `image`, `link`, `page`, and `frame` contexts.

#### Config Compatibility Contract

- Config file path:
  - keep effective file name `settings.json` under the current app config directory
  - current Electron runtime leaves `migrateLegacyConfigIfNeeded()` as a no-op; do not assume automatic legacy config migration unless it is reintroduced in code and updated here in the same task
- String transport contract:
  - `get_config` returns raw JSON string
  - `save_config` accepts raw JSON string payload
- Compatibility-critical keys:

| Key | Status | Contract |
|-----|--------|----------|
| `outputPath` | Canonical | Preserve exact key and current fallback to `<Desktop>/Ameow_Received` when absent. |
| `theme` | Canonical | Preserve `black` / `white`. |
| `language` | Canonical | Preserve `en` / `zh-CN`; normalize language variants on read. |
| `shortcut` | Canonical | Preserve current accelerator string semantics. |
| `renameMediaOnDownload` | Canonical | Keep as primary rename-toggle key. |
| `videoKeepOriginalName` | Legacy inverse key | Continue reading/writing until a dedicated cleanup migration removes it. |
| `renameRulePreset` | Canonical | Preserve `desc_number`, `asc_number`, `prefix_number`. |
| `renamePrefix` | Canonical | Preserve string semantics. |
| `renameSuffix` | Canonical | Preserve string semantics. |
| `defaultVideoDownloadQuality` | Canonical | Preserve as current desktop/extension quality preference key. |
| `ytdlpQualityPreference` | Legacy fallback | Continue tolerating as legacy fallback during migration. |
| `aeFriendlyConversionEnabled` | Canonical | Preserve current bool semantics. |
| `aePortalEnabled` | Canonical | Preserve current bool semantics. |
| `aeExePath` | Canonical | Preserve current string semantics. |
| `devMode` | Canonical | Preserve current bool semantics for devtools gating. |
| `clipDownloadMode` | Legacy ignored key | Continue tolerating existing values on read; do not surface or reuse them as clip-download behavior. |

- Non-config state that must stay runtime-owned:
  - autostart
  - updater/install state
  - tray/menu state
  - WebSocket server running state

#### Packaging / Updater Direction Contract

- Windows:
  - canonical packaged artifact: Electron Builder `nsis`
  - portable ZIP remains manual-distribution only
  - in-app auto-update is supported only for installed NSIS builds
  - packaged runtime files must include the Windows icon asset used at runtime (`desktop-assets/icons/icon.ico`) if Electron main loads that asset after launch
- macOS:
  - canonical packaged artifacts remain arch-specific DMGs
  - because the current repo ships unsigned open-source DMGs, Electron in-app auto-update is intentionally out of scope until code signing/notarization exists
  - macOS users stay on manual release install flow in Phase 1
- Release workflow continuity:
  - GitHub Releases stays the canonical distribution channel
  - `release-notes/v<version>.md` stays mandatory
  - browser-extension ZIP stays a separate release asset
- Renderer-facing updater contract:
  - on Windows installer builds, preload updater API may surface an available update
  - on macOS unsigned builds, preload updater API should resolve `null` instead of presenting a broken update path
  - stable update channel resolves from the public GitHub Releases stable manifest URL ending in `/releases/latest/download/latest.json`
  - prerelease opt-in resolves from config key `receivePrereleaseUpdates === true`; when enabled, Electron main must query the GitHub Releases API, select the latest non-draft prerelease that publishes `latest.json`, and use that asset URL as the manifest source
  - if prerelease opt-in is enabled but no usable prerelease manifest asset exists, Electron main must log a warning and fall back to the stable manifest instead of failing the whole update check
  - update version comparison must respect semver prerelease precedence, so `0.3.0` remains newer than `0.3.0-rc6`

#### App Update Manifest Channel Contract

- Source files:
  - `electron/main.mts`
  - `electron/appUpdate.mts`
  - `src/updates/versioning.ts`
  - `src/updates/appUpdatePreferences.ts`
- Inputs:
  - config key `receivePrereleaseUpdates?: boolean`
  - stable manifest URL: `https://github.com/Wutpeach/Ameow/releases/latest/download/latest.json`
  - GitHub prerelease list API: `https://api.github.com/repos/Wutpeach/Ameow/releases`
- Output contract:
  - `window.ameow.updater.check()` still returns `AppUpdateInfo | null`
  - `downloadAndInstall()` still consumes the chosen manifest's `platforms["windows-x86_64"].url`
- Selection rules:
  - when `receivePrereleaseUpdates !== true`, use the stable manifest URL only
  - when `receivePrereleaseUpdates === true`, fetch the releases API with GitHub headers, skip drafts, find the first prerelease whose assets include `latest.json`, and use that asset `browser_download_url`
  - if the prerelease query fails or yields no usable manifest, fall back to the stable manifest URL
  - compare remote vs current version with semver-aware prerelease ordering rather than loose numeric token ordering
- Validation and error matrix:
  - stable config / stable manifest newer than current -> return update info from stable manifest
  - prerelease opt-in / prerelease release has `latest.json` -> return update info from prerelease manifest
  - prerelease opt-in / newest prerelease is a draft -> skip it and continue scanning
  - prerelease opt-in / prerelease release lacks `latest.json` -> skip or fall back, do not throw a renderer-facing crash
  - current version `0.3.0` / remote `0.3.0-rc6` -> treat remote as not newer
  - current version `0.3.0-rc6` / remote `0.3.0` -> treat remote as newer
- Good / Base / Bad cases:
  - Good:
    - A stable user receives `0.3.1` from the stable manifest while prerelease releases exist publicly.
    - An opted-in user on `0.3.0` receives `0.3.1-rc1` from the latest prerelease release asset when that release publishes `latest.json`.
  - Base:
    - Opt-in is absent or `false`, so updater behavior stays stable-only with no GitHub prerelease API dependency on the hot path.
  - Bad:
    - Stable users are shown `0.3.0-rc6` as newer than installed `0.3.0`.
    - Opted-in users hit one prerelease release without `latest.json` and the app stops checking updates entirely instead of falling back.
- Required tests:
  - unit test manifest selection from a releases payload containing drafts, prereleases without `latest.json`, and a usable prerelease release
  - unit test config helper that only enables prerelease channel when `receivePrereleaseUpdates === true`
  - unit test semver comparison covering stable-vs-prerelease ordering on the same base version

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Renderer imports `electron` or `@tauri-apps/*` directly after migration starts | Code review / type review | Desktop runtime stays preload-mediated | Route through `window.ameow` only |
| Command name or payload key changes during transport migration | Renderer command call path | Existing TS call sites keep working | Preserve names/keys or update this spec and call sites together |
| Window labels drift from `main` / `settings` / `context-menu` | Window lookup/focus path | Existing focus/close logic still works | Keep labels stable |
| `ui-lab` is reachable in packaged builds | Dev-only preview boundary | Production builds stay free of internal preview tooling | Gate window open + scenario commands behind `!app.isPackaged` and hide renderer route/UI entry points outside dev |
| Main close quits the app instead of hiding | Tray lifecycle | Current compact-tray behavior regresses | Keep hide-on-close for `main` |
| Windows utility windows surface taskbar entries by default | Windows desktop shell behavior | Ameow stays tray-first and does not pin floating utility windows into the taskbar | Set `skipTaskbar: true` for `main` and default secondary windows on Windows unless explicitly overridden |
| Packaged Windows transparent frameless windows become invisible even though tray/process state is healthy | Main/settings packaged startup on affected machines | Ameow should keep transparent parity by default and use the opaque path only when the explicit diagnostic escape hatch is enabled | Keep the default transparent-shell path intact and gate the opaque fallback behind the global override |
| Electron resolves tray/window icons to missing or generic assets on Windows | Tray icon + window chrome review | Ameow uses the project icon instead of the Electron default icon in dev and packaged runs | Prefer `desktop-assets/icons/icon.ico` at runtime and package that asset with the app |
| BrowserWindow boots Ameow UI without the matching preload/sandbox contract | Main/settings/context-menu startup | Desktop actions fail immediately instead of degrading into inert web UI | Keep BrowserWindow webPreferences aligned with the preload bridge contract |
| Reveal-wait cleanup runs after a window has already closed | Main/settings/context-menu startup teardown | The main process does not throw `TypeError: Object has been destroyed` while cleaning up reveal listeners | Stop waiting on `closed` and skip listener cleanup on destroyed `BrowserWindow` / `webContents` objects |
| Development startup waits for the full renderer-ready handshake before first show | Electron dev startup reveal path | Dev cold start reaches a visible main window on the first stable paint instead of waiting on extra renderer-ready work | Let dev `main` reveal after the initial paint/reveal signal and keep the stricter renderer-ready wait for packaged startup |
| Packaged startup re-reads config independently for window theme, tray labels, and shortcut registration | Packaged Electron first-reveal path | First visible window is not delayed by repeated config IO/parsing on the critical path | Read one startup-config snapshot and fan it out to native startup consumers |
| Packaged `dist/index.html` still references `/assets/...` while BrowserWindow loads `file:///.../dist/index.html` | Packaged `main` / `settings` renderer startup | React UI loads bundled JS/CSS from the app directory instead of showing only the host window background | Set a `file://`-safe Vite build base such as `./` and verify emitted HTML |
| Renderer continues normal bootstrap when Electron is detected but `window.ameow` is missing | Renderer startup | Bridge failures are visible and diagnosable | Fail fast with explicit bridge error UI |
| App events are multiplexed through one shared IPC channel | Renderer event subscriptions | No listener leak warning during ordinary usage | Use `ameow:event:<event>` channels |
| UI Lab invents duplicate renderer-only mock components | Preview-tooling review | Preview remains representative of the real main-window UI | Drive the existing main window with real app events / runtime-command overrides |
| Non-runtime UI Lab preview leaks the live runtime indicator into download/transcode scenes | Preview-tooling review | Each preview shows only the state it is meant to demonstrate | Apply a ready runtime override for non-runtime scenarios and emit the override on every gate event while preview mode is active |
| UI Lab scenario replay reuses `shortcut-show` or renderer preview mode does not suppress minimized visuals | Preview-tooling review | Preview opens once and stays in full main-window mode without circular-shell clipping, disappearance, or first-click flicker | Keep preview activation on the dedicated `ui-lab-reset` path and force renderer visual state to full mode while preview is active |
| Renderer clears minimized/full-mode task or processing state before compact native bounds are restored during download/transcode/direct-processing | Main window enters a foreground feedback mode from compact icon mode | Foreground UI never appears cropped inside the compact native window | Restore BrowserWindow bounds first, then flip renderer state through one shared foreground-task helper |
| A stale compact/full bounds completion resolves after a newer request | Main window compact/full transition | Late async work cannot reapply stale `80x80` / `200x200` bounds or renderer state | Carry and validate a transition token across the `currentWindow.animateBounds(...)` request/response contract |
| Windows autostart reads only `openAtLogin` | Settings autostart status | UI can show enabled even when the current executable will not actually launch at login | Query the current executable path and treat `executableWillLaunchAtLogin` plus matching `launchItems.enabled` as the effective status |
| Windows autostart write path omits a stable registry name or Startup Approved state | Settings autostart toggle | Re-enabling can create drifted entries or fail to reactivate the existing startup item cleanly | Write explicit `name`, `path`, `args`, and `enabled` fields together |
| Frameless drag awaits `invoke(...)` or `set_window_position` on every pointer move | Main window drag path | Drag remains smooth and continuous | Use `currentWindow.setPosition(...)` fire-and-forget IPC, optionally RAF-batched |
| Frameless `ui-lab` window has no declared drag region | Secondary window UX | The dev-only child window can still be repositioned like the other floating surfaces | Put a drag region on the header/shell and mark action buttons as `no-drag` |
| Managed runtime manifest lookup or asset download stalls indefinitely | Runtime bootstrap path | The gate does not stay in `checking`/`downloading` forever | Add bounded manifest timeout plus progress-based download stall timeout and convert timeout to `failed` |
| WebSocket host/port changes from `127.0.0.1:39527` | Browser extension connect path | Extension reconnect logic keeps working | Keep fixed loopback endpoint |
| Request correlation omits echoed `requestId` | Extension pending-request map | Background promise resolution breaks | Echo `data.requestId` on correlated responses |
| Failure response omits `data.code` for request/response actions | Extension error handling | Background cannot classify failure reliably | Include stable `data.code` values |
| `get_config` stops returning raw JSON string | Renderer bootstrap | Theme/language/config bootstrap breaks | Keep string contract |
| Legacy rename or quality keys stop being read | Existing user config | Old installs silently change behavior | Continue reading legacy keys during migration |
| Pinterest video naming reuses repeated UI titles such as `Pin 图卡片` | Electron runtime output path selection | Distinct Pinterest downloads settle to unique final files instead of failing after the first same-title save | Derive `pinterest_<shortId>` from the Pinterest URL and reserve stems before engine execution |
| Two active downloads choose the same output stem before either file exists on disk | Electron runtime queue concurrency | Concurrent tasks do not race into one filename or produce false `output file missing` failures | Serialize stem reservation and include active reserved stems in availability checks |
| Only `.part` / `.txt` / `.json` / `.ytdl` artifacts exist for a stem | Output path allocation | Retry or cleanup metadata does not force unnecessary suffix bumps | Ignore sidecar-only artifacts when selecting the preferred final stem |
| macOS updater enabled without signed/notarized distribution | Packaged runtime | Broken or misleading in-app updates | Return `null` for unsigned macOS updater check |
| Portable Windows build advertises in-app update install | Packaged runtime | Update flow can corrupt portable expectations | Keep portable builds manual-only |
| Preload exposes raw Electron objects/functions to renderer | Security review | Renderer gets overly privileged runtime access | Expose only serializable contract surface |

### 5. Good / Base / Bad Cases

- Good:
  - Renderer code replaces `invoke(...)` / `listen(...)` imports with `window.ameow` calls while command names and payload types remain unchanged.
  - Electron renderer startup surfaces an explicit bridge-failure screen if preload is missing instead of mounting an inert app shell.
  - On Windows startup, `main` reveals at full native bounds first, then only enters compact mode through the same idle path used later in the session.
  - Electron dev startup reaches a visible `main` window on first stable paint without waiting for the full packaged-only renderer-ready handshake.
  - Non-critical startup status widgets do not mount until the initial full-window reveal has settled, but a user-triggered foreground action can still force the needed runtime refresh on demand.
  - Packaged startup reads config once for first-window theme, tray labels, and shortcut registration instead of serializing multiple config parses before the first reveal.
  - On Windows, the app exposes only the tray icon during normal idle/show-hide usage while `main`, `settings`, and other utility windows stay off the taskbar.
  - On Windows, the tray icon and any BrowserWindow icon surfaces use the Ameow app icon instead of the Electron default icon.
  - Download/transcode progress and direct-processing feedback restore `main` through one shared helper, so the full-size shell never renders inside compact native bounds.
  - Frameless main-window dragging stays smooth because pointer moves use `currentWindow.setPosition(...)` over fire-and-forget IPC instead of request/response invoke loops.
  - In development, Settings opens `ui-lab`, the lab applies `dev_ui_lab_apply_scenario`, and the real main window reflects the mocked runtime/download/transcode states.
  - Repeatedly switching UI Lab scenarios keeps the real main window in full-mode visuals, with no circular minimized shell wrapped around preview content.
  - Main/settings/context-menu can all subscribe to app events without `MaxListenersExceededWarning`.
  - Browser extension still connects to `ws://127.0.0.1:39527`, `get_language` succeeds, and `video_selected_v2` responses echo `requestId`.
  - Windows installer builds support in-app updates while portable ZIP remains manual-only.
  - macOS DMG builds stay manual-install artifacts with updater disabled cleanly.
  - Existing `settings.json` with legacy rename or quality keys still behaves the same after migration.
  - Pinterest downloads with a real title use that title first, while title-less Pinterest requests still fall back to stable names such as `pinterest_7f3a2c.mp4`.
- Base:
  - Electron main uses different implementation details internally, but renderer, config, and extension contracts stay stable.
  - Child-window creation moves out of renderer and into Electron main without changing labels or visible behavior.
  - Startup may still compact after the normal idle delay, but it does not perform a startup-only immediate shrink as part of first reveal.
  - Packaged startup may still perform native tray/shortcut setup work around first reveal, but shared config-derived startup decisions come from one snapshot instead of repeated config reads.
  - Dev-only tooling may add one extra secondary label as long as packaged builds reject it cleanly.
  - Foreground events may arrive before the first visible progress payload or before a direct-processing spinner/check state, but the window-restore ordering stays centralized.
  - Title-bearing video downloads continue using title-first stems, while title-less Pinterest requests may still use the provider-specific short-id fallback.
- Bad:
  - Windows startup reveals `main` in an `80x80` native compact shell before the user has had any full-window settle time.
  - Startup reveals the full window and then immediately forces a startup-only compact transition before the regular idle timer has a chance to govern compacting.
  - Dev startup keeps the first show blocked on a long renderer-ready handshake even though a stable first paint was already available.
  - Deferred startup checks stay delayed even after a user-triggered action needs runtime status immediately, so the first foreground action fails on missing cached state.
  - Packaged startup re-parses the same config separately for theme, tray, and shortcut setup, stretching the first visible frame for no user-visible gain.
  - `main` or `settings` shows a Windows taskbar entry even though the product is meant to behave like a tray utility.
  - Electron main loads a runtime icon path that is not shipped in packaged builds, causing Windows to show the default Electron icon.
  - A BrowserWindow enables the default sandbox while still assuming the current preload bridge will expose `window.ameow`.
  - Renderer silently falls back to plain browser behavior when the Electron bridge is missing.
  - All app events share one `"ameow:event"` channel and rely on renderer-side event-name filtering.
  - UI Lab is shipped as a production-facing route or button.
  - UI Lab preview shows status/task content while the shell is still clipped to the compact circular icon shape.
  - Download, transcode, or direct-processing feedback sets renderer full-mode state first and only resizes the native window afterward, so the panel is visibly cropped.
  - Pointer-move drag updates await `invoke(...)` round-trips.
  - Renderer starts importing `ipcRenderer` directly.
  - A random/dynamic port replaces `39527`.
  - `get_config` starts returning parsed JSON objects instead of strings.
  - `videoKeepOriginalName` stops being honored before a dedicated config migration exists.
  - Pinterest downloads still default to repeated titles like `Pin 图卡片`, so the second save can fail unless the user manually deletes the first file.
  - Output stem allocation depends only on files already present on disk and ignores other active queued/running tasks.
  - macOS unsigned builds show a working-looking auto-update button that cannot install.

### 6. Tests Required (with assertion points)

- Type checks:
  - `npm run type-check` passes with `src/types/electronBridge.ts` as the preload source of truth.
  - No post-migration renderer file introduces fresh `@tauri-apps/*` imports.
- Runtime behavior:
  - Start Electron dev for `main`, `settings`, `context-menu`, and `ui-lab` and assert `window.ameow` exists before the normal UI boot path continues.
  - On Windows first launch, assert `main` reveals at `200x200` native bounds and does not immediately shrink to compact before the normal idle timeout expires.
  - In Electron dev, cold-start the app and assert `main` becomes visible on the first stable paint without waiting for tray/shortcut bootstrap completion.
  - Leave the startup-full window before the first idle compact and assert the app re-arms idle compact instead of collapsing immediately on that first pointer leave.
  - After the first idle compact has happened, hover-expand and pointer-leave `main` again and assert the normal immediate compact interaction still works.
  - Confirm runtime status/gate refresh and app update checks do not mount visible startup status indicators until the initial full-window reveal settle delay has elapsed.
  - Trigger a Pinterest download before the deferred startup runtime refresh has naturally run and assert the renderer fetches runtime state on demand instead of failing only because cached status is still `null`.
  - Repeatedly open/close compact windows during startup or reveal wait and assert the main process does not throw `TypeError: Object has been destroyed`.
  - Temporarily break preload availability and assert the renderer shows an explicit bridge-failure state instead of a half-working UI shell.
  - Inspect packaged `dist/index.html` and assert script/stylesheet URLs are relative (`./assets/...`) before using that build for `file://` BrowserWindow validation.
  - On packaged startup, log or inspect the boot path and assert theme/tray/shortcut setup all consume one startup-config snapshot instead of independently re-reading config before `main` is shown.
  - Close `main` and assert the app hides instead of quitting.
  - On packaged Windows, launch the app normally and assert `main` and `settings` keep the transparent-shell path; then enable the diagnostic opaque override and assert the escape hatch still forces the opaque path when explicitly requested.
  - On Windows, show/hide `main` from the tray and assert the app does not create a taskbar button for `main`.
  - On Windows, open `settings` from the tray and assert it stays off the taskbar unless a future window explicitly opts into taskbar visibility.
  - Launch a second instance and assert the existing `main` window is focused/shown.
  - Open `settings` and `context-menu` and assert label-based focus/close behavior still works.
  - On Windows, assert the tray icon and BrowserWindow icon surfaces use the Ameow app icon instead of the default Electron icon in both dev and packaged runs.
  - In development, open `ui-lab`, apply each preset, and assert the main window updates through the real runtime/download/transcode UI.
  - In development, click multiple UI Lab scenario buttons back-to-back and assert the first click reveals the main preview without needing retries or producing a circular minimized shell.
  - Open `ui-lab` and assert the header can drag the frameless child window while the close button remains clickable.
  - Start from compact icon mode, trigger download progress, and assert `main` returns to full native bounds before the full task panel becomes visible.
  - Start from compact icon mode, trigger transcode progress, and assert the same no-crop restore contract holds.
  - Start from compact icon mode, trigger a direct image/file processing path, and assert the processing feedback UI does not render inside compact native bounds.
  - Keep `main` already expanded and emit repeated download/transcode progress updates; assert no redundant full-size resize loop or focus steal occurs.
  - With live managed runtimes missing, apply a non-runtime UI Lab preset and assert no runtime indicator leaks into the preview; then apply a runtime preset and assert the runtime indicator still appears with the mocked gate payload.
  - Reset from `ui-lab` and assert the main window clears preview state and refreshes live runtime context.
  - In a packaged build, assert UI Lab entry points are not exposed and direct IPC attempts are rejected.
  - Drag the frameless main window continuously and assert movement remains smooth without getting stuck mid-drag.
  - Simulate a stalled runtime manifest request or stalled runtime asset download and assert the gate transitions to `failed` within the timeout window instead of remaining active indefinitely.
  - Repeatedly open UI surfaces that subscribe to app events and assert the Electron process does not emit `MaxListenersExceededWarning`.
  - Queue two concurrent Pinterest downloads with different pin URLs but the same title and assert `context.outputStem` resolves to distinct `pinterest_<shortId>` values.
  - Pre-create `pinterest_<shortId>.mp4` in the output directory, queue the same Pinterest download again, and assert the next run resolves a suffixed final name instead of failing before settlement.
  - Leave only `pinterest_<shortId>.txt` / `.part` sidecar artifacts in the output directory and assert the next Pinterest run still chooses the unsuffixed `pinterest_<shortId>` final stem.
- Extension compatibility:
  - Start the desktop runtime and assert the extension connects to `ws://127.0.0.1:39527`.
  - Send `get_language` and assert a `language_info` response.
  - Send `video_selected_v2` with `requestId` and assert the response echoes `requestId`.
- Config compatibility:
  - Start from a config file containing `videoKeepOriginalName`, `ytdlpQualityPreference`, and `clipDownloadMode` and assert behavior still matches current semantics.
  - Start from the legacy config path and assert one-time migration to the current app config directory still occurs.
- Packaging / updater:
  - Windows NSIS build surfaces updater availability only for installed builds.
  - Windows portable build does not advertise in-app updater install.
  - macOS unsigned build resolves no available in-app updater path and still exposes manual release links.

### 7. Wrong vs Correct

#### Wrong

```ts
import { ipcRenderer } from "electron";
import { invoke } from "@tauri-apps/api/core";

const config = await ipcRenderer.invoke("get-config-json");
const win = new BrowserWindow();
```

```ts
const ws = new WebSocket(`ws://127.0.0.1:${Math.floor(Math.random() * 10000)}`);
```

#### Correct

```ts
const configStr = await window.ameow!.commands.invoke<string>("get_config");
const hasSettings = await window.ameow!.windows.has("settings");

if (!hasSettings) {
  await window.ameow!.windows.openSettings({
    title: "Settings",
    width: 360,
    height: 420,
    center: true,
    alwaysOnTop: true,
  });
}
```

```ts
const ws = new WebSocket("ws://127.0.0.1:39527");
```

```ts
setIsMinimized(false);
await currentWindow.animateBounds({ x, y, width: 200, height: 200 });
```

Why wrong:
- Renderer can render full-size task content while the native window is still compact-sized.
- Separate task paths can drift if each listener owns its own restore sequence.

```ts
await prepareMainWindowForForegroundTask();
setDownloadProgressByTrace((current) => ({
  ...current,
  [payload.traceId]: payload,
}));
```

## Scenario: Packaged Electron Main Helper Inclusion Contract

### 1. Scope / Trigger

- Trigger: Any task that adds, renames, or refactors a helper module imported by `electron/main.mts`, `electron/preload.mts`, or another file compiled into `dist-electron/`.
- Why this needs code-spec depth: Packaged Electron builds execute `dist-electron/electron/*.mjs`, not the source `electron/` directory. A helper can exist in source and still be missing from the installed app if it is outside the Electron TypeScript emit contract.

### 2. Signatures

Electron main import signature example:

```ts
import { applyMacTrayAppMode } from "./macAppVisibility.mjs";
```

Electron compile boundary:

```json
{
  "include": ["electron/**/*.mts"],
  "outDir": "dist-electron"
}
```

Packaged runtime file paths:

```txt
dist-electron/electron/main.mjs
dist-electron/electron/macAppVisibility.mjs
dist-release/<target>/Ameow.app/Contents/Resources/app/dist-electron/electron/macAppVisibility.mjs
```

### 3. Contracts

- Any module that `electron/main.mts` or `electron/preload.mts` statically imports at runtime must exist in `dist-electron/electron/` with the same emitted `.mjs` path.
- Source helpers owned by the Electron build must live inside the `tsconfig.electron.json` include contract, or the same task must add an explicit copy step that produces the packaged runtime file.
- Do not leave a runtime-owned helper only as `electron/<name>.mjs` source if `tsconfig.electron.json` only emits `electron/**/*.mts`.
- `electron-builder` packaging is downstream of the compile step. If `dist-electron/electron/<name>.mjs` is missing before packaging, the installed app will still be missing that file.
- When converting a helper from source `.mjs` to `.mts`, keep the runtime import in compiled modules as `./<name>.mjs` so NodeNext output and packaged Electron resolve the emitted file correctly.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Helper source is inside Electron TypeScript emit contract | `npm run electron:build` then inspect `dist-electron/electron/` | Emitted `.mjs` helper exists and packaged startup can resolve it | OK |
| Helper is imported by `main.mts` but left outside `tsconfig.electron.json` include globs | Launch packaged app or import `dist-electron/electron/main.mjs` | Startup can fail with `ERR_MODULE_NOT_FOUND` for the helper path | Move helper into emitted source set or add explicit copy step |
| Helper exists in source but not in packaged `Resources/app/dist-electron/electron/` | Inspect packaged app contents after `npm run package:dir` | Packaged app is invalid even if source tree looks complete | Treat as build contract failure, not a machine-specific runtime bug |
| Helper is converted to `.mts` but imports are changed to `.mts` in runtime code | `npm run type-check` / packaged startup | NodeNext output can drift from actual emitted packaged path | Keep runtime import specifier `.mjs` |

### 5. Good / Base / Bad Cases

- Good:
  - `electron/macAppVisibility.mts` is included by `tsconfig.electron.json`, `npm run electron:build` emits `dist-electron/electron/macAppVisibility.mjs`, and packaged startup resolves the import successfully.
- Base:
  - A helper needs to stay plain `.mjs` source for a specific reason, and the same task adds a deterministic copy step plus a packaging assertion that the file lands in `dist-electron/electron/`.
- Bad:
  - `electron/main.mts` imports `./macAppVisibility.mjs`, but only `electron/macAppVisibility.mjs` exists in source and no emitted `dist-electron/electron/macAppVisibility.mjs` is produced.
  - A release build passes local source inspection but the installed app crashes on first launch because the helper never entered `dist-electron`.

### 6. Tests Required (with assertion points)

- `npm run type-check`: Electron TypeScript sources compile cleanly after moving or adding the helper.
- `npm run electron:build`: `dist-electron/electron/<helper>.mjs` exists after the build.
- `node -e "import('./dist-electron/electron/<helper>.mjs')..."`: emitted helper can be resolved directly by Node ESM.
- `npm run package:dir`: packaged app is created successfully from the same build chain used in release automation.
- Inspect packaged app contents: `Contents/Resources/app/dist-electron/electron/<helper>.mjs` exists in the packaged app.
- Manual assertion (packaged macOS build): first launch does not show a main-process `ERR_MODULE_NOT_FOUND` dialog for a missing Electron helper module.

### 7. Wrong vs Correct

#### Wrong

```ts
// electron/main.mts
import { applyMacTrayAppMode } from "./macAppVisibility.mjs";

// Source file exists only as electron/macAppVisibility.mjs
// tsconfig.electron.json still emits only electron/**/*.mts
```

#### Correct

```ts
// electron/main.mts
import { applyMacTrayAppMode } from "./macAppVisibility.mjs";

// Source file lives at electron/macAppVisibility.mts
// tsc emits dist-electron/electron/macAppVisibility.mjs
```

Why wrong:
- The source tree looks valid, but the packaged runtime executes `dist-electron/electron/main.mjs`, where the imported helper does not exist.
- GitHub Actions and local packaging both reproduce the same broken artifact because they package `dist-electron/**/*`, not arbitrary source helpers.

## Scenario: Short-Link Expansion Contract For Electron Downloads

### 1. Scope / Trigger

- Trigger: Any task that changes short-link expansion, wrapper URL handling, or pre-download URL normalization for Electron-owned video downloads.
- Why this needs code-spec depth: This flow crosses renderer paste/drop input, Electron main networking/navigation, runtime provider routing, and downloader engine selection. Silent drift at any stage can surface as downloader `Unsupported URL` failures even when the visible input looked correct.

### 2. Signatures

Electron runtime environment extension:

```ts
interface ElectronRuntimeEnvironment {
  fetch?: typeof fetch;
  resolveUrlViaNavigation?(url: string): Promise<string | undefined>;
}
```

Runtime short-link entrypoint:

```ts
resolveShortLinkDownloadInput(
  input: RawDownloadInput,
  fetchImpl?: typeof fetch,
  resolveViaNavigation?: (url: string) => Promise<string | undefined>,
): Promise<RawDownloadInput>
```

Electron main hidden-navigation resolver:

```ts
async function resolveUrlViaHiddenNavigation(targetUrl: string): Promise<string | undefined>
```

Key files:

```txt
src/electron-runtime/shortLinkResolution.ts
src/electron-runtime/service.ts
src/electron-runtime/contracts.ts
electron/main.mts
src/sites/weibo.ts
src/sites/gallery-dl-support.ts
```

### 3. Contracts

- Runtime-owned video downloads must normalize wrapper/short URLs before provider resolution in `src/electron-runtime/service.ts`.
- Resolution order is:
  1. unwrap known wrapper query targets locally (`passport.weibo.com/...url=...` and similar)
  2. try lightweight redirect-following fetch (`HEAD`, then `GET`)
  3. if fetch still cannot reveal a stable final URL, call `environment.resolveUrlViaNavigation(...)`
- `resolveUrlViaNavigation(...)` is optional at the runtime-core boundary so `src/electron-runtime/` stays free of direct `electron` imports.
- Electron main owns the navigation fallback implementation:
  - create a hidden `BrowserWindow`
  - use an isolated ephemeral `partition`
  - `show: false`, `skipTaskbar: true`, `nodeIntegration: false`, `contextIsolation: true`, `sandbox: false`
  - observe navigation events and settle on the latest navigated URL after a bounded idle delay
  - always destroy the hidden window and clear the temporary session storage afterward
- Fetch-only resolution is insufficient for some sites. If a short-link host or wrapper page requires full browser navigation/JS/meta refresh/cookie handoff, the Electron main fallback is the source of truth.
- Weibo-specific routing contract:
  - `weibo.com/detail/...`, `status/...`, and `layerid`-style URLs stay `gallery-dl`-first
  - `weibo.com/tv/show/...` must not be routed to `gallery-dl` primary, because `gallery-dl` rejects those URLs as unsupported
  - `passport.weibo.com/visitor/...` must be unwrapped before engine selection; neither `gallery-dl` nor `yt-dlp` should receive the wrapper URL as the final source URL
- Renderer drag/drop image downloads should pass `pageUrl` when the dragged image URL came from a host page context, so Electron main can derive `Referer` for hotlink-sensitive image hosts such as `sinaimg.cn`.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Wrapper URL already contains a usable `url=` target | `resolveShortLinkDownloadInput(...)` | Runtime returns the unwrapped target without navigation fallback | OK |
| `HEAD` reveals final URL directly | fetch redirect attempt | Runtime uses the final URL and skips GET/navigation fallback | OK |
| `HEAD`/`GET` keep returning the short host or middle wrapper | runtime short-link resolution | Runtime calls `resolveUrlViaNavigation(...)` before provider resolution | Use hidden navigation fallback |
| Hidden navigation reaches a stable `tv/show` URL | Electron main fallback | Runtime hands `weibo.com/tv/show/...` to the Weibo provider, which routes it to `yt-dlp` | OK |
| Downloader still receives `passport.weibo.com/visitor/...` | engine execution context | Short-link normalization contract failed before provider routing | Debug short-link resolution; do not “force yt-dlp” on the wrapper URL |
| Dragged Sina image URL is valid but host requires referer | `download_image` flow | Renderer passes `pageUrl`, Electron derives `Referer`/`Origin`, image download succeeds | Preserve page context on image drags |

### 5. Good / Base / Bad Cases

- Good:
  - Pasting `http://t.cn/...` logs a resolved `weibo.com/tv/show/...` URL and queues a Weibo `yt-dlp` plan.
  - Pasting a direct `passport.weibo.com/visitor?...url=...` wrapper resolves to the inner `tv/show` URL before provider routing.
  - Dragging a `wx*.sinaimg.cn/...jpg` image from a page sends the image URL plus source page URL so Electron main can fetch it with a valid referer.
- Base:
  - Fetch-only resolution works for ordinary short-link hosts, while the hidden-navigation fallback is reserved for fetch-resistant sites.
  - Runtime core remains Electron-agnostic by depending on an injected `resolveUrlViaNavigation(...)` callback.
- Bad:
  - Runtime silently leaves `passport.weibo.com/visitor/...` unchanged and sends it into downloader engines.
  - `weibo.com/tv/show/...` is still routed to `gallery-dl` primary.
  - Dragged hotlink-sensitive image URLs lose their `pageUrl`, so `download_image` runs without the expected referer context.

### 6. Tests Required (with assertion points)

- `npm run type-check`
  - `ElectronRuntimeEnvironment.resolveUrlViaNavigation` compiles through Electron main and runtime-core boundaries.
- `npm run test -- src/electron-runtime/shortLinkResolution.test.ts`
  - wrapper URLs unwrap correctly
  - navigation fallback resolves when fetch stalls on the short host
- `npm run test -- src/electron-runtime/service.test.ts`
  - runtime uses navigation fallback to reach a final Weibo `tv/show` URL before provider routing
- `npm run test -- src/sites/providers.test.ts`
  - `weibo.com/tv/show/...` plans resolve to `yt-dlp`
  - direct visitor wrappers unwrap to the inner `tv/show` URL
- Manual assertion (Electron dev):
  - paste a real `t.cn` Weibo short link and confirm downloader no longer receives `passport.weibo.com/visitor/...`
  - drag a real `wx*.sinaimg.cn/...jpg` image and confirm image save succeeds

### 7. Wrong vs Correct

#### Wrong

```ts
const resolved = await resolveShortLinkDownloadInput(input, fetchImpl);
// fetch failed to move past visitor wrapper, but runtime still executes the wrapper URL
```

#### Correct

```ts
const resolved = await resolveShortLinkDownloadInput(
  input,
  fetchImpl,
  environment.resolveUrlViaNavigation,
);
// wrapper/short host is upgraded to a stable final URL before provider routing
```

Why wrong:
- `fetch` can succeed while still returning only the middle wrapper URL.
- Once the wrapper URL reaches engine execution, both `gallery-dl` and `yt-dlp` can fail with `Unsupported URL`.

## Scenario: Electron ESM Main Initialization-Order Contract

### 1. Scope / Trigger

- Trigger: Any task that changes top-level imports, singleton/controller creation, or dependency wiring in `electron/main.mts`.
- Why this needs code-spec depth: Electron executes the emitted ESM main file before any renderer is available. Initialization-order mistakes compile successfully but crash the desktop app during load.

### 2. Signatures

Top-level dependency patterns:

```ts
// Safe before declaration because this is a function declaration.
function emitAppEvent(event: string, payload: unknown): void;

// Not safe before declaration because this is a const binding.
const readConfigObject = configStore.readConfigObject;
const updateTrayMenu = trayMenuController.updateTrayMenu;
```

## Scenario: YouTube yt-dlp Quality Mode Contract

### 1. Scope / Trigger

- Trigger: Any task that changes YouTube `yt-dlp` extractor args, `YtdlpQualityPreference`, format selectors, or initial/retry mode selection in `src/electron-runtime/ytDlpDownload.ts`.
- Why this needs code-spec depth: YouTube format availability depends on extractor client mode. A command can succeed while exposing only low-resolution progressive MP4 formats, causing a user-selected `balanced` download to silently save 360p.

### 2. Signatures

Quality preferences:

```ts
type YtdlpQualityPreference = "best" | "balanced" | "data_saver";
type YouTubeMode = "light" | "extended";
```

Mode owners:

```txt
src/electron-runtime/ytDlpDownload.ts
src/electron-runtime/ytDlpCommandPlan.ts
src/electron-runtime/engineManifest.ts
```

### 3. Contracts

- YouTube downloads must start in `extended` mode for every quality profile unless a future measured replacement proves equal format availability and stability.
- Cookies or `extensionData.youtube.forceExtended === true` must force `extended` mode regardless of quality.
- `light` mode uses `youtube:player_client=android,web` and may expose only format `18` (640x360 progressive MP4) for some videos.
- `extended` mode uses `youtube:player_js_variant=tv`, remote EJS components, and JS runtimes when available; it is the stable default expected to expose adaptive formats and handle current YouTube extractor challenges.
- `balanced` selector remains capped at `height<=1080`, but mode selection must ensure the selector has adaptive formats to choose from.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| YouTube `balanced`, no cookies | `runYtDlpDownload(...)` args | First attempt includes `youtube:player_js_variant=tv` and `--remote-components ejs:github` | OK |
| YouTube `best`, plain URL | `runYtDlpDownload(...)` args | First attempt uses `extended` mode | OK |
| YouTube `data_saver`, no cookies | `runYtDlpDownload(...)` args | First attempt uses `extended` mode | OK |
| Light-mode YouTube attempt succeeds with only 360p for `balanced` | manual simulation / output filename | Contract failure | Start `balanced` in `extended` |

### 5. Good / Base / Bad Cases

- Good: `balanced` for `https://www.youtube.com/watch?v=UBqh6ud5LqY` selects `299+140` (1920x1080 video + m4a audio) under `--simulate`.
- Base: `data_saver` still uses the data-saver format selector but starts in `extended` mode for extractor stability.
- Bad: `balanced` starts in `light`, sees only `18 640x360`, exits successfully, and saves `...[640x360][balanced].mp4`.

### 6. Tests Required

- `npm test -- src/electron-runtime/ytDlpDownload.test.ts`: assert YouTube `best`, `balanced`, and `data_saver` use extended args by default.
- `npm test -- src/electron-runtime/engineManifest.test.ts src/electron-runtime/ytDlpCommandPlan.test.ts`: format selector and command-plan contracts remain stable.
- `npm run type-check`
- `npm run lint`
- Manual assertion with managed `yt-dlp --simulate`: the current balanced selector plus extended YouTube args selects an adaptive 1080p format for a known reproducer.

### 7. Wrong vs Correct

#### Wrong

```ts
if (context.intent.cookies?.trim()) {
  return "extended";
}
return "light";
```

#### Correct

```ts
if (context.intent.cookies?.trim()) {
  return "extended";
}
return "extended";
```

## Scenario: Site-Scoped yt-dlp Quality Profile Contract

### 1. Scope / Trigger

- Trigger: Any task that changes `best`, `balanced`, or `data_saver` format selectors for `yt-dlp` downloads.
- Why this needs code-spec depth: The UI exposes three global quality preferences, but each site exposes different format families. The mapping from preference to selector must be table-driven per site to avoid scattered conditionals.

### 2. Signatures

```ts
type YtdlpFormatProfileSet = Record<YtdlpQualityPreference, YtdlpFormatProfile>;
type YtdlpSiteFormatProfiles = Record<string, YtdlpFormatProfileSet>;
```

Resolver boundary:

```ts
resolveYtdlpFormatProfile(
  quality: YtdlpQualityPreference | undefined,
  hasFfmpeg: boolean,
  options?: { isYouTube?: boolean; siteId?: string },
): YtdlpFormatProfile
```

### 3. Contracts

- `src/electron-runtime/engineManifest.ts` owns `YTDLP_SITE_FORMAT_PROFILES`.
- `default` must define `best`, `balanced`, and `data_saver`.
- Every site-specific profile, such as `youtube`, must define all three quality preferences.
- Unknown `siteId` values must fall back to `default`.
- URL-level YouTube detection may force the `youtube` profile even when `siteId` is missing or generic.
- `src/electron-runtime/ytDlpCommandPlan.ts` may pass `siteId` and URL-derived booleans into the resolver, but must not contain per-site selector switch branches.
- No-FFmpeg fallback profiles may stay generic because they intentionally avoid merge-only adaptive selectors.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| `siteId: "youtube"` with `balanced` | `resolveYtdlpFormatProfile(...)` | Returns YouTube-specific balanced selector | OK |
| YouTube URL but missing/generic `siteId` | `isYouTube: true` option | Returns YouTube-specific selector | OK |
| Unknown site id | resolver fallback | Returns `default` selector set | OK |
| New site profile missing one quality key | TypeScript compile | Type error via `YtdlpFormatProfileSet` | Add the missing profile |
| Per-site selector logic added to `ytDlpCommandPlan.ts` | code review/tests | Contract violation | Move selector data into `YTDLP_SITE_FORMAT_PROFILES` |

### 5. Good / Base / Bad Cases

- Good: Adding Bilibili-specific `balanced` means adding a `bilibili` entry with `best`, `balanced`, and `data_saver` selectors in `YTDLP_SITE_FORMAT_PROFILES`.
- Base: Twitter/X has no custom profile yet, so `siteId: "twitter-x"` uses `default`.
- Bad: `createYtdlpCommandPlan(...)` switches on `context.intent.siteId` to choose raw selector strings.

### 6. Tests Required

- `npm test -- src/electron-runtime/engineManifest.test.ts`: site-specific profile, URL-forced YouTube profile, unknown-site fallback, and no-FFmpeg fallback.
- `npm test -- src/electron-runtime/ytDlpCommandPlan.test.ts`: command planning passes site context without changing argument ordering.
- `npm run type-check`
- `npm run lint`

### 7. Wrong vs Correct

#### Wrong

```ts
if (context.intent.siteId === "youtube") {
  selector = "...";
}
```

#### Correct

```ts
const formatProfile = resolveYtdlpFormatProfile(
  context.intent.ytdlpQuality,
  Boolean(context.binaries.ffmpeg),
  { isYouTube: youtubeUrl, siteId: context.intent.siteId },
);
```

Runtime import contract:

```ts
import { dirname, join, resolve } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
```

### 3. Contracts

- `electron/main.mts` top-level code must be ordered so any immediately read `const`/`let` dependency is declared before it is passed into a controller.
- Top-level option objects may reference function declarations declared later, but must not reference later `const`/`let` bindings by value.
- If a controller must call a later `const`/`let` dependency, pass a lazy callback and ensure the callback is only invoked after assignment:

```ts
refreshTrayMenu(startupConfigSnapshot) {
  return updateTrayMenu(startupConfigSnapshot);
}
```

- `electron/main.mts` uses `// @ts-nocheck`; every Node helper called directly at top level must be explicitly imported because `npm run type-check` will not catch missing imports in that file.
- `npm run dev` is the startup assertion for this contract, not only `npm run type-check`.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Missing direct import for a top-level helper | Electron load | `ReferenceError: <name> is not defined` | Import the helper from its Node module or local module |
| Controller reads a later `const`/`let` binding | Electron load | `ReferenceError: Cannot access '<name>' before initialization` | Move construction after the binding or pass a lazy callback |
| Controller receives a later function declaration | Electron load | Function is available during module evaluation | OK |
| Lazy callback references a later binding but is invoked after assignment | Runtime call site | Callback succeeds | OK |
| Lazy callback can run during controller construction | Electron load | Same TDZ risk as direct reference | Move construction or refactor controller setup |

### 5. Good / Base / Bad Cases

- Good: `createAppUpdateController({ readConfigObject })` is called after `const readConfigObject = configStore.readConfigObject`.
- Base: `createConfigStore({ emitAppEvent })` can appear before `function emitAppEvent(...)` because function declarations are initialized before ESM evaluation.
- Bad: `createConfigStore({ refreshTrayMenu: updateTrayMenu })` appears before `const updateTrayMenu = trayMenuController.updateTrayMenu`.
- Bad: `dirname(fileURLToPath(...))` is used while only `join` and `resolve` are imported from `node:path`.

### 6. Tests Required

- `npm run type-check`: emitted declarations and non-ignored modules compile.
- `npm run lint`: renderer lint remains clean.
- `npm test`: Electron runtime unit tests remain green.
- `npm run electron:build`: ESM output includes direct imports for helpers used at top level.
- Manual assertion: `npm run dev` reaches normal Electron startup logs such as `>>> [WS] Server started: ws://127.0.0.1:39527` without `App threw an error during load`.

### 7. Wrong vs Correct

#### Wrong

```ts
const appUpdateController = createAppUpdateController({
  readConfigObject,
});

const configStore = createConfigStore(...);
const readConfigObject = configStore.readConfigObject;
```

#### Correct

```ts
const configStore = createConfigStore(...);
const readConfigObject = configStore.readConfigObject;

const appUpdateController = createAppUpdateController({
  readConfigObject,
});
```

#### Wrong

```ts
const configStore = createConfigStore({
  refreshTrayMenu: updateTrayMenu,
});

const updateTrayMenu = trayMenuController.updateTrayMenu;
```

#### Correct

```ts
const configStore = createConfigStore({
  refreshTrayMenu(startupConfigSnapshot) {
    return updateTrayMenu(startupConfigSnapshot);
  },
});

const updateTrayMenu = trayMenuController.updateTrayMenu;
```

## Scenario: Site Session Badge Cookie Capture Contract

### 1. Scope / Trigger

- Trigger: Any task that adds a login badge site, changes site session IPC, changes app-owned cookie storage, or routes stored cookies into downloader execution.
- Why this needs code-spec depth: The flow crosses Settings UI, typed preload commands, Electron `BrowserWindow` login capture, persisted app data, and `yt-dlp` / `gallery-dl` cookie-file execution.

### 2. Signatures

Renderer command names:

```ts
type SiteSessionCommand =
  | "get_site_session_state"
  | "start_site_session_capture"
  | "complete_site_session_capture"
  | "cancel_site_session_capture"
  | "clear_site_session";
```

Payload and state:

```ts
type SupportedSiteSessionId =
  | "douyin"
  | "bilibili"
  | "xiaohongshu"
  | "youtube";

type SiteSessionAvailability = "missing" | "partial" | "ready";
type SiteSessionCapturePhase = "idle" | "preparing" | "awaiting_confirmation";

type SiteSessionState = {
  siteId: SupportedSiteSessionId | string;
  availability: SiteSessionAvailability;
  updatedAtMs: number | null;
  cookieCount: number;
  requiredKeys: string[];
  missingRequiredKeys: string[];
  lastError: string | null;
  sessionFilePath: string | null;
  capturePhase: SiteSessionCapturePhase;
  captureStartedAtMs: number | null;
  capturePid: number | null;
};
```

Site config source of truth:

```ts
type SiteSessionConfig = {
  id: SupportedSiteSessionId;
  displayName: string;
  labelKey: string;
  loginUrl: string;
  cookieDomains: string[];
  requiredCookieKeys: string[];
  loginCookieKeys: string[];
};
```

### 3. Contracts

- `src/site-sessions.ts` owns the supported site list, login URL, allowed cookie domains, and required/login cookie keys.
- `electron/siteSessionManager.mts` owns persisted session files under `<userDataDir>/site-sessions/<siteId>.json`.
- Stored sessions must include a Netscape cookie string because downloader execution consumes cookie files, not Electron cookie jars.
- Electron capture uses a real visible login window and user confirmation. Do not claim silent auto-login or background refresh unless an explicit browser-profile reuse contract is added.
- Settings badges are site-level pills whose primary visible content is icon, localized site name, and one status: `已登录` / `失效` / `未登录` in Chinese or the localized equivalent.
- Badge click behavior is unified for every site: start a manual capture/refresh flow. The app may label ready-state clicks as refresh, but they still open the same confirmation-based capture path.
- `buildExecutionContext(...)` may replace `intent.cookies` with the app-owned Netscape cookie string when `context.intent.siteId` has a saved site session. Browser-extension video download payloads must not provide cookies as a fallback; users should capture site login state from Settings for managed downloader cookies.
- Legacy Douyin IPC commands must remain backward-compatible aliases to the site-session manager for `douyin`.

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| Unsupported `siteId` in a site-session command | Reject with `Unsupported site session: <siteId>` |
| No stored file or invalid stored JSON | Return `availability: "missing"` and `sessionFilePath: null` |
| Stored cookies miss required keys or login marker keys | Return `availability: "partial"` |
| Stored cookies satisfy required keys and at least one login marker key when configured | Return `availability: "ready"` |
| Confirm capture finds no cookies for allowed domains | Keep prior session cache, set `lastError`, close and destroy the capture partition |
| User cancels/closes capture window | Return to `capturePhase: "idle"` and destroy the capture partition |
| Downloader context has `siteId` with saved session | Inject saved Netscape cookies into `intent.cookies` |
| Downloader context has no saved site session | Queue without app-owned cookies; extension video download payloads must not synthesize cookies |

### 5. Good/Base/Bad Cases

- Good: Adding another supported site means adding one `SITE_SESSION_CONFIGS` entry, one localized label, and one local icon mapping while reusing the same IPC commands and badge component behavior.
- Base: YouTube has no strict `requiredCookieKeys`; login marker cookies determine whether captured cookies are complete enough.
- Bad: Adding `get_bilibili_session_state` or a Bilibili-only manager duplicates the Douyin migration surface instead of extending the site-scoped contract.
- Bad: Storing only a `Cookie:` header breaks `yt-dlp` / `gallery-dl` cookie-file execution.

### 6. Tests Required

- `npm run type-check`: `SupportedSiteSessionId`, bridge command names, and Settings command payloads compile.
- `npm run lint`: Settings badge rendering and icon mappings remain lint-clean.
- `npm test`: existing Electron runtime downloader cookie-file behavior remains green.
- Manual Electron assertion: start capture for each supported site, confirm after logging in, and verify the badge moves to ready or partial based on configured cookie keys.

### 7. Wrong vs Correct

#### Wrong

```ts
await desktopCommands.invoke("start_bilibili_session_capture");
```

#### Correct

```ts
await desktopCommands.invoke("start_site_session_capture", { siteId: "bilibili" });
```

#### Wrong

```ts
intent.cookies = "SESSDATA=...";
```

#### Correct

```ts
intent.cookies = storedSession.cookiesNetscape;
```
