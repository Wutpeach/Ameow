---
title: Getting Started
description: Go from download to first launch, first file drop, first pasted link, and first output-folder check in Ameow.
---

This guide takes you through the shortest working path in Ameow: download the app, launch the floating window, drop in one file, paste one link, and find the result in the output folder. When you finish, you will understand the core workflow.

## Before you start

You need:

- a Windows PC or an Apple Silicon Mac;
- one local test file, such as an image or text file on your desktop;
- one test web link. For the first run, use a public page instead of members-only, region-locked, or login-required content.

If you have not downloaded the app yet, start at [Download Ameow](../downloads/).

## 1. Install and launch Ameow

### Windows

1. Download the Installer EXE and run it.
2. If you chose the Portable ZIP, extract it fully first, then run Ameow from the extracted folder.
3. After launch, a small floating window appears near the edge of the desktop.

For later app updates, installed builds continue to open the installer. Portable builds prefer the new Portable ZIP and replace the current portable folder after restart. If the portable folder is not writable or the update metadata is incomplete, download the Portable ZIP from the release page and replace the folder manually.

### macOS

1. Open the DMG.
2. Drag `Ameow.app` into `Applications`.
3. Launch it from `Applications`.
4. If the system blocks it, right-click `Ameow.app` and choose `Open`.

[Screenshot: Ameow floating window in its first-launch idle state near the desktop edge]

Success state: you should see a small always-available window near the desktop edge. This is the main input surface for files, folders, and links.

## 2. Drop in a local file

1. Select a test file in Explorer, Finder, or on the desktop.
2. Drag it onto the Ameow floating window.
3. Release the pointer.

[Screenshot: dropping a local file onto the Ameow floating window]

Success state:

- Ameow accepts the file.
- The file is copied into the current output folder.
- The original file stays in its original location.

If you drop a folder instead, the behavior is different: Ameow changes the output folder instead of copying the whole folder. That difference matters in daily use.

## 3. Paste a link

1. Copy an image link, video link, or supported page URL in the browser.
2. Return to Ameow.
3. Press `Ctrl+V`, or `Cmd+V` on macOS.
4. Watch the task feedback in the window.

Success state:

- if the link is supported, Ameow creates a download or preparation task;
- if the page needs media extraction, the task may show `Preparing` first;
- if the link is unsupported or invalid, the task can fail and needs another link or the browser extension.

For the first test, avoid content that needs login state, paid access, or region access. Validate the basic flow with a public link first.

## 4. Open the output folder

The default output folder is:

```text
Desktop/Ameow_Received
```

You can also open the current output folder directly from Ameow:

1. Double-click an empty area of the floating window, or right-click the window.
2. Choose the option to open the current output folder.
3. Find the file you just copied or downloaded.

[Screenshot: the output folder showing the file that was just collected]

Success state: you should see the test file in the output folder. If you previously dropped a folder into Ameow, the current output folder may already be that folder, so trust "open current output folder" over your memory of the default path.

## 5. Install the browser extension

The desktop app works on its own. The browser extension is an optional upgrade for sending page tasks, page context, and login state into Ameow.

Install it when:

- you mainly download web video;
- some sites need login state or cookies;
- you want to trigger Ameow directly from the page.

Shortest path:

1. Download the matching `Ameow_<version>_browser_extension.zip`.
2. Extract the zip.
3. Open Chrome or Edge extension management and turn on Developer Mode.
4. Click `Load unpacked` and choose the extracted extension folder.
5. Launch Ameow, then open the extension popup and confirm it shows `Connected`.

## Common first-run failures

### I do not see the floating window

Confirm Ameow really launched. On Windows, reopen it from the Start menu. On macOS, confirm the app is in `Applications`. If macOS blocks launch, use the right-click `Open` flow or allow it in system settings.

### I dropped a file but cannot find it

Open the current output folder from Ameow. Do not rely only on the default path, because dropping a folder changes the current output folder.

### I pasted a link and nothing happened

First confirm the link opens in the browser. If the content needs login state, send it through the browser extension instead. If it still fails, continue with [Download Failures](../troubleshooting/download-failures/).

## Next steps

Once your first test works, continue with:

- [Core Concepts](../concepts/): understand how the floating window, output folder, and queue work together.
- [Output Folder](../desktop/output-folder/): avoid losing track of saved files.
- [Browser Extension](../browser-extension/): send web content straight to the desktop app.
