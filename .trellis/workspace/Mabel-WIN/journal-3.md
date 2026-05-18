# Journal - Mabel-WIN (Part 3)

> Continuation from `journal-2.md` (archived at ~2000 lines)
> Started: 2026-03-30

---



## Session 98: Refine icon-main window switching and stabilize UI Lab preview

**Date**: 2026-03-30
**Task**: Refine icon-main window switching and stabilize UI Lab preview
**Branch**: `main`

### Summary

Adjusted icon/main window transitions, fixed UI Lab preview state races, and neutralized the queue badge shell styling.

### Main Changes

## Outcome
- Refined icon/main window switching so pointer leave can collapse immediately when idle-ready, while busy states keep the main window visible and resume the existing idle-delay collapse after foreground work ends.
- Stabilized UI Lab preview activation by preventing preview scenarios from racing with normal minimize/show flows and by forcing preview rendering to stay in full main-window visuals.
- Unified the top-left queue badge shell to a neutral style so download, transcode, and mixed queues no longer disagree on badge-level color glow.

## Commits
- `e3540d6` `fix(ui): refine icon and main window switching`
- `094e2fd` `fix(ui): stabilize ui lab preview window state`
- `c7016d4` `fix(ui): neutralize queue badge styling`

## Verification
- `npm test`
- `npm run type-check`
- `npm run lint`

## Notes
- The local Trellis spec was updated with the UI Lab preview contract, but `.trellis/` is gitignored in this repo, so that knowledge remains local workspace metadata.


### Git Commits

| Hash | Message |
|------|---------|
| `e3540d6` | (see git log) |
| `094e2fd` | (see git log) |
| `c7016d4` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 99: Desktop bugfix hardening and cross-platform drag parsing

**Date**: 2026-03-30
**Task**: Desktop bugfix hardening and cross-platform drag parsing
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Pinterest drag safety | Dropped embedded `videoUrl` values that are not real Pinterest media hints, preventing page URLs from overriding valid media candidates. |
| Windows filename safety | Hardened reserved device-name sanitization so stems like `CON.txt` and `nul.part1` become valid output names. |
| Cross-platform file URLs | Added shared renderer `file://` parsing so Windows drive paths and macOS absolute paths normalize correctly during local drag/drop and local image handling. |
| Verification | `npm run lint`, `npm run type-check`, and `npm test` all passed before commit. |
| Remaining risk | macOS behavior still needs on-device validation for transparent windows, DMG flow, autostart, and managed-runtime extraction. |


### Git Commits

| Hash | Message |
|------|---------|
| `1800c5f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 100: Download runtime architecture slice landed

**Date**: 2026-03-30
**Task**: Download runtime architecture slice landed
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

# Download Architecture Refactor Slice

| Area | Description |
|------|-------------|
| Core contracts | Added `src/core/` with `DownloadIntent`, `EnginePlan`, `ResolvedDownloadPlan`, provider/engine contracts, error codes, and Zod schemas. |
| Provider system | Added `src/sites/` with registry/loader plus exemplar providers for `youtube`, `douyin`, `pinterest`, and `generic`. |
| Engine layer | Added `src/engines/` for `yt-dlp`, `gallery-dl`, and `direct`. |
| Orchestration | Added `src/orchestration/download-orchestrator.ts` to validate plans and execute ordered engine fallback. |
| Electron runtime | Replaced the legacy runtime selector with the new queue runtime in `src/electron-runtime/service.ts` and connected the real Electron main-process download entry in `electron/main.mts`. |
| Pinterest removal | Removed the live `pinterest-dl` path, deleted `src/electron-runtime/pinterestSidecar.ts`, and deleted `src/types/pinterestDownloader.ts`. |
| Runtime deps | Updated runtime dependency status/gate to stop requiring `pinterest-dl`; added first-class `gallery-dl` discovery with bundled lookup plus temporary system `PATH` fallback. |
| Settings UI | Replaced the Pinterest downloader card with a `gallery-dl` card and corresponding info contract. |
| Build wiring | Updated Electron build/dev entry wiring so the compiled main process can import shared modules from `src/`; `package.json` main now points at `dist-electron/electron/main.mjs`. |
| PRD sync | Updated `.trellis/tasks/03-30-download-architecture-brainstorm/prd.md` with completed slice status, validation, and next-phase remaining work. |

**Validation**:
- `npm run type-check`
- `npm run test`
- `npm run lint`
- `npm run build`

**Commit**:
- `eae2f48` `refactor download runtime architecture`

**Next session focus**:
- Continue migrating remaining legacy sites into `src/sites/`
- Decide whether to fully remove old Pinterest sidecar scripts/docs from the repo
- Start the browser-extension payload slimming / v2 message design when ready


### Git Commits

| Hash | Message |
|------|---------|
| `eae2f48` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 101: Download architecture follow-up: provider migration and payload slimming

**Date**: 2026-03-30
**Task**: Download architecture follow-up: provider migration and payload slimming
**Branch**: `main`

### Summary

Expanded provider coverage, added runtime-owned siteHint normalization, and introduced backward-compatible video_selected_v2 payload slimming.

### Main Changes

# Download Architecture Follow-Up

| Area | Description |
|------|-------------|
| Provider coverage | Added provider coverage for Bilibili, Twitter/X, and Xiaohongshu, and hardened Douyin direct-asset routing when the primary url is already a direct media asset. |
| Cross-layer contract | Introduced runtime-owned `siteHint` normalization and backward-compatible `video_selected_v2` handling so the desktop runtime regains more route authority. |
| Extension payload | Slimmed the browser-extension background bridge to forward `siteHint` and raw candidates instead of upgrading a preferred route url for general sites. |
| Electron normalization | Updated Electron main-process and runtime command routing to keep generic HTTP(S) candidates for non-Pinterest providers while preserving strict Pinterest hint validation. |
| Verification | Confirmed `npm run test`, `npm run type-check`, `npm run lint`, and `npm run build` pass after the cross-layer contract slice. |
| Next focus | Continue slimming detector/background logic so extension-side candidate ranking and platform routing logic disappear from the hot path. |


### Git Commits

| Hash | Message |
|------|---------|
| `45f7b23` | (see git log) |
| `2fb72d8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 102: Complete download architecture long-term cleanup

**Date**: 2026-03-30
**Task**: Complete download architecture long-term cleanup
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Architecture cleanup | Completed the long-term download architecture cleanup by retiring legacy `video_selected` transport compatibility and removing the remaining Pinterest sidecar repo surface. |
| Runtime supply | Switched `gallery-dl` to bundled-only runtime resolution, added release build/smoke scripts, and updated release workflow packaging. |
| Provider/runtime behavior | Expanded provider/runtime regression coverage and fixed orchestrator fallback so engine results with `success: false` continue to the next fallback plan. |
| Docs and task state | Updated local PRD/spec notes, synced locales, archived the task, and verified the repo against lint/typecheck/tests/build before commit. |

Human testing: partial manual testing completed after the commit; no obvious issues were found in that pass.


### Git Commits

| Hash | Message |
|------|---------|
| `afa85e03cd78398c6a13ff7dd1417b4f774c6cca` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 103: Stabilize extension video selection event naming

**Date**: 2026-03-30
**Task**: Stabilize extension video selection event naming
**Branch**: `main`

### Summary

Unified browser-extension internal video selection messages to the stable name video_selection, kept video_selected_v2 as the desktop WebSocket action, and cleaned tracked README guidance that still referenced the retired Pinterest sidecar.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `2697b75` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 104: Pinterest gallery-dl routing and runtime prep

**Date**: 2026-03-31
**Task**: Pinterest gallery-dl routing and runtime prep
**Branch**: `main`

### Summary

Switched Pinterest downloads to gallery-dl, added runtime prep/diagnostics, and left the upstream Pinterest API failure unresolved.

### Main Changes

- Routed Pinterest downloads to `gallery-dl` only, removing the `yt-dlp` fallback plan.
- Added local and CI `gallery-dl` ensure/build flow via `scripts/ensure-gallery-dl-binary.mjs` and wired it into npm build/dev entrypoints plus release workflow.
- Surfaced missing bundled `gallery-dl` earlier in runtime dependency status/UI instead of failing late with `spawn ... ENOENT`.
- Improved `gallery-dl` failure reporting to include trailing stderr/stdout detail and added regression coverage.
- Shared sidecar cookie-file handling so both `yt-dlp` and `gallery-dl` can consume extension cookies.
- Fixed Electron queue normalization so optional `title` / `cookies` become `undefined` instead of invalid `null` values.
- Built and smoke-tested local Windows `gallery-dl` binary during the session.
- Remaining issue: Pinterest downloads still fail at the upstream API stage with `[pinterest][error] API request failed`.


### Git Commits

| Hash | Message |
|------|---------|
| `3292aa1` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 105: Downloader runtime hardening and window-state recovery

**Date**: 2026-03-31
**Task**: Downloader runtime hardening and window-state recovery
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Downloader binaries | Replaced self-built `yt-dlp` / `gallery-dl` packaging with official upstream Windows binaries plus manifest, ensure, and smoke scripts. |
| Pinterest stability | Kept Pinterest on `gallery-dl`, verified official bundled binary can resolve the reported pin URL successfully, and removed the broken self-built binary path. |
| Task cancellation | Hardened runtime cancellation on Windows by killing the full process tree and cleaning newly created temp artifacts including `.part` files on cancel/failure. |
| Window lifecycle | Restored compact/icon return flow and draggable state after download/transcode completion or cancellation, avoiding the clipped 80x80-style main window regression. |
| Dev/runtime robustness | Fixed Electron dev startup by forcing an initial full electron TypeScript build before watch mode to avoid half-written `dist-electron` imports. |

**Human-validated outcomes**:
- Download start no longer makes the main window disappear for tested Bilibili and Pinterest flows.
- Pinterest downloads work again through `gallery-dl`.
- Cancel now stops the task path correctly and follow-up cleanup logic is in place.
- Download/transcode completion returns the app to compact mode and drag behavior is restored.

**Verification**:
- `npm run lint`
- `npm run type-check`
- `npm run test`
- `node ./scripts/ensure-downloader-binaries.mjs`
- `node ./scripts/smoke-downloader-binaries.mjs`


### Git Commits

| Hash | Message |
|------|---------|
| `3292aa1` | (see git log) |
| `f86fd5c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 106: Align mac downloader binaries and updater flows

**Date**: 2026-03-31
**Task**: Align mac downloader binaries and updater flows
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| mac downloader packaging | Removed the old mac `yt-dlp` wrapper scripts so macOS follows the same official bundled-binary supply chain as Windows. |
| official updater flow | Generalized the Electron downloader updater path so both `yt-dlp` and `gallery-dl` can check latest upstream releases and replace the bundled binary in-app. |
| settings UI | Updated the Settings downloader cards so `gallery-dl` now shows version status and supports the same check/update flow as `yt-dlp`. |
| runtime validation | Added runtime-path coverage for macOS downloader binary names and kept the cross-layer command/type wiring in sync. |

**User-visible outcome**:
- macOS downloader delivery is aligned with the Windows bundled-binary model instead of the previous Python-wrapper fallback.
- `yt-dlp` and `gallery-dl` now both support in-app check/update capability; neither depends on auto-update prompts.

**Verification**:
- `npm run type-check`
- `npm run lint`
- `npm run test`


### Git Commits

| Hash | Message |
|------|---------|
| `5fd245f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 107: Downloader naming, i18n, and proxy fixes

**Date**: 2026-04-01
**Task**: Downloader naming, i18n, and proxy fixes
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

## Work Summary
- Fixed Pinterest duplicate-name download failures by switching Pinterest video stems to `pinterest_<shortId>` and reserving output stems across active tasks.
- Improved `gallery-dl` UX so indeterminate runs leave `Preparing...` early, emit activity tokens, and render localized activity copy in the main window and extension locales.
- Switched direct-download fetches to Electron session networking so downloads follow the OS/system proxy configuration.
- Restored `yt-dlp` full-video source naming to `<title>[<width>x<height>][<quality>]` when rename is disabled, while keeping cleanup aligned with the expanded template.

## Verification
- `npx vitest run src/electron-runtime/galleryDlDownload.test.ts src/electron-runtime/service.test.ts src/electron-runtime/runtimeUtils.test.ts`
- `npx vitest run src/electron-runtime/service.test.ts src/electron-runtime/galleryDlDownload.test.ts src/electron-runtime/runtimeUtils.test.ts src/electron-runtime/ytDlpDownload.test.ts`
- `npx vitest run src/electron-runtime/ytDlpDownload.test.ts src/electron-runtime/service.test.ts src/electron-runtime/runtimeUtils.test.ts`
- `npm run type-check`
- `npm run lint`

## Commits
- `7bfa61c` fix(download): stabilize pinterest video naming
- `e7af750` fix(download): localize gallery-dl activity labels
- `017152e` fix(extension): sync gallery-dl locale strings
- `58145e3` fix(download): follow system proxy for direct fetches
- `b87106f` fix(extension): sync download activity locale keys
- `fec1c32` fix(download): restore ytdlp source naming


### Git Commits

| Hash | Message |
|------|---------|
| `7bfa61c` | (see git log) |
| `e7af750` | (see git log) |
| `017152e` | (see git log) |
| `58145e3` | (see git log) |
| `b87106f` | (see git log) |
| `fec1c32` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 108: Unify download naming rules

**Date**: 2026-04-01
**Task**: Unify download naming rules
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Video naming | Unified runtime video stems to prefer cleaned titles when available, while keeping yt-dlp outputs in the `title[resolution][quality].ext` style when rename mode is off. |
| Global rename toggle | Routed video, image, save-data-url, and file-copy flows through a shared rename-rule allocator so `renameMediaOnDownload` behaves as one global rename strategy switch. |
| Fallbacks and tests | Kept collision-safe image naming, preserved Pinterest short-id fallback only when no title exists, and added runtime tests for rename rules and title-first output stems. |


### Git Commits

| Hash | Message |
|------|---------|
| `c133edf` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 109: Optimize desktop startup performance

**Date**: 2026-04-01
**Task**: Optimize desktop startup performance
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

## Startup Performance
- Dev startup no longer blocks on unconditional predev locale/downloader checks; cached preflight now skips repeat work and only refreshes when inputs change or binaries are missing.
- Electron dev bootstrap now overlaps Vite startup with the initial Electron TypeScript build instead of serializing those steps.
- Main-window reveal sequencing was corrected so `loadURL`, reveal wait, and renderer-ready wait no longer miss already-fired events and fall back to timeout-driven delays.
- Development mode now shows the main window earlier and defers tray-menu and shortcut registration until after the first visible window.
- Packaged startup was tightened by reading one startup config snapshot, reusing it for theme/language/shortcut decisions, and running tray-menu plus shortcut setup in parallel with main-window reveal.

## Validation
- Verified `npm run type-check` passes after both startup optimization phases.
- Verified `npx vitest run electron/windowRevealWait.test.mts electron/windowVisibility.test.mts` passes.
- Verified `npm run electron:build` passes after the packaged bootstrap changes.
- Measured cached dev preflight at about 0.11s after the new preflight/caching path landed.


### Git Commits

| Hash | Message |
|------|---------|
| `6a25d01` | (see git log) |
| `035f075` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 110: Startup full-first reveal and deferred compact init

**Date**: 2026-04-01
**Task**: Startup full-first reveal and deferred compact init
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

- Reworked Windows startup window flow to reveal `main` in full native bounds first and defer the first compact transition until the normal idle timer.
- Deferred non-critical startup initialization in the renderer, including runtime status/gate refresh, automatic managed runtime bootstrap, and app update checks, until the initial full-window reveal settles.
- Added an on-demand runtime refresh fallback for early Pinterest download requests so deferred startup state does not block the first foreground action.
- Updated startup-mode and startup-window-state tests to cover the new full-first startup behavior.
- Human verified the startup animation improvement before commit.


### Git Commits

| Hash | Message |
|------|---------|
| `e977806` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 111: Refine main window hover reveal and collapse

**Date**: 2026-04-01
**Task**: Refine main window hover reveal and collapse
**Branch**: `main`

### Summary

Smoothed the main window control reveal animation, fixed delayed hover collapse after task completion, and stabilized icon-to-panel hover transitions so rapid pointer exit no longer stalls collapse or flashes during expand-to-collapse handoff.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `7c5b325` | (see git log) |
| `e9d06c4` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 112: Window motion stabilization and pasted-url title recovery

**Date**: 2026-04-01
**Task**: Window motion stabilization and pasted-url title recovery
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Startup | Tightened Electron startup by showing dev builds on first stable paint, reusing a packaged startup config snapshot, and deferring the startup-only compact transition until normal idle. |
| Main window motion | Reworked hover enter/leave behavior so the main window responds immediately, preserves drag behavior, keeps a guarded 140ms leave delay, and softens control reveal/compact transitions without flicker. |
| Knowledge capture | Ran break-loop analysis for both the compact-window hover loop and the earlier startup-speed fixes, then captured the resulting contracts in Trellis backend/frontend specs. |
| Download naming | Added a yt-dlp metadata title probe for pasted YouTube/Bilibili URLs so title-less requests recover a human-readable stem before falling back to raw URL path names like `watch` or `BV...`. |

**Verification**:
- `npm run lint`
- `npm run type-check`
- `npm test`
- Targeted Vitest runs for `service`, `ytDlpDownload`, and `ytDlpMetadata`

**Human-tested outcomes**:
- Main window hover/leave timing and drag behavior were iterated interactively in the desktop app.
- Pasted URL downloads were verified functionally by the user and then fixed to recover real titles.


### Git Commits

| Hash | Message |
|------|---------|
| `6a25d01` | (see git log) |
| `035f075` | (see git log) |
| `e977806` | (see git log) |
| `7c5b325` | (see git log) |
| `e9d06c4` | (see git log) |
| `0396e53` | (see git log) |
| `b56082e` | (see git log) |
| `17a7229` | (see git log) |
| `eb99100` | (see git log) |
| `5ee000e` | (see git log) |
| `5f355ab` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 113: Stabilize compact window transition races

**Date**: 2026-04-02
**Task**: Stabilize compact window transition races
**Branch**: `main`

### Summary

Added transition-token guards for compact/full main-window bounds transitions, threaded animateBounds token echo through the Electron bridge, added regression tests, and captured the no-stale-completion contract in Trellis specs.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `71c92bd` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 114: Fix compact drag-drop hover stability

**Date**: 2026-04-02
**Task**: Fix compact drag-drop hover stability
**Branch**: `main`

### Summary

Fixed icon-mode web media drag-drop bounce by treating external drag hover as compact-window hover ownership and documented the contract.

### Main Changes

| Area | Description |
|------|-------------|
| UI fix | Kept compact-window drag-drop hover state alive across external `dragover`/`drop` so web image and video drags no longer trigger compact/full bounce loops. |
| Window transitions | Wired external drag hover into the same collapse guards used by pointer hover, preventing expand-morph handoff from collapsing on stale hover truth. |
| Spec | Updated the compact main window motion guide with the drag-hover ownership rule and a regression test checklist for icon-mode web media drags. |

**Verification**:
- `npm run lint`
- `npm run typecheck`
- `npm run test`

**Committed Files**:
- `src/App.tsx`
- `.trellis/spec/frontend/motion-guidelines.md`


### Git Commits

| Hash | Message |
|------|---------|
| `37dd89e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 115: Remove Pinterest card download button

**Date**: 2026-04-02
**Task**: Remove Pinterest card download button
**Branch**: `main`

### Summary

Removed the Pinterest waterfall card download button from the browser extension, kept the animated pin detail-page download button, and preserved card drag payload enrichment.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `443142d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 116: Prefer gallery-dl supported sites and normalize Weibo URLs

**Date**: 2026-04-02
**Task**: Prefer gallery-dl supported sites and normalize Weibo URLs
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Routing | Added a gallery-dl-supported provider so gallery-dl-supported hosts prefer `gallery-dl` before falling back to `yt-dlp`. |
| Weibo | Added a dedicated Weibo provider that canonicalizes supported links such as `?layerid=` into `https://weibo.com/detail/<status-id>` for gallery-dl extraction. |
| Safety | Kept existing dedicated providers for YouTube, Bilibili, Douyin, Xiaohongshu, Twitter/X, and Pinterest ahead of the new fallback provider. |
| Tests | Added provider tests for gallery-dl-supported routing, Weibo canonicalization, and the non-guessing `tv/show` case. |
| Verification | Ran `npm run lint`, `npm run type-check`, and `npm test` successfully before recording the session. |


### Git Commits

| Hash | Message |
|------|---------|
| `b5dabbf` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 117: Instagram in-page extension entry

**Date**: 2026-04-02
**Task**: Instagram in-page extension entry
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

Implemented Instagram browser-extension support with in-page FlowSelect download buttons for feed cards, post detail pages, and reels. Added a dedicated Instagram content script entry in the extension manifest and built DOM-aware mount logic that clones native button shells while resolving canonical post or reel permalinks from the local card or dialog context. Iterated through multiple Instagram DOM edge cases so feed and detail pages inject beside share, reels inject above like, downloads resolve the correct permalink, and duplicate or malformed cloned controls are avoided after route changes.


### Git Commits

| Hash | Message |
|------|---------|
| `611395a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 118: Weibo drag fallback stabilization

**Date**: 2026-04-02
**Task**: Weibo drag fallback stabilization
**Branch**: `main`

### Summary

Stabilized Weibo drag handling across preload path detection and protected-image fallback layers, then captured the debugging lessons in cross-layer docs.

### Main Changes

| Area | Description |
|------|-------------|
| Preload drop bridge | Stopped treating browser-originated file-like drags as local folders unless a real local path was resolved. |
| Protected image fallback | Added staged Weibo protected-image fallback across content script, page bridge, extension background, and authenticated desktop download. |
| Thumbnail drag handling | Expanded drag target detection to support non-`img` thumbnail cards and `background-image:url(...)` HTML payloads. |
| Knowledge capture | Recorded cross-layer lessons about file-like drags, CSP/CORS fallback chains, and visible URL vs readable bytes. |

**Commits**:
- `50f56c5` `fix: stabilize weibo media drag handling`
- `3990002` `docs: capture drag fallback debugging lessons`

**Validation**:
- `npm run lint`
- `npm run type-check`
- `npm test`
- `node --check browser-extension/background.js`
- `node --check browser-extension/protected-image-detector.js`
- `node --check browser-extension/protected-image-page-bridge.js`
- `npm run build:renderer`
- `npm run electron:build`

**Notes**:
- User verified Weibo image drag-download works after the fixes.
- One unrelated local modification remains unstaged after session recording: `browser-extension/weibo-button.css`.


### Git Commits

| Hash | Message |
|------|---------|
| `50f56c5` | (see git log) |
| `3990002` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 119: Extension injection debug panel and Weibo adapter

**Date**: 2026-04-02
**Task**: Extension injection debug panel and Weibo adapter
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Desktop settings | Added a dev-only `extensionInjectionDebugEnabled` toggle in Settings and kept optimistic UI state in sync with persisted config. |
| Electron + extension transport | Added WebSocket actions for `get_extension_debug_config` / `extension_debug_config_changed` so the desktop app can drive browser-extension injection debug state. |
| Extension debug tooling | Added reusable `browser-extension/injection-debug-config.js` and `browser-extension/injection-debug-panel.js` for a draggable, resizable in-page debug panel with copy/reset/live-override controls. |
| Weibo adapter | Wired Weibo button injection into the shared debug panel, added separate preview/detail icon offsets, and fixed lifecycle issues so the panel disappears when debug mode is off or the desktop app disconnects. |
| Spec sync | Updated backend/frontend Trellis specs to document the config-backed debug toggle contract and extension sync flow. |

**Manual verification**:
- Human-tested Weibo button injection and debug panel behavior.
- Confirmed preview/detail icon alignment with `Preview Icon Y = 0` and `Detail Icon Y = -5`.
- Confirmed debug panel hides when the setting is disabled or the desktop dev process exits.

**Validation**:
- `npm run lint`
- `npm run type-check`
- `npm test`
- `node --check browser-extension/weibo-detector.js`
- `node --check browser-extension/injection-debug-panel.js`
- `node --check browser-extension/background.js`
- `node --check browser-extension/injection-debug-config.js`


### Git Commits

| Hash | Message |
|------|---------|
| `82ed50d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 120: Stop tracking Trellis metadata in git

**Date**: 2026-04-02
**Task**: Stop tracking Trellis metadata in git
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Repo hygiene | Removed `.trellis` from git tracking while keeping the local Trellis workspace for private synchronization outside GitHub. |
| Git behavior clarification | Verified that `.gitignore` already covered `.trellis/`; the issue was previously tracked files, not a broken ignore rule. |
| Backup flow | Confirmed the cleanup after pushing the feature work so future backups to GitHub exclude Trellis metadata. |

**Commits covered**:
- `0fcab0b` `chore: stop tracking trellis metadata`

**Manual verification**:
- Confirmed working tree stayed clean after the cleanup commit.
- Confirmed `.trellis` will now stay local-only and be synchronized outside GitHub.


### Git Commits

| Hash | Message |
|------|---------|
| `0fcab0b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 121: Zhihu player control-bar download button

**Date**: 2026-04-03
**Task**: Zhihu player control-bar download button
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

Implemented Zhihu player control-bar button injection in the browser extension and registered it in the extension manifest.

Manual verification completed:
- The button now mounts in the Zhihu zvideo player control group, to the left of the speed control.
- Hover styling was aligned with Zhihu native controls so the icon brightens without a blue background.
- The download action reuses the existing FlowSelect video-selection bridge and current Zhihu download path.

Updated files:
- browser-extension/zhihu-detector.js
- browser-extension/zhihu-button.css
- browser-extension/manifest.json

Delivery notes:
- Commit: fc14c8b
- Pushed to origin/main for backup.


### Git Commits

| Hash | Message |
|------|---------|
| `fc14c8b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 122: mac packaging recovery and startup smoothing

**Date**: 2026-04-03
**Task**: mac packaging recovery and startup smoothing
**Branch**: `mac/fix-compact-window-parity`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Packaged launch | Moved `zod` into production dependencies so the packaged mac app can load runtime schema modules without `ERR_MODULE_NOT_FOUND`. |
| DMG install launch | Preserved app-bundle symlinks during DMG staging copy so `/Applications/FlowSelect.app` keeps valid Electron framework links after install. |
| First-launch smoothness | Deferred non-critical runtime and update bootstrap work until after the initial window settle/idle period to reduce early transition jank. |
| Validation | Rebuilt and verified the macOS ARM64 DMG at `dist-release/dmg/FlowSelect_0.2.9_macos_arm64_installer.dmg`; `npm test`, `npm run type-check`, and `npm run lint` all passed. |

**Updated Files**:
- `package.json`
- `package-lock.json`
- `scripts/package-macos-open-source-dmg.mjs`
- `src/App.tsx`
- `src/utils/startupWindowState.ts`
- `src/utils/startupWindowState.test.ts`


### Git Commits

| Hash | Message |
|------|---------|
| `dcbeb85` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 123: Custom macOS create-dmg installer workflow

**Date**: 2026-04-03
**Task**: Custom macOS create-dmg installer workflow
**Branch**: `fix/custom-macos-create-dmg`

### Summary

Replaced the plain macOS DMG flow with a create-dmg based custom installer layout, committed a 638x360 background asset, and opened PR #3.

### Main Changes

| Area | Description |
|------|-------------|
| Packaging | Replaced `hdiutil`-only DMG creation with `create-dmg` in `scripts/package-macos-open-source-dmg.mjs`. |
| Layout | Applied the agreed Finder layout, background asset, icon generation, and custom file/icon positions. |
| Assets | Added `background.png` and generated the DMG volume icon from `app-icon.png` at packaging time. |
| Release Workflow | Installed `create-dmg` in GitHub Actions so release builds can reproduce the custom DMG. |
| Validation | Ran `npm run lint`, `npm run type-check`, `npm test`, YAML/script parse checks, and a real `npm run package:macos-open-source-dmg -- --arch aarch64 --skip-build` packaging run. |

**Commits / PR**:
- Commit: `604baf8` (`build(mac): customize create-dmg installer layout`)
- PR: `https://github.com/Wutpeach/FlowSelect/pull/3`
- Branch: `fix/custom-macos-create-dmg`

**Files Shipped In The PR**:
- `.github/workflows/release.yml`
- `README.md`
- `README.en.md`
- `scripts/package-macos-open-source-dmg.mjs`
- `background.png`


### Git Commits

| Hash | Message |
|------|---------|
| `604baf8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 124: mac installer payload trimming and mainline merge

**Date**: 2026-04-04
**Task**: mac installer payload trimming and mainline merge
**Branch**: `mac/fix-compact-window-parity`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Installer payload | Removed `lucide-react`, replaced the remaining usages with project-local SVG icons, and moved renderer-only libraries out of runtime production dependencies so packaged apps only ship `ws` and `zod` in loose `node_modules`. |
| Platform packaging | Updated Electron Builder packaging rules to include only target-specific downloader binaries and exclude non-runtime dependency payload such as `.map`, `src`, docs, and tests. |
| macOS DMG flow | Kept the custom `create-dmg` layout, preserved bundle symlink safety, and adjusted the macOS DMG script to default to the current host architecture when no explicit arch is passed. |
| Validation | Re-ran `npm run type-check`, `npm run lint`, `npm test`, `npm run package:dir`, `npm run package:mac:zip`, and `npm run package:macos-open-source-dmg`. |
| Results | Measured mac artifact reductions: `FlowSelect.app` `439M -> 336M`, `Resources/app/node_modules` `70M -> 3.1M`, arm64 ZIP `225M -> 162M`, arm64 DMG `242M -> 166M`. |
| Main merge | Merged the two mac repair branches into `main` in this order: `fix/custom-macos-create-dmg` first, then `mac/fix-compact-window-parity`, after rebasing the merge plan onto the latest remote `main` to avoid replaying already-merged history. Remote `main` ended at `2d602b4`. |

**Updated Files**:
- `electron-builder.config.mjs`
- `package.json`
- `package-lock.json`
- `scripts/package-macos-open-source-dmg.mjs`
- `src/App.tsx`
- `src/pages/SettingsPage.tsx`
- `src/pages/UiLabPage.tsx`
- `src/components/icons/AppIcons.tsx`
- `src/components/Sidebar.tsx`
- `desktop-assets/binaries/.official-downloader-binaries.json`
- `desktop-assets/binaries/gallery-dl-aarch64-apple-darwin`
- `desktop-assets/binaries/yt-dlp-aarch64-apple-darwin`
- `background.png`


### Git Commits

| Hash | Message |
|------|---------|
| `b63b936` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 125: Release 0.3.0 Prep And Packaging Fixes

**Date**: 2026-04-04
**Task**: Release 0.3.0 Prep And Packaging Fixes
**Branch**: `main`

### Summary

Prepared release 0.3.0, moved release-note authoring to Chinese, fixed GitHub packaging workflow regressions, and added an Intel macOS gallery-dl fallback so the rebuilt v0.3.0 release completed successfully.

### Main Changes

| Area | Description |
|------|-------------|
| Versioning | Bumped FlowSelect to `0.3.0` with managed version files and a versioned release note. |
| Release notes | Switched the repository release-note convention and template to Chinese, then rewrote `release-notes/v0.3.0.md` in Chinese. |
| Release workflow | Fixed the GitHub release workflow so Windows no longer tries to install `create-dmg`, and macOS uses the correct downloader ensure script entrypoint. |
| macOS Intel packaging | Traced the failing Intel macOS package job to upstream `gallery-dl_macos` being arm64-only, then added an automatic `gallery-dl` fallback build path for `x86_64-apple-darwin` when the official binary cannot pass smoke validation. |
| Validation | Verified `npm run lint`, `npm run type-check`, and `npm test` all pass locally, then rebuilt and re-pushed tag `v0.3.0` until the GitHub `release.yml` workflow completed successfully. |

**Commits**:
- `6303ce1` `chore: bump version to 0.3.0`
- `19343d1` `docs(release): switch release notes to Chinese`
- `5e8755f` `fix(release): correct packaging workflow steps`
- `7b4adcd` `fix(download): add intel mac gallery-dl fallback`


### Git Commits

| Hash | Message |
|------|---------|
| `6303ce1` | (see git log) |
| `19343d1` | (see git log) |
| `5e8755f` | (see git log) |
| `7b4adcd` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 126: Restore Electron Video Transcode Follow-Up

**Date**: 2026-04-04
**Task**: Restore Electron Video Transcode Follow-Up
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

Investigated a regression where highest-quality YouTube downloads completed as MKV and never entered the intended post-download transcode flow after the Tauri runtime removal.

Implemented Electron-side parity for the download-follow-up contract:
- restored source-file probe and AE-safe compatibility evaluation after `video-download-complete`
- added an Electron transcode queue/executor with progress, completion, failure, retry, remove, and cancel handling
- wired `cancel_transcode`, `retry_transcode`, and `remove_transcode` through the Electron command path
- confirmed Bilibili shares the same yt-dlp follow-up path and added regression coverage for both YouTube and Bilibili highest-quality downloads

Verification:
- `npm run lint`
- `npm run type-check`
- `npm test`


### Git Commits

| Hash | Message |
|------|---------|
| `8661e67` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 127: Fix Bilibili highest-quality transcode fallback

**Date**: 2026-04-04
**Task**: Fix Bilibili highest-quality transcode fallback
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

Prevented highest-quality Bilibili preview downloads from entering unnecessary transcode follow-up when yt-dlp can already produce a compatible MP4 output.

Validated the fix with targeted runtime regressions plus full lint, type-check, and test runs before commit.


### Git Commits

| Hash | Message |
|------|---------|
| `d5ef0fb` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 128: Fix completion icon-mode race and stage 0.3.0-rc1

**Date**: 2026-04-04
**Task**: Fix completion icon-mode race and stage 0.3.0-rc1
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| UI fix | Fixed the compact main-window race so download/transcode completion confirmation stays in the full panel instead of occasionally appearing in icon mode. |
| Regression coverage | Extended `src/utils/mainWindowMode.ts` collapse guard behavior and added regression coverage in `src/utils/mainWindowMode.test.ts`. |
| Release notes | Refreshed `release-notes/v0.3.0.md` to include the late 0.3.0 fixes, then added `release-notes/v0.3.0-rc1.md` for a prerelease packaging validation tag. |
| Release orchestration | Confirmed the protected `v0.3.0` tag could not be rewritten while it still existed remotely, then switched to prerelease validation and pushed `v0.3.0-rc1` to trigger the Release workflow safely. |

**Key commits**:
- `93e931c` `fix(ui): keep completion confirmation out of icon mode`
- `943e02a` `docs(release): refresh 0.3.0 notes`
- `27ff1a3` `docs(release): add 0.3.0-rc1 notes`

**Validation**:
- `npm run lint`
- `npm run type-check`
- `npm test`
- Confirmed `Release` GitHub Actions workflow started for `v0.3.0-rc1`.


### Git Commits

| Hash | Message |
|------|---------|
| `93e931c` | (see git log) |
| `943e02a` | (see git log) |
| `27ff1a3` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 129: Fix prerelease extension packaging, mac tray mode, and rc3 release prep

**Date**: 2026-04-04
**Task**: Fix prerelease extension packaging, mac tray mode, and rc3 release prep
**Branch**: `main`

### Summary

Fixed prerelease extension manifest versioning, hid the mac Dock icon for tray-first startup, diagnosed the Intel mac gallery-dl rate-limit failure, switched releases to macOS arm64 only, and pushed v0.3.0-rc3.

### Main Changes

| Area | Description |
|------|-------------|
| Browser extension release flow | Normalized prerelease extension versions so packaged Chromium manifests keep numeric ersion values and store the full semver in ersion_name, fixing Chrome/Edge load failures for 
c builds. |
| macOS app shell | Switched Electron mac startup into tray/menu-bar accessory mode so FlowSelect no longer shows a Dock icon during normal use. |
| Release workflow | Reduced GitHub Release packaging to macOS arm64 only, removing Intel mac release artifacts and the failing Intel gallery-dl bootstrap path. |
| Release prep | Prepared 0.3.0-rc2, diagnosed the Intel mac gallery-dl rate-limit failure, then cut a clean 0.3.0-rc3 prerelease with updated Chinese release notes. |

**Updated Commits**:
- 4b30d79 fix(extension): normalize prerelease manifest version
- 4e2200 fix(mac): hide dock icon for tray app
- 7f611aa chore(release): prepare v0.3.0-rc2
- 080e82 fix(release): publish macos arm64 only
- 13ca03 chore(release): prepare v0.3.0-rc3


### Git Commits

| Hash | Message |
|------|---------|
| `4b30d79` | (see git log) |
| `f4e2200` | (see git log) |
| `7f611aa` | (see git log) |
| `b080e82` | (see git log) |
| `b13ca03` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 130: Fix main window drag after drop/download

**Date**: 2026-04-06
**Task**: Fix main window drag after drop/download
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Main panel drag/drop | Prevented internal native DOM drags from stealing frameless window dragging after browser/system drops. |
| Overlay interaction | Made download progress and completion overlays non-draggable by default while preserving the cancel button interaction path. |
| Drop-session cleanup | Added window-level drop/dragend/blur cleanup so stale drop-hover state clears even when the browser drag session ends outside the expected React path. |
| Verification | Ran `npm run lint`, `npm run type-check`, and `npm test`; all passed before commit `c274f9f`. |

**Updated Files**:
- `src/App.tsx`
- `src/utils/mainPanelInteractions.ts`
- `src/utils/mainPanelInteractions.test.ts`


### Git Commits

| Hash | Message |
|------|---------|
| `c274f9f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 131: Settings support log export and runtime log coverage

**Date**: 2026-04-07
**Task**: Settings support log export and runtime log coverage
**Branch**: `main`

### Summary

Changed Settings version export to double-click, removed success toast copy, added exported runtime log coverage from Electron main/renderer/yt-dlp output, and fixed the deprecated Electron console-message listener signature.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `14b23ed` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 132: Fix desktop shortcut summon positioning

**Date**: 2026-04-07
**Task**: Fix desktop shortcut summon positioning
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Shortcut summon | Restored Electron global shortcut behavior so the main window reappears near the current cursor, aligned to the cursor's lower-left area. |
| Compact follow-up | Synced renderer window-position cache after `shortcut-show` so idle compact mode stays at the new shortcut position instead of jumping back to stale coordinates. |
| Verification | Ran `npm test`, `npm run type-check`, and `npm run lint`; added/updated shortcut placement coverage in Electron window visibility tests. |

**Commits**:
- `12d2227` `fix(desktop): restore shortcut summon positioning`
- `1f6358d` `fix(desktop): keep compact mode at shortcut position`

**Notes**:
- Updated local `.trellis/spec/` guidance for shortcut-triggered native reposition and renderer cache sync, but `.trellis/` is gitignored in this repo so those spec edits remain local session knowledge.


### Git Commits

| Hash | Message |
|------|---------|
| `12d2227` | (see git log) |
| `1f6358d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 133: Resolve dependency security alerts on main

**Date**: 2026-04-07
**Task**: Resolve dependency security alerts on main
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

## Summary
- Refreshed the root npm lockfile to pull patched versions for the default branch dependency alerts.
- Cleared the 9 open GitHub Dependabot alerts on `main` after pushing the dependency update.

## Verification
- `npm audit`: 0 vulnerabilities
- `npm run type-check`: passed
- `npm run lint`: passed
- `npm test`: 44 files, 266 tests passed

## Scope
- Updated file: `package-lock.json`
- Pushed application commit: `172a32e chore(deps): refresh lockfile for security fixes`
EOF


### Git Commits

| Hash | Message |
|------|---------|
| `172a32e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 134: Prepare RC6 tag test build

**Date**: 2026-04-07
**Task**: Prepare RC6 tag test build
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| 项目 | 内容 |
|------|------|
| 版本准备 | 使用 `npm run version:set -- 0.3.0-rc6` 将应用版本从 `0.3.0-rc5` 升级到 `0.3.0-rc6`，同步更新 `package.json`、`package-lock.json`、`browser-extension/manifest.json` 与 `src/constants/appVersion.ts`。 |
| 发布说明 | 新增 `release-notes/v0.3.0-rc6.md`，按既有 RC 风格撰写中文说明，并补上 `v0.3.0-rc5...v0.3.0-rc6` 的 Full Changelog 链接。 |
| 校验与发布 | 运行 `npm run type-check` 与 `npm run lint` 均通过；创建提交 `020a9c1 chore(release): prepare v0.3.0-rc6`，随后推送 `main` 与 tag `v0.3.0-rc6` 到 `origin`。 |
| 任务收尾 | 归档 Trellis 任务 `04-07-push-rc6-tag-test-build`。 |


### Git Commits

| Hash | Message |
|------|---------|
| `020a9c1` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 135: Add prerelease updater opt-in

**Date**: 2026-04-07
**Task**: Add prerelease updater opt-in
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Settings | Added a persisted `receivePrereleaseUpdates` toggle in Settings so users can opt into beta / rc desktop app updates. |
| Main window | Refreshes app update availability after the settings toggle changes via `app-update-preference-changed`. |
| Electron updater | Stable users continue reading the public stable `latest.json`; prerelease opt-in users now query the latest non-draft prerelease release and use its `latest.json` asset. |
| Versioning | Replaced loose numeric comparison with semver-aware prerelease comparison so stable builds are not treated as older than same-base RC builds. |
| Specs and tests | Updated `.trellis/spec/` contracts for updater channel selection and added unit tests for config parsing, manifest selection, and prerelease version ordering. |

**Verification**:
- `npm run lint`
- `npm run type-check`
- `npm test`

**Task status**:
- Recorded against `03-06-app-self-update` but not archived because real packaged-app updater smoke validation is still pending.


### Git Commits

| Hash | Message |
|------|---------|
| `830475a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 136: Reorganize settings window into tabbed IA

**Date**: 2026-04-07
**Task**: Reorganize settings window into tabbed IA
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Settings IA | Reorganized the desktop settings window into `General`, `Plugins`, and `Advanced` tabs instead of a single long scroll page. |
| General Tab | Ordered the high-frequency controls as Theme, Language, Output Folder, Shortcut, and Launch At Startup. |
| Advanced Tab | Replaced the old footer version display with a top app-version card that surfaces current version and real update check/install actions. |
| Support | Replaced the hidden version-double-click support-log export affordance with an explicit support action in `Advanced`. |
| Downloader Tools | Kept the downloader maintenance area as a `DownloaderDeck` and preserved the three-card sequence: `yt-dlp`, `runtime`, `gallery-dl`. |
| Layout Polish | Converted the category switcher into a connected toolbar-style segmented control and moved dev-only UI Lab controls below the downloader deck. |
| Verification | Ran `npm run type-check`, `npm run lint`, and `npm test` successfully before recording the session. |

**Updated Files**:
- `src/pages/SettingsPage.tsx`
- `locales/en/desktop.json`
- `locales/zh-CN/desktop.json`
- `.trellis/tasks/archive/2026-04/04-07-settings-button-architecture/`


### Git Commits

| Hash | Message |
|------|---------|
| `2261ee9` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 137: Settings page layout redesign and hierarchy refinement

**Date**: 2026-04-07
**Task**: Settings page layout redesign and hierarchy refinement
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

## Settings Page Layout Refinement

| Area | Description |
|------|-------------|
| Navigation hierarchy | Reworked the settings window into clearer header tabs and promoted download behavior into its own top-level tab. |
| Information architecture | Moved rename controls into `Downloads`, kept `Plugins` as a future-facing category, and simplified `General` / `Advanced` hierarchy. |
| Plugin surface | Turned the Plugins page into a lightweight integration list skeleton with AE Portal plus a future-slot entry. |
| Control treatment | Upgraded isolated toggles such as launch-at-startup and rename into full-width setting rows with title, helper copy, and right-side switch. |
| Localization | Updated desktop locale source files and synced generated browser-extension locale resources. |

**Verification**:
- `npm run locales:sync`
- `npm run lint`
- `npm run type-check`
- `npm test`

**Commits**:
- `7ff517d` feat(settings): redesign settings navigation layout
- `eb72aa0` feat(settings): refine settings page hierarchy


### Git Commits

| Hash | Message |
|------|---------|
| `7ff517d` | (see git log) |
| `eb72aa0` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 138: README information architecture and docs split

**Date**: 2026-04-07
**Task**: README information architecture and docs split
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

## Summary

Restructured the repository README into a lighter entry page and moved user-facing operational guidance into lightweight docs pages.

| Area | Description |
|------|-------------|
| README | Reduced Chinese and English README pages to product positioning, downloads, docs entry points, minimal development commands, and acknowledgements |
| User Docs | Added Chinese and English `getting-started`, `browser-extension`, and `faq` pages under `docs/` |
| Acknowledgements | Added a concise open-source acknowledgement section for `yt-dlp`, `gallery-dl`, and `FFmpeg` |

**Commit**: `e092b4c` `docs(readme): split user docs from repo entry`

**Notes**:
- `npm run lint` passed
- `npm run type-check` passed
- `npm run test` passed
- The previously discussed real product screenshot was intentionally left for a follow-up because no final screenshot asset was added in this session


### Git Commits

| Hash | Message |
|------|---------|
| `e092b4c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 139: Stabilize Xiaohongshu drag image and detail video flows

**Date**: 2026-04-08
**Task**: Stabilize Xiaohongshu drag image and detail video flows
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Xiaohongshu homepage drag | Added extension-side drag payload + token resolution flow so homepage card drags preserve exact image selection and avoid cross-note video contamination. |
| Xiaohongshu detail video | Stabilized detail-page cat-button video download through direct mp4 resolution, Electron-side no-referrer direct fetch, and skipped downstream transcode/removal for Xiaohongshu direct assets. |
| Runtime / provider routing | Tightened Xiaohongshu provider/direct behavior, added page-hint utilities, and prevented fallback to yt-dlp when a verified direct asset already exists. |
| Verification | Passed `npm run lint`, `npm run type-check`, and full `npm test` before commit. |

**Result**:
- Homepage drag now reliably downloads Xiaohongshu images / covers.
- Xiaohongshu detail-page cat button downloads the intended video and keeps the downloaded file.
- Homepage drag-to-video was intentionally left unsupported for now because homepage context is not stable enough to produce reliable direct video resolution.

**Commits**:
- `b8552b1` `fix(xiaohongshu): stabilize drag image and detail video flows`


### Git Commits

| Hash | Message |
|------|---------|
| `b8552b1` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 140: gallery-dl metadata naming cleanup

**Date**: 2026-04-08
**Task**: gallery-dl metadata naming cleanup
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

## Summary
- Fixed `gallery-dl` post-download naming so Instagram metadata can produce short, distinguishable filenames such as `username - shortcode` instead of generic `Instagram` names.
- Removed the latency regression from blocking pre-download `gallery-dl` metadata probing and kept metadata-based rename in the post-download path.
- Added cleanup for transient `gallery-dl` metadata sidecars (`info.json`, `<stem>.info.json`, related JSON variants) after successful rename so users only keep the final media file.

## Verification
- `npm run lint`
- `npm run type-check`
- `npm test`

## Notes
- Did not archive `04-08-youtube-injected-wrong-route-url` because related extension-routing files are still uncommitted in the working tree.


### Git Commits

| Hash | Message |
|------|---------|
| `b2c6a3f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
