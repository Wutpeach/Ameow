import { describe, expect, it } from "vitest";
import {
  DOT_REDUCED_MOTION_DURATION_MS,
  DOT_TRANSIENT_DURATION_MS,
  resolveBoundedDpr,
  type DotFieldBaseline,
  type DotFieldIntent,
  type DotFieldProgressTarget,
  type DotOrigin,
} from "./dotFieldRecipe";
import { createDotFieldRuntime } from "./dotFieldRuntime";

/**
 * MR1 repeatable performance validation. Runs the REAL runtime under a fake
 * frame scheduler with a recording draw surface and prints a per-scenario
 * summary (dot population, frames executed, settle time, PEAK pending frames
 * throughout the scenario, rest pending frames, draw calls) that can be
 * executed on Windows CI/manual runs. Real rasterization (both themes,
 * device-pixel-ratio variants, DevTools frame traces) is a documented manual
 * step; this suite pins the scheduling/material invariants the manual run
 * builds on.
 */

const FRAME_MS = 16;
const SIZE = 200;
const THEMES: Array<{ name: string; baseline: DotFieldBaseline }> = [
  {
    name: "black",
    baseline: {
      size: SIZE,
      dormant: "rgba(255,255,255,0.16)",
      ack: "rgba(255,255,255,0.72)",
      reducedMotion: false,
    },
  },
  {
    name: "white",
    baseline: {
      size: SIZE,
      dormant: "rgba(0,0,0,0.18)",
      ack: "rgba(0,0,0,0.6)",
      reducedMotion: false,
    },
  },
];

const ORIGINS: DotOrigin[] = [
  { u: 0.5, v: 0.5 },
  { u: 0.12, v: 0.12 },
  { u: 0.88, v: 0.5 },
  { u: 0.3, v: 0.85 },
  { u: 0.7, v: 0.2 },
];

type ScenarioResult = {
  name: string;
  framesExecuted: number;
  settleMs: number;
  /** TRUE maximum pending frames observed THROUGHOUT the scenario (not final). */
  peakPending: number;
  /** Pending frames after the drain — the settled/sleeping rest state. */
  restPending: number;
  drawCalls: number;
  dotCount: number;
  peakMax: number;
};

const runScenario = (
  name: string,
  run: (api: {
    runtime: ReturnType<typeof createDotFieldRuntime>;
    flush: (ms: number) => void;
    submit: (intent: DotFieldIntent) => void;
    baseline: DotFieldBaseline;
    now: () => number;
  }) => void,
): ScenarioResult => {
  let nowValue = 0;
  let nextHandle = 1;
  let pending: Array<{ handle: number; callback: (now: number) => void; cancelled: boolean }> = [];
  let framesExecuted = 0;
  let drawCalls = 0;
  let peakMax = 0;
  let peakPending = 0;
  const cancelled = new Set<number>();

  const countPending = () => pending.filter((frame) => !frame.cancelled).length;

  const recordingDraw = {
    clear: () => { drawCalls += 1; },
    drawDot: () => { drawCalls += 1; },
  };

  const runtime = createDotFieldRuntime({
    now: () => nowValue,
    scheduleFrame: (callback) => {
      const handle = nextHandle;
      nextHandle += 1;
      pending.push({ handle, callback, cancelled: false });
      return handle;
    },
    cancelFrame: (handle) => {
      cancelled.add(handle);
    },
    draw: recordingDraw,
  });

  const flush = (ms: number): void => {
    const frames = pending;
    pending = [];
    for (const frame of frames) {
      if (frame.cancelled) {
        continue;
      }
      nowValue += ms;
      framesExecuted += 1;
      frame.callback(nowValue);
    }
    // Frames scheduled DURING the callbacks land in the new `pending` list;
    // record the peak over the whole scenario, including inside the drain.
    peakPending = Math.max(peakPending, countPending());
    // Sample the response peaks DURING the scenario too (settle clears them,
    // so a post-drain sample would always read 0 and prove nothing).
    for (let index = 0; index < runtime.getDotCount(); index += 1) {
      peakMax = Math.max(peakMax, runtime.getPeakAt(index));
    }
  };

  const baseline = THEMES[0].baseline;
  runtime.wake(baseline);
  run({
    runtime,
    flush,
    submit: (intent) => runtime.submitIntent(intent),
    baseline,
    now: () => nowValue,
  });
  // Drain any remaining scheduled frames.
  let guard = 0;
  while (countPending() > 0 && guard < 200) {
    flush(FRAME_MS);
    guard += 1;
  }
  const restPending = countPending();

  return {
    name,
    framesExecuted,
    settleMs: guard * FRAME_MS,
    peakPending,
    restPending,
    drawCalls,
    dotCount: runtime.getDotCount(),
    peakMax,
  };
};

describe("Dot Field repeatable performance validation", () => {
  it("covers bursts, retarget, themes, reduced motion, sleep/wake, and DPR bounds", () => {
    const results: ScenarioResult[] = [];

    // 1. Single click burst.
    results.push(runScenario("single-click burst", ({ submit, flush }) => {
      submit({ kind: "click", origin: ORIGINS[0] });
      for (let frame = 0; frame < 5; frame += 1) {
        flush(FRAME_MS);
      }
    }));

    // 2. Rapid overlapping burst (latest-replaces retarget).
    results.push(runScenario("overlapping click/context burst", ({ submit, flush }) => {
      for (let index = 0; index < ORIGINS.length; index += 1) {
        submit({
          kind: index % 2 === 0 ? "click" : "context",
          origin: ORIGINS[index],
        });
        flush(FRAME_MS);
        flush(FRAME_MS);
      }
    }));

    // 3. Theme switch mid-transient.
    results.push(runScenario("theme switch mid-transient", ({ runtime, submit, flush }) => {
      submit({ kind: "click", origin: ORIGINS[0] });
      flush(FRAME_MS);
      runtime.setBaseline(THEMES[1].baseline);
      flush(FRAME_MS);
    }));

    // 4. Reduced-motion flip mid-transient.
    results.push(runScenario("reduced-motion flip mid-transient", ({ runtime, submit, flush }) => {
      submit({ kind: "click", origin: ORIGINS[0] });
      flush(FRAME_MS);
      runtime.setBaseline({ ...THEMES[0].baseline, reducedMotion: true });
      for (let frame = 0; frame < 3; frame += 1) {
        flush(FRAME_MS);
      }
    }));

    // 5. Collapse sleep + re-expand wake.
    results.push(runScenario("sleep during burst + wake", ({ runtime, submit, flush }) => {
      submit({ kind: "click", origin: ORIGINS[0] });
      flush(FRAME_MS);
      runtime.sleep();
      runtime.submitIntent({ kind: "context", origin: ORIGINS[1] }); // dropped
      flush(FRAME_MS);
      runtime.wake(THEMES[0].baseline);
    }));

    // 6. Context-open burst.
    results.push(runScenario("context-open burst", ({ submit, flush }) => {
      for (let index = 0; index < 4; index += 1) {
        submit({ kind: "context", origin: ORIGINS[2] });
        flush(FRAME_MS);
        flush(FRAME_MS);
      }
    }));

    const summary = results.map((result) => (
      `${result.name}: dots=${result.dotCount} frames=${result.framesExecuted} `
      + `settleMs=${result.settleMs} peakPending=${result.peakPending} `
      + `restPending=${result.restPending} drawCalls=${result.drawCalls} `
      + `peakMax=${result.peakMax.toFixed(3)}`
    ));
    console.log("\n[Dot Field perf validation]\n" + summary.join("\n") + "\n");

    for (const result of results) {
      // Invariants: bounded population, PEAK pending through the whole
      // scenario <= 1 (latest-replaces: at most one scheduled rAF even under
      // overlapping bursts), rest pending EXACTLY 0 (settled/sleeping
      // runtimes hold zero scheduled frames), bounded peaks.
      expect(result.dotCount).toBeLessThanOrEqual(400);
      expect(result.peakPending).toBeLessThanOrEqual(1);
      expect(result.restPending).toBe(0);
      expect(result.peakMax).toBeLessThanOrEqual(1);
      expect(result.framesExecuted).toBeGreaterThan(0);
      // Reduced-motion scenario settles within the short duration.
      if (result.name === "reduced-motion flip mid-transient") {
        expect(result.settleMs).toBeLessThanOrEqual(
          Math.ceil(DOT_REDUCED_MOTION_DURATION_MS / FRAME_MS) * FRAME_MS + FRAME_MS,
        );
      } else if (result.name === "sleep during burst + wake") {
        expect(result.settleMs).toBeLessThanOrEqual(
          Math.ceil(DOT_TRANSIENT_DURATION_MS / FRAME_MS) * FRAME_MS + FRAME_MS,
        );
      }
    }
  });

  it("bounds the DPR backing store at 2x for both themes", () => {
    expect(resolveBoundedDpr(1)).toBe(1);
    expect(resolveBoundedDpr(1.5)).toBe(1.5);
    expect(resolveBoundedDpr(2.5)).toBe(2);
    expect(resolveBoundedDpr(3)).toBe(2);
  });

  it("covers MR3 progress scenarios: determinate bursts, overlay, indeterminate duty, sleep, reduced", () => {
    const results: ScenarioResult[] = [];
    const determinate = (target: number, traceId = "trace-1") => (
      { kind: "determinate" as const, traceId, target }
    );
    const withProgress = (progress: DotFieldProgressTarget): DotFieldBaseline => ({
      ...THEMES[0].baseline,
      progress,
    });

    // 1. High-frequency determinate burst: 40 authoritative updates coalesce
    //    into one convergence run to the latest target.
    results.push(runScenario("determinate rapid update burst", ({ runtime, flush }) => {
      runtime.setBaseline(withProgress(determinate(0)));
      for (let step = 1; step <= 40; step += 1) {
        runtime.setBaseline(withProgress(determinate(step / 40)));
      }
      for (let frame = 0; frame < 20; frame += 1) {
        flush(FRAME_MS);
      }
    }));

    // 2. Determinate frontier with an overlapping click/context burst on top
    //    (acknowledgement stays additive, latest-replaces).
    results.push(runScenario("determinate + click burst", ({ runtime, submit, flush }) => {
      runtime.setBaseline(withProgress(determinate(0.6)));
      for (let index = 0; index < ORIGINS.length; index += 1) {
        submit({
          kind: index % 2 === 0 ? "click" : "context",
          origin: ORIGINS[index],
        });
        flush(FRAME_MS);
        flush(FRAME_MS);
      }
    }));

    // 3. Indeterminate sweep: bounded low-duty loop that stops immediately on
    //    idle (the drain then sees zero pending frames).
    results.push(runScenario("indeterminate sweep then idle", ({ runtime, flush }) => {
      runtime.setBaseline(withProgress({ kind: "indeterminate", traceId: "trace-1" }));
      for (let frame = 0; frame < 10; frame += 1) {
        flush(FRAME_MS);
      }
      runtime.setBaseline(withProgress({ kind: "idle" }));
    }));

    // 4. Sleep mid-convergence: pending frame cancelled, rest is zero.
    results.push(runScenario("sleep during determinate convergence", ({ runtime, flush }) => {
      runtime.setBaseline(withProgress(determinate(0.1)));
      runtime.setBaseline(withProgress(determinate(0.9)));
      flush(FRAME_MS);
      runtime.sleep();
    }));

    // 5. Reduced-motion indeterminate: static active material, no loop.
    results.push(runScenario("reduced indeterminate static", ({ runtime, flush }) => {
      runtime.setBaseline(withProgress({ kind: "indeterminate", traceId: "trace-1" }));
      runtime.setBaseline({ ...THEMES[0].baseline, reducedMotion: true, progress: { kind: "indeterminate", traceId: "trace-1" } });
      flush(FRAME_MS);
    }));

    const summary = results.map((result) => (
      `${result.name}: dots=${result.dotCount} frames=${result.framesExecuted} `
      + `settleMs=${result.settleMs} peakPending=${result.peakPending} `
      + `restPending=${result.restPending} drawCalls=${result.drawCalls} `
      + `peakMax=${result.peakMax.toFixed(3)}`
    ));
    console.log("\n[Dot Field MR3 perf validation]\n" + summary.join("\n") + "\n");

    for (const result of results) {
      expect(result.dotCount).toBeLessThanOrEqual(400);
      expect(result.peakPending).toBeLessThanOrEqual(1);
      expect(result.restPending).toBe(0);
      expect(result.peakMax).toBeLessThanOrEqual(1);
      // The reduced-indeterminate scenario schedules nothing (static).
      if (result.name !== "reduced indeterminate static") {
        expect(result.framesExecuted).toBeGreaterThan(0);
      }
      // Deterministic convergence must settle within a bounded window
      // (40%-of-remaining per frame at 16ms: < 0.5s for a full sweep).
      if (result.name === "determinate rapid update burst") {
        expect(result.settleMs).toBeLessThanOrEqual(600);
      }
    }
  });
});
