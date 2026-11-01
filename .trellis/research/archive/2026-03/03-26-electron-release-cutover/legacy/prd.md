# Electron release pipeline cutover

## Goal

Replace Tauri-based development, packaging, updater, and release automation with Electron-based tooling that supports Windows and macOS distribution.

## Requirements

* Replace Tauri dev/build/package scripts in `package.json`.
* Introduce Electron packaging and updater configuration.
* Preserve the repo versioning contract centered on `npm run version:set -- <version>`.
* Replace Tauri updater/release artifact assumptions in scripts and CI.
* Update README and release documentation once Electron becomes the runtime of record.
* Ensure Windows and macOS artifacts are defined from the start.

## Acceptance Criteria

* [ ] Dev/build/package entrypoints no longer depend on Tauri once cutover is complete.
* [ ] Windows and macOS packaging/updater outputs are defined for Electron.
* [ ] CI/release workflow assumptions match Electron artifact names and update metadata.
* [ ] Documentation reflects Electron runtime requirements and commands.

## Out of Scope

* Rewriting renderer logic.
* Porting native integrations not directly needed for packaging/release.
* Final deletion of Tauri source before verification is complete.

## Technical Notes

* Key files:
  * `package.json`
  * `scripts/run-tauri.mjs`
  * `scripts/dev-all.mjs`
  * `scripts/package-portable.ps1`
  * `src-tauri/tauri.conf.json`
  * `.github/workflows/`
  * `README.md`
  * `README.en.md`
* Relevant specs:
  * `.trellis/spec/guides/release-prep-guide.md`
  * `.trellis/spec/guides/cross-platform-thinking-guide.md`

## Implementation Notes

* Default packaging direction:
  * Electron builder
  * Windows NSIS
  * macOS DMG + zip/update artifacts
