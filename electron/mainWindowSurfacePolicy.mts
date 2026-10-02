import type { BrowserWindow, Rectangle } from "electron";
import { screen } from "electron";

export const MAIN_WINDOW_COMPACT_REACHABLE_MOVE_DURATION_MS = 180;

type MainWindowSurfaceScreenApi = {
  getDisplayMatching(rect: Rectangle): { workArea: Rectangle };
  getPrimaryDisplay(): { workArea: Rectangle };
};

export type CompactReachableRequest = {
  reachableFrameSize: number;
  edgePadding: number;
  reducedMotion: boolean;
  requestEpoch: number;
};

export type CompactReachableResult = {
  requestEpoch: number;
  position: { x: number; y: number };
};

type CompactReachabilityMonitor = {
  position: { x: number; y: number };
  size: { width: number; height: number };
};

type ActiveCorrection = {
  requestEpoch: number;
  stop(): void;
};

const activeCorrections = new Map<number, ActiveCorrection>();

const clamp = (value: number, min: number, max: number): number => (
  Math.min(Math.max(value, min), Math.max(min, max))
);

export const resolveCompactReachablePosition = ({
  bounds,
  frameSize,
  edgePadding,
  monitor,
}: {
  bounds: { x: number; y: number; width: number; height: number };
  frameSize: number;
  edgePadding: number;
  monitor: CompactReachabilityMonitor | null;
}): { x: number; y: number } => {
  const normalizedBounds = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
  };

  if (!monitor) {
    return {
      x: normalizedBounds.x,
      y: normalizedBounds.y,
    };
  }

  const normalizedFrameSize = Math.max(1, Math.round(frameSize));
  const padding = Math.max(0, Math.round(edgePadding));
  const minX = monitor.position.x + padding;
  const minY = monitor.position.y + padding;
  const maxX = monitor.position.x + monitor.size.width - normalizedFrameSize - padding;
  const maxY = monitor.position.y + monitor.size.height - normalizedFrameSize - padding;

  return {
    x: clamp(normalizedBounds.x, minX, maxX),
    y: clamp(normalizedBounds.y, minY, maxY),
  };
};

const easeInOutCubic = (value: number): number => (
  value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2
);

const resolveMonitorForWindow = (
  win: BrowserWindow,
  screenApi: MainWindowSurfaceScreenApi,
): CompactReachabilityMonitor => {
  if (win.isDestroyed()) {
    const fallback = screenApi.getPrimaryDisplay().workArea;
    return {
      position: { x: fallback.x, y: fallback.y },
      size: { width: fallback.width, height: fallback.height },
    };
  }
  const display = screenApi.getDisplayMatching(win.getBounds());
  return {
    position: { x: display.workArea.x, y: display.workArea.y },
    size: { width: display.workArea.width, height: display.workArea.height },
  };
};

const cancelActiveCorrection = (win: BrowserWindow) => {
  const active = activeCorrections.get(win.id);
  if (!active) {
    return;
  }
  active.stop();
  activeCorrections.delete(win.id);
};

const interpolatePosition = (
  win: BrowserWindow,
  from: { x: number; y: number },
  to: { x: number; y: number },
  durationMs: number,
  requestEpoch: number,
): Promise<void> => new Promise<void>((resolve) => {
  if (win.isDestroyed() || durationMs <= 0) {
    if (!win.isDestroyed()) {
      win.setPosition(to.x, to.y);
    }
    resolve();
    return;
  }

  const startedAtMs = Date.now();
  let frameTimer: NodeJS.Timeout | null = null;
  let stopped = false;

  const releaseOwnership = () => {
    const current = activeCorrections.get(win.id);
    if (current?.stop === stop) {
      activeCorrections.delete(win.id);
    }
  };

  const finish = () => {
    if (frameTimer !== null) {
      clearTimeout(frameTimer);
      frameTimer = null;
    }
    releaseOwnership();
    if (!win.isDestroyed()) {
      win.setPosition(to.x, to.y);
    }
    resolve();
  };

  const step = () => {
    if (stopped) {
      resolve();
      return;
    }
    if (win.isDestroyed()) {
      if (frameTimer !== null) {
        clearTimeout(frameTimer);
        frameTimer = null;
      }
      releaseOwnership();
      resolve();
      return;
    }

    const elapsedMs = Date.now() - startedAtMs;
    const progress = Math.min(1, elapsedMs / durationMs);
    const easedProgress = easeInOutCubic(progress);
    win.setPosition(
      Math.round(from.x + ((to.x - from.x) * easedProgress)),
      Math.round(from.y + ((to.y - from.y) * easedProgress)),
    );

    if (progress >= 1) {
      finish();
      return;
    }

    frameTimer = setTimeout(step, 1000 / 60);
  };

  const stop = () => {
    stopped = true;
    if (frameTimer !== null) {
      clearTimeout(frameTimer);
      frameTimer = null;
    }
    resolve();
  };

  activeCorrections.set(win.id, { requestEpoch, stop });
  step();
});

export const ensureMainWindowCompactReachable = async (
  win: BrowserWindow,
  request: CompactReachableRequest,
  screenApi: MainWindowSurfaceScreenApi = screen,
): Promise<CompactReachableResult> => {
  if (win.isDestroyed()) {
    // getBounds() throws on a destroyed BrowserWindow; the window is already
    // gone, so report the request epoch with an identity position. Callers
    // never apply placement for a destroyed surface.
    return {
      requestEpoch: request.requestEpoch,
      position: { x: 0, y: 0 },
    };
  }

  // A stale correction must never move a newer full surface.
  cancelActiveCorrection(win);

  const bounds = win.getBounds();
  const monitor = resolveMonitorForWindow(win, screenApi);
  const target = resolveCompactReachablePosition({
    bounds,
    frameSize: request.reachableFrameSize,
    edgePadding: request.edgePadding,
    monitor,
  });

  if (target.x === bounds.x && target.y === bounds.y) {
    return {
      requestEpoch: request.requestEpoch,
      position: target,
    };
  }

  if (request.reducedMotion) {
    win.setPosition(target.x, target.y);
    return {
      requestEpoch: request.requestEpoch,
      position: target,
    };
  }

  await interpolatePosition(
    win,
    { x: bounds.x, y: bounds.y },
    target,
    MAIN_WINDOW_COMPACT_REACHABLE_MOVE_DURATION_MS,
    request.requestEpoch,
  );

  return {
    requestEpoch: request.requestEpoch,
    position: target,
  };
};

export const cancelMainWindowCompactReachability = (win: BrowserWindow) => {
  cancelActiveCorrection(win);
};

export type CompactSnapRequest = {
  /** Compact ball outer size; the frame is flushed against the chosen edge. */
  frameSize: number;
  reducedMotion: boolean;
  requestEpoch: number;
};

export type CompactSnapResult = {
  requestEpoch: number;
  position: { x: number; y: number };
};

/**
 * Nearest-edge snap for the compact ball. Picks whichever work-area edge the
 * window is already closest to and settles the ball half off-screen against it,
 * so only the inner half stays visible; the free axis is kept fully inside the
 * work area. Ties resolve to the earlier candidate (left, right, top, bottom) so
 * the result is deterministic.
 */
export const resolveCompactSnappedPosition = ({
  bounds,
  frameSize,
  monitor,
}: {
  bounds: { x: number; y: number };
  frameSize: number;
  monitor: CompactReachabilityMonitor;
}): { x: number; y: number } => {
  const size = Math.max(1, Math.round(frameSize));
  // Half the ball overhangs the display edge once snapped.
  const half = Math.round(size / 2);
  const minX = monitor.position.x;
  const minY = monitor.position.y;
  const maxX = monitor.position.x + monitor.size.width;
  const maxY = monitor.position.y + monitor.size.height;
  // Distance is measured from the flush position so the nearest edge is chosen
  // exactly as before the overhang existed.
  const flushMaxX = maxX - size;
  const flushMaxY = maxY - size;

  const candidates: Array<{ distance: number; x: number; y: number }> = [
    { distance: Math.abs(bounds.x - minX), x: minX - half, y: clamp(bounds.y, minY, flushMaxY) },
    { distance: Math.abs(bounds.x - flushMaxX), x: maxX - half, y: clamp(bounds.y, minY, flushMaxY) },
    { distance: Math.abs(bounds.y - minY), x: clamp(bounds.x, minX, flushMaxX), y: minY - half },
    { distance: Math.abs(bounds.y - flushMaxY), x: clamp(bounds.x, minX, flushMaxX), y: maxY - half },
  ];

  const best = candidates.reduce((closest, candidate) => (
    candidate.distance < closest.distance ? candidate : closest
  ));

  return { x: best.x, y: best.y };
};

/**
 * Snaps the compact ball to its nearest screen edge with the same eased move
 * used by the reachability correction. A new request supersedes an in-flight one.
 */
export const snapMainWindowToNearestEdge = async (
  win: BrowserWindow,
  request: CompactSnapRequest,
  screenApi: MainWindowSurfaceScreenApi = screen,
): Promise<CompactSnapResult> => {
  if (win.isDestroyed()) {
    return {
      requestEpoch: request.requestEpoch,
      position: { x: 0, y: 0 },
    };
  }

  cancelActiveCorrection(win);

  const bounds = win.getBounds();
  const monitor = resolveMonitorForWindow(win, screenApi);
  const target = resolveCompactSnappedPosition({
    bounds: { x: bounds.x, y: bounds.y },
    frameSize: request.frameSize,
    monitor,
  });

  if (target.x === bounds.x && target.y === bounds.y) {
    return {
      requestEpoch: request.requestEpoch,
      position: target,
    };
  }

  if (request.reducedMotion) {
    win.setPosition(target.x, target.y);
    return {
      requestEpoch: request.requestEpoch,
      position: target,
    };
  }

  await interpolatePosition(
    win,
    { x: bounds.x, y: bounds.y },
    target,
    MAIN_WINDOW_COMPACT_REACHABLE_MOVE_DURATION_MS,
    request.requestEpoch,
  );

  return {
    requestEpoch: request.requestEpoch,
    position: target,
  };
};
