## Scenario: Electron Preload Bridge Contract For Renderer Migration

### 1. Scope / Trigger

- Trigger: Any renderer file replaces direct `@tauri-apps/*` imports with the Electron preload bridge, or any new desktop-only renderer code is added after the Electron foundation task.
- Why this needs code-spec depth: The migration moves desktop ownership from Tauri plugins into Electron preload/main, but renderer behavior still depends on stable command names, event names, and child-window semantics.

### 2. Signatures

Source-of-truth types:

```ts
import type {
  AmeowElectronBridge,
  AmeowRendererCommand,
  AmeowAppEvent,
} from "../types/electronBridge";
```

Canonical renderer bridge usage:

```ts
const configStr = await window.ameow!.commands.invoke<string>("get_config");

const unlisten = await window.ameow!.events.on<Theme>(
  "theme-changed",
  (event) => {
    setTheme(event.payload);
  },
);

await window.ameow!.windows.openSettings({
  title: "Settings",
  width: 360,
  height: 420,
  center: true,
  alwaysOnTop: true,
});

const selection = await window.ameow!.system.openDialog({
  directory: true,
  multiple: false,
  title: "Choose Output Folder",
});

const update = await window.ameow!.updater.check();
await window.ameow!.updater.downloadAndInstall();
```

Current-window bounds typing:

```ts
const result = await window.ameow!.currentWindow.animateBounds(bounds, {
  durationMs: 0,
  transitionToken,
});

if (result.transitionToken !== transitionToken) {
  return;
}
```

### 3. Contracts

- New Electron-migrated renderer files must not import:
  - `@tauri-apps/api/*`
  - `@tauri-apps/plugin-*`
  - `electron`
  - Node built-ins
- Use `window.ameow!.commands.invoke<T>(...)` for desktop commands and keep current command names stable while transport changes.
- Use `window.ameow!.events.on<T>(...)` / `emit(...)` for app events and keep current event names stable while transport changes.
- Desktop bootstrap code that detects Electron must fail fast if `window.ameow` is missing; do not silently mount the normal app shell as if it were plain web mode.
- Event subscriptions must treat each event name as its own channel contract. Do not rely on a single renderer listener that receives unrelated event names and filters them ad hoc.
- Secondary windows must go through:
  - `window.ameow!.windows.has(...)`
  - `window.ameow!.windows.focus(...)`
  - `window.ameow!.windows.openSettings(...)`
  - `window.ameow!.windows.openContextMenu(...)`
- Dev-only preview tooling may additionally use:
  - `window.ameow!.windows.openUiLab(...)`
  - `window.ameow!.commands.invoke<void>("dev_ui_lab_apply_scenario", { scenario })`
  - `window.ameow!.events.on<void>("ui-lab-reset", ...)`
- UI Lab and other internal preview routes must be gated behind `import.meta.env.DEV`; packaged builds must not expose a production-facing route or settings entry point for them.
- `window.ameow!.clipboard.readImage()` must return serializable pixel data only; renderer remains responsible for converting that into a `data:` URL for existing image-save flows.
- `window.ameow!.updater.check()` must return serializable `AppUpdateInfo | null`; renderer must not expect a raw updater handle object with platform-specific methods.
- App-update channel preference contract:
  - Settings persists the opt-in flag under config key `receivePrereleaseUpdates`.
  - Settings must write that key through `window.ameow!.commands.invoke<void>("save_config", { json })`; do not invent a dedicated updater-settings command unless the typed command surface is updated in the same change.
  - Renderer config parsing for desktop bootstrap/settings must tolerate invalid JSON and fall back to `{}` before reading `receivePrereleaseUpdates`.
  - Settings must emit `window.ameow!.events.emit("app-update-preference-changed", { receivePrereleaseUpdates: boolean })` after a successful save so already-mounted surfaces can refresh update state without restart.
  - Main-window listeners may treat `app-update-preference-changed` as a stateless refresh signal and re-run `window.ameow!.updater.check()`, but they must not assume the emitted payload is the source of truth over persisted config.
- High-frequency frameless-window motion must use the typed current-window bridge (`outerPosition()` + `setPosition(...)`) rather than `commands.invoke("set_window_position")`.
- Same-window icon-mode size morphs must use `window.ameow!.currentWindow.animateBounds(...)`; do not add a dedicated transition overlay BrowserWindow back into the renderer contract.
- If `currentWindow.animateBounds(...)` is used by competing compact/full paths, keep the request and response on one typed contract. Renderer code should pass an optional `transitionToken` and treat the echoed `transitionToken` as the async completion identity before committing follow-up UI state.
- If Electron main repositions `main` natively outside the renderer drag path, such as the `shortcut-show` summon flow, renderer compact/full helpers must refresh any cached `outerPosition()` before reusing it for `currentWindow.animateBounds(...)` or idle compact transitions.
- The optional global `window.ameow` is the migration boundary. Do not scatter ad hoc fallback branches across components; use a small adapter layer or fail fast where the bridge is required.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Migrated file still imports `@tauri-apps/*` | Code review / literal search | Renderer boundary stays preload-mediated | Replace imports with `window.ameow` usage |
| Preload command name drifts from current Rust command name | Runtime invoke path | Existing renderer call site still works | Keep current command string stable |
| Electron mode is detected but `window.ameow` is missing | Renderer bootstrap | Failure is explicit and diagnosable | Fail fast instead of silently mounting browser-mode UI |
| Event listener implementation depends on one shared desktop IPC channel | Re-render / subscription churn | Listener counts stay bounded and event payloads stay local to their contract | Use event-specific channels and matching cleanup |
| Child window created with raw Electron/Tauri APIs | Window lifecycle path | Window ownership stays centralized | Route through `window.ameow!.windows.*` |
| Dev-only preview route is registered in production | Renderer bootstrap / routing | Internal tooling stays hidden from packaged users | Gate route registration with `import.meta.env.DEV` |
| Scenario preview uses an untyped command or ad hoc event name | Preview boundary | UI Lab stays on the typed preload contract | Use `dev_ui_lab_apply_scenario` and `ui-lab-reset` from `src/types/electronBridge.ts` |
| Clipboard bridge returns non-serializable platform handle | Renderer paste path | Renderer can still convert to `data:` URL | Return structured `{ width, height, rgba }` only |
| Updater bridge leaks provider-specific object shape | Update UI path | Renderer remains platform-agnostic | Return `AppUpdateInfo | null` and expose install separately |
| Settings writes prerelease preference through ad hoc local state only | Update channel toggle path | Preference is lost on refresh/restart | Persist `receivePrereleaseUpdates` through `get_config` / `save_config` |
| Renderer crashes on invalid config JSON while reading app-update preference | Desktop bootstrap / Settings mount | UI still renders and defaults to stable-only updates | Parse config defensively and fall back to `{}` |
| Settings emits `app-update-preference-changed` before save succeeds | Cross-window refresh path | Main window may refresh against stale persisted config | Emit the event only after `save_config` resolves |
| Main window treats the emitted payload as canonical without rechecking updater state | Update-indicator path | UI can drift from the actual available update result | Re-run `window.ameow!.updater.check()` on the event |
| Frameless drag uses `commands.invoke("set_window_position")` inside `pointermove` | Main window interaction | Drag stays smooth | Use `currentWindow.setPosition(...)` fire-and-forget |
| Icon-mode expand introduces a second temporary overlay BrowserWindow | Main window transition path | Expand remains a single-HWND morph with no cross-window handoff | Use `currentWindow.animateBounds(...)` on the main window instead |
| `animateBounds(...)` completion from an old compact/full request still mutates renderer state | Main window transition path | Late callbacks cannot reapply stale native/window state | Carry a typed transition token through the request/response boundary and validate it after `await` |
| Electron main repositions the BrowserWindow before `shortcut-show`, but renderer reuses stale cached coordinates for the next compact/full transition | Shortcut summon then idle compact path | Compact icon stays anchored to the latest shortcut position | Refresh cached `currentWindow.outerPosition()` when `shortcut-show` arrives before reusing cached bounds |
| `window.ameow` absence handled differently in many components | Migration review | Bridge failures stay predictable | Centralize access behind one adapter or fail fast consistently |

### 5. Good / Base / Bad Cases

- Good:
  - A migrated component replaces `invoke<string>("get_config")` with `window.ameow!.commands.invoke<string>("get_config")` and keeps the same JSON parsing logic.
  - Settings toggles `receivePrereleaseUpdates`, persists it to config, emits `app-update-preference-changed`, and the main window refreshes update availability without restart.
  - `App.tsx` child-window logic moves from `WebviewWindow` calls to `window.ameow!.windows.has/focus/open*` without changing labels or visible behavior.
  - `src/main.tsx` stops booting the normal desktop shell when Electron is detected but the preload bridge is unavailable.
  - Dev-only UI review tooling opens `window.ameow!.windows.openUiLab(...)` from Settings and drives the real main window through the typed `dev_ui_lab_apply_scenario` command.
  - Frameless window dragging uses `outerPosition()` + `setPosition(...)` over the typed current-window bridge, so pointer-move updates stay out of the command invoke path.
  - `shortcut-show` first refreshes the renderer's cached `outerPosition()` and then runs the existing full-mode restore helper, so the next idle compact stays at the new shortcut anchor point.
  - Clipboard-image flows still receive pixel data that the renderer turns into a PNG data URL before calling `save_data_url`.
- Base:
  - Legacy Tauri files may still exist during incremental migration, but any newly migrated file uses the preload bridge exclusively.
- Bad:
  - A migrated file imports `ipcRenderer` directly.
  - Settings stores the prerelease toggle only in React state, so refresh/restart resets the user back to stable updates silently.
  - Main window subscribes to `app-update-preference-changed` but never re-runs the updater check, so the indicator keeps stale stable/prerelease state until the next app launch.
  - A renderer subscribes to one catch-all desktop event listener and switches on event names locally.
  - Shortcut summon moves the native BrowserWindow near the cursor, but renderer keeps a stale pre-shortcut position cache and shrinks the idle icon back to the old coordinates.
  - Desktop bootstrap silently falls back to browser-mode routing when `window.ameow` is missing.
  - Renderer update UI depends on an Electron-specific updater object instead of the preload contract.
  - Different components invent different child-window APIs instead of using `window.ameow!.windows`.

### 6. Tests Required (with assertion points)

- `npm run type-check` passes with `src/types/electronBridge.ts` and `src/global.d.ts` included.
- Migrated renderer files contain no fresh `@tauri-apps/*` imports.
- Electron bootstrap path shows an explicit failure state if `window.ameow` is unavailable.
- Child-window flows still open/focus `settings` and `context-menu` through the typed bridge.
- Dev-only preview route is registered only when `import.meta.env.DEV` is true.
- UI Lab renderer code uses typed bridge calls for `openUiLab`, `dev_ui_lab_apply_scenario`, and `ui-lab-reset`.
- Frameless drag stays on the typed current-window bridge and avoids per-move `invoke(...)`.
- `currentWindow.animateBounds(...)` callers keep the optional `transitionToken` request field and echoed response field aligned across renderer, preload, and main process.
- Clipboard-image save flows still receive enough data to produce a PNG data URL.
- Update UI still handles `null` from `window.ameow!.updater.check()` safely.
- Settings prerelease toggle survives invalid existing config JSON by writing a valid object with `receivePrereleaseUpdates`.
- Toggling the prerelease preference emits `app-update-preference-changed` only after `save_config` succeeds.

### 7. Wrong vs Correct

#### Wrong

```ts
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

const configStr = await invoke<string>("get_config");
const selected = await open({ directory: true });
```

#### Correct

```ts
const configStr = await window.ameow!.commands.invoke<string>("get_config");
const selected = await window.ameow!.system.openDialog({
  directory: true,
  multiple: false,
});
```
