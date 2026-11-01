# Current terminal authority audit

## Confirmed flow

```text
DownloadJobService.executeJobCore
  -> engine/fallback/auth recovery succeeds
  -> DownloadJobService records download.succeeded
  -> runtime performs output title/metadata settlement
  -> settlement may throw
  -> runtime converts the same Job to failed DownloadTerminalOutcome
  -> Electron maps that outcome to video-download-complete
```

Evidence:

- Application success terminal: `src/application/download-job-service.ts:166-171`.
- Runtime receives the already-terminal execution: `src/electron-runtime/service.ts:1508-1516`.
- Fallible yt-dlp/gallery-dl settlement: `src/electron-runtime/service.ts:1525-1585`.
- Filesystem rename throw point: `src/electron-runtime/service.ts:1277-1288`.
- Outer failure conversion and product terminal emission: `src/electron-runtime/service.ts:1592-1639`.

## Minimal correction seam

`DownloadJobService` already owns the recorder and typed failure classifier. The smallest correction is an optional, injected successful-result settlement hook invoked after engine/fallback/auth recovery success but before `recorder.recordTerminal({ outcome: "succeeded" })`.

The runtime supplies the existing rename/metadata settlement body. Application sees only a protocol-neutral outcome/result and treats a thrown settlement error as the Job failure through the existing classifier. No filesystem, Electron, queue, metadata, or engine-specific implementation enters Application.

## Rejected alternatives

- Returning a recorder/finalizer for the runtime to call would create a two-phase terminal API and allow callers to forget or double-finalize.
- Recording a second diagnostic failure in the runtime would preserve two competing terminal owners.
- Moving rename into engine adapters would mix output-settlement policy with one-attempt execution and duplicate behavior.
- Splitting `service.ts` or moving queue/transcode lifecycle is unrelated to the blocker.

## Test pressure

- `src/application/download-job-service.test.ts` already owns fallback/auth/cancel/exactly-once diagnostic semantics and should prove settlement ordering/failure.
- `src/electron-runtime/service.test.ts` already has real temporary-file title-rename fixtures and should prove diagnostic/product agreement for rename success and failure.
- `src/protocol/download/ipcMappers.test.ts`, `src/features/download/client.test.ts`, and `src/features/download/useDownloadQueue.test.ts` provide the existing typed protocol/Renderer regression boundary.
