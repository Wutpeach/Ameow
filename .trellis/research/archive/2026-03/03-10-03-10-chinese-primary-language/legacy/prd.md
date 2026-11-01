# brainstorm: add Chinese primary language option

## Goal

Introduce a maintainable localization foundation so FlowSelect can support Simplified Chinese as a first-class UI language, not just scattered translated strings. The immediate product goal is to let users use the app in Chinese reliably and switch language without turning the codebase into a string-maintenance mess across desktop windows, the browser extension popup, and Rust-native tray/menu surfaces.

## What I already know

* The user wants to add Chinese as a primary language option and use i18n as real infrastructure rather than ad-hoc copy replacement.
* FlowSelect is a Tauri v2 desktop app with a React + TypeScript frontend and a Rust backend.
* The app already persists user preferences in a shared JSON config through `invoke("get_config")` and `invoke("save_config")`.
* The current codebase has no i18n dependency or translation layer in `package.json`.
* Existing global preference architecture is based on React context for theme (`src/contexts/ThemeContext.tsx`) plus persisted config in backend JSON.
* User-facing strings are currently hardcoded in multiple frontend surfaces, especially:
  * `src/App.tsx`
  * `src/pages/SettingsPage.tsx`
  * `src/pages/ContextMenuPage.tsx`
  * browser extension popup files under `browser-extension/`
* There are also user-facing native strings in Rust, including tray/menu labels in `src-tauri/src/lib.rs`.
* Some existing source files contain mojibake / encoding-damaged Chinese strings, which means this task is not only about translation but also about string hygiene.
* The browser extension is a static MV3 extension, not a bundled npm subproject. It currently consists of plain JS/CSS/HTML files plus `chrome.storage` and a background service worker.
* The browser extension already syncs theme from the desktop app through the existing WebSocket bridge:
  * Rust serves `get_theme` and `theme_changed`
  * `browser-extension/background.js` caches the current theme and relays it to `popup.js`
* `get_config` in Rust returns `{}` when no config file exists, so config evolution can use lazy defaults without a separate blocking migration step.
* `src-tauri/tauri.conf.json` currently bundles only downloader binaries as resources; locale resources are not yet configured.
* The user selected a broad MVP covering desktop app windows, browser extension popup/preferences copy, and Rust tray/native menu strings.
* The user selected `i18next` + `react-i18next` as the preferred architecture.
* The user selected first-run behavior:
  * prefer `navigator.language` where available
  * normalize to supported locales
  * fall back to `en`
  * do not add Tauri OS locale/plugin support in the MVP

## Assumptions (temporary)

* The first practical target languages are `zh-CN` and `en`.
* `en` is the technical fallback locale for missing keys and initialization failures.
* Translation catalogs should be usable from React, plain extension JS, and Rust-adjacent menu-building code.
* A single source of truth for message catalogs is more important than minimizing tooling.
* The extension should not introduce native messaging just for i18n in the MVP.

## Open Questions

* None.

## Requirements

* Add a first-class `language` preference to app configuration.
* Make Simplified Chinese available as a user-selectable UI language.
* Keep English available as a supported language and fallback locale.
* Include the following surfaces in the MVP:
  * desktop app windows
  * browser extension popup and preference copy
  * Rust tray and native menu strings
* Replace hardcoded user-facing strings in the chosen MVP surfaces with centralized message lookup.
* Ensure the chosen architecture can scale to additional languages without duplicating UI logic.
* Keep language behavior consistent across desktop windows, extension popup, and native tray/menu surfaces.
* Define explicit fallback behavior for missing translations and i18n initialization failures.
* Apply language changes consistently without requiring restart where the runtime allows it:
  * desktop windows should re-render immediately
  * browser extension popup should reflect the latest language when opened and should sync while open if feasible
  * tray/native menu strings should refresh after language changes
* Support older config files that do not yet contain `language`.
* Avoid introducing multiple independent sources of truth for locale state.

## Acceptance Criteria

* [ ] A user can select `Simplified Chinese` in the product and see the chosen MVP surfaces render in Chinese.
* [ ] A user can switch back to `English` without restarting if the surface supports live re-render.
* [ ] The selected language persists across app restarts via config.
* [ ] Older config files without `language` do not break; the app resolves a default language, behaves predictably, and can persist a normalized value afterward.
* [ ] Missing translations do not crash the UI and fall back predictably to English.
* [ ] If i18n initialization fails in a runtime, the runtime still renders with English fallback instead of blank or broken UI.
* [ ] The desktop app windows, browser extension popup/preferences copy, and Rust tray/native menu strings are all included in the MVP language coverage.
* [ ] Language changes propagate consistently enough that tray/native menu labels and extension popup text do not stay stale after the user changes language.
* [ ] The extension does not require native messaging or direct file access to participate in locale sync.
* [ ] The MVP scope explicitly defines which surfaces are translated now and which are deferred.

## Definition of Done

* Tests added or updated where appropriate
* Lint, typecheck, and relevant checks pass
* Runtime behavior documented where needed
* Rollout and fallback behavior considered

## Out of Scope

* Translating repository docs/specs/README as part of the runtime localization feature, except brief user-facing release/documentation notes if behavior changes
* Translating developer-only logs/comments
* Adding many new languages beyond Chinese + English in the first pass
* Solving every existing copy/UX problem unrelated to localization
* Full localization of every website-injected detector control across all extension content scripts
* Tauri OS locale plugin / `os:allow-locale` integration in the MVP
* Crowdin/Weblate/locize or any external translation management platform in the MVP

## Technical Notes

* Repo context:
  * `src/main.tsx` already performs async config hydration before render for theme, which is a useful pattern for initial locale hydration in React windows.
  * `src/contexts/ThemeContext.tsx` is the closest existing pattern for a global user preference provider.
  * `src/utils/outputPath.ts` shows the standard config read-modify-save flow.
  * `src-tauri/src/lib.rs:get_config()` returns `{}` when the config file is missing, which supports lazy config evolution.
* Surface inventory:
  * Desktop main window: `src/App.tsx`
  * Settings window: `src/pages/SettingsPage.tsx`
  * Context menu window: `src/pages/ContextMenuPage.tsx`
  * Browser extension popup: `browser-extension/popup.html`, `browser-extension/popup.js`, `browser-extension/background.js`
  * Browser extension preference strings: `browser-extension/direct-download-quality.js`
  * Native tray/menu strings: `src-tauri/src/lib.rs`
* Constraints:
  * Small fixed-size windows mean label growth and overflow matter.
  * Multiple windows share config/theme state already; locale sync should mirror the existing theme sync model where possible.
  * The extension is static and currently has no dedicated bundler pipeline.
  * The tray is created in Rust before the webview finishes bootstrapping, so first-run locale resolution must account for the fact that Rust does not have access to `navigator.language`.

## Research Notes

### What similar tools do

* `react-i18next` is a React-focused layer on top of `i18next`. Its docs highlight:
  * hook/component APIs for React (`useTranslation`, `Trans`, provider integration)
  * base i18next features such as plurals, formatting, interpolation, and fallback
  * multiple translation files via namespaces
  * an official CLI/tooling story for key management and type generation
* `i18next` itself is runtime-agnostic JavaScript i18n infrastructure, which makes it a better fit than a React-only abstraction for this repo.
* Tauri's official documentation confirms that bundle resources can be included through `tauri.conf.json`, resolved at runtime through the resource directory, and used from Rust for packaged files.
* Tauri's menu/tray APIs support runtime updates via menu handles / tray handles, so tray language refresh is technically feasible.
* i18next TypeScript docs support typed keys via `CustomTypeOptions`, which is important for preventing key drift in a multi-surface app.

### Constraints from our repo/project

* The desktop app is React, but the browser extension popup is plain HTML/JS, and tray/native strings live in Rust.
* A React-only solution is insufficient; locale catalogs and language state need a cross-runtime distribution strategy.
* Because the extension already uses a WebSocket bridge for theme, locale sync should reuse that bridge rather than inventing native messaging.
* Because the tray is Rust-first and the MVP explicitly excludes the Tauri OS locale plugin, the very first tray labels on a clean install cannot depend on `navigator.language` until the webview seeds config.

### Chosen approach

**Approach A: `i18next` + `react-i18next` with shared JSON namespaces**

* Why it was chosen:
  * best fit for React windows plus extension reuse because `i18next` core is not React-only
  * namespace support maps well to this repo's multi-surface structure
  * easier incremental rollout than a custom dictionary layer
  * better long-term maintainability than a hand-rolled `t()` solution

## Technical Approach

### 1. Source of truth

* `language` lives in the desktop app config JSON and is the authoritative persisted locale value.
* Translation catalogs live in a single repo-level source of truth, preferably a root `locales/` directory.
* Generated/copied runtime artifacts may exist for packaging, but they are derived from the same catalog source.

### 2. Locale catalog layout

* Recommended source layout:
  * `locales/en/app.json`
  * `locales/en/settings.json`
  * `locales/en/contextMenu.json`
  * `locales/en/extension.json`
  * `locales/en/tray.json`
  * matching `zh-CN` files
* Namespace split should follow runtime surface boundaries so ownership stays clear and Rust can load only the `tray` namespace it needs.

### 3. Build and packaging strategy

* Do not rely on symlinks as the primary solution because the repo targets Windows and symlink ergonomics are fragile.
* Add a small repo script, for example `scripts/sync-locales.mjs`, to fan out locale assets from root `locales/` into runtime-specific destinations:
  * `src-tauri/resources/locales/` for Rust packaging
  * `browser-extension/locales/` for popup/background consumption
  * optional generated TypeScript resource module for the React app if direct JSON imports become awkward
* Update `src-tauri/tauri.conf.json` bundle resources to include the generated Rust locale directory.
* Because the extension is static, do not add webpack/rollup just for i18n in the MVP.
* If the extension needs `i18next` runtime directly, vendor a fixed local browser build into the extension package via script instead of loading from a CDN.

### 4. Desktop React flow

* Add `i18next` and `react-i18next`.
* Add an app-level locale provider parallel to theme.
* React bootstrap flow:
  * read config
  * if `config.language` exists and is supported, use it
  * otherwise normalize `navigator.language` to supported locales
  * if normalization fails, use `en`
  * after bootstrap, persist the resolved language if config was missing it
* `setLanguage` flow:
  * update i18next instance
  * save `language` to config
  * emit a desktop event such as `language-changed`
  * invoke a Rust command to broadcast extension locale updates and refresh tray labels
* Set `document.documentElement.lang` based on the active locale.

### 5. Browser extension flow

* Do not use native messaging in the MVP.
* Reuse the existing WebSocket bridge already used for theme sync.
* Background service worker becomes the extension locale state owner:
  * maintain `currentLanguage` in memory
  * on WebSocket connect, request current language from the desktop app via a new action similar to `get_theme`
  * on desktop locale broadcast, update `currentLanguage`
  * write the latest known locale to `chrome.storage.local` as a cache for popup startup and temporary offline behavior
  * notify popup via `chrome.runtime.sendMessage`
* Popup flow:
  * ask background for current language
  * fall back to cached `chrome.storage.local` locale if the background has not yet refreshed from desktop
  * initialize extension copy from local catalogs derived from the shared source
* `direct-download-quality.js` remains extension-owned preference storage for download settings, but not for authoritative language state.

### 6. Rust tray/native flow

* Load localized tray/menu labels from bundled locale JSON resources.
* Recommended resource path strategy:
  * source of truth in root `locales/`
  * generated copy in `src-tauri/resources/locales/`
  * Rust resolves paths from `BaseDirectory::Resource` and parses JSON with `serde_json`
* Add a small Rust helper layer:
  * resolve configured language
  * load `tray` namespace for that language
  * fall back to English namespace if the target file or key is missing
* Tray refresh path:
  * add a language broadcast/update command in Rust parallel to `broadcast_theme`
  * on language change, refresh menu labels immediately
  * implementation can use cached `MenuItem` handles and `set_text`, or rebuild and reattach the tray menu through tray handles if that is cleaner in this codebase
* First-run nuance:
  * because MVP excludes Rust-side OS locale detection, a clean install with no `language` in config cannot resolve `navigator.language` inside Rust before webview bootstrap
  * acceptable MVP behavior: Rust tray starts in English fallback on first boot, then refreshes to the normalized config language as soon as the frontend resolves and persists it

### 7. Config migration and defaults

* A dedicated migration script is not required for MVP because config is schemaless JSON and `get_config` already tolerates absence by returning `{}`.
* Add lazy normalization helpers:
  * `read_language(config)` with supported-locale validation
  * frontend bootstrap fallback chain: `config.language` -> normalized `navigator.language` -> `en`
  * persist normalized language after bootstrap if it was absent
* This keeps old configs compatible without forcing a preflight migration step.

### 8. i18n engineering workflow and type safety

* Add TypeScript typing for i18next keys using `CustomTypeOptions`.
* Prefer typed keys or selector-based access so invalid keys fail in development rather than at runtime.
* Add npm scripts for i18n hygiene, for example:
  * `i18n:check` for missing/unused keys
  * `i18n:types` for generated key typing if needed
  * `i18n:sync-locales` for copying runtime locale artifacts
* Translation editing workflow in MVP:
  * manual JSON editing in-repo
  * review via code review
  * no external TMS integration yet

### 9. Testing and quality

* Add at least targeted tests for:
  * locale normalization and fallback logic
  * config-without-language behavior
  * namespace loading fallback
* Add UI verification for both `en` and `zh-CN` on small surfaces where overflow risk is highest:
  * settings window
  * context menu
  * extension popup
* Add a simple audit step for text overflow and label clipping.
* If practical, add locale-specific snapshot or Playwright coverage for the critical UI surfaces.

### 10. Minor runtime details

* Update `<html lang>` / document language metadata where appropriate.
* Keep font fallback reasonable for Chinese rendering on Windows and macOS.
* If i18next initialization fails in any runtime, log the error and continue in English fallback.

## Preliminary Recommendation

* The architecture is now specific enough to move into implementation planning.
* The largest risk area is not React i18n itself; it is keeping extension and Rust tray behavior consistent without introducing a second source of truth.
* Reusing the existing WebSocket theme-sync pattern for locale materially reduces that risk.

## Decision (ADR-lite)

**Context**: The MVP scope boundary, first-run behavior, and localization architecture needed to be defined before implementation depth could be planned.

**Decision**:

* The MVP covers desktop app windows, browser extension popup/preferences copy, and Rust tray/native menu strings.
* The chosen architecture is `i18next` + `react-i18next` with shared JSON namespaces.
* First-run default behavior is:
  * `config.language` if present
  * otherwise normalized `navigator.language` where available
  * otherwise `en`
* The extension reuses the existing desktop WebSocket bridge for locale sync and does not use native messaging in MVP.
* Rust tray labels load from bundled locale resources and refresh after language changes.

**Consequences**:

* A React-only solution is not sufficient by itself.
* Shared translation resources and a clear cross-runtime loading strategy are mandatory.
* Missing-key fallback, tray refresh, and extension popup consistency are part of MVP, not later polish.
* Website-injected extension controls remain intentionally out of scope for this phase.

## Implementation Plan

* PR1: i18n foundation and locale asset pipeline
  * add `i18next` and `react-i18next`
  * add root `locales/` source catalogs for `en` and `zh-CN`
  * add locale sync/copy script to generate runtime assets for Tauri resources and the browser extension
  * add typed i18n setup for React and shared locale normalization helpers
  * add config helpers for reading/writing `language` with fallback rules
  * update `tauri.conf.json` resources to bundle locale assets
  * add initial tests for locale normalization and fallback behavior

* PR2: desktop React localization
  * add locale bootstrap/provider flow alongside theme bootstrap in `src/main.tsx`
  * localize `src/App.tsx`, `src/pages/SettingsPage.tsx`, and `src/pages/ContextMenuPage.tsx`
  * add a language selector to settings and persist user changes
  * broadcast `language-changed` across desktop windows
  * update document language metadata and verify small-window overflow behavior

* PR3: extension localization and sync
  * add extension-side catalog loading from generated locale assets
  * extend WebSocket protocol with `get_language` and `language_changed`
  * update `browser-extension/background.js` to cache/sync current language and mirror it into `chrome.storage.local`
  * localize `browser-extension/popup.html`, `browser-extension/popup.js`, and `browser-extension/direct-download-quality.js`
  * verify popup behavior both when connected and when temporarily using cached language state

* PR4: Rust tray/native menu localization
  * add Rust helpers to resolve bundled locale resource files and load the `tray` namespace with English fallback
  * localize tray/menu labels in `src-tauri/src/lib.rs`
  * refresh or rebuild tray menu labels when language changes
  * preserve acceptable first-run fallback behavior before frontend bootstrap writes normalized language

* PR5: verification, hardening, and docs
  * add or update tests for per-locale rendering-critical paths
  * add i18n hygiene scripts such as locale sync/check/type generation if needed
  * run lint, typecheck, and targeted test passes
  * document supported languages and runtime behavior in the user-facing change notes

## Parallel Workstreams

* Parent task: `03-10-03-10-chinese-primary-language`
* Child tasks created for execution:
  * `03-10-i18n-foundation`
  * `03-10-i18n-desktop-react`
  * `03-10-i18n-extension-sync`
  * `03-10-i18n-rust-tray`
  * `03-10-i18n-verify`
* Execution rule:
  * `03-10-i18n-foundation` goes first and defines contracts, shared assets, and generated locale layout.
  * After foundation lands, `desktop-react`, `extension-sync`, and `rust-tray` can proceed in parallel.
  * `03-10-i18n-verify` starts only after the other three are merged or at least rebased onto the same foundation contract.
