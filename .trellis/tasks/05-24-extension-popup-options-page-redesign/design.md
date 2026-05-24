# Extension Popup Options Page Redesign Design

## Objective

Move persistent extension settings out of the toolbar popup while preserving the popup as a fast current-page media/download console. The new design introduces a small options page, a stable popup footer, and a clear boundary for the More menu.

## Product Boundary

Use this ownership model:

```text
Popup        = current-page media and download console
Options page = extension settings and persistent launcher configuration
More menu    = external links and help/documentation
```

The popup should not be the full settings surface. The options page should not compete with the media browser. The More menu should not become another feature drawer.

This task supersedes the earlier popup `Sites` tab direction from `.trellis/tasks/05-24-extension-popup-console-media-browser/`. Hidden-site list management moves to the options page.

## RedFrog Reference

The local RedFrog extension at `D:\read-frogextension-1.33.8-sources` provides the pattern reference:

- Popup footer: `src/entrypoints/popup/app.tsx`
  - main popup content lives above a darker footer;
  - footer contains Settings, version, and More.
- Options navigation: `src/utils/navigation.ts`
  - opens `runtime.getURL("/options.html")` in a tab.
- Disabled-site management: `src/entrypoints/options/pages/floating-button/floating-button-disabled-sites.tsx`
  - long list management belongs in options, not popup.
- Pattern table: `src/entrypoints/options/components/patterns-table.tsx`
  - input plus table/list actions are appropriate for settings pages.

Adopt the information architecture, not the React/Tailwind implementation style.

## Popup Layout

Recommended structure:

```text
Header: Ameow + connection status

Current page context:
  host/title
  scan or launcher status
  refresh media action

Media browser:
  Video / Audio / Image tabs
  candidate list and row actions

Compact controls:
  Quality: Balanced
  Launcher: Visible / Right

Footer:
  Settings        vX.Y.Z        More
```

### Compact Controls

Quality can remain as a compact direct selector if it stays within a fixed-height region. If the selector still creates layout pressure, demote it to a summary plus Settings link.

Launcher in the popup should communicate state, not host full configuration. Recommended visible fields:

- enabled/disabled/hidden here/visible/unavailable;
- current side when known;
- link-style Settings action if deeper controls are needed.

Hidden-site summary should stay compact:

- show `Hidden here` when the active page host is in `disabledSitePatterns`;
- otherwise show `N hidden sites` when any hidden sites exist;
- avoid rendering individual hosts or restore controls in the popup.

Do not render the hidden-site list in the popup. Do not render Restore all in the popup. Do not keep the direct `restore_launcher_for_site` popup button in this redesign; route recovery through Settings.

### Footer

Footer visual behavior:

- fixed at the bottom of the popup content flow;
- slightly darker than the popup body in black theme;
- slightly deeper neutral than the popup body in white theme;
- compact height, roughly 34-38px;
- no large accent background;
- no body-level scroll expansion.

Footer actions:

- Settings opens the extension options page.
- Version uses `chrome.runtime.getManifest().version` and displays as `v${version}`.
- More opens a small menu anchored to the footer.

More menu contents:

- GitHub repository: `https://github.com/Wutpeach/Ameow`
- Getting Started: `https://github.com/Wutpeach/Ameow/blob/main/docs/getting-started.md`

Do not put Manage hidden sites, Restore all hidden sites, Refresh launcher, or other app controls in More.

## Options Page

The first options page can be a focused static extension page, not a full settings hub.

Recommended route/file shape:

```text
browser-extension/options.html
browser-extension/options.css
browser-extension/options.js
```

Manifest:

```json
"options_page": "options.html"
```

The popup should open it with:

```js
chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
```

Recommended page sections:

```text
Launcher settings
  [enabled switch]
  [left/right segmented control]
  [reset position]

Hidden sites
  count
  list of patterns/hosts
  per-row restore
  restore all
  optional add host/pattern input

Download preference (optional)
  default quality
```

The options page should reuse `ameow-shared.css` and popup tokens where practical, but it can use a wider content width because it is not constrained to the Chrome popup surface.

## Data Flow

Use background messages as the write path for launcher config changes so active content scripts receive config broadcasts.

Current available operations:

```text
popup/options -> background: get_launcher_controls_state
popup -> background: restore_launcher_for_site (legacy/current direct restore; remove from popup UI for this redesign)
popup/options -> background: set_launcher_enabled
popup/options -> background: set_launcher_side
popup/options -> background: reset_launcher_position
popup/options -> background: restore_hidden_site
popup/options -> background: restore_all_hidden_sites
background -> tabs: ameow_launcher_config_update
```

Potential additional operation:

```text
options -> background: add_hidden_site
```

Only add this if manual pattern entry is included in MVP. If MVP only restores existing hidden sites, existing operations are enough.

Quality settings can continue to use `direct-download-quality.js` because storage change listeners already keep related contexts synchronized. If quality moves into options, ensure popup summaries refresh through `chrome.storage.onChanged`.

Restore-all guard: use `window.confirm()` for the first options-page implementation. It is stable in an extension page, avoids adding dialog infrastructure for a one-off destructive action, and matches the current popup behavior.

## Compatibility

- Existing media browser behavior should remain stable.
- Existing launcher content-script config update handling should remain the mechanism for live page updates.
- Existing background storage listeners for direct-download quality should keep syncing download preferences.
- Existing context menu and injected site-specific buttons are not part of this redesign unless a regression is found.

## Tradeoffs

### Why Not Keep Hidden Sites In Popup

Hidden sites are a low-frequency, unbounded list-management workflow. In a 344px popup they create height pressure, scrollbar appearance, and cramped controls.

### Why Not Put Management Actions In More

More should be predictable: links, docs, repository, feedback. If app controls enter More, users lose the clear distinction between external help and settings.

### Why A Focused Options Page First

A full settings hub is more extensible but has higher implementation cost. A focused page solves the current layout failure and leaves room to grow into a larger hub later.

## Risks

- Options page writes that bypass background could fail to update already-mounted launchers.
- Popup footer menus could still cause overflow if implemented in normal document flow rather than as a compact overlay.
- New options page styling could diverge from Ameow tokens if it copies RedFrog visuals directly.
- Existing active tasks around popup console/media browser may contain outdated assumptions about a Sites tab in the popup; implementation should reconcile those docs before coding.
