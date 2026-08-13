// Dot Field surface-boundary policy: pure click classification for the main
// window gesture path. This module is presentation wiring (like the panel
// interaction utils), not a renderer-local motion leaf: it intentionally
// carries the pending gesture's DOM client coordinates, which the surface
// reads and the Dot Field runtime never sees.

export type PendingPanelClick = {
  pointerId: number;
  clientX: number;
  clientY: number;
};

/**
 * Pure click classification at the surface DOM boundary. A click is the
 * pointerup of the exact pointer that reached the drag-pending branch in
 * pointerdown (all non-click gestures — non-left button, context-close,
 * compact expansion, ignored interactive target, macOS double-click
 * mousedown shortcut — returned earlier and never recorded a pending click),
 * and the gesture never became a window drag. The second click of a non-macOS
 * double-click (event detail 2, the output-folder shortcut) is excluded
 * BEFORE acknowledgement; its first click (detail 1) is indistinguishable
 * from a real click at pointerup time and stays accepted. Exported so the
 * classification is testable without a DOM environment.
 */
export const resolvePanelSurfaceClick = (
  button: number,
  pointerId: number,
  pendingClick: PendingPanelClick | null,
  isDragging: boolean,
  detail: number,
): { clientX: number; clientY: number } | null => {
  if (button !== 0 || isDragging || pendingClick === null || detail > 1) {
    return null;
  }
  if (pendingClick.pointerId !== pointerId) {
    return null;
  }
  return { clientX: pendingClick.clientX, clientY: pendingClick.clientY };
};
