import type { ElectronDownloadRuntime } from "../src/electron-runtime/index.js";
import type { AmeowRendererCommand } from "../src/types/electronBridge.js";

/**
 * Operational download-adjacent command bridge: transcode operations, runtime
 * dependency queries and downloader version/info. Ordinary download commands
 * (queue/cancel/advanced-quality selection) are owned by
 * `downloadIpcAdapter.mts` through the protocol-neutral DownloadApplicationApi.
 */

type CommandPayload = Record<string, unknown> | undefined;

export type VideoDownloadCommandBridge = {
  supports(command: AmeowRendererCommand): boolean;
  invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult>;
};

export type VideoDownloadCommandBridgeOptions = {
  runtime: ElectronDownloadRuntime;
  getRuntimeDependencyStatus(): unknown;
  getRuntimeDependencyGateState(): unknown;
  refreshRuntimeDependencyGateState(): unknown;
  startRuntimeDependencyBootstrap(reason?: string): Promise<unknown>;
  checkYtdlpVersion(): Promise<unknown>;
  getGalleryDlInfo(): Promise<unknown>;
};

const supportedCommands = new Set<AmeowRendererCommand>([
  "cancel_transcode",
  "check_ytdlp_version",
  "get_gallery_dl_info",
  "get_runtime_dependency_gate_state",
  "get_runtime_dependency_status",
  "refresh_runtime_dependency_gate_state",
  "remove_transcode",
  "retry_transcode",
  "start_runtime_dependency_bootstrap",
]);

const asObject = (payload: CommandPayload): Record<string, unknown> => (
  payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload
    : {}
);

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeTraceId = (payload: CommandPayload): string => (
  normalizeOptionalString(asObject(payload).traceId ?? asObject(payload).trace_id) ?? ""
);

export const createVideoDownloadCommandBridge = (
  options: VideoDownloadCommandBridgeOptions,
): VideoDownloadCommandBridge => ({
  supports(command) {
    return supportedCommands.has(command);
  },

  async invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult> {
    switch (command) {
      case "cancel_transcode":
        return await options.runtime.cancelTranscode(normalizeTraceId(payload)) as TResult;
      case "retry_transcode":
        return await options.runtime.retryTranscode(normalizeTraceId(payload)) as TResult;
      case "remove_transcode":
        return await options.runtime.removeTranscode(normalizeTraceId(payload)) as TResult;
      case "check_ytdlp_version":
        return await options.checkYtdlpVersion() as TResult;
      case "get_gallery_dl_info":
        return await options.getGalleryDlInfo() as TResult;
      case "get_runtime_dependency_status":
        return options.getRuntimeDependencyStatus() as TResult;
      case "get_runtime_dependency_gate_state":
        return options.getRuntimeDependencyGateState() as TResult;
      case "refresh_runtime_dependency_gate_state":
        return options.refreshRuntimeDependencyGateState() as TResult;
      case "start_runtime_dependency_bootstrap":
        return await options.startRuntimeDependencyBootstrap(
          normalizeOptionalString(asObject(payload).reason),
        ) as TResult;
      default:
        throw new Error(`Unsupported video download command: ${command}`);
    }
  },
});
