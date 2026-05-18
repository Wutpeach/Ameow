# Fix mac packaged app missing macAppVisibility module

## Goal
Fix the macOS packaged app startup failure where Electron main cannot resolve `electron/macAppVisibility.mjs` after installation on another machine.

## Requirements
- Reproduce and trace how `electron/main.mjs` imports `macAppVisibility.mjs` in packaged builds.
- Ensure the packaged app always includes and resolves the macOS helper module at runtime.
- Keep development behavior unchanged on macOS and other platforms.

## Acceptance Criteria
- [ ] Packaged Electron main no longer throws `ERR_MODULE_NOT_FOUND` for `macAppVisibility.mjs`.
- [ ] The import path for the macOS helper is valid in packaged builds.
- [ ] Relevant packaging or runtime tests pass.

## Technical Notes
- This is a macOS packaged Electron startup issue, likely involving build output layout or bundled resource inclusion.
- The fix must respect Electron runtime packaging contracts and cross-platform packaging rules.
