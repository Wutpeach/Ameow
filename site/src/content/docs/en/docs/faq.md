---
title: FAQ
description: Quick answers to common Ameow questions about downloads, first launch, output folders, the browser extension, and failed tasks.
---

Use this page for the fastest answers to the most common questions. Each answer starts with a practical action you can take right now. If you need the full background, follow the linked page afterward.

## Which file should I download?

Most Windows users should pick the Installer EXE. Use the Portable ZIP if you only want to try Ameow quickly or keep it in a tools folder. M-series Mac users should download the macOS Apple Silicon / arm64 DMG. The browser extension is a separate `browser_extension.zip`.

Do not download `Source code.zip` or `Source code.tar.gz`. Those are source archives, not runnable builds.

Read more: [Download Ameow](../downloads/).

## What if macOS blocks the app on first launch?

This is common with unsigned DMG builds. Recommended order:

1. Confirm `Ameow.app` is already in `Applications`.
2. Right-click `Ameow.app` in `Applications` and choose `Open`.
3. If that still fails, go to `System Settings > Privacy & Security` and allow the app there.
4. Only after that should you use the quarantine-removal command:

```bash
xattr -dr com.apple.quarantine "/Applications/Ameow.app"
```

Read more: [First Launch on macOS](../troubleshooting/macos-first-run/).

## Where did my file go after I dropped it into Ameow?

Files are copied into the current output folder. The default is:

```text
Desktop/Ameow_Received
```

But if you have ever dropped a folder into Ameow, the current output folder may already be different. The safest method is to open the current output folder from Ameow instead of guessing the default path.

Read more: [Output Folder](../desktop/output-folder/) and [Missing Files](../troubleshooting/missing-files/).

## Why did dropping a folder not copy the whole folder?

Dropping a file and dropping a folder mean different things:

- drop a file: copy the file into the current output folder;
- drop a folder: make that folder the new output folder.

That behavior is intentional so you can switch where future assets go with one gesture. If you want files inside a folder, open the folder and drop the files instead.

## I pasted a link and the download did not start. What should I check?

Run through these four checks first:

1. Can the link open in the browser?
2. Does the content require login, paid access, region access, or age verification?
3. Is the current output folder writable?
4. Is the site or page type within the current support range?

If the link comes from a login-required site, install the browser extension and send the task from the page. That gives Ameow a better chance to reuse the authorized page context.

Read more: [Download Failures](../troubleshooting/download-failures/).

## The browser extension says Disconnected. What should I do?

Start the Ameow desktop app first, then open the extension popup again. The extension depends on a local connection, so it always shows disconnected if the desktop app is not running.

If the desktop app is already running:

1. Close and reopen the popup.
2. Reload the Ameow extension in the browser's extension manager.
3. Restart the Ameow desktop app.
4. Check whether a firewall or security tool is blocking `127.0.0.1:39527`.

Read more: [Extension Disconnected](../troubleshooting/extension-disconnected/).

## Which sites are currently supported?

The public docs currently call out YouTube, Bilibili, X / Twitter, Douyin, and Xiaohongshu as major focus sites. Support changes over time, and member-only, private, age-restricted, or region-restricted content may still fail on those sites.

Before you judge site support, make sure you are testing on a specific content page, not on the homepage, search results, a recommendation feed, a profile page, or a collection page. Many failures come from pages that mix multiple previews and side-content resources together.

Read more: [Supported Sites](../extension/supported-sites/).

## YouTube plays in the browser, but Ameow still fails. What now?

Do not start by tweaking Ameow. Check the proxy environment first.

This often happens when:

- the browser is using a proxy path that the desktop download flow is not using;
- the proxy tool only handles the browser and not Ameow or its download subprocesses;
- you are testing on the homepage, search page, or a recommendation feed instead of the actual video page.

Recommended order:

1. Open the specific YouTube video page and confirm it plays normally.
2. Send the task from the extension while staying on that video page.
3. Let your proxy tool use TUN, global, VPN, or system-proxy takeover mode and retry.
4. Validate the path with a public video and balanced quality first.

The current product direction is to rely on the user's own proxy tooling instead of maintaining a separate in-app proxy system.

## When do I actually need the browser extension?

If you only drag local files, organize folders, or paste ordinary public links, you can start without it.

Typical cases where the extension helps:

- web video needs login state or cookies;
- the page has a dedicated in-page send/download entry;
- you want to send the current content page straight to the desktop app;
- you want browser-side quality preferences to carry over.

If you plan to use the popup's "current page media" list, enter the actual video, post, work, or detail page first. Do not expect a homepage, search page, recommendation feed, or listing page to contain only the one resource you care about.

## Where do I check version changes?

The in-site [Release Notes](../releases/) page tracks stable and prerelease history. Most users should look at stable releases first. Testers can check prerelease notes for build-specific validation goals.
