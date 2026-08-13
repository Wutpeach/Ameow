import { describe, expect, it } from "vitest";
import {
  DOT_COUNT_MAX,
  DOT_REDUCED_MOTION_DURATION_MS,
  DOT_RESPONSE_RADIUS,
  DOT_TRANSIENT_DURATION_MS,
  resolveBoundedDpr,
  resolveDotColor,
  resolveDotEdgeFactor,
  resolveDotFieldDprMediaQuery,
  resolveDotFieldGrid,
  resolveDotOriginFromClientPoint,
  resolveDotResponseCurve,
  resolveDotResponseFront,
  resolveDotResponseStrength,
  resolveDotTransientDuration,
} from "./dotFieldRecipe";

describe("resolveDotFieldGrid", () => {
  it("builds a deterministic centered grid for the 200px content surface", () => {
    const grid = resolveDotFieldGrid(200);
    expect(grid.points.length).toBe(15 * 15);
    const first = grid.points[0];
    expect(first.x).toBeCloseTo((0.5 / 15) * 200);
    expect(first.y).toBeCloseTo((0.5 / 15) * 200);
    expect(first.u).toBeCloseTo(first.x / 200);
    expect(first.v).toBeCloseTo(first.y / 200);
    // Deterministic across calls.
    expect(resolveDotFieldGrid(200).points).toEqual(grid.points);
  });

  it("hard-bounds total population for any surface size", () => {
    for (const size of [200, 512, 1000, 4096]) {
      expect(resolveDotFieldGrid(size).points.length).toBeLessThanOrEqual(DOT_COUNT_MAX);
    }
    const huge = resolveDotFieldGrid(5000);
    expect(huge.points.length).toBe(DOT_COUNT_MAX);
  });

  it("returns an empty grid for invalid sizes", () => {
    expect(resolveDotFieldGrid(0).points).toEqual([]);
    expect(resolveDotFieldGrid(Number.NaN).points).toEqual([]);
    expect(resolveDotFieldGrid(-5).points).toEqual([]);
  });
});

describe("resolveDotEdgeFactor", () => {
  it("is 1 in the interior and 0 at the outer edge", () => {
    expect(resolveDotEdgeFactor(0.5, 0.5)).toBe(1);
    expect(resolveDotEdgeFactor(0, 0.5)).toBe(0);
    expect(resolveDotEdgeFactor(0.5, 1)).toBe(0);
  });

  it("attenuates linearly across the fade band", () => {
    expect(resolveDotEdgeFactor(0.1, 0.5)).toBeCloseTo(0.5);
    expect(resolveDotEdgeFactor(0.19, 0.5)).toBeCloseTo(0.95);
  });

  it("clamps and rejects invalid input", () => {
    expect(resolveDotEdgeFactor(-2, 0.5)).toBe(0);
    expect(resolveDotEdgeFactor(Number.NaN, 0.5)).toBe(0);
  });
});

describe("resolveDotResponseStrength", () => {
  const dot = { x: 100, y: 100, u: 0.5, v: 0.5 };

  it("is 1 at the intent origin and bounded 0..1 elsewhere", () => {
    expect(resolveDotResponseStrength(dot, { u: 0.5, v: 0.5 }, 200)).toBe(1);
    // Opposite corner is beyond the soft response radius.
    const far = resolveDotResponseStrength(dot, { u: 0.95, v: 0.95 }, 200);
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(0.02);
  });

  it("decays symmetrically and softly with distance", () => {
    const left = resolveDotResponseStrength(dot, { u: 0.4, v: 0.5 }, 200);
    const right = resolveDotResponseStrength(dot, { u: 0.6, v: 0.5 }, 200);
    expect(left).toBeCloseTo(right, 10);
    expect(left).toBeGreaterThan(resolveDotResponseStrength(dot, { u: 0.3, v: 0.5 }, 200));
  });

  it("rejects invalid geometry", () => {
    expect(resolveDotResponseStrength(dot, { u: Number.NaN, v: 0.5 }, 200)).toBe(0);
    expect(resolveDotResponseStrength(dot, { u: 0.5, v: 0.5 }, 0)).toBe(0);
  });
});

describe("resolveDotResponseCurve", () => {
  it("starts at 1, ends at exactly 0, and decays monotonically", () => {
    expect(resolveDotResponseCurve(0, 480)).toBe(1);
    expect(resolveDotResponseCurve(480, 480)).toBe(0);
    expect(resolveDotResponseCurve(600, 480)).toBe(0);
    let previous = 1;
    for (let ms = 10; ms <= 480; ms += 10) {
      const value = resolveDotResponseCurve(ms, 480);
      expect(value).toBeLessThan(previous);
      previous = value;
    }
  });

  it("rejects invalid durations", () => {
    expect(resolveDotResponseCurve(100, 0)).toBe(0);
    expect(resolveDotResponseCurve(Number.NaN, 480)).toBe(0);
  });
});

describe("resolveDotTransientDuration", () => {
  it("selects the short reduced-motion duration", () => {
    expect(resolveDotTransientDuration(false)).toBe(DOT_TRANSIENT_DURATION_MS);
    expect(resolveDotTransientDuration(true)).toBe(DOT_REDUCED_MOTION_DURATION_MS);
    expect(DOT_REDUCED_MOTION_DURATION_MS).toBeLessThan(DOT_TRANSIENT_DURATION_MS);
  });
});

describe("resolveBoundedDpr", () => {
  it("caps the backing-store scale and sanitizes input", () => {
    expect(resolveBoundedDpr(1)).toBe(1);
    expect(resolveBoundedDpr(1.5)).toBe(1.5);
    expect(resolveBoundedDpr(3)).toBe(2);
    expect(resolveBoundedDpr(Number.NaN)).toBe(1);
    expect(resolveBoundedDpr(0)).toBe(1);
    expect(resolveBoundedDpr(-1)).toBe(1);
  });
});

describe("resolveDotFieldDprMediaQuery", () => {
  it("watches the RAW dpr — including values above the 2x backing cap", () => {
    expect(resolveDotFieldDprMediaQuery(1)).toBe("(resolution: 1dppx)");
    expect(resolveDotFieldDprMediaQuery(1.5)).toBe("(resolution: 1.5dppx)");
    expect(resolveDotFieldDprMediaQuery(2)).toBe("(resolution: 2dppx)");
    expect(resolveDotFieldDprMediaQuery(2.5)).toBe("(resolution: 2.5dppx)");
    expect(resolveDotFieldDprMediaQuery(3)).toBe("(resolution: 3dppx)");
  });

  it("falls back safely for invalid values", () => {
    expect(resolveDotFieldDprMediaQuery(Number.NaN)).toBe("(resolution: 1dppx)");
    expect(resolveDotFieldDprMediaQuery(0)).toBe("(resolution: 1dppx)");
    expect(resolveDotFieldDprMediaQuery(-1)).toBe("(resolution: 1dppx)");
  });

  it("the 3 -> 1.5 transition fires the OLD raw query (why the cap must not be used)", () => {
    // At 3dppx the listener is armed against `(resolution: 3dppx)`, which
    // MATCHES. When the display moves to 1.5dppx that query stops matching,
    // so the browser fires `change` and the revision runs. A query built
    // from the capped dpr (`(resolution: 2dppx)`) would match at NEITHER 3
    // nor 1.5 — the transition would be silently missed. The cap applies to
    // the backing store only (resolveBoundedDpr), never to the watch query.
    expect(resolveDotFieldDprMediaQuery(3)).toBe("(resolution: 3dppx)");
    expect(resolveDotFieldDprMediaQuery(3)).not.toBe("(resolution: 2dppx)");
    expect(resolveBoundedDpr(3)).toBe(2); // backing store stays capped
  });
});

describe("resolveDotResponseFront", () => {
  const DURATION = DOT_TRANSIENT_DURATION_MS;

  it("peaks exactly at the front radius and falls off smoothly on both sides (no hard ring)", () => {
    // Front radius after half the duration is exactly half the response radius.
    const half = DOT_RESPONSE_RADIUS / 2;
    expect(resolveDotResponseFront(half, DURATION / 2, DURATION, false)).toBe(1);
    // Symmetric soft skirt: same distance ahead of or behind the front.
    expect(resolveDotResponseFront(half - 16, DURATION / 2, DURATION, false))
      .toBe(resolveDotResponseFront(half + 16, DURATION / 2, DURATION, false));
    // The envelope is strictly positive everywhere (never a hard cut) and
    // monotonically decreasing away from the front.
    const near = resolveDotResponseFront(half - 8, DURATION / 2, DURATION, false);
    const far = resolveDotResponseFront(half + 40, DURATION / 2, DURATION, false);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(0);
    expect(near).toBeGreaterThan(far);
  });

  it("propagates outward: a near dot brightens before a far dot does", () => {
    const near = resolveDotResponseFront(8, DURATION / 4, DURATION, false);
    const far = resolveDotResponseFront(40, DURATION / 4, DURATION, false);
    // At 25% of the duration the front has only travelled 25% of the radius.
    expect(near).toBeGreaterThan(far);
    // Later the front reaches farther: the far dot's envelope rises over time.
    const farLater = resolveDotResponseFront(40, DURATION / 2, DURATION, false);
    expect(farLater).toBeGreaterThan(far);
  });

  it("reaches the response radius exactly at the duration end (boundary absorption end point)", () => {
    expect(resolveDotResponseFront(DOT_RESPONSE_RADIUS, DURATION, DURATION, false)).toBe(1);
    expect(resolveDotResponseFront(0, DURATION, DURATION, false)).toBeLessThan(1);
  });

  it("reduced motion does not travel: the envelope is the constant 1 (localized bloom)", () => {
    // Any distance, any elapsed: no front shaping under reduced motion.
    expect(resolveDotResponseFront(0, 16, DOT_REDUCED_MOTION_DURATION_MS, true)).toBe(1);
    expect(resolveDotResponseFront(40, 16, DOT_REDUCED_MOTION_DURATION_MS, true)).toBe(1);
    expect(resolveDotResponseFront(40, DOT_REDUCED_MOTION_DURATION_MS, DOT_REDUCED_MOTION_DURATION_MS, true)).toBe(1);
    // Contrast with normal motion at the same geometry: distance shapes it.
    expect(resolveDotResponseFront(40, 16, DURATION, false)).toBeLessThan(1);
  });

  it("rejects invalid input", () => {
    expect(resolveDotResponseFront(Number.NaN, 100, DURATION, false)).toBe(0);
    expect(resolveDotResponseFront(-5, 100, DURATION, false)).toBe(0);
    expect(resolveDotResponseFront(10, 100, 0, false)).toBe(0);
  });
});

describe("resolveDotOriginFromClientPoint", () => {
  const rect = { left: 10, top: 20, width: 200, height: 200 };

  it("normalizes a client point to finite clamped u/v", () => {
    expect(resolveDotOriginFromClientPoint(110, 120, rect)).toEqual({ u: 0.5, v: 0.5 });
    expect(resolveDotOriginFromClientPoint(10, 20, rect)).toEqual({ u: 0, v: 0 });
    expect(resolveDotOriginFromClientPoint(210, 220, rect)).toEqual({ u: 1, v: 1 });
    // Clamped outside the rect.
    expect(resolveDotOriginFromClientPoint(-50, 500, rect)).toEqual({ u: 0, v: 1 });
  });

  it("falls back to center for missing or invalid geometry", () => {
    expect(resolveDotOriginFromClientPoint(110, 120, null)).toEqual({ u: 0.5, v: 0.5 });
    expect(resolveDotOriginFromClientPoint(Number.NaN, 120, rect)).toEqual({ u: 0.5, v: 0.5 });
    expect(resolveDotOriginFromClientPoint(110, 120, { left: 0, top: 0, width: 0, height: 200 }))
      .toEqual({ u: 0.5, v: 0.5 });
  });
});

describe("resolveDotColor", () => {
  const DORMANT = "rgba(255,255,255,0.16)";
  const ACK = "rgba(255,255,255,0.72)";

  it("resolves exactly to the tokens at the extremes with full edge factor", () => {
    expect(resolveDotColor(DORMANT, ACK, 0, 1)).toBe("rgba(255, 255, 255, 0.16)");
    expect(resolveDotColor(DORMANT, ACK, 1, 1)).toBe("rgba(255, 255, 255, 0.72)");
  });

  it("interpolates rgb and alpha linearly in the middle", () => {
    expect(resolveDotColor(DORMANT, ACK, 0.5, 1)).toBe("rgba(255, 255, 255, 0.44)");
    expect(resolveDotColor("rgba(0,0,0,0)", "rgba(0,0,0,0.6)", 0.5, 1))
      .toBe("rgba(0, 0, 0, 0.3)");
  });

  it("scales the rendered alpha by the edge factor (boundary attenuation)", () => {
    expect(resolveDotColor(DORMANT, ACK, 0, 0.5)).toBe("rgba(255, 255, 255, 0.08)");
    expect(resolveDotColor(DORMANT, ACK, 1, 0.5)).toBe("rgba(255, 255, 255, 0.36)");
    expect(resolveDotColor(DORMANT, ACK, 1, 0)).toBe("rgba(255, 255, 255, 0)");
  });

  it("supports hex tokens and falls back for unknown formats", () => {
    expect(resolveDotColor("#ffffff", "#000000", 0.5, 1)).toBe("rgba(128, 128, 128, 1)");
    expect(resolveDotColor("unknown", ACK, 0.5, 1)).toBe("rgba(255,255,255,0.72)");
    expect(resolveDotColor(DORMANT, "unknown", 0.5, 1)).toBe("rgba(255,255,255,0.16)");
  });
});
