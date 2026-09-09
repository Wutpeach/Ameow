/** Browser Lab production-reuse stage for Download, Transcode, and Mixed. */
import {
  useCallback,
  useLayoutEffect,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ExpandedPresentationSurface } from "../presentation/main-window/ExpandedPresentationSurface";
import { MAIN_WINDOW_FULL_PANEL_RADIUS } from "../presentation/main-window/geometry";
import { MainWindowCenterOverlay } from "../presentation/main-window/MainWindowCenterOverlay";
import type { MainWindowQueuePopoverProps } from "../presentation/main-window/MainWindowQueuePopover";
import { MainWindowQueuePopover } from "../presentation/main-window/MainWindowQueuePopover";
import { MainWindowRuntimeIndicator } from "../presentation/main-window/MainWindowRuntimeIndicator";
import { THERMAL_PALETTE } from "../presentation/main-window/thermalPalette";
import type { ExpandedPresentationTarget } from "../presentation/main-window/expandedPresentationTargets";
import type { ErrorDiagnosticCopyRequest } from "../types/errorDiagnostics";
import type { LabOverlayProjection } from "./overlayProjection";
import { LAB_PREVIEW_SIZE } from "./scenarios";

export type LabOverlayStageProps = {
  target: ExpandedPresentationTarget;
  reducedMotion: boolean;
  overlayProjection: LabOverlayProjection | null;
  showQueueOverlay: boolean;
  queueOpen: boolean;
  onQueueOpenChange: (open: boolean) => void;
  showRuntimeOverlay: boolean;
  runtimeHovered: boolean;
  onRuntimeHoverChange: (hovered: boolean) => void;
  onCancelPrimaryTask: (traceId: string) => void;
  onCopyDiagnostic: (diagnostic: ErrorDiagnosticCopyRequest) => void;
  onRecheck: () => void;
  captureScale?: number;
  captureEpoch: number;
  onWebglReadback: (result: WebglReadbackResult | null) => void;
};

export type WebglReadbackResult = {
  width: number;
  height: number;
  pixels: Uint8Array;
};

function WebglReadback({ captureEpoch, onResult }: {
  captureEpoch: number;
  onResult: (result: WebglReadbackResult | null) => void;
}) {
  useLayoutEffect(() => {
    if (captureEpoch <= 0) return;
    const canvas = document.querySelector<HTMLCanvasElement>("[data-lab-preview-frame] canvas");
    const gl = canvas?.getContext("webgl2");
    if (canvas === null || gl === null || gl === undefined || canvas.width <= 0 || canvas.height <= 0) {
      onResult(null);
      return;
    }
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    onResult({ width: canvas.width, height: canvas.height, pixels });
  }, [captureEpoch, onResult]);
  return null;
}

const PREVIEW_FRAME_STYLE: CSSProperties = {
  position: "relative",
  width: LAB_PREVIEW_SIZE,
  height: LAB_PREVIEW_SIZE,
  overflow: "hidden",
  borderRadius: MAIN_WINDOW_FULL_PANEL_RADIUS,
  background: "#1b1920",
  boxShadow: "0 0 0 1px #332e3f, 0 10px 30px rgba(0,0,0,0.5)",
  flexShrink: 0,
};

export function LabOverlayStage({
  target,
  reducedMotion,
  overlayProjection,
  showQueueOverlay,
  queueOpen,
  onQueueOpenChange,
  showRuntimeOverlay,
  runtimeHovered,
  onRuntimeHoverChange,
  onCancelPrimaryTask,
  onCopyDiagnostic,
  onRecheck,
  captureScale,
  captureEpoch,
  onWebglReadback,
}: LabOverlayStageProps) {
  const getAdvancedQualityTaskTitle = useCallback((task: { label: string }) => task.label, []);
  const renderAdvancedQualityOptionButton = useCallback((): ReactNode => null, []);
  const queueOverlayProps: MainWindowQueuePopoverProps | null = overlayProjection !== null && showQueueOverlay
    ? {
        visible: true,
        showBadge: true,
        isOpen: queueOpen,
        onToggleOpen: () => onQueueOpenChange(!queueOpen),
        totalTaskCount: overlayProjection.totalTaskCount,
        downloadQueueTasks: overlayProjection.downloadQueueTasks,
        totalDownloadTaskCount: overlayProjection.totalDownloadTaskCount,
        downloadState: overlayProjection.downloadState,
        transcodeQueueTasks: overlayProjection.transcodeQueueTasks,
        totalTranscodeTaskCount: overlayProjection.totalTranscodeTaskCount,
        pendingTranscodeActionTraceIds: [],
        isAdvancedQualitySelectionPopover: false,
        advancedQualitySelectionTask: null,
        mainWindowFullContentVisible: true,
        getAdvancedQualityTaskTitle,
        renderAdvancedQualityOptionButton,
        onCancelDownload: () => undefined,
        onCancelTranscode: () => undefined,
        onRetryTranscode: () => undefined,
        onRemoveTranscode: () => undefined,
      }
    : null;

  return (
    <div style={PREVIEW_FRAME_STYLE} data-lab-preview-frame="">
      <ExpandedPresentationSurface
        eligible
        reducedMotion={reducedMotion}
        target={target}
        palette={THERMAL_PALETTE}
        backingScale={captureScale}
        redrawEpoch={captureEpoch}
      />
      <WebglReadback captureEpoch={captureEpoch} onResult={onWebglReadback} />
      {overlayProjection !== null && overlayProjection.centerOverlayVisual.kind !== "none" ? (
        <MainWindowCenterOverlay
          centerOverlayVisual={overlayProjection.centerOverlayVisual}
          primaryTask={overlayProjection.primaryTask}
          primaryTaskStatusText={overlayProjection.primaryTaskStatusText}
          primaryTaskSummaryText={overlayProjection.primaryTaskSummaryText}
          onCopyDiagnostic={onCopyDiagnostic}
          showPrimaryCancel={overlayProjection.showPrimaryCancel}
          isPrimaryCancelPending={overlayProjection.isPrimaryCancelPending}
          primaryTaskTraceId={overlayProjection.primaryTaskTraceId}
          onCancelPrimaryTask={onCancelPrimaryTask}
        />
      ) : null}
      {queueOverlayProps !== null ? <MainWindowQueuePopover {...queueOverlayProps} /> : null}
      {overlayProjection !== null && showRuntimeOverlay ? (
        <MainWindowRuntimeIndicator
          visible
          showSuccess={overlayProjection.showRuntimeSuccess}
          isHovered={runtimeHovered}
          onHoverChange={onRuntimeHoverChange}
          headline={overlayProjection.runtimeHeadline}
          statusText={overlayProjection.runtimeStatusText}
          footerText={overlayProjection.runtimeFooterText}
          title={overlayProjection.runtimeTitle}
          progressPercent={overlayProjection.runtimeProgressPercent}
          isIndeterminate={overlayProjection.runtimeIsIndeterminate}
          shouldRenderRing={overlayProjection.runtimeShouldRenderRing}
          requiresManualAction={overlayProjection.runtimeRequiresManualAction}
          reducedMotion={reducedMotion}
          isRetryInFlight={false}
          isRetryFeedbackVisible={false}
          onRecheck={onRecheck}
        />
      ) : null}
    </div>
  );
}
