# Claude Review: Douyin Detail Auth Recovery

## Review Result

Claude reviewed the current repair plan as a second-opinion reviewer. The high-level approach is sound:

- Treat the observed Douyin `Failed to get video detail: <id>` failure as a likely recoverable session/detail API failure.
- Reuse the existing `auth_required` site-session recovery path.
- Keep cookie ownership in the desktop site-session snapshot and extension sync flow.
- Retry once through the runtime service instead of adding a Douyin-only retry loop.

## Must-Fix Feedback

- Narrow the Douyin classifier. Avoid a broad pattern such as `login|cookie|session|captcha|verify|permission`, because it could misclassify unrelated Douyin execution failures and trigger unnecessary extension cookie sync.
- Keep `E_EXECUTION_FAILED` and set `classification: "auth_required"` for matched recoverable symptoms. Do not switch these failures to `E_AUTH_REQUIRED`; the retry contract depends on the classification, and the original failure is still an upstream execution failure.
- Leave null or missing diagnostic lines unclassified. This is the safety valve for parser/output issues.
- Confirm Douyin is eligible for automatic recovery before relying on it.

## Local Evidence Checked After Review

- `src/site-session-registry.ts` seeds known site-session entries with `syncAuthorization: "seeded"` and `autoSyncAllowed: true`.
- `src/site-sessions.ts` includes Douyin as a seed site with `douyin.com` cookie domains, required/login cookie keys, and `douyin-dl` engine hints through the registry.
- `electron/siteSessionAuthRecovery.mts` only retries when the entry is auto-sync eligible and the synced state has saved cookies (`cookieCount > 0`, not missing, no last error).
- `src/core/constants/error-classifications.ts` already handles common cookie/login/auth/403 text for generic `E_EXECUTION_FAILED` failures, so the Douyin helper only needs to cover Douyin-specific detail API symptoms.

## Adopted Adjustments

- Classifier should match only:
  - `Failed to get video detail:\s*\d{15,20}`
  - `/aweme/v1/web/aweme/detail/` plus `anti-bot`, `empty 200`, or `empty response`
- No broad generic login/session/captcha regex inside the Douyin helper.
- Add tests for `E_OUTPUT_NOT_FOUND` with a detail diagnostic, missing/null diagnostic, unrelated non-auth failure, recovery `shouldRetry: false`, and empty/zero-cookie recovery behavior.

## Deferred

- Updating `douyin-downloader` remains out of scope unless implementation shows a direct library bug.
- UI copy refinements can stay minimal in this task; classification and retry behavior are the core fix.
