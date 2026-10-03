import type { BrowserWindow } from "electron";

import {
  type VisibilityBounds,
  type VisibilityPoint,
} from "./windowVisibility.mjs";

/**
 * Poll interval. The ignore state can only change on a poll, so this is the delay
 * between the pointer reaching the ball and the ball accepting the press. Keep it
 * well under a normal click-to-press delay or quick presses land on the window
 * underneath instead.
 */
export const MAIN_WINDOW_COMPACT_HOTSPOT_POLL_MS = 16;

/**
 * Hotspot radius in renderer CSS pixels. The visible ball has a 21px radius, so
 * this deliberately over-covers it: the pointer may be a few pixels outside the
 * circle (and the poll may be one frame stale) and the press still lands.
 */
export const MAIN_WINDOW_COMPACT_HOTSPOT_RADIUS = 30;

/**
 * Hotspot centre in renderer CSS pixels, measured from the window's top-left.
 * The compact shell is 56px, so the ball sits at its midpoint.
 */
export const MAIN_WINDOW_COMPACT_HOTSPOT_CENTER = 28;

type CompactHotspotWindow = Pick<
  BrowserWindow,
  "getBounds" | "isDestroyed" | "isVisible" | "setIgnoreMouseEvents"
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
  /**
   * Pins the surface interactive for the duration of a gesture so a moving ball
   * cannot slip out from under its own hotspot and lose the drag.
   */
  setGestureActive(active: boolean): void;
  /**
   * Applies a hotspot reading observed by the renderer. `forward: true` still
   * delivers mousemove, so the renderer sees the pointer before the next poll and
   * can switch the ignore state on the same frame as the pointer arrives; polling
   * remains as the fallback for when no moves are delivered.
   */
  setHotspotHint(inside: boolean): void;
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
}: {
  win: CompactHotspotWindow;
  screenRef: CompactHotspotScreen;
  resolveScaleFactor: (bounds: VisibilityBounds) => number;
  hotspotCenter: { x: number; y: number };
  radius?: number;
  pollMs?: number;
}): MainWindowCompactHotspotController => {
  let interval: ReturnType<typeof setInterval> | null = null;
  let lastIgnore: boolean | null = null;
  let gestureActive = false;
  /**
   * Latest hotspot reading from the renderer. It is measured in CSS pixels, so it
   * needs no scale conversion; the host poll is only a fallback for when no moves
   * are delivered, and must not override a fresh renderer reading.
   */
  let rendererHint: boolean | null = null;

  const applyIgnore = (ignore: boolean) => {
    if (ignore === lastIgnore) {
      return;
    }
    lastIgnore = ignore;
    win.setIgnoreMouseEvents(ignore, { forward: true });
  };

  const emitIfChanged = () => {
    if (win.isDestroyed() || !win.isVisible()) {
      return;
    }

    // A gesture owns the surface: the ball moves under the cursor, so re-evaluating
    // the hotspot mid-drag would hand the pointer back to whatever is underneath
    // and drop the drag. Focusability is deliberately NOT touched here — toggling
    // it makes the window flicker in and out of the taskbar.
    if (gestureActive) {
      applyIgnore(false);
      return;
    }

    // Both sources are consulted, and "on the ball" wins: the renderer reading
    // accelerates entry (same frame), while the poll covers leaving and the case
    // where forwarded mousemove never arrives. Letting a stale `false` hint win
    // outright would pin the surface click-through and make the ball unreachable.
    const bounds = win.getBounds();
    const polledInside = isCursorInsideCompactHotspot({
      cursor: screenRef.getCursorScreenPoint(),
      bounds,
      scaleFactor: resolveScaleFactor(bounds),
      hotspotCenterX: hotspotCenter.x,
      hotspotCenterY: hotspotCenter.y,
      radius,
    });
    applyIgnore(!(rendererHint === true || polledInside));
  };

  const stop = () => {
    if (interval !== null) {
      clearInterval(interval);
      interval = null;
    }
    lastIgnore = null;
    gestureActive = false;
    rendererHint = null;
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
    setGestureActive: (active: boolean) => {
      gestureActive = active;
      emitIfChanged();
    },
    setHotspotHint: (inside: boolean) => {
      rendererHint = inside;
      if (gestureActive) {
        applyIgnore(false);
        return;
      }
      applyIgnore(!inside);
    },
  };
};
