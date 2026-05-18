# audit: retire legacy queued ytdlp migration risk

## Goal

Audit the previously deferred "legacy `electron/main.mts` queued yt-dlp path" risk and decide whether there is still a separate high-risk migration to implement. If no legacy execution path remains, update the parent architecture plan so future work does not keep reserving effort for a non-existent migration target.

## What I Already Know

- Parent task: `05-16-download-architecture-refactor`.
- User wants to address the hard/risky part before continuing easier `electron/main.mts` extractions.
- Current download queue and execution path is primarily in `src/electron-runtime/service.ts`.
- `electron/videoDownloadCommands.mts` bridges renderer command names such as `queue_video_download`, `queue_pasted_video_download`, and `cancel_download` to the runtime.
- `electron/main.mts` handles WebSocket `video_selected_v2` by invoking `getVideoDownloadCommandBridge().invoke("queue_video_download", ...)`.
- Local grep for queue/progress/completion paths in `electron/main.mts` shows no separate yt-dlp queued execution path; remaining queue-like emissions there are UI Lab mock scenarios.
- Claude consultation reached the same core conclusion before it was stopped for over-exploration: `electron/main.mts` appears to have no remaining independent legacy queued yt-dlp download execution path after `206bf88 refactor(electron): route downloads through runtime bridge`.

## Requirements

- Prove whether any direct `yt-dlp` download execution remains in `electron/main.mts` outside version checks/support diagnostics.
- Prove whether `video_selected_v2`, renderer queue commands, progress events, completion events, cancellation, and queue counts all route through `src/electron-runtime/service.ts` or its bridge.
- If no migration target remains, update the parent PRD deferred-work section to replace the old "defer migration" note with an audited conclusion.
- If a real legacy path is found, scope a focused implementation task before changing behavior.

## Acceptance Criteria

- [x] Search evidence is recorded for `queue_video_download`, `video_selected_v2`, `video-download-progress`, `video-download-complete`, `spawn`, and `yt-dlp` in `electron/main.mts`.
- [x] The current runtime bridge path is summarized with file references.
- [x] A decision is made:
  - "retire deferred migration risk" if no separate path remains, or
  - "create implementation task" if a real legacy path remains.
- [x] Parent PRD is updated to reflect the decision.
- [x] Focused tests/checks are run or explicitly listed if this remains audit-only.

## Out of Scope

- Do not rewrite `src/electron-runtime/service.ts` in this audit task unless a blocking defect is found.
- Do not refactor image download, config/settings IO, UI Lab, or window IPC in this task.
- Do not change renderer/WS command names or event payload shapes.

## Technical Notes

- Relevant files:
  - `electron/main.mts`
  - `electron/videoDownloadCommands.mts`
  - `src/electron-runtime/commandRouter.ts`
  - `src/electron-runtime/service.ts`
  - `src/electron-runtime/ytDlpDownload.ts`
  - `src/electron-runtime/service.test.ts`
  - `electron/videoDownloadCommands.test.mts`
- Claude consultation summary:
  - It independently grepped `electron/main.mts` for queue/download terms.
  - It found `video_selected_v2` delegating to `queue_video_download`.
  - It noted remaining `video-queue-*` and `video-download-progress` emissions in `electron/main.mts` are UI Lab scenarios, not real queued yt-dlp execution.
  - It concluded the deferred risk may already be handled by the runtime bridge and should be audited/retired rather than blindly migrated.

## Audit Findings

### Search Evidence

- `spawn` in `electron/main.mts` appears only in `getLocalDownloaderVersion(...)` around the downloader version check path, not real download execution.
- `queue_video_download` in `electron/main.mts` appears only in the WebSocket `video_selected_v2` handler and delegates to `getVideoDownloadCommandBridge().invoke("queue_video_download", ...)`.
- `video-download-complete` is emitted by `src/electron-runtime/service.ts` for pending cancellation, success, and failure; there are no real completion emissions in `electron/main.mts`.
- `video-download-progress` in `electron/main.mts` appears only inside UI Lab scenarios; real progress is emitted by `src/electron-runtime/service.ts`.
- `video_selected_v2` in `electron/main.mts` is the WebSocket compatibility entrypoint and now calls the runtime command bridge.

### Current Runtime Bridge Path

1. Renderer command or WebSocket `video_selected_v2` reaches `electron/main.mts`.
2. `electron/main.mts` calls `getVideoDownloadCommandBridge()`.
3. `electron/videoDownloadCommands.mts` normalizes preferences and invokes `queue_video_download` through `src/electron-runtime/commandRouter.ts`.
4. `src/electron-runtime/commandRouter.ts` calls `runtime.queueVideoDownload(...)`.
5. `src/electron-runtime/service.ts` owns queueing, progress, completion, cancellation, telemetry, provider/engine execution, and transcode follow-up.

### Decision

Retire the deferred legacy queued yt-dlp migration risk. There is no separate legacy queued yt-dlp execution path left in `electron/main.mts` to migrate. Future work should continue with the remaining `electron/main.mts` modular extractions, starting with image/download save logic because it is download-adjacent and still has meaningful complexity.

### Suggested Next Refactor Order

1. Extract image/download save logic:
   - `normalizeImageDownloadRequestHeaders`
   - `deriveImageDownloadHeaders`
   - `fetchImageWithNodeRequest`
   - `fetchImageForDownload`
   - `downloadImage`
   - `saveDataUrl`
   - related filename/extension helpers if not already shared.
2. Extract config/settings IO after image save:
   - path providers and directory creation,
   - config read/write,
   - language/theme/debug config derivation,
   - side-effect callbacks for app events, WS broadcast, and tray refresh.
3. Then continue with current-window/window IPC and UI Lab.

### Validation

- Audit commands used `fff` content search for:
  - `spawn`
  - `queue_video_download`
  - `video_selected_v2`
  - `video-download-progress`
  - `video-download-complete`
  - `getVideoDownloadCommandBridge`
  - `createVideoDownloadCommandBridge`
- No code behavior changed in this audit task.
