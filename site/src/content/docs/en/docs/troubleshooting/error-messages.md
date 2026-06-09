---
title: Error Messages and Error Codes
description: Troubleshoot Ameow issues by matching the message, task state, or download error code you see.
---

When you hit an error, keep the full message. Some parts of Ameow show user-readable error text, while logs or bug reports may include internal error codes. The code helps narrow the direction, but it should be read together with the task state, site, link, and output folder.

Fast rule: **start with the text you can see, use the error code as supporting evidence, then keep the full message when reporting the issue.**

## Start With The Text You See

| Message or keyword | Usually means | First action |
| --- | --- | --- |
| `Disconnected` | The browser extension is not connected to the desktop app | Start Ameow, reload the extension, then see [Extension Disconnected](./extension-disconnected/) |
| `Preparing` never ends | Ameow is resolving the link, preparing a runtime, waiting for network, or waiting for login state | Wait briefly; if several public links behave this way, see [Download Runtimes and Automatic Preparation](../../advanced/download-dependencies/) |
| `cookies`, `login`, `sign in`, `authentication`, `authorization` | The site needs login state or cookies | Log in in the browser, then send the task from the page with the extension |
| `403`, `forbidden` | The site refused access, often because of login state, region, proxy, or site-rule changes | Open the same page in the browser first, then send it from the extension |
| `timeout`, `timed out`, `network`, `fetch failed` | A network request failed or timed out | Check network/proxy takeover and test with a public link |
| `429`, `too many requests`, `rate limit` | The site is rate limiting repeated access | Wait before retrying and avoid repeated immediate retries |
| `yt-dlp exited with code ...` | The downloader process failed; nearby text usually contains the real cause | Look for site, login, proxy, or format details in the same message |
| `produced no final output path` | The downloader finished but did not report a final file | Open the current output folder and check whether conversion or intermediate files are still present |
| `Download cancelled` | The task was cancelled | Send the task again; if it cancels without your action, record the steps |

If the message includes English text from a tool, copy it exactly when reporting a problem. Avoid reducing it to only "download failed".

## What Do Download Error Codes Mean?

These codes are mainly used by the download pipeline, logs, and issue investigation. The app UI may not always show them directly.

| Error code | Meaning | What to do |
| --- | --- | --- |
| `E_ABORTED` | The task was cancelled | Send the task again; if it repeats automatically, record the steps |
| `E_AUTH_REQUIRED` | Login state, cookies, or authorization are required | Log in in the browser and send from the page with the extension |
| `E_INVALID_DOWNLOAD_INPUT` | The input is not a usable download link or is missing required data | Copy the full link again and test with a public link |
| `E_INVALID_INTENT` | The request is incomplete or does not match current rules | Send it again; if it came from the extension, reload the extension first |
| `E_NO_PROVIDER_MATCH` | No available site handler matched this link | Confirm whether the site is supported and test with a public link |
| `E_ENGINE_NOT_FOUND` | The matching download engine could not be found | Restart Ameow; if it persists, update to the latest stable version |
| `E_ENGINE_UNAVAILABLE` | A download engine is temporarily unavailable | Wait for runtime preparation, or see [Download Runtimes and Automatic Preparation](../../advanced/download-dependencies/) |
| `E_ENGINE_REJECTED_INTENT` | One download engine cannot handle this task | Try another quality preference or send from the exact page with the extension |
| `E_DIRECT_SOURCE_REQUIRED` | Ameow needs a more direct media URL or page context | Prefer sending from the current page with the browser extension |
| `E_EXECUTION_FAILED` | A downloader command failed; the useful detail is in the message text | Follow keywords in the same message, such as `403`, `cookies`, or `timeout` |
| `E_INVALID_ENGINE_PLAN` | Ameow could not build a valid download plan | Update to the latest stable version; keep the link and message for reporting |
| `E_NO_ENGINE_SUCCEEDED` | All attempted download paths failed | Test a public link, lower quality, confirm login state, and check proxy routing |
| `E_OUTPUT_NOT_FOUND` | The downloader did not provide a final output file | Open the current output folder and check whether conversion is still running; report the full message if it repeats |

## Common Situations

### Login, Cookie, Or 403 Messages

Open the same page in the browser first and confirm it plays or displays normally. Then use the Ameow browser extension from that page. Pasting only the URL may not give the desktop app enough session context.

### YouTube Plays In The Browser, But Ameow Fails

Suspect a proxy mismatch first. Browser playback does not prove that Ameow and its downloader subprocesses use the same route. Try TUN, global, VPN, or system-proxy takeover mode in your proxy tool, then test with a public video.

### Stuck Preparing Or Runtime Unavailable

On first use of some download paths, Ameow may prepare components such as `yt-dlp`, `gallery-dl`, `ffmpeg`, and `deno`. Wait briefly first. If several public links stay in `Preparing`, restart and update to the latest stable version.

### Done But The File Is Missing

This is usually not an error-code problem. Open the current output folder from Ameow and sort by modified time. Dropping a folder changes the output folder, so the file may not be in the default desktop folder.

## What Should I Include In A Bug Report?

Include as much of this as possible:

1. The full error message or a screenshot with the error code.
2. Ameow version and operating system.
3. Site type, such as YouTube, Bilibili, X / Twitter, Douyin, or Xiaohongshu.
4. Task state: no task, preparing, failed, or done but missing file.
5. Whether you sent it through the browser extension, and whether the extension showed `Connected`.
6. Whether login is required, whether you use a proxy, and whether the output folder is writable.

This is much easier to debug than only saying "download failed".
