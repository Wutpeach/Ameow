import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getSiteSessionConfig } from "../src/site-sessions.js";
import { createSiteSessionManager } from "./siteSessionManager.mjs";

const tempDirs: string[] = [];

const createTempUserDataDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "ameow-site-session-test-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const createManager = async (
  siteId: string,
  options: { now?: () => number } = {},
) => {
  const userDataDir = await createTempUserDataDir();
  return createSiteSessionManager({
    site: getSiteSessionConfig(siteId),
    getUserDataDir: () => userDataDir,
    now: options.now,
  });
};

describe("createSiteSessionManager", () => {
  it("starts as a snapshot-only missing state without capture fields", async () => {
    const manager = await createManager("youtube");

    await expect(manager.getState()).resolves.toMatchObject({
      siteId: "youtube",
      availability: "missing",
      updatedAtMs: null,
      cookieCount: 0,
      requiredKeys: [],
      missingRequiredKeys: [],
      lastError: null,
      sessionFilePath: null,
      lastSyncSource: null,
    });

    expect(await manager.getState()).not.toHaveProperty("capturePhase");
    expect(await manager.getState()).not.toHaveProperty("capturePid");
  });

  it("imports browser-extension cookie snapshots while filtering cross-site records", async () => {
    const userDataDir = await createTempUserDataDir();
    const manager = createSiteSessionManager({
      site: getSiteSessionConfig("youtube"),
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_194,
    });

    const state = await manager.importSnapshot({
      source: {
        browser: "chrome",
        profileLabel: "Default",
        extensionId: "ameow-extension",
      },
      cookies: [
        {
          domain: ".youtube.com",
          name: "LOGIN_INFO",
          value: "login-info",
          path: "/",
          secure: true,
          expirationDate: 1_800_000_000,
        },
        {
          domain: ".google.com",
          name: "__Secure-1PSID",
          value: "psid",
          path: "/",
          secure: true,
          expirationDate: 1_800_000_001,
        },
        {
          domain: ".evil.com",
          name: "SID",
          value: "evil",
          path: "/",
        },
      ],
    });

    expect(state).toMatchObject({
      siteId: "youtube",
      availability: "ready",
      cookieCount: 2,
      lastError: null,
      lastSyncSource: {
        browser: "chrome",
        profileLabel: "Default",
        extensionId: "ameow-extension",
      },
    });

    const stored = JSON.parse(
      await readFile(join(userDataDir, "site-sessions", "youtube.json"), "utf8"),
    ) as { cookies: Record<string, string>; cookiesNetscape: string; source: Record<string, string> };
    expect(stored.cookies).toMatchObject({
      LOGIN_INFO: "login-info",
      "__Secure-1PSID": "psid",
    });
    expect(stored.cookies).not.toHaveProperty("SID");
    expect(stored.cookiesNetscape).toContain(".youtube.com");
    expect(stored.cookiesNetscape).toContain(".google.com");
    expect(stored.cookiesNetscape).not.toContain(".evil.com");
    expect(manager.getDownloadCookies()).toContain("LOGIN_INFO");
  });

  it("reports an error when imported browser cookies contain no supported site records", async () => {
    const manager = await createManager("instagram");

    const state = await manager.importSnapshot({
      cookies: [
        {
          domain: ".evil.com",
          name: "sessionid",
          value: "evil",
          path: "/",
        },
      ],
    });

    expect(state).toMatchObject({
      availability: "missing",
      cookieCount: 0,
      sessionFilePath: null,
    });
    expect(state.lastError).toContain("Instagram browser sync finished without saving any cookies");
    expect(manager.getDownloadCookies()).toBeNull();
  });

  it("keeps existing saved session snapshots readable across manager instances", async () => {
    const userDataDir = await createTempUserDataDir();
    const firstManager = createSiteSessionManager({
      site: getSiteSessionConfig("instagram"),
      getUserDataDir: () => userDataDir,
      now: () => 1_779_428_739_200,
    });

    await firstManager.importSnapshot({
      cookies: [
        {
          domain: ".instagram.com",
          name: "sessionid",
          value: "instagram-session",
          path: "/",
        },
      ],
    });

    const secondManager = createSiteSessionManager({
      site: getSiteSessionConfig("instagram"),
      getUserDataDir: () => userDataDir,
    });

    expect(secondManager.getDownloadCookies()).toContain("instagram-session");
    await expect(secondManager.getState()).resolves.toMatchObject({
      availability: "ready",
      cookieCount: 1,
      updatedAtMs: 1_779_428_739_200,
    });
  });

  it("clears only the saved downloader cookie snapshot", async () => {
    const userDataDir = await createTempUserDataDir();
    const manager = createSiteSessionManager({
      site: getSiteSessionConfig("bilibili"),
      getUserDataDir: () => userDataDir,
    });

    await manager.importSnapshot({
      cookies: [
        {
          domain: ".bilibili.com",
          name: "SESSDATA",
          value: "bili-session",
          path: "/",
        },
      ],
    });
    expect(manager.getDownloadCookies()).toContain("SESSDATA");

    const state = await manager.clearSession();

    await expect(readFile(join(userDataDir, "site-sessions", "bilibili.json"), "utf8"))
      .rejects.toThrow();
    expect(manager.getDownloadCookies()).toBeNull();
    expect(state).toMatchObject({
      availability: "missing",
      cookieCount: 0,
      lastError: null,
      sessionFilePath: null,
    });
  });

  it("reports diagnostics from the saved snapshot only", async () => {
    const manager = await createManager("douyin", {
      now: () => 1_779_428_739_201,
    });

    await manager.importSnapshot({
      cookies: [
        {
          domain: ".douyin.com",
          name: "ttwid",
          value: "ttwid-value",
          path: "/",
        },
        {
          domain: ".douyin.com",
          name: "odin_tt",
          value: "odin-value",
          path: "/",
        },
        {
          domain: ".douyin.com",
          name: "passport_csrf_token",
          value: "csrf-value",
          path: "/",
        },
        {
          domain: ".douyin.com",
          name: "sessionid",
          value: "session-value",
          path: "/",
        },
      ],
    });

    await expect(manager.getDiagnostics()).resolves.toMatchObject({
      siteId: "douyin",
      snapshotAvailability: "ready",
      snapshotUpdatedAtMs: 1_779_428_739_201,
      snapshotCookieCount: 4,
      missingRequiredKeys: [],
      lastError: null,
      policy: {
        availability: "ready",
        reason: "ready",
        missingRequiredKeys: [],
      },
    });
  });
});
