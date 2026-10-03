import { describe, expect, it } from "vitest";

import { resolveMainWindowGeometry } from "./geometry";

describe("mainWindow geometry (spatial only)", () => {
  it("full geometry preserves the stable full viewport with shadow gutter", () => {
    const geometry = resolveMainWindowGeometry({ mode: "full", platform: "win32" });
    expect(geometry.viewportSize).toBe(228);
    expect(geometry.visualShell).toEqual({
      x: 14,
      y: 14,
      width: 200,
      height: 200,
      radius: 16,
      clipPath: "inset(0 round 16px)",
    });
    expect(geometry.shadowShell).toEqual(geometry.visualShell);
    expect(geometry.compactReachableFrame).toEqual({ x: 0, y: 0, width: 56, height: 56 });
  });

  it("full geometry has no gutter on platforms without one", () => {
    const geometry = resolveMainWindowGeometry({ mode: "full", platform: "linux" });
    expect(geometry.viewportSize).toBe(200);
    expect(geometry.visualShell.x).toBe(0);
    expect(geometry.visualShell.width).toBe(200);
  });

  it("compact geometry centers the icon shell in the reachable frame", () => {
    const geometry = resolveMainWindowGeometry({ mode: "compact", platform: "win32" });
    expect(geometry.viewportSize).toBe(228);
    expect(geometry.visualShell).toEqual({
      x: 7,
      y: 7,
      width: 42,
      height: 42,
      radius: 100,
      clipPath: "inset(0 round 100px)",
    });
    expect(geometry.hotspot).toEqual({
      frameSize: 42,
      centerX: 28,
      centerY: 28,
      enterRadius: 21,
      exitRadius: 27,
    });
  });

  it("compact hotspot uses the shell frame on macOS", () => {
    const geometry = resolveMainWindowGeometry({ mode: "compact", platform: "darwin" });
    expect(geometry.hotspot).toEqual({
      frameSize: 42,
      centerX: 28,
      centerY: 28,
      enterRadius: 21,
      exitRadius: 27,
    });
  });

  it("geometry carries no timing, epoch, monitor, or native bounds fields", () => {
    const geometry = resolveMainWindowGeometry({ mode: "full", platform: "win32" });
    const serialized = JSON.parse(JSON.stringify(geometry)) as Record<string, unknown>;
    expect(Object.keys(serialized).sort()).toEqual([
      "compactReachableFrame",
      "hotspot",
      "mode",
      "platform",
      "shadowShell",
      "viewportSize",
      "visualShell",
    ]);
  });
});
