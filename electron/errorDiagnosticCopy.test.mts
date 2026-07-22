import { describe, expect, it, vi } from "vitest";

import {
  buildErrorDiagnosticCopyPayload,
  buildErrorDiagnosticCopyText,
  normalizeErrorDiagnosticCopyRequest,
  redactDiagnosticContext,
  redactRuntimeLogLine,
} from "./errorDiagnosticCopy.mjs";

describe("errorDiagnosticCopy", () => {
  it("builds pretty JSON diagnostics with preserved URL and redacted runtime logs", async () => {
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
    expect(payload.failure.url).toBe("https://example.com/watch?v=123");
    expect(payload.failure.context.cookies).toBe("[REDACTED]");
    expect(payload.failure.context.outputUrl).toBe("https://cdn.example.com/video.mp4");
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
        userUrl: "https://example.com",
        context: undefined,
      },
    });
  });

  it("redacts common secret-bearing strings and fields", () => {
    expect(redactRuntimeLogLine("token=abc123 password=hunter2 Bearer secret"))
      .toBe("token=[REDACTED] password=[REDACTED] Bearer [REDACTED]");
    expect(redactDiagnosticContext({
      account: "user@example.com",
      nested: {
        sessionId: "abc",
        user_url: "https://example.com/profile",
      },
    })).toEqual({
      account: "[REDACTED]",
      nested: {
        sessionId: "[REDACTED]",
        user_url: "https://example.com/profile",
      },
    });
  });
});
