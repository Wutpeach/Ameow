# Style System Consolidation

## Goal
Consolidate the desktop renderer style system so the UI is easier to maintain and more stable across development, portable, installer, Windows, and macOS builds.

## Requirements
- Keep the renderer on the existing React DOM + Tailwind + CSS path. Do not introduce React Native.
- Establish a clearer single source of truth for semantic theme values.
- Reduce page-local inline style duplication for shared window shells and shared surface patterns.
- Preserve current visual direction and packaged `file://` safety.
- Improve consistency for the main shared desktop windows and supporting UI primitives without rewriting unrelated product behavior.

## Acceptance Criteria
- [ ] Theme tokens are exposed through a more reusable styling layer that can be consumed consistently by components and pages.
- [ ] Shared window shell styling is extracted so settings, context menu, and UI lab pages do not each hand-roll their outer panel structure.
- [ ] At least one high-duplication settings/UI area is refactored to use shared styling primitives instead of repeated page-local inline objects.
- [ ] Existing renderer build behavior remains compatible with packaged desktop builds.
- [ ] Typecheck passes after the refactor.

## Technical Notes
- Focus the first pass on `ThemeContext`, `src/index.css`, shared UI style helpers, and the window-shell-heavy pages.
- Prefer semantic tokens and shared helpers over raw literals.
- Keep dynamic inline styles only where runtime state meaningfully changes the rendered values.
