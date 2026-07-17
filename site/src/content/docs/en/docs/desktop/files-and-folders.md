---
title: Files and Folders
description: Collect local files with Ameow and understand the difference between dropping files and dropping folders.
---

Ameow accepts both local files and folders, but they do not mean the same thing. Dropping files moves files. Dropping a folder changes the output folder.

If you remember only one rule: **files are moved, folders become the save location.** This is the cause behind many "where did my file go?" cases.

[Diagram: dropping files moves them into the output folder; dropping a folder changes the output folder]

## Drop files: move them into the output folder

Use this for screenshots, images, videos, text files, project assets, and similar local files.

Steps:

1. Select one or more local files.
2. Drag them onto the Ameow floating window.
3. Release the pointer.
4. Open the current output folder and confirm the files appear there.

Success state: the files show up in the current output folder, and the originals no longer remain in their previous location.

## Drop a folder: change the output folder

Use this when you want future assets to go into a specific project folder.

Steps:

1. Find the target folder.
2. Drag the folder onto the Ameow floating window.
3. Future dropped files, pasted links, and web downloads now go there.
4. Open the current output folder and confirm the location changed.

Success state: the current output folder becomes the folder you dropped. Ameow does not duplicate the entire folder.

## Windows clipboard files

On Windows, you can also copy files in Explorer and paste them into Ameow:

1. Select the file in Explorer.
2. Press `Ctrl+C`.
3. Make sure Ameow can receive input.
4. Press `Ctrl+V`.

This is handy when dragging is inconvenient, when you already selected files in the file manager, or when you want to keep the originals.

## Easy mistakes

- You wanted to move the contents of a folder, but dropped the folder itself: that changes the output folder.
- You cannot find a file: it may already have moved to the current output folder, or the output folder may already have changed.
- A large file does not appear instantly: wait for the move to finish, then open the output folder again.

When in doubt, opening the current output folder from Ameow is the fastest confirmation.
