# Extension Popup Console And Media Browser Implementation Plan

## Scope Boundary

Implement Phase 3/4 planning target only:

- popup three-tab console;
- launcher control and hidden-site management in popup;
- popup-local manual media browser for Video/Image candidates;
- no old injected button removal;
- no context-menu/right-click removal.

## Implementation Order

1. Review current extension UI and state helpers.
   - `browser-extension/popup.html`
   - `browser-extension/popup.css`
   - `browser-extension/popup.js`
   - `browser-extension/floating-launcher.js`
   - `browser-extension/floating-launcher.css`
   - `browser-extension/launcher-config.js`
   - `browser-extension/background.js`

2. Refactor popup shell into the approved three-tab layout.
   - Increase popup width to roughly 320-340px.
   - Add top-level tabs: Browse, Controls, Sites.
   - Default active tab is always Browse on popup open.
   - Keep header/status compact.

3. Move existing controls into the Controls tab.
   - Preserve desktop connection state.
   - Preserve quality preference.
   - Preserve launcher global enabled state.
   - Preserve current-site restore/fallback behavior.
   - Add side selection and reset position.

4. Add hidden-site management to the Sites tab.
   - Read hidden sites from launcher config.
   - Render compact hidden host rows.
   - Support restore one site.
   - Support restore all sites with a guarded confirmation.
   - Broadcast config updates to active/open tabs so launchers update.

5. Add media scan messaging.
   - Add popup request for active-page media scan.
   - Route through background to the active tab content script.
   - Return bounded `video` and `image` candidate lists.
   - Add timeout and restricted-page failure handling.

6. Implement media candidate extraction.
   - Video:
     - `video[src]`
     - `video source[src]`
     - direct media links where extension/source indicates video
     - existing generic video candidate helpers where suitable
   - Image:
     - visible `img[src]` above size threshold;
     - `picture/source` candidates where useful;
     - direct image links.
   - Do not add a Link category.
   - Do not add unbounded DOM crawling or thumbnail blobs in the first pass.

7. Implement Browse tab states.
   - Initial: scan prompt.
   - Scanning: compact progress state.
   - Results: Video/Image sub-tabs.
   - Empty: no candidates for selected media type.
   - Error/unavailable: compact restricted-page or scan-failed message.
   - Stale cache: show timestamp and rescan affordance.

8. Implement candidate row menus.
   - Visible row keeps only concise metadata.
   - `...` menu includes Download, Copy link, View source.
   - Debounce repeated Download clicks for the same URL.
   - Copy uses clipboard API with fallback if needed.

9. Keep launcher scope stable.
   - Do not move hidden-site list into launcher.
   - Do not add media candidate list to launcher.
   - Keep existing launcher quick actions working.

## Validation Plan

Run focused checks before implementation review:

```powershell
npm run type-check
npm run lint
npm test -- --run
```

Manual extension checks:

- Popup opens at the new width and defaults to Browse.
- Browse does not scan until Scan current page is clicked.
- Video/Image sub-tabs render only their candidate type.
- Candidate row menu can download, copy link, and show source.
- Popup close/reopen within cache TTL restores recent scan result.
- Restricted pages show a compact unavailable state.
- Controls tab can toggle launcher enabled state.
- Controls tab can switch side and reset launcher position.
- Sites tab lists hidden sites.
- Single-site restore removes one hidden site.
- Restore all clears hidden sites and launchers can reappear.
- Existing launcher pick/current download actions still work.
- Existing injected buttons and context-menu paths remain present.

## Implementation Status

Completed in this pass:

- Popup shell now uses the approved `Browse / Controls / Sites` structure at 336px.
- Popup initialization always selects `Browse`; the selected top-level tab is not persisted.
- Browse contains only `Video` and `Image` media filters.
- Media scanning is manual through the Scan control; popup open only checks for a short-lived previous scan cache.
- Media candidates are collected through `popup -> background -> active tab content script`, capped, deduped, and cached for 60 seconds.
- Candidate rows show compact metadata and place Download, Copy link, and View source behind a row menu.
- Controls contains desktop status, quality preference, launcher enabled state, side selection, reset position, current-site restore, and fallback download.
- Sites contains the hidden-site list, per-site restore, and guarded restore-all.
- Existing injected site buttons and context-menu/right-click paths were left in place.

Automated validation completed:

```powershell
node --check browser-extension\popup.js
node --check browser-extension\background.js
node --check browser-extension\generic-video-detector.js
node --check browser-extension\launcher-config.js
npm run type-check
npm run lint
npm test -- --run browser-extension/launcher-config.test.js browser-extension/generic-video-detector.test.js browser-extension/generic-video-selection-utils.test.js browser-extension/capture-evidence.test.js browser-extension/extension-data-utils.test.js
npm test -- --run
node ./scripts/package-browser-extension.mjs --output-dir .trellis/tmp/browser-extension-dev-check
git diff --check
```

Manual browser validation still recommended before release:

- Load unpacked `browser-extension` in Chrome and inspect popup layout at the real extension popup size.
- Confirm scanning on real media-heavy pages and restricted pages.
- Confirm popup row menu placement visually in dark and light themes.
- Confirm launcher side/reset/restore updates are visible on already-open tabs.

## Rollback Notes

- Popup tab shell changes are isolated to extension popup files.
- Hidden-site operations should reuse existing launcher config, so rollback can remove the UI without data migration.
- Media scan cache is additive and can be ignored by older code.
- Old injected/context-menu paths remain unchanged, reducing rollback risk.
