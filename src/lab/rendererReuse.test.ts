import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, path), "utf8");
const shell = read("./PresentationLab.tsx");
const stage = read("./LabOverlayStage.tsx");
const scenarios = read("./scenarios.ts");
const ripple = read("./ripple/RippleCanvas.tsx");
const capture = read("../../scripts/capture-lab-smoke.mjs");
const mainEntry = read("../main.tsx");
const vite = read("../../vite.config.ts");

describe("Browser Presentation Lab renderer boundaries", () => {
  it("keeps Ripple Lab-only and production renderer imports clean", () => {
    expect(shell).toContain('from "./ripple/RippleLab"');
    expect(scenarios).toContain('id: "ripple-reference"');
    expect(mainEntry).not.toContain("ripple");
    const build = vite.slice(vite.indexOf("build: {"), vite.indexOf("test: {"));
    expect(build).toContain("index.html");
    expect(build).not.toContain("src/lab");
  });

  it("mounts the one production WebGL2 surface only through the shared stage", () => {
    expect(stage.match(/<ExpandedPresentationSurface\b/g)).toHaveLength(1);
    expect(stage).toContain("palette={THERMAL_PALETTE}");
    expect(stage).not.toContain("readPixels");
    expect(stage).not.toContain("backingScale");
    expect(shell).toContain('scenario.renderer === "ripple"');
    expect(ripple).not.toContain("ExpandedPresentationSurface");
  });

  it("derives target and overlays from the registry without a second UI authority", () => {
    expect(shell).toContain("LAB_SCENARIOS.map");
    expect(shell).toContain("scenario.target");
    expect(shell).toContain("showRuntimeOverlay={overlayProjection?.showRuntimeIndicator === true}");
    expect(shell).toContain("data-lab-ready");
  });

  it("waits for the selected renderer and retains the required capture set plus active WebGL evidence", () => {
    expect(shell).toContain("const markScenarioReady");
    expect(shell).toContain("const readinessToken = useMemo(() => Symbol(scenario.id), [scenario.id]);");
    expect(shell).toContain("readyToken === readinessToken");
    expect(shell).not.toContain("requestAnimationFrame");
    expect(stage).toContain("onCapturableFrame={onCapturableFrame}");
    expect(ripple).toContain("onCapturableFrameRef.current?.()");
    expect(ripple).toContain("resources.gl.isContextLost()");
    expect(capture).toContain('"compact-pointer", "download-queued", "transcode-failed", "runtime-failed"');
    expect(capture).toContain('"download-active"');
  });
});
