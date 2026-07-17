# Drag and File Intake Refactor Implementation Plan

## Checklist

- [x] Read required specs before editing:
  - `.trellis/spec/frontend/hook-guidelines.md`
  - `.trellis/spec/backend/electron-runtime-contracts.md`
  - `.trellis/spec/backend/type-safety.md`
  - `.trellis/spec/backend/error-handling.md`
  - `.trellis/spec/frontend/docs-site.md` if docs are touched
- [x] Refactor preload drop utilities:
  - consolidate single-path and multi-path extraction;
  - preserve `addEventListener("drop", ..., true)` capture-phase registration;
  - keep folder validation path based on first native path;
  - add tests for multi-file extraction and text fallback behavior.
- [x] Refactor renderer drop handling:
  - isolate drop classification from drop execution;
  - route native local file paths to `process_files` with `operation: "move"`;
  - remove or quarantine renderer `File.path` move/copy ambiguity;
  - keep `file://`, clipboard, and browser/chat file payloads as copy/save semantics.
- [x] Refactor backend file intake result contract:
  - return structured result for `process_files`;
  - include per-path success/failure details or an equivalent typed signal for partial failures;
  - update all `process_files` callers to use `processedCount` or equivalent instead of string matching;
  - preserve backward-compatible command name and copy default.
- [x] Harden move behavior:
  - no-op when source is already at the intended destination;
  - preserve rename-rule priority when enabled;
  - keep cross-volume copy+delete fallback.
- [x] Update docs only if wording changes beyond current PRD behavior.
- [x] Review final diff for unrelated changes and line-ending-only churn.

## Validation

- `npm run type-check`
- `npm run lint`
- `npm test`
- `npm run docs:build` when docs change
- `git diff --check`

## Focused Tests

- `electron/preloadDrop.test.mts`
- `electron/fileIntake.test.mts`
- Add renderer/helper tests if drop classification is extracted into a pure utility.
- Include focused coverage for mixed folder+file drops, same-output move no-op, structured partial-success results, and avoiding duplicate `file://` fallback processing after a native move classification.

## Risky Files

- `src/App.tsx`
- `electron/preload.mts`
- `electron/preloadDrop.mts`
- `electron/fileIntake.mts`
- `electron/main.mts`
- `src/types/electronBridge.ts`
- `src/desktop/runtime.ts`
- `site/src/content/docs/**/desktop/files-and-folders.md`

## Review Gate

Before running `task.py start`, confirm with the user that:

- PRD semantics match desired product behavior.
- The design should preserve `process_files` as the command name.
- Implementation should proceed in the current working tree that already contains the immediate move-semantics fix.
