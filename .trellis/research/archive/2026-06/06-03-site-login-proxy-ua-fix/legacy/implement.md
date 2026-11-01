# Implementation Plan

## Checklist

- [ ] Read backend spec sections for global proxy and site-session capture before editing.
- [ ] Extract or add a shared helper that applies validated proxy settings to a provided Electron session.
- [ ] Keep `applyConfiguredDesktopProxy(...)` behavior unchanged for `session.defaultSession`.
- [ ] Make site-session capture setup await proxy application for `session.fromPartition(partition)` before loading the login URL.
- [ ] Separate proxy re-application from webRequest listener deduplication; repeated captures must still apply the latest proxy.
- [ ] Decide whether `save_config` should proactively re-apply proxy to known site-session partitions or rely on next capture startup; document the chosen behavior in code/tests.
- [ ] Review/refine UA and accept-language helpers only if evidence shows gaps; avoid site-specific spoofing.
- [ ] Add or update tests for proxy application on capture sessions, enabled/disabled proxy modes, repeated capture for the same partition, and existing UA helper behavior.
- [ ] Run `npm run type-check`.
- [ ] Run focused affected tests, likely Electron site-session/hardening/proxy tests.

## Validation Commands

- `npm run type-check`
- `npm run test -- electron/siteSessionCaptureHardening.test.mts`
- `npm run test -- src/config/globalProxy.test.ts`
- Additional focused Electron tests added during implementation.

## Rollback Points

- Proxy helper extraction should be easy to revert without touching downloader cookie snapshot behavior.
- Site-session capture flow should keep the old stable partition and cookie persistence behavior unchanged.
