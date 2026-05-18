# Fix mac window-to-icon transition jitter

## Goal
Stabilize the macOS main-window-to-icon transition so the compact animation no longer shows subtle offset drift or flicker while preserving the existing Windows behavior.

## Requirements
- Keep the existing icon-to-window expand behavior intact.
- Remove the macOS-specific visual owner swap that currently happens during the window-to-icon transition.
- Preserve the current transition-token protection around compact/full native bounds requests.
- Keep the fix scoped to the main window compact transition path.

## Acceptance Criteria
- [ ] On macOS, repeated main-window-to-icon transitions no longer show visible offset drift.
- [ ] On macOS, repeated main-window-to-icon transitions no longer show one-frame flicker from transparent shell or layer swapping.
- [ ] On Windows, the current compact transition behavior remains unchanged.
- [ ] Compact/full transition token guards still prevent stale async callbacks from committing bounds changes.

## Technical Notes
- The current regression comes from a non-symmetric transition path: expand uses a dedicated morph layer, while collapse swaps visible surfaces before the native window resize settles.
- The fix should keep a single visible surface active through the collapse path, then commit the final minimized render state after the native compact bounds resize completes.
