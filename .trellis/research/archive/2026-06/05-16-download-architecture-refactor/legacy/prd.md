# brainstorm: download architecture refactor

## Goal

Plan a phased refactor of Ameow's download subsystem by learning from `mhogomchungu/media-downloader`, especially its multi-engine CLI adapter model, while preserving Ameow's current browser-extension, provider, queue, runtime-gate, and completion-event contracts.

## What I already know

- User wants a staged refactor plan, not immediate implementation.
- Ameow currently routes downloads through Electron/TypeScript runtime modules, not the older Rust-centered path described in some specs.
- Current core layers:
  - `src/core/types/raw-download-input.ts`
  - `src/core/types/download-intent.ts`
  - `src/core/types/engine-plan.ts`
  - `src/sites/*`
  - `src/engines/*`
  - `src/orchestration/download-orchestrator.ts`
  - `src/electron-runtime/service.ts`
  - `src/electron-runtime/ytDlpDownload.ts`
  - `src/electron-runtime/galleryDlDownload.ts`
  - `src/electron-runtime/directDownload.ts`
  - WebSocket entry in `electron/main.mts`
- Ameow already has a bounded queue (`maxConcurrent` default 3), site provider registry, engine registry, fallback orchestration, runtime dependency gate, telemetry, and tests.
- `media-downloader` is a Qt/C++ GUI frontend to multiple CLI tools. Its default engine is `yt-dlp`; additional engines are installed as JSON extension definitions.

## Assumptions

- The primary goal is maintainability and easier future engine/site addition, not replacing current downloader stack wholesale.
- Direct-download browser-extension flows for Douyin/Xiaohongshu/Pinterest-like sites remain product-specific and should not be reduced to generic CLI-only behavior.
- Runtime bootstrap rules for `yt-dlp`, `gallery-dl`, `ffmpeg`, and `deno` remain a first-class contract.

## Requirements

- Preserve `video_selected_v2` payload compatibility.
- Preserve completion semantics: every queued download must emit `video-download-complete` on success, failure, and cancellation.
- Keep `traceId` on progress/completion events.
- Keep runtime dependency bootstrap/gate behavior decoupled from pure status refresh.
- Make engine-specific invocation, progress parsing, and output normalization easier to extend and test.
- Keep site-specific extraction/hint validation separate from engine execution.

## Research Notes

### What media-downloader does

- Stores engine definitions under `extensions/*.json`.
- Engine JSON contains fields such as `Name`, `Cmd`, `DefaultDownLoadCmdOptions`, `DefaultListCmdOptions`, `DownloadUrl`, `ControlJsonStructure`, cookie arguments, playlist arguments, version arguments, output splitting rules, and platform-specific executable names.
- C++ loads extension JSON files from an app data `engines.v1` folder, chooses command by platform/CPU, resolves executable location, and instantiates a small set of special classes (`yt_dlp`, `gallery_dl`, `aria2c`, etc.) or falls back to `generic`.
- Progress filtering is partly declarative via `ControlJsonStructure` and partly specialized through engine classes.
- Generic process runner handles command construction, environment/proxy injection, working directory, cancellation, stdout/stderr streaming, and final state.
- Supports multiple UI modes (basic, batch, playlist), user option history, custom extension JSON import, and engine auto-update.

### What maps well to Ameow

- Declarative engine manifests can move static knowledge out of `ytDlpDownload.ts`, `galleryDlDownload.ts`, and runtime path code.
- A shared process execution lifecycle can replace repeated sidecar orchestration details.
- A split between generic CLI engine behavior and narrow specializations matches Ameow's existing `DownloadEngine` interface.
- Engine manifests should be internal/versioned at first, not user-installable plugins, because Ameow has stronger runtime/provenance requirements.

### What does not map directly

- `media-downloader` lets users choose engines broadly. Ameow uses automatic site strategy and browser-derived context, so routing must stay provider-driven.
- `media-downloader` does not have Ameow's browser-extension payload trust model, direct candidate ranking, runtime bootstrap gates, AE-safe post-processing, or Electron event contracts.
- `media-downloader` progress parsing is line-pattern oriented; Ameow already uses structured yt-dlp hooks (`--print-to-file after_move:filepath`) that should remain authoritative.

## Proposed Direction

- Keep Ameow's current high-level architecture: entry normalization -> provider resolve -> engine chain -> runtime execution -> terminal event/telemetry.
- Refactor below that line:
  - introduce internal engine manifest schema,
  - centralize command planning and process lifecycle,
  - make engine-specific code smaller adapters,
  - gradually move site strategies and engine capabilities into declarative data,
  - only later consider user-installable engine packs.

## Acceptance Criteria

- [ ] Final answer gives a staged plan with dependencies, risks, and validation for each phase.
- [ ] Plan explicitly compares borrowed `media-downloader` ideas with Ameow-specific constraints.
- [ ] Plan identifies safe first implementation slices.
- [ ] Plan includes a testing strategy.

## Out of Scope

- No code implementation in this planning turn.
- No direct adoption of `media-downloader` GPL code.
- No immediate user-installable plugin marketplace.

## Technical Notes

- Existing tests to protect during refactor:
  - `src/orchestration/download-orchestrator.test.ts`
  - `src/electron-runtime/service.test.ts`
  - `src/electron-runtime/ytDlpDownload.test.ts`
  - `src/electron-runtime/galleryDlDownload.test.ts`
  - `src/electron-runtime/directDownload.test.ts`
  - `src/sites/providers.test.ts`
  - `browser-extension/*detector*.test.js`
- External source inspected locally at `/tmp/media-downloader`.

## Implementation Summary

### Completed slices

- Phase 1: Added internal CLI engine manifests in `src/electron-runtime/engineManifest.ts` for `yt-dlp` and `gallery-dl` static invocation data.
- Phase 2: Extracted pure command planners in `ytDlpCommandPlan.ts` and `galleryDlCommandPlan.ts`; runtime modules still own process execution, progress parsing, retries, cleanup, and result normalization.
- Phase 3: Reused manifest-backed extended YouTube yt-dlp helper from the metadata probe path.
- Phase 4: Added `InvalidCommandPlanError` and mapped expected planner validation failures to `E_INVALID_ENGINE_PLAN` without swallowing unexpected planner errors.
- Phase 5: Applied the same invalid-plan mapping to the yt-dlp runtime path.
- Phase 6: Preserved yt-dlp `DownloadRuntimeError` codes after cleanup and classified missing final output paths as `E_OUTPUT_NOT_FOUND`.
- Phase 7: Preserved direct-download `DownloadRuntimeError` codes after partial-output cleanup.
- Phase 8: Extracted app updater HTTP file download streaming into `electron/appUpdateDownload.mts`, added tests for GitHub headers, progress, HTTP failures, and timeout mapping, and removed the updater downloader implementation from `electron/main.mts`.
- Phase 9: Extracted `check_ytdlp_version` and `get_gallery_dl_info` version-info assembly into `electron/downloaderVersionInfo.mts`, keeping `electron/main.mts` as the dependency injector and preserving the macOS managed-runtime compatibility ceiling contract.
- Phase 10: Extracted the Electron app update check/install controller into `electron/appUpdateController.mts`, moving pending-update state, manifest selection, prerelease fallback, installer download, and open-installer preconditions out of `electron/main.mts` while preserving the preload updater IPC surface.
- Phase 11: Extracted support-log section assembly and file writing into `electron/supportLogExport.mts`, preserving the `export_support_log` string-path command contract and required `[environment]`, `[settings]`, `[runtime]`, and `[recent-runtime-log]` sections.
- Phase 12: Extracted runtime log capture, write serialization, memory-buffer fallback, and recent-line reading into `electron/runtimeLog.mts`, keeping `electron/main.mts` as the provider of app/runtime paths and preserving support-log access to recent runtime lines.
- Phase 13: Extracted startup diagnostics into `electron/startupDiagnostics.mts`, moving diagnostic file append serialization, window snapshot collection, renderer-ready waiting, renderer console diagnostics, and startup capture summaries out of `electron/main.mts`.
- Phase 14: Extracted image/download save logic into `electron/imageDownload.mts`, moving request-header normalization, Twitter/X and Xiaohongshu image header/referrer behavior, Node HTTP fallback, image/data URL save paths, filename inference, collision suffixing, and focused tests out of `electron/main.mts` while keeping Electron session fetch, config IO, rename stem allocation/release, and protected-image extension fallback injected by `electron/main.mts`.
- Phase 15: Extracted config/settings IO into `electron/configStore.mts`, moving `settings.json` path resolution, user-data/log directory creation, JSON parsing, startup language persistence, config selectors, raw config save, language/debug-config side effects, and output-folder fallback out of `electron/main.mts` while keeping Electron app paths, locale, app-event emission, WebSocket broadcasts, and tray refresh injected by `electron/main.mts`.
- Phase 16: Extracted native locale/tray/menu support into `electron/trayMenu.mts`, moving native locale candidate filtering, locale JSON loading with fallback/default labels, tray icon path selection, macOS tray image sizing, and tray menu callback wiring out of `electron/main.mts` while keeping Electron `Tray`/`Menu`/`nativeImage`, app quit, settings window opening, and main-window show callbacks injected by `electron/main.mts`.
- Phase 17: Extracted pure window routing and secondary-window placement helpers into `electron/windowRouting.mts`, moving dev/packaged renderer route construction, secondary route mapping, anchor label/gap selection, and anchored secondary-window placement/clamping out of `electron/main.mts` while keeping BrowserWindow lifecycle, screen access, and window registry ownership in `electron/main.mts`.
- Phase 18: Extracted UI Lab runtime/download/transcode preview scenarios into `electron/uiLabScenarios.mts`, moving runtime fixture builders, reset/live restore event flow, empty task-state emission, and all UI Lab scenario payloads out of `electron/main.mts` while keeping development gating, main-window reveal, runtime override storage, live queue state, and runtime gate lookup injected by `electron/main.mts`.
- Phase 19: Extracted clipboard/file intake into `electron/fileIntake.mts`, moving clipboard file-path parsing, pasted/dropped file copy logic, directory copy handling, rename-mode allocation/release, and collision-safe target selection out of `electron/main.mts` while keeping Electron clipboard access, config reads, output-folder resolution, and rename stem helpers injected by `electron/main.mts`.

### Next slice

- Phase 20: Review whether remaining `electron/main.mts` code still has a low-risk extraction slice.
  - Candidate slices:
    - WebSocket request pending-map helpers,
    - hidden navigation / Xiaohongshu drag-resolution helpers,
    - BrowserWindow lifecycle controller.
  - Move or wrap:
    - only code with clear ownership and useful focused tests.
  - Keep injected from `electron/main.mts`:
    - Electron app/window/session primitives,
    - WebSocket client sets and pending request maps unless ownership is fully moved,
    - runtime controllers whose state is already encapsulated.
  - Preserve behavior:
    - no changes to renderer command/event names,
    - no changes to extension WebSocket action names,
    - no changes to real download/runtime queue behavior.
  - Validation:
    - `npx tsc -p tsconfig.electron.json --noEmit`
    - `npm run type-check`
    - `npm run lint`
    - `npm test`
    - `git diff --check`

### Preserved contracts

- No changes to `video_selected_v2` payload compatibility.
- No changes to provider routing, engine chain priority, queue concurrency, runtime dependency gate/bootstrap behavior, or terminal `video-download-complete` emission semantics.
- `traceId` remains carried by progress/completion payloads.
- `yt-dlp` still uses `after_move:filepath` as authoritative final-path reporting.
- No changes to preload command/event names, including `export_support_log`; runtime-log files still use `runtime-latest.log` under the app logs directory.
- Startup diagnostics still write `startup-diagnostics-latest.txt` and startup captures under the app logs directory when packaged diagnostics are enabled.

### Deferred work

- Legacy `electron/main.mts` queued yt-dlp risk was audited in child task `05-17-05-17-retire-legacy-queued-ytdlp-risk` and retired: real queue/download execution now routes through `electron/videoDownloadCommands.mts` and `src/electron-runtime/service.ts`; remaining queue/progress emissions in `electron/main.mts` are UI Lab scenarios.
- User-installable engine manifests/plugins remain out of scope.
