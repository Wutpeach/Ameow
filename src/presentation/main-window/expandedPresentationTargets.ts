/**
 * Durable Progress Presentation facts consumed by the Expanded graphics host.
 * These values are pure projections of the current primary Download. They are
 * not renderer commands and carry no lifecycle or retention authority.
 */
export type ExpandedPresentationProgressTarget =
  | { kind: "idle" }
  | { kind: "indeterminate"; traceId: string }
  | { kind: "determinate"; traceId: string; target: number };

export type ExpandedPresentationTerminalStatus =
  | "success"
  | "failure"
  | "cancelled";

/**
 * Durable terminal Presentation fact. Its lifetime is owned by the existing
 * center-outcome Presentation; the graphics host must not retain it locally.
 */
export type ExpandedPresentationTerminalTarget =
  | { kind: "none" }
  | {
      kind: "terminal";
      status: ExpandedPresentationTerminalStatus;
    };
