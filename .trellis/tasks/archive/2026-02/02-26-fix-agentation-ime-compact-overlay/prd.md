# Fix Agentation IME Submit and Compact Overlay in 200x200 Window

## Goal
Fix two Agentation usability issues in dev mode: IME Enter should not prematurely submit fallback text, and Agentation expanded UI should remain fully usable inside FlowSelect's 200x200 floating window.

## Requirements
- Keep changes dev-only and do not affect production behavior.
- Prevent Agentation fallback/comment input from submitting when Enter is used for IME composition confirmation.
- Ensure Agentation toolbar/settings panel can be fully displayed in the 200x200 Tauri main window.
- Keep implementation scoped and compatible with current Agentation version.

## Acceptance Criteria
- [ ] While typing with Chinese IME, pressing Enter to confirm composition does not auto-submit Agentation text input.
- [ ] Normal Enter submit behavior still works when not composing.
- [ ] Agentation expanded menu no longer gets clipped by the FlowSelect window in dev mode.
- [ ] `pnpm run typecheck` and `pnpm run build` pass.

## Technical Notes
- Implement a dev-only Agentation wrapper in `src/main.tsx`.
- Add keyboard-event guard for IME Enter edge case (`isComposing`/`keyCode 229`) using capture-phase handling.
- Add compact-mode styling in `src/index.css` and limit selector scope via explicit data attributes set by wrapper logic.
