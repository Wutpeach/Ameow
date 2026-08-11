import { describe, expect, it, vi } from "vitest";

import type { AmeowRendererCommand } from "../src/types/electronBridge.js";
import { createErrorDiagnosticCommandController } from "./errorDiagnosticCommands.mjs";

describe("createErrorDiagnosticCommandController", () => {
  it("supports only the diagnostic copy command", () => {
    const controller = createErrorDiagnosticCommandController({
      appVersion: "0.3.1",
      readRecentRuntimeLogLines: vi.fn(async () => []),
      writeClipboardText: vi.fn(),
    });

    expect(controller.supports("copy_error_diagnostics")).toBe(true);
    expect(controller.supports("export_support_log")).toBe(false);
  });

  it("writes generated diagnostic JSON to the clipboard", async () => {
    const writeClipboardText = vi.fn();
    const controller = createErrorDiagnosticCommandController({
      appVersion: "0.3.1",
      platform: "win32",
      arch: "x64",
      readRecentRuntimeLogLines: vi.fn(async () => ["runtime line"]),
      writeClipboardText,
      now: () => new Date("2026-07-22T12:00:00.000Z"),
    });

    await expect(controller.invoke("copy_error_diagnostics", {
      surface: "download",
      traceId: "download-1",
      userMessage: "Downloader is not ready",
      category: "runtime_downloader_unavailable",
      failure: {
        rawMessage: "yt-dlp unavailable",
        userUrl: "https://example.com/watch",
      },
    })).resolves.toBe(true);

    expect(writeClipboardText).toHaveBeenCalledTimes(1);
    const copied = writeClipboardText.mock.calls[0]?.[0];
    expect(JSON.parse(copied).failure).toMatchObject({
      surface: "download",
      traceId: "download-1",
      url: {
        origin: "https://example.com",
        hasQuery: false,
        hasFragment: false,
      },
      rawMessage: "yt-dlp unavailable",
    });
  });

  it("throws when invoked directly with an unsupported command", async () => {
    const controller = createErrorDiagnosticCommandController({
      appVersion: "0.3.1",
      readRecentRuntimeLogLines: vi.fn(async () => []),
      writeClipboardText: vi.fn(),
    });

    await expect(controller.invoke("get_config" as AmeowRendererCommand))
      .rejects.toThrow("Unsupported error diagnostic command: get_config");
  });
});
