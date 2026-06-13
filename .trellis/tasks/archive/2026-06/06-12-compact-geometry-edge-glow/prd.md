# Unify compact geometry and fix full edge glow

## Goal

Make the desktop main-window compact/full behavior more consistent across macOS and Windows, then fix the full-window edge glow delay after compact-icon expansion.

The user-facing goal is that macOS and Windows use the same compact geometry by default unless a platform difference is proven necessary, and that the blue edge glow in the full window responds to the cursor immediately and at the expected brightness after compact -> full expansion.

## Confirmed Facts

- The current compact visual shell size is `60`.
- The current Windows compact outer frame is `80`.
- The current macOS compact outer frame is `88`.
- The macOS `88` value came from prior transparent-window shadow work and equals `60 + 14 * 2`; it is not known to be an unavoidable native requirement.
- Full window edge glow is currently hidden through scattered `setShowEdgeGlow(false)` plus `500ms` reveal timers.
- `requestExpand`, `handleAnimationComplete`, and `ensureMainWindowFullMode` each participate in edge-glow reveal timing.
- Edge glow position is driven by renderer `mousePos`, which is updated by full-panel mouse/pointer events but not by the compact hotspot path.
- Windows compact passthrough hotspot currently uses forwarded mouse movement for expansion, but that path does not synchronize edge-glow coordinates.

## Requirements

- First unify compact outer geometry toward shared macOS/Windows data, defaulting macOS compact outer size to the Windows `80` baseline.
- Keep the visible compact shell size at `60`.
- Preserve platform-specific behavior only when local evidence or manual validation shows it is needed.
- After compact geometry is unified, fix full-window edge-glow reveal timing and cursor-position synchronization.
- Edge-glow coordinate handling must target the visible `200x200` panel body, not the native shadow gutter.
- Timer changes must cover all known edge-glow reveal sites, not only compact hover expansion.
- Avoid changes that reintroduce compact passthrough, shadow clipping, hover/collapse, drag/drop, or task-lock regressions.

## Acceptance Criteria

- [ ] macOS and Windows compact outer size use the same `80` value unless a documented validation failure requires a platform exception.
- [ ] Compact geometry tests reflect the unified baseline and still separate native bounds, visual shell, reachable frame, and hotspot frame.
- [ ] Compact icon remains centered and reachable after collapse.
- [ ] macOS compact mode is manually checked for shadow clipping, ghosting, visual drift, and hover/collapse behavior.
- [ ] Edge glow reveal timing is controlled by a single cancelable helper or equivalent shared mechanism.
- [ ] Compact icon -> full expansion with a stationary cursor shows the edge glow at the correct cursor position without the current delayed dim phase.
- [ ] Edge glow still tracks correctly during pointer movement after expansion.
- [ ] Windows compact passthrough hotspot behavior remains functional.
- [ ] Relevant focused tests pass, plus `npm run type-check` and `npm run lint`.

## Out Of Scope

- Broad redesign of main-window motion personality.
- Changing the visible `200x200` full panel size.
- Changing the visible `60` compact shell size unless validation proves it necessary.
- Replacing the existing shell state machine.

## Open Questions

- None currently blocking planning. If macOS validation fails after unifying compact outer size, record the failure and add a narrow platform exception with evidence.
