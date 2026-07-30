## Scenario: Background App Update Check Scheduler Contract

### 1. Scope / Trigger

- Trigger: Any task that changes app update checking, updater IPC channels, prerelease preference handling, renderer update indicators, or app update install state.
- Why this needs code-spec depth: The feature crosses Electron main timers, GitHub manifest lookup, controller pending-install state, preload IPC, renderer event hydration, Settings manual actions, and public docs. A change can compile while making updates undiscoverable or clearing an installable candidate.

### 2. Signatures

Scheduler API:

```ts
type AppUpdateCheckReason =
  | "startup"
  | "interval"
  | "manual"
  | "preference_changed";

type AppUpdateStatePayload = {
  info: AppUpdateInfo | null;
  phase: "idle" | "checking" | "available" | "error";
  checkedAtMs: number | null;
  error: string | null;
  source: AppUpdateCheckReason | null;
};

interface AppUpdateScheduler {
  start(): void;
  stop(): void;
  checkNow(reason: AppUpdateCheckReason): Promise<AppUpdateInfo | null>;
  getState(): AppUpdateStatePayload;
}
```

Preload bridge:

```ts
interface AmeowElectronBridge {
  updater: {
    check(): Promise<AppUpdateInfo | null>;
    getState(): Promise<AppUpdateStatePayload>;
    notifyPreferenceChanged(): Promise<AppUpdateStatePayload>;
    downloadAndInstall(): Promise<void>;
  };
}
```

IPC / event names:

```ts
type UpdaterIpcChannel =
  | "ameow:updater:check"
  | "ameow:updater:get-state"
  | "ameow:updater:preference-changed"
  | "ameow:updater:download-and-install";

type AmeowAppEvent = "app-update-state" | "app-update-preference-changed" | ...;
```

Controller check options used by the scheduler:

```ts
type CheckForAppUpdateOptions = {
  preservePendingOnNoUpdate?: boolean;
  preservePendingOnError?: boolean;
  throwOnError?: boolean;
};
```

### 3. Contracts

- `electron/appUpdateScheduler.mts` owns background update timers and concurrency. Renderer code must not add independent startup or periodic update polling.
- Scheduler starts only for packaged Windows builds. Dev builds and unsupported platforms must not perform network update checks.
- Startup check is delayed, currently `60_000ms`. Normal periodic check interval is currently `6h`.
- Background failure backoff is bounded: `15m -> 1h -> 6h -> 6h`.
- Scheduler must never download, install, open release URLs, quit, or relaunch. Install remains user-triggered through `updater.downloadAndInstall()`.
- `ameow:updater:check` is the manual path: it awaits `scheduler.checkNow("manual")`, returns `AppUpdateInfo | null`, and throws to the renderer on manual failures.
- `ameow:updater:preference-changed` is the prerelease preference path: Settings calls it after saving config, and the scheduler re-checks using the latest config.
- `app-update-state` is the main-to-renderer state event. `src/App.tsx` and `src/pages/SettingsPage.tsx` must also call `desktopUpdater.getState()` on mount because the event may have fired before the window existed.
- Startup and interval checks are quiet background checks. If they return no update or fail, they must preserve an already discovered `info` in scheduler state and preserve the controller's `pendingAppUpdate`.
- Manual and preference-change checks are explicit user/config actions. They may clear stale visible update state when they return no update.
- Background failures log and broadcast `error: null`; Settings/manual failures may surface an error string.
- If a check is in flight, overlapping checks must not start a second manifest request. A preference-change request during an in-flight check must schedule exactly one follow-up check after the current check settles.
- `stop()` must clear timers and prevent future scheduled checks during app shutdown.

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| Packaged Windows app starts | Schedules one delayed startup check from Electron main |
| Dev build or non-Windows platform starts | Schedules no network checks |
| Startup/interval check finds an update | Emits `app-update-state` with `phase="available"` and keeps controller pending install candidate |
| Later startup/interval check returns no update | Visible discovered `info` and controller pending candidate remain available |
| Later startup/interval check fails | Foreground `error` remains `null`, previous `info` remains available, and next retry uses backoff |
| Manual Settings check returns no update | Settings can show up-to-date and visible `info` may clear |
| Manual Settings check fails | IPC throws and Settings can show a foreground error |
| Prerelease toggle is saved | Settings calls `notifyPreferenceChanged()` and applies the returned scheduler state |
| Preference change arrives during in-flight check | Current check is joined; exactly one follow-up check runs with latest config |
| User clicks update | Only then may installer/portable helper/manual URL flow run |
| App quits | Scheduler timers are cleared |

### 5. Good/Base/Bad Cases

- Good: A packaged Windows user never opens Settings, startup background check discovers `0.3.2`, the main window shows the update indicator, and Settings later hydrates the same update through `getState()`.
- Good: A background retry fails after an update was discovered, but the update indicator remains and `downloadAndInstall()` still has a pending candidate.
- Good: Toggling prerelease updates while a stable check is in flight queues one follow-up and then reflects the latest preference source.
- Base: Restarting the app resets in-memory scheduler state and backoff; persistent update state is not required for this feature.
- Bad: `App.tsx` calls `desktopUpdater.check()` on startup while Electron main also schedules startup checks.
- Bad: A background no-update result clears `info`, hiding an update the user could still install.
- Bad: Scheduler starts `downloadAndInstallAppUpdate()`, opens an external URL, or quits the app without a user click.

### 6. Tests Required

- `electron/appUpdateScheduler.test.mts`:
  - startup check waits for configured delay;
  - normal success schedules the configured interval;
  - background failures back off `15m -> 1h -> 6h`;
  - success resets backoff;
  - overlapping checks share one request;
  - preference-change during in-flight check schedules exactly one follow-up;
  - unsupported builds do not schedule timers;
  - `stop()` clears scheduled timers;
  - background no-update preserves discovered `info`;
  - preference-change no-update clears visible `info`.
- `electron/appUpdateController.test.mts`:
  - background no-update and background error preserve `pendingAppUpdate` so install remains possible.
- Full validation after cross-layer changes:
  - `npm run type-check`
  - `npm run lint`
  - `npm test`
  - `npm run docs:build` when docs or user-facing update behavior changes
  - `git diff --check`

### 7. Wrong vs Correct

#### Wrong

```ts
// src/App.tsx
useEffect(() => {
  void desktopUpdater.check();
}, []);
```

This duplicates the main-process scheduler and bypasses centralized concurrency/backoff behavior.

#### Correct

```ts
// src/App.tsx
useEffect(() => {
  void desktopUpdater.getState().then(applyAppUpdateState);
  return desktopEvents.on("app-update-state", ({ payload }) => {
    applyAppUpdateState(payload);
  });
}, []);
```

#### Wrong

```ts
// Background interval result
state = { info: null, phase: "idle", error: null, source: "interval" };
pendingAppUpdate = null;
```

#### Correct

```ts
// Background interval result keeps a discovered candidate visible/installable.
const nextInfo = resultInfo ?? previousState.info;
state = { ...previousState, info: nextInfo, phase: nextInfo ? "available" : "idle" };
await controller.checkForAppUpdate({
  preservePendingOnNoUpdate: true,
  preservePendingOnError: true,
  throwOnError: true,
});
```
