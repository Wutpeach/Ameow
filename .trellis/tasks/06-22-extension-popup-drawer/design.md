# Design: Browser Extension Popup Drawer

## Summary

Add a compact 2x2 quick-action grid to the browser-extension popup and introduce popup-contained drawers for secondary workflows. The first version has four actions:

- Download Settings
- Pick Download
- Login State
- Help Docs

The drawer pattern is inspired by Immersive Translate's popup bottom sheet, but adapted to Ameow's compact blue-accent product UI.

## Product Boundaries

- The browser extension remains an entry point and current-page bridge, not the authority for stored cookies or desktop download state.
- Login State drawer is information-oriented:
  - top action syncs/enables the current tab's login state into the desktop app.
  - body lists only sites the user has actively synchronized.
  - it does not render every supported site or imply the extension stores cookies locally.
- Download Settings drawer contains only the quality preference.
- Pick Download must match the existing floating launcher's `拾取下载` behavior.
- Help Docs opens the docs-site browser-extension documentation.

## UI Structure

Current popup order changes from:

```text
media/results
quality panel
login-state panel
footer
```

to:

```text
media/results
quick-action grid
footer
drawer overlay (when open)
```

The 2x2 grid sits above the footer. It uses stable two-column tracks and button heights so labels, badges, and transient states do not shift layout.

## Drawer Contract

Each drawer uses the same popup-contained shell:

- overlay covers the popup content.
- panel slides from the bottom.
- panel max-height is bounded and body scrolls internally.
- Escape, backdrop click, and close button dismiss the drawer.
- focus returns to the opening button where practical.

Drawer ids:

- `download-settings`
- `login-state`

## Download Settings Drawer

Source of truth:

- `browser-extension/direct-download-quality.js`
- existing popup quality rendering in `browser-extension/popup.js`

Behavior:

- Shows the existing quality options.
- Persists through `directDownloadQuality.setQualityPreference`.
- Responds to `chrome.storage.onChanged` for cross-surface updates.
- The quick-action button shows the current quality summary.

## Pick Download Flow

Source of truth:

- `browser-extension/floating-launcher.js`
- `capture-evidence.js`
- existing background route for `ameow_download_current_content`

Target behavior:

```text
popup button click
  -> background message: start pick download for active tab
  -> active tab content script starts the same picker overlay as floating launcher
  -> user clicks target element
  -> content script builds pick-download payload
  -> content script sends `ameow_download_current_content`
  -> background handles the same path it already handles for launcher picker
```

Implementation should avoid duplicating picker logic inside popup. If refactoring is needed, extract reusable picker helpers inside the browser-extension layer before wiring the popup entry.

Explicit message path:

```text
popup.js -> background.js: { type: "start_pick_download" }
background.js -> active tab: { type: "ameow_start_picker" }
floating-launcher.js -> chrome.runtime.onMessage handler calls startPicker()
```

The popup should not own picker overlay rendering.

Fallbacks:

- If there is no active tab or content script cannot receive the message, show transient feedback on the Pick Download button.
- Restricted browser pages should fail quietly with localized feedback.

## Login State Data Flow

Existing facts:

- Popup currently gets current-tab site-session status through `get_status`.
- Background caches registry entries through desktop-pushed `site_session_registry_update`.
- Desktop has authoritative registry and per-site state through:
  - `get_site_session_registry`
  - `get_site_session_state`
  - `site_session_cookie_sync_direct`
  - `site_session_enable_current_tab`
- Current desktop WebSocket actions already support direct sync and enable current tab, but not a popup query for synchronized-site summaries.

New extension-facing background message:

```js
{ type: "get_site_session_drawer_state" }
```

Response shape:

```ts
type ExtensionSiteSessionDrawerState = {
  connected: boolean;
  currentTab: {
    url: string | null;
    title: string | null;
    currentSiteSession: ExtensionSiteSessionRegistryEntry | null;
    canSync: boolean;
    canEnable: boolean;
  };
  synchronizedSites: Array<{
    siteId: string;
    displayName: string;
    primaryHost: string | null;
    icon: unknown;
    updatedAtMs: number | null;
    lastSyncSource: {
      browser: string | null;
      profileLabel: string | null;
      extensionId: string | null;
    } | null;
  }>;
  reason?: string;
};
```

Filtering rule:

- Include only registry entries with a saved synchronized state.
- Treat `availability === "ready"` or `availability === "partial"` with `updatedAtMs !== null` as synchronized.
- Exclude entries with `availability === "missing"` or no saved timestamp.
- Do not show hidden/unsupported catalog entries that have not been user-synchronized.

Desktop WebSocket actions:

- Add a single desktop action that returns compact synchronized-site summaries, for example `site_session_synced_summary`.
- This keeps popup from needing to perform N per-site state requests and keeps filtering/authority in the desktop layer.
- Background normalizes and guards the response before returning it to popup.
- This action is required for the synchronized-sites list. Extension-local registry cache is not enough because it does not contain `availability`, `updatedAtMs`, or `lastSyncSource`.
- If the desktop app is offline, background should return `connected: false`, `synchronizedSites: []`, and a reason such as `desktop_offline` without waiting on a desktop request timeout.

Current-tab sync:

- Existing `sync_current_site_session` and `enable_current_site_session` remain the mutation entry points.
- On success, popup reloads drawer state and updates the quick-action button.

## Localization

Add extension locale strings for:

- quick action labels and subtitles.
- drawer titles.
- download settings quality title.
- login-state drawer current-tab states.
- synchronized-sites list and empty state.
- Pick Download transient feedback.

Files:

- `browser-extension/locales/zh-CN/extension.json`
- `browser-extension/locales/en/extension.json`

## Docs

User-facing popup behavior changes require docs-site updates.

Update:

- `site/src/content/docs/docs/browser-extension.mdx`
- `site/src/content/docs/en/docs/browser-extension.mdx`
- likely cross-link or short mention in:
  - `site/src/content/docs/docs/extension/cookies-and-login.md`
  - `site/src/content/docs/en/docs/extension/cookies-and-login.md`

The docs should clarify that browser-extension login-state sync sends selected site cookies to the desktop app; the extension popup lists synchronized sites for visibility and does not replace desktop storage.

## Compatibility

- No native Chrome `sidePanel` permission in this first version.
- No manifest permission change should be required unless implementation evidence shows a new content-script entry needs explicit declaration.
- Keep current `action.default_popup`.
- Firefox/Edge compatibility should remain no worse than current popup/content-script behavior.

## Rollback

If the login-state summary contract proves too large during implementation, keep the 2x2 grid and Download Settings drawer, and leave Login State opening a simpler current-tab-only drawer. Do not fake a synchronized-site list from incomplete local extension data.
