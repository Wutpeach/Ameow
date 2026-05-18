import { describe, expect, it } from "vitest";
import { InvalidCommandPlanError } from "./commandPlanErrors.js";
import { createGalleryDlCommandPlan, isGalleryDlSidecar } from "./galleryDlCommandPlan.js";

const createContext = (overrides: Record<string, unknown> = {}) => ({
  traceId: "trace-gallery-plan",
  outputDir: "D:/downloads",
  outputStem: "pin",
  config: {},
  binaries: {
    ytDlp: "D:/yt-dlp.exe",
    galleryDl: "D:/gallery-dl.exe",
    douyinDl: "D:/douyin-dl.exe",
    ffmpeg: "D:/ffmpeg.exe",
    ffprobe: "D:/ffprobe.exe",
    deno: "D:/deno.exe",
  },
  enginePlan: {
    sourceUrl: "https://www.pinterest.com/pin/123/",
  },
  intent: {
    originalUrl: "https://www.pinterest.com/pin/123/",
  },
  plan: {
    providerId: "pinterest",
  },
  abortSignal: new AbortController().signal,
  onProgress: async () => undefined,
  ...overrides,
} as never);

describe("gallery-dl command planning", () => {
  it("builds config-isolated gallery-dl args and output prefix", () => {
    const plan = createGalleryDlCommandPlan(createContext());

    expect(plan.outputFilePrefix).toBe("pin.");
    expect(plan.args).toEqual([
      "--config-ignore",
      "--write-info-json",
      "--directory",
      "D:/downloads",
      "--filename",
      "pin.{extension}",
      "https://www.pinterest.com/pin/123/",
    ]);
  });

  it("classifies sidecar extensions case-insensitively", () => {
    expect(isGalleryDlSidecar("pin.json", "pin")).toBe(true);
    expect(isGalleryDlSidecar("pin.TXT", "pin")).toBe(true);
    expect(isGalleryDlSidecar("pin.part", "pin")).toBe(true);
    expect(isGalleryDlSidecar("pin.mp4", "pin")).toBe(false);
    expect(isGalleryDlSidecar("other.json", "pin")).toBe(false);
  });

  it("requires a source URL", () => {
    expect(() => createGalleryDlCommandPlan(createContext({
      enginePlan: {},
      intent: {},
    }))).toThrow(InvalidCommandPlanError);
  });
});
