# Claude Review Notes

Claude reviewed the planning artifacts and agreed the overall scope and data flow are sound, but identified the post-processing badge prediction as the main risk.

## Must-Fix Feedback Incorporated

- Add a concrete conservative algorithm for `postProcessPlan` prediction instead of leaving it as "analyze formats by height".
- Specify the yt-dlp fields needed for prediction: `height`, `ext`, `vcodec`, `acodec`, plus `video_ext` / `audio_ext` when available.
- Extend `AdvancedQualityProbeResult` with `videoTitle`, not only `VideoQueueTaskPayload`.
- Ensure `getQueueDetail()` forwards new fields:
  - task-level `videoTitle`
  - option-level `postProcessPlan`
- Update both advanced-quality option rendering locations in `src/App.tsx`, not only the main popover branch.
- Add tests for:
  - title extraction
  - compatible branch prediction
  - ambiguous branch fallback to `unknown`
  - normalization of valid/invalid `postProcessPlan`
  - queue detail forwarding of `videoTitle` and `postProcessPlan`

## Decision

Keep the user-requested `封装` and `转码` badges, but only emit them when the first matching selector branch has one clear post-processing class. If prediction is ambiguous, render no badge.
