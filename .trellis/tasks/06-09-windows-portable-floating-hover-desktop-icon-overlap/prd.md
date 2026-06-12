# Investigate Windows portable desktop icon overlap on floating window hover

## Goal

Understand and reproduce a Windows portable-build report where hovering the Ameow floating/tray-like desktop icon opens the floating window, but Windows desktop icons obscure part of the floating window.

No implementation should start until the missing reproduction details are confirmed or a packaged Windows portable reproduction is available.

## Known Facts

- User-reported environment: Windows portable build.
- Local retest in the dev version did not reproduce the issue.
- The wording likely refers to Ameow's desktop floating compact icon, not the Windows notification-area tray icon.
- The native tray implementation only sets an Electron `Tray` icon, tooltip, click handler, and context menu; it does not create a custom hover popup.
- The issue is currently suspected to be Windows packaged/portable specific.

## Current Code Clues

- `electron/trayMenu.mts` uses the native tray tooltip (`tray.setToolTip("Ameow")`) and menu, so a custom tray-hover popup is unlikely to be involved.
- `src/App.tsx` enables Windows-only compact passthrough hover behavior through `supportsCompactPassthroughHotspot`.
- Compact mode calls `currentWindow.setInteractionMode("compact-passthrough")`; Electron handles this with `setIgnoreMouseEvents(true, { forward: true })`.
- Hovering the compact hotspot triggers a transition from compact to full floating window.
- `electron/main.mts` applies stronger Windows z-order for the main window in `applyMainWindowVisibleZOrder`, using `"screen-saver"` and `moveTop()` for packaged transparent windows.
- The compact-to-full bounds animation path updates window bounds through `animate-bounds`; current evidence suggests it does not refresh main-window z-order during that hover expansion.

## Open Questions

- Is the compact floating icon located near desktop icons when the issue occurs?
- Is the obscured area part of the expanded Ameow floating panel, rather than the native Windows tray tooltip?
- Does moving the floating icon to an empty desktop area avoid the issue?
- Does the issue reproduce only in the portable packaged build, or also in an installed packaged build?
- Does launching with an opaque-window override avoid the overlap, suggesting a transparent-window z-order/composition issue?

## Requirements

- Capture the user-visible symptom in concrete terms before changing behavior.
- Verify on a packaged Windows portable build, not only in dev.
- Keep the investigation scoped to the main floating window, compact hover expansion, and Windows desktop z-order unless user feedback points elsewhere.
- Avoid changing tray/menu behavior unless reproduction proves the native tray path is involved.

## Acceptance Criteria

- [ ] Record whether the report refers to the desktop floating compact icon or the Windows notification-area tray icon.
- [ ] Record whether the issue depends on the floating icon overlapping or expanding over desktop icons.
- [ ] Reproduce or explicitly fail to reproduce on a Windows portable packaged build.
- [ ] If reproduced, identify whether refreshing main-window z-order during compact-to-full expansion fixes it.
- [ ] If a fix is needed, create/update design and implementation notes before starting code changes.

## Notes

- Lightweight tasks can remain PRD-only.
- Initial hypothesis: Windows packaged transparent always-on-top window z-order is stale during compact hover expansion, so the Explorer desktop icon layer can visually cover part of the floating window. This is unconfirmed until a portable packaged reproduction is available.
