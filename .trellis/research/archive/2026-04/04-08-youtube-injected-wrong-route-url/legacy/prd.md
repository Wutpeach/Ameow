# Fix YouTube injected download wrong route URL

## Goal
Fix the injected YouTube download flow so clicking the FlowSelect button always queues the intended YouTube URL instead of being overridden by unrelated page context.

## Requirements
- Preserve the explicit injected `url` as the primary route URL when the content script provides one.
- Keep `pageUrl` as page/referrer context, not as the primary download route.
- Guard against mismatched cross-site `pageUrl` values polluting injected download requests.
- Add regression coverage for the route/page URL resolution used by the extension background bridge.

## Acceptance Criteria
- [ ] Clicking the YouTube injected download button queues a YouTube URL instead of an unrelated site URL.
- [ ] Pasted YouTube links continue to download normally.
- [ ] Background request normalization prefers the injected route URL over page context.
- [ ] Automated regression coverage exists for mismatched `url` / `pageUrl` handling.

## Technical Notes
- Affected layers: `browser-extension/background.js`, extension-to-Electron video selection bridge, and tests.
- The issue reproduces only for injected button flows; pasted links already work, which points to payload forwarding rather than provider routing.
