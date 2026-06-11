# Redesign advanced quality selection UI

## Goal

Redesign the advanced quality selection surface so it feels like an Ameow-native compact control panel instead of a generic button list.

The user should be able to right-click for more quality choices, quickly confirm they are choosing for the intended video, see whether a specific option has extra post-processing cost, and click a quality row to start the download immediately.

## Confirmed Facts

- Current advanced quality selection is rendered inside the existing queue surface while a task is in `selecting_quality`.
- Current rows are full-width buttons with accent borders and a right-side blue dot. The dot has no clear semantic meaning and should be removed.
- Current probe output only returns advanced quality options with `id`, `label`, and an internal `selector`; it groups options by video height.
- Current queue task payload exposes `label` and `qualityOptions`, but does not expose a dedicated `videoTitle` or compatibility/transcode metadata per option.
- The default quality profiles are:
  - `best`: `bestvideo+bestaudio/best`, biased toward the highest available streams.
  - `balanced` / `data_saver`: biased toward MP4/H.264/AAC-compatible selectors and bounded heights.
- Current post-download compatibility logic is based on actual media probe results, not resolution:
  - MP4 container + H.264 video + no audio or AAC audio: no post-processing.
  - H.264 video with non-MP4 container: remux-only.
  - H.264 video with non-AAC audio: audio transcode.
  - Non-H.264 video such as VP9 / AV1 / HEVC: full transcode.
  - Probe failure: conservative full transcode.

## Requirements

- Replace the current advanced quality option rows with an Ameow field-surface list that matches settings-page hover/focus behavior.
- Show the video title as the subtitle under `选择画质`.
  - The title must be a single line.
  - Overflow must be truncated with ellipsis.
  - If the runtime cannot resolve a better title before selection, fall back to the existing queue task label.
- Remove the right-side blue dot from quality rows.
- Do not show strategy badges such as `推荐`, `最快`, or `兼容`.
- Do not show a persistent selected state or checkmark. This surface is click-to-download, not select-then-confirm.
- On hover/focus, highlight the corresponding quality row border and surface using existing Ameow field/setting interaction language.
- On click, immediately accept that quality, close the selection state, and continue the download using the selected runtime-owned format selector.
- Show post-processing badges only when backed by real option metadata, not UI guesses.
  - Never infer post-processing from resolution alone.
  - Never mark `360p`, `720p`, `1080p`, or any other height as needing transcode by default.
  - Remux-only must be surfaced as `封装`, not `转码`.
  - Use `转码` only for actual re-encode plans such as audio transcode or full transcode.
- If reliable per-option compatibility cannot be computed during the advanced quality probe in this task, omit the badge rather than guessing.
- Keep the surface compact enough for the existing small floating queue/selection window.
- Preserve the existing right-click advanced quality flow and supported sites from the previous task.
- Preserve cancellation and probe-failure behavior from the existing advanced quality task.

## Proposed Copy

- Header: `选择画质`
- Subtitle: video title, single-line ellipsis
- Badge labels:
  - `封装` for remux-only.
  - `转码` for audio or full transcode.

## Out Of Scope

- Changing the three default quality profiles (`最高`, `均衡`, `省流量`).
- Reworking yt-dlp format selection outside advanced quality option metadata needed for this UI.
- Adding strategy badges or recommendation logic.
- Adding a second confirmation button after the user clicks a quality row.
- Expanding advanced quality support to more sites beyond the current supported set.

## Acceptance Criteria

- [ ] Advanced quality selection shows `选择画质` plus a one-line truncated video title or label fallback.
- [ ] Quality rows no longer show the blue dot or a checkmark.
- [ ] Quality rows have default, hover, focus-visible, pressed, and disabled/loading-safe visual states consistent with Ameow field surfaces.
- [ ] Clicking a quality row immediately calls the selection command and proceeds with the existing download path.
- [ ] No `推荐` / `最快` / `兼容` strategy badges are present.
- [ ] Any post-processing badge is derived from runtime option metadata, not from resolution or UI heuristics.
- [ ] `转码` is only used when the option is expected to re-encode audio or video.
- [ ] Remux-only is labeled as `封装`, never as `转码`.
- [ ] If compatibility metadata is unavailable or uncertain, the option row renders without a post-processing badge.
- [ ] Unit tests cover normalization of new option metadata and transcode badge semantics.
- [ ] Existing advanced quality probe, selection, cancellation, and failure tests continue to pass.
