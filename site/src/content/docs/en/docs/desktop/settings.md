---
title: Settings
description: Settings
---

Settings include General, Download, Components management, and About. General offers startup, theme, and language; Download lets you view, open, change, or copy the output folder.

![General settings](/Ameow/images/docs/rust-settings-en-general.png)

Adjust theme, language and startup preferences on the General page. [Output folder](../output-folder/) shows download settings; [download components](../../advanced/download-dependencies/) explains version selection.

Distribution layouts start through the stable `AmeowLauncher.exe`; login startup also uses that entry. Exit normally before moving a folder, then recreate external shortcuts and check startup. Actual sign-out/sign-in startup remains unverified. Current Rust has no global hotkey editor, manual proxy, or AE compatibility setting.

## Available settings

- **General:** choose System, Light, or Dark theme; System, Chinese, or English language; tray icon and startup options.
- **Download:** view, open, change, or copy the output folder. Choose quality in the download interface; see [quality and formats](../../advanced/quality-and-formats/).
- **Components management:** inspect component status, query trusted versions, and confirm a selection; see [download components](../../advanced/download-dependencies/).
- **About:** view the app version, app-update status and embedded third-party notices. Configure automatic checks, background downloads and restart after tasks finish. Updates are unavailable while production signing is unconfigured. Download-component updates remain separate in Components management.

Settings, runtime selection, and cache are kept in Windows at `%LOCALAPPDATA%\Ameow`. The current application does not import old Electron configuration. Keep this directory to retain existing Rust data; do not clear it for routine troubleshooting.
