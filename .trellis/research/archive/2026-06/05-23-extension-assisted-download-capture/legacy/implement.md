# Browser Extension Download Experience MVP Implementation Plan

## Scope Boundary

Implement Phase 1 MVP only. After MVP is implemented and verified, pause for user testing/review before starting post-MVP features.

MVP includes:

- Shadow DOM floating launcher with three actions: Pick Download, Download Current Content, More.
- More menu: Hide on this site, Switch left/right side.
- Popup remains global status/preference/recovery surface.
- Popup launcher availability ping and conditional fallback download when launcher is unavailable.
- Small `extensionData.ameowCapture` evidence payload.
- Extension/background/desktop queue preservation of unknown `extensionData` keys.
- Provider-owned Douyin source synthesis from low-cost evidence, especially `modal_id`.

MVP excludes:

- Full-page media candidate list.
- Context-menu/right-click as a product path.
- Removing existing injected buttons.
- Quality hover flyout.
- Drag-to-reposition.
- Lock button.
- Active media inference.
- Nearby DOM media crawling.
- Full mobile/touch/full keyboard support.

## Implementation Order

1. Preserve extension evidence through existing queues.
   - Update `browser-extension/background.js` media selection normalization to pass through unknown `extensionData` keys while still normalizing known `youtube` fields.
   - Update `src/electron-runtime/commandRouter.ts` queue normalization to preserve unknown `extensionData` keys.
   - Add focused tests proving `extensionData.ameowCapture` survives the queue path.

2. Define the MVP evidence contract in code.
   - Add or reuse a shared TypeScript type/schema for `extensionData.ameowCapture` where it can be validated without over-coupling the extension bundle to desktop internals.
   - Keep fields limited to:
     - `version`
     - `action`
     - `pageUrl`
     - `canonicalUrl`
     - `ogUrl`
     - `title`
     - `contentIds`
     - `targetHref`
     - `targetSrc`
   - Do not add `capturedMediaUrls` in MVP.

3. Verify downloader-accepted source shapes for MVP sites.
   - Use the pinned managed downloader versions, not upstream latest, as the authority:
     - `yt-dlp==2026.03.17`
     - `gallery-dl==1.32.1`
     - `douyin-downloader` git ref `5144bd3dec91cd2711cfdccbf36c10af17eb93fc`
   - For each MVP provider rule, record the accepted source shape in the provider test or nearby source comment.
   - Prefer executable probes or smoke checks over README-only assumptions when a downloader can be run safely.
   - For huge generic engines such as `yt-dlp` and `gallery-dl`, do not audit all supported sites. Verify only the prioritized site/source shapes used by Ameow providers.

4. Implement provider-owned Douyin source selection.
   - Update `src/sites/douyin.ts` to read `extensionData.ameowCapture.contentIds.modal_id`.
   - If the managed `douyin-dl` accepted source shape is confirmed as `/video/{id}`, synthesize `https://www.douyin.com/video/{id}` inside the provider only.
   - Preserve fallback to current `input.pageUrl ?? input.url` behavior.
   - Add provider tests for the `jingxuan?modal_id=...` scenario and fallback behavior.

5. Build generic capture helpers for the extension.
   - Current-content capture:
     - current tab/page URL;
     - title;
     - canonical URL;
     - Open Graph URL;
     - route/query/path IDs from low-cost parsing.
   - Picker capture:
     - direct clicked element `href` / `src`;
     - same page metadata and low-cost ID extraction.
   - Do not crawl nearby media or inspect active players in MVP.

6. Add the Shadow DOM floating launcher.
   - Mount in content script.
   - Default side: right.
   - Config stored in `chrome.storage.local`:
     - enabled;
     - side;
     - vertical position;
     - disabled site patterns.
   - Collapsed edge handle shows desktop connection state.
   - Hover expansion shows icon-first Pick, Download, More actions.
   - Use local inline SVG icons following the existing lucide-like style; do not add `lucide-react`.

7. Implement launcher actions.
   - Download Current Content:
     - build `ameowCapture` with `action: "current_content"`;
     - send through existing background/desktop queue path.
   - Pick Download:
     - enter mouse-first element selection mode;
     - outline target region;
     - click submits one evidence payload with `action: "pick_download"`;
     - no candidate list.
   - More:
     - Hide on this site;
     - Switch left/right side.

8. Update toolbar popup responsibilities.
   - Keep connection status and quality preference.
   - Add launcher state/recovery controls.
   - Add active-tab ping:
     - request: `{ type: "ameow_launcher_ping", requestId }`
     - response: mounted/visible/hiddenForSite/side/version.
   - Show current-page fallback only when launcher is unavailable or disabled for the current site.

9. Clean up only what belongs to MVP.
   - Do not remove context-menu code in MVP.
   - Do not remove old injected buttons in MVP.
   - Avoid unrelated visual or backend refactors.

## Validation Plan

Required checks:

- Unit tests for `commandRouter.ts` preserving unknown `extensionData.*`.
- Extension/background tests, if existing test infrastructure supports them, for preserving `extensionData.ameowCapture`.
- Provider tests for Douyin:
  - `jingxuan?modal_id=...` evidence produces provider-owned `/video/{id}` source URL.
  - no evidence preserves existing fallback behavior.
- Generic provider test proving unrecognized `ameowCapture` does not break fallback routing.
- Manual browser-extension checks:
  - launcher appears on normal pages;
  - hover expansion works;
  - Hide on this site and restore from popup work;
  - Switch left/right side persists;
  - popup fallback appears only when launcher cannot respond;
  - Download Current Content queues a request;
  - Pick Download queues a request from the clicked target.

Recommended commands before MVP review:

```powershell
npm run type-check
npm run lint
npm test -- --run
```

If extension-specific automated tests are missing or impractical, document the manual test matrix and results in the task before review.

## Risk Files

- `browser-extension/background.js`
- `browser-extension/popup.html`
- `browser-extension/popup.css`
- `browser-extension/popup.js`
- New browser-extension content script files for launcher/picker/capture helpers
- `browser-extension/manifest.json`
- `src/electron-runtime/commandRouter.ts`
- `src/sites/douyin.ts`
- `src/sites/providers.test.ts`
- Relevant command-router tests

## Rollback / Safety Notes

- Evidence pass-through should be backward compatible because unknown `extensionData` keys are already allowed by schemas.
- Provider synthesis should be site-scoped to Douyin and guarded by evidence presence.
- Existing injected buttons and context-menu code remain untouched during MVP to reduce rollback risk.
- Floating launcher can be disabled per site and globally through stored config/recovery controls.

## Review Gate

Before starting implementation:

- User reviews `prd.md`, `design.md`, and this `implement.md`.
- If approved, move the Trellis task from planning to active implementation.

After MVP implementation:

- Stop and hand off for user real-world testing.
- Do not start post-MVP items until the user explicitly approves continuing.
