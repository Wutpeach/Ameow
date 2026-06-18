# Improve login state discovery

## Goal

Make Ameow's site login-state/cookie capture feature discoverable from the full main window after the app is usable, without forcing users into Settings or documentation first.

The target user problem is that many users do not realize Ameow can reuse an existing browser login session for supported sites. Today, only users who read docs, open the browser extension popup, or explore Settings are likely to discover the workflow.

## Confirmed Facts

- Browser-extension popup already has a login-state panel with copy such as "使用当前浏览器的登录 Cookies 供后续下载。"
- Desktop Settings already has a "站点会话、登录捕获、Cookies" area, site login badges, and pending-site login-state strings.
- The app already tracks pending site-session actions in `src/App.tsx` and can summarize sites that need browser login state, but that pending-action mechanism is site-specific and should not be overloaded as the general feature-discovery reminder.
- Existing docs include browser-extension pages under `site/src/content/docs/**/browser-extension.mdx`.
- Past work added scheduled site-session cookie refresh and site-session recovery behavior, so the capability is not new.
- Product design guidance favors compact inline status, badges, and hints over loud warning blocks or modal-first flows.
- Code evidence supports a local-only cookie boundary: extension sync reads browser cookies with `chrome.cookies.getAll(...)`, Electron validates/filter domains, and snapshots are written under `<userDataDir>/site-sessions/<siteId>.json`.
- The saved session manager exposes local Netscape cookie content for downloader execution; no cookie upload path was found in the site-session sync/storage code reviewed for this planning task.
- Runtime already has bounded auth-required recovery and `autoSyncAllowed` concepts for known/approved site-session entries.
- `src/App.tsx` currently renders a full-window lower-left site-session pending indicator when `siteSessionPendingActions.count > 0`; the new discovery reminder can reuse the visual area and component shape, but its display condition is different.
- `src/App.tsx` also renders a separate runtime dependency indicator in the same lower-left area. The runtime indicator uses warning/yellow states for bootstrap/runtime attention and must remain a separate behavior.
- The current site-session pending indicator uses a breathing warning/yellow status dot and hover popover. Its button currently calls `openSettings()`.
- Theme accent tokens already exist and match the full-window following border/accent language: `colors.accentSolid`, `colors.accentBorder`, `colors.accentGlow`, and `colors.accentText`.
- First-party seeded site-session configs currently cover Douyin, Bilibili, Xiaohongshu, YouTube, and Instagram. Each seed entry is created with `syncAuthorization: "seeded"` and `autoSyncAllowed: true`.
- A broader hidden gallery-dl cookie catalog exists for additional gallery-dl-supported sites where cookies may be useful, such as Patreon, Pinterest, Twitter/X, TikTok, Facebook, Boosty, Fantia, Fanbox, Poipiku, and others. This is not the full gallery-dl supported-sites list, and not every download from these sites necessarily requires login state.
- `galleryDlSupportedProvider` can route gallery-dl-supported URLs into a download intent, but its `intent.siteId` may be a host-derived value while registry entries may use shorter catalog ids. Download-time session sync must therefore support URL/domain registry matching, not only exact `siteId` lookup.
- Existing auth-required recovery already performs bounded automatic extension sync and one retry for eligible seeded/user-enabled entries when a download fails with `auth_required`.
- Existing scheduled refresh only refreshes activated/saved sessions and does not read all seeded sites at startup.
- Product decision: download-start sync should use a short wait. If the matching site's cookies can be synced quickly, attach them to the first downloader attempt; if the extension is disconnected, slow, or fails, continue the download and rely on existing auth-required recovery as fallback.

## Product Principles

- Document the local-only boundary clearly: cookies are saved on the user's machine for downloader use and are not uploaded by Ameow.
- Treat cookies/login state as sensitive session material. Users should see why Ameow wants it, which site it applies to, and how to trigger or avoid capture.
- Prefer in-product discovery over documentation-only education.
- Keep the path convenient: the user should not have to remember where Settings or extension popup controls are.
- Make the first main-window decision explicit: ignore the reminder or confirm Ameow may read the relevant site's login state.
- Respect the user's ignore choice by hiding the full-window reminder, while keeping Settings as the manual recovery/enablement surface.
- Do not change the runtime/bootstrap yellow indicator behavior as part of the login-state reminder redesign.
- Ignore means only "do not show this full-window lower-left login-state discovery status point again"; it must not disable site-session support, Settings entries, extension popup controls, future auth-required handling, or any site-specific state.
- Confirm should enable convenient, site-scoped behavior. It should not immediately sync every known site.

## Requirements

- Add a semi-persistent full-window lower-left login-state discovery status point.
- The discovery status point should appear after bootstrap/runtime dependency attention is no longer occupying the lower-left runtime status point. For old users who already have runtime dependencies installed, it should be visible in the full window on startup unless dismissed.
- The discovery status point must not depend on opening a supported website or having a site-specific pending action.
- If the runtime/bootstrap yellow indicator is active, it has priority; the login-state discovery point should appear after that indicator resolves or no longer needs attention.
- Use the theme accent blue tokens so the login-state discovery point matches the full-window following border/accent language:
  - center dot: `colors.accentSolid`
  - ring/border: `colors.accentBorder`
  - breathing glow: `colors.accentGlow`
  - emphasized prompt text when needed: `colors.accentText`
- Keep a breathing/pulsing animation for the discovery point while it is visible, respecting reduced-motion settings.
- Clicking the discovery point must open a compact floating popover inside the full main window, reusing the bootstrap/runtime popover surface style and motion language.
- The discovery popover must not open Settings by default.
- The discovery popover must have exactly two primary choices:
  - Ignore: hide this full-window login-state discovery status point in future.
  - Confirm: enable automatic, site-scoped login-state sync through the existing browser-extension site-session sync path when applicable.
- The popover must explain the concrete benefit in compact Chinese and English copy. Do not include the local-only/no-upload privacy sentence in the app popover; that explanation belongs in README and docs-site copy because the full main window is space constrained.
- The confirm action must not immediately sync all supported sites.
- After confirmation, when the user downloads a URL that matches a known first-party seeded site or gallery-dl cookie catalog entry and no ready saved session exists, Ameow should attempt to sync only that site's browser cookies before the downloader attempt.
- First iteration auto-sync scope includes both:
  - seeded site-session configs: Douyin, Bilibili, Xiaohongshu, YouTube, Instagram
  - hidden gallery-dl cookie catalog entries when the current download URL/domain matches the catalog entry
- Download-time sync must activate/promote a hidden gallery-dl catalog entry into Settings visibility when it successfully saves a snapshot, so the user can see and manage the resulting login state.
- The implementation should reuse the existing browser-extension / site-session sync flow rather than inventing a separate cookie path.
- Existing `auth_required` sync-and-retry remains a fallback when pre-download sync is skipped, unavailable, or insufficient.
- Saved sessions keep the existing refresh behavior:
  - scheduled refresh keeps using the existing scheduler/backoff/TTL model
  - advanced-quality pre-probe refresh remains available for enabled sites
  - `auth_required` recovery remains bounded and retry-once
- After any download-time sync succeeds, the saved site-session state should be reflected by the existing Settings badges and downloader cookie injection.
- Download-start sync should wait only briefly and must never leave the user with a stalled download button.
- The prompt must not block downloads that can proceed without login state.
- If the user ignores the reminder, only the full-window lower-left login-state discovery status point stops appearing. Settings, extension popup, site-specific pending actions, and auth-required recovery remain available.
- Persist the ignored state locally so the discovery point stays hidden across restarts.
- Settings must expose a way to enable/manage download-time login-state auto sync, so users who ignored the blue discovery point can still turn the feature on later.
- Documentation for browser-extension and supported-site workflows must be updated if user-facing behavior changes.
- README and docs-site copy must state the local-only storage model, the storage purpose, and the fact that Ameow does not upload cookie/session content.
- Telemetry, if added, must avoid recording cookie values, account identifiers, or raw protected URLs.

## Acceptance Criteria

- [ ] A new or existing user can discover login-state capture from the full main window after bootstrap/runtime attention is clear, without opening Settings or reading docs first.
- [ ] The blue discovery point appears in the full-window lower-left area even before the user opens a supported website, unless the user previously ignored it.
- [ ] A user can decline/ignore the discovery point and continue using normal download behavior.
- [ ] The in-app popover stays compact and does not include the local-only/no-upload privacy sentence.
- [ ] Clicking the blue discovery point opens a compact floating popover in the full main window instead of jumping to Settings.
- [ ] The popover reuses the bootstrap/runtime popover surface language and offers Ignore and Confirm.
- [ ] Clicking Confirm enables download-time, site-scoped automatic login-state sync rather than syncing every known site immediately.
- [ ] After Confirm, downloading a supported seeded site can trigger sync for only that site's cookies when no ready session exists.
- [ ] After Confirm, downloading a URL that matches a hidden gallery-dl cookie catalog entry can trigger sync for only that catalog site's cookies when no ready session exists.
- [ ] Successful download-time sync for a hidden catalog entry makes it visible/manageable in Settings.
- [ ] The first iteration recognizes seeded entries and gallery-dl cookie catalog entries as eligible download-time site-session targets.
- [ ] Saved sessions continue to use the existing scheduled refresh, advanced-quality refresh where applicable, and auth-required retry mechanisms.
- [ ] Download-start sync uses a short timeout; timeout/failure continues the download.
- [ ] Existing auth-required sync-and-retry behavior continues to work as a fallback.
- [ ] Clicking Ignore hides only the full-window login-state discovery point across restarts and does not remove Settings, extension popup, or site-specific recovery access.
- [ ] Settings exposes an entry/control for enabling or managing download-time login-state auto sync after the discovery point is ignored.
- [ ] The login-state discovery point uses theme accent blue tokens and is visually distinct from the runtime yellow status indicator.
- [ ] Runtime/bootstrap indicator behavior remains unchanged.
- [ ] Existing Settings and extension popup entry points continue to work.
- [ ] Chinese and English locale strings are updated consistently.
- [ ] Relevant docs-site pages are updated if the interaction changes.
- [ ] README or docs-site privacy copy clearly says login cookies are saved locally and not uploaded by Ameow.

## Out Of Scope

- Broadly expanding supported sites.
- Replacing the existing site-session persistence format.
- Uploading cookies or login state to any remote service.
- Making downloads require login-state capture by default.

## Open Questions

- None. Current compact popover copy is documented in `design.md`.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
