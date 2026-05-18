# Sync browser extension version with app version

## Goal
Ensure the browser extension version stays aligned with the app version and is updated by the existing `npm run version:set -- <version>` entrypoint.

## Requirements
- Update the current browser extension manifest version to match the current app version.
- Extend the existing version update script so it also updates `browser-extension/manifest.json`.
- Keep the existing version bump flow as the single source of truth for release versioning.

## Acceptance Criteria
- [ ] `browser-extension/manifest.json` version matches the current app version.
- [ ] Running `npm run version:set -- <version>` updates the browser extension manifest version together with the app version files.
- [ ] Browser extension packaging behavior continues to work with the updated version metadata.

## Technical Notes
- Reuse `scripts/update-version.mjs` instead of adding a separate extension version script.
- Keep the change compatible with the existing release workflow and browser extension packaging contract.
