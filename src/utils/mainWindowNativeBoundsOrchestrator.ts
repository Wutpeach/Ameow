import type {
  AmeowAnimateBoundsResult,
  AmeowBounds,
  AmeowCurrentWindowApi,
  AmeowDisplay,
  AmeowPoint,
  AmeowSize,
  AmeowSystemApi,
} from "../types/electronBridge";
import {
  resolveMainWindowShellGeometryPlan,
  resolveMainWindowShellTransitionPlan,
} from "./mainWindowShellGeometry";
import {
  advanceMainWindowBoundsTransition,
  isMainWindowBoundsTransitionCurrent,
  type MainWindowBoundsTransitionState,
  type MainWindowBoundsTransitionTarget,
} from "./mainWindowTransitionToken";

export type MainWindowNativeBoundsPositionCache = {
  current: AmeowPoint | null;
};

export type MainWindowNativeBoundsTransitionRef = {
  current: MainWindowBoundsTransitionState;
};

export type MainWindowNativeBoundsTokenCache = {
  current: number | null;
};

export type BeginMainWindowNativeBoundsTransitionOptions = {
  transitionRef: MainWindowNativeBoundsTransitionRef;
  pendingCompactTokenRef?: MainWindowNativeBoundsTokenCache;
  target: MainWindowBoundsTransitionTarget;
};

export const beginMainWindowNativeBoundsTransition = ({
  transitionRef,
  pendingCompactTokenRef,
  target,
}: BeginMainWindowNativeBoundsTransitionOptions): number => {
  const nextTransition = advanceMainWindowBoundsTransition(
    transitionRef.current,
    target,
  );
  transitionRef.current = nextTransition;
  if (target === "full" && pendingCompactTokenRef) {
    pendingCompactTokenRef.current = null;
  }
  return nextTransition.token;
};

export type IsMainWindowNativeBoundsTransitionCurrentOptions = {
  transitionRef: MainWindowNativeBoundsTransitionRef;
  expectedToken: number | null | undefined;
  expectedTarget?: MainWindowBoundsTransitionTarget;
};

export const isMainWindowNativeBoundsTransitionStillCurrent = ({
  transitionRef,
  expectedToken,
  expectedTarget,
}: IsMainWindowNativeBoundsTransitionCurrentOptions): boolean => (
  isMainWindowBoundsTransitionCurrent(
    transitionRef.current,
    expectedToken,
    expectedTarget,
  )
);

export type GetMainWindowCurrentPositionOptions = {
  currentWindow: Pick<AmeowCurrentWindowApi, "outerPosition">;
  positionCacheRef: MainWindowNativeBoundsPositionCache;
};

export const getMainWindowCurrentPosition = async ({
  currentWindow,
  positionCacheRef,
}: GetMainWindowCurrentPositionOptions): Promise<AmeowPoint> => {
  if (positionCacheRef.current) {
    return positionCacheRef.current;
  }

  const nextPosition = await currentWindow.outerPosition();
  positionCacheRef.current = nextPosition;
  return nextPosition;
};

export const syncMainWindowCurrentPositionCache = async ({
  currentWindow,
  positionCacheRef,
}: GetMainWindowCurrentPositionOptions): Promise<AmeowPoint> => {
  const nextPosition = await currentWindow.outerPosition();
  positionCacheRef.current = nextPosition;
  return nextPosition;
};

export type ResizeMainWindowPreservingPositionOptions = {
  currentWindow: Pick<AmeowCurrentWindowApi, "animateBounds" | "outerPosition">;
  positionCacheRef: MainWindowNativeBoundsPositionCache;
  size: AmeowSize;
  transitionToken?: number;
};

export const resizeMainWindowPreservingPosition = async ({
  currentWindow,
  positionCacheRef,
  size,
  transitionToken,
}: ResizeMainWindowPreservingPositionOptions): Promise<number | null> => {
  const position = await getMainWindowCurrentPosition({
    currentWindow,
    positionCacheRef,
  });
  const result = await currentWindow.animateBounds({
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
  }, {
    durationMs: 0,
    transitionToken,
  });
  positionCacheRef.current = position;
  return result.transitionToken;
};

export type EnsureMainWindowCompactTargetVisibleOptions = {
  currentWindow: Pick<AmeowCurrentWindowApi, "animateBounds" | "outerPosition" | "outerSize">;
  system: Pick<AmeowSystemApi, "currentMonitor">;
  positionCacheRef: MainWindowNativeBoundsPositionCache;
  transitionRef: MainWindowNativeBoundsTransitionRef;
  transitionToken: number;
  platform: NodeJS.Platform;
  edgePadding: number;
  reducedMotion: boolean;
  onMonitorError?: (error: unknown) => void;
};

const isSamePosition = (left: AmeowBounds, right: AmeowPoint): boolean => (
  left.x === right.x && left.y === right.y
);

export const ensureMainWindowCompactTargetVisible = async ({
  currentWindow,
  system,
  positionCacheRef,
  transitionRef,
  transitionToken,
  platform,
  edgePadding,
  reducedMotion,
  onMonitorError,
}: EnsureMainWindowCompactTargetVisibleOptions): Promise<void> => {
  const [position, size] = await Promise.all([
    currentWindow.outerPosition(),
    currentWindow.outerSize(),
  ]);
  positionCacheRef.current = position;

  let monitor: AmeowDisplay | null = null;
  try {
    monitor = await system.currentMonitor();
  } catch (err) {
    onMonitorError?.(err);
  }

  if (!isMainWindowNativeBoundsTransitionStillCurrent({
    transitionRef,
    expectedToken: transitionToken,
    expectedTarget: "compact",
  })) {
    return;
  }

  const geometryPlan = resolveMainWindowShellGeometryPlan({
    mode: "compact",
    platform,
    windowPosition: position,
    currentNativeSize: size,
    nativeSizeStrategy: "preserve-current",
    edgePadding,
    monitor,
  });
  const transitionPlan = resolveMainWindowShellTransitionPlan({
    token: transitionToken,
    targetMode: "compact",
    geometry: geometryPlan,
    visualIntent: "compact",
    reducedMotion,
    nativePath: "compactVisibilityClamp",
  });
  const targetBounds = geometryPlan.nativeBounds;

  if (isSamePosition(targetBounds, position)) {
    return;
  }

  const nativeTiming = transitionPlan.timing.native;
  const result: AmeowAnimateBoundsResult = await currentWindow.animateBounds(targetBounds, {
    durationMs: nativeTiming.kind === "animateBounds"
      ? nativeTiming.durationMs
      : 0,
    transitionToken,
  });

  if (!isMainWindowNativeBoundsTransitionStillCurrent({
    transitionRef,
    expectedToken: result.transitionToken,
    expectedTarget: "compact",
  })) {
    return;
  }

  positionCacheRef.current = {
    x: targetBounds.x,
    y: targetBounds.y,
  };
};
