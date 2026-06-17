# Fix compact download expand animation implementation plan

Do not start implementation until planning is reviewed.

## Files To Inspect First

- `src/App.tsx`
- `src/utils/mainWindowShellMachine.ts`
- `src/utils/mainWindowShellMachine.test.ts`
- `src/utils/mainWindowMotionBaseline.ts`
- `.trellis/spec/frontend/state-management.md`

## Implementation Steps

1. Re-read the current foreground-task path in `src/App.tsx`.
   - Confirm `prepareMainWindowForForegroundTask()` still dispatches `forceFull` before checking `isMinimizedRef.current`.
   - Confirm `shellPhaseRef.current` is updated synchronously by `updateShellPhase()`.
   - Confirm `ensureMainWindowFullMode()` still owns the `instant` transition handoff.

2. Add the narrow expanding guard.
   - After `dispatchShellEvent({ type: "forceFull" })`, keep the existing `!isMinimizedRef.current` early return.
   - If `shellPhaseRef.current === "expanding"`, set `shouldReturnToCompactAfterForegroundTaskRef.current = true` and return.
   - Do not call `ensureMainWindowFullMode()` in that branch.

3. Preserve existing full synchronization semantics.
   - Do not remove `setPanelTransitionMode("instant")` from `ensureMainWindowFullMode()` unless implementation reveals the guard cannot work.
   - Do not change `requestExpand`, `requestCollapse`, or reducer pointer ownership.

4. Add focused regression coverage.
   - If practical, extract a small pure decision helper for the foreground-task full-mode path and test:
     - compact plus newly `expanding` shell skips instant full synchronization
     - compact plus non-expanding fallback still requests full synchronization
     - already full/minimized false path remains a no-op
     - compact expanding path marks return-to-compact
   - Add or confirm shell-machine coverage that a second `forceFull` while already `expanding` does not emit another `requestExpand`.
   - If extraction is not worthwhile, add the closest focused test around existing shell/transition behavior and document any manual verification gap.

5. Run validation.
   - `npm run type-check`
   - `npm run lint`
   - Focused test command for any new or changed test file

6. Manual check.
   - Start with the main window in compact icon mode.
   - Trigger a download.
   - Confirm the panel visibly animates from compact to full.
   - Confirm the task/progress/outcome keeps the shell full while active.
   - Confirm the window returns to compact only after the task flow releases its lock and the outcome overlay dismisses.
   - Confirm hover-initiated expansion plus a download trigger does not introduce unexpected collapse timing.

## Preferred Minimal Diff

The expected production code change should be local to `prepareMainWindowForForegroundTask()` unless testability requires a small pure helper.

Expected logic:

```ts
dispatchShellEvent({ type: "forceFull" });

if (!isMinimizedRef.current) {
  return;
}

if (shellPhaseRef.current === "expanding") {
  shouldReturnToCompactAfterForegroundTaskRef.current = true;
  return;
}

shouldReturnToCompactAfterForegroundTaskRef.current = true;
await ensureMainWindowFullMode({ focusContainer: false });
```

## Stop Conditions

- Stop if the implementation requires changing native bounds behavior.
- Stop if `ensureMainWindowFullMode()` must be changed in a way that affects shortcut/UI-lab/startup flows without a broader design review.
- Stop if tests show `shellPhaseRef.current` is not synchronous enough to distinguish the post-`forceFull` expanding state.
- Stop if the fix breaks return-to-compact behavior after foreground task completion.
- Stop if calling `prepareMainWindowForForegroundTask()` during a hover-initiated expansion changes the expected hold-full or collapse timing.
