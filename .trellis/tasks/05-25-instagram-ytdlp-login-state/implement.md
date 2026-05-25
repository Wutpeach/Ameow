# Instagram download preference and login state settings implementation plan

## Checklist

1. Update provider routing in `src/sites/gallery-dl-supported.ts`.
   - Detect Instagram from the resolved source URL or site hint.
   - Normalize Instagram `siteId` to `"instagram"`.
   - Return `yt-dlp` primary and `gallery-dl` fallback only for Instagram.
   - Keep current engine order for other gallery-dl-supported sites.

2. Update provider tests in `src/sites/providers.test.ts`.
   - Change the existing Instagram order assertion to `["yt-dlp", "gallery-dl"]`.
   - Change Instagram `intent.siteId` assertions to `"instagram"`.
   - Add or update no-`siteHint` and `siteHint: "instagram"` coverage.
   - Add a representative non-Instagram gallery-dl-supported assertion that still expects `["gallery-dl", "yt-dlp"]`.
   - Keep permalink evidence and shortcode synthesis assertions.

3. Add Instagram site-session support.
   - Extend `SupportedSiteSessionId` in `src/types/siteSession.ts`.
   - Add the Instagram entry in `src/site-sessions.ts`.
   - Use `loginUrl: "https://www.instagram.com/"`.
   - Use `cookieDomains: ["instagram.com"]`.
   - Use `requiredCookieKeys: []`.
   - Use `loginCookieKeys: ["sessionid"]`.

4. Add Settings UI icon and labels.
   - Add `InstagramLogo` to `src/components/icons/SiteLogos.tsx`.
   - Re-export it from `src/site-session-icons.ts`.
   - Import and map it in `src/pages/SettingsPage.tsx`.
   - Add `settings.siteSessions.sites.instagram` in `locales/en/desktop.json` and `locales/zh-CN/desktop.json`.
   - Run `npm run locales:sync` if generated locale copies need to stay current.

5. Add site-session tests.
   - Extend `electron/siteSessionManager.test.mts` or add focused coverage showing Instagram `sessionid` capture returns `availability: "ready"`.
   - Cover an Instagram capture with no matching `instagram.com` cookies returning/remaining missing or producing the existing capture error path.
   - Add config retrieval coverage for `getSiteSessionConfig("instagram")` if not already covered by the manager test.

6. Update specs if implementation discovers a reusable rule.
   - Only update `.trellis/spec/` if the task reveals a durable convention beyond this feature.

## Validation Commands

Run focused checks first:

```bash
npm test -- src/sites/providers.test.ts
npm test -- electron/siteSessionManager.test.mts
npm run type-check
npm run lint
```

If locale sync changes generated files or focused tests reveal shared-runtime risk, run:

```bash
npm test
git diff --check
```

## Risk Points

- The highest-risk regression is a `siteId` mismatch (`instagram.com` vs `instagram`) that would silently prevent saved cookies from reaching `yt-dlp` or `gallery-dl`.
- Engine priority must change only for Instagram. A broad gallery-dl-supported priority swap would unintentionally affect many sites.
- `csrftoken` and `mid` should not be required login markers because visitor sessions may contain them.
- Settings icon mapping is a TypeScript exhaustiveness point: adding the union member without the logo map will fail type-check.

## Rollback

- Revert the provider-specific engine chain and `siteId` normalization to restore old Instagram routing.
- Remove `instagram` from `SupportedSiteSessionId`, `SITE_SESSION_CONFIGS`, Settings logo mapping, and locale keys to remove the Settings entry.
- No data migration rollback is required; any saved `<userDataDir>/site-sessions/instagram.json` file is additive and ignored if the site id is no longer supported.
