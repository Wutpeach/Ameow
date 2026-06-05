---
title: First Launch on macOS
description: Handle macOS unsigned-DMG first-launch blocks, developer-verification prompts, and quarantine removal for Ameow.
---

The current macOS build is distributed as an unsigned open-source DMG. On first launch, macOS may say the developer cannot be verified, the app cannot be opened, or the app was downloaded from the internet. That usually reflects system security policy, not a broken install.

[Screenshot: macOS security dialog blocking Ameow on first launch]

## Recommended order

Do these in order. Do not start with terminal commands:

1. Drag `Ameow.app` into `Applications`.
2. Right-click `Ameow.app` in `Applications`.
3. Choose `Open`.
4. If the system prompts again, allow it to open.
5. If that still fails, allow it in system settings.
6. Only then use `xattr` to remove quarantine.

## 1. Confirm you are not running from the DMG

After opening the DMG, drag `Ameow.app` into `Applications`. Do not keep launching it directly from the mounted DMG window.

Success state: `Ameow.app` appears in `Applications` and you launch it from there.

## 2. Use right-click Open

1. Open `Applications`.
2. Find `Ameow.app`.
3. Right-click it, or Control-click it.
4. Choose `Open`.
5. Confirm again in the dialog.

Right-click `Open` is not the same as double-clicking. For unsigned apps, it usually gives you the extra confirmation path you need.

## 3. Allow it in system settings

If right-click `Open` still fails:

1. open `System Settings`;
2. go to `Privacy & Security`;
3. find the security notice that mentions Ameow;
4. click the option to allow or open it anyway;
5. launch Ameow again.

[Screenshot: macOS Privacy & Security showing the allow-anyway option for Ameow]

Success state: Ameow launches and the floating window appears.

## 4. Remove quarantine with a command

If system settings does not show the allow option, or allowing it there still fails, run:

```bash
xattr -dr com.apple.quarantine "/Applications/Ameow.app"
```

Then relaunch Ameow from `Applications`.

Only use this command on the Ameow app you already placed in `Applications`. Do not run it on apps from uncertain sources.

## What if it still will not open?

Check in this order:

1. you downloaded the Apple Silicon / arm64 DMG, not a different platform file;
2. the DMG finished downloading correctly and was not truncated;
3. the app is really in `Applications`;
4. the current macOS account has permission to run it;
5. you are on the latest stable release.

If the Release Notes mention a macOS launch, DMG, or Gatekeeper fix, update to that version or newer first.
