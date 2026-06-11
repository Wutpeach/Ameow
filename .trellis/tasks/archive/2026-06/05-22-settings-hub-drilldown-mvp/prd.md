# Settings hub drill-down MVP

## Goal

Redesign the 320x400 desktop settings window from a tabbed settings panel into a compact hub + drill-down experience. The first screen should show task-oriented setting groups with concise current-state summaries; selecting a group opens a focused detail page that reuses the existing settings controls.

## Requirements

- Keep the settings window size unchanged at `320x400`.
- Replace the current top-level tab interaction with a settings hub landing screen.
- Hub entries must be task-oriented and scannable inside the small window:
  - Appearance & Launch
  - Saving & Naming
  - Site Logins
  - Plugins & Integrations
  - System & Support
- Each hub entry should show:
  - a clear title
  - a one-line status summary derived from current state
  - a subtle affordance for drill-down
  - an attention indicator only when useful, such as site login ready/error, update available, proxy error, or active integration
- Selecting a hub entry opens a detail page for that group.
- Detail pages must include an obvious back affordance and preserve the existing close-window action.
- Existing settings behavior must remain available:
  - theme
  - language
  - global shortcut recording
  - launch at startup
  - output folder selection
  - rename downloaded media settings
  - site login state capture/confirm/cancel/clear
  - AE Portal toggle and executable picker
  - app version/update controls
  - prerelease update preference
  - global proxy settings
  - support log export
  - dev-only UI Lab / injection debug controls
- The current release/version bump changes in the worktree are not part of this task and must not be reverted or bundled unintentionally.
- Search is a planned follow-up enhancement, not part of this MVP implementation.

## Acceptance Criteria

- [ ] The settings window opens to a hub screen rather than a tab strip.
- [ ] The hub fits naturally within the existing small window and remains usable without changing `SETTINGS_WINDOW_CONTENT_WIDTH` or `SETTINGS_WINDOW_CONTENT_HEIGHT`.
- [ ] Each hub item drills into a focused detail page with a back button.
- [ ] Detail pages preserve the behavior of all existing settings listed in Requirements.
- [ ] Detail pages remain usable when content expands, including rename controls and site login actions inside the fixed scrollable body.
- [ ] Detail page header layout keeps back, title, and close controls readable in both Chinese and English.
- [ ] Site login state is no longer grouped under a "Downloads" tab.
- [ ] Output folder and rename rules are grouped together under Saving & Naming.
- [ ] Plugins & Integrations remains a distinct destination for AE Portal and future plugin growth.
- [ ] System & Support contains update, proxy, support log, and dev-only tools.
- [ ] The design stays consistent with Ameow's compact, restrained, slightly neon product UI language.
- [ ] `npm run type-check` passes.

## Follow-Up

- Add a settings search/jump overlay after this MVP is reviewed and accepted.
- Search should navigate to matching detail pages or specific settings; it should not be required for the MVP.

## Follow-Up Acceptance Update

- User accepted the first-phase hub layout on 2026-05-22 and requested adding search in the remaining hub space.
- Add a compact search field at the top of the hub, above Appearance & Launch.
- Search should filter/jump to matching detail pages or setting groups without changing the fixed settings window size.
- Empty search should preserve the reviewed hub layout.

## Notes

- User explicitly approved the Hub + Drill-Down MVP direction and asked to review this version before deciding whether to add search.
- The task is a frontend interaction redesign; avoid backend behavior changes.
