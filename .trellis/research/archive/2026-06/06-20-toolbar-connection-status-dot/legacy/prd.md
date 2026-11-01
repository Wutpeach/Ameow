# Use toolbar status dot for desktop connection state

## Goal

Repurpose the browser extension toolbar status dot so it communicates whether the Ameow browser extension is connected to the desktop app.

User-facing value:

- Users can see desktop connection status directly from the browser toolbar, without opening the extension popup.
- The toolbar indicator becomes a global extension health signal instead of a site-specific login-state prompt.
- The popup footer/settings connection text can remain as supporting detail, but it should no longer be the only obvious connection cue.

## Confirmed Facts

- Before this task, the toolbar indicator was implemented in `browser-extension/background.js` by `updateActionBadgeForActiveTab()`.
- The current indicator is tied to site-session login-state availability:
  - it shows when the extension is connected to the desktop app;
  - the active tab URL matches a site-session registry entry.
- The icon rendering helper is `browser-extension/action-icon-indicator.js`.
- The current indicator helper uses icon overlay assets rather than visible Chrome badge text:
  - base icons: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`;
  - yellow-dot icons: `icons/icon16-sync-dot.png`, `icons/icon48-sync-dot.png`, `icons/icon128-sync-dot.png`.
- Connection state is already tracked in `browser-extension/background.js`:
  - `connectionState()` returns `connected`, `connecting`, or `offline`;
  - `notifyConnectionStatus()` broadcasts `connection_update` and can refresh the toolbar action indicator.
- Existing reconnect behavior keeps retrying with backoff capped at 5 seconds while the desktop app is unavailable.
- Existing `connectionState()` should not remain `connecting` across those retry waits:
  - initial WebSocket handshake can produce `connecting`;
  - WebSocket error/close sets `lastConnectionIssue` to `Offline`;
  - reconnect timers may continue, but `connectionState()` returns `offline`.
- Existing `connection_update.connecting` can be true while a reconnect timer is scheduled, so toolbar visual logic should prefer `state` over the boolean `connecting` field.
- Popup UI currently shows connection detail through the footer/settings area.
- The user explicitly rejected continuing with the login-state sync interaction redesign in this turn.
- Current browser-extension download/launcher flows do not start the desktop app when it is offline:
  - the page-edge cat launcher sends `ameow_download_current_content` to the extension background service worker;
  - the background worker routes download requests to the desktop app over the existing WebSocket;
  - when WebSocket connection cannot be established, requests fail with `not_connected`;
  - the launcher currently shows a compact "Open desktop app" style failure message.
- Repository search found no current native messaging registration, `nativeMessaging` permission, custom `ameow://` deep-link registration, or extension-side external-app launch path.
- "Launch desktop app from browser extension" is technically possible, but requires a separate platform integration:
  - native messaging is the strongest browser-extension-native bridge; Chrome/Edge can start a registered native messaging host process when `runtime.connectNative()` or `runtime.sendNativeMessage()` is called;
  - native messaging requires extension manifest permission, a native messaging host manifest, allowed extension origins, and OS/browser-specific host registration;
  - a custom protocol/deep link such as `ameow://...` may also be possible, but it depends on OS protocol registration and browser prompt behavior, and is less suited to structured request/response health checks.
- If app launch is added later, the toolbar connection dot becomes an actionable status signal:
  - green means the desktop bridge is ready;
  - gray means the desktop side is unavailable and browser-side actions can offer to open or reconnect;
  - intermediate launch/handshake feedback can live in popup/launcher inline copy rather than requiring a persistent yellow toolbar state.

## Requirements

- Change the toolbar status dot meaning from site-session/login-state availability to desktop connection state.
- Use a two-state toolbar indicator:
  - green dot for connected;
  - muted gray dot for not connected/offline.
- Use a muted gray treatment for offline/disconnected state. Do not use red, because it is too heavy for this background connectivity signal.
- Do not add a persistent yellow `connecting` toolbar state in this task.
- Do not use the toolbar status dot for login-state sync availability in this task.
- Preserve popup footer/settings connection details as supporting status unless implementation discovers a direct conflict.
- Keep the visual language compact and restrained, consistent with Ameow extension icons.
- Keep status title text useful for hover/screen-reader context.
- Avoid using Chrome action badge text for the status dot if icon overlays are the existing mechanism.
- Keep the change scoped to the browser extension toolbar action indicator and its tests.

## Acceptance Criteria

- [x] When the desktop app is connected, the browser toolbar icon shows a clear connected status dot.
- [x] When the desktop app is offline/disconnected, the browser toolbar icon shows a muted gray offline status dot or equivalent no-connection state.
- [x] Reconnect waiting does not leave the toolbar in a perpetual connecting visual state.
- [x] Site-session/login-state registry matching no longer controls whether the toolbar dot appears.
- [x] Toolbar title text reflects desktop connection status rather than login-state sync availability.
- [x] Existing login-state sync popup behavior is not redesigned as part of this task.
- [x] Focused tests cover connected and offline toolbar indicator states.
- [x] Browser-extension relevant tests pass.

## Out Of Scope

- Redesigning the login-state sync card or sync result feedback.
- Adding new login-state synced/failed toolbar states.
- Changing desktop app connection protocol or WebSocket retry behavior.
- Adding browser-extension support to launch the desktop app when offline.
- Changing in-page floating launcher status UI.
- Changing the browser extension popup layout beyond any minimal copy/title alignment needed for consistency.

## Open Questions

- None.
