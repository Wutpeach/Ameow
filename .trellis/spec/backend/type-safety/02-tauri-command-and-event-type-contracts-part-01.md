## Scenario: Tauri Command and Event Type Contracts

_Part 1 of 2._


### 1. Scope / Trigger

- Trigger: Any change to `#[tauri::command]` signatures, serde structs emitted to frontend, or command/event names.
- Why this needs code-spec depth: These are cross-layer contracts (`Rust` -> `Tauri transport` -> `TypeScript`) that can compile but still fail at runtime if field names/types drift.

### 2. Signatures

Command boundary signatures (current canonical patterns):

```rust
#[tauri::command]
fn get_config(app: tauri::AppHandle) -> Result<String, String>

#[tauri::command]
fn save_config(app: tauri::AppHandle, json: String) -> Result<(), String>

#[tauri::command]
async fn download_video(app: AppHandle, url: String) -> Result<DownloadResult, String>

#[tauri::command]
async fn check_ytdlp_version(app: AppHandle) -> Result<YtdlpVersionInfo, String>

#[tauri::command]
async fn get_gallery_dl_info(app: AppHandle) -> Result<GalleryDlInfo, String>
```

Event payload signatures:

```rust
#[derive(serde::Serialize, Clone)]
pub struct DownloadResult {
    pub success: bool,
    pub file_path: Option<String>,
    pub error: Option<String>,
}

#[derive(serde::Serialize, Clone)]
pub struct DownloadProgress {
    pub percent: f32,
    pub stage: String, // "preparing" | "downloading" | "merging" | "post_processing"
    pub speed: String,
    pub eta: String,
}

#[derive(serde::Serialize, Clone)]
pub struct YtdlpVersionInfo {
    pub current: String,
    pub latest: Option<String>,
    #[serde(rename = "updateAvailable")]
    pub update_available: Option<bool>,
    #[serde(rename = "latestError")]
    pub latest_error: Option<String>,
}

#[derive(serde::Serialize, Clone)]
pub struct GalleryDlInfo {
    pub current: String,
    pub source: String,
    pub path: Option<String>,
    #[serde(rename = "updateChannel")]
    pub update_channel: String,
}
```

### 3. Contracts

#### Command Contracts

| Command | Rust Return Type | Required Frontend Expectation |
|---------|------------------|-------------------------------|
| `get_config` | `Result<String, String>` | `invoke<string>("get_config")` then JSON parse |
| `save_config` | `Result<(), String>` | `invoke<void>("save_config", { json })` |
| `open_current_output_folder` | `Result<(), String>` | `invoke<void>("open_current_output_folder")` |
| `export_support_log` | `Result<String, String>` | `invoke<string>("export_support_log")` |
| `get_gallery_dl_info` | `Result<GalleryDlInfo, String>` | `invoke<{ current: string; latest: string \| null; updateAvailable: boolean \| null; latestError: string \| null; source: "managed" \| "missing"; path: string \| null; updateChannel: "managed_python_package" \| "unavailable" }>("get_gallery_dl_info")` |
| `download_video` | `Result<DownloadResult, String>` | `invoke<{ traceId: string; success: boolean; file_path?: string; error?: string }>(...)` |
| `queue_pasted_video_download` | `Result<QueuedVideoDownloadAck, String>` | `invoke<{ accepted: boolean; traceId: string }>("queue_pasted_video_download", { url, pageUrl?, siteHint? })` |
| `queue_video_download` | `Result<QueuedVideoDownloadAck, String>` | `invoke<{ accepted: boolean; traceId: string }>("queue_video_download", { url, pageUrl?, videoUrl?, videoCandidates? })` |
| `check_ytdlp_version` | `Result<YtdlpVersionInfo, String>` | `invoke<{ current: string; latest: string \| null; updateAvailable: boolean \| null; latestError: string \| null; source?: "managed" \| "bundled" \| "missing"; path?: string \| null; pythonVersion?: string \| null; pythonPath?: string \| null; pythonSupportsLatestStable?: boolean \| null; updateChannel?: "managed_python_package" \| "unavailable" }>(...)` |
| `get_runtime_dependency_status` | `RuntimeDependencyStatusSnapshot` | `invoke<{ ytDlp: { state: "ready" \| "missing"; source: "bundled" \| "managed" \| null; expectedSource?: "bundled" \| "managed" \| null; fallbackSource?: "bundled" \| "managed" \| null; path: string \| null; fallbackPath?: string \| null; error: string \| null }; galleryDl: ...; ffmpeg: ...; deno: ... }>("get_runtime_dependency_status")` |
| `get_runtime_dependency_gate_state` | `RuntimeDependencyGateStatePayload` | `invoke<{ phase: "idle" \| "checking" \| "awaiting_confirmation" \| "downloading" \| "ready" \| "blocked_by_user" \| "failed"; missingComponents: string[]; lastError: string \| null; updatedAtMs: number; currentComponent: "ytDlp" \| "ffmpeg" \| "deno" \| null; currentStage: "checking" \| "downloading" \| "verifying" \| "installing" \| null; progressPercent: number \| null; downloadedBytes: number \| null; totalBytes: number \| null; nextComponent: "ytDlp" \| "ffmpeg" \| "deno" \| null }>("get_runtime_dependency_gate_state")` |
| `refresh_runtime_dependency_gate_state` | `RuntimeDependencyGateStatePayload` | Inspection-only refresh of current runtime readiness; must not auto-start downloads |
| `start_runtime_dependency_bootstrap` | `RuntimeDependencyGateStatePayload` | Starts managed-runtime downloads after the UI is visible or when the user explicitly retries |
| `cancel_download` | `Result<bool, String>` | `invoke<boolean>("cancel_download", { traceId })` |
| `cancel_transcode` | `Result<bool, String>` | `invoke<boolean>("cancel_transcode", { traceId })` |
| `retry_transcode` | `Result<bool, String>` | `invoke<boolean>("retry_transcode", { traceId })` |
| `remove_transcode` | `Result<bool, String>` | `invoke<boolean>("remove_transcode", { traceId })` |
| `get_clipboard_files` | `Result<Vec<String>, String>` | `invoke<string[]>("get_clipboard_files")` |
| `reset_rename_counter` | `Result<bool, String>` | `invoke<boolean>("reset_rename_counter")` |

#### Event Contracts

| Event Name | Rust Payload | Frontend Listener Type |
|------------|--------------|------------------------|
| `video-download-progress` | `DownloadProgress` | `listen<{ traceId: string; percent: number; stage: "preparing" \| "downloading" \| "merging" \| "post_processing"; speed: string; eta: string }>(...)` |
| `video-download-complete` | `DownloadResult` | `listen<{ traceId: string; success: boolean; file_path?: string; error?: string }>(...)` |
| `video-queue-count` | `VideoQueueCountPayload` | `listen<{ activeCount: number; pendingCount: number; totalCount: number; maxConcurrent: number }>(...)` |
| `video-queue-detail` | `VideoQueueDetailPayload` | `listen<{ tasks: { traceId: string; label: string; status: "active" \| "pending" }[] }>(...)` |
| `video-transcode-queue-count` | `VideoTranscodeQueueCountPayload` | `listen<{ activeCount: number; pendingCount: number; failedCount: number; totalCount: number; maxConcurrent: number }>(...)` |
| `video-transcode-queue-detail` | `VideoTranscodeQueueDetailPayload` | `listen<{ tasks: { traceId: string; label: string; status: "pending" \| "active" \| "failed"; stage?: "analyzing" \| "transcoding" \| "finalizing_mp4" \| "failed"; progressPercent?: number \| null; etaSeconds?: number \| null; sourcePath?: string \| null; sourceFormat?: string \| null; targetFormat?: string \| null; error?: string \| null }[] }>(...)` |
| `video-transcode-progress` | `VideoTranscodeTaskPayload` | listener payload with active transcode `traceId/status/stage/progressPercent/etaSeconds/sourcePath/sourceFormat/targetFormat/error` |
| `video-transcode-complete` | `VideoTranscodeCompletePayload` | `listen<{ traceId: string; label: string; sourcePath: string; filePath: string; sourceFormat?: string \| null; targetFormat: string }>(...)` |
| `video-transcode-failed` | `VideoTranscodeTaskPayload` | listener payload with failed transcode row state |
| `video-transcode-queued` / `video-transcode-retried` / `video-transcode-removed` | `VideoTranscodeTaskPayload` | listener payload with queued-row identity and source/target metadata |
| `ytdlp-update-progress` | `YtdlpUpdateProgress` | listener payload with `percent/downloaded/total` |
| `devmode-changed` | object `{ enabled: bool }` | `listen<{ enabled: boolean }>(...)` |

#### Support Log Export Contract

- Source file: `src-tauri/src/lib.rs`
- Signature:
  - `async fn export_support_log(app: AppHandle) -> Result<String, String>`
- Return contract:
  - Success returns the generated support-log file path as a string.
  - Failure returns an actionable `Err(String)` describing path creation or file-write failure.
- Behavior contract in backend:
  - Create the log under an app-owned directory derived from the config directory; do not require users to select a path first.
  - Emit a sectioned diagnostic report rather than a raw config dump. Current sections are:
    - `environment`
    - `settings`
    - `downloaders`
    - `runtime_evidence`
  - Include environment fields needed for support: app version, generated timestamp, platform, executable path, config path, output log path, and runtime log path.
  - Include a curated effective-settings summary focused on download diagnostics rather than UI-only preferences. Current MVP includes output path, autostart, shortcut, rename settings, AE integration settings, `defaultVideoDownloadQuality` resolution, and `aeFriendlyConversionEnabled`.
  - Exclude secondary UI-only settings such as theme and language from the support-log MVP unless the export contract is explicitly expanded.
- Include downloader diagnostics for bundled and managed download/tool runtimes:
  - `yt-dlp` path and local version when available
  - `gallery-dl` path and local version when available
  - `deno` runtime path when available
  - `ffmpeg` runtime path when available
  - Include filtered runtime evidence rather than a raw last-N-line tail. The evidence section should keep warning/error outcomes plus a minimal set of lifecycle/routing events needed to reconstruct downloader start, route selection, fallback, retry, and terminal outcome.
  - Non-fatal enrichment failures such as downloader version/path probing should degrade to placeholder text inside the file instead of failing the whole command.
  - Keep the frontend contract as a plain string path; do not switch to JSON/object payload without updating frontend types in the same change.

#### Config JSON Key Contract: Download Rename Toggle

- Source file: `src-tauri/src/lib.rs`
- Command boundary: `get_config` / `save_config` (JSON string contract)
- Expected keys in parsed config:
  - `renameMediaOnDownload?: bool` (canonical)
  - `videoKeepOriginalName?: bool` (legacy fallback)
  - `clipDownloadMode?: "fast" | "precise"` (legacy ignored key; not used by current clip-download behavior)
  - `renameRulePreset?: "desc_number" | "asc_number" | "prefix_number"`
  - `renamePrefix?: string`
  - `renameSuffix?: string`

Behavior contract in backend naming paths:
- Decision helper `is_rename_media_enabled(config)`:
  - Prefer `renameMediaOnDownload` when present.
  - Else infer from legacy key: `rename = !videoKeepOriginalName`.
  - Else default to `false` (do not rename by default).
- Rename rule helper behavior:
  - `renameRulePreset` missing/invalid -> fallback to `desc_number`.
  - `desc_number` and `prefix_number` default sequence start at `99` and decrease.
  - `asc_number` default sequence start at `1` and increase.
  - `renamePrefix` is applied only for `prefix_number`.
  - `renameSuffix` is global; empty means no suffix segment.
  - Prefix/suffix are sanitized to filesystem-safe segments; final stem joins non-empty segments via `_`.
- Slice mode helper behavior:
  - `clipDownloadMode` is treated as a legacy ignored key; it is no longer a source of truth for clip execution.
  - New clip tasks must always use yt-dlp `--download-sections` without a separate mode switch.
  - Section-download clip execution is supported only for the dedicated yt-dlp clip providers (`youtube` and `bilibili`); other providers must reject clip fields instead of silently falling back to a full download.
  - When `renameMediaOnDownload=false` and a clip range is present, output naming template is `<startMs>-<endMs>_<title>.mp4` with collision suffix `_2/_3/...`.
  - When `renameMediaOnDownload=false` and no clip range is present, yt-dlp full-video output naming template is `<title>[<width>x<height>][<quality>].<ext>`.
  - Video stem selection prefers the cleaned request/page title for all providers; only when title metadata is absent may runtime fall back to a URL-derived stem such as `pinterest_<shortId>`.
  - For yt-dlp providers that commonly enter through pasted page URLs without an extension-supplied title, runtime may probe yt-dlp metadata before output-stem allocation and should treat the recovered metadata title as higher priority than a raw URL-derived fallback such as `watch` or `BV...`.
  - `<quality>` currently serializes as `highest`, `balanced`, or `data-saver`.
  - If yt-dlp metadata does not expose width/height, the template may fall back to placeholder text, but different quality presets must still resolve to different target filenames.
- Applied uniformly to:
  - `download_video_internal` (yt-dlp naming template)
  - `download_image` / `save_data_url` / `process_files` (source-name preservation vs sequence naming)
  - `process_files` returns a structured `ProcessFilesResult` with `operation`, `processedCount`, `targetDir`, `items`, and `message`; frontend callers must not branch on English strings such as `Copied 0 files`.
  - `process_files.operation` defaults to `"copy"`; native local file-system drops may pass `"move"` to consume the source after the destination write succeeds.
  - When `process_files.operation === "move"` and the source is already a direct child of the target folder, backend must skip it instead of creating a duplicate collision suffix.

Contract rules:
- Keep command names and payload keys stable.
- If Rust field names differ from frontend naming, use serde rename explicitly (for example `update_available` -> `updateAvailable`).
- For optional payload fields (`Option<T>`), frontend must treat missing and `null` as valid absent states.
- `open_current_output_folder` must stay a plain `Result<(), String>` command with no extra payload; all path resolution remains backend-owned via `resolve_current_output_folder_path(...)`.
- `check_ytdlp_version.current` is the local sidecar version and must be returned whenever local probing succeeds, even if the GitHub latest check fails.
- `check_ytdlp_version.latest` / `updateAvailable` / `latestError` represent remote/latest-check state and may be `null` when upstream latest lookup is unavailable.
- `check_ytdlp_version` must use bootstrap-disabled local probing so startup/status surfaces never install `yt_dlp` as a side effect.
- On macOS managed-runtime builds, `check_ytdlp_version` must also expose enough metadata for the renderer to explain compatibility ceilings:
  - `source` distinguishes managed install, bundled fallback visibility, or fully missing state
  - `path` points at the active managed runtime or bundled fallback path when present
  - `pythonVersion` / `pythonPath` / `pythonSupportsLatestStable` describe the interpreter backing the managed runtime
  - `updateChannel` must serialize `"managed_python_package"` when the managed runtime is present and `"unavailable"` otherwise
- `get_gallery_dl_info.current` is the version returned by the managed `gallery-dl` entrypoint itself.
- `get_gallery_dl_info.source` must serialize as `"managed"` when the managed runtime is present and `"missing"` otherwise.
- `get_gallery_dl_info.updateChannel` currently serializes as `"managed_python_package"` when the managed runtime is present and `"unavailable"` otherwise.
- `refresh_runtime_dependency_gate_state` is inspection-only: it may update `phase`, `missingComponents`, and `lastError`, but it must not start a managed-runtime download by itself.
- `start_runtime_dependency_bootstrap` is the only automatic bootstrap entrypoint for the main-window post-paint flow; `setup()` must not start managed-runtime downloads before the UI is visible.
- `video-download-progress.traceId` and `video-download-complete.traceId` identify the task that produced the event.
- `src/electron-runtime/ytDlpProgress.ts` must treat yt-dlp post-download finalization lines with no explicit percent as valid progress:
  - `[Metadata] Embedding metadata ...` -> `stage="post_processing"`, `percent=100`
  - `Deleting original file ...` -> `stage="post_processing"`, `percent=100`
  - `[download] Downloading section ...` / `[download] Destination: ...` -> `stage="downloading"`, `percent=-1`
  - ffmpeg section output such as `time=00:00:05.00 ... speed=2.5x` -> `stage="downloading"` and percent derived from `(time / clipDurationSec) * 100`, capped below `100` until yt-dlp reports completion
  - unrelated noise without a recognized stage marker must still return `null`
- `src/electron-runtime/processRunner.ts` must split child-process output on `\r\n`, `\n`, and bare `\r` because ffmpeg progress embedded under `yt-dlp --download-sections` often refreshes one terminal line with carriage returns instead of newline-delimited records.
- `video-download-complete` now means the source media finished downloading. It must be emitted before any downstream transcode work begins.
- `cancel_download` targets exactly one queued/running task identified by `traceId`.
- `video-queue-count.activeCount` represents the number of actively running video downloads across frontend-triggered and WS-triggered tasks.
- `video-queue-count.pendingCount` represents queued backend video tasks that are waiting for capacity.
- `video-queue-count.totalCount = activeCount + pendingCount`.
- `video-queue-count.maxConcurrent` is the current backend concurrency cap (`3`).
- `video-queue-detail.tasks` must be emitted in UI display order: active tasks first, then pending tasks.
- Each `video-queue-detail.tasks[*]` item must include:
  - `traceId: string`
  - `label: string`
  - `status: "active" | "pending"`
- When a task is enqueued, starts execution, completes, or pending work is cleared by cancel, backend must emit both `video-queue-count` and `video-queue-detail`.
- `video-transcode-queue-count.totalCount = activeCount + pendingCount + failedCount`.
- `video-transcode-queue-count.maxConcurrent` is fixed to `1`.
- `video-transcode-queue-detail.tasks` must be emitted in UI display order: active first, pending next, failed last.
- Each `video-transcode-queue-detail.tasks[*]` item must include:
  - `traceId: string`
  - `label: string`
  - `status: "pending" | "active" | "failed"`
  - optional `stage`, `progressPercent`, `etaSeconds`, `sourcePath`, `sourceFormat`, `targetFormat`, `error`
- `video-transcode-progress` must describe the current active transcode stage and reuse the same `traceId` as the source download that created the transcode task.
- `video-transcode-progress.progressPercent` and `video-transcode-progress.etaSeconds` are best-effort optional fields for the active task:
  - `progressPercent` should be derived from `processed_seconds / total_duration_seconds` when ffmpeg runtime output and source duration are both available.
  - `etaSeconds` should be derived from ffmpeg `speed=` output when present, or from observed wall-clock throughput as a fallback.
  - Backend may emit `null`/missing `progressPercent` and `etaSeconds` when source duration cannot be determined or the active path cannot expose meaningful ffmpeg progress.
- `video-transcode-complete.filePath` is the final AE-friendly path after safe replacement. `sourcePath` is the preserved source path that seeded the transcode task.
- `retry_transcode` only retries failed local transcode work for the matching `traceId`; it must not recreate a network download task.
- `remove_transcode` only removes a failed transcode row from backend queue state; it must not delete the local source file.
- `queue_video_download` / Electron queue normalization source files:
  - `src/electron-runtime/commandRouter.ts`
  - `electron/main.mts`
  - `electron/videoHintNormalization.mts`
  - `src/electron-runtime/service.ts`
- `queue_pasted_video_download` / extension-assisted pasted selection source files:
  - `src/App.tsx`
  - `src/types/electronBridge.ts`
  - `electron/main.mts`
  - `browser-extension/background.js`
  - `browser-extension/*-detector.js`
- `queue_video_download` request payload contract:
  - `url: String` is required and must normalize to an HTTP(S) URL.
    - Electron runtime command router rejects invalid values with `Invalid command payload field: url`.
    - Electron main-process enqueue path rejects invalid values with `Missing or invalid url`.
  - `pageUrl?: String` is optional page context only.
    - Keep it only when it normalizes to HTTP(S) and drop invalid values instead of failing the whole request.
    - It may override the Pinterest routing page key when `url` alone is only a drag-source shell.
  - `videoUrl?: String` is an optional high-confidence media hint.
    - Keep it only when it normalizes to a real Pinterest video asset URL.
    - Accept direct `*.mp4` URLs plus manifest-like `*.m3u8`, `*.cmfv`, or `/videos/iht/hls/...` URLs.
    - Drop page URLs, image URLs, `blob:`/`data:`/`javascript:` values, and unrelated HTTP(S) URLs.
  - `videoCandidates?: Vec<{ url: string, type?: string, source?: string, confidence?: string }>` is optional ordered hint data.
    - Keep only candidates whose `url` passes the same Pinterest video-hint validation as `videoUrl`.
    - `src/electron-runtime/commandRouter.ts` must preserve `type` / `source` / `confidence` metadata on surviving entries.
    - Surviving candidates must be ordered so direct MP4 outranks `indirect_media`, which outranks manifest-like hints; preserve original order within the same priority bucket.
    - `electron/videoHintNormalization.mts` may collapse duplicate normalized URLs while preserving that priority order.
- Source selection / routing contract:
  - `src/electron-runtime/service.ts` must treat extension hints as provider inputs, not as preselected engines.
  - Provider planning may prefer `direct`, `gallery-dl`, or `yt-dlp` based on `siteHint`, `url`, `pageUrl`, `videoUrl`, and normalized `videoCandidates`.
  - `electron/main.mts` resolves the queued download source URL as `videoUrl ?? first(videoCandidates) ?? url ?? pageUrl`.
  - Low-trust manifest-like hints such as `*.cmfv` may only be used when a higher-trust direct MP4 hint is absent; they must not silently override a stronger resolved asset.
- Extension WebSocket `video_selected_v2` payload contract:
  - `url` should be the canonical current-item download URL when the browser player initiates a single-item download.
  - `pageUrl` remains the browser page context used for cookies and diagnostics.
  - `selectionScope?: "current_item" | "playlist"` is optional for backward compatibility.
  - When `selectionScope == "current_item"`, runtime may enforce single-item yt-dlp behavior such as `--no-playlist`.
- `queue_pasted_video_download` request / resolution contract:
  - `url: String` is required and must normalize to an HTTP(S) URL.
  - `pageUrl?: String` is optional page context and follows the same HTTP(S)-only rule as `queue_video_download.pageUrl`.
  - `siteHint?: String` is optional caller context only; Electron main may still infer the effective site hint from `url` / `pageUrl`.
  - For supported site hints, Electron main must request extension-side `resolve_pasted_video_selection` first and only queue the raw pasted URL when that resolution fails or returns no selection.
  - Supported extension-assisted pasted site hints are currently:
    - `bilibili`
    - `douyin`
    - `youtube`
    - `twitter-x`
    - `pinterest`
    - `xiaohongshu`
  - Successful `pasted_video_selection_result` payloads must flow through the same normalization path as injected `video_selected_v2`, so canonical `url`, `pageUrl`, `selectionScope`, optional clip bounds, `extensionData`, and cookie policy remain aligned between pasted-link and injected-button downloads.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Command return shape changed | Rust compile + TS usage review | All `invoke<T>` sites still match fields | Update Rust struct or TS generic together in same change |
| Support-log command returns non-string payload | Rust/TS contract review | Frontend can render hint without casts | Keep `Result<String, String>` and typed `invoke<string>` |
| Support-log directory creation fails | Command call path | Frontend receives actionable failure | Return `Err(String)` with mkdir details |
| Support-log file write fails | Command call path | Frontend receives actionable failure | Return `Err(String)` with write details |
| yt-dlp probe fails during support-log export | Support-log command path | Log file still gets written | Record placeholder text in file and continue |
| Serde rename removed or changed | UI field access (`result.updateAvailable`) | Field exists with expected case | Add/restore `#[serde(rename = ...)]` |
| GitHub latest lookup fails or rate-limits | `check_ytdlp_version` command path | Frontend still receives local `current` version | Return `latest=null`, `updateAvailable=null`, and `latestError` instead of failing the whole command |
| Optional field accessed unsafely | Frontend runtime path | No crash on missing `file_path` / `error` | Guard with optional checks |
| New command added without TS generic | Frontend compile/review | No implicit `unknown` propagation | Add explicit `invoke<T>` generic |
| Event payload drift | Event handler logic | Listener safely handles payload shape | Update listener type + handler guards |
| Rename key missing in config | Download naming path | Preserve source name by default | Use fallback `rename=false` |
| Legacy-only key present | Download naming path | Preserve previous user intent | Infer from `videoKeepOriginalName` |
| Missing/invalid `renameRulePreset` | Rename path | Uses stable descending default naming | Fallback to `desc_number` |
| Empty suffix | Rename path | Filename has no suffix segment | Skip empty suffix in stem composition |
| Illegal chars in prefix/suffix | Rename path | Name remains filesystem-safe | Sanitize chars to `_` before join |
| Reset command write fails | Command call path | Frontend receives error and remains stable | Return `Err(String)` with write/serialize details |
| Legacy config contains `clipDownloadMode="precise"` | Clip slicing path | Runtime still uses yt-dlp section download semantics | Ignore legacy key and continue |
| Clip naming conflict in `<startMs>-<endMs>_<title>` template | Clip output path | Deterministic unique filename | Append `_2/_3/...` suffix before extension |
| Different yt-dlp quality presets target the same title with rename disabled | Full-video output path | Different presets do not collide on the same file | Include resolution + quality suffix in the yt-dlp output template |
| Extension `video_selected_v2` payload omits `selectionScope` | WS payload parse | Older senders still queue successfully | Default runtime behavior to auto mode |
| Extension `video_selected_v2` carries YouTube/Bilibili current-item context | yt-dlp invocation args | Current item downloads do not expand into full playlists | Normalize canonical `url` and add `--no-playlist` when `selectionScope == "current_item"` |
| `queue_pasted_video_download` targets a supported site and extension resolution succeeds | Electron main pasted-resolution path | Final queued task uses the same normalized current-item payload shape as injected-button downloads | Resolve through `resolve_pasted_video_selection` then enqueue the returned normalized payload |
| `queue_pasted_video_download` targets a supported site but extension resolution fails/times out | Electron main pasted-resolution path | Download still queues through the legacy raw-URL path | Log the failure and fall back to `enqueueElectronVideoDownload(payload)` |
| `queue_video_download.url` is missing or non-HTTP(S) | Electron command boundary / main-process enqueue | Request is rejected before queue mutation | Throw `Invalid command payload field: url` or `Missing or invalid url`; do not enqueue task |
| `queue_video_download.pageUrl` is non-HTTP(S) | Queue normalization | Request still queues without a page override | Drop `pageUrl` and continue |
| `queue_video_download.videoUrl` or `videoCandidates[*].url` is HTTP(S) but not a real Pinterest video asset | Queue normalization | Request still queues, but untrusted hints are ignored | Drop page/image/other non-video hints and preserve only validated Pinterest video assets |
| Mixed direct MP4 + manifest Pinterest hints arrive together | Queue normalization / source selection | Higher-trust direct MP4 is tried first | Sort surviving candidates so direct MP4 precedes manifest-like entries |
| yt-dlp emits `Embedding metadata` or `Deleting original file` with no percent | `src/electron-runtime/ytDlpProgress.ts` parser | UI still receives a terminal `post_processing` progress update | Emit `video-download-progress` with `stage="post_processing"` and `percent=100` instead of returning `null` |
| yt-dlp section download emits `[download] Downloading section ...` without percent | `src/electron-runtime/ytDlpProgress.ts` parser | UI leaves the resolving/preparing state as soon as section download starts | Emit `video-download-progress` with `stage="downloading"` and `percent=-1` |
| ffmpeg section download emits carriage-return `time=` progress under yt-dlp | `src/electron-runtime/processRunner.ts` + `ytDlpProgress.ts` | UI receives incremental clip progress during the long section download | Split bare `\r` records and derive percent from the selected clip duration |
