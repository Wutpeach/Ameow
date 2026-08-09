import type { DownloadResultPayload, DownloadProgressPayload } from "../../types/videoRuntime.js";
import type { DownloadRuntimeError } from "../errors/download-runtime-error.js";
import type {
  NetworkFailureClassification,
  NetworkRouteResolution,
} from "../../config/networkRoute.js";
import type { DownloadIntent } from "./download-intent.js";
import type { EngineId, EnginePlan, ResolvedDownloadPlan } from "./engine-plan.js";
import type { RuntimeBinaryPaths } from "./runtime-binaries.js";

/** Actual per-attempt route application outcome reported by an engine. */
export type NetworkApplicationOutcome = {
  engine: "yt-dlp" | "gallery-dl";
  appliedToEngine: boolean;
  reason: string;
  failureClassification: NetworkFailureClassification | null;
};

export type EngineExecutionContext = {
  traceId: string;
  plan: ResolvedDownloadPlan;
  enginePlan: EnginePlan;
  intent: DownloadIntent;
  outputDir: string;
  outputStem: string;
  config: Record<string, unknown>;
  userDataDir?: string;
  /**
   * The stable per-job network resolution. One resolution per queued Job,
   * reused across engine retry, engine fallback, and auth recovery. Engines
   * consume the route exclusively through their network adapters.
   */
  network?: NetworkRouteResolution;
  /**
   * Reports the route application outcome for this engine attempt (applied or
   * rejected before spawn). The runtime uses it to attach the actual engine
   * and applied/not-applied result to per-download diagnostics; it never
   * re-resolves the route.
   */
  onNetworkApplication?(application: NetworkApplicationOutcome): void | Promise<void>;
  binaries: RuntimeBinaryPaths;
  abortSignal: AbortSignal;
  fetch?: typeof fetch;
  reportNetworkProxyFailure?(error: unknown): void | Promise<void>;
  onProgress(payload: DownloadProgressPayload): void | Promise<void>;
};

export interface DownloadEngine {
  readonly id: EngineId;
  validateIntent(intent: DownloadIntent, plan: EnginePlan): DownloadRuntimeError | null;
  execute(context: EngineExecutionContext): Promise<DownloadResultPayload>;
}
