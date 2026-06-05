---
title: Troubleshooting
description: Quickly narrow Ameow issues down to launch problems, extension connection, failed downloads, or file-location mistakes.
---

When something goes wrong, first decide which symptom category you are looking at. Do not start by reinstalling the app or repeating the same download. Confirm the current state first and the cause is usually easier to isolate.

## 30-second routing

| Symptom | First thing to judge | Go here |
| --- | --- | --- |
| macOS says the app cannot be opened or the developer cannot be verified | Is the app already in `Applications`? Did you try right-click `Open`? | [First Launch on macOS](./macos-first-run/) |
| The browser extension shows `Disconnected` | Is the desktop app running? Does the extension need a reload? | [Extension Disconnected](./extension-disconnected/) |
| Pasting a link creates no task, stays in `Preparing`, or fails | Which stage is it stuck in? Can the link open and can the output folder be written? | [Download Failures](./download-failures/) |
| The task says done but you cannot find the file | Did the output folder change? Did the task really finish? | [Missing Files](./missing-files/) |

## If it is a launch problem

On macOS, follow this order: move the app into `Applications` -> right-click `Open` -> allow it in system settings -> use the quarantine command only at the end.

On Windows, first confirm you downloaded the Installer EXE or Portable ZIP, not a source archive.

## If it is an extension problem

The extension must connect to a running desktop app. Launch Ameow, confirm the floating window is visible, then reopen the popup. `Connected` is the state that means page tasks can be sent.

If the extension is connected but the task still fails, the problem usually moves into site support, login state, link validity, or output-folder permissions.

## If it is a download problem

First check the task state:

- no task at all: the link was not received or the extension was not connected;
- keeps preparing: network, runtimes, login state, or site rules may be involved;
- explicit failure: inspect the link, site support, and output-folder access;
- done but missing file: move to file-location troubleshooting.

## If it is a file-location problem

Open the current output folder from Ameow. Do not trust only the default `Desktop/Ameow_Received`, because dropping a folder changes the current output folder.

## Not sure where to start?

Start with the [FAQ](../faq/). It covers the most common user-facing issues with short, practical answers.
