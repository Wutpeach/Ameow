---
title: Extension Disconnected
description: Troubleshoot the Ameow browser extension when it shows Disconnected, cannot send tasks, or page actions stop responding.
---

When the extension shows `Disconnected`, it means the browser extension is not linked to the Ameow desktop app on this machine. The most common causes are: the desktop app is not running, the extension needs to be reloaded, or local communication is blocked by system policy.

[Screenshot: extension popup showing Disconnected and prompting for the desktop app]

## Quick checks first

Answer these before going deeper:

- Can you see the Ameow floating window on the desktop?
- Does the extension popup open normally?
- Did you just install or update the extension?
- Is the machine running a firewall, security tool, or managed browser policy?

## Branch A: the desktop app is not running

1. Launch the Ameow desktop app.
2. Confirm the floating window is visible.
3. Reopen the extension popup.
4. Wait for the status to become `Connected`.

Success state: the popup shows `Connected`.

## Branch B: the desktop app is running, but it still says Disconnected

Try this order:

1. close the popup and open it again;
2. reload the Ameow extension in the extension manager;
3. quit and relaunch the Ameow desktop app;
4. reopen the popup again.

If you just updated the extension or the desktop app, reload plus restart is often enough.

## Branch C: the popup is broken or does not render

That usually means the extension itself did not load correctly:

1. open `chrome://extensions` or `edge://extensions`;
2. confirm the Ameow extension is enabled;
3. if the browser reports a manifest or directory error, reload the extracted extension directory;
4. do not choose the zip file itself.

## Branch D: local communication is blocked

The extension connects to the local address `127.0.0.1:39527`. If a firewall, security tool, or enterprise policy blocks that connection, the extension may remain disconnected.

Try:

- temporarily disabling the relevant block and testing again;
- adding Ameow to the allow list;
- confirming whether the browser on a managed machine allows local extension-to-app communication.

## Connected again, but downloads still fail

If the extension is back to `Connected`, the problem is usually no longer the connection. Move on to site support, login state, link validity, or output-folder permissions.
