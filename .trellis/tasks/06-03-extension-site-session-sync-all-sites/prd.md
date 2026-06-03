# Dynamic extension site-session sync

## Goal

Replace the static site-session model and old app-window login/capture flow with a dynamic login-state system driven by download/auth evidence and browser-extension cookie sync.

The product goal is to keep Ameow focused on downloading: users should not configure advanced cookie settings manually. When Ameow learns that a site likely needs cookies, or when a user explicitly enables login-state sync for the current browser site, the site should appear in a login-state list in Settings and in the browser extension. Users can sync cookies from the browser where they are already logged in. If a site has no known icon, Ameow should use a placeholder.

## Confirmed Facts

- The previous YouTube-only extension sync task has been implemented, manually tested, committed, and archived.
- YouTube extension sync can successfully acquire YouTube cookies from the user's normal browser through the Ameow extension.
- Current supported site-session ids are:
  - `douyin`
  - `bilibili`
  - `xiaohongshu`
  - `youtube`
  - `instagram`
- Current site cookie domains and readiness markers live in `src/site-sessions.ts`.
- Current cookie domain configuration:
  - Douyin: `douyin.com`
  - Bilibili: `bilibili.com`, `b23.tv`
  - Xiaohongshu: `xiaohongshu.com`, `xhslink.com`
  - YouTube: `youtube.com`, `google.com`
  - Instagram: `instagram.com`
- Current readiness keys:
  - Douyin required: `ttwid`, `odin_tt`, `passport_csrf_token`; login markers: `sessionid`, `sid_tt`, `sid_guard`
  - Bilibili required/login marker: `SESSDATA`
  - Xiaohongshu required/login marker: `web_session`
  - YouTube login markers: `LOGIN_INFO`, `__Secure-1PSID`, `__Secure-3PSID`, `SID`
  - Instagram login marker: `sessionid`
- `browser-extension/site-session-cookie-sync.js` currently hardcodes only a YouTube supported-site whitelist.
- Settings currently routes only YouTube badges through `sync_site_session_from_extension`; other sites still use `start_site_session_capture` for the main badge action and `refresh_site_session_credentials` for the small refresh button.
- Backend currently rejects `sync_site_session_from_extension` for any site except YouTube.
- The existing `SiteSessionManager.importSnapshot(...)` path already validates and persists extension-provided structured cookie records into the same app-owned snapshot shape as Electron capture.
- Existing download execution reads Settings-owned persisted snapshots; browser-extension cookie payloads must not become generic per-download cookie fallbacks.
- Legacy Douyin alias commands still exist for compatibility:
  - `start_douyin_session_capture`
  - `complete_douyin_session_capture`
  - `cancel_douyin_session_capture`
  - `clear_douyin_session`
- Runtime auth-failure retry currently calls `refreshSiteSessionCredentials(...)`, which delegates to `manager.refreshCredentials()` and re-reads cookies from the app-owned stable Electron partition.
- If the app-owned login/capture profile is removed, auth-failure assisted refresh cannot keep using `refreshCredentials()` and should either be removed or redesigned around an explicit user-initiated Settings sync.
- Download failures can be classified as `auth_required`, and runtime plans/intents often carry `siteId`, `siteHint`, or enough URL information to infer a host.
- The current Settings site-session list is static and rendered from `SITE_SESSION_CONFIGS`.
- The current Settings icon mapping is static through `SITE_SESSION_LOGOS`; there is no dynamic favicon/site-icon persistence path yet.
- There is no current dynamic site-session config store for user-discovered domains, cookie domains, login markers, display names, or icons.
- gallery-dl's supported-sites document includes an Authentication column and marks many sites as using Cookies, including examples such as Instagram, Patreon, Pinterest, TikTok, and Twitter/X.
- gallery-dl's README documents using cookies from a browser login session for sites where username/password login is not possible or not implemented.
- yt-dlp's supported-sites document lists extractors, but explicitly says unlisted sites may still work through embed extraction or the generic extractor and that the reliable check is trying the URL.
- User wants unknown/current browser sites to expose a manual login-state sync entry in the extension, not only sites discovered after failed downloads.
- User prefers icons to be available locally when practical, rather than depending on live network icon URLs.
- User wants auth/login-related download failures to add the site to the login-state list and automatically acquire cookies when possible, instead of always waiting for a later manual Settings sync.
- User wants newly discovered unknown sites that still need user enablement to surface as a yellow-dot reminder in the full desktop window's lower-left area, matching the existing bootstrap warning-dot visual language.
- User wants the browser extension to continue reminding users on later visits to discovered-but-unsynced sites through an extension icon dot and popup-top sync CTA.

## Revised Scope

- Replace static-only site-session handling with a dynamic site-session registry.
- Seed the registry with known first-party entries:
  - Douyin
  - current `SITE_SESSION_CONFIGS` sites
  - gallery-dl sites marked as `Cookies` where practical as an initial known-cookie catalog
- Add runtime discovery:
  - when a download fails with `auth_required`, infer a site-session candidate from `intent.siteId`, `siteHint`, URL host, and engine id
  - persist the candidate so Settings can show it
  - notify the browser extension so its login-state sync UI can highlight the current site when applicable
- Add browser-extension login-state management/sync UI:
  - show current page/site candidate
  - show known sites needing cookies
  - enable a sync button when the current tab/site is known or discovered as cookie-needed
  - allow a manual "enable login-state sync for this site" entry on currently unknown sites
  - send structured cookies to desktop through the existing WS channel
- Keep first-time cookie access for unknown sites user-initiated through Settings or the extension.
- Allow automatic cookie sync on auth failures only for sites that are seeded or explicitly enabled by the user.
- Keep Settings as the desktop management surface for login-state entries; the browser extension is the browser-side discovery/sync surface.
- Keep manual cookie import out of scope.
- Keep automatic background cookie scanning out of scope.
- Preserve the saved `<userDataDir>/site-sessions/<siteId>.json` snapshot contract so downloader execution does not need a new cookie source.
- Settings and extension should both show the same dynamic login-state registry.
- Per user decision, remove the old app-owned login/capture window path completely in this task instead of keeping hidden legacy code.

## Phased Delivery

Implementation should proceed one phase at a time under this single task. Each phase has its own acceptance checkpoint, but the Trellis task remains incomplete until all five phases and final verification pass.

### Phase 1: Registry foundation and old-path removal

- Add the desktop-owned dynamic site-session registry.
- Seed current known sites from existing `SITE_SESSION_CONFIGS`.
- Replace static site-id validation with registry validation.
- Keep existing saved cookie snapshots readable.
- Refactor `SiteSessionManager` to import/snapshot ownership only.
- Remove Electron app-window login/capture code, capture commands, legacy Douyin capture aliases, and capture UI state.
- Keep Settings using registry entries with sync/clear actions.

Phase 1 is complete when current known sites can sync through extension-backed registry entries, saved snapshots still inject into downloads, and old capture windows cannot be opened from any active command/UI path.

### Phase 2: Browser-extension discovery and user-enabled unknown sites

- Push registry-approved entries from desktop to connected extensions.
- Add browser-extension popup login-state panel.
- Add current-tab eligibility detection.
- Allow unknown current-tab sites to be manually enabled with exact-host cookie scope.
- Add extension icon/popup reminders for discovered-but-unsynced sites.
- Add full-window lower-left yellow-dot reminder for pending login-state actions.

Phase 2 is complete when users can enable/sync a previously unknown current browser site from the extension, and both desktop and extension remind users about discovered-but-unsynced entries.

### Phase 3: Auth-failure discovery and bounded auto-sync

- On `auth_required` download failures, derive and upsert a registry candidate.
- For pure auto-discovered sites, add reminders but do not read cookies until the user enables/syncs.
- For seeded or user-enabled sites with auto-sync allowed, request extension sync with a short timeout.
- Retry the failed download at most once after successful sync.

Phase 3 is complete when login/cookie failures automatically create registry entries and seeded/user-enabled sites can recover once through bounded extension sync without blocking the queue indefinitely.

### Phase 4: Icon local caching

- Use known local icons for seeded entries.
- Use placeholder icons for unknown entries immediately.
- Cache available favicons/local icon assets when practical.
- Ensure UI rendering does not rely on live remote icon URLs.

Phase 4 is complete when known and dynamic entries render stable local/placeholder icons across Settings and extension UI.

### Phase 5: gallery-dl catalog import

- Create or generate a checked-in catalog seed from gallery-dl supported sites marked as cookie/authentication relevant.
- Map safe site ids, display names, primary hosts, cookie domains, engine hints, and icons where available.
- Do not fetch live GitHub catalog data at runtime.
- Treat catalog entries as hidden recognition/authorization metadata by default.
- Do not show unsynced catalog-only entries in Settings or the extension list.
- Promote a catalog entry into the visible login-state list only after the user syncs that site, manually enables the current tab, or a download/auth failure discovers it.
- Keep yt-dlp fully dynamic/discovery-based rather than trying to preseed every extractor.

Phase 5 is complete when gallery-dl cookie-needed sites can be seeded in bulk through a maintainable local catalog, used for matching and safe cookie-domain authorization, without cluttering Settings or extension UI with never-used sites.

## Phase Acceptance Gates

Before moving from one phase to the next:

- The phase-specific focused tests should pass.
- `npm run type-check` should pass when the phase touches shared types, renderer command contracts, or cross-layer payloads.
- Any user-facing flow introduced in the phase should have a manual smoke-test path documented in the working notes.
- No phase should leave a second cookie acquisition path active unless that path is still required by a later phase in the same task.

The intended ordering is strict:

- Phase 1 proves the registry and saved-cookie snapshot compatibility before expanding extension UI.
- Phase 2 proves extension-driven manual sync for both seeded and unknown current-tab sites before adding runtime auto-discovery.
- Phase 3 proves auth-failure discovery and bounded retry before broadening icon/catalog surface area.
- Phase 4 stabilizes local icon display before bulk catalog entries create many more rows.
- Phase 5 imports the gallery-dl cookie/auth catalog only after the registry, extension sync, reminders, and icon fallback model are stable.

## Requirements

- Add a desktop-owned dynamic site-session registry persisted under user data.
- Registry entries must include at least:
  - stable `siteId`
  - display name
  - primary URL/host
  - allowed cookie domains
  - sync authorization state (`seeded`, `user_enabled`, `auto_discovered`, `auto_sync_allowed`)
  - discovery source (`seed`, `gallery-dl-supported-sites`, `auth_required`, `user_sync`)
  - engine hints (`yt-dlp`, `gallery-dl`, `douyin-dl`) when known
  - icon metadata or placeholder marker
  - local icon asset/cache path when available
  - creation/update timestamps
- Catalog-only entries may exist as hidden metadata and should not be treated as visible user-managed login-state rows until activated.
- Existing static entries should migrate into seed registry entries without losing saved session snapshots.
- Extension-side site sync must only read cookies for registry-approved cookie domains.
- Extension-side sync must reject unsupported/unapproved site ids before calling `chrome.cookies.getAll(...)`.
- Unknown current-tab sites may be manually enabled from the extension. Enabling creates a registry entry with first-party cookie domain only, placeholder/local icon metadata, and explicit user authorization for that site.
- Dynamic entries discovered from an auth failure must not allow arbitrary broad cookie reads:
  - default allowed cookie domain should be the normalized first-party host/eTLD+1 derived from the failed URL
  - no cross-site domains unless explicitly seeded by known config/catalog
  - no arbitrary desktop-provided extra domains without registry approval
- Desktop must continue to treat extension responses as untrusted:
  - validate the returned `siteId`
  - drop malformed cookie records
  - filter returned cookies against the registry entry's allowed domains
  - rebuild `cookies`, `cookieHeader`, and `cookiesNetscape` itself
- Settings badge clicks should trigger extension sync for the selected registry entry.
- Browser extension sync button should trigger extension sync for the current page/site when that site is in the registry, is a newly discovered auth-required candidate, or the user manually enables it from the unknown-site state.
- Auth-required failures should:
  - upsert the site into the login-state registry
  - if the site is already seeded or user-enabled for auto sync, automatically request extension cookie sync when a connected extension can service the site
  - otherwise surface the site in Settings/extension as needing user-enabled sync and emit a desktop reminder state
- Settings should render dynamic site entries with known icons where available and placeholders otherwise.
- Browser extension should render a login-state/sync list with current site emphasis and placeholder icons when needed.
- Settings and extension must not render the full gallery-dl catalog as a default list.
- Catalog-only sites should become visible only when activated by successful sync, manual enablement, current-tab relevance, or auth-required discovery.
- Desktop full window should show a lower-left yellow-dot reminder when there are discovered-but-unsynced site-session entries requiring user action.
- Browser extension should show an action badge/dot and popup-top CTA when the active tab matches a discovered-but-unsynced site-session entry.
- Icons should prefer local assets:
  - known simple-icons mappings can be bundled/generated locally
  - dynamic favicon downloads may be cached under app/extension storage when available
  - live remote icon URLs should not be required for normal display
- Remove the Electron capture commands and legacy Douyin capture aliases from the renderer command contract unless a remaining internal call site is proven necessary.
- Remove app-owned capture-window creation, capture-session hardening, supplemental-cookie capture, and stable Electron partition refresh code that no longer has a user-facing entry point.
- Remove or replace auth-failure assisted `refreshSiteSessionCredentials(...)` so runtime downloads do not silently depend on deleted app-owned browser profiles.
- If a download fails due to missing/expired login state, recovery should be user-initiated: user clicks sync in Settings or the browser extension.
- Settings should continue showing source/profile metadata from the successful extension sync when available.
- Multiple connected extension clients/profiles should keep the YouTube MVP behavior for desktop-initiated sync: first successful response wins; failed responses only surface after all connected clients fail.
- If the extension is disconnected, Settings must show a clear install/connect/login-in-browser style error.
- If a browser/profile is not logged into the target site, Settings must show a clear non-crashing error.
- Existing saved sessions must remain readable.
- Existing downloader cookie injection from saved site-session snapshots must keep working.
- Browser-extension video selection/download payloads must not attach generic cookies as a fallback.
- Static `SupportedSiteSessionId`-only gates must be replaced or widened so dynamic registry entries can be stored, rendered, synced, and used for saved-cookie injection.
- Browser extension must receive registry-approved entries from the desktop app and validate cookie sync against that cached registry, instead of relying on a hardcoded extension-only whitelist.
- Unknown manually enabled sites must default to exact active-tab host cookie scope. They must not expand to eTLD+1 unless a seeded/catalog entry explicitly authorizes that domain.
- Auth-failure auto-sync for seeded/user-enabled sites should use a bounded retry policy:
  - request extension cookie sync once with a short timeout
  - retry the failed download once only if sync succeeds
  - fail normally and leave reminders visible if sync times out, extension is disconnected, or no valid cookies are returned
- Tests must cover dynamic registry persistence, discovery, command routing, desktop validation, extension current-site sync eligibility, Settings rendering, and old-window-login deletion.

## Acceptance Criteria

- [ ] Settings shows seeded known cookie-needed sites, including Douyin and current site-session entries.
- [ ] Settings does not show hidden catalog-only sites that have never been synced, enabled, or discovered.
- [ ] Settings shows dynamically discovered auth-required site entries.
- [ ] Browser extension shows a login-state/sync list.
- [ ] Browser extension does not show the full hidden catalog list by default.
- [ ] Browser extension highlights/enables sync for the current tab when the site is cookie-needed or discovered.
- [ ] Browser extension can use hidden catalog metadata to enable current-tab sync for a matching gallery-dl catalog site without showing unrelated catalog sites.
- [ ] Browser extension exposes a manual enable/sync entry for unknown current-tab sites.
- [ ] Unknown dynamic entries use a placeholder icon.
- [ ] Known seeded entries use available icons where present.
- [ ] Available dynamic favicons/icons can be cached locally; UI does not rely on live remote icon URLs.
- [ ] From Settings, users can sync any registry entry through the browser extension.
- [ ] From the browser extension, users can sync the current eligible site.
- [ ] Download `auth_required` failures persist or update a site-session candidate and automatically sync only when the site is seeded or previously user-enabled for auto sync.
- [ ] Discovered-but-unsynced entries trigger a lower-left yellow-dot reminder in the full desktop window.
- [ ] Revisiting a discovered-but-unsynced site in the browser extension shows an icon-dot/popup-top login-state sync CTA.
- [ ] The extension rejects unsupported site-session sync requests without reading cookies.
- [ ] Extension cookie queries are derived from desktop registry-approved domains, not arbitrary desktop-provided domains.
- [ ] Dynamic site ids are accepted through registry validation rather than the previous static `SupportedSiteSessionId` union gate.
- [ ] Unknown manually enabled sites use exact-host cookie scope unless seeded/catalog metadata authorizes broader domains.
- [ ] Seeded/user-enabled auth-failure auto-sync has a bounded timeout and retries the download at most once after successful sync.
- [ ] Desktop rejects or ignores cross-site cookie records returned by the extension.
- [ ] Saved snapshots remain compatible with `getDownloadCookies()` and sidecar cookie-file execution.
- [ ] Settings no longer opens an app-owned login/capture window for site login-state badges.
- [ ] Electron capture-window code is deleted rather than left as an unused hidden path.
- [ ] Legacy Douyin capture aliases and generic capture commands are removed from the active renderer command contract, with tests updated accordingly.
- [ ] Auth-failure retry no longer calls app-owned profile refresh after the capture profile is removed.
- [ ] Settings no longer exposes a separate manual cookie import path.
- [ ] If all connected extension clients fail or are logged out for a site, Settings shows an actionable login-in-browser message.
- [ ] If the extension is disconnected, Settings shows an actionable extension install/connect message.
- [ ] Existing non-cookie download flows still work.
- [ ] `npm run type-check`, `npm run lint`, focused tests, and full `npm run test` pass.

## Out Of Scope

- Automatic or periodic background extraction of cookies.
- Manual `cookies.txt` import UI.
- Browser profile picker UI.
- Reading browser cookie database files directly from the desktop app.
- Launching or controlling the user's default browser profile.
- Safari/Firefox extension support.
- Changing downloader engines or per-site download routing.
- Fully accurate yt-dlp preseed list for all supported sites. yt-dlp support is too broad and dynamic; auth-required runtime discovery is the source of truth.
- Full gallery-dl supported-sites catalog ingestion in Phase 1. The full task includes gallery-dl catalog seeding in Phase 5 through a checked-in/generated local catalog; catalog-only entries are hidden by default and should not block the registry foundation.
- Automatic cookie extraction for never-authorized unknown sites.
- Arbitrary custom cross-domain cookie policies in the first dynamic implementation.
- Profile picker UI.

## Open Questions

- None currently blocking. User accepts unknown current-tab manual enablement, local icon caching when practical, and auth-failure automatic sync for already trusted/enabled sites.
