# Xiaohongshu Explore Page Missing Cat Download Icon

## Goal
Fix the browser extension so Xiaohongshu note pages (especially `/explore/...`) reliably show the FlowSelect cat download icon in the video control bar.

## Requirements
- Ensure the cat download icon appears on Xiaohongshu video pages like:
  - `https://www.xiaohongshu.com/explore/...`
- Keep current behavior of using control-bar button first and floating button as fallback.
- Avoid duplicate icon injection during DOM mutations and SPA route changes.
- Keep click behavior unchanged (`video_selected` message payload still sent).

## Acceptance Criteria
- [ ] On target `/explore/...` pages with playable video, the control bar shows the cat icon button.
- [ ] Clicking the icon still triggers existing download message flow.
- [ ] If control bar is not found, floating fallback button still appears once.
- [ ] No duplicate buttons after scrolling/navigation within Xiaohongshu SPA pages.

## Technical Notes
- Investigate selector robustness in `ensureControlBarButton()` and anchor resolution logic.
- Validate compatibility with current `xiaohongshu-button.css` classes for control icon rendering.
- Keep changes scoped to browser extension Xiaohongshu detector/style unless broader injection issue is proven.
