# Design: Advanced Quality Selection UI Redesign

## Scope

This task refines the existing right-click advanced quality selection flow. It does not create a new panel or modal. The selection UI remains inside the compact queue surface when a task reaches `selecting_quality`.

The work has two connected pieces:

- Renderer UI: restyle the selecting-quality surface and row interactions.
- Runtime contract: provide enough option metadata to render only truthful post-processing badges.

## Current State

The existing probe groups yt-dlp `formats` by height and creates options like:

```ts
{
  id: "height_1080",
  label: "1080p",
  selector: "..."
}
```

The renderer receives only:

```ts
type AdvancedQualityOptionPayload = {
  id: string;
  label: string;
  tags?: string[];
};
```

The current UI renders each option as an accent-bordered button with a blue circular indicator. That indicator should be removed because advanced quality selection is click-to-download, not a persistent selected radio group.

## UI Layout

Target structure:

```text
选择画质                         x
视频标题视频标题视频标题视频标题...

┌──────────────────────────────┐
│ 1080p              转码       │
├──────────────────────────────┤
│ 720p                         │
├──────────────────────────────┤
│ 480p              封装        │
└──────────────────────────────┘
```

Spacing:

- Header row: title left, close button right.
- Title to subtitle: 4px.
- Subtitle to list: 12px.
- Row height: 34-38px.
- Row gap: 6px if rows are separate field buttons, or 0 if implemented as a connected list. Prefer separate field buttons unless existing shared primitives make a connected list cheaper.

Typography:

- Header `选择画质`: 12-13px, 700.
- Subtitle video title: 10-11px, 500, muted, single-line ellipsis.
- Row label: 12-13px, 650-750.
- Badge: 10px, 600.

Interaction:

- Default row: quiet field surface, neutral border.
- Hover/focus-visible: accent border, slightly brighter field background, text lift, optional very subtle accent glow.
- Pressed: slight surface darkening or translateY(1px).
- No selected state.
- No checkmark.
- No right-side dot.
- Click immediately calls `select_advanced_quality_option`.

## Data Contract

Extend `AdvancedQualityOptionPayload` with explicit metadata rather than overloading `tags`.

Proposed shape:

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
  postProcessPlan?: AdvancedQualityPostProcessPlan;
};
```

Renderer badge mapping:

```ts
postProcessPlan === "remux_only"       -> "封装"
postProcessPlan === "audio_transcode"  -> "转码"
postProcessPlan === "full_transcode"   -> "转码"
postProcessPlan === "none"             -> no badge
postProcessPlan === "unknown"          -> no badge
undefined                              -> no badge
```

Do not show `转码` for remux-only. Remux changes the container; it does not re-encode video and should not imply quality loss.

## Computing Post-Processing Metadata

The safest source of truth is the same compatibility logic used after download:

- MP4 container + H.264 video + no audio or AAC audio: `none`.
- H.264 video with non-MP4 container: `remux_only`.
- H.264 video with non-AAC audio: `audio_transcode`.
- Non-H.264 video: `full_transcode`.
- Insufficient metadata: `unknown`.

The advanced quality probe currently groups by height, so a height can contain multiple possible formats. The generated selector already prefers compatible MP4/H.264/AAC entries first:

```text
bv*[height=N][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/
bv*[height=N][ext=mp4]+ba[ext=m4a]/
b[height=N][vcodec^=avc1][ext=mp4]/
b[height=N][ext=mp4]/
best[height=N][ext=mp4]/
bv*[height=N]+ba/
b[height=N]/
best[height=N]
```

Because yt-dlp will choose the first matching selector branch at download time, exact post-processing prediction can be hard when several branches exist. Conservative prediction means the runtime may label a row only when the probe can identify the first matching selector branch and that branch has one clear post-processing class. It must prefer no badge over a speculative badge.

The implementation should follow this decision tree:

1. Partition formats by role and height using yt-dlp fields:
   - video candidate: `vcodec` exists and is not `none`.
   - audio candidate: `acodec` exists and is not `none`, with `vcodec` missing or `none`.
   - combined candidate: both video and audio codec fields are present and neither is `none`.
   - inspect at least `height`, `ext`, `vcodec`, `acodec`, and where available `video_ext` / `audio_ext`.
2. Evaluate the selector branches for that height in the exact order used by `buildSelectorForHeight(...)`.
3. Stop at the first branch with matching candidate(s).
4. If the first matching branch is the fully compatible branch:
   - `bv*[height=N][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]`
   - mark `none`.
5. If the first matching branch is a compatible combined-file branch:
   - `b[height=N][vcodec^=avc1][ext=mp4]`
   - mark `none`.
6. For any less constrained branch, classify only when all matching candidate combinations produce the same plan under the post-download compatibility rules above.
   - one clear remux-only class: `remux_only`.
   - one clear audio re-encode class: `audio_transcode`.
   - one clear video re-encode class: `full_transcode`.
7. If the first matching branch has mixed possible outcomes, missing fields, or depends on yt-dlp internal ordering that the probe does not reproduce, mark `unknown`.

Do not infer the plan from height, quality label, or default quality preference.

This algorithm intentionally means some rows may have no badge even when the eventual download later enters post-processing. Avoiding false `封装` / `转码` labels is more important than labeling every row.

## Video Title

The selection surface subtitle should use the video title. Preferred sources:

1. Title from the advanced quality probe JSON, if available.
2. Existing task label fallback.

This can be represented by adding a field to queue task payload:

```ts
type VideoQueueTaskPayload = {
  traceId: string;
  label: string;
  videoTitle?: string;
  status: VideoQueueTaskStatus;
  phase?: VideoQueueTaskPhase | null;
  qualityOptions?: AdvancedQualityOptionPayload[];
};
```

Renderer display should use:

```ts
const subtitle = task.videoTitle?.trim() || task.label;
```

The subtitle must be single-line ellipsis.

## Compatibility Notes

- Keep `tags?: string[]` only if needed for backward compatibility during normalization, but do not render strategy tags.
- Normalize unknown or invalid `postProcessPlan` to `unknown` or omit it.
- Existing tests that expect `tags` should be updated or preserved depending on whether the field remains.
- Do not expose internal yt-dlp selectors to the renderer.
- The runtime continues storing `selector` in `AdvancedQualityRuntimeOption` only.
- `AdvancedQualityProbeResult` must be extended to carry `videoTitle` from the top-level yt-dlp JSON title when available.
- `getQueueDetail()` must map both `videoTitle` and `postProcessPlan` to renderer payloads.
- Both existing renderer quality-option sites in `src/App.tsx` must be updated: the dedicated selecting-quality popover branch and the inline queue task fallback branch.

## Rollback

If metadata prediction becomes risky for a particular option, keep the UI redesign and omit that option's badge. Remux-only should be shown as `封装` when the runtime can identify it reliably.
