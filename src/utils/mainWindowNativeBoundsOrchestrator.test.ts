import { describe, expect, it, vi } from "vitest";

import type {
  AmeowAnimateBoundsResult,
  AmeowBounds,
  AmeowDisplay,
  AmeowPoint,
  AmeowSize,
} from "../types/electronBridge";
import {
  beginMainWindowNativeBoundsTransition,
  ensureMainWindowCompactTargetVisible,
  getMainWindowCurrentPosition,
  isMainWindowNativeBoundsTransitionStillCurrent,
  resizeMainWindowPreservingPosition,
  syncMainWindowCurrentPositionCache,
  type MainWindowNativeBoundsPositionCache,
  type MainWindowNativeBoundsTransitionRef,
} from "./mainWindowNativeBoundsOrchestrator";

const monitor: AmeowDisplay = {
  position: { x: 0, y: 0 },
  size: { width: 1920, height: 1080 },
  scaleFactor: 1,
};

const createCurrentWindow = ({
  position = { x: 120, y: 160 },
  size = { width: 200, height: 200 },
  transitionToken = null,
}: {
  position?: AmeowPoint;
  size?: AmeowSize;
  transitionToken?: number | null;
} = {}) => ({
  outerPosition: vi.fn<() => Promise<AmeowPoint>>().mockResolvedValue(position),
  outerSize: vi.fn<() => Promise<AmeowSize>>().mockResolvedValue(size),
  animateBounds: vi.fn<(
    bounds: AmeowBounds,
    options?: { durationMs?: number; transitionToken?: number },
  ) => Promise<AmeowAnimateBoundsResult>>().mockResolvedValue({ transitionToken }),
});

const createSystem = ({
  currentMonitor = monitor,
}: {
  currentMonitor?: AmeowDisplay | null;
} = {}) => ({
  currentMonitor: vi.fn<() => Promise<AmeowDisplay | null>>()
    .mockResolvedValue(currentMonitor),
});

describe("mainWindowNativeBoundsOrchestrator", () => {
  it("advances native bounds tokens and clears pending compact token for a newer full target", () => {
    const transitionRef: MainWindowNativeBoundsTransitionRef = {
      current: { token: 0, target: "full" },
    };
    const pendingCompactTokenRef = { current: 12 };

    const compactToken = beginMainWindowNativeBoundsTransition({
      transitionRef,
      pendingCompactTokenRef,
      target: "compact",
    });
    expect(compactToken).toBe(1);
    expect(pendingCompactTokenRef.current).toBe(12);

    const fullToken = beginMainWindowNativeBoundsTransition({
      transitionRef,
      pendingCompactTokenRef,
      target: "full",
    });
    expect(fullToken).toBe(2);
    expect(pendingCompactTokenRef.current).toBeNull();
    expect(isMainWindowNativeBoundsTransitionStillCurrent({
      transitionRef,
      expectedToken: compactToken,
      expectedTarget: "compact",
    })).toBe(false);
  });

  it("uses cached position reads until explicit sync refreshes the cache", async () => {
    const currentWindow = createCurrentWindow({ position: { x: 20, y: 30 } });
    const positionCacheRef: MainWindowNativeBoundsPositionCache = {
      current: { x: 10, y: 12 },
    };

    await expect(getMainWindowCurrentPosition({
      currentWindow,
      positionCacheRef,
    })).resolves.toEqual({ x: 10, y: 12 });
    expect(currentWindow.outerPosition).not.toHaveBeenCalled();

    await expect(syncMainWindowCurrentPositionCache({
      currentWindow,
      positionCacheRef,
    })).resolves.toEqual({ x: 20, y: 30 });
    expect(positionCacheRef.current).toEqual({ x: 20, y: 30 });
  });

  it("resizes the native window at the cached position without animating", async () => {
    const currentWindow = createCurrentWindow({ transitionToken: 7 });
    const positionCacheRef: MainWindowNativeBoundsPositionCache = {
      current: { x: 50, y: 70 },
    };

    await expect(resizeMainWindowPreservingPosition({
      currentWindow,
      positionCacheRef,
      size: { width: 200, height: 200 },
      transitionToken: 7,
    })).resolves.toBe(7);

    expect(currentWindow.animateBounds).toHaveBeenCalledWith(
      { x: 50, y: 70, width: 200, height: 200 },
      { durationMs: 0, transitionToken: 7 },
    );
    expect(positionCacheRef.current).toEqual({ x: 50, y: 70 });
  });

  it("moves only position when compact clamp is needed and completion token is current", async () => {
    const currentWindow = createCurrentWindow({
      position: { x: 1900, y: 1040 },
      size: { width: 200, height: 200 },
      transitionToken: 4,
    });
    const system = createSystem();
    const positionCacheRef: MainWindowNativeBoundsPositionCache = { current: null };
    const transitionRef: MainWindowNativeBoundsTransitionRef = {
      current: { token: 4, target: "compact" },
    };

    await ensureMainWindowCompactTargetVisible({
      currentWindow,
      system,
      positionCacheRef,
      transitionRef,
      transitionToken: 4,
      platform: "win32",
      edgePadding: 8,
      reducedMotion: false,
    });

    expect(currentWindow.animateBounds).toHaveBeenCalledWith(
      { x: 1832, y: 992, width: 200, height: 200 },
      { durationMs: 180, transitionToken: 4 },
    );
    expect(positionCacheRef.current).toEqual({ x: 1832, y: 992 });
  });

  it("does not run compact clamp after the transition becomes stale before animation starts", async () => {
    const currentWindow = createCurrentWindow({
      position: { x: 1900, y: 1040 },
      size: { width: 200, height: 200 },
      transitionToken: 4,
    });
    const system = createSystem();
    const positionCacheRef: MainWindowNativeBoundsPositionCache = { current: null };
    const transitionRef: MainWindowNativeBoundsTransitionRef = {
      current: { token: 4, target: "compact" },
    };
    system.currentMonitor.mockImplementation(async () => {
      transitionRef.current = { token: 5, target: "full" };
      return monitor;
    });

    await ensureMainWindowCompactTargetVisible({
      currentWindow,
      system,
      positionCacheRef,
      transitionRef,
      transitionToken: 4,
      platform: "win32",
      edgePadding: 8,
      reducedMotion: false,
    });

    expect(currentWindow.animateBounds).not.toHaveBeenCalled();
    expect(positionCacheRef.current).toEqual({ x: 1900, y: 1040 });
  });

  it("does not update the position cache when compact clamp completion is stale", async () => {
    const currentWindow = createCurrentWindow({
      position: { x: 1900, y: 1040 },
      size: { width: 200, height: 200 },
      transitionToken: 4,
    });
    const system = createSystem();
    const positionCacheRef: MainWindowNativeBoundsPositionCache = { current: null };
    const transitionRef: MainWindowNativeBoundsTransitionRef = {
      current: { token: 4, target: "compact" },
    };
    currentWindow.animateBounds.mockImplementation(async () => {
      transitionRef.current = { token: 5, target: "full" };
      return { transitionToken: 4 };
    });

    await ensureMainWindowCompactTargetVisible({
      currentWindow,
      system,
      positionCacheRef,
      transitionRef,
      transitionToken: 4,
      platform: "win32",
      edgePadding: 8,
      reducedMotion: false,
    });

    expect(currentWindow.animateBounds).toHaveBeenCalledOnce();
    expect(positionCacheRef.current).toEqual({ x: 1900, y: 1040 });
  });

  it("uses instant compact clamp timing when reduced motion is enabled", async () => {
    const currentWindow = createCurrentWindow({
      position: { x: 1900, y: 1040 },
      size: { width: 200, height: 200 },
      transitionToken: 6,
    });
    const system = createSystem();
    const transitionRef: MainWindowNativeBoundsTransitionRef = {
      current: { token: 6, target: "compact" },
    };

    await ensureMainWindowCompactTargetVisible({
      currentWindow,
      system,
      positionCacheRef: { current: null },
      transitionRef,
      transitionToken: 6,
      platform: "win32",
      edgePadding: 8,
      reducedMotion: true,
    });

    expect(currentWindow.animateBounds).toHaveBeenCalledWith(
      { x: 1832, y: 992, width: 200, height: 200 },
      { durationMs: 0, transitionToken: 6 },
    );
  });
});
