# Type Safety

> Executable frontend type contracts for Tauri command/event boundaries, the Electron preload bridge, and React state.

---

## Source of Truth

- Frontend consumers: `src/App.tsx`, `src/pages/SettingsPage.tsx`, `src/contexts/ThemeContext.tsx`
- Backend producers: `src-tauri/src/lib.rs`

---

## Core Rules

- Use explicit generics for all `invoke<T>()` calls.
- Use typed payloads for all `listen<T>()` calls.
- Keep cross-layer payload keys aligned with backend serde output (for example `updateAvailable`).
- Do not use `any` for Tauri events or command results; prefer concrete types or `unknown` plus guards.
- Runtime validation library is not required, but external/untrusted payloads must be guarded before use.
- New Electron-migrated renderer files must use the typed preload bridge in `src/types/electronBridge.ts` instead of importing `@tauri-apps/*` directly.

---

## Scenario: Tauri Command + Event Type Contract

### 1. Scope / Trigger

- Trigger: Any change to frontend `invoke/listen` usage or backend command/event payloads.
- Why this needs code-spec depth: Type mismatches between Rust and TypeScript are cross-layer bugs that often surface only at runtime.

### 2. Signatures

Canonical frontend command/event typing patterns:

```ts
const configStr = await invoke<string>("get_config");
const enabled = await invoke<boolean>("get_autostart");
const paths = await invoke<string[]>("get_clipboard_files");

const version = await invoke<{
  current: string;
  latest: string | null;
  updateAvailable: boolean | null;
  latestError: string | null;
}>("check_ytdlp_version");

const galleryDl = await invoke<{
  current: string;
  latest: string | null;
  updateAvailable: boolean | null;
  latestError: string | null;
  source: "managed" | "missing";
  path: string | null;
  updateChannel: "managed_python_package" | "unavailable";
}>("get_gallery_dl_info");

const unlistenProgress = listen<{
  percent: number;
  stage: "preparing" | "downloading" | "merging" | "post_processing";
  speed: string;
  eta: string;
}>(
  "video-download-progress",
  (event) => {
    // event.payload is strongly typed
  }
);
```

Recommended shared payload types for repeated contracts:

```ts
type DownloadResult = {
  success: boolean;
  file_path?: string;
  error?: string;
};

type DownloadProgress = {
  percent: number;
  stage: "preparing" | "downloading" | "merging" | "post_processing";
  speed: string;
  eta: string;
};
```

### 3. Contracts

#### Command Contracts

| Command | Required Frontend Generic |
|---------|---------------------------|
| `get_config` | `invoke<string>("get_config")` |
| `save_config` | `invoke<void>("save_config", { json })` |
| `open_current_output_folder` | `invoke<void>("open_current_output_folder")` |
| `get_autostart` | `invoke<boolean>("get_autostart")` |
| `get_current_shortcut` | `invoke<string>("get_current_shortcut")` |
| `export_support_log` | `invoke<string>("export_support_log")` |
| `get_gallery_dl_info` | `invoke<{ current: string; latest: string \| null; updateAvailable: boolean \| null; latestError: string \| null; source: "managed" \| "missing"; path: string \| null; updateChannel: "managed_python_package" \| "unavailable" }>("get_gallery_dl_info")` |
| `check_ytdlp_version` | `invoke<{ current: string; latest: string \| null; updateAvailable: boolean \| null; latestError: string \| null; source?: "managed" \| "missing"; path?: string \| null; pythonVersion?: string \| null; pythonPath?: string \| null; pythonSupportsLatestStable?: boolean \| null; updateChannel?: "managed_python_package" \| "unavailable" }>(...)` |
| `get_runtime_dependency_status` | `invoke<{ python: { state: "ready" \| "missing"; source: "bundled" \| "managed" \| null; expectedSource?: "bundled" \| "managed" \| null; path: string \| null; error: string \| null }; ytDlp: { state: "ready" \| "missing"; source: "bundled" \| "managed" \| null; expectedSource?: "bundled" \| "managed" \| null; path: string \| null; error: string \| null }; galleryDl: ...; ffmpeg: ...; deno: ... }>("get_runtime_dependency_status")` |
| `get_runtime_dependency_gate_state` | `invoke<{ phase: "idle" \| "checking" \| "awaiting_confirmation" \| "downloading" \| "ready" \| "blocked_by_user" \| "failed"; missingComponents: string[]; lastError: string \| null; updatedAtMs: number; currentComponent: "ytDlp" \| "galleryDl" \| "ffmpeg" \| "deno" \| null; currentStage: "checking" \| "downloading" \| "verifying" \| "installing" \| null; progressPercent: number \| null; downloadedBytes: number \| null; totalBytes: number \| null; nextComponent: "ytDlp" \| "galleryDl" \| "ffmpeg" \| "deno" \| null }>("get_runtime_dependency_gate_state")` |
| `refresh_runtime_dependency_gate_state` | `invoke<{ phase: "idle" \| "checking" \| "awaiting_confirmation" \| "downloading" \| "ready" \| "blocked_by_user" \| "failed"; missingComponents: string[]; lastError: string \| null; updatedAtMs: number; currentComponent: "ytDlp" \| "galleryDl" \| "ffmpeg" \| "deno" \| null; currentStage: "checking" \| "downloading" \| "verifying" \| "installing" \| null; progressPercent: number \| null; downloadedBytes: number \| null; totalBytes: number \| null; nextComponent: "ytDlp" \| "galleryDl" \| "ffmpeg" \| "deno" \| null }>("refresh_runtime_dependency_gate_state")` |
| `start_runtime_dependency_bootstrap` | `invoke<{ phase: "idle" \| "checking" \| "awaiting_confirmation" \| "downloading" \| "ready" \| "blocked_by_user" \| "failed"; missingComponents: string[]; lastError: string \| null; updatedAtMs: number; currentComponent: "ytDlp" \| "galleryDl" \| "ffmpeg" \| "deno" \| null; currentStage: "checking" \| "downloading" \| "verifying" \| "installing" \| null; progressPercent: number \| null; downloadedBytes: number \| null; totalBytes: number \| null; nextComponent: "ytDlp" \| "galleryDl" \| "ffmpeg" \| "deno" \| null }>("start_runtime_dependency_bootstrap", { reason? })` |
| `get_site_session_pending_actions` | `invoke<{ count: number; entries: { siteId: string; displayName: string; primaryHost: string }[] }>("get_site_session_pending_actions")` |
| `download_video` | `invoke<{ traceId: string; success: boolean; file_path?: string; error?: string }>(...)` |
| `queue_pasted_video_download` | `invoke<{ accepted: boolean; traceId: string }>("queue_pasted_video_download", { url, pageUrl?, siteHint? })` |
| `queue_video_download` | `invoke<{ accepted: boolean; traceId: string }>("queue_video_download", { url, pageUrl?, videoUrl?, videoCandidates? })` |
| `download_image` / `save_data_url` / `process_files` | `invoke<string>(...)` |
| `get_clipboard_files` | `invoke<string[]>("get_clipboard_files")` |
| `cancel_download` | `invoke<boolean>("cancel_download", { traceId })` |
| `reset_rename_counter` | `invoke<boolean>("reset_rename_counter")` |

#### Event Contracts

| Event | Required Listener Type |
|-------|------------------------|
| `video-download-progress` | `listen<{ traceId: string; percent: number; stage: "preparing" \| "downloading" \| "merging" \| "post_processing"; speed: string; eta: string }>(...)` |
| `video-download-complete` | `listen<{ traceId: string; success: boolean; file_path?: string; error?: string }>(...)` |
| `video-queue-count` | `listen<{ activeCount: number; pendingCount: number; totalCount: number; maxConcurrent: number }>(...)` |
| `video-queue-detail` | `listen<{ tasks: { traceId: string; label: string; status: "active" \| "pending" }[] }>(...)` |
| `video-transcode-queue-count` | `listen<{ activeCount: number; pendingCount: number; failedCount: number; totalCount: number; maxConcurrent: number }>(...)` |
| `video-transcode-queue-detail` | `listen<{ tasks: { traceId: string; label: string; status: "pending" \| "active" \| "failed"; stage?: "analyzing" \| "transcoding" \| "finalizing_mp4" \| "failed"; progressPercent?: number \| null; etaSeconds?: number \| null; sourcePath?: string \| null; sourceFormat?: string \| null; targetFormat?: string \| null; error?: string \| null }[] }>(...)` |
| `video-transcode-progress` | `listen<{ traceId: string; label: string; status: "pending" \| "active" \| "failed"; stage?: "analyzing" \| "transcoding" \| "finalizing_mp4" \| "failed"; progressPercent?: number \| null; etaSeconds?: number \| null; sourcePath?: string \| null; sourceFormat?: string \| null; targetFormat?: string \| null; error?: string \| null }>(...)` |
| `video-transcode-complete` | `listen<{ traceId: string; label: string; sourcePath: string; filePath: string; sourceFormat?: string \| null; targetFormat: string }>(...)` |
| `video-transcode-failed` / `video-transcode-queued` / `video-transcode-retried` / `video-transcode-removed` | `listen<{ traceId: string; label: string; status: "pending" \| "active" \| "failed"; stage?: "analyzing" \| "transcoding" \| "finalizing_mp4" \| "failed"; progressPercent?: number \| null; etaSeconds?: number \| null; sourcePath?: string \| null; sourceFormat?: string \| null; targetFormat?: string \| null; error?: string \| null }>(...)` |
| `devmode-changed` | `listen<{ enabled: boolean }>(...)` |
| `rename-setting-changed` | `listen<{ enabled: boolean }>(...)` |
| `theme-changed` | `listen<Theme>(...)` |
| `shortcut-show` | `listen<void>(...)` |
| `runtime-dependency-gate-state` | `listen<{ phase: "idle" \| "checking" \| "awaiting_confirmation" \| "downloading" \| "ready" \| "blocked_by_user" \| "failed"; missingComponents: string[]; lastError: string \| null; updatedAtMs: number; currentComponent: "ytDlp" \| "galleryDl" \| "ffmpeg" \| "deno" \| null; currentStage: "checking" \| "downloading" \| "verifying" \| "installing" \| null; progressPercent: number \| null; downloadedBytes: number \| null; totalBytes: number \| null; nextComponent: "ytDlp" \| "galleryDl" \| "ffmpeg" \| "deno" \| null }>(...)` |
| `site-session-pending-actions-changed` | `listen<{ count: number; entries: { siteId: string; displayName: string; primaryHost: string }[] }>(...)` |
| `site-session-state-changed` | `listen<{ siteId: string; state: SiteSessionState; registryEntries: SiteSessionRegistryEntry[] }>(...)` |

#### Support Log Export Contract

- Source file: `src/pages/SettingsPage.tsx`
- Command: `export_support_log`
- Return shape:
  - `string` absolute/generated file path to the created support log
- Behavior contract in frontend:
  - Invoke the command as `invoke<string>("export_support_log")`.
  - Treat the result as a path string, not as JSON or a structured object.
  - UI may derive a display filename from the path, but must tolerate both `/` and `\` separators.
  - Failure path must catch the rejected promise and show a non-blocking hint instead of crashing or leaving tap state stuck.

#### Runtime Dependency Gate Contract

- Source files: `src/App.tsx`, `src/pages/SettingsPage.tsx`, `src/types/runtimeDependencies.ts`, `src-tauri/src/lib.rs`
- Commands:
  - `get_runtime_dependency_status`
  - `get_runtime_dependency_gate_state`
  - `refresh_runtime_dependency_gate_state`
  - `start_runtime_dependency_bootstrap`
- Event:
  - `runtime-dependency-gate-state`
- Shared payload shape:

```ts
type RuntimeDependencyStatusSnapshot = {
  python: RuntimeDependencyStatusEntry;
  ytDlp: RuntimeDependencyStatusEntry;
  galleryDl: RuntimeDependencyStatusEntry;
  ffmpeg: RuntimeDependencyStatusEntry;
  deno: RuntimeDependencyStatusEntry;
};

type RuntimeDependencyGateStatePayload = {
  phase:
    | "idle"
    | "checking"
    | "awaiting_confirmation"
    | "downloading"
    | "ready"
    | "blocked_by_user"
    | "failed";
  missingComponents: string[];
  lastError: string | null;
  updatedAtMs: number;
  currentComponent: "ytDlp" | "galleryDl" | "ffmpeg" | "deno" | null;
  currentStage: "checking" | "downloading" | "verifying" | "installing" | null;
  progressPercent: number | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  nextComponent: "ytDlp" | "galleryDl" | "ffmpeg" | "deno" | null;
};
```

Behavior contract in frontend:
- Main window and Settings must use shared types from `src/types/runtimeDependencies.ts`; do not inline `any` payloads for runtime gate state.
- Use `get_runtime_dependency_gate_state` when a surface needs the current global gate state without mutating it.
- Use `refresh_runtime_dependency_gate_state` only when the surface intentionally wants to re-evaluate runtime readiness and accept the phase transition side effects.
- Use `start_runtime_dependency_bootstrap` to begin managed runtime recovery after the UI is visible or when the user explicitly retries.
- Both main window and Settings may listen to `runtime-dependency-gate-state`, but neither surface may locally invent or overwrite `missingComponents` / `lastError`.
- Main window may derive a fallback missing-components list from `get_runtime_dependency_status` when the gate state is still `idle`, but queue/task UI must remain read-only with respect to backend queue ownership.
- `python` reports `source: "bundled"` when healthy, while `ytDlp`, `galleryDl`, `ffmpeg`, and `deno` may report `source: "managed"`; frontend logic must key off `state === "ready"` and `expectedSource` rather than assuming downloader readiness always means `"bundled"`.
- `python` is a prerequisite diagnostic entry and must not be treated as a bootstrap-able missing component in renderer UX.

Validation and error matrix:

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Runtime gate command invoked without a generic | TS review / compile | No `unknown` payload leaks into UI state | Use shared `RuntimeDependency*` types |
| Main window reuses stale gate state after a manual recheck | Main/runtime prompt | Prompt reflects returned payload or event update | Set state from command result and keep listener active |
| Frontend fabricates missing components locally while gate already has data | Runtime prompt rendering | UI matches backend-emitted gate state | Prefer `missingComponents` from gate payload, only fallback to status when gate is idle/empty |
| Runtime recovery starts through an obsolete command name | Command invocation | Backend bootstrap actually starts | Call `start_runtime_dependency_bootstrap` and treat the returned payload as the next source of truth |
| Runtime gate event typed as `any` | TS review | Shared payload fields remain strongly typed | Use `listen<RuntimeDependencyGateStatePayload>(...)` |

#### Browser Extension Popup Media Scan Contract

### 1. Scope / Trigger

- Trigger: Any change to `browser-extension/generic-video-detector.js`, `browser-extension/background.js`, or `browser-extension/popup.js` that changes popup media scanning, cache behavior, or candidate shape.
- Why this needs code-spec depth: The scan response crosses content script, background service worker, storage cache, and popup UI. Missing fields or stale cache entries make the popup show incorrect resources even when each layer works locally.

### 2. Signatures

Content-script scan response:

```ts
type PopupMediaType = "video" | "audio" | "image";

type PopupMediaCandidate = {
  id: string;
  mediaType: PopupMediaType;
  url: string;
  title?: string;
  host?: string;
  extension?: string;
  mimeType?: string;
  source:
    | "current_page"
    | "video_element"
    | "audio_element"
    | "source_element"
    | "img_element"
    | "picture_source"
    | "direct_link"
    | "open_graph"
    | "performance_resource";
  type?: string;
  confidence?: "high" | "medium" | "low";
  previewUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
};

type PopupMediaScanResult = {
  success: boolean;
  reason?: string;
  pageUrl: string | null;
  pageTitle: string;
  videos: PopupMediaCandidate[];
  audios: PopupMediaCandidate[];
  images: PopupMediaCandidate[];
  scannedAt: number;
  scanDurationMs: number;
  truncated?: boolean;
  ttlMs?: number;
};
```

Message flow:

```text
popup.js -> chrome.runtime.sendMessage({ type: "scan_page_media" })
background.js -> active tab frame 0: { type: "ameow_scan_page_media" }
generic-video-detector.js -> PopupMediaScanResult
background.js -> normalize/cache -> popup.js
```

### 3. Contracts

- `videos`, `audios`, and `images` must always exist as arrays after `background.js` normalization, including failure responses.
- Cache keys must include active tab id plus URL hash. Cache reads must also compare the stored `pageUrl` against the active tab URL before returning an entry.
- Auto-scan must skip restricted page schemes before sending content-script messages, including `about:`, `chrome:`, `chrome-extension:`, `edge:`, `moz-extension:`, `opera:`, and `vivaldi:`.
- Background must dedupe in-flight scans by the same cache key so rapid popup close/reopen does not launch concurrent scans for the same tab URL.
- Audio candidates should prefer stable direct audio files (`mp3`, `m4a`, `aac`, `wav`, `ogg`, `oga`, `flac`, `opus`) and exclude playlist/segment shapes (`m3u8`, `mpd`, `m4s`, `ts`) unless a later provider-specific contract explicitly opts them in.
- Known-duration audio below 5 seconds is treated as likely UI sound and excluded from popup scan results.
- Popup row downloads may pass `mediaType: "audio"` through the video-selection queue path, but the candidate metadata must preserve `mediaType: "audio"` instead of rewriting it to `"video"`.
- Video candidate metadata is owned by the detector, not the popup renderer. For `<video>` rows, preserve `poster` first, then bounded nearby image metadata, then page meta image (`og:image` / `twitter:image`) as `previewUrl`; resolve titles from the element, nearby scoped heading/card text, then page meta title. For generated `current_page` rows, page meta image is an acceptable fallback preview. For direct video links with empty link text, use the page title/meta title, but do not blanket-use page meta image when no scoped preview exists; a missing preview is preferable to reusing an unrelated page-level cover across multiple rows.
- Site page title trust order is allowed for narrow known video sites. For Bilibili and YouTube, a cleaned page title from a known page selector, Open Graph title, or `document.title` is more authoritative than local player-control labels and network/CDN filenames. Network-discovered video/audio candidates on those page URLs should inherit the cleaned page title so popup grouping does not display `index.m4s`, opaque CDN ids, or player UI labels as the resource title.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Content script omits `audios` | `normalizeMediaScanResponse` | Popup still receives `audios: []` | Default missing arrays in background |
| Active tab URL changed after a cached scan | `getMediaScanCacheForActiveTab` | Old cache is ignored | Compare cached `pageUrl` to current tab URL |
| Same URL exists in two tabs | Cache key | Results do not leak across tabs | Include tab id in cache key |
| User opens/closes popup rapidly | Background in-flight map | Only one active scan runs per tab URL | Reuse existing scan promise |
| Restricted browser page is active | `scanPageMediaForActiveTab` | Return compact failure without waiting for timeout | Pre-check scheme before tab message |
| Page exposes short click/ping audio | Audio detector | Candidate is excluded when duration is known below 5s | Apply duration threshold |
| Page exposes streaming fragments | Audio detector | Segment/playlist URLs are excluded from Audio tab | Filter extension/MIME-like URL shapes |
| Popup downloads an audio row | `downloadMediaCandidate` | Candidate keeps `mediaType: "audio"` in metadata | Preserve media type in queued candidate |
| Page video has no `<video poster>` but exposes card/meta cover | `collectVideoScanCandidates` | Video candidate includes a bounded `previewUrl` without popup-side DOM guessing | Resolve cover in content script before background normalization |
| Direct video link has empty text | `collectVideoScanCandidates` | Candidate title falls back to page/meta title instead of only CDN filename | Populate `title` before `describeCandidate` fallback |
| Blob/MSE-backed visible player exposes no HTTP media URL | `collectVideoScanCandidates` | Detector emits a high-confidence `current_page` candidate for a canonical current content URL | Generate current-page fallback only when the visible player has no usable HTTP element/source URL |
| Bilibili/YouTube player scope exposes control text or network cache exposes a CDN filename | `resolveVideoTitle` / `mergeNetworkCandidatesIntoScanResult` | Popup shows the cleaned page video title | Prefer cleaned site page title over local player labels and network filename titles for those sites |

### 5. Good / Base / Bad Cases

- Good:
  - A normal page scan returns `{ videos, audios, images }`, the popup shows `Video / Audio / Image`, and cache refresh replaces stale counts without blocking first render.
  - A page with `<audio src="song.mp3" duration=180>` shows one Audio row.
  - `chrome://extensions` returns `scan_restricted_page` immediately and the popup shows an unavailable state.
- Base:
  - Existing video/image-only detectors still work because missing `audios` normalizes to `[]`.
  - A popup close during scan is harmless because the background promise can finish and cache the result.
- Bad:
  - Cache keyed only by URL shows one tab's scan results in another tab.
  - Popup assumes `result.audios` exists before background normalization.
  - Audio detection lists dozens of `m4s` chunks or 1-second UI sounds as downloadable audio.

### 6. Tests Required

- Unit tests:
  - `collectPageMediaCandidates()` returns `audios`.
  - Audio collection includes stable audio files and excludes short sounds plus streaming fragments.
  - Result caps still bound total candidate count across media types.
- Static checks:
  - `node --check browser-extension/popup.js`
  - `node --check browser-extension/background.js`
  - `node --check browser-extension/generic-video-detector.js`
- Integration/manual checks:
  - Popup opens on a scannable page and auto-populates without clicking Scan.
  - Popup opens on a restricted page and does not wait for content-script timeout.
  - Same-tab navigation does not show the previous URL's cache result.
- Video candidate without a poster still displays a nearby card cover or page meta cover when available.
- Direct video link with empty text displays a page/meta title.
- Blob/MSE-backed YouTube/Bilibili player shows a canonical `current_page` candidate instead of unrelated recommendation/search links.
- Bilibili/YouTube network-discovered direct media rows display the cleaned page title rather than CDN filenames.

### 7. Wrong vs Correct

#### Wrong

```js
const key = hashString(tab.url);
const candidates = mediaScanResult[`${currentMediaType}s`];
```

#### Correct

```js
const key = `${tab.id}-${hashString(tab.url)}`;
const candidates = Array.isArray(mediaScanResult?.[`${currentMediaType}s`])
  ? mediaScanResult[`${currentMediaType}s`]
  : [];
```

#### Wrong

```js
title.textContent = candidate.title || inferTitleFromPopupDocument();
```

#### Correct

```js
title.textContent = safeText(candidate.title, candidate.url);
// Detector owns title/previewUrl extraction while it still has access to the page DOM.
```

#### Protected Image Drag Fallback Contract

- Source files:
  - `src/App.tsx`
  - `src/utils/protectedImageDrag.ts`
  - `src/utils/imageDrag.ts`
  - `browser-extension/protected-image-detector.js`
  - `browser-extension/protected-image-page-bridge.js`
  - `browser-extension/background.js`
  - `electron/main.mts`
- Command: `download_image`
- Return shape:
  - `string` saved file path on success
- Optional frontend payload field:

```ts
type ProtectedImageFallbackInput = {
  token: string;
  pageUrl?: string | null;
  imageUrl?: string | null;
};
```

Behavior contract in frontend:
- Keep `invoke<string>("download_image", { url, targetDir? })` as the base path for ordinary images.
- Only send `protectedImageFallback` when the dropped browser drag includes a valid Ameow protected-image token.
- `protectedImageFallback.token` must be a non-empty opaque token string; frontend must not invent a token.
- `protectedImageFallback.pageUrl` / `imageUrl` are optional context only and must be treated as untrusted drag hints.
- Frontend may save dragged `image/*` file payloads from `dataTransfer.files` only after a protected-image `download_image` call rejects; the renderer must not invent its own token or bypass the main `download_image` command as the first attempt.
- Drag HTML parsing in `src/utils/imageDrag.ts` must treat `background-image:url(...)` as a valid image candidate so card-style thumbnails that do not expose `<img src>` still resolve to the same image flow.
- The content-script drag marker in `browser-extension/protected-image-detector.js` must not assume the drag target is an `HTMLImageElement`; it must search the target, nearby ancestors, nested `<img>` nodes, and CSS/data-attribute image hints before deciding that no protected-image token should be attached.
- Backend owns the synchronous direct-download-then-extension-fallback orchestration.
- If no protected-image token exists, frontend must stay on the existing image flow and not branch into new protected-image-specific UI state.

Validation and error matrix:

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Drag payload has no protected-image token | Drop parsing in `src/App.tsx` | Use existing `download_image` call with no extra payload | No protected fallback requested |
| Drag payload token exists but image URL mismatch is obvious | Drop parsing in `src/App.tsx` | Skip fallback hint rather than sending mismatched token context | Keep direct image path only |
| Small-card drag starts on a non-`img` container | `browser-extension/protected-image-detector.js` dragstart path | Tokenized protected-image drag still resolves from ancestor/subtree/CSS image hints | Attach the same protected-image payload shape |
| Dragged HTML exposes only `background-image:url(...)` | `src/utils/imageDrag.ts` parsing | Renderer still resolves an HTTP image URL | Reuse the normal image flow |
| Drag payload token exists and direct image fails in backend | Extension + Electron orchestration | Background first tries content script / page bridge / extension background fetch, then authenticated desktop download | Frontend still awaits one `invoke<string>` before optional file-payload fallback |
| Backend rejects fallback or extension unavailable | `invoke` rejection | Frontend handles single command failure without extra polling/UI state | Catch and log existing error path |

Good / Base / Bad cases:
- Good:
  - Protected browser drag sends `{ token, pageUrl, imageUrl }` through `download_image`, Electron falls back through the extension if needed, and the single `invoke<string>` resolves with the final saved path.
  - A thumbnail card drag with only `background-image:url(...)` in dragged HTML still resolves to the same image URL and downloads successfully.
- Base:
  - Public image drag calls `download_image` exactly as before, with no `protectedImageFallback`.
- Bad:
  - Frontend creates a fake fallback token.
  - The content script attaches protected-image metadata only for `img` targets and silently drops thumbnail-card drags.
  - Renderer skips the main `download_image` call and tries to save arbitrary dropped blobs first.

Tests required (with assertion points):
- Type checks:
  - `download_image` calls remain typed as `invoke<string>(...)`.
  - No `any` introduced for protected-image drag payload parsing.
- Runtime checks:
  - Protected browser drag includes a token and still resolves through one `invoke<string>("download_image", ...)`.
  - Public image drag continues to work with no `protectedImageFallback` payload.
  - Dragged thumbnail HTML containing `background-image:url(...)` resolves the correct image URL.
  - Invalid/missing protected-image payload falls back to the existing direct image path safely.

#### Xiaohongshu Drag Resolution Contract

- Source files:
  - `src/App.tsx`
  - `src/utils/xiaohongshu.ts`
  - `browser-extension/xiaohongshu-detector.js`
  - `browser-extension/background.js`
  - `electron/main.mts`
- Command: `resolve_xiaohongshu_drag_media`
- Embedded drag payload shape:

```ts
type EmbeddedXiaohongshuDragPayload = {
  token: string | null;
  pageUrl: string | null;
  detailUrl: string | null;
  sourcePageUrl: string | null;
  noteId: string | null;
  exactImageUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  videoCandidates: XiaohongshuDragCandidate[];
  mediaType: "video" | "image" | null;
  videoIntentConfidence: number | null;
  videoIntentSources: string[];
  title: string | null;
};

type XiaohongshuResolvedDragMedia = {
  kind: "video" | "image" | "unknown";
  pageUrl: string;
  imageUrl: string | null;
  videoUrl: string | null;
  videoCandidates: XiaohongshuDragCandidate[];
  videoIntentConfidence?: number | null;
  videoIntentSources?: string[];
};
```

Behavior contract in frontend:
- `extractEmbeddedXiaohongshuDragPayload(...)` must preserve `detailUrl`, `videoIntentConfidence`, and `videoIntentSources`; do not downcast the payload to only `pageUrl`/`imageUrl`.
- `detailUrl` is optional but higher-trust than bare `pageUrl` when present. The renderer must forward it to `resolve_xiaohongshu_drag_media`.
- `hasXiaohongshuVideoSignals(...)` is the renderer-side gate for whether a dragged note should remain eligible for the video queue even when no direct `videoUrl` exists yet.
- `pickXiaohongshuImageForDownload(...)` must return `null` whenever resolved media already says `kind === "video"`; renderer must not download the cover image after a positive video classification.
- Xiaohongshu image hints must reject bare CDN-host roots such as `https://sns-webpic-qc.xhscdn.com/`; only note-specific image URLs are allowed to survive payload parsing or final image selection.
- Renderer may still queue a Xiaohongshu video when direct candidates are empty if `videoIntentConfidence >= 0.7` or the resolved media says `kind === "video"`.
- Xiaohongshu video queue payloads must use the canonical note URL as `url`/`pageUrl` and must not forward `videoUrl` or `videoCandidates` as downloader inputs.

Validation and error matrix:

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Embedded payload contains tokenized `detailUrl` | `src/utils/xiaohongshu.ts` parsing + `src/App.tsx` invoke payload | Renderer forwards the same `detailUrl` to Electron `resolve_xiaohongshu_drag_media` | Preserve `detailUrl` in both parsed payload and invoke arguments |
| Embedded payload has image cover plus medium/high video intent | `src/App.tsx` Xiaohongshu drag branch | Renderer keeps the note on the video-resolution path instead of immediately downloading the cover image | Use `hasXiaohongshuVideoSignals(...)` before image fallback |
| Electron returns `kind: "video"` with `imageUrl` only | `pickXiaohongshuImageForDownload(...)` | Renderer must not treat `imageUrl` as a final image-download target | Return `null` for resolved video notes |
| Embedded payload is malformed or unsafe | `extractEmbeddedXiaohongshuDragPayload(...)` | Unsafe URLs and invalid note metadata are dropped without crashing the drag flow | Keep URL/note guards and null fallbacks |
| Embedded payload or resolved media exposes only a bare `xhscdn` host URL | `src/utils/xiaohongshu.ts` parsing + final image selection | Renderer must not treat CDN roots as downloadable image assets | Normalize them to `null` before image fallback |

Good / Base / Bad cases:
- Good:
  - Parsed Xiaohongshu drag payload includes tokenized `detailUrl`, renderer forwards it to Electron, and the note stays on the video path until note-aware resolution finishes.
  - Resolved Xiaohongshu media returns `kind: "video"` with no direct `videoUrl`, and the renderer still avoids downloading the cover image.
- Base:
  - Pure image-note payload with no video intent still resolves to image download normally.
- Bad:
  - Renderer strips `detailUrl` from the embedded payload before invoking Electron.
  - Renderer downloads `imageUrl` after the resolved payload already reported `kind: "video"`.

Tests required (with assertion points):
- Type checks:
  - `resolve_xiaohongshu_drag_media` invoke uses the typed payload and forwards `detailUrl`, `videoIntentConfidence`, and `videoIntentSources`.
  - No `any` introduced in Xiaohongshu drag payload parsing.
- Runtime/unit checks:
  - Embedded payload parsing preserves `detailUrl`.
  - `hasXiaohongshuVideoSignals(...)` returns `true` for `kind: "video"` and for `videoIntentConfidence >= 0.7`.
  - `pickXiaohongshuImageForDownload(...)` returns `null` when resolved media says `kind: "video"`.
  - Embedded payload parsing and image fallback both reject bare `xhscdn` host URLs.

#### Queue Count Contract

- Source files: `src/App.tsx`, `src-tauri/src/lib.rs`
- Event name: `video-queue-count`
- Payload fields:
  - `activeCount: number`
  - `pendingCount: number`
  - `totalCount: number`
  - `maxConcurrent: number`

Behavior contract in frontend:
- Treat `activeCount` as the source of truth for whether the main progress view should render.
- Treat `pendingCount` as queued backend work waiting for scheduler capacity.
- Clamp invalid payload fields to safe non-negative integers.
- Show the queue badge when `totalCount > 1`, and use `totalCount` as the badge number.
- When the queue popover is already open, keep the badge button mounted as the close affordance even if `totalCount === 1`; do not use `totalCount > 0` for initial badge visibility.
- Use `video-queue-detail` task order to choose the primary active task shown in the main progress ring.
- Do not render the queue count inside the circular progress indicator.
- Main cancel action must target a single `traceId`, not clear the entire queue.

#### Pinterest Drag Hint Contract

- Source files: `src/App.tsx`, `src/utils/pinterest.ts`, `src/types/videoRuntime.ts`, `src-tauri/src/lib.rs`
- Command: `queue_video_download`
- Payload fields for Pinterest desktop drag/drop:
  - `url: string` required HTTP(S) route key for the backend queue request
  - `pageUrl?: string` canonical Pinterest pin/page URL when known
  - `videoUrl?: string` preferred Pinterest video asset hint when drag HTML exposes one
  - `videoCandidates?: Array<{ url: string; type?: string; source?: string; confidence?: string }>`

Behavior contract in frontend:
- Desktop Pinterest image pins keep using `download_image`; do not send image URLs through `queue_video_download`.
- `url` must remain a safe HTTP(S) route key for the backend.
  - Do not pass `about:`, `blob:`, `data:`, `javascript:`, or image-fallback values as the queued video route.
  - When the raw dropped URL is blocked/empty but the embedded Pinterest drag payload exposes a canonical `pageUrl`, use that canonical page URL as the queued `url`.
- `pageUrl` is optional page context only.
  - Send it only when the frontend knows a canonical HTTP(S) Pinterest pin/page URL.
  - If the drag payload only exposes a shell URL or invalid page value, omit `pageUrl` instead of fabricating one.
- `videoUrl` is optional and must only be sent for real Pinterest video asset URLs.
  - `src/utils/pinterest.ts` may promote a direct `*.mp4` candidate into `videoUrl`.
  - Do not send Pinterest page URLs, image URLs, or unrelated HTTP(S) URLs as `videoUrl`.
- `videoCandidates` is hint-only data harvested from dropped HTML and embedded drag payloads.
  - Filter invalid, empty, duplicate, and non-video entries before invoke.
  - Keep candidate metadata (`type`, `source`, `confidence`) on surviving entries.
  - Order candidates so direct MP4 hints are first, followed by lower-trust manifest/stream-like hints.
- Treat manifest-like hints as fallback-only enrichment. If drag HTML only exposes stream-like URLs, leave `videoUrl` empty when no direct MP4 exists and let the backend decide whether to use the surviving `videoCandidates`.
- `src/utils/pinterest.test.ts` should continue to cover direct MP4 preference over manifest candidates, and `src/App.tsx` drag handling must preserve that ordering when merging embedded + HTML-derived candidates.

#### Pasted Video Queue Contract

- Source files: `src/App.tsx`, `src/types/electronBridge.ts`, `electron/main.mts`, `browser-extension/background.js`
- Command: `queue_pasted_video_download`
- Payload fields:
  - `url: string` required HTTP(S) pasted video/page URL
  - `pageUrl?: string` optional canonical page context when already known
  - `siteHint?: string` optional caller hint; current paste entry may omit it and let desktop/extension infer it

Behavior contract in frontend:
- Pasted video URLs from the main window must use `queue_pasted_video_download`, not `queue_video_download`, so supported sites can reuse extension-assisted current-item selection before backend fallback.
- Frontend should only send the pasted URL plus optional context it already knows; it must not fabricate `selectionScope`, `videoUrl`, `videoCandidates`, or `extensionData` locally for pasted text.
- Success/failure UI behavior remains the same as normal queued video downloads because both commands return the shared `QueuedVideoDownloadAck` shape.
- If extension-assisted resolution fails or the site is unsupported, desktop runtime may fall back to the existing plain queue path without renderer changes.

#### Gallery-dl Settings Contract

- Source files: `src/pages/SettingsPage.tsx`, `src-tauri/src/lib.rs`
- Command: `get_gallery_dl_info`
- Payload fields:
  - `current: string`
- `source: "managed" | "missing"`
  - `path: string | null`
- `updateChannel: "managed_python_package" | "unavailable"`

Behavior contract in frontend:
- Use `invoke<GalleryDlInfo>("get_gallery_dl_info")` with an explicit generic.
- Treat the payload as managed Python package metadata backed by the bundled Python runtime.
- Settings copy must describe `gallery-dl` as app-managed through the bundled Python runtime; it must not imply a standalone bundled binary updater.

#### Site Login-State Pending Reminder Contract

- Source files: `src/App.tsx`, `src/types/siteSession.ts`, `src/types/electronBridge.ts`
- Command: `get_site_session_pending_actions`
- Event: `site-session-pending-actions-changed`
- Payload fields:
  - `count: number`
  - `entries: { siteId: string; displayName: string; primaryHost: string }[]`

Behavior contract in frontend:
- Load pending actions once on main-window mount with `invoke<SiteSessionPendingActionsPayload>("get_site_session_pending_actions")`.
- Subscribe to `site-session-pending-actions-changed` with the same payload type and update local state from the event payload.
- Render the lower-left login-state warning dot only in the full main window when `count > 0`; compact/minimized mode and the queue popover should keep it hidden.
- Clicking the warning dot opens Settings. The main window must not attempt to read cookies or activate site sessions directly.
- Treat `entries[0]` as display-only copy. The backend remains authoritative for which sites are pending.

#### Site Login-State Settings Refresh Contract

- Source files: `src/pages/SettingsPage.tsx`, `src/types/siteSession.ts`, `src/types/electronBridge.ts`
- Event: `site-session-state-changed`
- Payload fields:
  - `siteId: string`
  - `state: SiteSessionState`
  - `registryEntries: SiteSessionRegistryEntry[]`

Behavior contract in frontend:
- Settings must load visible site-session registry rows with `invoke<SiteSessionRegistryEntry[]>("get_site_session_registry")`, then load state for each visible row with `get_site_session_state`.
- Settings must subscribe to `site-session-state-changed` while mounted and refresh its panel state when the event fires.
- The frontend must not locally infer whether hidden seed/catalog entries should be visible. Registry visibility remains backend-owned.
- A `partial` state is visible when the backend returns a visible registry row; the UI may present it through the existing incomplete/missing status copy, but it must not hide the row.

#### Config JSON Key Contract: Download Rename Toggle

- Source file: `src/pages/SettingsPage.tsx`
- Commands: `get_config` + `save_config`
- Payload fields:
  - `renameMediaOnDownload?: boolean` (new canonical key)
  - `videoKeepOriginalName?: boolean` (legacy compatibility key)
  - `clipDownloadMode?: "fast" | "precise"` (legacy ignored key; not used by current clip-download behavior)
  - `renameRulePreset?: "desc_number" | "asc_number" | "prefix_number"` (rename preset)
  - `renamePrefix?: string` (only used when preset is `prefix_number`)
  - `renameSuffix?: string` (global suffix; empty means no suffix)

Behavior contract in frontend:
- Read path:
  - If `renameMediaOnDownload` exists, use it directly.
  - Else if `videoKeepOriginalName` exists, infer `renameMediaOnDownload = !videoKeepOriginalName`.
  - Else fallback to `false` (rename disabled by default).
  - If `renameRulePreset` missing or invalid, fallback to `desc_number`.
  - `renamePrefix` / `renameSuffix` default to empty string.
  - Do not expose any clip-download mode setting or persist `clipDownloadMode` in Settings UI.
- Write path:
  - Persist both keys for compatibility:
    - `renameMediaOnDownload = newValue`
    - `videoKeepOriginalName = !newValue`
  - Persist rename-rule keys via settings inputs:
    - `renameRulePreset`
    - `renamePrefix`
    - `renameSuffix`
  - Do not write `clipDownloadMode`; existing legacy values may remain in config files but have no effect on current clip downloads.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Untyped invoke introduced | TS review / compile | No `unknown` leaks into business logic | Add `invoke<T>` generic |
| Event handler uses `any` | TS review | Payload fields are strongly typed | Replace `any` with typed payload |
| Backend key case drift (`updateAvailable`) | Runtime field access | UI reads expected key without cast | Update backend serde rename or frontend type |
| Backend key drift (`source`, `path`, `updateChannel`) | Settings card runtime | `gallery-dl` card still renders correct bundled metadata | Keep frontend type and backend serialization aligned |
| GitHub latest lookup unavailable | Runtime field access | UI still renders local `current` safely | Treat `latest` / `updateAvailable` / `latestError` as nullable and branch accordingly |
| Optional fields accessed directly | Runtime path | No crash on missing `file_path`/`error` | Guard with presence checks |
| Support-log command consumed without generic | TS review / runtime hint path | Returned path remains a string end-to-end | Use `invoke<string>("export_support_log")` |
| Support-log path parsed as JSON/object | Runtime hint path | Success hint still renders | Treat command result as plain string |
| Config JSON parse fails | Runtime path | Error handled without app crash | Wrap parse in `try/catch` and fallback |
| Rename key missing on fresh install | Settings load + first download | Defaults to preserving source names | Fallback to `renameMediaOnDownload = false` |
| Only legacy key exists | Settings load | New UI toggle still reflects old user intent | Derive from `videoKeepOriginalName` |
| Invalid/missing `renameRulePreset` | Settings load | UI falls back to `desc_number` safely | Guard enum values before setState |
| Empty suffix input | Settings preview + save | No suffix added to generated name | Keep `renameSuffix=""` and skip suffix segment |
| Reset command fails | Main page reset action | UI does not crash and logs actionable error | Wrap `invoke<boolean>("reset_rename_counter")` in `try/catch` |
| Legacy config contains `clipDownloadMode="precise"` | `video-download-complete` handler | Frontend behavior remains unchanged because runtime ignores that legacy key and follows normal clip completion flow | Keep optional `error` summary flow and do not assume a mode-specific path |

### 5. Good / Base / Bad Cases

- Good:
  - Version-tap support-log export uses `invoke<string>("export_support_log")` and derives display text from the returned path safely.
  - `check_ytdlp_version` uses explicit object generic and branches on nullable `latest` / `updateAvailable` / `latestError` while still showing local `current`.
  - `get_gallery_dl_info` uses an explicit object generic and Settings copy correctly explains that `gallery-dl` is bundled with Ameow.
  - `video-download-progress` listener uses typed payload and no casting.
  - New config uses `renameMediaOnDownload=false`, and initial downloads keep source names.
  - Main page reset button uses `invoke<boolean>("reset_rename_counter")` with explicit return type.
  - Rename preset is `prefix_number`, prefix/suffix set, preview shows `<prefix>_<num>_<suffix>.mp4`.
  - Legacy configs with `clipDownloadMode=precise` still complete through the normal success/error flow.
- Base:
  - Frontend only shows a generic success hint after log export and does not need to parse extra fields.
  - Single-use command keeps inline generic type and local handling.
  - Optional fields are checked before UI access.
  - Settings can show `Current: <local-version>` while rendering a separate "latest unavailable" state.
  - Legacy-only config (`videoKeepOriginalName`) is auto-mapped to new toggle.
  - Suffix input is empty, preview and output keep no suffix segment.
- Bad:
  - `export_support_log` is invoked without a generic and the result is cast to `{ path: string }`.
  - `listen("...")` handler typed as `(event: any)`.
  - `invoke("download_video") as any` with unguarded field access.
  - Settings treats `latest=null` as `"Already up to date"` and hides remote-check failure.
  - Frontend assumes snake_case fields when backend emits camelCase alias.
  - Frontend writes only one key and breaks compatibility with existing local config.
  - Frontend accepts arbitrary preset string and persists invalid enum value.
  - Frontend treats non-empty `error` payload in `video-download-complete` as success and leaves spinner active.

### 6. Tests Required (with assertion points)

- Type checks:
  - `npm run build` or `pnpm exec tsc --noEmit` passes.
  - No new `any` added for Tauri command/event boundaries.
- Runtime checks:
  - Tap the version label to the threshold and verify the success hint renders after `export_support_log` resolves.
  - Force `export_support_log` to fail and verify Settings shows a non-blocking failure hint.
  - Open Settings and verify the `gallery-dl` card renders `current`, `source`, and release-link behavior from `get_gallery_dl_info`.
  - Trigger a successful video download and verify progress/completion events update UI correctly.
  - Trigger a failed video download and verify optional `error` path is handled.
  - Start with a legacy config containing `clipDownloadMode=precise` and verify progress flow still matches the normal clip-download path.
  - Open Settings and verify `get_config`/`save_config` still round-trip valid JSON.
  - Delete local config, launch app, verify rename toggle is off and first image/video keeps source name when available.
  - Start with legacy-only config key (`videoKeepOriginalName`), open Settings, verify toggle and save behavior remain consistent.
  - Open Settings with missing rename-rule keys and verify preset defaults to `desc_number`.
  - Set preset to `prefix_number` + prefix + suffix and verify preview updates immediately.
  - Clear suffix and verify preview removes suffix segment.
  - Enable rename mode, click reset button on main page, and verify next renamed file numbering uses reset baseline.

### 7. Wrong vs Correct

#### Wrong

```ts
const result = await invoke("download_video", { url });
if ((result as any).success) {
  console.log((result as any).file_path);
}

listen("devmode-changed", (event: any) => {
  setDevMode(event.payload.enabled);
});
```

#### Correct

```ts
const result = await invoke<{ success: boolean; file_path?: string; error?: string }>(
  "download_video",
  { url }
);
if (result.success && result.file_path) {
  console.log(result.file_path);
}

listen<{ enabled: boolean }>("devmode-changed", (event) => {
  setDevMode(event.payload.enabled);
});
```

---

## Scenario: Transcode Queue Progress And ETA Contract

### 1. Scope / Trigger

- Trigger: Any change to `src/App.tsx` transcode queue listeners, transcode payload typing, queue-row status formatting, or the main floating-window primary transcode summary.
- Why this needs code-spec depth: The transcode queue is a cross-layer runtime contract (`Rust` events -> typed listeners -> React normalization -> queue/floating-window rendering) where optional progress and ETA fields can drift silently and degrade into stale or misleading UI.

### 2. Signatures

Shared frontend payload type:

```ts
type VideoTranscodeTaskPayload = {
  traceId: string;
  label: string;
  status: "pending" | "active" | "failed";
  stage?: "analyzing" | "transcoding" | "finalizing_mp4" | "failed" | null;
  progressPercent?: number | null;
  etaSeconds?: number | null;
  sourcePath?: string | null;
  sourceFormat?: string | null;
  targetFormat?: string | null;
  error?: string | null;
};
```

Typed listeners in `src/App.tsx`:

```ts
const unlistenDetail = listen<VideoTranscodeQueueDetailPayload>(
  "video-transcode-queue-detail",
  (event) => { ... },
);

const unlistenProgress = listen<VideoTranscodeTaskPayload>(
  "video-transcode-progress",
  (event) => { ... },
);
```

Formatting helpers:

```ts
const formatEtaClock = (etaSeconds: number): string => { ... };
const getTranscodeEtaLabel = (etaSeconds?: number | null): string | null => { ... };
const getTranscodeTaskStatusText = (
  task: VideoTranscodeTaskPayload,
  options?: { includePercent?: boolean },
): string => { ... };
```

### 3. Contracts

- Listener typing contract:
  - `video-transcode-queue-detail`, `video-transcode-progress`, `video-transcode-failed`, `video-transcode-queued`, `video-transcode-retried`, and `video-transcode-removed` must all use the shared `VideoTranscodeTaskPayload` shape.
  - Frontend must keep `etaSeconds` optional and accept both missing and `null` payloads.
- Normalization contract:
  - `normalizeVideoTranscodeTask(...)` must clamp `progressPercent` into `0..100` when numeric, else normalize to `null`.
  - `normalizeVideoTranscodeTask(...)` must normalize `etaSeconds` into a non-negative integer when numeric, else normalize to `null`.
  - Optional string fields such as `sourcePath`, `sourceFormat`, `targetFormat`, and `error` must be trimmed or normalized to `null`.
- Queue row rendering contract:
  - Active queue rows should show percent when `progressPercent` is available.
  - Active queue rows should append ETA text when `etaSeconds` is available.
  - Pending rows remain a waiting state; failed rows remain stage/error-driven and must not fabricate ETA.
- Main floating-window contract:
  - The primary transcode summary in the floating window should reuse the same status helper, but may omit the numeric percent to keep the compact UI readable.
  - The floating window must still tolerate `etaSeconds=null` and fall back to stage-only text.
- Copy/i18n contract:
  - ETA rendering should reuse the existing `desktop:app.downloadStatus.eta` string contract instead of introducing a second parallel ETA label for transcode.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Backend omits `etaSeconds` | Listener + render path | Queue and floating window still render stable stage text | Normalize to `null` and skip ETA label |
| Backend sends fractional or negative ETA | `normalizeVideoTranscodeTask(...)` | UI shows safe whole seconds or hides ETA | Clamp/floor positive values, else normalize to `null` |
| Backend sends percent outside `0..100` | `normalizeVideoTranscodeTask(...)` | Queue progress ring/text stays valid | Clamp into `0..100` |
| Queue row renders active transcode without percent | `getTranscodeTaskStatusText(...)` | Stage text still appears | Join stage and ETA without fabricating percent |
| Floating window shows verbose queue-row text | Main progress summary | Compact primary status remains readable | Call `getTranscodeTaskStatusText(task, { includePercent: false })` |
| Listener uses `any` or ad hoc shape | TS review / compile | Cross-layer drift reaches runtime | Reuse `VideoTranscodeTaskPayload` and typed `listen<T>()` |

### 5. Good / Base / Bad Cases

- Good:
  - Active queue row renders `67% · Transcoding · ETA 1:23` when both progress and ETA are present.
  - Floating window renders `Transcoding · ETA 1:23` for the same task, omitting percent for readability.
  - A failed transcode continues to render failed-stage text with no ETA.
- Base:
  - Analyzing/remux paths may render stage-only text if progress or ETA is unavailable.
  - Pending rows still render the waiting label with no extra timing hints.
- Bad:
  - Frontend treats missing `etaSeconds` as `0` and shows a misleading `ETA 0:00`.
  - Queue rows and floating window use different payload shapes or incompatible formatting rules.
  - Frontend creates a new transcode-only ETA translation key and drifts from the existing download ETA copy without product intent.

### 6. Tests Required (with assertion points)

- Type checks:
  - `npm run type-check` passes with typed transcode listeners and no `any` at the Tauri boundary.
  - `VideoTranscodeTaskPayload` includes optional `etaSeconds` everywhere the shared type is used.
- Runtime checks:
  - Start a full transcode and verify queue rows update from stage-only text to percent + ETA while ffmpeg runs.
  - Verify the floating window primary transcode summary shows ETA when available and falls back to stage-only text when not.
  - Retry or fail a transcode and verify ETA disappears instead of persisting stale timing.

### 7. Wrong vs Correct

#### Wrong

```ts
const unlistenProgress = listen<any>("video-transcode-progress", (event) => {
  const eta = event.payload.etaSeconds ?? 0;
  setStatus(`ETA ${eta}`);
});
```

#### Correct

```ts
const unlistenProgress = listen<VideoTranscodeTaskPayload>(
  "video-transcode-progress",
  (event) => {
    const normalized = normalizeVideoTranscodeTask(event.payload);
    if (!normalized) {
      return;
    }
    setTranscodeProgressByTrace((prev) => ({
      ...prev,
      [normalized.traceId]: normalized,
    }));
  },
);
```

---

## Scenario: Context Menu Native Folder Actions Contract

### 1. Scope / Trigger

- Trigger: A dedicated Tauri context-menu window needs to open the current output folder or launch the system folder picker.
- Why this needs code-spec depth: On Windows, auxiliary menu windows, `alwaysOnTop`, and native dialogs create focus/z-order races that do not show up in ordinary same-window settings flows.

### 2. Signatures

Frontend command/event usage:

```ts
await invoke<void>("begin_open_output_folder_from_context_menu");
await invoke<void>("begin_pick_output_folder_from_context_menu");

const unlistenOutputPath = listen<{ path: string }>("output-path-changed", (event) => {
  setOutputPath(event.payload.path);
});

const unlistenContextMenuClosed = listen<void>("context-menu-closed", () => {
  updateContextMenuOpen(false);
});
```

Backend command/helper signatures:

```rust
#[tauri::command]
fn begin_open_output_folder_from_context_menu(app: tauri::AppHandle) -> Result<(), String>

#[tauri::command]
fn begin_pick_output_folder_from_context_menu(app: tauri::AppHandle) -> Result<(), String>

fn persist_output_path(app: tauri::AppHandle, next_output_path: String) -> Result<bool, String>
fn resolve_current_output_folder_path(app: &tauri::AppHandle) -> Result<PathBuf, String>
fn close_context_menu_window(app: &tauri::AppHandle)
```

### 3. Contracts

#### Frontend Contract

- `ContextMenuPage` must call backend commands with `invoke<void>(...)`; it must not open the folder picker directly from the menu window.
- Main window state must listen for `context-menu-closed` and clear the local `isContextMenuOpen` flag.
- Main window state must listen for `output-path-changed` and treat `payload.path` as the source of truth for UI sync.
- Frontend error fallback may call local `requestClose()`, but success-path closing is owned by the backend command.

#### Backend Contract

- `begin_open_output_folder_from_context_menu` must:
  - emit `context-menu-closed`
  - close the `context-menu` window if present
  - resolve the current output folder from config
  - fallback to `<Desktop>/Ameow_Received` when `outputPath` is missing/empty
  - delegate folder opening through backend `open_folder(...)`
- `begin_pick_output_folder_from_context_menu` must:
  - emit `context-menu-closed`
  - close the `context-menu` window if present
  - read whether the `main` window is `always_on_top`
  - temporarily disable `always_on_top` before showing the native picker
  - restore `always_on_top` after the picker callback returns
  - focus `main` before and after the picker callback
  - persist the selected path in backend config, not in the child window frontend
- `persist_output_path(...)` must:
  - no-op and return `Ok(false)` when the selected path equals the current `outputPath`
  - emit `output-path-changed` only after config is saved successfully
  - call `reset_rename_counter(...)` after a real path change

#### Shared Behavior Contract

- The three output-path entry points may use different UI surfaces, but they must converge on the same persisted `outputPath` semantics.
- Canceling the native picker is a valid no-op: no config write, no `output-path-changed`, no crash, no stuck context-menu state.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Menu page opens folder picker directly via frontend plugin | Code review / runtime on Windows | Picker may appear behind app or fail silently | Replace with `invoke<void>("begin_pick_output_folder_from_context_menu")` |
| Menu item does not close the child menu window first | Runtime click path | Menu lingers on screen while OS action proceeds | Close from backend via `close_context_menu_window(...)` before action |
| Main window remains `always_on_top` during picker launch | Runtime z-order | Native picker appears behind Ameow | Temporarily disable `always_on_top` and restore it in callback |
| Picker is canceled | Picker callback | Menu stays closed and path remains unchanged | Return early without config write or event emission |
| Selected path equals existing `outputPath` | Backend persistence | No duplicate state churn or rename-counter reset | Return `Ok(false)` from `persist_output_path(...)` |
| Config JSON cannot be parsed | Backend persistence / path resolution | Command rejects with actionable error | Propagate `Result<_, String>` and let frontend log + close safely |
| Picked folder path cannot convert into `PathBuf` | Picker callback | App does not crash; change is skipped | Log backend error and return |
| `open_folder(...)` fails | Open-folder command | Menu is already closed; failure surfaces as rejected command | Keep close-first ordering and catch on frontend |

### 5. Good / Base / Bad Cases

- Good:
  - Clicking `Set Output Folder` closes the menu immediately, shows the Windows folder picker above Ameow, and updates `outputPath` through `output-path-changed` after selection.
  - Clicking `Open Folder` closes the menu immediately and opens the configured folder, or `<Desktop>/Ameow_Received` when no custom path exists.
  - Re-selecting the same folder produces no duplicate event and does not reset rename numbering.
- Base:
  - Canceling the picker closes the menu and leaves current output-path UI unchanged.
  - Frontend only logs command failures and keeps parent menu state synced through `context-menu-closed`.
- Bad:
  - Context-menu frontend calls `plugin-dialog.open({ directory: true })` directly.
  - Menu page emits an event to another window and expects that window to launch the picker later.
  - Path persistence happens only in the child window, so main window state and rename counter drift out of sync.
  - `Open Folder` succeeds but the menu remains visible because close logic is attached to blur only.

### 6. Tests Required (with assertion points)

- Type checks:
  - `ContextMenuPage` uses `invoke<void>` for both context-menu commands.
  - Main window listeners use `listen<{ path: string }>("output-path-changed", ...)` and `listen<void>("context-menu-closed", ...)`.
- Runtime checks on Windows:
  - Right-click main window, click `Set Output Folder`, and assert the context menu disappears before or as the picker appears.
  - Assert the folder picker is not hidden behind the main always-on-top window.
  - Cancel the picker and assert no visible output-path change occurs.
  - Select a new folder and assert the main window output path updates after `output-path-changed`.
  - Re-select the current folder and assert there is no duplicate reset behavior or error.
  - Right-click main window, click `Open Folder`, and assert the context menu disappears immediately.
- Failure-path checks:
  - Force config parse failure and assert the frontend logs the command error without leaving the menu stuck open.
  - Force `open_folder(...)` failure and assert the child menu is still closed.

### 7. Wrong vs Correct

#### Wrong

```ts
import { open } from "@tauri-apps/plugin-dialog";
import { emit } from "@tauri-apps/api/event";

const selectOutputFolder = async () => {
  await emit("request-output-path-picker");
  await open({ directory: true });
};
```

#### Correct

```ts
const openOutputFolder = async () => {
  await invoke<void>("begin_open_output_folder_from_context_menu");
};

const selectOutputFolder = async () => {
  await invoke<void>("begin_pick_output_folder_from_context_menu");
};
```

---

## Scenario: Main Window Folder Drop Sets Output Path Contract

### 1. Scope / Trigger

- Trigger: The Electron main floating window accepts a Windows Explorer folder drop and uses it as the next export/output directory.
- Why this needs code-spec depth: The feature crosses renderer drop handling, Electron preload path resolution, main-process filesystem validation, and persisted config updates. If the boundary is wrong, folder drops silently degrade into picker prompts or break normal file drops.

### 2. Signatures

Electron preload/main shared result contract:

```ts
type AmeowDroppedFolderPathResult =
  | {
      success: true;
      path: string;
      name: string;
    }
  | {
      success: false;
      path: string;
      error: string;
      reason:
        | "EMPTY_PATH"
        | "UNRESOLVED_DROP"
        | "PRELOAD_ERROR"
        | "NOT_DIRECTORY"
        | "NOT_FOUND"
        | "STAT_FAILED";
    };
```

Renderer bridge usage:

```ts
const droppedFolderResult =
  await window.ameow!.drop.consumePendingFolderDrop();

await saveOutputPath(droppedFolderResult.path);
```

Electron preload/main implementation surface:

```ts
window.ameow!.drop.consumePendingFolderDrop():
  Promise<AmeowDroppedFolderPathResult | null>;

ipcRenderer.invoke("ameow:drop:validate-folder-path", { path });
```

### 3. Contracts

#### Preload/Main Contract

- Preload owns local dropped-path extraction for the current DOM `drop` event.
- Prefer `webUtils.getPathForFile(file)` over renderer-only browser APIs when the drop includes `DataTransferItem.kind === "file"`.
- Fallback text parsing may use `text/uri-list` or `text/plain`, but only for local paths (`file://`, Windows absolute path, UNC path). Never treat ordinary HTTP(S) drag text as a local filesystem path.
- Main-process validation must call `fs.promises.stat(...)` and return a typed `AmeowDroppedFolderPathResult`.
- Validation accepts directories only. Existing files must resolve as `reason: "NOT_DIRECTORY"` instead of mutating config.

#### Renderer Contract

- `src/App.tsx` must await `window.ameow!.drop.consumePendingFolderDrop()` at the start of the main `drop` handler before running normal URL/file/image logic.
- Successful folder validation must persist through `saveOutputPath(...)`; renderer must not write `outputPath` directly without the existing config/event helper.
- `reason: "NOT_DIRECTORY"` is a non-consuming result for the main drop handler so normal file drops continue through the existing copy/save flow.
- Other failure reasons may show user-visible feedback, but they must not mutate `outputPath`.

#### Shared Behavior Contract

- Main-window folder drop is a direct-set action, not a folder-picker trigger. Do not replace a real dropped folder with `openDialog({ directory: true })`.
- Valid folder drops and context-menu folder changes must converge on the same persisted `outputPath` semantics and `output-path-changed` event flow.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Renderer uses `webkitGetAsEntry()` + folder picker fallback | Main drop path on Windows | Dragged folder path is not read directly | Move path extraction into Electron preload and validate via main IPC |
| Drop payload contains no local file items | Preload drop path | Normal URL/image drag remains unchanged | Return `null` and let existing renderer drop logic continue |
| Dropped local item resolves to a file | Main validation | File copy flow still works; `outputPath` is unchanged | Return `reason: "NOT_DIRECTORY"` and let renderer continue normal file handling |
| Dropped local folder does not exist by validation time | Main validation | No config change; user gets failure feedback | Return `reason: "NOT_FOUND"` |
| Local path cannot be resolved from drop data | Preload resolution | No config change; user gets failure feedback | Return `reason: "UNRESOLVED_DROP"` |
| Config persistence fails after a valid folder drop | Renderer save path | No silent success UI; `outputPath` remains unchanged | Catch the error and show failure feedback |

### 5. Good / Base / Bad Cases

- Good:
  - User drags `C:\\Users\\Name\\Desktop\\Exports` onto the main window, preload resolves the local path, main validates it as a directory, and renderer persists it through `saveOutputPath(...)`.
  - User drags a normal file; preload/main classify it as `NOT_DIRECTORY`, and the existing file-copy path still runs.
- Base:
  - User drags a web URL or image from the browser; folder-drop bridge returns `null`, and the existing drag handler continues as before.
- Bad:
  - Renderer opens a directory picker after detecting a dropped folder instead of consuming the actual dropped path.
  - Renderer treats every failed local validation result as a hard stop, breaking ordinary file drops.

### 6. Tests Required (with assertion points)

- Type checks:
  - `window.ameow!.drop.consumePendingFolderDrop()` is typed in `src/types/electronBridge.ts`.
  - `src/App.tsx` keeps normal file-drop branches reachable after a `NOT_DIRECTORY` result.
- Unit tests:
  - `electron/folderDrop.test.mts` covers local path text parsing and `validateDroppedFolderPath(...)` success/failure cases.
  - `src/utils/folderDrop.test.ts` covers renderer consumption rules, especially the `NOT_DIRECTORY` passthrough case.
- Runtime checks on Windows:
  - Drag a real folder onto the main floating window and assert the displayed output directory updates without a picker prompt.
  - Drag a regular file and assert the file is still copied/saved instead of changing `outputPath`.
  - Drag an invalid or stale folder path and assert no config corruption occurs.

### 7. Wrong vs Correct

#### Wrong

```ts
const handleDrop = async (event: React.DragEvent) => {
  const entry = (event.dataTransfer.items[0] as any).webkitGetAsEntry?.();
  if (entry?.isDirectory) {
    const selected = await window.ameow!.system.openDialog({ directory: true });
    if (typeof selected === "string") {
      await saveOutputPath(selected);
    }
    return;
  }
};
```

#### Correct

```ts
const handleDrop = async (event: React.DragEvent) => {
  const droppedFolderResult =
    await window.ameow!.drop.consumePendingFolderDrop();

  if (droppedFolderResult?.success) {
    await saveOutputPath(droppedFolderResult.path);
    return;
  }

  if (droppedFolderResult?.success === false
    && droppedFolderResult.reason !== "NOT_DIRECTORY") {
    showFolderDropError(droppedFolderResult.reason);
    return;
  }

  // Continue existing file / URL / image drop logic.
};
```

---

## Scenario: Main Window Output Folder Double-Click Contract

### 1. Scope / Trigger

- Trigger: The main floating window adds a double-click shortcut to open the current output folder.
- Why this needs code-spec depth: The gesture shares pointer input with the custom window-drag path, so a small event-order mistake can break both dragging and the new shortcut.

### 2. Signatures

Frontend command/handler usage:

```ts
await window.ameow!.commands.invoke<void>("open_current_output_folder");

const handlePanelPointerDown = async (e: React.PointerEvent<HTMLDivElement>) => { ... };
const handlePanelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => { ... };
const handlePanelPointerUp = (e: React.PointerEvent<HTMLDivElement>) => { ... };
const handlePanelPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => { ... };
const handlePanelDoubleClick = async (e: React.MouseEvent<HTMLDivElement>) => { ... };
```

Frontend guard constants:

```ts
const PANEL_DOUBLE_CLICK_IGNORE_SELECTOR = "button, [data-panel-double-click='ignore']";
const PANEL_NATIVE_DRAG_ALLOW_SELECTOR = "[data-panel-native-drag='allow']";
const WINDOW_DRAG_START_THRESHOLD = 6;
```

Electron drag bridge usage:

```ts
const pendingDragStartRef = useRef<{
  pointerId: number;
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
  windowPositionPromise: Promise<{ x: number; y: number }>;
} | null>(null);

const windowPosition = await desktopCurrentWindow.outerPosition();
desktopCurrentWindow.setPosition({ x: nextX, y: nextY });
```

Backend command/helper signatures:

```rust
#[tauri::command]
fn open_current_output_folder(app: tauri::AppHandle) -> Result<(), String>

fn resolve_current_output_folder_path(app: &tauri::AppHandle) -> Result<PathBuf, String>
fn open_folder(path: String) -> Result<(), String>
```

### 3. Contracts

#### Frontend Contract

- Main window must invoke `open_current_output_folder` through the desktop bridge; it must not duplicate output-path resolution in React.
- Double-click open-folder must only be enabled in the normal idle panel state:
  - `!isMinimized`
  - `!isProcessing`
  - no active `downloadProgress`
  - `videoQueueState.totalCount === 0`
  - `!isQueuePopoverOpen`
- The gesture must only apply to empty panel space. Targets matching `button` or `[data-panel-double-click='ignore']` are excluded.
- The queue popover root must mark itself with `data-panel-double-click="ignore"` so overlay content never triggers the panel-level gesture.
- The main panel is a drop target and a frameless drag surface at the same time, so internal panel content must not start native DOM drag sessions unless it explicitly opts in with `data-panel-native-drag="allow"`.
- Progress/checkmark/error overlays rendered inside the panel must default to non-interactive presentation layers:
  - suppress pointer-driven native drag on the overlay shell
  - keep decorative SVG/icon/text layers non-interactive
  - re-enable pointer events only for specific controls such as the current-task cancel button
- Main window dragging must not start on `pointerdown`; it must wait until pointer movement exceeds `WINDOW_DRAG_START_THRESHOLD`.
- `pointerdown` may only arm drag state:
  - store the starting `clientX/clientY` and `screenX/screenY`
  - start one `desktopCurrentWindow.outerPosition()` read
  - capture the pointer when possible
- When dragging becomes active:
  - derive movement from `screenX/screenY`, not from element-local coordinates
  - resolve `outerPosition()` once and reuse it as the drag origin
  - send position updates through `desktopCurrentWindow.setPosition(...)`
  - batch updates with `requestAnimationFrame` if pointermove frequency exceeds one IPC write per frame
- The pointer-move hot path must not `await` `invoke(...)`, `startDragging()`, or `commands.invoke("set_window_position", ...)`.
- `pointerup`, `pointercancel`, context-menu open paths, and double-click setup must clear any pending or active drag state and release pointer capture when held.
- Drop-session cleanup must not rely on a single React `onDrop` / `onDragLeave` path. If a browser/system drag session ends, the panel should also clear drop-hover state from window-level termination signals such as capture-phase `drop`, `dragend`, or window blur.

#### Backend Contract

- `open_current_output_folder` must:
  - resolve the current output folder from config
  - fallback to `<Desktop>/Ameow_Received` when `outputPath` is missing/empty
  - delegate folder opening through backend `open_folder(...)`
- `open_current_output_folder` must not emit `context-menu-closed`; it is a generic command shared by multiple UI surfaces.

#### Shared Behavior Contract

- The right-click `Open Folder` action and the main-window double-click shortcut must converge on the same resolved output-path behavior.
- If the folder-open command fails, frontend may only log the rejected command; it must not leave the main panel in a special transient state.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Double-click uses inline filesystem logic | Code review | Main window and menu can drift on fallback behavior | Route through `window.ameow!.commands.invoke<void>("open_current_output_folder")` |
| Dragging still starts on `pointerdown` | Runtime gesture path | Double-click never reliably fires | Gate dragging behind movement threshold |
| Drag path awaits `invoke(...)` or `set_window_position` on every pointer move | Runtime gesture path | Frameless drag remains smooth | Use `desktopCurrentWindow.setPosition(...)` with fire-and-forget IPC, optionally RAF-batched |
| Drag delta is based on `clientX/clientY` after activation | Multi-monitor or repeated drag path | Window lags or drifts from the cursor | Use `screenX/screenY` plus one initial `outerPosition()` snapshot |
| Pending drag state is not cleared on `pointerup` / `pointercancel` | Runtime gesture path | Drag can get stuck or stop mid-way | Always clear pending + active drag state and release capture |
| User double-clicks a button/control | Runtime pointer path | Action button also opens output folder unexpectedly | Ignore targets matching `PANEL_DOUBLE_CLICK_IGNORE_SELECTOR` |
| Queue popover does not mark itself as ignored | Runtime overlay path | Double-clicking queue content opens folder | Add `data-panel-double-click="ignore"` on overlay root |
| Decorative overlay content starts a native DOM drag | Download/progress overlay interaction | Cursor changes to file/object drag and the window stops dragging | Prevent panel-native `dragstart` unless the target opts in with `data-panel-native-drag="allow"` |
| Drop hover state only clears through one React path | Browser/system drag termination | Panel can stay in a stale post-drop interaction state | Also clear drop state from capture-phase `drop`, `dragend`, and window blur |
| Window is minimized or processing | Runtime gesture path | Hidden/ephemeral states trigger unexpected folder opens | Guard on idle-only state before invoking |
| Backend command emits context-menu close event | Cross-surface behavior | Main window double-click mutates unrelated menu state | Keep `open_current_output_folder` generic and side-effect free beyond opening folder |
| Folder path resolution fails | Command rejection path | No crash; gesture simply logs failure | Return `Err(String)` and catch on frontend |

### 5. Good / Base / Bad Cases

- Good:
  - Idle main window empty-space double-click opens the configured output folder.
  - Idle main window can still be dragged by holding left mouse, moving beyond the threshold, and continuing smoothly even if the pointer leaves the panel bounds.
  - After a browser/media drop triggers foreground progress or completion UI, dragging on the panel still moves the window instead of starting a DOM drag session.
  - Right-click `Open Folder` and double-click open the same fallback folder when no custom `outputPath` exists.
- Base:
  - Double-click on a button, queue overlay, or settings control does nothing extra.
  - Double-click during minimized/processing/download states is ignored.
- Bad:
  - Double-click handler is attached but drag still starts immediately on first `pointerdown`.
  - Dragging calls `commands.invoke("set_window_position")` for every pointer move and stutters under normal use.
  - Main window resolves config locally while context menu uses backend fallback logic.
  - Queue popover content bubbles into the panel gesture and opens Explorer/Finder.

### 6. Tests Required (with assertion points)

- Type checks:
  - Main window uses `window.ameow!.commands.invoke<void>("open_current_output_folder")`.
  - No `any` introduced in the new pointer handlers.
  - `desktopCurrentWindow.setPosition(...)` exists in the typed desktop bridge.
- Runtime checks:
  - In idle state, double-click empty panel space and assert the current output folder opens.
  - Hold left mouse and move beyond the threshold; assert the window drags instead of opening the folder.
  - Continue dragging after the pointer leaves the panel bounds and assert pointer capture keeps the drag alive until release.
  - Drag continuously for several seconds and assert motion stays smooth with no obvious stutter or mid-drag freeze.
  - After dropping browser media that shows the progress ring or completion check/error state, drag from the overlay and assert the main window still moves normally.
  - Trigger a browser/system drag session and end it outside the expected panel path; assert hover/drop state is cleared on the next frame and the panel does not stay in a stale drag-hover mode.
  - Double-click the queue badge / settings button / close button and assert no folder-open side effect occurs.
  - Open the queue popover and double-click inside it; assert the panel shortcut is ignored.
  - Start a download or minimize the window and assert double-click no longer triggers folder open.
  - Right-click `Open Folder` and double-click idle panel; assert both open the same resolved path when `outputPath` is unset.

### 7. Wrong vs Correct

#### Wrong

```ts
const handlePanelPointerMove = async (e: React.PointerEvent<HTMLDivElement>) => {
  await window.ameow!.commands.invoke("set_window_position", {
    x: e.clientX,
    y: e.clientY,
  });
};

const handlePanelDoubleClick = async () => {
  const configStr = await window.ameow!.commands.invoke<string>("get_config");
  const config = JSON.parse(configStr) as { outputPath?: string };
  await window.ameow!.commands.invoke<void>("open_folder", { path: config.outputPath ?? "" });
};
```

#### Correct

```ts
const handlePanelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
  if (Math.hypot(dx, dy) < WINDOW_DRAG_START_THRESHOLD) {
    return;
  }
  updateManualWindowDrag(e.screenX, e.screenY);
};

const handlePanelDoubleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
  if (shouldIgnorePanelDoubleClickTarget(e.target) || !canDoubleClickOpenOutputFolder) {
    return;
  }
  await window.ameow!.commands.invoke<void>("open_current_output_folder");
};
```

---

## Scenario: Electron Preload Bridge Contract For Renderer Migration

### 1. Scope / Trigger

- Trigger: Any renderer file replaces direct `@tauri-apps/*` imports with the Electron preload bridge, or any new desktop-only renderer code is added after the Electron foundation task.
- Why this needs code-spec depth: The migration moves desktop ownership from Tauri plugins into Electron preload/main, but renderer behavior still depends on stable command names, event names, and child-window semantics.

### 2. Signatures

Source-of-truth types:

```ts
import type {
  AmeowElectronBridge,
  AmeowRendererCommand,
  AmeowAppEvent,
} from "../types/electronBridge";
```

Canonical renderer bridge usage:

```ts
const configStr = await window.ameow!.commands.invoke<string>("get_config");

const unlisten = await window.ameow!.events.on<Theme>(
  "theme-changed",
  (event) => {
    setTheme(event.payload);
  },
);

await window.ameow!.windows.openSettings({
  title: "Settings",
  width: 360,
  height: 420,
  center: true,
  alwaysOnTop: true,
});

const selection = await window.ameow!.system.openDialog({
  directory: true,
  multiple: false,
  title: "Choose Output Folder",
});

const update = await window.ameow!.updater.check();
await window.ameow!.updater.downloadAndInstall();
```

Current-window bounds typing:

```ts
const result = await window.ameow!.currentWindow.animateBounds(bounds, {
  durationMs: 0,
  transitionToken,
});

if (result.transitionToken !== transitionToken) {
  return;
}
```

### 3. Contracts

- New Electron-migrated renderer files must not import:
  - `@tauri-apps/api/*`
  - `@tauri-apps/plugin-*`
  - `electron`
  - Node built-ins
- Use `window.ameow!.commands.invoke<T>(...)` for desktop commands and keep current command names stable while transport changes.
- Use `window.ameow!.events.on<T>(...)` / `emit(...)` for app events and keep current event names stable while transport changes.
- Desktop bootstrap code that detects Electron must fail fast if `window.ameow` is missing; do not silently mount the normal app shell as if it were plain web mode.
- Event subscriptions must treat each event name as its own channel contract. Do not rely on a single renderer listener that receives unrelated event names and filters them ad hoc.
- Secondary windows must go through:
  - `window.ameow!.windows.has(...)`
  - `window.ameow!.windows.focus(...)`
  - `window.ameow!.windows.openSettings(...)`
  - `window.ameow!.windows.openContextMenu(...)`
- Dev-only preview tooling may additionally use:
  - `window.ameow!.windows.openUiLab(...)`
  - `window.ameow!.commands.invoke<void>("dev_ui_lab_apply_scenario", { scenario })`
  - `window.ameow!.events.on<void>("ui-lab-reset", ...)`
- UI Lab and other internal preview routes must be gated behind `import.meta.env.DEV`; packaged builds must not expose a production-facing route or settings entry point for them.
- `window.ameow!.clipboard.readImage()` must return serializable pixel data only; renderer remains responsible for converting that into a `data:` URL for existing image-save flows.
- `window.ameow!.updater.check()` must return serializable `AppUpdateInfo | null`; renderer must not expect a raw updater handle object with platform-specific methods.
- App-update channel preference contract:
  - Settings persists the opt-in flag under config key `receivePrereleaseUpdates`.
  - Settings must write that key through `window.ameow!.commands.invoke<void>("save_config", { json })`; do not invent a dedicated updater-settings command unless the typed command surface is updated in the same change.
  - Renderer config parsing for desktop bootstrap/settings must tolerate invalid JSON and fall back to `{}` before reading `receivePrereleaseUpdates`.
  - Settings must emit `window.ameow!.events.emit("app-update-preference-changed", { receivePrereleaseUpdates: boolean })` after a successful save so already-mounted surfaces can refresh update state without restart.
  - Main-window listeners may treat `app-update-preference-changed` as a stateless refresh signal and re-run `window.ameow!.updater.check()`, but they must not assume the emitted payload is the source of truth over persisted config.
- High-frequency frameless-window motion must use the typed current-window bridge (`outerPosition()` + `setPosition(...)`) rather than `commands.invoke("set_window_position")`.
- Same-window icon-mode size morphs must use `window.ameow!.currentWindow.animateBounds(...)`; do not add a dedicated transition overlay BrowserWindow back into the renderer contract.
- If `currentWindow.animateBounds(...)` is used by competing compact/full paths, keep the request and response on one typed contract. Renderer code should pass an optional `transitionToken` and treat the echoed `transitionToken` as the async completion identity before committing follow-up UI state.
- If Electron main repositions `main` natively outside the renderer drag path, such as the `shortcut-show` summon flow, renderer compact/full helpers must refresh any cached `outerPosition()` before reusing it for `currentWindow.animateBounds(...)` or idle compact transitions.
- The optional global `window.ameow` is the migration boundary. Do not scatter ad hoc fallback branches across components; use a small adapter layer or fail fast where the bridge is required.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Migrated file still imports `@tauri-apps/*` | Code review / literal search | Renderer boundary stays preload-mediated | Replace imports with `window.ameow` usage |
| Preload command name drifts from current Rust command name | Runtime invoke path | Existing renderer call site still works | Keep current command string stable |
| Electron mode is detected but `window.ameow` is missing | Renderer bootstrap | Failure is explicit and diagnosable | Fail fast instead of silently mounting browser-mode UI |
| Event listener implementation depends on one shared desktop IPC channel | Re-render / subscription churn | Listener counts stay bounded and event payloads stay local to their contract | Use event-specific channels and matching cleanup |
| Child window created with raw Electron/Tauri APIs | Window lifecycle path | Window ownership stays centralized | Route through `window.ameow!.windows.*` |
| Dev-only preview route is registered in production | Renderer bootstrap / routing | Internal tooling stays hidden from packaged users | Gate route registration with `import.meta.env.DEV` |
| Scenario preview uses an untyped command or ad hoc event name | Preview boundary | UI Lab stays on the typed preload contract | Use `dev_ui_lab_apply_scenario` and `ui-lab-reset` from `src/types/electronBridge.ts` |
| Clipboard bridge returns non-serializable platform handle | Renderer paste path | Renderer can still convert to `data:` URL | Return structured `{ width, height, rgba }` only |
| Updater bridge leaks provider-specific object shape | Update UI path | Renderer remains platform-agnostic | Return `AppUpdateInfo | null` and expose install separately |
| Settings writes prerelease preference through ad hoc local state only | Update channel toggle path | Preference is lost on refresh/restart | Persist `receivePrereleaseUpdates` through `get_config` / `save_config` |
| Renderer crashes on invalid config JSON while reading app-update preference | Desktop bootstrap / Settings mount | UI still renders and defaults to stable-only updates | Parse config defensively and fall back to `{}` |
| Settings emits `app-update-preference-changed` before save succeeds | Cross-window refresh path | Main window may refresh against stale persisted config | Emit the event only after `save_config` resolves |
| Main window treats the emitted payload as canonical without rechecking updater state | Update-indicator path | UI can drift from the actual available update result | Re-run `window.ameow!.updater.check()` on the event |
| Frameless drag uses `commands.invoke("set_window_position")` inside `pointermove` | Main window interaction | Drag stays smooth | Use `currentWindow.setPosition(...)` fire-and-forget |
| Icon-mode expand introduces a second temporary overlay BrowserWindow | Main window transition path | Expand remains a single-HWND morph with no cross-window handoff | Use `currentWindow.animateBounds(...)` on the main window instead |
| `animateBounds(...)` completion from an old compact/full request still mutates renderer state | Main window transition path | Late callbacks cannot reapply stale native/window state | Carry a typed transition token through the request/response boundary and validate it after `await` |
| Electron main repositions the BrowserWindow before `shortcut-show`, but renderer reuses stale cached coordinates for the next compact/full transition | Shortcut summon then idle compact path | Compact icon stays anchored to the latest shortcut position | Refresh cached `currentWindow.outerPosition()` when `shortcut-show` arrives before reusing cached bounds |
| `window.ameow` absence handled differently in many components | Migration review | Bridge failures stay predictable | Centralize access behind one adapter or fail fast consistently |

### 5. Good / Base / Bad Cases

- Good:
  - A migrated component replaces `invoke<string>("get_config")` with `window.ameow!.commands.invoke<string>("get_config")` and keeps the same JSON parsing logic.
  - Settings toggles `receivePrereleaseUpdates`, persists it to config, emits `app-update-preference-changed`, and the main window refreshes update availability without restart.
  - `App.tsx` child-window logic moves from `WebviewWindow` calls to `window.ameow!.windows.has/focus/open*` without changing labels or visible behavior.
  - `src/main.tsx` stops booting the normal desktop shell when Electron is detected but the preload bridge is unavailable.
  - Dev-only UI review tooling opens `window.ameow!.windows.openUiLab(...)` from Settings and drives the real main window through the typed `dev_ui_lab_apply_scenario` command.
  - Frameless window dragging uses `outerPosition()` + `setPosition(...)` over the typed current-window bridge, so pointer-move updates stay out of the command invoke path.
  - `shortcut-show` first refreshes the renderer's cached `outerPosition()` and then runs the existing full-mode restore helper, so the next idle compact stays at the new shortcut anchor point.
  - Clipboard-image flows still receive pixel data that the renderer turns into a PNG data URL before calling `save_data_url`.
- Base:
  - Legacy Tauri files may still exist during incremental migration, but any newly migrated file uses the preload bridge exclusively.
- Bad:
  - A migrated file imports `ipcRenderer` directly.
  - Settings stores the prerelease toggle only in React state, so refresh/restart resets the user back to stable updates silently.
  - Main window subscribes to `app-update-preference-changed` but never re-runs the updater check, so the indicator keeps stale stable/prerelease state until the next app launch.
  - A renderer subscribes to one catch-all desktop event listener and switches on event names locally.
  - Shortcut summon moves the native BrowserWindow near the cursor, but renderer keeps a stale pre-shortcut position cache and shrinks the idle icon back to the old coordinates.
  - Desktop bootstrap silently falls back to browser-mode routing when `window.ameow` is missing.
  - Renderer update UI depends on an Electron-specific updater object instead of the preload contract.
  - Different components invent different child-window APIs instead of using `window.ameow!.windows`.

### 6. Tests Required (with assertion points)

- `npm run type-check` passes with `src/types/electronBridge.ts` and `src/global.d.ts` included.
- Migrated renderer files contain no fresh `@tauri-apps/*` imports.
- Electron bootstrap path shows an explicit failure state if `window.ameow` is unavailable.
- Child-window flows still open/focus `settings` and `context-menu` through the typed bridge.
- Dev-only preview route is registered only when `import.meta.env.DEV` is true.
- UI Lab renderer code uses typed bridge calls for `openUiLab`, `dev_ui_lab_apply_scenario`, and `ui-lab-reset`.
- Frameless drag stays on the typed current-window bridge and avoids per-move `invoke(...)`.
- `currentWindow.animateBounds(...)` callers keep the optional `transitionToken` request field and echoed response field aligned across renderer, preload, and main process.
- Clipboard-image save flows still receive enough data to produce a PNG data URL.
- Update UI still handles `null` from `window.ameow!.updater.check()` safely.
- Settings prerelease toggle survives invalid existing config JSON by writing a valid object with `receivePrereleaseUpdates`.
- Toggling the prerelease preference emits `app-update-preference-changed` only after `save_config` succeeds.

### 7. Wrong vs Correct

#### Wrong

```ts
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

const configStr = await invoke<string>("get_config");
const selected = await open({ directory: true });
```

#### Correct

```ts
const configStr = await window.ameow!.commands.invoke<string>("get_config");
const selected = await window.ameow!.system.openDialog({
  directory: true,
  multiple: false,
});
```
