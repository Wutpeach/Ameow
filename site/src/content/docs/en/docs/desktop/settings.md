---
title: Settings
description: General, Download, Components management, and app updates.
---

Open settings from Full's right-click menu, the system tray, or the Mac menu bar. Settings include General, Download, Components management, and About. Closing settings does not quit the app.

![Windows General settings](/Ameow/images/docs/rust-settings-en-general.png)

Adjust theme, language, and startup preferences in General. [Output folder](../output-folder/) shows download settings; [download components](../../advanced/download-dependencies/) explains version selection.

## Available settings

- **General:** choose System, Light, or Dark theme; System, Chinese, or English language; tray icon and startup options.
- **Download:** view, open, change, or copy the output folder. Choose quality in Full's right-click menu; see [quality and formats](../../advanced/quality-and-formats/).
- **Components management:** inspect component status, query trusted versions, and confirm a selection; see [download components](../../advanced/download-dependencies/).
- **About:** view the app version, check for app updates, and read embedded third-party notices. Configure automatic checks, background downloads, and restart after tasks finish.

Current Rust has no global hotkey editor, manual proxy, or AE compatibility setting.

## Login startup and moving the app

Windows distribution layouts start through the stable `AmeowLauncher.exe`; login startup also uses that entry. Exit normally before moving a folder, then recreate external shortcuts and check startup. Actual sign-out/sign-in startup remains unverified.

macOS uses system login items and requires the installed `Ameow.app` to manage startup. If approval is required, follow the prompt in System Settings. Running the source executable directly does not provide this app-bundle entry. Recheck login items after moving the app.

## App updates

App updates and download-component updates are separate. The app has a production public key and platform-specific update addresses configured, but Rust 0.5.0 and its public signed update feeds have not been published yet. A failed app-update check does not mean download components need reinstalling. Until a public update is available, keep using the current build and inspect any error details.

When an update is available, check in About and follow the download and restart prompts. Full's information entry and the tray/menu bar also provide update actions when applicable. Installation waits for running tasks to finish safely.

Windows distributions start the updated version through the Launcher. macOS replaces the complete `Ameow.app` in `/Applications` or `~/Applications` and requests system authorization only when the actual directory permissions require it. Cancelling authorization or failing candidate verification leaves the candidate uninstalled. Follow recovery prompts if replacement or the new version's startup fails; user data is retained.

## Data location

| Platform | Rust user data directory |
| --- | --- |
| Windows | `%LOCALAPPDATA%\Ameow` |
| macOS | `~/Library/Application Support/AmeowNative` |

Settings, runtime selection, and cache live in the current user's directory, separate from the app. Rust does not automatically import old Electron configuration. Do not clear this data for routine troubleshooting.
