import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("createSiteSessionManager", () => {
  it("marks Douyin login ready without msToken when douyin-dl required cookies are present", async () => {
    const userDataDir = await createTempUserDataDir();
    const douyin = getSiteSessionConfig("douyin");
    const manager = createSiteSessionManager({
      site: douyin,
      getUserDataDir: () => userDataDir,
      createCaptureWindow: vi.fn(async () => ({
        id: 42,
        close: vi.fn(),
      })),
      readCookies: vi.fn(async () => [
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
      ]),
      now: () => 1_779_428_739_177,
    });

    await manager.startCapture();
    const state = await manager.confirmCapture();

    expect(state).toMatchObject({
      availability: "ready",
      cookieCount: 4,
      missingRequiredKeys: [],
      lastError: null,
    });
    expect(state.requiredKeys).not.toContain("msToken");

    const stored = JSON.parse(
      await readFile(join(userDataDir, "site-sessions", "douyin.json"), "utf8"),
    ) as { cookies: Record<string, string> };
    expect(stored.cookies).toMatchObject({
      ttwid: "ttwid-value",
      odin_tt: "odin-value",
      passport_csrf_token: "csrf-value",
      sessionid: "session-value",
    });
    expect(stored.cookies).not.toHaveProperty("msToken");
  });

  it("marks Instagram login ready when a sessionid cookie is captured", async () => {
    const userDataDir = await createTempUserDataDir();
    const instagram = getSiteSessionConfig("instagram");
    const manager = createSiteSessionManager({
      site: instagram,
      getUserDataDir: () => userDataDir,
      createCaptureWindow: vi.fn(async () => ({
        id: 43,
        close: vi.fn(),
      })),
      readCookies: vi.fn(async () => [
        {
          domain: ".instagram.com",
          name: "sessionid",
          value: "instagram-session",
          path: "/",
        },
        {
          domain: ".instagram.com",
          name: "csrftoken",
          value: "csrf-value",
          path: "/",
        },
        {
          domain: ".cdninstagram.com",
          name: "ignored",
          value: "cdn-value",
          path: "/",
        },
      ]),
      now: () => 1_779_428_739_178,
    });

    expect(instagram).toMatchObject({
      id: "instagram",
      loginUrl: "https://www.instagram.com/",
      cookieDomains: ["instagram.com"],
      requiredCookieKeys: [],
      loginCookieKeys: ["sessionid"],
    });

    await manager.startCapture();
    const state = await manager.confirmCapture();

    expect(state).toMatchObject({
      siteId: "instagram",
      availability: "ready",
      cookieCount: 2,
      requiredKeys: [],
      missingRequiredKeys: [],
      lastError: null,
    });

    const stored = JSON.parse(
      await readFile(join(userDataDir, "site-sessions", "instagram.json"), "utf8"),
    ) as { cookies: Record<string, string>; cookiesNetscape: string };
    expect(stored.cookies).toMatchObject({
      sessionid: "instagram-session",
      csrftoken: "csrf-value",
    });
    expect(stored.cookies).not.toHaveProperty("ignored");
    expect(stored.cookiesNetscape).toContain(".instagram.com");
    expect(stored.cookiesNetscape).toContain("sessionid");
  });

  it("keeps Instagram missing when capture finds no Instagram cookies", async () => {
    const userDataDir = await createTempUserDataDir();
    const instagram = getSiteSessionConfig("instagram");
    const close = vi.fn();
    const manager = createSiteSessionManager({
      site: instagram,
      getUserDataDir: () => userDataDir,
      createCaptureWindow: vi.fn(async () => ({
        id: 44,
        close,
      })),
      readCookies: vi.fn(async () => [
        {
          domain: ".example.com",
          name: "sessionid",
          value: "wrong-site-session",
          path: "/",
        },
      ]),
      now: () => 1_779_428_739_179,
    });

    await manager.startCapture();
    const state = await manager.confirmCapture();

    expect(state).toMatchObject({
      siteId: "instagram",
      availability: "missing",
      cookieCount: 0,
      sessionFilePath: null,
    });
    expect(state.lastError).toContain("Instagram cookie capture finished without saving any cookies");
    expect(close).toHaveBeenCalledTimes(1);
  });
});
