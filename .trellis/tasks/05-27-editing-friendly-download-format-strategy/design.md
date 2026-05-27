# Design: Editing-Compatible Download Chain Optimization

## Scope

This design prepares a follow-up implementation task. It does not change application code in this research task.

The product direction is now fixed:

- Default output remains editing-compatible across After Effects, Premiere Pro, and DaVinci Resolve.
- Necessary muxing is acceptable when a site exposes separate video-only and audio-only streams.
- The implementation should avoid any extra remux/transcode after muxing if the final file already probes as `MP4 + H.264 + AAC`.
- The UI should explain muxing/packaging as an active local step instead of looking stalled at 100%.

## Current Architecture

### Format Selection

`src/electron-runtime/engineManifest.ts` owns yt-dlp format profiles:

- `best`: broad `bestvideo+bestaudio/best`, allowing `mp4/mkv`.
- `balanced`: prefers H.264 MP4 video + M4A/AAC audio around 1080p, then MP4 fallbacks.
- `data_saver`: prefers lower-tier MP4/M4A combinations.

The chosen `+` selectors intentionally create split-stream downloads that yt-dlp must mux with FFmpeg. This is expected for YouTube and Bilibili at useful quality tiers.

Important tier distinction: `balanced` / `data_saver` force MP4 merge output, while `best` allows `mp4/mkv`. This means `best` may produce MKV after required muxing when the selected streams cannot safely fit MP4. That MKV can trigger a later `remux_only` compatibility follow-up if the codecs are already H.264/AAC, or full transcode if the selected video is HEVC/VP9/AV1. The follow-up implementation should not treat all "after mux" outputs as equivalent.

### Download Execution

`src/electron-runtime/ytDlpCommandPlan.ts` builds args:

- `-f <selector>`
- `--merge-output-format <profile>`
- `--ffmpeg-location <dir>`
- `--print-to-file after_move:filepath`

`src/electron-runtime/ytDlpDownload.ts` runs yt-dlp and forwards parsed progress from `src/electron-runtime/ytDlpProgress.ts`.

### Progress Mapping

`src/electron-runtime/ytDlpProgress.ts` maps lines containing `merging` to `stage: "merging"` and emits `percent: 100` when no explicit percent exists.

`src/utils/downloadViewHelpers.ts` renders non-downloading stages as simple stage labels. In Chinese, `merging` currently renders as `合并中...`.

The technical issue is not that muxing is wrong. The issue is that the user sees a static terminal-looking progress state without context that this is local muxing/MP4 packaging.

### Compatibility Follow-Up

`src/electron-runtime/service.ts` emits `video-download-complete` after the sidecar engine finishes, then asynchronously calls `handleCompletedVideoSource(...)`.

`src/electron-runtime/transcode.ts` probes the completed file and returns `null` when the file is `mp4 + h264 + aac` or has no audio. Otherwise it prepares one of:

- `remux_only`
- `audio_transcode`
- `full_transcode`

Risk: the project spec says terminal success should only emit after normalization, while current code appears to emit download completion before follow-up transcode scheduling. A later implementation task must decide whether this is intended two-queue UX or spec drift.

Additional risk: if probing fails, current conservative behavior falls back to `full_transcode`. That is safe for compatibility but can be extremely expensive if yt-dlp just produced an already compatible MP4 and the probe failure is transient or metadata-related. The follow-up implementation must explicitly decide whether probe failure should always mean full transcode, or whether a bounded heuristic is acceptable when the file extension and yt-dlp merge profile strongly suggest MP4 compatibility.

## Target Behavior

### Required Mux

When yt-dlp selects split H.264 MP4 video + AAC/M4A audio, the app should:

1. let yt-dlp/FFmpeg mux them into a single MP4;
2. show the step as local muxing/packaging;
3. probe the final output;
4. skip follow-up transcode/remux if the probe says `MP4 + H.264 + AAC`.

### Avoidable Follow-Up

Follow-up conversion should only happen when the final post-yt-dlp file is not editing-compatible:

- non-MP4 container with H.264/AAC -> remux;
- H.264 video with non-AAC audio -> audio-only transcode;
- AV1/VP9/HEVC/unknown video -> full compatibility transcode only if the default promise requires it.

For current AE/Premiere/Resolve default compatibility, HEVC still belongs in the full-transcode bucket even though some editors can import it. Future telemetry should classify HEVC separately from VP9/AV1 because HEVC may be useful for a later Resolve/Premiere-tolerant policy, but it should not weaken the default promise in this task.

### UI Copy

The UI should separate these concepts:

- network downloading;
- muxing audio and video;
- packaging/finalizing MP4;
- post-download compatibility conversion.

Potential copy direction:

- English `merging`: `Merging audio and video...`
- Chinese `merging`: `合并音视频中...`
- Optional activity detail when the selected merge output is MP4: `封装 MP4 中...`

This does not require a new output mode.

## Implementation Boundaries

### In Scope For Follow-Up Implementation

- Verify and harden probe skip behavior for muxed `MP4 + H.264 + AAC`.
- Improve yt-dlp merge-stage status text.
- Add tests that distinguish required mux from post-download transcode.
- Add lightweight debug telemetry for selected format/profile and final probe result if it can be done without broad plumbing.
- Resolve or document the `video-download-complete` vs transcode follow-up event ordering.
- Audit probe-failure fallback behavior before changing transcode skip semantics.

### Out Of Scope For Follow-Up Implementation

- Adding an output mode switch.
- Replacing the quality tier model.
- ProRes/DNxHR intermediate output.
- Sacrificing requested quality to avoid mux.
- Bypassing yt-dlp for Bilibili/YouTube.

## Data Flow

```text
Renderer / extension request
  -> video quality preference
  -> site provider resolves yt-dlp engine plan
  -> yt-dlp selector picks stream(s)
  -> yt-dlp downloads video/audio
  -> yt-dlp/FFmpeg muxes when needed
  -> after_move final path
  -> runtime emits download completion / schedules compatibility follow-up
  -> ffprobe checks final file
  -> skip or enqueue remux/transcode
  -> UI shows download queue and transcode queue states
```

## Risks

- Changing selectors to avoid mux may silently degrade quality or fail on Bilibili. Do not do this without a larger sample matrix.
- Current transcode follow-up is asynchronous after `video-download-complete`; changing event ordering could affect UI, AE Portal, notifications, and queue semantics.
- The fire-and-forget window between download completion and transcode scheduling can create surprising queue behavior if a user acts on the completed item immediately.
- Probe failures currently bias toward full transcode, which can turn a transient probe issue into a long CPU-bound job.
- Some files may report `aac` but still have edge-case metadata/pixel-format issues. Tests should start with the known baseline and not overfit.
- yt-dlp merge output does not provide stable progress percentages for muxing. UI should avoid pretending exact progress is known.
- More detailed telemetry may expose long paths or URLs; log payloads should stay safe and bounded.

## Recommended Follow-Up Shape

Create a focused implementation task with two independently verifiable deliverables:

1. Compatibility follow-up correctness:
   - prove muxed `MP4 + H.264 + AAC` skips transcode;
   - prevent regressions with tests.
2. Mux status clarity:
   - improve labels and progress behavior for yt-dlp `merging`;
   - test status text and reducer behavior.

If event ordering is changed, it should be a separate deliberate subtask because its blast radius is larger.

Before Phase 2 starts, make an explicit decision on event ordering:

- preserve the current two-queue model and update tests/specs around that behavior; or
- move terminal download completion after compatibility normalization in a larger queue-semantics change.

The recommended first slice is to preserve current ordering and document it, because changing it can affect queue UI, AE Portal, notifications, and cancellation semantics.

## Implemented First Slice Notes

The first slice preserved the current two-queue event ordering:

- `video-download-complete` means source media download completion.
- Compatibility conversion, when needed, remains a downstream transcode queue concern.

The implementation added tests around the existing probe summary rules and UI progress/status semantics, then changed only the merge-stage display copy. Runtime selectors, mux behavior, transcode planning, and service event ordering were intentionally left unchanged.

Follow-up design risk: `DownloadProgressPayload.speed` is still overloaded as both a real speed string and a lightweight activity/fallback token. This is acceptable for the current label-only change because non-downloading stages suppress speed/ETA in the view helper, but richer muxing progress should use a clearer field or explicit progress-kind contract.
