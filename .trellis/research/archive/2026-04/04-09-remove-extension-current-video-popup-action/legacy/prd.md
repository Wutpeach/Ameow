# Remove Browser Extension Current-Video Popup Action

## Goal
Remove the browser extension popup action labeled "下载当前视频" / "Download current video" because the project already has enough download entry points and this popup action adds redundant surface area.

## Requirements
- Remove the current-video action button from the browser extension popup UI.
- Remove popup-only logic that exists solely to support that action.
- Remove source locale entries that are only used by the popup current-video action.
- Keep the browser extension context-menu download flow unchanged.
- Keep site-specific injected download controls unchanged.

## Acceptance Criteria
- [ ] The browser extension popup no longer renders the current-video download button or its hint text.
- [ ] No popup code still sends the `download_current_video` action from the popup.
- [ ] Locale source files no longer contain unused popup current-video strings.
- [ ] Existing non-popup download flows remain intact.

## Technical Notes
- Scope this change to the browser extension popup and related localization only.
- Do not remove the background handler or routing used by context-menu download unless it becomes demonstrably unused in this change.
