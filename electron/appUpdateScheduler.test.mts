import { afterEach, describe, expect, it, vi } from "vitest";

import type { ElectronAppUpdateInfo } from "./appUpdateController.mjs";
import {
  APP_UPDATE_CHECK_BACKOFF_MS,
  APP_UPDATE_CHECK_INTERVAL_MS,
  createAppUpdateScheduler,
} from "./appUpdateScheduler.mjs";

const updateInfo = (
  overrides: Partial<ElectronAppUpdateInfo> = {},
): ElectronAppUpdateInfo => ({
  current: "0.3.0",
  latest: "0.3.1",
  notes: "Update notes",
  publishedAt: "2026-06-17T00:00:00Z",
  installMode: "installer",
  manualUrl: "https://example.invalid/Ameow_setup.exe",
  ...overrides,
});

const createDeferred = <TValue,>() => {
  let resolve!: (value: TValue) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<TValue>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("createAppUpdateScheduler", () => {
  it("runs a startup check after the configured delay", async () => {
    vi.useFakeTimers();
    const checkForAppUpdate = vi.fn(async () => updateInfo());
    const emitState = vi.fn();
    const scheduler = createAppUpdateScheduler({
      shouldRun: () => true,
      checkForAppUpdate,
      emitState,
      startupDelayMs: 1000,
      checkIntervalMs: 5000,
    });

    scheduler.start();
    expect(checkForAppUpdate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(999);
    expect(checkForAppUpdate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);
    expect(scheduler.getState()).toMatchObject({
      phase: "available",
      info: { latest: "0.3.1" },
      source: "startup",
    });
    expect(emitState).toHaveBeenCalledWith(expect.objectContaining({
      phase: "available",
      info: expect.objectContaining({ latest: "0.3.1" }),
    }));
  });

  it("schedules normal interval checks after success", async () => {
    vi.useFakeTimers();
    const checkForAppUpdate = vi.fn(async () => null);
    const scheduler = createAppUpdateScheduler({
      shouldRun: () => true,
      checkForAppUpdate,
      emitState: vi.fn(),
      startupDelayMs: 1000,
      checkIntervalMs: 5000,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4999);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(2);
  });

  it("uses capped failure backoff for background checks", async () => {
    vi.useFakeTimers();
    const checkForAppUpdate = vi.fn(async () => {
      throw new Error("network down");
    });
    const scheduler = createAppUpdateScheduler({
      shouldRun: () => true,
      checkForAppUpdate,
      emitState: vi.fn(),
      startupDelayMs: 1000,
      checkIntervalMs: APP_UPDATE_CHECK_INTERVAL_MS,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_BACKOFF_MS[0] - 1);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_BACKOFF_MS[1]);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_BACKOFF_MS[2]);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_BACKOFF_MS[2]);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(5);
  });

  it("resets backoff after a successful check", async () => {
    vi.useFakeTimers();
    let shouldFail = true;
    const checkForAppUpdate = vi.fn(async () => {
      if (shouldFail) {
        throw new Error("network down");
      }
      return null;
    });
    const scheduler = createAppUpdateScheduler({
      shouldRun: () => true,
      checkForAppUpdate,
      emitState: vi.fn(),
      startupDelayMs: 1000,
      checkIntervalMs: 5000,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);

    shouldFail = false;
    await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_BACKOFF_MS[0]);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(2);

    shouldFail = true;
    await vi.advanceTimersByTimeAsync(5000);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_BACKOFF_MS[0]);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(4);
  });

  it("joins overlapping checks without starting a second request", async () => {
    const deferred = createDeferred<ElectronAppUpdateInfo | null>();
    const checkForAppUpdate = vi.fn(() => deferred.promise);
    const scheduler = createAppUpdateScheduler({
      shouldRun: () => true,
      checkForAppUpdate,
      emitState: vi.fn(),
    });

    const first = scheduler.checkNow("manual");
    const second = scheduler.checkNow("interval");
    await Promise.resolve();

    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);
    deferred.resolve(updateInfo());

    await expect(first).resolves.toMatchObject({ latest: "0.3.1" });
    await expect(second).resolves.toMatchObject({ latest: "0.3.1" });
  });

  it("runs one preference-change follow-up after an in-flight check", async () => {
    vi.useFakeTimers();
    const first = createDeferred<ElectronAppUpdateInfo | null>();
    const checkForAppUpdate = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(async () => updateInfo({ latest: "0.3.2" }));
    const scheduler = createAppUpdateScheduler({
      shouldRun: () => true,
      checkForAppUpdate,
      emitState: vi.fn(),
      startupDelayMs: 1000,
      checkIntervalMs: 5000,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1000);
    const preferenceCheck = scheduler.checkNow("preference_changed");
    await Promise.resolve();
    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);

    first.resolve(updateInfo());
    await expect(preferenceCheck).resolves.toMatchObject({ latest: "0.3.1" });
    await Promise.resolve();

    expect(checkForAppUpdate).toHaveBeenCalledTimes(2);
    expect(scheduler.getState()).toMatchObject({
      source: "preference_changed",
      info: { latest: "0.3.2" },
    });
  });

  it("preserves a discovered update across background no-update checks", async () => {
    const checkForAppUpdate = vi.fn()
      .mockResolvedValueOnce(updateInfo())
      .mockResolvedValueOnce(null);
    const scheduler = createAppUpdateScheduler({
      shouldRun: () => true,
      checkForAppUpdate,
      emitState: vi.fn(),
    });

    await expect(scheduler.checkNow("manual")).resolves.toMatchObject({ latest: "0.3.1" });
    await expect(scheduler.checkNow("interval")).resolves.toBeNull();

    expect(scheduler.getState()).toMatchObject({
      phase: "available",
      info: { latest: "0.3.1" },
      source: "interval",
    });
  });

  it("clears a discovered update when a preference-change check finds no update", async () => {
    const checkForAppUpdate = vi.fn()
      .mockResolvedValueOnce(updateInfo())
      .mockResolvedValueOnce(null);
    const scheduler = createAppUpdateScheduler({
      shouldRun: () => true,
      checkForAppUpdate,
      emitState: vi.fn(),
    });

    await expect(scheduler.checkNow("manual")).resolves.toMatchObject({ latest: "0.3.1" });
    await expect(scheduler.checkNow("preference_changed")).resolves.toBeNull();

    expect(scheduler.getState()).toMatchObject({
      phase: "idle",
      info: null,
      source: "preference_changed",
    });
  });

  it("does not schedule checks when unsupported", async () => {
    vi.useFakeTimers();
    const checkForAppUpdate = vi.fn(async () => updateInfo());
    const scheduler = createAppUpdateScheduler({
      shouldRun: () => false,
      checkForAppUpdate,
      emitState: vi.fn(),
      startupDelayMs: 1000,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(checkForAppUpdate).not.toHaveBeenCalled();
  });

  it("clears scheduled timers on stop", async () => {
    vi.useFakeTimers();
    const checkForAppUpdate = vi.fn(async () => updateInfo());
    const scheduler = createAppUpdateScheduler({
      shouldRun: () => true,
      checkForAppUpdate,
      emitState: vi.fn(),
      startupDelayMs: 1000,
    });

    scheduler.start();
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(1000);

    expect(checkForAppUpdate).not.toHaveBeenCalled();
  });
});
