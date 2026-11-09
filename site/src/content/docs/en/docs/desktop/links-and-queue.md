---
title: Links and queue
description: Links and queue
---

Paste a public single-video link: YouTube watch, youtu.be, shorts, embed, and live; Bilibili BV, av, and b23.tv, including a single specified part. Playlist and series parameters on these video sites are rejected. Public images and limited generic links can also be attempted; see [supported sites](../../extension/supported-sites/) for scope and limits.

At most three tasks occupy execution slots; others wait. A task captures quality and folder at submission. You can cancel it and retry a failed or partial result when offered. Internal recovery remains in the same task. The queue is not restored after restart; failed-task diagnostics can be copied. The old extension, cookies, and browser-session import are unavailable. See [download failures](../../troubleshooting/download-failures/).

## Queue states

| State | Meaning and action |
| --- | --- |
| Queued | Waiting for an execution slot; cancellation is available. |
| Preparing | Preparing required components; wait or read the prompt. |
| Downloading | Fetching media; a percentage may be unavailable. |
| Postprocessing | Processing the result; wait for completion before opening it. |
| Completed | Saved; open the folder selected at submission. |
| Partial | Some files were saved, but content remains unfinished; retry is available. |
| Failed | Read the message, copy diagnostics, or manually retry. |
| Cancelled | The task was cancelled; submit again if needed. |

Submitting the same unfinished video again is rejected and does not alter the existing task. Clearing history does not delete saved files; queue history lasts only for the session. A failed or partial image task created from a recognized Imgur image or album entry or Bluesky post entry retries in the same task; a gallery retains verified files and attempts the remaining content in the same work folder. Direct image links from those sites may use the generic entry and create a new task on retry; other generic and video links also create a new task with the original link, quality, and folder.
