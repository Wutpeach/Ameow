# Background periodic app update checks design

## Architecture

Add a main-process scheduler around the existing app update controller.

Proposed new module:

- `electron/appUpdateScheduler.mts`

Primary responsibilities:

- own startup delay and periodic timers
- prevent concurrent update checks
- apply bounded retry backoff after background failures
- expose `checkNow(reason)` for startup, interval, manual, and preference-change checks
- store the last known update state in memory
- notify renderer windows when update availability changes
- stop timers on app shutdown

The scheduler should reuse `appUpdateController.checkForAppUpdate()` and must not duplicate manifest parsing, prerelease resolution, install-mode selection, or portable fallback behavior.

## Main Process Data Flow

1. App creates `appUpdateController` as today.
2. App creates `appUpdateScheduler` with:
   - `checkForAppUpdate`: delegates to controller
   - `broadcast`: sends renderer events through the existing event bridge
   - timers: injectable for tests
   - platform/build gating, or a `shouldRun` callback
3. On app startup, scheduler starts a delayed check.
4. On interval, scheduler checks again.
5. On Settings manual check IPC:
   - the main process should route through scheduler `checkNow("manual")`
   - manual checks must await and return `AppUpdateInfo | null` to the IPC caller
   - manual checks may surface errors to the caller, unlike background checks
6. On prerelease preference changed:
   - Settings should notify the updater path explicitly after saving the config
   - implementation may use a dedicated updater IPC such as `ameow:updater:preference-changed`, or intercept `app-update-preference-changed` in `main.mts`
   - the re-check must be owned by the scheduler, not by an independent `App.tsx` refresh, so in-flight and pending follow-up behavior remains centralized

## Renderer Data Flow

Add an app event for update state, for example:

- `app-update-state`

Payload shape should be small and explicit:

```ts
type AppUpdateStatePayload = {
  info: AppUpdateInfo | null;
  phase: "idle" | "checking" | "available" | "error";
  checkedAtMs: number | null;
  error: string | null;
  source: "startup" | "interval" | "manual" | "preference_changed";
};
```

The exact phase names can reuse existing `AppUpdatePhase` where appropriate, but the scheduler must not emit `downloading` or `installing`; those remain user-action phases controlled by renderer install flow.

`src/App.tsx` should:

- listen for scheduler update state events
- set `appUpdateInfo` and `appUpdatePhase` from available updates
- keep existing update indicator and install click behavior
- avoid its own independent startup check if scheduler is responsible for startup

`src/pages/SettingsPage.tsx` should:

- continue to support manual check
- request current scheduler state on mount, for example through `desktopUpdater.getState()`
- subscribe to scheduler update state for later changes
- show discovered update state when available

Mount-time hydration is required because the background update event may have fired before Settings was opened.

## Manual Checks And Errors

Manual checks should remain direct feedback operations:

- user clicks "Check update"
- Settings enters `checking`
- call scheduler `checkNow("manual")`
- if it succeeds with no update, show up-to-date state
- if it fails, show existing error state in Settings

The IPC contract must preserve the current direct return path:

- `ameow:updater:check` awaits scheduler manual check
- returns `AppUpdateInfo | null`
- throws to the caller for manual check failures
- scheduler may also broadcast the resulting state

Background checks should be quiet:

- log failure
- clear foreground error
- schedule next retry using backoff
- do not show a user-facing error unless an update was already visible and the user explicitly interacts with update UI

## Concurrency

Scheduler should keep one in-flight promise.

Recommended behavior:

- if a background check fires while any check is running, skip or join it
- if a manual check starts while a background check is running, join the running check and return its result
- if a preference-change check starts while another check is running, either join and schedule one follow-up after completion, or cancel none and run immediately after current check finishes

Preference changes are important because the manifest source changes. To keep implementation simple and deterministic:

- track a `pendingImmediateReason`
- if `checkNow("preference_changed")` is called during an in-flight check, mark pending
- after the current check finishes, immediately run one more check with the latest config

## Timing

Recommended constants:

- startup delay: 60 seconds
- normal interval: 6 hours
- failure backoff: 15 minutes, 1 hour, 6 hours max

Constants should live in `electron/appUpdateScheduler.mts` and be injectable or overrideable in tests.

Scheduling should use one next-check timer rather than both interval and retry timers. After each check:

- success: schedule normal interval
- no update: schedule normal interval
- background failure: schedule backoff interval
- manual failure: do not reset the normal background schedule unless implementation simplicity requires rescheduling

## Install Flow

No install behavior should move into the scheduler.

Existing user-triggered install remains:

- renderer calls `desktopUpdater.downloadAndInstall()`
- main process calls controller `downloadAndInstallAppUpdate()`
- installed mode downloads and opens installer
- portable mode downloads, verifies, and launches helper

The pending update must still be held by the update controller. Because the scheduler calls `checkForAppUpdate()`, a discovered update should continue to set controller pending state for later install.

The current controller clears its private pending update state when a later check returns no update or fails. That is unsafe for background periodic checks: a user-visible update must remain installable until replaced by a newer discovered update, installed, or explicitly cleared by a deliberate user/manual path.

Implementation should add an explicit controller behavior for scheduler/background checks, such as:

- a check option that preserves existing `pendingAppUpdate` on no-update/error results; or
- a separate controller method for background discovery that does not clear pending state unless a newer update is found.

Manual checks may continue to clear stale pending update state when they intentionally report no update, but background interval checks must not silently erase a previously discovered install candidate.

Renderer install phases remain local for the first implementation:

- scheduler broadcasts discovery/checking/error state only
- Settings may show its own local `downloading` / `installing` phase when the user clicks update from Settings
- main window may show its own local install phase when the user clicks the compact update indicator
- broadcasting install lifecycle can be a later enhancement if cross-window progress synchronization is needed

## Compatibility

- Unsupported platforms and dev builds should not start network checks.
- Existing stable/prerelease manifest behavior remains inside the controller.
- Existing portable fallback behavior remains inside the controller.
- Existing settings prerelease toggle remains the source of truth for prerelease opt-in.

## Test Strategy

Add focused unit tests for `electron/appUpdateScheduler.mts`:

- startup check scheduled after delay
- normal interval check after success
- background failure uses 15m -> 1h -> 6h backoff
- success resets failure backoff
- in-flight checks do not overlap
- manual check can join or sequence safely
- preference-change during in-flight check schedules one follow-up
- stop clears timers and prevents future checks
- unsupported builds do not schedule checks

Update existing tests as needed:

- app update controller tests should remain mostly unchanged
- main process IPC wiring may need test coverage if existing harness supports it
- renderer tests, if practical, should cover handling an `app-update-state` event

## Risks

- Duplicate startup checks if `src/App.tsx` keeps its current startup effect while scheduler also checks at startup.
- Settings may show stale state if it does not subscribe to scheduler state or request current state.
- Preference toggles can use the wrong manifest source if the re-check is coalesced incorrectly.
- The controller's pending update state must not be cleared by a later no-update check from a stale config source.
- Manual update checks must keep their existing IPC return/error behavior even if they are routed through the scheduler.
