import { describe, expect, it } from "vitest";

import {
  resolveMainWindowShellGeometryPlan,
  resolveMainWindowShellTransitionPlan,
} from "./mainWindowShellGeometry";

const monitor = {
  position: { x: 0, y: 0 },
  size: { width: 1920, height: 1080 },
  scaleFactor: 1,
};

describe("mainWindowShellGeometry", () => {
  it("resolves the Windows full shell without shadow gutter", () => {
    const plan = resolveMainWindowShellGeometryPlan({
      mode: "full",
      platform: "win32",
      windowPosition: { x: 120, y: 160 },
      currentNativeSize: { width: 200, height: 200 },
    });

    expect(plan.viewportSize).toBe(200);
    expect(plan.nativeBounds).toEqual({ x: 120, y: 160, width: 200, height: 200 });
    expect(plan.visualShell).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      radius: 16,
      clipPath: "inset(0 round 16px)",
    });
    expect(plan.shadowShell).toEqual(plan.visualShell);
  });

  it("resolves the macOS full shell with the shadow gutter in native viewport space", () => {
    const plan = resolveMainWindowShellGeometryPlan({
      mode: "full",
      platform: "darwin",
      windowPosition: { x: 120, y: 160 },
      nativeSizeStrategy: "target-mode-outer",
    });

    expect(plan.viewportSize).toBe(228);
    expect(plan.nativeBounds).toEqual({ x: 120, y: 160, width: 228, height: 228 });
    expect(plan.visualShell).toEqual({
      x: 14,
      y: 14,
      width: 200,
      height: 200,
      radius: 16,
      clipPath: "inset(0 round 16px)",
    });
  });

  it("keeps compact visual, reachable, hotspot, and native frames separate on Windows", () => {
    const plan = resolveMainWindowShellGeometryPlan({
      mode: "compact",
      platform: "win32",
      windowPosition: { x: 1900, y: 1040 },
      currentNativeSize: { width: 200, height: 200 },
      nativeSizeStrategy: "preserve-current",
      monitor,
      edgePadding: 8,
    });

    expect(plan.nativeBounds).toEqual({ x: 1832, y: 992, width: 200, height: 200 });
    expect(plan.unclampedNativeBounds).toEqual({ x: 1900, y: 1040, width: 200, height: 200 });
    expect(plan.visualShell).toEqual({
      x: 10,
      y: 10,
      width: 60,
      height: 60,
      radius: 100,
      clipPath: "inset(0 round 100px)",
    });
    expect(plan.compactReachableFrame).toEqual({ x: 0, y: 0, width: 80, height: 80 });
    expect(plan.hotspot).toEqual({
      frameSize: 38,
      centerX: 40,
      centerY: 40,
      enterRadius: 19,
      exitRadius: 23,
    });
  });

  it("resolves macOS compact target geometry without borrowing the Windows hotspot frame", () => {
    const plan = resolveMainWindowShellGeometryPlan({
      mode: "compact",
      platform: "darwin",
      windowPosition: { x: 40, y: 50 },
      nativeSizeStrategy: "target-mode-outer",
    });

    expect(plan.nativeBounds).toEqual({ x: 40, y: 50, width: 88, height: 88 });
    expect(plan.visualShell).toMatchObject({
      x: 14,
      y: 14,
      width: 60,
      height: 60,
    });
    expect(plan.compactReachableFrame).toEqual({ x: 0, y: 0, width: 88, height: 88 });
    expect(plan.hotspot).toEqual({
      frameSize: 60,
      centerX: 44,
      centerY: 44,
      enterRadius: 30,
      exitRadius: 34,
    });
  });

  it("keeps transition timing outside geometry and preserves current visual descriptors", () => {
    const geometry = resolveMainWindowShellGeometryPlan({
      mode: "full",
      platform: "win32",
      windowPosition: { x: 0, y: 0 },
      currentNativeSize: { width: 200, height: 200 },
    });

    const plan = resolveMainWindowShellTransitionPlan({
      token: 7,
      targetMode: "full",
      geometry,
      visualIntent: "full",
      reducedMotion: false,
    });

    expect(plan.token).toBe(7);
    expect(plan.geometry).toBe(geometry);
    expect(plan.timing.native).toEqual({ kind: "none" });
    expect(plan.timing.visual).toEqual({
      kind: "spring",
      transition: { type: "spring", stiffness: 460, damping: 36 },
    });
    expect(plan.timing.icon).toEqual({ kind: "hidden" });
    expect("timing" in geometry).toBe(false);
  });

  it("represents compact native clamp and reduced motion without changing geometry", () => {
    const geometry = resolveMainWindowShellGeometryPlan({
      mode: "compact",
      platform: "win32",
      windowPosition: { x: 0, y: 0 },
      currentNativeSize: { width: 200, height: 200 },
    });

    const plan = resolveMainWindowShellTransitionPlan({
      token: 8,
      targetMode: "compact",
      geometry,
      visualIntent: "compact",
      reducedMotion: true,
    });

    expect(plan.timing.native).toEqual({
      kind: "animateBounds",
      durationMs: 0,
      easing: "instant",
    });
    expect(plan.timing.visual).toEqual({
      kind: "tween",
      transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
    });
    expect(plan.timing.icon).toEqual({
      kind: "currentMinimizedIconHandoff",
      enter: { duration: 0.12 },
      leave: { duration: 0.12 },
      exit: { duration: 0.01 },
    });
    expect(plan.geometry).toBe(geometry);
  });
});
