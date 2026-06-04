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
  it("seeds first-party entries as hidden catalog metadata and persists the registry synchronously", async () => {
    const userDataDir = await createTempUserDataDir();
    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_300,
    });

    const entries = registry.listVisibleEntries();

    expect(entries.map((entry) => entry.siteId)).toEqual(expect.not.arrayContaining([
      "bilibili",
      "douyin",
      "instagram",
      "xiaohongshu",
      "youtube",
    ]));
    expect(registry.requireEntry("youtube")).toMatchObject({
      siteId: "youtube",
      cookieDomains: ["youtube.com", "google.com"],
      syncAuthorization: "seeded",
      autoSyncAllowed: true,
      visibility: "hidden_catalog",
    });
    expect(registry.requireEntry("instagram")).toMatchObject({
      siteId: "instagram",
      cookieDomains: ["instagram.com"],
      loginCookieKeys: ["sessionid"],
      discoverySources: expect.arrayContaining(["seed", "gallery-dl-supported-sites"]),
      visibility: "hidden_catalog",
    });

    const stored = JSON.parse(await readFile(registryPath(userDataDir), "utf8")) as {
      version: number;
      entries: SiteSessionRegistryEntry[];
    };
    expect(stored.version).toBe(1);
    expect(stored.entries.some((entry) => entry.siteId === "youtube")).toBe(true);
  });

  it("keeps first-party seed entries matchable while hidden from settings", async () => {
    const userDataDir = await createTempUserDataDir();
    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_305,
    });

    expect(registry.matchEntryForUrl("https://www.bilibili.com/video/BV123")).toMatchObject({
      siteId: "bilibili",
      visibility: "hidden_catalog",
    });
    expect(registry.listVisibleEntries().map((entry) => entry.siteId)).not.toContain("bilibili");
  });

  it("seeds gallery-dl cookie catalog entries as hidden recognition metadata", async () => {
    const userDataDir = await createTempUserDataDir();
    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_308,
    });

    expect(registry.listVisibleEntries().map((entry) => entry.siteId)).not.toContain("patreon");
    expect(registry.requireEntry("patreon")).toMatchObject({
      siteId: "patreon",
      displayName: "Patreon",
      primaryHost: "www.patreon.com",
      cookieDomains: ["patreon.com"],
      syncAuthorization: "seeded",
      autoSyncAllowed: true,
      discoverySources: ["gallery-dl-supported-sites"],
      engineHints: ["gallery-dl"],
      visibility: "hidden_catalog",
      icon: { kind: "placeholder" },
    });
    expect(registry.requireEntry("twitter")).toMatchObject({
      primaryUrl: "https://x.com/",
      cookieDomains: ["x.com", "twitter.com"],
      visibility: "hidden_catalog",
    });
  });

  it("matches hidden catalog entries for current-tab relevance without activating them", async () => {
    const userDataDir = await createTempUserDataDir();
    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_309,
    });

    expect(registry.matchEntryForUrl("https://creator.patreon.com/posts/1")).toMatchObject({
      siteId: "patreon",
      visibility: "hidden_catalog",
    });
    expect(registry.listVisibleEntries().map((entry) => entry.siteId)).not.toContain("patreon");
  });

  it("activates hidden catalog entries after user sync without changing cookie domains", async () => {
    const userDataDir = await createTempUserDataDir();
    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_310,
    });

    const entry = registry.activateEntry("patreon", "user_sync");

    expect(entry).toMatchObject({
      siteId: "patreon",
      visibility: "visible",
      cookieDomains: ["patreon.com"],
      discoverySources: expect.arrayContaining(["gallery-dl-supported-sites", "user_sync"]),
    });
    expect(registry.listVisibleEntries().filter((item) => item.siteId === "patreon")).toHaveLength(1);
  });

  it("activates first-party seed entries after user sync", async () => {
    const userDataDir = await createTempUserDataDir();
    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_312,
    });

    const entry = registry.activateEntry("bilibili", "user_sync");

    expect(entry).toMatchObject({
      siteId: "bilibili",
      visibility: "visible",
      discoverySources: expect.arrayContaining(["seed", "user_sync"]),
    });
    expect(registry.listVisibleEntries().map((item) => item.siteId)).toContain("bilibili");
  });

  it("hides seed-only entries after user-sync activation is removed", async () => {
    const userDataDir = await createTempUserDataDir();
    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_313,
    });
    registry.activateEntry("bilibili", "user_sync");

    const entry = registry.removeActivationSource("bilibili", "user_sync");

    expect(entry).toMatchObject({
      siteId: "bilibili",
      visibility: "hidden_catalog",
    });
    expect(entry.discoverySources).not.toContain("user_sync");
    expect(registry.listVisibleEntries().map((item) => item.siteId)).not.toContain("bilibili");
  });

  it("keeps entries visible after removing user-sync when another activation source remains", async () => {
    const userDataDir = await createTempUserDataDir();
    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_314,
    });
    registry.activateEntry("bilibili", "auth_required");
    registry.activateEntry("bilibili", "user_sync");

    const entry = registry.removeActivationSource("bilibili", "user_sync");

    expect(entry).toMatchObject({
      siteId: "bilibili",
      visibility: "visible",
      discoverySources: expect.arrayContaining(["seed", "auth_required"]),
    });
    expect(entry.discoverySources).not.toContain("user_sync");
    expect(registry.listVisibleEntries().map((item) => item.siteId)).toContain("bilibili");
  });

  it("promotes hidden catalog entries on auth-required discovery", async () => {
    const userDataDir = await createTempUserDataDir();
    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_311,
    });

    const entry = registry.upsertAuthRequiredSite({
      pageUrl: "https://www.patreon.com/posts/123",
      engineHint: "gallery-dl",
    });

    expect(entry).toMatchObject({
      siteId: "patreon",
      visibility: "visible",
      cookieDomains: ["patreon.com"],
      syncAuthorization: "seeded",
      autoSyncAllowed: true,
      discoverySources: expect.arrayContaining(["gallery-dl-supported-sites", "auth_required"]),
      engineHints: ["gallery-dl"],
    });
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
    expect(registry.matchEntryForUrl("https://creator.patreon.com/posts/1")).toMatchObject({
      siteId: "patreon",
      visibility: "hidden_catalog",
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

  it("enables an unknown current-tab site with exact-host cookie scope", async () => {
    const userDataDir = await createTempUserDataDir();
    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_303,
    });

    const entry = registry.enableCurrentTabSite({
      pageUrl: "https://sub.example.com/watch/1",
      displayName: "Example Page",
    });

    expect(entry).toMatchObject({
      siteId: "site-sub-example-com",
      displayName: "Example Page",
      primaryHost: "sub.example.com",
      cookieDomains: ["sub.example.com"],
      syncAuthorization: "user_enabled",
      autoSyncAllowed: true,
      discoverySources: ["extension_current_tab"],
      visibility: "visible",
      icon: { kind: "placeholder" },
    });
    expect(registry.requireEntry(entry.siteId)).toMatchObject({
      cookieDomains: ["sub.example.com"],
    });
    expect(registry.matchEntryForUrl("https://child.sub.example.com/path")).toMatchObject({
      siteId: entry.siteId,
    });
    expect(registry.matchEntryForUrl("https://example.com/path")).toBeNull();
  });

  it("promotes a matched hidden catalog entry instead of creating a duplicate", async () => {
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
          autoSyncAllowed: false,
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
      now: () => 1_779_428_739_304,
    });

    const entry = registry.enableCurrentTabSite({
      pageUrl: "https://www.patreon.com/posts/123",
    });

    expect(entry).toMatchObject({
      siteId: "patreon",
      visibility: "visible",
      autoSyncAllowed: true,
      discoverySources: expect.arrayContaining(["gallery-dl-supported-sites", "extension_current_tab"]),
    });
    expect(registry.listVisibleEntries().filter((item) => item.siteId === "patreon")).toHaveLength(1);
  });

  it("upserts an auto-discovered auth-required site with exact-host scope and no auto sync", async () => {
    const userDataDir = await createTempUserDataDir();
    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_306,
    });

    const entry = registry.upsertAuthRequiredSite({
      pageUrl: "https://members.example.com/video/1",
      siteHint: "generic",
      displayName: "Protected Example",
      engineHint: "yt-dlp",
    });

    expect(entry).toMatchObject({
      siteId: "site-members-example-com",
      displayName: "Protected Example",
      primaryHost: "members.example.com",
      cookieDomains: ["members.example.com"],
      syncAuthorization: "auto_discovered",
      autoSyncAllowed: false,
      discoverySources: ["auth_required"],
      engineHints: ["yt-dlp"],
      visibility: "visible",
      icon: { kind: "placeholder" },
    });
    expect(registry.requireEntry(entry?.siteId ?? "")).toMatchObject({
      cookieDomains: ["members.example.com"],
    });
  });

  it("marks seeded auth-required matches without downgrading auto sync authorization", async () => {
    const userDataDir = await createTempUserDataDir();
    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_307,
    });

    const entry = registry.upsertAuthRequiredSite({
      pageUrl: "https://www.youtube.com/watch?v=abc",
      siteId: "youtube",
      engineHint: "yt-dlp",
    });

    expect(entry).toMatchObject({
      siteId: "youtube",
      cookieDomains: ["youtube.com", "google.com"],
      syncAuthorization: "seeded",
      autoSyncAllowed: true,
      discoverySources: expect.arrayContaining(["seed", "auth_required"]),
      engineHints: expect.arrayContaining(["yt-dlp"]),
      visibility: "visible",
    });
  });

  it("rejects non-web current-tab URLs", async () => {
    const userDataDir = await createTempUserDataDir();
    const registry = createSiteSessionRegistry({
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_305,
    });

    expect(() => registry.enableCurrentTabSite({
      pageUrl: "chrome://extensions",
    })).toThrow("Cannot enable login state for a non-HTTP site");
  });
});
