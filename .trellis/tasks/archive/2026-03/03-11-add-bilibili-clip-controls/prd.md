# Add Bilibili clip point controls

## Goal
Add IN/OUT clip point controls to the Bilibili injected player toolbar so Bilibili clip downloads follow the same interaction model as YouTube.

## Requirements
- Add dedicated IN and OUT buttons to the Bilibili player controls.
- Keep the primary Bilibili download button behavior aligned with YouTube:
  - normal click downloads the full video when no valid range is set
  - click downloads the selected clip when both IN and OUT are set and valid
- Reuse the existing `video_selected` clip payload fields without changing backend contracts.
- Preserve existing screenshot functionality and control bar spacing behavior.

## Acceptance Criteria
- [ ] Bilibili control bar shows IN and OUT buttons alongside the existing download and screenshot buttons.
- [ ] Clicking IN/OUT stores the current playback timestamp and updates button titles/selected state.
- [ ] Clicking the main Bilibili download button sends `clipStartSec` and `clipEndSec` only when both values are set and OUT is later than IN.
- [ ] Existing Bilibili screenshot and full-video download behavior still works.

## Technical Notes
Mirror the clip range state handling from `browser-extension/youtube-detector.js`, but adapt it to Bilibili's injected div-based control button structure and current spacing sync logic.
