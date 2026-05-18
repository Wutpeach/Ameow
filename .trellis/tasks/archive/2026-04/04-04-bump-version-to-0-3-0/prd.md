# Bump version to 0.3.0

## Goal
Update the application version to `0.3.0` using the repository-standard versioning flow and ensure release prep artifacts are present.

## Requirements
- Update the app version to `0.3.0` via `npm run version:set -- 0.3.0`.
- Ensure `release-notes/v0.3.0.md` exists and is filled with user-facing release content.
- Keep the change scoped to release-prep files required for the version bump.

## Acceptance Criteria
- [ ] `package.json`, `package-lock.json`, `browser-extension/manifest.json`, and `src/constants/appVersion.ts` reflect `0.3.0`.
- [ ] `release-notes/v0.3.0.md` exists and includes a valid compare link.
- [ ] Relevant validation commands for this task complete successfully.

## Technical Notes
- Do not manually edit scattered version strings; use the repository script entry point.
- This repository currently uses the Electron layout and does not contain `src-tauri/` version files.
- Prefer the previous release tag `v0.2.9` for the compare range unless repo history indicates otherwise.
