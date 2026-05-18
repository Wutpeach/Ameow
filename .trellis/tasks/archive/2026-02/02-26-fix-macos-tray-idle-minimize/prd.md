# Fix mac tray activation, dock visibility, and idle minimize behavior

## Goal
Improve macOS tray/window UX so the app behaves like a true menu-bar utility: no Dock icon, reliable window activation from tray/icon mode, and no auto-minimize while cursor is still on the main panel.

## Requirements
- On macOS, hide the Dock icon and keep only the tray/menu-bar icon.
- Ensure main window activation from tray interactions is reliable on macOS.
- Prevent idle auto-minimize while the mouse is hovering on the main window.
- Keep existing Windows behavior unchanged.

## Acceptance Criteria
- [ ] On macOS app launch, Dock does not show the app icon while tray icon remains available.
- [ ] Clicking tray icon can reliably show and focus the main window.
- [ ] In icon mode, entering/activating the panel can expand to main interface reliably.
- [ ] While cursor remains over the main window, idle timer does not collapse it back to icon mode.
- [ ] Leaving the window still allows normal idle minimize behavior.

## Technical Notes
- Backend (`src-tauri/src/lib.rs`): macOS app policy/dock visibility and centralized show/focus behavior for tray and shortcut paths.
- Frontend (`src/App.tsx`): idle timer gating based on hover state and minimized-state activation fallback.
- Keep command/event contracts unchanged across Rust and TypeScript boundaries.
