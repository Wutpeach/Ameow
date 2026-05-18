# Unify startup animation behavior across dev and packaged builds

## Goal
Make the icon-to-main-window startup transition follow the same startup-mode contract in Electron dev, portable ZIP builds, and installed packaged builds.

## Requirements
- Replace renderer-side startup-mode inference based on first-frame window size with an explicit runtime-owned startup-mode contract.
- Keep the existing main-window compact startup behavior on Windows while making the mode source deterministic across runtime variants.
- Preserve existing preload-only Electron bridge architecture and avoid direct renderer imports from Electron.
- Keep current animation timings unless a timing mismatch is caused by divergent startup-state initialization.

## Acceptance Criteria
- [ ] Dev, portable, and installer builds use the same startup-mode source of truth for the main window.
- [ ] Renderer no longer decides compact startup mode by guessing from `window.innerWidth` / `window.innerHeight`.
- [ ] Main-window startup transition behavior stays stable after the explicit startup-mode contract is introduced.
- [ ] Typecheck and relevant startup tests pass.

## Technical Notes
- Cross-layer change spans Electron main, preload bridge, renderer bootstrap/state, and startup tests.
- Prefer a current-window bridge method or equivalent runtime-owned payload over environment heuristics.
- Do not weaken packaged transparent-window startup safeguards while fixing animation parity.
