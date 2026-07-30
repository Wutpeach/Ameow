## Scenario: Tauri Command + Event Type Contract

_Part 1 of 3._


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
| `download_video` | `invoke<{ traceId: string; success: boolean; file_path?: string; error?: string }>(...)` |
| `queue_pasted_video_download` | `invoke<{ accepted: boolean; traceId: string }>("queue_pasted_video_download", { url, pageUrl?, siteHint? })` |
| `queue_video_download` | `invoke<{ accepted: boolean; traceId: string }>("queue_video_download", { url, pageUrl?, videoUrl?, videoCandidates? })` |
| `download_image` / `save_data_url` | `invoke<string>(...)` |
| `process_files` | `invoke<ProcessFilesResult>("process_files", { paths, targetDir?, operation?: "copy" \| "move" })` |
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
    | "performance_resource"
    | "site_extractor";
  type?: string;
  confidence?: "high" | "medium" | "low";
  previewUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  siteHint?: string;
  groupId?: string;
  canonicalId?: string;
  variants?: PopupVideoVariant[];
  preferredVariantUrl?: string;
  preferredVariantLabel?: string;
  selectedVideoVariant?: PopupVideoVariant;
};

type PopupVideoVariant = {
  url: string;
  label?: string;
  type?: "direct_mp4" | "manifest_m3u8" | string;
  source?: "weibo_variant_parser" | "weibo_api_observer" | string;
  confidence?: "high" | "medium" | "low";
  mediaType: "video";
  qualityIndex?: number;
  width?: number;
  height?: number;
  bitrate?: number;
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

type BrowserDownloadStartResponse = {
  success: true;
  connected: boolean;
  downloadedBy: "browser";
  downloadId: number;
  browserDownloadStatus: "accepted";
};

type BrowserDownloadTrackedState = {
  downloadId: number;
  url: string;
  filename: string;
  status: "accepted" | "complete" | "interrupted";
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  interruptedAt?: number;
  error?: string;
};
```

Message flow:

```text
popup.js -> chrome.runtime.sendMessage({ type: "scan_page_media" })
background.js -> active tab frame 0: { type: "ameow_scan_page_media" }
generic-video-detector.js -> PopupMediaScanResult
background.js -> normalize/cache -> popup.js
popup.js -> chrome.runtime.sendMessage({ type: "download_media_candidate", candidate })
background.js -> chrome.downloads.download({ url, filename }) -> BrowserDownloadStartResponse
chrome.downloads.onChanged -> bounded BrowserDownloadTrackedState update
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
- Browser fallback downloads use `chrome.downloads.download({ url, filename })` for filename control. Do not add `chrome.downloads.onDeterminingFilename` unless a real browser filename conflict or filename-loss bug proves the direct `filename` option is insufficient.
- Browser download lifecycle tracking is lightweight background state, not a popup download manager. The background records only extension-started download ids as `accepted`, updates them from `chrome.downloads.onChanged` to `complete` or `interrupted`, and keeps the map bounded by TTL plus total count. Popup feedback should not show an extra success message for browser fallback downloads; start, completion, failure, and conflict handling remain owned by the browser downloads UI unless a later product requirement adds notifications or a full manager.
- Browser fallback is limited to complete direct-file resources. Complex/current-page Bilibili rows may show `[Desktop]`, and Bilibili `.m4s` / `m3u8` / `ts` / separated stream resources must not be retained as browser fallback download candidates. Stream parsing, merge, and remux work belongs to the desktop app unless a later extension-side pipeline is explicitly designed.
- Pinterest pin pages may expose direct `i.pinimg.com` images, direct `v1.pinimg.com` `.mp4` files, and adaptive `.m3u8/.mpd` variants for the same asset. Popup scans should keep direct image/`.mp4` resources browser-downloadable and filter Pinterest manifest variants from generic scan/network-cache rows so the popup does not show multiple desktop-required formats for one direct-downloadable pin.
- Pinterest `.cmfv` resources are HLS/CMAF stream parts, not complete browser-downloadable files. Popup scans must filter them from video-element, performance, and network-cache rows. If a visible Pinterest pin video exposes only `.cmfv`/HLS-style resources and no direct `.mp4`, the popup should show one page-level `[Desktop]` candidate using the canonical `/pin/<id>/` URL so the desktop app can resolve the page instead of trying to download the segment URL.
- Popup resource metadata should be user-facing media facts, not implementation/source details. Video/audio rows should show format, file size, duration, and dimensions when known; image cards should show format, dimensions, and size when known, and should not show image titles in the details area.
- Site-specific popup parsers may emit `source: "site_extractor"` candidates with optional `variants[]`, `groupId`, `canonicalId`, `preferredVariantUrl`, and `siteHint`. The popup must keep this contract generic: render one grouped resource row and show a row-level quality selector only when `variants.length > 1`; do not expand quality variants into separate top-level rows.
- Popup grouping must merge a direct media candidate with a grouped `site_extractor` candidate when the direct URL appears in the grouped candidate's `variants[]`. This lets a concrete current-playback URL provide preview/browser-fallback behavior while the grouped row keeps desktop routing and quality selection.
- If a site's variant metadata is available only through page-owned runtime API responses, use a host-scoped document-start page bridge that observes already-requested `fetch` / `XMLHttpRequest` responses and posts bounded sanitized variant records back to the content script. Do not add proactive site API requests just to populate popup variants unless a later product task explicitly changes that scope.
- Page bridges must not post whole API responses. They may publish only direct variant URLs plus bounded metadata needed for grouping and display: `statusId/pageUrl/groupKey`, `label`, `qualityIndex`, `width`, `height`, `bitrate`, `type`, `source`, and `mediaType`.
- Observed runtime variant caches must be bounded by total records, total variants per record, and freshness/TTL. Parser output should merge observed runtime variants with DOM-script variants and then sort by the same quality ranking used for DOM-derived variants.
- On detail/status pages with a known current content id, site parsers must filter both DOM-script and runtime-observed variants to the current id or canonical page URL. Unscoped response-level URLs and variants belonging to recommendation/sidebar items must not be included in the current video's selector.
- Site variant ownership must come from the nearest content/status object on the path to the media URL. Nested recommendation/sidebar media must not inherit an outer current status id as a fallback.

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
| Browser download is accepted by Chrome | `startBrowserDownload` | Response includes `downloadId` and `browserDownloadStatus: "accepted"` | Record the id in bounded background state |
| Browser later emits `state.current: "complete"` | `chrome.downloads.onChanged` | Tracked state becomes `complete` | Update only matching extension-started download ids |
| Browser later emits `state.current: "interrupted"` | `chrome.downloads.onChanged` | Tracked state becomes `interrupted` and keeps browser error if present | Update only matching extension-started download ids |
| Many browser fallback downloads are started | Browser download tracker | State remains bounded | Prune by TTL and total count |
| Filename polish is requested without a concrete filename bug | Code review | No global filename hook is added | Keep `chrome.downloads.download({ filename })` |
| Bilibili exposes renderable `video/mp4` `.m4s` media while desktop is offline | `normalizeNetworkMediaEntry` / `canUseBrowserFallback` | Popup does not surface the fragment as a browser fallback download; only the desktop-required enhanced row remains | Skip the network fragment and keep stream handling on the desktop path |
| Pinterest pin exposes direct `.mp4` plus `.m3u8/.mpd` variants | `collectPerformanceCandidates` / `normalizeNetworkMediaEntry` | Popup keeps the direct `.mp4` candidate and filters manifest variants | Treat `pinimg.com` as a Pinterest media CDN only for direct candidates and drop Pinterest manifests from popup scan/cache |
| Pinterest pin exposes multiple direct `.mp4` encodes/resolutions for one asset | `mergeNetworkCandidatesIntoScanResult` | Popup shows one best direct `.mp4` candidate instead of every variant | Group by Pinterest video asset hash and prefer larger/higher-resolution direct candidates |
| Pinterest pin exposes only `.cmfv` / HLS-style video URLs | `collectVideoScanCandidates` / `normalizeNetworkMediaEntry` | Popup does not list `.cmfv`; it shows one page-level `[Desktop]` candidate for the canonical pin URL | Treat `.cmfv` as a stream part and route desktop handoff by page URL |
| Popup media row has URL/source-heavy metadata | `popup.js` render path | Row displays format/size/duration/dimensions only | Use `candidateDetailLabel(...)` for video/audio and image card metadata |
| Site parser emits one logical candidate with two or more variants | `mergeDisplayCandidates` / `createVariantSelector` | Popup shows one row with a resource-scoped selector and highest-ranked variant selected by default | Preserve `variants[]`, `preferredVariantUrl`, and `selectedVideoVariant` through display candidate creation |
| Direct current-playback URL is also present inside a grouped variant list | `mergeDisplayCandidates` compatibility check | Popup shows one logical resource row, not one direct row plus one `[Desktop]` row | Treat variant URL membership as row compatibility |
| Runtime API response contains variants but DOM scripts do not | Site page bridge + parser cache | Popup scan still receives one grouped `site_extractor` candidate with merged variants | Observe page-owned responses, cache sanitized records, and merge them in the parser |
| Page bridge observes a large or sensitive JSON response | Page bridge serializer | Only bounded variant records cross into the content script; unrelated response fields are dropped | Do not post whole responses or unbounded nested objects |
| Site variant task proposes proactive API probing | Code review / product scope | Implementation is rejected unless the task explicitly approves proactive calls | Keep page bridge observation passive by default |
| Detail page API/script data includes current item plus recommendation items | Site parser grouping/filtering | Current popup row lists only variants for the active detail status id | Require status id/canonical page match before adding variants to the active grouped candidate |
