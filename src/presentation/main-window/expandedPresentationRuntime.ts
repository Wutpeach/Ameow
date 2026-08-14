import type {
  ExpandedPresentationProgressTarget,
  ExpandedPresentationTerminalTarget,
} from "./expandedPresentationTargets";

const PROGRESS_CONVERGENCE_PER_SECOND = 2.4;
const PROGRESS_SNAP = 0.001;
const MAX_FRAME_DELTA_SECONDS = 0.05;

export type ExpandedPresentationInputs = Readonly<{
  progress: ExpandedPresentationProgressTarget;
  terminal: ExpandedPresentationTerminalTarget;
  reducedMotion: boolean;
}>;

export type ExpandedPresentationFrame = Readonly<{
  progress: ExpandedPresentationProgressTarget;
  progressLevel: number;
  terminal: ExpandedPresentationTerminalTarget;
  reducedMotion: boolean;
  timeSeconds: number;
}>;

export type ExpandedPresentationRuntimeState = "sleeping" | "awake" | "disposed";

export type ExpandedPresentationRuntime = {
  wake: (inputs: ExpandedPresentationInputs) => void;
  setInputs: (inputs: ExpandedPresentationInputs) => void;
  sleep: () => void;
  dispose: () => void;
  getState: () => ExpandedPresentationRuntimeState;
  getPendingFrameCount: () => number;
  getProgressTarget: () => ExpandedPresentationProgressTarget;
  getProgressLevel: () => number;
  getTerminalTarget: () => ExpandedPresentationTerminalTarget;
};

const IDLE_PROGRESS: ExpandedPresentationProgressTarget = { kind: "idle" };
const NO_TERMINAL: ExpandedPresentationTerminalTarget = { kind: "none" };

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

const progressEquals = (
  left: ExpandedPresentationProgressTarget,
  right: ExpandedPresentationProgressTarget,
): boolean => {
  if (left.kind === "idle" || right.kind === "idle") {
    return left.kind === right.kind;
  }
  if (left.kind !== right.kind || left.traceId !== right.traceId) {
    return false;
  }
  return left.kind === "indeterminate"
    || (right.kind === "determinate" && left.target === right.target);
};

const terminalEquals = (
  left: ExpandedPresentationTerminalTarget,
  right: ExpandedPresentationTerminalTarget,
): boolean => (
  left.kind === "none" || right.kind === "none"
    ? left.kind === right.kind
    : left.status === right.status
);

const inputsEqual = (
  left: ExpandedPresentationInputs,
  right: ExpandedPresentationInputs,
): boolean => (
  left.reducedMotion === right.reducedMotion
  && progressEquals(left.progress, right.progress)
  && terminalEquals(left.terminal, right.terminal)
);

/**
 * Consumer-local frame execution for the one Expanded graphics host. It owns
 * only reconstructible interpolation and bounded rAF scheduling. It has no
 * Product, lifecycle, retention, native, or semantic-completion channel.
 */
export const createExpandedPresentationRuntime = (dependencies: {
  now: () => number;
  scheduleFrame: (callback: (now: number) => void) => number;
  cancelFrame: (handle: number) => void;
  render: (frame: ExpandedPresentationFrame) => void;
}): ExpandedPresentationRuntime => {
  const { now, scheduleFrame, cancelFrame, render } = dependencies;
  let state: ExpandedPresentationRuntimeState = "sleeping";
  let generation = 0;
  let frameHandle: number | null = null;
  let inputs: ExpandedPresentationInputs = {
    progress: IDLE_PROGRESS,
    terminal: NO_TERMINAL,
    reducedMotion: false,
  };
  let progressTarget: ExpandedPresentationProgressTarget = IDLE_PROGRESS;
  let terminalTarget: ExpandedPresentationTerminalTarget = NO_TERMINAL;
  let progressLevel = 0;
  let lastFrameAt = 0;

  const cancelPendingFrame = (): void => {
    if (frameHandle !== null) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }
  };

  const failClosed = (): void => {
    generation += 1;
    cancelPendingFrame();
    state = "sleeping";
  };

  const renderCurrent = (timeMs: number): boolean => {
    try {
      render({
        progress: progressTarget,
        progressLevel,
        terminal: terminalTarget,
        reducedMotion: inputs.reducedMotion,
        timeSeconds: timeMs / 1000,
      });
      return true;
    } catch {
      failClosed();
      return false;
    }
  };

  const needsFrames = (): boolean => (
    !inputs.reducedMotion
    && (
      progressTarget.kind === "indeterminate"
      || (
        progressTarget.kind === "determinate"
        && Math.abs(progressTarget.target - progressLevel) > PROGRESS_SNAP
      )
    )
  );

  const scheduleNextFrame = (): void => {
    if (state !== "awake" || frameHandle !== null || !needsFrames()) {
      return;
    }
    const scheduledGeneration = generation;
    frameHandle = scheduleFrame((frameNow) => {
      if (state !== "awake" || scheduledGeneration !== generation) {
        return;
      }
      frameHandle = null;
      const deltaSeconds = Math.min(
        Math.max((frameNow - lastFrameAt) / 1000, 0),
        MAX_FRAME_DELTA_SECONDS,
      );
      lastFrameAt = frameNow;
      if (progressTarget.kind === "determinate" && !inputs.reducedMotion) {
        progressLevel = Math.min(
          progressTarget.target,
          progressLevel + PROGRESS_CONVERGENCE_PER_SECOND * deltaSeconds,
        );
        if (Math.abs(progressTarget.target - progressLevel) <= PROGRESS_SNAP) {
          progressLevel = progressTarget.target;
        }
      }
      if (renderCurrent(frameNow)) {
        scheduleNextFrame();
      }
    });
  };

  const applyInputs = (next: ExpandedPresentationInputs): void => {
    const previous = progressTarget;
    const previousTrace = previous.kind === "idle" ? null : previous.traceId;
    const nextTrace = next.progress.kind === "idle" ? null : next.progress.traceId;
    const traceChanged = previousTrace !== null
      && nextTrace !== null
      && previousTrace !== nextTrace;

    inputs = next;
    progressTarget = next.progress;
    terminalTarget = next.progress.kind === "idle" ? next.terminal : NO_TERMINAL;

    if (next.progress.kind === "idle") {
      progressLevel = 0;
      return;
    }
    if (next.progress.kind === "indeterminate") {
      if (traceChanged) {
        progressLevel = 0;
      }
      return;
    }

    const target = clamp01(next.progress.target);
    progressTarget = { ...next.progress, target };
    if (
      previous.kind === "idle"
      || traceChanged
      || next.reducedMotion
    ) {
      progressLevel = target;
    } else if (previous.kind === "indeterminate") {
      progressLevel = Math.min(progressLevel, target);
    } else if (target < progressLevel) {
      // An authoritative downward revision must never be visually overstated.
      progressLevel = target;
    }
  };

  const setInputs = (next: ExpandedPresentationInputs): void => {
    if (state === "disposed") {
      return;
    }
    const changed = !inputsEqual(inputs, next);
    applyInputs(next);
    if (state !== "awake" || !changed) {
      return;
    }
    cancelPendingFrame();
    lastFrameAt = now();
    if (renderCurrent(lastFrameAt)) {
      scheduleNextFrame();
    }
  };

  const wake = (next: ExpandedPresentationInputs): void => {
    if (state === "disposed") {
      return;
    }
    if (state === "awake") {
      setInputs(next);
      return;
    }
    state = "awake";
    generation += 1;
    progressTarget = IDLE_PROGRESS;
    terminalTarget = NO_TERMINAL;
    progressLevel = 0;
    applyInputs(next);
    lastFrameAt = now();
    if (renderCurrent(lastFrameAt)) {
      scheduleNextFrame();
    }
  };

  const sleep = (): void => {
    if (state !== "awake") {
      return;
    }
    generation += 1;
    cancelPendingFrame();
    state = "sleeping";
    progressTarget = IDLE_PROGRESS;
    terminalTarget = NO_TERMINAL;
    progressLevel = 0;
  };

  const dispose = (): void => {
    if (state === "disposed") {
      return;
    }
    generation += 1;
    cancelPendingFrame();
    state = "disposed";
    progressTarget = IDLE_PROGRESS;
    terminalTarget = NO_TERMINAL;
    progressLevel = 0;
  };

  return {
    wake,
    setInputs,
    sleep,
    dispose,
    getState: () => state,
    getPendingFrameCount: () => (frameHandle === null ? 0 : 1),
    getProgressTarget: () => progressTarget,
    getProgressLevel: () => progressLevel,
    getTerminalTarget: () => terminalTarget,
  };
};
