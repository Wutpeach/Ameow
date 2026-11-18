---
title: First launch on macOS
description: Starting the Apple Silicon test build, menu bar, and common problems.
---

Current Rust / GPUI has been tested on an Apple Silicon Mac running macOS 26.3. The app declares macOS 13 as its minimum; this is not a verified compatibility matrix for older systems. Intel and Universal are outside the current scope. Rust has not been officially released and no public Rust package is available. See [downloads and startup](../../downloads/).

## Opening an existing test build

1. Place your Rust test build of `Ameow.app` in `/Applications` or `~/Applications`, then open it from Finder. For source builds, see [local development](../../developer/local-development/).
2. Find Ameow in the menu bar and choose open or settings. No Dock icon appears by default. After closing settings, reopen it from the menu bar.
3. Confirm the output folder exists and is writable. Paste a public media link into Ameow with `Command+V`. Double-click Full's empty background to open the current confirmed output folder in Finder.

First use may need network access to prepare components. The app downloads, verifies, caches, and updates its components; users do not need to install Homebrew or Python themselves. See [supported sites](../../extension/supported-sites/) for download scope.

## If the floating window is missing

Choose open from the menu bar first. Compact follows ordinary Spaces but does not cover another app's fullscreen Space; return to a normal desktop to check. Full and settings do not promise the same Spaces behavior. See [floating window](../../desktop/floating-window/).

## Startup or update problems

A test bundle's local signature is not Apple Developer ID signing or notarization, and does not mean a public release exists. If macOS blocks startup, record the system prompt and test-build source, then follow that build's instructions. Do not reuse repair commands intended for historical Electron packages.

Login startup requires the installed app bundle. If macOS requests login-item approval, follow its prompt in System Settings. App updates request authorization only when actual directory permissions require it; cancelling does not install the update. There is no public signed update feed yet. Check [release status](../../releases/) and [settings and updates](../../desktop/settings/) if an update check fails.

Rust data lives in `~/Library/Application Support/AmeowNative`, isolated from old Electron data. Keep that directory when troubleshooting. Copy diagnostics from Components management or a failed task and record the steps and system version.

Historical [Electron v0.3.1](https://github.com/Wutpeach/Ameow/releases/tag/v0.3.1) is unsupported; its packages and startup instructions do not apply to current Rust.
