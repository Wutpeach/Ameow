import { describe, expect, it, vi } from "vitest";

import {
  createMainWindowCompactHotspotController,
  isCursorInsideCompactHotspot,
  MAIN_WINDOW_COMPACT_HOTSPOT_RADIUS,
} from "./mainWindowCompactHotspot.mjs";

describe("isCursorInsideCompactHotspot", () => {
  const bounds = { x: 1000, y: 500, width: 228, height: 228 };
  const base = { bounds, hotspotCenterX: 28, hotspotCenterY: 28, radius: 21 };

  it("scales the CSS hotspot centre into the window's physical bounds", () => {
    // Centre: 1000 + 28*2 = 1056, 500 + 28*2 = 556.
    expect(isCursorInsideCompactHotspot({
      ...base,
      cursor: { x: 1056, y: 556 },
      scaleFactor: 2,
    })).toBe(true);
    // The radius scales too: 21 * 2 = 42px, so 45px out is outside.
    expect(isCursorInsideCompactHotspot({
      ...base,
      cursor: { x: 1056 + 45, y: 556 },
      scaleFactor: 2,
    })).toBe(false);
    // Inside the scaled radius.
    expect(isCursorInsideCompactHotspot({
      ...base,
      cursor: { x: 1056 + 30, y: 556 },
      scaleFactor: 2,
    })).toBe(true);
  });

  it("falls back to unit scale for non-finite input", () => {
    expect(isCursorInsideCompactHotspot({
      ...base,
      cursor: { x: 1028, y: 528 },
      scaleFactor: Number.NaN,
    })).toBe(true);
  });

  it("exposes the radius as a positive contract value", () => {
    expect(MAIN_WINDOW_COMPACT_HOTSPOT_RADIUS).toBeGreaterThan(0);
  });
});

describe("createMainWindowCompactHotspotController", () => {
  const createHarness = () => {
    const setIgnoreMouseEvents = vi.fn();
    const setFocusable = vi.fn();
    const win = {
      getBounds: () => ({ x: 0, y: 0, width: 228, height: 228 }),
      isDestroyed: () => false,
      isVisible: () => true,
      setIgnoreMouseEvents,
      setFocusable,
      on: () => undefined,
    };
    return { win, setIgnoreMouseEvents, setFocusable };
  };

  it("accepts mouse input only while the cursor is on the ball", () => {
    let cursor = { x: 500, y: 500 };
    const { win, setIgnoreMouseEvents, setFocusable } = createHarness();
    const controller = createMainWindowCompactHotspotController({
      win,
      screenRef: { getCursorScreenPoint: () => cursor },
      resolveScaleFactor: () => 1,
      hotspotCenter: { x: 28, y: 28 },
      pollMs: 10,
    });

    controller.pollNow();
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
    // A non-focusable window never receives the click, so focus follows too.
    expect(setFocusable).toHaveBeenLastCalledWith(false);

    cursor = { x: 28, y: 28 };
    controller.pollNow();
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
    expect(setFocusable).toHaveBeenLastCalledWith(true);

    // An unchanged state must not re-issue the calls on every poll.
    const calls = setIgnoreMouseEvents.mock.calls.length;
    controller.pollNow();
    expect(setIgnoreMouseEvents.mock.calls.length).toBe(calls);

    controller.dispose();
  });
});
