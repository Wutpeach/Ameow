import { describe, expect, it } from "vitest";
import {
  CHARACTER_BLINK_INTERVAL_MS,
  createCharacterBlinkRuntime,
  type CharacterBlinkScheduler,
} from "./characterBlinkRuntime";

type FakeScheduler = {
  fire: () => void;
  pendingCount: () => number;
};

const createFakeScheduler = (): FakeScheduler & CharacterBlinkScheduler => {
  const queue = new Map<number, () => void>();
  let nextHandle = 1;
  return {
    schedule: (callback) => {
      const handle = nextHandle;
      nextHandle += 1;
      queue.set(handle, callback);
      return handle;
    },
    cancel: (handle) => {
      queue.delete(handle);
    },
    fire: () => {
      const first = [...queue.keys()].sort((a, b) => a - b)[0];
      const callback = queue.get(first);
      if (callback === undefined) {
        throw new Error("no pending timer to fire");
      }
      queue.delete(first);
      callback();
    },
    pendingCount: () => queue.size,
  };
};

describe("createCharacterBlinkRuntime", () => {
  it("schedules at most one pending blink timer while started", () => {
    const scheduler = createFakeScheduler();
    const blinks: number[] = [];
    const runtime = createCharacterBlinkRuntime({
      scheduler,
      onBlink: () => blinks.push(1),
    });
    expect(runtime.getPendingTimerCount()).toBe(0);
    runtime.start();
    expect(runtime.getPendingTimerCount()).toBe(1);
    // The callback fires the blink and re-schedules; still one pending timer.
    scheduler.fire();
    expect(blinks).toHaveLength(1);
    expect(runtime.getPendingTimerCount()).toBe(1);
    // A second start is a no-op (no second timer).
    runtime.start();
    expect(runtime.getPendingTimerCount()).toBe(1);
  });

  it("uses the deterministic low-duty blink interval for every schedule", () => {
    const scheduler = createFakeScheduler();
    const intervals: number[] = [];
    const runtime = createCharacterBlinkRuntime({
      scheduler: {
        schedule: (callback, delayMs) => {
          intervals.push(delayMs);
          return scheduler.schedule(callback, delayMs);
        },
        cancel: scheduler.cancel,
      },
      onBlink: () => undefined,
    });
    runtime.start();
    scheduler.fire();
    scheduler.fire();
    expect(intervals).toEqual([
      CHARACTER_BLINK_INTERVAL_MS,
      CHARACTER_BLINK_INTERVAL_MS,
      CHARACTER_BLINK_INTERVAL_MS,
    ]);
  });

  it("stop cancels the pending timer; restart schedules from current eligibility", () => {
    const scheduler = createFakeScheduler();
    const blinks: number[] = [];
    const runtime = createCharacterBlinkRuntime({
      scheduler,
      onBlink: () => blinks.push(1),
    });
    runtime.start();
    expect(runtime.getPendingTimerCount()).toBe(1);
    runtime.stop();
    expect(runtime.getPendingTimerCount()).toBe(0);
    expect(scheduler.pendingCount()).toBe(0);
    expect(runtime.isStarted()).toBe(false);
    // No timer, no blink while stopped.
    expect(() => scheduler.fire()).toThrow(/no pending timer/);
    expect(blinks).toHaveLength(0);
    // Restart re-arms exactly one future blink.
    runtime.start();
    expect(runtime.isStarted()).toBe(true);
    expect(runtime.getPendingTimerCount()).toBe(1);
    scheduler.fire();
    expect(blinks).toHaveLength(1);
    expect(runtime.getPendingTimerCount()).toBe(1);
  });

  it("stale generation callbacks cannot blink or re-schedule", () => {
    const scheduler = createFakeScheduler();
    const blinks: number[] = [];
    const runtime = createCharacterBlinkRuntime({
      // cancel() is deliberately a no-op so the queued callback survives
      // stop(); the generation guard must reject it when it fires.
      scheduler: {
        schedule: scheduler.schedule,
        cancel: () => undefined,
      },
      onBlink: () => blinks.push(1),
    });
    runtime.start();
    expect(scheduler.pendingCount()).toBe(1);
    runtime.stop(); // generation invalidated; the queued callback remains
    expect(() => scheduler.fire()).not.toThrow();
    expect(blinks).toHaveLength(0); // no blink from the stale callback
    expect(scheduler.pendingCount()).toBe(0); // and no re-schedule
    expect(runtime.getPendingTimerCount()).toBe(0);
  });

  it("dispose is permanent: no blink, no re-schedule, later start is a no-op", () => {
    const scheduler = createFakeScheduler();
    const blinks: number[] = [];
    const runtime = createCharacterBlinkRuntime({
      scheduler,
      onBlink: () => blinks.push(1),
    });
    runtime.start();
    runtime.dispose();
    expect(runtime.getPendingTimerCount()).toBe(0);
    expect(scheduler.pendingCount()).toBe(0);
    runtime.start();
    expect(runtime.isStarted()).toBe(false);
    expect(runtime.getPendingTimerCount()).toBe(0);
    expect(() => scheduler.fire()).toThrow(/no pending timer/);
    expect(blinks).toHaveLength(0);
  });
});
