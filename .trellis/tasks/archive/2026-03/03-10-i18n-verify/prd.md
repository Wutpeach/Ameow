# implement: i18n integration verification and hardening

## Goal

Validate that the desktop app, extension popup, and Rust tray behave consistently after the foundation and implementation workstreams land, then close gaps in fallback, overflow, and testing.

## Scope

* Rebase on top of the foundation, desktop, extension, and Rust tray workstreams.
* Run end-to-end verification for:
  * config fallback
  * desktop language switching
  * extension popup sync/cached fallback
  * tray refresh behavior
* Add or refine tests and small hardening fixes.
* Add i18n hygiene scripts/checks if still missing.

## Explicitly Not In Scope

* Major redesign of the localization architecture
* New locales beyond `en` and `zh-CN`

## Dependencies

* Depends on:
  * `03-10-i18n-foundation`
  * `03-10-i18n-desktop-react`
  * `03-10-i18n-extension-sync`
  * `03-10-i18n-rust-tray`

## Acceptance Criteria

* [ ] The full MVP works across desktop windows, extension popup/preferences copy, and Rust tray/native menu strings.
* [ ] Fallback behavior is verified for missing config language and missing translations.
* [ ] Small-surface overflow issues are checked and fixed where needed.
* [ ] Relevant lint, typecheck, and test commands pass.
* [ ] Residual risks or deferred scope are documented clearly.
