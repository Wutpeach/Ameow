import { describe, expect, it } from "vitest";
import {
  CHARACTER_ATTENTION_DEAD_ZONE,
  CHARACTER_ATTENTION_PEAK_DISTANCE,
  CHARACTER_ATTENTION_RESPONSE_RADIUS,
  CHARACTER_BODY_CENTER,
  CHARACTER_BODY_MAX_SQUASH,
  CHARACTER_BODY_PATH,
  CHARACTER_EAR_LEFT_PATH,
  CHARACTER_EAR_RIGHT_PATH,
  CHARACTER_EYE_LEFT,
  CHARACTER_EYE_MAX_X,
  CHARACTER_EYE_MAX_X_REDUCED,
  CHARACTER_EYE_MAX_Y,
  CHARACTER_EYE_MAX_Y_REDUCED,
  CHARACTER_EYE_RIGHT,
  CHARACTER_EYE_RADIUS_X,
  CHARACTER_EYE_RADIUS_Y,
  CHARACTER_VIEWBOX,
  CHARACTER_VISUAL_SIZE,
  NEUTRAL_CHARACTER_ATTENTION_TARGET,
  resolveCharacterAttentionTarget,
  resolveGatedSpringSource,
} from "./characterRecipe";

const CENTER = { x: 40, y: 40 };

const pathNumbers = (path: string): number[] => (
  [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]))
);

describe("Character Static Mark geometry descriptor", () => {
  it("keeps centered body/ear geometry inside the 60x60 viewBox after the static pivot translate", () => {
    const pivot = CHARACTER_BODY_CENTER;
    for (const [name, path] of [
      ["body", CHARACTER_BODY_PATH],
      ["ear-left", CHARACTER_EAR_LEFT_PATH],
      ["ear-right", CHARACTER_EAR_RIGHT_PATH],
    ] as const) {
      const numbers = pathNumbers(path);
      for (let i = 0; i < numbers.length; i += 2) {
        const x = numbers[i] + pivot.x;
        const y = numbers[i + 1] + pivot.y;
        expect(x, `${name} x ${x} out of viewBox`).toBeGreaterThanOrEqual(0);
        expect(x, `${name} x ${x} out of viewBox`).toBeLessThanOrEqual(CHARACTER_VIEWBOX);
        expect(y, `${name} y ${y} out of viewBox`).toBeGreaterThanOrEqual(0);
        expect(y, `${name} y ${y} out of viewBox`).toBeLessThanOrEqual(CHARACTER_VIEWBOX);
      }
    }
  });

  it("keeps the ear apices above the body top (readable pointed ears)", () => {
    const bodyTop = Math.min(...pathNumbers(CHARACTER_BODY_PATH).filter((_, i) => i % 2 === 1));
    const apexes = [
      Math.min(...pathNumbers(CHARACTER_EAR_LEFT_PATH).filter((_, i) => i % 2 === 1)),
      Math.min(...pathNumbers(CHARACTER_EAR_RIGHT_PATH).filter((_, i) => i % 2 === 1)),
    ];
    for (const apex of apexes) {
      expect(apex).toBeLessThan(bodyTop);
    }
  });

  it("keeps the eyes inside the body silhouette with capsule proportions", () => {
    for (const eye of [CHARACTER_EYE_LEFT, CHARACTER_EYE_RIGHT]) {
      expect(eye.x - CHARACTER_EYE_RADIUS_X).toBeGreaterThanOrEqual(14);
      expect(eye.x + CHARACTER_EYE_RADIUS_X).toBeLessThanOrEqual(46);
      expect(eye.y - CHARACTER_EYE_RADIUS_Y).toBeGreaterThanOrEqual(14);
      expect(eye.y + CHARACTER_EYE_RADIUS_Y).toBeLessThanOrEqual(52);
    }
    expect(CHARACTER_EYE_RADIUS_Y).toBeGreaterThan(CHARACTER_EYE_RADIUS_X);
    expect(CHARACTER_EYE_RIGHT.x - CHARACTER_EYE_LEFT.x).toBeGreaterThan(
      2 * CHARACTER_EYE_RADIUS_X,
    );
  });

  it("fits the rendered visual size inside the 60px compact shell", () => {
    expect(CHARACTER_VISUAL_SIZE).toBeLessThanOrEqual(60);
    expect(CHARACTER_VISUAL_SIZE).toBeGreaterThan(38); // legacy 38px bound no longer constrains
  });

  it("renders a silhouette wider than the legacy 38px CatIcon with safe margins", () => {
    // Translated rendered bounding box: every path point moved by the static
    // pivot, mapped through the viewBox -> rendered-size scale. The true curve
    // lies inside this point hull, and the widest points are on-curve, so the
    // computed width is the rendered silhouette width.
    const pivot = CHARACTER_BODY_CENTER;
    const all = [
      CHARACTER_BODY_PATH,
      CHARACTER_EAR_LEFT_PATH,
      CHARACTER_EAR_RIGHT_PATH,
    ].flatMap(pathNumbers);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < all.length; i += 2) {
      minX = Math.min(minX, all[i] + pivot.x);
      maxX = Math.max(maxX, all[i] + pivot.x);
      minY = Math.min(minY, all[i + 1] + pivot.y);
      maxY = Math.max(maxY, all[i + 1] + pivot.y);
    }
    const renderedWidth = (maxX - minX) / CHARACTER_VIEWBOX * CHARACTER_VISUAL_SIZE;
    expect(renderedWidth).toBeGreaterThan(38);
    // Safe margins on every side of the 60x60 shell (points may overestimate
    // the true curve extent, so this is a conservative bound).
    expect(minX).toBeGreaterThanOrEqual(3);
    expect(CHARACTER_VIEWBOX - maxX).toBeGreaterThanOrEqual(3);
    expect(minY).toBeGreaterThanOrEqual(3);
    expect(CHARACTER_VIEWBOX - maxY).toBeGreaterThanOrEqual(3);
  });
});

describe("resolveCharacterAttentionTarget", () => {
  it("projects neutral for invalid or non-finite coordinates", () => {
    expect(resolveCharacterAttentionTarget({ x: Number.NaN, y: 40 }, CENTER, false))
      .toEqual(NEUTRAL_CHARACTER_ATTENTION_TARGET);
    expect(resolveCharacterAttentionTarget({ x: 40, y: Number.POSITIVE_INFINITY }, CENTER, false))
      .toEqual(NEUTRAL_CHARACTER_ATTENTION_TARGET);
    expect(resolveCharacterAttentionTarget({ x: 40, y: 40 }, { x: Number.NaN, y: 40 }, false))
      .toEqual(NEUTRAL_CHARACTER_ATTENTION_TARGET);
  });

  it("projects neutral beyond the compact response radius", () => {
    const far = { x: CENTER.x + CHARACTER_ATTENTION_RESPONSE_RADIUS + 1, y: CENTER.y };
    expect(resolveCharacterAttentionTarget(far, CENTER, false))
      .toEqual(NEUTRAL_CHARACTER_ATTENTION_TARGET);
  });

  it("projects neutral inside the center dead zone", () => {
    const jitter = {
      x: CENTER.x + CHARACTER_ATTENTION_DEAD_ZONE / 2,
      y: CENTER.y - CHARACTER_ATTENTION_DEAD_ZONE / 2,
    };
    expect(resolveCharacterAttentionTarget(jitter, CENTER, false))
      .toEqual(NEUTRAL_CHARACTER_ATTENTION_TARGET);
  });

  it("clamps the eye offset to the normal ellipse and keeps direction", () => {
    // At the response peak the intensity is exactly 1, so the eye reaches its
    // full clamped amplitude there.
    const right = resolveCharacterAttentionTarget(
      { x: CENTER.x + CHARACTER_ATTENTION_PEAK_DISTANCE, y: CENTER.y },
      CENTER,
      false,
    );
    expect(right.x).toBeCloseTo(CHARACTER_EYE_MAX_X, 6);
    expect(right.y).toBeCloseTo(0, 6);
    const upLeft = resolveCharacterAttentionTarget({ x: 40 - 20, y: 40 - 20 }, CENTER, false);
    expect(upLeft.x).toBeLessThan(0);
    expect(upLeft.y).toBeLessThan(0);
    expect(Math.abs(upLeft.x)).toBeLessThanOrEqual(CHARACTER_EYE_MAX_X + 1e-9);
    expect(Math.abs(upLeft.y)).toBeLessThanOrEqual(CHARACTER_EYE_MAX_Y + 1e-9);
  });

  it("rises continuously to a peak at the hotspot approach band and decays to zero at the radius", () => {
    const peakDistance = CHARACTER_ATTENTION_PEAK_DISTANCE;
    // The peak sits at the midpoint of [dead zone, response radius], i.e.
    // within the compact hotspot approach band (19px enter / 23px exit).
    expect(peakDistance).toBeGreaterThanOrEqual(19);
    expect(peakDistance).toBeLessThanOrEqual(26);
    // Monotonic rise from just past the dead zone to the peak.
    let previous = 0;
    for (let d = CHARACTER_ATTENTION_DEAD_ZONE + 1; d <= peakDistance; d += 1) {
      const target = resolveCharacterAttentionTarget({ x: CENTER.x + d, y: CENTER.y }, CENTER, false);
      expect(Math.abs(target.x), `rise at d=${d}`).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = Math.abs(target.x);
    }
    // Monotonic decay from the peak to the response radius.
    previous = Math.abs(
      resolveCharacterAttentionTarget({ x: CENTER.x + peakDistance, y: CENTER.y }, CENTER, false).x,
    );
    for (let d = peakDistance + 1; d < CHARACTER_ATTENTION_RESPONSE_RADIUS; d += 1) {
      const target = resolveCharacterAttentionTarget({ x: CENTER.x + d, y: CENTER.y }, CENTER, false);
      expect(Math.abs(target.x), `decay at d=${d}`).toBeLessThanOrEqual(previous + 1e-9);
      previous = Math.abs(target.x);
    }
  });

  it("projects exactly neutral at and beyond the response radius, nonzero just inside", () => {
    const exactlyAt = resolveCharacterAttentionTarget(
      { x: CENTER.x + CHARACTER_ATTENTION_RESPONSE_RADIUS, y: CENTER.y },
      CENTER,
      false,
    );
    expect(exactlyAt).toEqual(NEUTRAL_CHARACTER_ATTENTION_TARGET);
    const justOutside = resolveCharacterAttentionTarget(
      { x: CENTER.x + CHARACTER_ATTENTION_RESPONSE_RADIUS + 0.01, y: CENTER.y },
      CENTER,
      false,
    );
    expect(justOutside).toEqual(NEUTRAL_CHARACTER_ATTENTION_TARGET);
    const justInside = resolveCharacterAttentionTarget(
      { x: CENTER.x + CHARACTER_ATTENTION_RESPONSE_RADIUS - 0.5, y: CENTER.y },
      CENTER,
      false,
    );
    expect(justInside.x).toBeGreaterThan(0);
    expect(justInside.y).toBeCloseTo(0, 6);
    expect(justInside.bodyScale).toBeGreaterThan(1);
    expect(justInside.bodyScale).toBeLessThanOrEqual(1 + CHARACTER_BODY_MAX_SQUASH + 1e-9);
  });

  it("applies smaller reduced-motion amplitudes and zero body deformation", () => {
    const point = { x: 40 + 20, y: 40 - 20 };
    const normal = resolveCharacterAttentionTarget(point, CENTER, false);
    const reduced = resolveCharacterAttentionTarget(point, CENTER, true);
    expect(Math.abs(reduced.x)).toBeLessThan(Math.abs(normal.x));
    expect(Math.abs(reduced.y)).toBeLessThan(Math.abs(normal.y));
    expect(Math.abs(reduced.x)).toBeLessThanOrEqual(CHARACTER_EYE_MAX_X_REDUCED + 1e-9);
    expect(Math.abs(reduced.y)).toBeLessThanOrEqual(CHARACTER_EYE_MAX_Y_REDUCED + 1e-9);
    expect(reduced.bodyScale).toBe(1);
  });

  it("couples a tiny bounded body squash to the same continuous attention intensity", () => {
    const near = resolveCharacterAttentionTarget({ x: 40 + 10, y: 40 }, CENTER, false);
    expect(near.bodyScale).toBeGreaterThan(1);
    expect(near.bodyScale).toBeLessThanOrEqual(1 + CHARACTER_BODY_MAX_SQUASH + 1e-9);
    // Full squash exactly at the attention peak.
    const atPeak = resolveCharacterAttentionTarget(
      { x: CENTER.x + CHARACTER_ATTENTION_PEAK_DISTANCE, y: CENTER.y },
      CENTER,
      false,
    );
    expect(atPeak.bodyScale).toBeCloseTo(1 + CHARACTER_BODY_MAX_SQUASH, 6);
    // The decay side of the bump squashes less than the peak.
    const midDecay = resolveCharacterAttentionTarget({ x: CENTER.x + 35, y: CENTER.y }, CENTER, false);
    expect(midDecay.bodyScale).toBeGreaterThan(1);
    expect(midDecay.bodyScale).toBeLessThan(atPeak.bodyScale);
    const center = resolveCharacterAttentionTarget({ x: 40, y: 40 }, CENTER, false);
    expect(center.bodyScale).toBe(1);
  });
});

describe("resolveGatedSpringSource (Motion 12 stable-source gate)", () => {
  // Mirrors the host wiring: `held` is the last normal target the host keeps
  // in a ref; the gate output is exactly what the permanently-bound spring
  // sees.
  const makeStepper = () => {
    let held = 0;
    return (live: number, reduced: boolean): number => {
      const next = resolveGatedSpringSource(live, reduced, held);
      held = next;
      return next;
    };
  };

  it("follows the live target while normal, so the spring is never frozen mid-session", () => {
    const step = makeStepper();
    expect(step(0.5, false)).toBe(0.5);
    expect(step(2.2, false)).toBe(2.2);
    expect(step(0.4, false)).toBe(0.4);
  });

  it("holds a constant source while reduced, so the spring does zero work and leaves no tail", () => {
    const step = makeStepper();
    expect(step(2.2, false)).toBe(2.2);
    // Live targets keep varying (smaller direct attention renders instead),
    // but the spring source stays constant at the last normal target.
    expect(step(0.4, true)).toBe(2.2);
    expect(step(0.3, true)).toBe(2.2);
    expect(step(1.1, true)).toBe(2.2);
  });

  it("resumes spring-follow from the current condition after reduced -> normal (never permanently frozen)", () => {
    const step = makeStepper();
    // false -> true -> false: the exact cycle the Motion 12 source-rebinding
    // bug used to break (a spring left bound to the frozen source would stay
    // at zero forever after this sequence).
    expect(step(0.6, false)).toBe(0.6);
    expect(step(2.0, true)).toBe(0.6);
    expect(step(2.0, true)).toBe(0.6);
    expect(step(2.0, false)).toBe(2.0);
    expect(step(2.0, false)).toBe(2.0);
    // And the reverse order (mount reduced, then flip normal) also resumes.
    const step2 = makeStepper();
    expect(step2(1.5, true)).toBe(0);
    expect(step2(1.5, true)).toBe(0);
    expect(step2(1.5, false)).toBe(1.5);
    expect(step2(2.2, false)).toBe(2.2);
  });
});
