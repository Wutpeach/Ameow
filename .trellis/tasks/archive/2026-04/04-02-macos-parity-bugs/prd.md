# Fix macOS parity bugs

## Goal

Bring the Electron/macOS desktop experience back in line with the intended Windows behavior for tray presence, compact icon mode visuals, managed runtime bootstrap, and secondary-window placement.

## What I already know

* macOS tray creation currently uses the main app icon path from `electron/main.mts`, which is likely too large/unadapted for the menu bar.
* The minimized/icon-mode shell in `src/App.tsx` keeps macOS-specific scaled rendering paths that can leave shell/shadow artifacts around the edge.
* Managed runtime bootstrap for `ffmpeg` and `deno` runs from `electron/main.mts` after first visible paint, with a `30s` download stall timeout for large archives.
* Settings and UI Lab window placement is calculated from `src/App.tsx`, `src/pages/SettingsPage.tsx`, and `src/utils/secondaryWindowPlacement.ts`.
* The monitor payload from `flowselect:system:current-monitor` currently mixes `display.bounds` for position with `display.workArea` for size, which is inconsistent on macOS.

## Assumptions (temporary)

* Scope is limited to the four macOS bugs reported by the user.
* We should preserve Windows behavior while fixing macOS-specific regressions.
* Secondary window placement should clamp to the monitor work area, not raw display bounds.

## Requirements

* Fix the macOS tray icon so it renders at an appropriate menu-bar size instead of expanding to the full bar height.
* Remove compact/icon-mode edge artifacts on macOS without regressing Windows compact mode.
* Make first-launch managed runtime bootstrap for `ffmpeg` / `deno` complete reliably on macOS under slower network conditions.
* Make Settings and UI Lab open positions follow the same side-placement/clamping rule as Windows, adapted to macOS work-area constraints.

## Acceptance Criteria

* [ ] On macOS, the tray icon uses a menu-bar-safe image size and no longer appears oversized.
* [ ] On macOS, icon mode does not show shell/edge ghosting artifacts around the compact icon.
* [ ] On a clean macOS config with missing managed runtimes, bootstrap can progress to completion without premature timeout on normal slower networks.
* [ ] Settings and UI Lab open beside the anchor window and stay clamped within the usable monitor work area on macOS.
* [ ] Existing automated tests covering window placement and runtime/bootstrap logic are updated or added as needed.

## Definition of Done

* Tests added/updated where behavior changed.
* `npm run lint`, `npm run type-check`, and targeted tests pass.
* Changes stay scoped to the reported macOS parity issues.

## Out of Scope

* Reworking the general main-window layout or icon artwork brand direction.
* Broad context-menu placement refactors unless required by the same root cause.
* Changing bundled downloader supply-chain behavior beyond what is needed for managed runtime bootstrap reliability.

## Technical Approach

Patch the Electron tray image creation path for macOS, make the minimized shell rendering explicitly transparent on macOS icon mode, relax the managed-runtime download stall timeout for first-run archives, and normalize monitor work-area coordinates used by secondary window placement.

## Decision (ADR-lite)

**Context**: The reported bugs are clustered around Electron/macOS integration boundaries rather than core business logic.

**Decision**: Fix the issues in the existing Electron/main-window architecture with narrowly scoped platform-aware changes instead of introducing new abstractions or a separate macOS windowing path.

**Consequences**: This keeps the write set small and preserves current Windows behavior, but it requires careful regression coverage on the placement and runtime-bootstrap helpers.

## Technical Notes

* Likely files:
  * `electron/main.mts`
  * `src/App.tsx`
  * `src/pages/SettingsPage.tsx`
  * `src/utils/secondaryWindowPlacement.ts`
  * `src/utils/secondaryWindowPlacement.test.ts`
* Relevant specs:
  * `.trellis/spec/frontend/component-guidelines.md`
  * `.trellis/spec/frontend/type-safety.md`
  * `.trellis/spec/backend/type-safety.md`
  * `.trellis/spec/backend/sidecar-runtime-contracts.md`
  * `.trellis/spec/guides/cross-platform-thinking-guide.md`
