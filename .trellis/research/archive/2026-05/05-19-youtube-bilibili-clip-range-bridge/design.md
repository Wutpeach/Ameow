# Design: Preserve Injected Clip Range Through Electron Bridge

## Boundary

The browser extension already sends clip range fields and the runtime downloader already knows how to use them. The bug is isolated to the Electron WebSocket action handler for `video_selected_v2`, which builds a new `queue_video_download` payload and omits the clip fields.

## Data Flow

Current expected flow:

```text
youtube-detector.js / bilibili-detector.js
  -> background.js video_selected_v2 payload
  -> electron/main.mts WebSocket action handler
  -> videoDownloadCommands queue_video_download
  -> commandRouter RawDownloadInput
  -> site provider VideoDownloadIntent
  -> ytDlpCommandPlan --download-sections
```

This task changes only the Electron bridge handoff:

```ts
getVideoDownloadCommandBridge().invoke("queue_video_download", {
  ...existingFields,
  clipStartSec: data.clipStartSec,
  clipEndSec: data.clipEndSec,
});
```

Downstream normalization keeps rejecting invalid or incomplete ranges, so Electron main stays a transport layer instead of owning validation.

## Observability

`electron/videoDownloadCommands.mts` summaries should include `clipStartSec` and `clipEndSec` when present. Existing injected-debug logging then becomes enough to verify the range reached the queue boundary.

## Compatibility

No-range requests keep `undefined` clip fields and continue the full download path. Existing snake_case handling remains downstream in `commandRouter`; the injected browser path uses camelCase.

## Rollback

Revert the two bridge/summary edits and the focused tests. The change does not alter persisted config or output files.
