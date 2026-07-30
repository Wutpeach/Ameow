## Scenario: Tauri Command + Event Type Contract

_Part 2 of 3._

### 5. Good / Base / Bad Cases

- Good:
  - A normal page scan returns `{ videos, audios, images }`, the popup shows `Video / Audio / Image`, and cache refresh replaces stale counts without blocking first render.
  - A page with `<audio src="song.mp3" duration=180>` shows one Audio row.
  - `chrome://extensions` returns `scan_restricted_page` immediately and the popup shows an unavailable state.
  - Browser fallback download returns `accepted` with a download id, then background state moves to `complete` or `interrupted` when Chrome emits the change.
- Base:
  - Existing video/image-only detectors still work because missing `audios` normalizes to `[]`.
  - A popup close during scan is harmless because the background promise can finish and cache the result.
  - If the popup closes after starting a browser download, the browser still owns the final download UI and background state remains bounded.
- Bad:
  - Cache keyed only by URL shows one tab's scan results in another tab.
  - Popup assumes `result.audios` exists before background normalization.
  - Audio detection lists dozens of `m4s` chunks or 1-second UI sounds as downloadable audio.
  - A global `onDeterminingFilename` listener rewrites unrelated browser downloads without a proven need.
  - Popup text says a browser download completed when the extension only knows Chrome accepted it.

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
- Browser download lifecycle helper records accepted downloads, handles complete/interrupted changes, ignores untracked ids, and prunes to its configured limit.
- Popup feedback does not show an extra browser fallback success message.
- Bilibili `.m4s` network fragments are skipped/rejected as browser fallback candidates even when their content type is `video/mp4`.
- Pinterest popup scans keep direct `v1.pinimg.com` `.mp4` candidates, filter `.m3u8/.mpd` variants, and classify `i.pinimg.com` image URLs as browser-downloadable.
- Pinterest `.cmfv` stream parts are filtered from popup resources; visible pin videos without direct `.mp4` get one canonical pin-page `[Desktop]` candidate.
- Popup media metadata omits host/source/link-like text; image cards omit image titles from the details area.
- Site-specific grouped candidates render one row with a row-level selector when `variants.length > 1`.
- Direct current-playback candidates merge with a grouped variant row when their URL appears in `variants[]`.
- A Weibo-style runtime API response with `playback_list` variants produces a grouped candidate even when DOM scripts contain no variants.
- A Weibo-style response/script containing current and recommendation videos filters the selector to the current status id.

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

#### Wrong

```js
// Content script cannot reliably see page-owned response bodies, and this
// actively probes the site instead of observing data the page already loaded.
const response = await fetch("/ajax/statuses/show?id=" + statusId);
candidate.variants = await response.json();
```

#### Correct

```js
// Page bridge observes the page's own response and posts only sanitized records.
window.postMessage({
  source: "ameow-weibo-page",
  type: "AMEOW_WEIBO_VIDEO_VARIANTS",
  records: [{ statusId, variants }],
}, "*");
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

#### Site Login-State Entry Points Contract

- Source files: `src/pages/SettingsPage.tsx`, `browser-extension/popup.js`, `src/types/siteSession.ts`, `src/types/electronBridge.ts`
- Settings command: `sync_site_session_from_extension`
- Extension popup WS action: `site_session_sync_request`
- Event: `site-session-state-changed`

Behavior contract in frontend:
- The main window must not render a site-session pending dot, subscribe to `site-session-pending-actions-changed`, or call `get_site_session_pending_actions`.
- Settings remains the desktop UI for visible site-session rows. Manual sync uses `invoke<SiteSessionState>("sync_site_session_from_extension", { siteId })`.
- The browser-extension popup may initiate current-site sync, but it must ask desktop to run `site_session_sync_request { siteId }`; it must not push persistent cookies through a separate direct-import action.
- `site-session-state-changed` is the Settings live-refresh event. Treat its registry entries and site state as desktop-owned truth.
- Auth-required discovery should surface in Settings, the extension login-state drawer, or task-specific recovery UI, not as a main-window status dot.

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
