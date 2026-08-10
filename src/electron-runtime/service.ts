import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  ElectronDownloadRuntime,
  ElectronDownloadRuntimeOptions,
  RuntimeManagedComponent,
} from "./contracts.js";
import { inspectRuntimeDependencyStatus, resolveRuntimeBinaryPaths } from "./runtimePaths.js";
import { createRuntimeDependencyResolver } from "./runtimeDependencyGate.js";
import {
  buildOutputStem,
  nextDownloadTraceId,
  parseJsonObject,
  resolveAvailableOutputStem,
  resolveOutputDir,
  summarizeError,
} from "./runtimeUtils.js";
import {
  allocateRenameStem,
  releaseRenameStem,
  resolveRenameEnabled,
} from "./renameRules.js";
import {
  cleanupGalleryDlMetadataSidecars,
  resolveGalleryDlMetadataTitleFromSidecars,
} from "./galleryDlMetadata.js";
import {
  runAdvancedQualityProbe,
  type AdvancedQualityProbeResult,
} from "./advancedQualityProbe.js";
import type {
  AdvancedQualityOptionPayload,
  DownloadResultPayload,
  QueuedVideoDownloadAck,
  VideoTranscodeCompletePayload,
  VideoTranscodeQueueDetailPayload,
  VideoTranscodeQueueStatePayload,
  VideoTranscodeStage,
  VideoTranscodeTaskPayload,
  VideoQueueDetailPayload,
  VideoQueueStatePayload,
  VideoQueueTaskPhase,
} from "../types/videoRuntime.js";
import type { RuntimeFailureDiagnostic } from "../types/errorDiagnostics.js";
import type {
  DownloadProgress,
  EnginePlan,
  RawDownloadInput,
  ResolvedDownloadPlan,
} from "../core/index.js";
import { createEngineRegistry } from "../engines/engine-registry.js";
import { DownloadOrchestrator } from "../orchestration/download-orchestrator.js";
import { loadBuiltinProviders } from "../sites/provider-loader.js";
import { createSiteRegistry } from "../sites/site-registry.js";
import {
  prepareVideoTranscodeTaskFromDownload,
  runPreparedVideoTranscodeTask,
  type PreparedVideoTranscodeTask,
  type VideoCompatibilityAnalysis,
} from "./transcode.js";
import {
  createDownloadTelemetryEvent,
  createDownloadTelemetrySink,
  type DownloadTelemetrySink,
} from "./downloadTelemetry.js";
import { DownloadRuntimeError } from "../core/index.js";
import { resolveYtdlpFormatProfile } from "./engineManifest.js";
import {
  buildDirectRouteResolution,
  buildResolutionFailureFallbackRoute,
  redactNetworkCredentials,
  toNetworkDiagnosticSnapshot,
  type NetworkDiagnosticSnapshot,
  type NetworkFailureClassification,
  type NetworkRouteResolution,
} from "../config/networkRoute.js";
import { classifyEngineFailure } from "./engineErrorClassifier.js";
import type { DownloadExecutionContext } from "./contracts.js";
import type { EngineExecutionContextWithRuntime } from "./engineExecutionContext.js";
import type { NetworkApplicationOutcome } from "./engineNetworkAdapters.js";
import { toDownloadProgressPayload, toDownloadResultPayload } from "./protocolMappers.js";
import type { DownloadTelemetryProfile } from "../download-capabilities/telemetry.js";
import { DownloadJobService } from "../application/download-job-service.js";

type PendingTask = {
  traceId: string;
  label: string;
  request: RawDownloadInput;
};

type ActiveTask = PendingTask & {
  abortController: AbortController;
};

type AdvancedQualityRuntimeOption = AdvancedQualityOptionPayload & {
  selector: string;
};

type AdvancedQualityTaskState = {
  traceId: string;
  label: string;
  videoTitle?: string;
  request: RawDownloadInput;
  dedupeKey: string;
  phase: Extract<VideoQueueTaskPhase, "probing_quality" | "selecting_quality">;
  abortController: AbortController | null;
  qualityOptions: AdvancedQualityRuntimeOption[];
};

type DownloadTelemetryContext = {
  request: RawDownloadInput;
  plan: ResolvedDownloadPlan | null;
  chosenEngine: EnginePlan["engine"] | null;
  network?: NetworkDiagnosticSnapshot | null;
};

const resolveCanonicalNetworkTarget = (
  request: RawDownloadInput,
  plan: ResolvedDownloadPlan | null,
): string => {
  const primaryEngine = plan?.engines
    .slice()
    .sort((left, right) => right.priority - left.priority)[0];
  return primaryEngine?.sourceUrl ?? request.pageUrl ?? request.url;
};

/**
 * Opaque per-Job application context. The runtime places the already-resolved
 * NetworkRoute, output/config values and diagnostic callbacks in it;
 * DownloadJobService treats it as a generic and never reaches into runtime or
 * Electron state. One object per Job, reused by fallback and auth retry.
 */
type RuntimeDownloadJobContext = {
  traceId: string;
  request: RawDownloadInput;
  network: NetworkRouteResolution;
  outputDir: string;
  outputStem: string;
  config: Record<string, unknown>;
  abortSignal: AbortSignal;
  canonicalNetworkTarget: string;
  reportNetworkProxyFailure?: ElectronDownloadRuntimeOptions["reportNetworkProxyFailure"];
  onNetworkApplication(application: NetworkApplicationOutcome): void | Promise<void>;
  onProgress(payload: DownloadProgress): void | Promise<void>;
};

type TranscodeTaskState = PreparedVideoTranscodeTask & {
  userUrl?: string;
  status: "pending" | "active" | "failed";
  stage: VideoTranscodeStage | null;
  progressPercent: number | null;
  etaSeconds: number | null;
  error: string | null;
  failure: RuntimeFailureDiagnostic | null;
  abortController?: AbortController;
};

const NOOP_LOGGER = {
  log(message: string): void {
    void message;
  },
};

const queueTaskLabel = (request: RawDownloadInput): string =>
  request.title?.trim()
  || request.pageUrl?.trim()
  || request.videoUrl?.trim()
  || request.url.trim();

const resolveDiagnosticUserUrl = (request: RawDownloadInput): string | undefined => (
  request.pageUrl?.trim()
  || request.url.trim()
  || undefined
);

const toDownloadFailureDiagnostic = (
  error: DownloadRuntimeError,
  request: RawDownloadInput,
): RuntimeFailureDiagnostic => ({
  code: error.code,
  classification: error.classification,
  rawMessage: error.message,
  userUrl: resolveDiagnosticUserUrl(request),
  context: error.context,
});

const toTranscodeFailureDiagnostic = (
  errorMessage: string,
  task: TranscodeTaskState,
): RuntimeFailureDiagnostic => ({
  code: "E_EXECUTION_FAILED",
  rawMessage: errorMessage,
  userUrl: task.userUrl,
  context: {
    sourcePath: task.sourcePath,
    sourceFormat: task.sourceFormat,
    targetFormat: task.targetFormat,
    plan: task.plan,
  },
});

const EARLY_VIDEO_ACTIVITY_PAYLOAD = {
  percent: -1,
  stage: "preparing" as const,
  speed: "Resolving media...",
  eta: "",
};
export const FAILED_TRANSCODE_RETENTION_LIMIT = 20;

const formatElapsedMs = (startedAtMs: number): string => `${Date.now() - startedAtMs}ms`;

const hasYtDlpEngine = (plan: ResolvedDownloadPlan | null): boolean => (
  plan?.engines.some((enginePlan) => enginePlan.engine === "yt-dlp") ?? false
);
export const ADVANCED_QUALITY_SUPPORTED_SITE_IDS = new Set(["youtube", "bilibili"]);

const resolveYtdlpTelemetryProfileKey = (
  plan: ResolvedDownloadPlan | null,
): string | null => {
  if (!hasYtDlpEngine(plan)) {
    return null;
  }
  return plan?.intent.siteId === "youtube" ? "youtube" : "default";
};

const resolveDownloadTelemetryProfile = (
  plan: ResolvedDownloadPlan | null,
): DownloadTelemetryProfile | null => {
  if (!hasYtDlpEngine(plan)) {
    return null;
  }

  const qualityPreference = plan?.intent.videoQuality ?? "best";
  const ytdlpProfileKey = resolveYtdlpTelemetryProfileKey(plan);
  const formatProfile = resolveYtdlpFormatProfile(
    qualityPreference,
    true,
    {
      isYouTube: ytdlpProfileKey === "youtube",
      siteId: plan?.intent.siteId,
    },
  );

  return {
    qualityPreference,
    ytdlpProfileKey,
    ytdlpMergeOutputFormat: formatProfile.mergeOutputFormat,
    ytdlpFormatSort: formatProfile.sort,
  };
};

export class AmeowElectronDownloadRuntime implements ElectronDownloadRuntime {
  readonly maxConcurrent: number;

  private readonly options: ElectronDownloadRuntimeOptions;
  private readonly logger;
  private readonly pending: PendingTask[] = [];
  private readonly active = new Map<string, ActiveTask>();
  private readonly advancedQualityTasks = new Map<string, AdvancedQualityTaskState>();
  private readonly advancedQualityDedupe = new Map<string, string>();
  private readonly reservedOutputStems = new Map<string, string>();
  private outputStemReservationLock: Promise<void> = Promise.resolve();
  private readonly pendingTranscodes: TranscodeTaskState[] = [];
  private readonly failedTranscodes: TranscodeTaskState[] = [];
  private activeTranscode: TranscodeTaskState | null = null;
  private transcodePumpScheduled = false;
  private readonly resolver;
  private readonly orchestrator: DownloadOrchestrator<EngineExecutionContextWithRuntime>;
  private readonly siteRegistry;
  private readonly telemetrySink: DownloadTelemetrySink;

  constructor(options: ElectronDownloadRuntimeOptions) {
    this.options = options;
    this.maxConcurrent = options.maxConcurrent ?? 3;
    this.logger = options.logger ?? NOOP_LOGGER;
    const providers = options.providers ?? loadBuiltinProviders();
    // Concrete engines are registered by the outer Electron composition; the
    // runtime never constructs hidden built-in adapters.
    const engines = options.engines ?? [];
    this.siteRegistry = createSiteRegistry(providers);
    this.orchestrator = new DownloadOrchestrator(
      this.siteRegistry,
      createEngineRegistry(engines),
    );
    this.telemetrySink = options.telemetrySink
      ?? createDownloadTelemetrySink(options.environment, this.logger);
    this.resolver = createRuntimeDependencyResolver(
      inspectRuntimeDependencyStatus(options.environment),
      () => inspectRuntimeDependencyStatus(options.environment),
      async (reason: string) => {
        if (!this.options.bootstrapManagedComponents) {
          return this.resolver.refreshGateState();
        }
        await this.options.bootstrapManagedComponents({
          missingComponents: this.resolver.getGateState().missingComponents as RuntimeManagedComponent[],
          reason,
          environment: this.options.environment,
        });
        const nextState = this.resolver.refreshGateState();
        await this.options.eventSink.emit("runtime-dependency-gate-state", nextState);
        return nextState;
      },
    );
  }

  getRuntimeDependencyStatus() {
    return this.resolver.resolveStatus();
  }

  getRuntimeDependencyGateState() {
    return this.resolver.getGateState();
  }

  refreshRuntimeDependencyGateState() {
    const nextState = this.resolver.refreshGateState();
    void this.options.eventSink.emit("runtime-dependency-gate-state", nextState);
    return nextState;
  }

  async startRuntimeDependencyBootstrap(reason = "electron_runtime") {
    const nextState = await this.resolver.startBootstrap(reason);
    await this.options.eventSink.emit("runtime-dependency-gate-state", nextState);
    return nextState;
  }

  getQueueState(): VideoQueueStatePayload {
    const activeCount = this.active.size + this.advancedQualityTasks.size;
    const pendingCount = this.pending.length;
    return {
      activeCount,
      pendingCount,
      totalCount: activeCount + pendingCount,
      maxConcurrent: this.maxConcurrent,
    };
  }

  getQueueDetail(): VideoQueueDetailPayload {
    return {
      tasks: [
        ...Array.from(this.active.values()).map((task) => ({
          traceId: task.traceId,
          label: task.label,
          status: "active" as const,
          phase: "downloading" as const,
        })),
        ...Array.from(this.advancedQualityTasks.values()).map((task) => ({
          traceId: task.traceId,
          label: task.label,
          videoTitle: task.videoTitle,
          status: "active" as const,
          phase: task.phase,
          qualityOptions: task.phase === "selecting_quality"
            ? task.qualityOptions.map((option) => ({
                id: option.id,
                label: option.label,
                tags: option.tags,
                postProcessPlan: option.postProcessPlan,
              }))
            : undefined,
        })),
        ...this.pending.map((task) => ({
          traceId: task.traceId,
          label: task.label,
          status: "pending" as const,
        })),
      ],
    };
  }

  async queueVideoDownload(request: RawDownloadInput): Promise<QueuedVideoDownloadAck> {
    if (request.advancedQualityRequest === true) {
      return await this.queueAdvancedQualityDownload(request);
    }

    const traceId = nextDownloadTraceId();
    await this.enqueuePendingDownloadTask(traceId, request);
    return {
      accepted: true,
      traceId,
    };
  }

  async selectAdvancedQualityOption(traceId: string, optionId: string): Promise<boolean> {
    const task = this.advancedQualityTasks.get(traceId);
    if (!task || task.phase !== "selecting_quality") {
      return false;
    }

    const selectedOption = task.qualityOptions.find((option) => option.id === optionId);
    if (!selectedOption) {
      return false;
    }

    this.removeAdvancedQualityTask(traceId);
    await this.enqueuePendingDownloadTask(traceId, {
      ...task.request,
      advancedQualityRequest: false,
      advancedQualitySelector: selectedOption.selector,
      advancedQualityLabel: selectedOption.label,
    });
    return true;
  }

  async cancelDownload(traceId: string): Promise<boolean> {
    const advancedTask = this.advancedQualityTasks.get(traceId);
    if (advancedTask) {
      advancedTask.abortController?.abort();
      this.removeAdvancedQualityTask(traceId);
      await this.emitQueueState();
      return true;
    }

    const pendingIndex = this.pending.findIndex((task) => task.traceId === traceId);
    if (pendingIndex >= 0) {
      const [cancelledTask] = this.pending.splice(pendingIndex, 1);
      await this.emitQueueState();
      const cancellationError = new DownloadRuntimeError(
        "E_ABORTED",
        "Download cancelled",
        {
          classification: "cancelled",
        },
      );
      await this.recordDownloadTelemetry(
        traceId,
        {
          request: cancelledTask.request,
          plan: this.siteRegistry.resolve(cancelledTask.request),
          chosenEngine: null,
        },
        cancellationError,
      );
      await this.options.eventSink.emit("video-download-complete", {
        traceId,
        success: false,
        error: "Download cancelled",
      } satisfies DownloadResultPayload);
      this.scheduleTranscodePump();
      return true;
    }

    const activeTask = this.active.get(traceId);
    if (!activeTask) {
      return false;
    }
    activeTask.abortController.abort();
    return true;
  }

  private async enqueuePendingDownloadTask(
    traceId: string,
    request: RawDownloadInput,
  ): Promise<void> {
    this.pending.push({
      traceId,
      label: queueTaskLabel(request),
      request,
    });
    await this.emitQueueState();
    void this.pumpQueue();
  }

  private buildAdvancedQualityDedupeKey(request: RawDownloadInput): string {
    return [
      request.siteHint?.trim() || "generic",
      request.pageUrl?.trim() || request.url.trim(),
      typeof request.clipStartSec === "number" ? request.clipStartSec : "",
      typeof request.clipEndSec === "number" ? request.clipEndSec : "",
    ].join("|");
  }

  private removeAdvancedQualityTask(traceId: string): AdvancedQualityTaskState | null {
    const task = this.advancedQualityTasks.get(traceId) ?? null;
    if (!task) {
      return null;
    }
    this.advancedQualityTasks.delete(traceId);
    const existingTraceId = this.advancedQualityDedupe.get(task.dedupeKey);
    if (existingTraceId === traceId) {
      this.advancedQualityDedupe.delete(task.dedupeKey);
    }
    return task;
  }

  private async queueAdvancedQualityDownload(
    request: RawDownloadInput,
  ): Promise<QueuedVideoDownloadAck> {
    const dedupeKey = this.buildAdvancedQualityDedupeKey(request);
    const existingTraceId = this.advancedQualityDedupe.get(dedupeKey);
    if (existingTraceId && this.advancedQualityTasks.has(existingTraceId)) {
      return {
        accepted: true,
        traceId: existingTraceId,
      };
    }

    const traceId = nextDownloadTraceId();
    const task: AdvancedQualityTaskState = {
      traceId,
      label: queueTaskLabel(request),
      request,
      dedupeKey,
      phase: "probing_quality",
      abortController: new AbortController(),
      qualityOptions: [],
    };
    this.advancedQualityTasks.set(traceId, task);
    this.advancedQualityDedupe.set(dedupeKey, traceId);
    await this.emitQueueState();
    void this.probeAdvancedQualityTask(traceId);
    return {
      accepted: true,
      traceId,
    };
  }

  private async probeAdvancedQualityTask(traceId: string): Promise<void> {
    const task = this.advancedQualityTasks.get(traceId);
    if (!task || !task.abortController) {
      return;
    }

    try {
      const { options, videoTitle } = await this.runAdvancedQualityProbeForTask(task);
      const latestTask = this.advancedQualityTasks.get(traceId);
      if (!latestTask) {
        return;
      }
      latestTask.phase = "selecting_quality";
      latestTask.abortController = null;
      latestTask.qualityOptions = options;
      latestTask.videoTitle = videoTitle;
      await this.emitQueueState();
    } catch (error) {
      const latestTask = this.advancedQualityTasks.get(traceId);
      const aborted = latestTask?.abortController?.signal.aborted === true
        || task.abortController.signal.aborted;
      this.removeAdvancedQualityTask(traceId);
      await this.emitQueueState();
      if (aborted) {
        return;
      }
      this.logger.log(`>>> [ElectronRuntime] advanced quality probe failed: ${summarizeError(error)}`);
      await this.options.eventSink.emit("video-download-complete", {
        traceId,
        success: false,
        error: "更多画质探测失败",
        failure: {
          code: "E_EXECUTION_FAILED",
          rawMessage: summarizeError(error),
          userUrl: resolveDiagnosticUserUrl(task.request),
        },
      } satisfies DownloadResultPayload);
    }
  }

  private async runAdvancedQualityProbeForTask(
    task: AdvancedQualityTaskState,
  ): Promise<AdvancedQualityProbeResult> {
    const context = await this.buildAdvancedQualityProbeContext(task);
    // Explicit composition at the probe boundary: static binary paths are
    // supplied by the runtime, never smuggled through the execution contract.
    return await runAdvancedQualityProbe({
      ...context,
      binaries: resolveRuntimeBinaryPaths(this.options.environment),
    });
  }

  /**
   * Creates one stable DownloadExecutionContext. The network route is
   * resolved once for the canonical entry target and the same resolution is
   * reused across engine retry, engine fallback, and auth recovery. A future
   * refresh must be an explicit rebuild with a new identity; P0 exposes no
   * implicit refresh path.
   */
  private createDownloadExecutionContext(
    traceId: string,
    targetUrl: string,
    providerId: string | null,
    engineId: EnginePlan["engine"],
  ): DownloadExecutionContext {
    const consumer = engineId === "gallery-dl" ? "gallery-dl" as const : "yt-dlp" as const;
    const network = this.options.resolveNetworkRoute
      ? this.options.resolveNetworkRoute({
          targetUrl,
          providerId,
          engineId,
        }).catch((error) => {
          this.logger.log(
            `>>> [ElectronRuntime] network route resolution failed for ${traceId}: ${redactNetworkCredentials(summarizeError(error))}`,
          );
          return buildResolutionFailureFallbackRoute(targetUrl, consumer, error);
        })
      : Promise.resolve(buildDirectRouteResolution(targetUrl, consumer, {
          source: "direct",
          reason: "no_proxy_source",
        }));

    return {
      identity: `download-ctx-${traceId}`,
      createdAtMs: Date.now(),
      network,
    };
  }

  private async buildAdvancedQualityProbeContext(
    task: AdvancedQualityTaskState,
  ): Promise<EngineExecutionContextWithRuntime> {
    const abortController = task.abortController;
    if (!abortController) {
      throw new DownloadRuntimeError(
        "E_ABORTED",
        "Advanced quality probe cancelled",
        {
          classification: "cancelled",
        },
      );
    }
    const config = parseJsonObject(await this.options.configStore.readConfigString());
    const resolvedOutputDir = resolveOutputDir(this.options.environment, config);
    const plan = this.siteRegistry.resolve(task.request);
    if (!plan) {
      throw new DownloadRuntimeError(
        "E_NO_PROVIDER_MATCH",
        "No site provider matched the advanced quality request",
      );
    }
    if (!ADVANCED_QUALITY_SUPPORTED_SITE_IDS.has(plan.intent.siteId)) {
      throw new DownloadRuntimeError(
        "E_INPUT_INVALID",
        `Advanced quality selection is not supported for ${plan.intent.siteId}`,
        {
          classification: "input_invalid",
        },
      );
    }

    const enginePlan = plan.engines
      .slice()
      .sort((left, right) => right.priority - left.priority)
      .find((candidate) => candidate.engine === "yt-dlp");
    if (!enginePlan) {
      throw new DownloadRuntimeError(
        "E_ENGINE_NOT_FOUND",
        "Advanced quality probing is only available for yt-dlp-backed downloads",
        {
          context: {
            traceId: task.traceId,
            providerId: plan.providerId,
          },
        },
      );
    }

    if (this.options.ensureEngineRuntimeReady) {
      await this.options.ensureEngineRuntimeReady(
        enginePlan.engine,
        `runtime_probe_${task.traceId}_${enginePlan.engine}`,
      );
    }

    if (this.options.refreshSiteSessionBeforeAdvancedQualityProbe) {
      await this.options.refreshSiteSessionBeforeAdvancedQualityProbe({
        traceId: task.traceId,
        siteId: plan.intent.siteId,
        pageUrl: task.request.pageUrl,
        url: task.request.url,
      }).catch((error) => {
        this.logger.log(
          `>>> [ElectronRuntime] advanced quality site-session refresh failed: ${summarizeError(error)}`,
        );
      });
    }

    const proxyTargetUrl = enginePlan.sourceUrl ?? task.request.pageUrl ?? task.request.url;
    // Probe-scoped execution context: one lazy route resolution for the
    // probe lifecycle; reuses the shared resolver but never a Job context.
    const executionContext = this.createDownloadExecutionContext(
      task.traceId,
      proxyTargetUrl,
      plan.providerId,
      enginePlan.engine,
    );
    const network = await executionContext.network;

    const context: EngineExecutionContextWithRuntime = {
      traceId: task.traceId,
      plan,
      enginePlan,
      intent: plan.intent,
      outputDir: resolvedOutputDir,
      outputStem: buildOutputStem(
        task.traceId,
        task.request.pageUrl ?? task.request.url,
        config,
        task.request.title,
        task.request.siteHint,
      ),
      config,
      cookies: task.request.cookies,
      network,
      abortSignal: abortController.signal,
      reportNetworkProxyFailure: this.options.reportNetworkProxyFailure
        ? (error) => this.options.reportNetworkProxyFailure?.({
            targetUrl: proxyTargetUrl,
            providerId: plan.providerId,
            engineId: enginePlan.engine,
            error,
          })
        : undefined,
      onProgress: async () => undefined,
    };

    return this.options.buildExecutionContext
      ? this.options.buildExecutionContext(context, task.request)
      : context;
  }

  async cancelTranscode(traceId: string): Promise<boolean> {
    const pendingIndex = this.pendingTranscodes.findIndex((task) => task.traceId === traceId);
    if (pendingIndex >= 0) {
      const [removed] = this.pendingTranscodes.splice(pendingIndex, 1);
      await this.emitTranscodeQueueState();
      await this.options.eventSink.emit("video-transcode-removed", this.toTranscodeTaskPayload(removed));
      return true;
    }

    if (this.activeTranscode?.traceId !== traceId || !this.activeTranscode.abortController) {
      return false;
    }
    this.activeTranscode.abortController.abort();
    return true;
  }

  async retryTranscode(traceId: string): Promise<boolean> {
    const failedIndex = this.failedTranscodes.findIndex((task) => task.traceId === traceId);
    if (failedIndex < 0) {
      return false;
    }

    const [failedTask] = this.failedTranscodes.splice(failedIndex, 1);
    const retriedTask: TranscodeTaskState = {
      ...failedTask,
      status: "pending",
      stage: null,
      progressPercent: null,
      etaSeconds: null,
      error: null,
      failure: null,
      abortController: undefined,
    };
    this.pendingTranscodes.push(retriedTask);
    await this.emitTranscodeQueueState();
    await this.options.eventSink.emit("video-transcode-retried", this.toTranscodeTaskPayload(retriedTask));
    this.scheduleTranscodePump();
    return true;
  }

  async removeTranscode(traceId: string): Promise<boolean> {
    const failedIndex = this.failedTranscodes.findIndex((task) => task.traceId === traceId);
    if (failedIndex < 0) {
      return false;
    }

    const [removed] = this.failedTranscodes.splice(failedIndex, 1);
    await this.emitTranscodeQueueState();
    await this.options.eventSink.emit("video-transcode-removed", this.toTranscodeTaskPayload(removed));
    return true;
  }

  private async emitQueueState(): Promise<void> {
    await this.options.eventSink.emit("video-queue-count", this.getQueueState());
    await this.options.eventSink.emit("video-queue-detail", this.getQueueDetail());
  }

  getTranscodeQueueState(): VideoTranscodeQueueStatePayload {
    const activeCount = this.activeTranscode ? 1 : 0;
    const pendingCount = this.pendingTranscodes.length;
    const failedCount = this.failedTranscodes.length;
    return {
      activeCount,
      pendingCount,
      failedCount,
      totalCount: activeCount + pendingCount + failedCount,
      maxConcurrent: 1,
    };
  }

  getTranscodeQueueDetail(): VideoTranscodeQueueDetailPayload {
    return {
      tasks: [
        ...(this.activeTranscode ? [this.toTranscodeTaskPayload(this.activeTranscode)] : []),
        ...this.pendingTranscodes.map((task) => this.toTranscodeTaskPayload(task)),
        ...this.failedTranscodes.map((task) => this.toTranscodeTaskPayload(task)),
      ],
    };
  }

  private async emitTranscodeQueueState(): Promise<void> {
    await this.options.eventSink.emit("video-transcode-queue-count", this.getTranscodeQueueState());
    await this.options.eventSink.emit("video-transcode-queue-detail", this.getTranscodeQueueDetail());
  }

  private retainNewestFailedTranscodes(): void {
    if (this.failedTranscodes.length <= FAILED_TRANSCODE_RETENTION_LIMIT) {
      return;
    }
    this.failedTranscodes.splice(
      0,
      this.failedTranscodes.length - FAILED_TRANSCODE_RETENTION_LIMIT,
    );
  }

  private toTranscodeTaskPayload(task: TranscodeTaskState): VideoTranscodeTaskPayload {
    return {
      traceId: task.traceId,
      label: task.label,
      status: task.status,
      stage: task.stage,
      progressPercent: task.progressPercent,
      etaSeconds: task.etaSeconds,
      sourcePath: task.sourcePath,
      sourceFormat: task.sourceFormat,
      targetFormat: task.targetFormat,
      error: task.error,
      failure: task.failure,
    };
  }

  private toTranscodeCompletePayload(task: TranscodeTaskState, filePath: string): VideoTranscodeCompletePayload {
    return {
      traceId: task.traceId,
      label: task.label,
      sourcePath: task.sourcePath,
      filePath,
      sourceFormat: task.sourceFormat,
      targetFormat: task.targetFormat,
    };
  }

  private hasBlockingDownloads(): boolean {
    return this.active.size > 0 || this.pending.length > 0 || this.advancedQualityTasks.size > 0;
  }

  private scheduleTranscodePump(): void {
    if (this.transcodePumpScheduled) {
      return;
    }
    this.transcodePumpScheduled = true;
    void this.pumpTranscodeQueue();
  }

  private async pumpTranscodeQueue(): Promise<void> {
    try {
      if (this.activeTranscode || this.pendingTranscodes.length === 0 || this.hasBlockingDownloads()) {
        return;
      }

      const nextTask = this.pendingTranscodes.shift();
      if (!nextTask) {
        return;
      }

      this.activeTranscode = {
        ...nextTask,
        status: "active",
        stage: "analyzing",
        progressPercent: null,
        etaSeconds: null,
        error: null,
        failure: null,
        abortController: new AbortController(),
      };
      await this.emitTranscodeQueueState();
      await this.options.eventSink.emit(
        "video-transcode-progress",
        this.toTranscodeTaskPayload(this.activeTranscode),
      );
      await this.runActiveTranscode();
    } finally {
      this.transcodePumpScheduled = false;
      if (!this.activeTranscode && this.pendingTranscodes.length > 0 && !this.hasBlockingDownloads()) {
        this.scheduleTranscodePump();
      }
    }
  }

  private async enqueuePreparedTranscodeTask(task: PreparedVideoTranscodeTask, userUrl?: string): Promise<void> {
    const alreadyPresent = this.pendingTranscodes.some((existing) => existing.traceId === task.traceId)
      || this.failedTranscodes.some((existing) => existing.traceId === task.traceId)
      || this.activeTranscode?.traceId === task.traceId;
    if (alreadyPresent) {
      return;
    }

    const pendingTask: TranscodeTaskState = {
      ...task,
      userUrl,
      status: "pending",
      stage: null,
      progressPercent: null,
      etaSeconds: null,
      error: null,
      failure: null,
    };
    this.pendingTranscodes.push(pendingTask);
    await this.emitTranscodeQueueState();
    await this.options.eventSink.emit("video-transcode-queued", this.toTranscodeTaskPayload(pendingTask));
    this.scheduleTranscodePump();
  }

  private async handleCompletedVideoSource(
    traceId: string,
    label: string,
    sourcePath: string,
    binaries: ReturnType<typeof resolveRuntimeBinaryPaths>,
    telemetry?: DownloadTelemetryContext,
  ): Promise<void> {
    let compatibility: VideoCompatibilityAnalysis | null = null;
    try {
      const prepared = await prepareVideoTranscodeTaskFromDownload({
        traceId,
        label,
        sourcePath,
        ffprobePath: binaries.ffprobe,
        ffmpegPath: binaries.ffmpeg,
        onCompatibilityAnalysis(analysis) {
          compatibility = analysis;
        },
      });
      if (!prepared) {
        return;
      }
      await this.enqueuePreparedTranscodeTask(
        prepared,
        telemetry?.request ? resolveDiagnosticUserUrl(telemetry.request) : undefined,
      );
    } catch (error) {
      this.logger.log(
        `>>> [ElectronRuntime] transcode follow-up for ${traceId} failed: ${summarizeError(error)}`,
      );
    } finally {
      if (telemetry) {
        await this.recordDownloadTelemetry(
          traceId,
          telemetry,
          null,
          compatibility,
        );
      }
    }
  }

  private async runActiveTranscode(): Promise<void> {
    const activeTask = this.activeTranscode;
    if (!activeTask || !activeTask.abortController) {
      return;
    }

    try {
      const result = await runPreparedVideoTranscodeTask(activeTask, {
        ffmpegPath: resolveRuntimeBinaryPaths(this.options.environment).ffmpeg,
        signal: activeTask.abortController.signal,
        onProgress: async (progress) => {
          if (!this.activeTranscode || this.activeTranscode.traceId !== activeTask.traceId) {
            return;
          }

          this.activeTranscode = {
            ...this.activeTranscode,
            stage: progress.stage,
            progressPercent: progress.progressPercent,
            etaSeconds: progress.etaSeconds,
          };
          await this.emitTranscodeQueueState();
          await this.options.eventSink.emit(
            "video-transcode-progress",
            this.toTranscodeTaskPayload(this.activeTranscode),
          );
        },
      });

      const completedTask = this.activeTranscode;
      if (!completedTask) {
        return;
      }
      this.activeTranscode = null;
      await this.emitTranscodeQueueState();
      await this.options.eventSink.emit(
        "video-transcode-complete",
        this.toTranscodeCompletePayload(completedTask, result.filePath),
      );
    } catch (error) {
      const failedTask = this.activeTranscode;
      if (!failedTask) {
        return;
      }

      this.activeTranscode = null;
      if (failedTask.abortController?.signal.aborted) {
        await this.emitTranscodeQueueState();
        await this.options.eventSink.emit("video-transcode-removed", this.toTranscodeTaskPayload(failedTask));
        return;
      }

      const errorMessage = summarizeError(error);
      const failure = toTranscodeFailureDiagnostic(errorMessage, failedTask);
      const nextFailedTask: TranscodeTaskState = {
        ...failedTask,
        status: "failed",
        stage: "failed",
        progressPercent: null,
        etaSeconds: null,
        error: errorMessage,
        failure,
        abortController: undefined,
      };
      this.failedTranscodes.push(nextFailedTask);
      this.retainNewestFailedTranscodes();
      await this.emitTranscodeQueueState();
      await this.options.eventSink.emit("video-transcode-failed", this.toTranscodeTaskPayload(nextFailedTask));
    }
  }

  private async reserveOutputStem(
    traceId: string,
    outputDir: string,
    preferredOutputStem: string,
    config: Record<string, unknown>,
  ): Promise<string> {
    const previousLock = this.outputStemReservationLock;
    let releaseLock = (): void => undefined;
    this.outputStemReservationLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await previousLock;
    try {
      if (resolveRenameEnabled(config)) {
        const outputStem = await allocateRenameStem(outputDir, config);
        this.reservedOutputStems.set(traceId, outputStem);
        return outputStem;
      }

      const outputStem = await resolveAvailableOutputStem(
        outputDir,
        preferredOutputStem,
        this.reservedOutputStems.values(),
      );
      this.reservedOutputStems.set(traceId, outputStem);
      return outputStem;
    } finally {
      releaseLock();
    }
  }

  private async applyResolvedTitleToCompletedDownload({
    traceId,
    outputDir,
    outputStem,
    filePath,
    title,
    request,
    config,
  }: {
    traceId: string;
    outputDir: string;
    outputStem: string;
    filePath: string;
    title: string;
    request: RawDownloadInput;
    config: Record<string, unknown>;
  }): Promise<{ filePath: string; title: string } | null> {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      return null;
    }

    const preferredTitleStem = buildOutputStem(
      traceId,
      request.pageUrl ?? request.url,
      config,
      normalizedTitle,
      request.siteHint,
    );
    if (preferredTitleStem === outputStem) {
      return {
        filePath,
        title: normalizedTitle,
      };
    }

    const renamedOutputStem = await resolveAvailableOutputStem(
      outputDir,
      preferredTitleStem,
      Array.from(this.reservedOutputStems.values()).filter((stem) => stem !== outputStem),
    );
    const renamedFilePath = path.join(
      path.dirname(filePath),
      `${renamedOutputStem}${path.extname(filePath)}`,
    );
    if (renamedFilePath !== filePath) {
      await fs.rename(filePath, renamedFilePath);
    }
    this.reservedOutputStems.set(traceId, renamedOutputStem);
    return {
      filePath: renamedFilePath,
      title: normalizedTitle,
    };
  }

  private async pumpQueue(): Promise<void> {
    while (this.active.size < this.maxConcurrent && this.pending.length > 0) {
      const nextTask = this.pending.shift();
      if (!nextTask) {
        return;
      }
      const abortController = new AbortController();
      this.active.set(nextTask.traceId, {
        ...nextTask,
        abortController,
      });
      await this.emitQueueState();
      void this.runTask(nextTask.traceId);
    }
  }

  private async runTask(traceId: string): Promise<void> {
    const activeTask = this.active.get(traceId);
    if (!activeTask) {
      return;
    }
    const taskStartedAtMs = Date.now();
    this.logger.log(`>>> [ElectronRuntimeTiming] task start: ${JSON.stringify({
      traceId,
      url: activeTask.request.url,
      pageUrl: activeTask.request.pageUrl ?? null,
      siteHint: activeTask.request.siteHint ?? null,
      quality: activeTask.request.ytdlpQuality ?? "best",
    })}`);

    // Static runtime dependencies are resolved before the application Job
    // runs; the terminal settlement below reuses them.
    const binaries = resolveRuntimeBinaryPaths(this.options.environment);
    let outputDir: string | null = null;
    let telemetryPlan: ResolvedDownloadPlan | null = null;
    let executedEngineId: EnginePlan["engine"] | null = null;
    // Diagnostics state updated by the per-attempt Job callbacks (closures)
    // and read by the catch/terminal block. A property holder avoids the
    // `let`-closure narrowing trap: closure assignments would otherwise leave
    // the initializer's `null` narrowing in force at later reads.
    const networkDiagnostics: { snapshot: NetworkDiagnosticSnapshot | null } = { snapshot: null };
    // The single terminal protocol payload: success is the mapped application
    // outcome, failure is the mapped typed error. Exactly one of these is
    // produced and emitted per Job; no other branch decides the terminal.
    let terminalResult: DownloadResultPayload;
    let terminalRuntimeError: DownloadRuntimeError | null = null;
    try {
      const config = parseJsonObject(await this.options.configStore.readConfigString());
      const resolvedOutputDir = resolveOutputDir(this.options.environment, config);
      outputDir = resolvedOutputDir;
      await this.options.eventSink.emit("video-download-progress", {
        traceId,
        ...EARLY_VIDEO_ACTIVITY_PAYLOAD,
      });
      // The ordinary Job lifecycle is delegated to the Electron-neutral
      // application service: prepare exactly once, one opaque Job context,
      // per-attempt contexts, at-most-one auth recovery and the single
      // terminal outcome. Route resolution and output reservation stay here
      // in the outer adapter (createJobContext) and happen once per Job.
      const execution = await new DownloadJobService<
        RuntimeDownloadJobContext,
        EngineExecutionContextWithRuntime
      >({
        orchestrator: this.orchestrator,
        onPrepared: (prepared) => {
          telemetryPlan = prepared.plan;
          this.logger.log(`>>> [ElectronRuntimeTiming] task pre-engine complete: ${JSON.stringify({
            traceId,
            elapsedMs: formatElapsedMs(taskStartedAtMs),
            providerId: prepared.plan.providerId,
            engineCandidates: prepared.plan.engines.map((plan) => plan.engine),
          })}`);
        },
        refreshSiteSessionBeforeDownload: async (prepared) => {
          if (this.options.refreshSiteSessionBeforeDownload) {
            await this.options.refreshSiteSessionBeforeDownload({
              traceId,
              siteId: prepared.plan.intent.siteId,
              pageUrl: activeTask.request.pageUrl,
              url: activeTask.request.url,
            });
          }
        },
        createJobContext: async (prepared) => {
          const preferredOutputStem = buildOutputStem(
            traceId,
            activeTask.request.pageUrl ?? activeTask.request.url,
            config,
            activeTask.request.title,
            activeTask.request.siteHint,
          );
          const outputStem = await this.reserveOutputStem(
            traceId,
            resolvedOutputDir,
            preferredOutputStem,
            config,
          );
          // One stable network route per Job: resolved here, then reused by
          // every engine attempt, fallback and auth retry through the opaque
          // Job context. A future refresh is an explicit rebuild with a new
          // identity; P0 exposes no implicit refresh path.
          const canonicalNetworkTarget = resolveCanonicalNetworkTarget(
            activeTask.request,
            prepared.plan,
          );
          const executionContext = this.createDownloadExecutionContext(
            traceId,
            canonicalNetworkTarget,
            prepared.plan.providerId,
            prepared.plan.engines.slice().sort((left, right) => right.priority - left.priority)[0]?.engine
              ?? "yt-dlp",
          );
          const network = await executionContext.network;
          const baseNetworkSnapshot = toNetworkDiagnosticSnapshot(network);
          networkDiagnostics.snapshot = baseNetworkSnapshot;
          return {
            traceId,
            request: activeTask.request,
            network,
            outputDir: resolvedOutputDir,
            outputStem,
            config,
            abortSignal: activeTask.abortController.signal,
            canonicalNetworkTarget,
            reportNetworkProxyFailure: this.options.reportNetworkProxyFailure,
            // Per-attempt application outcome: the engine that actually
            // applied (or rejected) the stable route wins the diagnostic;
            // never re-resolves.
            onNetworkApplication(application: NetworkApplicationOutcome): void {
              networkDiagnostics.snapshot = {
                ...baseNetworkSnapshot,
                engine: application.engine,
                appliedToEngine: application.appliedToEngine,
                reason: application.reason,
                failureClassification: application.failureClassification,
              };
            },
            onProgress: async (payload: DownloadProgress) => {
              await this.options.eventSink.emit(
                "video-download-progress",
                toDownloadProgressPayload(payload),
              );
            },
          };
        },
        buildAttemptContext: async (
          jobContext,
          plan: ResolvedDownloadPlan,
          enginePlan: EnginePlan,
        ) => {
          executedEngineId = enginePlan.engine;
          if (this.options.ensureEngineRuntimeReady) {
            await this.options.ensureEngineRuntimeReady(
              enginePlan.engine,
              `runtime_execute_${traceId}_${enginePlan.engine}`,
            );
          }
          this.logger.log(`>>> [ElectronRuntime] engine dispatch: ${JSON.stringify({
            traceId,
            providerId: plan.providerId,
            engine: enginePlan.engine,
            sourceUrl: enginePlan.sourceUrl ?? null,
            reason: enginePlan.reason,
            when: enginePlan.when,
          })}`);
          const context: EngineExecutionContextWithRuntime = {
            traceId: jobContext.traceId,
            plan,
            enginePlan,
            intent: plan.intent,
            outputDir: jobContext.outputDir,
            outputStem: jobContext.outputStem,
            config: jobContext.config,
            // Attempt auth material and engine-specific execution data come
            // from the raw request, not the Domain intent; the outer
            // composition may enrich them per attempt.
            cookies: jobContext.request.cookies,
            advancedQualitySelector: jobContext.request.advancedQualitySelector,
            advancedQualityLabel: jobContext.request.advancedQualityLabel,
            network: jobContext.network,
            abortSignal: jobContext.abortSignal,
            onNetworkApplication: jobContext.onNetworkApplication,
            reportNetworkProxyFailure: jobContext.reportNetworkProxyFailure
              ? (error) => jobContext.reportNetworkProxyFailure?.({
                  targetUrl: jobContext.canonicalNetworkTarget,
                  providerId: plan.providerId,
                  engineId: enginePlan.engine,
                  error,
                })
              : undefined,
            onProgress: jobContext.onProgress,
          };
          return this.options.buildExecutionContext
            ? this.options.buildExecutionContext(context, jobContext.request)
            : context;
        },
        handleAuthRequiredFailure: async ({ plan, chosenEngine, error }) => {
          return this.options.handleAuthRequiredFailure?.({
            traceId,
            request: activeTask.request,
            plan,
            chosenEngine,
            error,
          });
        },
        classifyFailure: (error) => this.toTaskRuntimeError(
          error,
          activeTask.abortController.signal.aborted,
        ),
      }).executeJob(activeTask.request, activeTask.abortController.signal);
      // Core result -> protocol payload at the runtime boundary (stable keys).
      let result = toDownloadResultPayload(execution.result);
      const chosenEngine = execution.chosenEngine;
      // Output settlement metadata lives in the Job context: the same object
      // reused by every attempt of this Job.
      const outputStem = execution.jobContext.outputStem;
      this.logger.log(`>>> [ElectronRuntimeTiming] task engine complete: ${JSON.stringify({
        traceId,
        elapsedMs: formatElapsedMs(taskStartedAtMs),
        providerId: execution.plan.providerId,
        engineId: chosenEngine ?? null,
        success: result.success,
        filePathPresent: Boolean(result.file_path),
      })}`);
      if (
        result.success
        && result.file_path
        && chosenEngine === "yt-dlp"
        && !activeTask.request.title?.trim()
        && result.title?.trim()
      ) {
        const renamed = await this.applyResolvedTitleToCompletedDownload({
          traceId,
          outputDir: resolvedOutputDir,
          outputStem,
          filePath: result.file_path,
          title: result.title,
          request: activeTask.request,
          config,
        });
        if (renamed) {
          activeTask.request.title = renamed.title;
          activeTask.label = queueTaskLabel(activeTask.request);
          await this.emitQueueState();
          result = {
            ...result,
            file_path: renamed.filePath,
            title: renamed.title,
          };
        }
      }
      if (result.success && result.file_path && chosenEngine === "gallery-dl") {
        const originalFilePath = result.file_path;
        const metadataTitle = await resolveGalleryDlMetadataTitleFromSidecars(
          resolvedOutputDir,
          outputStem,
          originalFilePath,
        );
        if (metadataTitle) {
          const renamed = await this.applyResolvedTitleToCompletedDownload({
            traceId,
            outputDir: resolvedOutputDir,
            outputStem,
            filePath: result.file_path,
            title: metadataTitle,
            request: activeTask.request,
            config,
          });
          if (renamed) {
            activeTask.request.title = renamed.title;
            activeTask.label = queueTaskLabel(activeTask.request);
            await this.emitQueueState();
            result = {
              ...result,
              file_path: renamed.filePath,
              title: renamed.title,
            };
          }
        }
        await cleanupGalleryDlMetadataSidecars(
          resolvedOutputDir,
          outputStem,
          originalFilePath,
        );
      }
      terminalResult = result;
    } catch (error) {
      const runtimeError = this.toTaskRuntimeError(error, activeTask.abortController.signal.aborted);
      const errorClassification = runtimeError.context?.networkFailureClassification;
      if (networkDiagnostics.snapshot && typeof errorClassification === "string") {
        networkDiagnostics.snapshot = {
          ...networkDiagnostics.snapshot,
          failureClassification: errorClassification as NetworkFailureClassification,
        };
      }
      this.logger.log(`>>> [ElectronRuntime] task ${traceId} failed: ${runtimeError.message}`);
      this.logger.log(`>>> [ElectronRuntimeTiming] task failed: ${JSON.stringify({
        traceId,
        elapsedMs: formatElapsedMs(taskStartedAtMs),
        error: runtimeError.message,
      })}`);
      terminalRuntimeError = runtimeError;
      terminalResult = {
        traceId,
        success: false,
        error: runtimeError.message,
        failure: toDownloadFailureDiagnostic(runtimeError, activeTask.request),
      } satisfies DownloadResultPayload;
    } finally {
      const reservedOutputStem = this.reservedOutputStems.get(traceId);
      if (outputDir && reservedOutputStem) {
        releaseRenameStem(outputDir, reservedOutputStem);
      }
      this.reservedOutputStems.delete(traceId);
      this.active.delete(traceId);
      await this.emitQueueState();
      void this.pumpQueue();
      this.scheduleTranscodePump();
    }

    // Exactly one terminal completion per Job. The terminal outcome was
    // decided by DownloadJobService (a resolved success outcome or a typed
    // failure, including cancellation and auth recovery/retry) and mapped to
    // the protocol payload exactly once above; the facade only emits,
    // telemetries and settles it and never re-decides the terminal state.
    await this.options.eventSink.emit("video-download-complete", terminalResult);
    this.logger.log(`>>> [ElectronRuntimeTiming] task complete event emitted: ${JSON.stringify({
      traceId,
      elapsedMs: formatElapsedMs(taskStartedAtMs),
      success: terminalResult.success,
    })}`);
    if (terminalResult.success && terminalResult.file_path) {
      void this.handleCompletedVideoSource(
        traceId,
        activeTask.label,
        terminalResult.file_path,
        binaries,
        {
          request: activeTask.request,
          plan: telemetryPlan,
          chosenEngine: executedEngineId,
          network: networkDiagnostics.snapshot,
        },
      );
    } else {
      await this.recordDownloadTelemetry(
        traceId,
        {
          request: activeTask.request,
          plan: telemetryPlan,
          chosenEngine: executedEngineId,
          network: networkDiagnostics.snapshot,
        },
        terminalRuntimeError,
      );
    }
  }

  private toTaskRuntimeError(
    error: unknown,
    aborted: boolean,
  ): DownloadRuntimeError {
    if (error instanceof DownloadRuntimeError) {
      // Engine adapters classify raw evidence and supply the classification
      // explicitly before throwing; those must never be re-derived from
      // message text. Only unstamped execution failures (an unclassified
      // E_EXECUTION_FAILED from a legacy or injected source) are refined at
      // this Infrastructure boundary, preserving cause and context.
      if (
        error.code === "E_EXECUTION_FAILED"
        && !error.classificationExplicit
      ) {
        const classification = classifyEngineFailure({
          message: error.message,
          context: error.context,
        });
        if (classification !== error.classification) {
          return new DownloadRuntimeError(
            error.code,
            error.message,
            {
              cause: error.cause,
              classification,
              context: error.context,
            },
          );
        }
      }
      return error;
    }

    if (aborted) {
      return new DownloadRuntimeError(
        "E_ABORTED",
        "Download cancelled",
        {
          cause: error,
          classification: "cancelled",
        },
      );
    }

    const message = summarizeError(error);
    return new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      message,
      {
        cause: error,
        classification: classifyEngineFailure({ message }),
      },
    );
  }

  private async recordDownloadTelemetry(
    traceId: string,
    telemetry: DownloadTelemetryContext,
    error: DownloadRuntimeError | null,
    compatibility?: VideoCompatibilityAnalysis | null,
  ): Promise<void> {
    await this.telemetrySink.record(createDownloadTelemetryEvent({
      traceId,
      request: telemetry.request,
      plan: telemetry.plan,
      chosenEngine: telemetry.chosenEngine,
      error,
      downloadProfile: resolveDownloadTelemetryProfile(telemetry.plan),
      compatibility,
      network: telemetry.network ?? null,
    }));
  }
}

export const createElectronDownloadRuntime = (
  options: ElectronDownloadRuntimeOptions,
): ElectronDownloadRuntime => new AmeowElectronDownloadRuntime(options);
