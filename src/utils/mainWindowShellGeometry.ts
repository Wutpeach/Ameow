import {
  getMainWindowCompactOuterSize,
  getMainWindowFullOuterSize,
  getMainWindowFullShadowGutter,
  MAIN_WINDOW_COMPACT_SHELL_SIZE,
  MAIN_WINDOW_PANEL_SIZE,
} from "../constants/windowMetrics";
import type { AmeowBounds, AmeowDisplay, AmeowPoint, AmeowSize } from "../types/electronBridge";
import { resolveMainWindowCompactVisibilityBounds } from "./mainWindowCompactBounds";
import {
  MAIN_WINDOW_COMPACT_VISIBILITY_MOVE_DURATION_MS,
  MAIN_WINDOW_FULL_PANEL_RADIUS,
  MAIN_WINDOW_MINIMIZED_ICON_ENTER_TRANSITION,
  MAIN_WINDOW_MINIMIZED_ICON_EXIT_TRANSITION,
  MAIN_WINDOW_MINIMIZED_ICON_LEAVE_TRANSITION,
  MAIN_WINDOW_MINIMIZED_ICON_REDUCED_EXIT_TRANSITION,
  MAIN_WINDOW_MINIMIZED_ICON_REDUCED_MOTION_TRANSITION,
  MAIN_WINDOW_MINIMIZED_ICON_SIZE,
  MAIN_WINDOW_MINIMIZED_PANEL_RADIUS,
  MAIN_WINDOW_PANEL_COMPACT_TWEEN_TRANSITION,
  MAIN_WINDOW_PANEL_FULL_SPRING_TRANSITION,
  MAIN_WINDOW_PANEL_INITIAL_TWEEN_TRANSITION,
  MAIN_WINDOW_PANEL_INSTANT_TRANSITION,
} from "./mainWindowMotionBaseline";

export type MainWindowShellGeometryMode = "compact" | "full";

export type MainWindowShellNativeSizeStrategy =
  | "preserve-current"
  | "target-mode-outer";

export type MainWindowShellFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MainWindowShellVisualFrame = MainWindowShellFrame & {
  radius: number;
  clipPath: string;
};

export type MainWindowShellHotspotFrame = {
  frameSize: number;
  centerX: number;
  centerY: number;
  enterRadius: number;
  exitRadius: number;
};

export type MainWindowShellGeometryPlan = {
  mode: MainWindowShellGeometryMode;
  platform: NodeJS.Platform;
  nativeSizeStrategy: MainWindowShellNativeSizeStrategy;
  viewportSize: number;
  nativeBounds: AmeowBounds;
  unclampedNativeBounds: AmeowBounds;
  visualShell: MainWindowShellVisualFrame;
  shadowShell: MainWindowShellVisualFrame;
  compactReachableFrame: MainWindowShellFrame;
  hotspot: MainWindowShellHotspotFrame;
};

export type ResolveMainWindowShellGeometryPlanOptions = {
  mode: MainWindowShellGeometryMode;
  platform: NodeJS.Platform;
  windowPosition: AmeowPoint;
  currentNativeSize?: AmeowSize;
  nativeSizeStrategy?: MainWindowShellNativeSizeStrategy;
  monitor?: AmeowDisplay | null;
  edgePadding?: number;
};

export type MainWindowShellVisualTimingIntent =
  | "initial"
  | "compact"
  | "full"
  | "instant";

export type MainWindowShellVisualTiming =
  | { kind: "instant"; transition: typeof MAIN_WINDOW_PANEL_INSTANT_TRANSITION }
  | { kind: "tween"; transition: typeof MAIN_WINDOW_PANEL_INITIAL_TWEEN_TRANSITION | typeof MAIN_WINDOW_PANEL_COMPACT_TWEEN_TRANSITION }
  | { kind: "spring"; transition: typeof MAIN_WINDOW_PANEL_FULL_SPRING_TRANSITION };

export type MainWindowShellNativeTiming =
  | { kind: "none" }
  | {
    kind: "animateBounds";
    durationMs: number;
    easing: "currentBoundsEase" | "instant";
  };

export type MainWindowShellIconTiming =
  | { kind: "hidden" }
  | {
    kind: "currentMinimizedIconHandoff";
    enter: typeof MAIN_WINDOW_MINIMIZED_ICON_ENTER_TRANSITION | typeof MAIN_WINDOW_MINIMIZED_ICON_REDUCED_MOTION_TRANSITION;
    leave: typeof MAIN_WINDOW_MINIMIZED_ICON_LEAVE_TRANSITION | typeof MAIN_WINDOW_MINIMIZED_ICON_REDUCED_MOTION_TRANSITION;
    exit: typeof MAIN_WINDOW_MINIMIZED_ICON_EXIT_TRANSITION | typeof MAIN_WINDOW_MINIMIZED_ICON_REDUCED_EXIT_TRANSITION;
  };

export type MainWindowShellTransitionPlan = {
  token: number;
  targetMode: MainWindowShellGeometryMode;
  geometry: MainWindowShellGeometryPlan;
  timing: {
    native: MainWindowShellNativeTiming;
    visual: MainWindowShellVisualTiming;
    icon: MainWindowShellIconTiming;
  };
};

export type ResolveMainWindowShellTransitionPlanOptions = {
  token: number;
  targetMode: MainWindowShellGeometryMode;
  geometry: MainWindowShellGeometryPlan;
  visualIntent: MainWindowShellVisualTimingIntent;
  reducedMotion: boolean;
  nativePath?: "none" | "compactVisibilityClamp";
};

const formatMainWindowClipPath = (radius: number): string => `inset(0 round ${radius}px)`;

const normalizeSize = (size: AmeowSize): AmeowSize => ({
  width: Math.max(1, Math.round(size.width)),
  height: Math.max(1, Math.round(size.height)),
});

const resolveNativeSize = ({
  mode,
  platform,
  currentNativeSize,
  nativeSizeStrategy,
}: {
  mode: MainWindowShellGeometryMode;
  platform: NodeJS.Platform;
  currentNativeSize?: AmeowSize;
  nativeSizeStrategy: MainWindowShellNativeSizeStrategy;
}): AmeowSize => {
  if (nativeSizeStrategy === "preserve-current" && currentNativeSize) {
    return normalizeSize(currentNativeSize);
  }

  const targetSize = mode === "compact"
    ? getMainWindowCompactOuterSize(platform)
    : getMainWindowFullOuterSize(platform);
  return {
    width: targetSize,
    height: targetSize,
  };
};

const resolveVisualShell = (
  mode: MainWindowShellGeometryMode,
  platform: NodeJS.Platform,
): MainWindowShellVisualFrame => {
  if (mode === "compact") {
    const compactOuterSize = getMainWindowCompactOuterSize(platform);
    const inset = Math.round((compactOuterSize - MAIN_WINDOW_COMPACT_SHELL_SIZE) / 2);
    return {
      x: inset,
      y: inset,
      width: MAIN_WINDOW_COMPACT_SHELL_SIZE,
      height: MAIN_WINDOW_COMPACT_SHELL_SIZE,
      radius: MAIN_WINDOW_MINIMIZED_PANEL_RADIUS,
      clipPath: formatMainWindowClipPath(MAIN_WINDOW_MINIMIZED_PANEL_RADIUS),
    };
  }

  const gutter = getMainWindowFullShadowGutter(platform);
  return {
    x: gutter,
    y: gutter,
    width: MAIN_WINDOW_PANEL_SIZE,
    height: MAIN_WINDOW_PANEL_SIZE,
    radius: MAIN_WINDOW_FULL_PANEL_RADIUS,
    clipPath: formatMainWindowClipPath(MAIN_WINDOW_FULL_PANEL_RADIUS),
  };
};

const resolveCompactHotspot = (platform: NodeJS.Platform): MainWindowShellHotspotFrame => {
  const compactOuterSize = getMainWindowCompactOuterSize(platform);
  const frameSize = platform === "darwin"
    ? MAIN_WINDOW_COMPACT_SHELL_SIZE
    : MAIN_WINDOW_MINIMIZED_ICON_SIZE;
  return {
    frameSize,
    centerX: compactOuterSize / 2,
    centerY: compactOuterSize / 2,
    enterRadius: frameSize / 2,
    exitRadius: frameSize / 2 + 4,
  };
};

export const resolveMainWindowShellGeometryPlan = ({
  mode,
  platform,
  windowPosition,
  currentNativeSize,
  nativeSizeStrategy = "preserve-current",
  monitor = null,
  edgePadding = 0,
}: ResolveMainWindowShellGeometryPlanOptions): MainWindowShellGeometryPlan => {
  const viewportSize = getMainWindowFullOuterSize(platform);
  const nativeSize = resolveNativeSize({
    mode,
    platform,
    currentNativeSize,
    nativeSizeStrategy,
  });
  const unclampedNativeBounds = {
    x: Math.round(windowPosition.x),
    y: Math.round(windowPosition.y),
    width: nativeSize.width,
    height: nativeSize.height,
  };
  const compactOuterSize = getMainWindowCompactOuterSize(platform);
  const nativeBounds = mode === "compact"
    ? resolveMainWindowCompactVisibilityBounds({
      currentBounds: unclampedNativeBounds,
      compactFrameSize: compactOuterSize,
      edgePadding,
      monitor,
    })
    : unclampedNativeBounds;
  const visualShell = resolveVisualShell(mode, platform);

  return {
    mode,
    platform,
    nativeSizeStrategy,
    viewportSize,
    nativeBounds,
    unclampedNativeBounds,
    visualShell,
    shadowShell: visualShell,
    compactReachableFrame: {
      x: 0,
      y: 0,
      width: compactOuterSize,
      height: compactOuterSize,
    },
    hotspot: resolveCompactHotspot(platform),
  };
};

const resolveVisualTiming = (
  intent: MainWindowShellVisualTimingIntent,
): MainWindowShellVisualTiming => {
  switch (intent) {
    case "initial":
      return { kind: "tween", transition: MAIN_WINDOW_PANEL_INITIAL_TWEEN_TRANSITION };
    case "compact":
      return { kind: "tween", transition: MAIN_WINDOW_PANEL_COMPACT_TWEEN_TRANSITION };
    case "full":
      return { kind: "spring", transition: MAIN_WINDOW_PANEL_FULL_SPRING_TRANSITION };
    case "instant":
      return { kind: "instant", transition: MAIN_WINDOW_PANEL_INSTANT_TRANSITION };
  }
};

const resolveIconTiming = (
  targetMode: MainWindowShellGeometryMode,
  reducedMotion: boolean,
): MainWindowShellIconTiming => {
  if (targetMode !== "compact") {
    return { kind: "hidden" };
  }

  return {
    kind: "currentMinimizedIconHandoff",
    enter: reducedMotion
      ? MAIN_WINDOW_MINIMIZED_ICON_REDUCED_MOTION_TRANSITION
      : MAIN_WINDOW_MINIMIZED_ICON_ENTER_TRANSITION,
    leave: reducedMotion
      ? MAIN_WINDOW_MINIMIZED_ICON_REDUCED_MOTION_TRANSITION
      : MAIN_WINDOW_MINIMIZED_ICON_LEAVE_TRANSITION,
    exit: reducedMotion
      ? MAIN_WINDOW_MINIMIZED_ICON_REDUCED_EXIT_TRANSITION
      : MAIN_WINDOW_MINIMIZED_ICON_EXIT_TRANSITION,
  };
};

export const resolveMainWindowShellTransitionPlan = ({
  token,
  targetMode,
  geometry,
  visualIntent,
  reducedMotion,
  nativePath = targetMode === "compact" ? "compactVisibilityClamp" : "none",
}: ResolveMainWindowShellTransitionPlanOptions): MainWindowShellTransitionPlan => ({
  token,
  targetMode,
  geometry,
  timing: {
    native: nativePath === "compactVisibilityClamp"
      ? {
        kind: "animateBounds",
        durationMs: reducedMotion ? 0 : MAIN_WINDOW_COMPACT_VISIBILITY_MOVE_DURATION_MS,
        easing: reducedMotion ? "instant" : "currentBoundsEase",
      }
      : { kind: "none" },
    visual: resolveVisualTiming(visualIntent),
    icon: resolveIconTiming(targetMode, reducedMotion),
  },
});
