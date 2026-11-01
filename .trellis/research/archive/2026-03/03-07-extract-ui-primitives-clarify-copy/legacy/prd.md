# Extract shared UI primitives and clarify status copy

## Goal

Implement the first concrete slice of the second-round UI optimization by extracting reusable desktop UI primitives, applying them to the Settings window, clarifying a small set of status/help copy, and extending the Trellis frontend design-system guidance.

## Requirements

- Extract clearly reusable settings/window surface patterns into shared UI primitives under `src/components/ui/`.
- Reuse semantic theme tokens instead of leaving the extracted surface recipes as page-local style objects.
- Migrate the most repetitive Settings window sections to the new primitives without changing product behavior.
- Clarify a small set of user-facing status/help copy where wording is currently too engineering-oriented or inconsistent.
- Extend `.trellis/spec/frontend/design-system.md` with the new shared patterns and second-round systemization guidance.

## Acceptance Criteria

- [ ] Settings page no longer keeps the extracted section/card/field helper styles only as local page variables.
- [ ] New shared primitives are used by at least the Settings page sections touched in this task.
- [ ] Clarified copy remains concise and action-oriented.
- [ ] `npm run lint` and `npm run typecheck` pass.

## Technical Approach

- Create a small first batch of reusable primitives instead of a broad refactor:
  - settings section container/title/hint
  - field-like action row surface
  - compact inline hint/status text
- Apply the primitives to the most repeated Settings patterns first.
- Keep extension and main window behavior unchanged unless the extracted patterns can be adopted safely in the same pass.

## Out of Scope

- Reworking the main window layout hierarchy
- Broad extension UI restyling
- Large animation changes
- New theme direction or token palette redesign

## Technical Notes

- Current repetition is concentrated in `src/pages/SettingsPage.tsx`, which still contains many page-local visual recipes (`sectionLabelStyle`, `fieldSurfaceStyle`, `panelCardStyle`, `subtleHintStyle`).
- Existing design-system source of truth is `.trellis/spec/frontend/design-system.md`.
- Existing shared UI directory already contains `neon-button`, `neon-toggle`, `neon-input`, and `neon-card`, so the new primitives should align with that structure instead of creating a parallel system.
