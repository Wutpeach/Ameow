# Optimize outer shadow style

## Goal
Align FlowSelect's reusable outer shadow treatment with the new multi-layer reference shadow while keeping the change scoped to shared frontend surface styles.

## Requirements
- Update the shared outer shadow tokens used by reusable panel surfaces.
- Keep transparent desktop window shell behavior unchanged unless the existing shared token flow already applies.
- Avoid introducing page-local duplicated shadow literals when an existing token can express the style.

## Acceptance Criteria
- [ ] Core reusable panel surfaces use the new multi-layer outer shadow recipe.
- [ ] The change is implemented through shared theme tokens or shared style helpers.
- [ ] Frontend validation relevant to the touched files passes.

## Technical Notes
- Use `ThemeContext` semantic tokens as the source of truth for panel elevation.
- Preserve existing inset borders/highlights that are handled in shared helpers.
