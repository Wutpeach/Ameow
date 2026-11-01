# Remove Pinterest Waterfall Card Download Button

## Goal
Remove the FlowSelect download button from Pinterest waterfall/feed cards because Pinterest cards can already be dragged directly, while keeping the FlowSelect download button on the Pinterest pin detail page.

## Requirements
- Do not inject or render the FlowSelect download button on Pinterest waterfall/feed cards.
- Keep the Pinterest pin detail page FlowSelect download button unchanged.
- Keep existing Pinterest drag-to-download behavior on cards unchanged.
- Avoid leaving unused card-only styling or detector code paths behind when they are no longer needed.

## Acceptance Criteria
- [ ] Pinterest waterfall/feed cards no longer show the cat download button.
- [ ] Pinterest pin detail pages still show the FlowSelect download button.
- [ ] Dragging Pinterest waterfall/feed cards still enriches drag payloads as before.
- [ ] Extension code and styles no longer keep dead card-button-only logic.

## Technical Notes
- Scope is limited to the Pinterest browser-extension injection code and related styles.
- This is a frontend/browser-extension task; no desktop runtime changes are expected.
