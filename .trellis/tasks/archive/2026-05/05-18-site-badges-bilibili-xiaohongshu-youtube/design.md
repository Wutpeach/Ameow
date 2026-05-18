# Design

## Scope

Add compact site-login badges for Bilibili, Xiaohongshu, and YouTube in the Settings page.

## UI Model

- Each badge is a compact pill with three visible parts in left-to-right order: site icon, site name, status text.
- Each badge exposes one visible state label only: `已登录`, `失效`, or `未登录`.
- The status dot is the primary visual signal:
  - `已登录` -> green
  - `失效` -> red
  - `未登录` -> gray
- No extra session details should appear in the badge body.
- Keep the badges visually consistent with the existing compact Settings panel style.
- Keep the icon small and fill-based so it fits a compact badge and does not depend on the stroke-based app icon wrapper.

## Interaction Model

- Clicking any supported badge should open the existing Playwright-backed session capture flow.
- The action label can stay generic, but the underlying action is the same across missing, expired, and healthy sessions: capture or refresh the session.
- Do not add separate behaviors for "login", "re-login", and "refresh cookie" unless the backend truly differentiates them.

## Capability Model

- The current Douyin flow is a manual, app-owned Playwright capture:
  - it starts a browser/login flow
  - the user completes login manually
  - the app persists cookies after confirmation
- There is no evidence of a silent background refresh path in the current implementation.
- Therefore, the new badges should treat "refresh" as "re-run the capture flow to update cookies", not as an automatic invisible refresh.
- The captured cookies are not Douyin-only in principle; they are reusable by any downloader that accepts the same Netscape `cookies.txt` style jar, including `yt-dlp` and `gallery-dl`.
- The cookies are still site-specific in practice: a Bilibili cookie jar only helps Bilibili, a YouTube jar only helps YouTube, and so on.

## State Mapping

- `未登录` when no usable session exists.
- `失效` when stored session cookies exist but are incomplete or unusable.
- `已登录` when a usable session exists.
- Any transient in-progress capture state should not introduce a new visible badge state unless a later implementation explicitly needs it.

## Risks

- If a site cannot support a Playwright-backed capture flow yet, its badge should not claim login/refresh interactivity it cannot perform.
- Avoid exposing a false sense of automatic cookie maintenance.
- Do not depend on the full `simple-icons` package at runtime; if icons are sourced from Simple Icons, vendor only the few used logos as local SVG path data or a tiny local icon module.
- Preserve text fit on narrow Settings widths; the longest site label and status string must stay inside the pill without truncating the icon.
