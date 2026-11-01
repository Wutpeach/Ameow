# Update yt-dlp pinned version

## Goal

Update the repository-owned pinned `yt-dlp` managed runtime version to `2026.06.09` so packaged Ameow releases ship that exact downloader version.

## Requirements

- Update the managed Python package manifest for `yt-dlp` to pin `2026.06.09`.
- Keep the pinned-version metadata consistent anywhere repository tests assert the explicit `yt-dlp` package version or install source.
- Do not change the managed update model. Users must continue to receive the downloader only through app releases, not self-service runtime updates.

## Acceptance Criteria

- [ ] `resolvePinnedManagedPythonPackage("yt-dlp")` returns `packageVersion: "2026.06.09"` and `installSource: "yt-dlp==2026.06.09"`.
- [ ] Repository tests that validate the pinned `yt-dlp` metadata are updated to the new version and pass.
- [ ] No unrelated runtime package versions or update-channel behavior change.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
