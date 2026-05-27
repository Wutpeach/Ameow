# Auth Failure Assisted Credential Refresh Design

## Boundary

The retry orchestration should live in `src/electron-runtime/service.ts`, where a task has its trace id, abort signal, queue lifecycle, telemetry, output reservation, and final event emission. `DownloadOrchestrator` should keep its current engine-chain responsibility and continue treating `auth_required` as terminal for the current orchestration attempt.

Site-session extraction rules stay owned by `electron/siteSessionManager.mts`. Phase 3 reuses `refreshCredentials()` and does not change cookie capture, supplemental-cookie merge behavior, or saved session format.

## Runtime Contract

Add an optional runtime callback to `ElectronDownloadRuntimeOptions`:

```ts
refreshSiteSessionCredentials?(context: {
  siteId: string;
  traceId: string;
  reason: "auth_required_retry";
}): Promise<{
  availability: "missing" | "partial" | "ready";
  cookieCount: number;
  lastError: string | null;
} | null>;
```

The callback returns `null` when the site is unsupported or there is no manager. Returning `ready` or `partial` allows a single retry; returning `missing`, throwing, or resolving `null` skips retry.

In `electron/main.mts`, implement the callback with:

- `getSiteSessionManager(siteId)` for supported site IDs only.
- `manager.refreshCredentials()`.
- No capture window creation and no fallback to browser-extension cookies.

## Retry Flow

1. `runTask(traceId)` builds the usual config, output directory, binaries, and output stem once.
2. Execute the existing orchestrator attempt through a small local helper, preserving the current `buildExecutionContext(...)` path.
3. If the attempt succeeds, continue the existing success path.
4. If the attempt throws:
   - Convert to `DownloadRuntimeError` with `toTaskRuntimeError(...)`.
   - If aborted or not `auth_required`, rethrow/finalize as today.
   - Resolve the current `siteId` from the latest resolved telemetry plan, falling back to the active request only if needed.
   - Call `refreshSiteSessionCredentials` once with `{ traceId, siteId, reason: "auth_required_retry" }`.
   - If availability is `ready` or `partial`, rerun the orchestrator once. The retry calls `buildExecutionContext(...)` again, so it reads the rewritten cookie snapshot via `getDownloadCookies()`.
5. If retry succeeds, emit normal success. If retry fails, finalize the retry error once and do not attempt another refresh.

The retry should reuse the same output stem reservation and trace id. That keeps downstream progress and queue state tied to the original task and avoids orphaning UI rows.

Before starting the retry, reset attempt-scoped execution markers such as `executedProviderId` and `executedEngineId` so final telemetry does not accidentally report a stale first-attempt engine when a retry fails before dispatch.

## Guards

- One refresh-assisted retry per task execution.
- No refresh when the task abort signal is set.
- No refresh when `runtimeError.classification !== "auth_required"`.
- No refresh when no supported `siteId` can be resolved.
- No refresh when the callback returns `null`, `missing`, or throws.
- No recursive retry helper; implement an explicit two-attempt control flow.
- Re-check the abort signal after refresh and before retry because the user can cancel while refresh is in flight.
- The retry failure path must not re-enter the refresh eligibility check.

## Events And UX

Keep Phase 3 UI-neutral:

- Do not emit an intermediate failed `video-download-complete` for the first auth failure.
- Re-emit the existing `video-download-progress` preparing payload before retry so the UI remains visibly active without adding a new renderer event or copy string.
- Add runtime logs for refresh attempt, refresh outcome, retry start, and retry outcome.
- Manual fallback remains the existing Settings site-login controls after final failure.

## Telemetry

Record one telemetry event per download task as today. On final failure, telemetry should reflect the final failure that the user sees. Logs carry the extra refresh/retry detail for diagnosis.

If implementation can add retry metadata without broad telemetry schema churn, include context such as `authRefreshAttempted: true` in the error context. Otherwise defer richer telemetry fields to a later diagnostics phase.

## Compatibility

- Existing downloads with no supported site session are unchanged.
- Existing site-session commands and stored JSON format are unchanged.
- Existing engine fallback rules are unchanged.
- The callback is optional, so tests and non-Electron integrations can omit it.

## Risks

- Retrying after `partial` credentials may still fail on stricter sites. The one-retry guard contains the risk and preserves a manual fallback.
- A refresh can fail because the stable browser profile has also expired. The prior saved snapshot remains preserved by Phase 2 behavior.
- `auth_required` classification is pattern-based for some engines and may catch 403 cases that are not actually login-related. The retry is limited to supported site sessions and once per task.
