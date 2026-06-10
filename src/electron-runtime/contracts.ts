import type { AmeowAppEvent } from "../types/electronBridge.js";
import type {
  RuntimeDependencyGateStatePayload,
  RuntimeDependencyManagedComponent,
  RuntimeDependencyStatusEntry,
  RuntimeDependencyStatusSnapshot,
} from "../types/runtimeDependencies.js";
import type {
  QueuedVideoDownloadAck,
  VideoTranscodeQueueDetailPayload,
  VideoTranscodeQueueStatePayload,
  VideoQueueDetailPayload,
  VideoQueueStatePayload,
} from "../types/videoRuntime.js";
import type {
  DownloadRuntimeError,
  DownloadEngine,
  EngineId,
  EngineExecutionContext,
  RawDownloadInput,
  RuntimeBinaryPaths as CoreRuntimeBinaryPaths,
  ResolvedDownloadPlan,
  SiteProvider,
} from "../core/index.js";
import type { DownloadTelemetryEvent } from "../download-capabilities/telemetry.js";

export type RuntimeManagedComponent = RuntimeDependencyManagedComponent;

export type RuntimeEmitterEvent =
  | Extract<
      AmeowAppEvent,
      | "runtime-dependency-gate-state"
      | "video-download-complete"
      | "video-download-progress"
      | "video-queue-count"
      | "video-queue-detail"
      | "video-transcode-complete"
      | "video-transcode-failed"
      | "video-transcode-progress"
      | "video-transcode-queue-count"
      | "video-transcode-queue-detail"
      | "video-transcode-queued"
      | "video-transcode-removed"
      | "video-transcode-retried"
    >;

export interface RuntimeEventSink {
  emit<TPayload>(event: RuntimeEmitterEvent, payload: TPayload): void | Promise<void>;
}

export interface RuntimeConfigStore {
  readConfigString(): Promise<string>;
}

export interface RuntimeLogger {
  log(message: string): void;
}

export interface DownloadTelemetrySink {
  record(event: DownloadTelemetryEvent): Promise<void>;
}

export type RuntimeAuthFailureRecoveryContext = {
  traceId: string;
  request: RawDownloadInput;
  plan: ResolvedDownloadPlan | null;
  chosenEngine: EngineId | null;
  error: DownloadRuntimeError;
};

export type RuntimeAuthFailureRecoveryResult = {
  shouldRetry: boolean;
};

export type RuntimeNetworkProxyContext = {
  targetUrl: string;
  providerId: string | null;
  engineId: EngineId;
};

export type RuntimeNetworkProxyDiagnosticContext = RuntimeNetworkProxyContext;

export type RuntimeAdvancedQualitySiteSessionRefreshContext = {
  traceId: string;
  siteId: string;
  pageUrl?: string;
  url: string;
};

export interface ElectronRuntimeEnvironment {
  repoRoot: string;
  configDir: string;
  resourceDir?: string | null;
  executableDir?: string | null;
  desktopDir?: string | null;
  tempDir?: string | null;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  fetch?: typeof fetch;
}

export type RuntimeBinaryPaths = CoreRuntimeBinaryPaths;

export interface RuntimeBootstrapContext {
  missingComponents: RuntimeManagedComponent[];
  reason: string;
  environment: ElectronRuntimeEnvironment;
}

export interface ElectronDownloadRuntimeOptions {
  environment: ElectronRuntimeEnvironment;
  configStore: RuntimeConfigStore;
  eventSink: RuntimeEventSink;
  logger?: RuntimeLogger;
  telemetrySink?: DownloadTelemetrySink;
  maxConcurrent?: number;
  providers?: SiteProvider[];
  engines?: DownloadEngine[];
  buildExecutionContext?(
    context: EngineExecutionContext,
    input: RawDownloadInput,
  ): EngineExecutionContext;
  ensureEngineRuntimeReady?(
    engineId: EngineId,
    reason: string,
  ): Promise<void>;
  bootstrapManagedComponents?(
    context: RuntimeBootstrapContext,
  ): Promise<RuntimeDependencyStatusSnapshot | void>;
  handleAuthRequiredFailure?(
    context: RuntimeAuthFailureRecoveryContext,
  ): Promise<RuntimeAuthFailureRecoveryResult | void>;
  refreshSiteSessionBeforeAdvancedQualityProbe?(
    context: RuntimeAdvancedQualitySiteSessionRefreshContext,
  ): Promise<void>;
  resolveNetworkProxy?(
    context: RuntimeNetworkProxyContext,
  ): Promise<string | null | undefined>;
  diagnoseNetworkProxy?(
    context: RuntimeNetworkProxyDiagnosticContext,
  ): Promise<void>;
}

export interface RuntimeDependencyResolver {
  resolveStatus(): RuntimeDependencyStatusSnapshot;
  getGateState(): RuntimeDependencyGateStatePayload;
  refreshGateState(): RuntimeDependencyGateStatePayload;
  startBootstrap(reason: string): Promise<RuntimeDependencyGateStatePayload>;
  setManagedComponentStatus(
    component: RuntimeManagedComponent,
    status: RuntimeDependencyStatusEntry,
  ): void;
}

export interface ElectronDownloadRuntime {
  readonly maxConcurrent: number;
  getRuntimeDependencyStatus(): RuntimeDependencyStatusSnapshot;
  getRuntimeDependencyGateState(): RuntimeDependencyGateStatePayload;
  refreshRuntimeDependencyGateState(): RuntimeDependencyGateStatePayload;
  startRuntimeDependencyBootstrap(
    reason?: string,
  ): Promise<RuntimeDependencyGateStatePayload>;
  queueVideoDownload(
    request: RawDownloadInput,
  ): Promise<QueuedVideoDownloadAck>;
  selectAdvancedQualityOption(traceId: string, optionId: string): Promise<boolean>;
  cancelDownload(traceId: string): Promise<boolean>;
  cancelTranscode(traceId: string): Promise<boolean>;
  retryTranscode(traceId: string): Promise<boolean>;
  removeTranscode(traceId: string): Promise<boolean>;
  getQueueState(): VideoQueueStatePayload;
  getQueueDetail(): VideoQueueDetailPayload;
  getTranscodeQueueState(): VideoTranscodeQueueStatePayload;
  getTranscodeQueueDetail(): VideoTranscodeQueueDetailPayload;
}
