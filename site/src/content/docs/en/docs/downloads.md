---
title: Download Ameow
description: Pick the right Ameow release asset and understand which Windows, macOS, and browser-extension files fit your setup.
---

Ameow releases are published on GitHub Releases. For most users, the job is simple: open the latest stable release and download the file that matches your platform. Do not download the source archives. Files named `Source code` are repository snapshots, not runnable Ameow builds.

[Screenshot: GitHub Releases assets list with Installer, Portable, DMG, and browser_extension zip highlighted]

## Fastest choice

| Your environment | Download this first | Best for | What to do next |
| --- | --- | --- | --- |
| Windows daily use | `Ameow_<version>_windows_x64_installer.exe` or similar Installer EXE | Most Windows users | Run the installer, then launch Ameow from the Start menu or desktop |
| Windows quick trial or portable tools folder | `Ameow_<version>_windows_x64_portable.zip` or similar Portable ZIP | Users who do not want a system install | Extract the ZIP, then run Ameow from the extracted folder |
| macOS Apple Silicon | `Ameow_<version>_macos_arm64_installer.dmg` or similar Apple Silicon DMG | M-series Mac users | Open the DMG and drag `Ameow.app` into `Applications` |
| Browser extension | `Ameow_<version>_browser_extension.zip` | Users who want page-to-desktop download handoff | Extract the zip and load it with `Load unpacked` in Chrome or Edge |

[Diagram: choosing between Windows Installer, Portable ZIP, macOS DMG, and browser extension zip]

## Download steps

1. Open [the latest release](https://github.com/Wutpeach/Ameow/releases/latest).
2. Find the `Assets` section.
3. Choose the file that matches your platform from the table above.
4. Keep the installer or zip until you confirm Ameow launches correctly.
5. If you also want the browser extension, download the matching `browser_extension.zip` from the same release.

You should end up with a platform installer, portable package, or DMG, not a source tree. If your browser downloaded a `.zip`, make sure it is the `portable` package or the `browser_extension` package, not `Source code.zip`.

## Windows Installer or Portable ZIP?

Choose the Installer EXE by default. It fits long-term daily use and behaves like a normal desktop-app install.

Choose the Portable ZIP when:

- you only want to try Ameow quickly;
- you want Ameow in a fixed tools directory;
- you do not want a system install state;
- you need to move the app between work directories.

Portable ZIP builds must be fully extracted first. Do not run Ameow from the archive preview window, or the app may fail to access bundled files.

## How do I launch it on macOS?

The current macOS build targets Apple Silicon, meaning M-series Macs. After downloading the DMG:

1. Open the DMG.
2. Drag `Ameow.app` into `Applications`.
3. Launch Ameow from `Applications`.
4. If macOS warns about the developer identity, right-click `Ameow.app` and choose `Open`.

If that still fails, follow the [First Launch on macOS](../troubleshooting/macos-first-run/) guide. Most users do not need to compile the app themselves.

## Do I need the browser extension?

No. You can start with the desktop floating window alone if you only drag local files, organize folders, or paste ordinary links.

Install the extension when:

- you want to send tasks directly from sites like YouTube, Bilibili, X / Twitter, Douyin, or Xiaohongshu;
- the content needs browser login state or cookies;
- you want browser-side quality preferences to flow into the desktop app.

The extension zip must be extracted before loading. Do not drag the zip into the browser directly. Full steps are in [Install the Extension](../extension/install/).

## Stable release or prerelease?

Most users should choose the latest stable release. Prereleases are usually for validating packaging, platform fixes, or new download behavior and may still change.

If you are helping with testing, read the prerelease notes in [Release Notes](../releases/) first so you know what the build is trying to validate. For normal use, return to the latest stable release.
