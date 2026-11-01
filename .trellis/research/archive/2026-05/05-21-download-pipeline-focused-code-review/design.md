# Download Pipeline Review Design

## Boundaries

This task produces an audit report, not a code change. The review follows the full download request lifecycle:

1. Browser extension detects or receives a selected video/media target.
2. Electron receives extension WebSocket messages or renderer IPC commands.
3. Electron command bridge normalizes and dispatches requests.
4. Electron runtime validates, queues, cancels, and emits progress/terminal events.
5. Provider routing and engine orchestration select direct, yt-dlp, gallery-dl, Douyin, or follow-up transcode paths.
6. Runtime dependency helpers resolve managed/bundled binaries and bootstrap state.

## Contract Checks

The review will compare implementation behavior against project specs:

- `electron/main.mts` must not own duplicate download queue or executor state.
- `video_selected_v2` payloads must preserve routing fields including `pageUrl`, `selectionScope`, clip bounds, direct hints, candidates, site hints, title, extension metadata, and quality preference.
- `queue_pasted_video_download` must enqueue through the same runtime path as `queue_video_download`.
- Runtime service remains the sole owner of queue state, cancellation, progress, terminal completion, telemetry, and transcode follow-up.
- Active and pending cancellation must emit terminal settlement and refreshed queue state.
- Executors must share safe spawn/path/runtime-dependency behavior and clean transient resources.
- Direct URL hints are treated as hints, not trusted source of truth.

## Evidence Standard

Only high-confidence findings should be reported as defects. Lower-confidence observations should be labeled as risks or test gaps. Each defect should be traceable to code lines and a violated contract or observable failure mode.

## Non-Goals

- Do not perform broad refactors.
- Do not run live downloads against third-party services unless explicitly requested.
- Do not change release/runtime versions.
- Do not archive the task until the user has received the review and requested finish.
