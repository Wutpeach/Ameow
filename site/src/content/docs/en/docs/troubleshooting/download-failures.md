---
title: Download Failures
description: Troubleshoot Ameow downloads by splitting the problem into no task, stuck preparing, failed task, or missing final file.
---

Do not start a failed download investigation by retrying over and over. First decide where the task stopped, then follow the branch that matches that stage. The most common causes are: invalid links, unwritable output folders, missing login state, disconnected extension, or a first-run runtime still preparing.

This page has four main branches: **no task, stuck in `Preparing`, explicit failure, and `Done` but missing file.** Classify the symptom first, then act.

[Diagram: decision tree for no task, preparing forever, explicit failure, and done-but-missing-file]

## 30-second checks first

Answer these four questions:

1. Did a task appear in Ameow after you pasted or sent the link?
2. Is it stuck in `Preparing`, or did it already fail?
3. Can the link open and play in the browser?
4. Can the current output folder be written to?

If you already know which stage is failing, jump to the matching branch below. Avoid changing quality, output folder, extension install, and app version all at once, or it becomes hard to know which change fixed the issue.

## Branch A: no task appears at all

This usually means Ameow never received the link, or the link was not recognized.

Check in this order:

1. confirm the Ameow desktop app is running and the floating window is visible;
2. copy the link again and make sure the clipboard contains the full URL;
3. click the Ameow floating window or make sure it can receive input, then press `Ctrl+V`, or `Cmd+V` on macOS;
4. if you are sending from the extension, confirm the popup shows `Connected`;
5. test with a public link so you rule out the current link itself.

After this, you should at least see the task enter waiting, preparing, or downloading. If nothing appears, prioritize extension connection and link format.

## Branch B: the task stays in Preparing

`Preparing` usually means Ameow is resolving the link, reading page metadata, preparing a download runtime, or waiting for a dependency to become ready.

Check in this order:

1. wait a short while first, especially on first use of a download path;
2. confirm the network can reach the site;
3. if the content needs login state, stay logged in and send it through the extension;
4. if the site recently changed, check the latest stable release or Release Notes for site-rule updates;
5. restart Ameow and resend the same link.

If several sites all stay in `Preparing`, the problem may be runtime preparation rather than one site. See [Download Runtimes and Automatic Preparation](../../advanced/download-dependencies/) for background, but the action path here is still: wait, restart, test a public link, and update to the latest stable release.

## Branch C: the task explicitly fails

[Screenshot: queue entry showing a failed state and an error area]

Look at where the failure is happening:

### The link does not open

Open it in the browser. If the browser cannot open it either, Ameow cannot download it. Get a valid link first.

### The page opens, but it needs login

Log in to the site in the browser first, then send the task through the Ameow extension. Pasting only the URL may not give the desktop app enough session context.

### The popup shows a resource, but it cannot preview or download

First check whether the row has a `[Desktop]` badge. Badged resources are usually not complete files that the browser can save directly. Common examples include `m3u8`, `mpd`, `.cmfv`, `.m4s`, `ts`, `blob:` URLs, separate audio/video tracks, or resources that need login state.

These resources need the desktop app to resolve the page, choose tracks, merge, transcode, or use login state. Confirm the desktop app is connected and send the task from the actual content page. If it still fails while connected, continue with site support, login state, proxy environment, and page-type checks.

### YouTube plays in the browser, but Ameow still fails

This is often not a bad link. It is often a proxy-environment mismatch:

- the browser is going through one proxy path, but the desktop download path is not;
- the proxy tool only handles the browser and not Ameow or its downloader subprocesses;
- domestic sites such as Bilibili still work, but YouTube exposes the proxy mismatch immediately as format-probe failures, explicit failures, or a task stuck in `Preparing`.

The first recommendation is still to let your proxy tool own network routing, because the browser, Ameow, pip, and yt-dlp / gallery-dl may contact different hosts. TUN, global, VPN, or system-proxy takeover mode is usually the easiest way to keep the path consistent.

Ameow also has a low-interaction manual proxy setting: open **Settings → System & Support → Network proxy**, choose **Manual proxy**, and enter an HTTP(S) proxy without credentials or paths, such as `http://127.0.0.1:7890`. Once the format is valid, Ameow saves and applies it automatically. Ameow checks fixed infrastructure targets such as GitHub, Deno, and PyPI. If the manual proxy is unavailable, Ameow automatically falls back to system proxy behavior.

Do not use the proxy setting as a test box for a failed video URL. A single content URL can fail because of login state, region limits, account access, anti-bot checks, or site-rule changes, not only because of proxy routing.

Try this order:

1. confirm the specific YouTube video page plays normally in the browser;
2. send the task from that actual video page, not from the homepage, search page, or recommendation feed;
3. if you are using a proxy tool, switch it to TUN, global, VPN, or system-proxy takeover mode;
4. if system proxy mode does not cover Ameow or its downloader subprocesses, configure the manual HTTP(S) proxy in Settings;
5. retry with a public YouTube video that does not require login;
6. if Highest quality fails, switch to Balanced first and confirm the path recovers.

If the problem improves once your proxy tool takes over globally or the manual HTTP(S) proxy becomes active, the failure point is usually the proxy environment rather than the link itself.

### The site is outside the current support range

Ameow does not promise every page on the web. Current focus sites include YouTube, Bilibili, X / Twitter, Douyin, and Xiaohongshu. Other sites may work, but support can change over time.

### The output folder is not writable

Open the current output folder and try creating a temporary file there. If that fails, pick another folder that your account can write to and retry the download.

### The quality or format choice is too aggressive

Highest quality may trigger more complex probing, track selection, merging, or conversion. If that keeps failing, switch to a steadier quality preference first and confirm the link itself works.

## Branch D: it says Done, but the file is missing

That is usually not a download failure anymore. It is usually a file-location mistake.

1. Open the current output folder from Ameow.
2. Check whether you previously dropped a folder and changed the output folder.
3. Check whether rename rules changed the final filename.
4. Sort by modified time and inspect the newest files.

If nothing is there, go back and confirm the task really says `Done` and is not still converting.

## When should I update the app?

Update to the latest stable release when:

- the same site suddenly starts failing across many links;
- the Release Notes mention fixes for that site, extension connection, quality selection, or packaging;
- you are currently on a prerelease build and want the stable path again;
- the problem only reproduces on an older version.

Before updating, note the current version, site, link type, and task state. That makes later bug reports much easier to debug. After updating, retry with the same public link once so you can see whether the behavior changed.
