# Background periodic app update checks implementation plan

## Pre-Implementation Context

Before editing code in Phase 2, load project guidelines with `trellis-before-dev`.

Likely relevant spec areas:

- backend / Electron runtime contracts
- frontend / state management
- frontend / type safety

## Implementation Checklist

1. Add `electron/appUpdateScheduler.mts`.
   - Define scheduler options with injectable timing functions for tests.
   - Add constants for startup delay, normal interval, and failure backoff.
   - Implement `start()`, `stop()`, `checkNow(reason)`, and `getState()`.
   - Ensure unsupported builds do not schedule checks.
   - Ensure background failures are logged but not surfaced as foreground errors.
   - Track last broadcast state for renderer hydration and duplicate event control.

2. Add `electron/appUpdateScheduler.test.mts`.
   - Use fake timers.
   - Cover startup delay, normal interval, failure backoff, overlap prevention, preference-change follow-up, and stop cleanup.

3. Update `electron/appUpdateController.mts` for background-safe pending update behavior.
   - Add an option or method that preserves existing pending update state on background no-update/error checks.
   - Keep manual check behavior compatible with existing Settings expectations.
   - Add regression tests proving a background no-update/error check does not erase a previously discovered pending update before install.

4. Wire scheduler in `electron/main.mts`.
   - Create scheduler after `appUpdateController`.
   - Start scheduler once the app is ready and main process wiring is complete.
   - Stop scheduler during app quit / cleanup.
   - Route `ameow:updater:check` through scheduler manual check.
   - Ensure `ameow:updater:check` still awaits and returns `AppUpdateInfo | null` or throws for manual callers.
   - Add `ameow:updater:get-state` or equivalent command backed by `scheduler.getState()`.
   - Add explicit preference-change routing through scheduler, either via a dedicated updater IPC or main-process interception of the existing event.
   - Add event broadcast for update state.

5. Update shared types.
   - Add renderer event name and payload type in `src/types/electronBridge.ts`.
   - Add update scheduler state type in `src/types/appUpdate.ts` if useful.
   - Update bridge/runtime wrappers in `src/desktop/runtime.ts` for `getState()` and any preference-change method.

6. Update `src/App.tsx`.
   - Remove or disable the independent startup update check to avoid duplicate startup requests.
   - Listen for scheduler update-state events.
   - Keep existing update indicator and install click behavior.
   - Do not independently call `refreshAppUpdate()` on `app-update-preference-changed`; the scheduler-owned route should handle preference-change re-checks.

7. Update `src/pages/SettingsPage.tsx`.
   - Keep manual "check update" button.
   - Hydrate from scheduler state on mount.
   - Listen for scheduler update-state events after mount.
   - Ensure manual check errors still show in Settings.
   - Ensure background failures do not show as Settings errors unless the user manually checks.
   - After saving prerelease preference, trigger the scheduler-owned preference-change path.

8. Update locale strings only if UI copy changes.
   - Avoid adding new visible settings unless implementation requires it.

9. Run focused and full validation.

## Validation Commands

Run focused tests first:

```bash
npm run test -- electron/appUpdateScheduler.test.mts
npm run test -- electron/appUpdateController.test.mts
```

Then run project quality checks:

```bash
npm run type-check
npm run lint
```

If renderer tests are added or affected, run the relevant focused test command before full checks.

## Review Gates

- Confirm there is exactly one startup update check path.
- Confirm Settings can hydrate a background-discovered update after opening late.
- Confirm a background no-update/error result does not clear an already discovered pending update.
- Confirm no code path calls download/install from the scheduler.
- Confirm background errors do not show foreground UI errors.
- Confirm Settings manual errors still show.
- Confirm prerelease toggle re-checks against the latest preference.
- Confirm timers are cleaned up.

## Rollback Points

- If scheduler integration causes renderer state churn, keep `appUpdateController` unchanged and revert only scheduler/main/renderer event wiring.
- If Settings hydration becomes too invasive, keep Settings manual-only for the first implementation while main window background notification remains the MVP, but update PRD before doing so.
- If notification support is added and becomes noisy, remove notification while preserving update indicator behavior.
