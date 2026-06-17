# Background periodic app update checks

## Goal

Add a default-on background app update check loop so users can discover new Ameow releases even if they never open Settings or click "Check for updates".

The feature should improve update discoverability without making updates intrusive: Ameow may check in the background and surface an available update, but it must not automatically download, install, quit, or relaunch without user action.

## User Value

- Users who keep Ameow running for long periods can learn about new releases without manually opening Settings.
- Users who are not update-aware still see the existing lightweight update entry point when a new version is available.
- Manual update control remains intact: download/install still happens only after the user chooses to update.

## Confirmed Facts

- Current update checks already exist through `desktopUpdater.check()` -> Electron IPC `ameow:updater:check` -> `appUpdateController.checkForAppUpdate()`.
- `src/App.tsx` currently performs one update check after deferred startup initialization is ready.
- `src/pages/SettingsPage.tsx` has a manual "check update" button and update/install button.
- Update installation is already user-triggered through `desktopUpdater.downloadAndInstall()`.
- The Electron app update controller only checks packaged Windows builds; non-Windows or dev builds return no update.
- Stable updates use `https://github.com/Wutpeach/Ameow/releases/latest/download/latest.json`.
- If `receivePrereleaseUpdates` is enabled, the controller queries GitHub Releases for the latest prerelease `latest.json`, then falls back to stable if no prerelease manifest is available.
- Windows installed builds use the installer URL from the manifest.
- Windows portable builds use portable manifest metadata when present; otherwise they fall back to a manual GitHub Releases link.

## Requirements

- Add a main-process owned background update scheduler.
- The scheduler must start automatically for packaged Windows builds.
- It must perform an initial delayed check after app startup.
  - Recommended delay: about 60 seconds after app ready / main startup wiring is complete.
  - The initial delayed check should replace or coordinate with the current renderer startup check to avoid duplicate startup requests.
- It must perform periodic checks while Ameow remains running.
  - Recommended normal interval: 6 hours.
- It must reuse the existing update controller and therefore respect stable/prerelease behavior.
- It must not automatically download, install, relaunch, quit, or open external URLs.
- It must prevent overlapping checks; if a check is already in flight, another scheduled or manual check should not race it.
- A manual Settings check must remain available and should still work immediately.
- If the user toggles prerelease update preference, Ameow should re-check using the new preference without waiting for the next interval.
- When an update is found, the scheduler must publish update availability to renderer windows.
  - The main window should continue to show the existing update indicator.
  - Settings should be able to reflect the discovered update without requiring a fresh manual check.
- If no update is found, no foreground UI should be shown.
- If a background check fails, it must not show a foreground error by default.
- Background failures should be logged and retried using bounded backoff.
  - Recommended backoff: 15 minutes, then 1 hour, then max 6 hours.
  - A successful check should reset backoff.
- The scheduler should stop timers cleanly when the app quits.
- The design should avoid duplicate notifications for the same discovered version.
- A previously discovered update must remain installable after later background checks that find no update or encounter a network/error condition.
- Settings must be able to hydrate the latest known update state when opened after a background check already completed.

## Product Decisions

- Background periodic checks are default-on.
- No user-visible opt-out toggle is required for the first version.
- No auto-download or auto-install is allowed.
- A system notification is optional for implementation, but if added it must be shown at most once per version and clicking it should lead to the existing update action or update surface.

## Acceptance Criteria

- [ ] Packaged Windows builds perform an update check after startup without the user opening Settings.
- [ ] A long-running packaged Windows app performs another update check after the configured interval.
- [ ] Dev builds and unsupported platforms do not perform network update checks.
- [ ] A found update is reflected in the main window update indicator.
- [ ] A found update can be reflected in Settings without requiring the user to manually check first.
- [ ] Opening Settings after a background-discovered update hydrates the update state from main process memory.
- [ ] The Settings "check update" button still manually triggers a check.
- [ ] Toggling prerelease updates triggers a re-check with the new preference.
- [ ] No update download, installer launch, portable helper launch, quit, or relaunch happens until the user clicks update.
- [ ] A background no-update/error check does not clear a pending update that was previously discovered and not yet installed.
- [ ] Background check failures do not show foreground errors.
- [ ] Failed background checks retry with bounded backoff and do not create a tight request loop.
- [ ] Manual checks and scheduled checks cannot overlap in a way that corrupts pending update state or emits inconsistent renderer state.
- [ ] Timers are cleaned up during app shutdown.
- [ ] Unit tests cover scheduler timing, overlap prevention, success, failure backoff, and preference-change re-check behavior.

## Notes

- Existing relevant files:
  - `electron/appUpdateController.mts`
  - `electron/appUpdateController.test.mts`
  - `electron/main.mts`
  - `src/App.tsx`
  - `src/pages/SettingsPage.tsx`
  - `src/desktop/runtime.ts`
  - `src/types/appUpdate.ts`
  - `src/types/electronBridge.ts`
