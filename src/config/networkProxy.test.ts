import { describe, expect, it } from "vitest";

import {
  buildManualProxyEnv,
  isProxyShapedFailure,
  normalizeManualNetworkProxyUrl,
  resolveNetworkProxyConfig,
  summarizeManualNetworkProxy,
} from "./networkProxy";

describe("network proxy config", () => {
  it("normalizes supported HTTP(S) manual proxy URLs", () => {
    expect(normalizeManualNetworkProxyUrl(" http://127.0.0.1:7890/ ")).toBe("http://127.0.0.1:7890");
    expect(normalizeManualNetworkProxyUrl("https://proxy.example.test:8443")).toBe(
      "https://proxy.example.test:8443",
    );
  });

  it("rejects unsupported manual proxy URL shapes", () => {
    expect(normalizeManualNetworkProxyUrl("socks5://127.0.0.1:7891")).toBeNull();
    expect(normalizeManualNetworkProxyUrl("http://user:pass@127.0.0.1:7890")).toBeNull();
    expect(normalizeManualNetworkProxyUrl("http://127.0.0.1:7890/path")).toBeNull();
    expect(normalizeManualNetworkProxyUrl("http://127.0.0.1:7890?x=1")).toBeNull();
    expect(normalizeManualNetworkProxyUrl("127.0.0.1:7890")).toBeNull();
  });

  it("resolves persisted config without activating stale proxy-like keys", () => {
    expect(resolveNetworkProxyConfig({
      proxyUrl: "http://127.0.0.1:7890",
      networkProxyUrl: "http://127.0.0.1:7891",
    })).toEqual({
      preferenceMode: "system",
      manualProxy: {
        url: "http://127.0.0.1:7891",
        scheme: "http",
        host: "127.0.0.1",
        port: "7891",
      },
    });

    expect(resolveNetworkProxyConfig({
      networkProxyMode: "manual",
      networkProxyUrl: "http://127.0.0.1:7891",
    }).preferenceMode).toBe("manual");
  });

  it("builds child-process proxy environment from manual proxy only", () => {
    const env = buildManualProxyEnv("http://127.0.0.1:7890", { PATH: "base" });

    expect(env).toMatchObject({
      PATH: "base",
      HTTP_PROXY: "http://127.0.0.1:7890",
      HTTPS_PROXY: "http://127.0.0.1:7890",
      http_proxy: "http://127.0.0.1:7890",
      https_proxy: "http://127.0.0.1:7890",
    });
  });

  it("summarizes manual proxy without credentials or raw rules", () => {
    expect(summarizeManualNetworkProxy("http://127.0.0.1:7890")).toEqual({
      scheme: "http",
      host: "127.0.0.1",
      port: "7890",
    });
  });

  it("classifies only proxy-shaped failures", () => {
    expect(isProxyShapedFailure(
      new Error("ERR_PROXY_CONNECTION_FAILED"),
      "http://127.0.0.1:7890",
    )).toBe(true);
    expect(isProxyShapedFailure(
      new Error("connect ECONNREFUSED 127.0.0.1:7890"),
      "http://127.0.0.1:7890",
    )).toBe(true);
    expect(isProxyShapedFailure(
      new Error("HTTP Error 403: Forbidden"),
      "http://127.0.0.1:7890",
    )).toBe(false);
  });
});
