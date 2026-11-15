import { describe, expect, it } from "vitest";

import {
  errorDiagnosticCategoryTranslationKey,
  errorDiagnosticMessageTranslationKey,
  resolveErrorDiagnosticCategory,
  resolveErrorDiagnosticNetworkDetail,
  resolveErrorDiagnosticTargetHost,
} from "./errorDiagnosticCategories";

describe("errorDiagnosticCategories", () => {
  it("maps typed auth failures to the login-state category", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        code: "E_AUTH_REQUIRED",
        classification: "auth_required",
        diagnosticCategory: "authentication_required",
        rawMessage: "Fresh cookies are required",
      },
    })).toBe("auth_login_state");
  });

  it("maps typed auth classification without a diagnostic category", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        code: "E_AUTH_REQUIRED",
        classification: "auth_required",
      },
    })).toBe("auth_login_state");
  });

  it("makes the typed diagnostic category the sole authority over raw text", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        diagnosticCategory: "engine_execution",
        rawMessage: "ERROR: HTTP Error 429: Too Many Requests via proxy",
      },
    })).toBe("runtime_downloader_unavailable");
  });

  it("maps typed input-invalid facts to content unavailable", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        code: "E_INVALID_DOWNLOAD_INPUT",
        classification: "input_invalid",
      },
    })).toBe("content_unavailable");
  });

  it("maps typed output-write facts to the output category", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        code: "E_OUTPUT_NOT_FOUND",
      },
    })).toBe("output_write");
  });

  it("maps typed engine-unavailable facts to the runtime category", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        code: "E_ENGINE_UNAVAILABLE",
      },
    })).toBe("runtime_downloader_unavailable");
  });

  it("defaults transcode surface to the transcode category without inspecting text", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "transcode",
      failure: {
        rawMessage: "ffmpeg exited with code 1",
      },
    })).toBe("transcode_merge");
  });

  it("maps a transcode surface to transcode_merge before download code/classification fallbacks", () => {
    // Transcode carrying a Download-compatible code must still map to
    // transcode_merge: the typed surface wins before code fallbacks.
    expect(resolveErrorDiagnosticCategory({
      surface: "transcode",
      failure: {
        code: "E_OUTPUT_NOT_FOUND",
      },
    })).toBe("transcode_merge");
    expect(resolveErrorDiagnosticCategory({
      surface: "transcode",
      failure: {
        code: "E_AUTH_REQUIRED",
        classification: "input_invalid",
      },
    })).toBe("transcode_merge");
    // Typed diagnosticCategory remains the sole authority over the surface.
    expect(resolveErrorDiagnosticCategory({
      surface: "transcode",
      failure: {
        code: "E_OUTPUT_NOT_FOUND",
        diagnosticCategory: "output",
      },
    })).toBe("output_write");
  });

  it("does not infer categories from raw message or context for untyped downloads", () => {
    // Raw-text-only failures must not gain semantics from parsing.
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        rawMessage: "ERROR: HTTP Error 429: Too Many Requests via proxy",
      },
    })).toBe("unclassified");
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        rawMessage: "Requested format is not available",
      },
      fallbackMessage: "no space left on device",
    })).toBe("unclassified");
  });

  it("keeps the raw-text-free contract even when no typed facts exist", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
    })).toBe("unclassified");
  });

  it("returns stable desktop translation keys", () => {
    expect(errorDiagnosticCategoryTranslationKey("output_write"))
      .toBe("app.errorDiagnostic.category.output_write");
  });
});

describe("network sub-detail resolution", () => {
  it("maps every typed network classification to its own detail", () => {
    const cases = [
      ["NETWORK_DNS_FAILED", "dns_failed"],
      ["NETWORK_TLS_FAILED", "tls_failed"],
      ["NETWORK_TIMEOUT", "timeout"],
      ["NETWORK_PROXY_AUTH_FAILED", "proxy_auth_failed"],
      ["NETWORK_PROXY_CONNECTION_FAILED", "proxy_connection_failed"],
      ["NETWORK_PROXY_RESOLUTION_FAILED", "proxy_resolution_failed"],
      ["NETWORK_PROXY_UNSUPPORTED", "proxy_unsupported"],
    ] as const;
    for (const [classification, expected] of cases) {
      expect(resolveErrorDiagnosticNetworkDetail({ classification })).toBe(expected);
    }
  });

  it("accepts lower-case classification text without inventing a cause", () => {
    expect(resolveErrorDiagnosticNetworkDetail({ classification: "network_dns_failed" }))
      .toBe("dns_failed");
  });

  it("keeps the generic copy for unknown or missing classifications", () => {
    expect(resolveErrorDiagnosticNetworkDetail({ classification: "NETWORK_UNKNOWN" })).toBeNull();
    expect(resolveErrorDiagnosticNetworkDetail({ rawMessage: "fetch failed" })).toBeNull();
    expect(resolveErrorDiagnosticNetworkDetail(null)).toBeNull();
    expect(resolveErrorDiagnosticNetworkDetail(undefined)).toBeNull();
  });

  it("prefers the typed network detail over the generic category headline", () => {
    expect(errorDiagnosticMessageTranslationKey({
      category: "network_proxy",
      failure: { classification: "NETWORK_DNS_FAILED" },
    })).toBe("app.errorDiagnostic.networkDetail.dns_failed");
  });

  it("falls back to the category headline when no detail is typed", () => {
    expect(errorDiagnosticMessageTranslationKey({
      category: "network_proxy",
      failure: { classification: "NETWORK_UNKNOWN" },
    })).toBe("app.errorDiagnostic.category.network_proxy");
  });

  it("never applies a network detail to another category", () => {
    expect(errorDiagnosticMessageTranslationKey({
      category: "auth_login_state",
      failure: { classification: "NETWORK_DNS_FAILED" },
    })).toBe("app.errorDiagnostic.category.auth_login_state");
  });
});

describe("diagnostic target host", () => {
  it("uses the already-sanitized origin when present", () => {
    expect(resolveErrorDiagnosticTargetHost({
      safeUrl: { origin: "https://www.youtube.com", hasQuery: true, hasFragment: false },
    })).toBe("www.youtube.com");
  });

  it("derives only the host from a raw user URL and drops path/query", () => {
    expect(resolveErrorDiagnosticTargetHost({
      userUrl: "https://www.youtube.com/watch?v=SECRET&token=abc",
    })).toBe("www.youtube.com");
    expect(resolveErrorDiagnosticTargetHost({
      userUrl: "https://example.com:8443/path?x=1",
    })).toBe("example.com:8443");
  });

  it("accepts a scheme-less host", () => {
    expect(resolveErrorDiagnosticTargetHost({ userUrl: "bilibili.com/video/BV1" }))
      .toBe("bilibili.com");
  });

  it("returns null when nothing parseable is available", () => {
    expect(resolveErrorDiagnosticTargetHost(null)).toBeNull();
    expect(resolveErrorDiagnosticTargetHost({})).toBeNull();
    expect(resolveErrorDiagnosticTargetHost({ userUrl: "   " })).toBeNull();
    expect(resolveErrorDiagnosticTargetHost({ userUrl: "not a url at all" })).toBeNull();
  });
});
