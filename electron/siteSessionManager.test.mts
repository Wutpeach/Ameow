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
});
