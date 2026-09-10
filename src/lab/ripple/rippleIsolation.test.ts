import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(resolve(import.meta.dirname, path), "utf8");

describe("Ripple Lab isolation", () => {
  const entry = read("../lab-main.tsx");
  const shell = read("../PresentationLab.tsx");
  const scenarios = read("../scenarios.ts");
  const vite = read("../../../vite.config.ts");
  const canvas = read("./RippleCanvas.tsx");

  it("uses the ordinary Lab route and shared URL contract", () => {
    expect(entry).toContain("PresentationLab");
    expect(entry).toContain("parseLabUrlState");
    expect(shell).toContain("serializeLabUrlState");
    expect(scenarios).toContain('id: "ripple-reference"');
    const build = vite.slice(vite.indexOf("build: {"), vite.indexOf("test: {"));
    expect(build).toContain("index.html");
    expect(build).not.toContain("src/lab");
  });

  it("retains the standalone Ripple reference without production WebGL2 coupling", () => {
    expect(shell).toContain('scenario.renderer === "ripple"');
    expect(canvas).toContain("PANEL_SIZE = 200");
    expect(canvas).not.toContain("ExpandedPresentationSurface");
  });
});
