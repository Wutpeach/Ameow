import { describe, expect, it, vi } from "vitest";

import { toNetworkDiagnosticSnapshot } from "../config/networkRoute.js";
import { createNetworkRouteService } from "./networkRouteService.js";
import type { NetworkRouteServiceDependencies } from "./networkRouteService.js";

const createService = (overrides: Partial<NetworkRouteServiceDependencies> = {}) => createNetworkRouteService({
  getEffectiveManualProxyUrl: () => null,
  resolveSystemProxyRules: vi.fn(async () => "DIRECT"),
  getEnvironment: () => ({}),
  ...overrides,
});

const TARGET = "https://www.youtube.com/watch?v=abc123";

describe("createNetworkRouteService", () => {
  it("applies the effective manual proxy first with preference manual", async () => {
    const service = createService({
      getEffectiveManualProxyUrl: () => "http://127.0.0.1:7890",
    });
    const resolution = await service.resolveRoute({ targetUrl: TARGET, consumer: "yt-dlp" });
    expect(resolution.preference).toBe("manual");
    expect(resolution.route).toMatchObject({
      mode: "proxy",
      source: "manual",
      protocol: "http",
      proxyUrl: "http://127.0.0.1:7890",
      resolvedFor: TARGET,
    });
    expect(resolution.status).toBe("resolved");
  });

  it("applies a single supported system directive to the CLI route", async () => {
    const resolveSystemProxyRules = vi.fn(async () => "PROXY 127.0.0.1:7897; DIRECT");
    const service = createService({ resolveSystemProxyRules });
    const resolution = await service.resolveRoute({ targetUrl: TARGET, consumer: "gallery-dl" });
    expect(resolveSystemProxyRules).toHaveBeenCalledWith(TARGET);
    expect(resolution.route).toMatchObject({
      mode: "proxy",
      source: "system",
      protocol: "http",
      proxyUrl: "http://127.0.0.1:7897",
    });
    expect(resolution.status).toBe("resolved");
  });

  it("maps system SOCKS5 directives to a socks5 route", async () => {
    const service = createService({
      resolveSystemProxyRules: vi.fn(async () => "SOCKS5 127.0.0.1:7891"),
    });
    const resolution = await service.resolveRoute({ targetUrl: TARGET, consumer: "yt-dlp" });
    expect(resolution.route).toMatchObject({ mode: "proxy", protocol: "socks5" });
  });

  it("turns system multiple candidates into complex without falling through to environment", async () => {
    const service = createService({
      resolveSystemProxyRules: vi.fn(async () => "PROXY 127.0.0.1:7897; PROXY 127.0.0.1:7898"),
      getEnvironment: () => ({ HTTPS_PROXY: "http://9.9.9.9:8080" }),
    });
    const resolution = await service.resolveRoute({ targetUrl: TARGET, consumer: "yt-dlp" });
    expect(resolution.route).toMatchObject({
      mode: "complex",
      source: "system",
      reason: "multiple_candidates",
    });
    expect(resolution.status).toBe("resolved");
  });

  it("turns system malformed/unsupported results into complex without silent fallback", async () => {
    const service = createService({
      resolveSystemProxyRules: vi.fn(async () => "FTP 127.0.0.1:21"),
      getEnvironment: () => ({ HTTPS_PROXY: "http://9.9.9.9:8080" }),
    });
    const resolution = await service.resolveRoute({ targetUrl: TARGET, consumer: "yt-dlp" });
    expect(resolution.route).toMatchObject({ mode: "complex", source: "system", reason: "unsupported" });
  });

  it("treats explicit system DIRECT as final without reading the environment", async () => {
    const getEnvironment = vi.fn(() => ({
      HTTPS_PROXY: "http://127.0.0.1:7897",
      ALL_PROXY: "http://9.9.9.9:8080",
    }));
    const service = createService({
      resolveSystemProxyRules: vi.fn(async () => "DIRECT"),
      getEnvironment,
    });
    const resolution = await service.resolveRoute({ targetUrl: TARGET, consumer: "yt-dlp" });
    expect(resolution.route).toMatchObject({
      mode: "direct",
      source: "system",
      reason: "resolved_direct",
    });
    expect(resolution.status).toBe("resolved");
    expect(resolution.trace).toContainEqual({
      tier: "system",
      outcome: "direct",
      detail: "System explicitly resolved direct access for the canonical target.",
    });
    expect(getEnvironment).not.toHaveBeenCalled();
  });

  it("falls back to the environment tier with status fallback when system resolution fails", async () => {
    const service = createService({
      resolveSystemProxyRules: vi.fn(async () => {
        throw new Error("resolveProxy failed");
      }),
      getEnvironment: () => ({ HTTPS_PROXY: "http://127.0.0.1:7897" }),
    });
    const resolution = await service.resolveRoute({ targetUrl: TARGET, consumer: "yt-dlp" });
    expect(resolution.status).toBe("fallback");
    expect(resolution.route).toMatchObject({ mode: "proxy", source: "environment" });
    expect(resolution.failure?.classification).toBe("NETWORK_PROXY_RESOLUTION_FAILED");
  });

  it("returns an explicit direct route when system is DIRECT and no environment route applies", async () => {
    const service = createService();
    const resolution = await service.resolveRoute({ targetUrl: TARGET, consumer: "yt-dlp" });
    expect(resolution.route).toMatchObject({
      mode: "direct",
      source: "system",
      reason: "resolved_direct",
    });
    expect(resolution.status).toBe("resolved");
    expect(resolution.failure).toBeUndefined();
  });

  it("evaluates the environment tier when system resolution is not applicable and no proxy applies", async () => {
    const service = createService({
      resolveSystemProxyRules: vi.fn(async () => null),
      getEnvironment: () => ({ HTTPS_PROXY: "http://127.0.0.1:7897" }),
    });
    const resolution = await service.resolveRoute({ targetUrl: TARGET, consumer: "yt-dlp" });
    expect(resolution.route).toMatchObject({
      mode: "proxy",
      source: "environment",
      proxyUrl: "http://127.0.0.1:7897",
    });
    expect(resolution.status).toBe("resolved");
    expect(resolution.failure).toBeUndefined();
    expect(resolution.trace).toContainEqual({
      tier: "system",
      outcome: "unavailable",
      detail: "System proxy resolution is not applicable for the target URL; environment route evaluated.",
    });
  });

  it("returns a plain direct route with source direct when the system tier is not applicable and no environment applies", async () => {
    const service = createService({
      resolveSystemProxyRules: vi.fn(async () => null),
    });
    const resolution = await service.resolveRoute({ targetUrl: TARGET, consumer: "yt-dlp" });
    expect(resolution.route).toMatchObject({
      mode: "direct",
      source: "direct",
      reason: "no_proxy_source",
    });
    expect(resolution.status).toBe("resolved");
    expect(resolution.failure).toBeUndefined();
  });

  it("distinguishes explicit system DIRECT from not-applicable direct and resolution-failure fallback", async () => {
    // Explicit system DIRECT: final direct with source system, status resolved.
    const explicitDirect = await createService({
      resolveSystemProxyRules: vi.fn(async () => "DIRECT"),
    }).resolveRoute({ targetUrl: TARGET, consumer: "yt-dlp" });
    // System not applicable with no environment route: plain direct, source direct.
    const notApplicableDirect = await createService({
      resolveSystemProxyRules: vi.fn(async () => null),
    }).resolveRoute({ targetUrl: TARGET, consumer: "yt-dlp" });
    // System resolution threw with no environment route: direct fallback.
    const failureFallback = await createService({
      resolveSystemProxyRules: vi.fn(async () => {
        throw new Error("resolveProxy failed");
      }),
    }).resolveRoute({ targetUrl: TARGET, consumer: "yt-dlp" });

    expect(explicitDirect).toMatchObject({
      status: "resolved",
      route: { mode: "direct", source: "system", reason: "resolved_direct" },
    });
    expect(explicitDirect.trace).toContainEqual({
      tier: "system",
      outcome: "direct",
      detail: "System explicitly resolved direct access for the canonical target.",
    });
    expect(notApplicableDirect).toMatchObject({
      status: "resolved",
      route: { mode: "direct", source: "direct", reason: "no_proxy_source" },
    });
    expect(notApplicableDirect.trace).toContainEqual({
      tier: "system",
      outcome: "unavailable",
      detail: "System proxy resolution is not applicable for the target URL; environment route evaluated.",
    });
    expect(failureFallback).toMatchObject({
      status: "fallback",
      route: { mode: "direct", source: "fallback", reason: "resolution_fallback" },
    });
    expect(failureFallback.trace).toContainEqual({
      tier: "system",
      outcome: "failed",
      detail: "System proxy resolution failed for the target URL.",
    });
  });

  it("keeps source system/direct snapshots distinguishable", async () => {
    const explicitDirect = await createService({
      resolveSystemProxyRules: vi.fn(async () => "DIRECT"),
    }).resolveRoute({ targetUrl: TARGET, consumer: "yt-dlp" });
    const defaultDirect = await createService({
      resolveSystemProxyRules: vi.fn(async () => null),
    }).resolveRoute({ targetUrl: TARGET, consumer: "yt-dlp" });
    const failureFallback = await createService({
      resolveSystemProxyRules: vi.fn(async () => {
        throw new Error("resolveProxy failed");
      }),
    }).resolveRoute({ targetUrl: TARGET, consumer: "yt-dlp" });

    const explicitSnapshot = toNetworkDiagnosticSnapshot(explicitDirect);
    const defaultSnapshot = toNetworkDiagnosticSnapshot(defaultDirect);
    const fallbackSnapshot = toNetworkDiagnosticSnapshot(failureFallback);
    expect(explicitSnapshot).toMatchObject({ source: "system", resolutionStatus: "resolved" });
    expect(defaultSnapshot).toMatchObject({ source: "direct", resolutionStatus: "resolved" });
    expect(fallbackSnapshot).toMatchObject({ source: "fallback", resolutionStatus: "fallback" });
  });

  it("returns a direct fallback with failure evidence when system resolution fails and no environment applies", async () => {
    const service = createService({
      resolveSystemProxyRules: vi.fn(async () => {
        throw new Error("resolveProxy failed");
      }),
    });
    const resolution = await service.resolveRoute({ targetUrl: TARGET, consumer: "yt-dlp" });
    expect(resolution.route).toMatchObject({
      mode: "direct",
      source: "fallback",
      reason: "resolution_fallback",
    });
    expect(resolution.status).toBe("fallback");
    expect(resolution.failure?.classification).toBe("NETWORK_PROXY_RESOLUTION_FAILED");
  });

  it("records NO_PROXY-driven direct routes when the system tier is unavailable", async () => {
    const service = createService({
      resolveSystemProxyRules: vi.fn(async () => {
        throw new Error("resolveProxy failed");
      }),
      getEnvironment: () => ({
        NO_PROXY: "youtube.com",
        HTTPS_PROXY: "http://127.0.0.1:7897",
      }),
    });
    const resolution = await service.resolveRoute({ targetUrl: TARGET, consumer: "yt-dlp" });
    expect(resolution.route).toMatchObject({
      mode: "direct",
      source: "environment",
      reason: "no_proxy_match",
    });
    expect(resolution.status).toBe("fallback");
  });

  it("keeps resolvedFor as the exact canonical target on every route", async () => {
    const service = createService({
      resolveSystemProxyRules: vi.fn(async () => "PROXY 127.0.0.1:7897"),
    });
    const resolution = await service.resolveRoute({ targetUrl: TARGET, consumer: "yt-dlp" });
    expect(resolution.route.resolvedFor).toBe(TARGET);
  });
});
