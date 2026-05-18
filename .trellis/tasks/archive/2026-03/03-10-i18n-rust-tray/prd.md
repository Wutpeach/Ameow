# implement: localize Rust tray and native menu strings

## Goal

Load localized tray/native menu strings from bundled locale resources and refresh the tray immediately after language changes, while keeping English fallback safe.

## Scope

* Add Rust helpers to load locale JSON from bundled resources.
* Localize tray/native menu labels in `src-tauri/src/lib.rs`.
* Support the agreed locale sync contract for extension/background requests and broadcasts.
* Refresh or rebuild tray labels after language changes.
* Preserve acceptable first-run English fallback behavior before frontend bootstrap writes normalized language.

## Explicitly Not In Scope

* Desktop React UI localization
* Extension popup UI localization
* Root locale source creation or sync script design

## Target Files

* `src-tauri/src/lib.rs`
* optional new Rust helper files under `src-tauri/src/`
* packaged locale resource consumption under `src-tauri/resources/locales/**`

## Do Not Edit

* `browser-extension/**`
* `src/**`
* `src-tauri/tauri.conf.json` unless the foundation task explicitly leaves a required gap

## Dependencies

* Depends on `03-10-i18n-foundation`.
* Use the resource layout and protocol names defined there.

## Acceptance Criteria

* [ ] Tray/native menu labels load from locale resources with English fallback.
* [ ] Missing locale files or keys do not crash the app.
* [ ] The tray refreshes after language changes.
* [ ] WebSocket `get_language` / `language_changed` support exists for extension sync.
* [ ] First-run behavior remains acceptable without Rust-side OS locale detection.

## Handoff Notes

* This task owns Rust-side locale/resource loading and protocol implementation to keep `lib.rs` conflicts localized to one worker.
