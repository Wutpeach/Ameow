# Enable mac hover activation using global mouse monitor

## Goal
When FlowSelect loses focus to another macOS app, hovering the mouse over the visible FlowSelect window should immediately reactivate and focus FlowSelect without requiring a click.

## Requirements
- Add a macOS-only mouse position monitor in Rust backend to detect pointer movement even when FlowSelect is not focused.
- Detect whether pointer enters the current `main` window screen rectangle.
- When pointer enters and main window is visible but not focused, trigger existing `show_main_window` flow to reactivate/focus.
- Apply cooldown/edge-triggering to avoid repeated focus calls on high-frequency mouse move events.
- Keep behavior isolated to macOS with `#[cfg(target_os = "macos")]` and no regressions on Windows/Linux.
- Monitor failures must not crash app; diagnostics must be logged clearly.

## Acceptance Criteria
- [ ] On macOS, when another app is focused and FlowSelect main window is visible, moving cursor into FlowSelect window area activates FlowSelect and restores interaction immediately.
- [ ] Hover activation triggers only on enter/cooldown boundary and does not spam focus APIs.
- [ ] If monitor dispatch fails, app does not crash and logs a clear `>>> [Rust]` message.
- [ ] Project builds successfully on current platform after changes.

## Technical Notes
- Reuse existing `show_main_window(app)` to keep focus/show behavior consistent.
- Prefer backend-only implementation first; no Tauri command signature changes expected.
- Use main-thread-safe cursor polling on macOS to avoid unsafe global hook callback crashes.
