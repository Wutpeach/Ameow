import { describe, expect, it } from "vitest";

import {
  MAIN_WINDOW_COMPACT_MOTION_EASE,
  MAIN_WINDOW_COMPACT_VISIBILITY_MOVE_DURATION_MS,
  MAIN_WINDOW_FULL_PANEL_RADIUS,
  MAIN_WINDOW_INITIAL_PANEL_SCALE,
  MAIN_WINDOW_MINIMIZED_ICON_ENTER_TRANSITION,
  MAIN_WINDOW_MINIMIZED_ICON_EXIT_TRANSITION,
  MAIN_WINDOW_MINIMIZED_ICON_LEAVE_TRANSITION,
  MAIN_WINDOW_MINIMIZED_ICON_REDUCED_EXIT_TRANSITION,
  MAIN_WINDOW_MINIMIZED_ICON_REDUCED_MOTION_TRANSITION,
  MAIN_WINDOW_MINIMIZED_ICON_SIZE,
  MAIN_WINDOW_MINIMIZED_PANEL_RADIUS,
  MAIN_WINDOW_MINIMIZED_PANEL_SCALE,
  MAIN_WINDOW_NATIVE_BOUNDS_BASELINE,
  MAIN_WINDOW_PANEL_COMPACT_TWEEN_TRANSITION,
  MAIN_WINDOW_PANEL_FULL_ELASTIC_SCALE_KEYFRAMES,
  MAIN_WINDOW_PANEL_FULL_ELASTIC_SCALE_TIMES,
  MAIN_WINDOW_PANEL_FULL_SPRING_TRANSITION,
  MAIN_WINDOW_PANEL_INITIAL_TWEEN_TRANSITION,
  MAIN_WINDOW_PANEL_INSTANT_TRANSITION,
} from "./mainWindowMotionBaseline";

describe("mainWindowMotionBaseline", () => {
  it("captures the tuned Phase 2F panel visual timing contract", () => {
    expect(MAIN_WINDOW_COMPACT_MOTION_EASE).toEqual([0.22, 1, 0.36, 1]);
    expect(MAIN_WINDOW_COMPACT_VISIBILITY_MOVE_DURATION_MS).toBe(180);

    expect(MAIN_WINDOW_MINIMIZED_ICON_SIZE).toBe(38);
    expect(MAIN_WINDOW_INITIAL_PANEL_SCALE).toBe(0.88);
    expect(MAIN_WINDOW_MINIMIZED_PANEL_SCALE).toBe(1);
    expect(MAIN_WINDOW_FULL_PANEL_RADIUS).toBe(16);
    expect(MAIN_WINDOW_MINIMIZED_PANEL_RADIUS).toBe(100);
    expect(MAIN_WINDOW_PANEL_FULL_ELASTIC_SCALE_KEYFRAMES).toEqual([1, 1.01, 1]);
    expect(MAIN_WINDOW_PANEL_FULL_ELASTIC_SCALE_TIMES).toEqual([0, 0.66, 1]);

    expect(MAIN_WINDOW_PANEL_INITIAL_TWEEN_TRANSITION).toEqual({
      duration: 0.2,
      ease: [0.22, 1, 0.36, 1],
    });
    expect(MAIN_WINDOW_PANEL_COMPACT_TWEEN_TRANSITION).toEqual({
      duration: 0.2,
      ease: [0.22, 1, 0.36, 1],
    });
    expect(MAIN_WINDOW_PANEL_INSTANT_TRANSITION).toEqual({ duration: 0 });
    expect(MAIN_WINDOW_PANEL_FULL_SPRING_TRANSITION).toEqual({
      type: "spring",
      stiffness: 460,
      damping: 36,
    });
  });

  it("captures the tuned Phase 2F minimized icon handoff timing contract", () => {
    expect(MAIN_WINDOW_MINIMIZED_ICON_REDUCED_MOTION_TRANSITION).toEqual({
      duration: 0.12,
    });
    expect(MAIN_WINDOW_MINIMIZED_ICON_ENTER_TRANSITION).toEqual({
      duration: 0.16,
      ease: [0.22, 1, 0.36, 1],
    });
    expect(MAIN_WINDOW_MINIMIZED_ICON_LEAVE_TRANSITION).toEqual({
      duration: 0.2,
      times: [0, 0.64, 1],
      ease: [0.22, 1, 0.36, 1],
    });
    expect(MAIN_WINDOW_MINIMIZED_ICON_REDUCED_EXIT_TRANSITION).toEqual({
      duration: 0.01,
    });
    expect(MAIN_WINDOW_MINIMIZED_ICON_EXIT_TRANSITION).toEqual({
      duration: 0.06,
      ease: [0.22, 1, 0.36, 1],
    });
  });

  it("classifies current native bounds paths before geometry refactoring", () => {
    expect(MAIN_WINDOW_NATIVE_BOUNDS_BASELINE).toMatchObject({
      mainWindowCreation: {
        kind: "initialNativeBounds",
        callsAnimateBounds: false,
        changesNativeSize: true,
      },
      compactStartupNormalization: {
        kind: "instantStartupResize",
        callsAnimateBounds: true,
        changesNativeSize: true,
      },
      hoverRequestExpand: {
        kind: "visualOnly",
        callsAnimateBounds: false,
        changesNativeSize: false,
      },
      hoverRequestCollapse: {
        kind: "visualOnly",
        callsAnimateBounds: false,
        changesNativeSize: false,
      },
      compactVisibilityClamp: {
        kind: "positionClampOnly",
        callsAnimateBounds: true,
        changesNativeSize: false,
        preservesCurrentSize: true,
      },
      foregroundTaskRestore: {
        kind: "restoreSynchronization",
        callsAnimateBounds: false,
        changesNativeSize: false,
      },
      shortcutShow: {
        kind: "restoreSynchronization",
        callsAnimateBounds: false,
        changesNativeSize: false,
      },
    });
  });
});
