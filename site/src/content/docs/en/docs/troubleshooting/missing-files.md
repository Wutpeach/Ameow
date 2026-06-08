---
title: Missing Files
description: Find completed downloads and copied files by checking the current output folder, folder switches, task state, and rename rules.
---

If you cannot find a file, do not immediately download it again. Ameow saves results to the current output folder, and that folder may already have changed if you dropped another folder into the app.

Fastest action: open the current output folder from Ameow and sort by modified time. Most missing-file cases become clear after that.

[Diagram: trace the file through current output folder, changed folders, and task state]

## Quick checks first

Confirm:

1. the task really shows `Done`;
2. whether you recently dropped a folder into Ameow;
3. whether the current output folder is still the default `Desktop/Ameow_Received`;
4. whether rename rules are enabled.

## Branch A: the task shows Done

1. Double-click an empty area of the Ameow floating window, or right-click it and open the current output folder.
2. Sort by modified time.
3. Inspect the newest files.
4. If the name is not what you expected, search for recently modified media or image files instead of only the original page title.

Success state: you find the newest file in the current output folder. If it is not there, then check whether the folder changed, the task has not finished, or rename rules changed the filename.

## Branch B: you dropped a folder earlier

Dropping a folder changes the output folder. Future files go there instead of the default desktop folder.

Do this:

1. remember which folder you dropped most recently;
2. open the current output folder from Ameow and confirm it;
3. if it is wrong, choose the correct output folder again;
4. run one small test download or file drop afterward.

## Branch C: the task is still downloading or converting

If the task is still waiting, preparing, downloading, or converting, the final file may not exist yet. Wait for the task to finish.

Do not treat temporary files as the final result. During conversion, `.part` files or other intermediates may still change.

## Branch D: the task failed

Failed tasks usually do not produce a final file. Start with [Download Failures](../download-failures/) and check the link, site support, login state, and output-folder permissions first.

## How to avoid losing files next time

- confirm the current output folder before a larger download batch;
- switch output folders deliberately per project;
- test rename rules on a small file first;
- open the folder from Ameow after completion instead of guessing the path manually.
