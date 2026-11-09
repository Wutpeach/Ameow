---
title: Download components
description: Download components
---

Initial preparation of managed components may need network access. Components management can manually query stable yt-dlp versions on PyPI; discovery does not switch versions, and selection starts after user confirmation.

The application verifies the official signature, hash, and actual version, activating only when verified and safe. A healthy old component remains while tasks hold it. Failure preserves the previous selection and never treats an unverified component as usable.

Offline recovery requires a healthy cache with signed proof; older caches without proof need online bootstrap. Restore connectivity and explicitly retry in components management on failure; see [download failures](../../troubleshooting/download-failures/). Component updates are not app auto-updates.

## Component roles

| Component | Purpose |
| --- | --- |
| yt-dlp | Resolves supported videos and downloads media. |
| gallery-dl | Resolves and downloads supported images and gallery media. |
| Deno | Provides the JavaScript runtime needed by the downloader. |
| FFmpeg | Processes or merges media. |
| ffprobe | Inspects output media. |

## Check, select, and recover

1. In components management, manually check available stable versions, review the result, and explicitly confirm a selection.
2. The app verifies the official signature, hash, and actual version. After verification it waits for tasks holding the old version and activates when safe.
3. If discovery, verification, or preparation fails, the current choice is retained. Explicitly retry, or confirm restoring the recommended version as prompted; a healthy cache with signed proof can recover offline.
4. An older cache without proof needs online bootstrap. Do not replace a cached executable with an arbitrary EXE or delete existing app data to troubleshoot.

The previous healthy version remains protected until selection or recovery completes. Restoring network access does not itself confirm a switch; follow the app's confirmation.
