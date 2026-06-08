---
title: Links and Download Queue
description: Understand Ameow's queue states, concurrency, conversion steps, and failure handling after you paste a link or send a page task.
---

When you paste a web link or send a task from the browser extension, Ameow places supported jobs into the download queue. The queue handles ordering, downloading, conversion, and final save behavior.

The queue is not just progress display. Use it to choose the next step: no task means check input and extension connection, long `Preparing` means check network or login state, and `Done` means open the output folder.

[Screenshot: download queue showing waiting, downloading, converting, and done states]

## Create a download task

1. Copy an image link, video link, or supported page URL.
2. Return to the Ameow floating window.
3. Press `Ctrl+V`, or `Cmd+V` on macOS.
4. Watch for a task state in the window.

If the link comes from a site that needs login state, sending it from the browser extension is more reliable than copying only the URL.

## Queue state meanings

| State | What it means | What you should do |
| --- | --- | --- |
| Waiting | The task is queued and waiting for a slot | Usually nothing |
| Preparing | Ameow is resolving the link, checking formats, or preparing runtimes | Wait first; investigate only if it stays here too long |
| Downloading | File transfer is in progress | Keep the network stable and avoid moving the output folder |
| Converting | Ameow is merging or converting the result | Wait for the final result before using the file |
| Done | The file has been written to the output folder | Open the output folder and use it |
| Failed | The task did not finish | Troubleshoot by the failure type |

## Concurrent downloads

Ameow limits how many tasks download at the same time so it does not consume all network and system resources at once. You can send multiple links in a row and let the queue schedule them as slots free up.

If a task sits in `Waiting`, first check whether other tasks are already downloading or converting.

## Why is the file still unusable during conversion?

Web platforms often split audio and video or serve higher-quality formats in separate tracks. Ameow may need to merge or convert them after the download finishes. Until conversion ends, the temporary file in the output folder may not be the final result.

Success state: wait until the task shows `Done`, then open the output folder and use the final file.

## Where should I look first after a failure?

First decide which kind of failure you have:

- the task never appeared: the link was not received or the extension was not connected;
- the task stays in `Preparing`: network, site rules, login state, or runtime preparation may be involved;
- the task explicitly failed: check the link, site support, output-folder permissions, and login state;
- it says `Done` but the file is missing: treat it as an output-folder problem first.

For the full path, continue to [Download Failures](../../troubleshooting/download-failures/).
