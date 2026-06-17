# Fix compact download expand animation design

## Root Cause

The compact-to-full shell path itself is already capable of animating.

Current intended path:

1. `prepareMainWindowForForegroundTask()` dispatches `forceFull`.
2. `reduceMainWindowShell()` moves from `compact` to `expanding`.
3. The `requestExpand` effect sets:
   - `shellPhase` to `expanding`
   - `panelTransitionMode` to `animated`
   - `isMinimized` to `false`
4. The Motion panel renders the full target with spring/tween transitions.

Bug path:

1. `requestExpand` calls `setIsMinimized(false)`, but `isMinimizedRef.current` is still stale in the same synchronous call stack.
2. `prepareMainWindowForForegroundTask()` reads the stale `true` value and calls `ensureMainWindowFullMode()`.
3. `ensureMainWindowFullMode()` dispatches another `forceFull`, then immediately sets `panelTransitionMode` to `instant`.
4. React batches the state updates, so the first full render sees the final transition mode as `instant`.
5. `panelShellTransition` uses duration `0` for the shell geometry properties, so the window appears to flash directly from compact icon to full panel.

Claude reviewed this diagnosis and agreed that the problem is the synchronous overwrite of the animated expand transition by the instant full-mode synchronization path.

## Recommended Fix

Make `prepareMainWindowForForegroundTask()` recognize when its own `forceFull` call already started the animated expand path.

Proposed shape:

```ts
const prepareMainWindowForForegroundTask = useCallback(async () => {
  dispatchShellEvent({ type: "forceFull" });

  if (!isMinimizedRef.current) {
    return;
  }

  if (shellPhaseRef.current === "expanding") {
    shouldReturnToCompactAfterForegroundTaskRef.current = true;
    return;
  }

  shouldReturnToCompactAfterForegroundTaskRef.current = true;
  await ensureMainWindowFullMode({
    focusContainer: false,
  });
}, [dispatchShellEvent, ensureMainWindowFullMode]);
```

This is intentionally narrower than removing `setPanelTransitionMode("instant")` from `ensureMainWindowFullMode()`.

## Why This Boundary

- `shellPhaseRef.current` is updated synchronously by `updateShellPhase()`, so it can be read immediately after `dispatchShellEvent({ type: "forceFull" })`.
- If the shell is now `expanding`, `requestExpand` already performed the necessary shell effects.
- The early-return branch still sets `shouldReturnToCompactAfterForegroundTaskRef.current = true`, preserving the post-task compact return behavior.
- `ensureMainWindowFullMode()` may still be valid for other full-mode synchronization flows, so this task should not globally alter its semantics.

## Risks

- A direct `App.tsx` behavior may be hard to unit test without a browser render harness.
- Over-broad changes to `ensureMainWindowFullMode()` could affect shortcut show, UI lab reset, startup, or other full synchronization paths.
- Forgetting to set `shouldReturnToCompactAfterForegroundTaskRef.current` in the expanding guard would fix the animation but break return-to-compact behavior.
- A progress or outcome lock race could still collapse the shell too early if existing lock ownership is accidentally changed.
- The guard also applies when expansion was initiated by hover before the download path runs. This should be safe because pointer truth still gates collapse, but implementation must verify it does not turn hover-initiated expansion plus task work into an unexpected collapse timing change.

## Compatibility Notes

- Reduced-motion behavior should remain controlled by the existing Motion transition selection.
- Native window bounds behavior should not change.
- The reducer contract from `.trellis/spec/frontend/state-management.md` remains in force: compact/full switching belongs to the shell reducer/effect layer, and programmatic full-mode requests must not fabricate pointer ownership.

## Validation Strategy

- Prefer a small pure helper if it can represent the foreground-task flow decision without mocking the whole `App.tsx`.
- At minimum, add focused tests around the shell machine and any extracted foreground-task guard.
- Add or confirm a shell-machine regression test showing a second `forceFull` during `expanding` does not re-emit `requestExpand`; this documents why the guard must skip the instant synchronization path.
- Manual Windows verification should trigger a download from compact mode and confirm the full panel morph is visible.
- Manual verification should confirm that task completion waits for the outcome overlay to dismiss before returning to compact when the pointer is outside.
- Existing broad checks must include type-check and lint.
