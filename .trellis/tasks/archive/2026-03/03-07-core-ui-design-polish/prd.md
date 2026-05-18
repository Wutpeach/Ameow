# Core UI design review, polish, and spec consolidation

## Goal

Preserve FlowSelect's current visual identity while improving consistency, readability, and interaction quality across the core UI surfaces. Capture the resulting patterns as reusable design-system guidance inside the existing frontend spec.

## Requirements

- Audit the main floating window, Settings window, and context menu before making stylistic changes.
- Keep the current compact neon-gradient language instead of redesigning the product.
- Reduce duplicated hard-coded visual values in shared UI and core pages.
- Improve interaction clarity for selected, hover, loading, danger, and muted utility states.
- Add or update semantic tokens in `ThemeContext` where repeated visual meanings already exist.
- Keep frontend runtime behavior intact; this work is visual/systematic, not functional redesign.
- Add spec documentation for the new design-system baseline.

## Acceptance Criteria

- [ ] Core shared controls use semantic theme tokens instead of repeated raw accent/danger values.
- [ ] Settings page reuses a smaller set of field/option/section patterns and no longer spreads repeated hard-coded accent colors.
- [ ] Main window utility controls no longer rely on direct DOM style mutations for hover feedback.
- [ ] Context menu styling aligns with the same surface and hover language as the rest of the app.
- [ ] Frontend spec includes a design-system document for current FlowSelect UI conventions.
- [ ] A design audit artifact exists for this task with prioritized findings and rationale.
- [ ] `npm run lint` and `npm run build` pass.

## Technical Approach

- Extend `ThemeContext` with semantic field, accent, danger, utility-control, and panel-shadow tokens.
- Refactor shared UI primitives first, then consume the same token language in Settings and the main window.
- Replace small direct-manipulation hover effects with state-driven styling where appropriate.
- Record the baseline audit separately, then preserve the resulting rules in `.trellis/spec/frontend/design-system.md`.

## Out of Scope

- Reworking product IA or settings information architecture
- Redesigning the floating main window
- Cleaning up inactive/demo UI outside the chosen core surfaces
- Backend command, event, or scheduler behavior changes
