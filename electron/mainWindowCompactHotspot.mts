import type { BrowserWindow } from "electron";

import {
  type VisibilityBounds,
  type VisibilityPoint,
} from "./windowVisibility.mjs";

export const MAIN_WINDOW_COMPACT_HOTSPOT_POLL_MS = 40;

/**
 * Hotspot radius in renderer CSS pixels. Matches the compact hotspot frame the
 * renderer uses to decide "the pointer is on the ball", with a small margin so a
 * press just inside the visible circle still lands.
 */
export const MAIN_WINDOW_COMPACT_HOTSPOT_RADIUS = 21;

/**
 * Hotspot centre in renderer CSS pixels, measured from the window's top-left.
 * The compact shell is 56px, so the ball sits at its midpoint.
 */
export const MAIN_WINDOW_COMPACT_HOTSPOT_CENTER = 28;

type CompactHotspotWindow = Pick<
  BrowserWindow,
  "getBounds" | "isDestroyed" | "isVisible" | "setIgnoreMouseEvents" | "setFocusable"
> & {
  on(event: "closed", listener: () => void): void;
};

type CompactHotspotScreen = {
  getCursorScreenPoint(): VisibilityPoint;
};

export type MainWindowCompactHotspotController = {
  start(): void;
  stop(): void;
  pollNow(): void;
  dispose(): void;
};

/**
 * The compact ball lives in the top-left of a window that is otherwise a large
 * transparent frame. The hotspot centre is expressed in renderer CSS pixels, so it
 * is scaled into the window's physical bounds before comparing with the cursor.
 */
export const isCursorInsideCompactHotspot = ({
  cursor,
  bounds,
  scaleFactor,
  hotspotCenterX,
  hotspotCenterY,
  radius,
}: {
  cursor: VisibilityPoint;
  bounds: VisibilityBounds;
  scaleFactor: number;
  hotspotCenterX: number;
  hotspotCenterY: number;
  radius: number;
}): boolean => {
  const scale = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  const centerX = bounds.x + hotspotCenterX * scale;
  const centerY = bounds.y + hotspotCenterY * scale;
  const radiusPx = Math.max(0, radius) * scale;
  return Math.hypot(cursor.x - centerX, cursor.y - centerY) <= radiusPx;
};

/**
 * Keeps the compact surface click-through everywhere except on the ball itself.
 *
 * Electron's `setIgnoreMouseEvents(true, { forward: true })` forwards only
 * mousemove, so a fully click-through compact window can never receive the press
 * that would start a drag or a click. Switching the ignore state with the cursor
 * gives the ball real mouse input while the transparent frame keeps passing
 * clicks to whatever is underneath it.
 */
export const createMainWindowCompactHotspotController = ({
  win,
  screenRef,
  resolveScaleFactor,
  hotspotCenter,
  radius = MAIN_WINDOW_COMPACT_HOTSPOT_RADIUS,
  pollMs = MAIN_WINDOW_COMPACT_HOTSPOT_POLL_MS,
  manageFocusability = true,
}: {
  win: CompactHotspotWindow;
  screenRef: CompactHotspotScreen;
  resolveScaleFactor: (bounds: VisibilityBounds) => number;
  hotspotCenter: { x: number; y: number };
  radius?: number;
  pollMs?: number;
  /**
   * The compact surface is deliberately non-focusable, but a non-focusable
   * window never receives the click, so focusability follows the hotspot too.
   */
  manageFocusability?: boolean;
}): MainWindowCompactHotspotController => {
  let interval: ReturnType<typeof setInterval> | null = null;
  let lastInteractive: boolean | null = null;

  const emitIfChanged = () => {
    if (win.isDestroyed() || !win.isVisible()) {
      return;
    }

    const bounds = win.getBounds();
    const interactive = isCursorInsideCompactHotspot({
      cursor: screenRef.getCursorScreenPoint(),
      bounds,
      scaleFactor: resolveScaleFactor(bounds),
      hotspotCenterX: hotspotCenter.x,
      hotspotCenterY: hotspotCenter.y,
      radius,
    });

    if (interactive === lastInteractive) {
      return;
    }
    lastInteractive = interactive;
    win.setIgnoreMouseEvents(!interactive, { forward: true });
    if (manageFocusability) {
      win.setFocusable(interactive);
    }
  };

  const stop = () => {
    if (interval !== null) {
      clearInterval(interval);
      interval = null;
    }
    lastInteractive = null;
  };

  const start = () => {
    if (win.isDestroyed() || interval !== null) {
      return;
    }
    // Evaluate immediately so a press that begins right after the mode switch is
    // not swallowed by a stale ignore state.
    emitIfChanged();
    interval = setInterval(emitIfChanged, pollMs);
  };

  const dispose = () => {
    stop();
  };

  win.on("closed", dispose);

  return {
    start,
    stop,
    pollNow: emitIfChanged,
    dispose,
  };
};
