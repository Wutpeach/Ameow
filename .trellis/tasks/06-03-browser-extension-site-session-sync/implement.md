# Implementation Plan

## Checklist

- [x] Read backend/frontend specs for site sessions, extension WebSocket contract, Settings state management, and browser-extension packaging.
- [x] Add a `SiteSessionManager` import/sync method that persists validated cookie records into the existing snapshot shape.
- [x] Add desktop command or controller route for Settings to start extension-backed sync for YouTube.
- [x] Add extension request/response bridge support for `site_session_cookie_sync_request`.
- [x] Add browser-extension cookie collection helper scoped to supported site cookie domains.
- [x] Add an extension-side supported-site whitelist and reject unsupported site IDs before cookie reads.
- [x] Rebuild `cookies`, `cookieHeader`, and `cookiesNetscape` on the desktop from filtered cookie records; do not trust a prebuilt extension string.
- [x] Include browser/profile/source metadata in the extension response and expose it in Settings state or sync feedback.
- [x] Implement first-successful-response handling for multiple connected extension clients; ignore later duplicate responses for the same request.
- [x] Update Settings action model/copy for YouTube sync and extension disconnected errors.
- [x] Hide or disable YouTube embedded Electron capture in the Settings UI for the MVP.
- [x] Preserve existing non-YouTube capture behavior.
- [x] Add tests for manager import, desktop payload validation, extension whitelist rejection, extension cookie filtering, multi-client first-response handling, and Settings routing.
- [ ] Run `npm run type-check`, `npm run lint`, and focused tests.

## Validation Commands

- `npm run type-check`
- `npm run lint`
- `npm run test -- electron/siteSessionManager.test.mts electron/siteSessionCommands.test.mts electron/extensionRequestBridge.test.mts`
- `npm run test -- browser-extension/extension-data-utils.test.js browser-extension/manifest.test.js`
- Additional tests added for new extension sync helpers.

## Rollback Points

- The import/sync method should be isolated from the existing Electron capture path.
- If extension sync proves unreliable, Settings can continue using existing non-YouTube capture flows while YouTube remains unsupported or falls back to documentation.
