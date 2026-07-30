## Scenario: Main Window Folder Drop Sets Output Path Contract

### 1. Scope / Trigger

- Trigger: The Electron main floating window accepts a Windows Explorer folder drop and uses it as the next export/output directory.
- Why this needs code-spec depth: The feature crosses renderer drop handling, Electron preload path resolution, main-process filesystem validation, and persisted config updates. If the boundary is wrong, folder drops silently degrade into picker prompts or break normal file drops.

### 2. Signatures

Electron preload/main shared result contract:

```ts
type AmeowDroppedFolderPathResult =
  | {
      success: true;
      path: string;
      name: string;
    }
  | {
      success: false;
      path: string;
      error: string;
      reason:
        | "EMPTY_PATH"
        | "UNRESOLVED_DROP"
        | "PRELOAD_ERROR"
        | "NOT_DIRECTORY"
        | "NOT_FOUND"
        | "STAT_FAILED";
    };
```

Renderer bridge usage:

```ts
const droppedFolderResult =
  await window.ameow!.drop.consumePendingFolderDrop();

await saveOutputPath(droppedFolderResult.path);
```

Electron preload/main implementation surface:

```ts
window.ameow!.drop.consumePendingFolderDrop():
  Promise<AmeowDroppedFolderPathResult | null>;

ipcRenderer.invoke("ameow:drop:validate-folder-path", { path });
```

### 3. Contracts

#### Preload/Main Contract

- Preload owns local dropped-path extraction for the current DOM `drop` event.
- Prefer `webUtils.getPathForFile(file)` over renderer-only browser APIs when the drop includes `DataTransferItem.kind === "file"`.
- Fallback text parsing may use `text/uri-list` or `text/plain`, but only for local paths (`file://`, Windows absolute path, UNC path). Never treat ordinary HTTP(S) drag text as a local filesystem path.
- Main-process validation must call `fs.promises.stat(...)` and return a typed `AmeowDroppedFolderPathResult`.
- Validation accepts directories only. Existing files must resolve as `reason: "NOT_DIRECTORY"` instead of mutating config.

#### Renderer Contract

- `src/App.tsx` must await `window.ameow!.drop.consumePendingFolderDrop()` at the start of the main `drop` handler before running normal URL/file/image logic.
- Successful folder validation must persist through `saveOutputPath(...)`; renderer must not write `outputPath` directly without the existing config/event helper.
- `reason: "NOT_DIRECTORY"` is a non-consuming result for the main drop handler so normal file drops continue through the existing copy/save flow.
- Other failure reasons may show user-visible feedback, but they must not mutate `outputPath`.

#### Shared Behavior Contract

- Main-window folder drop is a direct-set action, not a folder-picker trigger. Do not replace a real dropped folder with `openDialog({ directory: true })`.
- Valid folder drops and context-menu folder changes must converge on the same persisted `outputPath` semantics and `output-path-changed` event flow.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Renderer uses `webkitGetAsEntry()` + folder picker fallback | Main drop path on Windows | Dragged folder path is not read directly | Move path extraction into Electron preload and validate via main IPC |
| Drop payload contains no local file items | Preload drop path | Normal URL/image drag remains unchanged | Return `null` and let existing renderer drop logic continue |
| Dropped local item resolves to a file | Main validation | File copy flow still works; `outputPath` is unchanged | Return `reason: "NOT_DIRECTORY"` and let renderer continue normal file handling |
| Dropped local folder does not exist by validation time | Main validation | No config change; user gets failure feedback | Return `reason: "NOT_FOUND"` |
| Local path cannot be resolved from drop data | Preload resolution | No config change; user gets failure feedback | Return `reason: "UNRESOLVED_DROP"` |
| Config persistence fails after a valid folder drop | Renderer save path | No silent success UI; `outputPath` remains unchanged | Catch the error and show failure feedback |

### 5. Good / Base / Bad Cases

- Good:
  - User drags `C:\\Users\\Name\\Desktop\\Exports` onto the main window, preload resolves the local path, main validates it as a directory, and renderer persists it through `saveOutputPath(...)`.
  - User drags a normal file; preload/main classify it as `NOT_DIRECTORY`, and the existing file-copy path still runs.
- Base:
  - User drags a web URL or image from the browser; folder-drop bridge returns `null`, and the existing drag handler continues as before.
- Bad:
  - Renderer opens a directory picker after detecting a dropped folder instead of consuming the actual dropped path.
  - Renderer treats every failed local validation result as a hard stop, breaking ordinary file drops.

### 6. Tests Required (with assertion points)

- Type checks:
  - `window.ameow!.drop.consumePendingFolderDrop()` is typed in `src/types/electronBridge.ts`.
  - `src/App.tsx` keeps normal file-drop branches reachable after a `NOT_DIRECTORY` result.
- Unit tests:
  - `electron/folderDrop.test.mts` covers local path text parsing and `validateDroppedFolderPath(...)` success/failure cases.
  - `src/utils/folderDrop.test.ts` covers renderer consumption rules, especially the `NOT_DIRECTORY` passthrough case.
- Runtime checks on Windows:
  - Drag a real folder onto the main floating window and assert the displayed output directory updates without a picker prompt.
  - Drag a regular file and assert the file is still copied/saved instead of changing `outputPath`.
  - Drag an invalid or stale folder path and assert no config corruption occurs.

### 7. Wrong vs Correct

#### Wrong

```ts
const handleDrop = async (event: React.DragEvent) => {
  const entry = (event.dataTransfer.items[0] as any).webkitGetAsEntry?.();
  if (entry?.isDirectory) {
    const selected = await window.ameow!.system.openDialog({ directory: true });
    if (typeof selected === "string") {
      await saveOutputPath(selected);
    }
    return;
  }
};
```

#### Correct

```ts
const handleDrop = async (event: React.DragEvent) => {
  const droppedFolderResult =
    await window.ameow!.drop.consumePendingFolderDrop();

  if (droppedFolderResult?.success) {
    await saveOutputPath(droppedFolderResult.path);
    return;
  }

  if (droppedFolderResult?.success === false
    && droppedFolderResult.reason !== "NOT_DIRECTORY") {
    showFolderDropError(droppedFolderResult.reason);
    return;
  }

  // Continue existing file / URL / image drop logic.
};
```

---
