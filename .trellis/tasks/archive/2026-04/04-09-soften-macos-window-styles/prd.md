# Soften macOS icon mode and window shadow styling

## Goal
Refine the macOS desktop UI so icon mode and window shadow feel lighter and less visually heavy, without changing Windows/Linux styling or the main interaction model.

## Requirements
- Reduce the perceived visual weight of the macOS icon-mode presentation.
- Soften macOS window shadow treatment where current chrome feels too heavy.
- Keep the existing compact FlowSelect look and semantic token system.
- Scope the changes to macOS-specific behavior or styling where practical.

## Acceptance Criteria
- [ ] On macOS, icon mode feels lighter than before and remains visually centered/stable.
- [ ] On macOS, window shadow or related shell depth looks subtler than before.
- [ ] Non-macOS styling is unchanged unless a shared token adjustment is provably safe.
- [ ] `npm run type-check` and `npm run lint` pass, or failures are documented if unrelated.

## Technical Notes
- Prefer semantic tokens or existing shared shell style helpers over page-local literals.
- Verify any macOS-specific branch already used by the compact window shell before introducing new conditionals.
