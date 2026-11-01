# Custom macOS create-dmg packaging workflow

## Goal
Replace the current plain `hdiutil` macOS DMG packaging flow with a reusable `create-dmg` based custom installer layout for FlowSelect.

## Requirements
- Keep the existing macOS ZIP packaging flow unchanged.
- Replace the DMG creation step in `scripts/package-macos-open-source-dmg.mjs` with `create-dmg`.
- Package the latest browser extension ZIP into the DMG during the macOS packaging flow.
- Include `Install FlowSelect on macOS.txt` inside the DMG.
- Use `background.png` in the repo root as the DMG background.
- Use a reusable `.icns` volume icon generated from `app-icon.png` when no `.icns` asset exists yet.
- Apply the agreed DMG layout:
- Window size `638x360`
- Global icon size `100`
- Text size `14`
- Volume name `FlowSelect Installer`
- `Applications` at `97 157`
- `FlowSelect.app` at `439 157`
- `Install FlowSelect on macOS.txt` at `198 22`
- `FlowSelect_<version>_browser_extension.zip` at `340 22`

## Acceptance Criteria
- [ ] `npm run package:macos-open-source-dmg -- --arch aarch64 --skip-build` uses `create-dmg` with the custom layout.
- [ ] The packaging script generates or reuses a valid `.icns` volume icon derived from `app-icon.png`.
- [ ] The latest browser extension ZIP is created before DMG generation and included in the DMG.
- [ ] The install guide text file is included in the DMG.
- [ ] The DMG output naming stays compatible with the current release workflow.

## Technical Notes
- This task modifies packaging scripts only.
- The script remains macOS-only and may depend on `create-dmg`, `sips`, and `iconutil`.
- Prefer deterministic staging and cleanup so repeated local packaging runs do not leave stale artifacts behind.
