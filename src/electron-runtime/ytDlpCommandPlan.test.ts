import path from "node:path";
import { describe, expect, it } from "vitest";
import { InvalidCommandPlanError } from "./commandPlanErrors.js";
import { buildYtdlpCommandArgs, createYtdlpCommandPlan } from "./ytDlpCommandPlan.js";

const createContext = (overrides: Record<string, unknown> = {}) => ({
  traceId: "trace-plan",
  outputDir: "D:/downloads",
  outputStem: "Sample Video",
  config: {},
  binaries: {
    ytDlp: "D:/yt-dlp.exe",
    galleryDl: "D:/gallery-dl.exe",
    douyinDl: "D:/douyin-dl.exe",
    ffmpeg: "D:/tools/ffmpeg/bin/ffmpeg.exe",
    ffprobe: "D:/tools/ffmpeg/bin/ffprobe.exe",
    deno: "D:/deno/deno.exe",
  },
  enginePlan: {
    sourceUrl: "https://www.youtube.com/watch?v=abc123",
  },
  intent: {
    originalUrl: "https://www.youtube.com/watch?v=abc123",
    pageUrl: "https://www.youtube.com/watch?v=abc123",
    selectionScope: "current_item",
    siteId: "youtube",
    ytdlpQuality: "best",
  },
  abortSignal: new AbortController().signal,
  onProgress: async () => undefined,
  plan: {
    providerId: "youtube",
  },
  ...overrides,
} as never);

describe("yt-dlp command planning", () => {
  it("plans output reports, template, ffmpeg directory, and artifact prefixes", () => {
    const plan = createYtdlpCommandPlan(createContext());

    expect(plan.reportPath).toBe(path.join("D:/downloads", "trace-plan-after-move.txt"));
    expect(plan.titleReportPath).toBe(path.join("D:/downloads", "trace-plan-title.txt"));
    expect(plan.outputTemplate).toBe(path.join(
      "D:/downloads",
      "Sample Video[%(width|unknown)sx%(height|unknown)s][highest].%(ext)s",
    ));
    expect(plan.artifactPrefixes).toEqual(["Sample Video"]);
    expect(plan.ffmpegDir).toBe(path.dirname("D:/tools/ffmpeg/bin/ffmpeg.exe"));
  });

  it("builds light youtube args in the expected command order", () => {
    const plan = createYtdlpCommandPlan(createContext());
    const args = buildYtdlpCommandArgs(plan, {
      mode: "light",
      cookiesPath: "D:/temp/trace-plan-cookies.txt",
      hasFfmpeg: true,
      hasDeno: true,
      selectionScope: "current_item",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      platform: "darwin",
    });

    expect(args.slice(0, 15)).toEqual([
      "--newline",
      "--no-warnings",
      "--ignore-config",
      "--progress",
      "-f",
      "bestvideo+bestaudio/best",
      "--encoding",
      "utf-8",
      "--print-to-file",
      "after_move:filepath",
      path.join("D:/downloads", "trace-plan-after-move.txt"),
      "--print-to-file",
      "after_move:title",
      path.join("D:/downloads", "trace-plan-title.txt"),
      "-o",
    ]);
    expect(args).toContain("--ffmpeg-location");
    expect(args).toContain("--no-playlist");
    expect(args).toContain("D:/temp/trace-plan-cookies.txt");
    expect(args).toContain("youtube:player_client=android,web");
    expect(args).not.toContain("youtube:player_js_variant=tv");
    expect(args[args.length - 1]).toBe("https://www.youtube.com/watch?v=abc123");
  });

  it("adds clip section args and clip output stem for supported sites", () => {
    const plan = createYtdlpCommandPlan(createContext({
      intent: {
        originalUrl: "https://www.bilibili.com/video/BV1xx411c7mD?p=2",
        pageUrl: "https://www.bilibili.com/video/BV1xx411c7mD?p=2",
        selectionScope: "current_item",
        siteId: "bilibili",
        ytdlpQuality: "best",
        clipStartSec: 5.25,
        clipEndSec: 8.75,
      },
      enginePlan: {
        sourceUrl: "https://www.bilibili.com/video/BV1xx411c7mD?p=2",
      },
    }));

    const args = buildYtdlpCommandArgs(plan, {
      mode: "light",
      cookiesPath: null,
      hasFfmpeg: true,
      hasDeno: false,
      selectionScope: "current_item",
      pageUrl: "https://www.bilibili.com/video/BV1xx411c7mD?p=2",
      platform: "darwin",
    });

    expect(plan.outputTemplate).toBe(path.join("D:/downloads", "5250-8750_Sample Video.%(ext)s"));
    expect(plan.artifactPrefixes).toEqual(["Sample Video", "5250-8750_Sample Video"]);
    expect(args).toContain("--download-sections");
    expect(args[args.indexOf("--download-sections") + 1]).toBe("*00:00:05.250-00:00:08.750");
  });

  it("uses platform-specific extended youtube js runtime ordering", () => {
    const plan = createYtdlpCommandPlan(createContext());
    const windowsArgs = buildYtdlpCommandArgs(plan, {
      mode: "extended",
      cookiesPath: null,
      hasFfmpeg: true,
      hasDeno: true,
      platform: "win32",
    });
    const macArgs = buildYtdlpCommandArgs(plan, {
      mode: "extended",
      cookiesPath: null,
      hasFfmpeg: true,
      hasDeno: true,
      platform: "darwin",
    });

    expect(windowsArgs).toContain("youtube:player_js_variant=tv");
    expect(windowsArgs.slice(windowsArgs.indexOf("--js-runtimes"))).toEqual([
      "--js-runtimes",
      "deno",
      "--js-runtimes",
      "node",
      "https://www.youtube.com/watch?v=abc123",
    ]);
    expect(macArgs.slice(macArgs.indexOf("--js-runtimes"))).toEqual([
      "--js-runtimes",
      "node",
      "--js-runtimes",
      "deno",
      "https://www.youtube.com/watch?v=abc123",
    ]);
  });

  it("rejects clip downloads for unsupported sites before spawning yt-dlp", () => {
    expect(() => createYtdlpCommandPlan(createContext({
      intent: {
        originalUrl: "https://x.com/ameow/status/1234567890",
        pageUrl: "https://x.com/ameow/status/1234567890",
        selectionScope: "current_item",
        siteId: "twitter-x",
        ytdlpQuality: "best",
        clipStartSec: 3,
        clipEndSec: 9,
      },
      enginePlan: {
        sourceUrl: "https://x.com/ameow/status/1234567890",
      },
    }))).toThrow(InvalidCommandPlanError);
  });
});
