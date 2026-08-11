import { describe, expect, it, vi } from "vitest";

import {
  buildErrorDiagnosticCopyPayload,
  buildErrorDiagnosticCopyText,
  normalizeErrorDiagnosticCopyRequest,
  redactDiagnosticContext,
  redactRuntimeLogLine,
} from "./errorDiagnosticCopy.mjs";

describe("errorDiagnosticCopy", () => {
  it("builds pretty JSON diagnostics with origin-reduced URL and redacted runtime logs", async () => {
    const readRecentRuntimeLogLines = vi.fn(async () => [
      ">>> [yt-dlp] Cookie: SID=secret",
      ">>> [yt-dlp] Authorization: Bearer abc.def",
      ">>> [yt-dlp] Download failed",
    ]);

    const text = await buildErrorDiagnosticCopyText({
      request: {
        surface: "download",
        traceId: "download-1",
        userMessage: "网络连接异常，请检查代理",
        category: "network_proxy",
        language: "zh-CN",
        failure: {
          code: "E_EXECUTION_FAILED",
          classification: "retry_same_engine",
          rawMessage: "HTTP Error 429",
          userUrl: "https://example.com/watch?v=123",
          context: {
            cookies: "SID=secret",
            outputUrl: "https://cdn.example.com/video.mp4",
          },
        },
      },
      appVersion: "0.3.1",
      platform: "win32",
      arch: "x64",
      readRecentRuntimeLogLines,
      now: () => new Date("2026-07-22T12:00:00.000Z"),
    });

    expect(text).toContain("\n  ");
    const payload = JSON.parse(text);
    expect(readRecentRuntimeLogLines).toHaveBeenCalledWith(120);
    // The tokenized URL collapses to origin-only facts; the open context bag
    // and its secrets are never copied.
    expect(payload.failure.url).toEqual({
      origin: "https://example.com",
      hasQuery: true,
      hasFragment: false,
    });
    expect(payload.failure.context).toBeUndefined();
    expect(payload.failure.rawMessage).toBe("HTTP Error 429");
    expect(payload.redaction).toEqual({
      applied: true,
      urlReducedToOrigin: true,
    });
    expect(payload.runtimeLog.lines).toEqual([
      ">>> [yt-dlp] Cookie: [REDACTED]",
      ">>> [yt-dlp] Authorization: [REDACTED]",
      ">>> [yt-dlp] Download failed",
    ]);
  });

  it("includes a placeholder line when runtime logs cannot be read", async () => {
    const payload = await buildErrorDiagnosticCopyPayload({
      request: {
        surface: "transcode",
        userMessage: "Video processing failed. Copy diagnostics",
        category: "transcode_merge",
        failure: { rawMessage: "ffmpeg exited with code 1" },
      },
      appVersion: "0.3.1",
      readRecentRuntimeLogLines: async () => {
        throw new Error("log file missing");
      },
    });

    expect(payload.runtimeLog.lines).toEqual([
      "<runtime log unavailable: log file missing>",
    ]);
    expect(payload.runtimeLog.excerptLineCount).toBe(1);
  });

  it("normalizes malformed renderer payloads to bounded defaults", () => {
    expect(normalizeErrorDiagnosticCopyRequest({
      surface: "unknown",
      traceId: "  trace-1  ",
      userMessage: "",
      category: "bad-category",
      failure: {
        rawMessage: "  ERROR  ",
        userUrl: "  https://example.com  ",
        context: [],
      },
    })).toEqual({
      surface: "download",
      traceId: "trace-1",
      userMessage: "",
      category: "unclassified",
      language: undefined,
      failure: {
        code: undefined,
        classification: undefined,
        rawMessage: "ERROR",
        safeUrl: {
          origin: "https://example.com",
          hasQuery: false,
          hasFragment: false,
        },
        diagnosticCategory: undefined,
        attemptSummary: undefined,
      },
    });
  });

  it("redacts common secret-bearing strings and drops open context bags", () => {
    expect(redactRuntimeLogLine("token=abc123 password=hunter2 Bearer secret"))
      .toBe("token=[REDACTED] password=[REDACTED] Bearer [REDACTED]");
    // Open context is no longer copied into diagnostics at all.
    expect(redactDiagnosticContext({
      account: "user@example.com",
      nested: {
        sessionId: "abc",
        user_url: "https://example.com/profile",
      },
    })).toBeUndefined();
  });

  it("scrubs secret-bearing values inside structured diagnostic fields", async () => {
    const request = normalizeErrorDiagnosticCopyRequest({
      surface: "download",
      traceId: "trace-token=top-secret",
      userMessage: "failed",
      category: "runtime_downloader_unavailable",
      failure: {
        code: "E_EXECUTION_FAILED secret=code-secret",
        classification: "fallback_to_other_engine token=classification-secret",
        diagnosticCategory: "engine_execution",
        attemptSummary: {
          traceId: "trace-token=summary-secret",
          status: "failed",
          finalEngineId: "yt-dlp token=engine-secret",
          attemptCount: 1,
          attempts: [{
            attemptIndex: 1,
            attemptId: "attempt-token=attempt-secret",
            engineId: "yt-dlp secret=attempt-engine-secret",
            cycle: "initial",
            outcome: "failed",
            errorCode: "E_EXECUTION_FAILED token=attempt-code-secret",
            classification: "fallback_to_other_engine",
            category: "engine_execution",
            network: {
              routeKind: "direct",
              source: "direct",
              consumer: "yt-dlp token=consumer-secret",
              appliedToEngine: true,
              proxyProtocol: null,
              failureClassification: "token=network-secret",
            },
          }],
          finalCode: "E_EXECUTION_FAILED token=final-code-secret",
          finalClassification: "fallback_to_other_engine",
          finalCategory: "engine_execution",
        },
      },
    });

    const text = await buildErrorDiagnosticCopyText({
      request,
      appVersion: "1.0.0",
      readRecentRuntimeLogLines: async () => [],
    });

    expect(text).not.toContain("top-secret");
    expect(text).not.toContain("summary-secret");
    expect(text).not.toContain("engine-secret");
    expect(text).not.toContain("attempt-secret");
    expect(text).not.toContain("attempt-engine-secret");
    expect(text).not.toContain("attempt-code-secret");
    expect(text).not.toContain("consumer-secret");
    expect(text).not.toContain("network-secret");
    expect(text).not.toContain("final-code-secret");
    expect(text).not.toContain("classification-secret");
    expect(text).not.toContain("code-secret");
  });
});
