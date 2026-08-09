import { describe, expect, it } from "vitest";

import {
  NETWORK_FAILURE_CLASSIFICATIONS,
  classifyNetworkFailure,
  matchesNoProxy,
  parseElectronProxyRulesToRoute,
  parseEnvironmentProxyValue,
  redactNetworkCredentials,
  resolveEnvironmentRouteForTarget,
  sanitizeOrigin,
  toNetworkDiagnosticSnapshot,
  type NetworkRoute,
} from "./networkRoute.js";

describe("parseElectronProxyRulesToRoute", () => {
  it("maps a single PROXY directive to an HTTP proxy route for the canonical target", () => {
    const result = parseElectronProxyRulesToRoute("PROXY 127.0.0.1:7897; DIRECT", "https://www.youtube.com/watch?v=abc123");
    expect(result.kind).toBe("proxy");
    if (result.kind === "proxy") {
      expect(result.route).toMatchObject({
        mode: "proxy",
        source: "system",
        protocol: "http",
        proxyUrl: "http://127.0.0.1:7897",
        resolvedFor: "https://www.youtube.com/watch?v=abc123",
      });
    }
  });

  it("maps HTTP, HTTPS, SOCKS4, SOCKS5, and SOCKS directives", () => {
    const https = parseElectronProxyRulesToRoute("HTTPS proxy.example.test:8443", "https://example.com/");
    expect(https.kind).toBe("proxy");
    if (https.kind === "proxy") {
      expect(https.route).toMatchObject({ protocol: "https", proxyUrl: "https://proxy.example.test:8443" });
    }
    const socks5 = parseElectronProxyRulesToRoute("SOCKS5 127.0.0.1:7891", "https://example.com/");
    expect(socks5.kind).toBe("proxy");
    if (socks5.kind === "proxy") {
      expect(socks5.route).toMatchObject({ protocol: "socks5", proxyUrl: "socks5://127.0.0.1:7891" });
    }
    const socks4 = parseElectronProxyRulesToRoute("SOCKS4 127.0.0.1:1080", "https://example.com/");
    expect(socks4.kind).toBe("proxy");
    if (socks4.kind === "proxy") {
      expect(socks4.route).toMatchObject({ protocol: "socks4" });
    }
    const socksAlias = parseElectronProxyRulesToRoute("SOCKS 127.0.0.1:1080", "https://example.com/");
    expect(socksAlias.kind).toBe("proxy");
    if (socksAlias.kind === "proxy") {
      expect(socksAlias.route).toMatchObject({ protocol: "socks4" });
    }
  });

  it("never selects a candidate from a multi-candidate result", () => {
    const result = parseElectronProxyRulesToRoute("PROXY 127.0.0.1:7897; PROXY 127.0.0.1:7898", "https://example.com/");
    expect(result.kind).toBe("complex");
    if (result.kind === "complex") {
      expect(result.route).toMatchObject({
        mode: "complex",
        source: "system",
        reason: "multiple_candidates",
      });
      expect(result.route.candidates).toHaveLength(2);
    }
  });

  it("classifies malformed and unsupported directives as complex", () => {
    const malformed = parseElectronProxyRulesToRoute("PROXY", "https://example.com/");
    expect(malformed.kind).toBe("complex");
    if (malformed.kind === "complex") {
      expect(malformed.route.reason).toBe("malformed");
    }
    const credentials = parseElectronProxyRulesToRoute("PROXY http://user:pass@127.0.0.1:7897", "https://example.com/");
    expect(credentials.kind).toBe("complex");
    const unsupported = parseElectronProxyRulesToRoute("FTP 127.0.0.1:21", "https://example.com/");
    expect(unsupported.kind).toBe("complex");
    if (unsupported.kind === "complex") {
      expect(unsupported.route.reason).toBe("unsupported");
    }
  });

  it("returns direct for empty and all-DIRECT results", () => {
    expect(parseElectronProxyRulesToRoute("DIRECT", "https://example.com/").kind).toBe("direct");
    expect(parseElectronProxyRulesToRoute(null, "https://example.com/").kind).toBe("direct");
  });
});

describe("resolveEnvironmentRouteForTarget", () => {
  const route = (env: Record<string, string | undefined>, targetUrl: string): NetworkRoute =>
    resolveEnvironmentRouteForTarget(env, targetUrl);

  it("selects HTTPS_PROXY over lowercase and ALL_PROXY for HTTPS targets", () => {
    const result = route({
      HTTP_PROXY: "http://1.1.1.1:8080",
      https_proxy: "http://2.2.2.2:8080",
      ALL_PROXY: "http://3.3.3.3:8080",
      HTTPS_PROXY: "http://4.4.4.4:8080",
    }, "https://example.com/");
    expect(result).toMatchObject({ mode: "proxy", source: "environment", protocol: "http" });
    if (result.mode === "proxy") {
      expect(result.proxyUrl).toBe("http://4.4.4.4:8080");
    }
  });

  it("selects HTTP_PROXY over lowercase and ALL_PROXY for HTTP targets", () => {
    const result = route({
      http_proxy: "http://1.1.1.1:8080",
      ALL_PROXY: "http://2.2.2.2:8080",
      HTTP_PROXY: "http://3.3.3.3:8080",
    }, "http://example.com/");
    expect(result).toMatchObject({ mode: "proxy", protocol: "http" });
    if (result.mode === "proxy") {
      expect(result.proxyUrl).toBe("http://3.3.3.3:8080");
    }
  });

  it("falls back to ALL_PROXY when scheme-specific variables are absent", () => {
    const result = route({
      all_proxy: "http://9.9.9.9:3128",
    }, "https://example.com/");
    expect(result).toMatchObject({ mode: "proxy", protocol: "http" });
    if (result.mode === "proxy") {
      expect(result.proxyUrl).toBe("http://9.9.9.9:3128");
    }
  });

  it("evaluates NO_PROXY before any proxy variable", () => {
    const result = route({
      NO_PROXY: "example.com",
      HTTPS_PROXY: "http://4.4.4.4:8080",
    }, "https://example.com/");
    expect(result).toMatchObject({ mode: "direct", source: "environment", reason: "no_proxy_match" });
  });

  it("respects NO_PROXY subdomain and port semantics", () => {
    expect(route({ NO_PROXY: "example.com", HTTPS_PROXY: "http://4.4.4.4:8080" }, "https://sub.example.com/x"))
      .toMatchObject({ mode: "direct", reason: "no_proxy_match" });
    expect(route({ no_proxy: ".example.com", HTTPS_PROXY: "http://4.4.4.4:8080" }, "https://api.example.com/"))
      .toMatchObject({ mode: "direct", reason: "no_proxy_match" });
    // Port-mismatched NO_PROXY entry does not match.
    expect(route({ NO_PROXY: "example.com:8080", HTTPS_PROXY: "http://4.4.4.4:8080" }, "https://example.com/"))
      .toMatchObject({ mode: "proxy" });
  });

  it("treats an authoritative malformed value as complex instead of falling to lower priority", () => {
    const result = route({
      HTTPS_PROXY: "not-a-url",
      https_proxy: "http://2.2.2.2:8080",
    }, "https://example.com/");
    expect(result).toMatchObject({ mode: "complex", source: "environment", reason: "malformed" });
  });

  it("treats unsupported schemes as complex/unsupported", () => {
    const result = route({
      HTTPS_PROXY: "ftp://127.0.0.1:21",
    }, "https://example.com/");
    expect(result).toMatchObject({ mode: "complex", source: "environment", reason: "unsupported" });
  });

  it("supports socks4/socks5 environment values with credentials kept in-memory", () => {
    const socks = route({
      ALL_PROXY: "socks5://user:secret@127.0.0.1:7891",
    }, "https://example.com/");
    expect(socks).toMatchObject({ mode: "proxy", protocol: "socks5" });
    if (socks.mode === "proxy") {
      expect(socks.proxyUrl).toContain("user:secret@");
      expect(socks.proxyUrl).toBe("socks5://user:secret@127.0.0.1:7891");
    }
  });

  it("produces an explicit direct route when no environment rule applies", () => {
    const result = route({}, "https://example.com/");
    expect(result).toMatchObject({ mode: "direct", source: "environment", reason: "no_proxy_source" });
  });
});

describe("parseEnvironmentProxyValue", () => {
  it("accepts http/https/socks4/socks5 with credentials", () => {
    expect(parseEnvironmentProxyValue("http://127.0.0.1:7890")).toMatchObject({
      protocol: "http",
      proxyUrl: "http://127.0.0.1:7890",
    });
    expect(parseEnvironmentProxyValue("https://user:pw@127.0.0.1:8443")?.proxyUrl)
      .toBe("https://user:pw@127.0.0.1:8443");
    expect(parseEnvironmentProxyValue("socks4://127.0.0.1:1080")).toMatchObject({ protocol: "socks4" });
    expect(parseEnvironmentProxyValue("socks5://127.0.0.1:7891")).toMatchObject({ protocol: "socks5" });
  });

  it("rejects scheme-less, unsupported-scheme, and path-bearing values", () => {
    expect(parseEnvironmentProxyValue("127.0.0.1:7890")).toBeNull();
    expect(parseEnvironmentProxyValue("ftp://127.0.0.1:21")).toBeNull();
    expect(parseEnvironmentProxyValue("http://127.0.0.1:7890/path")).toBeNull();
    expect(parseEnvironmentProxyValue("http://127.0.0.1:7890?x=1")).toBeNull();
    expect(parseEnvironmentProxyValue("")).toBeNull();
  });

  it("preserves already percent-encoded credentials exactly once", () => {
    // The URL parser returns userinfo already encoded ("user%40corp"); the
    // rebuilt runtime proxy URL must not double-encode it.
    expect(parseEnvironmentProxyValue("http://user%40corp:p%40ss@proxy.example:8080")?.proxyUrl)
      .toBe("http://user%40corp:p%40ss@proxy.example:8080");
    expect(parseEnvironmentProxyValue("https://user%3Acorp:p%3Ass@proxy.example:8443")?.proxyUrl)
      .toBe("https://user%3Acorp:p%3Ass@proxy.example:8443");
  });

  it("keeps delimiters for username-only and password-only credentials", () => {
    expect(parseEnvironmentProxyValue("http://user%40corp@proxy.example:8080")?.proxyUrl)
      .toBe("http://user%40corp@proxy.example:8080");
    expect(parseEnvironmentProxyValue("http://:p%40ss@proxy.example:8080")?.proxyUrl)
      .toBe("http://:p%40ss@proxy.example:8080");
    expect(parseEnvironmentProxyValue("http://:p%40ss@proxy.example:8080")?.proxyUrl)
      .not.toBe("http://p%40ss@proxy.example:8080");
  });

  it("redacts percent-encoded userinfo without leaking decoded or encoded secrets", () => {
    const proxyUrl = parseEnvironmentProxyValue("http://user%40corp:p%40ss@proxy.example:8080")?.proxyUrl ?? "";
    const redacted = redactNetworkCredentials(proxyUrl);
    expect(redacted).toBe("http://***@proxy.example:8080");
    expect(redacted).not.toContain("user");
    expect(redacted).not.toContain("%40corp");
    expect(redacted).not.toContain("p%40ss");
    const snapshot = toNetworkDiagnosticSnapshot({
      preference: "system",
      effectivePolicyReason: null,
      consumer: "yt-dlp",
      targetUrl: "https://proxy.example/video",
      route: {
        mode: "proxy",
        source: "environment",
        protocol: "http",
        proxyUrl,
        resolvedFor: "https://proxy.example/video",
      },
      status: "resolved",
      trace: [],
    });
    expect(snapshot.proxyHost).toBe("proxy.example");
    expect(JSON.stringify(snapshot)).not.toContain("%40corp");
    expect(JSON.stringify(snapshot)).not.toContain("p%40ss");
  });
});

describe("matchesNoProxy", () => {
  it("matches exact host, wildcard, and domain suffixes", () => {
    expect(matchesNoProxy("https://example.com/", "example.com")).toBe(true);
    expect(matchesNoProxy("https://sub.example.com/", ".example.com")).toBe(true);
    expect(matchesNoProxy("https://other.test/", "example.com")).toBe(false);
    expect(matchesNoProxy("https://anything.test/", "*")).toBe(true);
  });

  it("matches IPv6 literals and ported entries", () => {
    expect(matchesNoProxy("http://[::1]:8080/", "[::1]")).toBe(true);
    expect(matchesNoProxy("https://example.com/", "example.com:443")).toBe(true);
    expect(matchesNoProxy("https://example.com/", "example.com:8080")).toBe(false);
  });
});

describe("redaction and sanitized snapshots", () => {
  it("sanitizes origins and redacts userinfo", () => {
    expect(sanitizeOrigin("https://user:pw@example.com:8443/path?q=1#h")).toBe("https://example.com:8443");
  });

  it("redacts proxy credentials, cookies, and tokens in arbitrary text", () => {
    expect(redactNetworkCredentials("http://user:secret@127.0.0.1:7890"))
      .toBe("http://***@127.0.0.1:7890");
    expect(redactNetworkCredentials("--proxy https://user:pw@proxy.example:8080 --cookies c.txt"))
      .toBe("--proxy https://***@proxy.example:8080 --cookies c.txt");
    expect(redactNetworkCredentials("Cookie: sid=abc123; token=xyz")).toContain("***");
    expect(redactNetworkCredentials("token=xyz&api_key=abc")).not.toContain("xyz");
    expect(redactNetworkCredentials("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9"))
      .not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(redactNetworkCredentials("Proxy-Authorization: Basic dXNlcjpwYXNz"))
      .not.toContain("dXNlcjpwYXNz");
  });

  it("keeps non-credential text unchanged", () => {
    expect(redactNetworkCredentials("HTTP Error 403: Forbidden for https://example.com/video"))
      .toBe("HTTP Error 403: Forbidden for https://example.com/video");
  });

  it("redacts up to the final authority @ so an extra @ cannot leak the password fragment", () => {
    const redacted = redactNetworkCredentials(
      "ERROR: failed for http://user@supersecret@proxy.example:8080 (HTTP Error 403: Forbidden)",
    );
    expect(redacted).toBe(
      "ERROR: failed for http://***@proxy.example:8080 (HTTP Error 403: Forbidden)",
    );
    expect(redacted).not.toContain("supersecret");
    expect(redacted).not.toContain("user@");
    // Classification text stays intact.
    expect(redacted).toContain("HTTP Error 403: Forbidden");
  });

  it("never exposes proxy credentials in diagnostic snapshots", () => {
    const resolution = {
      preference: "system" as const,
      effectivePolicyReason: null,
      consumer: "yt-dlp" as const,
      targetUrl: "https://example.com/video",
      route: {
        mode: "proxy" as const,
        source: "environment" as const,
        protocol: "http" as const,
        proxyUrl: "http://user:secret@127.0.0.1:7890",
        resolvedFor: "https://example.com/video",
      },
      status: "resolved" as const,
      trace: [],
    };
    const snapshot = toNetworkDiagnosticSnapshot(resolution);
    expect(JSON.stringify(snapshot)).not.toContain("user");
    expect(JSON.stringify(snapshot)).not.toContain("secret");
    expect(snapshot.resolvedFor).toBe("https://example.com");
    expect(snapshot.proxyHost).toBe("127.0.0.1");
    expect(snapshot.proxyPort).toBe("7890");
  });

  it("records resolvedFor without claiming downstream-host equivalence", () => {
    const snapshot = toNetworkDiagnosticSnapshot({
      preference: "system",
      effectivePolicyReason: null,
      consumer: "yt-dlp",
      targetUrl: "https://www.youtube.com/watch?v=abc123",
      route: {
        mode: "proxy",
        source: "system",
        protocol: "http",
        proxyUrl: "http://127.0.0.1:7897",
        resolvedFor: "https://www.youtube.com/watch?v=abc123",
      },
      status: "resolved",
      trace: [],
    });
    expect(snapshot.resolvedFor).toBe("https://www.youtube.com");
  });
});

describe("classifyNetworkFailure", () => {
  it("classifies proxy auth, connection, TLS, timeout, and DNS failures", () => {
    expect(classifyNetworkFailure(new Error("407 Proxy Authentication Required"))).toBe(
      NETWORK_FAILURE_CLASSIFICATIONS.AUTH_FAILED,
    );
    expect(classifyNetworkFailure(new Error("Tunnel connection failed"))).toBe(
      NETWORK_FAILURE_CLASSIFICATIONS.CONNECTION_FAILED,
    );
    expect(classifyNetworkFailure(new Error("SSLError: certificate verify failed"))).toBe(
      NETWORK_FAILURE_CLASSIFICATIONS.TLS_FAILED,
    );
    expect(classifyNetworkFailure(new Error("The read operation timed out"))).toBe(
      NETWORK_FAILURE_CLASSIFICATIONS.TIMEOUT,
    );
    expect(classifyNetworkFailure(new Error("getaddrinfo ENOTFOUND example.com"))).toBe(
      NETWORK_FAILURE_CLASSIFICATIONS.DNS_FAILED,
    );
  });

  it("never classifies content-level failures as proxy failures", () => {
    expect(classifyNetworkFailure(new Error("HTTP Error 403: Forbidden"))).toBe(
      NETWORK_FAILURE_CLASSIFICATIONS.UNKNOWN,
    );
    expect(classifyNetworkFailure(new Error("HTTP Error 429: Too Many Requests"))).toBe(
      NETWORK_FAILURE_CLASSIFICATIONS.UNKNOWN,
    );
    expect(classifyNetworkFailure(new Error("Sign in to confirm you're not a bot"))).toBe(
      NETWORK_FAILURE_CLASSIFICATIONS.UNKNOWN,
    );
    expect(classifyNetworkFailure(new Error("ffmpeg failed to merge output files"))).toBe(
      NETWORK_FAILURE_CLASSIFICATIONS.UNKNOWN,
    );
  });
});
