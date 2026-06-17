# Fix compact download expand animation

## Goal

When a download or foreground task starts from the compact icon state, the main window should expand into the full panel with the normal compact-to-full transition instead of snapping directly to the full window.

## User Value

The compact window should feel spatially stable. Starting a download is a common path, so the user should see the same intentional morph animation as hover/full expansion rather than a one-frame flash.

## Confirmed Facts

- The visible bug occurs when a download is triggered while the main window is compact.
- `src/App.tsx` routes download and foreground-task work through `prepareMainWindowForForegroundTask()`.
- `prepareMainWindowForForegroundTask()` dispatches `forceFull`, which reaches `requestExpand` through `src/utils/mainWindowShellMachine.ts`.
- The `requestExpand` effect sets the shell to `expanding`, sets `panelTransitionMode` to `animated`, and flips `isMinimized` to `false`.
- `isMinimizedRef.current` can still be stale in the same synchronous call stack, so `prepareMainWindowForForegroundTask()` can continue into `ensureMainWindowFullMode()`.
- `ensureMainWindowFullMode()` currently sets `panelTransitionMode` to `instant`, then schedules restoration to animated mode.
- `panelTransitionMode === "instant"` makes `panelShellTransition` use zero-duration transitions for `x`, `y`, `width`, `height`, `scale`, `borderRadius`, and `clipPath`.
- Claude reviewed the diagnosis and agreed that the synchronous stale-ref path can clobber the animated compact-to-full transition before React renders it.

## Requirements

- Starting download or foreground-task work from compact mode must preserve the compact-to-full shell animation.
- The foreground-task path must still keep the window full while the task/progress/outcome is active.
- If the task started from compact mode, the existing return-to-compact behavior after foreground work must be preserved.
- `forceFull` should remain the shell-level request to expand; compact/full switching must stay owned by the shell reducer/effect path.
- `ensureMainWindowFullMode()` should not be broadly changed unless implementation proves a narrower guard cannot fix the download path safely.
- Shortcut, UI lab, startup, runtime-gate, hover, drag, drop, and reduced-motion behavior should not be intentionally changed by this task.

## Acceptance Criteria

- [ ] From compact mode, triggering a download or foreground task produces a visible non-instant compact-to-full transition.
- [ ] The same path no longer overwrites the `requestExpand` animated transition with `panelTransitionMode === "instant"` before the first full render.
- [ ] Foreground work that starts from compact still records that it should return to compact when the owning task/outcome lock clears.
- [ ] Existing hover compact-to-full expansion behavior remains unchanged.
- [ ] Existing full-mode synchronization callers of `ensureMainWindowFullMode()` are not regressed.
- [ ] After foreground work completes and the outcome overlay dismisses, the window collapses back to compact mode when the pointer is outside the panel.
- [ ] Focused automated coverage exists for the compact foreground-task expansion guard or an equivalent pure extracted helper.
- [ ] `npm run type-check` and `npm run lint` pass.

## Out Of Scope

- Retuning motion timings, spring values, icon handoff, or shadow animation.
- Refactoring the main window shell into new components.
- Changing native Electron bounds animation behavior.
- Changing download queue, transcode, or downloader business logic.
- Fixing shortcut/UI-lab compact expansion animation unless local evidence shows the same change is required for the download fix.

## Open Questions

- No product decision is currently blocking planning. Implementation should verify whether a small pure helper is needed to make the foreground-task guard testable without over-testing `App.tsx`.
