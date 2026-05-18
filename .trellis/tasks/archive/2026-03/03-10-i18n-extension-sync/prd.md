# implement: localize browser extension popup and locale sync

## Goal

Localize the browser extension popup and extension-owned preference copy using the shared locale catalogs, while syncing language from the desktop app through the existing WebSocket/background architecture.

## Scope

* Consume generated locale assets in the extension.
* Extend the extension background service worker to manage current language state.
* Localize:
  * `browser-extension/popup.html`
  * `browser-extension/popup.js`
  * `browser-extension/direct-download-quality.js`
* Persist a cached locale copy in `chrome.storage.local` for popup startup/offline fallback.
* React to the agreed WebSocket protocol actions/messages:
  * `get_language`
  * `language_info`
  * `language_changed`

## Explicitly Not In Scope

* Website-injected content-script control localization
* Rust WebSocket server implementation
* Desktop React localization

## Target Files

* `browser-extension/background.js`
* `browser-extension/popup.html`
* `browser-extension/popup.js`
* `browser-extension/direct-download-quality.js`
* `browser-extension/locales/**` (generated assets)

## Do Not Edit

* `src-tauri/src/lib.rs`
* `src-tauri/tauri.conf.json`
* Desktop React files under `src/`

## Dependencies

* Depends on `03-10-i18n-foundation`.
* Assumes the locale WebSocket contract names are already defined.

## Acceptance Criteria

* [ ] Popup copy renders in `en` and `zh-CN`.
* [ ] Extension-owned preference labels use the shared locale assets.
* [ ] Background caches the current language and relays updates to the popup.
* [ ] Popup can initialize language from background state and fall back to cached storage state if needed.
* [ ] No native messaging or direct desktop config-file access is introduced.

## Handoff Notes

* If Rust-side WebSocket actions are not implemented yet, keep the extension side aligned with the agreed contract and document any stub assumptions.
