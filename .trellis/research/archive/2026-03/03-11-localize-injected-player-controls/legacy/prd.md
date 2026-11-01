# Localize injected player controls

## Goal
Bring injected YouTube and Bilibili player-control copy into the extension locale system so button titles and alerts follow the selected extension language.

## What I already know
- Desktop UI uses `react-i18next`.
- Extension popup uses a custom locale bundle loader from `browser-extension/locales`.
- Injected detector scripts currently hardcode button titles and alerts instead of reading locale bundles.

## Requirements
- Add locale keys for injected player control copy used by YouTube and Bilibili detectors.
- Provide a way for injected scripts to resolve localized strings from the extension locale resources.
- Localize button titles, clip-state titles, clear-interaction hints, and user-facing alert copy.
- Keep this task separate from IN/OUT behavior changes.

## Acceptance Criteria
- [ ] Injected YouTube control titles render in the active extension language.
- [ ] Injected Bilibili control titles render in the active extension language.
- [ ] Injected alerts use localized copy instead of hardcoded literals.
- [ ] Popup localization behavior remains unchanged.

## Out of Scope
- No IN/OUT interaction redesign
- No backend or desktop app localization work

## Technical Notes
- Likely touch points: `browser-extension/youtube-detector.js`, `browser-extension/bilibili-detector.js`, `browser-extension/locales/*/extension.json`
- Reuse the existing extension locale source instead of introducing a second translation store.
