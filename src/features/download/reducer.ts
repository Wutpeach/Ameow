import {
  createInitialDownloadQueueState,
  MAX_TERMINAL_TOMBSTONES,
  type DownloadProgress,
  type DownloadQueueState,
  type DownloadStage,
  type DownloadTask,
  type DownloadTerminalOutcome,
} from "./model";

/**
 * The single Download lifecycle transition owner. All queue membership,
 * progress, cancel intent, quality-selection intent, and terminal transitions
 * flow through here. No protocol DTOs, no shell policy, no i18n.
 */

export type DownloadAction =
  | { type: "queueAccepted"; traceId: string }
  | { type: "queueCountReceived"; maxConcurrent: number }
  | { type: "queueDetailReceived"; tasks: DownloadTask[] }
  | { type: "progressReceived"; progress: DownloadProgress }
  | { type: "cancelRequested"; traceId: string }
  | { type: "cancelRequestRejected"; traceId: string }
  | { type: "qualitySelectionRequested"; traceId: string; optionId: string }
  | { type: "qualitySelectionRejected"; traceId: string; optionId: string }
  | { type: "terminalReceived"; outcome: DownloadTerminalOutcome }
  | { type: "reset" };

const STAGE_ORDER: Record<DownloadStage, number> = {
  preparing: 0,
  downloading: 1,
  merging: 2,
  post_processing: 3,
};

/** Progress stage never regresses (matches legacy renderer behavior). */
const advanceStage = (
  previous: DownloadStage | null,
  incoming: DownloadStage,
  percent: number,
): DownloadStage => {
  if (!previous) return incoming;
  if (incoming === previous) return previous;
  if (percent >= 0 && incoming === "preparing") return previous;
  return STAGE_ORDER[incoming] >= STAGE_ORDER[previous] ? incoming : previous;
};

const pruneTrace = (state: DownloadQueueState, traceId: string): DownloadQueueState => {
  if (
    !state.tasksById[traceId]
    && !state.progressByTrace[traceId]
    && !state.cancelling.includes(traceId)
    && !state.qualitySelecting[traceId]
  ) {
    return state;
  }
  const tasksById = { ...state.tasksById };
  delete tasksById[traceId];
  const progressByTrace = { ...state.progressByTrace };
  delete progressByTrace[traceId];
  const qualitySelecting = { ...state.qualitySelecting };
  delete qualitySelecting[traceId];
  return {
    ...state,
    tasksById,
    order: state.order.filter((id) => id !== traceId),
    progressByTrace,
    cancelling: state.cancelling.filter((id) => id !== traceId),
    qualitySelecting,
  };
};

const isTerminal = (state: DownloadQueueState, traceId: string): boolean =>
  state.terminalTraceIds.includes(traceId);

export const reduceDownloadQueue = (
  state: DownloadQueueState,
  action: DownloadAction,
): DownloadQueueState => {
  switch (action.type) {
    case "queueAccepted": {
      // Explicit new generation for a possibly reused trace: clear the
      // terminal guard and any stale per-trace interaction/progress. Ordinary
      // snapshots can never do this.
      if (!state.terminalTraceIds.includes(action.traceId)) {
        return state;
      }
      return {
        ...pruneTrace(state, action.traceId),
        terminalTraceIds: state.terminalTraceIds.filter((id) => id !== action.traceId),
      };
    }

    case "queueCountReceived": {
      const maxConcurrent = Number.isFinite(action.maxConcurrent)
        ? Math.max(1, Math.floor(action.maxConcurrent))
        : state.maxConcurrent;
      if (maxConcurrent === state.maxConcurrent) {
        return state;
      }
      return { ...state, maxConcurrent };
    }

    case "queueDetailReceived": {
      // Queue detail is a server snapshot input, not a competing visible
      // total. Terminal-guarded traces are never revived by stale detail, and
      // the snapshot order is authoritative for primary-task selection.
      const incoming = action.tasks.filter((task) => !isTerminal(state, task.traceId));
      if (incoming.length === 0 && state.order.length === 0) {
        return state;
      }
      const tasksById = { ...state.tasksById };
      const order: string[] = [];
      for (const task of incoming) {
        tasksById[task.traceId] = task;
        order.push(task.traceId);
      }
      let next: DownloadQueueState = { ...state, tasksById, order };
      // Remove tasks absent from the authoritative snapshot; this is a plain
      // removal and never synthesizes a terminal outcome.
      for (const existingId of state.order) {
        if (!order.includes(existingId)) {
          next = pruneTrace(next, existingId);
        }
      }
      return next;
    }

    case "progressReceived": {
      const { traceId } = action.progress;
      // Terminal guards and unknown traces reject late progress: a delayed
      // callback must never revive a finished or non-membership task.
      if (isTerminal(state, traceId) || !state.tasksById[traceId]) {
        return state;
      }
      const previous = state.progressByTrace[traceId];
      const stage = advanceStage(
        previous?.stage ?? null,
        action.progress.stage,
        action.progress.percent,
      );
      return {
        ...state,
        progressByTrace: {
          ...state.progressByTrace,
          [traceId]: { ...action.progress, stage },
        },
      };
    }

    case "cancelRequested": {
      if (isTerminal(state, action.traceId) || state.cancelling.includes(action.traceId)) {
        return state;
      }
      return { ...state, cancelling: [...state.cancelling, action.traceId] };
    }

    case "cancelRequestRejected": {
      if (!state.cancelling.includes(action.traceId)) {
        return state;
      }
      return {
        ...state,
        cancelling: state.cancelling.filter((id) => id !== action.traceId),
      };
    }

    case "qualitySelectionRequested": {
      // Per-trace in-flight guard: repeated clicks while one request is
      // pending are ignored.
      if (
        isTerminal(state, action.traceId)
        || state.qualitySelecting[action.traceId] !== undefined
      ) {
        return state;
      }
      return {
        ...state,
        qualitySelecting: {
          ...state.qualitySelecting,
          [action.traceId]: action.optionId,
        },
      };
    }

    case "qualitySelectionRejected": {
      if (state.qualitySelecting[action.traceId] !== action.optionId) {
        return state;
      }
      const qualitySelecting = { ...state.qualitySelecting };
      delete qualitySelecting[action.traceId];
      return { ...state, qualitySelecting };
    }

    case "terminalReceived": {
      // Typed terminal is authoritative and idempotent. It wins over local
      // cancel/quality intent and removes the trace from active state while
      // leaving a bounded tombstone behind.
      const { traceId } = action.outcome;
      if (isTerminal(state, traceId)) {
        return state;
      }
      const terminalTraceIds = [...state.terminalTraceIds, traceId]
        .slice(-MAX_TERMINAL_TOMBSTONES);
      return {
        ...pruneTrace(state, traceId),
        terminalTraceIds,
      };
    }

    case "reset":
      return createInitialDownloadQueueState();
  }
};
