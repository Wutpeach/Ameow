type EmitAppEvent = (event: string, payload: unknown) => void;

type RuntimeEntry = {
  state: string;
  source: string | null;
  path: string | null;
  error: string | null;
};

type RuntimeStatus = {
  ytDlp: RuntimeEntry;
  galleryDl: RuntimeEntry;
  ffmpeg: RuntimeEntry;
  deno: RuntimeEntry;
};

type RuntimeGateState = {
  phase: string;
  missingComponents: string[];
  lastError: string | null;
  updatedAtMs: number;
  currentComponent: string | null;
  currentStage: string | null;
  progressPercent: number | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  nextComponent: string | null;
};

type UiLabScenariosControllerOptions = {
  emitAppEvent: EmitAppEvent;
  setRuntimeOverrides(runtimeStatus: RuntimeStatus, gateState: RuntimeGateState): void;
  clearRuntimeOverrides(): void;
  getRuntimeMaxConcurrent(): number | null | undefined;
  emitLiveVideoQueueState(): void;
  getRuntimeDependencyGateState(): Promise<RuntimeGateState>;
  nowTimestampMs(): number;
  uiLabResetEvent: string;
  fallbackVideoQueueMaxConcurrent: number;
};

const readyRuntimeEntry = (entryPath: string, source: string): RuntimeEntry => ({
  state: "ready",
  source,
  path: entryPath,
  error: null,
});

const missingRuntimeEntry = (error: string): RuntimeEntry => ({
  state: "missing",
  source: null,
  path: null,
  error,
});

export const createUiLabReadyRuntimeStatus = (): RuntimeStatus => ({
  ytDlp: readyRuntimeEntry("D:/ui-lab/yt-dlp.exe", "bundled"),
  galleryDl: readyRuntimeEntry("D:/ui-lab/gallery-dl.exe", "bundled"),
  ffmpeg: readyRuntimeEntry("D:/ui-lab/ffmpeg.exe", "managed"),
  deno: readyRuntimeEntry("D:/ui-lab/deno.exe", "managed"),
});

export const createUiLabMissingRuntimeStatus = (): RuntimeStatus => {
  const readyStatus = createUiLabReadyRuntimeStatus();
  return {
    ...readyStatus,
    ffmpeg: missingRuntimeEntry("Missing managed ffmpeg runtime. UI Lab preview."),
    deno: missingRuntimeEntry("Missing managed deno runtime. UI Lab preview."),
  };
};

export const createUiLabReadyRuntimeGateState = (
  nowTimestampMs: () => number,
): RuntimeGateState => ({
  phase: "ready",
  missingComponents: [],
  lastError: null,
  updatedAtMs: nowTimestampMs(),
  currentComponent: null,
  currentStage: null,
  progressPercent: null,
  downloadedBytes: null,
  totalBytes: null,
  nextComponent: null,
});

export const createUiLabScenariosController = (
  options: UiLabScenariosControllerOptions,
) => {
  const maxConcurrent = () => (
    options.getRuntimeMaxConcurrent() ?? options.fallbackVideoQueueMaxConcurrent
  );

  const applyRuntimePreview = (
    runtimeStatus: RuntimeStatus,
    gateState: RuntimeGateState,
  ) => {
    options.setRuntimeOverrides(runtimeStatus, gateState);
    options.emitAppEvent("runtime-dependency-gate-state", gateState);
  };

  const applyReadyRuntimePreview = () => {
    applyRuntimePreview(
      createUiLabReadyRuntimeStatus(),
      createUiLabReadyRuntimeGateState(options.nowTimestampMs),
    );
  };

  const emitEmptyTaskState = () => {
    options.emitAppEvent("video-queue-count", {
      activeCount: 0,
      pendingCount: 0,
      totalCount: 0,
      maxConcurrent: maxConcurrent(),
    });
    options.emitAppEvent("video-queue-detail", { tasks: [] });
    options.emitAppEvent("video-transcode-queue-count", {
      activeCount: 0,
      pendingCount: 0,
      failedCount: 0,
      totalCount: 0,
      maxConcurrent: 1,
    });
    options.emitAppEvent("video-transcode-queue-detail", { tasks: [] });
  };

  const restoreLiveState = async () => {
    options.clearRuntimeOverrides();
    options.emitAppEvent(options.uiLabResetEvent, { restoreLive: true });
    options.emitLiveVideoQueueState();
    const gateState = await options.getRuntimeDependencyGateState();
    options.emitAppEvent("runtime-dependency-gate-state", gateState);
  };

  const applyScenarioPreview = (scenario: string) => {
    options.emitAppEvent(options.uiLabResetEvent, { restoreLive: false });
    emitEmptyTaskState();
    options.clearRuntimeOverrides();

    if (scenario === "runtime-auto-config") {
      applyRuntimePreview(createUiLabMissingRuntimeStatus(), {
        phase: "downloading",
        missingComponents: ["ffmpeg", "deno"],
        lastError: null,
        updatedAtMs: options.nowTimestampMs(),
        currentComponent: "ffmpeg",
        currentStage: "downloading",
        progressPercent: 42,
        downloadedBytes: 42 * 1024 * 1024,
        totalBytes: 100 * 1024 * 1024,
        nextComponent: "deno",
      });
      return;
    }

    if (scenario === "runtime-failed") {
      applyRuntimePreview(createUiLabMissingRuntimeStatus(), {
        phase: "failed",
        missingComponents: ["ffmpeg", "deno"],
        lastError: "Failed to download FFmpeg runtime: request timed out after 30s",
        updatedAtMs: options.nowTimestampMs(),
        currentComponent: null,
        currentStage: null,
        progressPercent: null,
        downloadedBytes: null,
        totalBytes: null,
        nextComponent: "ffmpeg",
      });
      return;
    }

    applyReadyRuntimePreview();

    if (scenario === "download-active") {
      const traceId = "ui-lab-download-active";
      options.emitAppEvent("video-queue-count", {
        activeCount: 1,
        pendingCount: 0,
        totalCount: 1,
        maxConcurrent: maxConcurrent(),
      });
      options.emitAppEvent("video-queue-detail", {
        tasks: [
          {
            traceId,
            label: "Pinterest seasonal campaign cut.mp4",
            status: "active",
          },
        ],
      });
      options.emitAppEvent("video-download-progress", {
        traceId,
        percent: 46,
        stage: "downloading",
        speed: "8.2 MB/s",
        eta: "00:12",
      });
      return;
    }

    if (scenario === "download-queued") {
      const activeTraceId = "ui-lab-download-queued-active";
      options.emitAppEvent("video-queue-count", {
        activeCount: 1,
        pendingCount: 2,
        totalCount: 3,
        maxConcurrent: maxConcurrent(),
      });
      options.emitAppEvent("video-queue-detail", {
        tasks: [
          {
            traceId: activeTraceId,
            label: "Long-form interview master.mp4",
            status: "active",
          },
          {
            traceId: "ui-lab-download-queued-2",
            label: "Episode teaser vertical.mp4",
            status: "pending",
          },
          {
            traceId: "ui-lab-download-queued-3",
            label: "Creator archive backup.mp4",
            status: "pending",
          },
        ],
      });
      options.emitAppEvent("video-download-progress", {
        traceId: activeTraceId,
        percent: 12,
        stage: "preparing",
        speed: "Preparing...",
        eta: "",
      });
      return;
    }

    if (scenario === "transcode-active") {
      const traceId = "ui-lab-transcode-active";
      options.emitAppEvent("video-transcode-queue-count", {
        activeCount: 1,
        pendingCount: 1,
        failedCount: 0,
        totalCount: 2,
        maxConcurrent: 1,
      });
      options.emitAppEvent("video-transcode-queue-detail", {
        tasks: [
          {
            traceId,
            label: "Client delivery master.mov",
            status: "active",
            stage: "transcoding",
            progressPercent: 68,
            etaSeconds: 24,
            sourcePath: "D:/ui-lab/client-delivery-master.mov",
            sourceFormat: "mov",
            targetFormat: "mp4",
            error: null,
          },
          {
            traceId: "ui-lab-transcode-pending",
            label: "Reel export source.mov",
            status: "pending",
            stage: "analyzing",
            progressPercent: null,
            etaSeconds: null,
            sourcePath: "D:/ui-lab/reel-export-source.mov",
            sourceFormat: "mov",
            targetFormat: "mp4",
            error: null,
          },
        ],
      });
      options.emitAppEvent("video-transcode-progress", {
        traceId,
        label: "Client delivery master.mov",
        status: "active",
        stage: "transcoding",
        progressPercent: 68,
        etaSeconds: 24,
        sourcePath: "D:/ui-lab/client-delivery-master.mov",
        sourceFormat: "mov",
        targetFormat: "mp4",
        error: null,
      });
      return;
    }

    if (scenario === "transcode-failed") {
      const traceId = "ui-lab-transcode-failed";
      options.emitAppEvent("video-transcode-queue-count", {
        activeCount: 0,
        pendingCount: 0,
        failedCount: 1,
        totalCount: 1,
        maxConcurrent: 1,
      });
      options.emitAppEvent("video-transcode-queue-detail", {
        tasks: [
          {
            traceId,
            label: "Broadcast package master.mkv",
            status: "failed",
            stage: "failed",
            progressPercent: null,
            etaSeconds: null,
            sourcePath: "D:/ui-lab/broadcast-package-master.mkv",
            sourceFormat: "mkv",
            targetFormat: "mp4",
            error: "FFmpeg exited with code 1 while finalizing the MP4 output.",
          },
        ],
      });
      options.emitAppEvent("video-transcode-failed", {
        traceId,
        label: "Broadcast package master.mkv",
        status: "failed",
        stage: "failed",
        progressPercent: null,
        etaSeconds: null,
        sourcePath: "D:/ui-lab/broadcast-package-master.mkv",
        sourceFormat: "mkv",
        targetFormat: "mp4",
        error: "FFmpeg exited with code 1 while finalizing the MP4 output.",
      });
      return;
    }

    if (scenario === "mixed-busy") {
      const downloadTraceId = "ui-lab-mixed-download";
      const transcodeTraceId = "ui-lab-mixed-transcode";
      options.emitAppEvent("video-queue-count", {
        activeCount: 1,
        pendingCount: 1,
        totalCount: 2,
        maxConcurrent: maxConcurrent(),
      });
      options.emitAppEvent("video-queue-detail", {
        tasks: [
          {
            traceId: downloadTraceId,
            label: "Compilation trailer capture.mp4",
            status: "active",
          },
          {
            traceId: "ui-lab-mixed-download-pending",
            label: "Livestream archive pull.mp4",
            status: "pending",
          },
        ],
      });
      options.emitAppEvent("video-download-progress", {
        traceId: downloadTraceId,
        percent: 74,
        stage: "merging",
        speed: "Merging...",
        eta: "",
      });
      options.emitAppEvent("video-transcode-queue-count", {
        activeCount: 1,
        pendingCount: 0,
        failedCount: 0,
        totalCount: 1,
        maxConcurrent: 1,
      });
      options.emitAppEvent("video-transcode-queue-detail", {
        tasks: [
          {
            traceId: transcodeTraceId,
            label: "Editorial proxy source.mov",
            status: "active",
            stage: "finalizing_mp4",
            progressPercent: 91,
            etaSeconds: 8,
            sourcePath: "D:/ui-lab/editorial-proxy-source.mov",
            sourceFormat: "mov",
            targetFormat: "mp4",
            error: null,
          },
        ],
      });
      options.emitAppEvent("video-transcode-progress", {
        traceId: transcodeTraceId,
        label: "Editorial proxy source.mov",
        status: "active",
        stage: "finalizing_mp4",
        progressPercent: 91,
        etaSeconds: 8,
        sourcePath: "D:/ui-lab/editorial-proxy-source.mov",
        sourceFormat: "mov",
        targetFormat: "mp4",
        error: null,
      });
      return;
    }

    throw new Error(`Unsupported UI Lab scenario: ${scenario}`);
  };

  return {
    applyReadyRuntimePreview,
    applyScenarioPreview,
    emitEmptyTaskState,
    restoreLiveState,
  };
};
