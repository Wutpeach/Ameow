# Fix mac packaged app missing zod dependency

## Goal
Ensure packaged macOS FlowSelect builds include the runtime dependency required by Electron main-process schema modules so the installed app launches successfully.

## Requirements
- Move the `zod` package into production dependencies so Electron Builder ships it inside packaged app bundles.
- Keep the change scoped to packaging/runtime dependency declaration and do not alter app behavior or packaging format.
- Rebuild the macOS ARM64 unsigned DMG locally after the dependency fix.

## Acceptance Criteria
- [ ] `package.json` declares `zod` under `dependencies`.
- [ ] The rebuilt packaged app contains `node_modules/zod` inside `FlowSelect.app/Contents/Resources/app/`.
- [ ] A new macOS ARM64 DMG is produced and the prior `ERR_MODULE_NOT_FOUND: Cannot find package 'zod'` packaging defect is addressed.

## Technical Notes
- This bug affects packaged Electron builds because schema files in `dist-electron/src/core/schemas/*.js` import `zod` at runtime in the main process.
- Local development can mask the defect if `node_modules/zod` exists in the repo root even when the packaged app omits it.
