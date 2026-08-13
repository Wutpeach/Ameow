// Character blink runtime: the one deterministic low-duty-cycle timer for the
// compact Flat Blob Cat. Consumer-local leaf: pure timing only. The host
// injects the timer scheduler and the blink action, so Node tests exercise the
// whole lifecycle with a fake scheduler and no DOM.
//
// Contract:
//   - at most ONE pending timer while started;
//   - start() schedules the next blink; the callback fires the injected
//     blink action and re-schedules only while the same generation lives;
//   - stop() cancels the pending timer and invalidates the generation so a
//     queued callback cannot blink or re-schedule (sleep/hidden);
//   - dispose() is permanent; every later call and callback is a no-op;
//   - the host owns the short Motion animation itself and stops it on
//     stop/dispose; this module never touches the animation control.

export const CHARACTER_BLINK_INTERVAL_MS = 3600;

export type CharacterBlinkScheduler = {
  schedule: (callback: () => void, delayMs: number) => number;
  cancel: (handle: number) => void;
};

export type CharacterBlinkRuntimeHandle = {
  start: () => void;
  stop: () => void;
  dispose: () => void;
  getPendingTimerCount: () => number;
  isStarted: () => boolean;
};

export const createCharacterBlinkRuntime = (dependencies: {
  scheduler: CharacterBlinkScheduler;
  onBlink: () => void;
}): CharacterBlinkRuntimeHandle => {
  const { scheduler, onBlink } = dependencies;
  let generation = 0;
  let pendingTimer: number | null = null;
  let started = false;
  let disposed = false;

  const scheduleNextBlink = (): void => {
    if (disposed || !started || pendingTimer !== null) {
      return;
    }
    const localGeneration = generation;
    pendingTimer = scheduler.schedule(() => {
      pendingTimer = null;
      if (disposed || !started || generation !== localGeneration) {
        // Stale generation (stopped/disposed while queued): no blink, no
        // re-schedule.
        return;
      }
      onBlink();
      scheduleNextBlink();
    }, CHARACTER_BLINK_INTERVAL_MS);
  };

  const start = (): void => {
    if (disposed || started) {
      return;
    }
    started = true;
    scheduleNextBlink();
  };

  const stop = (): void => {
    if (disposed || !started) {
      return;
    }
    started = false;
    generation += 1;
    if (pendingTimer !== null) {
      scheduler.cancel(pendingTimer);
      pendingTimer = null;
    }
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    started = false;
    generation += 1;
    if (pendingTimer !== null) {
      scheduler.cancel(pendingTimer);
      pendingTimer = null;
    }
  };

  return {
    start,
    stop,
    dispose,
    getPendingTimerCount: () => (pendingTimer === null ? 0 : 1),
    isStarted: () => started,
  };
};
