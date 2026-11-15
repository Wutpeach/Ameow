import { describe, expect, it } from "vitest";

import type { ErrorDiagnosticCopyRequest } from "../types/errorDiagnostics";
import {
  resolveErrorDiagnosticRecoveryActions,
  resolveErrorDiagnosticRetryTarget,
} from "./errorDiagnosticRecovery";

const makeDiagnostic = (
  overrides: Partial<ErrorDiagnosticCopyRequest> = {},
): ErrorDiagnosticCopyRequest => ({
  surface: "download",
  userMessage: "Network issue. Check proxy",
  category: "network_proxy",
  ...overrides,
});

describe("errorDiagnosticRecovery", () => {
  it("offers the proxy shortcut only on Windows", () => {
    const diagnostic = makeDiagnostic({ traceId: "t-1" });
    expect(resolveErrorDiagnosticRecoveryActions({ diagnostic, isWindows: true }))
      .toEqual(["open_proxy_settings"]);
    expect(resolveErrorDiagnosticRecoveryActions({ diagnostic, isWindows: false }))
      .toEqual([]);
  });

  it("offers retry when the download input URL is available", () => {
    const diagnostic = makeDiagnostic({
      failure: { userUrl: "https://www.youtube.com/watch?v=abc" },
    });
    expect(resolveErrorDiagnosticRecoveryActions({ diagnostic, isWindows: true }))
      .toEqual(["open_proxy_settings", "retry"]);
  });

  it("offers retry for a transcode failure that carries a trace", () => {
    const diagnostic = makeDiagnostic({
      surface: "transcode",
      traceId: "trace-9",
    });
    expect(resolveErrorDiagnosticRecoveryActions({ diagnostic, isWindows: false }))
      .toEqual(["retry"]);
  });

  it("never offers recovery for a non-network category", () => {
    for (const category of [
      "auth_login_state",
      "content_unavailable",
      "output_write",
      "quality_format_unavailable",
      "runtime_downloader_unavailable",
      "transcode_merge",
      "unclassified",
    ] as const) {
      expect(resolveErrorDiagnosticRecoveryActions({
        diagnostic: makeDiagnostic({
          category,
          traceId: "t-1",
          failure: { userUrl: "https://example.com/video" },
        }),
        isWindows: true,
      })).toEqual([]);
    }
  });

  it("offers nothing when no diagnostic exists", () => {
    expect(resolveErrorDiagnosticRecoveryActions({ diagnostic: null, isWindows: true }))
      .toEqual([]);
    expect(resolveErrorDiagnosticRecoveryActions({
      diagnostic: undefined,
      isWindows: true,
    })).toEqual([]);
  });

  it("resolves a download retry to the original input URL", () => {
    expect(resolveErrorDiagnosticRetryTarget(makeDiagnostic({
      failure: { userUrl: "  https://example.com/v/1  " },
    }))).toEqual({ kind: "download", url: "https://example.com/v/1" });
  });

  it("resolves a transcode retry to its trace", () => {
    expect(resolveErrorDiagnosticRetryTarget(makeDiagnostic({
      surface: "transcode",
      traceId: "trace-1",
    }))).toEqual({ kind: "transcode", traceId: "trace-1" });
  });

  it("returns no retry target for an empty or missing input", () => {
    expect(resolveErrorDiagnosticRetryTarget(makeDiagnostic({
      failure: { userUrl: "   " },
    }))).toBeNull();
    expect(resolveErrorDiagnosticRetryTarget(makeDiagnostic({
      surface: "transcode",
    }))).toBeNull();
    expect(resolveErrorDiagnosticRetryTarget(null)).toBeNull();
  });
});
