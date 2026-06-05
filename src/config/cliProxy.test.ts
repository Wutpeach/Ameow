import { describe, expect, it } from "vitest";

import {
  buildCliProxyDiagnosticFromElectronProxyRules,
  buildCliProxyDiagnosticFromEnvironment,
  buildProxyResolutionFailedDiagnostic,
  buildSkippedNonYtdlpProxyDiagnostic,
  resolveCliProxyUrlFromElectronProxyRules,
  resolveCliProxyUrlFromEnvironment,
} from "./cliProxy";

describe("CLI proxy resolution", () => {
  it("extracts HTTP proxies from Electron proxy resolution rules", () => {
    expect(resolveCliProxyUrlFromElectronProxyRules("PROXY 127.0.0.1:7897; DIRECT"))
      .toBe("http://127.0.0.1:7897");
    expect(resolveCliProxyUrlFromElectronProxyRules("HTTPS 127.0.0.1:7898"))
      .toBe("https://127.0.0.1:7898");
    expect(resolveCliProxyUrlFromElectronProxyRules("SOCKS5 127.0.0.1:7891; DIRECT"))
      .toBeNull();
    expect(resolveCliProxyUrlFromElectronProxyRules("DIRECT")).toBeNull();
  });

  it("rejects malformed or non-proxy Electron rules", () => {
    expect(resolveCliProxyUrlFromElectronProxyRules("PROXY")).toBeNull();
    expect(resolveCliProxyUrlFromElectronProxyRules("PROXY http://user:pass@127.0.0.1:7897")).toBeNull();
    expect(resolveCliProxyUrlFromElectronProxyRules("PROXY 127.0.0.1:7897/path")).toBeNull();
  });

  it("extracts HTTP proxies from environment variables", () => {
    expect(resolveCliProxyUrlFromEnvironment({
      HTTPS_PROXY: "http://127.0.0.1:7897",
    })).toBe("http://127.0.0.1:7897");
    expect(resolveCliProxyUrlFromEnvironment({
      HTTPS_PROXY: "socks5://127.0.0.1:7891",
      HTTP_PROXY: "http://127.0.0.1:7890",
    })).toBe("http://127.0.0.1:7890");
  });

  it("ignores malformed or unsupported environment proxy values", () => {
    expect(resolveCliProxyUrlFromEnvironment({
      HTTPS_PROXY: "127.0.0.1:7897",
      HTTP_PROXY: "ftp://127.0.0.1:7890",
      ALL_PROXY: "http://user:pass@127.0.0.1:7891",
    })).toBeNull();
  });

  it("classifies direct Electron proxy diagnostics", () => {
    expect(buildCliProxyDiagnosticFromElectronProxyRules(
      "DIRECT",
      "https://www.youtube.com/watch?v=abc123",
    )).toMatchObject({
      kind: "direct",
      source: "electron",
      targetHost: "www.youtube.com",
      proxyScheme: null,
      proxyHost: null,
    });
  });

  it("classifies HTTP Electron proxy diagnostics without exposing raw rules", () => {
    expect(buildCliProxyDiagnosticFromElectronProxyRules(
      "PROXY 127.0.0.1:7897",
      "https://www.youtube.com/watch?v=abc123",
    )).toMatchObject({
      kind: "http",
      source: "electron",
      targetHost: "www.youtube.com",
      proxyScheme: "http",
      proxyHost: "127.0.0.1",
      proxyPort: "7897",
    });
    expect(buildCliProxyDiagnosticFromElectronProxyRules(
      "HTTPS proxy.example.test:8443",
      "https://www.youtube.com/watch?v=abc123",
    )).toMatchObject({
      kind: "http",
      proxyScheme: "https",
      proxyHost: "proxy.example.test",
      proxyPort: "8443",
    });
  });

  it("classifies SOCKS Electron proxy diagnostics as unsupported for CLI translation", () => {
    expect(buildCliProxyDiagnosticFromElectronProxyRules(
      "SOCKS5 127.0.0.1:7891",
      "https://www.youtube.com/watch?v=abc123",
    )).toMatchObject({
      kind: "socks_unsupported",
      source: "electron",
      proxyScheme: "socks5",
      proxyHost: "127.0.0.1",
      proxyPort: "7891",
    });
  });

  it("classifies mixed or PAC-like Electron proxy diagnostics", () => {
    expect(buildCliProxyDiagnosticFromElectronProxyRules(
      "PROXY 127.0.0.1:7897; PROXY 127.0.0.1:7898; DIRECT",
      "https://www.youtube.com/watch?v=abc123",
    )).toMatchObject({
      kind: "mixed_or_pac",
      source: "electron",
      targetHost: "www.youtube.com",
    });
  });

  it("classifies malformed Electron proxy diagnostics", () => {
    expect(buildCliProxyDiagnosticFromElectronProxyRules(
      "PROXY http://user:pass@127.0.0.1:7897",
      "https://www.youtube.com/watch?v=abc123",
    )).toMatchObject({
      kind: "malformed",
      source: "electron",
      targetHost: "www.youtube.com",
    });
  });

  it("classifies environment proxy diagnostics", () => {
    expect(buildCliProxyDiagnosticFromEnvironment({
      HTTPS_PROXY: "http://127.0.0.1:7897",
    }, "https://www.youtube.com/watch?v=abc123")).toMatchObject({
      kind: "environment",
      source: "environment",
      targetHost: "www.youtube.com",
      proxyScheme: "http",
      proxyHost: "127.0.0.1",
      proxyPort: "7897",
    });
    expect(buildCliProxyDiagnosticFromEnvironment({
      HTTPS_PROXY: "socks5://127.0.0.1:7891",
    }, "https://www.youtube.com/watch?v=abc123")).toMatchObject({
      kind: "socks_unsupported",
      source: "environment",
      targetHost: "www.youtube.com",
      proxyScheme: "socks5",
      proxyHost: "127.0.0.1",
      proxyPort: "7891",
    });
  });

  it("builds runtime and failure diagnostics", () => {
    expect(buildSkippedNonYtdlpProxyDiagnostic("https://www.bilibili.com/video/BV1xx411c7mD"))
      .toMatchObject({
        kind: "skipped_non_ytdlp",
        source: "runtime",
        targetHost: "www.bilibili.com",
      });
    expect(buildProxyResolutionFailedDiagnostic(
      "https://www.youtube.com/watch?v=abc123",
      new Error("resolveProxy failed"),
    )).toMatchObject({
      kind: "resolution_failed",
      source: "electron",
      targetHost: "www.youtube.com",
      reason: "resolveProxy failed",
    });
  });
});
