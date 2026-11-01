# Inject Zhihu Player Download Button

## Goal
Support injecting a download button into Zhihu's video player control bar so users can trigger the existing Zhihu video download flow directly from the page.

## Requirements
- Detect Zhihu pages with an embedded or dedicated video player that correspond to supported downloadable Zhihu videos.
- Inject a visible download action into the player control bar without breaking existing Zhihu controls.
- Reuse the current Zhihu download pipeline instead of introducing a separate downloader path.
- Avoid duplicate button injection when the page rerenders or when navigating within Zhihu's SPA routes.

## Acceptance Criteria
- [ ] A Zhihu video page such as `https://www.zhihu.com/zvideo/1676141229933441024` shows a FlowSelect download button inside the player control bar.
- [ ] Clicking the injected button triggers the same extension-to-app flow already used for other supported sites and starts the existing Zhihu download behavior.
- [ ] The button survives Zhihu dynamic page updates without multiplying.
- [ ] Non-video Zhihu pages do not show the button.

## Technical Notes
- Likely touches browser-extension content/injection logic and may reuse existing background/WebSocket message paths.
- Zhihu uses client-side navigation, so mutation or route-change handling may be required.
- Prefer control-bar injection heuristics over floating fallback so the button stays inside the native player chrome.
