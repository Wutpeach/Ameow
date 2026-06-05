---
title: Release Notes
description: In-site release history for Ameow stable releases and prerelease builds.
---

This page tracks user-visible Ameow / FlowSelect changes across stable releases and prerelease builds. Stable releases are the right reference for most users. Prerelease notes are mainly for understanding what a test build was validating.

## Stable Releases

### v0.3.0

#### Highlights

- The desktop runtime and release pipeline moved to Electron, bringing a new native app shell, a Node-managed download runtime, browser-extension assets shipped with releases, and more consistent startup behavior between development and packaged builds.
- Web video collection expanded significantly, with broader site routing coverage and stronger downloader-provider support.
- The compact desktop UI received a broad round of polish, including smoother icon-mode transitions, steadier drag/hover behavior, and clearer queue and status feedback.
- macOS packaging and launch behavior improved across several fronts, including compact-mode consistency, packaged-app launch recovery, custom DMG layout, and first-launch/runtime stability fixes.

#### Fixes

- Restored the post-download transcode path in the Electron build so highest-quality videos that still need conversion continue into the conversion stage.
- Improved handling of Bilibili preview videos under compatibility mode so already-usable media is not transcoded again.
- Fixed a compact-window state race after download or conversion completion so the completion checkmark appears reliably in the main window.
- Improved download-path stability around naming, title recovery after paste, direct-link downloads following the system proxy, task cleanup logic, localized activity copy, and Pinterest handling.
- Fixed several extension-to-desktop coordination issues, including WebSocket reconnection after app restart, unstable first-click download triggers, and video-selection event safety.
- Strengthened transcode progress and cancel behavior with clearer progress and ETA feedback, refined highest-quality FFmpeg parameters, and avoided broken follow-up state after canceling conversion.
- Resolved cross-platform shell issues including Windows launch-at-startup recovery, packaged-renderer loading, output-path handling after dropping folders, and faster settings-window display.
- Tightened macOS-specific behavior including compact-window transitions, tray positioning, output-folder actions, launch freezing, and launch gating.

#### Notes

- `0.3.0` is a major desktop-platform and download-capability update built on top of `0.2.9`; no manual migration is required.
- The tagged release is expected to include the browser extension asset `Ameow_0.3.0_browser_extension.zip`.

Full Changelog: https://github.com/Wutpeach/FlowSelect/compare/v0.2.9...v0.3.0

### v0.2.9

#### Highlights

- Polished the compact task queue so download and conversion work are easier to follow, with a clearer distinction between downloading and MP4-compatible conversion.
- Refined settings cards and shared desktop controls so buttons, fields, toggles, and queue actions feel more consistent between the main window and settings UI.

#### Fixes

- Improved the "cancel current conversion" flow so queue state and task feedback stay consistent after canceling a conversion.
- Tightened queue-update state handling in the task window to reduce visual desync on the compact surface during active jobs.

#### Notes

- `0.2.9` is a desktop UX and queue-management refinement release built on top of `0.2.8`; no migration is required.

Full Changelog: https://github.com/Wutpeach/FlowSelect/compare/v0.2.8...v0.2.9

### v0.2.8

#### Highlights

- Added support for pasting clipboard images directly so copied screenshots and images can go into Ameow without being saved first.
- Added an in-app update entry point and improved packaged runtime preparation so desktop builds become usable faster on first run.
- Refined the X in-page download button so video-post actions feel closer to the native action-button experience.

#### Fixes

- Stopped the noisy startup-time `yt-dlp` refresh loop that made the main window feel unstable during launch.
- Tightened compact settings and status surfaces so version and download-maintenance UI is clearer in packaged builds.

#### Notes

- `0.2.8` brings the updater and packaging work from the `0.2.7` prerelease line into the stable release line.
- Windows packaged installs now prewarm the managed runtime during installation to reduce first-launch friction on new machines.

Full Changelog: https://github.com/Wutpeach/FlowSelect/compare/v0.2.7...v0.2.8

### v0.2.7

#### Highlights

- Added a clearer downloader-runtime flow so the main window and settings page can show downloader/runtime preparation status and provide better guidance when components need attention.
- Improved packaged-runtime delivery, including managed-tool bootstrap work for Pinterest sidecars, Deno, and related tooling, reducing machine-to-machine configuration drift.
- macOS began shipping as an unsigned open-source DMG with a standard drag-to-Applications layout and an install guide that includes a copyable first-launch fix command.

#### Fixes

- Improved `Highest` download retry preflight and success-state handling to reduce misleading states after runtime or network interruptions.
- Hid low-level process-cancel controls from normal app surfaces and strengthened yt-dlp/runtime checks on macOS for more predictable packaged behavior.

#### Notes

- The macOS DMG is an unsigned open-source build and does not require Apple Developer Program signing. Users should first drag `FlowSelect.app` into `Applications`, then use Finder's `Open`, `Privacy & Security > Open Anyway`, or the documented `xattr -dr com.apple.quarantine "/Applications/FlowSelect.app"` command to handle Gatekeeper on first launch.
- This release also added the runtime sidecar delivery path so packaged download assets stay aligned with app expectations.

Full Changelog: https://github.com/Wutpeach/FlowSelect/compare/v0.2.6...v0.2.7

### v0.2.6

#### Highlights

- Added a two-stage queue in the desktop main window, separating download and conversion, surfacing task types in queue badges, and allowing failed conversions to retry or be removed directly.
- Simplified the extension popup by removing the separate `AE Format` toggle and keeping only the `Highest / Balanced / Saver` choices, plus a contextual hint when `Highest` may trigger automatic conversion.
- Added a main-window double-click shortcut for opening the current output folder while keeping the existing right-click menu actions.

#### Fixes

- Restored reliable download-quality selection so `Highest`, `Balanced`, and `Saver` map correctly to the intended download behavior.
- Fixed a case where YouTube `Highest` downloads could fall back to a lower HLS choice by improving cookie-based format probing and retry behavior.
- Switched AE-safe media detection to the app-managed `ffprobe` runtime so otherwise-compatible downloads no longer enter the conversion queue only because the host machine lacks a global `ffprobe`.

#### Notes

- This release focused on making the new download-to-conversion flow easier to understand while stabilizing the first batch of regressions after the queue redesign.
- The compare link uses `v0.2.2...v0.2.6` because the repository does not currently have `v0.2.3`, `v0.2.4`, or `v0.2.5` tags.

Full Changelog: https://github.com/Wutpeach/FlowSelect/compare/v0.2.2...v0.2.6

### v0.2.5

#### Highlights

- Added Chinese-first localization across the desktop window, extension popup, and native tray/menu surfaces.
- Improved packaged Bilibili and other yt-dlp download flows so Windows portable builds behave more consistently across machines.

#### Fixes

- Prevented the bundled yt-dlp runtime from inheriting host-machine yt-dlp config files, avoiding machine-specific behavior drift in the same portable build.
- Added automatic recovery for stale yt-dlp resume state to reduce `HTTP Error 416: Requested Range Not Satisfiable` during `Highest` downloads.
- Strengthened runtime language-switch logging and localization integration so translated UI stays more consistent.

#### Notes

- This release focused on delivering the new localization foundation and improving download reliability in packaged portable builds.
- The compare link uses `v0.2.2...v0.2.5` because the repository does not currently have `v0.2.3` or `v0.2.4` tags.

Full Changelog: https://github.com/Wutpeach/FlowSelect/compare/v0.2.2...v0.2.5

### v0.2.4

#### Highlights

- Added Pinterest video-download support and improved the bundled downloader flow so more video cards can be collected reliably.
- Expanded the settings page with bundled-downloader information and richer downloader-status animation cards.

#### Fixes

- Stabilized download behavior across Pinterest waterfall cards, detail actions, drag-enhanced cards, and desktop-drag fallback prompts.
- Improved runtime packaging by unifying the internal binary layout, bundling FFmpeg for portable builds, and tightening sidecar maintenance behavior.
- Fixed extension reconnect handling so video selection can retry cleanly after app reconnection.
- Reduced popup instability by moving the animation layer and hardening popup behavior.

#### Notes

- This release focused on Pinterest download reliability, packaged-runtime consistency, and settings-page polish.
- The compare link uses `v0.2.2...v0.2.4` because the repository does not currently have a `v0.2.3` tag.

Full Changelog: https://github.com/Wutpeach/FlowSelect/compare/v0.2.2...v0.2.4

### v0.2.2

#### Highlights

- Fixed a regression where the Windows right-click menu would not open reliably after inline-overlay changes.
- Restored the `Set Output Folder` action in the Windows right-click menu so it can open the native folder picker again.

#### Fixes

- Right-click folder actions now close the menu before triggering native Windows behavior.
- Folder selection paths are handled through the Tauri backend to avoid cross-window focus and layering issues blocking the flow.
- Added an explicit contract for right-click folder actions so future changes keep the same close, focus, and persistence behavior.

#### Notes

- This release also includes UI polish and extension-workflow improvements added after `v0.2.0`.
- The main focus of `0.2.2` was stabilizing Windows right-click interactions.

Full Changelog: https://github.com/Wutpeach/FlowSelect/compare/v0.2.0...v0.2.2

## Prerelease History

### v0.3.0-rc7

#### Highlights

- The seventh packaging test build before the `0.3.0` final release, focused on validating a new settings-page information architecture with clearer top-level navigation, download settings split out from general settings, and a plugin-page list scaffold for future expansion.

#### Fixes

- Reworked the settings-page top navigation so the primary sections behave more like real page switches instead of blending into controls like theme or language selection.
- Moved download directory and post-download rename behavior into a dedicated `Downloads` page to reduce mixing between general preferences and download behavior.
- Reshaped the plugin page so AE Portal lives inside a shared integrations list and the page can support future plugins or integrations more cleanly.
- Updated launch-at-startup and rename toggles to a full-row settings-item style with the switch on the right.
- Added a toggle for receiving prerelease updates so testers can keep receiving beta / rc builds outside the stable channel.

#### Notes

- This prerelease was meant to validate hierarchy clarity in the compact settings window and confirm whether the plugin-page scaffold is strong enough for future extension.
- If you want to keep testing later builds, enable prerelease updates in settings after installing this build.

Full Changelog: https://github.com/Wutpeach/FlowSelect/compare/v0.3.0-rc6...v0.3.0-rc7

### v0.3.0-rc6

#### Highlights

- The sixth packaging test build before `0.3.0`, focused on several high-frequency desktop fixes: shortcut-based reveal positioning, compact-mode position consistency, main-window drag behavior, and support-log export stability.

#### Fixes

- Fixed incorrect main-window positioning when revealing Ameow through the shortcut.
- Fixed compact mode drifting after shortcut reveal so it stays closer to the intended launcher position.
- Fixed main-window dragging being interrupted after downloads completed or drag-and-drop actions ended.
- Improved the support-log export path for better desktop-environment compatibility and stability.

#### Notes

- This prerelease was meant to regression-test window placement and drag behavior on the desktop shell, especially shortcut reveal and compact-mode positioning.
- The related GitHub Release is expected to include `FlowSelect_0.3.0-rc6_browser_extension.zip`.

Full Changelog: https://github.com/Wutpeach/FlowSelect/compare/v0.3.0-rc5...v0.3.0-rc6

### v0.3.0-rc5

#### Highlights

- The fifth packaging test build before `0.3.0`, focused on a group of macOS interaction fixes and video-download reliability fixes for YouTube / Bilibili injection flows.

#### Fixes

- Fixed the macOS main-window double-click action for opening the target folder and added a steadier fallback path.
- Fixed macOS right-click menu positioning so the menu appears near the pointer.
- Fixed a bug where temporary cookies files in the YouTube / Bilibili injected download flow were being written into a read-only location.
- Improved status feedback during the yt-dlp media-resolution stage so the UI no longer stays on `Preparing...` for too long before the real download begins.

#### Notes

- This prerelease was intended to retest macOS main-window double-click behavior, right-click menu placement, and injected player-button downloads.
- The related GitHub Release is expected to include `FlowSelect_0.3.0-rc5_browser_extension.zip`.

Full Changelog: https://github.com/Wutpeach/FlowSelect/compare/v0.3.0-rc4...v0.3.0-rc5

### v0.3.0-rc4

#### Highlights

- The fourth packaging test build before `0.3.0`, focused on confirming that the GitHub Actions macOS installer can launch correctly on another Apple Silicon machine.

#### Fixes

- Fixed a case where the packaged Electron main process on macOS missed `macAppVisibility.mjs`, causing `ERR_MODULE_NOT_FOUND` at launch.
- Added the macOS visibility helper into the Electron production build outputs so GitHub Actions and local packaging produce matching install contents.

#### Notes

- This prerelease was created specifically to retest the packaged-macOS startup failure exposed after `rc3`, especially when installing the DMG downloaded from GitHub Releases on another Mac.
- The related GitHub Release is expected to include `FlowSelect_0.3.0-rc4_browser_extension.zip`.

Full Changelog: https://github.com/Wutpeach/FlowSelect/compare/v0.3.0-rc3...v0.3.0-rc4

### v0.3.0-rc3

#### Highlights

- The third packaging test build before `0.3.0`, focused on validating the macOS arm64-only release path and confirming that two recent install-flow fixes made it into the test artifact.

#### Fixes

- Fixed browser-extension version compatibility for `0.3.0-rc*` prerelease tags so Chrome / Edge can load the test extension package correctly.
- Adjusted the macOS launch shape to behave like a tray / menu-bar utility that no longer keeps a Dock icon visible in normal use.
- Updated the GitHub Release build matrix so macOS only publishes arm64 install packages and ZIPs instead of shipping Intel installers too.

#### Notes

- This prerelease was used to validate the new macOS arm64-only release flow and confirm the `rc2` build-pipeline issues were cleared.
- The related GitHub Release is expected to include `FlowSelect_0.3.0-rc3_browser_extension.zip`.

Full Changelog: https://github.com/Wutpeach/FlowSelect/compare/v0.3.0-rc2...v0.3.0-rc3

### v0.3.0-rc2

#### Highlights

- The second packaging test build before `0.3.0`, focused on validating the macOS tray shape, prerelease browser-extension install compatibility, and the full GitHub Release build pipeline.

#### Fixes

- Fixed `manifest.version` compatibility for prerelease browser-extension builds such as `0.3.0-rc2`, allowing Chrome to install the extension while preserving the full prerelease string in `version_name`.
- Adjusted the macOS app launch shape so it behaves like a tray / menu-bar utility without keeping a Dock icon visible in normal use.

#### Notes

- This prerelease was used to validate whether the two key fixes added after `rc1` affected packaging and install behavior across platforms.
- The prerelease artifact set is expected to include `FlowSelect_0.3.0-rc2_browser_extension.zip`.

Full Changelog: https://github.com/Wutpeach/FlowSelect/compare/v0.3.0-rc1...v0.3.0-rc2

### v0.3.0-rc1

#### Highlights

- The first packaging test build before the `0.3.0` final release, used to validate the current Electron desktop build, browser-extension assets, and GitHub Release flow.
- This test build also included the baseline `0.3.0` capability set plus fixes for restored post-download conversion, Bilibili preview compatibility, and a stable completion checkmark in the main window.

#### Fixes

- Restored the post-download transcode path in the Electron build so highest-quality videos that still need conversion continue into the conversion queue.
- Improved handling of Bilibili preview videos under compatibility mode so already-usable media is not transcoded again.
- Fixed a state race after download or conversion completion so the completion checkmark stays in the main window reliably.

#### Notes

- This prerelease tag was only for validating the repackaged `0.3.0` flow and did not mean the final stable `v0.3.0` tag had already been reissued.
- If the packaging results looked correct, the next step was to recreate and publish the formal `v0.3.0` tag.
- The prerelease artifact set is expected to include `FlowSelect_0.3.0-rc1_browser_extension.zip`.

Full Changelog: https://github.com/Wutpeach/FlowSelect/compare/v0.2.9...v0.3.0-rc1

### v0.2.7-rc3

#### Highlights

- Simplified desktop release assets so Windows centers on a single `setup.exe` installer while updater-only archives and user-facing assets have clearer naming.
- Made local builds and GitHub Actions share the same platform-aware Tauri packaging defaults so Windows release candidates no longer generate or publish `MSI` packages by default.

#### Fixes

- Removed the extra Windows `MSI` release path so the Release page no longer looks like one platform has multiple equal installer choices.
- Renamed macOS updater archives and user-visible DMG / portable assets so updater-internal packages are easier to distinguish from manual downloads.

#### Notes

- This prerelease was used to validate the packaging and GitHub Actions release flow before promoting the new asset naming strategy.
- The in-app Windows updater still targets the signed `setup.exe` path. The change here was about release clarity, not updater transport.

Full Changelog: https://github.com/Wutpeach/FlowSelect/compare/v0.2.7-rc2...v0.2.7-rc3

### v0.2.7-rc2

#### Highlights

- Added an in-app update entry point to the main window so packaged builds move closer to full app self-updates instead of only exposing the separate `yt-dlp` updater.
- Hooked the desktop build and release path into Tauri updater assets, including signed install metadata and the public `latest.json` manifest expected by the update client.

#### Fixes

- Kept the settings-page downloader area focused on `yt-dlp`, `pin-dlp`, and runtime management instead of letting the new app-update flow take over that surface.
- Fixed the immutable-repository GitHub Release path by creating the draft prerelease first, uploading assets, then publishing the release.

#### Notes

- This prerelease was intended to validate the GitHub Actions release path and updater assets, not to serve as a normal user-upgrade target.
- Existing stable `v0.2.7` clients would not automatically discover `v0.2.7-rc2` through `/releases/latest/download/latest.json` because GitHub `latest` ignores prereleases and `0.2.7` is semantically newer than `0.2.7-rc2`.
- After the workflow succeeded, the GitHub Release should contain the public `latest.json` update manifest and the expected install/archive assets.

Full Changelog: https://github.com/Wutpeach/FlowSelect/compare/v0.2.7-rc1...v0.2.7-rc2

### v0.2.7-rc1

#### Highlights

- Added an in-app update entry point to the main window so packaged builds move toward app self-update instead of only exposing the separate `yt-dlp` updater.
- Integrated the desktop build and release flow with Tauri updater assets, including signed install metadata and the public `latest.json` manifest expected by update clients.

#### Fixes

- Kept the settings-page downloader area focused on `yt-dlp`, `pin-dlp`, and runtime management so the new app-update work did not disrupt existing downloader-maintenance UI.
- Aligned updater plugin versions, desktop permissions, and release packaging steps so updater-enabled builds can finish signing and asset generation reliably.

#### Notes

- This prerelease was intended to validate the GitHub Actions release flow and updater assets, not to serve as a normal user-upgrade target.
- Existing stable `v0.2.7` clients would not automatically discover `v0.2.7-rc1` through `/releases/latest/download/latest.json` because GitHub `latest` ignores prereleases and `0.2.7` is semantically newer than `0.2.7-rc1`.
- After the workflow succeeded, the GitHub Release should contain the public `latest.json` update manifest and the expected install/archive assets.

Full Changelog: https://github.com/Wutpeach/FlowSelect/compare/v0.2.7...v0.2.7-rc1
