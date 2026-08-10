import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const helperPath = path.resolve("browser-extension/site-session-cookie-sync.js");
const helperSource = readFileSync(helperPath, "utf8");

const loadHelper = () => {
  const context = {
    URL,
    self: {},
    globalThis: {},
  };
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.self.AmeowSiteSessionCookieSync;
};

describe("site session cookie sync helper", () => {
  it("allows current seeded site ids and rejects unsupported ids", () => {
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
    })).toMatchObject({
      success: true,
      requestId: "sync-2",
      site: {
        siteId: "bilibili",
        cookieDomains: ["bilibili.com", "b23.tv"],
      },
    });

    expect(helper.resolveSiteSessionCookieSyncRequest({
      requestId: "sync-3",
      siteId: "unknown",
    })).toEqual({
      success: false,
      requestId: "sync-3",
      siteId: "unknown",
      code: "unsupported_site_session",
      error: "Unsupported site session cookie sync: unknown",
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

  it("uses desktop-pushed registry entries before the local fallback whitelist", () => {
    const helper = loadHelper();

    helper.setRegistryEntries([
      {
        siteId: "site-sub-example-com",
        displayName: "Example",
        primaryUrl: "https://sub.example.com/watch",
        primaryHost: "sub.example.com",
        cookieDomains: ["sub.example.com"],
        requiredCookieKeys: [],
        loginCookieKeys: [],
        syncAuthorization: "user_enabled",
        autoSyncAllowed: true,
        discoverySources: ["extension_current_tab"],
        visibility: "visible",
        icon: { kind: "placeholder" },
      },
      {
        siteId: "youtube",
        displayName: "YouTube Override",
        primaryUrl: "https://www.youtube.com/",
        primaryHost: "www.youtube.com",
        cookieDomains: ["studio.youtube.com"],
      },
    ]);

    expect(helper.resolveSiteSessionCookieSyncRequest({
      requestId: "sync-registry-1",
      siteId: "site-sub-example-com",
    })).toMatchObject({
      success: true,
      site: {
        siteId: "site-sub-example-com",
        cookieDomains: ["sub.example.com"],
      },
    });
    expect(helper.resolveSiteSessionCookieSyncRequest({
      requestId: "sync-registry-2",
      siteId: "youtube",
    })).toMatchObject({
      success: true,
      site: {
        siteId: "youtube",
        cookieDomains: ["studio.youtube.com"],
      },
    });
  });

  it("matches current tab URLs against registry primary hosts and cookie domains", () => {
    const helper = loadHelper();

    helper.setRegistryEntries([
      {
        siteId: "patreon",
        displayName: "Patreon",
        primaryUrl: "https://www.patreon.com/",
        primaryHost: "www.patreon.com",
        cookieDomains: ["patreon.com"],
      },
    ]);

    expect(helper.findRegistryEntryForUrl("https://creator.patreon.com/posts/123")).toMatchObject({
      siteId: "patreon",
    });
    expect(helper.findRegistryEntryForUrl("https://example.com/posts/123")).toBeNull();
    expect(helper.findRegistryEntryForUrl("chrome://extensions")).toBeNull();
  });

  it("uses hidden catalog registry entries for current-tab sync eligibility", () => {
    const helper = loadHelper();

    helper.setRegistryEntries([
      {
        siteId: "patreon",
        displayName: "Patreon",
        primaryUrl: "https://www.patreon.com/",
        primaryHost: "www.patreon.com",
        cookieDomains: ["patreon.com"],
        syncAuthorization: "seeded",
        autoSyncAllowed: true,
        discoverySources: ["gallery-dl-supported-sites"],
        engineHints: ["gallery-dl"],
        visibility: "hidden_catalog",
        icon: { kind: "placeholder" },
      },
    ]);

    const entry = helper.findRegistryEntryForUrl("https://creator.patreon.com/posts/123");
    expect(entry).toMatchObject({
      siteId: "patreon",
      visibility: "hidden_catalog",
    });
    expect(helper.buildCookieQueries(entry)).toEqual([
      { domain: "patreon.com" },
    ]);
  });

  it("builds cookie queries only from registry-approved domains", () => {
    const helper = loadHelper();

    helper.setRegistryEntries([
      {
        siteId: "site-sub-example-com",
        displayName: "Example",
        primaryUrl: "https://sub.example.com/watch",
        primaryHost: "sub.example.com",
        cookieDomains: ["sub.example.com", "evil.example", "sub.example.com"],
      },
    ]);
    const resolved = helper.resolveSiteSessionCookieSyncRequest({
      requestId: "sync-registry-query",
      siteId: "site-sub-example-com",
      cookieDomains: ["desktop-injected.example"],
      cookieUrls: ["https://desktop-injected.example/"],
    });

    expect(resolved).toMatchObject({
      success: true,
      site: {
        cookieDomains: ["sub.example.com", "evil.example"],
      },
    });
    expect(helper.buildCookieQueries(resolved.site)).toEqual([
      { domain: "sub.example.com" },
      { domain: "evil.example" },
    ]);
  });

  it("rejects unsupported ids before any desktop-provided domains can be used", () => {
    const helper = loadHelper();

    const resolved = helper.resolveSiteSessionCookieSyncRequest({
      requestId: "sync-unsupported",
      siteId: "unknown",
      cookieDomains: ["example.com"],
      cookieUrls: ["https://example.com/"],
    });

    expect(resolved).toEqual({
      success: false,
      requestId: "sync-unsupported",
      siteId: "unknown",
      code: "unsupported_site_session",
      error: "Unsupported site session cookie sync: unknown",
    });
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

  it("keeps registry readiness per connection generation", () => {
    const helper = loadHelper();
    expect(helper.isRegistryReady()).toBe(false);

    helper.setRegistryEntries([{ siteId: "douyin", cookieDomains: ["douyin.com"] }]);
    // Entries alone do not make the registry current: readiness requires a
    // fresh Desktop push on the current connection generation.
    expect(helper.isRegistryReady()).toBe(false);

    helper.setRegistryReady(true);
    expect(helper.isRegistryReady()).toBe(true);

    // Connection close/replacement resets readiness until the next push.
    helper.resetRegistryReadiness();
    expect(helper.isRegistryReady()).toBe(false);
    // The cached entries remain readable but are not treated as current.
    expect(helper.getRegistryEntries()).toHaveLength(1);
  });

  it("reaches ready state through the Desktop registry push flow", () => {
    const helper = loadHelper();
    helper.setRegistryReady(true);
    helper.setRegistryEntries([{ siteId: "youtube", cookieDomains: ["youtube.com"] }]);

    expect(helper.isRegistryReady()).toBe(true);
    expect(helper.findRegistryEntryBySiteId("youtube").siteId).toBe("youtube");
  });
});
