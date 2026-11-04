---
title: Links and queue
description: Links and queue
---

Paste a public single-video link: YouTube watch, youtu.be, shorts, embed, and live; Bilibili BV, av, and b23.tv, including a single specified part. Playlist and collection parameters are rejected. Site changes and permissions may still cause failure.

At most three tasks occupy execution slots; others wait. A task captures quality and folder at submission. You can cancel it; manual retry after final failure creates a new task with the original settings. Internal recovery remains in the same task. The queue is not restored after restart; failed-task diagnostics can be copied. The old extension, cookies, and browser-session import are unavailable. See [download failures](../../troubleshooting/download-failures/).

## Queue states

| State | Meaning and action |
| --- | --- |
| Queued | Waiting for an execution slot; cancellation is available. |
| Preparing | Preparing required components; wait or read the prompt. |
| Downloading | Fetching media; a percentage may be unavailable. |
| Postprocessing | Processing the result; wait for completion before opening it. |
| Completed | Saved; open the folder selected at submission. |
| Failed | Read the message, copy diagnostics, or manually retry. |
| Cancelled | The task was cancelled; submit again if needed. |

Submitting the same unfinished video again is rejected and does not alter the existing task. Clearing history does not delete saved files; queue history lasts only for the session. Retry creates a new task using the original link, quality, and folder.
