## Scenario: Context Menu Native Folder Actions Contract

### 1. Scope / Trigger

- Trigger: A dedicated Tauri context-menu window needs to open the current output folder or launch the system folder picker.
- Why this needs code-spec depth: On Windows, auxiliary menu windows, `alwaysOnTop`, and native dialogs create focus/z-order races that do not show up in ordinary same-window settings flows.

### 2. Signatures

Frontend command/event usage:

```ts
await invoke<void>("begin_open_output_folder_from_context_menu");
await invoke<void>("begin_pick_output_folder_from_context_menu");

const unlistenOutputPath = listen<{ path: string }>("output-path-changed", (event) => {
  setOutputPath(event.payload.path);
});

const unlistenContextMenuClosed = listen<void>("context-menu-closed", () => {
  updateContextMenuOpen(false);
});
```

Backend command/helper signatures:

```rust
#[tauri::command]
fn begin_open_output_folder_from_context_menu(app: tauri::AppHandle) -> Result<(), String>

#[tauri::command]
fn begin_pick_output_folder_from_context_menu(app: tauri::AppHandle) -> Result<(), String>

fn persist_output_path(app: tauri::AppHandle, next_output_path: String) -> Result<bool, String>
fn resolve_current_output_folder_path(app: &tauri::AppHandle) -> Result<PathBuf, String>
fn close_context_menu_window(app: &tauri::AppHandle)
```

### 3. Contracts

#### Frontend Contract

- `ContextMenuPage` must call backend commands with `invoke<void>(...)`; it must not open the folder picker directly from the menu window.
- Main window state must listen for `context-menu-closed` and clear the local `isContextMenuOpen` flag.
- Main window state must listen for `output-path-changed` and treat `payload.path` as the source of truth for UI sync.
- Frontend error fallback may call local `requestClose()`, but success-path closing is owned by the backend command.

#### Backend Contract

- `begin_open_output_folder_from_context_menu` must:
  - emit `context-menu-closed`
  - close the `context-menu` window if present
  - resolve the current output folder from config
  - fallback to `<Desktop>/Ameow_Received` when `outputPath` is missing/empty
  - delegate folder opening through backend `open_folder(...)`
- `begin_pick_output_folder_from_context_menu` must:
  - emit `context-menu-closed`
  - close the `context-menu` window if present
  - read whether the `main` window is `always_on_top`
  - temporarily disable `always_on_top` before showing the native picker
  - restore `always_on_top` after the picker callback returns
  - focus `main` before and after the picker callback
  - persist the selected path in backend config, not in the child window frontend
- `persist_output_path(...)` must:
  - no-op and return `Ok(false)` when the selected path equals the current `outputPath`
  - emit `output-path-changed` only after config is saved successfully
  - call `reset_rename_counter(...)` after a real path change

#### Shared Behavior Contract

- The three output-path entry points may use different UI surfaces, but they must converge on the same persisted `outputPath` semantics.
- Canceling the native picker is a valid no-op: no config write, no `output-path-changed`, no crash, no stuck context-menu state.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Menu page opens folder picker directly via frontend plugin | Code review / runtime on Windows | Picker may appear behind app or fail silently | Replace with `invoke<void>("begin_pick_output_folder_from_context_menu")` |
| Menu item does not close the child menu window first | Runtime click path | Menu lingers on screen while OS action proceeds | Close from backend via `close_context_menu_window(...)` before action |
| Main window remains `always_on_top` during picker launch | Runtime z-order | Native picker appears behind Ameow | Temporarily disable `always_on_top` and restore it in callback |
| Picker is canceled | Picker callback | Menu stays closed and path remains unchanged | Return early without config write or event emission |
| Selected path equals existing `outputPath` | Backend persistence | No duplicate state churn or rename-counter reset | Return `Ok(false)` from `persist_output_path(...)` |
| Config JSON cannot be parsed | Backend persistence / path resolution | Command rejects with actionable error | Propagate `Result<_, String>` and let frontend log + close safely |
| Picked folder path cannot convert into `PathBuf` | Picker callback | App does not crash; change is skipped | Log backend error and return |
| `open_folder(...)` fails | Open-folder command | Menu is already closed; failure surfaces as rejected command | Keep close-first ordering and catch on frontend |

### 5. Good / Base / Bad Cases

- Good:
  - Clicking `Set Output Folder` closes the menu immediately, shows the Windows folder picker above Ameow, and updates `outputPath` through `output-path-changed` after selection.
  - Clicking `Open Folder` closes the menu immediately and opens the configured folder, or `<Desktop>/Ameow_Received` when no custom path exists.
  - Re-selecting the same folder produces no duplicate event and does not reset rename numbering.
- Base:
  - Canceling the picker closes the menu and leaves current output-path UI unchanged.
  - Frontend only logs command failures and keeps parent menu state synced through `context-menu-closed`.
- Bad:
  - Context-menu frontend calls `plugin-dialog.open({ directory: true })` directly.
  - Menu page emits an event to another window and expects that window to launch the picker later.
  - Path persistence happens only in the child window, so main window state and rename counter drift out of sync.
  - `Open Folder` succeeds but the menu remains visible because close logic is attached to blur only.

### 6. Tests Required (with assertion points)

- Type checks:
  - `ContextMenuPage` uses `invoke<void>` for both context-menu commands.
  - Main window listeners use `listen<{ path: string }>("output-path-changed", ...)` and `listen<void>("context-menu-closed", ...)`.
- Runtime checks on Windows:
  - Right-click main window, click `Set Output Folder`, and assert the context menu disappears before or as the picker appears.
  - Assert the folder picker is not hidden behind the main always-on-top window.
  - Cancel the picker and assert no visible output-path change occurs.
  - Select a new folder and assert the main window output path updates after `output-path-changed`.
  - Re-select the current folder and assert there is no duplicate reset behavior or error.
  - Right-click main window, click `Open Folder`, and assert the context menu disappears immediately.
- Failure-path checks:
  - Force config parse failure and assert the frontend logs the command error without leaving the menu stuck open.
  - Force `open_folder(...)` failure and assert the child menu is still closed.

### 7. Wrong vs Correct

#### Wrong

```ts
import { open } from "@tauri-apps/plugin-dialog";
import { emit } from "@tauri-apps/api/event";

const selectOutputFolder = async () => {
  await emit("request-output-path-picker");
  await open({ directory: true });
};
```

#### Correct

```ts
const openOutputFolder = async () => {
  await invoke<void>("begin_open_output_folder_from_context_menu");
};

const selectOutputFolder = async () => {
  await invoke<void>("begin_pick_output_folder_from_context_menu");
};
```

---
