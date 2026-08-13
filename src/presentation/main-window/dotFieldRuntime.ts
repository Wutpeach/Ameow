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
//   - sleep(): eligibility exit; invalidates the generation, cancels the
//     frame, clears the intent and peaks, and sleeps without poisoning the
//     mounted surface.
//   - dispose(): replacement/unmount; permanent. Late calls are stale no-ops.
//   - settle: the transient completes, transient storage (intent + peaks) is
//     cleared, and the dormant grid is drawn once.
// Frames: at most one rAF pending; a settled, sleeping, or disposed runtime
// holds ZERO pending frames.

import {
  DOT_RADIUS,
  resolveDotColor,
  resolveDotEdgeFactor,
  resolveDotFieldGrid,
  resolveDotResponseCurve,
  resolveDotResponseFront,
  resolveDotResponseStrength,
  resolveDotTransientDuration,
  type DotFieldBaseline,
  type DotFieldGrid,
  type DotFieldIntent,
  type DotOrigin,
} from "./dotFieldRecipe";

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

  const drawDots = (transientAt: (dotIndex: number) => number): void => {
    draw.clear();
    const { dormant, ack } = baseline;
    for (let index = 0; index < grid.points.length; index += 1) {
      const base = bases[index];
      const transient = transientAt(index);
      if (base <= 0 && transient <= 0) {
        continue;
      }
      const point = grid.points[index];
      draw.drawDot(point.x, point.y, DOT_RADIUS, resolveDotColor(dormant, ack, transient, base));
    }
  };

  const drawDormant = (): void => {
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
        // completes, then the runtime draws dormant and holds zero frames.
        intent = null;
        peaks.fill(0);
      }
    }
    if (residual !== null && frameNow - residual.startedAt >= residual.duration) {
      residual = null;
    }
    if (intent === null && residual === null) {
      drawDormant();
      return;
    }
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
    state = "awake";
    drawDormant();
  };

  const setBaseline = (nextBaseline: DotFieldBaseline): void => {
    if (state === "disposed") {
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
    // frame redraws it with the new tokens, so drawing dormant here would
    // flash a dormant-only frame and the transient would "reappear" on the
    // next one. Only a settled runtime redraws once under the new material.
    if (state !== "awake" || intent !== null || residual !== null) {
      return;
    }
    drawDormant();
  };

  const submitIntent = (nextIntent: DotFieldIntent): void => {
    if (state !== "awake") {
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
  };
};
