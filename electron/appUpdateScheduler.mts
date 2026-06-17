import type { ElectronAppUpdateInfo } from "./appUpdateController.mjs";

export const APP_UPDATE_STARTUP_CHECK_DELAY_MS = 60 * 1000;
export const APP_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const APP_UPDATE_CHECK_BACKOFF_MS = [
  15 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
] as const;

export type AppUpdateCheckReason =
  | "startup"
  | "interval"
  | "manual"
  | "preference_changed";

export type AppUpdateSchedulerPhase =
  | "idle"
  | "checking"
  | "available"
  | "error";

export type AppUpdateSchedulerState = {
  info: ElectronAppUpdateInfo | null;
  phase: AppUpdateSchedulerPhase;
  checkedAtMs: number | null;
  error: string | null;
  source: AppUpdateCheckReason | null;
};

type CheckForAppUpdateOptions = {
  preservePendingOnNoUpdate?: boolean;
  preservePendingOnError?: boolean;
  throwOnError?: boolean;
};

type AppUpdateSchedulerOptions = {
  shouldRun(): boolean;
  checkForAppUpdate(options?: CheckForAppUpdateOptions): Promise<ElectronAppUpdateInfo | null>;
  emitState(state: AppUpdateSchedulerState): void;
  now?(): number;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  startupDelayMs?: number;
  checkIntervalMs?: number;
  backoffMs?: readonly number[];
  log?(message: string, details?: unknown): void;
};

export type AppUpdateScheduler = {
  start(): void;
  stop(): void;
  checkNow(reason: AppUpdateCheckReason): Promise<ElectronAppUpdateInfo | null>;
  getState(): AppUpdateSchedulerState;
};

const summarizeError = (error: unknown): string => (
  error instanceof Error && error.message ? error.message : String(error ?? "unknown error")
);

const cloneState = (state: AppUpdateSchedulerState): AppUpdateSchedulerState => ({
  ...state,
  info: state.info ? { ...state.info } : null,
});

const isQuietReason = (reason: AppUpdateCheckReason): boolean => reason !== "manual";

const preservesDiscoveredUpdate = (reason: AppUpdateCheckReason): boolean => (
  reason === "startup" || reason === "interval"
);

const resolveBackoffMs = (
  failureCount: number,
  backoffMs: readonly number[],
): number => {
  const index = Math.min(Math.max(0, failureCount - 1), backoffMs.length - 1);
  return backoffMs[index] ?? APP_UPDATE_CHECK_BACKOFF_MS[0];
};

export const createAppUpdateScheduler = (
  options: AppUpdateSchedulerOptions,
): AppUpdateScheduler => {
  const now = options.now ?? Date.now;
  const setTimeoutFn = options.setTimeout ?? setTimeout;
  const clearTimeoutFn = options.clearTimeout ?? clearTimeout;
  const startupDelayMs = options.startupDelayMs ?? APP_UPDATE_STARTUP_CHECK_DELAY_MS;
  const checkIntervalMs = options.checkIntervalMs ?? APP_UPDATE_CHECK_INTERVAL_MS;
  const backoffMs = options.backoffMs ?? APP_UPDATE_CHECK_BACKOFF_MS;
  let started = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<ElectronAppUpdateInfo | null> | null = null;
  let pendingImmediateReason: AppUpdateCheckReason | null = null;
  let backgroundFailureCount = 0;
  let state: AppUpdateSchedulerState = {
    info: null,
    phase: "idle",
    checkedAtMs: null,
    error: null,
    source: null,
  };

  const emitState = (): void => {
    options.emitState(cloneState(state));
  };

  const clearTimer = (): void => {
    if (timer) {
      clearTimeoutFn(timer);
      timer = null;
    }
  };

  const scheduleNext = (reason: "startup" | "interval", delayMs: number): void => {
    if (!started || !options.shouldRun()) {
      return;
    }
    clearTimer();
    timer = setTimeoutFn(() => {
      timer = null;
      void runCheck(reason).catch((error) => {
        options.log?.("background app update interval check failed", {
          error: summarizeError(error),
        });
      });
    }, delayMs);
  };

  const updateCheckingState = (reason: AppUpdateCheckReason): void => {
    state = {
      ...state,
      phase: "checking",
      error: null,
      source: reason,
    };
    emitState();
  };

  const updateSuccessState = (
    reason: AppUpdateCheckReason,
    info: ElectronAppUpdateInfo | null,
  ): void => {
    const nextInfo = info ?? (preservesDiscoveredUpdate(reason) ? state.info : null);
    state = {
      info: nextInfo,
      phase: nextInfo ? "available" : "idle",
      checkedAtMs: now(),
      error: null,
      source: reason,
    };
    emitState();
  };

  const updateErrorState = (
    reason: AppUpdateCheckReason,
    error: unknown,
  ): void => {
    const summary = summarizeError(error);
    state = {
      ...state,
      phase: state.info ? "available" : "idle",
      checkedAtMs: now(),
      error: isQuietReason(reason) ? null : summary,
      source: reason,
    };
    emitState();
  };

  const runCheck = async (
    reason: AppUpdateCheckReason,
  ): Promise<ElectronAppUpdateInfo | null> => {
    if (!options.shouldRun()) {
      updateSuccessState(reason, null);
      return null;
    }

    if (inFlight) {
      if (reason === "preference_changed") {
        pendingImmediateReason = reason;
      }
      return await inFlight;
    }

    updateCheckingState(reason);
    const checkPromise = options.checkForAppUpdate({
      preservePendingOnNoUpdate: preservesDiscoveredUpdate(reason),
      preservePendingOnError: isQuietReason(reason),
      throwOnError: true,
    });
    inFlight = checkPromise;

    try {
      const info = await checkPromise;
      backgroundFailureCount = 0;
      updateSuccessState(reason, info);
      if (started) {
        scheduleNext("interval", checkIntervalMs);
      }
      return info;
    } catch (error) {
      updateErrorState(reason, error);
      if (isQuietReason(reason)) {
        backgroundFailureCount += 1;
        const nextDelayMs = resolveBackoffMs(backgroundFailureCount, backoffMs);
        options.log?.("background app update check failed", {
          reason,
          error: summarizeError(error),
          nextDelayMs,
        });
        scheduleNext("interval", nextDelayMs);
        return null;
      }
      if (started) {
        scheduleNext("interval", checkIntervalMs);
      }
      throw error;
    } finally {
      if (inFlight === checkPromise) {
        inFlight = null;
      }
      const followUpReason = pendingImmediateReason;
      pendingImmediateReason = null;
      if (started && followUpReason) {
        void runCheck(followUpReason).catch((error) => {
          options.log?.("background app update follow-up check failed", {
            reason: followUpReason,
            error: summarizeError(error),
          });
        });
      }
    }
  };

  return {
    start() {
      if (started) {
        return;
      }
      started = true;
      if (!options.shouldRun()) {
        return;
      }
      scheduleNext("startup", startupDelayMs);
    },
    stop() {
      started = false;
      clearTimer();
      pendingImmediateReason = null;
    },
    checkNow(reason) {
      clearTimer();
      return runCheck(reason);
    },
    getState() {
      return cloneState(state);
    },
  };
};
