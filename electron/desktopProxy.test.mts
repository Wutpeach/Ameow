import { describe, expect, it, vi } from "vitest";

import {
  DESKTOP_PROXY_BYPASS_RULES,
  applyManualProxyToSession,
  applySystemProxyToSession,
} from "./desktopProxy.mjs";

describe("desktop proxy application", () => {
  it("applies system proxy mode", async () => {
    const targetSession = {
      setProxy: vi.fn(async () => undefined),
    };

    const result = await applySystemProxyToSession(targetSession);

    expect(result).toEqual({
      mode: "system",
      proxyRules: null,
    });
    expect(targetSession.setProxy).toHaveBeenCalledWith({ mode: "system" });
  });

  it("applies manual HTTP proxy with local bypass rules", async () => {
    const targetSession = {
      setProxy: vi.fn(async () => undefined),
    };

    const result = await applyManualProxyToSession(targetSession, "http://127.0.0.1:7890");

    expect(result).toEqual({
      mode: "manual",
      proxyRules: "http=127.0.0.1:7890;https=127.0.0.1:7890",
      proxyBypassRules: DESKTOP_PROXY_BYPASS_RULES,
    });
    expect(targetSession.setProxy).toHaveBeenCalledWith({
      mode: "fixed_servers",
      proxyRules: "http=127.0.0.1:7890;https=127.0.0.1:7890",
      proxyBypassRules: expect.stringContaining("127.0.0.1:39527"),
    });
  });

  it("falls back to system mode for invalid manual proxy values", async () => {
    const targetSession = {
      setProxy: vi.fn(async () => undefined),
    };

    const result = await applyManualProxyToSession(targetSession, "socks5://127.0.0.1:7891");

    expect(result).toEqual({
      mode: "system",
      proxyRules: null,
    });
    expect(targetSession.setProxy).toHaveBeenCalledWith({ mode: "system" });
  });
});
