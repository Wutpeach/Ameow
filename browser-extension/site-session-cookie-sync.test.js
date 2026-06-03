import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const helperPath = path.resolve("browser-extension/site-session-cookie-sync.js");
const helperSource = readFileSync(helperPath, "utf8");

const loadHelper = () => {
  const context = {
    self: {},
    globalThis: {},
  };
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.self.AmeowSiteSessionCookieSync;
};

describe("site session cookie sync helper", () => {
  it("allows only hardcoded supported site ids", () => {
    const helper = loadHelper();

    expect(helper.resolveSiteSessionCookieSyncRequest({
      requestId: "sync-1",
      siteId: "youtube",
      cookieDomains: ["evil.example"],
    })).toMatchObject({
      success: true,
      requestId: "sync-1",
      site: {
        siteId: "youtube",
        cookieDomains: ["youtube.com", "google.com"],
      },
    });

    expect(helper.resolveSiteSessionCookieSyncRequest({
      requestId: "sync-2",
      siteId: "bilibili",
    })).toEqual({
      success: false,
      requestId: "sync-2",
      siteId: "bilibili",
      code: "unsupported_site_session",
      error: "Unsupported site session cookie sync: bilibili",
    });
  });

  it("builds cookie queries from the local site whitelist", () => {
    const helper = loadHelper();
    const queries = helper.buildCookieQueries(helper.SUPPORTED_SITES.youtube);

    expect(queries).toEqual([
      { domain: "youtube.com" },
      { domain: "google.com" },
      { url: "https://www.youtube.com/" },
      { url: "https://accounts.google.com/" },
      { url: "https://www.google.com/" },
    ]);
  });

  it("filters cross-site cookies and deduplicates by domain path and name", () => {
    const helper = loadHelper();

    expect(helper.normalizeCookieRecords([
      {
        domain: ".youtube.com",
        name: "LOGIN_INFO",
        value: "first",
        path: "/",
        secure: true,
        httpOnly: true,
        expirationDate: 1_800_000_000,
      },
      {
        domain: ".youtube.com",
        name: "LOGIN_INFO",
        value: "second",
        path: "/",
      },
      {
        domain: ".evil.example",
        name: "SID",
        value: "evil",
        path: "/",
      },
      {
        domain: ".accounts.google.com",
        name: "__Secure-1PSID",
        value: "google",
        path: "/",
      },
    ], ["youtube.com", "google.com"])).toEqual([
      {
        domain: ".youtube.com",
        expirationDate: undefined,
        httpOnly: false,
        name: "LOGIN_INFO",
        path: "/",
        secure: false,
        value: "second",
      },
      {
        domain: ".accounts.google.com",
        expirationDate: undefined,
        httpOnly: false,
        name: "__Secure-1PSID",
        path: "/",
        secure: false,
        value: "google",
      },
    ]);
  });
});
