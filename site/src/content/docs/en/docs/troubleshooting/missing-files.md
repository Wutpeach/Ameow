---
title: Missing files
description: Missing files
---

Confirm the task is complete rather than still downloading or processing. Open the output folder in settings; if it changed after submission, check the original folder.

A moved folder, changed permissions, or insufficient space may cause failure; check the queue message and diagnostics. The app will not silently choose another folder. After fixing the issue, change the folder and submit a new task; manual retry of a failed task still uses the original folder. Current Rust does not provide historical local file collection.

## Check in order

1. Check the queue and wait for downloading and postprocessing to finish; failure or cancellation does not establish that a file was saved.
2. Open the output folder from settings and check whether it changed after submission.
3. Inspect the submission-time folder in your file manager; confirm it exists and your account can access it.
4. Read any failure message and check free space. To use another folder, change it in settings and submit a new task.

Do not clear `%LOCALAPPDATA%\Ameow` to look for files; it holds settings and runtime data.
