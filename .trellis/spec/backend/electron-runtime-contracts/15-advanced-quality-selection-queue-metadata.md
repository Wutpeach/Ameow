## Scenario: Advanced Quality Selection Queue Metadata

### 1. Scope / Trigger

- Trigger: Any change to advanced-quality probing, `video-queue-detail` payload shape, renderer quality-option UI, or post-download format hint badges.
- Why this needs code-spec depth: Advanced quality selection crosses yt-dlp probe JSON, Electron runtime task state, renderer queue normalization, and compact UI display. A missing field at any boundary silently degrades the UI or mislabels a format.

### 2. Signatures

Shared renderer/runtime payloads:

```ts
export type AdvancedQualityPostProcessPlan =
  | "none"
  | "remux_only"
  | "audio_transcode"
  | "full_transcode"
  | "unknown";

export type AdvancedQualityOptionPayload = {
  id: string;
  label: string;
  tags?: string[];
  postProcessPlan?: AdvancedQualityPostProcessPlan;
};

export type VideoQueueTaskPayload = {
  traceId: string;
  label: string;
  videoTitle?: string;
  status: "active" | "pending";
  phase?: "downloading" | "probing_quality" | "selecting_quality" | null;
  qualityOptions?: AdvancedQualityOptionPayload[];
};
```

Internal runtime option shape:

```ts
type AdvancedQualityRuntimeOption = AdvancedQualityOptionPayload & {
  selector: string;
};
```

Probe result shape:

```ts
export type AdvancedQualityProbeResult = {
  options: AdvancedQualityRuntimeOption[];
  videoTitle?: string;
};
```

### 3. Contracts

- `advancedQualitySelector` remains runtime-owned. The renderer receives `id`, `label`, and display metadata only; it must never receive or construct raw yt-dlp selectors.
- `videoTitle` should come from the top-level yt-dlp probe JSON `title` when present and non-empty. Renderer must fall back to `label` when `videoTitle` is absent.
- `postProcessPlan` is optional display metadata. The renderer maps it as:
  - `remux_only` -> `封装`
  - `audio_transcode` / `full_transcode` -> `转码`
  - `none` / `unknown` / missing -> no badge
- The runtime must not infer post-processing from height, quality label, or quality preference.
- The runtime may classify a height only when the first matching branch in `buildSelectorForHeight(...)` has one clear post-processing plan.
- If branch selection or format metadata is ambiguous, set `unknown` or omit the field. No badge is better than a speculative badge.
- Queue detail forwarding must include:
  - task-level `videoTitle` for advanced selecting tasks
  - option-level `postProcessPlan`
- Renderer normalization must guard both fields:
  - trim non-empty `videoTitle`
  - preserve only known `AdvancedQualityPostProcessPlan` values
  - drop invalid values instead of rendering unknown strings
- Dismissing an advanced-quality probe or selection task is a UI dismissal, not a completed download cancellation. Runtime must remove the advanced-quality queue task and emit updated queue state without emitting `video-download-complete`.
- Real advanced-quality probe failures remain terminal user-visible failures and should continue to emit `video-download-complete` with `success: false`.

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| Probe JSON has non-empty `title` | `videoTitle` appears in selecting-quality queue detail and renderer subtitle |
| Probe JSON has missing/blank `title` | Renderer subtitle falls back to task `label` |
| A height's first selector branch is compatible MP4/H.264/AAC | `postProcessPlan: "none"` and no badge |
| A height clearly requires remux only | `postProcessPlan: "remux_only"` and renderer shows `封装` |
| A height clearly requires audio or full re-encode | `postProcessPlan: "audio_transcode"` or `"full_transcode"` and renderer shows `转码` |
| A height has mixed or insufficient format metadata | `postProcessPlan: "unknown"` or missing, renderer shows no badge |
| Renderer receives invalid `postProcessPlan` | Normalization removes it and no badge renders |
| User clicks a quality row | Runtime selects the matching internal selector and continues the same trace as a normal download |
| User dismisses the advanced-quality probe/selection task | Runtime removes the queue task and does not emit a cancelled `video-download-complete` payload |
| Advanced-quality probing fails without user dismissal | Runtime removes the queue task and emits a failure `video-download-complete` payload |

### 5. Good/Base/Bad Cases

- Good: A `1080p` option with a provable compatible branch renders as a quiet row with no badge and starts download on click.
- Good: A remux-only option renders a concise `封装` badge; it is never labeled `转码`.
- Good: A VP9/Opus-only combined option with one clear outcome renders `转码`.
- Good: Closing the advanced-quality picker removes the queue row without showing a `Download cancelled` result.
- Base: A row has no badge because the runtime cannot prove the post-processing plan before download.
- Bad: Marking `360p`, `720p`, or `1080p` as `转码` based only on resolution.
- Bad: Rendering legacy strategy tags such as `推荐`, `最快`, or `兼容` in the advanced quality picker.
- Bad: Sending internal yt-dlp selector strings to the renderer.
- Bad: Treating an advanced-quality UI dismissal as a failed download and emitting a cancelled completion event.

### 6. Tests Required

- `advancedQualityProbe.test.ts` covers title extraction, compatible plans, remux-only plans, full-transcode plans, and ambiguous `unknown`.
- `downloadViewHelpers.test.ts` covers `videoTitle` trimming and valid/invalid `postProcessPlan` normalization.
- Runtime service tests cover `getQueueDetail()` forwarding `videoTitle` and `postProcessPlan` while keeping `selector` internal.
- Runtime service tests cover advanced-quality dismissal removing the task without emitting a cancelled completion event, while probe failures still emit failure completion.
- Existing advanced quality selection tests must continue to prove the selected option resumes the same `traceId` as a normal download.
- `npm run type-check` and `npm run lint` must pass after any payload shape change.

### 7. Wrong vs Correct

#### Wrong

```ts
const postProcessPlan = height >= 1080 ? "full_transcode" : "none";
```

#### Correct

```ts
const postProcessPlan = resolvePostProcessPlanForHeight(probedFormats, height);
// returns "unknown" when the first matching selector branch is ambiguous
```

#### Wrong

```ts
qualityOptions: task.qualityOptions.map(({ id, label, selector }) => ({ id, label, selector }))
```

#### Correct

```ts
qualityOptions: task.qualityOptions.map(({ id, label, postProcessPlan }) => ({
  id,
  label,
  postProcessPlan,
}))
```
