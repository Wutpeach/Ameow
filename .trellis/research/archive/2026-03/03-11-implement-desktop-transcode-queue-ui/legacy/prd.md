# implement desktop transcode queue ui

## Goal

Implement Phase 2 of the new download/transcode model in the desktop UI. The desktop app should stop presenting everything as a single download queue and instead consume the new backend transcode queue contract, showing download tasks and transcode tasks as separate but related stages inside the main window.

## Source Decision Context

This task is Phase 2 extracted from:

* [brainstorm PRD](D:/FlowSelect/.trellis/tasks/03-11-brainstorm-redesign-extension-ae-format-option/prd.md)
* [backend Phase 1 PRD](D:/FlowSelect/.trellis/tasks/03-11-implement-backend-transcode-queue-model/prd.md)

Product decisions already fixed before implementation:

* Keep the extension quality labels as `Highest / Balanced / Saver`
* Remove the extension `AE Format` toggle later in Phase 3
* Any finished download result that is not AE-safe automatically becomes a transcode task
* Successful transcoding replaces the original source file
* The main window keeps one queue entry point
* The queue badge should show `total count + up to two dots`
* Blue means download tasks exist
* Amber means transcode tasks exist
* The badge background should be neutral and surface-adjacent instead of semantic green
* The expanded queue panel should split into `下载队列` and `转码队列`
* The center progress module should become a primary-task display
* Primary-task priority is `active download first`, otherwise `active transcode`
* Failed transcode rows stay in the main transcode section
* Failed transcode rows expose `重试` and `移除`
* `重试` means retry the local transcode job from the preserved source file
* `移除` means remove the failed row from queue state without deleting the local file
* Downloads remain priority-first
* Transcoding is serial and only starts after active downloads drop to zero

## Backend Reality After Phase 1

The backend contract is now available and should be treated as the source of truth for this task.

Documented in:

* [type-safety.md](D:/FlowSelect/.trellis/spec/backend/type-safety.md)

Available download-side contract:

* existing `video-queue-*` events remain download-only
* existing `video-download-progress` style payloads remain the source for download progress
* `video-download-complete` now means the source media finished downloading, not that all downstream compatibility work is done

Available transcode-side contract:

* `video-transcode-queue-count`
* `video-transcode-queue-detail`
* `video-transcode-progress`
* `video-transcode-queued`
* `video-transcode-retried`
* `video-transcode-removed`
* `video-transcode-complete`
* `video-transcode-failed`
* `retry_transcode(traceId)`
* `remove_transcode(traceId)`

Important limitation to preserve in this phase:

* Phase 1 did not introduce a dedicated `cancel_transcode` command, so Phase 2 should not invent a cancel-transcode interaction unless a small backend follow-up is explicitly added during implementation.

## Existing Frontend Reality

Current desktop UI in [App.tsx](D:/FlowSelect/src/App.tsx):

* defines only download-oriented queue and progress payload types
* listens to the single download queue state/detail events
* shows the queue badge only when `videoQueueState.totalCount > 1`
* uses a semantic green queue badge background and a red open/close state
* renders one mixed queue panel instead of separate download/transcode sections
* treats the center progress ring as download-only
* maps queue row actions only to download cancellation

Current theme tokens in [ThemeContext.tsx](D:/FlowSelect/src/contexts/ThemeContext.tsx):

* include strong green queue badge tokens and red close-state tokens
* do not yet define a dedicated amber transcode accent family

Current locale coverage in:

* [locales/en/desktop.json](D:/FlowSelect/locales/en/desktop.json)
* [locales/zh-CN/desktop.json](D:/FlowSelect/locales/zh-CN/desktop.json)

is focused on a single download queue mental model.

## Scope

In scope:

* Desktop main-window UI changes in [App.tsx](D:/FlowSelect/src/App.tsx)
* Theme token additions/updates in [ThemeContext.tsx](D:/FlowSelect/src/contexts/ThemeContext.tsx)
* Desktop queue/progress locale changes in:
  * [locales/en/desktop.json](D:/FlowSelect/locales/en/desktop.json)
  * [locales/zh-CN/desktop.json](D:/FlowSelect/locales/zh-CN/desktop.json)
* Frontend state/types/listeners for the new `video-transcode-*` contract
* Queue badge redesign to `total count + dots`
* Expanded queue panel split into download and transcode sections
* Failed transcode row actions wired to `retry_transcode` and `remove_transcode`
* Center progress module updated into a primary-task display that can represent active transcode work

Out of scope:

* Backend queue model changes in [lib.rs](D:/FlowSelect/src-tauri/src/lib.rs), unless a blocking frontend bug requires a minimal follow-up
* Browser extension popup changes in `browser-extension/`
* Removing old config keys or changing extension sync behavior
* Reworking yt-dlp format selection
* Adding transcode cancellation UX if the backend contract still does not expose a safe cancel action

## Requirements

### Queue Badge

* Show the queue badge whenever there is at least one download or transcode task.
* Badge content should be:
  * total task count
  * blue dot if any download tasks exist
  * amber dot if any transcode tasks exist
* Replace the current strong green badge background with a neutral surface-adjacent style.
* Opening the queue should no longer switch the badge into a danger/red state.

### Expanded Queue Panel

* Keep a single queue entry point, but split the expanded panel into two visual sections:
  * `下载队列`
  * `转码队列`
* Add a compact summary line like `2 下载 · 1 转码`.
* Empty sections should collapse instead of reserving height.
* Download rows and transcode rows should not be mixed into one undifferentiated list.

### Download Rows

* Preserve the current compact row footprint where practical.
* Show:
  * truncated label
  * download state text such as `准备中 / 下载中 / 合并中`
  * blue progress treatment
* Download rows may continue using download cancel actions.

### Transcode Rows

* Show the media title once, truncated.
* Show a compact format pill such as `MKV -> MP4` when format metadata is available.
* Show transcode-specific state text based on backend stage:
  * `分析格式`
  * `转码中`
  * `生成兼容 MP4`
  * `转码失败`
* Use amber visual treatment for transcode progress and markers.
* Failed rows must expose:
  * `重试` -> `retry_transcode(traceId)`
  * `移除` -> `remove_transcode(traceId)`
* `移除` must be presented as non-destructive row cleanup, not file deletion.

### Primary Task Area

* Reuse the existing center progress module as a primary-task display.
* Primary-task selection rule:
  * if any active download exists, show the foremost active download
  * otherwise, if an active transcode exists, show that transcode task
* The primary-task area must be able to render:
  * a blue download ring/status
  * an amber transcode ring/status
* The summary pill below the main status should reflect the remaining queue in user terms.
* Do not falsely treat `video-download-complete` as the final end of the whole workflow when the same trace has now moved into the transcode queue.

### Transition And Completion Semantics

* When a download completes and a transcode task is created, the UI should surface a brief handoff message such as `源素材已获取，已加入转码队列`.
* Download completion copy should align with the new backend meaning: source acquired.
* Transcode completion should be modeled separately in UI state and notifications.

### Frontend State Model

* Extend or replace the current local payload types in [App.tsx](D:/FlowSelect/src/App.tsx) so the UI can represent:
  * download queue count/detail
  * transcode queue count/detail
  * download progress by trace
  * active transcode progress/detail
  * failed transcode rows
* Keep the frontend state resilient to partial event ordering:
  * queue count can arrive before queue detail
  * progress can arrive before a full detail refresh
  * completion/failed events can remove a row after the UI has already cached older detail

## Suggested Implementation Approach

1. Add explicit frontend payload types for the transcode contract near the existing download payload types.
2. Introduce transcode queue state and active-transcode progress state in [App.tsx](D:/FlowSelect/src/App.tsx).
3. Listen to the new `video-transcode-*` events and normalize them into stable UI state.
4. Refactor queue badge calculations so they are derived from both queue families.
5. Refactor the popover body into sectioned rendering instead of a single `queueTasks.map(...)`.
6. Add transcode row actions for `重试` and `移除`.
7. Convert the center progress display from download-only assumptions into primary-task rendering.
8. Update theme tokens for:
   * neutral queue badge surface
   * blue download markers
   * amber transcode markers
   * non-danger open-state border/shadow
9. Update desktop locale strings in both English and Simplified Chinese.

## Acceptance Criteria

* [ ] The desktop UI listens to and renders the new `video-transcode-*` backend contract.
* [ ] The queue badge appears when total download + transcode task count is `>= 1`.
* [ ] The queue badge shows total count plus compact presence dots for download and transcode task types.
* [ ] The queue badge background is visually neutral relative to the main window surface.
* [ ] The expanded queue panel clearly separates `下载队列` and `转码队列`.
* [ ] A single active transcode task remains visible and inspectable even when there are no downloads.
* [ ] Download rows remain compact and understandable.
* [ ] Transcode rows show one truncated title plus a compact `source format -> target format` pill when possible.
* [ ] Failed transcode rows provide working `重试` and `移除` actions.
* [ ] `重试` does not create a new download row; it only requeues the local transcode task.
* [ ] `移除` removes the failed transcode row from UI state without implying file deletion.
* [ ] The center progress module can display active transcoding after downloads drain.
* [ ] The UI no longer implies that `video-download-complete` means the final AE-compatible file already exists.
* [ ] Download/transcode colors, dots, and section headers are sufficient to distinguish task types in the small main window.
* [ ] English and Simplified Chinese queue/progress copy stays consistent with the new two-stage model.

## Verification

Expected verification for this task:

* `npm`/frontend typecheck or existing desktop build verification used by the repo
* manual UI validation for:
  * one AE-safe download that never enters the transcode queue
  * one non-AE-safe download that finishes source acquisition, shows the handoff, then appears in the transcode queue
  * one failed transcode row with working `重试`
  * one failed transcode row with working `移除`
  * queue badge visibility when there is only one transcode task

## Notes For The Implementing Window

* Phase 1 is already in place; treat the backend as implemented unless a true contract bug is found.
* If the UI reveals a missing backend capability, document it before expanding scope.
* The most likely deliberate limitation is transcode cancellation. Do not silently fake it with download-cancel behavior.
