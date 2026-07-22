import type { ErrorDiagnosticCopyRequest } from "../types/errorDiagnostics";

export type CenterOverlayOutcomeStatus = "success" | "error" | "cancelled";

export type CenterOverlayOutcomeSource = "download" | "transcode" | "image" | "folder";

export type CenterOverlayState =
  | { kind: "idle"; requestId: number }
  | { kind: "task-processing"; requestId: number; source: Exclude<CenterOverlayOutcomeSource, "folder"> }
  | {
      kind: "task-outcome-loading";
      requestId: number;
      source: Exclude<CenterOverlayOutcomeSource, "folder">;
      status: CenterOverlayOutcomeStatus;
      message: string | null;
      durationMs: number;
      diagnostic: ErrorDiagnosticCopyRequest | null;
    }
  | {
      kind: "task-outcome-visible";
      requestId: number;
      source: Exclude<CenterOverlayOutcomeSource, "folder">;
      status: CenterOverlayOutcomeStatus;
      message: string | null;
      durationMs: number;
      diagnostic: ErrorDiagnosticCopyRequest | null;
    }
  | {
      kind: "folder-outcome-visible";
      requestId: number;
      status: Extract<CenterOverlayOutcomeStatus, "success" | "error">;
      message: string | null;
      durationMs: number;
    };

export type CenterOverlayAction =
  | { type: "reset" }
  | { type: "dismissTransient" }
  | { type: "beginTaskProcessing"; source?: Exclude<CenterOverlayOutcomeSource, "folder"> }
  | {
      type: "beginTaskOutcomeLoading";
      source?: Exclude<CenterOverlayOutcomeSource, "folder">;
      status: CenterOverlayOutcomeStatus;
      message?: string | null;
      durationMs: number;
      diagnostic?: ErrorDiagnosticCopyRequest | null;
    }
  | { type: "showTaskOutcome"; requestId: number }
  | { type: "finishTaskOutcome"; requestId: number }
  | {
      type: "showFolderOutcome";
      status: Extract<CenterOverlayOutcomeStatus, "success" | "error">;
      message?: string | null;
      durationMs: number;
    }
  | { type: "finishFolderOutcome"; requestId: number };

const nextRequestId = (state: CenterOverlayState): number => state.requestId + 1;

export const createCenterOverlayState = (): CenterOverlayState => ({
  kind: "idle",
  requestId: 0,
});

export const reduceCenterOverlayState = (
  state: CenterOverlayState,
  action: CenterOverlayAction,
): CenterOverlayState => {
  switch (action.type) {
    case "reset":
    case "dismissTransient":
      return {
        kind: "idle",
        requestId: nextRequestId(state),
      };

    case "beginTaskProcessing":
      return {
        kind: "task-processing",
        requestId: nextRequestId(state),
        source: action.source ?? "image",
      };

    case "beginTaskOutcomeLoading":
      return {
        kind: "task-outcome-loading",
        requestId: nextRequestId(state),
        source: action.source ?? "download",
        status: action.status,
        message: action.message ?? null,
        durationMs: action.durationMs,
        diagnostic: action.diagnostic ?? null,
      };

    case "showTaskOutcome":
      if (state.kind !== "task-outcome-loading" || state.requestId !== action.requestId) {
        return state;
      }
      return {
        ...state,
        kind: "task-outcome-visible",
      };

    case "finishTaskOutcome":
      if (state.kind !== "task-outcome-visible" || state.requestId !== action.requestId) {
        return state;
      }
      return {
        kind: "idle",
        requestId: nextRequestId(state),
      };

    case "showFolderOutcome":
      return {
        kind: "folder-outcome-visible",
        requestId: nextRequestId(state),
        status: action.status,
        message: action.message ?? null,
        durationMs: action.durationMs,
      };

    case "finishFolderOutcome":
      if (state.kind !== "folder-outcome-visible" || state.requestId !== action.requestId) {
        return state;
      }
      return {
        kind: "idle",
        requestId: nextRequestId(state),
      };

    default:
      return state;
  }
};

export type CenterOverlayPrimaryTaskInput = {
  kind: "download" | "transcode";
  traceId?: string | null;
} | null;

export type CenterOverlayVisual =
  | { kind: "task-progress"; key: string }
  | { kind: "task-processing"; key: string; requestId: number }
  | {
      kind: "task-outcome";
      key: string;
      requestId: number;
      status: CenterOverlayOutcomeStatus;
      message: string | null;
      outcomeVisible: boolean;
      source: Exclude<CenterOverlayOutcomeSource, "folder">;
      diagnostic: ErrorDiagnosticCopyRequest | null;
    }
  | {
      kind: "folder-outcome";
      key: string;
      requestId: number;
      status: Extract<CenterOverlayOutcomeStatus, "success" | "error">;
      message: string | null;
    }
  | { kind: "minimized"; key: string }
  | { kind: "none"; key: string };

export const isCenterOverlayLockActive = (state: CenterOverlayState): boolean => (
  state.kind === "task-processing"
  || state.kind === "task-outcome-loading"
  || state.kind === "task-outcome-visible"
  || state.kind === "folder-outcome-visible"
);

export const isCenterOverlayTaskOutcomeVisible = (state: CenterOverlayState): boolean => (
  state.kind === "task-outcome-visible"
);

export const selectCenterOverlayVisual = ({
  primaryTask,
  centerOverlayState,
  visualIsMinimized,
}: {
  primaryTask: CenterOverlayPrimaryTaskInput;
  centerOverlayState: CenterOverlayState;
  visualIsMinimized: boolean;
}): CenterOverlayVisual => {
  if (primaryTask) {
    return {
      kind: "task-progress",
      key: `progress:${primaryTask.kind}:${primaryTask.traceId ?? "unknown"}`,
    };
  }

  if (centerOverlayState.kind === "task-processing") {
    return {
      kind: "task-processing",
      key: `task-processing:${centerOverlayState.requestId}`,
      requestId: centerOverlayState.requestId,
    };
  }

  if (
    centerOverlayState.kind === "task-outcome-loading"
    || centerOverlayState.kind === "task-outcome-visible"
  ) {
    return {
      kind: "task-outcome",
      key: `task-outcome:${centerOverlayState.requestId}`,
      requestId: centerOverlayState.requestId,
      status: centerOverlayState.status,
      message: centerOverlayState.message,
      outcomeVisible: centerOverlayState.kind === "task-outcome-visible",
      source: centerOverlayState.source,
      diagnostic: centerOverlayState.diagnostic,
    };
  }

  if (centerOverlayState.kind === "folder-outcome-visible") {
    return {
      kind: "folder-outcome",
      key: `folder-outcome:${centerOverlayState.requestId}`,
      requestId: centerOverlayState.requestId,
      status: centerOverlayState.status,
      message: centerOverlayState.message,
    };
  }

  if (visualIsMinimized) {
    return {
      kind: "minimized",
      key: "minimized",
    };
  }

  return {
    kind: "none",
    key: "none",
  };
};
