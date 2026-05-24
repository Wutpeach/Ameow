# Redesign browser extension popup controls and add options page

## Goal

Redesign the browser-extension popup so it behaves as a compact current-page media/download console, not a miniature settings hub. Add an extension options page for persistent launcher settings and hidden-site management, and add a stable popup footer with Settings, version, and More links inspired by the RedFrog popup layout.

The immediate user problem is that the current popup expands the Quality, Launcher, and Hidden sites controls in document flow. When the Hidden sites list is shown, the Chrome popup gets a body-level scrollbar, and the scrollbar changes the perceived popup width. The redesign should remove that failure mode by moving long-lived management UI out of the popup.

## User Value

- The popup stays stable, compact, and focused on the current page.
- Hidden-site management has enough room for a real list UI instead of a cramped popup panel.
- Settings and help entry points are predictable and always visible.
- More links are informational and external, rather than another overflow drawer for app controls.

## Confirmed Facts

- Current popup files are `browser-extension/popup.html`, `browser-extension/popup.css`, and `browser-extension/popup.js`.
- Current extension manifest is `browser-extension/manifest.json` and does not yet define an `options_page`.
- Current launcher settings live in `browser-extension/launcher-config.js` under the `ameowFloatingLauncherConfig` storage key.
- `disabledSitePatterns` is already normalized and capped in `launcher-config.js`.
- Background message handlers already support:
  - `get_launcher_controls_state`
  - `restore_launcher_for_site`
  - `set_launcher_enabled`
  - `set_launcher_side`
  - `reset_launcher_position`
  - `restore_hidden_site`
  - `restore_all_hidden_sites`
- Launcher config changes should route through background helpers that broadcast `ameow_launcher_config_update` to tabs, rather than only writing storage from the popup/options page.
- RedFrog local reference at `D:\read-frogextension-1.33.8-sources` uses a footer bar in `src/entrypoints/popup/app.tsx` with Settings, version, and More.
- RedFrog opens options via `runtime.getURL("/options.html")` in `src/utils/navigation.ts`.
- RedFrog keeps disabled-site list management in the options page, using a settings card plus input/table UI in `floating-button-disabled-sites.tsx` and `patterns-table.tsx`.

## Requirements

- Popup scope:
  - The popup is the current-page media/download console.
  - The popup should keep media scanning/browsing and current-page download actions prominent.
  - The popup should no longer expose the full hidden-site list.
  - The popup should no longer contain restore-all hidden-site management.
  - The popup should not provide a direct current-site restore action for hidden launcher sites in this redesign. It may show `Hidden here` as status and route users to Settings.
  - The popup should avoid expanding long control panels that can trigger a body-level scrollbar.
- Compact controls:
  - Download quality may remain in the popup as a compact high-frequency preference, provided it does not expand into a long drawer.
  - Launcher state may remain as a compact status summary, such as visible/hidden/disabled and current side.
  - Detailed launcher controls move to the options page.
- Options page:
  - Add a browser-extension options page entry and page files.
  - Options page owns launcher configuration:
    - launcher enabled state;
    - launcher side, left/right;
    - reset launcher position;
    - hidden-site list;
    - current hidden-site status when it can be derived from the stored list;
    - restore one hidden site;
    - restore all hidden sites.
  - Options page may include default download quality if implementation review determines it makes popup simplification cleaner.
- Popup footer:
  - Add a darker footer bar at the bottom of the popup.
  - Footer contains:
    - Settings button that opens the options page;
    - extension version from `chrome.runtime.getManifest().version`;
    - More button/menu.
  - More is limited to external/help links:
    - GitHub repository: `https://github.com/Wutpeach/Ameow`;
    - Getting started guide: `https://github.com/Wutpeach/Ameow/blob/main/docs/getting-started.md`;
    - future informational links such as release notes or report issue may be added later.
  - More must not contain app-management controls such as Manage hidden sites, Restore all hidden sites, or Refresh launcher.
- Visual design:
  - Match Ameow compact product UI language: restrained surfaces, compact type, quiet darker footer, blue only for state/focus/selected actions.
  - Do not turn the popup footer into a large navigation bar or marketing area.
  - Options page can be roomier than the popup but should still use Ameow surface tokens and product UI rhythm.
- Compatibility:
  - Existing media scan and candidate row behavior should continue unless explicitly revised during implementation planning.
  - Existing content-script launcher update behavior must keep working after options changes.
  - Existing injected site buttons and context-menu/right-click paths are out of scope unless the implementation directly breaks them.

## Acceptance Criteria

- [ ] `browser-extension/manifest.json` declares an options page.
- [ ] The popup has a stable footer with Settings, extension version, and More.
- [ ] Settings opens the extension options page in a tab.
- [ ] More includes GitHub repository and Getting Started guide links.
- [ ] More does not include launcher or hidden-site management actions.
- [ ] Popup no longer renders the hidden-site list in its main body or tools drawer.
- [ ] Popup no longer renders Restore all hidden sites in its main body or More menu.
- [ ] Popup still surfaces hidden-site state as a compact summary when useful, such as `Hidden here` for the current site or `N hidden sites` globally, without expanding into a long list.
- [ ] Popup current-site hidden state routes users to Settings instead of invoking a direct restore action.
- [ ] Options page allows users to see hidden sites and restore one site.
- [ ] Options page allows users to restore all hidden sites with a guarded interaction.
- [ ] Options page allows users to manage launcher enabled state, side, and reset position.
- [ ] Options page launcher changes propagate to active page launchers without requiring browser restart.
- [ ] Popup width does not visually jump when interacting with footer, More, quality, or launcher summary controls.
- [ ] Restricted pages and unavailable launcher states remain represented with compact status copy.
- [ ] Focused validation covers popup footer behavior, options page routing, launcher config persistence, hidden-site restore, and active-tab broadcast updates.

## Notes

- This task intentionally narrows popup responsibility compared with the earlier popup-console direction. The browser popup should not become the canonical place for every launcher setting.
- The RedFrog reference is a product-pattern reference, not a visual clone. Ameow should keep its own compact dark/light token language.
