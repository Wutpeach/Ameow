# Implementation Plan

## Preconditions

- Load `trellis-before-dev` before editing.
- Read backend Electron runtime contracts and video download patterns.
- Review the archived research task:
  - `.trellis/tasks/archive/2026-05/05-27-editing-friendly-download-format-strategy/research.md`
  - `.trellis/tasks/archive/2026-05/05-27-editing-friendly-download-format-strategy/design.md`
  - `.trellis/tasks/archive/2026-05/05-27-editing-friendly-download-format-strategy/implement.md`

## Checklist

1. Baseline audit:
   - `src/electron-runtime/engineManifest.ts`
   - `src/electron-runtime/ytDlpCommandPlan.ts`
   - `src/electron-runtime/ytDlpDownload.ts`
   - `src/electron-runtime/service.ts`
   - `src/electron-runtime/transcode.ts`
   - existing trace/log helpers.

2. Decide evidence surface:
   - Reuse `DownloadTrace` if it already has a suitable event shape.
   - Otherwise add compact backend logs with safe bounded fields.
   - Do not add UI-visible copy in this task unless needed for debug surfaces.

3. Implement instrumentation:
   - yt-dlp command/profile start evidence.
   - completed source probe summary evidence.
   - compatibility decision evidence.
   - probe failure fallback evidence.

4. Tests:
   - helper/unit tests for evidence payload construction if a helper is added.
   - transcode tests for probe failure policy if practical with mocked process runner or a narrow helper extraction.
   - service-level tests only if the evidence is emitted from service boundaries.

5. Validation:

```powershell
npm test -- src/electron-runtime/transcode.test.ts
npm test -- src/electron-runtime/ytDlpCommandPlan.test.ts
npm test -- src/electron-runtime/ytDlpDownload.test.ts
npm test -- src/electron-runtime/service.test.ts
npm run type-check
npm run lint
git diff --check
```

Run only the focused tests that apply to the touched files, then the required type/lint gates.

## Non-Goals

- Do not change selectors.
- Do not change `video-download-complete` ordering.
- Do not change the default editing-compatible output promise.
- Do not introduce an output mode switch.

## Rollback

- Instrumentation should be removable without changing download behavior.
- If logging payloads create sensitivity or noise concerns, revert the evidence surface first while keeping any pure tests that document existing compatibility decisions.
