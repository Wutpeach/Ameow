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
});

describe("buildDouyinCookieYamlLines", () => {
  it("renders an explicit empty map when no cookies are present", () => {
    expect(buildDouyinCookieYamlLines({})).toEqual(["cookies: {}"]);
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
