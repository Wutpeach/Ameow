# Fix Windows Main-Window Interaction Parity

## Goal
Restore expected cross-platform behavior for main-window edge glow, shortcut summon positioning, and 5-tap devtools toggle so Windows matches intended UX and macOS parity.

## Requirements
- Fix Windows edge-glow rendering so the glow appears on the border stroke and follows cursor movement continuously, instead of corner fill artifacts.
- Define a unified shortcut summon anchor contract across macOS/Windows: show window at cursor's lower-left side; the window top-right corner should be about 50px diagonally from cursor.
- Ensure the same 5-tap version-click interaction toggles devtools both ON and OFF on Windows (currently opens but does not close).
- Keep existing behavior intact for unaffected flows (idle minimize, drag/drop, shortcut hide on second press).

## Acceptance Criteria
- [ ] On Windows, entering the main panel shows border-follow edge glow (no blue corner fill artifacts).
- [ ] On Windows, moving cursor along edges updates glow direction/position in real time.
- [ ] Pressing global shortcut when hidden places window at cursor lower-left with top-right ≈ 50px diagonal offset from cursor.
- [ ] macOS and Windows follow the same positioning rule under the same cursor location and monitor boundary constraints.
- [ ] Clicking version label 5 times toggles devtools state on both platforms: closed->open and open->closed.
- [ ] No regression in existing shortcut hide/show and window boundary clamping behavior.

## Technical Notes
- Affected frontend areas: edge glow style/mask pipeline in `src/App.tsx`, shortcut-show listener behavior, version-tap state handling in `src/pages/SettingsPage.tsx`.
- Affected backend areas: shortcut callback position calculation and devtools command behavior in `src-tauri/src/lib.rs`.
- Coordinate contract must ensure cursor position, monitor bounds, and window positioning use consistent space (logical vs physical) per platform.
- Validation matrix (Good/Base/Bad):
  - Good: centered cursor on monitor -> exact anchor rule and visible border glow.
  - Base: near monitor edges -> clamped inside screen while preserving intended relative anchor direction.
  - Bad: devtools already open/closed toggled repeatedly -> no stuck state, no no-op on Windows.
