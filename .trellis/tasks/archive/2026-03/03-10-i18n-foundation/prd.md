# implement: i18n foundation and locale asset pipeline

## Goal

Create the shared i18n foundation that all later workstreams depend on: locale catalogs, asset sync pipeline, config language contracts, runtime initialization helpers, and agreed event/protocol names.

## Scope

* Add `i18next` and `react-i18next`.
* Create the repo-level `locales/` source-of-truth directory with `en` and `zh-CN` namespaces.
* Add the locale asset sync script that copies derived assets to:
  * `src-tauri/resources/locales/`
  * `browser-extension/locales/`
* Add or define shared locale normalization helpers and supported locale constants.
* Update Tauri resources config so packaged desktop builds contain locale assets.
* Define the contract for:
  * config key: `language`
  * desktop event: `language-changed`
  * WebSocket actions/messages: `get_language`, `language_info`, `language_changed`
  * fallback chain: `config.language -> navigator.language -> en`

## Explicitly Not In Scope

* Full desktop UI string replacement
* Extension popup UI string replacement
* Rust tray label replacement
* End-to-end verification beyond foundational tests

## Target Files

* `package.json`
* `package-lock.json`
* `locales/**`
* `scripts/sync-locales.mjs` or equivalent
* `src/main.tsx`
* `src/i18n/**` or equivalent new shared frontend i18n files
* `src/constants/**` or shared locale helpers
* `src-tauri/tauri.conf.json`
* minimal Rust/frontend contract files only if needed for shared definitions

## Do Not Edit

* Desktop surface copy in `src/App.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/ContextMenuPage.tsx` except if a tiny bootstrap hook is unavoidable
* Extension popup copy or layout files
* Rust tray labels/content

## Dependencies

* None. This is the first task to execute.

## Acceptance Criteria

* [ ] A shared locale source directory exists and contains `en` and `zh-CN` namespaces.
* [ ] There is a repeatable script or workflow to prepare locale assets for both Tauri and the extension.
* [ ] The supported locale list and normalization/fallback rules are codified in code, not just in docs.
* [ ] `language` is part of the agreed config contract.
* [ ] WebSocket and desktop event names for locale sync are defined and documented for downstream tasks.
* [ ] Basic tests cover locale normalization and fallback behavior.

## Handoff Notes

* Downstream tasks should branch from this task's result.
* This task should minimize behavioral edits outside the shared bootstrap/contract layer so parallel workers can rebase cleanly.
