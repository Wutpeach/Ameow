# Implement: 本地化下载错误信息

## Preconditions

- V1 does not need to resolve the UI copy/detail affordance decision, because V1 keeps the full-window error display unchanged.
- Run `trellis-before-dev` before editing code.
- Do not run `task.py start` until the user reviews and approves the planning artifacts.

## V1 Implementation Checklist

Docs-first scope:

- [x] Keep desktop full-window error display behavior unchanged.
- [x] Update `site/src/content/docs/docs/troubleshooting/error-messages.md`.
  - Add BiliBili 412 searchable keywords and explanation.
  - Add or strengthen upstream error-family sections for HTTP 403/404/416/429, auth/cookies, network/proxy, format unavailable, ffmpeg/conversion, gallery-dl wrappers, output missing, and cancellation.
  - Explicitly tell users to keep the complete original error text when reporting.
- [x] Update `site/src/content/docs/en/docs/troubleshooting/error-messages.md` with equivalent content.
- [x] Validate docs build with `npm run docs:build`.

## Later UI Implementation Checklist

- [ ] Extend shared types.
  - Add optional `errorCode`, `errorClassification`, and `rawError` to `DownloadResultPayload`.
  - Import the existing `DownloadErrorCode` and `DownloadFailureClassification` types from `src/core/constants`.

- [ ] Emit structured runtime errors.
  - In `src/electron-runtime/service.ts`, include `runtimeError.code`, `runtimeError.classification`, and raw message in `video-download-complete` events.
  - Update cancellation paths to emit `E_ABORTED` / `cancelled` instead of only `Download cancelled`.
  - Keep `error` populated for compatibility.

- [ ] Add frontend failure normalization.
  - Create a pure helper in `src/utils/downloadErrorMessages.ts`.
  - Match cancellation first.
  - Add specific patterns for:
    - BiliBili `HTTP Error 412 Precondition Failed`
    - HTTP 403/404/416/429
    - auth/cookies/sign-in
    - timeout/network/DNS/connection failures
    - format unavailable/no formats found
    - ffmpeg/conversion failures
    - output missing
    - gallery-dl/douyin-dl wrapper messages
  - Return a stable `kind` or `messageKey` for tests.

- [ ] Update reducer/outcome flow.
  - Replace `summarizeDownloadError` as the only UI source for video download failures.
  - Keep a legacy summarizer for raw detail truncation if needed.
  - Stop relying only on `cancelled/canceled` substring detection when structured fields exist.

- [ ] Update app state and overlay props.
  - Store the latest failure as `{ summary, detail, rawDetail }` or equivalent, not only a string.
  - Keep visible overlay copy short.
  - Preserve raw details in `title` or a copy/details path depending on the product decision.

- [ ] Add locale keys.
  - Update `locales/zh-CN/desktop.json` and `locales/en/desktop.json`.
  - Mirror any required extension locale files if the build/package process expects duplicated desktop locale resources.
  - Suggested namespace: `app.downloadErrors.*`.

- [ ] Update public docs.
  - Update `site/src/content/docs/docs/troubleshooting/error-messages.md`.
  - Update `site/src/content/docs/en/docs/troubleshooting/error-messages.md`.
  - Include BiliBili 412 and the main upstream error families from `prd.md`.

- [ ] Add tests.
  - `src/utils/downloadEventReducers.test.ts` for structured cancellation/outcome behavior.
  - New `downloadErrorMessages` tests for each mapped family.
  - Runtime service tests for structured fields in emitted failures and cancellations.
  - Existing `ytDlpErrorSummary` tests can remain focused on stderr summary extraction unless the helper is moved.

## Validation Commands

- V1:
  - `npm run docs:build`
- Later UI phase:
  - `npm run type-check`
  - `npm run lint`
  - Focused tests first:
  - `npx vitest run src/utils/downloadEventReducers.test.ts`
  - `npx vitest run src/electron-runtime/ytDlpErrorSummary.test.ts`
  - `npx vitest run src/electron-runtime/service.test.ts`

## Risky Files

- V1:
  - `site/src/content/docs/docs/troubleshooting/error-messages.md`
  - `site/src/content/docs/en/docs/troubleshooting/error-messages.md`
- Later UI phase:
  - `src/types/videoRuntime.ts`: shared contract, additive-only changes preferred.
  - `src/electron-runtime/service.ts`: emits download completion events and cancellation results.
  - `src/utils/downloadEventReducers.ts`: current cancellation and error summary behavior.
  - `src/App.tsx`: full-window outcome state and overlay wiring.
  - `src/components/ForegroundOutcomeOverlay.tsx`: compact overlay sizing and motion.
  - `locales/*/desktop.json` and `browser-extension/locales/*/desktop.json`: keep locale key parity.
  - `site/src/content/docs/**/troubleshooting/error-messages.md`: public user docs.

## Rollback Notes

- Keep `DownloadResultPayload.error` and legacy summarization until all call sites are migrated.
- If overlay detail UI becomes too dense, rollback to summary-only overlay while retaining raw detail in event/log/docs.
- If a pattern causes incorrect mapping, remove the specific pattern and fall back to a broader localized message with raw detail preserved.
