import { describe, expect, it, vi } from "vitest";

import {
  PROXY_ENV_KEYS,
  applyNetworkRouteForContext,
  buildGalleryDlNetworkApplication,
  buildUnsupportedRouteError,
  buildYtDlpNetworkApplication,
  scrubProxyEnvKeys,
} from "./engineNetworkAdapters.js";
import type { NetworkRoute } from "../config/networkRoute.js";

const TARGET = "https://www.youtube.com/watch?v=abc123";

const proxyRoute = (
  protocol: "http" | "https" | "socks4" | "socks5",
): NetworkRoute => ({
  mode: "proxy",
  source: "system",
  protocol,
  proxyUrl: `${protocol}://127.0.0.1:7897`,
  resolvedFor: TARGET,
});

const directRoute: NetworkRoute = {
  mode: "direct",
  source: "system",
  reason: "resolved_direct",
  resolvedFor: TARGET,
};

const complexRoute: NetworkRoute = {
  mode: "complex",
  source: "system",
  reason: "multiple_candidates",
  candidates: [],
  resolvedFor: TARGET,
};

const ambientEnv = (): NodeJS.ProcessEnv => ({
  HTTP_PROXY: "http://ambient:8080",
  https_proxy: "http://ambient2:8080",
  ALL_PROXY: "http://ambient3:8080",
  no_proxy: "localhost",
  HTTPS_PROXY: "http://ambient4:8080",
  http_proxy: "http://ambient5:8080",
  ALL_PROXY_CASING: "http://ambient6:8080",
  PATH: "C:/bin",
});

describe("scrubProxyEnvKeys", () => {
  it("removes every upper/lower HTTP(S)/ALL/NO proxy key and keeps unrelated keys", () => {
    const scrubbed = scrubProxyEnvKeys(ambientEnv());
    for (const key of PROXY_ENV_KEYS) {
      expect(scrubbed[key]).toBeUndefined();
    }
    expect(scrubbed.PATH).toBe("C:/bin");
    expect(scrubbed.ALL_PROXY_CASING).toBe("http://ambient6:8080");
  });

  it("reports only the proxy env keys actually present in the base environment", () => {
    const baseEnv: NodeJS.ProcessEnv = {
      HTTP_PROXY: "http://ambient:8080",
      no_proxy: "localhost",
      PATH: "C:/bin",
    };
    expect(buildYtDlpNetworkApplication(directRoute, baseEnv).diagnostic.envProxyKeysRemoved)
      .toEqual(["HTTP_PROXY", "no_proxy"]);
    expect(buildGalleryDlNetworkApplication(proxyRoute("http"), baseEnv).diagnostic.envProxyKeysRemoved)
      .toEqual(["HTTP_PROXY", "no_proxy"]);
    expect(buildYtDlpNetworkApplication(directRoute, {}).diagnostic.envProxyKeysRemoved)
      .toEqual([]);
  });
});

describe("applyNetworkRouteForContext", () => {
  it("reports the actual applied outcome for a supported route", () => {
    const onApplication = vi.fn();
    const application = applyNetworkRouteForContext(
      "yt-dlp",
      { route: proxyRoute("http") } as never,
      directRoute,
      onApplication,
    );
    expect(application.args).toEqual(["--proxy", "http://127.0.0.1:7897"]);
    expect(onApplication).toHaveBeenCalledWith(expect.objectContaining({
      engine: "yt-dlp",
      appliedToEngine: true,
      failureClassification: null,
    }));
  });

  it("reports a rejected outcome with NETWORK_PROXY_UNSUPPORTED for complex routes", () => {
    const onApplication = vi.fn();
    expect(() => applyNetworkRouteForContext(
      "gallery-dl",
      { route: complexRoute } as never,
      directRoute,
      onApplication,
    )).toThrowError(expect.objectContaining({
      code: "E_EXECUTION_FAILED",
      context: expect.objectContaining({
        networkFailureClassification: "NETWORK_PROXY_UNSUPPORTED",
      }),
    }));
    expect(onApplication).toHaveBeenCalledWith(expect.objectContaining({
      engine: "gallery-dl",
      appliedToEngine: false,
      failureClassification: "NETWORK_PROXY_UNSUPPORTED",
    }));
  });

  it("never falls back to a raw invalid resolvedFor in unsupported-route errors", () => {
    const invalidRoute: NetworkRoute = {
      mode: "complex",
      source: "system",
      reason: "malformed",
      resolvedFor: "http://user:secret@",
    };
    const error = buildUnsupportedRouteError(invalidRoute, "runtime-bootstrap pip install");
    expect(error.context?.networkResolvedFor).toBe("[invalid-target]");
    expect(error.message).not.toContain("secret");
  });
});

describe("buildYtDlpNetworkApplication", () => {
  it("makes direct explicit with --proxy \"\" and scrubbed env", () => {
    const application = buildYtDlpNetworkApplication(directRoute, ambientEnv());
    expect(application.args).toEqual(["--proxy", ""]);
    for (const key of PROXY_ENV_KEYS) {
      expect(application.env[key]).toBeUndefined();
    }
    expect(application.diagnostic).toMatchObject({
      engine: "yt-dlp",
      appliedToEngine: true,
      proxyArgCount: 1,
      proxyProtocol: null,
    });
  });

  it("maps supported proxy routes to exactly one --proxy argument and scrubbed env", () => {
    for (const protocol of ["http", "https", "socks4", "socks5"] as const) {
      const application = buildYtDlpNetworkApplication(proxyRoute(protocol), ambientEnv());
      expect(application.args).toEqual(["--proxy", `${protocol}://127.0.0.1:7897`]);
      for (const key of PROXY_ENV_KEYS) {
        expect(application.env[key]).toBeUndefined();
      }
      expect(application.diagnostic.proxyProtocol).toBe(protocol);
    }
  });

  it("rejects complex routes before spawn with NETWORK_PROXY_UNSUPPORTED", () => {
    expect(() => buildYtDlpNetworkApplication(complexRoute)).toThrowError(
      expect.objectContaining({
        code: "E_EXECUTION_FAILED",
        context: expect.objectContaining({
          networkFailureClassification: "NETWORK_PROXY_UNSUPPORTED",
        }),
      }),
    );
  });

  it("fails closed on SOCKS routes when the invocation may delegate remote downloads", () => {
    for (const protocol of ["socks4", "socks5"] as const) {
      const route = proxyRoute(protocol);
      expect(() => buildYtDlpNetworkApplication(route, ambientEnv(), { mayDelegateRemoteNetwork: true }))
        .toThrowError(expect.objectContaining({
          code: "E_EXECUTION_FAILED",
          message: expect.stringContaining("yt-dlp download"),
          context: expect.objectContaining({
            networkFailureClassification: "NETWORK_PROXY_UNSUPPORTED",
            networkRouteMode: "proxy",
          }),
        }));
    }
  });

  it("keeps SOCKS mapping for non-downloading invocations and HTTP(S)/direct for delegating ones", () => {
    // Probe-style invocation (no delegation flag): native SOCKS stays supported.
    const socksProbe = buildYtDlpNetworkApplication(proxyRoute("socks5"), ambientEnv());
    expect(socksProbe.args).toEqual(["--proxy", "socks5://127.0.0.1:7897"]);
    // Delegating invocation: SOCKS is rejected, HTTP(S)/direct remain supported.
    const httpDownload = buildYtDlpNetworkApplication(
      proxyRoute("http"),
      ambientEnv(),
      { mayDelegateRemoteNetwork: true },
    );
    expect(httpDownload.args).toEqual(["--proxy", "http://127.0.0.1:7897"]);
    const directDownload = buildYtDlpNetworkApplication(directRoute, ambientEnv(), { mayDelegateRemoteNetwork: true });
    expect(directDownload.args).toEqual(["--proxy", ""]);
  });
});

describe("buildGalleryDlNetworkApplication", () => {
  it("always disables extractor proxy auto-discovery, including the Windows Registry", () => {
    const direct = buildGalleryDlNetworkApplication(directRoute, ambientEnv());
    expect(direct.args).toContain("-o");
    expect(direct.args).toContain("extractor.*.proxy-env=false");
    for (const key of PROXY_ENV_KEYS) {
      expect(direct.env[key]).toBeUndefined();
    }

    const proxied = buildGalleryDlNetworkApplication(proxyRoute("http"), ambientEnv());
    expect(proxied.args).toContain("-o");
    expect(proxied.args).toContain("extractor.*.proxy-env=false");
    for (const key of PROXY_ENV_KEYS) {
      expect(proxied.env[key]).toBeUndefined();
    }
  });

  it("makes direct explicit with --proxy \"\" plus proxy-env=false", () => {
    const application = buildGalleryDlNetworkApplication(directRoute, ambientEnv());
    expect(application.args).toContain("--proxy");
    expect(application.args[application.args.indexOf("--proxy") + 1]).toBe("");
    expect(application.diagnostic).toMatchObject({
      engine: "gallery-dl",
      appliedToEngine: true,
      proxyArgCount: 1,
    });
  });

  it("maps HTTP/HTTPS/SOCKS4/SOCKS5 routes to exactly one --proxy argument", () => {
    for (const protocol of ["http", "https", "socks4", "socks5"] as const) {
      const application = buildGalleryDlNetworkApplication(proxyRoute(protocol), ambientEnv());
      const proxyArgs = application.args.filter((arg) => arg === "--proxy");
      expect(proxyArgs).toHaveLength(1);
      expect(application.args[application.args.indexOf("--proxy") + 1])
        .toBe(`${protocol}://127.0.0.1:7897`);
      expect(application.diagnostic.proxyProtocol).toBe(protocol);
    }
  });

  it("rejects complex routes before spawn with NETWORK_PROXY_UNSUPPORTED", () => {
    expect(() => buildGalleryDlNetworkApplication(complexRoute)).toThrowError(
      expect.objectContaining({
        code: "E_EXECUTION_FAILED",
        context: expect.objectContaining({
          networkFailureClassification: "NETWORK_PROXY_UNSUPPORTED",
        }),
      }),
    );
  });

  it("never emits duplicate proxy args for a resolved route", () => {
    const application = buildGalleryDlNetworkApplication(proxyRoute("https"), ambientEnv());
    const proxyOccurrences = application.args.filter((arg) => arg === "--proxy").length;
    expect(proxyOccurrences).toBe(1);
  });
});
