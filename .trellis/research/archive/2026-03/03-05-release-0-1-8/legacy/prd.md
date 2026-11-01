# Release 0.1.8

## Goal
Bump project version to `0.1.8`, push to remote, and push tag to trigger GitHub Actions build.

## Requirements
- Update all release-required version files to `0.1.8`.
- Keep version values consistent across frontend/backend/config/UI display.
- Commit only the version bump related files.
- Push commit to `origin/main`.
- Create and push tag `v0.1.8`.

## Acceptance Criteria
- [ ] `package.json` version is `0.1.8`.
- [ ] `src-tauri/Cargo.toml` version is `0.1.8`.
- [ ] `src-tauri/tauri.conf.json` version is `0.1.8`.
- [ ] `src/pages/SettingsPage.tsx` displays `v0.1.8`.
- [ ] Commit is pushed to remote.
- [ ] Tag `v0.1.8` is pushed and can trigger Actions.

## Technical Notes
- Follow release process documented in `.trellis/spec/backend/index.md`.
- Use explicit file staging; do not use wildcard add or `-a`.
