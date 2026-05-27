import { describe, expect, it } from "vitest";

import {
  collectSupplementalCookiesFromRequest,
  isUrlForSiteCookieDomains,
  parseCookieHeader,
  prepareSiteSessionCapturePartition,
  resolveSiteSessionCaptureAcceptLanguages,
  resolveSiteSessionCaptureUserAgent,
  shouldAllowSiteSessionCapturePermission,
} from "./siteSessionCaptureHardening.mjs";

describe("site session capture hardening", () => {
  it("denies capture-window permissions by default", () => {
    expect(shouldAllowSiteSessionCapturePermission()).toBe(false);
  });

  it("removes Electron product tokens from the capture user agent", () => {
    expect(
      resolveSiteSessionCaptureUserAgent(
        "Mozilla/5.0 Chrome/135.0.0.0 Safari/537.36 Electron/41.0.4 Ameow/0.5.0",
      ),
    ).toBe("Mozilla/5.0 Chrome/135.0.0.0 Safari/537.36");
  });

  it("falls back to a desktop Chrome-like user agent when input is unusable", () => {
    expect(resolveSiteSessionCaptureUserAgent("Ameow/0.5.0 Electron/41.0.4")).toContain("Chrome/");
  });

  it("resolves capture accept languages from locale", () => {
    expect(resolveSiteSessionCaptureAcceptLanguages("zh-CN")).toBe("zh-CN,zh;q=0.9,en;q=0.8");
    expect(resolveSiteSessionCaptureAcceptLanguages("en-US")).toBe("en-US,en;q=0.9,zh-CN;q=0.7,zh;q=0.6");
  });

  it("matches subdomains for allowed site cookie domains", () => {
    expect(isUrlForSiteCookieDomains("https://www.instagram.com/accounts/login", ["instagram.com"])).toBe(true);
    expect(isUrlForSiteCookieDomains("https://cdninstagram.com/image.jpg", ["instagram.com"])).toBe(false);
  });

  it("parses valid cookie header pairs and ignores malformed parts", () => {
    expect(parseCookieHeader("ttwid=abc; bad; =empty; msToken=xyz")).toEqual([
      ["ttwid", "abc"],
      ["msToken", "xyz"],
    ]);
  });

  it("collects same-site request cookies and msToken query values", () => {
    const supplementalCookies: Record<string, string> = {};

    collectSupplementalCookiesFromRequest({
      url: "https://www.douyin.com/user/abc?msToken=query-token",
      requestHeaders: {
        Cookie: "ttwid=ttwid-value; sessionid=session-value",
      },
      cookieDomains: ["douyin.com"],
      supplementalCookies,
    });

    expect(supplementalCookies).toMatchObject({
      ttwid: "ttwid-value",
      sessionid: "session-value",
      msToken: "query-token",
    });
  });

  it("does not collect cross-site request cookies", () => {
    const supplementalCookies: Record<string, string> = {};

    collectSupplementalCookiesFromRequest({
      url: "https://example.com/?msToken=query-token",
      requestHeaders: {
        Cookie: "sessionid=wrong-site",
      },
      cookieDomains: ["instagram.com"],
      supplementalCookies,
    });

    expect(supplementalCookies).toEqual({});
  });

  it("does not overwrite an already observed cookie value", () => {
    const supplementalCookies: Record<string, string> = { sessionid: "first" };

    collectSupplementalCookiesFromRequest({
      url: "https://www.instagram.com/",
      requestHeaders: {
        Cookie: "sessionid=second; csrftoken=csrf",
      },
      cookieDomains: ["instagram.com"],
      supplementalCookies,
    });

    expect(supplementalCookies).toMatchObject({
      sessionid: "first",
      csrftoken: "csrf",
    });
  });

  it("configures capture session state once per partition while resetting supplemental cookies", () => {
    const configuredPartitions = new Set<string>();
    const supplementalCookiesByPartition = new Map<string, Record<string, string>>();
    const state = {
      configuredPartitions,
      supplementalCookiesByPartition,
    };

    const first = prepareSiteSessionCapturePartition(state, "persist:ameow-site-session-instagram");
    first.supplementalCookies.sessionid = "old-session";
    const second = prepareSiteSessionCapturePartition(state, "persist:ameow-site-session-instagram");
    const third = prepareSiteSessionCapturePartition(state, "persist:ameow-site-session-youtube");

    expect(first.shouldConfigureSession).toBe(true);
    expect(second.shouldConfigureSession).toBe(false);
    expect(third.shouldConfigureSession).toBe(true);
    expect(configuredPartitions).toEqual(new Set([
      "persist:ameow-site-session-instagram",
      "persist:ameow-site-session-youtube",
    ]));
    expect(supplementalCookiesByPartition.get("persist:ameow-site-session-instagram")).toEqual({});
    expect(second.supplementalCookies).toBe(supplementalCookiesByPartition.get("persist:ameow-site-session-instagram"));
  });
});
