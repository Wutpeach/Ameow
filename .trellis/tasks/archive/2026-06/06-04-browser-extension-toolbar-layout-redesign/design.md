# Browser Extension Toolbar Layout Redesign Design

## Objective

Turn the browser extension toolbar popup into a compact media-first quick panel. The toolbar should expose only current-page media browsing plus two shortcuts that affect download output: quality and login state. Broader configuration belongs to the extension settings page.

## Information Architecture

Target hierarchy:

```text
+--------------------------------+
| [ Video n ][ Audio n ][ Image n ]  rescan |
|                                |
| media list / scanning / empty  |
|                                |
| Quality        Balanced     v  |
| Login state    Synced      Sync|
|                                |
| Settings       v1.29.6     More|
+--------------------------------+
```

Abnormal desktop connection state:

```text
+--------------------------------+
| [ Video n ][ Audio n ][ Image n ]  rescan |
|                                |
| media list / scanning / empty  |
|                                |
| Quality        Balanced     v  |
| Login state    Synced      Sync|
|                                |
| Offline        v1.29.6     More|
+--------------------------------+
```

## Boundaries

In scope:

- `browser-extension/popup.html`
- `browser-extension/popup.css`
- `browser-extension/popup.js`
- Browser-extension locale strings for popup labels and status copy, if needed.

Out of scope:

- Extension options/settings page redesign.
- Media scan extraction logic.
- In-page launcher behavior.
- Download routing behavior.

## Layout Changes

- Remove the context card as a persistent page-title/status surface.
- Keep media type filtering as the top control row.
- Relocate the rescan action from the current context-card action area into the media browser toolbar and describe it as rescanning current page media.
- Move login state into the compact controls section below media browser.
- Keep login state row always rendered, with disabled state when the current site cannot be enabled or synced.
- Remove launcher summary from toolbar compact controls.
- Keep footer three-column structure with centered version.
- Hide normal connected status.
- Show abnormal desktop status in the footer left slot.

## Existing Code Coupling To Resolve

- `popup.js` currently routes scan, connection, and launcher feedback through `renderContextCard()`. The implementation must remove or redirect all current call sites rather than only deleting the context-card markup.
- `contextFallbackDownloadButton` currently has element lookup, copy updates, visibility updates, and a click listener. Removing the visible `Download current page` button requires removing or guarding all of those references.
- `renderStaticCopy()` currently writes launcher and fallback-download copy. Removing launcher/fallback controls from the toolbar requires updating this function.
- `launcherTimer`, `refreshLauncherControls()`, and related startup polling exist for toolbar launcher state. Removing launcher controls should remove this polling from the popup unless another visible state still requires it.

## State Model

Media browser:

- `scanning`
- `fresh`
- `cached`
- `empty`
- `unavailable`

Login state row:

- `synced`
- `can_sync`
- `can_enable`
- `unsupported`
- `offline`
- `working`
- `success_feedback`
- `error_feedback`

Desktop status footer:

- `connected`: footer left shows settings entry.
- `connecting`: footer left replaces the settings label with compact connecting status and remains clickable to open settings/help.
- `offline`: footer left replaces the settings label with compact offline status and remains clickable to open settings/help.

## Compatibility Notes

- Existing media scan cache and refresh behavior should remain intact.
- Existing media row menus should remain behind row actions.
- Existing quality preference storage should remain intact.
- Existing login sync message flow should remain intact.
- Settings and more menu entry points should remain accessible.

## Visual Direction

- Match existing Ameow extension surface tokens.
- Use restrained color. Accent should mark selected media tab, focus, and active controls.
- Do not use a large login warning card in the toolbar.
- Use compact rows rather than nested cards.
- Preserve black/white theme behavior.

## Trade-Offs

- Hiding normal connection status saves space but relies on abnormal-state visibility for recovery.
- Removing site title saves vertical space but reduces explicit page identity. This is acceptable because the browser context already provides the current page.
- Removing toolbar launcher controls reduces shortcut density but keeps launcher configuration in the settings page where it belongs.

## Product Decision

Abnormal footer connection status replaces the visible settings label entirely. The footer-left element remains a settings/help path, so the visual state changes without removing recovery navigation.
