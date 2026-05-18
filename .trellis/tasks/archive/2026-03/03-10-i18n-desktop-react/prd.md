# implement: localize desktop React windows

## Goal

Apply the agreed i18n foundation to the desktop React windows so the main window, settings window, and context menu render in `en` and `zh-CN` and switch languages live.

## Scope

* Consume the shared i18n setup from the foundation task.
* Add locale bootstrap/provider flow to the React app.
* Localize:
  * `src/App.tsx`
  * `src/pages/SettingsPage.tsx`
  * `src/pages/ContextMenuPage.tsx`
* Add the language selector in settings.
* Persist language changes through the config contract.
* Emit the agreed desktop event and invoke the agreed Rust command/hook when the language changes.

## Explicitly Not In Scope

* Extension popup localization
* Rust tray label implementation
* Tauri locale resource loading logic

## Target Files

* `src/main.tsx`
* `src/App.tsx`
* `src/pages/SettingsPage.tsx`
* `src/pages/ContextMenuPage.tsx`
* `src/i18n/**`
* `src/components/**` only if needed for locale-aware UI

## Do Not Edit

* `browser-extension/**`
* `src-tauri/src/lib.rs`
* `src-tauri/tauri.conf.json`

## Dependencies

* Depends on `03-10-i18n-foundation`.
* Use the contract names defined there rather than inventing new command/event names.

## Acceptance Criteria

* [ ] Desktop windows render localized copy from shared namespaces.
* [ ] Settings allows switching between `en` and `zh-CN`.
* [ ] Language changes re-render desktop windows immediately.
* [ ] Language selection persists using the agreed config key.
* [ ] The implementation respects small-window overflow constraints.

## Handoff Notes

* If Rust-side commands for tray/extension broadcast are not yet implemented, code against the agreed contract surface and note any temporary gaps clearly.
