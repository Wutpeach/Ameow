# Implementation Plan

## Sequence

1. [x] Read current frontend specs before editing:
   - `.trellis/spec/frontend/index.md`
   - relevant frontend motion/design-system guidance listed by the index
   - `.trellis/spec/backend/electron-runtime-contracts.md` for compact passthrough and pointer-boundary contracts
2. [x] Unify compact outer geometry:
   - remove the macOS `88` compact outer path or make it resolve to the shared `80` baseline
   - update `App.tsx` geometry consumers to use the shared helper instead of duplicating the macOS branch
   - update `mainWindowShellGeometry` expectations
3. [x] Run focused geometry tests:
   - `npm run test -- mainWindowShellGeometry`
4. [x] Fix edge-glow reveal timing:
   - add a cancelable edge-glow reveal timer/ref
   - route `requestExpand`, `handleAnimationComplete`, and `ensureMainWindowFullMode` through the shared helper
   - clear pending reveal work when collapse or unmount makes it stale
5. [x] Fix edge-glow cursor initialization:
   - reuse renderer `screenX/screenY` from compact hotspot and panel pointer events instead of adding a new bridge in this pass
   - convert cursor position to visible panel-local coordinates through a pure helper
   - initialize `mousePos` after full expansion settles and before revealing edge glow
   - clamp out-of-panel cursor positions instead of resetting to `{ x: 0, y: 0 }`
6. [x] Add focused tests where practical:
   - timer consolidation behavior
   - compact geometry baseline
   - cursor-to-panel coordinate helper if factored into a pure function
7. [x] Validate:
   - `npm run test -- mainWindowShellGeometry mainWindowMotionBaseline compactPointerHotspot mainWindowTransitionToken mainWindowMode startupWindowState`
   - `npm run type-check`
   - `npm run lint`
8. [ ] Manual checks:
   - [x] Windows: compact icon -> full with stationary cursor; glow appears at the actual cursor position without delayed dim phase
   - [x] Windows: pointer movement during/after expand tracks glow
   - [x] Windows: compact passthrough hover-expand still works
   - [ ] macOS: compact icon remains centered with shared `80` outer size
   - [ ] macOS: no compact shadow clipping, ghosting, or collapse/expand drift
   - [ ] macOS Retina / scaled display: glow is not visibly offset

## Review Gates

- Do not start edge-glow coordinate changes until compact outer geometry has been unified and focused geometry tests pass.
- Do not keep macOS-specific compact geometry unless a validation note documents the failure caused by shared `80`.
- Do not shorten the reveal delay aggressively until cursor initialization is verified.

## Files Likely To Change

- `src/constants/windowMetrics.ts`
- `src/App.tsx`
- `src/utils/mainWindowShellGeometry.ts`
- `src/utils/mainWindowShellGeometry.test.ts`
- possibly `electron/mainWindowPointerBoundary.mts`
- possibly `src/types/electronBridge.ts`
- possibly `electron/preload.mts` / `src/desktop/runtime.ts` if a one-shot cursor bridge is added
