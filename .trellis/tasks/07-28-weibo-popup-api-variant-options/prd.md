# Fix Weibo popup API variant options

## Goal

Fix the Weibo popup variant selector regression from `07-28-weibo-site-variant-parser`.

The browser extension popup should show multiple quality options for one Weibo video when the loaded page has already received multi-variant video metadata through page runtime API responses, even if those variants were not embedded in DOM `<script>` text.

## User Value

- Users can choose among detected Weibo video qualities from the popup instead of being limited to the currently playing rendition.
- The popup behavior matches the accepted product intent from the previous Weibo variant parser task.
- The fix stays low risk by observing data the page has already loaded and avoiding proactive Weibo API probing.

## Confirmed Facts

- `07-28-weibo-site-variant-parser` required grouped Weibo resources to expose a resource-scoped quality selector.
- `browser-extension/popup.js` already renders a row-level variant selector through `createVariantSelector(...)`, but only when `candidate.variants` contains more than one entry.
- `browser-extension/weibo-variant-parser.js` currently discovers variants from DOM `<script>` text through `parseDocumentVariants(...)`.
- Real Weibo pages may receive `playback_list` / `media_info` data through runtime `fetch` or `XMLHttpRequest` responses rather than static DOM script text.
- The previous tests simulate page-local script data, but they do not cover runtime API response bodies.
- The repository already has a page-bridge pattern for Xiaohongshu:
  - a document-start content script injects a web-accessible page script;
  - the page script observes page-owned `fetch` / `XMLHttpRequest` responses;
  - sanitized records are posted back to the content script and cached for later use.
- User confirmed this fix should stay limited to observing page requests already made by Weibo; it must not proactively call new Weibo APIs.

## Requirements

- Add a Weibo page-runtime observation path that can inspect already-requested Weibo JSON responses for video variant metadata.
- The observation path must run early enough to catch normal page API calls where feasible.
- The page-runtime script must be narrowly scoped to Weibo hosts.
- The page-runtime script must not issue proactive Weibo API requests.
- The page-runtime script must only publish bounded, sanitized variant records, not whole response bodies.
- Extend the Weibo parser to merge variants from:
  - existing DOM `<script>` extraction;
  - cached observed API response records.
- Preserve the existing fallback behavior when no variants are found.
- Keep the popup grouped-row contract unchanged: one logical Weibo resource with a compact row-level quality selector.
- Preserve selected-variant routing through `selectedVideoVariant`.
- Keep pasted Weibo link downloads unchanged; they should continue to use desktop page extraction and not depend on extension-side observed variants.
- Add focused tests for the runtime-response path and popup-visible variant selector behavior.

## Acceptance Criteria

- [x] A Weibo page whose DOM scripts do not expose variants can still produce a grouped popup candidate when an already-requested Weibo JSON response contains two or more video variants.
- [x] The popup grouped row shows a compact quality selector when the grouped Weibo candidate has more than one variant.
- [x] A direct media row whose URL belongs to a grouped Weibo candidate's `variants[]` is merged into the same logical popup row.
- [x] The highest detected quality remains selected by default.
- [x] Selecting a lower variant still updates copy/source/browser-fallback actions and the explicit `selectedVideoVariant` main-download payload.
- [x] The fix does not make proactive Weibo API requests.
- [x] The page bridge publishes only bounded sanitized variant metadata and direct variant URLs needed for downloads.
- [x] The page bridge is injected only on Weibo-related hosts and runs early enough to observe normal page API calls.
- [x] When Weibo API responses do not expose variants, existing generic scan/current-page fallback behavior remains unchanged.
- [x] Weibo detail pages only include variants for the current status id/canonical page URL; recommendation/sidebar videos and unscoped observed URLs are not added to the current video's quality list.
- [x] Tests cover:
  - DOM-script-only variants;
  - API-response-only variants;
  - no-variant fallback;
  - popup selector rendering from a grouped candidate;
  - selected-variant routing remains explicit.
- [x] No public docs update is required unless the visible popup wording changes.

## Out Of Scope

- Proactive Weibo API probing.
- Browser-to-desktop launch, native messaging, or deep-link behavior.
- Replacing desktop gallery-dl Weibo page extraction.
- Adding variant parsers for non-Weibo sites.
- Guaranteeing variants when Weibo neither embeds nor requests variant metadata visible to the loaded page session.

## Open Questions

- None blocking planning. The user confirmed the non-proactive observation scope.

## Notes

- This task is a follow-up fix for `.trellis/tasks/archive/2026-07/07-28-weibo-site-variant-parser`.
