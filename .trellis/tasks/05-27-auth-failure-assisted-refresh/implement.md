# Auth Failure Assisted Credential Refresh Implementation Plan

## Checklist

1. Update backend runtime types.
   - Add the optional `refreshSiteSessionCredentials` callback and small result type in `src/electron-runtime/contracts.ts`.
   - Keep it generic to site sessions, not Instagram-specific.

2. Wire Electron main.
   - In `electron/main.mts`, pass `refreshSiteSessionCredentials` to `createElectronDownloadRuntime`.
   - Use `getSiteSessionManager(siteId)?.refreshCredentials()`.
   - Return only the minimal state the runtime needs: availability, cookieCount, lastError.

3. Refactor runtime execution locally.
   - In `src/electron-runtime/service.ts`, extract the existing `this.orchestrator.execute(...)` call into a local helper inside `runTask`.
   - Preserve existing updates to `executedProviderId`, `executedEngineId`, runtime readiness, logging, progress callback, `buildExecutionContext(...)`, and output stem reuse.

4. Add assisted refresh/retry handling.
   - Catch the first orchestrator failure before the existing outer catch finalizes the task.
   - Use `toTaskRuntimeError(...)` and guard on `classification === "auth_required"` plus non-aborted signal.
   - Resolve a supported `siteId` from `telemetryPlan?.intent.siteId`.
   - Call the optional refresh callback once.
   - Re-check the abort signal after refresh returns and before the retry starts.
   - Reset attempt-scoped `executedProviderId` / `executedEngineId` before the retry dispatch.
   - Re-emit the existing preparing progress payload before retry.
   - Retry once only when refresh returns `ready` or `partial`.
   - If refresh or retry fails, let the normal final failure path emit the single completion event.
   - Do not run the refresh eligibility branch for retry failures.

5. Logging and final error context.
   - Log refresh attempt/outcome and retry start/failure with the existing `>>> [ElectronRuntime]` style.
   - Avoid new renderer event names in this phase.

6. Tests.
   - Extend `src/electron-runtime/service.test.ts` helper to accept `buildExecutionContext` and `refreshSiteSessionCredentials` if needed.
   - Add a test where first execution throws auth-required, refresh returns ready, build context injects new cookies, retry succeeds, and only one success completion is emitted.
   - Add a test where refresh returns missing or throws, no retry occurs, and one failure completion is emitted.
   - Add a test where retry fails and refresh is not called a second time.
   - Add a test for non-auth or no-site failure ensuring refresh is not called.
   - Add a test for cancellation between refresh and retry if it can be expressed without brittle timing.
   - Keep existing `src/orchestration/download-orchestrator.test.ts` auth-required chain-stop behavior unchanged.

7. Specs.
   - Update `.trellis/spec/backend/electron-runtime-contracts.md` to document assisted refresh/retry as a runtime-level contract.

## Validation Commands

```bash
npm run type-check
npm run lint
npm test -- electron/siteSessionManager.test.mts electron/siteSessionCommands.test.mts electron/siteSessionCaptureHardening.test.mts
npm test -- src/electron-runtime/service.test.ts src/orchestration/download-orchestrator.test.ts
```

## Review Gates

- Confirm there is still exactly one `video-download-complete` event per queued task.
- Confirm retry rebuilds execution context after refresh rather than reusing stale cookies.
- Confirm refresh is optional and unsupported sites do not throw.
- Confirm no automatic login window is opened by the failure path.
- Confirm telemetry does not retain the first attempt's engine/provider after retry starts.

## Rollback Points

- If runtime retry proves too invasive, keep Phase 2 explicit refresh behavior and remove only the new callback plus retry wrapper.
- If UI progress becomes confusing, defer user-visible status copy and keep logs-only diagnostics for Phase 3.
