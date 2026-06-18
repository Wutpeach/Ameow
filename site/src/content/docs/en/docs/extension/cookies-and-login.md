---
title: Cookies and Login State
description: Understand why some downloads need browser login state and how the Ameow extension helps the desktop app use that context.
---

Some web content is not a public direct link. The fact that the browser can play it does not mean the desktop app can download it from the URL alone. A site may require login state, cookies, paid access, age verification, or region access. The browser extension helps Ameow reuse the browser session that already has access.

When "it plays in the browser but fails in Ameow," validate this path first: logged in browser, actual content page open, extension `Connected`, task sent through the extension.

## When is login state needed?

Common cases:

- the page can only be viewed after login;
- the content is members-only, age-restricted, or region-restricted;
- the same link plays in the browser but fails when pasted into the desktop app;
- the site returns different media URLs based on the active browser session.

In those cases, send the task through the extension.

## What should the user do?

1. Log in to the site in the browser.
2. Open the actual content page and confirm it plays or displays normally.
3. Confirm the extension popup shows `Connected`.
4. Send the task from the popup or page entry point.
5. Watch the queue state in the desktop app.

Success state: the task reaches preparing, downloading, or done instead of failing immediately with an access-related error.

## What are cookies used for here?

Cookies prove that the current browser session is allowed to access the content. Ameow's goal is to let the desktop app reuse that access state as part of the download flow.

The docs will not ask you to copy raw cookie strings manually, and you should not send cookies to untrusted tools or other people. Prefer letting the extension pass the needed context locally between the browser and desktop app.

Site cookies saved by Ameow are written only to the app data directory on your computer. They are used later by `yt-dlp` or `gallery-dl` for downloads from the same site. Ameow does not upload cookie or login-state content.

## Download-Time Login-State Sync

The desktop main window may show a blue login-state discovery dot. If you enable it, Ameow does not sync every known site immediately. It only tries to sync cookies for the matching site when you start a download, using the connected browser extension, and saves that site snapshot locally.

For example, a Bilibili download can trigger Bilibili cookie sync. A later YouTube download can trigger YouTube cookie sync. If sync fails, the extension is disconnected, or the short wait times out, Ameow continues the normal download attempt.

Saved site login states can be reviewed, refreshed, or cleared from the desktop Settings page under Site login states.

## Do Douyin videos need login state?

Public Douyin videos can usually be downloaded by pasting the video link or short link directly, including `v.douyin.com` short links and `jingxuan?modal_id=...` page links. Ameow handles Douyin videos through the general `yt-dlp` download capability, so there is no separate Douyin downloader runtime to prepare.

If the video plays in the browser but fails when pasted into the desktop app, or if the content needs account access, send the task from the logged-in browser page through the extension.

## Common failures

### I am logged in, but it still fails

Make sure you are sending the actual content page, not the homepage, a list page, or search results. Reopen the specific page and retry from there.

### The extension is not connected

Login state cannot help if the extension is disconnected. Get it back to `Connected` first.

### The content itself is restricted

Paid, region-restricted, age-restricted, or private content may still fail. Ameow only works within the range where the user has access and the site is currently supported.

### The site changed

If the same site suddenly starts failing across many pages, the site structure may have changed. Update to the latest stable release and check whether the Release Notes mention a fix.
