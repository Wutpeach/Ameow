# Fix YouTube missing injected player controls

## Goal
Restore the FlowSelect injected player-control buttons on YouTube without regressing the recent fix that waits for the control bar to become stable before injecting.

## Requirements
- Keep the YouTube control-bar injection gated on a renderable control bar so first-click download behavior stays stable.
- Remove the overly strict dependency on YouTube native controls having the `.ytp-button` class before FlowSelect can inject.
- Reuse existing extension-side control readiness helpers where that reduces site-specific logic and keeps the behavior aligned with Bilibili.
- Limit the fix to the YouTube extension surface; do not change Bilibili behavior.

## Acceptance Criteria
- [ ] FlowSelect buttons can be injected again on YouTube watch pages when the right-side player controls are present.
- [ ] The detector still waits for a visible, connected control bar instead of injecting into an incomplete player shell.
- [ ] Extension script validation passes for the touched files.
- [ ] Repo lint and type-check pass, or any unrelated failures are documented.

## Technical Notes
- The regression window points to the 2026-03-17 `fix(extension): stabilize first-click download trigger` change, which introduced `isControlBarReady()` and a `.ytp-button`-specific native-child check in `browser-extension/youtube-detector.js`.
- `browser-extension/control-style-utils.js` already provides a more generic renderable-control detection path used by Bilibili and is the preferred abstraction to reuse here.
