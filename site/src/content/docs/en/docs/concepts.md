---
title: Concepts
description: Concepts
---

The compact window expands to a full window. After submitting a link, wait for the queue to show completion before opening the file. Each task retains its quality and output folder at submission; changes affect new tasks. At most three tasks occupy execution slots; the rest wait. The queue is session-only. Retry retains the original settings; see [links and queue](../desktop/links-and-queue/) for task behavior.

The app prepares and verifies components; version selection requires confirmation. The old browser extension, session import, and local file collection are unavailable in current Rust. See [links and queue](../desktop/links-and-queue/) and [download components](../advanced/download-dependencies/).

## The boundary of a task

The submitted link, quality, and folder form a task's intent. Changing settings does not alter a queued task; submit a new task to use a new folder. Retrying a failure retains the original intent.

Hiding changes window visibility and tasks continue; quitting is an application lifecycle action that requires confirmation and cleanup for active tasks. Component preparation is distinct from task execution: a preparation failure does not mean a video file was downloaded.
