# Terminal authority correction implementation plan

## Implementation

1. Add the optional successful-result settlement hook to `DownloadJobServiceOptions`.
2. Invoke it once after `executeJobCore()` succeeds and before diagnostic success; normalize hook failures through the existing failure classifier and return the settled result.
3. Move the existing yt-dlp/gallery-dl rename and metadata settlement block into that injected hook in `AmeowElectronDownloadRuntime.runTask()` without splitting `service.ts`.
4. Remove the now-duplicate post-`executeJob()` settlement block and keep the existing single `DownloadTerminalOutcome`/`video-download-complete` mapping.
5. Update the Electron download runtime contract to state that fallible output settlement precedes the terminal diagnostic and product event.

## Regression tests

1. Application tests:
   - settlement success happens before one success terminal and can update the final result;
   - settlement failure produces exactly one failed terminal and no success terminal;
   - existing fallback, auth recovery, typed cancellation, cancel-intent success, observer isolation, and terminal-history tests stay passing.
2. Runtime tests:
   - real temporary-file rename success yields one diagnostic success and one product success with the settled path;
   - missing/unrenameable output yields no diagnostic success, one diagnostic failure, and one product failure with matching code/classification/summary;
   - terminal diagnostic and `video-download-complete` counts are each exactly one.
3. Boundary regressions:
   - P3 result mapper tests;
   - Renderer client/reducer/controller typed terminal tests;
   - architecture import guard.

## Validation

```text
npx vitest run src/application/download-job-service.test.ts src/electron-runtime/service.test.ts src/protocol/download/ipcMappers.test.ts src/features/download/client.test.ts src/features/download/reducer.test.ts src/features/download/useDownloadQueue.test.ts src/architecture/import-guard.test.ts
npm run type-check
npm run lint
npm test
git diff --check
git status --short
```

## Review gates

- Stop before implementation if planning reveals a required queue/transcode move, `service.ts` split, or protocol change.
- After implementation, keep task status `in_progress`; do not commit or archive.
- Report terminal authority, changed files, regression results, validation, and any scope deviation for Lead Architecture Review.
