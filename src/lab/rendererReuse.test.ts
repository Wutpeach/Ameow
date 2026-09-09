import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, path), "utf8");
const shell = read("./PresentationLab.tsx");
const stage = read("./LabOverlayStage.tsx");
const ripple = read("./ripple/RippleCanvas.tsx");
const mainEntry = read("../main.tsx");
const vite = read("../../vite.config.ts");

describe("Browser Presentation Lab renderer boundaries", () => {
  it("keeps Ripple Lab-only and production renderer imports clean", () => {
    expect(shell).toContain('from "./ripple/RippleLab"');
    expect(mainEntry).not.toContain("ripple");
    const build = vite.slice(vite.indexOf("build: {"), vite.indexOf("test: {"));
    expect(build).toContain("index.html");
    expect(build).not.toContain("src/lab");
  });

  it("mounts one production WebGL2 surface only for retained fixture lanes", () => {
    expect(stage.match(/<ExpandedPresentationSurface\b/g)).toHaveLength(1);
    expect(stage).toContain("palette={THERMAL_PALETTE}");
    expect(stage).not.toContain("heatmap=");
    expect(stage).not.toContain("refraction=");
    expect(stage).not.toContain("boundaryHalo=");
    expect(shell).toContain('fullLane === "ripple" ? <RippleLab');
    expect(ripple).not.toContain("ExpandedPresentationSurface");
  });

  it("retains Download, Transcode, Mixed, Compact, and the previewPose seam", () => {
    for (const lane of ["download", "transcode", "mixed", "compact"]) expect(shell).toContain(lane);
    expect(shell).toContain("previewPose={activeCompactScenario?.previewPose");
    expect(shell).toContain("colors.bgGradientStart");
    expect(shell).toContain("colors.textPrimary");
    expect(shell).not.toContain("setHeatmap");
    expect(shell).not.toContain("intake-local");
  });
});
