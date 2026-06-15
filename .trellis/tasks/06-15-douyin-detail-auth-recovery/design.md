# Design: Douyin Detail Failure Auth Recovery

## Architecture And Boundaries

Keep the current download architecture:

```text
queue_video_download
  -> site provider resolves sourceUrl
  -> douyin-dl engine executes with saved site-session cookies
  -> runtime catches DownloadRuntimeError
  -> existing auth_required recovery syncs site session
  -> retry runs through the same orchestrator/buildExecutionContext path
```

The fix belongs in Douyin executor error classification and runtime tests. It should not move cookie ownership into the browser extension payload and should not add a Douyin-only retry loop.

## Failure Interpretation

The observed log shows route selection is already correct:

- input URL: `https://www.douyin.com/jingxuan?modal_id=7645228154830769460`
- provider-owned source URL: `https://www.douyin.com/video/7645228154830769460`
- engine: `douyin-dl`
- upstream failure: `Failed to get video detail: 7645228154830769460`

This points to upstream detail API access rather than source routing. In Douyin's environment, detail API failures are often caused by stale/missing cookies, login state drift, or anti-bot/session challenges. Ameow already has the correct generic recovery path for that class: classify as `auth_required`, sync site session from extension, and retry once.

## Error Classification

Add a narrow Douyin-specific classifier near the output parsing in `src/electron-runtime/douyinDlDownload.ts`.

Suggested helper:

```ts
const classifyDouyinDlFailure = (line: string | null): "auth_required" | null => {
  if (!line) return null;
  if (/Failed to get video detail:\s*\d{15,20}/i.test(line)) return "auth_required";
  if (/aweme\/v1\/web\/aweme\/detail/i.test(line) && /(anti-bot|empty\s+200|empty response)/i.test(line)) return "auth_required";
  return null;
};
```

Do not add a broad generic regex such as `login|cookie|session|captcha|verify|permission` here. The shared failure classifier in `src/core/constants/error-classifications.ts` already treats common cookie/login/auth/403 messages from `E_EXECUTION_FAILED` as `auth_required`. This helper should only add Douyin-specific detail API symptoms that the generic classifier cannot infer safely.

Use the classifier when throwing `DownloadRuntimeError` for:

- non-zero exit code;
- exit code 0 with failed summary;
- no output artifact when the diagnostic line clearly indicates detail/auth failure.

Keep the error code as `E_EXECUTION_FAILED` and set `classification: "auth_required"` only when the Douyin-specific classifier matches. This preserves the upstream execution failure semantics while entering the retry path through the contract checked in `service.ts`.

A null or missing `diagnosticLine` must remain unclassified. It is the safety valve that prevents output parsing problems from becoming unnecessary browser-extension cookie syncs.

## Runtime Retry Contract

Do not change the runtime retry topology:

- First attempt throws `DownloadRuntimeError` with `classification: "auth_required"`.
- `AmeowElectronDownloadRuntime.executeDownloadWithAuthRecovery(...)` calls `handleAuthRequiredFailure(...)`.
- Electron main's handler performs site-session sync through the extension and persists the snapshot.
- Retry re-enters the same orchestrator execution.
- `buildExecutionContext(...)` injects the newly saved `cookiesNetscape` through `getDownloadCookies()`.

This preserves the cross-site recovery model and avoids duplicating cookie logic in the Douyin executor.

## Diagnostics

Add non-secret context on classified Douyin failures:

- `traceId`
- `sourceUrl`
- `hasIntentCookies: Boolean(context.intent.cookies)`
- `summary`
- `stdoutTail`
- `stderrTail`

Do not include raw cookies or generated YAML contents.

If the failure remains terminal after retry or recovery is unavailable, the message should be more actionable. A minimal option is to keep the upstream detail line while wrapping it with an auth hint, for example:

```text
Douyin login state may be stale. Refresh Douyin login state and retry. Upstream: Failed to get video detail: ...
```

If this risks changing existing error-copy surfaces too broadly, keep the raw message and rely on the `classification` plus diagnostics in this task, then handle UI copy in a follow-up.

## Compatibility

- Douyin provider URL selection stays unchanged.
- Managed `douyin-dl` pin stays unchanged unless a direct implementation blocker appears.
- Existing successful downloads remain unaffected.
- Non-auth failures should not trigger extension cookie reads or retries.
- Existing `auth_required` recovery retry limit remains the single retry guard.
- Douyin seed registry entries are already auto-sync eligible: `src/site-session-registry.ts` seeds known site sessions with `syncAuthorization: "seeded"` and `autoSyncAllowed: true`, and `src/site-sessions.ts` includes Douyin as a seed site with `douyin.com` cookie domains and `douyin-dl` engine hints.

## Test Strategy

Focused tests:

- `src/electron-runtime/douyinDlDownload.test.ts`
  - `Failed to get video detail: <id>` rejects with `classification: "auth_required"`.
  - `/aweme/v1/web/aweme/detail/` anti-bot/empty-response rejects with `classification: "auth_required"`.
  - `E_OUTPUT_NOT_FOUND` path with a Douyin detail diagnostic is classified as `auth_required`.
  - unrelated execution failure remains unclassified.
  - missing/null diagnostic detail remains unclassified.
  - classified failures include non-secret context.
- `src/electron-runtime/service.test.ts`
  - a Douyin engine failure classified as `auth_required` triggers `handleAuthRequiredFailure(...)`.
  - retry uses `buildExecutionContext(...)` again, allowing refreshed cookies to be injected.
  - recovery result with `shouldRetry: false`, empty/zero-cookie snapshot, or failed retry emits one terminal failure and does not loop.
- Existing provider tests:
  - `src/sites/providers.test.ts` should remain green for `jingxuan?modal_id` source synthesis.

Validation commands:

```bash
npm test -- --run src/electron-runtime/douyinDlDownload.test.ts src/electron-runtime/service.test.ts src/sites/providers.test.ts
npm run lint
npm run type-check
```
