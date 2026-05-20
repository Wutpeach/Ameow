import type { AppUpdatePhase } from "../types/appUpdate";

export const MAIN_WINDOW_IDLE_MINIMIZE_MS = 3000;

export type MainWindowCollapseSource = "interaction" | "idle";

type ResolveMainWindowModeLockInput = {
  hasOngoingTask: boolean;
  runtimeGateIsBusy: boolean;
  isProcessing: boolean;
  showRuntimeSuccessIndicator: boolean;
  isUiLabPreviewActive: boolean;
  appUpdatePhase: AppUpdatePhase;
};

export const resolveMainWindowModeLock = ({
  hasOngoingTask,
  runtimeGateIsBusy,
  isProcessing,
  showRuntimeSuccessIndicator,
  isUiLabPreviewActive,
  appUpdatePhase,
}: ResolveMainWindowModeLockInput): boolean => (
  hasOngoingTask
  || runtimeGateIsBusy
  || isProcessing
  || showRuntimeSuccessIndicator
  || isUiLabPreviewActive
  || appUpdatePhase === "downloading"
  || appUpdatePhase === "installing"
);

type ShouldCollapseMainWindowOnPointerLeaveInput = {
  isMinimized: boolean;
  startupAutoMinimizeUnlocked: boolean;
  isDragging: boolean;
  isContextMenuOpen: boolean;
  isMainWindowModeLocked: boolean;
  isForegroundTaskOutcomeVisible: boolean;
};

export const shouldCollapseMainWindowOnPointerLeave = ({
  isMinimized,
  startupAutoMinimizeUnlocked,
  isDragging,
  isContextMenuOpen,
  isMainWindowModeLocked,
  isForegroundTaskOutcomeVisible,
}: ShouldCollapseMainWindowOnPointerLeaveInput): boolean => (
  !isMinimized
  && startupAutoMinimizeUnlocked
  && !isDragging
  && !isContextMenuOpen
  && !isMainWindowModeLocked
  && !isForegroundTaskOutcomeVisible
);

type ShouldBlockMainWindowCollapseInput = {
  source: MainWindowCollapseSource;
  isUiLabPreviewActive: boolean;
  isMainWindowModeLocked: boolean;
  isForegroundTaskOutcomeVisible: boolean;
  isDragging: boolean;
  isDropHovering: boolean;
  isPanelHovered: boolean;
  isContextMenuOpen: boolean;
  startupAutoMinimizeUnlocked: boolean;
};

export const shouldBlockMainWindowCollapse = ({
  source,
  isUiLabPreviewActive,
  isMainWindowModeLocked,
  isForegroundTaskOutcomeVisible,
  isDragging,
  isDropHovering,
  isPanelHovered,
  isContextMenuOpen,
  startupAutoMinimizeUnlocked,
}: ShouldBlockMainWindowCollapseInput): boolean => (
  isUiLabPreviewActive
  || isMainWindowModeLocked
  || isForegroundTaskOutcomeVisible
  || isDragging
  || isDropHovering
  || (source !== "idle" && isPanelHovered)
  || isContextMenuOpen
  || !startupAutoMinimizeUnlocked
);

type ShouldArmMainWindowIdleTimerInput = {
  isUiLabPreviewActive: boolean;
  isMainWindowModeLocked: boolean;
  isForegroundTaskOutcomeVisible: boolean;
  isDragging: boolean;
  isDropHovering: boolean;
  isContextMenuOpen: boolean;
  startupAutoMinimizeUnlocked: boolean;
};

export const shouldArmMainWindowIdleTimer = ({
  isUiLabPreviewActive,
  isMainWindowModeLocked,
  isForegroundTaskOutcomeVisible,
  isDragging,
  isDropHovering,
  isContextMenuOpen,
  startupAutoMinimizeUnlocked,
}: ShouldArmMainWindowIdleTimerInput): boolean => (
  !isUiLabPreviewActive
  && !isMainWindowModeLocked
  && !isForegroundTaskOutcomeVisible
  && !isDragging
  && !isDropHovering
  && !isContextMenuOpen
  && startupAutoMinimizeUnlocked
);
