import type {
  DownloadProgress,
  DownloadQueueState,
  DownloadStage,
  DownloadTask,
} from "./model";

/**
 * Pure selectors over the Download lifecycle state. All visible totals,
 * primary task, queue rows, and per-trace view state are derived here from the
 * single reducer owner; nothing is stored as a competing snapshot. View text
 * mapping (i18n) stays in the shell; lifecycle-to-display facts live here.
 */

export const selectVisibleTaskCount = (state: DownloadQueueState): number => state.order.length;

export const selectDownloadQueueRows = (state: DownloadQueueState): DownloadTask[] =>
  state.order.map((traceId) => state.tasksById[traceId]);

export const selectActiveDownloadQueueTasks = (state: DownloadQueueState): DownloadTask[] =>
  selectDownloadQueueRows(state).filter((task) => task.status === "active");

export const selectPrimaryDownloadTask = (state: DownloadQueueState): DownloadTask | null =>
  selectActiveDownloadQueueTasks(state)[0] ?? null;

const SYNTHETIC_PREPARING_PROGRESS: Omit<DownloadProgress, "traceId"> = {
  percent: -1,
  stage: "preparing",
  speed: "Resolving media...",
  eta: "",
};

/**
 * Primary task progress view. Probing/selecting-quality phases render as an
 * indeterminate "preparing" state; otherwise the live progress is used, with
 * the same synthetic fallback before the first progress event.
 */
export const selectPrimaryDownloadProgress = (
  state: DownloadQueueState,
): DownloadProgress | null => {
  const task = selectPrimaryDownloadTask(state);
  if (!task) {
    return null;
  }
  const phaseSynthetic =
    task.phase === "probing_quality" || task.phase === "selecting_quality";
  const progress = phaseSynthetic ? null : state.progressByTrace[task.traceId];
  return {
    traceId: task.traceId,
    ...(progress ?? SYNTHETIC_PREPARING_PROGRESS),
  };
};

export const selectPrimaryDownloadStage = (
  state: DownloadQueueState,
): DownloadStage | null => selectPrimaryDownloadProgress(state)?.stage ?? null;

export const selectRemainingDownloadCount = (
  state: DownloadQueueState,
  primaryIsDownload: boolean,
): number => Math.max(0, selectVisibleTaskCount(state) - (primaryIsDownload ? 1 : 0));

export const selectAdvancedQualitySelectionTask = (
  state: DownloadQueueState,
): DownloadTask | null =>
  selectDownloadQueueRows(state).find((task) => (
    task.phase === "selecting_quality" && Boolean(task.qualityOptions?.length)
  )) ?? null;

export const selectIsTaskCancelling = (
  state: DownloadQueueState,
  traceId: string,
): boolean => state.cancelling.includes(traceId);

export const selectIsTaskQualitySelecting = (
  state: DownloadQueueState,
  traceId: string,
): boolean => state.qualitySelecting[traceId] !== undefined;

export const selectTaskProgress = (
  state: DownloadQueueState,
  traceId: string,
): DownloadProgress | null => state.progressByTrace[traceId] ?? null;

/** Queue-row progress percent, preserving legacy per-phase display values. */
export const selectTaskProgressPercent = (
  state: DownloadQueueState,
  task: DownloadTask,
): number => {
  if (task.phase === "selecting_quality") {
    return 100;
  }
  if (task.phase === "probing_quality") {
    return 18;
  }
  if (task.status !== "active") {
    return 8;
  }
  const progress = state.progressByTrace[task.traceId];
  if (!progress || progress.percent < 0) {
    return 18;
  }
  return Math.max(8, Math.min(100, progress.percent));
};
