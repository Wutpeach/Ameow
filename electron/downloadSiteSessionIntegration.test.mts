import { describe, expect, it, vi } from "vitest";

import type { SiteSessionRegistryEntry, SiteSessionState } from "../src/types/siteSession.js";
import type {
  DownloadIntent,
  DownloadRuntimeError,
  EnginePlan,
  RawDownloadInput,
  ResolvedDownloadPlan,
} from "../src/core/index.js";
import type { NetworkRouteResolution } from "../src/config/networkRoute.js";
import type { SiteSessionManager } from "./siteSessionManager.mjs";
import type { SiteSessionRefreshScheduler } from "./siteSessionRefreshScheduler.mjs";
import type { SiteSessionRegistry } from "./siteSessionRegistry.mjs";
import {
  createDownloadSiteSessionIntegration,
  type DownloadSiteSessionIntegrationOptions,
} from "./downloadSiteSessionIntegration.mjs";
import type {
  RuntimeAuthFailureRecoveryContext,
} from "../src/electron-runtime/contracts.js";
import type { EngineExecutionContextWithRuntime } from "../src/electron-runtime/engineExecutionContext.js";

/**
 * Focused tests for the Electron-side download site-session integration:
 * refresh eligibility, attempt-cookie replacement without plan mutation, and
 * typed auth-recovery hook wiring. No Electron APIs are started.
 */

const createEntry = (
  overrides: Partial<SiteSessionRegistryEntry> = {},
): SiteSessionRegistryEntry => ({
  siteId: "youtube",
  displayName: "YouTube",
  primaryUrl: "https://www.youtube.com",
  primaryHost: "www.youtube.com",
  cookieDomains: [".youtube.com"],
  requiredCookieKeys: ["SID"],
  loginCookieKeys: [],
  syncAuthorization: "seeded",
  autoSyncAllowed: true,
  discoverySources: ["seed"],
  engineHints: ["yt-dlp"],
  visibility: "visible",
  icon: { kind: "known", key: "youtube" },
  createdAtMs: 1,
  updatedAtMs: 1,
  ...overrides,
});

const createState = (
  overrides: Partial<SiteSessionState> = {},
): SiteSessionState => ({
  siteId: "youtube",
  availability: "ready",
  updatedAtMs: 1,
  cookieCount: 3,
  requiredKeys: [],
  missingRequiredKeys: [],
  lastError: null,
  sessionFilePath: null,
  lastSyncSource: null,
  ...overrides,
});

const createRegistry = (entry: SiteSessionRegistryEntry | null): SiteSessionRegistry => ({
  listEntries: () => (entry ? [entry] : []),
  listVisibleEntries: () => (entry ? [entry] : []),
  getEntry: (siteId) => (entry?.siteId === siteId ? entry : null),
  requireEntry: (siteId) => {
    const found = entry?.siteId === siteId ? entry : null;
    if (!found) {
      throw new Error(`Missing site session entry: ${siteId}`);
    }
    return found;
  },
  matchEntryForUrl: () => entry,
  activateEntry: () => entry ?? createEntry(),
  recordUserSync: () => entry ?? createEntry(),
  removeActivationSource: () => entry ?? createEntry(),
  upsertAuthRequiredSite: () => entry,
  enableCurrentTabSite: () => entry ?? createEntry(),
});

const createManager = (state: SiteSessionState, cookies: string | null): SiteSessionManager => ({
  getState: async () => state,
  getDiagnostics: async () => ({
    siteId: state.siteId,
    snapshotAvailability: state.availability,
    snapshotUpdatedAtMs: state.updatedAtMs,
    snapshotCookieCount: state.cookieCount,
    missingRequiredKeys: state.missingRequiredKeys,
    lastError: state.lastError,
    policy: {
      availability: state.availability,
      reason: "ready",
      missingRequiredKeys: state.missingRequiredKeys,
    },
  }),
  importSnapshot: async () => state,
  clearSession: async () => state,
  shutdown: async () => undefined,
  getDownloadCookies: () => cookies,
});

const createScheduler = (): SiteSessionRefreshScheduler => ({
  start: () => undefined,
  stop: () => undefined,
  checkDueSessions: async () => undefined,
  ensureRefreshed: async () => null,
  markSuccess: () => undefined,
  markFailure: () => undefined,
  isRefreshDue: () => false,
  getRefreshState: () => null,
});

const createIntegration = (options: {
  entry?: SiteSessionRegistryEntry | null;
  state?: SiteSessionState;
  managerCookies?: string | null;
  ensureRefreshed?: (siteId: string, options?: unknown) => Promise<SiteSessionState | null>;
  syncSiteSession?: (siteId: string) => Promise<SiteSessionState>;
  log?: DownloadSiteSessionIntegrationOptions["log"];
}) => {
  const entry = options.entry === undefined ? createEntry() : options.entry;
  const state = options.state ?? createState();
  const manager = createManager(state, options.managerCookies ?? null);
  const ensureRefreshed = options.ensureRefreshed
    ?? vi.fn(async (): Promise<SiteSessionState | null> => state);
  const scheduler = createScheduler();
  scheduler.ensureRefreshed = ensureRefreshed;
  const syncSiteSession = options.syncSiteSession ?? (async (): Promise<SiteSessionState> => state);
  return {
    integration: createDownloadSiteSessionIntegration({
      getRegistry: () => createRegistry(entry),
      getManager: () => manager,
      getRefreshScheduler: () => scheduler,
      getConnectedExtensionClientCount: () => 1,
      syncSiteSession,
      onRegistryChanged: () => undefined,
      log: options.log,
    }),
    manager,
    scheduler,
    syncSiteSession,
  };
};

const createDownloadIntent = (url: string): DownloadIntent => ({
  type: "video",
  siteId: "youtube",
  originalUrl: url,
  pageUrl: url,
  priority: 100,
  candidates: [],
  preferredFormat: "best",
});

const createPlan = (url: string): ResolvedDownloadPlan => ({
  providerId: "youtube",
  label: "Video",
  intent: createDownloadIntent(url),
  engines: [],
});

const createBaseContext = (url: string): EngineExecutionContextWithRuntime => ({
  traceId: "t1",
  plan: createPlan(url),
  enginePlan: { engine: "yt-dlp", priority: 100, when: "primary", reason: "primary" },
  intent: createPlan(url).intent,
  outputDir: "/tmp/out",
  outputStem: "stem",
  config: {},
  cookies: "request-cookies",
  network: {} as NetworkRouteResolution,
  abortSignal: new AbortController().signal,
  onProgress: () => undefined,
});

describe("createDownloadSiteSessionIntegration", () => {
  it("skips the pre-download refresh for unsupported sites without calling the scheduler", async () => {
    const log = vi.fn();
    const { integration, scheduler } = createIntegration({ entry: null, log });

    await expect(integration.refreshSiteSessionBeforeDownload({
      traceId: "t1",
      siteId: "unknown-site",
      url: "https://example.com/video",
    })).resolves.toBeUndefined();
    expect(scheduler.ensureRefreshed).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("DownloadStartSession", "sync skipped", expect.objectContaining({
      reason: "unsupported_site",
    }));
  });

  it("refreshes a ready-required site before download when its snapshot is stale", async () => {
    const ensureRefreshed = vi.fn(async () => createState({ updatedAtMs: 9 }));
    const { integration } = createIntegration({
      state: createState({ updatedAtMs: Date.now() - 2 * 60 * 60 * 1000 }),
      ensureRefreshed,
    });

    await integration.refreshSiteSessionBeforeDownload({
      traceId: "t1",
      siteId: "youtube",
      url: "https://www.youtube.com/watch?v=1",
    });

    expect(ensureRefreshed).toHaveBeenCalledTimes(1);
    expect(ensureRefreshed.mock.calls[0][0]).toBe("youtube");
    expect(ensureRefreshed.mock.calls[0][1]).toMatchObject({
      reason: "download_start",
      onlyIfDue: false,
    });
  });

  it("skips the pre-download refresh when the snapshot is fresh", async () => {
    const ensureRefreshed = vi.fn(async () => null);
    const { integration } = createIntegration({
      state: createState({ updatedAtMs: Date.now() }),
      ensureRefreshed,
    });

    await integration.refreshSiteSessionBeforeDownload({
      traceId: "t1",
      siteId: "youtube",
      url: "https://www.youtube.com/watch?v=1",
    });

    expect(ensureRefreshed).not.toHaveBeenCalled();
  });

  it("continues when the pre-download refresh fails", async () => {
    const ensureRefreshed = vi.fn(async () => {
      throw new Error("extension unavailable");
    });
    const { integration } = createIntegration({
      state: createState({ updatedAtMs: Date.now() - 2 * 60 * 60 * 1000 }),
      ensureRefreshed,
    });

    await expect(integration.refreshSiteSessionBeforeDownload({
      traceId: "t1",
      siteId: "youtube",
      url: "https://www.youtube.com/watch?v=1",
    })).resolves.toBeUndefined();
    expect(ensureRefreshed).toHaveBeenCalledTimes(1);
  });

  it("pre-probes any registered stale site once the probe flow is confirmed", async () => {
    // No Site allowlist: the confirmed probe flow (plan requirement) drives
    // the need; the integration applies registry/auth/freshness policy only.
    const youtubeEnsureRefreshed = vi.fn(async () => createState());
    const youtube = createIntegration({
      state: createState({ updatedAtMs: Date.now() - 25 * 60 * 60 * 1000 }),
      ensureRefreshed: youtubeEnsureRefreshed,
    });

    await youtube.integration.refreshSiteSessionBeforeAdvancedQualityProbe({
      traceId: "t1",
      siteId: "youtube",
      url: "https://www.youtube.com/watch?v=1",
    });

    expect(youtubeEnsureRefreshed).toHaveBeenCalledTimes(1);
    expect(youtubeEnsureRefreshed.mock.calls[0][1]).toMatchObject({
      reason: "advanced_quality",
      force: true,
    });

    const genericEnsureRefreshed = vi.fn(async () => createState());
    const generic = createIntegration({
      entry: createEntry({ siteId: "generic" }),
      state: createState({ siteId: "generic", updatedAtMs: Date.now() - 25 * 60 * 60 * 1000 }),
      ensureRefreshed: genericEnsureRefreshed,
    });

    await generic.integration.refreshSiteSessionBeforeAdvancedQualityProbe({
      traceId: "t2",
      siteId: "generic",
      url: "https://example.com/video",
    });

    expect(genericEnsureRefreshed).toHaveBeenCalledTimes(1);
    expect(genericEnsureRefreshed.mock.calls[0][1]).toMatchObject({
      reason: "advanced_quality",
      force: true,
    });
  });

  it("replaces attempt cookies with app-owned session cookies without mutating the plan", async () => {
    const baseContext = createBaseContext("https://www.youtube.com/watch?v=1");
    const { integration } = createIntegration({ managerCookies: "app-session-cookies" });

    const enriched = integration.buildDownloadExecutionContext(
      baseContext,
      { url: "https://www.youtube.com/watch?v=1" },
    );

    expect(enriched.cookies).toBe("app-session-cookies");
    // The input context and its shared plan are never cloned or mutated.
    expect(baseContext.cookies).toBe("request-cookies");
    expect(enriched.plan).toBe(baseContext.plan);
    expect(enriched.intent).toBe(baseContext.intent);
  });

  it("keeps request cookies when no app-owned session is available", () => {
    const baseContext = createBaseContext("https://example.com/video");
    const { integration } = createIntegration({ entry: null });

    const enriched = integration.buildDownloadExecutionContext(
      baseContext,
      { url: "https://example.com/video" },
    );

    expect(enriched.cookies).toBe("request-cookies");
  });

  it("wires typed auth recovery through the injected registry and sync", async () => {
    const syncSiteSession = vi.fn(async () => createState({ cookieCount: 5 }));
    const { integration } = createIntegration({ syncSiteSession });
    const context: RuntimeAuthFailureRecoveryContext = {
      traceId: "t1",
      request: {
        url: "https://www.youtube.com/watch?v=1",
        pageUrl: "https://www.youtube.com/watch?v=1",
        siteHint: "youtube",
      },
      plan: null,
      chosenEngine: "yt-dlp",
      error: new Error("cookies required for this resource") as DownloadRuntimeError,
    };

    const result = await integration.handleAuthRequiredFailure(context);

    expect(result).toEqual({ shouldRetry: true });
    expect(syncSiteSession).toHaveBeenCalledTimes(1);
    expect(syncSiteSession).toHaveBeenCalledWith("youtube");
  });

  it("declines auth recovery when the discovered site is not authorized for sync", async () => {
    const syncSiteSession = vi.fn(async () => createState());
    const { integration } = createIntegration({
      entry: createEntry({ syncAuthorization: "auto_discovered" }),
      syncSiteSession,
    });

    const result = await integration.handleAuthRequiredFailure({
      traceId: "t1",
      request: { url: "https://www.youtube.com/watch?v=1", pageUrl: "https://www.youtube.com/watch?v=1" },
      plan: null,
      chosenEngine: "yt-dlp",
      error: new Error("cookies required for this resource") as DownloadRuntimeError,
    });

    expect(result).toEqual({ shouldRetry: false });
    expect(syncSiteSession).not.toHaveBeenCalled();
  });
});
