# Extract Electron Site-Session Command Controller Info

## Source Plan

- Planning task: `.trellis/tasks/archive/2026-05/05-26-plan-low-risk-electron-controller-extraction/info.md`
- Parent task: `.trellis/tasks/05-25-architecture-boundary-refactor/info.md`

## Initial Scope

Extract only site-session renderer command dispatch from `electron/main.mts` into `electron/siteSessionCommands.mts`. Keep manager ownership and capture-window creation in `electron/main.mts`.

## Completion Summary

Status: completed.

Implemented Phase 5.1 only. Extracted site-session renderer command dispatch from `electron/main.mts` into `electron/siteSessionCommands.mts` using the existing `supports()` / `invoke()` controller pattern.

Commands migrated:

- `get_site_session_state`
- `start_site_session_capture`
- `complete_site_session_capture`
- `cancel_site_session_capture`
- `clear_site_session`
- `get_douyin_session_state`
- `start_douyin_session_capture`
- `complete_douyin_session_capture`
- `cancel_douyin_session_capture`
- `clear_douyin_session`

Files changed:

- `electron/main.mts`
- `electron/siteSessionCommands.mts`
- `electron/siteSessionCommands.test.mts`

Behavior preserved:

- Generic commands still resolve `payload.siteId`, falling back to `"douyin"` when absent.
- Legacy Douyin aliases still hard-code `"douyin"` and ignore `payload.siteId`.
- Unsupported site error text remains `Unsupported site session: <siteId>`.
- Unsupported direct controller invocation error text remains `Unsupported Electron command: <command>`.
- Manager method return values and rejected promises pass through without catch/rewrap.
- `electron/main.mts` still owns `siteSessionManagers`, `createSiteSessionManager(...)`, capture-window creation, session hardening, app startup/shutdown, and IPC registration.

Tests added:

- `supports()` true for all 10 site-session commands and false for neighboring non-site commands.
- Every generic command maps to the expected manager method.
- Every Douyin alias maps to the expected manager method and ignores payload site id.
- Generic absent site id falls back to Douyin.
- Unsupported site errors before manager lookup.
- Manager-missing errors and manager promise rejections pass through.
- Direct unknown command invocation throws the existing unsupported Electron command text.
- Injected resolver receives the original payload object.

Validation:

- `npm test -- electron/siteSessionCommands.test.mts electron/siteSessionManager.test.mts`: passed, 2 files / 16 tests.
- `npm run type-check`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 113 files / 719 tests.
- `git diff --check`: passed with only the existing Windows LF-to-CRLF working-copy warning.

Claude plan review:

- Confirmed the 10-command scope was complete and low risk.
- Recommended reusing the existing `supports()` / `invoke()` pattern and a single `Set` for command membership.
- Supported exporting the resolver from `siteSessionCommands.mts` instead of adding a separate helper module.
- Confirmed that keeping manager ownership, capture-window creation, lifecycle, and IPC registration in `main.mts` preserves the composition root.

Claude final diff review:

- Found no must-fix issues.
- Confirmed behavior preservation, no scope creep, and sufficient characterization tests.
- Suggested replacing `command in douyinAliasCommands` with an own-property check; adopted.

Follow-up:

- None required for Phase 5.1.
- Future Phase 5.x work should continue avoiding WebSocket, BrowserWindow, startup, download, and config surfaces unless explicitly scoped.
