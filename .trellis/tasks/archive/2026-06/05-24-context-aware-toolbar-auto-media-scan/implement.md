# Context-Aware Toolbar Auto Media Scan Implementation Plan

## Scope Boundary

Implement the revised popup direction only:

- context-aware hub layout;
- automatic active-page scan on popup open;
- `Video / Audio / Image` media filters;
- compact resource rows and row action menus;
- collapsed secondary sections for quality, launcher state/position, and hidden sites.

Do not remove existing injected buttons or context-menu/right-click paths in this task.

## Implementation Order

1. Review current popup implementation and tests.
   - `browser-extension/popup.html`
   - `browser-extension/popup.css`
   - `browser-extension/popup.js`
   - `browser-extension/background.js`
   - `browser-extension/generic-video-detector.js`
   - `browser-extension/generic-video-selection-utils.js`
   - `browser-extension/launcher-config.js`

2. Refactor popup shell from fixed top-level tabs to context hub.
   - Remove or hide the `Browse / Controls / Sites` top-level tab model.
   - Add stable context card.
   - Add collapsed secondary sections for quality, launcher, and hidden sites.
   - Preserve compact header and connection pill.

3. Change scan lifecycle from manual-first to auto-refresh.
   - On popup open, resolve active tab and same-URL cache.
   - Pre-check restricted URLs such as `chrome://`, `chrome-extension://`, `edge://`, and `about:` before attempting content-script scan.
   - Render cached result immediately when available.
   - Start a bounded refresh scan once per popup open.
   - Add in-flight scan dedupe keyed by active tab id plus URL hash so rapid popup close/reopen does not start duplicate scans.
   - Ensure cache reads compare stored `pageUrl` against the current active tab URL.
   - Keep a visible `Refresh` action for manual retry.

4. Add audio candidate extraction.
   - Extend media type normalization to `video | audio | image`.
   - Detect `audio[src]` and nested `source[src]`.
   - Detect direct audio links and resources by extension/MIME.
   - Prefer stable audio extensions/MIME types: `mp3`, `m4a`, `aac`, `wav`, `ogg`, `oga`, `flac`, `opus`.
   - Exclude segment/playlist-like resources such as `m3u8`, `mpd`, `m4s`, and `ts`.
   - Exclude candidates with known duration below 5 seconds.
   - Include audio in dedupe, caps, cache shape, popup rendering, and row actions.
   - Update background response normalization so scan responses include an `audios` array with a safe default.

5. Update media browser rendering.
   - Replace two-way media tabs with `Video / Audio / Image`.
   - Show resource counts in the context card.
   - Keep row menu actions: Download, Copy link, View source.
   - Ensure empty state is media-type-specific.

6. Update fallback and settings behavior.
   - Keep `Download this page` conditional on launcher unavailability/hidden/restricted injection state.
   - Place conditional `Download this page` in the context card as a muted secondary action.
   - Keep `Restore launcher` visually primary when the launcher is hidden on the current site.
   - Move quality, launcher position, and hidden sites into collapsed rows/sections.
   - Preserve restore current site, restore one, restore all, side, reset, and global enable behavior.

7. Update localization.
   - Add strings for Audio, auto scanned, refresh, scanned just now, scan failed, and audio empty states.
   - Update English and Chinese locale files together.

8. Update tests and static checks.
   - Add or update JS tests for audio candidate detection.
   - Add cache scoping tests if existing helpers are testable.
   - Add manifest/package validation if popup file references change.

## Validation Plan

Run focused automated checks:

```powershell
node --check browser-extension\popup.js
node --check browser-extension\background.js
node --check browser-extension\generic-video-detector.js
npm run type-check
npm run lint
npm test -- --run browser-extension/generic-video-detector.test.js browser-extension/generic-video-selection-utils.test.js browser-extension/launcher-config.test.js
npm test -- --run
node ./scripts/package-browser-extension.mjs --output-dir .trellis/tmp/browser-extension-auto-scan-check
git diff --check
```

Manual extension checks:

- Popup first render appears quickly before scan completes.
- Scannable page auto-populates resources without clicking Scan.
- Same-URL cached results appear immediately, then refresh.
- `Video / Audio / Image` filters each show the correct candidate type.
- Audio files from `audio` tags and direct audio links appear once after dedupe.
- Tiny/noisy audio resources do not flood the popup.
- Streaming fragments and playlists are excluded from the Audio tab by default.
- Rapid popup close/reopen does not start duplicate active scans for the same tab URL.
- Navigating the same tab to a new URL does not show the prior URL's cache result.
- Restricted browser pages skip auto-scan without waiting for the full scan timeout.
- Restricted browser pages show compact unavailable state.
- Offline desktop state still allows inspection but download action reports desktop requirement.
- Launcher hidden state makes restore prominent and fallback conditional.
- Quality, launcher, and hidden-site controls remain reachable in collapsed sections.

## Rollback Notes

- The layout refactor is isolated to popup files and locale strings.
- Auto-scan can be rolled back to manual scan by keeping the scan command path and disabling popup-open trigger.
- Audio support is additive in the media candidate contract. If needed, the UI can temporarily hide the Audio filter while keeping extraction code unused.

## Implementation Status

Completed in this pass:

- Replaced the fixed `Browse / Controls / Sites` popup shell with a context-aware hub card plus collapsed `Quality`, `Launcher`, and `Hidden sites` sections.
- Popup open now loads same-tab same-URL cache when available and then starts a bounded auto-scan.
- Added restricted-page pre-check, active scan in-flight dedupe, and cache `pageUrl` verification in the background service worker.
- Added `Audio` as a third media filter and candidate type.
- Added audio extraction from `audio` elements, `source` children, direct audio links, and recent performance resources.
- Added audio noise filtering for short known-duration clips and playlist/segment-like resources.
- Preserved row menu actions and existing injected/context-menu paths.
- Updated English and Chinese locale sources and generated browser-extension locale resources.

Automated validation completed:

```powershell
node --check browser-extension\popup.js
node --check browser-extension\background.js
node --check browser-extension\generic-video-detector.js
npm test -- --run browser-extension/generic-video-detector.test.js browser-extension/generic-video-selection-utils.test.js browser-extension/launcher-config.test.js
npm run type-check
npm run lint
node ./scripts/package-browser-extension.mjs --output-dir .trellis/tmp/browser-extension-auto-scan-check
git diff --check
npm test -- --run
```

Manual browser validation still recommended:

- Load unpacked `browser-extension` and inspect the real popup size.
- Confirm auto-scan on media-heavy pages, audio pages, and restricted browser pages.
- Confirm context card action priority when launcher is visible, hidden for site, globally disabled, and desktop offline.
- Confirm row menu placement and disclosure expansion in both black and white themes.

## Claude Review Notes

Claude reviewed the planning task and agreed the pivot is coherent. Required adjustments captured here:

- resolve cache scoping as tab id plus URL hash with `pageUrl` verification;
- define audio noise filters before coding;
- explicitly update background normalization for `audios`;
- test restricted-page skip, duplicate scan prevention, cache URL mismatch, and audio extraction;
- keep fallback download in the context card as secondary to launcher recovery.
