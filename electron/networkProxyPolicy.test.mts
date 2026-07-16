import { describe, expect, it, vi } from "vitest";

import { createNetworkProxyPolicyController } from "./networkProxyPolicy.mjs";

const createResponse = (status: number, statusText = "OK"): Response => ({
  status,
  statusText,
} as Response);

const flushPromises = async () => {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
};

describe("network proxy policy controller", () => {
  it("applies system policy by default", async () => {
    const applySystemProxy = vi.fn(async () => undefined);
    const controller = createNetworkProxyPolicyController({
      readConfigObject: async () => ({}),
      applySystemProxy,
      applyManualProxy: vi.fn(async () => undefined),
      fetchWithManualProxy: vi.fn(async () => createResponse(204)),
      log: vi.fn(),
      emitStateChanged: vi.fn(),
      now: () => 1000,
    });

    await controller.initializeFromConfig();

    expect(applySystemProxy).toHaveBeenCalledTimes(1);
    expect(controller.getEffectivePolicy()).toEqual({
      mode: "system",
      reason: "user_system",
    });
  });

  it("tries a saved manual proxy first and keeps it after partial validation success", async () => {
    const applyManualProxy = vi.fn(async () => undefined);
    const fetchWithManualProxy = vi.fn(async (_proxyUrl, input) => (
      String(input).includes("github.com")
        ? createResponse(204)
        : createResponse(503, "Unavailable")
    ));
    const controller = createNetworkProxyPolicyController({
      readConfigObject: async () => ({
        networkProxyMode: "manual",
        networkProxyUrl: "http://127.0.0.1:7890",
      }),
      applySystemProxy: vi.fn(async () => undefined),
      applyManualProxy,
      fetchWithManualProxy,
      log: vi.fn(),
      emitStateChanged: vi.fn(),
      now: () => 1000,
    });

    await controller.initializeFromConfig();
    expect(controller.getEffectivePolicy()).toMatchObject({
      mode: "manual",
      proxyUrl: "http://127.0.0.1:7890",
    });

    await flushPromises();

    expect(applyManualProxy).toHaveBeenCalledWith("http://127.0.0.1:7890");
    expect(controller.getState().validationStatus).toBe("available");
    expect(controller.resolveProxyUrl()).toBe("http://127.0.0.1:7890");
  });

  it("falls back to system when all fixed validation targets fail", async () => {
    const applySystemProxy = vi.fn(async () => undefined);
    const controller = createNetworkProxyPolicyController({
      readConfigObject: async () => ({
        networkProxyMode: "manual",
        networkProxyUrl: "http://127.0.0.1:7890",
      }),
      applySystemProxy,
      applyManualProxy: vi.fn(async () => undefined),
      fetchWithManualProxy: vi.fn(async () => createResponse(503, "Unavailable")),
      log: vi.fn(),
      emitStateChanged: vi.fn(),
      now: () => 1000,
    });

    await controller.initializeFromConfig();
    await flushPromises();

    expect(controller.getEffectivePolicy()).toEqual({
      mode: "system",
      reason: "manual_unavailable",
    });
    expect(controller.resolveProxyUrl()).toBeNull();
    expect(applySystemProxy).toHaveBeenCalled();
  });

  it("falls back after proxy-shaped runtime failure but ignores content HTTP errors", async () => {
    const applySystemProxy = vi.fn(async () => undefined);
    const controller = createNetworkProxyPolicyController({
      readConfigObject: async () => ({
        networkProxyMode: "manual",
        networkProxyUrl: "http://127.0.0.1:7890",
      }),
      applySystemProxy,
      applyManualProxy: vi.fn(async () => undefined),
      fetchWithManualProxy: vi.fn(async () => createResponse(204)),
      log: vi.fn(),
      emitStateChanged: vi.fn(),
      now: () => 1000,
    });

    await controller.initializeFromConfig();
    await flushPromises();

    controller.markManualProxySuspect({
      layer: "yt_dlp",
      targetHost: "example.test",
      reason: "HTTP Error 403: Forbidden",
    });
    expect(controller.getEffectivePolicy().mode).toBe("manual");

    controller.markManualProxySuspect({
      layer: "yt_dlp",
      targetHost: "example.test",
      reason: "ERR_PROXY_CONNECTION_FAILED",
    });
    await flushPromises();

    expect(applySystemProxy).toHaveBeenCalled();
  });
});
