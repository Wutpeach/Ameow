import { describe, expect, it } from "vitest";

import { resolveMainWindowEdgeGlowPoint } from "./mainWindowEdgeGlowPosition";

describe("resolveMainWindowEdgeGlowPoint", () => {
  it("converts browser screen coordinates into visible panel-local coordinates", () => {
    expect(resolveMainWindowEdgeGlowPoint({
      cursorScreenPoint: { x: 246, y: 302 },
      windowScreenPoint: { x: 120, y: 160 },
      panelRect: { x: 14, y: 14, width: 200, height: 200 },
      panelSize: 200,
    })).toEqual({ x: 112, y: 128 });
  });

  it("clamps points to the visible panel body", () => {
    expect(resolveMainWindowEdgeGlowPoint({
      cursorScreenPoint: { x: 1000, y: 40 },
      windowScreenPoint: { x: 120, y: 160 },
      panelRect: { x: 14, y: 14, width: 200, height: 200 },
      panelSize: 200,
    })).toEqual({ x: 200, y: 0 });
  });

  it("returns null for invalid geometry", () => {
    expect(resolveMainWindowEdgeGlowPoint({
      cursorScreenPoint: { x: 246, y: 302 },
      windowScreenPoint: { x: 120, y: 160 },
      panelRect: { x: 14, y: 14, width: 0, height: 200 },
      panelSize: 200,
    })).toBeNull();
  });
});
