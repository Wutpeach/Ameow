import type { RuntimeFailureDiagnostic } from "../../types/errorDiagnostics";

/**
 * Renderer-owned Download + Download Queue lifecycle model.
 *
 * This is the feature's long-lived business state: queue membership, progress,
 * per-trace interaction state, and the terminal tombstone guard. Protocol DTOs
 * are decoded at the client boundary and never become this model. This module
 * must not import `src/protocol`, Electron, or desktop runtime modules.
 */

export type DownloadTaskStatus = "active" | "pending";

export type DownloadTaskPhase = "downloading" | "probing_quality" | "selecting_quality";

export type DownloadStage = "preparing" | "downloading" | "merging" | "post_processing";

export type AdvancedQualityPostProcessPlan =
  | "none"
  | "remux_only"
  | "audio_transcode"
  | "full_transcode"
  | "unknown";

export type DownloadProgress = {
  traceId: string;
  percent: number;
  stage: DownloadStage;
  speed: string;
  eta: string;
};

export type AdvancedQualityOption = {
  id: string;
  label: string;
  tags?: string[];
  postProcessPlan?: AdvancedQualityPostProcessPlan;
};

export type DownloadTask = {
  traceId: string;
  label: string;
  videoTitle?: string;
  status: DownloadTaskStatus;
  phase: DownloadTaskPhase | null;
  qualityOptions?: AdvancedQualityOption[];
};

export type DownloadTerminalKind = "success" | "failure" | "cancelled";

/** Typed terminal outcome. `failure` carries stable code/classification from
 * the Application; `errorSummary` is a bounded user-visible text fallback. */
export type DownloadTerminalOutcome = {
  kind: DownloadTerminalKind;
  traceId: string;
  errorSummary: string | null;
  failure?: RuntimeFailureDiagnostic | null;
};

/**
 * One lifecycle owner for queue membership, progress, cancel intent, and
 * advanced-quality selection intent. Counts, primary task, rows, and badge are
 * selector-derived; `maxConcurrent` is capacity/consistency input only.
 *
 * `terminalTraceIds` is a bounded tombstone guard: a terminal trace is
 * recorded here before it is removed from active state, so delayed progress
 * and stale queue detail cannot revive it. Only an explicit queue acceptance
 * for a reused trace clears the guard (new generation).
 */
export type DownloadQueueState = {
  tasksById: Record<string, DownloadTask>;
  order: string[];
  maxConcurrent: number;
  progressByTrace: Record<string, DownloadProgress>;
  /** Trace IDs with an in-flight optimistic cancel request. */
  cancelling: string[];
  /** traceId -> optionId currently being submitted. */
  qualitySelecting: Record<string, string>;
  terminalTraceIds: string[];
};

// ponytail: bounded tombstone list; trace IDs are session-unique UUIDs so a
// fixed cap is sufficient. If trace reuse ever becomes legitimate at scale,
// switch to an explicit per-trace generation counter.
export const MAX_TERMINAL_TOMBSTONES = 128;

export const createInitialDownloadQueueState = (): DownloadQueueState => ({
  tasksById: {},
  order: [],
  maxConcurrent: 1,
  progressByTrace: {},
  cancelling: [],
  qualitySelecting: {},
  terminalTraceIds: [],
});
