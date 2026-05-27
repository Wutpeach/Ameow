# Implementation Plan For Follow-Up Task

## Preconditions

- Keep this research task in planning until the user reviews the artifacts.
- Do not start implementation from this task unless the user explicitly asks to convert it into Phase 2 work.
- Before coding, load `trellis-before-dev` and the relevant backend/frontend spec indexes.

## Proposed Follow-Up Implementation Checklist

### 1. Baseline Audit

- Read:
  - `src/electron-runtime/service.ts`
  - `src/electron-runtime/transcode.ts`
  - `src/electron-runtime/ytDlpProgress.ts`
  - `src/electron-runtime/engineManifest.ts`
  - `src/utils/downloadViewHelpers.ts`
  - `locales/en/desktop.json`
  - `locales/zh-CN/desktop.json`
- Confirm with tests or focused inspection:
  - `prepareVideoTranscodeTaskFromDownload(...)` returns `null` for `mp4 + h264 + aac`.
  - `runYtDlpDownload(...)` reports merge progress from yt-dlp lines.
  - `applyDownloadProgressEvent(...)` preserves stage order correctly when merge progress arrives.
  - `video-download-complete` event order relative to transcode follow-up is understood and documented.
  - existing service coverage for compatible Bilibili MP4 skip is identified and reused instead of duplicating it.
  - `best` tier `mp4/mkv` behavior is understood separately from `balanced`/`data_saver` MP4-only merge behavior.

### 2. Compatibility Skip Tests

- Validate existing tests first, then add or extend tests in `src/electron-runtime/transcode.test.ts` for uncovered cases:
  - MP4 container + H.264 video + AAC audio -> no prepared task.
  - MP4 container + H.264 video + no audio -> no prepared task.
  - MP4 container + H.264 video + non-AAC audio -> `audio_transcode`.
  - MKV or non-MP4 + H.264 + AAC -> `remux_only`.
  - MP4 container + HEVC/VP9/AV1 video -> `full_transcode`, with HEVC covered explicitly.
- Validate existing `src/electron-runtime/service.test.ts` coverage before adding new tests:
  - completed yt-dlp result already compatible -> no `video-transcode-queued` event.
  - add a contrasting case only if missing, such as `best` producing MKV or an incompatible codec and therefore queuing follow-up conversion.
- Add a focused test or explicit design note for probe-failure fallback:
  - current behavior: probe failure -> conservative `full_transcode`;
  - proposed behavior must be deliberately chosen before implementation.

### 3. Mux Status Semantics

- Decide whether to keep `DownloadStage = "merging"` or add a more specific activity token.
- Preferred low-risk approach:
  - keep the runtime stage as `merging`;
  - change user-facing labels to describe muxing clearly:
    - English: `Merging audio and video...`
    - Chinese: `合并音视频中...`
  - consider adding an activity label such as `activity:ytDlp.packagingMp4` only if needed for richer UI.
- Avoid showing false precision:
  - keep percentage from actual download progress;
  - if merge has no progress, UI should not imply exact completion beyond "download finished, packaging".

### 4. Progress Parser Tests

- Add or extend `src/electron-runtime/ytDlpProgress.test.ts` if present; otherwise use the existing nearest test file.
- Cover:
  - `[Merger] Merging formats into "...mp4"` maps to `stage: "merging"`.
  - merge line without percent does not leak stale network speed/ETA in the rendered status.
  - post-processing lines still map to `post_processing`.
- Add one realistic stage-flow test if missing:
  - preparing -> downloading with percent -> merging with no percent -> post_processing;
  - verify the parser output and reducer stage ordering stay coherent.
- Add or extend `src/utils/downloadViewHelpers.test.ts`:
  - `merging` status renders the new mux-specific label.
  - non-downloading stages still suppress stale speed/ETA.

### 5. Optional Debug Telemetry

- If implementation scope allows, log bounded debug details when yt-dlp starts:
  - quality tier;
  - selector profile name or selector length;
  - merge output format;
  - selected format id/codec if available from `before_dl` or existing result data.
- Avoid adding network probes unless there is a clear need; `before_dl` format printing can be expensive or brittle and should be a separate decision.

### 6. Validation Commands

Run focused tests first:

```powershell
npm test -- src/electron-runtime/transcode.test.ts
npm test -- src/electron-runtime/ytDlpDownload.test.ts
npm test -- src/utils/downloadViewHelpers.test.ts
```

Then run required project gates:

```powershell
npm run type-check
npm run lint
```

If event ordering changes, also run:

```powershell
npm test -- src/electron-runtime/service.test.ts
npm test -- src/utils/downloadEventReducers.test.ts
```

## Rollback Points

- Label-only changes can be reverted independently if wording is wrong.
- Parser changes should be small and covered by tests; revert parser changes before touching queue/event semantics.
- Any event ordering change must be isolated in its own commit/task because it can affect AE Portal and UI queue state.

## Open Implementation Decisions

- Whether to alter the static `merging` translation only, or add a distinct activity token for MP4 packaging.
- Whether to align runtime behavior with the spec that says download completion should emit after normalization, or preserve the current two-queue model and update the spec later. This must be decided before writing service-level assertions.
- Whether selected format ids/codecs should be collected during real downloads or only in opt-in debug traces.
- Whether probe failure should always fall back to `full_transcode`, or whether an MP4-extension/merge-profile heuristic is acceptable. Treat this as a separate risk decision, not an incidental implementation detail.
- Whether `best` tier `mp4/mkv` should remain untouched in the first slice. Recommendation: do not change it in the first slice; document consequences and test current behavior.

## Recommended First Implementation Slice

Start with the lowest-risk slice:

1. Prove compatible muxed MP4 skips follow-up conversion with tests.
2. Improve merge-stage labels and status tests.
3. Document event-ordering findings without changing them yet.
4. Document probe-failure and `best` MKV behavior as follow-up risks unless the user explicitly broadens the implementation scope.

This directly addresses the user-facing concern while avoiding high-blast-radius queue semantics changes.

## Implementation Result 2026-05-27

Completed the first implementation slice in-place after user approval to continue development.

Changed:

- Added transcode decision tests for:
  - MP4 + H.264 + no audio -> skip compatibility follow-up.
  - MP4 + H.264 + non-AAC audio -> `audio_transcode`.
  - MP4 + HEVC + AAC -> `full_transcode`.
- Added yt-dlp merge progress assertions showing merger lines remain `stage: "merging"` with no ETA.
- Added a parser-to-reducer flow test for `downloading -> merging -> post_processing` so the UI state progression stays coherent.
- Added a view-helper regression test proving merge-stage speed/ETA details are suppressed in the status label.
- Updated desktop locale copy:
  - English: `Merging audio and video...`
  - Chinese: `合并音视频中...`
- Ran `npm run locales:sync` so generated browser-extension locale resources match the source locale files.

Intentionally unchanged:

- No yt-dlp selector changes.
- No transcode runtime behavior changes.
- No queue/event ordering changes.
- `video-download-complete` remains the source-media completion event and still fires before downstream transcode work begins.

Validation:

```powershell
npm test -- src/electron-runtime/transcode.test.ts
npm test -- src/electron-runtime/ytDlpProgress.test.ts
npm test -- src/utils/downloadViewHelpers.test.ts
npm test -- src/utils/downloadEventReducers.test.ts
npm run type-check
npm run lint
```

Claude Code review:

- No must-fix issues found.
- Accepted feedback: the parser-to-reducer test should not tightly assert parser fallback `speed` internals. The test was relaxed to assert stage/percent flow and final reducer state instead.
- Follow-up risk: `DownloadProgressPayload.speed` still carries both real network speed and activity/fallback tokens. If a later slice adds more detailed muxing/packaging stages, this implicit contract should be cleaned up or made explicit.
