import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { SiteSessionRegistryEntry } from "../src/types/siteSession.js";
import { createSiteSessionRegistry } from "./siteSessionRegistry.mjs";

const tempDirs: string[] = [];

const createTempUserDataDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "ameow-site-session-registry-test-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const registryPath = (userDataDir: string): string => (
  join(userDataDir, "site-sessions", "registry.json")
);

describe("createSiteSessionRegistry", () => {
  it("seeds visible first-party entries and persists the registry synchronously", async () => {
    const userDataDir = await createTempUserDataDir();
    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_300,
    });

    const entries = registry.listVisibleEntries();

    expect(entries.map((entry) => entry.siteId).sort()).toEqual([
      "bilibili",
      "douyin",
      "instagram",
      "xiaohongshu",
      "youtube",
    ]);
    expect(registry.requireEntry("youtube")).toMatchObject({
      siteId: "youtube",
      cookieDomains: ["youtube.com", "google.com"],
      syncAuthorization: "seeded",
      autoSyncAllowed: true,
      visibility: "visible",
    });

    const stored = JSON.parse(await readFile(registryPath(userDataDir), "utf8")) as {
      version: number;
      entries: SiteSessionRegistryEntry[];
    };
    expect(stored.version).toBe(1);
    expect(stored.entries.some((entry) => entry.siteId === "youtube")).toBe(true);
  });

  it("keeps hidden catalog entries out of the visible list while retaining lookup metadata", async () => {
    const userDataDir = await createTempUserDataDir();
    await mkdir(join(userDataDir, "site-sessions"), { recursive: true });
    await writeFile(registryPath(userDataDir), JSON.stringify({
      version: 1,
      entries: [
        {
          siteId: "patreon",
          displayName: "Patreon",
          primaryUrl: "https://www.patreon.com/",
          primaryHost: "www.patreon.com",
          cookieDomains: ["patreon.com"],
          requiredCookieKeys: [],
          loginCookieKeys: [],
          syncAuthorization: "seeded",
          autoSyncAllowed: true,
          discoverySources: ["gallery-dl-supported-sites"],
          engineHints: ["gallery-dl"],
          visibility: "hidden_catalog",
          icon: { kind: "placeholder" },
          createdAtMs: 1,
          updatedAtMs: 1,
        },
      ],
    }, null, 2), "utf8");

    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_301,
    });

    expect(registry.listVisibleEntries().map((entry) => entry.siteId)).not.toContain("patreon");
    expect(registry.requireEntry("patreon")).toMatchObject({
      siteId: "patreon",
      visibility: "hidden_catalog",
      cookieDomains: ["patreon.com"],
    });
  });

  it("refreshes stored seed entries from current seed domain and policy metadata", async () => {
    const userDataDir = await createTempUserDataDir();
    await mkdir(join(userDataDir, "site-sessions"), { recursive: true });
    await writeFile(registryPath(userDataDir), JSON.stringify({
      version: 1,
      entries: [
        {
          siteId: "youtube",
          displayName: "Old YouTube",
          primaryUrl: "https://www.youtube.com/",
          primaryHost: "www.youtube.com",
          cookieDomains: ["youtube.com"],
          requiredCookieKeys: ["stale"],
          loginCookieKeys: [],
          syncAuthorization: "auto_discovered",
          autoSyncAllowed: false,
          discoverySources: ["auth_required"],
          engineHints: [],
          visibility: "hidden_catalog",
          icon: { kind: "placeholder" },
          createdAtMs: 1,
          updatedAtMs: 1,
        },
      ],
    }, null, 2), "utf8");

    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_302,
    });

    expect(registry.requireEntry("youtube")).toMatchObject({
      siteId: "youtube",
      cookieDomains: ["youtube.com", "google.com"],
      requiredCookieKeys: [],
      syncAuthorization: "seeded",
      autoSyncAllowed: true,
      visibility: "visible",
      discoverySources: expect.arrayContaining(["seed", "auth_required"]),
    });
  });
});
