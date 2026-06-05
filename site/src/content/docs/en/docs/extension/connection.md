---
title: Connect to the Desktop App
description: Connect the browser extension to a running Ameow desktop app and understand the Connected and Disconnected states.
---

The browser extension must connect to the Ameow desktop app before it can send tasks. The most important states in the popup are `Connected` and `Disconnected`.

[Screenshot: extension popup changing from Disconnected to Connected]

## Shortest connection path

1. Launch the Ameow desktop app.
2. Confirm the floating window is visible near the desktop edge.
3. Open the browser extension popup.
4. Wait a few seconds and confirm the status becomes `Connected`.
5. Open a supported page and try sending a task.

Success state: the popup shows `Connected` and the desktop app is still running. Tasks sent from the page should now enter the Ameow download flow.

## State meanings

| State | Meaning | What you should do |
| --- | --- | --- |
| `Connected` | The extension is linked to the Ameow desktop app on this machine | You can send tasks from the page |
| `Disconnected` | The extension is not linked to the desktop app | Launch or restart Ameow, then reopen the popup |
| No status or broken popup | The extension itself may not be loaded correctly | Reload the extension in the browser |

The extension connects to the local address `127.0.0.1:39527`. This is a local communication channel between the browser and desktop app.

## If it stays Disconnected

Check in this order:

1. confirm the Ameow desktop app is actually running, not just installed;
2. confirm the floating window is visible;
3. close the popup and reopen it;
4. reload the Ameow extension in the browser's extension manager;
5. quit and restart the Ameow desktop app;
6. check whether a firewall, security tool, or browser-management policy is blocking local connections.

After that, the popup should switch to `Connected`. If the status recovers but tasks still fail, move on to download troubleshooting instead of reinstalling the extension repeatedly.

## Connected, but the task still does not enter the desktop app

That is usually not a connection problem anymore. Check:

- whether the current page type is supported;
- whether the content needs login, paid access, region access, or age verification;
- whether the page finished loading;
- whether you triggered the action on the correct video, image, or content page.

If the page needs login state, stay logged in and retry. For more on that, see [Cookies and Login State](../cookies-and-login/).
