# Journal - Mabel-MAC (Part 2)

> Continuation from `journal-1.md` (archived at ~2000 lines)
> Started: 2026-04-02

---



## Session 55: macOS parity fixes and PR

**Date**: 2026-04-02
**Task**: macOS parity fixes and PR
**Branch**: `mac/fix-compact-window-parity`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| macOS tray | Fixed oversized menu bar tray icon rendering via mac-specific tray image sizing. |
| Compact mode | Aligned macOS compact/icon mode to the intended 80x80 outer shell with 60x60 inner circle and removed edge artifacts. |
| Window placement | Moved Settings/UI Lab cascade placement into Electron main-process ownership so Settings opens to the right of main and UI Lab opens to the right of Settings. |
| PR workflow | Added a repository PR template with impact-scope and validation sections. |
| Test portability | Normalized Electron runtime path assertions so the full test suite passes on macOS while preserving Windows-style path expectations. |

**Validation**:
- `npm test`
- `npm run type-check`
- `npm run lint`
- Manual macOS verification for tray icon, compact mode sizing, Settings placement, and UI Lab placement

**PR**:
- Draft PR opened: `https://github.com/Wutpeach/FlowSelect/pull/1`

**Outstanding**:
- Managed runtime first-launch bootstrap on macOS still needs a follow-up investigation; task remains active and is not archived.


### Git Commits

| Hash | Message |
|------|---------|
| `dd25376` | (see git log) |
| `f9f6286` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 56: macOS parity and startup bootstrap follow-up

**Date**: 2026-04-02
**Task**: macOS parity and startup bootstrap follow-up
**Branch**: `mac/fix-compact-window-parity`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Tray + compact parity | Fixed macOS tray sizing, compact/icon-mode rendering, and secondary-window placement parity on the Electron path. |
| Runtime bootstrap | Fixed startup managed-runtime bootstrap timing so gate/status refreshes no longer cancel the delayed first-launch trigger and leave the UI stuck in the missing-runtime idle state. |
| Tests | Normalized cross-platform runtime path assertions and added startup runtime gate regression coverage. |
| PR | Updated draft PR #1 to reflect the runtime bootstrap fix. |

**Verification**:
- `npm run lint`
- `npm run type-check`
- `npm run test`

**Notes**:
- Archived task `04-02-macos-parity-bugs` after the code landed in commits and the existing draft PR was updated.
- Left local downloader binary artifact changes outside the task commit/PR.


### Git Commits

| Hash | Message |
|------|---------|
| `dd25376` | (see git log) |
| `f9f6286` | (see git log) |
| `98ae5a8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 57: Fix mac compact icon transition handoff

**Date**: 2026-04-03
**Task**: Fix mac compact icon transition handoff
**Branch**: `mac/fix-compact-window-parity`

### Summary

Stabilized the macOS main-window to icon transition by delaying the standalone minimized plate until the native compact shell is active, removing collapse-end flicker and cat-icon drift. Verified with lint, type-check, and the full test suite, then pushed the fix to the existing PR #1.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `c849cae` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 58: Fix mac packaged startup, panel interactions, and rc5 release prep

**Date**: 2026-04-04
**Task**: Fix mac packaged startup, panel interactions, and rc5 release prep
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Packaged startup | Fixed the macOS packaged Electron app so `macAppVisibility` is emitted and available at runtime, removing the post-install startup `ERR_MODULE_NOT_FOUND` failure on another Mac. |
| Main panel interactions | Restored idle-panel double-click folder open on macOS, kept the right-click `Open Folder` path aligned with the same backend fallback, and corrected context-menu anchor positioning so the menu opens near the click instead of off-window. |
| Injected video downloads | Fixed Electron-side temporary cookie-file creation to use the OS temp directory, which avoids packaged macOS read-only cwd failures for injected YouTube/Bilibili downloads while keeping pasted-link downloads unchanged. |
| Startup feedback | Emitted earlier visible progress for yt-dlp-backed downloads so the main window no longer sits on a long opaque `Preparing...` state before activity becomes visible. |
| Release prep | Bumped the app to `0.3.0-rc5`, added Chinese release notes, pushed `main`, and created/pushed tag `v0.3.0-rc5` to trigger GitHub Actions packaging. |

**Validation**:
- Human-tested on macOS: packaged startup, main-window double-click folder open, context-menu open-folder behavior and menu positioning, injected YouTube/Bilibili downloads, and the updated download startup feedback all behaved normally.
- `npm run lint`
- `npm run type-check`
- `npm test` (`44` files, `259` tests)

**Notes**:
- Archived completed tasks `04-04-fix-mac-missing-mac-app-visibility` and `04-04-fix-mac-panel-interactions-and-slow-video-prepare`.
- Left older March mac planning tasks active because their original scope was broader than the fixes completed in this session.


### Git Commits

| Hash | Message |
|------|---------|
| `b2e32e6` | (see git log) |
| `30c91d5` | (see git log) |
| `eadab3a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 59: Investigated Chrome YouTube injected download diagnostics

**Date**: 2026-04-07
**Task**: Investigated Chrome YouTube injected download diagnostics
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Investigation scope | Traced injected YouTube download flow across content script, extension background, Electron websocket entry, and yt-dlp invocation. |
| Code changes | Added debug-gated diagnostics for injected download payloads and yt-dlp argument summaries, plus a targeted runtime test for current-item YouTube downloads. |
| Validation | Confirmed `npm run type-check` and `npm test -- src/electron-runtime/ytDlpDownload.test.ts` passed before commit. |
| Outcome | On the same macOS machine, Chrome and Edge both successfully downloaded and transcoded the same YouTube URL; no stable browser-specific failure remained reproducible. |
| Task status | Paused further debugging for `04-04-chrome-youtube-injected-download-failure` pending a future failing sample with captured background/runtime diagnostics. |

**Key evidence**:
- Background service worker showed normalized injected payloads with canonical YouTube watch URLs, `selectionScope=current_item`, `siteHint=youtube`, and `ytdlpQualityPreference=best`.
- Runtime diagnostics showed the successful yt-dlp invocation carried `--no-playlist`, `Referer`, cookies, YouTube extractor args, and the expected bundled/runtime binary paths.
- Support-log export was confirmed to contain environment/settings/runtime snapshots only; realtime injected-download diagnostics must be read from terminal or system logs instead.

**Committed files**:
- `browser-extension/background.js`
- `browser-extension/youtube-detector.js`
- `electron/main.mts`
- `src/electron-runtime/ytDlpDownload.ts`
- `src/electron-runtime/ytDlpDownload.test.ts`


### Git Commits

| Hash | Message |
|------|---------|
| `32c97d8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 60: macOS shadow and expand morph polish

**Date**: 2026-04-10
**Task**: macOS shadow and expand morph polish
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Change |
|------|--------|
| Window shadow ownership | Disabled macOS native window shadow for transparent windows and unified renderer-owned shadow rendering across main window, settings, context menu, and UI Lab. |
| Shadow geometry | Replaced filter-based shadow handling with shared box-shadow backdrops, added macOS shadow gutters, and tuned panel shadow tokens to remove corner ghosting and clipping artifacts. |
| Compact/full transition | Repaired compact-to-full expand morph geometry by promoting the surrogate chrome to the outer viewport layer and adding a matching surrogate backdrop during the transition. |
| Verification | Passed `npm run lint`, `npm run type-check`, and `npm test` (62 files / 378 tests). |

**Updated Files**:
- `electron/main.mts`
- `src/App.tsx`
- `src/components/ui/shared-styles.ts`
- `src/constants/windowMetrics.ts`
- `src/contexts/ThemeContext.tsx`
- `src/pages/ContextMenuPage.tsx`
- `src/pages/SettingsPage.tsx`
- `src/pages/UiLabPage.tsx`

**Outcome**:
- macOS transparent frameless windows now use unified CSS shadows without native-shadow conflicts.
- Main window, settings window, and compact icon mode now share consistent shadow ownership and improved clipping behavior.
- Compact-to-full morph no longer uses an incorrectly nested surrogate geometry layer.


### Git Commits

| Hash | Message |
|------|---------|
| `7e87a61` | (see git log) |
| `ab9a1c8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 61: Compact passthrough blur flash fix

**Date**: 2026-04-13
**Task**: Compact passthrough blur flash fix
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| Area | Result |
|------|--------|
| Compact/full transition | Completed the compact-window click-through refactor and stabilized the single-window compact/full morph flow |
| Flash root cause | Isolated the remaining collapse flash to the native compact passthrough settle, not the renderer shell animation |
| Final fix | Removed `win.blur()` from Electron compact passthrough while keeping `setIgnoreMouseEvents(true, { forward: true })` and `setFocusable(false)` |
| Knowledge capture | Recorded the compact passthrough native-settle contract and the debugging pattern for transparent-window flashes in spec templates |

**What changed**:
- Archived task `04-12-compact-window-click-through-refactor` after human validation.
- Confirmed multiple renderer-side experiments were not the true fix path.
- Narrowed the post-animation native settle by re-enabling `ignoreMouseEvents`, `setFocusable(false)`, and `blur()` one by one.
- Verified `blur()` was the only native call that reintroduced the flash.
- Kept the renderer animation structure intact and fixed the issue in `electron/main.mts`.

**Final outcome**:
- Main window -> compact transition no longer flashes.
- Compact passthrough remains enabled.
- Root cause and future debugging guidance were synced into spec template docs so later sessions can isolate native settle before retuning renderer motion.


### Git Commits

| Hash | Message |
|------|---------|
| `7e87a61` | (see git log) |
| `ab9a1c8` | (see git log) |
| `df99427` | (see git log) |
| `8416b2c` | (see git log) |
| `01c73a0` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 62: Download capability registry phases 6-10

**Date**: 2026-04-14
**Task**: Download capability registry phases 6-10
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

### Summary
Recorded the completed Phase 6-10 work for the ongoing `download-capability-registry-foundation` task. This session captures the shift from foundation work into real provider adoption, automated probe snapshots, and local telemetry reporting while keeping the task open for the next roadmap phases.

### Main Changes

| Area | Description |
|------|-------------|
| Registry-driven adoption | Migrated `generic`, `youtube`, `weibo`, `pinterest`, `douyin`, and `xiaohongshu` provider engine ordering to capability-registry strategy data while preserving provider-owned normalization and candidate filtering. |
| Interaction capability wiring | Added runtime interaction-capability hints so detector/runtime planning can use explicit site metadata instead of ad hoc notes. |
| Probe automation | Added batch probe runners, probe target snapshots, and CI automation that writes probe output into `src/assets/capabilities-probe.json` without mutating the runtime registry seed. |
| Telemetry pipeline | Added structured JSONL outcome telemetry with a documented Zod-backed schema, plus a local report generator for success rates, auth-heavy sites, and risky engine/site combinations. |
| Planning state | Updated the task PRD to mark Phase 1-10 complete and define the next roadmap phases: expanded probe coverage, probe write-back review flow, and richer reporting/progress visibility. |

### Validation
- `npm run type-check`
- `npx tsc -p tsconfig.scripts.json --noEmit`
- targeted Vitest coverage for orchestrator, registry, provider alignment, probe, and telemetry flows
- `npm run capabilities:probe`
- `npm run telemetry:report -- --input <sample-jsonl> --outputDir <temp-dir>`

### Status
[~] **In Progress**

### Next Steps
- Expand curated probe target coverage for more high-value and high-risk sites.
- Generate probe write-back review artifacts with an explicit manual confirmation checkpoint.
- Extend local reporting with HTML output plus provider migration and probe-status summaries.


### Git Commits

| Hash | Message |
|------|---------|
| `622dcfa` | (see git log) |
| `188706c` | (see git log) |
| `70f155a` | (see git log) |
| `2efe158` | (see git log) |
| `823753d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 63: Download capability registry phases 11-13

**Date**: 2026-04-14
**Task**: Download capability registry phases 11-13
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

### Summary
Completed the remaining Phase 11-13 roadmap for `download-capability-registry-foundation`, then ran full acceptance checks and fixed the static issues uncovered by `type-check`.

### Main Changes
| Area | Description |
|------|-------------|
| Expanded probe coverage | Increased curated probe target coverage to 9 maintained targets across migrated high-value providers plus generic direct coverage, and added `critical` / `auth_sensitive` / `coverage` target tiers. |
| Probe review flow | Added a review-artifact generator that derives machine-readable capability update candidates from probe snapshots without mutating the runtime registry. |
| Reporting visibility | Extended local telemetry reporting to emit JSON, Markdown, and HTML outputs with provider migration progress and probe-status summaries. |
| Acceptance hardening | Fixed final `type-check` blockers found during acceptance: removed unused imports/types and replaced `replaceAll` with ES2020-compatible escaping. |

### Validation
- `npm run capabilities:probe`
- `npm run capabilities:probe:review`
- `npm run telemetry:report -- --outputDir /tmp/flowselect-capability-acceptance.jI4QHu/report`
- `npm run lint`
- `npm run type-check`
- `npm test`
- Manual testing passed by the human after the automated acceptance run

### Acceptance Notes
- Probe acceptance snapshot written to `/tmp/flowselect-capability-acceptance.jI4QHu/probe.json`
- Review artifact written to `/tmp/flowselect-capability-acceptance.jI4QHu/review.json`
- HTML report written to `/tmp/flowselect-capability-acceptance.jI4QHu/report/report.html`
- Task `04-13-download-capability-registry-foundation` was archived after all acceptance criteria were met

### Status
[OK] Completed


### Git Commits

| Hash | Message |
|------|---------|
| `c17f717` | (see git log) |
| `b443a0c` | (see git log) |
| `61aaacd` | (see git log) |
| `b9701ee` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 64: Close macOS managed yt-dlp runtime repair

**Date**: 2026-05-08
**Task**: Close macOS managed yt-dlp runtime repair
**Branch**: `main`

### Summary

Recorded the managed yt-dlp bootstrap/version fix, faster YouTube startup result, and Trellis 0.5.7 cleanup.

### Main Changes

## Summary

Completed the macOS managed `yt-dlp` runtime repair and YouTube startup latency follow-up.

- Fixed managed `yt-dlp` bootstrap so macOS first launch now treats missing managed runtime as actually missing, which allows automatic runtime bootstrap to start instead of being masked by the bundled fallback.
- Changed managed Python selection to prefer a local `python3` that satisfies the upstream stable `yt-dlp` minimum requirement, which allowed this machine to install the latest stable release instead of silently pinning to the last Python 3.9-compatible version.
- Preserved bundled fallback execution semantics while exposing managed-missing status correctly, so bootstrap UX and actual download execution no longer fight each other.
- Extended `check_ytdlp_version` / Settings UI state so the app can distinguish managed install, bundled fallback visibility, and Python-limited managed installs.
- Improved YouTube startup behavior enough for manual testing to confirm materially faster entry into real download and successful upgrade to the latest managed `yt-dlp` version.
- Synced browser-extension locale outputs for the new downloader/runtime copy.
- Upgraded the local Trellis runtime/templates from `0.5.6` to `0.5.7`, corrected stale local version references, and removed the retired local `.trellis/scripts/multi_agent/` residue.

## Verification

- `pnpm type-check` passed.
- `pnpm test` passed (`76` files / `445` tests).
- `pnpm lint` completed with 3 pre-existing warnings and no errors.
- Manual verification confirmed faster YouTube download startup and successful installation of the latest managed `yt-dlp` release on macOS.

## Commits

- `fadccd3` `fix(runtime): speed up managed yt-dlp bootstrap and youtube startup`
- `980d9bd` `chore(locales): sync browser extension desktop locales`


### Git Commits

| Hash | Message |
|------|---------|
| `fadccd3` | (see git log) |
| `980d9bd` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 65: Manage downloaders through runtime gate

**Date**: 2026-05-16
**Task**: Manage downloaders through runtime gate
**Branch**: `main`

### Summary

Removed Settings downloader update surface, moved yt-dlp/gallery-dl to release-pinned managed runtime bootstrap, removed packaged downloader binaries from release flow, updated docs/specs, and verified lint/typecheck/tests.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `8bd8536` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 66: Download architecture refactor runtime slices

**Date**: 2026-05-16
**Task**: Download architecture refactor runtime slices
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `965f9d6` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
