import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { buildGitHubHeaders, downloadToFile } from "./appUpdateDownload.mjs";

const createResponse = (
  body: string,
  options: { status?: number; statusText?: string; headers?: HeadersInit } = {},
): Response => new Response(body, {
  status: options.status ?? 200,
  statusText: options.statusText ?? "OK",
  headers: options.headers,
});

describe("buildGitHubHeaders", () => {
  it("uses an explicit app user agent and accepts GitHub JSON or assets", () => {
    expect(buildGitHubHeaders()).toEqual({
      "User-Agent": "Ameow-Electron",
      Accept: "application/vnd.github+json, application/octet-stream",
    });
  });
});

describe("downloadToFile", () => {
  it("streams a response body to disk and reports byte progress", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "ameow-app-update-download-"));
    const outputPath = join(outputDir, "installer.exe");
    const progress: Array<{ downloaded: number; total: number }> = [];
    const fetchMock = vi.fn(async () => createResponse("installer", {
      headers: { "content-length": "9" },
    }));

    try {
      await downloadToFile("https://example.invalid/installer.exe", outputPath, {
        fetch: fetchMock,
        onProgress(payload) {
          progress.push(payload);
        },
      });

      await expect(readFile(outputPath, "utf8")).resolves.toBe("installer");
      expect(fetchMock).toHaveBeenCalledWith("https://example.invalid/installer.exe", {
        headers: undefined,
        signal: undefined,
      });
      expect(progress.at(-1)).toEqual({ downloaded: 9, total: 9 });
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("forwards headers and rejects non-success responses", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "ameow-app-update-download-fail-"));
    const outputPath = join(outputDir, "installer.exe");
    const fetchMock = vi.fn(async () => createResponse("missing", {
      status: 404,
      statusText: "Not Found",
    }));

    await expect(downloadToFile("https://example.invalid/missing.exe", outputPath, {
      fetch: fetchMock,
      headers: buildGitHubHeaders(),
    })).rejects.toThrow("Download failed: 404 Not Found");
    expect(fetchMock).toHaveBeenCalledWith("https://example.invalid/missing.exe", {
      headers: buildGitHubHeaders(),
      signal: undefined,
    });
    await rm(outputDir, { recursive: true, force: true });
  });

  it("maps stalled downloads to the configured timeout message", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "ameow-app-update-download-timeout-"));
    const outputPath = join(outputDir, "installer.exe");
    const fetchMock = vi.fn(async (_url, init) => {
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("aborted by timeout"));
        }, { once: true });
      });
      return createResponse("unreachable");
    });

    await expect(downloadToFile("https://example.invalid/stall.exe", outputPath, {
      fetch: fetchMock,
      timeoutMs: 1,
      timeoutErrorMessage: "installer download timed out",
    })).rejects.toThrow("installer download timed out");
    await rm(outputDir, { recursive: true, force: true });
  });
});
