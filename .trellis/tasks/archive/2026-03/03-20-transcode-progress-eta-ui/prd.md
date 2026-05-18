# Add Real Transcode Progress And ETA To Queue And Floating Window

## Goal
Show real FFmpeg transcode progress during compatible MP4 conversion, including an estimated remaining time in both the transcode queue list and the main floating window.

## Requirements
- Replace the current "wait for FFmpeg to finish" transcode execution path with a streaming execution path that can observe progress while the process is running.
- Derive real transcode progress from FFmpeg runtime output instead of showing only stage placeholders.
- Estimate remaining transcode time while the active task is running and expose that ETA through the existing transcode event pipeline.
- Extend transcode event payloads in a backward-safe way so the frontend can render:
  - current transcode stage
  - numeric progress percent
  - estimated time remaining
  - optional human-readable status summary when available
- Preserve the existing queue contract:
  - one active transcode at a time
  - queued/failed ordering stays the same
  - `video-download-complete` semantics do not change
  - retry/remove behavior does not change
- Keep the existing remux-only and audio-only paths functional. If a path cannot produce meaningful streaming progress, the UI must still remain stable and show the best available stage/summary.
- Update the transcode queue list so active tasks show real progress and ETA instead of only stage text.
- Update the main floating window so the primary transcode task can show an ETA reminder when available.
- Add the required i18n strings for any new ETA/status copy in both English and Simplified Chinese.
- Update the executable type-contract docs because this is a cross-layer payload change.

## Acceptance Criteria
- [ ] While a full transcode is running, the backend emits incremental `video-transcode-progress` updates before completion.
- [ ] Active transcode queue rows display real progress percent instead of a mostly static placeholder.
- [ ] Active transcode queue rows display an ETA when the backend can calculate one.
- [ ] The main floating window displays an ETA hint for the active transcode task when available.
- [ ] Pending, failed, retry, cancel, and complete flows remain stable.
- [ ] Existing download queue behavior remains unchanged.
- [ ] `.trellis/spec/backend/type-safety.md` and `.trellis/spec/frontend/type-safety.md` are updated to reflect the new transcode payload fields.
- [ ] `npm run lint`, `npm run type-check`, `npm run test`, and `cargo check` pass.

## Technical Notes
- Current transcode progress behavior is incomplete by design:
  - `normalize_video_output_for_ae(...)` calls `run_ffmpeg_with_args(...)`
  - `run_ffmpeg_with_args(...)` currently waits on `run_ffmpeg_capture_output(...)`
  - `run_ffmpeg_capture_output(...)` uses `wait_with_output()` and does not stream intermediate FFmpeg progress
- The app already has a reusable streaming process pattern in `spawn_streaming_cli_command(...)`, which is used for yt-dlp and other long-running runtime tasks.
- The backend already parses FFmpeg `time=` output in `parse_ffmpeg_time_seconds(...)`, but that logic is currently tied to yt-dlp heartbeat handling rather than the transcode queue.
- Current transcode payload shape in Rust includes:
  - `traceId`
  - `label`
  - `status`
  - `stage`
  - `progressPercent`
  - `sourcePath`
  - `sourceFormat`
  - `targetFormat`
  - `error`
- Current frontend transcode task shape mirrors that Rust payload in `src/App.tsx`.
- Current frontend queue/floating-window behavior:
  - queue rows render `getVideoTranscodeTaskProgressPercent(task)`
  - queue status text renders `getTranscodeTaskStatusText(task)`
  - the main floating window uses the merged primary task summary/status text
- Probable implementation direction:
  - extend media probe metadata or compute task duration so percent can be derived from `processed_seconds / total_duration_seconds`
  - stream FFmpeg stderr/stdout for transcode tasks
  - periodically emit `video-transcode-progress` with percent and ETA
  - surface ETA in queue rows and in the primary transcode summary
- If remux-only tasks do not expose granular progress, they may continue to use stage-based UI with no ETA, but full re-encode tasks should provide real progress.
- Research note:
  - `ace-tool` was unavailable in this session, so repository research used focused `rg` fallback plus direct file inspection.
