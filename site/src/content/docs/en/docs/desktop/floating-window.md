---
title: Floating window
description: The Compact cat, Full controls, and tray/menu bar.
---

The compact window (Compact) shows the cat. Moving the pointer near it expands the full window (Full) for links, tasks, and the queue. Downloads can expand it according to task state; it returns to Compact after completion once the usual collapse conditions are met.

## The Compact cat

Light theme shows a black cat; Dark shows a white cat. The cat blinks quietly, occasionally looks around or moves its ears, and shows no download progress or pointer tracking. On a normal startup and when collapsing from Full, its paws grip the sill before it pulls its head up. Restoring a hidden window in the same instance does not replay the startup animation.

The cat disappears immediately when Full expands, so controls never wait for an animation. With the system's reduced-motion setting enabled, the cat stays still while downloads and window controls continue to work.

## Actions after expanding

Full offers link input, current task status, and the queue entry. Right-click for quality selection, format hints, settings, hide, and quit. The Full right-click menu uses the app's own styling on both Windows and macOS. Double-click Full's empty background to open the current confirmed output folder in Explorer or Finder; control clicks and window dragging do not trigger this action.

Use the queue to inspect waiting, active, and failed tasks and cancel or retry when available. Quality and folder are captured at submission; see [links and queue](../links-and-queue/).

## Tray and Mac menu bar

The Windows system tray provides open, settings, and quit. macOS uses a native system menu bar menu with Open Ameow, Settings, Quit, and applicable update actions. No Dock icon appears by default. Closing the Mac settings window only closes settings; the menu bar app keeps running and settings can be reopened.

On Mac, Compact follows ordinary desktop Spaces but does not cover another app's fullscreen Space. This behavior applies only to Compact.

## Hide and quit

Downloads continue while hidden; choose open from the tray or menu bar to restore the window. Quitting stops tasks and waits for safe cleanup, normally without a dialog. Only an actual cleanup problem displays its cause and available retry actions. Collapsing that recovery view or pressing Esc does not cancel the quit request. A hidden window does not mean tasks have finished or the app has quit.
