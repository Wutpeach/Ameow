# Plan low-risk Electron controller extraction

## Goal

Plan Phase 5 for `architecture-boundary-refactor` by identifying the lowest-risk first Electron main-process command/controller extraction target. This task is planning-only: no business code changes, no controller creation, and no implementation phase.

## Scope

- Read and analyze current Electron main-process command/action responsibilities.
- Build a responsibility map for `electron/main.mts`.
- Classify command/action families by extraction risk.
- Recommend one minimal Phase 5.1 implementation target.
- Record how Phase 5.1 should preserve IPC command names, WebSocket action names, error envelopes, renderer/preload contracts, startup flow, and BrowserWindow creation.
- Consult Claude on the recommendation and record adopted/rejected/follow-up advice.

## Read-Only Analysis Targets

- `electron/main.mts`
- `electron/videoDownloadCommands.mts`
- `electron/extensionRequestBridge.mts`
- `electron/siteSessionManager.mts`
- `electron/configStore.mts`
- Electron update-related modules if present
- Current IPC command / WebSocket action / config / session / update / file / window handlers
- Related test files
- Existing Trellis parent task records and architecture audit

## Requirements

- Create planning artifacts and context manifests.
- Run `task.py validate` for `implement.jsonl` and `check.jsonl`.
- Do not start implementation or create a business diff.
- Persist the final plan into the child task and parent task record.
- Archive the planning child task and record the session as Trellis chore metadata only.

## Acceptance Criteria

- [x] `git status` is clean before task creation.
- [x] Current Trellis task is none before task creation.
- [x] Parent task `05-25-architecture-boundary-refactor` exists.
- [x] Child task exists with title `Plan low-risk Electron controller extraction`.
- [x] `implement.jsonl` and `check.jsonl` are configured and validated.
- [x] The plan records:
  - `electron/main.mts` responsibility map
  - command/action family list
  - risk rating and rationale for each family
  - recommended minimal Phase 5.1 goal
  - involved files
  - areas not to touch
  - tests to add/update
  - contract-preservation strategy
- [x] Claude plan review is completed and advice is recorded as adopted, rejected, or follow-up.
- [ ] The child task is archived.

## Non-Goals

- Do not modify `electron/main.mts`.
- Do not create a controller.
- Do not modify business code.
- Do not change IPC command names, WebSocket action names, renderer commands, payloads, or error envelopes.
- Do not change startup flow or BrowserWindow creation.
- Do not run formatting or other commands that create business diffs.
- Do not enter Phase 5.1 implementation.
