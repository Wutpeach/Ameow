import { describe, expect, it, vi } from "vitest";

import {
  DESKTOP_PROXY_BYPASS_RULES,
  applyConfiguredProxyToSession,
} from "./desktopProxy.mjs";

describe("desktop proxy application", () => {
  it("applies system proxy mode when global proxy is disabled", async () => {
    const targetSession = {
      setProxy: vi.fn(async () => undefined),
    };

    const result = await applyConfiguredProxyToSession(targetSession, {
      globalProxyEnabled: false,
      globalProxyUrl: "http://127.0.0.1:7897",
    });

    expect(result).toEqual({
      mode: "system",
      proxyRules: null,
    });
    expect(targetSession.setProxy).toHaveBeenCalledWith({ mode: "system" });
  });

  it("applies fixed server proxy mode using the normalized URL", async () => {
    const targetSession = {
      setProxy: vi.fn(async () => undefined),
    };

    const result = await applyConfiguredProxyToSession(targetSession, {
      globalProxyEnabled: true,
      globalProxyUrl: "http://127.0.0.1:7897",
    });

    expect(result).toEqual({
      mode: "fixed_servers",
      proxyRules: "http://127.0.0.1:7897",
    });
    expect(targetSession.setProxy).toHaveBeenCalledWith({
      mode: "fixed_servers",
      proxyRules: "http://127.0.0.1:7897",
      proxyBypassRules: DESKTOP_PROXY_BYPASS_RULES,
    });
  });

  it("rejects invalid enabled proxy config before mutating the target session", async () => {
    const targetSession = {
      setProxy: vi.fn(async () => undefined),
    };

    await expect(applyConfiguredProxyToSession(targetSession, {
      globalProxyEnabled: true,
      globalProxyUrl: "ftp://127.0.0.1:7897",
    })).rejects.toThrow("must use http");

    expect(targetSession.setProxy).not.toHaveBeenCalled();
  });
});
