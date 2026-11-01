# Stabilize Compact-To-Main Window Transition Token Guard

## Goal
Eliminate the remaining race where the main window can render full-panel content while the native window bounds are still collapsed to `80x80` during extreme icon-to-main transition stress.

## Requirements
- Add a frontend transition token guard for compact/full window bound transitions.
- Thread the current transition token through the existing `currentWindow.animateBounds(...)` IPC call.
- Introduce `INTERMEDIATE_EXPAND_SIZE` as the shared constant for the native full-size restore target.
- Prevent stale compact-shrink callbacks from applying after a newer full-mode request has superseded them.
- Keep the native-side implementation simple; do not add a main-process token guard unless frontend coverage proves insufficient.

## Acceptance Criteria
- [ ] Rapid compact -> expand -> compact -> expand cycles no longer leave the full panel clipped inside an `80x80` native window.
- [ ] Full-mode restore paths share the same token-aware native-bounds handshake.
- [ ] Stale shrink callbacks bail out without mutating native bounds or full-mode state.
- [ ] Type-safe bridge contracts compile after adding the optional transition token payload.
- [ ] Regression tests cover stale-callback rejection and token progression behavior.

## Technical Notes
- Use `useRef` for the token lifecycle; no unmount cleanup is required for this component.
- Token checks are O(1) and should stay entirely on the frontend path for now.
- Validate behavior on the existing Electron preload/main bridge by extending the current animate-bounds payload instead of introducing a new IPC route.
