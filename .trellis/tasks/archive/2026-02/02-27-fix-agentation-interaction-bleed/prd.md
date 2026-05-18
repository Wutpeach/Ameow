# Fix agentation interaction bleed-through

## Goal
Ensure that when Agentation is active, clicks intended for annotation do not trigger underlying app interactions (especially native dropdown/select interactions in Settings).

## Requirements
- Block underlying interactive default behavior while Agentation capture mode is active.
- Preserve normal Agentation annotation creation behavior.
- Keep scope limited to Agentation integration wrapper.
- Avoid regressions for normal app behavior when Agentation is inactive.

## Acceptance Criteria
- [ ] In `/settings`, clicking the rename preset `<select>` while Agentation is active does not open/trigger the app dropdown.
- [ ] Annotation flow still works for interactive targets.
- [ ] No impact to normal interactions when Agentation is inactive.
- [ ] Type check and lint pass for touched frontend code.

## Technical Notes
- Root cause is event-timing mismatch: interaction-blocking in library may occur too late for some controls.
- Implement capture-phase guard in `src/components/AgentationDevTools.tsx` with strict target checks.
- Detect Agentation active capture mode via Agentation-injected style marker.
