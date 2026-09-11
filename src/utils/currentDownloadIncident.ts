import type { ErrorDiagnosticCopyRequest } from "../types/errorDiagnostics";

export type CurrentDownloadIncident = Readonly<{
  request: ErrorDiagnosticCopyRequest;
  generation: number;
}>;

export type CurrentDownloadIncidentState = Readonly<{
  current: CurrentDownloadIncident | null;
  nextGeneration: number;
}>;

export type CurrentDownloadIncidentAction =
  | { type: "capture"; request: ErrorDiagnosticCopyRequest }
  | { type: "clear" };

export const createCurrentDownloadIncidentState = (): CurrentDownloadIncidentState => ({
  current: null,
  nextGeneration: 1,
});

export const reduceCurrentDownloadIncident = (
  state: CurrentDownloadIncidentState,
  action: CurrentDownloadIncidentAction,
): CurrentDownloadIncidentState => {
  switch (action.type) {
    case "capture":
      return {
        current: { request: action.request, generation: state.nextGeneration },
        nextGeneration: state.nextGeneration + 1,
      };
    case "clear":
      return state.current === null ? state : { ...state, current: null };
  }
};

export const isCurrentDownloadIncident = (
  state: CurrentDownloadIncidentState,
  generation: number,
): boolean => state.current?.generation === generation;
