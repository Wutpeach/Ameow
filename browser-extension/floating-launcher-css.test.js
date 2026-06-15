import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const launcherCss = readFileSync(path.resolve("browser-extension/floating-launcher.css"), "utf8");

describe("browser extension floating launcher CSS", () => {
  it("keeps the normal connected launcher state visually neutral", () => {
    expect(launcherCss).not.toMatch(/data-connection-state=["']connected["'][\s\S]*?rgba\(52,\s*211,\s*153/);
  });

  it("renders the mascot on a circular badge", () => {
    expect(launcherCss).toContain(".ameow-launcher-handle::before");
    expect(launcherCss).toContain("--ameow-launcher-mascot-badge-bg");
    expect(launcherCss).toMatch(/\.ameow-launcher-handle::before\s*\{[\s\S]*?border-radius:\s*999px;/);
  });
});
