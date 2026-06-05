# Implementation Plan

## Phase 1: Remove Default CLI Proxy Bridging

- [x] Read relevant backend and frontend specs before editing:
  - `.trellis/spec/backend/electron-runtime-contracts.md`
  - `.trellis/spec/backend/sidecar-runtime-contracts.md`
  - `.trellis/spec/frontend/type-safety.md` if renderer events or payloads change
- [x] Update runtime wiring so `session.resolveProxy(...)` no longer feeds a
      default `EngineExecutionContext.proxyUrl` for yt-dlp.
- [x] Keep `ElectronDownloadRuntimeOptions.resolveNetworkProxy` as an explicit
      hook for tests or future advanced wiring, but stop wiring it from the
      default Electron composition root.
- [x] Keep `ytDlpCommandPlan.ts` behavior that honors an explicit
      `context.proxyUrl`; only the default runtime source of that value should
      be removed.
- [x] Migrate tests that currently expect default `--proxy` injection:
  - service-level default path should assert `proxyUrl` is null/absent when no
    explicit proxy hook is wired;
  - command-plan and yt-dlp download tests should assert `--proxy` is absent
    when `context.proxyUrl` is null;
  - explicit `context.proxyUrl` tests should remain and continue to assert
    `--proxy` is included.
- [x] Add tests asserting default yt-dlp commands omit `--proxy` even when
      Electron proxy diagnostics can resolve an HTTP proxy.

## Phase 2: Add Proxy Diagnostics

- [x] Repurpose `src/config/cliProxy.ts` into proxy diagnostic helpers rather
      than duplicating parsing logic.
- [x] Add a small proxy diagnostic classifier for Electron proxy rules and
      environment proxy sources.
- [x] Detect and label direct, HTTP/HTTPS, SOCKS, mixed/PAC-like, malformed,
      environment, skipped-non-yt-dlp, and resolution-failed cases.
- [x] Include the sampled target URL or sanitized host summary in every
      diagnostic log entry.
- [x] Emit diagnostics through existing runtime logging first so support-log
      export captures them without a new support-log data path.
- [x] Ensure diagnostic logs are sanitized and do not include proxy credentials.
- [x] Add focused tests for the classifier and runtime logging behavior.

## Phase 3: Proxy-Specific Failure Surfacing

- [x] Catch proxy diagnostic sampling failures locally so diagnostics cannot
      introduce a new main-process error path.
- [x] Add proxy-aware guidance to YouTube/GitHub-compatible network failures:
      prefer TUN/global/VPN mode in the user's proxy tool.
- [x] If implementation evidence shows the original Electron dialog is still
      reachable after removing the proxy bridge, document the concrete path and
      either fix that boundary in this task or create a follow-up task for
      broader network failure hardening.

## Phase 4: Spec And Copy Updates

- [x] Update `.trellis/spec/backend/electron-runtime-contracts.md` to describe
      the spec-breaking reversal of the old `--proxy when available` contract:
  - no Ameow-owned manual proxy config;
  - Electron fetches use desktop/session defaults;
  - yt-dlp/ffmpeg default to ambient network behavior;
  - proxy diagnostics are informational, not an implicit CLI bridge.
- [x] Update generated template spec references if this repo keeps mirrored
      templates in `src/templates/markdown/spec/`.
- [x] Update user-facing locale copy for proxy guidance if existing error or
      runtime UI surfaces need clearer text.

## Validation Commands

- `npm test -- src/config/cliProxy.test.ts electron/desktopProxy.test.mts src/electron-runtime/service.test.ts src/electron-runtime/ytDlpCommandPlan.test.ts src/electron-runtime/ytDlpDownload.test.ts`
- Focused expected coverage:
  - `ytDlpCommandPlan.test.ts`: no `--proxy` with null/undefined proxy URL;
  - `ytDlpCommandPlan.test.ts` or `ytDlpDownload.test.ts`: explicit proxy URL
    still produces `--proxy`;
  - `service.test.ts`: default runtime path does not populate `proxyUrl`;
  - `service.test.ts`: explicit proxy hook remains possible;
  - `cliProxy.test.ts`: diagnostic categories for direct, HTTP/HTTPS, SOCKS,
    mixed/PAC-like, malformed, environment, skipped-non-yt-dlp, and
    resolution-failed cases;
  - `desktopProxy.test.mts`: Electron session remains system/default and never
    applies `fixed_servers`.
- `npm run type-check`
- `npm run lint`

Adjust exact test command grouping if the package runner requires smaller
batches.

## Risk Points

- Removing `--proxy` may affect users whose HTTP system proxy previously worked
  through Ameow's bridge. This is accepted for the default path, but diagnostics
  and copy must make the new ownership model clear.
- Global error handlers can hide real bugs if they are too broad. Prefer local
  catch boundaries and logging.
- General network failure hardening can scope-creep beyond proxy ownership.
  Keep this task focused on removing the bridge, diagnostics, and proxy-specific
  guidance unless a concrete observed path remains unfixed.
- Proxy diagnostics must avoid leaking credentials or sensitive proxy host data
  in user-facing surfaces.
- Runtime logs are used by support-log export; adding noisy diagnostics can make
  logs harder to read. Keep entries concise and event-like.
- Spec updates must not leave contradictory guidance claiming YouTube downloads
  receive `--proxy` by default.

## Planning Gate

Do not start implementation until the user reviews this plan and approves
moving the task from planning to in_progress.
