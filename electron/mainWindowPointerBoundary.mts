import type { BrowserWindow } from "electron";

import {
  isPointInsideBounds,
  type VisibilityBounds,
  type VisibilityPoint,
} from "./windowVisibility.mjs";

export const MAIN_WINDOW_POINTER_BOUNDARY_CHANNEL = "ameow:current-window:pointer-boundary";
export const MAIN_WINDOW_POINTER_BOUNDARY_POLL_MS = 50;

type MainWindowPointerBoundaryScreen = {
  getCursorScreenPoint(): VisibilityPoint;
};

type MainWindowPointerBoundaryWindow = Pick<
  BrowserWindow,
  "getBounds" | "isDestroyed" | "isVisible" | "webContents"
> & {
  on(event: "closed", listener: () => void): void;
};

export type MainWindowPointerBoundaryController = {
  start(): void;
  stop(): void;
  pollNow(): void;
  dispose(): void;
};

export const resolveMainWindowPointerBoundaryState = ({
  cursor,
  bounds,
}: {
  cursor: VisibilityPoint;
  bounds: VisibilityBounds;
}): boolean => isPointInsideBounds(cursor, bounds);

export const createMainWindowPointerBoundaryController = ({
  win,
  screenRef,
  pollMs = MAIN_WINDOW_POINTER_BOUNDARY_POLL_MS,
}: {
  win: MainWindowPointerBoundaryWindow;
  screenRef: MainWindowPointerBoundaryScreen;
  pollMs?: number;
}): MainWindowPointerBoundaryController => {
  let interval: ReturnType<typeof setInterval> | null = null;
  let pendingInitialEmit: ReturnType<typeof setTimeout> | null = null;
  let lastInside: boolean | null = null;

  const emitIfChanged = () => {
    if (win.isDestroyed() || !win.isVisible()) {
      return;
    }

    const inside = resolveMainWindowPointerBoundaryState({
      cursor: screenRef.getCursorScreenPoint(),
      bounds: win.getBounds(),
    });

    if (inside === lastInside) {
      return;
    }

    lastInside = inside;
    win.webContents.send(MAIN_WINDOW_POINTER_BOUNDARY_CHANNEL, { inside });
  };

  const stop = () => {
    if (pendingInitialEmit !== null) {
      clearTimeout(pendingInitialEmit);
      pendingInitialEmit = null;
    }
    if (interval === null) {
      lastInside = null;
      return;
    }
    clearInterval(interval);
    interval = null;
    lastInside = null;
  };

  const start = () => {
    if (win.isDestroyed() || interval !== null || pendingInitialEmit !== null) {
      return;
    }
    pendingInitialEmit = setTimeout(() => {
      pendingInitialEmit = null;
      emitIfChanged();
    }, 0);
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
