import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { SiteSessionRegistryEntry, SiteSessionState } from "../src/types/siteSession.js";
import { createSiteSessionRefreshScheduler } from "./siteSessionRefreshScheduler.mjs";
import type { SiteSessionManager } from "./siteSessionManager.mjs";

const tempDirs: string[] = [];
const neverCalledPath = join(tmpdir(), "ameow-site-session-refresh-scheduler-never-called");

const createTempUserDataDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "ameow-site-session-refresh-scheduler-test-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const createEntry = (
  overrides: Partial<SiteSessionRegistryEntry> = {},
): SiteSessionRegistryEntry => ({
  siteId: "youtube",
  displayName: "YouTube",
  primaryUrl: "https://www.youtube.com/",
  primaryHost: "www.youtube.com",
  cookieDomains: ["youtube.com", "google.com"],
  requiredCookieKeys: [],
  loginCookieKeys: ["LOGIN_INFO"],
  syncAuthorization: "seeded",
  autoSyncAllowed: true,
  discoverySources: ["seed", "user_sync"],
  engineHints: ["yt-dlp"],
  visibility: "visible",
  icon: {
    kind: "known",
    key: "youtube",
  },
  createdAtMs: 1,
  updatedAtMs: 1,
  ...overrides,
});

const createState = (
  siteId = "youtube",
  overrides: Partial<SiteSessionState> = {},
): SiteSessionState => ({
  siteId,
  availability: "ready",
  updatedAtMs: 1,
  cookieCount: 1,
  requiredKeys: [],
  missingRequiredKeys: [],
  lastError: null,
  sessionFilePath: `site-sessions/${siteId}.json`,
  lastSyncSource: null,
  ...overrides,
});

const createManager = (state: SiteSessionState): SiteSessionManager => ({
  getState: vi.fn(async () => state),
  getDiagnostics: vi.fn(async () => ({
    siteId: state.siteId,
    snapshotAvailability: state.availability,
    snapshotUpdatedAtMs: state.updatedAtMs,
    snapshotCookieCount: state.cookieCount,
    missingRequiredKeys: state.missingRequiredKeys,
    lastError: state.lastError,
    policy: {
      availability: state.availability,
      reason: state.availability === "missing" ? "no_snapshot" : "ready",
      missingRequiredKeys: state.missingRequiredKeys,
    },
  })),
  importSnapshot: vi.fn(async () => state),
  clearSession: vi.fn(async () => createState(state.siteId, { availability: "missing" })),
  shutdown: vi.fn(async () => undefined),
  getDownloadCookies: vi.fn(() => "cookies"),
});

const createHarness = async (
  options: {
    entries?: SiteSessionRegistryEntry[];
    states?: Record<string, SiteSessionState>;
    connectedClients?: number;
    now?: () => number;
    refreshSiteSession?: (siteId: string, manager: SiteSessionManager) => Promise<SiteSessionState>;
  } = {},
) => {
  const userDataDir = await createTempUserDataDir();
  const entries = options.entries ?? [createEntry()];
  const states = options.states ?? Object.fromEntries(
    entries.map((entry) => [entry.siteId, createState(entry.siteId)]),
  );
  const managers = new Map<string, SiteSessionManager>(
    entries.map((entry) => [
      entry.siteId,
      createManager(states[entry.siteId] ?? createState(entry.siteId)),
    ]),
  );
  const refreshSiteSession = vi.fn(options.refreshSiteSession ?? (async (siteId: string) => (
    createState(siteId, { updatedAtMs: options.now?.() ?? 100 })
  )));
  const logs: Array<{ message: string; details?: unknown }> = [];
  const scheduler = createSiteSessionRefreshScheduler({
    getUserDataDir: () => userDataDir,
    listSiteSessionEntries: () => entries,
    getSiteSessionManager: (siteId) => managers.get(siteId) ?? null,
    getConnectedExtensionClientCount: () => options.connectedClients ?? 1,
    refreshSiteSession,
    now: options.now ?? (() => 100),
    startupDelayMs: 1000,
    checkIntervalMs: 1000,
    refreshTimeoutMs: 1000,
    log(message, details) {
      logs.push({ message, details });
    },
  });

  return {
    entries,
    managers,
    refreshSiteSession,
    scheduler,
    states,
    userDataDir,
    logs,
  };
};

describe("createSiteSessionRefreshScheduler", () => {
  it("refreshes stale seeded entries with a saved snapshot", async () => {
    const entry = createEntry();
    const { refreshSiteSession, scheduler } = await createHarness({
      entries: [entry],
      states: {
        youtube: createState("youtube", { updatedAtMs: 1 }),
      },
      now: () => 24 * 60 * 60 * 1000 + 2,
    });

    await scheduler.checkDueSessions("scheduled");

    expect(refreshSiteSession).toHaveBeenCalledTimes(1);
    expect(refreshSiteSession).toHaveBeenCalledWith("youtube", expect.any(Object));
    expect(scheduler.getRefreshState("youtube")).toMatchObject({
      failureCount: 0,
      lastError: null,
    });
  });

  it("skips auto-discovered entries", async () => {
    const { refreshSiteSession, scheduler } = await createHarness({
      entries: [
        createEntry({
          syncAuthorization: "auto_discovered",
          autoSyncAllowed: false,
          discoverySources: ["auth_required"],
        }),
      ],
      now: () => 24 * 60 * 60 * 1000 + 2,
    });

    await scheduler.checkDueSessions("scheduled");

    expect(refreshSiteSession).not.toHaveBeenCalled();
  });

  it("allows manual forced refresh to bypass auto-refresh eligibility", async () => {
    const { refreshSiteSession, scheduler } = await createHarness({
      entries: [
        createEntry({
          syncAuthorization: "auto_discovered",
          autoSyncAllowed: false,
          discoverySources: ["auth_required"],
        }),
      ],
      now: () => 24 * 60 * 60 * 1000 + 2,
    });

    await expect(scheduler.ensureRefreshed("youtube", {
      reason: "manual",
      force: true,
      onlyIfDue: false,
      bypassEligibility: true,
    })).resolves.toMatchObject({
      siteId: "youtube",
    });

    expect(refreshSiteSession).toHaveBeenCalledTimes(1);
  });

  it("skips fresh snapshots", async () => {
    const { refreshSiteSession, scheduler } = await createHarness({
      states: {
        youtube: createState("youtube", { updatedAtMs: 95 }),
      },
      now: () => 100,
    });

    await scheduler.checkDueSessions("scheduled");

    expect(refreshSiteSession).not.toHaveBeenCalled();
  });

  it("skips checks while the extension is disconnected", async () => {
    const { refreshSiteSession, scheduler } = await createHarness({
      connectedClients: 0,
      now: () => 24 * 60 * 60 * 1000 + 2,
    });

    await scheduler.checkDueSessions("scheduled");

    expect(refreshSiteSession).not.toHaveBeenCalled();
  });

  it("skips entries with no snapshot and no user sync activation", async () => {
    const { refreshSiteSession, scheduler } = await createHarness({
      entries: [
        createEntry({
          discoverySources: ["seed"],
          visibility: "hidden_catalog",
        }),
      ],
      states: {
        youtube: createState("youtube", {
          availability: "missing",
          updatedAtMs: null,
          cookieCount: 0,
          sessionFilePath: null,
        }),
      },
      now: () => 24 * 60 * 60 * 1000 + 2,
    });

    await scheduler.checkDueSessions("scheduled");

    expect(refreshSiteSession).not.toHaveBeenCalled();
  });

  it("records failure backoff while preserving old snapshot state", async () => {
    const previousState = createState("youtube", {
      updatedAtMs: 1,
      cookieCount: 1,
      sessionFilePath: "site-sessions/youtube.json",
    });
    const { refreshSiteSession, scheduler } = await createHarness({
      states: {
        youtube: previousState,
      },
      now: () => 24 * 60 * 60 * 1000 + 2,
      refreshSiteSession: async () => {
        throw new Error("no_site_session_cookies");
      },
    });

    await scheduler.checkDueSessions("scheduled");

    expect(refreshSiteSession).toHaveBeenCalledTimes(1);
    expect(scheduler.getRefreshState("youtube")).toMatchObject({
      failureCount: 1,
      lastError: "no_site_session_cookies",
    });
    await expect(scheduler.ensureRefreshed("youtube", { onlyIfDue: true }))
      .resolves.toBeNull();
  });

  it("clears backoff after success", async () => {
    const { scheduler } = await createHarness({
      now: () => 1000,
    });

    scheduler.markFailure("youtube", new Error("failed"));
    expect(scheduler.getRefreshState("youtube")).toMatchObject({
      failureCount: 1,
      lastError: "failed",
    });

    scheduler.markSuccess("youtube");

    expect(scheduler.getRefreshState("youtube")).toMatchObject({
      failureCount: 0,
      nextAttemptAfterMs: null,
      lastError: null,
    });
  });

  it("joins duplicate in-flight refreshes for the same site", async () => {
    let resolveRefresh: ((state: SiteSessionState) => void) | null = null;
    const { refreshSiteSession, scheduler } = await createHarness({
      now: () => 24 * 60 * 60 * 1000 + 2,
      refreshSiteSession: async (siteId) => await new Promise<SiteSessionState>((resolve) => {
        resolveRefresh = resolve;
      }).then(() => createState(siteId)),
    });

    const first = scheduler.ensureRefreshed("youtube", { force: true });
    const second = scheduler.ensureRefreshed("youtube", { force: true });
    await Promise.resolve();
    resolveRefresh?.(createState("youtube"));

    await expect(first).resolves.toMatchObject({ siteId: "youtube" });
    await expect(second).resolves.toMatchObject({ siteId: "youtube" });
    expect(refreshSiteSession).toHaveBeenCalledTimes(1);
  });

  it("treats malformed refresh-state.json as empty state", async () => {
    const { scheduler, userDataDir } = await createHarness();
    await mkdir(join(userDataDir, "site-sessions"), { recursive: true });
    await writeFile(join(userDataDir, "site-sessions", "refresh-state.json"), "{", "utf8");

    expect(scheduler.getRefreshState("youtube")).toBeNull();
  });

  it("does not delete cookie snapshots when refresh-state.json is missing", async () => {
    const { scheduler, userDataDir } = await createHarness();
    await mkdir(join(userDataDir, "site-sessions"), { recursive: true });
    const snapshotPath = join(userDataDir, "site-sessions", "youtube.json");
    await writeFile(snapshotPath, JSON.stringify({ cookies: { LOGIN_INFO: "value" } }), "utf8");

    scheduler.markSuccess("youtube");

    expect(existsSync(snapshotPath)).toBe(true);
    const storedRefreshState = JSON.parse(
      await readFile(join(userDataDir, "site-sessions", "refresh-state.json"), "utf8"),
    ) as { sites: Record<string, unknown> };
    expect(storedRefreshState.sites.youtube).toBeTruthy();
  });

  it("starts and stops scheduled timers", async () => {
    const scheduledTimeouts = new Set<ReturnType<typeof setTimeout>>();
    const scheduledIntervals = new Set<ReturnType<typeof setInterval>>();
    const scheduler = createSiteSessionRefreshScheduler({
      getUserDataDir: () => neverCalledPath,
      listSiteSessionEntries: () => [],
      getSiteSessionManager: () => null,
      getConnectedExtensionClientCount: () => 0,
      refreshSiteSession: vi.fn(),
      setTimeout: ((handler, timeout) => {
        const timer = setTimeout(handler, timeout);
        scheduledTimeouts.add(timer);
        return timer;
      }) as typeof setTimeout,
      clearTimeout: ((timer) => {
        scheduledTimeouts.delete(timer as ReturnType<typeof setTimeout>);
        clearTimeout(timer);
      }) as typeof clearTimeout,
      setInterval: ((handler, timeout) => {
        const timer = setInterval(handler, timeout);
        scheduledIntervals.add(timer);
        return timer;
      }) as typeof setInterval,
      clearInterval: ((timer) => {
        scheduledIntervals.delete(timer as ReturnType<typeof setInterval>);
        clearInterval(timer);
      }) as typeof clearInterval,
    });

    scheduler.start();
    expect(scheduledTimeouts.size).toBe(1);
    expect(scheduledIntervals.size).toBe(1);

    scheduler.stop();
    expect(scheduledTimeouts.size).toBe(0);
    expect(scheduledIntervals.size).toBe(0);
  });
});
