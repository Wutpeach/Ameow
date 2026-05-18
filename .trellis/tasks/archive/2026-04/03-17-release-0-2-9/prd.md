# Release 0.2.9

## Goal
Prepare and publish version `0.2.9` using the repository release workflow so GitHub Actions can build the tagged release artifacts.

## Requirements
- Update all repository-managed app version files via `npm run version:set -- 0.2.9`.
- Ensure `release-notes/v0.2.9.md` exists and is filled with user-facing notes based on changes since `v0.2.8`.
- Keep the release commit atomic and scoped to release-prep files only.
- Push the release commit to `origin/main`.
- Push tag `v0.2.9` so the `Release` workflow is triggered.

## Acceptance Criteria
- [ ] Versioned files show `0.2.9`.
- [ ] `release-notes/v0.2.9.md` is present with a valid full changelog compare link.
- [ ] A release-prep commit is created on `main` and pushed to `origin`.
- [ ] Tag `v0.2.9` is pushed to `origin`.
- [ ] GitHub Actions `Release` workflow is triggered for tag `v0.2.9`.

## Technical Notes
- Existing uncommitted version-related changes in `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock` must be reconciled without dropping user work.
- The release workflow is triggered only by pushing a `v*` tag.
