# Prepare RC6 tag test build

## Goal
Prepare and push the next RC test release for the app by bumping the current version from `0.3.0-rc5` to `0.3.0-rc6`, creating the release note, and pushing the corresponding git tag.

## Requirements
- Bump the app version using `npm run version:set -- 0.3.0-rc6`.
- Add `release-notes/v0.3.0-rc6.md` in Chinese following the existing release-note style.
- Keep the release-prep change atomic and limited to versioned files plus release notes.
- Create a release-prep commit before tagging.
- Create and push the `v0.3.0-rc6` tag to `origin`.

## Acceptance Criteria
- [ ] Repo version metadata is updated to `0.3.0-rc6` through the standard version script.
- [ ] `release-notes/v0.3.0-rc6.md` exists and includes a `Full Changelog` compare line.
- [ ] `npm run type-check` and `npm run lint` pass.
- [ ] A release-prep commit is created with only the intended files.
- [ ] Tag `v0.3.0-rc6` is created locally and pushed to `origin`.

## Technical Notes
- Current package version is `0.3.0-rc5`, so the target release version is assumed to be `0.3.0-rc6`.
- Existing release notes under `release-notes/` should be used as the style reference.
- Since version values are shared across app targets, use the repository-standard version bump entrypoint instead of manual edits.
