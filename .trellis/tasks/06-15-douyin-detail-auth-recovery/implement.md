# Implementation Plan: Douyin Detail Auth Recovery

## Preconditions

- Stay on this task, not `portable-autostart-settings-reset-report`.
- Before editing, load `trellis-before-dev` and read:
  - `.trellis/tasks/06-15-douyin-detail-auth-recovery/prd.md`
  - `.trellis/tasks/06-15-douyin-detail-auth-recovery/design.md`
  - `.trellis/spec/backend/electron-runtime-contracts.md`
  - `.trellis/spec/guides/video-download-patterns.md`

## Steps

1. Add Douyin failure classification helper in `src/electron-runtime/douyinDlDownload.ts`.
   - Detect `Failed to get video detail: <id>`.
   - Detect detail API anti-bot / empty response messages for `/aweme/v1/web/aweme/detail/`.
   - Do not add broad generic login/cookie/session/captcha/permission regexes here; the shared `E_EXECUTION_FAILED` classifier already covers common auth wording.
   - Return `auth_required` only for narrow Douyin-specific recoverable detail API symptoms.
   - Return `null` for missing or null diagnostic lines.

2. Use the classifier at all Douyin executor throw sites that already have a selected diagnostic line.
   - Non-zero exit code.
   - Exit code 0 with failed summary.
   - No output artifact with diagnostic detail/auth symptoms.
   - Keep error code as `E_EXECUTION_FAILED`; set only `classification: "auth_required"` for matched recoverable symptoms.
   - Preserve raw stderr/stdout tails in context.
   - Add `hasIntentCookies` and `sourceUrl` diagnostics without exposing cookie values.

3. Make terminal message actionable for classified failures if the existing error surface allows it.
   - Prefer a concise Douyin login-state hint plus upstream diagnostic.
   - Avoid hiding the upstream line entirely.

4. Extend `src/electron-runtime/douyinDlDownload.test.ts`.
   - Add direct `Failed to get video detail` classification case.
   - Update existing anti-bot detail test to expect `classification: "auth_required"`.
   - Add `E_OUTPUT_NOT_FOUND` detail diagnostic case.
   - Add an unrelated failure case that remains unclassified.
   - Add a missing/null diagnostic case that remains unclassified.
   - Assert diagnostics are non-secret.

5. Extend `src/electron-runtime/service.test.ts`.
   - Add a Douyin provider/engine stub test where first execution throws `classification: "auth_required"`.
   - Assert `handleAuthRequiredFailure` is called once.
   - Assert retry executes after recovery and succeeds.
   - Assert `buildExecutionContext` runs for both attempts so refreshed cookies can be used.
   - Add a `shouldRetry: false` case to prove no loop.
   - Add empty/zero-cookie recovery behavior coverage if that is represented in service-level tests; otherwise cover it in `electron/siteSessionAuthRecovery.test.mts`.

6. Run focused validation:

   ```bash
   npm test -- --run src/electron-runtime/douyinDlDownload.test.ts src/electron-runtime/service.test.ts src/sites/providers.test.ts
   ```

7. Run full quality gates:

   ```bash
   npm run lint
   npm run type-check
   ```

8. Update specs if implementation establishes a durable new contract.
   - Likely target: `.trellis/spec/guides/video-download-patterns.md` or `.trellis/spec/backend/electron-runtime-contracts.md`.
   - Record that Douyin detail API auth-like failures should classify as `auth_required` to reuse site-session recovery.

## Risk Points

- Over-classifying unrelated Douyin failures could trigger unnecessary browser-extension cookie reads.
- Under-classifying `Failed to get video detail` keeps the original intermittent failure.
- Error messages must not expose cookies or generated config paths containing sensitive information.
- Runtime retry should stay one attempt only.
- A null diagnostic line must not be treated as auth-required; otherwise output parsing issues can trigger misleading recovery.

## Rollback

- Revert classifier usage in `douyinDlDownload.ts`.
- Remove newly added tests.
- Existing Douyin source routing and downloader execution behavior should return to the current raw failure path.
