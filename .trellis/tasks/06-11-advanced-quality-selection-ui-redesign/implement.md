# Implementation Plan: Advanced Quality Selection UI Redesign

## Checklist

1. Load pre-development guidelines.
   - Read relevant `.trellis/spec/frontend/index.md` and `.trellis/spec/backend/index.md`.
   - Read any referenced quality/runtime/UI docs before editing code.

2. Update shared types and normalization.
   - Extend `src/types/videoRuntime.ts` with `AdvancedQualityPostProcessPlan`.
   - Add optional `postProcessPlan` to `AdvancedQualityOptionPayload`.
   - Add optional `videoTitle` to `VideoQueueTaskPayload`.
   - Update `src/utils/downloadViewHelpers.ts` normalization to preserve valid `postProcessPlan` and `videoTitle`, while treating invalid values as unknown/undefined.

3. Update advanced probe metadata.
   - Extend `src/electron-runtime/advancedQualityProbe.ts` to read the probed JSON title.
   - Extend `AdvancedQualityProbeResult` to return `videoTitle` from `runAdvancedQualityProbe`.
   - Analyze formats by height well enough to produce conservative `postProcessPlan` values.
   - The algorithm must evaluate the `buildSelectorForHeight(...)` branch order and classify only the first matching branch.
   - Inspect `height`, `ext`, `vcodec`, `acodec`, and where available `video_ext` / `audio_ext`.
   - Use `unknown` when the first matching branch has mixed possible outcomes or insufficient metadata.
   - Prefer `unknown` when the selector outcome is ambiguous.
   - Do not infer from resolution.

4. Update runtime queue payload.
   - Store `videoTitle` in `AdvancedQualityTaskState` after probe.
   - Include task-level `videoTitle` in `getQueueDetail()`.
   - Include option-level `postProcessPlan` in `getQueueDetail()`; the current mapping only forwards `id`, `label`, and `tags`.
   - Keep internal `selector` runtime-only.

5. Redesign renderer selection UI.
   - Update both quality-option rendering sites in `src/App.tsx`: the dedicated advanced-quality selection branch and the inline queue task fallback branch.
   - Header: `选择画质` with existing close affordance.
   - Subtitle: `videoTitle || label`, one-line ellipsis.
   - Rows: field-surface style, neutral default border, accent hover/focus border.
   - Remove blue dot and any selected checkmark.
   - Render only `封装` or `转码` badge based on `postProcessPlan`.
   - Clicking a row immediately calls `selectAdvancedQualityOption(...)`.

6. Tests.
   - Update `src/electron-runtime/advancedQualityProbe.test.ts` for title extraction and conservative post-process plans.
   - Update `src/utils/downloadViewHelpers` tests if present, or add coverage in the existing test file for queue detail normalization.
   - Update runtime service tests around `qualityOptions` payload if existing assertions need the new fields.
   - Add or update UI-level tests only if this repo already has practical renderer component coverage for this surface.

7. Validation.
   - Run focused tests:
     - `npm run test -- advancedQualityProbe`
     - relevant runtime command/service tests for advanced quality selection
     - relevant download view helper tests
   - Run broader checks before implementation completion:
     - `npm run type-check`
     - `npm run lint`

## Risk Areas

- Predicting post-processing from yt-dlp format JSON can be ambiguous because selected height maps to a fallback selector chain, not one fixed format ID.
- `转码` is user-visible and must not overstate remux-only or uncertain cases.
- The compact floating window can become cramped if badges are too wide. Badge copy must stay short.
- `App.tsx` has inline styling in the relevant surface; keep edits scoped and avoid unrelated UI refactors.

## Rollback Points

- If post-process prediction is unreliable, keep `postProcessPlan` omitted/unknown and ship the UI without badges.
- If video title extraction is unreliable, fall back to existing task label.
- If hover styling causes layout shift, revert to fixed border widths and only change color/background.

## Review Gate Before `task.py start`

- Conservative post-process prediction in V1 means: classify an option only when the probed formats make its likely plan clear; otherwise omit the badge. Do not infer from height or quality label.
- Remux-only should be shown with the concise badge `封装`.
