# Fix XHS Control Icon Position Before Playback Rate

## Goal
Ensure the FlowSelect cat download icon in Xiaohongshu xgplayer controls is rendered immediately to the left of the playback-rate button (`xg-playbackrate`) and remains visible/stable.

## Requirements
- Inject the XHS control button next to playback controls without breaking native xgplayer controls.
- Keep insertion idempotent under MutationObserver rerenders.
- Ensure visual position is stable even if xgplayer applies flex/order-based layout rules.
- Preserve fallback floating button behavior when control bar is unavailable.

## Acceptance Criteria
- [ ] On Xiaohongshu video pages, the cat icon appears on the left side of the `倍速` button.
- [ ] Icon remains visible after SPA navigation and player rerenders.
- [ ] No duplicate control buttons appear.
- [ ] Existing click-to-download behavior remains unchanged.

## Technical Notes
- Primary fix is expected in `browser-extension/xiaohongshu-detector.js` and/or `browser-extension/xiaohongshu-button.css`.
- Prefer robust insertion anchor near `xg-playbackrate` and explicit layout ordering if needed.
- Keep the change minimal and site-scoped to Xiaohongshu extension assets.
