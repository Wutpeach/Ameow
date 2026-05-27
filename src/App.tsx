import { startTransition, useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { CatIcon } from "./components/CatIcon";
import { CircularProgressIndicator } from "./components/CircularProgressIndicator";
import {
  CENTER_OVERLAY_CONTENT_STYLE,
  CENTER_OVERLAY_PRESENCE_MOTION,
} from "./components/foregroundOverlayShared";
import {
  ForegroundOutcomeOverlay,
} from "./components/ForegroundOutcomeOverlay";
import { FolderCheckIcon } from "./components/icons/AppIcons";
import { NeonIconButton } from "./components/ui";
import {
  COMPACT_EASE,
  getContinuousCornerClipPath,
  getContinuousCornerStyle,
  getInsetCardStyle,
  getShadowBackdropStyle,
  getPanelShellStyle,
  getStatusDotStyle,
} from "./components/ui/shared-styles";
import type { AppUpdateInfo, AppUpdatePhase } from "./types/appUpdate";
import type {
  AmeowCurrentWindowInteractionMode,
  AmeowDisplay,
  AmeowStartupWindowMode,
} from "./types/electronBridge";
import {
  desktopClipboard,
  desktopCommands,
  desktopCurrentWindow,
  desktopDrop,
  desktopEvents,
  desktopSystem,
  desktopUpdater,
  desktopWindows,
} from "./desktop/runtime";
import type {
  RuntimeDependencyGatePhase,
  RuntimeDependencyGateStatePayload,
  RuntimeDependencyStatusSnapshot,
} from "./types/runtimeDependencies";
import type {
  DownloadProgressPayload,
  DownloadResultPayload as DownloadResult,
  DownloadStage,
  QueuedVideoDownloadAck,
  QueuedVideoDownloadRequest,
  VideoQueueDetailPayload,
  VideoQueueStatePayload,
  VideoQueueTaskPayload,
  VideoTranscodeCompletePayload,
  VideoTranscodeQueueDetailPayload,
  VideoTranscodeQueueStatePayload,
  VideoTranscodeTaskPayload,
} from "./types/videoRuntime";
import {
  buildPinterestDragDiagnostic,
  extractEmbeddedPinterestDragPayload,
  extractPinterestVideoSelectionFromHtml,
  extractPinterestImageUrlFromHtml,
  isPinterestPinUrl,
  looksLikePinterestVideoHtml,
} from "./utils/pinterest";
import { extractImageUrlFromHtml } from "./utils/imageDrag";
import { upgradeImageUrl } from "./utils/imageQualityUpgrade";
import {
  extractEmbeddedXiaohongshuDragPayload,
  hasXiaohongshuVideoSignals,
  isXiaohongshuPageUrl,
  pickXiaohongshuImageForDownload,
  type XiaohongshuResolvedDragMedia,
} from "./utils/xiaohongshu";
import { parseLocalFileUrl } from "./utils/localFileUrl";
import { canonicalizeTwitterXPageUrl, shouldPreferTwitterXImageDrop } from "./utils/twitterX";
import {
  resolvePanelPointerCaptureId,
  shouldIgnorePanelDoubleClickTarget,
  shouldPreventPanelNativeDragStart,
  shouldOpenOutputFolderFromPanelMouseDownDoubleClick,
  WINDOW_DRAG_START_THRESHOLD,
} from "./utils/mainPanelInteractions";
import {
  getDroppedFolderErrorTranslationKey,
  shouldHandleDroppedFolderResult,
} from "./utils/folderDrop";
import {
  EMPTY_VIDEO_QUEUE_DETAIL,
  EMPTY_VIDEO_QUEUE_STATE,
  EMPTY_VIDEO_TRANSCODE_QUEUE_DETAIL,
  EMPTY_VIDEO_TRANSCODE_QUEUE_STATE,
  getDownloadStatusText,
  getTranscodeStageLabel,
  getTranscodeTaskStatusText,
  getVideoTranscodeFormatLabel,
  getVideoTranscodeTaskProgressPercent,
  mergeVideoTranscodeTask,
  normalizeVideoTranscodeQueueDetail,
  normalizeVideoTranscodeTask,
} from "./utils/downloadViewHelpers";
import {
  applyDownloadProgressEvent,
  applyNormalizedTranscodeProgressToDetail,
  applyNormalizedTranscodeProgressToMap,
  applyVideoQueueStateEvent,
  applyVideoTranscodeQueueStateEvent,
  clearTranscodeProgressWhenInactive,
  normalizeVideoQueueDetailEvent,
  pruneCancellingTraceIdsToQueueDetail,
  pruneDownloadProgressToQueueDetail,
  removeDownloadProgressTrace,
  removeTranscodeProgressTrace,
  removeTranscodeTaskFromDetail,
  resolveDownloadCompleteOutcome,
  summarizeDownloadError,
  upsertTranscodeTaskToDetail,
} from "./utils/downloadEventReducers";
import { extractEmbeddedProtectedImageDragPayload } from "./utils/protectedImageDrag";
import {
  DEFERRED_STARTUP_IDLE_CALLBACK_TIMEOUT_MS,
  getDeferredStartupInitializationDelayMs,
  getStartupAutoMinimizeGraceMs,
  STARTUP_AUTO_RUNTIME_BOOTSTRAP_DELAY_MS,
  shouldUseNativeCompactStartupWindow,
  shouldStartExpandedOnLaunch,
} from "./utils/startupWindowState";
import {
  resolveMainWindowModeLock,
} from "./utils/mainWindowMode";
import {
  createMainWindowShellState,
  reduceMainWindowShell,
  type MainWindowShellEvent,
  type MainWindowShellModeEffect,
  type MainWindowShellState,
} from "./utils/mainWindowShellMachine";
import {
  advanceMainWindowBoundsTransition,
  isMainWindowBoundsTransitionCurrent,
  type MainWindowBoundsTransitionState,
} from "./utils/mainWindowTransitionToken";
import { resolveMainWindowCompactVisibilityBounds } from "./utils/mainWindowCompactBounds";
import { isPointInsideCompactPointerHotspot } from "./utils/compactPointerHotspot";
import { parseDesktopAppConfig } from "./updates/appUpdatePreferences";
import { isVideoUrl } from "./utils/videoUrl";
import { saveOutputPath } from "./utils/outputPath";
import { useTheme } from "./contexts/ThemeContext";
import { isLikelyShortLinkUrl } from "./core/short-links";
import {
  MAIN_WINDOW_COMPACT_SHELL_SIZE,
  MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE,
  MAIN_WINDOW_MACOS_COMPACT_OUTER_SIZE,
  MAIN_WINDOW_MACOS_FULL_SHADOW_GUTTER,
  MAIN_WINDOW_PANEL_SIZE,
  SETTINGS_WINDOW_CONTENT_HEIGHT,
  SETTINGS_WINDOW_CONTENT_WIDTH,
} from "./constants/windowMetrics";
import i18n from "./i18n";
import {
  getMissingRuntimeComponentsFromStatus,
  clampRuntimeGateProgressPercent,
  getRuntimeGateHeadline,
  getRuntimeGateNextLabel,
  getRuntimeGateProgressLabel,
  hasMissingManagedRuntimeComponents,
  runtimeGateIsActive,
  runtimeGateNeedsManualAction,
  shouldAutoStartManagedRuntimeBootstrapOnStartup,
  summarizeRuntimeGateError,
} from "./utils/runtimeDependencyGate";

const isResolvableVideoInputUrl = (value: string): boolean => (
  isVideoUrl(value) || isLikelyShortLinkUrl(value)
);

const MAX_IN_MEMORY_DROPPED_FILE_BYTES = 25 * 1024 * 1024;
const COMPACT_WINDOW_VISIBILITY_MOVE_DURATION_MS = 180;

// Helper function to check and show sequence overflow error
const checkSequenceOverflow = (error: unknown): boolean => {
  const errorStr = String(error);
  if (errorStr.includes("序号已用完")) {
    alert(i18n.t("desktop:app.sequenceOverflowMessage"));
    return true;
  }
  return false;
};

const summarizeAppUpdateError = (error: unknown): string | null => {
  const errorString = String(error ?? "").trim();
  if (!errorString) {
    return null;
  }
  return summarizeDownloadError(errorString) ?? errorString;
};

const resolveRenameMediaEnabled = (config: Record<string, unknown>): boolean => {
  if (typeof config.renameMediaOnDownload === "boolean") {
    return config.renameMediaOnDownload;
  }
  if (typeof config.videoKeepOriginalName === "boolean") {
    return !config.videoKeepOriginalName;
  }
  return false;
};

const readClipboardImageDataUrl = async (): Promise<string | null> => {
  const clipboardImage = await desktopClipboard.readImage();
  if (!clipboardImage) {
    return null;
  }

  const { width, height } = clipboardImage;

  if (width <= 0 || height <= 0) {
    throw new Error(`Clipboard image has invalid dimensions: ${width}x${height}`);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create a canvas context for clipboard image paste");
  }

  const imageData = new ImageData(
    new Uint8ClampedArray(clipboardImage.rgba),
    width,
    height,
  );
  context.putImageData(imageData, 0, 0);

  return canvas.toDataURL("image/png");
};

const fileToDataUrl = async (file: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") {
      resolve(reader.result);
      return;
    }
    reject(new Error("Failed to read file as data URL"));
  };
  reader.onerror = () => reject(reader.error ?? new Error("Failed to read file as data URL"));
  reader.readAsDataURL(file);
});

const filterDroppedFilesByMimePrefix = (
  dataTransfer: DataTransfer | null,
  mimePrefix: `${string}/`,
): File[] => Array.from(dataTransfer?.files ?? []).filter((file) => file.type.startsWith(mimePrefix));

const saveDroppedFilesToOutput = async (
  files: File[],
  targetDir: string | null,
): Promise<number> => {
  let savedCount = 0;

  for (const file of files) {
    try {
      const filePath = typeof (file as File & { path?: unknown }).path === "string"
        ? (file as File & { path?: string }).path?.trim() ?? ""
        : "";

      if (filePath) {
        const copyResult = await desktopCommands.invoke<string>("process_files", {
          paths: [filePath],
          targetDir,
        });
        if (!copyResult.includes("Copied 0 files")) {
          savedCount += 1;
          continue;
        }

        console.warn(
          "Dropped browser file path did not resolve on disk, falling back to in-memory blob:",
          file.name || "<unnamed>",
          filePath,
        );
      }

      if (file.size > MAX_IN_MEMORY_DROPPED_FILE_BYTES) {
        throw new Error(
          `Dropped file is too large to copy without a local path: ${file.name || "<unnamed>"}`,
        );
      }

      const dataUrl = await fileToDataUrl(file);
      await desktopCommands.invoke<string>("save_data_url", {
        dataUrl,
        targetDir,
        originalFilename: file.name || undefined,
      });

      savedCount += 1;
    } catch (error) {
      console.error("Failed to save dropped browser file:", file.name || "<unnamed>", error);
      checkSequenceOverflow(error);
    }
  }

  return savedCount;
};

const extractClipboardImageFile = (clipboardData: DataTransfer | null): File | null => {
  if (!clipboardData) {
    return null;
  }

  for (const file of Array.from(clipboardData.files)) {
    if (file.type.startsWith("image/")) {
      return file;
    }
  }

  for (const item of Array.from(clipboardData.items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) {
      continue;
    }

    const file = item.getAsFile();
    if (file) {
      return file;
    }
  }

  return null;
};

const isPinterestDownloadRequest = (request: QueuedVideoDownloadRequest): boolean => {
  const pinterestUrlPattern = /(?:pinterest\.|pinimg\.com\/videos\/)/i;
  return (
    request.siteHint === "pinterest"
    || pinterestUrlPattern.test(request.url)
    || pinterestUrlPattern.test(request.pageUrl ?? "")
    || pinterestUrlPattern.test(request.videoUrl ?? "")
  );
};

const runtimeGatePhaseNeedsAttention = (phase: RuntimeDependencyGatePhase): boolean => (
  phase === "checking"
  || phase === "awaiting_confirmation"
  || phase === "downloading"
  || phase === "blocked_by_user"
  || phase === "failed"
);

const runtimeGatePhasePreservesDecision = (phase: RuntimeDependencyGatePhase): boolean => (
  phase === "awaiting_confirmation"
  || phase === "downloading"
  || phase === "blocked_by_user"
);

const pickDroppedUrl = (rawValue: string): string => {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return "";
  }

  const lines = rawValue
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.find((line) => /^https?:\/\//i.test(line)) ?? rawValue.trim();
};

const mergeVideoCandidatesByUrl = <TCandidate extends { url: string }>(
  embeddedCandidates: TCandidate[],
  htmlCandidates: TCandidate[],
): TCandidate[] => {
  const merged: TCandidate[] = [];
  const seen = new Set<string>();

  for (const candidate of [...embeddedCandidates, ...htmlCandidates]) {
    if (!candidate?.url || seen.has(candidate.url)) {
      continue;
    }
    seen.add(candidate.url);
    merged.push(candidate);
  }

  return merged;
};

type PendingWindowDragStart = {
  pointerId: number;
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
  windowPositionPromise: Promise<{ x: number; y: number }>;
};

type ActiveWindowDragState = {
  pointerId: number;
  startScreenX: number;
  startScreenY: number;
  windowX: number;
  windowY: number;
  nextX: number;
  nextY: number;
  lastAppliedX: number;
  lastAppliedY: number;
  applyInFlight: boolean;
};
type AppProps = {
  initialStartupWindowMode?: AmeowStartupWindowMode;
};

function App({
  initialStartupWindowMode = "full",
}: AppProps) {
  const { t } = useTranslation("desktop");
  const { theme, colors } = useTheme();
  const shouldReduceMotion = useReducedMotion();
  const userAgent = navigator.userAgent.toLowerCase();
  const isMacOS = userAgent.includes("mac");
  const isWindows = userAgent.includes("windows");
  const supportsCompactPassthroughHotspot = isWindows;
  const startupWindowEnvironment = {
    protocol: window.location.protocol,
    userAgent: navigator.userAgent,
  };
  const startupAutoMinimizeGraceMs =
    getStartupAutoMinimizeGraceMs(startupWindowEnvironment);
  const deferredStartupInitializationDelayMs =
    getDeferredStartupInitializationDelayMs(startupWindowEnvironment);
  const startsExpandedOnLaunch =
    shouldStartExpandedOnLaunch(startupWindowEnvironment);
  const FULL_SIZE = MAIN_WINDOW_PANEL_SIZE;
  const FULL_WINDOW_SHADOW_GUTTER = isMacOS ? MAIN_WINDOW_MACOS_FULL_SHADOW_GUTTER : 0;
  const INTERMEDIATE_EXPAND_SIZE = FULL_SIZE + FULL_WINDOW_SHADOW_GUTTER * 2;
  const ICON_SIZE = isMacOS
    ? MAIN_WINDOW_MACOS_COMPACT_OUTER_SIZE
    : MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE;
  const MINIMIZED_SHELL_SIZE = MAIN_WINDOW_COMPACT_SHELL_SIZE;
  const MINIMIZED_ICON_SIZE = 38;
  const COMPACT_HOTSPOT_FRAME_SIZE = isMacOS ? MINIMIZED_SHELL_SIZE : MINIMIZED_ICON_SIZE;
  const MINIMIZED_SHELL_INSET = Math.round((ICON_SIZE - MINIMIZED_SHELL_SIZE) / 2);
  const FULL_SHELL_INSET = FULL_WINDOW_SHADOW_GUTTER;
  const startsInNativeCompactStartupWindow = shouldUseNativeCompactStartupWindow({
    startupWindowMode: initialStartupWindowMode,
    startsExpandedOnLaunch,
    isMacOS,
  });
  const [isHovering, setIsHovering] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadCancelled, setDownloadCancelled] = useState(false);
  const [downloadErrorMessage, setDownloadErrorMessage] = useState<string | null>(null);
  const [isForegroundTaskOutcomeVisible, setIsForegroundTaskOutcomeVisible] = useState(false);
  const [centerOutcome, setCenterOutcome] = useState<"folder-success" | "folder-error" | null>(null);
  const [outputPath, setOutputPath] = useState("");
  const [renameMediaOnDownload, setRenameMediaOnDownload] = useState(false);
  const [isPanelHovered, setIsPanelHovered] = useState(false);
  const [downloadProgressByTrace, setDownloadProgressByTrace] = useState<Record<string, DownloadProgressPayload>>({});
  const [videoQueueState, setVideoQueueState] = useState<VideoQueueStatePayload>(EMPTY_VIDEO_QUEUE_STATE);
  const [videoQueueDetail, setVideoQueueDetail] = useState<VideoQueueDetailPayload>(EMPTY_VIDEO_QUEUE_DETAIL);
  const [videoTranscodeQueueState, setVideoTranscodeQueueState] = useState<VideoTranscodeQueueStatePayload>(EMPTY_VIDEO_TRANSCODE_QUEUE_STATE);
  const [videoTranscodeQueueDetail, setVideoTranscodeQueueDetail] = useState<VideoTranscodeQueueDetailPayload>(EMPTY_VIDEO_TRANSCODE_QUEUE_DETAIL);
  const [transcodeProgressByTrace, setTranscodeProgressByTrace] = useState<Record<string, VideoTranscodeTaskPayload>>({});
  const [cancellingTraceIds, setCancellingTraceIds] = useState<string[]>([]);
  const [pendingTranscodeActionTraceIds, setPendingTranscodeActionTraceIds] = useState<string[]>([]);
  const [queueNoticeMessage, setQueueNoticeMessage] = useState<string | null>(null);
  const [isQueuePopoverOpen, setIsQueuePopoverOpen] = useState(false);
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [appUpdatePhase, setAppUpdatePhase] = useState<AppUpdatePhase>("idle");
  const [appUpdateError, setAppUpdateError] = useState<string | null>(null);
  const [runtimeDependencyStatus, setRuntimeDependencyStatus] = useState<RuntimeDependencyStatusSnapshot | null>(null);
  const [runtimeDependencyGateState, setRuntimeDependencyGateState] =
    useState<RuntimeDependencyGateStatePayload | null>(null);
  const [isRuntimeIndicatorHovered, setIsRuntimeIndicatorHovered] = useState(false);
  const [isRuntimeRetryFeedbackVisible, setIsRuntimeRetryFeedbackVisible] = useState(false);
  const [isRuntimeRetryInFlight, setIsRuntimeRetryInFlight] = useState(false);
  const [showRuntimeSuccessIndicator, setShowRuntimeSuccessIndicator] = useState(false);
  const [isUiLabPreviewActive, setIsUiLabPreviewActive] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(!startsExpandedOnLaunch);
  const [panelTransitionMode, setPanelTransitionMode] = useState<"animated" | "instant">("animated");
  const [shellPhase, setShellPhase] = useState<"full" | "collapsing" | "compact" | "expanding">(
    startsInNativeCompactStartupWindow ? "compact" : "full",
  );
  const [showEdgeGlow, setShowEdgeGlow] = useState(true);
  const [isInitialMount, setIsInitialMount] = useState(!startsInNativeCompactStartupWindow);
  const [isDeferredStartupInitializationReady, setIsDeferredStartupInitializationReady] =
    useState(deferredStartupInitializationDelayMs <= 0);
  const [isResetCounterActive, setIsResetCounterActive] = useState(false);
  const [isProgressCancelHovered, setIsProgressCancelHovered] = useState(false);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const pointerLeaveCollapseTimerRef = useRef<number | null>(null);
  const resetCounterFeedbackTimerRef = useRef<number | null>(null);
  const queueNoticeTimerRef = useRef<number | null>(null);
  const runtimeRetryFeedbackTimerRef = useRef<number | null>(null);
  const runtimeSuccessTimerRef = useRef<number | null>(null);
  const runtimeBootstrapAfterVisibleTimerRef = useRef<number | null>(null);
  const startupAutoMinimizeReleaseTimerRef = useRef<number | null>(null);
  const deferredStartupInitializationTimerRef = useRef<number | null>(null);
  const deferredStartupInitializationIdleRef = useRef<number | null>(null);
  const foregroundTaskOutcomeTimerRef = useRef<number | null>(null);
  const centerOutcomeTimerRef = useRef<number | null>(null);
  const foregroundOutcomeRequestIdRef = useRef(0);
  const isForegroundTaskOutcomeVisibleRef = useRef(false);
  const panelTransitionModeResetFrameRef = useRef<number | null>(null);
  const isContextMenuOpenRef = useRef(false);
  const isDraggingRef = useRef(false);
  const cancellingTraceIdsRef = useRef<Set<string>>(new Set());
  const pendingTranscodeActionTraceIdsRef = useRef<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanelHoveredRef = useRef(false);
  const isPointerInsidePanelRef = useRef(false);
  const pasteHandlerRef = useRef<(event: ClipboardEvent) => void>(() => undefined);
  const queueBadgeButtonRef = useRef<HTMLButtonElement>(null);
  const pendingDragStartRef = useRef<PendingWindowDragStart | null>(null);
  const activeWindowDragRef = useRef<ActiveWindowDragState | null>(null);
  const isWindowPointerDownRef = useRef(false);
  const windowDragFrameRef = useRef<number | null>(null);
  const lastKnownWindowPositionRef = useRef<{ x: number; y: number } | null>(null);
  const lastPanelOutputFolderShortcutAtRef = useRef(0);
  const isDropHoveringRef = useRef(false);
  const suppressNextPanelDragLeaveRef = useRef(false);
  const shellPhaseRef = useRef(shellPhase);
  const shellMachineRef = useRef<MainWindowShellState>(createMainWindowShellState({
    startsCompact: startsInNativeCompactStartupWindow,
    startupLocked: startupAutoMinimizeGraceMs > 0,
  }));
  const interactionModeRef = useRef<AmeowCurrentWindowInteractionMode>("interactive");
  const compactHotspotInsideRef = useRef(false);
  const compactHotspotFrameRef = useRef<number | null>(null);
  const compactNativeSettledRef = useRef(startsInNativeCompactStartupWindow);
  const mainWindowBoundsTransitionRef = useRef<MainWindowBoundsTransitionState>({
    token: 0,
    target: startsInNativeCompactStartupWindow ? "compact" : "full",
  });
  const pendingCompactResizeTokenRef = useRef<number | null>(
    startsInNativeCompactStartupWindow ? 0 : null,
  );
  const isMinimizedRef = useRef(isMinimized);
  const isInitialMountRef = useRef(isInitialMount);
  const isUiLabPreviewActiveRef = useRef(isUiLabPreviewActive);
  const shouldReturnToCompactAfterForegroundTaskRef = useRef(false);
  const previousTaskCountRef = useRef(0);
  const previousRuntimeGatePhaseRef = useRef<RuntimeDependencyGatePhase>("idle");
  const hasTriggeredStartupRuntimeBootstrapRef = useRef(false);
  const startupAutoMinimizeUnlockedRef = useRef(startupAutoMinimizeGraceMs === 0);
  const EDGE_GLOW_TRIGGER_DISTANCE = 126;
  const EDGE_GLOW_RADIUS = 248;
  const EDGE_GLOW_BORDER_WIDTH = 2.2;
  const EDGE_GLOW_FALLOFF_EXPONENT = 0.58;
  const DRAG_GLOW_BORDER_WIDTH = 2.4;
  const WINDOW_EDGE_PADDING = 8;
  const PANEL_OUTPUT_FOLDER_SHORTCUT_DEDUP_MS = 400;
  const CONTEXT_MENU_WIDTH = 176;
  const CONTEXT_MENU_HEIGHT = 80;
  const SETTINGS_WINDOW_WIDTH = SETTINGS_WINDOW_CONTENT_WIDTH;
  const SETTINGS_WINDOW_HEIGHT = SETTINGS_WINDOW_CONTENT_HEIGHT;
  const totalDownloadTaskCount = videoQueueState.totalCount;
  const downloadQueueTasks = videoQueueDetail.tasks;
  const activeDownloadQueueTasks = downloadQueueTasks.filter((task) => task.status === "active");
  const downloadProgressTaskCount = Object.keys(downloadProgressByTrace).length;
  const foregroundDownloadTaskCount = Math.max(
    totalDownloadTaskCount,
    downloadQueueTasks.length,
    downloadProgressTaskCount,
  );
  const primaryDownloadTask = activeDownloadQueueTasks[0] ?? null;
  const primaryDownloadProgress = primaryDownloadTask
    ? downloadProgressByTrace[primaryDownloadTask.traceId] ?? null
    : null;
  const downloadProgress = primaryDownloadTask
    ? primaryDownloadProgress ?? {
        traceId: primaryDownloadTask.traceId,
        percent: -1,
        stage: "preparing" as DownloadStage,
        speed: "Resolving media...",
        eta: "",
      }
    : null;
  const downloadStage = primaryDownloadProgress?.stage ?? (primaryDownloadTask ? "preparing" : null);
  const transcodeQueueTasks = videoTranscodeQueueDetail.tasks.map((task) =>
    mergeVideoTranscodeTask(task, transcodeProgressByTrace[task.traceId]),
  );
  const activeTranscodeProgressTask = Object.values(transcodeProgressByTrace).find((task) => task.status === "active") ?? null;
  const activeTranscodeQueueTasks = transcodeQueueTasks.filter((task) => task.status === "active");
  const primaryTranscodeTask = activeTranscodeQueueTasks[0] ?? activeTranscodeProgressTask;
  const totalTranscodeTaskCount = videoTranscodeQueueState.totalCount;
  const ongoingTranscodeTaskCount = videoTranscodeQueueState.activeCount + videoTranscodeQueueState.pendingCount;
  const ongoingTaskCount = foregroundDownloadTaskCount + ongoingTranscodeTaskCount;
  const totalTaskCount = totalDownloadTaskCount + totalTranscodeTaskCount;
  const runtimeGatePhase = runtimeDependencyGateState?.phase ?? "idle";
  const runtimeGateIsBusy = runtimeGateIsActive(runtimeGatePhase);
  const isPreviewForcedFullMode = isUiLabPreviewActive;
  const visualIsMinimized = isPreviewForcedFullMode ? false : isMinimized;
  const isWindowReadyForStartupRuntimeBootstrap =
    !visualIsMinimized;
  const shouldEvaluateDeferredStartupIndicators =
    isDeferredStartupInitializationReady
    || runtimeDependencyStatus !== null
    || runtimeDependencyGateState !== null
    || showRuntimeSuccessIndicator;
  const primaryTask = downloadProgress && primaryDownloadTask
    ? {
        kind: "download" as const,
        task: primaryDownloadTask,
        percent: downloadProgress.percent,
        statusText: getDownloadStatusText(i18n.t, downloadProgress, downloadStage),
        indeterminate: downloadProgress.percent < 0,
      }
    : primaryTranscodeTask
      ? {
          kind: "transcode" as const,
          task: primaryTranscodeTask,
          percent: primaryTranscodeTask.progressPercent ?? -1,
          statusText: getTranscodeTaskStatusText(i18n.t, primaryTranscodeTask, { includePercent: false }),
          indeterminate:
            typeof primaryTranscodeTask.progressPercent !== "number"
            || !Number.isFinite(primaryTranscodeTask.progressPercent),
        }
      : null;
  const hasOngoingTask = ongoingTaskCount > 0;
  const isMainWindowModeLocked = resolveMainWindowModeLock({
    hasOngoingTask,
    runtimeGateIsBusy,
    isProcessing,
    showRuntimeSuccessIndicator,
    isUiLabPreviewActive,
    appUpdatePhase,
  });
  const remainingDownloadCount = Math.max(
    0,
    totalDownloadTaskCount - (primaryTask?.kind === "download" ? 1 : 0),
  );
  const remainingTranscodeCount = Math.max(
    0,
    totalTranscodeTaskCount - (primaryTask?.kind === "transcode" ? 1 : 0),
  );
  const isMainWindowModeLockedRef = useRef(isMainWindowModeLocked);

  const clearForegroundTaskOutcomeTimer = useCallback(() => {
    if (foregroundTaskOutcomeTimerRef.current !== null) {
      clearTimeout(foregroundTaskOutcomeTimerRef.current);
      foregroundTaskOutcomeTimerRef.current = null;
    }
  }, []);

  const clearCenterOutcomeTimer = useCallback(() => {
    if (centerOutcomeTimerRef.current !== null) {
      clearTimeout(centerOutcomeTimerRef.current);
      centerOutcomeTimerRef.current = null;
    }
  }, []);

  const waitForForegroundOutcomeStableFrame = useCallback(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }, []);

  const resetDownloadOutcome = useCallback(() => {
    foregroundOutcomeRequestIdRef.current += 1;
    clearForegroundTaskOutcomeTimer();
    clearCenterOutcomeTimer();
    isForegroundTaskOutcomeVisibleRef.current = false;
    setIsForegroundTaskOutcomeVisible(false);
    setCenterOutcome(null);
    setIsProcessing(false);
    setDownloadCancelled(false);
    setDownloadErrorMessage(null);
  }, [clearCenterOutcomeTimer, clearForegroundTaskOutcomeTimer]);

  const clearDeferredStartupInitializationIdle = useCallback(() => {
    if (
      deferredStartupInitializationIdleRef.current !== null
      && typeof window.cancelIdleCallback === "function"
    ) {
      window.cancelIdleCallback(deferredStartupInitializationIdleRef.current);
    }
    deferredStartupInitializationIdleRef.current = null;
  }, []);

  const markDeferredStartupInitializationReady = useCallback(() => {
    clearDeferredStartupInitializationIdle();
    setIsDeferredStartupInitializationReady(true);
  }, [clearDeferredStartupInitializationIdle]);

  useEffect(() => {
    isMinimizedRef.current = isMinimized;
  }, [isMinimized]);

  useEffect(() => {
    isInitialMountRef.current = isInitialMount;
  }, [isInitialMount]);

  useEffect(() => {
    isUiLabPreviewActiveRef.current = isUiLabPreviewActive;
  }, [isUiLabPreviewActive]);

  useEffect(() => {
    isMainWindowModeLockedRef.current = isMainWindowModeLocked;
  }, [isMainWindowModeLocked]);

  const restoreAnimatedPanelTransitions = useCallback(() => {
    if (panelTransitionModeResetFrameRef.current !== null) {
      cancelAnimationFrame(panelTransitionModeResetFrameRef.current);
    }
    panelTransitionModeResetFrameRef.current = requestAnimationFrame(() => {
      panelTransitionModeResetFrameRef.current = null;
      setPanelTransitionMode("animated");
    });
  }, []);

  const updateShellPhase = useCallback((
    nextPhase: "full" | "collapsing" | "compact" | "expanding",
  ) => {
    shellPhaseRef.current = nextPhase;
    setShellPhase(nextPhase);
  }, []);

  const applyCurrentWindowInteractionMode = useCallback((
    nextMode: AmeowCurrentWindowInteractionMode,
  ) => {
    if (interactionModeRef.current === nextMode) {
      return;
    }
    interactionModeRef.current = nextMode;
    desktopCurrentWindow.setInteractionMode(nextMode);
  }, []);

  useEffect(() => {
    if (!startsInNativeCompactStartupWindow || !supportsCompactPassthroughHotspot) {
      return;
    }
    applyCurrentWindowInteractionMode("compact-passthrough");
  }, [
    applyCurrentWindowInteractionMode,
    startsInNativeCompactStartupWindow,
    supportsCompactPassthroughHotspot,
  ]);

  const showQueueNotice = useCallback((message: string) => {
    setQueueNoticeMessage(message);
    if (queueNoticeTimerRef.current !== null) {
      clearTimeout(queueNoticeTimerRef.current);
    }
    queueNoticeTimerRef.current = window.setTimeout(() => {
      setQueueNoticeMessage(null);
      queueNoticeTimerRef.current = null;
    }, 2400);
  }, []);

  const addCancellingTraceId = useCallback((traceId: string) => {
    setCancellingTraceIds((current) => {
      if (current.includes(traceId)) {
        return current;
      }
      const next = [...current, traceId];
      cancellingTraceIdsRef.current = new Set(next);
      return next;
    });
  }, []);

  const removeCancellingTraceId = useCallback((traceId: string) => {
    setCancellingTraceIds((current) => {
      if (!current.includes(traceId)) {
        return current;
      }
      const next = current.filter((item) => item !== traceId);
      cancellingTraceIdsRef.current = new Set(next);
      return next;
    });
  }, []);

  const updateContextMenuOpen = useCallback((open: boolean) => {
    isContextMenuOpenRef.current = open;
    setIsContextMenuOpen(open);
  }, []);

  const clearCancellingTraceIds = useCallback(() => {
    cancellingTraceIdsRef.current = new Set();
    setCancellingTraceIds([]);
  }, []);

  const addPendingTranscodeActionTraceId = useCallback((traceId: string) => {
    setPendingTranscodeActionTraceIds((current) => {
      if (current.includes(traceId)) {
        return current;
      }
      const next = [...current, traceId];
      pendingTranscodeActionTraceIdsRef.current = new Set(next);
      return next;
    });
  }, []);

  const removePendingTranscodeActionTraceId = useCallback((traceId: string) => {
    setPendingTranscodeActionTraceIds((current) => {
      if (!current.includes(traceId)) {
        return current;
      }
      const next = current.filter((item) => item !== traceId);
      pendingTranscodeActionTraceIdsRef.current = new Set(next);
      return next;
    });
  }, []);

  const openCurrentOutputFolder = useCallback(async () => {
    try {
      await desktopCommands.invoke<void>("open_current_output_folder");
    } catch (err) {
      console.error("Failed to open current output folder:", err);
    }
  }, []);

  const clearPointerLeaveCollapseTimer = useCallback(() => {
    if (pointerLeaveCollapseTimerRef.current !== null) {
      clearTimeout(pointerLeaveCollapseTimerRef.current);
      pointerLeaveCollapseTimerRef.current = null;
    }
  }, []);

  const clearMainWindowInteractionTimer = useCallback(() => {
    clearPointerLeaveCollapseTimer();
  }, [clearPointerLeaveCollapseTimer]);

  const getCurrentWindowPosition = useCallback(async () => {
    if (lastKnownWindowPositionRef.current) {
      return lastKnownWindowPositionRef.current;
    }

    const nextPosition = await desktopCurrentWindow.outerPosition();
    lastKnownWindowPositionRef.current = nextPosition;
    return nextPosition;
  }, []);

  const syncCurrentWindowPositionCache = useCallback(async () => {
    const nextPosition = await desktopCurrentWindow.outerPosition();
    lastKnownWindowPositionRef.current = nextPosition;
    return nextPosition;
  }, []);

  const beginMainWindowBoundsTransition = useCallback((
    target: "compact" | "full",
  ) => {
    const nextTransition = advanceMainWindowBoundsTransition(
      mainWindowBoundsTransitionRef.current,
      target,
    );
    mainWindowBoundsTransitionRef.current = nextTransition;
    if (target === "full") {
      pendingCompactResizeTokenRef.current = null;
    }
    return nextTransition.token;
  }, []);

  const isMainWindowBoundsTransitionStillCurrent = useCallback((
    expectedToken: number | null | undefined,
    expectedTarget?: "compact" | "full",
  ) => (
    isMainWindowBoundsTransitionCurrent(
      mainWindowBoundsTransitionRef.current,
      expectedToken,
      expectedTarget,
    )
  ), []);

  const resizeMainWindowPreservingPosition = useCallback(async (
    width: number,
    height: number,
    {
      transitionToken,
    }: {
      transitionToken?: number;
    } = {},
  ) => {
    const position = await getCurrentWindowPosition();
    const result = await desktopCurrentWindow.animateBounds({
      x: position.x,
      y: position.y,
      width,
      height,
    }, {
      durationMs: 0,
      transitionToken,
    });
    lastKnownWindowPositionRef.current = position;
    return result.transitionToken;
  }, [getCurrentWindowPosition]);

  const ensureMainWindowCompactTargetVisible = useCallback(async (
    transitionToken: number,
  ) => {
    const [position, size] = await Promise.all([
      desktopCurrentWindow.outerPosition(),
      desktopCurrentWindow.outerSize(),
    ]);
    lastKnownWindowPositionRef.current = position;

    let monitor: AmeowDisplay | null = null;
    try {
      monitor = await desktopSystem.currentMonitor();
    } catch (err) {
      console.error("Failed to resolve current monitor for compact window placement:", err);
    }

    if (!isMainWindowBoundsTransitionStillCurrent(transitionToken, "compact")) {
      return;
    }

    const targetBounds = resolveMainWindowCompactVisibilityBounds({
      currentBounds: {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      },
      compactFrameSize: ICON_SIZE,
      edgePadding: WINDOW_EDGE_PADDING,
      monitor,
    });

    if (targetBounds.x === position.x && targetBounds.y === position.y) {
      return;
    }

    const result = await desktopCurrentWindow.animateBounds(targetBounds, {
      durationMs: shouldReduceMotion ? 0 : COMPACT_WINDOW_VISIBILITY_MOVE_DURATION_MS,
      transitionToken,
    });

    if (!isMainWindowBoundsTransitionStillCurrent(result.transitionToken, "compact")) {
      return;
    }

    lastKnownWindowPositionRef.current = {
      x: targetBounds.x,
      y: targetBounds.y,
    };
  }, [
    ICON_SIZE,
    WINDOW_EDGE_PADDING,
    isMainWindowBoundsTransitionStillCurrent,
    shouldReduceMotion,
  ]);

  const dispatchShellEventRef = useRef<((event: MainWindowShellEvent) => void) | null>(null);

  const runShellEffects = useCallback((effects: MainWindowShellModeEffect[]) => {
    for (const effect of effects) {
      switch (effect.type) {
        case "cancelCollapseTimer":
          clearMainWindowInteractionTimer();
          break;
        case "startCollapseTimer":
          clearMainWindowInteractionTimer();
          pointerLeaveCollapseTimerRef.current = window.setTimeout(() => {
            pointerLeaveCollapseTimerRef.current = null;
            dispatchShellEventRef.current?.({
              type: "collapseTimerFired",
              token: effect.token,
            });
          }, 80);
          break;
        case "setInteractionMode":
          if (effect.mode === "compact-passthrough" && !supportsCompactPassthroughHotspot) {
            break;
          }
          applyCurrentWindowInteractionMode(effect.mode);
          break;
        case "requestExpand": {
          compactNativeSettledRef.current = false;
          compactHotspotInsideRef.current = false;
          beginMainWindowBoundsTransition("full");
          updateShellPhase("expanding");
          setPanelTransitionMode("animated");
          setIsMinimized(false);
          setShowEdgeGlow(false);
          window.setTimeout(() => setShowEdgeGlow(true), 500);
          break;
        }
        case "requestCollapse":
          compactHotspotInsideRef.current = false;
          compactNativeSettledRef.current = false;
          pendingCompactResizeTokenRef.current = beginMainWindowBoundsTransition("compact");
          void ensureMainWindowCompactTargetVisible(pendingCompactResizeTokenRef.current)
            .catch((err) => {
              console.error("Failed to keep compact main window visible:", err);
            });
          updateShellPhase("collapsing");
          isPanelHoveredRef.current = false;
          setIsPanelHovered(false);
          setIsMinimized(true);
          setShowEdgeGlow(false);
          break;
      }
    }
  }, [
    applyCurrentWindowInteractionMode,
    beginMainWindowBoundsTransition,
    clearMainWindowInteractionTimer,
    ensureMainWindowCompactTargetVisible,
    supportsCompactPassthroughHotspot,
    updateShellPhase,
  ]);

  const dispatchShellEvent = useCallback((event: MainWindowShellEvent) => {
    const result = reduceMainWindowShell(shellMachineRef.current, event);
    shellMachineRef.current = result.state;
    runShellEffects(result.effects);
  }, [runShellEffects]);

  dispatchShellEventRef.current = dispatchShellEvent;

  const updateDropHoverState = useCallback((isDropHovering: boolean) => {
    isDropHoveringRef.current = isDropHovering;
    if (isDropHovering) {
      if (!isPanelHoveredRef.current) {
        isPanelHoveredRef.current = true;
        setIsPanelHovered(true);
      }
      return;
    }

    isPanelHoveredRef.current = isPointerInsidePanelRef.current;
    setIsPanelHovered(isPointerInsidePanelRef.current);
  }, []);

  const clearPanelDropInteractionState = useCallback(({
    pointerInside = false,
  }: {
    pointerInside?: boolean;
  } = {}) => {
    setIsHovering(false);
    isPointerInsidePanelRef.current = pointerInside;
    updateDropHoverState(false);
    dispatchShellEvent(pointerInside
      ? { type: "setLock", lock: "drop", active: false }
      : { type: "dropLeave" });
  }, [dispatchShellEvent, updateDropHoverState]);

  const isPointInsidePanel = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) {
      return false;
    }
    const elementAtPoint = document.elementFromPoint(clientX, clientY);
    if (elementAtPoint && container.contains(elementAtPoint)) {
      return true;
    }
    const rect = container.getBoundingClientRect();
    return (
      clientX >= rect.left
      && clientX <= rect.right
      && clientY >= rect.top
      && clientY <= rect.bottom
    );
  }, []);

  const suppressNextPanelDragLeave = useCallback(() => {
    suppressNextPanelDragLeaveRef.current = true;
    window.setTimeout(() => {
      suppressNextPanelDragLeaveRef.current = false;
    }, 100);
  }, []);

  const scheduleMainWindowPointerLeaveCollapse = useCallback(() => {
    isPointerInsidePanelRef.current = false;
    isPanelHoveredRef.current = false;
    setIsPanelHovered(false);
    dispatchShellEvent({ type: "pointerLeave" });
  }, [dispatchShellEvent]);

  const scheduleMainWindowPointerEnterExpand = useCallback(() => {
    isPointerInsidePanelRef.current = true;
    isPanelHoveredRef.current = true;
    setIsPanelHovered(true);
    dispatchShellEvent({ type: "pointerEnter" });
  }, [dispatchShellEvent]);

  const closeContextMenuWindow = useCallback(async () => {
    if (await desktopWindows.has("context-menu")) {
      await desktopWindows.close("context-menu").catch(() => undefined);
    }
    updateContextMenuOpen(false);
  }, [updateContextMenuOpen]);

  const scheduleContainerFocus = useCallback(() => {
    window.setTimeout(() => {
      const container = document.querySelector('[tabIndex="0"]') as HTMLElement | null;
      container?.focus();
    }, 100);
  }, []);

  const ensureMainWindowFullMode = useCallback(async ({
    focusContainer = true,
  }: {
    focusContainer?: boolean;
  } = {}) => {
    dispatchShellEvent({ type: "forceFull" });
    setPanelTransitionMode("instant");
    restoreAnimatedPanelTransitions();
    setShowEdgeGlow(false);
    setTimeout(() => setShowEdgeGlow(true), 500);

    if (focusContainer) {
      scheduleContainerFocus();
    }
  }, [
    dispatchShellEvent,
    restoreAnimatedPanelTransitions,
    scheduleContainerFocus,
  ]);

  const prepareMainWindowForForegroundTask = useCallback(async () => {
    dispatchShellEvent({ type: "forceFull" });

    if (!isMinimizedRef.current) {
      return;
    }

    shouldReturnToCompactAfterForegroundTaskRef.current = true;
    await ensureMainWindowFullMode({
      focusContainer: false,
    });
  }, [dispatchShellEvent, ensureMainWindowFullMode]);

  const showForegroundTaskOutcome = useCallback(({
    cancelled,
    error,
    durationMs,
  }: {
    cancelled: boolean;
    error: string | null;
    durationMs: number;
  }) => {
    const requestId = foregroundOutcomeRequestIdRef.current + 1;
    foregroundOutcomeRequestIdRef.current = requestId;
    clearForegroundTaskOutcomeTimer();
    isForegroundTaskOutcomeVisibleRef.current = false;
    setIsForegroundTaskOutcomeVisible(false);
    setDownloadCancelled(cancelled);
    setDownloadErrorMessage(cancelled ? error : null);
    setIsProcessing(true);
    void (async () => {
      await prepareMainWindowForForegroundTask();
      await waitForForegroundOutcomeStableFrame();
      if (foregroundOutcomeRequestIdRef.current !== requestId) {
        return;
      }
      isForegroundTaskOutcomeVisibleRef.current = true;
      setIsForegroundTaskOutcomeVisible(true);
      foregroundTaskOutcomeTimerRef.current = window.setTimeout(() => {
        if (foregroundOutcomeRequestIdRef.current !== requestId) {
          return;
        }
        foregroundTaskOutcomeTimerRef.current = null;
        isForegroundTaskOutcomeVisibleRef.current = false;
        setIsForegroundTaskOutcomeVisible(false);
        setIsProcessing(false);
      }, durationMs);
    })();
  }, [
    clearForegroundTaskOutcomeTimer,
    prepareMainWindowForForegroundTask,
    waitForForegroundOutcomeStableFrame,
  ]);

  const showFolderDropOutcome = useCallback(() => {
    clearForegroundTaskOutcomeTimer();
    clearCenterOutcomeTimer();
    isForegroundTaskOutcomeVisibleRef.current = false;
    setIsForegroundTaskOutcomeVisible(false);
    setDownloadCancelled(false);
    setDownloadErrorMessage(null);
    setIsProcessing(false);
    setCenterOutcome("folder-success");
    centerOutcomeTimerRef.current = window.setTimeout(() => {
      centerOutcomeTimerRef.current = null;
      setCenterOutcome(null);
    }, 1400);
  }, [clearCenterOutcomeTimer, clearForegroundTaskOutcomeTimer]);

  const showFolderDropErrorOutcome = useCallback((error: string) => {
    clearForegroundTaskOutcomeTimer();
    clearCenterOutcomeTimer();
    isForegroundTaskOutcomeVisibleRef.current = false;
    setIsForegroundTaskOutcomeVisible(false);
    setDownloadCancelled(true);
    setDownloadErrorMessage(error);
    setIsProcessing(false);
    setCenterOutcome("folder-error");
    centerOutcomeTimerRef.current = window.setTimeout(() => {
      centerOutcomeTimerRef.current = null;
      setCenterOutcome(null);
      setDownloadCancelled(false);
      setDownloadErrorMessage(null);
    }, 1800);
  }, [clearCenterOutcomeTimer, clearForegroundTaskOutcomeTimer]);

  const startForegroundProcessing = useCallback(async () => {
    await prepareMainWindowForForegroundTask();
    isForegroundTaskOutcomeVisibleRef.current = false;
    setIsForegroundTaskOutcomeVisible(false);
    setIsProcessing(true);
  }, [prepareMainWindowForForegroundTask]);

  const summarizeForegroundTaskError = useCallback((error: unknown): string => {
    const fallbackMessage = checkSequenceOverflow(error)
      ? i18n.t("desktop:app.sequenceOverflowMessage")
      : "Download failed";
    return summarizeDownloadError(String(error ?? "").trim()) ?? fallbackMessage;
  }, []);

  const runForegroundImageTask = useCallback(async (
    task: () => Promise<void>,
    failureLogLabel: string,
  ) => {
    resetDownloadOutcome();
    await startForegroundProcessing();

    try {
      await task();
      await prepareMainWindowForForegroundTask();
      showForegroundTaskOutcome({
        cancelled: false,
        error: null,
        durationMs: 1400,
      });
    } catch (error) {
      console.error(failureLogLabel, error);
      await prepareMainWindowForForegroundTask();
      showForegroundTaskOutcome({
        cancelled: true,
        error: summarizeForegroundTaskError(error),
        durationMs: 1800,
      });
    }
  }, [
    prepareMainWindowForForegroundTask,
    resetDownloadOutcome,
    showForegroundTaskOutcome,
    startForegroundProcessing,
    summarizeForegroundTaskError,
  ]);

  useEffect(() => {
    if (!hasOngoingTask) {
      return;
    }

    if (isMinimized) {
      void prepareMainWindowForForegroundTask();
      return;
    }
    dispatchShellEvent({ type: "forceFull" });
  }, [
    dispatchShellEvent,
    hasOngoingTask,
    isMinimized,
    prepareMainWindowForForegroundTask,
  ]);

  // Shrink window after minimize animation completes
  const handleAnimationComplete = async () => {
    if (isUiLabPreviewActiveRef.current) {
      return;
    }
    if (
      shellPhaseRef.current === "collapsing"
      && isMinimizedRef.current
      && !isInitialMountRef.current
    ) {
      const compactResizeToken = pendingCompactResizeTokenRef.current;
      if (!isMainWindowBoundsTransitionStillCurrent(compactResizeToken, "compact")) {
        return;
      }
      setPanelTransitionMode("instant");
      dispatchShellEvent({ type: "collapseAnimationComplete" });
      updateShellPhase("compact");
      pendingCompactResizeTokenRef.current = null;
      compactHotspotInsideRef.current = false;
      isPanelHoveredRef.current = false;
      setIsPanelHovered(false);
      if (isMainWindowBoundsTransitionStillCurrent(compactResizeToken, "compact")) {
        compactNativeSettledRef.current = true;
        if (supportsCompactPassthroughHotspot) {
          applyCurrentWindowInteractionMode("compact-passthrough");
        }
      }
      restoreAnimatedPanelTransitions();
      return;
    }

    if (
      shellPhaseRef.current === "expanding"
      && !isMinimizedRef.current
    ) {
      dispatchShellEvent({ type: "expandAnimationComplete" });
      if (shellMachineRef.current.phase !== "full") {
        return;
      }
      updateShellPhase("full");
      setShowEdgeGlow(false);
      setTimeout(() => setShowEdgeGlow(true), 500);
      scheduleContainerFocus();
    }
  };

  const shouldShowEdgeGlow =
    isPanelHovered && !isHovering && !primaryTask && !visualIsMinimized && showEdgeGlow;
  const shouldShowDragGlow = isHovering && !primaryTask && !visualIsMinimized;
  const panelRenderSize = visualIsMinimized ? MINIMIZED_SHELL_SIZE : FULL_SIZE;
  const minimizedPanelOffset = visualIsMinimized ? MINIMIZED_SHELL_INSET : FULL_SHELL_INSET;
  const minimizedPanelScale = 1;
  const minimizedIconSize = isMacOS ? MINIMIZED_ICON_SIZE - 2 : MINIMIZED_ICON_SIZE;
  const minimizedIconFrameSize = isMacOS ? MINIMIZED_SHELL_SIZE : minimizedIconSize;
  const minimizedIconWrapperScale = 1;
  const shouldUseInstantPanelTransition = panelTransitionMode === "instant";
  const minimizedIconAnimate = shouldReduceMotion
    ? (visualIsMinimized
        ? { opacity: 1, scale: 1 }
        : { opacity: 0, scale: 1 })
    : (visualIsMinimized
        ? { scale: 1, opacity: 1 }
        : { scale: [1, 1.015, 0.9], opacity: [1, 1, 0] });
  const minimizedIconTransition = shouldReduceMotion
    ? { duration: 0.12 }
    : visualIsMinimized
      ? { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const }
      : { duration: 0.24, times: [0, 0.58, 1], ease: [0.22, 1, 0.36, 1] as const };
  const minimizedIconExit = shouldReduceMotion
    ? {
        opacity: 0,
        scale: 1,
        transition: { duration: 0.01 },
      }
    : {
        opacity: 0,
        scale: 1,
        transition: { duration: 0.05, ease: [0.22, 1, 0.36, 1] as const },
      };
  const panelScale = visualIsMinimized ? minimizedPanelScale : 1;
  const panelRadius = visualIsMinimized ? 100 : 16;
  const initialPanelTweenTransition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };
  const minimizedPanelTweenTransition = { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };
  const instantPanelValueTransition = { duration: 0 } as const;
  const springPanelValueTransition = { type: "spring" as const, stiffness: 400, damping: 30 };
  const panelShellClipPath = getContinuousCornerClipPath(panelRadius);
  const panelShellAnimate = {
    scale: isInitialMount ? 0.82 : panelScale,
    borderRadius: panelRadius,
    clipPath: panelShellClipPath,
    x: minimizedPanelOffset,
    y: minimizedPanelOffset,
    width: panelRenderSize,
    height: panelRenderSize,
  };
  const panelShellTransition = {
    scale: isInitialMount
      ? initialPanelTweenTransition
      : shouldUseInstantPanelTransition
        ? instantPanelValueTransition
        : visualIsMinimized
          ? minimizedPanelTweenTransition
          : springPanelValueTransition,
    borderRadius: isInitialMount
      ? initialPanelTweenTransition
      : shouldUseInstantPanelTransition
        ? instantPanelValueTransition
        : visualIsMinimized
          ? minimizedPanelTweenTransition
          : springPanelValueTransition,
    clipPath: isInitialMount
      ? initialPanelTweenTransition
      : shouldUseInstantPanelTransition
        ? instantPanelValueTransition
        : visualIsMinimized
          ? minimizedPanelTweenTransition
          : springPanelValueTransition,
    x: shouldUseInstantPanelTransition
      ? instantPanelValueTransition
      : visualIsMinimized
        ? minimizedPanelTweenTransition
        : springPanelValueTransition,
    y: shouldUseInstantPanelTransition
      ? instantPanelValueTransition
      : visualIsMinimized
        ? minimizedPanelTweenTransition
        : springPanelValueTransition,
    width: shouldUseInstantPanelTransition
      ? instantPanelValueTransition
      : visualIsMinimized
        ? minimizedPanelTweenTransition
        : springPanelValueTransition,
    height: shouldUseInstantPanelTransition
      ? instantPanelValueTransition
      : visualIsMinimized
        ? minimizedPanelTweenTransition
        : springPanelValueTransition,
  };
  const getEdgeGlowOpacity = () => {
    const distanceToEdge = Math.min(
      mousePos.x,
      mousePos.y,
      FULL_SIZE - mousePos.x,
      FULL_SIZE - mousePos.y,
    );
    const normalized = Math.max(0, 1 - distanceToEdge / EDGE_GLOW_TRIGGER_DISTANCE);
    return Math.min(1, Math.pow(normalized, EDGE_GLOW_FALLOFF_EXPONENT) * 1.18);
  };

  const edgeGlowOpacity = getEdgeGlowOpacity();

  const getEdgeGlowStyle = (): CSSProperties => {
    return {
      position: 'absolute',
      inset: 0,
      ...getContinuousCornerStyle(panelRadius),
      pointerEvents: 'none',
      padding: EDGE_GLOW_BORDER_WIDTH,
      background: `radial-gradient(
        ${EDGE_GLOW_RADIUS}px circle at ${mousePos.x}px ${mousePos.y}px,
        rgba(59,130,246,1) 0%,
        rgba(96,165,250,0.98) 18%,
        rgba(125,211,252,0.72) 38%,
        rgba(147,197,253,0.36) 56%,
        rgba(191,219,254,0.14) 70%,
        transparent 84%
      )`,
      boxShadow: 'inset 0 0 16px rgba(96,165,250,0.22), inset 0 0 28px rgba(96,165,250,0.08)',
      mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
      maskComposite: 'exclude',
      WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
      WebkitMaskComposite: 'xor',
    };
  };

  const getDragGlowStyle = (): CSSProperties => {
    return {
      position: 'absolute',
      inset: 0,
      ...getContinuousCornerStyle(panelRadius),
      pointerEvents: 'none',
      padding: DRAG_GLOW_BORDER_WIDTH,
      background: `linear-gradient(
        135deg,
        rgba(125,211,252,0.96) 0%,
        rgba(96,165,250,0.98) 35%,
        rgba(59,130,246,0.96) 65%,
        rgba(147,197,253,0.92) 100%
      )`,
      boxShadow: `
        inset 0 0 0 1px rgba(191,219,254,0.85),
        inset 0 0 22px rgba(59,130,246,0.28),
        inset 0 0 36px rgba(96,165,250,0.16)
      `,
      mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
      maskComposite: 'exclude',
      WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
      WebkitMaskComposite: 'xor',
    };
  };

  const applyRuntimeConfig = useCallback((config: Record<string, unknown>) => {
    if (typeof config.outputPath === "string") {
      setOutputPath(config.outputPath);
    }
    setRenameMediaOnDownload(resolveRenameMediaEnabled(config));
  }, []);

  const refreshRuntimeDependencyStatus = useCallback(async () => {
    try {
      const status = await desktopCommands.invoke<RuntimeDependencyStatusSnapshot>("get_runtime_dependency_status");
      startTransition(() => {
        setRuntimeDependencyStatus(status);
      });
      return status;
    } catch (err) {
      console.error("Failed to load runtime dependency status:", err);
      startTransition(() => {
        setRuntimeDependencyStatus(null);
      });
      return null;
    }
  }, []);

  const refreshAppUpdate = useCallback(async () => {
    startTransition(() => {
      setAppUpdatePhase("checking");
      setAppUpdateError(null);
    });

    try {
      const updateInfo = await desktopUpdater.check();
      if (!updateInfo) {
        startTransition(() => {
          setAppUpdateInfo(null);
          setAppUpdatePhase("idle");
        });
        return null;
      }

      startTransition(() => {
        setAppUpdateInfo(updateInfo);
        setAppUpdatePhase("available");
      });
      return updateInfo;
    } catch (err) {
      console.error(">>> App update check failed:", err);
      startTransition(() => {
        setAppUpdateInfo(null);
        setAppUpdateError(summarizeAppUpdateError(err));
        setAppUpdatePhase("idle");
      });
      return null;
    }
  }, []);

  const handleAppUpdateInstall = useCallback(async () => {
    if (!appUpdateInfo || appUpdatePhase === "downloading" || appUpdatePhase === "installing") {
      return;
    }

    setAppUpdateError(null);
    setAppUpdatePhase("downloading");

    try {
      await desktopUpdater.downloadAndInstall();
      setAppUpdatePhase("installing");
      await desktopSystem.relaunch();
    } catch (err) {
      console.error("Failed to install app update:", err);
      setAppUpdateError(summarizeAppUpdateError(err));
      setAppUpdatePhase("error");
    }
  }, [appUpdateInfo, appUpdatePhase]);

  const loadRuntimeDependencyGateState = useCallback(async () => {
    try {
      const state = await desktopCommands.invoke<RuntimeDependencyGateStatePayload>("get_runtime_dependency_gate_state");
      startTransition(() => {
        setRuntimeDependencyGateState(state);
      });
      return state;
    } catch (err) {
      console.error("Failed to load runtime dependency gate state:", err);
      startTransition(() => {
        setRuntimeDependencyGateState(null);
      });
      return null;
    }
  }, []);

  const refreshRuntimeDependencyGateState = useCallback(async () => {
    try {
      const state = await desktopCommands.invoke<RuntimeDependencyGateStatePayload>("refresh_runtime_dependency_gate_state");
      startTransition(() => {
        setRuntimeDependencyGateState(state);
      });
      return state;
    } catch (err) {
      console.error("Failed to refresh runtime dependency gate state:", err);
      startTransition(() => {
        setRuntimeDependencyGateState(null);
      });
      return null;
    }
  }, []);

  const startRuntimeDependencyBootstrap = useCallback(async (reason?: string) => {
    try {
      const state = await desktopCommands.invoke<RuntimeDependencyGateStatePayload>(
        "start_runtime_dependency_bootstrap",
        reason ? { reason } : undefined,
      );
      startTransition(() => {
        setRuntimeDependencyGateState(state);
      });
      return state;
    } catch (err) {
      console.error("Failed to start runtime dependency bootstrap:", err);
      return null;
    }
  }, []);

  const refreshRuntimeDependencyContext = useCallback(async () => {
    const [status, gate] = await Promise.all([
      refreshRuntimeDependencyStatus(),
      refreshRuntimeDependencyGateState(),
    ]);
    return { status, gate };
  }, [refreshRuntimeDependencyGateState, refreshRuntimeDependencyStatus]);

  const enqueueVideoDownload = useCallback(async (request: string | QueuedVideoDownloadRequest) => {
    await prepareMainWindowForForegroundTask();
    resetDownloadOutcome();
    const payload = typeof request === "string" ? { url: request } : request;
    const runtimeStatusForRequest = runtimeDependencyStatus
      ?? (await refreshRuntimeDependencyContext()).status;
    if (isPinterestDownloadRequest(payload) && runtimeStatusForRequest?.galleryDl.state !== "ready") {
      const missingGalleryDlMessage = summarizeDownloadError(
        runtimeStatusForRequest?.galleryDl.error ?? "Missing managed gallery-dl runtime",
      ) ?? "Missing managed gallery-dl runtime";
      console.error("Cannot queue Pinterest download because gallery-dl is unavailable:", missingGalleryDlMessage);
      setDownloadCancelled(true);
      setDownloadErrorMessage(missingGalleryDlMessage);
      return;
    }
    void desktopCommands.invoke<QueuedVideoDownloadAck>("queue_video_download", payload).catch((err) => {
      console.error("Failed to queue video download:", err);
      checkSequenceOverflow(err);
      setDownloadCancelled(true);
      setDownloadErrorMessage(summarizeDownloadError(String(err)));
    });
  }, [
    prepareMainWindowForForegroundTask,
    refreshRuntimeDependencyContext,
    resetDownloadOutcome,
    runtimeDependencyStatus,
  ]);

  const enqueuePastedVideoDownload = useCallback(async (url: string) => {
    await prepareMainWindowForForegroundTask();
    resetDownloadOutcome();
    void desktopCommands.invoke<QueuedVideoDownloadAck>("queue_pasted_video_download", { url }).catch((err) => {
      console.error("Failed to queue pasted video download:", err);
      checkSequenceOverflow(err);
      setDownloadCancelled(true);
      setDownloadErrorMessage(summarizeDownloadError(String(err)));
    });
  }, [
    prepareMainWindowForForegroundTask,
    resetDownloadOutcome,
  ]);

  const cancelVideoTask = useCallback(async (
    traceId: string,
    options?: { showCurrentTaskFeedback?: boolean },
  ) => {
    if (!traceId || cancellingTraceIdsRef.current.has(traceId)) {
      return;
    }

    addCancellingTraceId(traceId);
    if (options?.showCurrentTaskFeedback) {
      setDownloadCancelled(true);
      setDownloadErrorMessage(t("app.queue.cancellingCurrent"));
    }

    try {
      const cancelled = await desktopCommands.invoke<boolean>("cancel_download", { traceId });
      if (!cancelled) {
        removeCancellingTraceId(traceId);
      }
    } catch (err) {
      removeCancellingTraceId(traceId);
      if (options?.showCurrentTaskFeedback) {
        setDownloadCancelled(false);
        setDownloadErrorMessage(null);
      }
      console.error("Failed to cancel download:", err);
    }
  }, [addCancellingTraceId, removeCancellingTraceId, t]);

  const retryTranscodeTask = useCallback(async (traceId: string) => {
    if (!traceId || pendingTranscodeActionTraceIdsRef.current.has(traceId)) {
      return;
    }

    addPendingTranscodeActionTraceId(traceId);

    try {
      const retried = await desktopCommands.invoke<boolean>("retry_transcode", { traceId });
      if (!retried) {
        console.warn("Transcode retry was ignored for trace:", traceId);
      }
    } catch (err) {
      console.error("Failed to retry transcode:", err);
    } finally {
      removePendingTranscodeActionTraceId(traceId);
    }
  }, [addPendingTranscodeActionTraceId, removePendingTranscodeActionTraceId]);

  const removeTranscodeTask = useCallback(async (traceId: string) => {
    if (!traceId || pendingTranscodeActionTraceIdsRef.current.has(traceId)) {
      return;
    }

    addPendingTranscodeActionTraceId(traceId);

    try {
      const removed = await desktopCommands.invoke<boolean>("remove_transcode", { traceId });
      if (!removed) {
        console.warn("Transcode remove was ignored for trace:", traceId);
      }
    } catch (err) {
      console.error("Failed to remove transcode row:", err);
    } finally {
      removePendingTranscodeActionTraceId(traceId);
    }
  }, [addPendingTranscodeActionTraceId, removePendingTranscodeActionTraceId]);

  const cancelTranscodeTask = useCallback(async (traceId: string) => {
    if (!traceId || pendingTranscodeActionTraceIdsRef.current.has(traceId)) {
      return;
    }

    addPendingTranscodeActionTraceId(traceId);

    try {
      const cancelled = await desktopCommands.invoke<boolean>("cancel_transcode", { traceId });
      if (!cancelled) {
        removePendingTranscodeActionTraceId(traceId);
        console.warn("Transcode cancel was ignored for trace:", traceId);
      }
    } catch (err) {
      removePendingTranscodeActionTraceId(traceId);
      console.error("Failed to cancel transcode:", err);
    }
  }, [addPendingTranscodeActionTraceId, removePendingTranscodeActionTraceId]);

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const configStr = await desktopCommands.invoke<string>("get_config");
        console.log("Loaded config:", configStr);
        const config = parseDesktopAppConfig(configStr);
        applyRuntimeConfig(config);
      } catch (err) {
        console.error("Failed to load config:", err);
      }
    };
    loadConfig();
  }, [applyRuntimeConfig, isMacOS]);

  useEffect(() => {
    if (!isDeferredStartupInitializationReady) {
      return;
    }

    const loadRuntimeDependencies = async () => {
      await Promise.all([
        refreshRuntimeDependencyStatus(),
        loadRuntimeDependencyGateState(),
      ]);
    };

    void loadRuntimeDependencies();
  }, [
    isDeferredStartupInitializationReady,
    loadRuntimeDependencyGateState,
    refreshRuntimeDependencyStatus,
  ]);

  useEffect(() => {
    if (isMacOS) {
      return;
    }

    let cancelled = false;
    void desktopCurrentWindow.outerPosition()
      .then((position) => {
        if (!cancelled) {
          lastKnownWindowPositionRef.current = position;
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isMacOS]);

  // Keep the compact reveal only for full-sized startup windows.
  useEffect(() => {
    if (startsInNativeCompactStartupWindow) {
      return;
    }
    let startupSettleFrame: number | null = null;
    const timer = setTimeout(() => {
      isInitialMountRef.current = false;
      setIsInitialMount(false);
      startupSettleFrame = requestAnimationFrame(() => {
        startupSettleFrame = null;
        dispatchShellEvent({ type: "startupSettle" });
      });
    }, 100);
    return () => {
      clearTimeout(timer);
      if (startupSettleFrame !== null) {
        cancelAnimationFrame(startupSettleFrame);
      }
    };
  }, [dispatchShellEvent, startsInNativeCompactStartupWindow]);

  useEffect(() => {
    if (!startsInNativeCompactStartupWindow) {
      return;
    }

    void resizeMainWindowPreservingPosition(
      INTERMEDIATE_EXPAND_SIZE,
      INTERMEDIATE_EXPAND_SIZE,
    ).catch((err) => {
      console.error("Failed to normalize startup compact window bounds:", err);
    });
  }, [
    INTERMEDIATE_EXPAND_SIZE,
    resizeMainWindowPreservingPosition,
    startsInNativeCompactStartupWindow,
  ]);

  useEffect(() => {
    return () => {
      if (resetCounterFeedbackTimerRef.current !== null) {
        clearTimeout(resetCounterFeedbackTimerRef.current);
      }
      if (queueNoticeTimerRef.current !== null) {
        clearTimeout(queueNoticeTimerRef.current);
      }
      if (runtimeRetryFeedbackTimerRef.current !== null) {
        clearTimeout(runtimeRetryFeedbackTimerRef.current);
      }
      if (runtimeSuccessTimerRef.current !== null) {
        clearTimeout(runtimeSuccessTimerRef.current);
      }
      if (runtimeBootstrapAfterVisibleTimerRef.current !== null) {
        clearTimeout(runtimeBootstrapAfterVisibleTimerRef.current);
      }
      if (startupAutoMinimizeReleaseTimerRef.current !== null) {
        clearTimeout(startupAutoMinimizeReleaseTimerRef.current);
      }
      if (deferredStartupInitializationTimerRef.current !== null) {
        clearTimeout(deferredStartupInitializationTimerRef.current);
      }
      clearDeferredStartupInitializationIdle();
      if (pointerLeaveCollapseTimerRef.current !== null) {
        clearTimeout(pointerLeaveCollapseTimerRef.current);
      }
      if (panelTransitionModeResetFrameRef.current !== null) {
        cancelAnimationFrame(panelTransitionModeResetFrameRef.current);
      }
      if (compactHotspotFrameRef.current !== null) {
        cancelAnimationFrame(compactHotspotFrameRef.current);
      }
    };
  }, [clearDeferredStartupInitializationIdle]);

  useEffect(() => {
    if (isDeferredStartupInitializationReady || isInitialMount) {
      return;
    }
    if (deferredStartupInitializationDelayMs <= 0) {
      markDeferredStartupInitializationReady();
      return;
    }

    deferredStartupInitializationTimerRef.current = window.setTimeout(() => {
      deferredStartupInitializationTimerRef.current = null;
      if (typeof window.requestIdleCallback === "function") {
        deferredStartupInitializationIdleRef.current = window.requestIdleCallback(() => {
          deferredStartupInitializationIdleRef.current = null;
          setIsDeferredStartupInitializationReady(true);
        }, {
          timeout: DEFERRED_STARTUP_IDLE_CALLBACK_TIMEOUT_MS,
        });
        return;
      }

      markDeferredStartupInitializationReady();
    }, deferredStartupInitializationDelayMs);

    return () => {
      if (deferredStartupInitializationTimerRef.current !== null) {
        clearTimeout(deferredStartupInitializationTimerRef.current);
        deferredStartupInitializationTimerRef.current = null;
      }
      clearDeferredStartupInitializationIdle();
    };
  }, [
    clearDeferredStartupInitializationIdle,
    markDeferredStartupInitializationReady,
    deferredStartupInitializationDelayMs,
    isDeferredStartupInitializationReady,
    isInitialMount,
  ]);

  useEffect(() => {
    if (
      isInitialMount
      || !isDeferredStartupInitializationReady
      || hasTriggeredStartupRuntimeBootstrapRef.current
      || runtimeBootstrapAfterVisibleTimerRef.current !== null
    ) {
      return;
    }

    const shouldAutoStartBootstrap = shouldAutoStartManagedRuntimeBootstrapOnStartup({
      isInitialMount,
      hasTriggeredStartupBootstrap: hasTriggeredStartupRuntimeBootstrapRef.current,
      runtimeDependencyStatus,
      gatePhase: runtimeDependencyGateState?.phase,
      isWindowReadyForStartupBootstrap: isWindowReadyForStartupRuntimeBootstrap,
    });

    if (!shouldAutoStartBootstrap) {
      return;
    }

    runtimeBootstrapAfterVisibleTimerRef.current = window.setTimeout(() => {
      runtimeBootstrapAfterVisibleTimerRef.current = null;
      hasTriggeredStartupRuntimeBootstrapRef.current = true;
      void startRuntimeDependencyBootstrap("startup_auto_retry").then((state) => {
        if (!state || state.phase === "idle") {
          hasTriggeredStartupRuntimeBootstrapRef.current = false;
        }
      });
    }, STARTUP_AUTO_RUNTIME_BOOTSTRAP_DELAY_MS);
  }, [
    isDeferredStartupInitializationReady,
    isInitialMount,
    runtimeDependencyGateState?.phase,
    runtimeDependencyStatus,
    isWindowReadyForStartupRuntimeBootstrap,
    startRuntimeDependencyBootstrap,
  ]);

  // Listen for video download progress events
  useEffect(() => {
    const unlistenProgress = desktopEvents.on<DownloadProgressPayload>(
      "video-download-progress",
      async (event) => {
        const payload = event.payload;
        await prepareMainWindowForForegroundTask();
        setDownloadProgressByTrace((current) => applyDownloadProgressEvent(current, payload));
        setDownloadErrorMessage(null);
      }
    );
    const unlistenComplete = desktopEvents.on<DownloadResult>(
      "video-download-complete",
      (event) => {
        console.log(">>> [Frontend] video-download-complete received:", event);
        const payload = event.payload;
        setDownloadProgressByTrace((current) => removeDownloadProgressTrace(current, payload.traceId));
        const outcome = resolveDownloadCompleteOutcome(
          payload,
          cancellingTraceIdsRef.current.has(payload.traceId),
        );
        removeCancellingTraceId(payload.traceId);

        showForegroundTaskOutcome({
          cancelled: !outcome.success,
          error: outcome.success ? null : outcome.errorSummary,
          durationMs: 1500,
        });
        if (!outcome.success) {
          console.error(">>> [Frontend] Video download failed:", payload?.error ?? "Unknown error");
        }
      }
    );
    return () => {
      unlistenProgress.then(fn => fn());
      unlistenComplete.then(fn => fn());
    };
  }, [
    prepareMainWindowForForegroundTask,
    removeCancellingTraceId,
    showForegroundTaskOutcome,
  ]);

  // Listen for output path changes from settings window
  useEffect(() => {
    const unlisten = desktopEvents.on<{ path: string }>("output-path-changed", (event) => {
      setOutputPath(event.payload.path);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    const unlisten = desktopEvents.on<void>("context-menu-closed", () => {
      updateContextMenuOpen(false);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [updateContextMenuOpen]);

  useEffect(() => () => {
    clearForegroundTaskOutcomeTimer();
    clearCenterOutcomeTimer();
  }, [clearCenterOutcomeTimer, clearForegroundTaskOutcomeTimer]);

  // Listen for devMode changes from settings window
  useEffect(() => {
    const unlisten = desktopEvents.on<{ enabled: boolean }>("devmode-changed", (event) => {
      setDevMode(event.payload.enabled);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    const unlisten = desktopEvents.on<{ restoreLive?: boolean }>("ui-lab-reset", (event) => {
      const restoreLive = event.payload?.restoreLive === true;
      isUiLabPreviewActiveRef.current = !restoreLive;
      setIsUiLabPreviewActive(!restoreLive);
      if (!restoreLive) {
        void ensureMainWindowFullMode({
          focusContainer: false,
        });
      }
      if (queueNoticeTimerRef.current !== null) {
        clearTimeout(queueNoticeTimerRef.current);
        queueNoticeTimerRef.current = null;
      }
      if (runtimeRetryFeedbackTimerRef.current !== null) {
        clearTimeout(runtimeRetryFeedbackTimerRef.current);
        runtimeRetryFeedbackTimerRef.current = null;
      }
      if (runtimeSuccessTimerRef.current !== null) {
        clearTimeout(runtimeSuccessTimerRef.current);
        runtimeSuccessTimerRef.current = null;
      }

      pendingTranscodeActionTraceIdsRef.current = new Set();
      setPendingTranscodeActionTraceIds([]);
      setDownloadProgressByTrace({});
      setVideoQueueState(EMPTY_VIDEO_QUEUE_STATE);
      setVideoQueueDetail(EMPTY_VIDEO_QUEUE_DETAIL);
      clearCancellingTraceIds();
      setVideoTranscodeQueueState(EMPTY_VIDEO_TRANSCODE_QUEUE_STATE);
      setVideoTranscodeQueueDetail(EMPTY_VIDEO_TRANSCODE_QUEUE_DETAIL);
      setTranscodeProgressByTrace({});
      resetDownloadOutcome();
      setQueueNoticeMessage(null);
      setIsQueuePopoverOpen(false);
      setIsRuntimeRetryInFlight(false);
      setIsRuntimeRetryFeedbackVisible(false);
      setShowRuntimeSuccessIndicator(false);
      setIsRuntimeIndicatorHovered(false);
      if (restoreLive) {
        void refreshRuntimeDependencyContext();
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, [clearCancellingTraceIds, ensureMainWindowFullMode, refreshRuntimeDependencyContext, resetDownloadOutcome]);

  // Listen for rename toggle changes from settings window
  useEffect(() => {
    const unlisten = desktopEvents.on<{ enabled: boolean }>("rename-setting-changed", (event) => {
      setRenameMediaOnDownload(Boolean(event.payload.enabled));
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    const unlisten = desktopEvents.on<{ receivePrereleaseUpdates: boolean }>(
      "app-update-preference-changed",
      () => {
        void refreshAppUpdate();
      },
    );
    return () => { unlisten.then(fn => fn()); };
  }, [refreshAppUpdate]);

  // Listen for shortcut show event
  useEffect(() => {
    const unlisten = desktopEvents.on<void>("shortcut-show", () => {
      void syncCurrentWindowPositionCache()
        .catch((err) => {
          console.error("Failed to sync window position after shortcut show:", err);
        })
        .then(() => ensureMainWindowFullMode());
    });
    return () => { unlisten.then(fn => fn()); };
  }, [ensureMainWindowFullMode, syncCurrentWindowPositionCache]);

  // Check app update availability on startup
  useEffect(() => {
    if (!isDeferredStartupInitializationReady) {
      return;
    }
    void refreshAppUpdate();
  }, [isDeferredStartupInitializationReady, refreshAppUpdate]);

  useEffect(() => {
    const unlisten = desktopEvents.on<RuntimeDependencyGateStatePayload>(
      "runtime-dependency-gate-state",
      (event) => {
        const nextGateState = event.payload;
        startTransition(() => {
          setRuntimeDependencyGateState(nextGateState);
        });
        if (runtimeGateIsActive(nextGateState.phase)) {
          return;
        }
        void refreshRuntimeDependencyStatus();
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshRuntimeDependencyStatus]);

  useEffect(() => {
    const previousPhase = previousRuntimeGatePhaseRef.current;
    const currentPhase = runtimeDependencyGateState?.phase ?? "idle";
    previousRuntimeGatePhaseRef.current = currentPhase;

    const transitionedFromActiveToReady = runtimeGateIsActive(previousPhase) && currentPhase === "ready";
    if (!transitionedFromActiveToReady) {
      if (currentPhase !== "ready" && showRuntimeSuccessIndicator) {
        setShowRuntimeSuccessIndicator(false);
      }
      return;
    }

    setShowRuntimeSuccessIndicator(true);
    setIsRuntimeIndicatorHovered(false);
    if (runtimeSuccessTimerRef.current !== null) {
      clearTimeout(runtimeSuccessTimerRef.current);
    }
    runtimeSuccessTimerRef.current = window.setTimeout(() => {
      setShowRuntimeSuccessIndicator(false);
      runtimeSuccessTimerRef.current = null;
    }, 1120);
  }, [runtimeDependencyGateState?.phase, showRuntimeSuccessIndicator]);

  useEffect(() => {
    const previousTaskCount = previousTaskCountRef.current;
    previousTaskCountRef.current = totalTaskCount;

    if (previousTaskCount > 0 || totalTaskCount === 0) {
      return;
    }

    const currentPhase = runtimeDependencyGateState?.phase ?? "idle";
    if (runtimeGatePhasePreservesDecision(currentPhase)) {
      return;
    }

    void refreshRuntimeDependencyContext();
  }, [refreshRuntimeDependencyContext, runtimeDependencyGateState?.phase, totalTaskCount]);

  useEffect(() => {
    const unlisten = desktopEvents.on<VideoQueueStatePayload>("video-queue-count", (event) => {
      const { state, shouldClearCancellingTraceIds } = applyVideoQueueStateEvent(event.payload);
      setVideoQueueState(state);
      if (shouldClearCancellingTraceIds) {
        clearCancellingTraceIds();
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, [clearCancellingTraceIds]);

  useEffect(() => {
    const unlisten = desktopEvents.on<VideoQueueDetailPayload>("video-queue-detail", (event) => {
      const detail = normalizeVideoQueueDetailEvent(event.payload);
      setVideoQueueDetail(detail);
      // Detail reflects the task list the UI is actually rendering, so reconcile progress here
      // instead of clearing it on count events that may arrive slightly earlier.
      setDownloadProgressByTrace((current) =>
        pruneDownloadProgressToQueueDetail(current, detail)
      );
      setCancellingTraceIds((current) => {
        const next = pruneCancellingTraceIdsToQueueDetail(current, detail);
        if (next.length === current.length) {
          return current;
        }
        // Keep the synchronous ref aligned with the pruned state; completion events read this ref.
        cancellingTraceIdsRef.current = new Set(next);
        return next;
      });
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    const unlistenCount = desktopEvents.on<VideoTranscodeQueueStatePayload>("video-transcode-queue-count", (event) => {
      const { state } = applyVideoTranscodeQueueStateEvent(event.payload, {});
      setVideoTranscodeQueueState(state);
      if (state.activeCount === 0) {
        setTranscodeProgressByTrace((current) =>
          clearTranscodeProgressWhenInactive(state, current)
        );
      }
    });

    const unlistenDetail = desktopEvents.on<VideoTranscodeQueueDetailPayload>("video-transcode-queue-detail", (event) => {
      const normalized = normalizeVideoTranscodeQueueDetail(event.payload);
      setVideoTranscodeQueueDetail(normalized);
    });

    const unlistenProgress = desktopEvents.on<VideoTranscodeTaskPayload>("video-transcode-progress", async (event) => {
      const normalized = normalizeVideoTranscodeTask(event.payload);
      if (!normalized) {
        return;
      }

      await prepareMainWindowForForegroundTask();
      setTranscodeProgressByTrace((current) =>
        applyNormalizedTranscodeProgressToMap(current, normalized)
      );
      setVideoTranscodeQueueDetail((current) =>
        applyNormalizedTranscodeProgressToDetail(current, normalized)
      );
      setDownloadErrorMessage(null);
    });

    const unlistenQueued = desktopEvents.on<VideoTranscodeTaskPayload>("video-transcode-queued", (event) => {
      const normalized = normalizeVideoTranscodeTask(event.payload);
      if (!normalized) {
        return;
      }
      setVideoTranscodeQueueDetail((current) =>
        upsertTranscodeTaskToDetail(current, normalized)
      );
    });

    const unlistenRetried = desktopEvents.on<VideoTranscodeTaskPayload>("video-transcode-retried", (event) => {
      const normalized = normalizeVideoTranscodeTask(event.payload);
      if (!normalized) {
        return;
      }
      removePendingTranscodeActionTraceId(normalized.traceId);
      setVideoTranscodeQueueDetail((current) =>
        upsertTranscodeTaskToDetail(current, normalized)
      );
      setTranscodeProgressByTrace((current) =>
        removeTranscodeProgressTrace(current, normalized.traceId)
      );
    });

    const unlistenRemoved = desktopEvents.on<VideoTranscodeTaskPayload>("video-transcode-removed", (event) => {
      const normalized = normalizeVideoTranscodeTask(event.payload);
      if (!normalized) {
        return;
      }
      removePendingTranscodeActionTraceId(normalized.traceId);
      setVideoTranscodeQueueDetail((current) =>
        removeTranscodeTaskFromDetail(current, normalized.traceId)
      );
      setTranscodeProgressByTrace((current) =>
        removeTranscodeProgressTrace(current, normalized.traceId)
      );
    });

    const unlistenFailed = desktopEvents.on<VideoTranscodeTaskPayload>("video-transcode-failed", (event) => {
      const normalized = normalizeVideoTranscodeTask(event.payload);
      if (!normalized) {
        return;
      }
      removePendingTranscodeActionTraceId(normalized.traceId);
      setVideoTranscodeQueueDetail((current) =>
        upsertTranscodeTaskToDetail(current, normalized)
      );
      setTranscodeProgressByTrace((current) =>
        removeTranscodeProgressTrace(current, normalized.traceId)
      );
      showForegroundTaskOutcome({
        cancelled: true,
        error: normalized.error ?? getTranscodeStageLabel(i18n.t, "failed"),
        durationMs: 1800,
      });
      showQueueNotice(t("app.queue.transcodeFailedNotice"));
    });

    const unlistenComplete = desktopEvents.on<VideoTranscodeCompletePayload>("video-transcode-complete", (event) => {
      const payload = event.payload;
      removePendingTranscodeActionTraceId(payload.traceId);
      setVideoTranscodeQueueDetail((current) =>
        removeTranscodeTaskFromDetail(current, payload.traceId)
      );
      setTranscodeProgressByTrace((current) =>
        removeTranscodeProgressTrace(current, payload.traceId)
      );
      showForegroundTaskOutcome({
        cancelled: false,
        error: null,
        durationMs: 1400,
      });
      showQueueNotice(t("app.queue.transcodeCompleted"));
    });

    return () => {
      unlistenCount.then((fn) => fn());
      unlistenDetail.then((fn) => fn());
      unlistenProgress.then((fn) => fn());
      unlistenQueued.then((fn) => fn());
      unlistenRetried.then((fn) => fn());
      unlistenRemoved.then((fn) => fn());
      unlistenFailed.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
    };
  }, [
    prepareMainWindowForForegroundTask,
    removePendingTranscodeActionTraceId,
    showForegroundTaskOutcome,
    showQueueNotice,
    t,
  ]);

  useEffect(() => {
    if (totalTaskCount === 0) {
      setIsQueuePopoverOpen(false);
    }
  }, [totalTaskCount]);

  // Block F12 if devMode is disabled
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12' && !devMode) {
        e.preventDefault();
        console.log("F12 blocked: devMode is disabled");
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [devMode]);

  const syncMainWindowInteraction = useCallback(({
    expandIfMinimized = true,
  }: {
    expandIfMinimized?: boolean;
  } = {}) => {
    const wasMinimized = isMinimizedRef.current;

    if (expandIfMinimized && wasMinimized) {
      dispatchShellEvent({ type: "pointerEnter" });
    }
  }, [dispatchShellEvent]);

  const evaluateCompactHotspot = useCallback((clientX: number, clientY: number) => {
    if (!supportsCompactPassthroughHotspot) {
      return;
    }
    if (shellPhaseRef.current !== "compact") {
      return;
    }
    if (interactionModeRef.current !== "compact-passthrough") {
      return;
    }

    const insideHotspot = isPointInsideCompactPointerHotspot({
      pointX: clientX,
      pointY: clientY,
      centerX: ICON_SIZE / 2,
      centerY: ICON_SIZE / 2,
      enterRadius: COMPACT_HOTSPOT_FRAME_SIZE / 2,
      exitRadius: COMPACT_HOTSPOT_FRAME_SIZE / 2 + 4,
      wasInside: compactHotspotInsideRef.current,
    });

    if (!insideHotspot || compactHotspotInsideRef.current) {
      compactHotspotInsideRef.current = insideHotspot;
      return;
    }

    compactHotspotInsideRef.current = true;
    scheduleMainWindowPointerEnterExpand();
  }, [
    COMPACT_HOTSPOT_FRAME_SIZE,
    ICON_SIZE,
    scheduleMainWindowPointerEnterExpand,
    supportsCompactPassthroughHotspot,
  ]);

  useEffect(() => {
    if (!supportsCompactPassthroughHotspot || shellPhase !== "compact") {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (interactionModeRef.current !== "compact-passthrough") {
        return;
      }
      if (compactHotspotFrameRef.current !== null) {
        return;
      }
      const { clientX, clientY } = event;

      compactHotspotFrameRef.current = requestAnimationFrame(() => {
        compactHotspotFrameRef.current = null;
        evaluateCompactHotspot(clientX, clientY);
      });
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => {
      if (compactHotspotFrameRef.current !== null) {
        cancelAnimationFrame(compactHotspotFrameRef.current);
        compactHotspotFrameRef.current = null;
      }
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [evaluateCompactHotspot, shellPhase, supportsCompactPassthroughHotspot, visualIsMinimized]);

  useEffect(() => {
    dispatchShellEvent({ type: "setLock", lock: "task", active: hasOngoingTask || isProcessing });
  }, [dispatchShellEvent, hasOngoingTask, isProcessing]);

  useEffect(() => {
    dispatchShellEvent({
      type: "setLock",
      lock: "centerOutcome",
      active: isForegroundTaskOutcomeVisible || centerOutcome !== null,
    });
  }, [centerOutcome, dispatchShellEvent, isForegroundTaskOutcomeVisible]);

  useEffect(() => {
    dispatchShellEvent({ type: "setLock", lock: "contextMenu", active: isContextMenuOpen });
  }, [dispatchShellEvent, isContextMenuOpen]);

  useEffect(() => {
    dispatchShellEvent({ type: "setLock", lock: "uiLab", active: isUiLabPreviewActive });
  }, [dispatchShellEvent, isUiLabPreviewActive]);

  useEffect(() => {
    dispatchShellEvent({
      type: "setLock",
      lock: "appUpdate",
      active: appUpdatePhase === "downloading" || appUpdatePhase === "installing" || runtimeGateIsBusy,
    });
  }, [appUpdatePhase, dispatchShellEvent, runtimeGateIsBusy]);

  useEffect(() => {
    if (hasOngoingTask || isProcessing || !shouldReturnToCompactAfterForegroundTaskRef.current) {
      return;
    }

    if (isMinimizedRef.current) {
      shouldReturnToCompactAfterForegroundTaskRef.current = false;
      return;
    }

    shouldReturnToCompactAfterForegroundTaskRef.current = false;
    dispatchShellEvent({ type: "startupSettle" });
  }, [
    dispatchShellEvent,
    hasOngoingTask,
    isProcessing,
  ]);

  useEffect(() => {
    if (visualIsMinimized) {
      return;
    }

    const handleWindowMouseOut = (event: MouseEvent) => {
      if (event.relatedTarget !== null) {
        return;
      }
      scheduleMainWindowPointerLeaveCollapse();
    };

    window.addEventListener("mouseout", handleWindowMouseOut);
    return () => {
      window.removeEventListener("mouseout", handleWindowMouseOut);
    };
  }, [scheduleMainWindowPointerLeaveCollapse, visualIsMinimized]);

  useEffect(() => {
    if (visualIsMinimized) {
      return;
    }

    let cancelled = false;
    const unlisten = desktopCurrentWindow.onPointerBoundaryChanged(({ payload }) => {
      if (cancelled) {
        return;
      }
      if (payload.inside) {
        scheduleMainWindowPointerEnterExpand();
        return;
      }
      scheduleMainWindowPointerLeaveCollapse();
    });

    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
    };
  }, [
    scheduleMainWindowPointerEnterExpand,
    scheduleMainWindowPointerLeaveCollapse,
    visualIsMinimized,
  ]);

  useEffect(() => {
    if (startupAutoMinimizeGraceMs <= 0) {
      startupAutoMinimizeUnlockedRef.current = true;
      return;
    }

    startupAutoMinimizeUnlockedRef.current = false;
    startupAutoMinimizeReleaseTimerRef.current = window.setTimeout(() => {
      startupAutoMinimizeReleaseTimerRef.current = null;
      startupAutoMinimizeUnlockedRef.current = true;
      dispatchShellEvent({ type: "setLock", lock: "startup", active: false });
      dispatchShellEvent({ type: "startupSettle" });
    }, startupAutoMinimizeGraceMs);

    return () => {
      if (startupAutoMinimizeReleaseTimerRef.current !== null) {
        clearTimeout(startupAutoMinimizeReleaseTimerRef.current);
        startupAutoMinimizeReleaseTimerRef.current = null;
      }
      startupAutoMinimizeUnlockedRef.current = startupAutoMinimizeGraceMs === 0;
    };
  }, [dispatchShellEvent, startupAutoMinimizeGraceMs]);

  useEffect(() => {
    if (!runtimeGateIsBusy) {
      return;
    }

    dispatchShellEvent({ type: "forceFull" });
  }, [
    dispatchShellEvent,
    runtimeGateIsBusy,
  ]);

  useEffect(() => () => {
    clearMainWindowInteractionTimer();
  }, [clearMainWindowInteractionTimer]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isContextMenuOpen) {
        return;
      }
      void closeContextMenuWindow();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeContextMenuWindow, isContextMenuOpen]);

  const flushWindowDragPosition = useCallback(() => {
    windowDragFrameRef.current = null;
    const dragState = activeWindowDragRef.current;
    if (!dragState) {
      return;
    }

    if (
      dragState.lastAppliedX === dragState.nextX
      && dragState.lastAppliedY === dragState.nextY
    ) {
      return;
    }

    dragState.lastAppliedX = dragState.nextX;
    dragState.lastAppliedY = dragState.nextY;
    lastKnownWindowPositionRef.current = {
      x: dragState.nextX,
      y: dragState.nextY,
    };
    desktopCurrentWindow.setPosition({
      x: dragState.nextX,
      y: dragState.nextY,
    });
  }, []);

  const scheduleWindowDragPosition = useCallback(() => {
    if (windowDragFrameRef.current !== null) {
      return;
    }

    windowDragFrameRef.current = window.requestAnimationFrame(() => {
      flushWindowDragPosition();
    });
  }, [flushWindowDragPosition]);

  const updateManualWindowDrag = useCallback((screenX: number, screenY: number) => {
    const dragState = activeWindowDragRef.current;
    if (!dragState) {
      return;
    }

    dragState.nextX = Math.round(dragState.windowX + (screenX - dragState.startScreenX));
    dragState.nextY = Math.round(dragState.windowY + (screenY - dragState.startScreenY));

    if (
      dragState.nextX === dragState.lastAppliedX
      && dragState.nextY === dragState.lastAppliedY
    ) {
      return;
    }

    scheduleWindowDragPosition();
  }, [scheduleWindowDragPosition]);

  const releasePanelPointerCapture = useCallback((pointerId: number | null) => {
    if (pointerId === null) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    try {
      if (container.hasPointerCapture(pointerId)) {
        container.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore browsers that already released or never established pointer capture.
    }
  }, []);

  const resetWindowDragState = useCallback((options?: {
    eventPointerId?: number | null;
  }) => {
    const pointerId = resolvePanelPointerCaptureId({
      eventPointerId: options?.eventPointerId ?? null,
      activePointerId: activeWindowDragRef.current?.pointerId ?? null,
      pendingPointerId: pendingDragStartRef.current?.pointerId ?? null,
    });

    releasePanelPointerCapture(pointerId);
    pendingDragStartRef.current = null;
    activeWindowDragRef.current = null;
    isWindowPointerDownRef.current = false;
    dispatchShellEvent({ type: "setLock", lock: "drag", active: false });
    if (windowDragFrameRef.current !== null) {
      window.cancelAnimationFrame(windowDragFrameRef.current);
      windowDragFrameRef.current = null;
    }

    const wasDragging = isDraggingRef.current;
    isDraggingRef.current = false;
    if (wasDragging) {
      syncMainWindowInteraction();
    }
  }, [dispatchShellEvent, releasePanelPointerCapture, syncMainWindowInteraction]);

  const finishWindowDrag = useCallback((eventPointerId?: number | null) => {
    resetWindowDragState({
      eventPointerId: eventPointerId ?? null,
    });
  }, [resetWindowDragState]);

  useEffect(() => {
    const handleWindowPointerUp = () => {
      if (
        !isDraggingRef.current
        && !pendingDragStartRef.current
        && !activeWindowDragRef.current
        && !isWindowPointerDownRef.current
      ) {
        return;
      }

      resetWindowDragState();
    };

    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);
    return () => {
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
    };
  }, [resetWindowDragState]);

  useEffect(() => {
    const handleGlobalDropSessionEnd = () => {
      clearPanelDropInteractionState();
    };

    window.addEventListener("drop", handleGlobalDropSessionEnd, true);
    window.addEventListener("dragend", handleGlobalDropSessionEnd, true);
    window.addEventListener("blur", handleGlobalDropSessionEnd);
    return () => {
      window.removeEventListener("drop", handleGlobalDropSessionEnd, true);
      window.removeEventListener("dragend", handleGlobalDropSessionEnd, true);
      window.removeEventListener("blur", handleGlobalDropSessionEnd);
    };
  }, [clearPanelDropInteractionState]);

  useEffect(() => {
    return () => {
      if (windowDragFrameRef.current !== null) {
        window.cancelAnimationFrame(windowDragFrameRef.current);
      }
    };
  }, []);

  const startWindowDrag = useCallback(async (screenX: number, screenY: number) => {
    const pendingDragStart = pendingDragStartRef.current;
    if (!pendingDragStart || isDraggingRef.current) {
      return;
    }

    pendingDragStartRef.current = null;
    isDraggingRef.current = true;
    dispatchShellEvent({ type: "setLock", lock: "drag", active: true });

    try {
      const windowPosition = await pendingDragStart.windowPositionPromise;
      lastKnownWindowPositionRef.current = windowPosition;
      if (!isWindowPointerDownRef.current) {
        isDraggingRef.current = false;
        dispatchShellEvent({ type: "setLock", lock: "drag", active: false });
        syncMainWindowInteraction();
        return;
      }

      activeWindowDragRef.current = {
        pointerId: pendingDragStart.pointerId,
        startScreenX: pendingDragStart.screenX,
        startScreenY: pendingDragStart.screenY,
        windowX: windowPosition.x,
        windowY: windowPosition.y,
        nextX: windowPosition.x,
        nextY: windowPosition.y,
        lastAppliedX: windowPosition.x,
        lastAppliedY: windowPosition.y,
        applyInFlight: false,
      };
      updateManualWindowDrag(screenX, screenY);
    } catch (err) {
      console.error("Failed to start manual window drag:", err);
      isDraggingRef.current = false;
      dispatchShellEvent({ type: "setLock", lock: "drag", active: false });
      syncMainWindowInteraction();
    }
  }, [dispatchShellEvent, syncMainWindowInteraction, updateManualWindowDrag]);

  const canDoubleClickOpenOutputFolder =
    !visualIsMinimized &&
    !isProcessing &&
    !primaryTask &&
    totalTaskCount === 0 &&
    !isQueuePopoverOpen;

  const triggerPanelOutputFolderShortcut = async (
    e: Pick<React.MouseEvent<HTMLDivElement>, "preventDefault" | "stopPropagation">,
  ) => {
    const now = Date.now();
    if (now - lastPanelOutputFolderShortcutAtRef.current < PANEL_OUTPUT_FOLDER_SHORTCUT_DEDUP_MS) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    lastPanelOutputFolderShortcutAtRef.current = now;
    resetWindowDragState();
    e.preventDefault();
    e.stopPropagation();
    syncMainWindowInteraction();
    await openCurrentOutputFolder();
  };

  const handlePanelPointerDown = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // 只响应左键
    if (isContextMenuOpen) {
      await closeContextMenuWindow();
      return;
    }
    if (visualIsMinimized) {
      syncMainWindowInteraction();
      return;
    }
    const targetIgnored = shouldIgnorePanelDoubleClickTarget(e.target);
    if (targetIgnored) {
      resetWindowDragState();
      return;
    }

    if (shouldOpenOutputFolderFromPanelMouseDownDoubleClick({
      isMacOS,
      button: e.button,
      detail: e.detail,
      canDoubleClickOpenOutputFolder,
      targetIgnored,
    })) {
      await triggerPanelOutputFolderShortcut(e);
      return;
    }

    isWindowPointerDownRef.current = true;
    dispatchShellEvent({ type: "setLock", lock: "drag", active: true });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore environments where pointer capture cannot be established.
    }
    pendingDragStartRef.current = {
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      windowPositionPromise: desktopCurrentWindow.outerPosition().then((position) => {
        lastKnownWindowPositionRef.current = position;
        return position;
      }),
    };
  };

  const handlePanelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      const activeDrag = activeWindowDragRef.current;
      if (activeDrag && activeDrag.pointerId === e.pointerId) {
        updateManualWindowDrag(e.screenX, e.screenY);
      }
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    if (!visualIsMinimized) {
      clearMainWindowInteractionTimer();
    }

    const pendingDragStart = pendingDragStartRef.current;
    if (
      !pendingDragStart
      || pendingDragStart.pointerId !== e.pointerId
      || e.buttons !== 1
      || visualIsMinimized
    ) {
      return;
    }

    const dragDistance = Math.hypot(
      e.clientX - pendingDragStart.clientX,
      e.clientY - pendingDragStart.clientY,
    );
    if (dragDistance < WINDOW_DRAG_START_THRESHOLD) {
      return;
    }

    void startWindowDrag(e.screenX, e.screenY);
  };

  const handlePanelPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      finishWindowDrag(e.pointerId);
      return;
    }

    resetWindowDragState({
      eventPointerId: e.pointerId,
    });
  };

  const handlePanelPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      finishWindowDrag(e.pointerId);
      return;
    }

    resetWindowDragState({
      eventPointerId: e.pointerId,
    });
  };

  const handlePanelDoubleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    resetWindowDragState();
    if (e.button !== 0 || !canDoubleClickOpenOutputFolder) {
      return;
    }
    if (shouldIgnorePanelDoubleClickTarget(e.target)) {
      return;
    }

    await triggerPanelOutputFolderShortcut(e);
  };

  // Handle paste event - check for video URL first, then image URL, then clipboard images/files.
  const handlePaste = async (clipboardData: DataTransfer | null) => {
    syncMainWindowInteraction({ expandIfMinimized: false });

    const text = clipboardData?.getData("text/plain") ?? "";

    // 1. Check if clipboard text is a video URL (highest priority)
    if (text && isResolvableVideoInputUrl(text)) {
      console.log("Pasted video URL:", text);
      await enqueuePastedVideoDownload(text);
      return;
    }

    // 2. Check if clipboard text is an image URL
    if (text && isImageUrl(text)) {
      console.log("Pasted image URL:", text);
      await runForegroundImageTask(async () => {
        // Distinguish between Data URL and HTTP URL
        if (text.startsWith("data:image/")) {
          const result = await desktopCommands.invoke<string>("save_data_url", {
            dataUrl: text,
            targetDir: outputPath || null,
          });
          console.log("Save data URL result:", result);
        } else {
          const result = await desktopCommands.invoke<string>("download_image", {
            url: text,
            targetDir: outputPath || null,
          });
          console.log("Download result:", result);
        }
      }, "Failed to process pasted image URL:");
      return;
    }

    // 3. Try the image/file payload exposed directly on the paste event first.
    const pastedImageFile = extractClipboardImageFile(clipboardData);
    if (pastedImageFile) {
      console.log(
        "Detected clipboard image file from paste event:",
        pastedImageFile.name || "<unnamed>",
      );
      await runForegroundImageTask(async () => {
        const dataUrl = await fileToDataUrl(pastedImageFile);
        const result = await desktopCommands.invoke<string>("save_data_url", {
          dataUrl,
          targetDir: outputPath || null,
          originalFilename: pastedImageFile.name || undefined,
        });
        console.log("Save clipboard image file result:", result);
      }, "Failed to save clipboard image file:");
      return;
    }

    // 4. Some screenshot tools expose the image only through pasted HTML.
    const pastedHtml = clipboardData?.getData("text/html") ?? "";
    const pastedHtmlImageUrl = pastedHtml ? extractImageUrlFromHtml(pastedHtml) : null;
    if (pastedHtmlImageUrl) {
      console.log("Detected clipboard image from HTML payload:", pastedHtmlImageUrl);
      await runForegroundImageTask(async () => {
        if (pastedHtmlImageUrl.startsWith("data:image/")) {
          const result = await desktopCommands.invoke<string>("save_data_url", {
            dataUrl: pastedHtmlImageUrl,
            targetDir: outputPath || null,
          });
          console.log("Save clipboard HTML image result:", result);
        } else {
          const result = await desktopCommands.invoke<string>("download_image", {
            url: pastedHtmlImageUrl,
            targetDir: outputPath || null,
          });
          console.log("Download clipboard HTML image result:", result);
        }
      }, "Failed to process clipboard HTML image:");
      return;
    }

    // 5. Try reading a clipboard image through the desktop bridge.
    try {
      const clipboardImageDataUrl = await readClipboardImageDataUrl();
      if (clipboardImageDataUrl) {
        console.log("Detected clipboard image, saving to output folder");
        await runForegroundImageTask(async () => {
          const result = await desktopCommands.invoke<string>("save_data_url", {
            dataUrl: clipboardImageDataUrl,
            targetDir: outputPath || null,
          });
          console.log("Save clipboard image result:", result);
        }, "Failed to save clipboard image:");
        return;
      }
    } catch (err) {
      console.warn("Clipboard image is not available for paste:", err);
    }

    // 6. Otherwise, continue with file processing logic.
    try {
      const paths = await desktopCommands.invoke<string[]>("get_clipboard_files");

      if (paths && paths.length > 0) {
        console.log("Clipboard files from backend:", paths);
        resetDownloadOutcome();
        await startForegroundProcessing();

        try {
          await desktopCommands.invoke("process_files", {
            paths,
            targetDir: outputPath || null
          });
        } catch (err) {
          console.warn("Failed to process clipboard files:", err);
          checkSequenceOverflow(err);
        }

        setTimeout(() => setIsProcessing(false), 1000);
      } else {
        console.warn("No pasteable clipboard image or files detected");
      }
    } catch (err) {
      console.warn("Failed to get clipboard files:", err);
    }
  };

  pasteHandlerRef.current = (event: ClipboardEvent) => {
    event.preventDefault();
    void handlePaste(event.clipboardData);
  };

  useEffect(() => {
    const handleWindowPaste = (event: ClipboardEvent) => {
      pasteHandlerRef.current(event);
    };

    window.addEventListener("paste", handleWindowPaste);
    return () => {
      window.removeEventListener("paste", handleWindowPaste);
    };
  }, []);

  // Check if URL looks like an image
  const isImageUrl = (url: string): boolean => {
    // Support Data URL
    if (url.startsWith("data:image/")) {
      return true;
    }
    // Support file:// protocol (local files from apps like Feishu/Lark)
    if (url.startsWith("file://")) {
      const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i;
      return imageExtensions.test(url);
    }
    // HTTP URL check
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return false;
    }
    // Common image extensions or known image hosts
    const imagePatterns = [
      /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i,
      /images\./i,
      /img\./i,
      /i\.imgur\.com/i,
      /pbs\.twimg\.com/i,
      /(?:^|\.)sinaimg\.cn\//i,
      /cdn\.discordapp\.com/i,
      /xhscdn\.com\/.*(?:imageView2|format\/(?:jpe?g|png|webp|gif))/i,
      /sns-webpic[^/]*\.xhscdn\.com/i,
    ];
    return imagePatterns.some(pattern => pattern.test(url));
  };

  // Handle native drop event for URL detection
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsHovering(false);
    const pointerInsideAfterDrop = isPointInsidePanel(e.clientX, e.clientY);
    isPointerInsidePanelRef.current = pointerInsideAfterDrop;
    updateDropHoverState(true);
    dispatchShellEvent({ type: "dropEnter" });

    try {
    const droppedFolderResult = await desktopDrop.consumePendingFolderDrop();
    if (droppedFolderResult?.success) {
      try {
        await saveOutputPath(droppedFolderResult.path);
        setOutputPath(droppedFolderResult.path);
        resetDownloadOutcome();
        showFolderDropOutcome();
      } catch (err) {
        console.error("Failed to save dropped folder path:", err);
        showFolderDropErrorOutcome(t("app.drop.errors.saveFailed"));
      }

      suppressNextPanelDragLeave();
      clearPanelDropInteractionState({ pointerInside: pointerInsideAfterDrop });
      return;
    }

    if (droppedFolderResult && shouldHandleDroppedFolderResult(droppedFolderResult)) {
      console.error("Failed to resolve dropped folder:", droppedFolderResult);
      showFolderDropErrorOutcome(t(getDroppedFolderErrorTranslationKey(droppedFolderResult.reason)));
      suppressNextPanelDragLeave();
      clearPanelDropInteractionState({ pointerInside: pointerInsideAfterDrop });
      return;
    }

    // 2. Debug logging
    console.log("Drop types:", e.dataTransfer.types);
    console.log("text/uri-list:", e.dataTransfer.getData("text/uri-list"));
    console.log("text/plain:", e.dataTransfer.getData("text/plain"));
    console.log("text/html:", e.dataTransfer.getData("text/html"));
    // Also log files for debugging
    console.log("files:", e.dataTransfer.files.length, Array.from(e.dataTransfer.files).map(f => f.name));

    const html = e.dataTransfer.getData("text/html");
    const rawUriList = e.dataTransfer.getData("text/uri-list");
    const rawPlain = e.dataTransfer.getData("text/plain");
    const rawProtectedImageDrag = e.dataTransfer.getData("application/x-ameow-protected-image-drag");
    const rawXiaohongshuDrag = e.dataTransfer.getData("application/x-ameow-xiaohongshu-drag");
    const embeddedPinterestDragPayload =
      extractEmbeddedPinterestDragPayload(html) ??
      extractEmbeddedPinterestDragPayload(rawPlain) ??
      extractEmbeddedPinterestDragPayload(rawUriList);
    const embeddedXiaohongshuDragPayload =
      extractEmbeddedXiaohongshuDragPayload(rawXiaohongshuDrag) ??
      extractEmbeddedXiaohongshuDragPayload(rawPlain) ??
      extractEmbeddedXiaohongshuDragPayload(rawUriList) ??
      extractEmbeddedXiaohongshuDragPayload(html);
    const protectedImageDragPayload =
      extractEmbeddedProtectedImageDragPayload(rawProtectedImageDrag) ??
      extractEmbeddedProtectedImageDragPayload(rawPlain) ??
      extractEmbeddedProtectedImageDragPayload(rawUriList) ??
      extractEmbeddedProtectedImageDragPayload(html);

    // Check for URL in dataTransfer
    // Note: text/uri-list may return "about:blank#blocked" due to security policy
    let url = pickDroppedUrl(rawUriList);
    if (!url || url === "about:blank#blocked" || url.startsWith("about:")) {
      url = pickDroppedUrl(rawPlain);
    }
    if ((!url || url === "about:blank#blocked" || url.startsWith("about:")) && embeddedPinterestDragPayload?.pageUrl) {
      url = embeddedPinterestDragPayload.pageUrl;
    }
    if ((!url || url === "about:blank#blocked" || url.startsWith("about:")) && embeddedXiaohongshuDragPayload?.pageUrl) {
      url = embeddedXiaohongshuDragPayload.pageUrl;
    }

    const droppedVideoFiles = filterDroppedFilesByMimePrefix(e.dataTransfer, "video/");
    if (droppedVideoFiles.length > 0) {
      console.log("Detected dragged video file payload, saving directly from dataTransfer.files");
      resetDownloadOutcome();
      await startForegroundProcessing();

      await saveDroppedFilesToOutput(droppedVideoFiles, outputPath || null);

      setTimeout(() => setIsProcessing(false), 1000);
      return;
    }

    // === 优先处理本地文件 file:// URL ===
    if (url && url.startsWith("file://")) {
      const localPath = parseLocalFileUrl(url) ?? decodeURIComponent(url.replace("file:///", ""));
      console.log("Detected local file URL:", localPath);
      resetDownloadOutcome();
      await startForegroundProcessing();

      try {
        const copyResult = await desktopCommands.invoke<string>("process_files", {
          paths: [localPath],
          targetDir: outputPath || null,
        });
        console.log("Copy local file result:", copyResult);
      } catch (err) {
        console.error("Failed to copy local file:", err);
        checkSequenceOverflow(err);
      }

      setTimeout(() => setIsProcessing(false), 1000);
      return;
    }

    // === Pinterest special handling ===
    if (url && isPinterestPinUrl(url)) {
      const pinterestDragDiagnostic = buildPinterestDragDiagnostic(html);
      const hasEmbeddedVideoHint = Boolean(
        embeddedPinterestDragPayload?.videoUrl ||
        (embeddedPinterestDragPayload?.videoCandidates.length ?? 0) > 0,
      );
      console.log(
        "[Pinterest drag debug] payload:",
        JSON.stringify({
          pageUrl: url,
          looksLikeVideoHtml: looksLikePinterestVideoHtml(html),
          hasEmbeddedVideoHint,
          ...pinterestDragDiagnostic,
        }),
      );

      if (!looksLikePinterestVideoHtml(html) && !hasEmbeddedVideoHint) {
        const imageUrl = extractPinterestImageUrlFromHtml(html);
        if (imageUrl) {
          console.log("Detected Pinterest image pin, downloading extracted image:", imageUrl);
          await runForegroundImageTask(async () => {
            await desktopCommands.invoke<string>("download_image", {
              url: imageUrl,
              targetDir: outputPath || null,
            });
          }, "Failed to download Pinterest image:");
          return;
        }
      }

      const videoSelection = extractPinterestVideoSelectionFromHtml(html);
      const mergedVideoCandidates = mergeVideoCandidatesByUrl(
        embeddedPinterestDragPayload?.videoCandidates ?? [],
        videoSelection.videoCandidates,
      );
      const mergedVideoUrl =
        embeddedPinterestDragPayload?.videoUrl ?? videoSelection.videoUrl ?? undefined;
      console.log("Detected Pinterest video pin, queueing Pinterest media resolution:", {
        pageUrl: url,
        hasVideoUrl: Boolean(mergedVideoUrl),
        videoCandidatesCount: mergedVideoCandidates.length,
        topVideoCandidates: mergedVideoCandidates.slice(0, 4),
      });
      resetDownloadOutcome();
      await enqueueVideoDownload({
        url,
        pageUrl: embeddedPinterestDragPayload?.pageUrl ?? url,
        videoUrl: mergedVideoUrl,
        videoCandidates: mergedVideoCandidates,
        dragDiagnostic: pinterestDragDiagnostic,
      });
      return;
    }

    const xiaohongshuPageUrl =
      embeddedXiaohongshuDragPayload?.pageUrl
      ?? (url && isXiaohongshuPageUrl(url) ? url : null);
    if (xiaohongshuPageUrl) {
      let resolvedXiaohongshuMedia: XiaohongshuResolvedDragMedia | null = null;

      try {
        resolvedXiaohongshuMedia = await desktopCommands.invoke<XiaohongshuResolvedDragMedia | null>("resolve_xiaohongshu_drag_media", {
          url: xiaohongshuPageUrl,
          pageUrl: xiaohongshuPageUrl,
          detailUrl: embeddedXiaohongshuDragPayload?.detailUrl ?? undefined,
          sourcePageUrl: embeddedXiaohongshuDragPayload?.sourcePageUrl ?? undefined,
          token: embeddedXiaohongshuDragPayload?.token ?? undefined,
          noteId: embeddedXiaohongshuDragPayload?.noteId ?? undefined,
          imageUrl:
            embeddedXiaohongshuDragPayload?.exactImageUrl
            ?? embeddedXiaohongshuDragPayload?.imageUrl
            ?? undefined,
          mediaType: embeddedXiaohongshuDragPayload?.mediaType ?? undefined,
          videoIntentConfidence: embeddedXiaohongshuDragPayload?.videoIntentConfidence ?? undefined,
          videoIntentSources: embeddedXiaohongshuDragPayload?.videoIntentSources ?? undefined,
        });
      } catch (error) {
        console.error("[Xiaohongshu drag debug] resolve_xiaohongshu_drag_media failed:", error);
      }

      console.log("[Xiaohongshu drag debug] resolved drag media payload:", {
        pageUrl: xiaohongshuPageUrl,
        detailUrl: embeddedXiaohongshuDragPayload?.detailUrl ?? null,
        sourcePageUrl: embeddedXiaohongshuDragPayload?.sourcePageUrl ?? null,
        token: embeddedXiaohongshuDragPayload?.token ?? null,
        noteId: embeddedXiaohongshuDragPayload?.noteId ?? null,
        requestedImageUrl:
          embeddedXiaohongshuDragPayload?.exactImageUrl
          ?? embeddedXiaohongshuDragPayload?.imageUrl
          ?? null,
        resultKind: resolvedXiaohongshuMedia?.kind ?? "null",
        resultVideoUrl: resolvedXiaohongshuMedia?.videoUrl ?? null,
        resultVideoCandidatesCount: resolvedXiaohongshuMedia?.videoCandidates.length ?? 0,
        resultImageUrl: resolvedXiaohongshuMedia?.imageUrl ?? null,
        embeddedVideoIntentConfidence: embeddedXiaohongshuDragPayload?.videoIntentConfidence ?? null,
        embeddedVideoIntentSources: embeddedXiaohongshuDragPayload?.videoIntentSources ?? [],
        resolvedVideoIntentConfidence: resolvedXiaohongshuMedia?.videoIntentConfidence ?? null,
        resolvedVideoIntentSources: resolvedXiaohongshuMedia?.videoIntentSources ?? [],
      });

      const shouldQueueResolvedXiaohongshuVideo =
        Boolean(xiaohongshuPageUrl)
        && (
          embeddedXiaohongshuDragPayload?.mediaType === "video"
          || hasXiaohongshuVideoSignals(embeddedXiaohongshuDragPayload
            ? {
                kind: embeddedXiaohongshuDragPayload.mediaType ?? "unknown",
                videoUrl: embeddedXiaohongshuDragPayload.videoUrl,
                videoCandidates: embeddedXiaohongshuDragPayload.videoCandidates,
                videoIntentConfidence: embeddedXiaohongshuDragPayload.videoIntentConfidence,
              }
            : null)
          || hasXiaohongshuVideoSignals(resolvedXiaohongshuMedia)
        );
      console.log("[Xiaohongshu drag debug] video queue decision:", {
        pageUrl: xiaohongshuPageUrl,
        token: embeddedXiaohongshuDragPayload?.token ?? null,
        noteId: embeddedXiaohongshuDragPayload?.noteId ?? null,
        embeddedMediaType: embeddedXiaohongshuDragPayload?.mediaType ?? null,
        embeddedHasVideoUrl: Boolean(embeddedXiaohongshuDragPayload?.videoUrl),
        embeddedVideoCandidatesCount: embeddedXiaohongshuDragPayload?.videoCandidates.length ?? 0,
        embeddedVideoIntentConfidence: embeddedXiaohongshuDragPayload?.videoIntentConfidence ?? null,
        embeddedVideoIntentSources: embeddedXiaohongshuDragPayload?.videoIntentSources ?? [],
        resolvedKind: resolvedXiaohongshuMedia?.kind ?? "null",
        resolvedVideoUrl: resolvedXiaohongshuMedia?.videoUrl ?? null,
        resolvedVideoCandidatesCount: resolvedXiaohongshuMedia?.videoCandidates.length ?? 0,
        resolvedVideoIntentConfidence: resolvedXiaohongshuMedia?.videoIntentConfidence ?? null,
        resolvedVideoIntentSources: resolvedXiaohongshuMedia?.videoIntentSources ?? [],
        shouldQueueResolvedXiaohongshuVideo,
      });

      if (shouldQueueResolvedXiaohongshuVideo) {
        console.log("[Xiaohongshu drag debug] queueing resolved video media:", {
          pageUrl: resolvedXiaohongshuMedia?.pageUrl ?? xiaohongshuPageUrl,
          resolvedKind: resolvedXiaohongshuMedia?.kind ?? "null",
          embeddedMediaType: embeddedXiaohongshuDragPayload?.mediaType ?? null,
          embeddedVideoIntentConfidence: embeddedXiaohongshuDragPayload?.videoIntentConfidence ?? null,
          resolvedVideoIntentConfidence: resolvedXiaohongshuMedia?.videoIntentConfidence ?? null,
        });
        resetDownloadOutcome();
        await enqueueVideoDownload({
          url: resolvedXiaohongshuMedia?.pageUrl ?? xiaohongshuPageUrl,
          pageUrl: resolvedXiaohongshuMedia?.pageUrl ?? xiaohongshuPageUrl,
          videoUrl: resolvedXiaohongshuMedia?.videoUrl ?? undefined,
          videoCandidates: resolvedXiaohongshuMedia?.videoCandidates ?? undefined,
          siteHint: "xiaohongshu",
        });
        return;
      }

      const resolvedXiaohongshuImageUrl = pickXiaohongshuImageForDownload({
        embeddedPayload: embeddedXiaohongshuDragPayload,
        resolvedMedia: resolvedXiaohongshuMedia,
      });
      if (resolvedXiaohongshuImageUrl) {
        console.log("[Xiaohongshu drag debug] resolved page image media:", {
          pageUrl: xiaohongshuPageUrl,
          imageUrl: resolvedXiaohongshuImageUrl,
        });
        await runForegroundImageTask(async () => {
          const result = await desktopCommands.invoke<string>("download_image", {
            url: resolvedXiaohongshuImageUrl,
            targetDir: outputPath || null,
            pageUrl: xiaohongshuPageUrl,
            requestHeaders: {
              Referer: xiaohongshuPageUrl,
              Origin: "https://www.xiaohongshu.com",
            },
          });
          console.log("Download result:", result);
        }, "Failed to process Xiaohongshu resolved page image:");
        return;
      }

      console.warn("[Xiaohongshu drag debug] no media resolved; skipping generic fallback for Xiaohongshu page", {
        pageUrl: xiaohongshuPageUrl,
        resolvedKind: resolvedXiaohongshuMedia?.kind ?? "null",
        embeddedMediaType: embeddedXiaohongshuDragPayload?.mediaType ?? null,
      });
      return;
    }

    const htmlImageUrl = extractImageUrlFromHtml(html, {
      baseUrl: /^https?:\/\//i.test(url) ? url : null,
    });
    const shouldPreferTwitterXImageBranch = shouldPreferTwitterXImageDrop({
      dropUrl: url,
      html,
      htmlImageUrl,
    });
    const resolvedImageUrl =
      url && isImageUrl(url)
        ? url
        : (
            shouldPreferTwitterXImageBranch
            || !url
            || !isResolvableVideoInputUrl(url)
          )
          ? htmlImageUrl
          : null;
    const resolvedImagePageUrl = (() => {
      if (protectedImageDragPayload?.pageUrl) {
        return canonicalizeTwitterXPageUrl(protectedImageDragPayload.pageUrl) ?? protectedImageDragPayload.pageUrl;
      }
      if (
        url
        && resolvedImageUrl
        && url !== resolvedImageUrl
        && /^https?:\/\//i.test(url)
      ) {
        return canonicalizeTwitterXPageUrl(url) ?? url;
      }
      return null;
    })();

    // Check if it's a video URL (highest priority)
    if (url && isResolvableVideoInputUrl(url) && !shouldPreferTwitterXImageBranch) {
      console.log("Detected video URL:", url);
      resetDownloadOutcome();
      await enqueueVideoDownload(url);
      return;
    }

    // Check if it's an image URL
    if (resolvedImageUrl && isImageUrl(resolvedImageUrl)) {
      if (resolvedImageUrl !== url) {
        console.log("Detected image URL from HTML fallback:", {
          pageUrl: url || null,
          imageUrl: resolvedImageUrl,
        });
      } else {
        console.log("Detected image URL:", resolvedImageUrl);
      }
      await runForegroundImageTask(async () => {
        const protectedImageFallback =
          protectedImageDragPayload &&
          (!protectedImageDragPayload.imageUrl || protectedImageDragPayload.imageUrl === resolvedImageUrl)
            ? {
                token: protectedImageDragPayload.token,
                pageUrl: protectedImageDragPayload.pageUrl,
                imageUrl: protectedImageDragPayload.imageUrl ?? resolvedImageUrl,
              }
            : null;

        if (protectedImageFallback) {
          console.log("Protected image drag payload detected:", protectedImageFallback);
        }

        // Distinguish between Data URL, file:// URL, and HTTP URL
        if (resolvedImageUrl.startsWith("data:image/")) {
          const result = await desktopCommands.invoke<string>("save_data_url", {
            dataUrl: resolvedImageUrl,
            targetDir: outputPath || null,
          });
          console.log("Save data URL result:", result);
        } else if (resolvedImageUrl.startsWith("file://")) {
          // Convert file:// URL to local path
          const localPath =
            parseLocalFileUrl(resolvedImageUrl)
            ?? decodeURIComponent(resolvedImageUrl.replace("file:///", ""));
          console.log("Detected local file:", localPath);

          // First try to copy from local path
          const copyResult = await desktopCommands.invoke<string>("process_files", {
            paths: [localPath],
            targetDir: outputPath || null,
          });
          console.log("Copy result:", copyResult);

          // If copy failed (0 files), try reading from dataTransfer.files
          if (copyResult.includes("Copied 0 files") && e.dataTransfer.files.length > 0) {
            console.log("Local file not found, trying dataTransfer.files...");
            const droppedImageFiles = filterDroppedFilesByMimePrefix(e.dataTransfer, "image/");
            const savedCount = await saveDroppedFilesToOutput(droppedImageFiles, outputPath || null);
            console.log("Saved image files from dataTransfer.files fallback:", savedCount);
          }
        } else {
          try {
            const imageQualityUpgrade = await upgradeImageUrl({
              imageUrl: resolvedImageUrl,
              pageUrl: resolvedImagePageUrl,
            });
            const finalImageUrl = imageQualityUpgrade.upgradedUrl ?? resolvedImageUrl;
            console.log("Image quality upgrade decision:", {
              originalUrl: resolvedImageUrl,
              finalUrl: finalImageUrl,
              strategy: imageQualityUpgrade.strategy,
              confidence: imageQualityUpgrade.confidence,
              notes: imageQualityUpgrade.notes,
              requestHeaders: imageQualityUpgrade.requestHeaders ?? null,
            });
            const result = await desktopCommands.invoke<string>("download_image", {
              url: finalImageUrl,
              targetDir: outputPath || null,
              protectedImageFallback,
              pageUrl: resolvedImagePageUrl,
              requestHeaders: imageQualityUpgrade.requestHeaders,
            });
            console.log("Download result:", result);
          } catch (downloadErr) {
            const droppedImageFiles = filterDroppedFilesByMimePrefix(e.dataTransfer, "image/");
            if (protectedImageFallback && droppedImageFiles.length > 0) {
              console.warn(
                "Protected image download failed, falling back to dragged image file payloads:",
                downloadErr,
              );
              const savedCount = await saveDroppedFilesToOutput(
                droppedImageFiles,
                outputPath || null,
              );
              if (savedCount > 0) {
                console.log("Saved protected image from dataTransfer.files fallback:", savedCount);
              } else {
                throw downloadErr;
              }
            } else {
              throw downloadErr;
            }
          }
        }
      }, "Failed to process image:");
      return;
    }

    // If URL not recognized but files exist, try reading from dataTransfer.files
    if (e.dataTransfer.files.length > 0) {
      console.log("URL not recognized, trying dataTransfer.files...");
      resetDownloadOutcome();
      await startForegroundProcessing();

      // 收集所有文件路径
      const filePaths: string[] = [];
      for (const file of Array.from(e.dataTransfer.files)) {
        // 尝试获取本地路径（桌面环境）
        const path = (file as any).path;
        if (path) {
          filePaths.push(path);
        }
      }

      if (filePaths.length > 0) {
        // 有本地路径，直接复制文件
        try {
          const copyResult = await desktopCommands.invoke<string>("process_files", {
            paths: filePaths,
            targetDir: outputPath || null,
          });
          console.log("Copy result:", copyResult);
        } catch (err) {
          console.error("Failed to copy files:", err);
          checkSequenceOverflow(err);
        }
      } else {
        // 无本地路径，尝试读取文件内容并保存
        const savedCount = await saveDroppedFilesToOutput(
          Array.from(e.dataTransfer.files),
          outputPath || null,
        );
        console.log("Saved files from dataTransfer.files fallback:", savedCount);
      }

      setTimeout(() => setIsProcessing(false), 1000);
      return;
    }

    // If not a URL and no files, let the desktop runtime handle it
    console.log("Not an image URL and no files, letting the desktop runtime handle it");
    } finally {
      clearPanelDropInteractionState({ pointerInside: pointerInsideAfterDrop });
    }
  };

  // Open settings window
  const openSettings = async () => {
    if (isContextMenuOpen) {
      await closeContextMenuWindow();
    }

    if (await desktopWindows.has("settings")) {
      await desktopWindows.focus("settings");
      return;
    }

    await desktopWindows.openSettings({
      title: t("app.windows.settingsTitle"),
      width: SETTINGS_WINDOW_WIDTH,
      height: SETTINGS_WINDOW_HEIGHT,
      alwaysOnTop: true,
    });
  };

  const resetRenameCounter = async () => {
    try {
      await desktopCommands.invoke<boolean>("reset_rename_counter");
    } catch (err) {
      console.error("Failed to reset rename counter:", err);
    }
  };

  const handleResetRenameCounter = async () => {
    if (resetCounterFeedbackTimerRef.current !== null) {
      clearTimeout(resetCounterFeedbackTimerRef.current);
    }
    setIsResetCounterActive(true);
    resetCounterFeedbackTimerRef.current = window.setTimeout(() => {
      setIsResetCounterActive(false);
      resetCounterFeedbackTimerRef.current = null;
    }, 600);
    await resetRenameCounter();
  };

  const handleRuntimeDependencyRecheck = async () => {
    syncMainWindowInteraction({ expandIfMinimized: false });
    setIsRuntimeRetryInFlight(true);
    setIsRuntimeRetryFeedbackVisible(true);
    if (runtimeRetryFeedbackTimerRef.current !== null) {
      clearTimeout(runtimeRetryFeedbackTimerRef.current);
    }
    runtimeRetryFeedbackTimerRef.current = window.setTimeout(() => {
      setIsRuntimeRetryFeedbackVisible(false);
      runtimeRetryFeedbackTimerRef.current = null;
    }, 180);

    try {
      const { status } = await refreshRuntimeDependencyContext();
      if (hasMissingManagedRuntimeComponents(status)) {
        await startRuntimeDependencyBootstrap("runtime_indicator_manual");
      }
    } finally {
      setIsRuntimeRetryInFlight(false);
    }
  };

  // 右键菜单
  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resetWindowDragState();
    syncMainWindowInteraction({ expandIfMinimized: false });

    try {
      await closeContextMenuWindow();

      const currentWindow = desktopCurrentWindow;
      const [outerPosition, monitor] = await Promise.all([
        currentWindow.outerPosition(),
        desktopSystem.currentMonitor(),
      ]);

      let x = outerPosition.x + e.clientX;
      let y = outerPosition.y + e.clientY;

      if (monitor) {
        const monitorX = monitor.position.x;
        const monitorY = monitor.position.y;
        const monitorWidth = monitor.size.width;
        const monitorHeight = monitor.size.height;
        const minX = monitorX + WINDOW_EDGE_PADDING;
        const minY = monitorY + WINDOW_EDGE_PADDING;
        const maxX = monitorX + monitorWidth - CONTEXT_MENU_WIDTH - WINDOW_EDGE_PADDING;
        const maxY = monitorY + monitorHeight - CONTEXT_MENU_HEIGHT - WINDOW_EDGE_PADDING;

        x = Math.min(Math.max(x, minX), Math.max(minX, maxX));
        y = Math.min(Math.max(y, minY), Math.max(minY, maxY));
      } else {
        const screenWidth = window.screen.availWidth;
        const screenHeight = window.screen.availHeight;
        const minX = WINDOW_EDGE_PADDING;
        const minY = WINDOW_EDGE_PADDING;
        const maxX = screenWidth - CONTEXT_MENU_WIDTH - WINDOW_EDGE_PADDING;
        const maxY = screenHeight - CONTEXT_MENU_HEIGHT - WINDOW_EDGE_PADDING;

        x = Math.min(Math.max(x, minX), Math.max(minX, maxX));
        y = Math.min(Math.max(y, minY), Math.max(minY, maxY));
      }

      await desktopWindows.openContextMenu({
        title: t("app.windows.contextMenuTitle"),
        x,
        y,
        width: CONTEXT_MENU_WIDTH,
        height: CONTEXT_MENU_HEIGHT,
        alwaysOnTop: true,
        skipTaskbar: true,
        focus: true,
        parent: "main",
      });
      updateContextMenuOpen(true);
    } catch (err) {
      updateContextMenuOpen(false);
      console.error("Failed to open context menu window:", err);
    }
  };

  const shouldRenderMiniControls = shellPhase === "full" && isPanelHovered;
  const miniControlsPresenceTransition = shouldReduceMotion
    ? { duration: 0.01 }
    : { duration: 0.12, ease: [0.22, 1, 0.36, 1] as const };
  const containerBackdropShadow = primaryTask || isHovering
    ? colors.panelShadowStrong
    : colors.panelShadow;
  const panelViewportSize = INTERMEDIATE_EXPAND_SIZE;
  const panelBorderColor = visualIsMinimized
    ? colors.borderStart
    : primaryTask?.kind === "transcode"
      ? colors.transcodeBorder
      : primaryTask?.kind === "download"
        ? colors.accentBorder
        : isHovering
          ? colors.accentBorder
          : colors.borderStart;
  const containerShellAccentShadow = primaryTask?.kind === "transcode"
    ? `inset 0 0 14px ${colors.transcodeGlow}`
    : primaryTask?.kind === "download"
      ? `inset 0 0 12px ${colors.accentGlow}`
      : isHovering
        ? `inset 0 0 18px ${colors.accentGlow}, inset 0 0 28px ${colors.accentSurfaceStrong}`
        : null;
  const containerShellBoxShadow = [
    `inset 0 0 0 1px ${panelBorderColor}`,
    `inset 0 1px 0 ${colors.fieldInset}`,
    containerShellAccentShadow,
  ].filter(Boolean).join(", ");
  const containerShadowBackdropStyle = getShadowBackdropStyle(colors, {
    radius: panelRadius,
    boxShadow: visualIsMinimized
      ? colors.panelShadowCompact
      : containerBackdropShadow,
  });
  const minimizedContainerBoxShadow = theme === "black"
    ? [
      "inset 0 0 0 1px rgba(245,245,245,0.18)",
      "inset 0 1px 0 rgba(245,245,245,0.24)",
      "inset 0 -1px 0 rgba(0,0,0,0.22)",
    ].join(", ")
    : `inset 0 0 0 1px ${colors.borderStart}, inset 0 1px 0 ${colors.fieldInset}`;
  const containerBoxShadow = visualIsMinimized && !isMacOS
    ? minimizedContainerBoxShadow
    : containerShellBoxShadow;
  const shouldShowAppUpdateIndicator = !!appUpdateInfo && (
    appUpdatePhase === "available"
    || appUpdatePhase === "downloading"
    || appUpdatePhase === "installing"
    || appUpdatePhase === "error"
  );
  const appUpdateIndicatorTitle = (() => {
    if (!appUpdateInfo) {
      return "";
    }

    if (appUpdatePhase === "downloading") {
      return t("app.actions.downloadAppUpdate");
    }

    if (appUpdatePhase === "installing") {
      return t("app.actions.installAppUpdate");
    }

    if (appUpdatePhase === "error") {
      const retryTitle = t("app.actions.retryAppUpdate", {
        current: appUpdateInfo.current,
        latest: appUpdateInfo.latest,
      });
      return appUpdateError ? `${retryTitle}\n${appUpdateError}` : retryTitle;
    }

    return t("app.actions.updateApp", {
      current: appUpdateInfo.current,
      latest: appUpdateInfo.latest,
    });
  })();
  const isPrimaryTaskActionPending = primaryTask?.kind === "download"
    ? cancellingTraceIds.includes(primaryTask.task.traceId)
    : primaryTask?.kind === "transcode"
      ? pendingTranscodeActionTraceIds.includes(primaryTask.task.traceId)
      : false;
  const getDownloadQueueTaskProgressText = (task: VideoQueueTaskPayload): string => {
    if (cancellingTraceIds.includes(task.traceId)) {
      return t("app.queue.cancelling");
    }
    if (task.status === "pending") {
      return t("app.queue.waiting");
    }
    const progress = downloadProgressByTrace[task.traceId];
    if (!progress) {
      return t("app.downloadStage.preparing");
    }
    const statusText = getDownloadStatusText(i18n.t, progress, progress.stage);
    return progress.percent < 0
      ? statusText
      : t("app.queue.percentStatus", {
          percent: Math.round(progress.percent),
          status: statusText,
        });
  };
  const getDownloadQueueTaskProgressPercent = (task: VideoQueueTaskPayload): number => {
    if (task.status !== "active") {
      return 8;
    }
    const progress = downloadProgressByTrace[task.traceId];
    if (!progress || progress.percent < 0) {
      return 18;
    }
    return Math.max(8, Math.min(100, progress.percent));
  };
  const primaryTaskStatusText = primaryTask
    ? primaryTask.statusText
    : "";
  const primaryTaskSummaryText = queueNoticeMessage
    ? queueNoticeMessage
    : isPrimaryTaskActionPending
      ? primaryTask?.kind === "transcode"
        ? t("app.queue.cancellingCurrentTranscode")
        : t("app.queue.cancellingCurrent")
      : remainingDownloadCount > 0 || remainingTranscodeCount > 0
        ? t("app.queue.remainingSummary", {
            downloadCount: remainingDownloadCount,
            transcodeCount: remainingTranscodeCount,
          })
          : "";
  const showVideoTaskBadge = totalTaskCount > 0 || isQueuePopoverOpen;
  const queueViewMeta = [
    totalDownloadTaskCount > 0 ? t("app.queue.downloadCountSummary", { count: totalDownloadTaskCount }) : null,
    totalTranscodeTaskCount > 0 ? t("app.queue.transcodeCountSummary", { count: totalTranscodeTaskCount }) : null,
  ].filter(Boolean).join(" · ");
  const hasDownloadTasks = totalDownloadTaskCount > 0;
  const hasTranscodeTasks = totalTranscodeTaskCount > 0;
  const primaryTaskStroke = primaryTask?.kind === "transcode"
    ? colors.transcodeSolid
    : colors.progressFgStroke;
  const primaryTaskTextColor = primaryTask?.kind === "transcode"
    ? colors.transcodeText
    : colors.progressText;
  const primaryTaskStatusColor = primaryTask?.kind === "transcode"
    ? colors.transcodeMutedText
    : colors.accentText;
  const primaryTaskPillBackground = primaryTask?.kind === "transcode"
    ? colors.transcodeSurface
    : colors.accentSurface;
  const primaryTaskPillBorder = primaryTask?.kind === "transcode"
    ? colors.transcodeBorder
    : colors.accentBorder;
  const primaryTaskPillText = primaryTask?.kind === "transcode"
    ? colors.transcodeText
    : colors.accentText;
  const primaryTaskTrackStroke = primaryTask?.kind === "transcode"
    ? colors.transcodeTrack
    : colors.progressBgStroke;
  const runtimeMissingComponents = runtimeDependencyGateState?.missingComponents.length
    ? runtimeDependencyGateState.missingComponents
    : getMissingRuntimeComponentsFromStatus(runtimeDependencyStatus);
  const hasRuntimeGateIssue = shouldEvaluateDeferredStartupIndicators && (
    runtimeGatePhaseNeedsAttention(runtimeGatePhase)
    || runtimeMissingComponents.length > 0
    || runtimeDependencyStatus === null
  );
  const runtimeGateRequiresManualAction = runtimeGateNeedsManualAction(runtimeGatePhase)
    || (!runtimeGateIsBusy && runtimeDependencyStatus === null);
  const shouldShowRuntimeIndicator = !visualIsMinimized && !isQueuePopoverOpen && (
    showRuntimeSuccessIndicator
    || hasRuntimeGateIssue
  );
  const runtimeIndicatorHeadline = getRuntimeGateHeadline(t, runtimeDependencyGateState);
  const runtimeIndicatorProgressLabel = getRuntimeGateProgressLabel(t, runtimeDependencyGateState);
  const runtimeIndicatorNextLabel = getRuntimeGateNextLabel(t, runtimeDependencyGateState);
  const runtimeIndicatorErrorSummary = summarizeRuntimeGateError(runtimeDependencyGateState?.lastError);
  const runtimeIndicatorFallbackSummary = runtimeMissingComponents.length > 0
    ? t("settings.downloaders.runtime.missingItems", {
        items: runtimeMissingComponents.join(", "),
      })
    : runtimeDependencyStatus
      ? t("settings.downloaders.runtime.allReady")
      : t("settings.downloaders.runtime.unavailable");
  const runtimeIndicatorStatusText = runtimeGateRequiresManualAction
    ? runtimeIndicatorErrorSummary ?? runtimeIndicatorFallbackSummary
    : runtimeIndicatorProgressLabel ?? runtimeIndicatorFallbackSummary;
  const runtimeIndicatorFooterText = runtimeIndicatorNextLabel
    ?? (runtimeGateRequiresManualAction ? t("app.runtime.manualHint") : null);
  const runtimeIndicatorProgressPercent = clampRuntimeGateProgressPercent(
    runtimeDependencyGateState?.progressPercent,
  );
  const runtimeIndicatorShouldRenderRing = (
    runtimeGateIsBusy
    || showRuntimeSuccessIndicator
    || (hasRuntimeGateIssue && !runtimeGateRequiresManualAction)
  );
  const runtimeIndicatorIsIndeterminate = runtimeIndicatorShouldRenderRing
    && !showRuntimeSuccessIndicator
    && runtimeIndicatorProgressPercent === null;
  const runtimeIndicatorSize = 18;
  const runtimeIndicatorRadius = 7;
  const runtimeIndicatorCircumference = 2 * Math.PI * runtimeIndicatorRadius;
  const runtimeIndicatorFillRatio = showRuntimeSuccessIndicator
    ? 1
    : runtimeIndicatorProgressPercent !== null
      ? Math.max(0.08, runtimeIndicatorProgressPercent / 100)
      : 0.34;
  const runtimeIndicatorDashOffset = runtimeIndicatorCircumference * (1 - runtimeIndicatorFillRatio);
  const shouldShowRuntimePopover = shouldShowRuntimeIndicator
    && isRuntimeIndicatorHovered
    && !showRuntimeSuccessIndicator;
  const runtimeIndicatorTitle = runtimeGateRequiresManualAction
    ? runtimeIndicatorErrorSummary ?? runtimeIndicatorFallbackSummary
    : runtimeIndicatorProgressLabel ?? runtimeIndicatorHeadline;
  const runtimeIndicatorPresenceTransition = shouldReduceMotion
    ? { duration: 0.1 }
    : { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };
  const runtimeIndicatorShellAnimate = showRuntimeSuccessIndicator && !shouldReduceMotion
    ? {
        scale: [1, 1.18, 1.03],
        y: [0, -1, 0],
        opacity: [0.96, 1, 1],
      }
    : {
        scale: 1,
        y: 0,
        opacity: 1,
      };
  const runtimeIndicatorShellTransition = showRuntimeSuccessIndicator && !shouldReduceMotion
    ? {
        duration: 0.42,
        ease: [0.22, 1, 0.36, 1] as const,
        times: [0, 0.56, 1],
      }
    : {
        duration: 0.16,
        ease: [0.22, 1, 0.36, 1] as const,
      };
  const runtimeIndicatorPopoverBorder = runtimeGateRequiresManualAction
    ? colors.warningBorder
    : colors.borderStart;
  const runtimeIndicatorPopoverStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    bottom: 0,
    marginBottom: 26,
    width: 166,
    display: "flex",
    flexDirection: "column",
    gap: 7,
    padding: "10px 10px 9px",
    ...getPanelShellStyle(colors, {
      radius: 12,
      boxShadow: `inset 0 0 0 1px ${runtimeIndicatorPopoverBorder}, inset 0 1px 0 ${colors.fieldInset}, ${colors.panelShadowStrong}`,
    }),
    backdropFilter: "blur(14px)",
    transformOrigin: "bottom left",
  };
  const runtimeIndicatorStatusDotStyle: CSSProperties = {
    ...getStatusDotStyle(colors.warningSolid, colors.warningGlow),
    width: 6,
    height: 6,
    boxShadow: `0 0 8px ${colors.warningGlow}`,
  };
  const runtimeIndicatorProgressTrackStyle: CSSProperties = {
    width: "100%",
    height: 5,
    borderRadius: 999,
    overflow: "hidden",
    background: `linear-gradient(180deg, ${colors.fieldBg} 0%, ${colors.bgPrimary} 100%)`,
    boxShadow: `inset 0 0 0 1px ${colors.fieldBorder}`,
  };
  const runtimeIndicatorProgressFillStyle: CSSProperties = {
    width: runtimeIndicatorIsIndeterminate
      ? "38%"
      : `${runtimeIndicatorProgressPercent ?? 100}%`,
    height: "100%",
    borderRadius: 999,
    background: `linear-gradient(90deg, ${colors.warningSolid} 0%, ${colors.warningText} 100%)`,
    boxShadow: `0 0 12px ${colors.warningGlow}`,
    animation: runtimeIndicatorIsIndeterminate ? "shimmer 1.2s ease-in-out infinite" : "none",
    transformOrigin: "left center",
    transition: runtimeIndicatorIsIndeterminate ? "none" : "width 0.22s ease",
  };

  return (
    <div
	      style={{
        position: "relative",
        width: panelViewportSize,
        height: panelViewportSize,
        overflow: "visible",
      }}
    >
        <motion.div
          initial={false}
          aria-hidden="true"
          animate={{
            scale: isInitialMount ? 0.82 : panelScale,
            borderRadius: panelRadius,
            x: minimizedPanelOffset,
            y: minimizedPanelOffset,
            width: panelRenderSize,
            height: panelRenderSize,
          }}
          transition={{
            scale: panelShellTransition.scale,
            borderRadius: panelShellTransition.borderRadius,
            x: panelShellTransition.x,
            y: panelShellTransition.y,
            width: panelShellTransition.width,
            height: panelShellTransition.height,
          }}
          style={{
            top: 0,
            left: 0,
            zIndex: 0,
            transformOrigin: "top left",
            ...containerShadowBackdropStyle,
          }}
        />
	      <motion.div
	      ref={containerRef}
      tabIndex={0}
      onDragEnter={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        console.log("DragEnter types:", e.dataTransfer.types);
        isPointerInsidePanelRef.current = true;
        updateDropHoverState(true);
        dispatchShellEvent({ type: "dropEnter" });
        syncMainWindowInteraction({ expandIfMinimized: false });
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        console.log("DragOver types:", e.dataTransfer.types);
        isPointerInsidePanelRef.current = true;
        updateDropHoverState(true);
        dispatchShellEvent({ type: "dropEnter" });
        syncMainWindowInteraction({ expandIfMinimized: false });
        const hasFiles = e.dataTransfer.files.length > 0 || e.dataTransfer.types.includes("Files");
        const hasUrl = e.dataTransfer.types.includes("text/uri-list")
          || e.dataTransfer.types.includes("text/plain");
        if ((hasFiles || hasUrl) && !isHovering) {
          setIsHovering(true);
        }
      }}
      onDragStartCapture={(e) => {
        if (shouldPreventPanelNativeDragStart(e.target)) {
          e.preventDefault();
        }
      }}
      onDrop={handleDrop}
      onDragLeave={() => {
        if (suppressNextPanelDragLeaveRef.current) {
          suppressNextPanelDragLeaveRef.current = false;
          return;
        }
        clearPanelDropInteractionState();
      }}
      onMouseEnter={(e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      scheduleMainWindowPointerEnterExpand();
      syncMainWindowInteraction({ expandIfMinimized: false });
      containerRef.current?.focus();
    }}
    onMouseLeave={() => {
      scheduleMainWindowPointerLeaveCollapse();
      }}
      onPointerDown={handlePanelPointerDown}
      onPointerUp={handlePanelPointerUp}
      onPointerMove={handlePanelPointerMove}
      onPointerCancel={handlePanelPointerCancel}
      onDoubleClick={handlePanelDoubleClick}
      onContextMenu={handleContextMenu}
      initial={false}
      animate={panelShellAnimate}
      transition={panelShellTransition}
      onAnimationComplete={handleAnimationComplete}
      style={{
        transformOrigin: 'top left',
        position: 'absolute',
        top: 0,
        left: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
	        alignItems: 'center',
	        gap: 8,
	        outline: 'none',
          zIndex: 1,
		        ...getPanelShellStyle(colors, {
	            radius: panelRadius,
	            boxShadow: containerBoxShadow,
	          }),
	        overflow: 'hidden',
        transition: shouldUseInstantPanelTransition
          ? undefined
          : `box-shadow 0.18s ${COMPACT_EASE}`,
        willChange: 'transform, clip-path',
      }}
	          >
	            <div
	              style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 8,
          opacity: 1,
          visibility: "visible",
          pointerEvents: "auto",
        }}
      >
        {/* Edge glow layer - follows mouse */}
        <AnimatePresence>
          {shouldShowEdgeGlow && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: edgeGlowOpacity }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.08, ease: 'linear' }}
              style={getEdgeGlowStyle()}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {shouldShowDragGlow && (
            <motion.div
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              style={getDragGlowStyle()}
            />
          )}
        </AnimatePresence>

        {showVideoTaskBadge ? (
        <>
          <button
            ref={queueBadgeButtonRef}
            onClick={() => setIsQueuePopoverOpen((current) => !current)}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              minWidth: 42,
              height: 30,
              borderRadius: 15,
              padding: '0 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background: isQueuePopoverOpen
                ? `linear-gradient(180deg, ${colors.fieldBg} 0%, ${colors.bgSecondary} 100%)`
                : `linear-gradient(180deg, ${colors.fieldBg} 0%, ${colors.bgPrimary} 100%)`,
              color: colors.textPrimary,
              border: `1px solid ${isQueuePopoverOpen ? colors.queueStatusBorder : colors.fieldBorder}`,
              fontSize: 12,
              fontWeight: 800,
              lineHeight: 1,
              userSelect: 'none',
              zIndex: 30,
              boxShadow: `inset 0 0 0 1px ${isQueuePopoverOpen ? colors.queueStatusBorder : colors.borderStart}, ${colors.panelShadow}`,
              backdropFilter: 'blur(12px)',
              cursor: 'pointer',
              transition: 'background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
            }}
            aria-pressed={isQueuePopoverOpen}
            aria-label={t("app.queue.currentTasksAria", { count: totalTaskCount })}
            title={isQueuePopoverOpen ? t("app.queue.closeList") : t("app.queue.showList")}
          >
            <span style={{ pointerEvents: 'none' }}>{totalTaskCount}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none' }}>
              {hasDownloadTasks ? (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: colors.progressFgStroke,
                    boxShadow: `0 0 10px ${colors.progressFgStroke}`,
                    flexShrink: 0,
                  }}
                />
              ) : null}
              {hasTranscodeTasks ? (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: colors.transcodeSolid,
                    boxShadow: `0 0 10px ${colors.transcodeGlow}`,
                    flexShrink: 0,
                  }}
                />
              ) : null}
            </span>
          </button>

          <AnimatePresence>
            {isQueuePopoverOpen ? (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98, filter: 'blur(2px)' }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: 8, scale: 0.98, filter: 'blur(2px)' }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  padding: '48px 10px 10px',
                  ...getContinuousCornerStyle(visualIsMinimized ? 100 : 16),
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
                  boxShadow: `inset 0 0 0 1px ${colors.queueBadgeBorder}, inset 0 0 18px ${colors.queueStatusBg}`,
                  backdropFilter: 'blur(16px)',
                  zIndex: 25,
                }}
                data-panel-double-click="ignore"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    padding: '0 4px 2px',
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: colors.textPrimary,
                      lineHeight: 1,
                      userSelect: 'none',
                    }}
                  >
                    {t("app.queue.label")}
                  </span>
                  {queueViewMeta ? (
                    <span
                      style={{
                        fontSize: 9,
                        color: colors.textSecondary,
                        lineHeight: 1.2,
                        userSelect: 'none',
                      }}
                    >
                      {queueViewMeta}
                    </span>
                  ) : null}
                </div>

                <div
                  className="hide-scrollbar"
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    paddingRight: 2,
                  }}
                >
                  {hasDownloadTasks ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          padding: '0 4px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              backgroundColor: colors.progressFgStroke,
                              boxShadow: `0 0 8px ${colors.progressFgStroke}`,
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: colors.textPrimary,
                              lineHeight: 1,
                              userSelect: 'none',
                            }}
                          >
                            {t("app.queue.downloadSection")}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 8,
                            color: colors.textSecondary,
                            lineHeight: 1,
                            userSelect: 'none',
                          }}
                        >
                          {totalDownloadTaskCount}
                        </span>
                      </div>

                      {downloadQueueTasks.map((task) => {
                        const isTaskCancelling = cancellingTraceIds.includes(task.traceId);
                        return (
                          <div
                            key={task.traceId}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 9px',
                              ...getInsetCardStyle(colors),
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    flexShrink: 0,
                                    backgroundColor: task.status === 'pending'
                                      ? colors.accentBorder
                                      : colors.progressFgStroke,
                                    boxShadow: task.status === 'pending'
                                      ? `0 0 8px ${colors.accentGlow}`
                                      : `0 0 10px ${colors.progressFgStroke}`,
                                  }}
                                />
                                <span
                                  title={task.label}
                                  style={{
                                    fontSize: 10,
                                    lineHeight: 1.2,
                                    color: colors.textPrimary,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  {task.label}
                                </span>
                              </div>
                              <div
                                style={{
                                  width: '100%',
                                  height: 6,
                                  borderRadius: 999,
                                  background: `linear-gradient(90deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
                                  overflow: 'hidden',
                                  boxShadow: `inset 0 0 0 1px ${colors.borderStart}`,
                                }}
                              >
                                <div
                                  style={{
                                    width: `${getDownloadQueueTaskProgressPercent(task)}%`,
                                    height: '100%',
                                    borderRadius: 999,
                                    background: task.status === 'pending'
                                      ? `linear-gradient(90deg, ${colors.accentBorder} 0%, ${colors.progressText} 100%)`
                                      : `linear-gradient(90deg, ${colors.progressFgStroke} 0%, ${colors.progressText} 100%)`,
                                    boxShadow: task.status === 'pending'
                                      ? `0 0 12px ${colors.accentGlow}`
                                      : `0 0 12px ${colors.progressFgStroke}`,
                                    transition: 'width 0.2s ease',
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: 9, lineHeight: 1.1, color: colors.textSecondary }}>
                                {getDownloadQueueTaskProgressText(task)}
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                void cancelVideoTask(task.traceId);
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              disabled={isTaskCancelling}
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: 'none',
                                backgroundColor: isTaskCancelling
                                  ? colors.queueStatusBg
                                  : 'transparent',
                                cursor: isTaskCancelling ? 'default' : 'pointer',
                                opacity: isTaskCancelling ? 0.6 : 1,
                                flexShrink: 0,
                                transition: 'background-color 0.2s ease',
                              }}
                              title={isTaskCancelling ? t("app.queue.cancellingTask") : t("app.queue.cancelTask")}
                            >
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 10 10"
                                style={{ color: colors.progressCancelIcon, transition: 'color 0.2s' }}
                              >
                                <path
                                  d="M2 2L8 8M8 2L2 8"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {hasTranscodeTasks ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          padding: '0 4px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              backgroundColor: colors.transcodeSolid,
                              boxShadow: `0 0 8px ${colors.transcodeGlow}`,
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: colors.textPrimary,
                              lineHeight: 1,
                              userSelect: 'none',
                            }}
                          >
                            {t("app.queue.transcodeSection")}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 8,
                            color: colors.textSecondary,
                            lineHeight: 1,
                            userSelect: 'none',
                          }}
                        >
                          {totalTranscodeTaskCount}
                        </span>
                      </div>

                      {transcodeQueueTasks.map((task) => {
                        const isFailedTask = task.status === "failed";
                        const isTaskActionPending = pendingTranscodeActionTraceIds.includes(task.traceId);
                        const formatLabel = getVideoTranscodeFormatLabel(task);
                        const markerColor = isFailedTask ? colors.dangerSolid : colors.transcodeSolid;
                        const markerGlow = isFailedTask ? colors.dangerGlow : colors.transcodeGlow;
                        const taskStatusText = isTaskActionPending
                          ? t("app.queue.cancellingTranscode")
                          : getTranscodeTaskStatusText(i18n.t, task);

                        return (
                          <div
                            key={task.traceId}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 7,
                              padding: '8px 9px',
                              ...getInsetCardStyle(colors, isFailedTask ? colors.dangerBorder : colors.borderStart),
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  flexShrink: 0,
                                  backgroundColor: markerColor,
                                  boxShadow: `0 0 10px ${markerGlow}`,
                                }}
                              />
                              <span
                                title={task.label}
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  fontSize: 10,
                                  lineHeight: 1.2,
                                  color: colors.textPrimary,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {task.label}
                              </span>
                              {formatLabel ? (
                                <span
                                  style={{
                                    maxWidth: 76,
                                    padding: '2px 5px',
                                    borderRadius: 999,
                                    fontSize: 8,
                                    lineHeight: 1,
                                    color: colors.transcodeText,
                                    backgroundColor: colors.transcodeSurface,
                                    border: `1px solid ${colors.transcodeBorder}`,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    userSelect: 'none',
                                  }}
                                  title={formatLabel}
                                >
                                  {formatLabel}
                                </span>
                              ) : null}
                            </div>

                            <div
                              style={{
                                width: '100%',
                                height: 6,
                                borderRadius: 999,
                                background: `linear-gradient(90deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
                                overflow: 'hidden',
                                boxShadow: `inset 0 0 0 1px ${colors.borderStart}`,
                              }}
                            >
                              <div
                                style={{
                                  width: `${getVideoTranscodeTaskProgressPercent(task)}%`,
                                  height: '100%',
                                  borderRadius: 999,
                                  background: `linear-gradient(90deg, ${colors.transcodeSolid} 0%, ${colors.transcodeText} 100%)`,
                                  boxShadow: `0 0 12px ${colors.transcodeGlow}`,
                                  opacity: isFailedTask ? 0.7 : 1,
                                  transition: 'width 0.2s ease',
                                }}
                              />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                              <span
                                title={isTaskActionPending ? undefined : task.error ?? undefined}
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  fontSize: 9,
                                  lineHeight: 1.1,
                                  color: isFailedTask ? colors.dangerText : colors.textSecondary,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {taskStatusText}
                              </span>

                              {isFailedTask ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                  <button
                                    onClick={() => {
                                      void retryTranscodeTask(task.traceId);
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    disabled={isTaskActionPending}
                                    style={{
                                      border: `1px solid ${colors.transcodeBorder}`,
                                      backgroundColor: colors.transcodeSurface,
                                      color: colors.transcodeText,
                                      borderRadius: 999,
                                      padding: '2px 7px',
                                      fontSize: 8,
                                      lineHeight: 1.2,
                                      cursor: isTaskActionPending ? 'default' : 'pointer',
                                      opacity: isTaskActionPending ? 0.6 : 1,
                                    }}
                                    title={t("app.queue.retryTranscode")}
                                  >
                                    {t("app.queue.retryTranscode")}
                                  </button>
                                  <button
                                    onClick={() => {
                                      void removeTranscodeTask(task.traceId);
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    disabled={isTaskActionPending}
                                    style={{
                                      border: `1px solid ${colors.fieldBorder}`,
                                      backgroundColor: colors.fieldBg,
                                      color: colors.textSecondary,
                                      borderRadius: 999,
                                      padding: '2px 7px',
                                      fontSize: 8,
                                      lineHeight: 1.2,
                                      cursor: isTaskActionPending ? 'default' : 'pointer',
                                      opacity: isTaskActionPending ? 0.6 : 1,
                                    }}
                                    title={t("app.queue.removeTranscodeHint")}
                                  >
                                    {t("app.queue.removeTranscode")}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    void cancelTranscodeTask(task.traceId);
                                  }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  disabled={isTaskActionPending}
                                  style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: 'none',
                                    backgroundColor: isTaskActionPending
                                      ? colors.queueStatusBg
                                      : 'transparent',
                                    cursor: isTaskActionPending ? 'default' : 'pointer',
                                    opacity: isTaskActionPending ? 0.6 : 1,
                                    flexShrink: 0,
                                    transition: 'background-color 0.2s ease',
                                  }}
                                  title={isTaskActionPending ? t("app.queue.cancellingTranscode") : t("app.queue.cancelTranscode")}
                                >
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 10 10"
                                    style={{ color: colors.progressCancelIcon, transition: 'color 0.2s' }}
                                  >
                                    <path
                                      d="M2 2L8 8M8 2L2 8"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
        ) : null}

        <AnimatePresence>
          {shouldRenderMiniControls ? (
            <motion.div
              key="mini-controls"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={miniControlsPresenceTransition}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 10,
                pointerEvents: "none",
              }}
            >
              {/* Close button - top right circle */}
              <NeonIconButton
                onClick={async () => {
                  setShowEdgeGlow(false);
                  await closeContextMenuWindow().catch(() => undefined);
                  try {
                    await desktopCurrentWindow.hide();
                  } catch (err) {
                    console.error("Failed to hide main window:", err);
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                tone="danger"
                size={18}
                radius={999}
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  pointerEvents: "auto",
                }}
                title={t("app.actions.hideWindow")}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: "currentColor",
                    display: "block",
                    pointerEvents: "none",
                  }}
                />
              </NeonIconButton>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* 中央图标 */}
        <AnimatePresence mode="sync">
        {primaryTask ? (
          <motion.div
            key="progress"
            initial={CENTER_OVERLAY_PRESENCE_MOTION.initial}
            animate={CENTER_OVERLAY_PRESENCE_MOTION.animate}
            exit={CENTER_OVERLAY_PRESENCE_MOTION.exit}
            transition={CENTER_OVERLAY_PRESENCE_MOTION.transition}
            draggable={false}
            style={CENTER_OVERLAY_CONTENT_STYLE}
          >
            <CircularProgressIndicator
              strokeColor={primaryTaskStroke}
              trackColor={primaryTaskTrackStroke}
              textColor={primaryTaskTextColor}
              percent={primaryTask.percent}
              indeterminate={primaryTask.indeterminate}
            />
            {primaryTaskStatusText ? (
              <span style={{ fontSize: 10, color: primaryTaskStatusColor, lineHeight: 1, userSelect: 'none', pointerEvents: 'none' }}>
                {primaryTaskStatusText}
              </span>
            ) : null}
            {primaryTaskSummaryText ? (
              <span
                style={{
                  fontSize: 9,
                  color: primaryTaskPillText,
                  backgroundColor: primaryTaskPillBackground,
                  border: `1px solid ${primaryTaskPillBorder}`,
                  borderRadius: 999,
                  padding: '2px 6px',
                  lineHeight: 1.1,
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              >
                {primaryTaskSummaryText}
              </span>
            ) : null}
            {primaryTask.kind === "download" || primaryTask.kind === "transcode" ? (
              <button
                onClick={async () => {
                  if (isPrimaryTaskActionPending) {
                    return;
                  }
                  if (primaryTask.kind === "download") {
                    void cancelVideoTask(primaryTask.task.traceId, { showCurrentTaskFeedback: true });
                    return;
                  }
                  void cancelTranscodeTask(primaryTask.task.traceId);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseEnter={() => setIsProgressCancelHovered(true)}
                onMouseLeave={() => setIsProgressCancelHovered(false)}
                style={{
                  margin: 0,
                  marginTop: 4,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isProgressCancelHovered ? colors.progressCancelHoverBg : 'transparent',
                  border: 'none',
                  cursor: isPrimaryTaskActionPending ? 'default' : 'pointer',
                  transition: 'background-color 0.2s',
                  opacity: isPrimaryTaskActionPending ? 0.6 : 1,
                  pointerEvents: 'auto',
                }}
                title={primaryTask.kind === "transcode" ? t("app.actions.exitCurrentTranscode") : t("app.actions.cancelCurrentTask")}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  style={{
                    color: isProgressCancelHovered ? colors.progressCancelHoverIcon : colors.progressCancelIcon,
                    transition: 'color 0.2s',
                    pointerEvents: 'none',
                  }}
                >
                  <path
                    d="M2 2L8 8M8 2L2 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : null}
          </motion.div>
        ) : visualIsMinimized ? (
          <motion.div
            key="minimized"
            initial={{ scale: 0.82, opacity: 0 }}
            animate={minimizedIconAnimate}
            exit={minimizedIconExit}
            transition={minimizedIconTransition}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              zIndex: 4,
            }}
          >
            <div
              style={{
                width: minimizedIconFrameSize,
                height: minimizedIconFrameSize,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                ...getContinuousCornerStyle("50%"),
                background: "transparent",
	                boxShadow: "none",
	                overflow: "hidden",
                transform: `scale(${minimizedIconWrapperScale})`,
                transformOrigin: "center center",
                willChange: "transform",
              }}
            >
              <CatIcon size={minimizedIconSize} glow={!isMacOS} />
            </div>
          </motion.div>
        ) : null}
        </AnimatePresence>
        <ForegroundOutcomeOverlay
          visible={isProcessing}
          outcomeVisible={isForegroundTaskOutcomeVisible}
          cancelled={downloadCancelled}
          errorMessage={downloadErrorMessage}
          successColor={colors.successIcon}
          errorColor={colors.errorIcon}
          loadingStrokeColor={colors.accentSolid}
          loadingTrackColor={colors.borderStart}
          loadingTextColor={colors.textSecondary}
        />
        <ForegroundOutcomeOverlay
          visible={centerOutcome !== null}
          outcomeVisible={centerOutcome !== null}
          cancelled={centerOutcome === "folder-error"}
          errorMessage={centerOutcome === "folder-error" ? downloadErrorMessage : null}
          successColor={colors.successIcon}
          errorColor={colors.errorIcon}
          loadingStrokeColor={colors.accentSolid}
          loadingTrackColor={colors.borderStart}
          loadingTextColor={colors.textSecondary}
          SuccessIcon={FolderCheckIcon}
          successIconStrokeWidth={2}
        />

        <AnimatePresence>
          {shouldShowRuntimeIndicator ? (
          <motion.div
            initial={shouldReduceMotion
              ? { opacity: 0 }
              : { opacity: 0, scale: 0.9, y: 6, filter: "blur(1.5px)" }}
            animate={shouldReduceMotion
              ? { opacity: 1 }
              : { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={shouldReduceMotion
              ? { opacity: 0 }
              : { opacity: 0, scale: 0.78, y: 8, filter: "blur(1.5px)" }}
            transition={runtimeIndicatorPresenceTransition}
            style={{
              position: "absolute",
              left: 12,
              bottom: 12,
              zIndex: 12,
              transformOrigin: "bottom left",
            }}
            data-panel-double-click="ignore"
            onMouseEnter={() => setIsRuntimeIndicatorHovered(true)}
            onMouseLeave={() => setIsRuntimeIndicatorHovered(false)}
          >
            <AnimatePresence>
              {shouldShowRuntimePopover ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 4 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  style={runtimeIndicatorPopoverStyle}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={runtimeIndicatorStatusDotStyle} />
                    <span
                      style={{
                        minWidth: 0,
                        fontSize: 10,
                        fontWeight: 700,
                        color: colors.textPrimary,
                        lineHeight: 1.1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        userSelect: "none",
                      }}
                    >
                      {runtimeIndicatorHeadline}
                    </span>
                  </div>

                  {runtimeIndicatorShouldRenderRing ? (
                    <div style={runtimeIndicatorProgressTrackStyle}>
                      <div style={runtimeIndicatorProgressFillStyle} />
                    </div>
                  ) : null}

                  <span
                    title={runtimeIndicatorStatusText}
                    style={{
                      fontSize: 9,
                      lineHeight: 1.24,
                      color: runtimeGateRequiresManualAction ? colors.warningText : colors.textSecondary,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {runtimeIndicatorStatusText}
                  </span>

                  {runtimeIndicatorFooterText ? (
                    <span
                      style={{
                        fontSize: 8,
                        lineHeight: 1.2,
                        color: colors.textSecondary,
                        opacity: 0.88,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {runtimeIndicatorFooterText}
                    </span>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>

            {runtimeIndicatorShouldRenderRing ? (
              <motion.div
                initial={false}
                onMouseDown={(e) => e.stopPropagation()}
                title={runtimeIndicatorTitle}
                animate={runtimeIndicatorShellAnimate}
                transition={runtimeIndicatorShellTransition}
                style={{
                  position: "relative",
                  width: 24,
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  background: `linear-gradient(180deg, ${colors.fieldBg} 0%, ${colors.bgSecondary} 100%)`,
                  boxShadow: showRuntimeSuccessIndicator
                    ? `inset 0 0 0 1px ${colors.warningBorder}, inset 0 1px 0 ${colors.fieldInset}, 0 0 14px ${colors.warningGlow}`
                    : `inset 0 0 0 1px ${colors.borderStart}, inset 0 1px 0 ${colors.fieldInset}`,
                  pointerEvents: "auto",
                  transition: "box-shadow 0.18s ease",
                }}
              >
                {showRuntimeSuccessIndicator && !shouldReduceMotion ? (
                  <motion.span
                    initial={{ opacity: 0.22, scale: 0.84 }}
                    animate={{ opacity: [0.2, 0.44, 0], scale: [0.84, 1.42, 1.68] }}
                    transition={{
                      duration: 0.52,
                      ease: [0.22, 1, 0.36, 1],
                      times: [0, 0.48, 1],
                    }}
                    style={{
                      position: "absolute",
                      inset: 1,
                      borderRadius: "50%",
                      border: `1px solid ${colors.warningBorder}`,
                      pointerEvents: "none",
                    }}
                  />
                ) : null}
                <svg
                  width={runtimeIndicatorSize}
                  height={runtimeIndicatorSize}
                  viewBox={`0 0 ${runtimeIndicatorSize} ${runtimeIndicatorSize}`}
                  style={{ transform: "rotate(-90deg)", display: "block" }}
                >
                  <circle
                    cx={runtimeIndicatorSize / 2}
                    cy={runtimeIndicatorSize / 2}
                    r={runtimeIndicatorRadius}
                    fill="none"
                    stroke={colors.progressBgStroke}
                    strokeWidth="2"
                  />
                  <circle
                    cx={runtimeIndicatorSize / 2}
                    cy={runtimeIndicatorSize / 2}
                    r={runtimeIndicatorRadius}
                    fill="none"
                    stroke={colors.warningSolid}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={runtimeIndicatorCircumference}
                    strokeDashoffset={runtimeIndicatorDashOffset}
                    style={{
                      transition: runtimeIndicatorIsIndeterminate
                        ? "none"
                        : "stroke-dashoffset 0.24s ease, opacity 0.18s ease",
                      animation: runtimeIndicatorIsIndeterminate ? "spin 1s linear infinite" : "none",
                      transformOrigin: "center",
                      opacity: showRuntimeSuccessIndicator ? 1 : 0.96,
                    }}
                  />
                </svg>
              </motion.div>
            ) : (
              <motion.button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                  if (isRuntimeRetryInFlight) {
                    return;
                  }
                  void handleRuntimeDependencyRecheck();
                }}
                title={runtimeIndicatorTitle}
                style={{
                  position: "relative",
                  width: 24,
                  height: 24,
                  padding: 0,
                  border: "none",
                  borderRadius: 999,
                  background: "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: isRuntimeRetryInFlight ? "default" : "pointer",
                  opacity: isRuntimeRetryInFlight ? 0.82 : 1,
                }}
                animate={isRuntimeRetryFeedbackVisible
                  ? {
                      scale: [1, 0.92, 1.04, 1],
                    }
                  : {
                      scale: 1,
                    }}
                transition={isRuntimeRetryFeedbackVisible
                  ? { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
                  : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 4,
                    borderRadius: "50%",
                    border: `1px solid ${colors.warningBorder}`,
                    opacity: 0.72,
                    pointerEvents: "none",
                  }}
                />
                <motion.span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 4,
                    borderRadius: "50%",
                    border: `1px solid ${colors.warningBorder}`,
                    boxShadow: `0 0 10px ${colors.warningGlow}`,
                    pointerEvents: "none",
                  }}
                  animate={shouldReduceMotion
                    ? { scale: 1, opacity: 0.64 }
                    : isRuntimeRetryFeedbackVisible
                      ? {
                          scale: [1, 1.16, 1.28],
                          opacity: [0.9, 0.42, 0],
                        }
                      : {
                          scale: [1, 1.14, 1.32],
                          opacity: [0.82, 0.3, 0],
                        }}
                  transition={shouldReduceMotion
                    ? { duration: 0.16 }
                    : isRuntimeRetryFeedbackVisible
                      ? { duration: 0.46, ease: [0.22, 1, 0.36, 1] }
                      : {
                          duration: 1.45,
                          repeat: Number.POSITIVE_INFINITY,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: "50%",
                    width: 8,
                    height: 8,
                    marginLeft: -4,
                    marginTop: -4,
                    borderRadius: "50%",
                    backgroundColor: colors.warningSolid,
                    display: "block",
                    pointerEvents: "none",
                    boxShadow: isRuntimeRetryFeedbackVisible
                      ? `0 0 10px ${colors.warningGlow}`
                      : `0 0 6px ${colors.warningGlow}`,
                  }}
                />
              </motion.button>
            )}
          </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {shouldRenderMiniControls ? (
            <motion.div
              key="mini-controls-footer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={miniControlsPresenceTransition}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 10,
                pointerEvents: "none",
              }}
            >
              {/* App update indicator */}
              {shouldShowAppUpdateIndicator && appUpdateInfo ? (
                <button
                  onClick={() => {
                    void handleAppUpdateInstall();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  disabled={appUpdatePhase === "downloading" || appUpdatePhase === "installing"}
                  style={{
                    position: "absolute",
                    bottom: 8,
                    right: 28,
                    width: 16,
                    height: 16,
                    border: "none",
                    borderRadius: 4,
                    backgroundColor: "transparent",
                    cursor: appUpdatePhase === "downloading" || appUpdatePhase === "installing" ? "wait" : "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "auto",
                  }}
                  title={appUpdateIndicatorTitle}
                >
                  {appUpdatePhase === "downloading" || appUpdatePhase === "installing" ? (
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        border: `1.5px solid ${colors.accentBorder}`,
                        borderTopColor: colors.accentSolid,
                        display: "block",
                        animation: "spin 0.75s linear infinite",
                        transformOrigin: "50% 50%",
                        boxShadow: `0 0 4px ${colors.accentGlow}`,
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: appUpdatePhase === "error" ? colors.warningSolid : colors.dangerSolid,
                        display: "block",
                        boxShadow: appUpdatePhase === "error"
                          ? `0 0 6px ${colors.warningGlow}`
                          : `0 0 6px ${colors.dangerGlow}`,
                      }}
                    />
                  )}
                </button>
              ) : null}

              {/* Rename counter reset button - bottom left solid rectangle */}
              {renameMediaOnDownload ? (
                <NeonIconButton
                  onClick={handleResetRenameCounter}
                  onMouseDown={(e) => e.stopPropagation()}
                  size={16}
                  style={{
                    position: "absolute",
                    bottom: 8,
                    left: 8,
                    pointerEvents: "auto",
                  }}
                  title={t("app.actions.resetRenameCounter")}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" style={{ pointerEvents: "none" }}>
                    <rect
                      x="1"
                      y="1"
                      width="8"
                      height="8"
                      fill={isResetCounterActive ? colors.accentSolid : "currentColor"}
                      stroke="none"
                      rx="1"
                      style={{ transition: `fill 0.18s ${COMPACT_EASE}` }}
                    />
                  </svg>
                </NeonIconButton>
              ) : null}

              {/* Settings button - bottom right rectangle */}
              <NeonIconButton
                onClick={openSettings}
                onMouseDown={(e) => e.stopPropagation()}
                size={16}
                style={{
                  position: "absolute",
                  bottom: 8,
                  right: 8,
                  pointerEvents: "auto",
                }}
                title={t("app.actions.settings")}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" style={{ pointerEvents: "none" }}>
                  <rect
                    x="1"
                    y="1"
                    width="8"
                    height="8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    rx="1"
                    style={{ transition: `stroke 0.18s ${COMPACT_EASE}` }}
                  />
                </svg>
              </NeonIconButton>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      </motion.div>
    </div>
  );
}

export default App;
