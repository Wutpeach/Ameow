# Bump Version To 0.2.8

## Goal
Update the app version to `0.2.8` using the repository-standard workflow.

## Requirements
- Use `npm run version:set -- 0.2.8` instead of hand-editing version strings.
- Verify the script updates the expected version files.
- Keep the resulting release note file aligned with the repository release-note format.
- Keep the work scoped to versioning and release-prep artifacts only.

## Acceptance Criteria
- [ ] `package.json` reports version `0.2.8`.
- [ ] `src/constants/appVersion.ts` reports version `0.2.8`.
- [ ] Tauri version files are updated to `0.2.8`.
- [ ] `release-notes/v0.2.8.md` exists and is not left as raw template placeholders.

## Technical Notes
- The canonical entrypoint is `scripts/update-version.mjs` via `npm run version:set -- 0.2.8`.
- The script also scaffolds `release-notes/v0.2.8.md` when it does not already exist.
- This request does not imply tagging or pushing a release.
