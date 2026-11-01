# Remove videodl Build Chain From Release Workflow

## Goal
Ensure GitHub release builds no longer execute any videodl-related setup/build steps and only package the currently supported runtime dependencies.

## Requirements
- Remove Windows `Setup Python` and `Build videodl-server` steps from `.github/workflows/release.yml`.
- Remove macOS `Setup Python` and `Build videodl-server` steps from `.github/workflows/release.yml`.
- Keep existing yt-dlp + Deno download/build steps intact.
- Preserve artifact upload and release creation jobs.

## Acceptance Criteria
- [x] `release.yml` has no `videodl` references.
- [x] `release.yml` has no references to `scripts/videodl_http_server.py`.
- [x] Windows and macOS build jobs still contain yt-dlp and Deno steps.
- [x] Workflow YAML remains syntactically valid.

## Technical Notes
- This task is workflow-only; runtime code paths were already migrated to direct + yt-dlp.
- Keep changes minimal and scoped to stale videodl chain removal.
