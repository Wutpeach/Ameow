import { describe, expect, it, vi } from "vitest";

import {
  resolveEdgeGlowOpacity,
  updateEdgeGlowFromClientPoint,
  type EdgeGlowPointerRuntime,
} from "./motionRuntime";

// Pointer coordinates live in local Motion values, not React application
// state. The coordinate/opacity transforms are pure and tested directly.

const createFakeRuntime = () => ({
  x: { set: vi.fn() },
  y: { set: vi.fn() },
  lastKnownScreenPointRef: { current: null },
}) as unknown as EdgeGlowPointerRuntime;

describe("edge glow continuous runtime", () => {
  it("opacity peaks near the panel edges and fades toward the center", () => {
    expect(resolveEdgeGlowOpacity(0, 100, 200)).toBe(1);
    expect(resolveEdgeGlowOpacity(40, 100, 200)).toBeGreaterThan(0);
    expect(resolveEdgeGlowOpacity(40, 100, 200))
      .toBeGreaterThan(resolveEdgeGlowOpacity(60, 100, 200));
    // Matches the historical formula: the glow never fully vanishes at the
    // center but is weakest there.
    expect(resolveEdgeGlowOpacity(100, 100, 200))
      .toBeLessThan(resolveEdgeGlowOpacity(60, 100, 200));
  });

  it("clamps opacity to at most 1 at the very edge", () => {
    expect(resolveEdgeGlowOpacity(0, 0, 200)).toBeLessThanOrEqual(1);
    expect(resolveEdgeGlowOpacity(200, 100, 200)).toBeLessThanOrEqual(1);
  });

  it("writes panel-relative coordinates into Motion values", () => {
    const runtime = createFakeRuntime();
    updateEdgeGlowFromClientPoint(runtime, 100, 50, { left: 14, top: 14 });
    expect(runtime.x.set).toHaveBeenCalledWith(86);
    expect(runtime.y.set).toHaveBeenCalledWith(36);
  });
});
