# Claude review: background periodic app update checks

Claude reviewed the planning artifacts and agreed the main-process scheduler approach is sound, but identified several must-fix planning gaps before implementation.

## Must-fix findings

### 1. Prerelease preference-change routing must be explicit

Current `app-update-preference-changed` is effectively renderer-originated event broadcasting. The plan must decide whether main process intercepts that event or whether Settings calls a dedicated updater IPC.

Decision to carry into implementation:

- Use a dedicated updater IPC / bridge method for preference changes, or explicitly intercept the existing event in `main.mts`.
- Do not leave preference-change re-check to `App.tsx` independently, because it can bypass scheduler concurrency controls.

### 2. `pendingAppUpdate` can be cleared by later no-update checks

`appUpdateController.checkForAppUpdate()` clears its private `pendingAppUpdate` when no newer version is found or when errors occur. A later background check returning `null` could erase a previously discovered update before the user installs it.

Decision to carry into implementation:

- Add controller support for preserving an existing pending update across background no-update/error checks, or split discovery from clearing behavior.
- The scheduler must not corrupt installability of a previously discovered update.

### 3. Manual check must still return an IPC result

Settings currently expects `desktopUpdater.check()` to resolve to `AppUpdateInfo | null` or throw. Routing manual checks through the scheduler must preserve this direct return/error behavior while also broadcasting update state.

Decision to carry into implementation:

- `ameow:updater:check` should await `scheduler.checkNow("manual")` and return its result to the caller.
- Background checks only broadcast/log; manual checks return to IPC caller and may surface errors in Settings.

### 4. Settings needs mount-time hydration

Listening for events is not enough because the background update event may fire before Settings opens.

Decision to carry into implementation:

- Add `ameow:updater:get-state` or equivalent bridge method backed by `scheduler.getState()`.
- Settings should hydrate from this state on mount and then listen for later update-state events.

## Important improvements

- Scheduler can track last emitted update state in memory for duplicate notification control; no need to read private controller state for UI, but installability must still be preserved inside controller.
- Backoff state can remain in memory for the first version; restart resetting backoff is acceptable unless GitHub rate limit becomes a problem.
- Scheduler tests should use a fake controller/check function rather than real fetch/config.
- Decide how Settings handles `downloading` / `installing`: either install lifecycle is broadcast from main process, or Settings keeps local phase for user-triggered install. First version can keep local install phase as long as docs/tests acknowledge it.

## Recommended tests

- Backoff progression and cap: 15m -> 1h -> 6h -> 6h.
- Successful check resets backoff and schedules normal interval.
- In-flight overlap does not create duplicate checks.
- Preference change during in-flight check schedules exactly one follow-up.
- Unsupported/dev build schedules no timers.
- `stop()` clears timers.
- Startup no longer makes duplicate network requests through both App.tsx and scheduler.
- Background-discovered update remains installable after later background no-update/error checks.
- Background-discovered update hydrates into Settings when Settings opens later.
- Background failures stay quiet in foreground UI.
