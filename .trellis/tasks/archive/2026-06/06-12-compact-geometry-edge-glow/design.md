# Design

## Overview

This task has two ordered parts:

1. Normalize compact geometry so macOS and Windows share the same compact outer baseline.
2. Fix edge-glow timing and cursor synchronization after compact -> full expansion.

The order matters because edge-glow coordinate work should be based on the final compact/full geometry contract, not on a platform difference that may be removed.

## Geometry Contract

- `MAIN_WINDOW_COMPACT_SHELL_SIZE` remains the visible compact shell size.
- `MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE` remains the shared compact outer size.
- `getMainWindowCompactOuterSize(platform)` should return the shared compact outer size by default.
- A macOS-specific compact outer size should exist only if validation proves the shared value clips shadows, causes ghosting, or breaks hit testing.
- Full-mode shadow gutter remains platform-aware because it protects the `200x200` visible panel and full-window renderer shadow.

## Edge Glow Contract

- `showEdgeGlow` should not be toggled by independent uncancelled timeouts.
- All full-window reveal paths should use one cancelable reveal helper or equivalent centralized state:
  - compact hover `requestExpand`
  - expanding `handleAnimationComplete`
  - `ensureMainWindowFullMode`
- Collapse may hide edge glow, but must not leave stale reveal timers that fire in the wrong shell phase.
- `mousePos` must represent panel-local coordinates inside the visible `200x200` body.
- Compact hotspot entry and native boundary facts may establish pointer-inside state, but renderer geometry remains the owner of visual coordinate state.

## Cursor Synchronization

The preferred implementation is a small helper that synchronizes edge-glow coordinates after full expansion is stable:

- Read the current cursor position from an existing or narrowly extended Electron bridge.
- Convert the cursor to renderer client coordinates using a DPI-aware path verified against local Electron API behavior.
- Subtract `containerRef.current.getBoundingClientRect()` so the result is relative to the visible panel body.
- Clamp or ignore out-of-panel coordinates instead of falling back to `{ x: 0, y: 0 }`.

Avoid assuming native window bounds are equivalent to the visible panel. Full mode includes shadow gutter, and compact/full visual frames are modeled separately.

## Compatibility

- Windows compact passthrough remains limited to the existing supported path.
- macOS should use the same compact outer size unless validation fails.
- DPI / Retina behavior must be considered before finalizing cursor conversion.
- Multi-monitor behavior should be manually checked when possible because mixed scaling can expose coordinate assumptions.

## Risks

- Reducing macOS compact outer size from `88` to `80` may reveal shadow clipping or compact icon drift.
- Removing or shortening the 500ms glow delay without cursor synchronization could expose stale `{0,0}` glow positioning.
- Extending native payloads can accidentally mix physical pixels and DIP/CSS pixels if the conversion is not explicit.
- Independent reveal timers can still race unless all known call sites are covered.

## Rollback Shape

- If macOS compact `80` fails validation, restore a documented macOS-specific compact outer override and keep the edge-glow fix independent.
- If cursor synchronization proves too risky for this pass, keep timer consolidation and preserve a conservative reveal delay while documenting the remaining coordinate gap.
