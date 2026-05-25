# Architecture boundary refactor

## Goal

Plan and execute a conservative, phased architecture boundary refactor across the renderer, Electron main process, desktop runtime, core download types, and browser extension without changing product behavior or protocol contracts.

## Current Status

Phase 0 is already complete and archived in commit `87a70b3 refactor(core): resolve runtime type boundary`.

This task is in planning state. The next implementation phase must not start until the worktree is clean enough to keep architecture changes separate from unrelated edits.

## Requirements

- Preserve existing renderer command names.
- Preserve existing Electron event names.
- Preserve existing WebSocket action names and payload fields.
- Preserve the `get_config` / `save_config` raw string contract.
- Preserve the current browser-extension packaging shape.
- Keep each phase small enough for human review.
- Do not bundle unrelated changes into architecture refactor commits.
- Stop when a phase requires broad behavior changes, unclear test failures, or extension packaging changes outside the planned scope.

## Phase Map

- Phase 0: Archive completed runtime type boundary repair.
- Phase 1: Extract side-effect-free App download/transcode pure logic.
- Phase 2: Consolidate desktop-side video candidate normalization.
- Phase 3: Add renderer-side typed config helper above the raw config command contract.
- Phase 4: Extract App download event-to-view-state reducer logic.
- Phase 5: Split one low-risk Electron main command/action controller while keeping main as the composition root.
- Phase 6: Extract low-risk pure JavaScript helpers from `browser-extension/background.js` without TypeScript migration or new bundling.

## Acceptance Criteria

- [x] Phase 0 commit exists and keeps the runtime type boundary fix separate from unrelated work.
- [x] Root-level temporary phase plan/report files are migrated into this Trellis task.
- [x] The architecture audit is stored as task research instead of duplicated in root and task files.
- [ ] Each future phase has focused task artifacts before implementation starts.
- [ ] Each future phase runs relevant focused tests plus `npm run type-check`, `npm run lint`, and `npm test` before commit.
- [ ] Worktree classification is refreshed before each phase so unrelated extension or audit-file changes are not bundled.

## Out of Scope

- Do not start Phase 1 during the recovery/migration pass.
- Do not rewrite `src/App.tsx` or split components in one pass.
- Do not rewrite `electron/main.mts` startup/window creation.
- Do not migrate `browser-extension/background.js` to TypeScript.
- Do not change renderer/Electron/extension protocol names or payload semantics.
- Do not include `PERFORMANCE_RESOURCE_AUDIT.md` deletion or unrelated browser-extension changes in architecture refactor commits without explicit review.
