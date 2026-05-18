# implement backend transcode queue model

## Goal

Implement the backend half of the new download/transcode model for FlowSelect. The backend should stop treating AE-safe normalization as an inline late download stage and instead model it as a separate transcode queue that starts only after active downloads drain to zero.

## Source Decision Context

This task is Phase 1 extracted from:

* [brainstorm PRD](D:/FlowSelect/.trellis/tasks/03-11-brainstorm-redesign-extension-ae-format-option/prd.md)

Product decisions already fixed before implementation:

* Keep extension quality labels as `Highest / Balanced / Saver`
* Remove the extension-side `AE Format` toggle later in Phase 3
* Any finished download result that is not AE-safe should automatically enqueue a transcode task
* Transcoding should replace the original source file after success
* Failed transcode tasks should support `retry` and `remove`
* `retry` means retry the local transcode job, not redownload
* `remove` means remove the failed task from queue UI/state, without deleting the local source file
* Downloads remain priority-first
* Transcoding is serial
* The transcode worker starts only when active download count is zero
* Download completion and transcode completion are separate lifecycle milestones

## Scope

In scope:

* Backend queue model changes in [lib.rs](D:/FlowSelect/src-tauri/src/lib.rs)
* New backend state and events for a dedicated transcode queue
* New task lifecycle for:
  * download complete
  * transcode queued
  * transcode active
  * transcode failed
  * transcode removed
  * transcode retried
  * transcode complete
* Scheduling rules for `download priority + serial transcode + start only when downloads reach zero`
* Separate event semantics so frontend can later render download queue and transcode queue independently

Out of scope:

* Desktop UI rendering in [App.tsx](D:/FlowSelect/src/App.tsx)
* Theme/color changes in [ThemeContext.tsx](D:/FlowSelect/src/contexts/ThemeContext.tsx)
* Extension popup changes in `browser-extension/`
* Copy polish for user-facing UI beyond backend event/status payload naming
* Reworking yt-dlp format selection policy itself

## Existing Backend Reality

Current state in [lib.rs](D:/FlowSelect/src-tauri/src/lib.rs):

* Download queue exists as a single queue model with up to `3` concurrent downloads
* AE-safe normalization currently happens inline after yt-dlp success
* `DownloadProgressStage::PostProcessing` is used for that inline tail stage
* Current completion event semantics are effectively tied to the old inline pipeline
* Existing AE-safe normalization helpers already support:
  * probe
  * remux
  * audio transcode
  * full transcode
  * output replacement with backup safety

This implementation should preserve the normalization logic where possible, but move it behind a separate queue/task model.

## Requirements

* Preserve the current download queue behavior for acquiring source media.
* Remove the need for inline download-stage `post_processing` as the primary model for AE normalization.
* After a source download finishes:
  * if the file is AE-safe, finish the download lifecycle normally
  * if the file is not AE-safe, emit download completion for the source file, then enqueue a transcode task
* Add a dedicated backend transcode queue state model.
* The transcode queue must support:
  * `pending`
  * `active`
  * `failed`
* The transcode worker must:
  * run at most one task at a time
  * start only when active download count is zero
* Retry behavior:
  * retry uses the preserved local source file
  * retry should not recreate a network download
* Remove behavior:
  * remove deletes the failed transcode task from backend queue/state
  * remove must not delete the local media file
  * remove must not silently recreate the same transcode task later
* Completion semantics:
  * `video-download-complete` means source media finished downloading
  * transcode completion must be modeled separately
* Keep successful replacement semantics:
  * on successful transcoding, replace the original file with the AE-friendly output
* Provide backend payloads/events that the desktop UI can later use for:
  * download queue summary/detail
  * transcode queue summary/detail
  * primary active task

## Proposed Backend Contract

This task should define or prepare a stable contract for the frontend.

Suggested queue payload split:

* `download queue`
  * count payload
  * detail payload
* `transcode queue`
  * count payload
  * detail payload

Suggested task payload shape:

* `traceId`
* `label`
* `status`
* optional `stage`
* optional `progressPercent`
* optional `sourcePath`
* optional `sourceFormat`
* optional `targetFormat`
* optional `error`

Suggested transcode stage enum:

* `analyzing`
* `transcoding`
* `finalizing_mp4`
* `failed`

Suggested commands/events to expose or prepare:

* queue state events for downloads
* queue state events for transcodes
* `retry_transcode`
* `remove_transcode`
* transcode progress event
* transcode complete event
* transcode failed event

Exact naming can differ, but the separation in semantics must be clear.

## Acceptance Criteria

* [ ] Source download completion is emitted before downstream transcoding begins.
* [ ] Any non-AE-safe finished download is converted into a transcode queue item instead of being handled only as inline download post-processing.
* [ ] Active downloads can still run up to the existing configured maximum.
* [ ] No transcode task starts while any download is active.
* [ ] At most one transcode task runs at a time.
* [ ] Retrying a failed transcode does not recreate a download task.
* [ ] Removing a failed transcode removes the queue item without deleting the local source file.
* [ ] Successful transcode output replaces the original file path using the existing safe replacement behavior.
* [ ] Backend state/events are sufficient for a later frontend split into download queue and transcode queue.
* [ ] Legacy inline `post_processing` assumptions are either removed or clearly downgraded so they no longer represent the main model.

## Implementation Notes

Likely hotspots:

* [lib.rs](D:/FlowSelect/src-tauri/src/lib.rs)
  * queue state structs
  * queue scheduling
  * yt-dlp success finalization
  * AE-safe normalization entrypoint
  * event emission
  * cancellation handling

Likely relevant existing symbols:

* `VideoTaskQueueState`
* `MAX_CONCURRENT_VIDEO_DOWNLOADS`
* `finalize_ytdlp_success()`
* `normalize_video_output_for_ae()`
* `emit_post_processing_status()`
* `DownloadProgressStage`

Migration strategy suggestion:

1. Introduce transcode queue structs and scheduler first
2. Change yt-dlp success path to enqueue transcode instead of running inline normalization
3. Add retry/remove commands
4. Emit new queue/detail/progress events
5. Clean up old inline `post_processing` assumptions

## Verification

Expected verification work for this task:

* backend-focused tests where practical in [lib.rs](D:/FlowSelect/src-tauri/src/lib.rs)
* manual reasoning or logging validation for:
  * safe files bypassing transcode queue
  * non-safe files entering transcode queue
  * transcode blocked while downloads remain active
  * retry path using local source
  * remove path not deleting source file

