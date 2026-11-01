# Electron verification and Tauri removal

## Goal

Verify feature parity after the Electron cutover and remove obsolete Tauri code, dependencies, and documentation only after the new runtime is proven stable.

## Requirements

* Define and execute a parity checklist for:
  * main window
  * settings window
  * context menu window
  * extension connectivity
  * download flows
  * config persistence
  * updater/build/release behavior
* Remove dead Tauri dependencies and source once parity gates pass.
* Update repository docs and maintenance expectations to treat Electron as the source of truth.

## Acceptance Criteria

* [ ] Electron parity is verified across the core desktop, extension, and download flows.
* [ ] Tauri dependencies are removed only after verification passes.
* [ ] `src-tauri/` is deleted or clearly deprecated as dead code once no longer needed.
* [ ] Documentation and scripts no longer instruct developers to use Tauri.

## Out of Scope

* Defining the migration contract from scratch.
* Early deletion of Tauri code before Electron parity is proven.

## Technical Notes

* Key files:
  * `src/`
  * `browser-extension/`
  * `scripts/`
  * `package.json`
  * `src-tauri/`
  * `README.md`
  * `README.en.md`
* Relevant specs:
  * `.trellis/spec/frontend/type-safety.md`
  * `.trellis/spec/backend/type-safety.md`
  * `.trellis/spec/guides/cross-layer-thinking-guide.md`
  * `.trellis/spec/guides/cross-platform-thinking-guide.md`

## Implementation Notes

* This task is the final gate. If parity is incomplete, Tauri cleanup must stop and remaining gaps should spawn explicit follow-up tasks instead of being hand-waved.
