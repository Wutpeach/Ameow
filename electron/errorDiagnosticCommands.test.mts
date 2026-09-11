import { describe, expect, it, vi } from "vitest";

import type { AmeowRendererCommand } from "../src/types/electronBridge.js";
import { createErrorDiagnosticCommandController } from "./errorDiagnosticCommands.mjs";

describe("createErrorDiagnosticCommandController", () => {
  it("supports both incident diagnostic egress commands", () => {
    const controller = createErrorDiagnosticCommandController({
      appVersion: "0.3.1",
      writeClipboardText: vi.fn(),
      saveDiagnosticText: vi.fn(async () => true),
    });

    expect(controller.supports("copy_error_diagnostics")).toBe(true);
    expect(controller.supports("export_error_diagnostics")).toBe(true);
    expect(controller.supports("export_support_log")).toBe(false);
  });

  it("writes the readable v2 report text to the clipboard", async () => {
    const writeClipboardText = vi.fn();
    const controller = createErrorDiagnosticCommandController({
      appVersion: "0.3.1",
      platform: "win32",
      arch: "x64",
      writeClipboardText,
      saveDiagnosticText: vi.fn(async () => true),
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
    expect(copied).toContain("Ameow Diagnostic Report");
    expect(copied).toContain("formatVersion=2");
    expect(copied).toContain("[incident]");
    expect(copied).toContain("surface=download");
    expect(copied).toContain("traceId=download-1");
    expect(copied).toContain("url-origin=https://example.com");
    expect(copied).toContain("category=runtime_downloader_unavailable");
    // v2 is readable sectioned text, not the old pretty-printed JSON payload.
    expect(() => JSON.parse(copied)).toThrow();
  });

  it("uses the same fixed report text for clipboard and file egress", async () => {
    const writeClipboardText = vi.fn();
    const saveDiagnosticText = vi.fn(async () => true);
    const controller = createErrorDiagnosticCommandController({
      appVersion: "0.3.1",
      writeClipboardText,
      saveDiagnosticText,
      now: () => new Date("2026-07-22T12:00:00.000Z"),
    });
    const request = {
      surface: "download",
      traceId: "download-1",
      userMessage: "Download failed",
      category: "unclassified",
      failure: { rawMessage: "legacy raw message" },
    };

    await controller.invoke("copy_error_diagnostics", request);
    await expect(controller.invoke("export_error_diagnostics", request)).resolves.toBe(true);

    expect(saveDiagnosticText).toHaveBeenCalledWith(writeClipboardText.mock.calls[0]?.[0]);
    expect(writeClipboardText.mock.calls[0]?.[0]).not.toContain("legacy raw message");
  });

  it("returns false for a cancelled save and propagates save errors for retry", async () => {
    const saveDiagnosticText = vi.fn()
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("save failed"));
    const controller = createErrorDiagnosticCommandController({
      appVersion: "0.3.1",
      writeClipboardText: vi.fn(),
      saveDiagnosticText,
    });

    await expect(controller.invoke("export_error_diagnostics", {
      surface: "download",
      userMessage: "failed",
      category: "unclassified",
    })).resolves.toBe(false);
    await expect(controller.invoke("export_error_diagnostics", {
      surface: "download",
      userMessage: "failed",
      category: "unclassified",
    })).rejects.toThrow("save failed");
  });

  it("throws when invoked directly with an unsupported command", async () => {
    const controller = createErrorDiagnosticCommandController({
      appVersion: "0.3.1",
      writeClipboardText: vi.fn(),
      saveDiagnosticText: vi.fn(async () => true),
    });

    await expect(controller.invoke("get_config" as AmeowRendererCommand))
      .rejects.toThrow("Unsupported error diagnostic command: get_config");
  });

  it("rejects cleanly when the clipboard sink fails (non-authoritative sink)", async () => {
    const writeClipboardText = vi.fn(() => {
      throw new Error("clipboard write failed");
    });
    const controller = createErrorDiagnosticCommandController({
      appVersion: "0.3.1",
      writeClipboardText,
      saveDiagnosticText: vi.fn(async () => true),
    });

    // Sink failure propagates as a rejection: no success return and no other
    // authority callback exists on the controller.
    await expect(controller.invoke("copy_error_diagnostics", {
      surface: "download",
      userMessage: "failed",
      category: "unclassified",
    })).rejects.toThrow("clipboard write failed");
  });
});
