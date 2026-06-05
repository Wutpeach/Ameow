---
title: Install the Extension
description: Load the Ameow browser extension in Chrome or Edge and confirm the installation finished correctly.
---

The Ameow browser extension is usually installed from the zip package attached to GitHub Releases. Extract it first, then use `Load unpacked` in the browser's extension manager.

## Before you start

You need:

- Chrome, Edge, or another Chromium browser that supports Manifest V3;
- the downloaded `Ameow_<version>_browser_extension.zip`;
- the matching Ameow desktop app installed or ready to launch.

Keeping the extension version aligned with the desktop app version is recommended. A mismatch can leave newer features unavailable or confusing.

## Installation steps

1. Open [GitHub Releases](https://github.com/Wutpeach/Ameow/releases).
2. Download the current `Ameow_<version>_browser_extension.zip`.
3. Extract the zip locally.
4. Open the Chrome or Edge extension management page.
5. Turn on Developer Mode.
6. Click `Load unpacked`.
7. Select the extracted Ameow extension directory.
8. Confirm Ameow appears in the extension list.

[Screenshot: Chrome extensions page with Developer Mode enabled and Load unpacked visible]

[Screenshot: selecting the extracted Ameow extension directory instead of the zip file]

Success state: the extension list shows Ameow and the browser does not report manifest, permission, or directory errors.

## The easiest mistake when selecting a folder

Choose the extracted extension directory. Do not choose:

- the original zip file;
- an empty parent directory above the extracted extension;
- the Ameow desktop app install folder;
- the repository root.

If the browser says it cannot find the manifest, the chosen directory is almost always wrong. Pick the folder that actually contains the extension manifest.

## Chrome and Edge entry points

Chrome:

```text
chrome://extensions
```

Edge:

```text
edge://extensions
```

Open the page, turn on Developer Mode, and load the extracted extension directory.

## Check the connection immediately after install

1. Launch the Ameow desktop app.
2. Click the Ameow extension icon in the browser toolbar.
3. Check the popup status.

If it shows `Connected`, both installation and connection are working. If it shows `Disconnected`, the extension is installed but not linked to the desktop app yet. Continue with [Connect to the Desktop App](../connection/).

## Pin it to the toolbar

After installation, pinning the extension to the toolbar is recommended. That keeps the popup one click away when you hit downloadable content on the page.

If the icon is hidden:

1. click the browser's extensions button;
2. find Ameow;
3. choose the pin or toolbar option.

## Updating the extension

When you update the Ameow desktop app, update the extension to the matching version too:

1. download the new `browser_extension.zip`;
2. extract it into a new folder or replace the old extracted folder;
3. return to the extension manager;
4. click the Ameow reload button;
5. open the popup and confirm the status.

If you move or delete the extracted folder, the browser may stop loading the extension. Keep the extracted extension in a stable location instead of a temporary downloads folder.
