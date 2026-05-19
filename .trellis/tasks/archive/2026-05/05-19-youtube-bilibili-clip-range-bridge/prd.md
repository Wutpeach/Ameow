# PRD: Preserve Injected Clip Range Through Electron Bridge

## Goal

Fix YouTube and Bilibili injected player clip downloads so clicking the blue cat download button after setting IN and OUT downloads the selected time range instead of the full video.

## Confirmed Facts

- The injected YouTube and Bilibili player controls keep `clipStartSec` / `clipEndSec` in page state and only mark the cat button clip-ready when the range is valid.
- `browser-extension/background.js` preserves the clip range when forwarding `video_selected_v2` to the desktop WebSocket.
- `electron/main.mts` receives `video_selected_v2` but currently drops `clipStartSec` and `clipEndSec` when invoking `queue_video_download`.
- Downstream code already supports the fields:
  - `src/electron-runtime/commandRouter.ts` normalizes clip seconds.
  - `src/sites/youtube.ts` and `src/sites/bilibili.ts` preserve clip seconds on `VideoDownloadIntent`.
  - `src/electron-runtime/ytDlpCommandPlan.ts` appends `--download-sections` for valid YouTube and Bilibili clip ranges.

## Requirements

- `video_selected_v2` handling in Electron must forward `clipStartSec` and `clipEndSec` to `queue_video_download`.
- Debug summaries for injected download requests must include clip range fields so future reproductions can confirm whether the selected range reached Electron.
- Existing full-video downloads with no clip range must remain unchanged.
- Existing validation remains owned by downstream runtime code; this task should not introduce a separate clip parser in `electron/main.mts`.

## Acceptance Criteria

- A `video_selected_v2` payload containing `clipStartSec` and `clipEndSec` queues a download request that still contains both fields.
- YouTube and Bilibili command planning continues to produce `--download-sections` for valid ranges.
- No-range `video_selected_v2` requests continue to queue full-video downloads.
- Targeted tests for the bridge and yt-dlp command path pass.

## Out Of Scope

- Adding precise cutting mode or `--force-keyframes-at-cuts`.
- Adding duration post-checks for completed clips.
- Changing player UI controls or styling.
- Changing yt-dlp format selection.
