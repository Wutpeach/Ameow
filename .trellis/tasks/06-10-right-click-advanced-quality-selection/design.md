# Design: Right-click advanced quality selection

## Scope

V1 adds advanced quality selection for YouTube and Bilibili injected player buttons only.

Left-click remains the current normal download path. Right-click sends a normal `video_selected_v2` request with an added `advancedQualityRequest: true` field.

The desktop runtime owns probing and final quality availability. The browser extension does not decide or render available qualities.

## Contracts

### Request flag

Use `advancedQualityRequest?: boolean`.

This field must be explicitly preserved through:

- YouTube/Bilibili injected detector payloads.
- `browser-extension/background.js` normalization and forwarding.
- `electron/videoDownloadCommands.mts` `buildVideoSelectedV2QueuePayload(...)`.
- `src/electron-runtime/commandRouter.ts` queued request normalization.
- `src/core/types/raw-download-input.ts`.
- `src/types/videoRuntime.ts` queued request type.

Do not store this flag inside `extensionData`; it controls runtime behavior rather than site metadata.

### Queue task phases

Keep the existing queue task surface but add optional phase/choice data:

```ts
type VideoQueueTaskStatus = "active" | "pending";

type VideoQueueTaskPhase =
  | "downloading"
  | "probing_quality"
  | "selecting_quality";

type AdvancedQualityOptionPayload = {
  id: string;
  label: string;
  tags?: string[];
};

type VideoQueueTaskPayload = {
  traceId: string;
  label: string;
  status: VideoQueueTaskStatus;
  phase?: VideoQueueTaskPhase | null;
  qualityOptions?: AdvancedQualityOptionPayload[];
};
```

Do not add a long-lived `probe_failed` phase in V1. Probe failure removes the temporary advanced task and emits existing download failure feedback.

### User selection command

Add renderer command:

```ts
"select_advanced_quality_option"
```

Payload:

```ts
{
  traceId: string;
  optionId: string;
}
```

The command tells the runtime to continue the existing advanced-quality task as a normal download using the selected internal format selector.

### Internal runtime state

Advanced tasks should not enter normal `runTask(...)` until the user selects a quality.

Maintain separate runtime state for advanced-quality tasks:

- `traceId`
- original request
- label
- status for queue display
- abort controller for probe
- dedupe key
- quality options with internal selectors

The queue detail response combines normal active/pending downloads with advanced tasks so the renderer can render one list.

### Probe implementation

V1 probe uses desktop-managed `yt-dlp --dump-json`.

Probe requirements:

- Use the same desktop runtime binaries and environment as downloads.
- Ensure `yt-dlp` runtime readiness before probing.
- Use page/current-item URL from the existing request.
- Preserve cancellation with an abort signal.
- Parse JSON `formats` entries.
- Group by usable video height.
- Return user-facing options such as `2160p · 4K`, `1080p`, `720p`.
- Store internal yt-dlp selector strings on the runtime side.

V1 can build selectors by height rather than exposing raw format IDs in UI.

Example internal selector for a selected height:

```text
bv*[height=1080]+ba/b[height=1080]/best[height=1080]
```

The implementation can refine this with existing MP4/H264 preference if low-risk.

### Continue after selection

When the user selects an option:

1. Runtime finds the advanced task by `traceId`.
2. Runtime removes it from the advanced selecting state.
3. Runtime queues or starts the same request as a normal download with an internal selected selector field.
4. Existing normal download lifecycle emits progress and completion.

The visible `traceId` should remain the same where practical. If implementation must re-enter the queue with the same traceId, add an internal enqueue helper instead of using `queueVideoDownload(...)`, which always creates a new traceId.

### Selected format application

Add an internal selected selector field to the request shape, for example:

```ts
advancedQualitySelector?: string;
advancedQualityLabel?: string;
```

`ytDlpCommandPlan.ts` / `engineManifest.ts` should prefer `advancedQualitySelector` when present.

This field must not come from arbitrary extension input. It is set by runtime after a user selects a probe result.

### Probe failure

Probe failure behavior:

- Remove the advanced task from queue detail/state.
- Emit `video-download-complete` with `success: false` and an error such as `更多画质探测失败`.
- Do not start a default-quality download.
- Do not show retry/default/remove buttons in V1.
- Do not record normal download telemetry for probe failure.
- Do not reserve/release output stems for probe-only work.

### Duplicate right-clicks

Dedupe key:

```text
siteHint + canonical url + clipStartSec + clipEndSec
```

If a matching advanced task is already probing or selecting, return the existing `traceId` instead of creating another probe.

### UI reuse

Renderer should reuse the current task item and circular progress affordance:

- `probing_quality`: show existing indeterminate task indicator and copy like `正在探测画质`.
- `selecting_quality`: show existing task container with compact selectable option rows inside the task.
- No modal.
- No independent panel.
- No popup/floating launcher entry.
- No horizontal progress bar.

## Rollout Notes

This feature touches extension, Electron bridge, runtime queue state, yt-dlp planning, and renderer queue UI. It must land with focused unit tests and at least one manual smoke path for YouTube or mocked probe output.
