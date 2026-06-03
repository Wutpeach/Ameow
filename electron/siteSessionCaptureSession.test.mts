import { describe, expect, it, vi } from "vitest";

import { configureSiteSessionCaptureSession } from "./siteSessionCaptureSession.mjs";

const createCaptureSession = () => ({
  setProxy: vi.fn(async () => undefined),
  setUserAgent: vi.fn(),
  setPermissionCheckHandler: vi.fn(),
  setPermissionRequestHandler: vi.fn(),
  webRequest: {
    onBeforeSendHeaders: vi.fn(),
  },
});

describe("site session capture session configuration", () => {
  it("applies proxy before registering first-time capture hardening", async () => {
    const captureSession = createCaptureSession();
    const state = {
      configuredPartitions: new Set<string>(),
      supplementalCookiesByPartition: new Map<string, Record<string, string>>(),
    };

    await configureSiteSessionCaptureSession({
      site: {
        id: "youtube",
        cookieDomains: ["youtube.com", "google.com"],
      },
      partition: "persist:ameow-site-session-youtube",
      captureSession,
      proxyConfig: {
        globalProxyEnabled: true,
        globalProxyUrl: "http://127.0.0.1:7897",
      },
      locale: "zh-CN",
      rawUserAgent: "Mozilla/5.0 Chrome/135.0.0.0 Safari/537.36 Electron/41.0.4 Ameow/0.5.0",
      state,
    });

    expect(captureSession.setProxy).toHaveBeenCalledWith({
      mode: "fixed_servers",
      proxyRules: "http://127.0.0.1:7897",
      proxyBypassRules: "<local>;localhost;127.0.0.1;::1",
    });
    expect(captureSession.setUserAgent).toHaveBeenCalledWith(
      "Mozilla/5.0 Chrome/135.0.0.0 Safari/537.36",
      "zh-CN,zh;q=0.9,en;q=0.8",
    );
    expect(captureSession.webRequest.onBeforeSendHeaders).toHaveBeenCalledTimes(1);
  });

  it("reapplies proxy for repeated captures without adding duplicate request listeners", async () => {
    const captureSession = createCaptureSession();
    const state = {
      configuredPartitions: new Set<string>(),
      supplementalCookiesByPartition: new Map<string, Record<string, string>>(),
    };
    const commonOptions = {
      site: {
        id: "youtube",
        cookieDomains: ["youtube.com", "google.com"],
      },
      partition: "persist:ameow-site-session-youtube",
      captureSession,
      locale: "en-US",
      rawUserAgent: "Mozilla/5.0 Chrome/135.0.0.0 Safari/537.36",
      state,
    };

    await configureSiteSessionCaptureSession({
      ...commonOptions,
      proxyConfig: {
        globalProxyEnabled: true,
        globalProxyUrl: "http://127.0.0.1:7897",
      },
    });
    await configureSiteSessionCaptureSession({
      ...commonOptions,
      proxyConfig: {
        globalProxyEnabled: false,
        globalProxyUrl: "http://127.0.0.1:7897",
      },
    });

    expect(captureSession.setProxy).toHaveBeenCalledTimes(2);
    expect(captureSession.setProxy).toHaveBeenNthCalledWith(2, { mode: "system" });
    expect(captureSession.webRequest.onBeforeSendHeaders).toHaveBeenCalledTimes(1);
    expect(captureSession.setUserAgent).toHaveBeenCalledTimes(2);
  });
});
