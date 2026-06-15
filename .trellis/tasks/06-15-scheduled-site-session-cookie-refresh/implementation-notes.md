# Implementation Notes

## Completed

- Added `electron/siteSessionRefreshScheduler.mts`.
- Added `electron/siteSessionRefreshScheduler.test.mts`.
- Wired the scheduler into `electron/main.mts`.
- Startup, extension-connect, and periodic checks now use the scheduler.
- Advanced quality pre-probe refresh now goes through scheduler-owned in-flight state.
- Desktop settings sync uses scheduler in-flight joining while bypassing automatic eligibility only for manual sync.
- `auth_required` recovery uses scheduler reason `auth_required` without bypassing auto-refresh eligibility.
- Extension popup direct sync marks scheduler success/backoff cleared after a successful snapshot import.
- Scheduler stores operational state in `site-sessions/refresh-state.json` with temp-file + rename writes.

## Verification

```powershell
npm run test -- electron/siteSessionRefreshScheduler.test.mts electron/siteSessionManager.test.mts electron/siteSessionAuthRecovery.test.mts electron/extensionRequestBridge.test.mts src/electron-runtime/service.test.ts electron/siteSessionCommands.test.mts
npm run type-check
npm run lint
npm test
git diff --check
```

Results:

- Focused tests: 6 files passed, 89 tests passed.
- Full tests: 130 files passed, 890 tests passed.
- Type check: passed.
- Lint: passed.
- Diff check: no whitespace errors; Git reported only the existing Windows LF/CRLF warning for `electron/main.mts`.
