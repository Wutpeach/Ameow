import type {
  DownloadProgressPayload,
  DownloadResultPayload,
  VideoQueueDetailPayload,
  VideoQueueStatePayload,
  VideoTranscodeCompletePayload,
  VideoTranscodeQueueDetailPayload,
  VideoTranscodeQueueStatePayload,
  VideoTranscodeTaskPayload,
} from "../types/videoRuntime";
import {
  advanceDownloadStage,
  normalizeVideoQueueDetail,
  normalizeVideoQueueState,
  normalizeVideoTranscodeQueueState,
  normalizeVideoTranscodeTask,
  removeVideoTranscodeTask,
  upsertVideoTranscodeTask,
} from "./downloadViewHelpers";

export type DownloadProgressByTrace = Record<string, DownloadProgressPayload>;
export type TranscodeProgressByTrace = Record<string, VideoTranscodeTaskPayload>;

export type DownloadCompleteOutcome = {
  success: boolean;
  cancelled: boolean;
  errorSummary: string | null;
};

export const isCancelledDownloadError = (error?: string | null): boolean => {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return normalized.includes("cancelled") || normalized.includes("canceled");
};

export const summarizeDownloadError = (error?: string | null): string | null => {
  if (!error) return null;
  const summary = error
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!summary) return null;
  return summary.length > 96 ? `${summary.slice(0, 93)}...` : summary;
};

export const applyDownloadProgressEvent = (
  current: DownloadProgressByTrace,
  payload: DownloadProgressPayload,
): DownloadProgressByTrace => {
  const previous = current[payload.traceId];
  const nextStage = advanceDownloadStage(previous?.stage ?? null, payload.stage, payload.percent);

  return {
    ...current,
    [payload.traceId]: {
      ...payload,
      stage: nextStage,
    },
  };
};

export const removeDownloadProgressTrace = (
  current: DownloadProgressByTrace,
  traceId: string,
): DownloadProgressByTrace => {
  if (!current[traceId]) {
    return current;
  }

  const next = { ...current };
  delete next[traceId];
  return next;
};

export const resolveDownloadCompleteOutcome = (
  payload: DownloadResultPayload,
  isCancelling: boolean,
): DownloadCompleteOutcome => {
  const cancelled = isCancelling || isCancelledDownloadError(payload.error);
  const success = Boolean(payload.success) && !cancelled;

  return {
    success,
    cancelled,
    errorSummary: summarizeDownloadError(payload.error),
  };
};

export const applyVideoQueueStateEvent = (
  payload: Partial<VideoQueueStatePayload> | null | undefined,
): {
  state: VideoQueueStatePayload;
  shouldClearCancellingTraceIds: boolean;
} => {
  const state = normalizeVideoQueueState(payload);

  return {
    state,
    shouldClearCancellingTraceIds: state.totalCount === 0,
  };
};

export const applyVideoQueueDetailEvent = (
  currentProgress: DownloadProgressByTrace,
  currentCancellingTraceIds: string[],
  payload: Partial<VideoQueueDetailPayload> | null | undefined,
): {
  detail: VideoQueueDetailPayload;
  progressByTrace: DownloadProgressByTrace;
  cancellingTraceIds: string[];
} => {
  const detail = normalizeVideoQueueDetail(payload);
  const liveTraceIds = new Set(detail.tasks.map((task) => task.traceId));
  const nextProgressEntries = Object.entries(currentProgress)
    .filter(([traceId]) => liveTraceIds.has(traceId));
  const progressByTrace = nextProgressEntries.length === Object.keys(currentProgress).length
    ? currentProgress
    : Object.fromEntries(nextProgressEntries);
  const cancellingTraceIds = currentCancellingTraceIds
    .filter((traceId) => liveTraceIds.has(traceId));

  return {
    detail,
    progressByTrace,
    cancellingTraceIds: cancellingTraceIds.length === currentCancellingTraceIds.length
      ? currentCancellingTraceIds
      : cancellingTraceIds,
  };
};

export const normalizeVideoQueueDetailEvent = (
  payload: Partial<VideoQueueDetailPayload> | null | undefined,
): VideoQueueDetailPayload => normalizeVideoQueueDetail(payload);

export const pruneDownloadProgressToQueueDetail = (
  currentProgress: DownloadProgressByTrace,
  detail: VideoQueueDetailPayload,
): DownloadProgressByTrace => {
  const liveTraceIds = new Set(detail.tasks.map((task) => task.traceId));
  const nextProgressEntries = Object.entries(currentProgress)
    .filter(([traceId]) => liveTraceIds.has(traceId));

  return nextProgressEntries.length === Object.keys(currentProgress).length
    ? currentProgress
    : Object.fromEntries(nextProgressEntries);
};

export const pruneCancellingTraceIdsToQueueDetail = (
  currentCancellingTraceIds: string[],
  detail: VideoQueueDetailPayload,
): string[] => {
  const liveTraceIds = new Set(detail.tasks.map((task) => task.traceId));
  const cancellingTraceIds = currentCancellingTraceIds
    .filter((traceId) => liveTraceIds.has(traceId));

  return cancellingTraceIds.length === currentCancellingTraceIds.length
    ? currentCancellingTraceIds
    : cancellingTraceIds;
};

export const applyVideoTranscodeQueueStateEvent = (
  payload: Partial<VideoTranscodeQueueStatePayload> | null | undefined,
  currentProgress: TranscodeProgressByTrace,
): {
  state: VideoTranscodeQueueStatePayload;
  progressByTrace: TranscodeProgressByTrace;
} => {
  const state = normalizeVideoTranscodeQueueState(payload);

  return {
    state,
    progressByTrace: state.activeCount === 0 && Object.keys(currentProgress).length > 0
      ? {}
      : currentProgress,
  };
};

export const clearTranscodeProgressWhenInactive = (
  state: VideoTranscodeQueueStatePayload,
  currentProgress: TranscodeProgressByTrace,
): TranscodeProgressByTrace => (
  state.activeCount === 0 && Object.keys(currentProgress).length > 0
    ? {}
    : currentProgress
);

export const applyTranscodeProgressEvent = (
  currentProgress: TranscodeProgressByTrace,
  currentDetail: VideoTranscodeQueueDetailPayload,
  payload: Partial<VideoTranscodeTaskPayload> | null | undefined,
): {
  progressByTrace: TranscodeProgressByTrace;
  detail: VideoTranscodeQueueDetailPayload;
} | null => {
  const normalized = normalizeVideoTranscodeTask(payload);
  if (!normalized) {
    return null;
  }

  return applyNormalizedTranscodeProgressEvent(currentProgress, currentDetail, normalized);
};

export const applyNormalizedTranscodeProgressEvent = (
  currentProgress: TranscodeProgressByTrace,
  currentDetail: VideoTranscodeQueueDetailPayload,
  normalized: VideoTranscodeTaskPayload,
): {
  progressByTrace: TranscodeProgressByTrace;
  detail: VideoTranscodeQueueDetailPayload;
} => {
  const activeTask: VideoTranscodeTaskPayload = {
    ...normalized,
    status: "active",
  };

  return {
    progressByTrace: {
      ...currentProgress,
      [activeTask.traceId]: activeTask,
    },
    detail: {
      tasks: upsertVideoTranscodeTask(currentDetail.tasks, activeTask),
    },
  };
};

const toActiveTranscodeTask = (
  normalized: VideoTranscodeTaskPayload,
): VideoTranscodeTaskPayload => ({
  ...normalized,
  status: "active",
});

export const applyNormalizedTranscodeProgressToMap = (
  currentProgress: TranscodeProgressByTrace,
  normalized: VideoTranscodeTaskPayload,
): TranscodeProgressByTrace => {
  const activeTask = toActiveTranscodeTask(normalized);

  return {
    ...currentProgress,
    [activeTask.traceId]: activeTask,
  };
};

export const applyNormalizedTranscodeProgressToDetail = (
  currentDetail: VideoTranscodeQueueDetailPayload,
  normalized: VideoTranscodeTaskPayload,
): VideoTranscodeQueueDetailPayload => ({
  tasks: upsertVideoTranscodeTask(currentDetail.tasks, toActiveTranscodeTask(normalized)),
});

export const upsertTranscodeTaskToDetail = (
  currentDetail: VideoTranscodeQueueDetailPayload,
  normalized: VideoTranscodeTaskPayload,
): VideoTranscodeQueueDetailPayload => ({
  tasks: upsertVideoTranscodeTask(currentDetail.tasks, normalized),
});

export const applyTranscodeCompleteEvent = (
  currentProgress: TranscodeProgressByTrace,
  currentDetail: VideoTranscodeQueueDetailPayload,
  payload: VideoTranscodeCompletePayload,
): {
  progressByTrace: TranscodeProgressByTrace;
  detail: VideoTranscodeQueueDetailPayload;
} => ({
  progressByTrace: removeTranscodeProgressTrace(currentProgress, payload.traceId),
  detail: {
    tasks: removeVideoTranscodeTask(currentDetail.tasks, payload.traceId),
  },
});

export const removeTranscodeProgressTrace = (
  current: TranscodeProgressByTrace,
  traceId: string,
): TranscodeProgressByTrace => {
  if (!current[traceId]) {
    return current;
  }

  const next = { ...current };
  delete next[traceId];
  return next;
};

export const summarizeTranscodeFailureError = summarizeDownloadError;

export const removeTranscodeTaskFromDetail = (
  currentDetail: VideoTranscodeQueueDetailPayload,
  traceId: string,
): VideoTranscodeQueueDetailPayload => ({
  tasks: removeVideoTranscodeTask(currentDetail.tasks, traceId),
});
