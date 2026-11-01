# Add clip point clear interaction

## Goal
Add a dedicated cancel/clear interaction for existing IN/OUT clip point selection in injected YouTube and Bilibili player controls.

## What I already know
- YouTube and Bilibili already support setting IN/OUT points and clip downloads.
- Current implementation only supports set/overwrite; there is no clear interaction.
- Product direction decided in brainstorming:
  - use right-click to clear
  - clear only the current point
  - expose the interaction through selected-state button titles

## Requirements
- Support right-click clear on selected IN/OUT buttons for both YouTube and Bilibili.
- Right-clicking IN clears only IN; right-clicking OUT clears only OUT.
- Clearing one point must immediately exit clip-ready state on the main download button.
- Selected-state titles should mention the right-click clear affordance.

## Acceptance Criteria
- [ ] Selected IN can be cleared via right-click without clearing OUT.
- [ ] Selected OUT can be cleared via right-click without clearing IN.
- [ ] Main download button exits clip-ready state when either point is cleared.
- [ ] Title copy reflects the right-click clear interaction only when relevant.

## Out of Scope
- No injected player control i18n work
- No dedicated reset button
- No touch/long-press clear interaction

## Technical Notes
- Likely touch points: `browser-extension/youtube-detector.js`, `browser-extension/bilibili-detector.js`
- Keep backend clip payload contract unchanged.
