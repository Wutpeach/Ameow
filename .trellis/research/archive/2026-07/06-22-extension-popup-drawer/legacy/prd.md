# Add browser extension popup drawer

## Goal

Improve the browser extension popup by adding an Immersive Translate inspired compact action-button area and a popup-contained drawer for secondary controls that are too large for the current small popup surface.

The first planning decision is which action buttons should appear in the new button grid and which of them should open the drawer.

## Requirements

- Add a compact action-button area to the browser extension popup, visually aligned with Ameow's existing compact floating-surface design.
- Add a drawer/bottom-sheet interaction inside the popup for detailed controls that do not fit comfortably in the popup body.
- First-pass action grid is fixed as:
  - Download Settings.
  - Pick Download.
  - Login State.
  - Help Docs.
- Keep the current media scan, quality preference, login state, footer settings, and More menu behavior intact unless a planned button explicitly replaces or moves it.
- Use existing browser-extension message APIs where possible instead of inventing parallel settings flows.
- Keep copy localized through `browser-extension/locales/*/extension.json`.

## Confirmed Facts

- `D:\immersive-translate-1.30.2` is readable, but the JS is packaged/minified.
- Immersive Translate uses two relevant patterns:
  - popup action buttons via `styles/popup.css` `.widgets-container` and `.widget-item`.
  - popup-contained drawers via `.drawer-overlay` and `.drawer-panel`.
- Immersive Translate also has a Chrome MV3 native side panel using the `sidePanel` permission, `side-panel.html`, and `chrome.sidePanel.open`, but this is a larger compatibility and architecture step than a popup-contained drawer.
- Ameow's current extension popup is implemented in `browser-extension/popup.html`, `browser-extension/popup.css`, and `browser-extension/popup.js`.
- Ameow's current popup already includes:
  - media type tabs and scan results.
  - quality preference controls.
  - login state sync controls.
  - footer Settings and More controls.
- Ameow's background already exposes launcher-related messages such as `get_launcher_controls_state`, `set_launcher_enabled`, `set_launcher_side`, `reset_launcher_position`, `restore_hidden_site`, and `restore_all_hidden_sites`.
- Existing docs/site convention requires docs updates when user-facing browser-extension workflows change.

## Scope Direction

- Start with an in-popup drawer, not native Chrome `sidePanel`.
- Use the drawer for secondary browser-extension controls, especially existing launcher settings and hidden-site management.
- Treat native `sidePanel` as out of scope unless the button configuration discussion shows a clear need for a persistent browser side panel.

## Acceptance Criteria

- [x] Popup includes a compact action-button area with agreed button labels and behaviors.
- [x] At least one action opens a popup-contained drawer with keyboard and click-away dismissal.
- [x] Drawer content uses existing extension/background capabilities where available.
- [x] Existing popup media scan/download, login sync, quality preference, Settings, and More flows continue to work.
- [x] Chinese and English extension locale files include all new user-facing copy.
- [x] Relevant docs-site page is updated if the new popup workflow changes user-facing extension guidance.
- [x] Task-relevant tests or checks are run before implementation is reported complete.

## Button Behavior Direction

- Download Settings: opens the popup-contained drawer.
- Pick Download: starts the same page picker workflow as the existing floating launcher `拾取下载` button.
- Login State: likely performs current-site sync/enable directly while showing state in the button.
- Help Docs: likely opens the public docs-site browser-extension guide.

## Drawer Scope

- First version has popup-contained drawers opened from quick-action buttons.
- The Download Settings drawer contains only download quality selection.
- The Login State quick-action button opens a Login State drawer.
- Launcher/贴边入口 controls are not part of the first drawer version.

## Login State Drawer Direction

- Login State quick-action button opens a popup-contained drawer instead of performing sync directly.
- Drawer is an information-oriented browser-extension view, not a 1:1 clone of the desktop settings Site Sessions page.
- Drawer must not imply that the browser extension stores cookies itself or takes over the desktop app's download/session responsibilities.
- Drawer top area contains the current-tab sync entry point:
  - sync current supported site when available.
  - enable current site when it is eligible but not yet registered.
  - show offline / unavailable state when action cannot run.
- Drawer body shows an information list of sites the user has actively synchronized.
- The list is derived from registered/supported site-session entries, but only entries with a user-synchronized saved state should be visible.
- Registered/supported sites that have never been synchronized should not be shown in the popup list.
- Drawer body supports internal scrolling for the compact popup size.
- When there are no actively synchronized sites, show a compact empty state:
  - "No synchronized sites yet."
  - "Open a supported site, then sync login state above."
  - Keep copy short and avoid listing supported sites in the empty state.
- Card model should be compact and informational:
  - site icon / display name.
  - synchronized/ready status.
  - detail text such as last sync source or last sync time if available.
- The browser extension currently has current-tab site-session status and cached registry entries, but does not yet expose the full desktop-style registry + per-site state list to popup.
- This likely requires a technical design for a background/app data contract before implementation.
- The synchronized-site list must come from the desktop app's saved site-session state, not from extension-local registry inference.
- If the desktop app is offline, the drawer should show the current-tab offline state and an empty synchronized-sites list without hanging on a spinner.

## Layout Direction

- Main popup order:
  - current media picker/results area.
  - 2x2 quick-action button grid.
  - footer.
- Move the current standalone quality control panel into the Download Settings drawer.
- Replace the current standalone login-state panel with the Login State quick-action button.
- Keep the footer Settings/version/More structure unless implementation evidence shows it conflicts with the new grid.

## Pick Download Behavior

- The existing floating launcher `拾取下载` behavior is the source of truth.
- In `browser-extension/floating-launcher.js`, the launcher action starts a page overlay picker.
- The picker shows the localized instruction from `launcher.picker.instruction`.
- The user clicks page content to download; right-click or Escape cancels.
- After a target is clicked, the launcher builds a pick-download payload and submits it via `ameow_download_current_content`.
- The popup `拾取下载` action should expose this same behavior from a second entry point, not replace it with popup media-list refresh or direct one-click download.
- Implementation should add an explicit active-tab picker-start message path rather than duplicating picker UI in `popup.js`.

## Docs

- Update the public browser-extension docs page in both locales for the new quick-action area.
- Update cookies/login docs if needed to clarify that the extension sends synchronized login state to the desktop app and does not store or own the saved cookie snapshots.

## Open Questions

- None blocking. Planning artifacts should be reviewed before starting implementation.

## Out Of Scope

- Native Chrome `sidePanel` page unless explicitly added to scope.
- Rebuilding the whole popup layout.
- Changing desktop app WebSocket protocol unless an existing action requires it.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
