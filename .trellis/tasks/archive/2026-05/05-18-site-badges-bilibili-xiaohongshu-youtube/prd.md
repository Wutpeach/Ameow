# Add site badges for Bilibili, Xiaohongshu, and YouTube

## Goal

Extend the Settings site login states area beyond Douyin so Bilibili, Xiaohongshu, and YouTube can surface compact login badges with a shared Playwright-backed session flow where supported, and route captured site cookies into the matching downloader paths as part of the same feature.

## Confirmed Facts

- The app already has an app-owned Playwright login/session flow for Douyin.
- The Settings page already renders a compact site-login badge pattern for Douyin.
- The codebase already has site modules for Bilibili, Xiaohongshu, and YouTube.
- The request is about continuing the existing badge pattern, not inventing a new settings surface.

## Requirements

- Add badge entries for Bilibili, Xiaohongshu, and YouTube in the site login states area.
- Each badge must show only the primary session state: `已登录`, `失效`, or `未登录`.
- Each state must use a single status dot color: green for `已登录`, red for `失效`, gray for `未登录`.
- Badge clicks must trigger the app-owned Playwright session flow when the site supports it.
- The click action should be the same user-facing action for missing, expired, and ready sessions: start or refresh the session capture flow.
- The design must not promise automatic silent login or background cookie refresh unless the implementation can actually do it.
- Site badges must be backed by a site-aware cookie/session path so the captured cookies can be consumed by the relevant downloader, not only by the Douyin path.
- Keep the section compact and aligned with the current Settings layout.

## Open Questions
- None.

## Acceptance Criteria

- [ ] The Settings page shows badge entries for Bilibili, Xiaohongshu, and YouTube.
- [ ] Each badge shows only one of the three primary session states and the matching status dot color.
- [ ] Clicking a badge starts or refreshes the Playwright session capture flow for supported sites.
- [ ] The UI does not imply automatic silent cookie refresh if the underlying flow still requires user login.
- [ ] The new badges do not break the current Douyin badge behavior.
- [ ] The captured session can be consumed by the matching downloader path for the site.
- [ ] Lint and typecheck pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
