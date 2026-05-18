# Fix Bilibili controls injected before native controller ready

## Goal
Prevent FlowSelect's Bilibili download and screenshot buttons from appearing in the player area before Bilibili's native control bar has fully rendered.

## Requirements
- Detect Bilibili control container as before, but only inject custom controls when the control bar is renderable and native controls are ready.
- Keep current behavior after controls are ready (buttons injected once, URL-change reset still works).
- Avoid introducing visual regressions for old/new Bilibili player variants.

## Acceptance Criteria
- [ ] On initial page load (before Bilibili native controls appear), FlowSelect buttons do not appear in the player area.
- [ ] Once native controls render, FlowSelect screenshot and download buttons appear in the correct right-controls area.
- [ ] Route changes within Bilibili player pages still re-detect and inject buttons correctly.

## Technical Notes
Use a render-readiness gate in `browser-extension/bilibili-detector.js` (visibility + size + native button class presence) before marking the control container as processed.
