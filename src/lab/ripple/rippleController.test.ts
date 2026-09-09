import { describe, expect, it } from "vitest";
import { createRippleController } from "./rippleController";

const scheduler = () => {
  let now = 0;
  let nextId = 0;
  const callbacks = new Map<number, (timestamp: number) => void>();
  return {
    api: {
      now: () => now,
      requestFrame: (callback: (timestamp: number) => void) => { const id = ++nextId; callbacks.set(id, callback); return id; },
      cancelFrame: (id: number) => callbacks.delete(id),
    },
    advance: (milliseconds: number) => { now += milliseconds; const pending = [...callbacks.entries()]; callbacks.clear(); pending.forEach(([, callback]) => callback(now)); },
    pending: () => callbacks.size,
  };
};

describe("Ripple Lab controller", () => {
  it("owns one pending frame and settles the target after the source duration", () => {
    const clock = scheduler();
    const frames: number[] = [];
    const controller = createRippleController({ scheduler: clock.api, onFrame: (frame) => frames.push(frame.rawPhase) });
    controller.start({ x: 0.5, y: 0.5 });
    expect(clock.pending()).toBe(1);
    clock.advance(700);
    expect(clock.pending()).toBe(1);
    clock.advance(700);
    expect(clock.pending()).toBe(0);
    expect(controller.snapshot().rawPhase).toBe(1);
    expect(frames[frames.length - 1]).toBe(1);
  });

  it("invalidates a stale generation on replacement and keeps the latest origin", () => {
    const clock = scheduler();
    const controller = createRippleController({ scheduler: clock.api, onFrame: () => undefined });
    controller.start({ x: 0.5, y: 0.5 });
    controller.replace({ x: 0.04, y: 0.96 });
    expect(clock.pending()).toBe(1);
    clock.advance(16);
    expect(controller.snapshot().origin).toEqual({ x: 0.04, y: 0.96 });
  });

  it("supports reverse, explicit cancel settlement, clamped origins, and disposal", () => {
    const clock = scheduler();
    const controller = createRippleController({ scheduler: clock.api, onFrame: () => undefined });
    controller.start({ x: Infinity, y: -1 });
    expect(controller.snapshot().origin).toEqual({ x: 0.5, y: 0 });
    clock.advance(300);
    controller.reverse();
    clock.advance(300);
    expect(controller.snapshot().rawPhase).toBe(0);
    controller.start({ x: 0.2, y: 0.8 });
    controller.cancel("target");
    expect(controller.snapshot().rawPhase).toBe(1);
    expect(clock.pending()).toBe(0);
    controller.dispose();
    expect(clock.pending()).toBe(0);
  });

  it("keeps the one scene as both ends of a single-scene transition", () => {
    const clock = scheduler();
    const controller = createRippleController({ scheduler: clock.api, onFrame: () => undefined });
    controller.start({ x: 0.5, y: 0.5 });
    expect(controller.snapshot().origin).toEqual({ x: 0.5, y: 0.5 });
    controller.cancel("target");
    controller.replace({ x: 0.2, y: 0.8 });
    expect(controller.snapshot().origin).toEqual({ x: 0.2, y: 0.8 });
  });

  it("settles Reduced Motion synchronously without scheduling a frame", () => {
    const clock = scheduler();
    const controller = createRippleController({
      reducedMotion: true,
      scheduler: clock.api,
      onFrame: () => undefined,
    });
    controller.start({ x: 0.5, y: 0.5 });
    expect(controller.snapshot().rawPhase).toBe(1);
    expect(clock.pending()).toBe(0);
  });
});
