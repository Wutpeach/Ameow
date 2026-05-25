# Add typed renderer config helper

## Goal

Establish a small typed renderer-side config helper that centralizes the repeated `get_config` / JSON parse / object patch / `save_config` pattern used by `SettingsPage.tsx`, while preserving the existing raw string desktop command contract and current settings UI behavior.

## Requirements

- Preserve the existing `get_config` and `save_config` command names.
- Preserve the raw string contract: renderer calls still receive a config string from `get_config` and send a serialized config string to `save_config`.
- Preserve the on-disk config file format and all config field names and semantics.
- Keep the helper renderer-only; it may wrap existing desktop runtime calls but must not introduce Electron/main-process dependencies.
- Replace only 1-3 minimal, high-confidence duplicate SettingsPage handlers in this phase.
- Keep SettingsPage UI behavior, error messaging, optimistic updates, and rollback behavior unchanged for replaced handlers.
- Add focused tests for the new helper covering invalid JSON, empty config, successful patches, save failure propagation, and preservation of unrelated fields.
- Record any handlers that are too coupled to local UI state as follow-up instead of forcing extraction.

## Acceptance Criteria

- [x] A typed renderer config helper exists in an appropriate renderer-side module.
- [x] The helper wraps `get_config` / `save_config` without changing their raw string protocol.
- [x] `SettingsPage.tsx` replaces 1-3 selected duplicate config handlers with the helper and avoids broad state-management rewrites.
- [x] Focused helper tests cover invalid JSON, empty config, patch success, save failure, and unrelated-field preservation.
- [x] `npm run type-check`, `npm run lint`, `npm test`, and `git diff --check` pass.
- [x] Claude plan and final diff reviews are completed and in-scope feedback is addressed.

## Notes

- Parent task: `05-25-architecture-boundary-refactor`.
- Parent phase: Phase 3, Renderer-Side Typed Config Helper.

## Non-Goals

- Do not modify `get_config` / `save_config` command names or desktop command implementations.
- Do not change the raw config string contract.
- Do not change config file format, config defaults, config key names, or config field semantics.
- Do not rewrite `SettingsPage.tsx` or redo settings page state management.
- Do not change settings page UI behavior.
- Do not touch `src/App.tsx` reducer work, `electron/main.mts` controllers, or `browser-extension/background.js`.
- Do not start Phase 4.
