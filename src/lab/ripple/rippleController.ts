import { RIPPLE_USER_BASELINE } from "./rippleSource";

export type RippleOrigin = Readonly<{ x: number; y: number }>;
export type RippleFrame = Readonly<{
  generation: number;
  origin: RippleOrigin;
  rawPhase: number;
  pinchEnabled: boolean;
}>;

type FrameScheduler = Readonly<{
  now: () => number;
  requestFrame: (callback: (now: number) => void) => number;
  cancelFrame: (id: number) => void;
}>;

type RippleControllerOptions = Readonly<{
  reducedMotion?: boolean;
  scheduler?: FrameScheduler;
  onFrame: (frame: RippleFrame) => void;
  onSettled?: (frame: RippleFrame) => void;
}>;

export type RippleController = Readonly<{
  start: (origin: RippleOrigin) => void;
  reverse: () => void;
  replace: (origin: RippleOrigin) => void;
  scrub: (phase: number) => void;
  cancel: (settlement: "from" | "target") => void;
  setPinchEnabled: (enabled: boolean) => void;
  renderNow: () => void;
  dispose: () => void;
  snapshot: () => RippleFrame;
}>;

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);
const safeOrigin = (origin: RippleOrigin): RippleOrigin => ({
  x: Number.isFinite(origin.x) ? clamp01(origin.x) : 0.5,
  y: Number.isFinite(origin.y) ? clamp01(origin.y) : 0.5,
});
const browserScheduler: FrameScheduler = {
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
};

/** Candidate-local Lab authority; the visual leaf receives frames and emits no state. */
export const createRippleController = (options: RippleControllerOptions): RippleController => {
  const scheduler = options.scheduler ?? browserScheduler;
  let generation = 0;
  let origin: RippleOrigin = { x: 0.5, y: 0.5 };
  let rawPhase = 0;
  let direction: -1 | 0 | 1 = 0;
  let startedAt = 0;
  let pendingFrame: number | null = null;
  let pinchEnabled = true;
  let disposed = false;

  const snapshot = (): RippleFrame => ({ generation, origin, rawPhase, pinchEnabled });
  const render = () => { if (!disposed) options.onFrame(snapshot()); };
  const stop = () => {
    if (pendingFrame !== null) scheduler.cancelFrame(pendingFrame);
    pendingFrame = null;
    direction = 0;
  };
  const settle = () => {
    direction = 0;
    pendingFrame = null;
    const frame = snapshot();
    render();
    options.onSettled?.(frame);
  };
  const tick = (timestamp: number, token: number) => {
    if (disposed || token !== generation || direction === 0) return;
    pendingFrame = null;
    const elapsed = Math.max(timestamp - startedAt, 0) / RIPPLE_USER_BASELINE.durationMs;
    rawPhase = clamp01(direction > 0 ? rawPhase + elapsed : rawPhase - elapsed);
    startedAt = timestamp;
    render();
    if (rawPhase === 0 || rawPhase === 1) {
      settle();
      return;
    }
    pendingFrame = scheduler.requestFrame((next) => tick(next, token));
  };
  const animate = (nextDirection: -1 | 1) => {
    stop();
    if (options.reducedMotion) {
      rawPhase = nextDirection > 0 ? 1 : 0;
      settle();
      return;
    }
    direction = nextDirection;
    startedAt = scheduler.now();
    const token = generation;
    pendingFrame = scheduler.requestFrame((next) => tick(next, token));
  };
  const begin = (nextOrigin: RippleOrigin, phase: number, nextDirection: -1 | 1) => {
    stop();
    generation += 1;
    origin = safeOrigin(nextOrigin);
    rawPhase = phase;
    render();
    animate(nextDirection);
  };

  return {
    start: (nextOrigin) => begin(nextOrigin, 0, 1),
    reverse: () => {
      if (direction === 0 && rawPhase === 0) {
        begin(origin, 1, -1);
        return;
      }
      animate(-1);
    },
    replace: (nextOrigin) => begin(nextOrigin, 0, 1),
    scrub: (phase) => {
      stop();
      rawPhase = clamp01(phase);
      render();
    },
    cancel: (settlement) => {
      stop();
      rawPhase = settlement === "target" ? 1 : 0;
      settle();
    },
    setPinchEnabled: (enabled) => {
      pinchEnabled = enabled;
      render();
    },
    renderNow: render,
    dispose: () => { stop(); disposed = true; generation += 1; },
    snapshot,
  };
};
