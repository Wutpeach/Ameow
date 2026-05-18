# Stabilize extension connection status when desktop app is offline

## Goal
Keep the browser extension popup status stable when the FlowSelect desktop app is not running.

## Requirements
- Status polling must not trigger a new WebSocket reconnect attempt.
- A scheduled reconnect must not be cancelled and restarted by unrelated status reads.
- After the first failed connection attempt, the popup should remain on the unavailable/offline message instead of flickering between connecting and unavailable.
- Existing WebSocket request/response contracts between the extension and Rust backend must remain unchanged.

## Acceptance Criteria
- [ ] With the desktop app closed, the popup no longer alternates between "Connecting to desktop app..." and the unavailable message.
- [ ] Extension reconnect attempts still continue in the background without user action.
- [ ] When the desktop app starts later, the extension still reconnects successfully.
- [ ] No request payload or response payload shape changes are introduced.

## Technical Notes
- Root cause is in `browser-extension/background.js`, where `get_status` currently calls `connect()` and resets reconnect state.
- Favor a minimal extension-side fix over backend changes because the Rust WS server lifecycle is already correct.
