// Dot Field runtime: the consumer-local Canvas/rAF execution for the Expanded
// Window dot grid. This module is a renderer-local leaf: it imports only the
// pure recipe, reads no coordinates/DOM/native state, and never writes
// lifecycle, Pointer Field, Product, or IPC state. Scheduling and drawing are
// narrow injected collaborators so the runtime is fully testable under Node.
//
// Lifecycle (MR0 consumer contract, kept local):
//   - wake(baseline): rebuild from the current projection and draw once; a
//     still-awake re-wake is a no-op (no visual pop).
//   - setBaseline(next): accept immediately; geometry changes rebuild the
//     grid, material/reduced-motion changes apply on the next frame; a
//     transient keeps running and later settles to the NEW baseline. A live
//     residual keeps rendering continuously under the latest material (never
//     a dormant-only frame in between), and a reduced-motion flip re-times
//     the residual so the afterglow resolves within the reduced-motion
//     duration of the preference change.
//   - submitIntent(intent): one latest-replaces slot PLUS one fixed residual
//     slot. At retarget the ENTIRE currently rendered transient field is
//     folded into the residual (frozen snapshot, continuing its own decay
//     over the folded transient's remaining life), and the new intent is
//     seeded fresh into the peaks. The old residual is therefore NEVER
//     re-shaped by the new origin: the next rendered frame continues the old
//     field smoothly while the new wave adds locally at its own origin.
//     Intents are dropped while sleeping/disposed so nothing replays after
//     re-expansion.
//   - terminal baseline (MR4): a projected terminal target seeds one bounded
//     priority lane (reveal level 0 -> 1, or 1 directly under Reduced
//     Motion), absorbs acknowledgement transients, renders exactly while the
//     projected target is present, and is superseded/cleared by any arriving
//     progress target, sleep, or dispose. Retention is NOT owned here: the
//     owning Presentation's deadline removes the projected target.
//   - sleep(): eligibility exit; invalidates the generation, cancels the
//     frame, clears the intent and peaks, and sleeps without poisoning the
//     mounted surface.
//   - dispose(): replacement/unmount; permanent. Late calls are stale no-ops.
//   - settle: the transient completes, transient storage (intent + peaks) is
//     cleared, and the dormant grid is drawn once.
// Frames: at most one rAF pending; a settled, sleeping, or disposed runtime
// holds ZERO pending frames.

import {
  DOT_INDETERMINATE_DUTY_MS,
  DOT_INDETERMINATE_PERIOD_MS,
  DOT_PROGRESS_CONVERGE_RATE,
  DOT_PROGRESS_SNAP,
  DOT_RADIUS,
  DOT_TERMINAL_CONVERGE_RATE,
  DOT_TERMINAL_REVEAL_SNAP,
  resolveDotColor,
  resolveDotEdgeFactor,
  resolveDotFieldGrid,
  resolveProgressDotLevel,
  resolveDotResponseCurve,
  resolveDotResponseFront,
  resolveDotResponseStrength,
  resolveDotTransientDuration,
  resolveTerminalDotLevel,
  type DotFieldBaseline,
  type DotFieldGrid,
  type DotFieldIntent,
  type DotFieldProgressTarget,
  type DotFieldTerminalKind,
  type DotFieldTerminalTarget,
  type DotOrigin,
} from "./dotFieldRecipe";

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

const IDLE_PROGRESS: DotFieldProgressTarget = { kind: "idle" };
const NO_TERMINAL: DotFieldTerminalTarget = { kind: "none" };

const terminalEquals = (
  a: DotFieldTerminalTarget,
  b: DotFieldTerminalTarget,
): boolean => (
  a.kind === "none" || b.kind === "none"
    ? a.kind === "none" && b.kind === "none"
    : a.status === b.status
);

const progressEquals = (
  a: DotFieldProgressTarget,
  b: DotFieldProgressTarget,
): boolean => {
  if (a.kind === "idle" || b.kind === "idle") {
    return a.kind === "idle" && b.kind === "idle";
  }
  if (a.kind !== b.kind || a.traceId !== b.traceId) {
    return false;
  }
  if (a.kind === "indeterminate" && b.kind === "indeterminate") {
    return true;
  }
  return (
    a.kind === "determinate"
    && b.kind === "determinate"
    && a.target === b.target
  );
};

const baselineEquals = (a: DotFieldBaseline, b: DotFieldBaseline): boolean => (
  a.size === b.size
  && a.dormant === b.dormant
  && a.ack === b.ack
  && a.reducedMotion === b.reducedMotion
  && progressEquals(a.progress ?? IDLE_PROGRESS, b.progress ?? IDLE_PROGRESS)
  && terminalEquals(a.terminal ?? NO_TERMINAL, b.terminal ?? NO_TERMINAL)
);

const targetLevelOf = (target: DotFieldProgressTarget): number => (
  target.kind === "determinate" ? clamp01(target.target) : 0
);

export type DotFrameScheduler = {
  requestFrame: (callback: (now: number) => void) => number;
  cancelFrame: (handle: number) => void;
};

export type DotDrawSurface = {
  clear: () => void;
  drawDot: (x: number, y: number, radius: number, color: string) => void;
};

export type DotFieldRuntimeClock = () => number;

export type DotFieldRuntimeState = "sleeping" | "awake" | "disposed";

export type DotFieldRuntimeHandle = {
  wake: (baseline: DotFieldBaseline) => void;
  setBaseline: (baseline: DotFieldBaseline) => void;
  submitIntent: (intent: DotFieldIntent) => void;
  sleep: () => void;
  dispose: () => void;
  getState: () => DotFieldRuntimeState;
  getPendingFrameCount: () => number;
  getDotCount: () => number;
  getActiveIntent: () => DotFieldIntent | null;
  getPeakAt: (dotIndex: number) => number;
  getProgressTarget: () => DotFieldProgressTarget;
  getProgressLevel: () => number;
  getTerminalTarget: () => DotFieldTerminalTarget;
  getTerminalLevel: () => number;
};

const EMPTY_GRID: DotFieldGrid = { points: [], step: 0 };

export const createDotFieldRuntime = (dependencies: {
  now: DotFieldRuntimeClock;
  scheduleFrame: DotFrameScheduler["requestFrame"];
  cancelFrame: DotFrameScheduler["cancelFrame"];
  draw: DotDrawSurface;
}): DotFieldRuntimeHandle => {
  const { now, scheduleFrame, cancelFrame, draw } = dependencies;

  let state: DotFieldRuntimeState = "sleeping";
  let generation = 0;
  let baseline: DotFieldBaseline = {
    size: 0,
    dormant: "",
    ack: "",
    reducedMotion: false,
  };
  let grid: DotFieldGrid = EMPTY_GRID;
  let bases = new Float32Array(0);
  let peaks = new Float32Array(0);
  let intent: (DotFieldIntent & { startedAt: number }) | null = null;
  /** Fixed-size residual slot: the transient field frozen at the LAST retarget
      boundary, decaying under its own remaining timeline so the old wave is
      never re-shaped by a newer origin. One slot, never a queue. */
  let residual: {
    magnitudes: Float32Array;
    startedAt: number;
    duration: number;
  } | null = null;
  let frameHandle: number | null = null;
  // MR3 persistent progress target + rendered convergence state. The target
  // is part of the baseline projection; `progressLevel` is the CURRENT
  // rendered determinate occupancy and `progressPhase` the current sweep
  // position. Both are renderer-local interpolation state, never business
  // truth, and both are reconstructible from the current projection alone.
  let progressTarget: DotFieldProgressTarget = IDLE_PROGRESS;
  let progressLevel = 0;
  let progressPhase = 0;
  let lastProgressDrawAt = 0;
  let lastFrameAt = 0;
  // MR4 terminal lane: one bounded priority slot. `terminalLane` is the
  // active kind; `terminalLevel` is the CURRENT rendered reveal level 0..1.
  // Both are renderer-local and reconstructible from the current projection;
  // the lane is superseded by any progress target and cleared by
  // sleep/dispose. No retention or trace lives here — retention is the owning
  // Presentation's deadline, so the lane renders exactly while the projected
  // target is present.
  let terminalLane: DotFieldTerminalKind | null = null;
  let terminalLevel = 0;

  const rebuildGrid = (size: number): void => {
    grid = resolveDotFieldGrid(size);
    bases = new Float32Array(grid.points.length);
    peaks = new Float32Array(grid.points.length);
    for (let index = 0; index < grid.points.length; index += 1) {
      bases[index] = resolveDotEdgeFactor(grid.points[index].u, grid.points[index].v);
    }
    // A grid rebuild invalidates any frozen field.
    residual = null;
  };

  /**
   * Current projected progress brightness at one dot (0..1): the ordered
   * determinate frontier at the rendered level, the indeterminate sweep
   * band/bloom, or 0 when idle. Boundary attenuation is applied downstream.
   */
  const progressAt = (dotIndex: number): number => resolveProgressDotLevel(
    grid.points[dotIndex],
    dotIndex,
    grid.points.length,
    progressTarget,
    progressLevel,
    progressPhase,
    baseline.reducedMotion,
  );

  /**
   * MR4 terminal brightness at one dot: the current rendered reveal level of
   * the active lane kind, or 0 when no lane is active. Reduced Motion seeds
   * the level at 1, so the recipe needs no motion input of its own.
   */
  const terminalAt = (dotIndex: number): number => (
    terminalLane === null
      ? 0
      : resolveTerminalDotLevel(
          grid.points[dotIndex],
          dotIndex,
          grid.points.length,
          terminalLane,
          terminalLevel,
        )
  );

  /**
   * Base lane selection: the current task's progress lane wins whenever it is
   * active; otherwise the MR4 terminal lane renders. The projection never
   * sends both, and this defensive order keeps current-task information ahead
   * of a stale terminal target even if inputs race.
   */
  const laneAt = (dotIndex: number): number => (
    progressTarget.kind === "idle" ? terminalAt(dotIndex) : progressAt(dotIndex)
  );

  const drawDots = (transientAt: (dotIndex: number) => number): void => {
    draw.clear();
    const { dormant, ack } = baseline;
    for (let index = 0; index < grid.points.length; index += 1) {
      const base = bases[index];
      const lane = laneAt(index);
      const transient = transientAt(index);
      if (base <= 0 && lane <= 0 && transient <= 0) {
        continue;
      }
      const point = grid.points[index];
      draw.drawDot(
        point.x,
        point.y,
        DOT_RADIUS,
        resolveDotColor(dormant, ack, lane + transient, base),
      );
    }
  };

  /** Settled draw: the current progress baseline with no transient work. */
  const drawSettled = (): void => {
    drawDots(() => 0);
  };

  /**
   * Visual magnitude of dot `dotIndex` under one intent origin at `elapsedMs`
   * with the CURRENT baseline policy: the seeded peak, shaped by the soft
   * propagation front (normal motion) or the non-travelling local bloom
   * (reduced motion), and decayed by the response curve. Exactly what a
   * frame would render for the active intent.
   */
  const magnitudeAt = (
    dotIndex: number,
    origin: DotOrigin,
    elapsedMs: number,
  ): number => {
    const duration = resolveDotTransientDuration(baseline.reducedMotion);
    const point = grid.points[dotIndex];
    const dx = point.x - origin.u * baseline.size;
    const dy = point.y - origin.v * baseline.size;
    const distance = Math.hypot(dx, dy);
    const envelope = resolveDotResponseFront(
      distance,
      elapsedMs,
      duration,
      baseline.reducedMotion,
    );
    return peaks[dotIndex] * envelope * resolveDotResponseCurve(elapsedMs, duration);
  };

  /** Decayed residual contribution at dot `dotIndex`, given `frameNow`. */
  const residualMagnitudeAt = (dotIndex: number, frameNow: number): number => {
    if (residual === null) {
      return 0;
    }
    const elapsed = frameNow - residual.startedAt;
    if (elapsed <= 0) {
      return residual.magnitudes[dotIndex];
    }
    return residual.magnitudes[dotIndex]
      * resolveDotResponseCurve(elapsed, residual.duration);
  };

  const drawTransient = (frameNow: number): void => {
    const origin = intent?.origin ?? { u: 0.5, v: 0.5 };
    const activeElapsed = intent === null ? null : frameNow - intent.startedAt;
    drawDots((dotIndex) => (
      residualMagnitudeAt(dotIndex, frameNow)
      + (activeElapsed === null ? 0 : magnitudeAt(dotIndex, origin, activeElapsed))
    ));
  };

  const runFrame = (frameNow: number): void => {
    if (state !== "awake" || frameHandle === null) {
      return;
    }
    frameHandle = null;
    const duration = resolveDotTransientDuration(baseline.reducedMotion);
    if (intent !== null) {
      const elapsed = frameNow - intent.startedAt;
      if (elapsed >= duration) {
        // The active transient settles: clear its transient storage (peaks).
        // The residual may still be fading — frames continue until it, too,
        // completes, then the runtime draws the settled baseline and holds
        // zero frames.
        intent = null;
        peaks.fill(0);
      }
    }
    if (residual !== null && frameNow - residual.startedAt >= residual.duration) {
      residual = null;
    }

    // MR3 progress step: converge the determinate frontier toward the latest
    // target or advance the indeterminate sweep. Both are renderer-local and
    // bounded; neither writes business/lifecycle state.
    let progressActive = false;
    if (progressTarget.kind === "determinate") {
      const target = targetLevelOf(progressTarget);
      if (Math.abs(target - progressLevel) > DOT_PROGRESS_SNAP) {
        progressLevel += (target - progressLevel) * DOT_PROGRESS_CONVERGE_RATE;
        if (Math.abs(target - progressLevel) <= DOT_PROGRESS_SNAP) {
          progressLevel = target;
        }
        progressActive = Math.abs(target - progressLevel) > DOT_PROGRESS_SNAP;
      }
    } else if (progressTarget.kind === "indeterminate" && !baseline.reducedMotion) {
      const elapsed = Math.max(0, frameNow - lastFrameAt);
      progressPhase = (progressPhase + elapsed / DOT_INDETERMINATE_PERIOD_MS) % 1;
      progressActive = true;
    }
    // MR4 terminal step: converge the reveal level toward 1 (bounded; a
    // converged lane holds statically with zero pending frames).
    let terminalActive = false;
    if (terminalLane !== null && Math.abs(1 - terminalLevel) > DOT_TERMINAL_REVEAL_SNAP) {
      terminalLevel += (1 - terminalLevel) * DOT_TERMINAL_CONVERGE_RATE;
      if (Math.abs(1 - terminalLevel) <= DOT_TERMINAL_REVEAL_SNAP) {
        terminalLevel = 1;
      }
      terminalActive = Math.abs(1 - terminalLevel) > DOT_TERMINAL_REVEAL_SNAP;
    }
    lastFrameAt = frameNow;

    const hasTransient = intent !== null || residual !== null;
    if (!hasTransient && !progressActive && !terminalActive) {
      drawSettled();
      return;
    }
    if (
      !hasTransient
      && progressTarget.kind === "indeterminate"
      && frameNow - lastProgressDrawAt < DOT_INDETERMINATE_DUTY_MS
    ) {
      // Low-duty indeterminate sweep: keep the loop alive but skip this
      // redraw so the band never runs at full display rate.
      scheduleNextFrame();
      return;
    }
    lastProgressDrawAt = frameNow;
    drawTransient(frameNow);
    scheduleNextFrame();
  };

  const scheduleNextFrame = (): void => {
    if (frameHandle !== null || state !== "awake") {
      return;
    }
    const scheduledGeneration = generation;
    let handle: number | null = null;
    handle = scheduleFrame((frameNow) => {
      if (handle === null || generation !== scheduledGeneration) {
        // Stale generation (slept/disposed while queued) or a synchronous
        // scheduler that fired during scheduling: no-op.
        return;
      }
      runFrame(frameNow);
    });
    frameHandle = handle;
  };

  const wake = (nextBaseline: DotFieldBaseline): void => {
    if (state === "disposed") {
      return;
    }
    const sizeChanged = nextBaseline.size !== baseline.size;
    baseline = nextBaseline;
    if (sizeChanged || grid.points.length === 0) {
      rebuildGrid(baseline.size);
    }
    if (state === "awake") {
      return;
    }
    // MR3 wake: reconstruct from the CURRENT projection, never from
    // pre-collapse animation history — the frontier snaps to the current
    // target and the sweep restarts.
    progressTarget = baseline.progress ?? IDLE_PROGRESS;
    progressLevel = targetLevelOf(progressTarget);
    progressPhase = 0;
    // MR4 wake: reconstruct the terminal lane from the current projection
    // (seeds under idle progress; cleared by any progress target).
    applyTerminalTarget(baseline.terminal ?? NO_TERMINAL);
    lastFrameAt = now();
    state = "awake";
    drawSettled();
    const terminalNeedsFrames = terminalConverging();
    if ((progressTarget.kind === "indeterminate" && !baseline.reducedMotion) || terminalNeedsFrames) {
      scheduleNextFrame();
    }
  };

  const setBaseline = (nextBaseline: DotFieldBaseline): void => {
    if (state === "disposed") {
      return;
    }
    if (baselineEquals(baseline, nextBaseline)) {
      return;
    }
    const sizeChanged = nextBaseline.size !== baseline.size;
    const motionCut = !baseline.reducedMotion && nextBaseline.reducedMotion;
    baseline = nextBaseline;
    if (sizeChanged && grid.points.length > 0) {
      rebuildGrid(baseline.size);
    }
    // A reduced-motion flip while a residual is still fading re-times the
    // residual: the frozen magnitudes keep their current brightness and decay
    // locally over the reduced-motion duration (never a hard cut, never a
    // long normal-mode afterglow). A residual that would naturally end sooner
    // keeps its exact remaining life.
    if (motionCut && residual !== null) {
      const flipNow = now();
      const naturalRemaining = Math.max(
        0,
        residual.duration - (flipNow - residual.startedAt),
      );
      residual = {
        magnitudes: residual.magnitudes,
        startedAt: flipNow,
        duration: Math.min(naturalRemaining, resolveDotTransientDuration(true)),
      };
    }
    // A material revision while transient content is live must render that
    // content continuously under the latest material: the already-scheduled
    // frame redraws it with the new tokens, so drawing the settled baseline
    // here would flash a settled-only frame and the transient would
    // "reappear" on the next one. Only a settled runtime redraws once under
    // the new material.

    // MR3 progress transition: apply the projected target to the local
    // rendered state (rebase, clamp, or leave to converge). Idempotent when
    // the target did not change; identity churn from App renders is a no-op
    // because `baselineEquals` above already rejected equal values.
    applyProgressTarget(baseline.progress ?? IDLE_PROGRESS);
    // MR4 terminal transition: a projected terminal target seeds the lane
    // only while progress is idle; any progress target clears it (progress
    // is applied first, so the progress supersede rule wins on any
    // conflicting input).
    applyTerminalTarget(baseline.terminal ?? NO_TERMINAL);

    if (state !== "awake" || intent !== null || residual !== null) {
      return;
    }
    drawSettled();
    // When no lane needs work (idle, Reduced Motion, or a converged target)
    // while no transient is live, the only pending frame can be a lane frame
    // — cancel it so work stops immediately rather than after one stale
    // frame.
    const needsFrames = progressNeedsFrames() || terminalConverging();
    if (!needsFrames && frameHandle !== null) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }
    if (needsFrames) {
      if (progressTarget.kind === "indeterminate") {
        lastFrameAt = now();
      }
      scheduleNextFrame();
    }
  };

  /** True while the progress lane needs a frame (determinate converging or
   *  normal-motion indeterminate sweep). */
  const progressNeedsFrames = (): boolean => (
    (progressTarget.kind === "indeterminate" && !baseline.reducedMotion)
    || (
      progressTarget.kind === "determinate"
      && !baseline.reducedMotion
      && Math.abs(targetLevelOf(progressTarget) - progressLevel) > DOT_PROGRESS_SNAP
    )
  );

  /** True while the MR4 terminal reveal level is still converging. */
  const terminalConverging = (): boolean => (
    terminalLane !== null
    && !baseline.reducedMotion
    && Math.abs(1 - terminalLevel) > DOT_TERMINAL_REVEAL_SNAP
  );

  /**
   * Applies a projected progress target to the local rendered state.
   *
   * - idle: drop occupancy; the field returns to dormant.
   * - trace replacement (or idle -> determinate): immediate rebase to the new
   *   trace's current target — a new task never interpolates from the old
   *   task's progress, which would attribute old-task progress to it.
   * - indeterminate -> determinate: seed from a safe condition at/below the
   *   target, then converge up.
   * - same-trace downward revision: clamp immediately to at/below the new
   *   target; the rendered field must never overstate the latest
   *   authoritative value (information correctness outranks continuity).
   * - Reduced Motion: resolve to the semantic target directly, no travel.
   * - otherwise (same trace, upward): leave the current rendered level and
   *   let the frame loop converge toward the latest target (coalesced).
   */
  const applyProgressTarget = (next: DotFieldProgressTarget): void => {
    const prev = progressTarget;
    const prevKind = prev.kind;
    const prevTrace = prev.kind === "idle" ? null : prev.traceId;
    const nextKind = next.kind;
    const nextTrace = next.kind === "idle" ? null : next.traceId;
    const traceChanged = prevKind !== "idle" && nextKind !== "idle" && prevTrace !== nextTrace;
    progressTarget = next;
    // MR4 current-task rule: any active progress lane supersedes and clears
    // the terminal lane immediately — the field must never keep showing a
    // stale completion over current task information.
    if (nextKind !== "idle") {
      terminalLane = null;
    }
    if (nextKind === "idle") {
      progressLevel = 0;
      return;
    }
    if (nextKind === "indeterminate") {
      // Drop determinate frontier authority. Same-trace indeterminate keeps
      // the current level only as a safe seed for a later determinate
      // transition (min with target). A TRACE replacement resets the level to
      // 0: the new trace's future determinate must seed from its own
      // projection, never from the replaced trace's rendered progress.
      if (traceChanged) {
        progressLevel = 0;
      }
      return;
    }
    const target = targetLevelOf(next);
    if (prevKind === "idle" || traceChanged) {
      progressLevel = target;
    } else if (prevKind === "indeterminate") {
      progressLevel = Math.min(progressLevel, target);
    } else if (target < progressLevel) {
      progressLevel = target;
    } else if (baseline.reducedMotion) {
      progressLevel = target;
    }
  };

  /**
   * Applies a projected MR4 terminal target to the local rendered state.
   *
   * - none: clear the lane; the field reconverges to the current baseline.
   * - terminal while a progress lane is active: ignored (progress wins; the
   *   projection never sends this, the guard is defensive).
   * - terminal with no lane: seed the reveal from the current condition
   *   (level 0, or 1 directly under Reduced Motion), superseding any
   *   acknowledgement transients (they are absorbed, not queued).
   * - same kind re-application: keep the running reveal (no restart); a kind
   *   change replaces the lane in the one bounded slot (no FIFO).
   */
  const applyTerminalTarget = (next: DotFieldTerminalTarget): void => {
    if (progressTarget.kind !== "idle") {
      terminalLane = null;
      return;
    }
    if (next.kind === "none") {
      terminalLane = null;
      return;
    }
    if (terminalLane !== null && terminalLane === next.status) {
      // Same-kind re-application keeps the running reveal, but a mid-flight
      // Reduced Motion flip resolves the lane to the final semantic level
      // immediately (no travel, no restart).
      if (baseline.reducedMotion) {
        terminalLevel = 1;
      }
      return;
    }
    terminalLane = next.status;
    terminalLevel = baseline.reducedMotion ? 1 : 0;
    // Terminal supersedes lower-priority transient work from the current
    // visual condition: the acknowledgement slot and residual are absorbed.
    intent = null;
    peaks.fill(0);
    residual = null;
  };

  const submitIntent = (nextIntent: DotFieldIntent): void => {
    if (state !== "awake") {
      return;
    }
    // MR4: acknowledgement transients are absorbed while the terminal lane is
    // active — the terminal target suppresses lower-priority work and is
    // never queued behind it.
    if (terminalLane !== null) {
      return;
    }
    const size = baseline.size;
    const nowMs = now();
    const duration = resolveDotTransientDuration(baseline.reducedMotion);
    const activeElapsed = intent === null
      ? 0
      : Math.max(0, nowMs - intent.startedAt);

    // Fold the ENTIRE currently rendered transient field (active + any
    // earlier residual) into the fixed residual slot. The snapshot continues
    // decaying under its own timeline, so the old wave is preserved at the
    // retarget boundary and never re-shaped by the new origin. The remaining
    // life is the folded active transient's remaining life, which makes the
    // residual's time decay exactly continue the active's curve.
    if (intent !== null || residual !== null) {
      // Remaining life: the folded active transient's remaining time when it
      // still has life (makes the residual's time decay exactly continue the
      // active's curve); otherwise the previous residual's own remaining time,
      // so a fold of a settled active never cuts the residual short.
      let remaining = 0;
      if (activeElapsed < duration) {
        remaining = duration - activeElapsed;
      } else if (residual !== null) {
        remaining = residual.duration - Math.max(0, nowMs - residual.startedAt);
      }
      const magnitudes = new Float32Array(grid.points.length);
      for (let index = 0; index < grid.points.length; index += 1) {
        let field = residualMagnitudeAt(index, nowMs);
        if (intent !== null && activeElapsed < duration) {
          field += magnitudeAt(index, intent.origin, activeElapsed);
        }
        magnitudes[index] = field;
      }
      residual = { magnitudes, startedAt: nowMs, duration: Math.max(0, remaining) };
    }

    // The new intent seeds fresh peaks: it adds/replaces LOCALLY at its own
    // origin; it never re-uses or re-shapes the folded residual.
    for (let index = 0; index < grid.points.length; index += 1) {
      peaks[index] = resolveDotResponseStrength(grid.points[index], nextIntent.origin, size);
    }
    intent = { ...nextIntent, startedAt: nowMs };
    scheduleNextFrame();
  };

  const sleep = (): void => {
    if (state === "disposed") {
      return;
    }
    generation += 1;
    if (frameHandle !== null) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }
    intent = null;
    peaks.fill(0);
    residual = null;
    terminalLane = null;
    state = "sleeping";
  };

  const dispose = (): void => {
    if (state === "disposed") {
      return;
    }
    generation += 1;
    if (frameHandle !== null) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }
    intent = null;
    residual = null;
    terminalLane = null;
    grid = EMPTY_GRID;
    bases = new Float32Array(0);
    peaks = new Float32Array(0);
    state = "disposed";
  };

  return {
    wake,
    setBaseline,
    submitIntent,
    sleep,
    dispose,
    getState: () => state,
    getPendingFrameCount: () => (frameHandle === null ? 0 : 1),
    getDotCount: () => grid.points.length,
    getActiveIntent: () => (
      intent === null ? null : { kind: intent.kind, origin: intent.origin }
    ),
    getPeakAt: (dotIndex: number) => {
      if (!Number.isInteger(dotIndex) || dotIndex < 0 || dotIndex >= peaks.length) {
        return 0;
      }
      return peaks[dotIndex];
    },
    getProgressTarget: () => progressTarget,
    getProgressLevel: () => progressLevel,
    getTerminalTarget: () => (
      terminalLane === null ? NO_TERMINAL : { kind: "terminal", status: terminalLane }
    ),
    getTerminalLevel: () => terminalLevel,
  };
};
