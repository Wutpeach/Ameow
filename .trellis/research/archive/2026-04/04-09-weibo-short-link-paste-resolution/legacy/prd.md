# Generic Short Link Expansion Before Video Forwarding

## Goal
Expand short-link-style video selection URLs inside the browser extension background before forwarding them to FlowSelect, so site providers receive stable real URLs instead of unresolved redirect shells.

## Requirements
- Add a shared short-link expansion layer in the extension background `video_selection` path.
- Support known short-link hosts such as Weibo `t.cn` and keep the helper generic enough for other sites that use redirect short URLs.
- Prefer lightweight redirect resolution first, then fall back to a hidden background tab when a network redirect alone cannot reveal the final URL.
- Preserve existing provider/runtime behavior when the URL is already stable or when expansion fails.

## Acceptance Criteria
- [ ] A `video_selection` request carrying a supported short link is expanded to the final URL before it is sent to FlowSelect.
- [ ] If redirect-following fetch cannot expose the final URL, the extension can fall back to a hidden tab resolution path.
- [ ] Existing extension URL routing helpers and related browser-extension tests continue to pass.

## Technical Notes
- Keep the change in the extension background layer instead of adding provider-specific desktop logic.
- Add a standalone helper with focused unit tests so short-link host coverage can expand without bloating `background.js`.
