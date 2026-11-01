# Convert Settings Language Buttons To Dropdown

## Goal
Replace the fixed two-button language switcher in the settings page with a dropdown-style selector that scales cleanly as more languages are added.

## Requirements
- Replace the current language button row with a compact dropdown control.
- Keep the existing language labels and language-change behavior.
- Use the existing FlowSelect settings field/dropdown visual pattern.
- Ensure the menu can be dismissed via outside click and Escape.

## Acceptance Criteria
- [ ] The language section uses a single dropdown trigger instead of side-by-side buttons.
- [ ] Selecting a language still calls the existing language-change flow.
- [ ] The current language remains visibly selected in the dropdown.
- [ ] The compact layout leaves room for future language additions.

## Technical Notes
Implement the dropdown in `src/pages/SettingsPage.tsx` by following the existing rename preset menu pattern and `NeonFieldButton` field-action styling.
