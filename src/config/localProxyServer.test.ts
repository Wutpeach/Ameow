import { describe, expect, it } from "vitest";

import type { NetworkRoute } from "./networkRoute";
import {
  buildLocalProxyAddress,
  buildLocalProxyTargetUrl,
  createInitialLocalProxyServerState,
  DEFAULT_LOCAL_PROXY_PORT,
  isLocalProxySelfRoute,
  isValidLocalProxyPort,
  LOCAL_PROXY_CONFIG_KEYS,
  normalizeLocalProxyServerConfig,
} from "./localProxyServer";

describe("local proxy server config", () => {
  it("defaults to disabled on the default port for an empty config", () => {
    expect(normalizeLocalProxyServerConfig({})).toEqual({
      enabled: false,
      port: DEFAULT_LOCAL_PROXY_PORT,
    });
  });

  it("reads persisted enabled/port values", () => {
    expect(normalizeLocalProxyServerConfig({
      [LOCAL_PROXY_CONFIG_KEYS.enabled]: true,
      [LOCAL_PROXY_CONFIG_KEYS.port]: 21081,
    })).toEqual({ enabled: true, port: 21081 });
  });

  it("falls back per field so one bad value never discards the other", () => {
    expect(normalizeLocalProxyServerConfig({
      [LOCAL_PROXY_CONFIG_KEYS.enabled]: true,
      [LOCAL_PROXY_CONFIG_KEYS.port]: "21080",
    })).toEqual({ enabled: true, port: DEFAULT_LOCAL_PROXY_PORT });

    expect(normalizeLocalProxyServerConfig({
      [LOCAL_PROXY_CONFIG_KEYS.enabled]: "yes",
      [LOCAL_PROXY_CONFIG_KEYS.port]: 21080,
    })).toEqual({ enabled: false, port: 21080 });
  });

  it("rejects privileged, out-of-range, and non-integer ports", () => {
    expect(isValidLocalProxyPort(1023)).toBe(false);
    expect(isValidLocalProxyPort(65536)).toBe(false);
    expect(isValidLocalProxyPort(21080.5)).toBe(false);
    expect(isValidLocalProxyPort(Number.NaN)).toBe(false);
    expect(isValidLocalProxyPort("21080")).toBe(false);
    expect(isValidLocalProxyPort(1024)).toBe(true);
    expect(isValidLocalProxyPort(65535)).toBe(true);
  });
});

describe("local proxy target URL", () => {
  it("maps port 80 to http and every other port to https", () => {
    expect(buildLocalProxyTargetUrl("example.test", 80)).toBe("http://example.test:80/");
    expect(buildLocalProxyTargetUrl("example.test", 443)).toBe("https://example.test:443/");
    expect(buildLocalProxyTargetUrl("example.test", 8443)).toBe("https://example.test:8443/");
  });

  it("brackets IPv6 literals", () => {
    expect(buildLocalProxyTargetUrl("::1", 8443)).toBe("https://[::1]:8443/");
  });
});

describe("local proxy state", () => {
  it("starts stopped and exposes copyable client addresses", () => {
    const state = createInitialLocalProxyServerState(
      { enabled: true, port: 21080 },
      1_700_000_000_000,
    );

    expect(state).toEqual({
      enabled: true,
      running: false,
      address: "127.0.0.1:21080",
      port: 21080,
      httpProxyUrl: "http://127.0.0.1:21080",
      socksProxyUrl: "socks5://127.0.0.1:21080",
      activeConnections: 0,
      totalConnections: 0,
      totalFailures: 0,
      lastError: null,
      startedAtMs: null,
      updatedAtMs: 1_700_000_000_000,
    });
    expect(buildLocalProxyAddress(21080)).toBe("127.0.0.1:21080");
  });
});

describe("local proxy self route", () => {
  const proxyRoute = (proxyUrl: string): NetworkRoute => ({
    mode: "proxy",
    source: "manual",
    protocol: "http",
    proxyUrl,
    resolvedFor: "https://example.test:443/",
  });

  it("flags an upstream route that points back at the listener", () => {
    expect(isLocalProxySelfRoute(proxyRoute("http://127.0.0.1:21080"), { port: 21080 })).toBe(true);
    expect(isLocalProxySelfRoute(proxyRoute("http://localhost:21080"), { port: 21080 })).toBe(true);
    expect(isLocalProxySelfRoute(proxyRoute("socks5://[::1]:21080"), { port: 21080 })).toBe(true);
  });

  it("falls back to the scheme default port when the route omits one", () => {
    expect(isLocalProxySelfRoute(proxyRoute("http://127.0.0.1"), { port: 80 })).toBe(true);
    expect(isLocalProxySelfRoute(proxyRoute("https://127.0.0.1"), { port: 443 })).toBe(true);
  });

  it("ignores loopback routes on another port and remote routes", () => {
    expect(isLocalProxySelfRoute(proxyRoute("http://127.0.0.1:21081"), { port: 21080 })).toBe(false);
    expect(isLocalProxySelfRoute(proxyRoute("http://example.test:21080"), { port: 21080 })).toBe(false);
  });

  it("ignores non-proxy routes and unparsable proxy URLs", () => {
    const directRoute: NetworkRoute = {
      mode: "direct",
      source: "direct",
      reason: "no_proxy_source",
      resolvedFor: "https://example.test:443/",
    };
    expect(isLocalProxySelfRoute(directRoute, { port: 21080 })).toBe(false);
    expect(isLocalProxySelfRoute(proxyRoute("not a url"), { port: 21080 })).toBe(false);
  });
});
