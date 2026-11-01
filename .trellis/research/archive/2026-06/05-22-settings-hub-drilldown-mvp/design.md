# Settings hub drill-down MVP design

## Current State

`src/pages/SettingsPage.tsx` currently uses a fixed settings shell with a header, horizontal tab strip, and one scrollable tab panel. The tab ids are `general`, `downloads`, `plugins`, and `advanced`.

The existing page already owns all behavior and state needed for the settings surface. The redesign should preserve those handlers and move the navigation model from tabs to a hub/detail page state.

## UX Model

Use a two-level navigation model:

1. Hub page
   - Compact task destinations.
   - Each destination shows a title, summary, optional attention dot, and chevron.
   - The hub is the default page when settings opens.
2. Detail page
   - Uses the same shell and scrollable body.
   - Header shows a back button, detail title, and close button.
   - Content reuses the existing settings controls grouped by task.

This avoids fitting every control into the first viewport while preserving fast scanning of important state.

## Page Map

### Hub

Entries:

- `appearance`
  - title: Appearance & Launch
  - summary: current theme, language, shortcut status, startup state
- `saving`
  - title: Saving & Naming
  - summary: output folder leaf/truncated path, rename state, preset
- `sites`
  - title: Site Logins
  - summary: number of ready sessions, pending/error state, otherwise manual login hint
- `plugins`
  - title: Plugins & Integrations
  - summary: AE Portal state plus future integration hint
- `system`
  - title: System & Support
  - summary: app version, update/proxy/support state

### Detail Pages

- `appearance`: theme, language, shortcut, launch at startup
- `saving`: output folder, rename downloaded media controls
- `sites`: site login badges and session actions
- `plugins`: AE Portal and future integration list
- `system`: version/update, prerelease updates, proxy, support log, dev tools

## Visual Design

- Keep the existing `getWindowShellStyle`, `getWindowHeaderStyle`, and `getWindowBodyStyle`.
- Remove the horizontal tab strip from the rendered shell.
- Use field/card recipes from the existing design system rather than introducing a new palette.
- Hub rows should feel like compact destinations, not decorative cards:
  - height around 58-66px
  - title at 12px, semibold
  - summary at 10.5px, secondary
  - chevron as a quiet affordance
  - attention dot only for live/important state
- Detail pages should keep section labels small and secondary.
- Detail headers should keep the title next to the back affordance rather than centered, so Chinese and English labels have enough room beside the close control.
- The scrollable body must remain the pressure-release mechanism for expanded rename controls and site login actions; do not change the fixed window metrics to make content fit.
- Avoid nested cards where a simple field row is sufficient.
- Keep motion minimal; CSS hover transitions are enough for MVP.

## Technical Design

Replace tab state with page state:

```ts
type SettingsPageId = "hub" | "appearance" | "saving" | "sites" | "plugins" | "system";
```

Use `activePage` state initialized to `"hub"`.

Render logic:

- `renderHubPage()` for the landing page.
- `renderAppearancePage()`, `renderSavingPage()`, `renderSiteLoginsPage()`, `renderPluginsPage()`, `renderSystemPage()` for detail pages.
- `renderActivePage()` switches by `activePage`.

Header logic:

- Hub: title + close button.
- Detail: back icon button + title + close button.
- Back sets `activePage` to `"hub"`.

Localization:

- Add `desktop:settings.hub.*` keys for titles, summaries, and state labels.
- Keep existing setting-specific keys unless labels need to change.

## Compatibility

- No settings storage schema changes.
- No window size changes.
- No backend command changes.
- Existing settings handlers remain in place.

## Search Follow-Up

Add an inline search field on the hub page, above the destination list. Keep it compact and use the existing field surface language. Searching filters the same destination rows and swaps each matched row summary to a concise match hint. Clicking a filtered row opens the corresponding detail page. Do not add a modal, overlay, or backend search index for this pass.

## Risks

- Hub summaries can become misleading if they expose too much state. Keep them short and stateful, not explanatory.
- Site session actions are dense; moving them to a dedicated detail page should improve clarity, but the action row must still work when no active session exists.
- Header back/close layout must remain compact at 320px in both Chinese and English.
