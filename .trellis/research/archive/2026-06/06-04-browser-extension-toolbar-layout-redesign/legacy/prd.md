# Redesign browser extension toolbar layout

## Goal

Refactor the browser extension toolbar popup into a compact quick-action media panel. The popup should open directly into the advanced media browser, keep only the shortcuts that affect the current page workflow, and move broader configuration or informational surfaces to the extension settings page.

The redesign should make the toolbar feel precise, small, and polished. It should reduce duplicate navigation, avoid exposing low-value settings in the popup, and reserve most of the vertical space for current-page media browsing.

## Confirmed Facts

- The current popup renders a context card, a login state panel, the media browser, compact controls, and a footer in `browser-extension/popup.html`.
- The current login state panel sits above the media browser and uses a prominent card treatment.
- The current compact controls include quality preferences and a launcher summary.
- The existing footer already uses a three-part structure with settings on the left, version centered, and more actions on the right.
- An earlier popup design note placed settings sections below the media browser, but it included launcher controls and a persistent header connection status. This task supersedes those layout choices for the toolbar quick panel.

## Requirements

- The toolbar popup must not show an `Ameow` title.
- The toolbar popup must not show a persistent site title such as `youtube.com`; the active page is already implicit from browser context.
- The media browser must be the primary body of the popup and must be visible immediately when the toolbar opens.
- The popup must not add a separate "open media browser" button.
- The media browser toolbar should include the media type segmented control for `Video`, `Audio`, and `Image`.
- The refresh action, if present, must mean "rescan current page media" only.
- The refresh action must not be visually grouped with desktop connection status in a way that implies it reconnects the desktop app.
- The popup must not show a `Download current page` action. Primary download entry points belong to the in-page launcher/floating window.
- The toolbar popup must not show launcher visibility/status controls. Launcher and hidden-site configuration belong in the extension settings page.
- Quality preference must remain available as a compact shortcut below the media browser.
- Login state sync must remain available as a compact shortcut below the media browser.
- Login state must use a stable always-present row to avoid layout jumps.
- Login state must support unavailable/unsupported sites with a disabled visual state.
- Login state must not use a large warning or accent card treatment in the normal toolbar layout.
- The footer must remain compact.
- The footer must keep the version number centered.
- In the normal connected state, the footer left side should remain the settings entry and the footer right side should remain more actions.
- Desktop connection status should be hidden during the normal connected state.
- Desktop connection status should appear only for abnormal states such as connecting or offline.
- When desktop connection status appears, it should use the footer left area and avoid crowding the centered version number.
- When abnormal desktop connection status appears, it replaces the visible footer-left settings label, but the footer-left element must remain clickable and open settings or connection help.
- Detailed settings, launcher controls, hidden-site management, and broader status information should be reachable from the settings page or more menu, not exposed directly in the toolbar.

## Acceptance Criteria

- [ ] Opening the toolbar shows the media browser directly, without an extra media-browser launch button.
- [ ] The popup no longer displays an `Ameow` title or persistent current-site title.
- [ ] The media type segmented control and media list/empty/scanning states remain available.
- [ ] The rescan control is labeled/accessibly described as rescanning current page media.
- [ ] The popup no longer displays `Download current page`.
- [ ] Launcher visibility and hidden-site shortcuts are removed from the toolbar popup and remain reachable through settings.
- [ ] Quality is presented as a compact shortcut below the media browser.
- [ ] Login state is presented as a compact always-present shortcut below the media browser.
- [ ] Unsupported or unavailable login sync states are shown with a disabled action without changing row height or causing layout jumps.
- [ ] Normal connected state does not show a persistent connection status.
- [ ] Offline or connecting states show a compact footer-left status indicator while the version remains centered.
- [ ] Offline or connecting footer state visually replaces the settings label while still opening settings or connection help when clicked.
- [ ] The footer remains compact and preserves the left/action, centered-version, right/more structure.
- [ ] The layout keeps Ameow's existing compact surface language, restrained accent usage, and black/white theme compatibility.
- [ ] Existing media row actions, media scanning behavior, quality persistence, login sync behavior, and settings page access continue to work.

## Out Of Scope

- Redesigning the extension settings page.
- Changing the in-page launcher/floating window download workflow.
- Changing media candidate extraction or scan cache behavior beyond what the layout requires.
- Adding new download flows.
- Changing app versioning or release notes.

## Decisions

- Abnormal desktop connection status replaces the visible footer-left settings label. The footer-left element remains clickable and opens settings or connection help.
