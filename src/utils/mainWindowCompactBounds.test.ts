import { describe, expect, it } from "vitest";

import { resolveMainWindowCompactVisibilityBounds } from "./mainWindowCompactBounds";

const monitor = {
  position: { x: 0, y: 0 },
  size: { width: 1920, height: 1080 },
  scaleFactor: 1,
};

describe("resolveMainWindowCompactVisibilityBounds", () => {
  it("keeps the current bounds when the compact frame is already visible", () => {
    expect(resolveMainWindowCompactVisibilityBounds({
      currentBounds: { x: 120, y: 160, width: 200, height: 200 },
      compactFrameSize: 80,
      edgePadding: 8,
      monitor,
    })).toEqual({ x: 120, y: 160, width: 200, height: 200 });
  });

  it("moves the compact frame inside the left and top monitor edges", () => {
    expect(resolveMainWindowCompactVisibilityBounds({
      currentBounds: { x: -72, y: -24, width: 200, height: 200 },
      compactFrameSize: 80,
      edgePadding: 8,
      monitor,
    })).toEqual({ x: 8, y: 8, width: 200, height: 200 });
  });

  it("moves the compact frame inside the right and bottom monitor edges", () => {
    expect(resolveMainWindowCompactVisibilityBounds({
      currentBounds: { x: 1900, y: 1040, width: 200, height: 200 },
      compactFrameSize: 80,
      edgePadding: 8,
      monitor,
    })).toEqual({ x: 1832, y: 992, width: 200, height: 200 });
  });

  it("respects work areas whose origin is offset", () => {
    expect(resolveMainWindowCompactVisibilityBounds({
      currentBounds: { x: -1300, y: 12, width: 200, height: 200 },
      compactFrameSize: 80,
      edgePadding: 8,
      monitor: {
        position: { x: -1280, y: 38 },
        size: { width: 1280, height: 984 },
        scaleFactor: 1,
      },
    })).toEqual({ x: -1272, y: 46, width: 200, height: 200 });
  });

  it("falls back to normalized current bounds when monitor lookup is unavailable", () => {
    expect(resolveMainWindowCompactVisibilityBounds({
      currentBounds: { x: -72.4, y: 20.6, width: 199.4, height: 200.5 },
      compactFrameSize: 80,
      edgePadding: 8,
      monitor: null,
    })).toEqual({ x: -72, y: 21, width: 199, height: 201 });
  });
});
