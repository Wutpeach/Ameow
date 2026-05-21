import { describe, expect, it, vi } from "vitest";

import {
  MAIN_WINDOW_POINTER_BOUNDARY_CHANNEL,
  createMainWindowPointerBoundaryController,
  resolveMainWindowPointerBoundaryState,
} from "./mainWindowPointerBoundary.mjs";

const createWindow = () => ({
  bounds: { x: 100, y: 100, width: 200, height: 200 },
  destroyed: false,
  visible: true,
  listeners: new Map<string, () => void>(),
  webContents: {
    send: vi.fn(),
  },
  getBounds() {
    return this.bounds;
  },
  isDestroyed() {
    return this.destroyed;
  },
  isVisible() {
    return this.visible;
  },
  on(event: "closed", listener: () => void) {
    this.listeners.set(event, listener);
  },
});

describe("resolveMainWindowPointerBoundaryState", () => {
  it("detects whether the cursor is inside native window bounds", () => {
    expect(resolveMainWindowPointerBoundaryState({
      cursor: { x: 150, y: 150 },
      bounds: { x: 100, y: 100, width: 200, height: 200 },
    })).toBe(true);

    expect(resolveMainWindowPointerBoundaryState({
      cursor: { x: 320, y: 150 },
      bounds: { x: 100, y: 100, width: 200, height: 200 },
    })).toBe(false);
  });
});

describe("createMainWindowPointerBoundaryController", () => {
  it("emits pointer boundary changes only when inside state changes", () => {
    const win = createWindow();
    const screenRef = {
      cursor: { x: 150, y: 150 },
      getCursorScreenPoint() {
        return this.cursor;
      },
    };
    const controller = createMainWindowPointerBoundaryController({
      win,
      screenRef,
    });

    controller.pollNow();
    controller.pollNow();
    screenRef.cursor = { x: 320, y: 150 };
    controller.pollNow();
    controller.pollNow();
    screenRef.cursor = { x: 160, y: 160 };
    controller.pollNow();

    expect(win.webContents.send).toHaveBeenCalledTimes(3);
    expect(win.webContents.send).toHaveBeenNthCalledWith(
      1,
      MAIN_WINDOW_POINTER_BOUNDARY_CHANNEL,
      { inside: true },
    );
    expect(win.webContents.send).toHaveBeenNthCalledWith(
      2,
      MAIN_WINDOW_POINTER_BOUNDARY_CHANNEL,
      { inside: false },
    );
    expect(win.webContents.send).toHaveBeenNthCalledWith(
      3,
      MAIN_WINDOW_POINTER_BOUNDARY_CHANNEL,
      { inside: true },
    );
  });

  it("clears the polling interval when stopped or closed", () => {
    vi.useFakeTimers();
    try {
      const win = createWindow();
      const screenRef = {
        getCursorScreenPoint: () => ({ x: 150, y: 150 }),
      };
      const controller = createMainWindowPointerBoundaryController({
        win,
        screenRef,
        pollMs: 50,
      });

      controller.start();
      expect(vi.getTimerCount()).toBe(2);

      controller.stop();
      expect(vi.getTimerCount()).toBe(0);

      controller.start();
      expect(vi.getTimerCount()).toBe(2);

      win.listeners.get("closed")?.();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels the deferred initial emit when stopped before the timer fires", () => {
    vi.useFakeTimers();
    try {
      const win = createWindow();
      const screenRef = {
        getCursorScreenPoint: () => ({ x: 150, y: 150 }),
      };
      const controller = createMainWindowPointerBoundaryController({
        win,
        screenRef,
        pollMs: 50,
      });

      controller.start();
      controller.stop();
      vi.runOnlyPendingTimers();

      expect(win.webContents.send).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
