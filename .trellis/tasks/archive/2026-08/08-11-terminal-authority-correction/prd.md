# Correct download terminal authority

## Goal

Unify the ordinary download terminal boundary so every output-settlement step that can still change the product result completes before the single structured diagnostic terminal is recorded. One Job must expose one terminal outcome, and that outcome must agree across Application diagnostics, Electron protocol output, and Renderer typed terminal handling.

## Background and confirmed facts

- `DownloadJobService.executeJob()` currently records `download.succeeded` immediately after engine execution succeeds (`src/application/download-job-service.ts:166-171`).
- `AmeowElectronDownloadRuntime.runTask()` performs yt-dlp title rename and gallery-dl metadata/title settlement only after `executeJob()` returns (`src/electron-runtime/service.ts:1508-1585`).
- `applyResolvedTitleToCompletedDownload()` performs fallible filesystem work, including `fs.rename()` (`src/electron-runtime/service.ts:1241-1293`).
- A settlement exception is caught by the outer runtime and converted to a failed `DownloadTerminalOutcome` (`src/electron-runtime/service.ts:1592-1620`), after the diagnostic sink has already observed success.
- Existing P6B tests already cover attempt identity, fallback, auth recovery, cancel intent, typed cancellation, and exactly-one diagnostic terminal inside `DownloadJobService`. Existing P3/P4 tests cover protocol mapping and Renderer typed-terminal precedence.

## Requirements

1. `DownloadJobService` remains the Application authority for the ordinary Job terminal decision.
2. Add only the smallest Application hook/contract needed to run successful-result settlement before recording `download.succeeded`; Infrastructure keeps ownership of rename, metadata reads/cleanup, filesystem operations, queue-label updates, and Electron/runtime state.
3. A settlement failure must pass through the existing typed failure classifier and produce one `download.failed` diagnostic terminal. It must never first produce `download.succeeded`.
4. A successful settlement may update the final `DownloadResult` (for example `filePath` and `title`) before that result is used by diagnostics, protocol mapping, telemetry, and Renderer presentation.
5. Preserve stable plan, Job context, NetworkRoute, attempt identity, fallback, and at-most-one auth recovery semantics.
6. Preserve typed cancellation semantics: cancel intent alone is not terminal cancellation, and a typed success after cancel intent still wins.
7. Preserve the existing `video-download-complete` event and protocol payload shape. Do not add protocol fields or Renderer state.
8. Keep diagnostic recording best-effort and non-critical; do not make diagnostic sink success a prerequisite for product completion.
9. If satisfying these requirements would require moving queue/transcode ownership, splitting `service.ts`, or redesigning the P0-P6 boundaries, stop implementation and report to Lead Architecture Review.

## Acceptance Criteria

- [ ] Rename success produces one `download.succeeded` diagnostic terminal and one successful product/protocol terminal with the settled path/title.
- [ ] Rename failure produces no `download.succeeded`; it produces exactly one `download.failed` diagnostic terminal and one failed product/protocol terminal with matching typed failure semantics.
- [ ] Successful-result settlement runs before final diagnostic success and is invoked at most once per Job.
- [ ] Existing fallback success still has one trace, distinct attempts, and exactly one success terminal.
- [ ] Existing auth-recovery success/decline semantics and exactly-one terminal behavior remain unchanged.
- [ ] Cancel intent followed by typed success remains success; typed cancellation remains cancellation.
- [ ] Protocol mapping and Renderer classification remain consistent with the structured diagnostic terminal.
- [ ] Focused Application/runtime/protocol/Renderer tests pass, followed by `npm run type-check`, `npm run lint`, `npm test`, and `git diff --check`.
- [ ] No P0-P6 redesign, `service.ts` split, transcode/queue refactor, P7 task, commit, or archive is included.
- [ ] The task remains `in_progress` and waits for Lead Architecture Review after validation.

## Out of Scope

- Transcode terminal ownership, queue architecture, Site Session, Update state, Browser Extension terminal streaming, protocol negotiation, or other retrospective debt.
- Moving files, renaming broad types, extracting a general settlement framework, Event Bus, lifecycle manager, or DI abstraction.
- Any product-visible workflow or UI change beyond correcting terminal consistency.

## Blocking Open Questions

None. The requested behavior, compatibility boundary, and stop condition are explicit.
