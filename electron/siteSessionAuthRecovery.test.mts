import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DownloadRuntimeError } from "../src/core/index.js";
import type { RuntimeAuthFailureRecoveryContext } from "../src/electron-runtime/contracts.js";
import type { SiteSessionState } from "../src/types/siteSession.js";
import { handleAuthRequiredSiteSessionRecovery } from "./siteSessionAuthRecovery.mjs";
import { createSiteSessionRegistry } from "./siteSessionRegistry.mjs";

const tempDirs: string[] = [];

const createTempUserDataDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "ameow-site-session-auth-recovery-test-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const readyState = (siteId: string): SiteSessionState => ({
  siteId,
  availability: "ready",
  updatedAtMs: 1,
  cookieCount: 2,
  requiredKeys: [],
  missingRequiredKeys: [],
  lastError: null,
  sessionFilePath: null,
  lastSyncSource: null,
});

const createContext = (
  overrides: Partial<RuntimeAuthFailureRecoveryContext> = {},
): RuntimeAuthFailureRecoveryContext => ({
  traceId: "video-1",
  request: {
    url: "https://members.example.com/video/1",
    pageUrl: "https://members.example.com/video/1",
    siteHint: "generic",
  },
  plan: {
    providerId: "generic",
    label: "Protected Example",
    intent: {
      type: "video",
      siteId: "generic",
      originalUrl: "https://members.example.com/video/1",
      pageUrl: "https://members.example.com/video/1",
      priority: 10,
      candidates: [],
      preferredFormat: "best",
    },
    engines: [
      {
        engine: "yt-dlp",
        sourceUrl: "https://members.example.com/video/1",
        reason: "generic",
        when: "always",
      },
    ],
  },
  chosenEngine: "yt-dlp",
  error: new DownloadRuntimeError("E_EXECUTION_FAILED", "cookies required", {
    classification: "auth_required",
  }),
  ...overrides,
});

describe("handleAuthRequiredSiteSessionRecovery", () => {
  it("discovers unknown auth-required sites without auto-reading cookies", async () => {
    const userDataDir = await createTempUserDataDir();
    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_401,
    });
    const syncSiteSession = vi.fn(async () => readyState("site-members-example-com"));
    const onRegistryChanged = vi.fn();

    const result = await handleAuthRequiredSiteSessionRecovery(createContext(), {
      registry,
      syncSiteSession,
      onRegistryChanged,
    });

    expect(result).toEqual({ shouldRetry: false });
    expect(syncSiteSession).not.toHaveBeenCalled();
    expect(onRegistryChanged).toHaveBeenCalledTimes(1);
    expect(registry.requireEntry("site-members-example-com")).toMatchObject({
      syncAuthorization: "auto_discovered",
      autoSyncAllowed: false,
      cookieDomains: ["members.example.com"],
      discoverySources: ["auth_required"],
    });
  });

  it("auto-syncs seeded sites and allows one retry only after cookies are saved", async () => {
    const userDataDir = await createTempUserDataDir();
    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_402,
    });
    const syncSiteSession = vi.fn(async () => readyState("youtube"));
    const onRegistryChanged = vi.fn();

    const result = await handleAuthRequiredSiteSessionRecovery(createContext({
      request: {
        url: "https://www.youtube.com/watch?v=abc",
        pageUrl: "https://www.youtube.com/watch?v=abc",
        siteHint: "youtube",
      },
      plan: {
        providerId: "youtube",
        label: "YouTube",
        intent: {
          type: "video",
          siteId: "youtube",
          originalUrl: "https://www.youtube.com/watch?v=abc",
          pageUrl: "https://www.youtube.com/watch?v=abc",
          priority: 100,
          candidates: [],
          preferredFormat: "best",
        },
        engines: [],
      },
    }), {
      registry,
      syncSiteSession,
      onRegistryChanged,
    });

    expect(result).toEqual({ shouldRetry: true });
    expect(syncSiteSession).toHaveBeenCalledWith("youtube");
    expect(onRegistryChanged).toHaveBeenCalledTimes(2);
    expect(registry.requireEntry("youtube")).toMatchObject({
      syncAuthorization: "seeded",
      autoSyncAllowed: true,
      discoverySources: expect.arrayContaining(["seed", "auth_required"]),
    });
  });

  it("does not retry when seeded-site extension sync fails", async () => {
    const userDataDir = await createTempUserDataDir();
    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_403,
    });
    const syncSiteSession = vi.fn(async () => {
      throw new Error("Browser extension is not connected");
    });

    const result = await handleAuthRequiredSiteSessionRecovery(createContext({
      request: {
        url: "https://www.youtube.com/watch?v=abc",
        pageUrl: "https://www.youtube.com/watch?v=abc",
        siteHint: "youtube",
      },
      plan: {
        providerId: "youtube",
        label: "YouTube",
        intent: {
          type: "video",
          siteId: "youtube",
          originalUrl: "https://www.youtube.com/watch?v=abc",
          pageUrl: "https://www.youtube.com/watch?v=abc",
          priority: 100,
          candidates: [],
          preferredFormat: "best",
        },
        engines: [],
      },
    }), {
      registry,
      syncSiteSession,
    });

    expect(result).toEqual({ shouldRetry: false });
    expect(syncSiteSession).toHaveBeenCalledWith("youtube");
  });
});
