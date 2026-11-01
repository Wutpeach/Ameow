# brainstorm: regularize download architecture and site onboarding

## Goal

Redesign FlowSelect's download subsystem for long-term maintainability. The product's core value is downloading video and images, but the current implementation still mixes site-specific rules, engine-specific execution, browser-extension payload shaping, and legacy Pinterest sidecar logic. The refactor goal is to move to a clean `Provider + Engine + Orchestrator` architecture, retire the self-maintained `pinterest-dl`, and standardize future onboarding around `yt-dlp`, `gallery-dl`, and `direct` as the three long-term engines.

## What I already know

* The user wants architecture-first planning before implementation.
* The app's core capabilities are video download and image download.
* The desired long-term engine set is:
  * `yt-dlp`
  * `gallery-dl`
  * `direct`
* The user wants to remove the self-maintained `pinterest-dl` during this refactor to reduce maintenance burden.
* The repo already has a shared Electron download runtime under `src/electron-runtime/`.
* Current runtime executor routing is centralized but minimal:
  * Pinterest with usable hints -> Pinterest sidecar
  * direct media URL -> direct downloader
  * everything else -> yt-dlp
* Current site onboarding is still cross-layer and partially manual:
  * browser extension detector/content script
  * `background.js` payload shaping
  * runtime/Tauri routing
  * downloader-specific logic
* Existing backend spec already documents direct-download onboarding and runtime contracts, which confirms the project already feels the pain of repeated per-site integration work.
* The user has manually tested `gallery-dl` against Pinterest and reports the download result is very good.
* Current macOS `yt-dlp` in this repo is implemented as a wrapper script in `desktop-assets/binaries/yt-dlp-*`, while the app updater downloads the official `yt-dlp_macos` standalone binary. This should be normalized during the refactor.
* Exact code lookup used `rg` fallback because `ace-tool` search is not available in this session.

## Assumptions

* The main pain is not raw download success rate alone; it is the maintenance cost and inconsistency of adding and updating site support.
* Backward compatibility with current browser-extension message payloads matters during migration, but the long-term message contract can evolve.
* `gallery-dl` is now considered viable enough to enter the target architecture as a first-class engine, but provider-level fallback must still exist for edge cases.

## Open Questions

* None blocking. The first coding slice is now fixed below.

## Requirements

* Adopt a three-layer download architecture:
  * site/provider layer for site rules and intent resolution
  * engine layer for downloader execution
  * orchestration layer for queue/lifecycle/progress/fallback
* Introduce a runtime-owned `DownloadIntent` model and a runtime-owned `ResolvedDownloadPlan`.
* Treat engines as replaceable implementations, with no site hard-binding to `pinterest-dl`.
* Standardize the long-term engine set as:
  * `yt-dlp`
  * `gallery-dl`
  * `direct`
* Keep browser-extension logic lightweight:
  * detect page and optional site hint
  * extract raw page data
  * pass raw candidates/cookies/title
  * avoid final engine-selection logic in the extension
* Make onboarding a new site procedural and template-driven.
* Preserve existing download quality, cookies, queue, progress, and fallback behavior where practical during migration.
* Keep room for both video and image flows, plus segment/clip and future batch support.
* Model Pinterest as a normal provider that resolves to `gallery-dl`, `yt-dlp`, or `direct` depending on intent and evidence quality.
* Normalize macOS and Windows runtime supply strategy for bundled external engines.

## Acceptance Criteria

* [x] The target architecture is fixed as `Provider + Engine + Orchestrator`.
* [x] The preferred long-term abstraction path is fixed as `Provider -> Plugin`.
* [x] The long-term engine set is fixed as `yt-dlp + gallery-dl + direct`.
* [x] The self-maintained `pinterest-dl` is explicitly removed from the long-term plan.
* [x] Engine selection is defined as plan-based and intent-based, not site-hardcoded.
* [x] The PRD contains a formal architecture decision and migration phases.
* [x] The first coding slice is finalized.
* [x] Legacy browser-extension transport compatibility is removed:
  * desktop runtime accepts only `video_selected_v2` as the long-term queue action
  * browser-extension no longer falls back to legacy `video_selected` over WebSocket
* [x] Remaining historical Pinterest sidecar assets are removed from the active repo surface:
  * build/release workflows
  * scripts
  * docs/spec entries that still describe the retired sidecar release flow
* [x] `gallery-dl` bundled runtime supply is normalized across supported desktop targets with no system `PATH` fallback in runtime resolution.
* [x] Provider coverage/test confidence is expanded beyond the earlier migration slice with broader provider-plan/runtime regression coverage.

## Definition of Done

* [x] Tests added or updated where appropriate
* [x] Lint / typecheck / CI green
* [x] Docs and notes updated if behavior changes
* [x] Rollout and rollback considered if risky
* [x] Long-term migration leftovers listed in this PRD are implemented or explicitly moved to a follow-up task with a narrower scope

## Out of Scope

* Rebuilding every existing downloader immediately.
* Shipping a full plugin marketplace or hot-reload ecosystem in the first implementation phase.
* Solving every extractor edge case during brainstorming.
* Replacing `yt-dlp` with a custom universal downloader.
* Keeping heavy capability decisions inside the browser extension long-term.
* Keeping the self-maintained `pinterest-dl` as a permanent engine.

## Technical Notes

* Repo files inspected:
  * `src/electron-runtime/service.ts`
  * `src/electron-runtime/commandRouter.ts`
  * `src/electron-runtime/directDownload.ts`
  * `src/electron-runtime/ytDlpDownload.ts`
  * `src/electron-runtime/runtimePaths.ts`
  * `src/electron-runtime/platform.ts`
  * `src/types/videoRuntime.ts`
  * `browser-extension/background.js`
  * `browser-extension/direct-download-quality.js`
  * `electron/main.mts`
  * `.trellis/spec/backend/direct-download-onboarding-contracts.md`
  * `.trellis/spec/backend/sidecar-runtime-contracts.md`
* Current browser extension detectors include at least YouTube, Twitter/X, Bilibili, Douyin, Xiaohongshu, Pinterest, and protected-image flows.
* Current routing logic is centralized, but site capability modeling is not yet first-class.
* Current macOS `yt-dlp` binary names are:
  * `yt-dlp-aarch64-apple-darwin`
  * `yt-dlp-x86_64-apple-darwin`
* Current repo state shows those macOS `yt-dlp` files are wrappers, while update logic fetches `yt-dlp_macos`.

## Research Notes

### What similar tools do

* `yt-dlp` separates extractor logic from downloader and postprocessor logic.
* `gallery-dl` separates extractor concerns from downloader/output/postprocessor concerns and supports layered configuration scopes.

### Constraints from our repo/project

* FlowSelect is not a pure CLI downloader; it spans browser extension, desktop runtime, settings UI, managed binaries, and queue/progress UX.
* New direct-download sites already require cross-layer updates, which is where maintenance cost accumulates.
* Pinterest currently uses a dedicated sidecar path, but the refactor goal is to retire that self-maintained path.

## Formal Architecture Decision

### Decision Summary

FlowSelect will adopt `Provider + Engine + Orchestrator` as the permanent download architecture.

### Layer Model

* `Provider Layer`
  * owns site matching, capability modeling, input normalization, candidate extraction, candidate ranking, auth requirements, and download-plan generation
* `Engine Layer`
  * owns execution of `yt-dlp`, `gallery-dl`, `direct`, and future engines
* `Orchestration Layer`
  * owns queueing, concurrency, cancellation, progress, retries, settlement, fallback execution, and runtime dependency checks

### Core Runtime Contracts

* `DownloadIntent`
  * discriminated union such as `video | image | segment | batch | direct`
  * common base metadata includes `siteId`, `originalUrl`, `title`, `cookies`, `userAgent`, `referer`, `priority`
* `EnginePlan`
  * one engine execution candidate with priority, reason, and role such as `primary` or `fallback`
* `ResolvedDownloadPlan`
  * contains `DownloadIntent` plus ordered engine plans
* `SiteProvider`
  * resolves raw page input into `ResolvedDownloadPlan`
* `DownloadEngine`
  * validates and executes an intent without importing any provider logic

### Engine Roles

* `yt-dlp`
  * default primary engine for video-first and player-style sites
  * generic page-level fallback for many providers
* `gallery-dl`
  * default primary engine for image-heavy, gallery-heavy, and Pinterest-like resource sites
  * may also serve video on mixed-content providers when validated
* `direct`
  * evidence-driven engine used when provider has a high-confidence final media URL
  * may be primary or fallback depending on provider rules

### Engine Selection Policy

FlowSelect must not decide engines by simple site hardcoding such as `pinterest -> gallery-dl`.
Instead, each provider resolves a `ResolvedDownloadPlan` from:

* intent type
  * video, image, segment, batch, direct
* evidence quality
  * page URL only, structured candidates, verified direct asset, auth state
* provider-specific stability rules
* fallback policy by machine-readable error code

This means overlapping engine support is expected and desirable. The provider chooses the engine ladder for the specific request, not for the site in the abstract.

### Pinterest Decision

* Pinterest becomes a normal provider.
* `pinterest-dl` is removed from the long-term architecture.
* Pinterest providers should prefer:
  * `direct` when a verified high-confidence direct asset exists
  * `gallery-dl` as the default maintained extractor path
  * `yt-dlp` as fallback where it remains useful

### Runtime Supply Strategy

* `yt-dlp`
  * Windows: bundled standalone binary
  * macOS: bundled standalone binary
  * current macOS wrapper state should be replaced with a bundled standalone strategy for consistency
* `gallery-dl`
  * Windows: bundled standalone binary when FlowSelect verifies the build supply path
  * macOS: bundled standalone binary from the maintained builds path when FlowSelect verifies the build supply path
  * if packaging constraints appear, keep engine abstraction unchanged and swap the runtime supplier only
* `direct`
  * internal runtime implementation with no external downloader packaging dependency

### Registry and Pluginization

* The provider registry must be dynamic-loader friendly.
* The first implementation may still use a loader abstraction that is backed by explicit module registration if that reduces rollout risk.
* Public architecture must not couple provider discovery to one specific loader mechanism.
* Future pluginization remains an allowed evolution, but is not required for the first coding phase.

### Extension Responsibility

The browser extension should evolve toward:

* page detection
* optional `siteHint`
* raw candidate extraction
* cookies/title/raw page metadata capture

The runtime should own:

* capability decisions
* final engine ordering
* fallback planning
* intent validation

## Migration Plan

* Phase 0
  * contract-first foundation under `src/core/`
  * core types, schemas, constants, errors, event contracts
* Phase 1
  * build `SiteProvider` system under `src/sites/`
  * add loader abstraction, provider interface, provider template
* Phase 2
  * build `DownloadEngine` layer under `src/engines/`
  * wrap `yt-dlp`, `gallery-dl`, and `direct`
* Phase 3
  * refactor orchestration into a pure `DownloadOrchestrator`
* Phase 4
  * migrate exemplar providers:
    * one `yt-dlp`-first provider
    * one `direct`-first provider
    * Pinterest as `gallery-dl`-first with fallback
* Phase 5
  * migrate remaining providers and remove legacy route branching
* Phase 6
  * slim browser-extension payloads and add `video_selected_v2` compatibility flow
* Phase 7
  * add provider templates, scaffolding, capability matrix, tests, and contributor docs
* Phase 8
  * add observability, versioned intent contracts, and CI surfaces for long-term extension

## First Coding Slice

### Scope

* Implement the minimal executable architecture slice:
  * contracts
  * provider loader
  * engine layer
  * minimal orchestrator integration
* Migrate three exemplar providers:
  * one `yt-dlp`-first provider
  * one `direct`-first provider
  * Pinterest as `gallery-dl`-first with fallback
* Keep the current browser-extension message contract for this slice.

### Included

* `DownloadIntent`, `EnginePlan`, `ResolvedDownloadPlan`, `SiteProvider`, `DownloadEngine`
* provider registry / loader abstraction
* engine registry for `yt-dlp`, `gallery-dl`, `direct`
* minimal orchestrator execution path that consumes `ResolvedDownloadPlan`
* provider tests and basic engine-plan / fallback tests

### Excluded

* full site migration
* plugin manifests and hot loading
* observability/versioned intent contracts beyond the current production boundary

## Implementation Status

### Completed In This Slice

* Added the new contract-first core under `src/core/`
  * `DownloadIntent`
  * `EnginePlan`
  * `ResolvedDownloadPlan`
  * `SiteProvider`
  * `DownloadEngine`
  * Zod-backed runtime validation
* Added provider system under `src/sites/`
  * builtin provider loader
  * provider registry
  * provider template
  * exemplar providers:
    * `youtube`
    * `douyin`
    * `pinterest`
    * `generic`
* Added engine layer under `src/engines/`
  * `yt-dlp`
  * `gallery-dl`
  * `direct`
* Added orchestrator under `src/orchestration/`
  * ordered engine execution
  * validation before execution
  * fallback by engine plan
* Replaced the old `src/electron-runtime/service.ts` selector with the new runtime queue implementation.
* Wired the real Electron main-process download entry in `electron/main.mts` to the new runtime.
* Removed the Pinterest sidecar from the live download path.
* Updated runtime dependency modeling:
  * `gallery-dl` is now a first-class runtime dependency snapshot entry
  * managed bootstrap gate now only requires `ffmpeg` and `deno`
  * `gallery-dl` supports bundled lookup plus temporary system `PATH` fallback
* Updated settings UI:
  * removed the Pinterest downloader card
  * added a `gallery-dl` downloader card and info path
* Updated Electron build/dev wiring so the compiled main entry can import shared runtime modules from `src/`.

### Explicitly Removed From The Live Path

* `src/electron-runtime/pinterestSidecar.ts`
* `src/types/pinterestDownloader.ts`
* Electron packaging reference to `desktop-assets/pinterest-sidecar/lock.json`
* Old runtime gate requirement that treated `pinterest-dl` as a managed dependency

### Validation Result

* `npm run type-check` passed
* `npm run test` passed
* `npm run lint` passed
* `npm run build` passed

### Completed After The Initial Slice

* Expanded provider coverage beyond the initial exemplars:
  * added `bilibili`
  * added `twitter-x`
  * added `xiaohongshu`
  * hardened `douyin` direct-asset routing when the direct media URL is already the primary `url`
* Added provider-registry tests for:
  * provider selection
  * clip metadata preservation
  * explicit `siteHint` routing
* Introduced runtime-owned site-hint normalization under `src/core/site-hints.ts`.
* Introduced backward-compatible browser-extension payload slimming:
  * extension now prefers `video_selected_v2`
  * background derives and forwards `siteHint`
  * Electron main process still accepts legacy `video_selected`
* Reworked queue normalization so non-Pinterest providers can keep raw HTTP(S) candidates while Pinterest keeps stricter asset validation rules.
* Moved more route authority out of the extension:
  * background no longer upgrades `preferredVideoUrl` into the primary route URL for general site handling
  * runtime/provider layer now uses `siteHint` plus normalized raw candidates to decide routing
* Finished slimming extension-side candidate authority:
  * background now forwards normalized candidates without platform-specific ranking
  * runtime normalization now owns Pinterest trust ordering plus Douyin/Xiaohongshu direct-quality ordering

### Validation Result For Follow-Up Slices

* `npm run test` passed after provider migration and cross-layer payload slimming
* `npm run type-check` passed after provider migration and cross-layer payload slimming
* `npm run lint` passed after provider migration and cross-layer payload slimming
* `npm run build` passed after provider migration and cross-layer payload slimming

### Remaining Work For Next Phases

* None. These items are now part of the current task's acceptance target:
  * remove remaining historical Pinterest-sidecar build/docs/scripts from the repo
  * consolidate `video_selected_v2` as the long-term extension contract and retire legacy `video_selected`
  * add broader provider fixture coverage and end-to-end download tests for migrated sites
  * normalize bundled binary supply for `gallery-dl` on every target platform and remove temporary system `PATH` fallback

## New Site Onboarding Flow

* Add a new provider file under `src/sites/`
* Implement `SiteProvider`
* Define supported capabilities and plan-generation logic
* Add or reuse engine-plan fallback rules
* Add provider tests and contract fixtures
* Add extension detection only if raw page discovery needs site-specific help

## Design Constraints

* Providers must not import engines directly.
* Engines must not import providers directly.
* Providers output plans; orchestrator executes plans.
* Runtime owns final capability and engine decisions.
* Errors and logs must be standardized with machine-readable codes and context.
* Intent payloads must keep forward-compatible extension space.
