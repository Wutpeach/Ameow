# Implementation Plan

## Preconditions

- Load `trellis-before-dev` before editing.
- Read backend Electron runtime contracts and video download patterns.
- Review the archived research task:
  - `.trellis/tasks/archive/2026-05/05-27-editing-friendly-download-format-strategy/research.md`
  - `.trellis/tasks/archive/2026-05/05-27-editing-friendly-download-format-strategy/design.md`
  - `.trellis/tasks/archive/2026-05/05-27-editing-friendly-download-format-strategy/implement.md`

## Checklist

1. Baseline audit: Done.
   - `src/electron-runtime/engineManifest.ts`
   - `src/electron-runtime/ytDlpCommandPlan.ts`
   - `src/electron-runtime/ytDlpDownload.ts`
   - `src/electron-runtime/service.ts`
   - `src/electron-runtime/transcode.ts`
   - existing trace/log helpers.

2. Decide evidence surface: Done.
   - Extend the existing `download_outcome` telemetry event with optional compatibility/post-processing fields.
   - Keep schema version `1` if fields are optional, consistent with `docs/download-telemetry-schema.md`.
   - Use compact backend logs only for warnings or transient timing details.
   - Do not add UI-visible copy in this task unless needed for debug surfaces.

3. Implement instrumentation: Done.
   - Add a bounded compatibility summary type/helper.
   - Record yt-dlp profile evidence where it is already known without adding a second yt-dlp probe.
   - Record completed source probe summary evidence.
   - Record compatibility decision evidence.
   - Record probe failure fallback evidence as `probe_failure_full_transcode` or an equivalent explicit token.
   - Update `docs/download-telemetry-schema.md` for added optional fields.

4. Tests: Done.
   - `src/download-capabilities/telemetry.test.ts` or nearest existing tests for optional schema fields if needed.
   - `src/electron-runtime/downloadTelemetry.test.ts` for JSONL preservation of optional fields if needed.
   - `src/electron-runtime/transcode.test.ts` for compatibility decision summaries and probe-failure policy.
   - `src/electron-runtime/service.test.ts` if service is responsible for attaching compatibility evidence to terminal telemetry.

5. Validation: Done.

```powershell
npm test -- src/electron-runtime/transcode.test.ts
npm test -- src/electron-runtime/downloadTelemetry.test.ts
npm test -- src/electron-runtime/ytDlpCommandPlan.test.ts
npm test -- src/electron-runtime/ytDlpDownload.test.ts
npm test -- src/electron-runtime/engineManifest.test.ts
npm test -- src/electron-runtime/service.test.ts
npm run type-check
npm run lint
git diff --check
```

Run only the focused tests that apply to the touched files, then the required type/lint gates.

## Implementation Result

- Added optional `downloadProfile` and `compatibility` fields to `download_outcome` telemetry.
- `downloadProfile` records the normalized quality tier plus bounded yt-dlp profile evidence (`ytdlpProfileKey`, merge output format, format sort), without logging raw selectors.
- `compatibility` records bounded source extension/container/codec evidence plus the decision token: `skip_compatible`, `remux_only`, `audio_transcode`, `full_transcode`, or `probe_failure_full_transcode`.
- `prepareVideoTranscodeTaskFromDownload(...)` now reports a `VideoCompatibilityAnalysis` callback after probe success or probe failure. Callback errors are swallowed so telemetry cannot change conversion behavior.
- `service.ts` records successful file-download telemetry after compatibility analysis while preserving `video-download-complete` emission before transcode follow-up work.
- Probe failure still conservatively falls back to full transcode and is visible in service-level telemetry as `probe_failure_full_transcode`.

## Review Notes

- Claude Code reviewed the implementation as a second-opinion reviewer.
- The review agreed with the telemetry approach and identified one missing integration test: service-level `probe_failure_full_transcode` telemetry.
- Added that regression test before final validation.

## Non-Goals

- Do not change selectors.
- Do not change `video-download-complete` ordering.
- Do not change the default editing-compatible output promise.
- Do not introduce an output mode switch.

## Rollback

- Instrumentation should be removable without changing download behavior.
- If logging payloads create sensitivity or noise concerns, revert the evidence surface first while keeping any pure tests that document existing compatibility decisions.
