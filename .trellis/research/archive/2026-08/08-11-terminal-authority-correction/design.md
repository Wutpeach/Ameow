# Terminal authority correction design

## Target ownership

`DownloadJobService` remains the only ordinary Job terminal authority. Infrastructure remains the owner of output settlement.

```text
Application: prepare -> attempts -> fallback/auth recovery
                         |
                         v
Infrastructure-injected successful-result settlement
  - title/metadata resolution
  - filesystem rename/cleanup
  - final result path/title
                         |
                         v
Application: exactly one diagnostic terminal
                         |
                         v
Runtime: one DownloadTerminalOutcome -> P3 mapper -> Renderer
```

## Contract change

Add one optional `DownloadJobServiceOptions` hook for successful-result settlement. It receives the protocol-neutral `DownloadJobOutcome<TJobContext>` (including the exact plan and Job context) and returns the final successful `DownloadResult`.

Ordering:

1. `executeJobCore()` completes attempts/fallback/auth recovery.
2. If configured, the settlement hook runs exactly once.
3. Settlement exceptions are normalized with the existing `classifyFailure` function before reaching the existing terminal catch path, preserving the diagnostic summary on the typed error.
4. Only the settled result is used to construct the returned outcome.
5. `recordTerminal(succeeded)` runs after settlement.

The hook is optional so non-Electron callers and existing unit fixtures keep the current behavior without boilerplate.

## Runtime integration

Move the existing yt-dlp title-rename and gallery-dl metadata/title settlement block into the injected hook inside `runTask()`. The code remains in `src/electron-runtime/service.ts`; no module or lifecycle split is introduced.

The code after `executeJob()` consumes the already-settled result and builds one `DownloadTerminalOutcome`. Failure continues through the existing outer catch, but it now carries the Application-recorded failed diagnostic summary rather than contradicting an earlier success.

## Compatibility

- No changes to `DownloadResult`, `DownloadTerminalOutcome`, IPC DTOs, event names, Renderer model, trace IDs, NetworkRoute, plan identity, or auth/cancel policy.
- Rename success preserves the final path/title currently emitted.
- Rename failure remains a product failure, but its structured diagnostic terminal becomes failure instead of success.
- Diagnostic sink isolation remains unchanged.

## Stop condition

Stop and report to Lead if the hook cannot be implemented by changing only the narrow Application option, the existing runtime settlement block, focused tests, and the directly relevant runtime contract. Do not move queue/transcode lifecycle or split `service.ts`.

## Rollback

The correction is additive at the Application option boundary and a local relocation of existing settlement code. Rollback is the inverse relocation plus removal of the optional hook and its tests; no persisted data or protocol migration exists.
