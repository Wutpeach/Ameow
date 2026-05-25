# Performance and Resource Lifecycle Audit

Scope: Electron main process, browser extension background/popup scripts, and renderer event subscriptions.

## Finding 1

**Browser extension media-scan cache could grow without a hard cap.**

- Trigger: repeated media scans across many tabs/pages over a long session.
- Impact: the `ameowMediaScanCache` object could keep accumulating recent entries as long as they stayed under the TTL window, which increases extension storage usage and makes cache reads progressively heavier.
- Evidence: `browser-extension/background.js` kept old entries only by age; there was no total-entry limit before the fix.
- Fix: added a bounded cache prune step with a hard cap (`MEDIA_SCAN_CACHE_TOTAL_LIMIT = 24`) and kept the newest entries only.
- Validation: `npm test -- browser-extension/media-scan-cache.test.js`

## Finding 2

**Media-scan timeout timer was left alive until natural expiry after an early response.**

- Trigger: a page scan completes before the 5s timeout promise wins the race.
- Impact: the timer stays scheduled until it fires, causing avoidable wakeups and keeping a short-lived timer object alive longer than needed.
- Evidence: `browser-extension/background.js` used `Promise.race` with `setTimeout` but did not clear the timeout after the scan settled.
- Fix: captured the timeout handle and cleared it after the race resolved.
- Validation: `npm test -- browser-extension/media-scan-cache.test.js`, `npm run type-check`, `npm run lint`

## Finding 3

**Failed transcode queue state could grow without a retention cap.**

- Trigger: repeated transcode failures during a long-running app session.
- Impact: `failedTranscodes` behaved like unbounded operational state, which inflated `video-transcode-queue-count.failedCount` and `video-transcode-queue-detail.tasks` over time.
- Evidence: `src/electron-runtime/service.ts` retained failed rows for retry/remove UI flows but had no explicit upper bound before the fix.
- Fix: added `FAILED_TRANSCODE_RETENTION_LIMIT = 20` and prune oldest failed rows while preserving current event names and queue payload shape.
- Validation: `npm test -- src/electron-runtime/service.test.ts`, `npm run type-check`, `npm run lint`

## Notes

- Queue/log/process follow-up review results:
- `electron/runtimeLog.mts` already bounds both in-memory log buffering and exported line reads.
- `src/electron-runtime/processRunner.ts` already has explicit abort listener registration/removal plus child-process kill fallback.
- No additional high-confidence low-risk lifecycle leaks were identified in those reviewed paths during this pass.
- Existing listener cleanup in the renderer and shutdown cleanup in the Electron main process were already explicit and did not need changes.
