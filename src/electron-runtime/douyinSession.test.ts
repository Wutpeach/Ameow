import { describe, expect, it } from "vitest";

import {
  buildDouyinCookieYamlLines,
  mergeDouyinCookies,
  parseDouyinCookies,
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

  it("does not parse Netscape cookie lines as Cookie header tokens", () => {
    const cookies = parseDouyinCookies([
      "# Netscape HTTP Cookie File",
      ".douyin.com\tTRUE\t/\tTRUE\t1893456000\tttwid\tnetscape=ttwid=value",
      ".douyin.com\tTRUE\t/\tTRUE\t1893456000\tmsToken\tms=token=value",
    ].join("\n"));

    expect(cookies).toEqual({
      ttwid: "netscape=ttwid=value",
      msToken: "ms=token=value",
    });
    expect(Object.keys(cookies).some((key) => key.includes("\t"))).toBe(false);
  });
});

describe("buildDouyinCookieYamlLines", () => {
  it("renders an explicit empty map when no cookies are present", () => {
    expect(buildDouyinCookieYamlLines({})).toEqual(["cookies: {}"]);
  });

  it("drops invalid cookie keys that would break YAML output", () => {
    expect(buildDouyinCookieYamlLines({
      "bad\tkey": "tab",
      "bad key": "space",
      "bad;key": "semicolon",
      ttwid: "valid",
    })).toEqual([
      "cookies:",
      "  ttwid: \"valid\"",
    ]);
  });
});

describe("mergeDouyinCookies", () => {
  it("keeps later non-empty values when merging cookie records", () => {
    expect(mergeDouyinCookies(
      { ttwid: "first", sessionid: "session" },
      { ttwid: "second", msToken: "token" },
    )).toEqual({
      ttwid: "second",
      sessionid: "session",
      msToken: "token",
    });
  });
});
