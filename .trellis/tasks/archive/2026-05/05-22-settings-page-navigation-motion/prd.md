# Add settings page navigation motion

## Goal

Make settings page hub-to-detail navigation feel more spatial and polished by adding compact, state-clarifying motion when users enter or leave a settings detail page.

The motion should reinforce the redesigned hub drill-down model without making the compact settings window feel decorative, slow, or busy.

## Confirmed Facts

- `src/pages/SettingsPage.tsx` currently uses `activePage` state for the settings hub and detail pages.
- Hub destination buttons call `setActivePage(destination.id)`; the detail header back button calls `setActivePage("hub")`.
- The active page content currently renders as a static container with `id`, `role`, and `aria-label` derived from `activePage`.
- Hub destination buttons already have CSS transitions for background, border, shadow, and color.
- Project motion guidelines require `motion/react` instead of `framer-motion`.
- Project motion guidelines prefer CSS transitions for hover/focus/pressed states, and `motion/react` for mutually exclusive UI state switching.
- Product design context calls for compact, intentional, utility-first motion that clarifies state instead of adding ceremony.

## Requirements

- Add a compact transition when the settings page switches between hub and detail pages.
- Use motion only at the active page content boundary; do not animate the whole settings window shell.
- Preserve the existing hub button hover/focus vocabulary and avoid adding extra decorative button choreography unless needed for state clarity.
- Direction should communicate drill-down navigation:
  - hub to detail reads as moving forward into a page.
  - detail to hub reads as returning to the hub.
- Respect reduced-motion users by disabling or substantially reducing positional motion when the OS preference requests reduced motion.
- Preserve accessibility semantics for the active page container, including `id`, `role`, and `aria-label`.
- Clear stale hub hover state when navigating so returning to the hub does not leave a destination visually stuck as hovered.

## Acceptance Criteria

- [ ] Clicking each hub destination transitions to the corresponding detail page with a subtle, fast content animation.
- [ ] Clicking the detail back button returns to the hub with the opposite navigation direction.
- [ ] Reduced-motion preference removes visible slide motion.
- [ ] Active page accessibility attributes remain correct for hub and detail pages.
- [ ] Returning to the hub after clicking a hovered destination does not leave that destination stuck in hover styling.
- [ ] Existing settings controls remain usable during and after navigation.
- [ ] The implementation uses `motion/react` and does not add imports from `framer-motion`.
- [ ] The change passes the task-relevant frontend validation commands.

## Out of Scope

- Redesigning the settings layout beyond navigation motion.
- Adding page-load choreography for the full settings window.
- Adding decorative staggered animations to every control inside a settings page.
- Changing settings copy, data flow, persistence, or backend behavior.

## Open Questions

- None currently blocking planning. The agreed direction is compact page-boundary navigation motion with reduced-motion support.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
