# Extension Popup Options Page Redesign Implementation Plan

## Preconditions

- Review this task's `prd.md` and `design.md`.
- Reconcile with active task `.trellis/tasks/05-24-extension-popup-console-media-browser/`, because that task currently describes a popup `Sites` tab that this task supersedes. Add or preserve a note in that task stating that hidden-site list management has moved to this options-page task.
- Before editing code, load `trellis-before-dev` and relevant frontend/backend specs.

## Implementation Checklist

1. Manifest and page scaffold
   - Add `options_page` to `browser-extension/manifest.json`.
   - Create `browser-extension/options.html`.
   - Create `browser-extension/options.css`.
   - Create `browser-extension/options.js`.
   - Reuse `ameow-shared.css`, `locale-utils.js`, `launcher-config.js`, and `direct-download-quality.js` where appropriate.
   - Verify `ameow-shared.css` does not assume popup dimensions before importing it into the options page.

2. Background message contract
   - Confirm existing launcher message handlers are sufficient for options page reads/writes.
   - Treat `restore_launcher_for_site` as an existing direct current-tab restore operation, but remove its popup UI entry for this redesign unless product scope changes.
   - Add a background handler only if the options MVP needs manual add-hidden-site.
   - Keep launcher config writes routed through `updateLauncherConfigAndBroadcast`.

3. Options page UI
   - Render launcher enabled state.
   - Render launcher side control.
   - Render reset position action.
   - Render hidden-site count and list.
   - Support per-site restore.
   - Support restore-all with a guarded confirmation.
   - Optionally render default download quality if popup simplification needs it.
   - If quality settings are included, register `chrome.storage.onChanged` so options and popup summaries stay synchronized.

4. Popup simplification
   - Remove hidden-site list rendering from popup main body.
   - Remove Restore all hidden sites from popup main body.
   - Replace hidden-site panel with compact count/status and Settings entry if useful.
   - Keep current media scan/browse behavior intact unless a direct layout conflict requires adjustment.
   - Keep quality and launcher summaries compact and fixed-height.

5. Popup footer
   - Add footer markup with Settings, version, and More.
   - Settings opens a tab with `chrome.tabs.create({ url: chrome.runtime.getURL("options.html") })`.
   - Version reads from `chrome.runtime.getManifest().version` and displays as `v${version}`.
   - More menu includes only:
     - GitHub repository;
     - Getting Started guide.
   - Ensure More opens links in tabs and does not include app-management controls.
   - Position the More menu as an overlay anchored to the footer, such as `position: absolute` with `bottom: 100%`, so it does not expand document flow or create body-level scrollbars.

6. Styling
   - Add darker footer surface for black theme and deeper neutral footer for white theme.
   - Preserve Ameow compact typography and restrained accent use.
   - Ensure popup body does not visually jump when interacting with footer or compact controls.
   - Keep scrollbars inside bounded internal lists, not at the popup body level.

7. Localization
   - Add or update locale keys for Settings, More, Repository, Getting Started, Launcher settings, Hidden sites, Restore, Restore all, and any new status text.
   - Keep fallbacks in JS for robustness if locale files are missing keys.
   - Minimum key coverage:
     - popup footer: `Settings`, `More`, `GitHub repository`, `Getting started`, `Open settings`;
     - popup summaries: `Hidden here`, `{count} hidden sites`, `Launcher settings`;
     - options page: `Launcher settings`, `Show launcher`, `Launcher side`, `Left`, `Right`, `Reset position`, `Hidden sites`, `No hidden sites`, `Restore`, `Restore all`, restore-all confirmation copy.

## Validation Plan

- `node browser-extension/manifest.test.js` if the manifest tests cover options-page schema or can be updated to do so.
- `node browser-extension/launcher-config.test.js`.
- Manual extension load in Chrome/Edge:
  - popup opens without width jump;
  - Settings opens options page;
  - More opens GitHub and Getting Started links;
  - hidden-site list is absent from popup;
  - options page restores one hidden site;
  - options page restores all hidden sites;
  - launcher side/enabled/reset changes update the active page without browser restart.
- If package-level checks are needed after implementation:
  - `npm run type-check`
  - `npm run lint`

## Risky Files

- `browser-extension/popup.html`
- `browser-extension/popup.css`
- `browser-extension/popup.js`
- `browser-extension/manifest.json`
- `browser-extension/background.js`
- `browser-extension/launcher-config.js`
- locale files under `browser-extension/locales/`

## Rollback Points

- Manifest/page scaffold can be reverted independently if options page load fails.
- Popup footer can be reverted independently if it causes layout regressions.
- Any new background message handler should be small and revertible; do not entangle it with existing download handlers.

## Implementation Notes

- Added `options_page` manifest wiring and a focused static options page for launcher enabled state, side, reset position, hidden-site listing, per-site restore, and guarded restore-all.
- Kept options-page writes routed through existing background messages so `ameow_launcher_config_update` broadcasts continue to reach active tabs.
- Removed popup hidden-site list management, restore-all, direct current-site restore, and launcher enable/side/reset controls.
- Replaced the popup tools drawer with compact quality controls, a launcher summary that opens Settings, and a footer containing Settings, version, and More.
- Limited More to external/help links: GitHub repository and Getting Started.
- Reconciled the older popup-console task by adding a superseded-scope note for the previous `Sites` tab direction.

## Claude Review Follow-Up

Claude reviewed the implemented direction after local diff inspection. The review agreed that moving hidden-site and persistent launcher management to `options.html` is the right fix for the popup scrollbar and width-jump problem, and that keeping More informational preserves the product boundary.

Accepted fixes from the review:

- `options.js` no longer treats `get_launcher_controls_state.status` as a fallback launcher config. It only renders returned `config`, preserving the current config if the background response is incomplete.
- Options-page config writes now use a shared write helper that reverts optimistic UI on failed background responses and renders authoritative returned config on success.

Additional review recommendations left for manual smoke testing:

- Open the popup in zero-result, many-result, scanning, offline, and connected states and confirm the body width stays stable.
- Verify More opens as an overlay, closes on outside click and Escape, and does not create popup overflow.
- Verify options-page restore one/all, launcher enabled, side, and reset update the active page launcher.
- Verify theme and language updates on both popup and options page.

## Validation Results

- `npm run locales:sync` passed.
- `node --check browser-extension\popup.js` passed.
- `node --check browser-extension\options.js` passed.
- `npx vitest run browser-extension/manifest.test.js browser-extension/launcher-config.test.js` passed, 8 tests.
- `npm run type-check` passed.
- `npm run lint` passed.
- `npm run package:browser-extension` passed.
- Packaged zip includes `browser-extension/manifest.json`, `browser-extension/options.html`, `browser-extension/options.css`, and `browser-extension/options.js`.

## Spec Update Decision

No `.trellis/spec/` update is required for this task. The implementation did not add or change background message contracts, storage schema, command signatures, or package-level conventions. The durable product decision and RedFrog reference notes are captured in this task's `prd.md` and `design.md`.
