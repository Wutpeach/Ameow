import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DownloadRuntimeError, type EngineExecutionContext } from "../core/index.js";
import { runDirectVideoDownload } from "./directDownload.js";

const createContext = (
  overrides: Partial<EngineExecutionContext>,
): EngineExecutionContext => ({
  traceId: "trace-1",
  plan: {
    providerId: "generic",
    label: "Example",
          intent: {
            type: "video",
            siteId: "generic",
            originalUrl: "https://www.example.com/watch/123",
            pageUrl: "https://www.example.com/watch/123",
            priority: 1,
            candidates: [],
            preferredFormat: "mp4",
          },
          engines: [],
        },
  enginePlan: {
    engine: "direct",
    priority: 100,
    when: "primary",
    reason: "test",
    sourceUrl: "https://cdn.example.com/example.mp4",
    fallbackOn: "any",
  },
  intent: {
    type: "video",
    siteId: "generic",
    originalUrl: "https://www.example.com/watch/123",
    pageUrl: "https://www.example.com/watch/123",
    priority: 1,
    candidates: [],
    preferredFormat: "mp4",
  },
  outputDir: overrides.outputDir ?? mkdtempSync(path.join(os.tmpdir(), "ameow-direct-")),
  outputStem: "output",
  config: {},
  binaries: {
    ytDlp: "",
    galleryDl: "",
    douyinDl: "",
    deno: "",
    ffmpeg: "",
    ffprobe: "",
  },
  abortSignal: new AbortController().signal,
  fetch: async () => new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: {
      "content-type": "video/mp4",
      "content-length": "3",
    },
  }),
  onProgress: async () => undefined,
  ...overrides,
});

describe("runDirectVideoDownload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the page referer for non-Xiaohongshu direct downloads", async () => {
    const outputDir = mkdtempSync(path.join(os.tmpdir(), "ameow-direct-"));
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Referer")).toBe("https://www.example.com/watch/123");
      expect(headers.get("Origin")).toBeNull();
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "content-length": "3",
        },
      });
    });

    const result = await runDirectVideoDownload(createContext({
      outputDir,
      plan: {
        providerId: "generic",
        label: "Example",
        intent: {
          type: "video",
          siteId: "generic",
          originalUrl: "https://www.example.com/watch/123",
          pageUrl: "https://www.example.com/watch/123",
          priority: 1,
          candidates: [],
          preferredFormat: "mp4",
        },
        engines: [],
      },
      intent: {
        type: "video",
        siteId: "generic",
        originalUrl: "https://www.example.com/watch/123",
        pageUrl: "https://www.example.com/watch/123",
        priority: 1,
        candidates: [],
        preferredFormat: "mp4",
      },
      enginePlan: {
        engine: "direct",
        priority: 100,
        when: "primary",
        reason: "test",
        sourceUrl: "https://cdn.example.com/example.mp4",
        fallbackOn: "any",
      },
      fetch: fetchMock,
    }));
    expect(result.success).toBe(true);
  });

  it("preserves runtime error codes thrown during stream reads", async () => {
    const outputDir = mkdtempSync(path.join(os.tmpdir(), "ameow-direct-"));
    const runtimeError = new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      "stream failed with classified runtime error",
    );
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
      },
      pull() {
        throw runtimeError;
      },
    }), {
      status: 200,
      headers: {
        "content-type": "video/mp4",
        "content-length": "6",
      },
    }));

    await expect(runDirectVideoDownload(createContext({
      outputDir,
      fetch: fetchMock,
    }))).rejects.toBe(runtimeError);
  });

  it("rejects when the output stream cannot flush the file", async () => {
    const outputDir = path.join(
      os.tmpdir(),
      `ameow-direct-missing-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );

    await expect(runDirectVideoDownload(createContext({
      outputDir,
      fetch: async () => new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "content-length": "3",
        },
      }),
    }))).rejects.toThrow(/ENOENT|no such file|cannot find/i);
    expect(existsSync(outputDir)).toBe(false);
  });
});
