# Add Typed Renderer Config Helper Info

## Scope

- Add a typed renderer-side helper for common config read/parse/patch/save behavior.
- Keep the helper above the existing desktop runtime command contract.
- Start with a small SettingsPage replacement set only: 1-3 handlers that already perform the same safe object patch pattern.
- Add focused tests for helper behavior and compatibility.

## Non-Goals

- Do not change `get_config` / `save_config` command names.
- Do not change the raw string command contract.
- Do not change config file format, keys, defaults, or field semantics.
- Do not rewrite SettingsPage or redo settings page state management.
- Do not change settings page UI behavior, copy, optimistic update semantics, or rollback behavior.
- Do not touch `src/App.tsx` reducer work, `electron/main.mts`, or `browser-extension/background.js`.
- Do not enter Phase 4.

## Compatibility Rules

- `get_config` remains the source of a raw JSON string.
- `save_config` continues to receive a raw serialized JSON string.
- Invalid or empty config input should parse to an object fallback only inside the renderer helper, matching current SettingsPage defensive parsing behavior.
- Patch helpers must preserve unrelated config fields.
- Save failures must surface to callers so existing UI error and rollback paths remain caller-owned.

## Pre-Implementation Discovery Plan

- Find repeated `get_config` / `JSON.parse` / local mutation / `save_config` blocks in `src/pages/SettingsPage.tsx`.
- Select only handlers where the existing rollback and error paths can be preserved exactly.
- Prefer keeping strongly UI-coupled handlers unchanged and recording them as follow-up.
- Confirm helper placement does not create Electron/runtime reverse dependencies.

## Validation Plan

- Focused helper tests.
- `npm run type-check`
- `npm run lint`
- `npm test`
- `git diff --check`
- Claude plan review before implementation.
- Claude final diff review before commit.

## Implementation Notes

- Added renderer-only helper in `src/desktop/config.ts`.
- Helper imports only `desktopCommands` from `src/desktop/runtime.ts` and the existing pure defensive parser from `src/updates/appUpdatePreferences.ts`.
- Selected SettingsPage replacements:
  - `toggleAePortal`
  - `toggleExtensionInjectionDebug`
- Deferred SettingsPage replacements:
  - `confirmShortcut`: currently uses raw `JSON.parse`, so invalid JSON behavior differs from the defensive parser path.
  - `toggleRenameMediaOnDownload`: includes additional compatibility key and event emission.
  - `saveRenameRuleConfig`: safe candidate, but left for a later small pass to keep this diff narrow.
  - `toggleReceivePrereleaseUpdates`: includes app-update event emission and rollback.
  - `saveGlobalProxySettings`: includes validation and UI error state.
  - `selectAeExePath`: existing handler lacks catch/rollback around config save; replacing it would require behavior work beyond the "prove unchanged" boundary.
  - `src/utils/outputPath.ts`: has a separate defensive parser and output-path event/reset behavior; leave as follow-up outside SettingsPage focus.

## Claude Plan Review Summary

Claude agreed the helper belongs in the renderer desktop adapter layer, the raw `get_config` / `save_config` string contract is preserved, and the small replacement scope is appropriate. It flagged `selectAeExePath` as a must-not-replace candidate because the existing handler has no save failure catch/rollback; this task therefore replaced only the two safe toggle handlers and recorded AE path persistence as follow-up. It also recommended testing `get_config` failure propagation in addition to save failure.

## Claude Diff Review Summary

Claude approved the final diff with no must-fix feedback. It confirmed:

- `src/desktop/config.ts` is in the correct renderer-side layer.
- `get_config` and `save_config` keep the same command names, raw string return, and `{ json }` save payload.
- The two SettingsPage replacements preserve their optimistic rollback and error logging behavior.
- The focused tests cover the task acceptance paths.

Non-blocking observations:

- `DesktopAppConfig` remains a broad `Record<string, unknown>`, so this helper improves the typed procedure more than field-level schema safety.
- Function patches are shallow-copy based and should be used carefully if nested config objects are introduced later.

## Validation Results

- `npm test -- src/desktop/config.test.ts`: passed, 1 file and 9 tests.
- `npm run type-check`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 111 files and 690 tests.
- `git diff --check`: passed; PowerShell reported only LF-to-CRLF working-copy warnings for touched files.

## Commit

- `8433fc7 refactor(settings): add typed renderer config helper`
