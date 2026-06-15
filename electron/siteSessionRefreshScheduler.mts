import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
  SiteSessionRegistryEntry,
  SiteSessionState,
} from "../src/types/siteSession.js";
import type { SiteSessionManager } from "./siteSessionManager.mjs";

export const SITE_SESSION_AUTO_REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
export const SITE_SESSION_AUTO_REFRESH_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const SITE_SESSION_AUTO_REFRESH_STARTUP_DELAY_MS = 30 * 1000;
export const SITE_SESSION_AUTO_REFRESH_BACKOFF_MS = [
  15 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
] as const;
export const SITE_SESSION_AUTO_REFRESH_TIMEOUT_MS = 30 * 1000;
export const SITE_SESSION_AUTO_REFRESH_STATE_VERSION = 1;

type SiteSessionAutoRefreshSiteState = {
  lastAttemptAtMs: number | null;
  lastSuccessAtMs: number | null;
  nextAttemptAfterMs: number | null;
  failureCount: number;
  lastError: string | null;
};

type StoredSiteSessionAutoRefreshState = {
  version: 1;
  sites: Record<string, SiteSessionAutoRefreshSiteState>;
};

type RefreshReason =
  | "scheduled"
  | "startup"
  | "extension_connected"
  | "advanced_quality"
  | "auth_required"
  | "manual";

export type SiteSessionRefreshSchedulerOptions = {
  getUserDataDir(): string;
  listSiteSessionEntries(): SiteSessionRegistryEntry[];
  getSiteSessionManager(siteId: string): SiteSessionManager | null;
  getConnectedExtensionClientCount(): number;
  refreshSiteSession(siteId: string, manager: SiteSessionManager): Promise<SiteSessionState>;
  now?(): number;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  startupDelayMs?: number;
  checkIntervalMs?: number;
  refreshTtlMs?: number;
  refreshTimeoutMs?: number;
  log?(message: string, details?: unknown): void;
};

export type SiteSessionRefreshScheduler = {
  start(): void;
  stop(): void;
  checkDueSessions(reason?: RefreshReason): Promise<void>;
  ensureRefreshed(
    siteId: string,
    options?: {
      reason?: RefreshReason;
      force?: boolean;
      timeoutMs?: number;
      onlyIfDue?: boolean;
      bypassEligibility?: boolean;
    },
  ): Promise<SiteSessionState | null>;
  markSuccess(siteId: string): void;
  markFailure(siteId: string, error: unknown): void;
  isRefreshDue(
    entry: SiteSessionRegistryEntry,
    state: SiteSessionState,
  ): boolean;
  getRefreshState(siteId: string): SiteSessionAutoRefreshSiteState | null;
};

const emptyRefreshState = (): StoredSiteSessionAutoRefreshState => ({
  version: SITE_SESSION_AUTO_REFRESH_STATE_VERSION,
  sites: {},
});

const refreshStateFilePath = (userDataDir: string): string => (
  join(userDataDir, "site-sessions", "refresh-state.json")
);

const normalizeNullableNumber = (value: unknown): number | null => (
  Number.isFinite(value) ? Number(value) : null
);

const normalizeSiteState = (value: unknown): SiteSessionAutoRefreshSiteState | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  return {
    lastAttemptAtMs: normalizeNullableNumber(record.lastAttemptAtMs),
    lastSuccessAtMs: normalizeNullableNumber(record.lastSuccessAtMs),
    nextAttemptAfterMs: normalizeNullableNumber(record.nextAttemptAfterMs),
    failureCount: Math.max(0, Math.floor(Number(record.failureCount) || 0)),
    lastError: typeof record.lastError === "string" && record.lastError.trim()
      ? record.lastError.trim()
      : null,
  };
};

const loadRefreshState = (filePath: string): StoredSiteSessionAutoRefreshState => {
  if (!existsSync(filePath)) {
    return emptyRefreshState();
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return emptyRefreshState();
    }
    const rawSites = (parsed as { sites?: unknown }).sites;
    if (!rawSites || typeof rawSites !== "object" || Array.isArray(rawSites)) {
      return emptyRefreshState();
    }

    const sites: Record<string, SiteSessionAutoRefreshSiteState> = {};
    for (const [siteId, rawState] of Object.entries(rawSites)) {
      const normalizedSiteId = siteId.trim();
      const state = normalizeSiteState(rawState);
      if (normalizedSiteId && state) {
        sites[normalizedSiteId] = state;
      }
    }
    return {
      version: SITE_SESSION_AUTO_REFRESH_STATE_VERSION,
      sites,
    };
  } catch {
    return emptyRefreshState();
  }
};

const persistRefreshState = (
  filePath: string,
  state: StoredSiteSessionAutoRefreshState,
): void => {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempFilePath = `${filePath}.tmp`;
  writeFileSync(tempFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  renameSync(tempFilePath, filePath);
};

const summarizeError = (error: unknown): string => (
  error instanceof Error && error.message ? error.message : String(error ?? "unknown error")
);

const resolveBackoffMs = (failureCount: number): number => {
  const index = Math.min(
    Math.max(0, failureCount - 1),
    SITE_SESSION_AUTO_REFRESH_BACKOFF_MS.length - 1,
  );
  return SITE_SESSION_AUTO_REFRESH_BACKOFF_MS[index] ?? SITE_SESSION_AUTO_REFRESH_BACKOFF_MS[0];
};

const isAuthorizedForAutoRefresh = (entry: SiteSessionRegistryEntry): boolean => (
  entry.autoSyncAllowed === true
  && (entry.syncAuthorization === "seeded" || entry.syncAuthorization === "user_enabled")
);

const hasUserActivatedSync = (entry: SiteSessionRegistryEntry): boolean => (
  entry.discoverySources.includes("user_sync")
);

const withTimeout = async <TResult,>(
  promise: Promise<TResult>,
  options: {
    timeoutMs: number;
    siteId: string;
    setTimeoutFn: typeof setTimeout;
    clearTimeoutFn: typeof clearTimeout;
  },
): Promise<TResult> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<TResult>((_resolve, reject) => {
    timeoutId = options.setTimeoutFn(() => {
      reject(new Error(`Timed out refreshing site session for ${options.siteId}`));
    }, options.timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) {
      options.clearTimeoutFn(timeoutId);
    }
  });
};

export const createSiteSessionRefreshScheduler = (
  options: SiteSessionRefreshSchedulerOptions,
): SiteSessionRefreshScheduler => {
  const now = options.now ?? Date.now;
  const setTimeoutFn = options.setTimeout ?? setTimeout;
  const clearTimeoutFn = options.clearTimeout ?? clearTimeout;
  const setIntervalFn = options.setInterval ?? setInterval;
  const clearIntervalFn = options.clearInterval ?? clearInterval;
  const startupDelayMs = options.startupDelayMs ?? SITE_SESSION_AUTO_REFRESH_STARTUP_DELAY_MS;
  const checkIntervalMs = options.checkIntervalMs ?? SITE_SESSION_AUTO_REFRESH_CHECK_INTERVAL_MS;
  const refreshTtlMs = options.refreshTtlMs ?? SITE_SESSION_AUTO_REFRESH_TTL_MS;
  const refreshTimeoutMs = options.refreshTimeoutMs ?? SITE_SESSION_AUTO_REFRESH_TIMEOUT_MS;
  const filePath = refreshStateFilePath(options.getUserDataDir());
  let refreshState: StoredSiteSessionAutoRefreshState | null = null;
  let startupTimer: ReturnType<typeof setTimeout> | null = null;
  let intervalTimer: ReturnType<typeof setInterval> | null = null;
  const inFlightRefreshes = new Map<string, Promise<SiteSessionState | null>>();

  const ensureRefreshStateLoaded = (): StoredSiteSessionAutoRefreshState => {
    refreshState ??= loadRefreshState(filePath);
    return refreshState;
  };

  const persistLoadedState = (): void => {
    persistRefreshState(filePath, ensureRefreshStateLoaded());
  };

  const getSiteRefreshState = (siteId: string): SiteSessionAutoRefreshSiteState | null => (
    ensureRefreshStateLoaded().sites[siteId] ?? null
  );

  const markSuccess = (siteId: string): void => {
    const state = ensureRefreshStateLoaded();
    state.sites[siteId] = {
      lastAttemptAtMs: now(),
      lastSuccessAtMs: now(),
      nextAttemptAfterMs: null,
      failureCount: 0,
      lastError: null,
    };
    persistLoadedState();
  };

  const markFailure = (siteId: string, error: unknown): void => {
    const state = ensureRefreshStateLoaded();
    const previous = state.sites[siteId];
    const failureCount = (previous?.failureCount ?? 0) + 1;
    const timestamp = now();
    state.sites[siteId] = {
      lastAttemptAtMs: timestamp,
      lastSuccessAtMs: previous?.lastSuccessAtMs ?? null,
      nextAttemptAfterMs: timestamp + resolveBackoffMs(failureCount),
      failureCount,
      lastError: summarizeError(error),
    };
    persistLoadedState();
  };

  const isRefreshDue = (
    entry: SiteSessionRegistryEntry,
    state: SiteSessionState,
  ): boolean => {
    if (!isAuthorizedForAutoRefresh(entry)) {
      return false;
    }
    if (state.updatedAtMs === null && !hasUserActivatedSync(entry)) {
      return false;
    }
    const siteRefreshState = getSiteRefreshState(entry.siteId);
    if (
      typeof siteRefreshState?.nextAttemptAfterMs === "number"
      && now() < siteRefreshState.nextAttemptAfterMs
    ) {
      return false;
    }
    if (typeof state.updatedAtMs !== "number") {
      return true;
    }
    return now() - state.updatedAtMs >= refreshTtlMs;
  };

  const refreshEntry = async (
    entry: SiteSessionRegistryEntry,
    refreshOptions: {
      reason: RefreshReason;
      force: boolean;
      timeoutMs: number;
      onlyIfDue: boolean;
      bypassEligibility: boolean;
    },
  ): Promise<SiteSessionState | null> => {
    const manager = options.getSiteSessionManager(entry.siteId);
    if (!manager) {
      options.log?.("auto-refresh skipped: manager missing", {
        siteId: entry.siteId,
        reason: refreshOptions.reason,
      });
      return null;
    }

    if (options.getConnectedExtensionClientCount() <= 0) {
      options.log?.("auto-refresh skipped: extension disconnected", {
        siteId: entry.siteId,
        reason: refreshOptions.reason,
      });
      return null;
    }

    if (!refreshOptions.bypassEligibility && !isAuthorizedForAutoRefresh(entry)) {
      options.log?.("auto-refresh skipped: sync not authorized", {
        siteId: entry.siteId,
        reason: refreshOptions.reason,
        authorization: entry.syncAuthorization,
      });
      return null;
    }

    const currentState = await manager.getState();
    if (
      refreshOptions.onlyIfDue
      && !refreshOptions.force
      && !isRefreshDue(entry, currentState)
    ) {
      options.log?.("auto-refresh skipped: not due", {
        siteId: entry.siteId,
        reason: refreshOptions.reason,
        updatedAtMs: currentState.updatedAtMs,
      });
      return null;
    }

    options.log?.("auto-refresh started", {
      siteId: entry.siteId,
      reason: refreshOptions.reason,
    });
    try {
      const nextState = await withTimeout(
        options.refreshSiteSession(entry.siteId, manager),
        {
          timeoutMs: refreshOptions.timeoutMs,
          siteId: entry.siteId,
          setTimeoutFn,
          clearTimeoutFn,
        },
      );
      markSuccess(entry.siteId);
      options.log?.("auto-refresh succeeded", {
        siteId: entry.siteId,
        reason: refreshOptions.reason,
      });
      return nextState;
    } catch (error) {
      markFailure(entry.siteId, error);
      options.log?.("auto-refresh failed", {
        siteId: entry.siteId,
        reason: refreshOptions.reason,
        error: summarizeError(error),
      });
      throw error;
    }
  };

  const ensureRefreshed: SiteSessionRefreshScheduler["ensureRefreshed"] = async (
    siteId,
    refreshOptions = {},
  ) => {
    const normalizedSiteId = siteId.trim();
    if (!normalizedSiteId) {
      return null;
    }
    const inFlight = inFlightRefreshes.get(normalizedSiteId);
    if (inFlight) {
      options.log?.("auto-refresh joining in-flight refresh", {
        siteId: normalizedSiteId,
        reason: refreshOptions.reason ?? "scheduled",
      });
      return await (refreshOptions.timeoutMs
        ? withTimeout(inFlight, {
            timeoutMs: refreshOptions.timeoutMs,
            siteId: normalizedSiteId,
            setTimeoutFn,
            clearTimeoutFn,
          })
        : inFlight);
    }

    const entry = options.listSiteSessionEntries()
      .find((candidate) => candidate.siteId === normalizedSiteId);
    if (!entry) {
      options.log?.("auto-refresh skipped: registry entry missing", {
        siteId: normalizedSiteId,
        reason: refreshOptions.reason ?? "scheduled",
      });
      return null;
    }

    const refreshPromise = refreshEntry(entry, {
      reason: refreshOptions.reason ?? "scheduled",
      force: refreshOptions.force === true,
      timeoutMs: refreshTimeoutMs,
      onlyIfDue: refreshOptions.onlyIfDue !== false,
      bypassEligibility: refreshOptions.bypassEligibility === true,
    }).finally(() => {
      if (inFlightRefreshes.get(normalizedSiteId) === refreshPromise) {
        inFlightRefreshes.delete(normalizedSiteId);
      }
    });

    inFlightRefreshes.set(normalizedSiteId, refreshPromise);
    return await (refreshOptions.timeoutMs
      ? withTimeout(refreshPromise, {
          timeoutMs: refreshOptions.timeoutMs,
          siteId: normalizedSiteId,
          setTimeoutFn,
          clearTimeoutFn,
        })
      : refreshPromise);
  };

  const checkDueSessions: SiteSessionRefreshScheduler["checkDueSessions"] = async (
    reason = "scheduled",
  ) => {
    if (options.getConnectedExtensionClientCount() <= 0) {
      options.log?.("auto-refresh check skipped: extension disconnected", { reason });
      return;
    }

    const entries = options.listSiteSessionEntries();
    const refreshes: Promise<SiteSessionState | null>[] = [];
    for (const entry of entries) {
      const manager = options.getSiteSessionManager(entry.siteId);
      if (!manager) {
        continue;
      }
      const currentState = await manager.getState();
      if (!isRefreshDue(entry, currentState)) {
        continue;
      }
      refreshes.push(ensureRefreshed(entry.siteId, { reason, onlyIfDue: true })
        .catch(() => null));
    }

    await Promise.all(refreshes);
  };

  return {
    start() {
      if (startupTimer || intervalTimer) {
        return;
      }
      startupTimer = setTimeoutFn(() => {
        startupTimer = null;
        void checkDueSessions("startup");
      }, startupDelayMs);
      intervalTimer = setIntervalFn(() => {
        void checkDueSessions("scheduled");
      }, checkIntervalMs);
    },
    stop() {
      if (startupTimer) {
        clearTimeoutFn(startupTimer);
        startupTimer = null;
      }
      if (intervalTimer) {
        clearIntervalFn(intervalTimer);
        intervalTimer = null;
      }
    },
    checkDueSessions,
    ensureRefreshed,
    markSuccess,
    markFailure,
    isRefreshDue,
    getRefreshState: getSiteRefreshState,
  };
};
