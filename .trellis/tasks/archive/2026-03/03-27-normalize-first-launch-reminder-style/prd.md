# Normalize First-Launch Reminder Style

## Goal
Bring the main window's bottom-left startup/runtime reminder back in line with the current FlowSelect design system without changing its behavior.

## Requirements
- Identify the bottom-left reminder shown in the main window during first-launch/runtime dependency setup states.
- Keep the existing reminder logic, hover behavior, progress display, and retry affordance intact.
- Replace one-off loud warning panel styling with the shared compact FlowSelect surface language.
- Use semantic theme tokens and shared UI style helpers instead of hard-coded local surface recipes.
- Preserve readability and visual hierarchy in both black and white themes.

## Acceptance Criteria
- [ ] The bottom-left reminder looks visually consistent with the main window and settings surfaces.
- [ ] Warning color is used as status emphasis, not as the dominant panel chrome.
- [ ] Styling is built from semantic tokens and shared patterns already used elsewhere in the app.
- [ ] Existing runtime setup feedback still renders correctly for busy, warning, and success states.
- [ ] `npm run lint` and `npm run type-check` pass for the updated code.

## Technical Notes
- Likely implementation area: `src/App.tsx`
- Likely shared references: `src/components/ui/shared-styles.ts`, `src/components/ui/neon-hint.tsx`, `src/contexts/ThemeContext.tsx`
- Keep motion compact and consistent with `motion-guidelines.md`
