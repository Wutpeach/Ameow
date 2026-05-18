import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildDouyinCookieYamlLines,
  parseDouyinCookies,
  readDouyinSessionStatus,
  resolveDouyinSessionPaths,
} from "./douyinSession.js";

describe("parseDouyinCookies", () => {
  it("keeps all cookie keys from Netscape and header inputs", () => {
    const cookies = parseDouyinCookies([
      "# Netscape HTTP Cookie File",
      ".douyin.com\tTRUE\t/\tFALSE\t0\tttwid\tnetscape-ttwid",
      ".douyin.com\tTRUE\t/\tFALSE\t0\tsessionid\tnetscape-session",
      "passport_csrf_token=header-passport; odin_tt=header-odin",
    ].join("\n"));

    expect(cookies).toEqual({
      ttwid: "netscape-ttwid",
      sessionid: "netscape-session",
      passport_csrf_token: "header-passport",
      odin_tt: "header-odin",
    });
  });
});

describe("readDouyinSessionStatus", () => {
  let configDir = "";

  afterEach(async () => {
    if (configDir) {
      await rm(configDir, { recursive: true, force: true });
      configDir = "";
    }
  });

  it("marks a complete app-owned login cookie set as ready", async () => {
    configDir = await mkdtemp(path.join(tmpdir(), "ameow-douyin-session-"));
    const { rootDir, cookiesPath } = resolveDouyinSessionPaths(configDir);
    await mkdir(rootDir, { recursive: true });
    await writeFile(
      cookiesPath,
      JSON.stringify({
        ttwid: "ttwid-value",
        odin_tt: "odin-value",
        passport_csrf_token: "csrf-value",
        sessionid: "session-value",
        msToken: "ms-value",
      }),
      "utf8",
    );

    const status = await readDouyinSessionStatus(configDir);
    expect(status.state).toBe("ready");
    expect(status.cookieCount).toBe(5);
    expect(status.hasLoginCookie).toBe(true);
    expect(status.missingKeys).toEqual([]);
    expect(status.lastUpdatedAtMs).not.toBeNull();
  });

  it("marks partial cookies as missing and exposes missing keys", async () => {
    configDir = await mkdtemp(path.join(tmpdir(), "ameow-douyin-session-"));
    const { rootDir, cookiesPath } = resolveDouyinSessionPaths(configDir);
    await mkdir(rootDir, { recursive: true });
    await writeFile(
      cookiesPath,
      JSON.stringify({
        ttwid: "ttwid-value",
        sessionid: "session-value",
      }),
      "utf8",
    );

    const status = await readDouyinSessionStatus(configDir);
    expect(status.state).toBe("missing");
    expect(status.hasLoginCookie).toBe(true);
    expect(status.missingKeys).toEqual(["odin_tt", "passport_csrf_token"]);
  });
});

describe("buildDouyinCookieYamlLines", () => {
  it("renders an explicit empty map when no cookies are present", () => {
    expect(buildDouyinCookieYamlLines({})).toEqual(["cookies: {}"]);
  });
});
