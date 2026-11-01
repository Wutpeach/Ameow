# Cross-surface UI deepen for floating window and browser extension

## Goal

Deepen the visual quality of the desktop floating window and the browser extension without changing FlowSelect's core style. Extend the design system so desktop and extension surfaces feel like the same product.

## Requirements

- Keep the existing compact gradient-based visual direction.
- Introduce shared extension-side visual primitives for popup, injected controls, screenshot panels, and overlay actions.
- Improve popup hierarchy and connection-state clarity.
- Reduce repeated one-off CSS across site-specific extension styles.
- Apply a second polish pass to the floating window queue and utility-panel details.
- Update frontend design-system documentation to include browser extension surfaces.

## Acceptance Criteria

- [ ] Browser extension popup uses the same semantic surface/state language as the desktop app.
- [ ] Shared extension CSS handles screenshot panels and common injected-control states across supported sites.
- [ ] Site-specific CSS keeps only necessary accent/size/layout overrides.
- [ ] Floating window queue surfaces and utility controls receive a consistency-focused polish pass without changing behavior.
- [ ] Frontend spec documents extension popup and injected-control patterns.
- [ ] `npm run lint`, `npm run build`, and targeted extension syntax checks pass.

## Technical Notes

- Primary areas:
  - `browser-extension/popup.html`
  - `browser-extension/*.css`
  - `browser-extension/popup.js`
  - `src/App.tsx`
  - `.trellis/spec/frontend/design-system.md`
- Preserve existing theme sync for the popup; do not add new runtime theme contracts unless necessary.
- Prefer shared CSS + site-specific overrides over detector rewrites.
