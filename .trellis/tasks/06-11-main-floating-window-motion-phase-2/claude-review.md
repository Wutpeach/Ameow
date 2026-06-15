# Claude Review

## Summary

Claude agreed with the Phase 2 direction: keep one logical motion/geometry model, but do not force Electron `BrowserWindow` bounds into a renderer Motion runtime. Motion for React should remain the renderer visual executor, while Electron main remains the native bounds executor.

## Must-Fix Architecture Invariants

- Do not use per-frame renderer-to-main IPC to drive native window bounds from Motion, react-spring, GSAP, or Web Animations API.
- Keep transition-token protection across native and visual executors.
- Add shared timing to the geometry/motion plan so native bounds and visual shell do not silently drift through different durations or easing.
- Cancel or ignore stale compact visibility/clamping moves when a newer expand transition starts.

## Design Adjustments

- Geometry should remain spatial. It can describe hotspot frame and radii, but should not own hotspot active/inactive state.
- Shell phase and interaction mode should decide when hotspot evaluation is active.
- macOS shadow gutter needs explicit modeling, including intermediate morph states before any visual tuning.
- Panel shadow ownership needs a decision before visible tuning: either keep it behavior-equivalent for the first milestone or move it under the visual motion owner later.

## Framework Conclusion

Changing animation frameworks does not materially improve native window morph safety. Every renderer-side framework faces the same Electron main-process boundary. The safer architecture is:

- Motion for React for renderer visual shell
- Electron main `animateBounds` adapter for native bounds
- one shared geometry/timing contract between them

## Validation Additions

- Geometry inset/shadow consistency tests for Windows and macOS.
- Stale native and visual completion tests.
- Timing contract tests.
- Compact visibility move cancellation tests.
- Hotspot hysteresis and lifecycle tests.

## Addendum: Center Overlay State Model Review

On 2026-06-15, Claude reviewed the proposed center overlay state-model fix for the repeated-download checkmark/progress overlap bug.

Claude agreed with the core direction:

- the center overlay should have a single visual owner
- progress, task outcomes, folder outcomes, and minimized icon state should be selected through one discriminated visual state
- transient outcomes should carry request ids / epochs
- Motion keys should represent logical event identity instead of reusing a fixed overlay key
- progress should preempt stale outcomes so the compact UI reflects current work

Must-fix items from the review:

- `video-download-progress` and `video-transcode-progress` must both invalidate stale transient outcomes before rendering progress.
- The replacement for `isProcessing` must preserve the full shell-lock lifecycle: long-running processing, pre-outcome loading, visible outcome dwell, and timer expiry.
- Long-running foreground work needs an explicit `task-processing` state, separate from the short outcome-loading phase.
- Active progress cancellation feedback must remain separate from outcome payload state. Do not collapse `downloadCancelled` / `downloadErrorMessage` into the outcome model in a way that breaks in-progress cancel text.
- `isForegroundTaskOutcomeVisibleRef` should either be removed as dead state or replaced with a synchronous guard derived from the new state model.
- Folder outcomes need the same request-id / epoch guard as task outcomes.

Recommended implementation adjustments:

- Keep task progress derived from queue/progress maps. Do not duplicate queue truth inside the center overlay reducer.
- Build a pure selector such as `selectCenterOverlayVisual(primaryTask, centerOutcomeState, visualIsMinimized)`.
- Render the selected visual through one `AnimatePresence` boundary.
- Prefer extracting outer presence ownership into a `CenterOverlayHost`; keep `ForegroundOutcomeOverlay` as inner content/choreography if useful.
- Migrate event handlers only after the state type and selector exist.

Focused validation additions:

- download complete followed by immediate new download progress shows only progress
- transcode complete followed by immediate new transcode progress shows only progress
- progress during the outcome preparation window invalidates the pending outcome
- double folder drop keeps the second outcome alive for its full duration
- task outcome, folder outcome, and minimized icon are mutually exclusive
- image/clipboard foreground processing keeps the shell locked before the outcome is visible
- active download cancellation feedback still appears in the progress area rather than as an outcome overlay

## Follow-Through

The center overlay review recommendations were implemented on 2026-06-15 using:

- `src/utils/centerOverlayState.ts`
- `src/utils/centerOverlayState.test.ts`
- `src/App.tsx`
- `src/components/ForegroundOutcomeOverlay.tsx`

Validation completed:

- `npm run type-check`
- `npm run lint`
- `npm run test -- centerOverlayState`
- `npm run test`
