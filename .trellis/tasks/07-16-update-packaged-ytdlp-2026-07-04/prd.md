# Update packaged yt-dlp to 2026.07.04

## Goal

Update Ameow's packaged managed runtime `yt-dlp` pin to upstream release `2026.07.04` so distributed builds ship the current downloader version.

## Requirements

- Update the repository-owned managed Python package manifest for `yt-dlp` to pin `2026.07.04`.
- Keep explicit tests for the pinned `yt-dlp` package metadata in sync.
- Preserve the existing managed update model: users receive the downloader through app releases, not self-service runtime updates.
- Do not change unrelated managed runtime packages or bootstrap behavior.

## Acceptance Criteria

- [x] Upstream `yt-dlp` release `2026.07.04` is verified from an official source.
- [x] `resolvePinnedManagedPythonPackage("yt-dlp")` returns `packageVersion: "2026.07.04"` and `installSource: "yt-dlp==2026.07.04"`.
- [x] Runtime bootstrap tests that assert the pinned `yt-dlp` metadata are updated and pass.
- [x] No unrelated runtime package versions or update-channel behavior change.

## Notes

- Official sources checked on 2026-07-16: GitHub release `yt-dlp/yt-dlp@2026.07.04` and PyPI `yt-dlp 2026.7.4`, both dated 2026-07-04.
- `python -m pip install --dry-run --ignore-installed "yt-dlp==2026.07.04"` resolves to `yt_dlp-2026.7.4`.
- Lightweight PRD-only task.
