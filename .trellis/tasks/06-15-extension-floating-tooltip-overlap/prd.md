# Fix browser extension floating tooltip overlap

## Goal

Fix the browser extension edge-attached floating launcher tooltip so it remains readable when adjacent hide and lock controls are visible, and update the primary launcher tooltip copy to Chinese wording requested by the user.

## Requirements

- The floating launcher's hover tooltip for the main handle must not be visually covered by the adjacent hide (`eyeOff`) or lock controls when the launcher is expanded or focused.
- The main handle tooltip copy must be exactly `下载当前内容`.
- Keep the change scoped to the browser extension floating launcher implementation.

## Acceptance Criteria

- [x] Hovering the main launcher handle shows a tooltip that renders above the hide and lock controls on both left- and right-edge placement.
- [x] The main handle tooltip is exactly `下载当前内容`.
- [x] Existing launcher controls remain clickable and visible when the launcher is hovered/focused.
- [x] Relevant validation commands pass or any inability to run them is documented.

## Validation

- `npm run locales:sync`
- `npm run lint`
- `npm run type-check`
- `npm run test`

## Out of Scope

- Redesigning the launcher control layout.
- Changing download behavior or supported-site detection.
- Updating public docs, because this is a small copy/visual bug fix and does not change user workflow.
