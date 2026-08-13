import { describe, expect, it } from "vitest";
import {
  DOT_REDUCED_MOTION_DURATION_MS,
  DOT_TRANSIENT_DURATION_MS,
  resolveDotResponseCurve,
  type DotFieldBaseline,
  type DotFieldIntent,
} from "./dotFieldRecipe";
import { createDotFieldRuntime } from "./dotFieldRuntime";

/**
 * MR1 conformance tests for the MR0 consumer-local runtime contract
 * (`presentationCompositionContract.test.ts`): wake, latest-replaces/retarget,
 * settle to latest baseline, reduced-motion resolution, collapse sleep,
 * permanent dispose, stale-generation no-ops, and zero pending frames whenever
 * settled/sleeping/disposed. Scheduling and drawing are fake collaborators, so
 * the full runtime runs under the existing Node Vitest environment.
 */

type PendingFrame = {
  handle: number;
  callback: (now: number) => void;
  cancelled: boolean;
};

const createFakeScheduler = () => {
  let nowValue = 0;
  let nextHandle = 1;
  let pending: PendingFrame[] = [];
  const cancelled = new Set<number>();

  const requestFrame = (callback: (now: number) => void): number => {
    const handle = nextHandle;
    nextHandle += 1;
    pending.push({ handle, callback, cancelled: false });
    return handle;
  };
  const cancelFrame = (handle: number): void => {
    cancelled.add(handle);
  };
  /** Runs every pending frame once, advancing the clock by stepMs each. */
  const flush = (stepMs: number): number => {
    const frames = pending;
    pending = [];
    for (const frame of frames) {
      if (frame.cancelled) {
        continue;
      }
      nowValue += stepMs;
      frame.callback(nowValue);
    }
    return frames.length;
  };
  const countPending = (): number => pending.filter((frame) => !frame.cancelled).length;

  return {
    now: () => nowValue,
    advance: (ms: number) => { nowValue += ms; },
    requestFrame,
    cancelFrame,
    flush,
    countPending,
    isCancelled: (handle: number) => cancelled.has(handle),
  };
};

type RecordedDot = { x: number; y: number; radius: number; color: string };

const createRecordingDraw = () => {
  let clears = 0;
  const dots: RecordedDot[] = [];
  const frames: RecordedDot[][] = [];
  return {
    draw: {
      clear: () => {
        clears += 1;
        frames.push([]);
      },
      drawDot: (x: number, y: number, radius: number, color: string) => {
        const dot = { x, y, radius, color };
        dots.push(dot);
        if (frames.length > 0) {
          frames[frames.length - 1].push(dot);
        }
      },
    },
    getClears: () => clears,
    getDots: () => dots,
    /** Dots drawn by the most recent cleared frame. */
    getLastFrame: () => (frames.length === 0 ? [] : frames[frames.length - 1]),
    reset: () => {
      clears = 0;
      dots.length = 0;
      frames.length = 0;
    },
  };
};

const SIZE = 200;
const BLACK_MATERIAL: DotFieldBaseline = {
  size: SIZE,
  dormant: "rgba(255,255,255,0.16)",
  ack: "rgba(255,255,255,0.72)",
  reducedMotion: false,
};

const CENTER_INTENT: DotFieldIntent = { kind: "click", origin: { u: 0.5, v: 0.5 } };
const CORNER_INTENT: DotFieldIntent = { kind: "context", origin: { u: 0.08, v: 0.08 } };

const createHarness = () => {
  const scheduler = createFakeScheduler();
  const recording = createRecordingDraw();
  const runtime = createDotFieldRuntime({
    now: scheduler.now,
    scheduleFrame: scheduler.requestFrame,
    cancelFrame: scheduler.cancelFrame,
    draw: recording.draw,
  });
  return { scheduler, recording, runtime };
};

const dotCount = (): number => {
  const axis = Math.min(Math.floor(SIZE / 14) + 1, Math.floor(Math.sqrt(400)));
  return axis * axis;
};

/** Extracts the trailing alpha from a rendered "rgba(r, g, b, a)" string. */
const parseColorAlpha = (color: string): number => {
  const match = color.match(/rgba\([^)]*,\s*([\d.]+)\)$/);
  return match === null ? 0 : Number(match[1]);
};

/** Finds a dot within half a grid step of (x, y) in a recorded frame and returns its alpha. */
const alphaNear = (frame: RecordedDot[], targetX: number, targetY: number): number => {
  const dot = frame.find((recorded) => (
    Math.abs(recorded.x - targetX) < 0.6 && Math.abs(recorded.y - targetY) < 0.6
  ));
  return dot === undefined ? -1 : parseColorAlpha(dot.color);
};

describe("Dot Field runtime: wake and dormant baseline", () => {
  it("wakes, draws the dormant grid once, and holds zero pending frames", () => {
    const { scheduler, recording, runtime } = createHarness();
    expect(runtime.getState()).toBe("sleeping");
    expect(runtime.getPendingFrameCount()).toBe(0);

    runtime.wake(BLACK_MATERIAL);
    expect(runtime.getState()).toBe("awake");
    expect(runtime.getPendingFrameCount()).toBe(0);
    expect(runtime.getDotCount()).toBe(dotCount());
    expect(recording.getClears()).toBe(1);
    expect(recording.getDots().length).toBeGreaterThan(0);
    // Settled wake schedules nothing.
    expect(scheduler.countPending()).toBe(0);

    // Idempotent re-wake: no extra draw, no frames.
    const clearsBefore = recording.getClears();
    runtime.wake(BLACK_MATERIAL);
    expect(recording.getClears()).toBe(clearsBefore);
  });

  it("attenuates dormant alpha toward the surface boundary (boundary absorption)", () => {
    const { recording, runtime } = createHarness();
    runtime.wake(BLACK_MATERIAL);
    const interior = recording.getDots().filter((dot) => (
      dot.x > SIZE * 0.2 && dot.x < SIZE * 0.8 && dot.y > SIZE * 0.2 && dot.y < SIZE * 0.8
    ));
    expect(interior.length).toBeGreaterThan(0);
    const interiorAlpha = parseColorAlpha(interior[0].color);
    const edgeDots = recording.getDots().filter((dot) => (
      dot.x < SIZE * 0.05 && dot.y < SIZE * 0.05
    ));
    expect(edgeDots.length).toBeGreaterThan(0);
    expect(parseColorAlpha(edgeDots[0].color)).toBeLessThan(interiorAlpha);
    expect(interiorAlpha).toBeCloseTo(0.16, 5);
  });
});

describe("Dot Field runtime: transient scheduling and settle", () => {
  it("schedules at most one frame, runs until settled, then returns to zero pending", () => {
    const { scheduler, recording, runtime } = createHarness();
    runtime.wake(BLACK_MATERIAL);
    recording.reset();

    runtime.submitIntent(CENTER_INTENT);
    expect(runtime.getActiveIntent()?.kind).toBe("click");
    expect(runtime.getPendingFrameCount()).toBe(1);
    expect(scheduler.countPending()).toBe(1);

    let frames = 0;
    let maxPending = 0;
    while (runtime.getPendingFrameCount() > 0 && frames < 100) {
      scheduler.flush(16);
      frames += 1;
      maxPending = Math.max(maxPending, runtime.getPendingFrameCount());
    }
    expect(maxPending).toBeLessThanOrEqual(1);
    expect(frames).toBeGreaterThan(1);
    expect(frames).toBeLessThanOrEqual(Math.ceil(DOT_TRANSIENT_DURATION_MS / 16) + 2);
    expect(runtime.getPendingFrameCount()).toBe(0);
    expect(runtime.getActiveIntent()).toBeNull();
    expect(scheduler.countPending()).toBe(0);

    // Settled transient: additional flushes run nothing and draw nothing.
    const dotsBefore = recording.getDots().length;
    scheduler.flush(16);
    expect(recording.getDots().length).toBe(dotsBefore);
  });

  it("seeds the response peak at the intent origin and bounds all peaks", () => {
    const { runtime } = createHarness();
    runtime.wake(BLACK_MATERIAL);
    runtime.submitIntent(CENTER_INTENT);
    const centerIndex = Math.floor(runtime.getDotCount() / 2);
    expect(runtime.getPeakAt(centerIndex)).toBe(1);
    for (let index = 0; index < runtime.getDotCount(); index += 1) {
      expect(runtime.getPeakAt(index)).toBeLessThanOrEqual(1);
    }
  });

  it("latest-replaces: a retarget preserves the rendered field — old residual continues, new origin acknowledged", () => {
    const { scheduler, recording, runtime } = createHarness();
    runtime.wake(BLACK_MATERIAL);

    runtime.submitIntent(CENTER_INTENT);
    scheduler.flush(16);
    scheduler.flush(16); // active elapsed = 32ms
    const preFrame = recording.getLastFrame();
    const preCenter = alphaNear(preFrame, 100, 100);
    const preFar = alphaNear(preFrame, 100, 113.33);
    // Dots near the NEW origin, before the retarget (dormant-level values):
    // the origin-adjacent dot (6.67, 6.67, in the fade band) and the
    // interior dot (33.33, 20).
    const preCorner = alphaNear(preFrame, 6.67, 6.67);
    const preInterior = alphaNear(preFrame, 33.33, 20);

    runtime.submitIntent(CORNER_INTENT);
    scheduler.flush(16); // first frame after the retarget boundary
    const postFrame = recording.getLastFrame();
    const postCenter = alphaNear(postFrame, 100, 100);
    const postFar = alphaNear(postFrame, 100, 113.33);
    const postCorner = alphaNear(postFrame, 6.67, 6.67);
    const postInterior = alphaNear(postFrame, 33.33, 20);

    // OLD residual continuity: the old-origin field decays EXACTLY by the
    // response curve's natural per-frame factor (curve(48)/curve(32)) — it is
    // preserved at the retarget boundary, never re-shaped by the new origin,
    // never jumped to zero. Tolerance covers the 3-decimal alpha rounding.
    const duration = DOT_TRANSIENT_DURATION_MS;
    const naturalDecay = resolveDotResponseCurve(48, duration) / resolveDotResponseCurve(32, duration);
    expect(postCenter - 0.16).toBeCloseTo((preCenter - 0.16) * naturalDecay, 2);
    expect(postFar - 0.16).toBeCloseTo((preFar - 0.16) * naturalDecay, 2);

    // NEW origin acknowledged on the same frame: both near-origin dots
    // brighten by a clear factor over their pre-retarget dormant values
    // (ratio, because the origin-adjacent dot sits in the boundary fade band).
    expect(postCorner).toBeGreaterThan(preCorner * 1.5);
    expect(postInterior).toBeGreaterThan(preInterior * 1.5);

    // Peaks now belong to the NEW intent only — no historical replay at the
    // old origin, no FIFO (exactly one active intent, one pending frame).
    const centerIndex = Math.floor(runtime.getDotCount() / 2);
    const cornerIndex = 0;
    expect(runtime.getPeakAt(centerIndex)).toBeLessThan(1);
    expect(runtime.getPeakAt(cornerIndex)).toBeGreaterThan(runtime.getPeakAt(centerIndex));
    expect(runtime.getActiveIntent()?.origin).toEqual({ u: 0.08, v: 0.08 });
    expect(runtime.getPendingFrameCount()).toBe(1);
  });

  it("a retarget of a settled active keeps the fading residual alive (no cut)", () => {
    const { scheduler, runtime } = createHarness();
    runtime.wake(BLACK_MATERIAL);
    runtime.submitIntent(CENTER_INTENT);
    scheduler.flush(16);
    scheduler.flush(16); // elapsed 32

    // Fold, then let the ACTIVE transient settle while the residual still
    // fades; a further intent must not cut the residual short.
    runtime.submitIntent(CORNER_INTENT); // residual = center field
    while (runtime.getPendingFrameCount() > 0) {
      scheduler.flush(16);
    }
    expect(runtime.getActiveIntent()).toBeNull();
    expect(runtime.getPendingFrameCount()).toBe(0);

    // The residual is gone (settled) but its lifetime was bounded; a new
    // intent after the full drain seeds fresh and settles normally.
    runtime.submitIntent(CENTER_INTENT);
    const centerIndex = Math.floor(runtime.getDotCount() / 2);
    expect(runtime.getPeakAt(centerIndex)).toBe(1);
    while (runtime.getPendingFrameCount() > 0) {
      scheduler.flush(16);
    }
    expect(runtime.getPeakAt(centerIndex)).toBe(0);
  });

  it("settle clears transient storage: settled peaks are 0 and a later intent seeds fresh", () => {
    const { scheduler, runtime } = createHarness();
    runtime.wake(BLACK_MATERIAL);
    runtime.submitIntent(CENTER_INTENT);
    const centerIndex = Math.floor(runtime.getDotCount() / 2);
    expect(runtime.getPeakAt(centerIndex)).toBe(1);

    while (runtime.getPendingFrameCount() > 0) {
      scheduler.flush(16);
    }
    // Transient storage is cleared at settle — no historical max survives.
    expect(runtime.getPeakAt(centerIndex)).toBe(0);
    expect(runtime.getActiveIntent()).toBeNull();

    // A later intent seeds from zero (no replay of the settled origin).
    runtime.submitIntent(CENTER_INTENT);
    expect(runtime.getPeakAt(centerIndex)).toBe(1);
  });

  it("updates the stored baseline during a transient and settles to the LATEST baseline", () => {
    const { scheduler, recording, runtime } = createHarness();
    runtime.wake(BLACK_MATERIAL);
    runtime.submitIntent(CENTER_INTENT);
    scheduler.flush(16);
    scheduler.flush(16);

    const nextBaseline: DotFieldBaseline = {
      ...BLACK_MATERIAL,
      ack: "rgba(255,255,255,0.9)",
    };
    runtime.setBaseline(nextBaseline);

    // The next frame renders with the new material: interior dots brighten
    // beyond the old dormant alpha as the transient continues.
    scheduler.flush(16);
    const transientInterior = recording.getLastFrame().filter((dot) => (
      dot.x > SIZE * 0.3 && dot.x < SIZE * 0.7 && dot.y > SIZE * 0.3 && dot.y < SIZE * 0.7
    ));
    expect(transientInterior.some((dot) => parseColorAlpha(dot.color) > 0.2)).toBe(true);

    // Settle draws the latest dormant baseline (no stale snapshot).
    while (runtime.getPendingFrameCount() > 0) {
      scheduler.flush(16);
    }
    const settledFrame = recording.getLastFrame().filter((dot) => (
      dot.x > SIZE * 0.3 && dot.x < SIZE * 0.7 && dot.y > SIZE * 0.3 && dot.y < SIZE * 0.7
    ));
    expect(settledFrame.length).toBeGreaterThan(0);
    expect(settledFrame.every((dot) => parseColorAlpha(dot.color) === 0.16)).toBe(true);
  });

  it("reduced-motion flip mid-flight resolves deterministically and quickly", () => {
    const { scheduler, runtime } = createHarness();
    runtime.wake(BLACK_MATERIAL);
    runtime.submitIntent(CENTER_INTENT);
    scheduler.flush(16);

    runtime.setBaseline({ ...BLACK_MATERIAL, reducedMotion: true });
    let frames = 0;
    while (runtime.getPendingFrameCount() > 0 && frames < 100) {
      scheduler.flush(16);
      frames += 1;
    }
    // Settled well inside the normal duration; roughly the reduced duration.
    expect(frames).toBeLessThanOrEqual(Math.ceil(DOT_REDUCED_MOTION_DURATION_MS / 16) + 2);
    expect(runtime.getPendingFrameCount()).toBe(0);
  });

  it("a material baseline change while a residual is fading has no dormant flash and uses the new material immediately", () => {
    const { scheduler, recording, runtime } = createHarness();
    runtime.wake(BLACK_MATERIAL);
    runtime.submitIntent(CENTER_INTENT);
    scheduler.flush(4);
    scheduler.flush(4); // active elapsed = 8ms

    // Retarget: the center field folds into the residual slot, then a
    // reduced-motion flip re-times the residual (90ms). The ACTIVE settles at
    // its own 90ms while the residual keeps fading, leaving a residual-only
    // window — the state where a material change must NOT collapse the
    // rendered field to a dormant-only frame.
    runtime.submitIntent(CORNER_INTENT);
    for (let frame = 0; frame < 11; frame += 1) {
      scheduler.flush(4);
    } // t = 52: active elapsed 44/90
    runtime.setBaseline({ ...BLACK_MATERIAL, reducedMotion: true });
    for (let frame = 0; frame < 12; frame += 1) {
      scheduler.flush(4);
    } // t = 100: active settled, residual-only frame (elapsed 48/90)
    const preFrame = recording.getLastFrame();
    const preCenter = alphaNear(preFrame, 100, 100);
    expect(preCenter).toBeGreaterThan(0.2); // residual-only, still bright

    const clearsBefore = recording.getClears();
    const greenMaterial: DotFieldBaseline = {
      size: SIZE,
      dormant: "rgba(0,255,0,0.16)",
      ack: "rgba(0,255,0,0.72)",
      reducedMotion: true,
    };
    runtime.setBaseline(greenMaterial);
    scheduler.flush(4); // t = 104: ONE frame, residual under the new material
    // Exactly one cleared frame since the change: the old code drew an extra
    // dormant-only frame synchronously here (flash, then the residual
    // "reappeared" on the next frame).
    expect(recording.getClears()).toBe(clearsBefore + 1);

    const postFrame = recording.getLastFrame();
    const postCenterDot = postFrame.find((dot) => (
      Math.abs(dot.x - 100) < 0.6 && Math.abs(dot.y - 100) < 0.6
    ));
    expect(postCenterDot).toBeDefined();
    // New material immediately (green channels), residual still above
    // dormant — not a dormant-only frame.
    expect(postCenterDot?.color.startsWith("rgba(0, 255, 0,")).toBe(true);
    const postCenter = parseColorAlpha(postCenterDot!.color);
    expect(postCenter).toBeGreaterThan(0.2);
    expect(postCenter).toBeLessThan(0.3);
    // Continuity: the residual's decay continues exactly (curve factor
    // 52ms/48ms into the reduced timeline).
    const decayed = 0.16 + (preCenter - 0.16)
      * resolveDotResponseCurve(52, DOT_REDUCED_MOTION_DURATION_MS)
      / resolveDotResponseCurve(48, DOT_REDUCED_MOTION_DURATION_MS);
    expect(postCenter).toBeCloseTo(decayed, 2);

    // The residual completes on its reduced timeline; the runtime settles
    // dormant with zero pending frames (no normal-mode afterglow).
    while (runtime.getPendingFrameCount() > 0) {
      scheduler.flush(4);
    }
    expect(alphaNear(recording.getLastFrame(), 100, 100)).toBe(0.16);
    expect(runtime.getPendingFrameCount()).toBe(0);
    expect(scheduler.countPending()).toBe(0);
  });

  it("a reduced-motion flip with a live residual settles within the reduced duration, preserving brightness and shape", () => {
    const { scheduler, recording, runtime } = createHarness();
    runtime.wake(BLACK_MATERIAL);
    runtime.submitIntent(CENTER_INTENT);
    scheduler.flush(16);
    scheduler.flush(16); // active elapsed = 32ms
    runtime.submitIntent(CORNER_INTENT); // fold: residual = center field, dur 448
    scheduler.flush(16); // t = 48: residual elapsed 16ms

    const preFrame = recording.getLastFrame();
    const preCenter = alphaNear(preFrame, 100, 100);
    const preNear = alphaNear(preFrame, 100, 113.33);
    const preRatio = (preNear - 0.16) / (preCenter - 0.16);

    const flipAt = scheduler.now();
    runtime.setBaseline({ ...BLACK_MATERIAL, reducedMotion: true });

    // First post-flip frame: the residual keeps its brightness (local decay,
    // no hard cut, no fake completion).
    scheduler.flush(16); // t = 64: residual elapsed 16/90
    expect(alphaNear(recording.getLastFrame(), 100, 100)).toBeGreaterThan(0.4);

    // The frozen shape decays unchanged (same strength ratio as the pre-flip
    // frame): the residual is never re-shaped by any travelling policy.
    const midCenter = alphaNear(recording.getLastFrame(), 100, 100);
    const midNear = alphaNear(recording.getLastFrame(), 100, 113.33);
    expect((midNear - 0.16) / (midCenter - 0.16)).toBeCloseTo(preRatio, 2);

    // Full settle: dormant within one frame of the reduced-motion duration,
    // zero pending frames, no normal-mode afterglow.
    while (runtime.getPendingFrameCount() > 0) {
      scheduler.flush(16);
    }
    const settleElapsed = scheduler.now() - flipAt;
    expect(settleElapsed).toBeLessThanOrEqual(DOT_REDUCED_MOTION_DURATION_MS + 16);
    expect(alphaNear(recording.getLastFrame(), 100, 100)).toBe(0.16);
    expect(runtime.getActiveIntent()).toBeNull();
    expect(runtime.getPendingFrameCount()).toBe(0);
    expect(scheduler.countPending()).toBe(0);
  });

  it("drops intents while sleeping and never replays them after wake", () => {
    const { scheduler, recording, runtime } = createHarness();
    runtime.wake(BLACK_MATERIAL);
    runtime.sleep();
    recording.reset();

    runtime.submitIntent(CENTER_INTENT);
    expect(runtime.getPendingFrameCount()).toBe(0);
    expect(scheduler.countPending()).toBe(0);

    runtime.wake(BLACK_MATERIAL);
    expect(runtime.getPendingFrameCount()).toBe(0);
    expect(runtime.getActiveIntent()).toBeNull();
    // Wake draws the dormant grid only — no transient replay.
    const interior = recording.getDots().filter((dot) => (
      dot.x > SIZE * 0.2 && dot.x < SIZE * 0.8 && dot.y > SIZE * 0.2 && dot.y < SIZE * 0.8
    ));
    expect(interior.length).toBeGreaterThan(0);
    expect(interior.every((dot) => parseColorAlpha(dot.color) === 0.16)).toBe(true);
  });
});

describe("Dot Field runtime: soft propagation front", () => {
  // The 200px grid has a dot exactly at (100, 100) and one a grid step away
  // at (100, 113.33) — both interior (edge factor 1), distances 0 and 13.33
  // from a center intent. Rendered alpha = 0.16 + 0.56 * transient (edge 1).
  const CENTER_X = 100;
  const NEAR_Y = 100;
  const FAR_Y = 113.33;

  it("normal motion propagates a soft front with afterglow: near dots lead, the crest passes, then dims", () => {
    const { scheduler, recording, runtime } = createHarness();
    runtime.wake(BLACK_MATERIAL);
    runtime.submitIntent(CENTER_INTENT);

    // Early (16ms): the front has just left the origin — the near dot leads.
    scheduler.flush(16);
    const earlyNear = alphaNear(recording.getLastFrame(), CENTER_X, NEAR_Y);
    const earlyFar = alphaNear(recording.getLastFrame(), CENTER_X, FAR_Y);
    expect(earlyNear).toBeGreaterThan(earlyFar);

    // Mid-flight (240ms): the crest has passed the far dot; the near dot sits
    // in deeper afterglow, so the far dot is now the brighter one.
    for (let frame = 0; frame < 14; frame += 1) {
      scheduler.flush(16);
    }
    const midNear = alphaNear(recording.getLastFrame(), CENTER_X, NEAR_Y);
    const midFar = alphaNear(recording.getLastFrame(), CENTER_X, FAR_Y);
    expect(midFar).toBeGreaterThan(midNear);
    // The far dot rose RELATIVE to the near dot as the wave travelled
    // (normalize away the global decay curve).
    const earlyRatio = (earlyFar - 0.16) / (earlyNear - 0.16);
    const midRatio = (midFar - 0.16) / (midNear - 0.16);
    expect(midRatio).toBeGreaterThan(earlyRatio);
    expect(midRatio).toBeGreaterThan(1);
  });

  it("reduced motion does not travel: distance shapes nothing, the localized bloom keeps the pure strength ratio", () => {
    const { scheduler, recording, runtime } = createHarness();
    runtime.wake({ ...BLACK_MATERIAL, reducedMotion: true });
    runtime.submitIntent(CENTER_INTENT);
    scheduler.flush(16);

    const near = alphaNear(recording.getLastFrame(), CENTER_X, NEAR_Y);
    const far = alphaNear(recording.getLastFrame(), CENTER_X, FAR_Y);
    // Ratio of rendered acknowledgement equals the pure strength ratio
    // (0.955 at 13.33px), because the envelope is 1 for every dot — no travel.
    const ratio = (far - 0.16) / (near - 0.16);
    expect(ratio).toBeCloseTo(0.9551, 1);
    // Contrast with normal motion, where the same geometry gives ~0.5 early on.
    const normal = createHarness();
    normal.runtime.wake(BLACK_MATERIAL);
    normal.runtime.submitIntent(CENTER_INTENT);
    normal.scheduler.flush(16);
    const normalNear = alphaNear(normal.recording.getLastFrame(), CENTER_X, NEAR_Y);
    const normalFar = alphaNear(normal.recording.getLastFrame(), CENTER_X, FAR_Y);
    const normalRatio = (normalFar - 0.16) / (normalNear - 0.16);
    expect(normalRatio).toBeLessThan(ratio);
    expect(normalRatio).toBeLessThan(0.7);
  });

  it("boundary absorption: a dot in the outer fade band renders DARKER than a farther interior dot", () => {
    const { scheduler, recording, runtime } = createHarness();
    runtime.wake(BLACK_MATERIAL);
    runtime.submitIntent(CORNER_INTENT); // origin (0.08, 0.08) -> (16, 16)
    scheduler.flush(16);

    // (20, 6.67): 10.2px from the origin but in the outer fade band
    // (edge factor 0.167) — the wave is absorbed at the boundary.
    const edgeBand = alphaNear(recording.getLastFrame(), 20, 6.67);
    // (33.33, 20): FARTHER from the origin (17.8px, weaker strength) but
    // interior (edge factor 0.5) — renders brighter anyway.
    const interior = alphaNear(recording.getLastFrame(), 33.33, 20);
    expect(interior).toBeGreaterThan(edgeBand);
    expect(edgeBand).toBeGreaterThan(0);
  });
});

describe("Dot Field runtime: sleep, dispose, and stale generations", () => {
  it("sleep cancels the pending frame and invalidates queued callbacks", () => {
    const { scheduler, recording, runtime } = createHarness();
    runtime.wake(BLACK_MATERIAL);
    runtime.submitIntent(CENTER_INTENT);
    expect(scheduler.countPending()).toBe(1);

    runtime.sleep();
    expect(runtime.getState()).toBe("sleeping");
    expect(runtime.getPendingFrameCount()).toBe(0);
    expect(runtime.getActiveIntent()).toBeNull();

    // The queued callback is stale: flushing draws nothing.
    const dotsBefore = recording.getDots().length;
    scheduler.flush(16);
    expect(recording.getDots().length).toBe(dotsBefore);
    expect(scheduler.isCancelled(1)).toBe(true);
  });

  it("wake after sleep rebuilds from current inputs and draws once", () => {
    const { recording, runtime } = createHarness();
    runtime.wake(BLACK_MATERIAL);
    runtime.submitIntent(CENTER_INTENT);
    runtime.sleep();
    recording.reset();

    runtime.wake({ ...BLACK_MATERIAL, ack: "rgba(255,255,255,0.9)" });
    expect(runtime.getState()).toBe("awake");
    expect(runtime.getPendingFrameCount()).toBe(0);
    expect(runtime.getPeakAt(Math.floor(runtime.getDotCount() / 2))).toBe(0);
    expect(recording.getClears()).toBe(1);
  });

  it("dispose is permanent: all later calls are stale no-ops", () => {
    const { scheduler, recording, runtime } = createHarness();
    runtime.wake(BLACK_MATERIAL);
    runtime.submitIntent(CENTER_INTENT);

    runtime.dispose();
    expect(runtime.getState()).toBe("disposed");
    expect(runtime.getPendingFrameCount()).toBe(0);
    expect(runtime.getDotCount()).toBe(0);

    const dotsBefore = recording.getDots().length;
    runtime.wake(BLACK_MATERIAL);
    runtime.setBaseline(BLACK_MATERIAL);
    runtime.submitIntent(CENTER_INTENT);
    runtime.sleep();
    scheduler.flush(16);
    expect(runtime.getState()).toBe("disposed");
    expect(runtime.getPendingFrameCount()).toBe(0);
    expect(recording.getDots().length).toBe(dotsBefore);
  });

  it("keeps at most one pending frame through a mixed burst", () => {
    const { scheduler, runtime } = createHarness();
    runtime.wake(BLACK_MATERIAL);
    let maxPending = 0;
    for (let burst = 0; burst < 10; burst += 1) {
      runtime.submitIntent(burst % 2 === 0 ? CENTER_INTENT : CORNER_INTENT);
      scheduler.flush(16);
      scheduler.flush(16);
      maxPending = Math.max(maxPending, runtime.getPendingFrameCount());
    }
    expect(maxPending).toBeLessThanOrEqual(1);
    while (runtime.getPendingFrameCount() > 0) {
      scheduler.flush(16);
    }
    expect(runtime.getPendingFrameCount()).toBe(0);
  });
});
