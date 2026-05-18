# brainstorm: redesign extension AE format option

## Goal

Redesign the browser extension's current `AE Format` preference so users can understand it quickly, especially how it relates to `Highest` quality. The new direction should reduce confusion between quality choice, compatibility preference, and final output format, while reflecting the product reality that many users appear to prefer `MP4` and do not actively want `MKV`.

## What I already know

* The current popup exposes two separate controls:
  * a `Quality` segmented control with `Highest`, `Balanced`, and `Saver`
  * an `AE Format` toggle with `Original` / `AE` states
* The current popup is very small (`236px` wide in `browser-extension/popup.css`), so any redesign must fit a constrained surface.
* The `AE Format` toggle currently looks like an independent output-format choice in the UI, but the actual stored value is `aeFriendlyConversionEnabled`.
* The current AE toggle copy in the extension is:
  * title: `AE Format`
  * off label: `Original`
  * on label: `AE`
  * off helper: `Keep original file`
  * on helper: `Slower finish`
* The current AE toggle is not just a source-selection preference. After a yt-dlp download completes, enabling `aeFriendlyConversionEnabled` runs an AE-safe normalization pipeline:
  * skip if output is already AE-safe
  * remux to MP4 when container is the main issue
  * transcode audio to AAC when needed
  * full transcode to H.264/AAC MP4 when needed
* The current quality copy in the extension is:
  * `Highest`: prefer the highest available tier, and for ties avoid slower compatibility work
  * `Balanced`: prefer AE-friendlier `1080p MP4 / H.264 / AAC` paths before broader fallback
  * `Saver`: prefer lighter downloads and lower bandwidth usage
* The backend currently maps quality to actual download behavior:
  * `Best` -> `bestvideo*+bestaudio/best`, merged to `mkv`
  * `Balanced` -> prefer `1080p MP4/H.264/AAC`, merged to `mp4`
  * `DataSaver` -> prefer lighter `mp4`, merged to `mp4`
* The backend comment explicitly says `best` keeps the highest tier even when that requires mixed containers/codecs, and therefore merges to `mkv` to preserve `1440p/2160p` instead of collapsing to MP4-compatible `1080p`.
* The extension already syncs both `defaultVideoDownloadQuality` and `aeFriendlyConversionEnabled` to the desktop app.
* The user has observed two product issues:
  * some users do not understand what the `AE` option means
  * some users do not understand that this option matters relative to `Highest`
* The user also suspects a product-direction signal:
  * many users prefer `mp4`
  * `mkv` may not be valuable for most users
* New product preference from discussion:
  * do not rename the current 3 quality options
  * remove the `AE Format` toggle from the extension popup
  * consider adding a clear hint in the extension when `Highest` may later require transcoding for AE workflows
* The user clarified the real workflow tension:
  * `1080p` often downloads as `mp4` and is already close to AE-friendly
  * `>1080p` on sites like YouTube and Bilibili often requires broader source formats and is harder to keep AE-compatible without a later conversion step
  * some users want maximum download speed and do not mind `mkv`
  * some users want to use the file in AE and accept a later GPU transcode
* New UI direction from discussion:
  * the desktop app should distinguish a download queue from a transcode queue
  * once a download completes, if the result still needs AE-safe conversion, it should flow into a transcode queue instead of staying inside a generic post-processing stage
* Scope decision from discussion:
  * the auto-transcode rule should apply to all finished download results that fail the AE-safe check, not only `Highest`

## Assumptions (temporary)

* The root issue is information architecture, not only wording.
* Users are thinking in terms of outcomes like `highest quality`, `editable in AE`, and `keep MP4`, not in terms of low-level container or codec concepts.
* `MKV` is currently a technical implementation detail leaking into user outcomes through the `Highest` mode, rather than a format users explicitly asked for.
* We should treat "most users prefer MP4" as a strong product hypothesis, not yet a proven metric.
* We should preserve the ability to support AE-safe output, but likely present it as compatibility or workflow intent rather than as a raw format toggle.
* Because the AE toggle may trigger actual remuxing or transcoding, the UI should probably describe a final-output consequence, not merely a lightweight preference.
* The popup may be the wrong surface for exposing this trade-off if the actual decision is specifically about `Highest` plus post-download handling.
* The better product model may be to keep the popup focused on download intent, then resolve AE-compatibility as a downstream workflow policy.
* A separate transcode queue is likely easier for users to understand than a single download task that silently expands into a long post-processing phase.

## Open Questions

* After removing the AE toggle, what should happen when the user chooses `Highest` and the resulting file is not AE-friendly:
  * Selected: immediately enqueue transcoding
* If the user chooses `移除` on a failed transcode row, should that action be UI cleanup only, or should it also suppress automatic re-queueing for the same file unless the user explicitly retries?

## Requirements (evolving)

* Clarify what the current `AE Format` option actually does in user terms.
* Make the relationship between quality choice and compatibility/output behavior understandable.
* Reduce the chance that users think `AE Format` is a literal export-format picker unrelated to download quality.
* Consider a design direction where `MP4` is the default expectation for most users.
* Avoid forcing most users to learn or care about `MKV` unless they truly need the highest available tier.
* Keep the popup workable within the existing compact extension surface.
* Produce concrete redesign directions that can later guide UI copy and implementation.
* Preserve the existing `Highest / Balanced / Saver` option labels in the popup.
* Remove the separate `AE Format` toggle from the popup.
* Reframe the product decision around how `Highest` interacts with downstream AE compatibility, especially for `>1080p` sources.
* Support two legitimate user intents under `Highest`:
  * fastest acquisition of the best available source
  * eventual AE-compatible media, even if that requires later GPU transcoding
* Teach the `Highest` trade-off in the extension without reintroducing the removed AE toggle.
* If a downloaded file requires AE-safe conversion, represent that as a task in a separate transcode queue instead of as an opaque late download stage.
* Selected policy: once a download result is detected as non-AE-safe, automatically enqueue a transcode task instead of waiting for manual user action.
* Selected scope: the auto-enqueue rule applies to any finished download result that is not AE-safe.
* Selected retention policy: after transcoding completes, replace the original source file with the AE-friendly output instead of keeping both.
* Selected queue layout: keep a single queue entry point in the main window, but split the expanded panel into `下载队列` and `转码队列`.
* Selected transcode-row label pattern: show the media title once, then use a compact format pill such as `MKV -> MP4` to communicate conversion intent.
* Selected queue-badge summary pattern: show the total task count plus up to two compact dots to indicate whether download tasks and transcode tasks are present.
* Selected queue-entry visibility rule: show the queue entry point whenever there is at least one active or queued download/transcode task.
* Selected queue-badge color direction: use a neutral, surface-adjacent badge background so the dots, count, and subtle active border carry the meaning instead of a strong semantic fill.
* Selected central-progress pattern: the main window's circular progress and status area should represent the current primary active task, including transcoding when it becomes the current focus.
* Selected primary-task priority: if any active download exists, the center area shows the foremost active download; otherwise it shows the foremost active transcode task.
* Selected concurrency policy: downloads remain the priority path, while the transcode queue runs serially instead of spawning multiple conversion jobs at once.
* Selected transcode start rule: the single transcode worker starts only when no downloads are active.
* Selected handoff-feedback pattern: use a lightweight transition message such as `源素材已获取，已加入转码队列`, then rely on the queue badge dots and queue panel for ongoing visibility.
* Selected transcode-failure recovery path: failed transcode tasks should expose an inline `重试` action directly inside the transcode queue.
* Selected failed-row placement: failed transcode rows remain visible inside the main transcode queue instead of moving to a separate failure area.
* Selected failed-row actions: failed transcode rows should offer `重试` plus a secondary `移除` action.
* Selected remove semantics: clicking `移除` deletes the failed task from the queue UI, preserves the local source file, and does not automatically re-create the transcode task later.
* Clarified retry meaning: `重试` should mean retrying the transcode job from the preserved local source file, not re-pasting the URL or creating a brand-new download task.
* Selected completion-event semantics: download completion should mean the source file finished downloading; downstream transcoding completion should be modeled separately.
* New UX constraint from discussion:
  * if the queue badge shows only a total task count, the expanded panel must differentiate download tasks and transcode tasks with obvious sectioning and visual markers
  * because the main window is space-constrained, task-type differentiation should rely on compact visual signals such as accent colors, dots, and lightweight icons instead of adding bulky labels everywhere
  * long filenames must not make transcode-task labels unreadable, so the queue row cannot depend on showing two full filenames side by side

## Acceptance Criteria (evolving)

* [ ] The team agrees on the primary mental model for the redesigned setting.
* [ ] The redesign explains the `Highest` trade-off in plain product language.
* [ ] The redesign makes it obvious whether the user is optimizing for maximum quality, AE friendliness, or simpler MP4 output.
* [ ] The redesign direction can fit inside the current extension popup without becoming denser or more confusing.
* [ ] The redesign clearly decides whether `MKV` remains visible, implicit, or advanced-only.
* [ ] The popup can keep `Highest / Balanced / Saver` unchanged while no longer exposing the separate AE toggle.
* [ ] The product defines a clear policy for `Highest` downloads that later need AE-compatible output.
* [ ] The redesign defines how and where the extension warns about `Highest` potentially needing later transcoding.
* [ ] The redesign defines a clear desktop mental model for download tasks versus transcode tasks.
* [ ] Non-AE-safe outputs automatically move into a dedicated transcode queue without requiring a second manual decision.
* [ ] The auto-transcode rule is consistent across all download modes instead of being a `Highest`-only exception.
* [ ] Successful transcoding replaces the original file so the final output folder stays clean and predictable.
* [ ] The main window keeps a single queue entry point while the expanded panel clearly separates download tasks from transcode tasks.
* [ ] If the badge uses total-count summary, users can still instantly tell which tasks are downloading and which are transcoding after opening the panel.
* [ ] Task-type differentiation remains legible in the small main window without materially increasing layout density.
* [ ] Long filenames remain readable in the transcode queue without losing the user's understanding of source-to-target conversion.
* [ ] Transcode rows communicate format change clearly without requiring a full `source filename -> target filename` string.
* [ ] The queue badge stays visually calm enough that the dual dots remain the primary type signal.
* [ ] A single active download or a single active transcode task is enough to expose the queue entry point.
* [ ] The queue badge background harmonizes with the main window instead of competing with the download/transcode type colors.
* [ ] The main window's central progress area can transition from download to transcode without feeling like a task disappeared or restarted unexpectedly.
* [ ] The primary-task selection rule remains stable and predictable when downloads and transcodes overlap.
* [ ] The runtime policy keeps download responsiveness ahead of transcode throughput.
* [ ] Transcoding does not start while any download is still active.
* [ ] Users receive a concise handoff message when a completed download enters the waiting transcode queue.
* [ ] Failed transcode tasks provide a clear inline retry path without forcing users to leave the queue.
* [ ] Failed transcode tasks remain visible in the main transcode section so recovery does not require navigating to another area.
* [ ] Failed transcode tasks can be manually removed from the queue without deleting the preserved source file.
* [ ] Users can distinguish "retry this transcode" from "download this media again".
* [ ] `移除` is clearly understood as removing the queue item rather than deleting the local media file.
* [ ] Download completion and transcode completion remain distinct milestones in event semantics and UI language.

## Definition of Done (team quality bar)

* Product direction and MVP scope are clear enough to implement later.
* Copy direction is clear enough that frontend implementation does not need to rediscover intent.
* Any resulting behavior change is documented before implementation.

## Research Notes

### Current repo pattern

* The current UI splits the model into `Quality` plus a separate `AE Format` toggle.
* The current backend behavior is already partly opinionated:
  * `Balanced` and `Saver` are effectively `MP4-first`
  * only `Highest` intentionally preserves broader format freedom via `MKV`
  * the AE toggle can additionally normalize the final file into an AE-safe MP4 output
* This means the product already behaves like an outcome-driven system, but the UI still describes it like independent technical switches.

### Constraints from this project

* The popup is compact, so a redesign should minimize extra rows, long helper text, or multi-step teaching.
* The setting is synced between extension and desktop, so the mental model should also make sense outside the popup if reused later.
* Existing storage uses two keys:
  * `defaultVideoDownloadQuality`
  * `aeFriendlyConversionEnabled`
* A redesign may require migration or reinterpretation of these keys if the new model changes semantics.
* The current desktop app already has a single `video queue` model and a `post_processing` download stage, so a true transcode queue would be a structural change, not a copy tweak.
* The current desktop queue badge only appears when `totalCount > 1`, which is too restrictive for a future design where even one transcode task should remain visible and inspectable.
* The current video queue supports up to `3` concurrent active downloads, and AE-safe normalization currently lives inline within the download task lifecycle.

### Feasible approaches here

**Approach A: Workflow-driven post-processing** (Recommended)

* How it works:
  * keep popup `Highest / Balanced / Saver` unchanged
  * remove the `AE Format` toggle from the popup
  * add a lightweight hint near `Highest`, such as "best source first; some videos may need later transcoding for AE"
  * treat AE compatibility as an automatic downstream processing policy, not as a popup choice
  * when any download finishes and the file is not AE-safe, create a downstream transcode task automatically
* Pros:
  * popup stays simple
  * AE-friendly final outputs become predictable
  * separate queues make the two phases legible
* Cons:
  * adds conversion cost even when some users only wanted the raw source
  * queue handoff and final-status UX must be very clear

**Approach B: Highest always downloads first, then auto-converts when needed**

* How it works:
  * keep popup `Highest / Balanced / Saver` unchanged
  * remove the popup AE toggle
  * add a `Highest` hint in the extension
  * `Highest` always prioritizes acquisition of the best available source
  * if the final output is not AE-safe, the app automatically launches GPU conversion in a separate transcode queue
* Pros:
  * no extra decision for users
  * AE compatibility becomes predictable
  * preserves source-first behavior for difficult sites
* Cons:
  * adds extra time and compute even for users who do not care about AE
  * may surprise users who expected the download to be complete once the source arrived
  * doubles storage churn more often

## Future / Related / Edge Sweep

### Future evolution

* This setting may later need to scale beyond `AE` to a broader "editing-friendly" concept if more creator workflows matter.
* If the desktop settings page reuses the same download preference model, the naming should survive across both surfaces without popup-specific hacks.

### Related scenarios

* The same preference affects extension-triggered downloads and desktop-side execution, so the wording should remain correct even when the user is not actively thinking about the extension popup.
* Any redesign should stay consistent with the backend reality that only some modes guarantee `mp4` output.

### Failure and edge cases

* If `Highest` still produces `mkv`, users must understand why that happened without feeling the product changed formats arbitrarily.
* If AE-safe conversion adds time, users need a simpler explanation than "AE format", because the cost is workflow compatibility, not a mysterious second export step.
* If `MP4` becomes the dominant default, the product still needs an escape hatch for users who truly want maximum source fidelity.

## Technical Approach

Current recommendation: remove the separate `AE Format` switch from the popup and move the real decision point to the `Highest` post-download phase. The leading candidate is to keep `Highest / Balanced / Saver` untouched in the popup, then resolve AE compatibility only when a `Highest` result actually needs downstream normalization.
An additional strong direction from discussion is to make that downstream normalization visible as a dedicated transcode queue instead of hiding it inside a generic post-processing stage.
Current working decision: when a downloaded file is not AE-safe, FlowSelect should automatically create a transcode task.
Current working decision: successful transcoding should replace the original source file.
Current working decision: the desktop app should keep one queue button and use two sections inside the queue panel.
Current working direction: use compact visual markers such as accent colors and small dots to distinguish download tasks from transcode tasks.
Current working direction: transcode rows should preserve format-change meaning without relying on fully rendered `source -> target` filenames.
Current working direction: show a single truncated filename plus a compact `MKV -> MP4` style pill in transcode rows.
Current working direction: use a total-count badge with dual dots, and reconsider the badge background so it does not compete with the new task-type markers.
Current working direction: make the queue badge feel like part of the main window surface, not a separate semantic-green control.
Current working direction: reuse the center progress module as a primary-task display instead of keeping it download-only.
Current working direction: choose a deliberate concurrency policy for the new transcode queue instead of inheriting the old inline post-processing behavior by accident.
Current working direction: keep transcoding serial and subordinate to the main download experience.
Current working direction: start queued transcoding only after downloads drain to zero active tasks.
Current working direction: use only a brief transition message for queued transcoding instead of persistent extra chrome in the main window.
Current working direction: handle transcode recovery in-place inside the transcode queue rather than through a separate global control.
Current working direction: keep failed transcode rows in the same section as active and queued transcode items.
Current working direction: failed transcode rows should expose both retry and dismiss-style recovery controls.
Current working direction: retry semantics should operate on the already-downloaded local file instead of re-triggering network download.
Current working direction: use the simpler label `移除` instead of `忽略/移除`, with explicit non-destructive semantics.
Current working direction: keep source-download completion separate from downstream transcode completion in both backend events and frontend copy.

### Detailed Wireframe Breakdown

#### Extension popup

* Keep the current `Quality` control unchanged.
* Remove the standalone `AE Format` card entirely.
* Add one compact explanatory hint only for the `Highest` path.
* Preferred placement:
  * below the quality buttons as a contextual note when `Highest` is selected
* Suggested meaning:
  * high-quality sources may download first, then enter the transcode queue automatically if they are not AE-safe

#### Main window queue badge

* Show when there is at least one download or transcode task.
* Structure:
  * total count
  * blue dot if any download tasks exist
  * amber dot if any transcode tasks exist
* Visual style:
  * neutral surface-adjacent pill
  * active/open state uses stronger border and shadow, not a danger/red close state

#### Expanded queue panel

* Header:
  * title like `任务队列`
  * compact meta like `2 下载 · 1 转码`
* Body:
  * `下载队列` section with blue marker
  * `转码队列` section with amber marker
* Empty sections should collapse instead of reserving height.

#### Download row

* Line 1:
  * truncated media title
* Line 2:
  * compact state text such as `准备中`, `下载中`, `合并中`
* Line 3:
  * thin blue progress bar

#### Transcode row

* Line 1:
  * truncated media title
* Line 2:
  * compact format pill such as `MKV -> MP4`
  * state text such as `分析格式`, `转码中`, `生成兼容 MP4`
* Line 3:
  * thin amber progress bar

#### Handoff copy

* When a download completes and a transcode task is created, the product should explicitly signal the transition.
* Preferred message pattern:
  * `源素材已获取，已加入转码队列`

#### Main window primary task area

* The existing circular progress module should become a primary-task display, not a download-only display.
* It should be able to show either:
  * an active download task
  * an active transcode task
* Required elements:
  * progress ring
  * stage text
  * optional queue-summary pill
  * cancel button acting on the current primary task

## Decision (ADR-lite)

**Context**: The current design separates `Quality` and `AE Format`, but the actual behavior overlaps. This makes users think they are configuring two independent things when they are really choosing between output goals and compatibility trade-offs.

**Decision**: Keep the current `Highest / Balanced / Saver` labels, remove the separate `AE Format` toggle from the popup, automatically enqueue a transcode task whenever any finished download result is not AE-safe, replace the original source file after successful transcoding, and present downloads plus transcodes through one queue button with two sections inside the expanded panel. The badge should show total task count plus dual dots and use a neutral surface-adjacent background, while transcode rows show the filename once with a compact `MKV -> MP4` style pill. Downloads stay priority-first, transcoding runs serially, and the transcode worker starts only after active downloads drain to zero.

**Consequences**:

* Clarity should improve if users choose outcomes instead of technical toggles.
* Any chosen direction will likely require copy changes, potential storage migration, and a clear explanation of when `Highest` can still result in `mkv`.

## Implementation Plan

* Phase 1: Backend task model
  * split download lifecycle and transcode lifecycle into separate queue concepts
  * define transcode task states, retry/remove actions, and queue events
  * enforce `download priority + serial transcode + start only when downloads reach zero`
* Phase 2: Desktop UI
  * update the queue badge to `total count + dual dots`
  * split the queue panel into `下载队列` and `转码队列`
  * repurpose the central progress module into a primary-task display
* Phase 3: Extension popup
  * remove the `AE Format` card
  * add the compact `Highest` hint
  * remove or deprecate popup-side AE toggle wiring that is no longer used

## Out of Scope (explicit)

* Implementing the redesign in this brainstorm step
* Changing actual yt-dlp format-selection logic before product direction is agreed
* Proving the user preference hypothesis with analytics in this discussion alone

## Technical Notes

* Files inspected:
  * `browser-extension/popup.html`
  * `browser-extension/popup.js`
  * `browser-extension/popup.css`
  * `browser-extension/direct-download-quality.js`
  * `browser-extension/locales/en/extension.json`
  * `README.md`
  * `src-tauri/src/lib.rs`
* Relevant backend behaviors inspected:
  * `YtdlpQualityPreference::merge_output_format()`
  * `YtdlpQualityPreference::format_sort()`
  * `YTDLP_FORMAT_SELECTOR_BEST`
  * `YTDLP_FORMAT_SELECTOR_BALANCED`
  * `YTDLP_FORMAT_SELECTOR_DATA_SAVER`
  * `finalize_ytdlp_success()`
  * `normalize_video_output_for_ae()`
  * current output replacement helpers such as `build_ae_safe_visible_output_path()` and `replace_file_preserving_backup()`
  * current single `video queue` payloads and `DownloadProgressStage::PostProcessing`
* Important product observation:
  * the current `Balanced` mode is already doing much of what many users likely want from "MP4 + works better in AE", which suggests the popup should probably stop exposing a second explicit AE switch.
  * the desktop app currently models post-processing as part of the download lifecycle, so introducing a separate transcode queue would improve clarity but requires an explicit second task model.
  * applying the rule to all non-AE-safe results gives users a simpler invariant: "download first, then anything not AE-friendly is converted automatically."
  * replacing the original file aligns with the current backend normalization behavior, so this product decision lowers migration risk.
