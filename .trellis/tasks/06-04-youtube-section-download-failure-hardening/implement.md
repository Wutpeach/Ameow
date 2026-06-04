# Implementation Plan

## Phase 1: Section Failure Hardening

- [x] Confirm current tests around YouTube section command arguments and yt-dlp failure handling.
- [x] Add or extend a format profile for YouTube section conservative retry in `engineManifest.ts` / command planning.
- [x] Add command-plan support for selecting the retry format profile without changing clip range, source URL, cookies, or final output naming semantics:
  - either `buildYtdlpCommandArgs(...)` accepts a format profile override;
  - or retry builds a shallow plan copy with only `formatProfile` changed.
- [x] Pass a valid resolved CLI proxy through to yt-dlp so YouTube section-download ffmpeg subprocesses can reach proxied Google media URLs:
  - Electron/system proxy resolution;
  - HTTP(S) proxy environment variables.
- [x] Hide the manual proxy configuration UI from Settings so proxy setup remains a docs/troubleshooting topic rather than an in-app flow.
- [x] Remove the legacy Ameow manual proxy compatibility path so stale `globalProxyEnabled/globalProxyUrl` config no longer influences downloader behavior.
- [x] Add a bounded retry branch in `ytDlpDownload.ts`:
  - only YouTube
  - only clip range present
  - only once
  - no full-video fallback
  - no quality downgrade fallback
  - skip clearly terminal video/page availability failures
  - check abort signal immediately before retry spawn
- [x] Isolate attempt state:
  - keep stderr per attempt;
  - use the last failed attempt for user-facing summary;
  - include bounded per-attempt stderr tails in debug logs if useful.
- [x] Prevent first-attempt partial artifacts from colliding with retry output:
  - clean retry-relevant partial files before retry, or
  - use attempt-specific temporary output naming and normalize on success.
- [x] Add stderr summary helper and tests:
  - filters `Press [q] to stop, [?] for help`
  - filters metadata-only lines
  - prefers actionable error lines
  - normalizes/annotates unsigned Windows ffmpeg exit codes
- [x] Update task-relevant tests for:
  - normal YouTube section command remains unchanged on first attempt
  - retry command still contains `--download-sections`
  - retry uses conservative selector
  - retry does not remove cookies or alter quality tier unless explicitly designed
  - retry does not trigger for non-YouTube, no clip range, cancellation, or already-retried failures
  - retry does not trigger for private/unavailable/404-like page failures
  - second attempt stderr, not first attempt stderr, drives terminal summary after retry failure
  - first-attempt partial files do not block retry
  - terminal error summary is actionable

## Phase 2: Light / Extended Contract Cleanup

- [x] Remove or retire `YouTubeMode` if it has no executable role.
- [x] Remove mode-like debug fields or rename them to describe the fixed extractor profile accurately.
- [x] Stop the extension from emitting inactive `forceExtended: false` defaults if no supported runtime behavior consumes them.
- [x] Update runtime normalization/types/schemas so legacy mode fields are either removed or accepted as ignored compatibility input.
- [x] Update tests that currently assert preservation of `forceExtended` / light-mode hint fields.
- [x] Update `.trellis/spec/backend/sidecar-runtime-contracts.md` and generated template/spec references to describe current extended-only YouTube behavior.
- [x] Confirm no docs/specs still claim public/default YouTube starts in light mode.

## Validation Commands

- `npm test -- src/electron-runtime/ytDlpCommandPlan.test.ts`
- `npm test -- src/electron-runtime/ytDlpDownload.test.ts`
- `npm test -- src/config/cliProxy.test.ts electron/desktopProxy.test.mts src/electron-runtime/service.test.ts`
- `npm run type-check`
- `npm run lint`

Adjust exact test commands if package scripts require a different runner invocation.

## Risk Points

- Retry cleanup must not delete artifacts produced by the first failed attempt if yt-dlp leaves partial files in unexpected names.
- Report-path handling must remain correct across attempts.
- The conservative selector must not accidentally cap `best` or downgrade `balanced` beyond the current quality contract.
- Cancellation must not be mistaken for retryable failure.
- Light/extended cleanup must not accidentally remove cookie handling, YouTube extended extractor args, remote components, or managed JS runtime args.
- Backward compatibility should tolerate older extension payloads that still contain now-ignored mode hint fields.

## Planning Gate

Do not start implementation until the user approves the final phased scope.
