import { describe, expect, it, vi } from "vitest";

import {
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
});
