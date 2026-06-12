export const MAIN_WINDOW_COMPACT_VISIBILITY_MOVE_DURATION_MS = 180;

export const MAIN_WINDOW_MINIMIZED_ICON_SIZE = 38;
export const MAIN_WINDOW_INITIAL_PANEL_SCALE = 0.88;
export const MAIN_WINDOW_MINIMIZED_PANEL_SCALE = 1;
export const MAIN_WINDOW_FULL_PANEL_RADIUS = 16;
export const MAIN_WINDOW_MINIMIZED_PANEL_RADIUS = 100;
export const MAIN_WINDOW_PANEL_FULL_ELASTIC_SCALE_KEYFRAMES = [1, 1.01, 1] as const;
export const MAIN_WINDOW_PANEL_FULL_ELASTIC_SCALE_TIMES = [0, 0.66, 1] as const;

export const MAIN_WINDOW_COMPACT_MOTION_EASE = [0.22, 1, 0.36, 1] as const;

export const MAIN_WINDOW_PANEL_INITIAL_TWEEN_TRANSITION = {
  duration: 0.2,
  ease: MAIN_WINDOW_COMPACT_MOTION_EASE,
} as const;

export const MAIN_WINDOW_PANEL_COMPACT_TWEEN_TRANSITION = {
  duration: 0.2,
  ease: MAIN_WINDOW_COMPACT_MOTION_EASE,
} as const;

export const MAIN_WINDOW_PANEL_INSTANT_TRANSITION = {
  duration: 0,
} as const;

export const MAIN_WINDOW_PANEL_FULL_SPRING_TRANSITION = {
  type: "spring",
  stiffness: 460,
  damping: 36,
} as const;

export const MAIN_WINDOW_MINIMIZED_ICON_REDUCED_MOTION_TRANSITION = {
  duration: 0.12,
} as const;

export const MAIN_WINDOW_MINIMIZED_ICON_ENTER_TRANSITION = {
  duration: 0.16,
  ease: MAIN_WINDOW_COMPACT_MOTION_EASE,
} as const;

export const MAIN_WINDOW_MINIMIZED_ICON_LEAVE_TRANSITION = {
  duration: 0.2,
  times: [0, 0.64, 1],
  ease: MAIN_WINDOW_COMPACT_MOTION_EASE,
};

export const MAIN_WINDOW_MINIMIZED_ICON_REDUCED_EXIT_TRANSITION = {
  duration: 0.01,
} as const;

export const MAIN_WINDOW_MINIMIZED_ICON_EXIT_TRANSITION = {
  duration: 0.06,
  ease: MAIN_WINDOW_COMPACT_MOTION_EASE,
} as const;

export type MainWindowNativeBoundsBaselinePath =
  | "mainWindowCreation"
  | "compactStartupNormalization"
  | "hoverRequestExpand"
  | "hoverRequestCollapse"
  | "compactVisibilityClamp"
  | "foregroundTaskRestore"
  | "shortcutShow";

export type MainWindowNativeBoundsBaselineKind =
  | "initialNativeBounds"
  | "instantStartupResize"
  | "visualOnly"
  | "positionClampOnly"
  | "restoreSynchronization";

export type MainWindowNativeBoundsBaselineEntry = {
  path: MainWindowNativeBoundsBaselinePath;
  kind: MainWindowNativeBoundsBaselineKind;
  callsAnimateBounds: boolean;
  changesNativeSize: boolean;
  preservesCurrentSize: boolean;
};

export const MAIN_WINDOW_NATIVE_BOUNDS_BASELINE = {
  mainWindowCreation: {
    path: "mainWindowCreation",
    kind: "initialNativeBounds",
    callsAnimateBounds: false,
    changesNativeSize: true,
    preservesCurrentSize: false,
  },
  compactStartupNormalization: {
    path: "compactStartupNormalization",
    kind: "instantStartupResize",
    callsAnimateBounds: true,
    changesNativeSize: true,
    preservesCurrentSize: false,
  },
  hoverRequestExpand: {
    path: "hoverRequestExpand",
    kind: "visualOnly",
    callsAnimateBounds: false,
    changesNativeSize: false,
    preservesCurrentSize: true,
  },
  hoverRequestCollapse: {
    path: "hoverRequestCollapse",
    kind: "visualOnly",
    callsAnimateBounds: false,
    changesNativeSize: false,
    preservesCurrentSize: true,
  },
  compactVisibilityClamp: {
    path: "compactVisibilityClamp",
    kind: "positionClampOnly",
    callsAnimateBounds: true,
    changesNativeSize: false,
    preservesCurrentSize: true,
  },
  foregroundTaskRestore: {
    path: "foregroundTaskRestore",
    kind: "restoreSynchronization",
    callsAnimateBounds: false,
    changesNativeSize: false,
    preservesCurrentSize: true,
  },
  shortcutShow: {
    path: "shortcutShow",
    kind: "restoreSynchronization",
    callsAnimateBounds: false,
    changesNativeSize: false,
    preservesCurrentSize: true,
  },
} satisfies Record<MainWindowNativeBoundsBaselinePath, MainWindowNativeBoundsBaselineEntry>;
