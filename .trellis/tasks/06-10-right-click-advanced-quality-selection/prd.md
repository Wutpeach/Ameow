# Right-click advanced quality selection

## Status

Planning. Do not implement until the user explicitly approves moving this task into execution.

## User Goal

Add a low-friction way for users to request more specific video quality choices on supported sites without replacing the existing three quality presets.

The current preferred direction is Plan C:

- Keep the existing `最高 / 平衡 / 省流` quality presets unchanged.
- On YouTube and Bilibili injected player controls, left-click keeps the current download behavior.
- Right-clicking the existing injected Ameow download button sends an advanced-quality download request.
- Desktop then probes available downloadable qualities and reuses the existing download queue UI to present the result.

## Product Constraints

- Reuse existing UI design as much as possible.
- Do not introduce a new popup, modal, independent quality panel, horizontal progress bar, or new visual system.
- Treat advanced quality selection as an extension of the existing download task lifecycle.
- The browser extension may initiate the advanced request, but desktop runtime remains the source of truth for what can actually be downloaded.
- Probe failure must not silently fall back to normal download. V1 should end the advanced request and show a failure notice without adding recovery buttons.

## Current Understanding

### Existing quality model

- Existing quality choices are fixed presets: `best`, `balanced`, and `data_saver`.
- Browser extension popup and floating launcher share the same quality helper in `browser-extension/direct-download-quality.js`.
- Core schemas currently accept only `best | balanced | data_saver`.
- Desktop yt-dlp planning maps these presets to format selector strategies rather than exact resolution choices.

### Existing injected player controls

- YouTube and Bilibili already inject Ameow download buttons into native player controls.
- The current injected buttons already support custom context-menu handlers for IN/OUT clip point clearing.
- The right-click advanced-quality trigger should reuse this existing event mechanism.
- Existing left-click behavior must remain unchanged.

### Existing desktop UI direction

- Current downloads are represented as queue tasks with circular status/progress indicators.
- Advanced quality probing should reuse the same task item style:
  - `探测画质中`
  - `请选择画质`
  - selected quality then continues into normal download state
- Quality options after probing should reuse existing queue/list density and action affordances where possible instead of a new component family.
- Current `VideoQueueTaskStatus` is only `active | pending`; there is no existing queue status for `probing`, `selecting`, or `probe_failed`.
- Current `queueVideoDownload(...)` immediately enqueues normal downloads; there is no existing probe-first, wait-for-user-selection path.
- Existing download completion events already provide user-visible failure feedback. V1 should prefer reusing that path for probe failure notification instead of introducing a new notification surface.

## Claude Review Summary

Claude reviewed Plan C and agreed that the right-click injected-button entry point is technically sound and fits the product constraint of preserving the existing three preset model.

Important review findings:

- Adding an `advancedQuality` flag only in the injected script is insufficient. The value must survive multiple explicit normalization/forwarding boundaries:
  - injected detector payload
  - `browser-extension/background.js` `normalizeMediaSelectionPayload(...)`
  - `browser-extension/background.js` forwarded `video_selected_v2` payload builder
  - `electron/videoDownloadCommands.mts` queue payload builder
  - runtime request normalization / `RawDownloadInput`
- The runtime currently has no probe-first lifecycle. This is a real feature path, not just a UI tweak.
- Queue detail types currently expose only `active | pending`; adding probe and selection phases requires an explicit queue/task state extension or another compatible representation.
- Duplicate right-clicks on the same video could spawn multiple probe tasks unless V1 defines dedupe behavior.
- Probe should use the desktop runtime path, ideally `yt-dlp --dump-json` or equivalent metadata probing, and group raw formats into user-understandable quality choices.
- Runtime dependency readiness must be considered before probing; the task may need to wait for managed runtime bootstrap before it can probe.
- Product decision after review: V1 should not show `retry`, `default quality download`, or `remove` recovery buttons for probe failure. Probe failure ends the advanced request and notifies the user.
- Follow-up review recommendation: probe failure should reuse the existing `video-download-complete` failure event after removing the probe task from queue state. This gives the user an existing foreground failure notice without adding UI.

Local verification after review:

- `browser-extension/background.js` does rebuild known-field payloads, so unknown fields will be dropped unless explicitly added.
- `src/core/types/raw-download-input.ts` currently has no advanced-quality request field.
- `src/types/videoRuntime.ts` currently defines `VideoQueueTaskStatus = "active" | "pending"` only.

## Required User-Facing Behavior

### Supported Sites

V1 supports only:

- YouTube
- Bilibili

Other sites are out of scope for V1.

### Trigger

- Left-click injected Ameow download button: unchanged normal download.
- Right-click injected Ameow download button:
  - prevent the native context menu on that button
  - send an advanced-quality request to desktop
  - preserve the same current-item payload used by left-click
  - preserve clip range payload if IN/OUT points are currently set

### Desktop Task Flow

1. Advanced request arrives from extension.
2. Desktop creates or displays a normal queue-style task in a probing state.
3. Task shows existing circular activity/progress affordance with copy such as `正在探测画质`.
4. Desktop probes available qualities using the desktop runtime path, not extension-only page state.
5. On success, the same task changes to a `请选择画质` state and lists available quality choices.
6. User selects one quality choice.
7. The same task continues into the existing normal download lifecycle using that selected quality.
8. On failure, the advanced request ends and the user is notified. It must not start a default download silently and must not show extra recovery buttons in V1.

### Quality Choices

V1 should show user-understandable choices, not raw implementation details.

Preferred display examples:

- `2160p · 4K`
- `1440p`
- `1080p`
- `720p`
- `480p`
- `360p`

Optional compact tags are allowed only if they reuse existing visual treatment:

- `推荐`
- `MP4`
- `需合并音频`
- `可能转码`

Avoid exposing raw `format_id`, codec strings, bitrate tables, or yt-dlp selectors in V1 UI.

## Failure And Edge Cases

- Probe fails: end/cancel the advanced-quality request and show a failure notice. Do not silently continue with default quality.
- Probe failure notice should use the existing download failure feedback path where possible, with a distinguishable error summary such as `更多画质探测失败`.
- Desktop disconnected: injected script should keep current user feedback pattern for unavailable desktop/background.
- Clip range set: right-click advanced request should preserve `clipStartSec` and `clipEndSec`.
- Probe returns no usable options: treat as probe failure.
- User cancels/removes the probing or selection task: no normal download should start.
- User selects a quality and then download fails: use the existing download failure path.
- Duplicate right-clicks on the same video should not create confusing repeated probe tasks. V1 should either dedupe to the existing probe task or ignore/reject duplicate advanced requests while one is already probing/selecting for the same URL.
- If runtime dependencies are missing, the advanced-quality task must communicate waiting/preparing state through existing queue UI language before probing starts, or reject with a clear recoverable failure. This must be decided before implementation.

## Implementation Risks To Resolve Before Execution

- Define one canonical field name for the advanced-quality intent, then thread it explicitly through every payload normalization boundary.
- Extend `RawDownloadInput` / queued request types without weakening existing validation.
- Decide whether `download-intent-schema.ts` should explicitly include the new field or whether the flag is consumed before intent validation.
- Extend queue task detail shape to represent probing/selecting/failure while keeping existing active/pending rendering stable.
- Add a renderer-to-runtime action for selecting one probed quality and continuing the same task, unless an existing command can be reused cleanly.
- Keep the probe execution path separate from the normal `runTask` download path until the user selects a quality. Probe tasks must not reserve output stems, release rename stems, or record normal download telemetry.
- On probe failure, remove the probe task from queue state before/while emitting the failure notice so no ghost task remains.
- If probing uses its own abort controller, clean it up on failure, cancellation, and selection.
- Design the yt-dlp probe output model:
  - raw format IDs/selectors stored internally
  - user-facing labels grouped by height
  - selected option maps back to a concrete selector for the real download
- Ensure cancellation works during probing and while waiting for quality selection.
- Ensure left-click normal downloads remain untouched.

## Out Of Scope For V1

- Popup advanced-quality button.
- Floating launcher advanced-quality button.
- Global or persistent advanced-quality setting.
- One-time armed state in extension storage.
- Site-wide support toggles.
- Support beyond YouTube and Bilibili.
- Replacing `最高 / 平衡 / 省流` with numeric qualities.
- Browser-extension-only quality detection as the source of truth.
- New modal, independent quality panel, or new visual design system.

## Acceptance Criteria

- YouTube injected Ameow player button left-click still performs the existing normal download.
- Bilibili injected Ameow player button left-click still performs the existing normal download.
- YouTube injected Ameow player button right-click sends an advanced-quality request.
- Bilibili injected Ameow player button right-click sends an advanced-quality request.
- Right-click advanced requests preserve current URL/title/current-item context.
- Right-click advanced requests preserve clip range when IN/OUT points are set.
- Desktop displays advanced-quality probe progress using the existing queue task visual language.
- Desktop displays quality choices using existing queue/list visual language, not a new standalone UI.
- Selecting a quality continues the same task into the normal download lifecycle.
- Probe failure is explicit, ends the advanced request, and does not silently fall back to default quality.
- Existing three quality presets and popup/floating launcher quality behavior remain unchanged.

## Open Design Questions

- What exact payload field should represent advanced-quality intent across extension, Electron bridge, command router, and runtime intent?
- Should the probe create a queue item before runtime dependency bootstrap finishes, or should runtime dependency prep remain a separate precondition?
- How should duplicate advanced requests for the same page be handled if the user right-clicks multiple times quickly?
- What is the minimal backend probe implementation for YouTube and Bilibili that reuses desktop yt-dlp runtime behavior without duplicating download logic?
- Should selected quality download be implemented as a continuation of the same trace/task, or as a hidden replacement request that preserves the same visible task identity?

## Candidate Validation Plan

- YouTube detector right-click sends advanced-quality intent and suppresses native context menu.
- Bilibili detector right-click sends advanced-quality intent and suppresses native context menu.
- Clip range is preserved for right-click requests on both supported sites.
- Background normalization preserves the advanced-quality field.
- `video_selected_v2` bridge preserves the advanced-quality field.
- Normal left-click injected downloads still produce unchanged payloads and queue normally.
- Runtime advanced request creates a probing/selecting task instead of immediately starting a normal download.
- Duplicate advanced requests for the same URL do not create repeated probe tasks.
- Probe failure notifies the user, ends the advanced request, and does not auto-download.
- Probe failure removes any temporary probe task from queue detail/state.
- Probe failure emits existing user-visible failure feedback, preferably through `video-download-complete` with `success: false`.
- Selecting one quality transitions into normal download using the selected internal format selector.
- Queue UI reuses existing task styling/circular status affordances and does not introduce a modal or independent panel.
