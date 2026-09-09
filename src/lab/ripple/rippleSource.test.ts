import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RIPPLE_FRAGMENT_SOURCE, RIPPLE_USER_BASELINE, RIPPLE_VERTEX_SOURCE, sourcePinchAt } from "./rippleSource";

const normalizeGlsl = (source: string): string => source.replace(/\s+/g, "");
const digest = (source: string): string => createHash("sha256").update(normalizeGlsl(source)).digest("hex");
const PINNED_GLSL_DIGESTS = Object.freeze({
  vertex: "d5732e0bee6c81cef132f12d9778652d06ce47b16c3f962d8e68a7e21a08d579",
  fragment: "09d02c4b0c0e7c36533982adaeba851b71b359ab4d22c1fea96f9b3f359ca3fa",
});

describe("Ripple source-fidelity kernel", () => {
  it("pins the complete normalized upstream WebGL1 source and baseline parameters", () => {
    expect(digest(RIPPLE_VERTEX_SOURCE)).toBe(PINNED_GLSL_DIGESTS.vertex);
    expect(digest(RIPPLE_FRAGMENT_SOURCE)).toBe(PINNED_GLSL_DIGESTS.fragment);
    expect(normalizeGlsl(RIPPLE_VERTEX_SOURCE)).toContain("attributevec2a_pos;varyingvec2v_uv;");
    expect(normalizeGlsl(RIPPLE_FRAGMENT_SOURCE).match(/texture2D/g)).toHaveLength(6);
    expect(RIPPLE_USER_BASELINE).toMatchObject({ durationMs: 1400, sigma: 0.15, waveFreq: 5, pushAmt: 0.155, caStrength: 0.0225, glow: 0.37, noiseWarp: 0.7, pinchStrength: 0.14 });
    expect(RIPPLE_FRAGMENT_SOURCE).toContain("float normDist = clamp(dist / maxDist, 0.0, 1.0);");
    expect(RIPPLE_FRAGMENT_SOURCE).toContain("smoothstep(waveFront + feather, waveFront - feather, warpedDist)");
    expect(RIPPLE_FRAGMENT_SOURCE).toContain("u_pinch");
    expect(sourcePinchAt(0.1 / 1.4, true)).toBeCloseTo(0.14, 5);
    expect(sourcePinchAt(0.1 / 1.4, false)).toBe(0);
  });

  it("retains provenance and excludes fictional blend semantics", () => {
    const source = readFileSync(resolve(import.meta.dirname, "rippleSource.ts"), "utf8");
    expect(source).toContain("99ee6e4412bcab34bcb4337f5f21845ae87c12d5");
    expect(source).toContain("Copyright (c) 2026 Mick Cesanek");
    expect(source).toContain("Minsang (@radiofun8)");
    expect(source).not.toContain("blendStrength");
  });
});
