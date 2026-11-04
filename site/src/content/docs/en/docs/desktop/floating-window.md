---
title: Floating window
description: Floating window
---

Moving the pointer near the compact window expands the full window to show tasks and the queue.

![Compact window themes](/Ameow/images/docs/rust-compact-themes.png)

This reuses accepted historical #18 evidence, not a new capture. The tray menu offers open, settings, and quit; downloads continue while hidden. Quitting with active tasks asks for confirmation; stopping and exiting waits for cleanup.

## Actions after expanding

The full window offers link input, current task status, and the queue entry. The main menu offers quality selection, settings, and the output folder. Use the queue to inspect waiting, active, and failed tasks and cancel or retry when available. Quality and folder are captured at submission.

## Hide and quit

After hiding, choose open from the tray to restore the window; the tray also offers settings and quit. With active tasks, the exit confirmation lets you continue or stop tasks and exit. Exit waits for cleanup; hiding does not mean a task has finished.

The image shows Compact themes only, not the Full window or tray menu. It does not establish behavior on other platforms or at every DPI.
