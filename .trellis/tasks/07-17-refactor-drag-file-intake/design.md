# Drag and File Intake Refactor Design

## Architecture and Boundaries

Drag/file intake should be split into explicit classification and execution boundaries:

- `electron/preloadDrop.mts`
  - Owns native Electron DataTransfer path extraction via `webUtils.getPathForFile(...)`.
  - Produces preload-only facts such as native local file paths.
  - Does not decide business semantics beyond safe path extraction and folder validation input.
  - Must keep drop listening in capture phase so React drop handlers consume paths captured for the same event.
- `src/App.tsx` or extracted renderer helpers
  - Owns user-facing drop classification and dispatch.
  - Decides whether a drop is folder selection, native local file move, external/browser file save, `file://` copy/save, site-specific media routing, URL image download, or URL video queueing.
  - Does not inspect non-standard DOM `File.path` for move-capable local file semantics.
- `electron/fileIntake.mts`
  - Owns file-system operations for output-folder intake.
  - Supports explicit operations: `copy` and `move`.
  - Applies rename rules before choosing destination paths for every output-folder collection workflow.
- `electron/main.mts`
  - Bridges renderer command payloads into `fileIntake` with typed/defaulted operation semantics.

## Data Flow

### Native local file drag/drop

1. Preload captures the drop in capture phase and resolves native file paths.
2. Renderer consumes `desktopDrop.consumePendingFileDropPaths()`.
3. Renderer dispatches `process_files` with `{ operation: "move" }`.
4. Backend applies rename rules if enabled, resolves collision-safe destination, then moves:
   - same-volume: `rename`
   - cross-volume: copy destination, then delete source only after copy succeeds

### Folder drop

1. Preload resolves first native path and asks Electron main to validate it as a directory.
2. Renderer consumes `consumePendingFolderDrop()`.
3. Successful folder drops update output path only.
4. Folder drops do not copy or move folder contents.

### Clipboard and external app/browser file payloads

1. Renderer treats these as copy/save inputs.
2. `file://` URL fallback is copy/save unless the same drop was already classified as native local file paths by preload.
3. Blob/file payload fallback saves data into the output folder and never assumes it can delete the source.

## Contracts

- Operation semantics:
  - `move`: consumes a real local file-system source and places it in the output folder.
  - `copy`: leaves source intact and creates a collected copy.
  - `save`: creates a file from data/URL content with no source deletion concept.
- Rename rules:
  - Rename configuration has highest priority over source filename for every output-folder collection workflow.
  - Moving affects source consumption, not destination naming.
- Result contract:
  - `process_files` should expose structured data for control flow, for example:
    - `operation`
    - `processedCount`
    - `targetDir`
    - per-path success/failure details sufficient for partial-success handling
  - Renderer must not branch on English strings such as `"Copied 0 files"`.
- Mixed native drops:
  - Folder selection has priority over file intake for a mixed folder+file native drop, unless implementation evidence during refactor supports a clearer explicit rejection/error state.
  - This priority should be expressed in classifier tests rather than as incidental branch order.

## Compatibility Notes

- Preserve command name `process_files`; add or normalize payload fields rather than introducing a replacement command unless implementation evidence shows a cleaner migration is needed.
- Keep current public docs behavior: real local file drag moves; clipboard/external data copies/saves; folders set output directory.
- Existing callers that do not pass `operation` default to `copy`.

## Risk and Rollback

- Main risk is changing drop precedence and accidentally routing site-specific URL/media drops into local file handling.
- A reviewed false-positive risk was that preload drop capture could run after React drop handling. Current code uses `addEventListener(..., true)`, which is capture phase. The implementation should preserve this property.
- Keep classification order explicit and covered by tests where practical.
- Rollback path: retain `process_files` copy default and only revert renderer classification changes if needed.
