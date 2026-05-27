import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getSiteSessionConfig } from "../src/site-sessions.js";
import {
  createSiteSessionManager,
  resolveSiteSessionProfilePartition,
} from "./siteSessionManager.mjs";

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
  it("resolves deterministic stable profile partitions per site", () => {
    expect(resolveSiteSessionProfilePartition("instagram")).toBe("persist:ameow-site-session-instagram");
    expect(resolveSiteSessionProfilePartition("bilibili")).toBe("persist:ameow-site-session-bilibili");
  });

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

  it("saves supplemental cookies when the cookie jar is missing that cookie name", async () => {
    const userDataDir = await createTempUserDataDir();
    const douyin = getSiteSessionConfig("douyin");
    const manager = createSiteSessionManager({
      site: douyin,
      getUserDataDir: () => userDataDir,
      createCaptureWindow: vi.fn(async () => ({
        id: 45,
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
      readSupplementalCookies: vi.fn(async () => ({
        msToken: "supplemental-ms-token",
      })),
      now: () => 1_779_428_739_180,
    });

    await manager.startCapture();
    const state = await manager.confirmCapture();

    expect(state).toMatchObject({
      availability: "ready",
      cookieCount: 5,
      missingRequiredKeys: [],
    });

    const stored = JSON.parse(
      await readFile(join(userDataDir, "site-sessions", "douyin.json"), "utf8"),
    ) as { cookies: Record<string, string>; cookieHeader: string; cookiesNetscape: string };
    expect(stored.cookies).toMatchObject({
      ttwid: "ttwid-value",
      msToken: "supplemental-ms-token",
    });
    expect(stored.cookieHeader).toContain("msToken=supplemental-ms-token");
    expect(stored.cookiesNetscape).not.toContain("msToken");
  });

  it("keeps cookie jar values when supplemental cookies conflict by name", async () => {
    const userDataDir = await createTempUserDataDir();
    const instagram = getSiteSessionConfig("instagram");
    const manager = createSiteSessionManager({
      site: instagram,
      getUserDataDir: () => userDataDir,
      createCaptureWindow: vi.fn(async () => ({
        id: 46,
        close: vi.fn(),
      })),
      readCookies: vi.fn(async () => [
        {
          domain: ".instagram.com",
          name: "sessionid",
          value: "jar-session",
          path: "/",
        },
      ]),
      readSupplementalCookies: vi.fn(async () => ({
        sessionid: "supplemental-session",
        csrftoken: "supplemental-csrf",
      })),
      now: () => 1_779_428_739_181,
    });

    await manager.startCapture();
    await manager.confirmCapture();

    const stored = JSON.parse(
      await readFile(join(userDataDir, "site-sessions", "instagram.json"), "utf8"),
    ) as { cookies: Record<string, string> };
    expect(stored.cookies).toMatchObject({
      sessionid: "jar-session",
      csrftoken: "supplemental-csrf",
    });
  });

  it("ignores invalid supplemental cookie names and empty values", async () => {
    const userDataDir = await createTempUserDataDir();
    const instagram = getSiteSessionConfig("instagram");
    const manager = createSiteSessionManager({
      site: instagram,
      getUserDataDir: () => userDataDir,
      createCaptureWindow: vi.fn(async () => ({
        id: 47,
        close: vi.fn(),
      })),
      readCookies: vi.fn(async () => [
        {
          domain: ".instagram.com",
          name: "sessionid",
          value: "jar-session",
          path: "/",
        },
      ]),
      readSupplementalCookies: vi.fn(async () => ({
        " ": "blank-name",
        empty: " ",
        valid: "supplemental-value",
      })),
      now: () => 1_779_428_739_182,
    });

    await manager.startCapture();
    await manager.confirmCapture();

    const stored = JSON.parse(
      await readFile(join(userDataDir, "site-sessions", "instagram.json"), "utf8"),
    ) as { cookies: Record<string, string> };
    expect(stored.cookies).toMatchObject({
      sessionid: "jar-session",
      valid: "supplemental-value",
    });
    expect(Object.hasOwn(stored.cookies, "")).toBe(false);
    expect(Object.hasOwn(stored.cookies, "empty")).toBe(false);
  });

  it("uses the same stable partition across separate capture attempts", async () => {
    const userDataDir = await createTempUserDataDir();
    const instagram = getSiteSessionConfig("instagram");
    const createCaptureWindow = vi.fn(async () => ({
      id: createCaptureWindow.mock.calls.length + 100,
      close: vi.fn(),
    }));
    let cookieReadCount = 0;
    const readCookies = vi.fn(async () => {
      cookieReadCount += 1;
      return [
        {
          domain: ".instagram.com",
          name: "sessionid",
          value: `session-${cookieReadCount}`,
          path: "/",
        },
      ];
    });
    const destroyPartition = vi.fn(async () => {});
    const manager = createSiteSessionManager({
      site: instagram,
      getUserDataDir: () => userDataDir,
      createCaptureWindow,
      readCookies,
      destroyPartition,
      now: () => 1_779_428_739_183,
    });

    await manager.startCapture();
    await manager.confirmCapture();
    await manager.startCapture();
    await manager.confirmCapture();

    const stablePartition = "persist:ameow-site-session-instagram";
    expect(createCaptureWindow).toHaveBeenCalledTimes(2);
    expect(createCaptureWindow.mock.calls.map(([options]) => options.partition)).toEqual([
      stablePartition,
      stablePartition,
    ]);
    expect(readCookies.mock.calls.map(([partition]) => partition)).toEqual([
      stablePartition,
      stablePartition,
    ]);
    expect(destroyPartition).not.toHaveBeenCalled();

    const stored = JSON.parse(
      await readFile(join(userDataDir, "site-sessions", "instagram.json"), "utf8"),
    ) as { cookies: Record<string, string> };
    expect(stored.cookies.sessionid).toBe("session-2");
  });

  it("does not destroy the stable profile after successful confirmation", async () => {
    const userDataDir = await createTempUserDataDir();
    const instagram = getSiteSessionConfig("instagram");
    const destroyPartition = vi.fn(async () => {});
    const manager = createSiteSessionManager({
      site: instagram,
      getUserDataDir: () => userDataDir,
      createCaptureWindow: vi.fn(async () => ({
        id: 200,
        close: vi.fn(),
      })),
      readCookies: vi.fn(async () => [
        {
          domain: ".instagram.com",
          name: "sessionid",
          value: "instagram-session",
          path: "/",
        },
      ]),
      destroyPartition,
      now: () => 1_779_428_739_184,
    });

    await manager.startCapture();
    await manager.confirmCapture();

    expect(destroyPartition).not.toHaveBeenCalled();
  });

  it("does not destroy the stable profile when capture is cancelled", async () => {
    const userDataDir = await createTempUserDataDir();
    const instagram = getSiteSessionConfig("instagram");
    const close = vi.fn();
    const destroyPartition = vi.fn(async () => {});
    const manager = createSiteSessionManager({
      site: instagram,
      getUserDataDir: () => userDataDir,
      createCaptureWindow: vi.fn(async () => ({
        id: 201,
        close,
      })),
      readCookies: vi.fn(async () => []),
      destroyPartition,
      now: () => 1_779_428_739_185,
    });

    await manager.startCapture();
    const state = await manager.cancelCapture();

    expect(close).toHaveBeenCalledTimes(1);
    expect(destroyPartition).not.toHaveBeenCalled();
    expect(state).toMatchObject({
      capturePhase: "idle",
      capturePid: null,
      lastError: null,
    });
  });

  it("does not destroy the stable profile when the user closes the capture window", async () => {
    const userDataDir = await createTempUserDataDir();
    const instagram = getSiteSessionConfig("instagram");
    let onClosed: (() => void) | null = null;
    const destroyPartition = vi.fn(async () => {});
    const manager = createSiteSessionManager({
      site: instagram,
      getUserDataDir: () => userDataDir,
      createCaptureWindow: vi.fn(async (options) => {
        onClosed = options.onClosed;
        return {
          id: 202,
          close: vi.fn(),
        };
      }),
      readCookies: vi.fn(async () => []),
      destroyPartition,
      now: () => 1_779_428_739_186,
    });

    await manager.startCapture();
    onClosed?.();
    const state = await manager.getState();

    expect(destroyPartition).not.toHaveBeenCalled();
    expect(state).toMatchObject({
      capturePhase: "idle",
      capturePid: null,
    });
  });

  it("does not destroy the stable profile when capture window creation fails", async () => {
    const userDataDir = await createTempUserDataDir();
    const instagram = getSiteSessionConfig("instagram");
    const destroyPartition = vi.fn(async () => {});
    const manager = createSiteSessionManager({
      site: instagram,
      getUserDataDir: () => userDataDir,
      createCaptureWindow: vi.fn(async () => {
        throw new Error("window failed");
      }),
      readCookies: vi.fn(async () => []),
      destroyPartition,
      now: () => 1_779_428_739_187,
    });

    const state = await manager.startCapture();

    expect(destroyPartition).not.toHaveBeenCalled();
    expect(state).toMatchObject({
      capturePhase: "idle",
      lastError: "window failed",
    });
  });

  it("clears both the saved downloader cookies and the stable profile", async () => {
    const userDataDir = await createTempUserDataDir();
    const instagram = getSiteSessionConfig("instagram");
    const destroyPartition = vi.fn(async () => {});
    const manager = createSiteSessionManager({
      site: instagram,
      getUserDataDir: () => userDataDir,
      createCaptureWindow: vi.fn(async () => ({
        id: 203,
        close: vi.fn(),
      })),
      readCookies: vi.fn(async () => [
        {
          domain: ".instagram.com",
          name: "sessionid",
          value: "instagram-session",
          path: "/",
        },
      ]),
      destroyPartition,
      now: () => 1_779_428_739_188,
    });

    await manager.startCapture();
    await manager.confirmCapture();
    expect(manager.getDownloadCookies()).toContain("sessionid");

    const state = await manager.clearSession();

    await expect(readFile(join(userDataDir, "site-sessions", "instagram.json"), "utf8"))
      .rejects.toThrow();
    expect(manager.getDownloadCookies()).toBeNull();
    expect(destroyPartition).toHaveBeenCalledTimes(1);
    expect(destroyPartition).toHaveBeenCalledWith("persist:ameow-site-session-instagram");
    expect(state).toMatchObject({
      availability: "missing",
      cookieCount: 0,
      lastError: null,
      sessionFilePath: null,
    });
  });

  it("clears the stable profile even when no saved downloader cookie file exists", async () => {
    const userDataDir = await createTempUserDataDir();
    const bilibili = getSiteSessionConfig("bilibili");
    const destroyPartition = vi.fn(async () => {});
    const manager = createSiteSessionManager({
      site: bilibili,
      getUserDataDir: () => userDataDir,
      createCaptureWindow: vi.fn(async () => ({
        id: 204,
        close: vi.fn(),
      })),
      readCookies: vi.fn(async () => []),
      destroyPartition,
      now: () => 1_779_428_739_189,
    });

    const state = await manager.clearSession();

    expect(destroyPartition).toHaveBeenCalledTimes(1);
    expect(destroyPartition).toHaveBeenCalledWith("persist:ameow-site-session-bilibili");
    expect(state).toMatchObject({
      availability: "missing",
      capturePhase: "idle",
      sessionFilePath: null,
    });
  });

  it("refreshes downloader credentials from the stable profile without opening a capture window", async () => {
    const userDataDir = await createTempUserDataDir();
    const instagram = getSiteSessionConfig("instagram");
    const createCaptureWindow = vi.fn(async () => ({
      id: 205,
      close: vi.fn(),
    }));
    const destroyPartition = vi.fn(async () => {});
    const manager = createSiteSessionManager({
      site: instagram,
      getUserDataDir: () => userDataDir,
      createCaptureWindow,
      readCookies: vi.fn(async () => [
        {
          domain: ".instagram.com",
          name: "sessionid",
          value: "refreshed-session",
          path: "/",
        },
      ]),
      destroyPartition,
      now: () => 1_779_428_739_190,
    });

    const state = await manager.refreshCredentials();

    expect(createCaptureWindow).not.toHaveBeenCalled();
    expect(destroyPartition).not.toHaveBeenCalled();
    expect(state).toMatchObject({
      availability: "ready",
      cookieCount: 1,
      lastError: null,
    });
    expect(manager.getDownloadCookies()).toContain("refreshed-session");
  });

  it("refreshes from the cookie jar only without merging stale supplemental cookies", async () => {
    const userDataDir = await createTempUserDataDir();
    const douyin = getSiteSessionConfig("douyin");
    const readSupplementalCookies = vi.fn(async () => ({
      msToken: "stale-supplemental-ms-token",
    }));
    const manager = createSiteSessionManager({
      site: douyin,
      getUserDataDir: () => userDataDir,
      createCaptureWindow: vi.fn(async () => ({
        id: 206,
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
      readSupplementalCookies,
      now: () => 1_779_428_739_191,
    });

    const state = await manager.refreshCredentials();

    expect(state).toMatchObject({
      availability: "ready",
      cookieCount: 4,
      missingRequiredKeys: [],
    });
    expect(readSupplementalCookies).not.toHaveBeenCalled();

    const stored = JSON.parse(
      await readFile(join(userDataDir, "site-sessions", "douyin.json"), "utf8"),
    ) as { cookies: Record<string, string> };
    expect(stored.cookies).not.toHaveProperty("msToken");
  });

  it("preserves the previous downloader credential snapshot when refresh finds no valid site cookies", async () => {
    const userDataDir = await createTempUserDataDir();
    const instagram = getSiteSessionConfig("instagram");
    let shouldReturnValidCookies = true;
    const manager = createSiteSessionManager({
      site: instagram,
      getUserDataDir: () => userDataDir,
      createCaptureWindow: vi.fn(async () => ({
        id: 207,
        close: vi.fn(),
      })),
      readCookies: vi.fn(async () => (
        shouldReturnValidCookies
          ? [
              {
                domain: ".instagram.com",
                name: "sessionid",
                value: "previous-session",
                path: "/",
              },
            ]
          : [
              {
                domain: ".example.com",
                name: "sessionid",
                value: "wrong-site",
                path: "/",
              },
            ]
      )),
      now: () => 1_779_428_739_192,
    });

    await manager.refreshCredentials();
    const before = await readFile(join(userDataDir, "site-sessions", "instagram.json"), "utf8");
    shouldReturnValidCookies = false;
    const state = await manager.refreshCredentials();
    const after = await readFile(join(userDataDir, "site-sessions", "instagram.json"), "utf8");

    expect(after).toBe(before);
    expect(manager.getDownloadCookies()).toContain("previous-session");
    expect(state).toMatchObject({
      availability: "ready",
      cookieCount: 1,
    });
    expect(state.lastError).toContain("Instagram cookie capture finished without saving any cookies");
  });

  it("does not refresh credentials while the same site's capture window is active", async () => {
    const userDataDir = await createTempUserDataDir();
    const instagram = getSiteSessionConfig("instagram");
    const readCookies = vi.fn(async () => [
      {
        domain: ".instagram.com",
        name: "sessionid",
        value: "should-not-read",
        path: "/",
      },
    ]);
    const manager = createSiteSessionManager({
      site: instagram,
      getUserDataDir: () => userDataDir,
      createCaptureWindow: vi.fn(async () => ({
        id: 208,
        close: vi.fn(),
      })),
      readCookies,
      now: () => 1_779_428_739_193,
    });

    await manager.startCapture();
    const state = await manager.refreshCredentials();

    expect(readCookies).not.toHaveBeenCalled();
    expect(manager.getDownloadCookies()).toBeNull();
    expect(state).toMatchObject({
      availability: "missing",
      capturePhase: "awaiting_confirmation",
      capturePid: 208,
    });
  });
});
