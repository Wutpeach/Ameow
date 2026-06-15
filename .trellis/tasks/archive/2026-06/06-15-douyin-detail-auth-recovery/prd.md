# Recover Douyin detail failures with site session refresh

## Goal

Improve Douyin download reliability when `douyin-dl` fails to fetch video detail because the saved/login browser session is stale, missing, or challenged by Douyin anti-bot behavior.

User-facing value:

- A Douyin download that fails with a recoverable detail/auth/session symptom should automatically refresh the saved Douyin site session through the browser extension and retry once.
- If recovery cannot happen, the user should see a clearer error that points to refreshing Douyin login state instead of a raw upstream `Failed to get video detail` message.

## Confirmed Facts

- User observed an intermittent failure for:
  - original URL: `https://www.douyin.com/jingxuan?modal_id=7645228154830769460`
  - runtime-selected source URL: `https://www.douyin.com/video/7645228154830769460`
  - provider: `douyin`
  - engine: `douyin-dl`
  - upstream error: `VideoDownloader - ERROR - Failed to get video detail: 7645228154830769460`
- Current Douyin provider routing is behaving as intended for this case:
  - `jingxuan?modal_id=...` is synthesized into `/video/{id}` before `douyin-dl`.
  - tests already cover this source selection behavior in `src/sites/providers.test.ts`.
- `douyin-dl` execution currently writes a generated YAML config with cookies from `context.intent.cookies`.
- `electron/main.mts` injects saved site-session cookies through `buildExecutionContext(...)` when `context.intent.siteId` has a saved site-session snapshot.
- Runtime auth recovery already exists:
  - `src/electron-runtime/service.ts` retries once when a thrown `DownloadRuntimeError` has `classification === "auth_required"`.
  - `electron/main.mts` wires `handleAuthRequiredFailure(...)` to `syncSiteSessionFromExtension(...)`.
- Current Douyin detail failures are emitted as ordinary `E_EXECUTION_FAILED`, so they do not trigger the existing `auth_required` recovery path.
- Douyin is already a seeded site-session entry with automatic sync eligibility:
  - `src/site-session-registry.ts` seeds known site sessions with `syncAuthorization: "seeded"` and `autoSyncAllowed: true`.
  - `src/site-sessions.ts` includes Douyin cookie domains and login cookie keys.
- The shared `E_EXECUTION_FAILED` classifier already recognizes common cookie/login/auth/403 wording, so this task should only add Douyin-specific detail API symptoms that are not safely covered by generic wording.
- Existing tests already include a Douyin anti-bot/detail API sample message:
  - `src/electron-runtime/douyinDlDownload.test.ts` has `Empty 200 response for /aweme/v1/web/aweme/detail/ (anti-bot)`.

## Requirements

- Classify recoverable Douyin detail/API/session failures as `auth_required` so the existing site-session sync/retry path can run.
- Cover at least these upstream symptom shapes:
  - `Failed to get video detail: <aweme_id>`
  - detail API anti-bot / empty response messages such as `/aweme/v1/web/aweme/detail/` plus `anti-bot` or empty response text
- Keep common login/session/cookie-required messages on the existing shared `E_EXECUTION_FAILED` classifier unless implementation finds a Douyin-specific phrase that is not covered there.
- Preserve non-auth Douyin failures as ordinary execution failures.
- Retry at most once through the existing runtime auth recovery path. Do not create a Douyin-specific retry loop inside `douyinDlDownload.ts`.
- Keep cookie injection desktop-owned:
  - browser-extension download payloads must not directly attach fresh cookies.
  - recovery should rely on `syncSiteSessionFromExtension(...)`, saved snapshot persistence, and the existing `buildExecutionContext(...)` re-read on retry.
- Improve the terminal user-facing error for unrecovered recoverable Douyin detail failures so it suggests refreshing Douyin login state.
- Add diagnostics that help future debugging without printing cookie values:
  - trace id
  - source URL
  - whether intent cookies were present
  - selected diagnostic line
  - stderr/stdout tail already redacted by existing paths
- Keep current Douyin source URL synthesis behavior unchanged.
- Do not update the managed `douyin-downloader` pin in this task unless implementation reveals a direct required fix.
- Do not introduce a new app-owned Douyin login/capture window.

## Acceptance Criteria

- [x] `Failed to get video detail: <id>` from `douyin-dl` is mapped to a `DownloadRuntimeError` with `classification: "auth_required"`.
- [x] Detail API anti-bot / empty response symptoms from `douyin-dl` are mapped to `classification: "auth_required"`.
- [x] Missing/null diagnostic detail remains unclassified.
- [x] Non-auth Douyin execution failures remain `E_EXECUTION_FAILED` without `auth_required` classification.
- [x] Runtime service tests prove a Douyin `auth_required` failure triggers `handleAuthRequiredFailure(...)` and retries the same download once.
- [x] Runtime service/auth-recovery tests prove `shouldRetry: false`, failed recovery, or empty/zero-cookie recovery does not loop and still emits one terminal failure.
- [x] Douyin executor tests prove recoverable detail failures include useful non-secret diagnostic context.
- [x] Existing Douyin provider tests still prove `jingxuan?modal_id=...` synthesizes `/video/{id}`.
- [x] Focused tests pass for Douyin executor and runtime auth-recovery behavior.
- [x] `npm run lint` and `npm run type-check` pass before completion.

## Notes

- Relevant code:
  - `src/electron-runtime/douyinDlDownload.ts`
  - `src/electron-runtime/douyinDlDownload.test.ts`
  - `src/electron-runtime/service.ts`
  - `src/electron-runtime/service.test.ts`
  - `electron/main.mts`
  - `electron/siteSessionManager.mts`
  - `src/sites/douyin.ts`
  - `src/sites/providers.test.ts`
- Relevant specs:
  - `.trellis/spec/backend/electron-runtime-contracts.md`
  - `.trellis/spec/guides/video-download-patterns.md`

## Out Of Scope

- Replacing `douyin-dl`.
- Updating the managed Python package pin by default.
- Adding browser-extension direct cookie attachment to video download payloads.
- Reworking Douyin provider source selection, unless tests reveal a regression unrelated to this failure.
- Solving all Douyin anti-bot failures; this task only routes likely session/auth failures through the existing refresh-and-retry mechanism and improves diagnostics.

## Open Questions

- None blocking planning.
