# Add site-level cookie injection for site badges

## Goal

Generalize the app-owned session/cookie injection path so captured site cookies can be passed to the correct downloader for each supported site badge.

## Requirements

- The cookie/session injection path must work by site, not only for Douyin.
- The implementation must preserve the existing Douyin behavior.
- The injected cookies must remain compatible with the current downloader interfaces for `yt-dlp` and `gallery-dl`.
- The site-level path should be usable by the badge flows for Bilibili, Xiaohongshu, and YouTube.

## Acceptance Criteria

- [ ] Site-specific captured cookies can be routed into the matching downloader execution path.
- [ ] Douyin continues to work as before.
- [ ] No badge claims a supported session flow unless its cookies can actually reach the downloader path.
- [ ] Lint and typecheck pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
