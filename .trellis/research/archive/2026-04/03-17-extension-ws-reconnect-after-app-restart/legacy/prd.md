# Fix Extension Reconnect After Desktop App Restart

## Goal
Ensure the browser extension can recover its WebSocket connection to the FlowSelect desktop app after the desktop app disconnects or restarts, without requiring the user to manually refresh the extension service worker.

## Requirements
- Stabilize the extension WebSocket reconnect state machine so stale socket events cannot overwrite newer connection state.
- Preserve the existing desktop app WebSocket contract at `ws://127.0.0.1:39527`.
- Keep request/response flows working for extension actions such as `video_selected`, `sync_download_preferences`, and protected-image fallback.
- Minimize scope: prefer an extension-side fix unless backend lifecycle review proves a desktop-side change is required.

## Acceptance Criteria
- [ ] After the desktop app exits and restarts, the extension can reconnect automatically without a manual extension refresh.
- [ ] Failed or stale WebSocket instances cannot null out a newer active connection.
- [ ] Existing extension requests still fail gracefully with actionable offline status when the desktop app is unavailable.
- [ ] Relevant checks pass for the modified code.

## Technical Notes
- Current evidence points to a reconnect race in `browser-extension/background.js`, where global `ws` state is mutated directly from socket event handlers without guarding against stale socket callbacks.
- Backend server lifecycle is implemented in `src-tauri/src/lib.rs` and should be reviewed for restart assumptions before finalizing the fix.
