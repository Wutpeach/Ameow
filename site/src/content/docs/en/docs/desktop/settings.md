---
title: Settings
description: Settings
---

Settings include General, Download, Components management, and About. General offers startup, theme, and language; Download lets you view, open, change, or copy the output folder.

![General settings](/Ameow/images/docs/rust-settings-en-general.png)

Adjust theme, language and startup preferences on the General page. [Output folder](../output-folder/) shows download settings; [download components](../../advanced/download-dependencies/) explains version selection.

After renaming or moving the EXE, exit the old version, start the new one, and recreate shortcuts or taskbar pins. If startup was enabled, re-enable it in the new settings and check it; actual startup after signing in again is unverified. Current Rust has no app auto-updater, global hotkey editor, manual proxy, or AE compatibility setting.

## Available settings

- **General:** choose System, Light, or Dark theme; System, Chinese, or English language; tray icon and startup options.
- **Download:** view, open, change, or copy the output folder. Choose quality in the download interface; see [quality and formats](../../advanced/quality-and-formats/).
- **Components management:** inspect component status, query trusted versions, and confirm a selection; see [download components](../../advanced/download-dependencies/).
- **About:** view application information.

Settings, runtime selection, and cache are kept in Windows at `%LOCALAPPDATA%\AmeowNext\stage-a`. The current application does not import old Electron configuration. Keep this directory to retain existing Rust data; do not clear it for routine troubleshooting.
