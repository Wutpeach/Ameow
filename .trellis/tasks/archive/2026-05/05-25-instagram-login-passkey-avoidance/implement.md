# Implementation plan

## Checklist

1. Add focused pure helpers in `electron/siteSessionManager.mts` for supplemental cookie sanitization and merge behavior.
2. Extend `createSiteSessionManager` with an optional `readSupplementalCookies(partition)` callback.
3. Update capture finalization so cookie-jar cookies remain primary and supplemental same-site cookies only fill missing persisted cookie names.
4. Add or update `electron/siteSessionManager.test.mts` coverage for:
   - supplemental cookies are saved when no cookie-jar cookie with that name exists;
   - cookie-jar cookies win on name conflicts;
   - invalid/empty supplemental cookie names and values are ignored;
   - existing Douyin and Instagram readiness behavior still passes.
5. In `electron/main.mts`, add capture-session setup before `BrowserWindow.loadURL`:
   - permission check/request handlers that deny unneeded permissions;
   - sanitized capture user agent;
   - accept-language defaults for the capture session;
   - request-cookie observation for allowed site domains.
6. Wire `readSupplementalCookies(partition)` from `electron/main.mts` into the site-session manager.
7. Keep WebAuthn/passkey `navigator.credentials` interception out of this implementation.

## Validation

Run:

```bash
npm run type-check
npm run lint
npx vitest run electron/siteSessionManager.test.mts
```

If Electron main changes trigger broader test concerns, also run the nearest Electron/runtime test suite available in `package.json`.

## Risk points

- Permission names vary by Electron/Chromium version. The implementation should deny known unwanted permissions and safely deny unknown capture-window requests without relying on a nonexistent passkey permission.
- Supplemental cookies lack Netscape metadata if they only came from request headers or page APIs. Keep `cookiesNetscape` based on cookie-jar records and use supplemental values only for persisted JSON/header readiness unless a metadata-safe source is added.
- Sanitized user agent should be scoped to capture windows only and must not affect the main app UI or downloader network requests.

## Rollback

- Remove the optional supplemental-cookie callback and merge helper if cookie capture regresses.
- Remove capture-session permission/user-agent setup from `electron/main.mts` if login pages reject the adjusted environment.
- Existing saved session files remain readable because the file schema is unchanged.

