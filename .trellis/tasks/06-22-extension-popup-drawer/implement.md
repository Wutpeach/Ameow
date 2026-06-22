# Implement Plan: Browser Extension Popup Drawer

## Preconditions

- Review `prd.md` and `design.md` with the user before starting implementation.
- Before editing, load `trellis-before-dev` for relevant frontend/backend specs.

## Implementation Steps

1. Add drawer and quick-action markup.
   - Update `browser-extension/popup.html`.
   - Remove/move the standalone quality panel into drawer markup.
   - Remove/replace the standalone login-state panel with the Login State quick-action button.

2. Add popup styles.
   - Update `browser-extension/popup.css`.
   - Add 2x2 quick-action grid styles.
   - Add shared bottom-drawer overlay/panel styles.
   - Add compact download-quality and login-state list styles.
   - Keep sizes stable and avoid layout shift.

3. Refactor popup script for drawer state.
   - Update `browser-extension/popup.js`.
   - Centralize `openDrawer` / `closeDrawer`.
   - Move quality option rendering into Download Settings drawer.
   - Add quick-action button copy/state refresh.
   - Wire Help Docs to docs-site browser-extension page.

4. Reuse floating launcher pick behavior from popup.
   - Add a background message for popup to request active-tab picker start.
   - Use explicit messages:
     - popup -> background: `{ type: "start_pick_download" }`.
     - background -> active tab: `{ type: "ameow_start_picker" }`.
   - Add a `chrome.runtime.onMessage` case in `floating-launcher.js` that calls the existing closure-local `startPicker()`.
   - Prefer extracting shared picker code from `floating-launcher.js` only if needed.
   - Preserve `ameow_download_current_content` submission path.

5. Add login-state drawer data contract.
   - Implement the current-tab sync/enable area first so the drawer has useful behavior before the synchronized-list contract is complete.
   - Add background handler for `get_site_session_drawer_state`.
   - Add desktop WebSocket action for compact synchronized-site summary; this is required for the synchronized-sites list.
   - Desktop owns synchronized-site filtering and should only return saved user-synchronized states.
   - Normalize and guard response data in background before popup consumption.
   - In offline state, return an immediate empty list with an offline reason instead of timing out.
   - Reload drawer state after sync/enable success.

6. Add localization.
   - Update `browser-extension/locales/zh-CN/extension.json`.
   - Update `browser-extension/locales/en/extension.json`.

7. Update docs.
   - Update `site/src/content/docs/docs/browser-extension.mdx`.
   - Update `site/src/content/docs/en/docs/browser-extension.mdx`.
   - Update cookies/login docs if the popup login-state drawer changes wording users need to understand.

8. Add or update tests.
   - Add focused tests for new background drawer-state normalization/handler.
   - Add focused tests for picker-start message if there is an existing browser-extension test pattern.
   - Add a test or check that offline login-state drawer data returns an empty synchronized-site list immediately.
   - Add a test or check that never-synchronized supported sites are not shown in the popup synchronized-site list.
   - Add locale/copy tests only if the repo already has equivalent checks.

## Validation Commands

Run at minimum:

```powershell
node --check browser-extension/popup.js
node --check browser-extension/background.js
npm run type-check
npm run lint
npm run docs:build
git diff --check
```

Run focused tests relevant to changed files, likely:

```powershell
npm test -- browser-extension
```

If the test runner does not accept that filter, use the repository's closest existing focused test command and report any limitation.

## Risk Areas

- Browser-extension service worker cannot directly manipulate the active page; picker start must go through a content script message.
- Popup closes when focus moves to the page, so Pick Download feedback inside popup may be brief or invisible. The page overlay instruction is the primary feedback.
- Desktop is the authority for synchronized site-session state. Do not infer synchronized sites only from extension-local registry cache.
- Do not display never-synchronized supported sites in the Login State drawer.
- Do not add `sidePanel` permission in this version.

## Rollback Points

- If picker refactor becomes risky, keep existing floating launcher logic intact and add a small message entry into the same content-script context.
- If synchronized-site summary requires too broad a desktop protocol change, ship the Login State drawer with current-tab sync only and keep the list empty-state explicit, after updating PRD/design with the narrowed scope.
- If docs build fails due unrelated site issues, capture the failure and still verify extension syntax and app checks.
