# Settings hub drill-down MVP implementation plan

## Scope

Implement the reviewed Hub + Drill-Down MVP for `src/pages/SettingsPage.tsx` and the required localization/icon support. Do not implement search in this task.

## Steps

1. Preserve existing dirty work
   - Keep current version bump/release-note changes untouched.
   - Keep the small icon additions made for this task and use them in the redesigned navigation.

2. Update navigation model
   - Replace `SettingsTab` with `SettingsPageId`.
   - Remove `activeTab`, `hoveredSettingsTab`, `settingsTabs`, `settingsTabChromeStyle`, and `getSettingsTabStyle`.
   - Add `activePage` and optional hover state for hub destinations.

3. Add hub rendering
   - Create hub destination metadata from current runtime state.
   - Render compact destination rows using existing theme tokens and shared style helpers.
   - Include one-line summaries and quiet attention dots where useful.

4. Split detail pages
   - Rename/refactor existing render functions:
     - `renderGeneralTab` -> `renderAppearancePage`
   - `renderDownloadsTab` -> split into `renderSavingPage` and `renderSiteLoginsPage`; do this first among the detail splits because it removes the main category mismatch
     - `renderPluginsTab` -> `renderPluginsPage`
     - `renderAdvancedTab` -> `renderSystemPage`
   - Reduce duplicate heading inside the rename toggle section.
   - Tighten Plugins intro so it no longer dominates the page.

5. Update shell header
   - Hub header: Settings title + close.
   - Detail header: back button + page title + close.
   - Ensure drag/no-drag regions remain correct.

6. Add localization
   - Add `settings.hub` keys to `locales/en/desktop.json` and `locales/zh-CN/desktop.json`.
   - Keep copy concise so it fits the small window.

7. Validate
   - Run `npm run type-check`.
   - Inspect `git diff` for unrelated changes.
   - Confirm no window metric constants changed.
   - Review expanded rename and site login pages for scrollability inside the fixed settings body.

## Validation Commands

```bash
npm run type-check
```

## Out Of Scope

- Window size changes.
- Backend command or config schema changes.
- Broad design-system extraction beyond small helpers needed inside the settings page.

## Follow-Up Search

User accepted the first-phase MVP and requested search in the hub. Implement a compact inline search field above the hub destinations:

- Empty query shows all reviewed hub destinations unchanged.
- Non-empty query filters destination rows by page title, summary, and setting labels.
- Matched rows show a concise match hint in the summary line.
- Clicking a result opens the matching detail page.
- Do not add an overlay, backend command, storage schema, or window size change.
