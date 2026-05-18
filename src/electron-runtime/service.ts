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
import type {
  DownloadResultPayload,
  DownloadProgressPayload,
  QueuedVideoDownloadAck,
  VideoTranscodeCompletePayload,
  VideoTranscodeQueueDetailPayload,
  VideoTranscodeQueueStatePayload,
  VideoTranscodeStage,
  VideoTranscodeTaskPayload,
  VideoQueueDetailPayload,
  VideoQueueStatePayload,
} from "../types/videoRuntime.js";
import type {
  EngineExecutionContext,
  EnginePlan,
  RawDownloadInput,
  ResolvedDownloadPlan,
} from "../core/index.js";
import { builtinEngines, createEngineRegistry } from "../engines/index.js";
import { DownloadOrchestrator } from "../orchestration/download-orchestrator.js";
import { loadBuiltinProviders } from "../sites/provider-loader.js";
import { createSiteRegistry } from "../sites/site-registry.js";
import {
  prepareVideoTranscodeTaskFromDownload,
  runPreparedVideoTranscodeTask,
  type PreparedVideoTranscodeTask,
} from "./transcode.js";
import { resolveShortLinkDownloadInput } from "./shortLinkResolution.js";
import { resolveXiaohongshuPageHints } from "./xiaohongshuPageHints.js";
import {
  createDownloadTelemetryEvent,
  createDownloadTelemetrySink,
  type DownloadTelemetrySink,
} from "./downloadTelemetry.js";
import { DownloadRuntimeError } from "../core/index.js";

type PendingTask = {
  traceId: string;
  label: string;
  request: RawDownloadInput;
};

type ActiveTask = PendingTask & {
  abortController: AbortController;
};

type TranscodeTaskState = PreparedVideoTranscodeTask & {
  status: "pending" | "active" | "failed";
  stage: VideoTranscodeStage | null;
  progressPercent: number | null;
  etaSeconds: number | null;
  error: string | null;
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

const EARLY_VIDEO_ACTIVITY_PAYLOAD = {
  percent: -1,
  stage: "preparing" as const,
  speed: "Resolving media...",
  eta: "",
};

const formatElapsedMs = (startedAtMs: number): string => `${Date.now() - startedAtMs}ms`;

export class AmeowElectronDownloadRuntime implements ElectronDownloadRuntime {
  readonly maxConcurrent: number;

  private readonly options: ElectronDownloadRuntimeOptions;
  private readonly logger;
  private readonly pending: PendingTask[] = [];
  private readonly active = new Map<string, ActiveTask>();
  private readonly reservedOutputStems = new Map<string, string>();
  private outputStemReservationLock: Promise<void> = Promise.resolve();
  private readonly pendingTranscodes: TranscodeTaskState[] = [];
  private readonly failedTranscodes: TranscodeTaskState[] = [];
  private activeTranscode: TranscodeTaskState | null = null;
  private transcodePumpScheduled = false;
  private readonly resolver;
  private readonly orchestrator: DownloadOrchestrator;
  private readonly siteRegistry;
  private readonly telemetrySink: DownloadTelemetrySink;

  constructor(options: ElectronDownloadRuntimeOptions) {
    this.options = options;
    this.maxConcurrent = options.maxConcurrent ?? 3;
    this.logger = options.logger ?? NOOP_LOGGER;
    const providers = options.providers ?? loadBuiltinProviders();
    const engines = options.engines ?? builtinEngines();
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
    const activeCount = this.active.size;
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
    const traceId = nextDownloadTraceId();
    this.pending.push({
      traceId,
      label: queueTaskLabel(request),
      request,
    });
    await this.emitQueueState();
    void this.pumpQueue();
    return {
      accepted: true,
      traceId,
    };
  }

  async cancelDownload(traceId: string): Promise<boolean> {
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
        cancelledTask.request,
        this.siteRegistry.resolve(cancelledTask.request),
        null,
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
    return this.active.size > 0 || this.pending.length > 0;
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

  private async enqueuePreparedTranscodeTask(task: PreparedVideoTranscodeTask): Promise<void> {
    const alreadyPresent = this.pendingTranscodes.some((existing) => existing.traceId === task.traceId)
      || this.failedTranscodes.some((existing) => existing.traceId === task.traceId)
      || this.activeTranscode?.traceId === task.traceId;
    if (alreadyPresent) {
      return;
    }

    const pendingTask: TranscodeTaskState = {
      ...task,
      status: "pending",
      stage: null,
      progressPercent: null,
      etaSeconds: null,
      error: null,
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
    providerId: string,
    engineId: EnginePlan["engine"],
    binaries: ReturnType<typeof resolveRuntimeBinaryPaths>,
  ): Promise<void> {
    try {
      if (providerId === "xiaohongshu" && engineId === "direct") {
        this.logger.log(
          `>>> [ElectronRuntime] skipping transcode follow-up for ${traceId}: xiaohongshu direct asset`,
        );
        return;
      }

      const prepared = await prepareVideoTranscodeTaskFromDownload({
        traceId,
        label,
        sourcePath,
        ffprobePath: binaries.ffprobe,
        ffmpegPath: binaries.ffmpeg,
      });
      if (!prepared) {
        return;
      }
      await this.enqueuePreparedTranscodeTask(prepared);
    } catch (error) {
      this.logger.log(
        `>>> [ElectronRuntime] transcode follow-up for ${traceId} failed: ${summarizeError(error)}`,
      );
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
      const nextFailedTask: TranscodeTaskState = {
        ...failedTask,
        status: "failed",
        stage: "failed",
        progressPercent: null,
        etaSeconds: null,
        error: errorMessage,
        abortController: undefined,
      };
      this.failedTranscodes.push(nextFailedTask);
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

    let outputDir: string | null = null;
    let telemetryPlan: ResolvedDownloadPlan | null = null;
    let executedProviderId: string | null = null;
    let executedEngineId: EnginePlan["engine"] | null = null;
    try {
      const config = parseJsonObject(await this.options.configStore.readConfigString());
      const resolvedOutputDir = resolveOutputDir(this.options.environment, config);
      outputDir = resolvedOutputDir;
      const binaries = resolveRuntimeBinaryPaths(this.options.environment);
      await this.options.eventSink.emit("video-download-progress", {
        traceId,
        ...EARLY_VIDEO_ACTIVITY_PAYLOAD,
      });
      const preShortLinkRequest = activeTask.request;
      activeTask.request = await resolveShortLinkDownloadInput(
        activeTask.request,
        this.options.environment.fetch ?? globalThis.fetch,
        this.options.environment.resolveUrlViaNavigation,
      );
      if (
        activeTask.request.url !== preShortLinkRequest.url
        || activeTask.request.pageUrl !== preShortLinkRequest.pageUrl
      ) {
        this.logger.log(
          `>>> [ElectronRuntime] expanded short link for ${traceId}: ${preShortLinkRequest.url} -> ${activeTask.request.url}`,
        );
      }
      activeTask.request = await resolveXiaohongshuPageHints(
        activeTask.request,
        this.options.environment.fetch ?? globalThis.fetch,
      );
      telemetryPlan = this.siteRegistry.resolve(activeTask.request);
      this.logger.log(`>>> [ElectronRuntimeTiming] task pre-engine complete: ${JSON.stringify({
        traceId,
        elapsedMs: formatElapsedMs(taskStartedAtMs),
        providerId: telemetryPlan?.providerId ?? null,
        engineCandidates: telemetryPlan?.engines.map((plan) => plan.engine) ?? [],
      })}`);
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
      let result = await this.orchestrator.execute(
        activeTask.request,
        (plan: ResolvedDownloadPlan, enginePlan: EnginePlan) => {
          executedProviderId = plan.providerId;
          executedEngineId = enginePlan.engine;
          this.logger.log(`>>> [ElectronRuntime] engine dispatch: ${JSON.stringify({
            traceId,
            providerId: plan.providerId,
            engine: enginePlan.engine,
            sourceUrl: enginePlan.sourceUrl ?? null,
            reason: enginePlan.reason,
            when: enginePlan.when,
          })}`);
          const context: EngineExecutionContext = {
            traceId,
            plan,
            enginePlan,
            intent: plan.intent,
            outputDir: resolvedOutputDir,
            outputStem,
            config,
            binaries,
            abortSignal: activeTask.abortController.signal,
            fetch: this.options.environment.fetch,
            onProgress: async (payload: DownloadProgressPayload) => {
              await this.options.eventSink.emit("video-download-progress", payload);
            },
          };
          return this.options.buildExecutionContext
            ? this.options.buildExecutionContext(context, activeTask.request)
            : context;
        },
      );
      this.logger.log(`>>> [ElectronRuntimeTiming] task engine complete: ${JSON.stringify({
        traceId,
        elapsedMs: formatElapsedMs(taskStartedAtMs),
        providerId: executedProviderId ?? telemetryPlan?.providerId ?? null,
        engineId: executedEngineId ?? null,
        success: result.success,
        filePathPresent: Boolean(result.file_path),
      })}`);
      if (
        result.success
        && result.file_path
        && executedEngineId === "yt-dlp"
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
      if (result.success && result.file_path && executedEngineId === "gallery-dl") {
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
      await this.options.eventSink.emit("video-download-complete", result);
      this.logger.log(`>>> [ElectronRuntimeTiming] task complete event emitted: ${JSON.stringify({
        traceId,
        elapsedMs: formatElapsedMs(taskStartedAtMs),
        success: result.success,
      })}`);
      await this.recordDownloadTelemetry(
        traceId,
        activeTask.request,
        telemetryPlan,
        executedEngineId,
        null,
      );
      if (result.success && result.file_path) {
        void this.handleCompletedVideoSource(
          traceId,
          activeTask.label,
          result.file_path,
          executedProviderId ?? "generic",
          executedEngineId ?? "yt-dlp",
          binaries,
        );
      }
    } catch (error) {
      const runtimeError = this.toTaskRuntimeError(error, activeTask.abortController.signal.aborted);
      this.logger.log(`>>> [ElectronRuntime] task ${traceId} failed: ${runtimeError.message}`);
      this.logger.log(`>>> [ElectronRuntimeTiming] task failed: ${JSON.stringify({
        traceId,
        elapsedMs: formatElapsedMs(taskStartedAtMs),
        error: runtimeError.message,
      })}`);
      await this.recordDownloadTelemetry(
        traceId,
        activeTask.request,
        telemetryPlan,
        executedEngineId,
        runtimeError,
      );
      await this.options.eventSink.emit("video-download-complete", {
        traceId,
        success: false,
        error: runtimeError.message,
      } satisfies DownloadResultPayload);
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
  }

  private toTaskRuntimeError(
    error: unknown,
    aborted: boolean,
  ): DownloadRuntimeError {
    if (error instanceof DownloadRuntimeError) {
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

    return new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      summarizeError(error),
      {
        cause: error,
      },
    );
  }

  private async recordDownloadTelemetry(
    traceId: string,
    request: RawDownloadInput,
    plan: ResolvedDownloadPlan | null,
    chosenEngine: EnginePlan["engine"] | null,
    error: DownloadRuntimeError | null,
  ): Promise<void> {
    await this.telemetrySink.record(createDownloadTelemetryEvent({
      traceId,
      request,
      plan,
      chosenEngine,
      error,
    }));
  }
}

export const createElectronDownloadRuntime = (
  options: ElectronDownloadRuntimeOptions,
): ElectronDownloadRuntime => new AmeowElectronDownloadRuntime(options);
