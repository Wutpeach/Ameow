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
    "selectedVideoVariant": {
      "url": "https://cdn.example/video-1080.mp4",
      "label": "1080p",
      "type": "direct_mp4",
      "mediaType": "video"
    },
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
- `video_selected_v2` WebSocket requests must preserve all download-routing fields when converting to `queue_video_download`. This includes `pageUrl`, `selectionScope`, `clipStartSec`, `clipEndSec`, `videoUrl`, `selectedVideoVariant`, `videoCandidates`, `siteHint`, `title`, `extensionData` / `extension_data`, and quality preference fields. Do not manually rebuild this payload inline in `electron/main.mts`; use the shared queue-payload builder so new fields are testable.
- `selectedVideoVariant` is explicit user intent from a grouped resource row. It is not equivalent to passive `videoCandidates[]` hints and must survive WebSocket -> command bridge -> raw input validation.
- Managed runtime bootstrap invoked by `src/electron-runtime` must wait for the managed runtime install/check path to finish before returning a refreshed runtime dependency snapshot.

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| `queue_video_download` receives a valid HTTP(S) URL | Normalize payload and call `runtime.queueVideoDownload()` |
| `queue_video_download` receives a missing/invalid URL | Reject before queueing |
| `video_selected_v2` carries `clipStartSec` + `clipEndSec` | Forward both fields to `queue_video_download`; runtime command planning later emits `--download-sections` for supported sites |
| `video_selected_v2` carries `extensionData.youtube` | Forward the metadata object to `queue_video_download`; `src/electron-runtime/commandRouter.ts` remains responsible for normalizing allowed YouTube keys |
| `video_selected_v2` carries Weibo `selectedVideoVariant` | Forward the selected variant to runtime; Weibo provider routes the selected URL through a single `yt-dlp` plan and does not fall back to gallery-dl |
| `queue_pasted_video_download` extension resolution succeeds with a URL | Merge extension payload and enqueue through runtime |
| `queue_pasted_video_download` extension disconnected, times out, fails, or returns no URL | Log fallback and enqueue the original URL through runtime |
| `pasted_video_selection_result` missing `correlationRequestId` | Return failed WS ack with `missing_correlation_request_id` |
| `pasted_video_selection_result` has unknown correlation id | Return failed WS ack with `unknown_correlation_request` |
| App is quitting with pending pasted-video requests | Reject pending bridge promises and clear timers |
| Active runtime download is cancelled | Runtime emits terminal `video-download-complete` failure/cancel payload |

### 5. Good / Base / Bad Cases

- Good: YouTube pasted URL asks the extension for page context, receives a resolved URL/metadata payload without cookies, and enqueues through `src/electron-runtime`.
- Good: YouTube/Bilibili injected player sends `video_selected_v2` with `clipStartSec`, `clipEndSec`, and `extensionData`; Electron bridge forwards those fields unchanged into `queue_video_download`.
- Good: A Weibo popup row with a selected `1080p` variant sends `selectedVideoVariant`, and backend failure text identifies the selected quality instead of silently downloading another quality.
- Base: Generic pasted URL has no extension-assisted site hint and enqueues directly through `src/electron-runtime`.
- Bad: `electron/main.mts` reconstructs a `queue_video_download` payload inline and omits a browser-originated field such as `clipStartSec`, causing downstream runtime code to choose the full-video path.
- Bad: Treating Weibo `selectedVideoVariant` as just another `videoCandidates[]` hint and allowing gallery-dl fallback to download a different quality.
- Bad: Reintroducing `activeVideoDownloads`, `pendingVideoDownloads`, `child_process.spawn("yt-dlp", ...)`, or `--progress-template` handling in `electron/main.mts`.

### 6. Tests Required

- `electron/extensionRequestBridge.test.mts`: request broadcast, correlation resolution, unknown/missing correlation failure, timeout/shutdown cleanup.
- `electron/videoDownloadCommands.test.mts`: normal queue dispatch, injected `video_selected_v2` payload builder preserving clip fields, `selectedVideoVariant`, and `extensionData`, pasted assisted success, pasted assisted fallback, cancellation dispatch.
- `src/sites/providers.test.ts`: Weibo `selectedVideoVariant` resolves to one `yt-dlp` engine plan with the selected URL and no gallery-dl fallback.
- `src/orchestration/download-orchestrator.test.ts`: explicit Weibo selected-variant failures include selected-quality wording.
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
