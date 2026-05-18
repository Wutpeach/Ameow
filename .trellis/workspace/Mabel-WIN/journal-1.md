# Journal - codex-agent (Part 1)

> AI development session journal
> Started: 2026-02-28

---



## Session 1: Windows dev-all launcher and workspace identity normalization

**Date**: 2026-02-28
**Task**: Windows dev-all launcher and workspace identity normalization

### Summary

Added Windows dev-all entry with startup port cleanup, fixed macOS-only import warnings in Rust, and normalized Trellis workspace identities to Mabel-MAC/Mabel-WIN.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `21ce89d` | (see git log) |
| `f48f35d` | (see git log) |
| `3009894` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 2: Fix Windows devtools behavior and archive completed task

**Date**: 2026-02-28
**Task**: Fix Windows devtools behavior and archive completed task

### Summary

Fixed Windows devtools interaction (open-only on 5 taps, no startup auto-open), completed finish-work checks, and archived task 02-28-fix-win-main-window-glow-shortcut-devtools.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `11c2527` | (see git log) |
| `b4c33f4` | (see git log) |
| `6d5a797` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 3: Stabilize release CI and agentation interaction

**Date**: 2026-02-28
**Task**: Stabilize release CI and agentation interaction

### Summary

Fixed agentation interactive-control annotation behavior, added Windows portable release artifact, and hardened macOS release workflow by updating runners, switching tool downloads to direct release URLs with retries, and making unzip non-interactive.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `75d957c` | (see git log) |
| `4153c9d` | (see git log) |
| `04a68b5` | (see git log) |
| `384c739` | (see git log) |
| `7daa1d0` | (see git log) |
| `79a5a89` | (see git log) |
| `c341d8f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 4: Fix close-hide and portable download diagnostics

**Date**: 2026-02-28
**Task**: Fix close-hide and portable download diagnostics

### Summary

Fixed close button hide behavior, improved portable yt-dlp path fallback, surfaced download errors, and verified portable build outputs.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `813cff6` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 5: Fix video output path and settings dropdown UX

**Date**: 2026-02-28
**Task**: Fix video output path and settings dropdown UX

### Summary

Fixed Windows video save path to avoid legacy Videos subfolder and improved Rename Preset dropdown contrast/border/hover behavior in Settings.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `f57cbd2` | (see git log) |
| `4fa12e0` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 6: Portable fixes, yt-dlp UX, and mixed-monitor shortcut task setup

**Date**: 2026-03-05
**Task**: Portable fixes, yt-dlp UX, and mixed-monitor shortcut task setup

### Summary

Fixed portable output-path sync and rename counter reset, improved yt-dlp loading/update UX with settings dual-entry sync, added portable packaging fallback tooling, and created/initialized Windows mixed-monitor shortcut-position task PRD.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `f7ea8fd` | (see git log) |
| `fee303b` | (see git log) |
| `14db738` | (see git log) |
| `6813f54` | (see git log) |
| `c7b7dfe` | (see git log) |
| `6ff2099` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 7: Fix Windows mixed-monitor shortcut reveal position jump

**Date**: 2026-03-05
**Task**: Fix Windows mixed-monitor shortcut reveal position jump

### Summary

Unified window position to physical coordinates, removed frontend shortcut re-position override, added cross-platform contract spec, validated lint/type-check/test/cargo-check, and built local portable package.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `db516b7` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 8: AE-compatible yt-dlp download preference and portable packaging

**Date**: 2026-03-05
**Task**: AE-compatible yt-dlp download preference and portable packaging

### Summary

Adjusted yt-dlp format selection toward AE-friendly codecs, validated checks, and produced a portable package; no new feature commit created in this record step.

### Main Changes

- Diagnosed AE import failure with user and confirmed likely codec/container compatibility issue from downloaded media.
- Verified downloader args in `src-tauri/src/lib.rs` and updated format preference to prioritize `H.264 (avc1) + AAC (mp4a)` fallback chain for better AE compatibility.
- Ran Rust build check (`cargo check`) after patch.
- Built Windows portable artifact and verified output path/size.
- Confirmed finish-work checks (`lint`, `type-check`, `test`) all passed in current environment via npm scripts.
- Agreed default future portable naming convention to include `MMDDHHmm` timestamp suffix.


### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 9: Release 0.1.8 and portable yt-dlp packaging improvements

**Date**: 2026-03-05
**Task**: Release 0.1.8 and portable yt-dlp packaging improvements

### Summary

Bumped app version to 0.1.8 and released tag v0.1.8; removed yt-dlp label under progress ring; updated portable packaging script to auto-refresh yt-dlp before build, keep single binaries copy, and avoid lock failures with staging packaging.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `42b1ecb` | (see git log) |
| `14f30d6` | (see git log) |
| `541b801` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 10: Slice download stabilization and phased master planning

**Date**: 2026-03-05
**Task**: Slice download stabilization and phased master planning

### Summary

Improved slice download watchdog/progress handling and cleanup in backend/frontend; created master phased task plan (P0-P3) plus related task PRDs for watchdog, mode strategy, and cache reuse direction.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `d21392c` | (see git log) |
| `a168f41` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 11: 03-05 slice download timeout master P1-P3

**Date**: 2026-03-05
**Task**: 03-05 slice download timeout master P1-P3

### Summary

(Add summary)

### Main Changes

| Item | Description |
|------|-------------|
| P1 | Added clip mode setting (`clipDownloadMode`) and stage-based download progress contract (`preparing/downloading/merging/post_processing`) across backend/frontend. |
| P2 | Added precise mode hardware encoder probing and automatic CPU fallback for stable slicing. |
| P3 | Added hybrid repeated-slice source cache reuse with integrity check, TTL/size limits, invalidation and one retry fallback. |

**Verification**:
- `cargo fmt`
- `cargo check`
- `npm run type-check`
- `npm run lint`
- `npm test`

**Updated Files**:
- `.trellis/spec/backend/type-safety.md`
- `.trellis/spec/frontend/type-safety.md`
- `src-tauri/src/lib.rs`
- `src/App.tsx`
- `src/pages/SettingsPage.tsx`


### Git Commits

| Hash | Message |
|------|---------|
| `2c32594` | (see git log) |
| `23abe7a` | (see git log) |
| `6c17a31` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 12: Strict GPU precise slicing + naming fixes

**Date**: 2026-03-05
**Task**: Strict GPU precise slicing + naming fixes

### Summary

Fixed selection download progress/cleanup paths, added strict precise GPU slicing, updated clip naming template, and synced backend/frontend type-safety specs.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `68897e0` | (see git log) |
| `a3e5a2a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 13: Queue extension-triggered video downloads

**Date**: 2026-03-06
**Task**: Queue extension-triggered video downloads

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Backend queue | Serialized `video_selected` downloads through a backend queue and emitted `video-queue-count` updates. |
| Frontend UI | Added queue badge / queued status handling so the main window reflects backend-managed video task totals. |
| Cancellation | Fixed cancel terminal-state handling so late cancellation does not incorrectly keep successful output. |
| Specs | Updated frontend/backend type-safety docs and video download guide for the new queue-count event and serialized WS contract. |
| Verification | Ran `npm run type-check`, `npm run lint`, `npm test`, and `cargo check`. |

**Updated Files**:
- `src/App.tsx`
- `src/contexts/ThemeContext.tsx`
- `src-tauri/src/lib.rs`
- `.trellis/spec/frontend/type-safety.md`
- `.trellis/spec/backend/type-safety.md`
- `.trellis/spec/guides/video-download-patterns.md`


### Git Commits

| Hash | Message |
|------|---------|
| `b77eeee` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 14: Parallel video downloads and active badge

**Date**: 2026-03-06
**Task**: Parallel video downloads and active badge

### Summary

Enabled bounded parallel video downloads, upgraded Rust/React task-state contracts with traceId-based progress aggregation, refreshed the main-window active download badge styling, and synced cross-layer specs.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `fd48ead` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 15: Refine bulk download queue interactions

**Date**: 2026-03-06
**Task**: Refine bulk download queue interactions

### Summary

Refined the bulk download queue across frontend and backend: removed duplicate queue count from the ring, added clickable queue overlay with per-task progress/cancel actions, switched cancellation to traceId-targeted single-task behavior, polished overlay visuals/animations, and fixed the last-task overlay dismissal regression.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `dbdfea1` | (see git log) |
| `1a87e5a` | (see git log) |
| `900ed4a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 16: Extension direct-download quality preference

**Date**: 2026-03-06
**Task**: Extension direct-download quality preference

### Summary

Added a persistent browser-extension default direct-download quality selector for Douyin/Xiaohongshu, applied preference-based candidate prioritization before forwarding direct candidates to the desktop app, and removed the manual reconnect button from the popup.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `fd55f74` | (see git log) |
| `c677472` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 17: Extension quality tiers for yt-dlp

**Date**: 2026-03-06
**Task**: Extension quality tiers for yt-dlp

### Summary

Changed browser extension quality controls to drive yt-dlp tiers instead of direct-link sorting, kept direct downloads at highest quality, updated Rust selector routing and cross-layer specs, and recorded the new task PRD.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `07b1c42` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 18: Version 0.1.9 portable build and Tauri identifier fix

**Date**: 2026-03-06
**Task**: Version 0.1.9 portable build and Tauri identifier fix

### Summary

Bumped release version to 0.1.9, fixed the Tauri bundle identifier with legacy config migration, rebuilt the portable package, and documented the migration checks.

### Main Changes

| Area | Description |
|------|-------------|
| Release | Bumped app version to 0.1.9 across package metadata, Tauri metadata, Cargo manifest, lockfile, and settings UI. |
| Packaging | Built the local Windows portable package and verified `FlowSelect_0.1.9_x64_portable.zip` output. |
| Tauri | Changed bundle identifier from `com.flowselect.app` to `com.flowselect.desktop` to remove the Tauri build warning. |
| Migration | Added one-time config migration so existing `settings.json` is copied from the legacy identifier directory on first read when needed. |
| Spec | Documented the identifier/config-migration contract and required validation points in the cross-platform thinking guide. |

**Verification**:
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `npm run lint`
- `npm run type-check`
- `npm run test`
- `powershell -ExecutionPolicy Bypass -File .\\scripts\\package-portable.ps1 -SkipYtdlpUpdate`

**Artifacts**:
- `src-tauri/target/release/bundle/portable/FlowSelect_0.1.9_x64_portable.zip`


### Git Commits

| Hash | Message |
|------|---------|
| `a00fafa` | (see git log) |
| `1c98914` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 19: yt-dlp tiers and extension connection UX

**Date**: 2026-03-06
**Task**: yt-dlp tiers and extension connection UX

### Summary

Adjusted yt-dlp best/balanced download behavior, removed the ignored temp-path warning, and improved browser-extension desktop connection messages.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `737099b` | (see git log) |
| `dec5be2` | (see git log) |
| `f64b2f4` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 20: Inline context menu overlay

**Date**: 2026-03-08
**Task**: Inline context menu overlay

### Summary

Replaced the separate Windows context-menu WebviewWindow with an in-window overlay, kept idle minimize paused while the menu is open, and routed output-folder selection through the main window flow.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `3f79b8f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 21: Windows context menu recovery and release workflow hardening

**Date**: 2026-03-08
**Task**: Windows context menu recovery and release workflow hardening

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Windows context menu | Restored the dedicated Tauri context menu window after the inline overlay regression broke right-click menu opening on Windows. |
| Output folder actions | Routed context-menu folder actions through Rust commands, fixed native folder picker behavior, and ensured folder actions close the menu immediately. |
| Cross-layer docs | Added an executable spec for context-menu native folder actions and linked the contract from hook guidance. |
| Release process | Bumped FlowSelect to 0.2.2 and introduced required versioned release notes for tagged releases. |
| Packaging | Built a local Windows portable package for 0.2.2 verification. |

**Verification**
- `npm run lint`
- `npm run type-check`
- `npm test`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- Manual Windows validation of context-menu behavior by the user


### Git Commits

| Hash | Message |
|------|---------|
| `407dda4` | (see git log) |
| `cf4f5e8` | (see git log) |
| `5b61cb8` | (see git log) |
| `3a85b49` | (see git log) |
| `40f40dc` | (see git log) |
| `f597b76` | (see git log) |
| `5fc29d6` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 22: Sync download preferences and polish popup quality label

**Date**: 2026-03-09
**Task**: Sync download preferences and polish popup quality label

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Download defaults | Synced desktop pasted-link video downloads with the browser extension's persisted quality / AE preferences instead of hardcoding `best`. |
| Extension bridge | Added proactive `sync_download_preferences` messages on WebSocket connect and local preference changes so pasted downloads stay aligned before the next extension-triggered download. |
| Backend contract | Persisted extension preference overrides into desktop config and documented the cross-layer WebSocket contracts in `.trellis/spec/backend/type-safety.md`. |
| Popup polish | Refined the extension popup quality buttons so the `Balanced` label stays visually centered and no longer crowds the right edge. |

**Commits**:
- `98b6d54` `fix(download): sync pasted video quality defaults`
- `e63b3ef` `fix(extension): align balanced quality label`

**Updated Files**:
- `src-tauri/src/lib.rs`
- `browser-extension/background.js`
- `browser-extension/popup.js`
- `browser-extension/popup.css`
- `.trellis/spec/backend/type-safety.md`
- `.trellis/tasks/03-09-sync-pasted-video-quality/prd.md`


### Git Commits

| Hash | Message |
|------|---------|
| `98b6d54` | (see git log) |
| `e63b3ef` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 23: Bilingual README and GitHub homepage upgrade

**Date**: 2026-03-09
**Task**: Bilingual README and GitHub homepage upgrade

### Summary

Added a Chinese-first README, English mirror, GitHub homepage showcase sections, platform download guidance, and extension install visuals.

### Main Changes

| Area | Description |
|------|-------------|
| README default | Replaced the repository root README with a Chinese-first GitHub landing page. |
| English docs | Added `README.en.md` as a linked English mirror. |
| GitHub homepage | Added hero links, release badges, preview sections, platform-specific download guidance, and workflow summaries. |
| Visual assets | Added lightweight SVG previews for the floating window, settings page, browser-assisted capture, and extension install steps. |
| Task tracking | Created and updated the Trellis task for the README refresh and homepage expansion. |

**Updated Files**:
- `README.md`
- `README.en.md`
- `docs/readme/preview-desktop.svg`
- `docs/readme/preview-settings.svg`
- `docs/readme/preview-browser.svg`
- `docs/readme/extension-install.svg`
- `.trellis/tasks/03-09-update-readme-project-overview/prd.md`


### Git Commits

| Hash | Message |
|------|---------|
| `8944a83` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 24: Bundle ffmpeg for portable downloads

**Date**: 2026-03-09
**Task**: Bundle ffmpeg for portable downloads

### Summary

Bundled ffmpeg for portable ZIPs, wired yt-dlp and internal ffmpeg resolution to bundled binaries, cleaned split-stream artifacts, bumped the app to 0.2.3, and rebuilt the Windows portable package.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `bd6283b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 25: Unify bundled runtime binary layout

**Date**: 2026-03-09
**Task**: Unify bundled runtime binary layout

### Summary

Unified yt-dlp, deno, and ffmpeg runtime resolution to binaries/, removed duplicate portable root executables, updated packaging/resource contracts, and verified build plus portable output.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `aecbd45` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 26: Pinterest video download support planning

**Date**: 2026-03-09
**Task**: Pinterest video download support planning

### Summary

Created task 03-09-pinterest-video-download-support, documented MVP scope to keep Pinterest images on the existing path, use pinterest-dl for videos via explicit pin metadata resolution, include desktop paste/drag-drop and extension button entry, and defer pinterest-dl version/update UI to a follow-up task.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `f602059` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 27: Pinterest video download support implementation

**Date**: 2026-03-09
**Task**: Pinterest video download support implementation

### Summary

Implemented Pinterest video download support across desktop routing, browser extension injection, backend pin resolution, and bundled runtime wiring.

### Main Changes

| Area | Description |
|------|-------------|
| Desktop routing | Added Pinterest pin detection and split image-pin vs video-pin handling for drag/drop and paste entry points. |
| Browser extension | Added Pinterest detector/button injection next to native pin actions and reused the shared `video_selected` bridge. |
| Backend routing | Added a dedicated Pinterest queue path, pin metadata resolver, and runtime launch flow instead of relying on `yt-dlp` or `pinterest-dl scrape(pin-url)`. |
| Runtime packaging | Bundled a `pinterest-runtime.py` wrapper under `src-tauri/binaries/` and registered it through Tauri `binaries/` resources. |

**Verification**
- `npm run build`
- `npm run lint`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `node --check browser-extension/pinterest-detector.js`
- Python bytecode compile for `src-tauri/binaries/pinterest-runtime.py`

**Residual Risk**
- Live end-to-end Pinterest sample verification is still pending in this environment because direct Pinterest requests timed out here.
- The new Pinterest runtime currently assumes an available Python runtime and bootstraps `pinterest-dl` on first use.


### Git Commits

| Hash | Message |
|------|---------|
| `07f1859` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 28: Pinterest card buttons and runtime download fixes

**Date**: 2026-03-09
**Task**: Pinterest card buttons and runtime download fixes

### Summary

Fixed Pinterest runtime bootstrap under SOCKS proxy envs, added feed-card and detail-page download buttons, aligned card button styling with Pinterest hover actions, and corrected extension pageUrl forwarding for card downloads.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `750635b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 29: Pinterest injected button placement refinements

**Date**: 2026-03-09
**Task**: Pinterest injected button placement refinements

### Summary

Refined Pinterest feed and detail-page injected button placement, matched share-button styling, stabilized GIF card injection, and tuned the detail-page cat icon size.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `dcda124` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 30: Stabilize Pinterest masonry download buttons

**Date**: 2026-03-10
**Task**: Stabilize Pinterest masonry download buttons

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Pinterest masonry cards | Stabilized download button injection for normal cards and compact cards without share/send controls. |
| Button placement | Aligned normal cards to the native send/share control and anchored compact cards to the visual card bounds at bottom-right. |
| Button styling | Matched compact-card styling to the white rounded-square card button and removed flicker / icon drift during hover. |

**Updated Files**:
- `browser-extension/pinterest-detector.js`
- `browser-extension/pinterest-button.css`

**Verification**:
- `npm run lint`
- `npm run type-check`
- `npm run test`
- `npm run build`


### Git Commits

| Hash | Message |
|------|---------|
| `996a1c2` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 31: Pinterest downloader stabilization and drag support

**Date**: 2026-03-10
**Task**: Pinterest downloader stabilization and drag support

### Summary

(Add summary)

### Main Changes

| Area | Summary |
|------|---------|
| Pinterest sidecar | Switched the app to the bundled Pinterest downloader sidecar, stabilized downloader execution, and aligned progress/cancel behavior with the queue pipeline. |
| Pinterest UI | Finished Pinterest detail-page action styling, added recommended-card download injection, and stabilized card/button behavior across SPA navigation. |
| Desktop drag/drop | Added Pinterest drag hint propagation from extension to desktop, plus resolver hint fallback so dragged Pinterest video cards can download reliably. |
| Verification | Repeatedly verified with `cargo check --manifest-path src-tauri/Cargo.toml`, `npm run typecheck`, and extension script syntax checks while reproducing image/video/detail/drag flows. |

**Commits recorded**:
- `2022a2a` `fix(pinterest): stabilize sidecar downloads and detail actions`
- `ef92a9a` `fix(pinterest): add desktop drag hint fallback`
- `fc3bf95` `fix(pinterest): support drag-enriched card downloads`

**Outstanding**:
- Task is not archived yet; Workstream 5/6 packaging and release-gate closure remain.


### Git Commits

| Hash | Message |
|------|---------|
| `2022a2a` | (see git log) |
| `ef92a9a` | (see git log) |
| `fc3bf95` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 32: Pinterest sidecar packaging and settings delivery

**Date**: 2026-03-10
**Task**: Pinterest sidecar packaging and settings delivery

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Pinterest packaging | Stabilized the bundled Pinterest sidecar build/release flow, added Windows-side smoke gating, tightened bundled resource selection, and closed Windows verification with macOS deferred. |
| Tests and fixtures | Added frontend Pinterest helper coverage plus Rust resolver fixture tests for top-level video, carousel video, and image-only pins. |
| Maintainer workflow | Added a PyPI-based upstream reminder script and scheduled GitHub Actions workflow that creates, updates, or closes a single maintainer issue when `pinterest-dl` falls behind. |
| User Settings UX | Added a Settings card that shows the bundled Pinterest downloader version and sidecar version, with truthful app-release-based update messaging and a link to FlowSelect releases. |

**Commits**:
- `789bbfe` `feat(pinterest): stabilize sidecar packaging and maintenance`
- `48d2251` `feat(settings): show bundled pinterest downloader info`

**Verification**:
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `npm run smoke:pinterest-sidecar -- --mode binary --target x86_64-pc-windows-msvc`
- `powershell -ExecutionPolicy Bypass -File ./scripts/package-portable.ps1 -SkipYtdlpUpdate`
- Windows manual checks passed for image-pin non-regression, cancel path, extension entry, exact-pin correctness, and packaged portable sanity.

**Notes**:
- macOS packaged/runtime verification remains deferred pending access to suitable hardware.
- The Settings Pinterest updater remains app-release-based only; there is no standalone in-app Pinterest downloader updater.


### Git Commits

| Hash | Message |
|------|---------|
| `789bbfe` | (see git log) |
| `48d2251` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 33: Remove legacy Pinterest runtime artifacts

**Date**: 2026-03-10
**Task**: Remove legacy Pinterest runtime artifacts

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Cleanup | Removed the legacy `src-tauri/binaries/pinterest-runtime.py` runtime path after the Pinterest downloader migration was fully closed. |
| Ignore rules | Added Python cache ignores for `__pycache__/` and `*.pyc` so local sidecar runs do not leave noisy untracked artifacts. |
| Validation | Confirmed the repo no longer references `pinterest-runtime.py` or `__pycache__` in active build/runtime paths before committing the cleanup. |

**Commit**:
- `53317f4` `chore(pinterest): remove legacy runtime artifacts`

**Files**:
- `.gitignore`
- `src-tauri/binaries/pinterest-runtime.py` (deleted)

**Notes**:
- This was a cleanup-only follow-up after the Pinterest sidecar packaging and Settings delivery work had already been merged.
- Unrelated working tree changes in `package.json`, `package-lock.json`, `src/App.tsx`, and `src/pages/ContextMenuPage.tsx` were intentionally left out.


### Git Commits

| Hash | Message |
|------|---------|
| `53317f4` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 34: Migrate Motion and stabilize popup windows

**Date**: 2026-03-10
**Task**: Migrate Motion and stabilize popup windows

### Summary

Migrated React animations to motion/react, fixed transparent child-window theme flicker, refined the context-menu entrance animation, updated frontend state-management guidance, and bumped the app version to 0.2.4.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `6d9891b` | (see git log) |
| `bcc66a5` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 35: Settings downloader deck polish and portable build

**Date**: 2026-03-10
**Task**: Settings downloader deck polish and portable build

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Settings downloader deck | Merged the yt-dlp and pin-dlp cards into a stacked wheel-driven deck, condensed the card copy, and iterated on the front/back transition timing until the motion felt stable during hover changes. |
| Frontend spec | Added motion-guideline coverage for wheel-driven deck motion inside scrollable panels, including native non-passive wheel capture and freezing hover-derived visuals while animations are in flight. |
| Packaging | Built a local Windows portable package at `src-tauri/target/release/bundle/portable/FlowSelect_0.2.4_x64_portable.zip` with `-SkipYtdlpUpdate`. |

**Verification**:
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `powershell -ExecutionPolicy Bypass -File ./scripts/package-portable.ps1 -SkipYtdlpUpdate`


### Git Commits

| Hash | Message |
|------|---------|
| `e153a4c` | (see git log) |
| `1abf3d7` | (see git log) |
| `27b611a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 36: Deliver Chinese-first i18n across desktop extension and tray

**Date**: 2026-03-10
**Task**: Deliver Chinese-first i18n across desktop extension and tray

### Summary

Built the shared i18n foundation, localized desktop React windows, extension popup and native tray, added verification hardening, recorded release notes, and cleaned up parallel worktrees.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `91c7a76` | (see git log) |
| `bf992ad` | (see git log) |
| `2459e24` | (see git log) |
| `82dda3f` | (see git log) |
| `617bee8` | (see git log) |
| `ae5563b` | (see git log) |
| `7d4752d` | (see git log) |
| `f8a76c8` | (see git log) |
| `8140773` | (see git log) |
| `220df69` | (see git log) |
| `3e3597d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 37: YouTube and Bilibili clip controls

**Date**: 2026-03-11
**Task**: YouTube and Bilibili clip controls

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| YouTube controls | Replaced IN/OUT clip-point icons, tuned icon sizing, and adjusted visual spacing between IN/OUT buttons without shrinking hit targets. |
| Bilibili controls | Added IN/OUT clip-point buttons and clip-download behavior aligned with YouTube while preserving screenshot and full-download flows. |
| Task planning | Split follow-up work into dedicated tasks for clip-point clear interaction and injected player-control localization. |

**Verification**:
- `node --check browser-extension/youtube-detector.js`
- `node --check browser-extension/bilibili-detector.js`
- `npm run lint`
- `npm run type-check`
- `npm run test`


### Git Commits

| Hash | Message |
|------|---------|
| `d5d1282` | (see git log) |
| `14b1139` | (see git log) |
| `e481a3c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 38: Add clip point clear interaction

**Date**: 2026-03-11
**Task**: Add clip point clear interaction

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Clip controls | Added right-click clear for selected IN and OUT clip points in injected YouTube and Bilibili controls. |
| Interaction copy | Selected-state button titles now advertise the right-click clear affordance only when a point is set. |
| Verification | Ran `npm run lint`, `npm run type-check`, `npm run test`, plus `node --check` on both detector files. |

**Updated Files**:
- `browser-extension/youtube-detector.js`
- `browser-extension/bilibili-detector.js`
- `.trellis/tasks/03-11-add-clip-point-clear-interaction/implement.jsonl`
- `.trellis/tasks/03-11-add-clip-point-clear-interaction/check.jsonl`
- `.trellis/tasks/03-11-add-clip-point-clear-interaction/debug.jsonl`


### Git Commits

| Hash | Message |
|------|---------|
| `f8826c0` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 39: Localize injected player controls

**Date**: 2026-03-11
**Task**: Localize injected player controls

### Summary

Added a shared extension locale loader, localized injected YouTube and Bilibili control copy and alerts, synced locale resources from the source locales directory, and documented the locale source-of-truth workflow.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `1ff36bd` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 40: Image drag diagnostics and protected-image fallback planning

**Date**: 2026-03-11
**Task**: Image drag diagnostics and protected-image fallback planning

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Image drag diagnostics | Added runtime evidence for `download_image` and `save_data_url`, plus terminal console output for image/data-url success and failure. |
| HTML fallback | Added generic `text/html` image extraction and wired it into desktop drag handling for non-Pinterest image drops. |
| Tests | Added frontend image-drag tests and Rust support-log evidence coverage; verified lint, type-check, Vitest, and targeted Rust tests. |
| Brainstorm task | Captured the protected-image browser-context fallback plan, including MVP scope: direct-first, browser fallback only on hotlink-like failure, reusing `save_data_url`, with a lightweight all-pages content script. |

**Updated Files**:
- `.trellis/tasks/03-11-track-image-drag-diagnostics-and-html-fallback/task.json`
- `.trellis/tasks/03-11-track-image-drag-diagnostics-and-html-fallback/prd.md`
- `.trellis/tasks/03-11-track-image-drag-diagnostics-and-html-fallback/implement.jsonl`
- `.trellis/tasks/03-11-track-image-drag-diagnostics-and-html-fallback/check.jsonl`
- `.trellis/tasks/03-11-track-image-drag-diagnostics-and-html-fallback/debug.jsonl`
- `src/App.tsx`
- `src/utils/imageDrag.ts`
- `src/utils/imageDrag.test.ts`
- `src-tauri/src/lib.rs`
- `.trellis/tasks/03-11-brainstorm-protected-image-browser-context-fallback/task.json`
- `.trellis/tasks/03-11-brainstorm-protected-image-browser-context-fallback/prd.md`

**Verification**:
- `npm run test`
- `npm run type-check`
- `npm run lint`
- `cargo test support_log_runtime_evidence --manifest-path src-tauri/Cargo.toml`


### Git Commits

| Hash | Message |
|------|---------|
| `5a24cd2` | (see git log) |
| `e4c15f4` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 41: Protected image browser-context fallback

**Date**: 2026-03-11
**Task**: Protected image browser-context fallback

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Extension | Added protected-image drag token registration, generic detector coverage, and browser-context resolution fallback plumbing |
| Desktop | Extended image drop handling to pass protected-image fallback hints into `download_image` |
| Backend | Added synchronous protected-image fallback orchestration, WS result correlation, and runtime evidence breadcrumbs |
| Specs/Tests | Updated frontend/backend type-safety contracts and added protected-image drag + runtime evidence tests |

Manual verification:
- Confirmed protected image drag from Solar System Scope succeeds after direct 403/HTML rejection by falling back through browser context.


### Git Commits

| Hash | Message |
|------|---------|
| `14b8b92` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 42: Single-instance desktop launch and portable build

**Date**: 2026-03-11
**Task**: Single-instance desktop launch and portable build

### Summary

Restricted FlowSelect to a single running desktop instance and produced a local portable build for manual verification.

### Main Changes

| Area | Description |
|------|-------------|
| Tauri backend | Added the official single-instance plugin and routed repeat launches back to the existing main window. |
| Packaging | Built a local Windows portable package with `package-portable.ps1 -SkipYtdlpUpdate` for manual verification. |
| Verification | Ran `cargo check --manifest-path src-tauri/Cargo.toml` and completed a full portable build successfully. |


### Git Commits

| Hash | Message |
|------|---------|
| `40009cf` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 43: Harden yt-dlp Windows flow and output naming

**Date**: 2026-03-11
**Task**: Harden yt-dlp Windows flow and output naming

### Summary

Hidden Windows ffmpeg/ffprobe console windows during AE-friendly post-processing and updated rename-disabled yt-dlp outputs to include resolution plus quality suffixes so quality presets do not collide.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `017e44f` | (see git log) |
| `7c40fe4` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 44: Fix current-item playlist downloads

**Date**: 2026-03-11
**Task**: Fix current-item playlist downloads

### Summary

Fixed YouTube and Bilibili playlist-context downloads so player-triggered selections stay on the current item, added the cross-layer selectionScope contract, and documented the runtime guard in backend type-safety spec.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `01ee1d1` | (see git log) |
| `7e6a7c8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 45: Main window output folder double-click shortcut

**Date**: 2026-03-11
**Task**: Main window output folder double-click shortcut

### Summary

Added an idle-state double-click shortcut to open the output folder, preserved the right-click folder action, and documented the drag-threshold cross-layer contract.

### Main Changes

- Added an idle-state double-click shortcut on the main window to open the current output folder while keeping the right-click `Open Folder` action.
- Reworked the main panel pointer handling so dragging starts only after a 6px movement threshold, which preserves drag behavior without blocking double-click.
- Added a shared backend `open_current_output_folder` command so the double-click path and context-menu path resolve the same fallback output directory.
- Updated frontend/backend type-safety specs with the new cross-layer command and the double-click versus drag contract.
- Synced `README.md` and `README.en.md` with the new desktop interaction.

**Verification**:
- `npm run lint`
- `npm run type-check`
- `npm run test`
- `cargo check --manifest-path src-tauri/Cargo.toml`


### Git Commits

| Hash | Message |
|------|---------|
| `2343e51` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 46: Brainstorm portable windows rendering issue

**Date**: 2026-03-11
**Task**: Brainstorm portable windows rendering issue

### Summary

Created and documented a brainstorm task for portable Windows rendering inconsistencies, analyzed transparent window/DPI/WebView2 causes, and kept the task in planning state after shelving implementation.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `a12a88f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 47: Implement backend transcode queue model

**Date**: 2026-03-11
**Task**: Implement backend transcode queue model

### Summary

Split source download completion from downstream transcode completion, added a serial backend transcode queue with retry/remove commands and transcode events, updated the backend type-safety spec, and verified with npm lint/type-check/test plus cargo check/test.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `7ddce0b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 48: Desktop transcode queue ui

**Date**: 2026-03-12
**Task**: Desktop transcode queue ui

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Desktop queue model | Split the main window queue into download and transcode sections and derived the primary-task display from both queue families. |
| Tauri contract wiring | Added typed listeners for `video-transcode-*` events and typed invokes for `retry_transcode` / `remove_transcode`. |
| Theme + copy | Reworked the queue badge into a neutral total-count badge with download/transcode dots and added new transcode colors plus dual-stage locale copy. |
| Verification | Ran `npm run locales:sync`, `npm run lint`, `npm run typecheck`, and `npm test` successfully before recording the session. |

**Updated Files**:
- `src/App.tsx`
- `src/contexts/ThemeContext.tsx`
- `locales/en/desktop.json`
- `locales/zh-CN/desktop.json`
- generated desktop locale resources synced to extension + Tauri resource folders


### Git Commits

| Hash | Message |
|------|---------|
| `75c348b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 49: Remove extension AE popup control

**Date**: 2026-03-12
**Task**: Remove extension AE popup control

### Summary

Removed the extension popup AE Format toggle, added a Highest-only transcode hint, stopped active extension sync of aeFriendlyConversionEnabled, synced locale artifacts, and updated backend type-safety spec for the new quality-only extension contract.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `2f8e2dd` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 50: Fix quality selection and AE-safe probe regressions

**Date**: 2026-03-12
**Task**: Fix quality selection and AE-safe probe regressions

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| yt-dlp Highest | Fixed YouTube Highest downloads that could degrade to cookies-backed `m3u8_native` 1920x960 or lower by logging selected formats, probing cookie-free selection with `--skip-download`, and retrying only when the public route is strictly better. |
| AE-safe probe | Resolved ffprobe runtime assumptions by preferring app-managed ffprobe and falling back to ffmpeg header parsing when ffprobe is unavailable. |
| Extension quality UX | Fixed popup quality hint visibility so the Highest-only warning stays hidden for Balanced and Data Saver selections. |
| Dev workflow | Updated `dev:all` to reclaim the desktop websocket port so extension reloads connect to the current dev backend. |

**Verification**:
- `npm run lint`
- `npm run type-check`
- `npm test`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml youtube_highest_retry -- --nocapture`
- `cargo test --manifest-path src-tauri/Cargo.toml selected_format_better_comparison -- --nocapture`
- `cargo test --manifest-path src-tauri/Cargo.toml parse_ytdlp_selected_format_line -- --nocapture`
- `cargo test --manifest-path src-tauri/Cargo.toml ffmpeg_probe_fallback -- --nocapture`
- Manual verification: reproduced YouTube `Highest` cookies-backed `96-6` selection, confirmed automatic cookie-free retry upgraded to `313+251` / `3840x1920`, and confirmed AE-safe transcode completion.

**Updated Files**:
- `.trellis/spec/guides/video-download-patterns.md`
- `browser-extension/popup.css`
- `browser-extension/popup.html`
- `browser-extension/popup.js`
- `scripts/dev-all.mjs`
- `src-tauri/src/lib.rs`


### Git Commits

| Hash | Message |
|------|---------|
| `d1b5263` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
