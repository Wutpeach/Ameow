import { describe, expect, it, vi } from "vitest";

import {
  currentManagedRuntimeTarget,
  managedDenoPath,
  managedFfmpegPaths,
  managedGalleryDlPath,
  managedYtDlpPaths,
  resolvePinnedDownloaderRelease,
  selectDenoRuntimeArtifactSpec,
  selectFfmpegRuntimeArtifactSpec,
  selectPinnedDownloaderReleaseAsset,
  writeDownloaderLatestCache,
} from "./managedRuntimeBootstrap.mjs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const createOptions = (overrides = {}) => ({
  configDir: "/tmp/ameow-config",
  platform: "win32" as NodeJS.Platform,
  arch: "x64" as NodeJS.Architecture,
  fetch: vi.fn<typeof fetch>(),
  ...overrides,
});

describe("managed runtime bootstrap helpers", () => {
  it("resolves managed runtime target and binary paths consistently", () => {
    const options = createOptions();

    expect(currentManagedRuntimeTarget("win32", "x64")).toBe("x86_64-pc-windows-msvc");
    expect(managedDenoPath(options)).toBe(
      "/tmp/ameow-config/runtimes/deno/x86_64-pc-windows-msvc/real/deno.exe",
    );
    expect(managedFfmpegPaths(options)).toEqual({
      ffmpeg: "/tmp/ameow-config/runtimes/ffmpeg/x86_64-pc-windows-msvc/real/ffmpeg.exe",
      ffprobe: "/tmp/ameow-config/runtimes/ffmpeg/x86_64-pc-windows-msvc/real/ffprobe.exe",
    });
    expect(managedYtDlpPaths(options).ytDlp).toBe(
      "/tmp/ameow-config/runtimes/yt-dlp/x86_64-pc-windows-msvc/real/yt-dlp-x86_64-pc-windows-msvc.exe",
    );
    expect(managedGalleryDlPath(options)).toBe(
      "/tmp/ameow-config/runtimes/gallery-dl/x86_64-pc-windows-msvc/real/gallery-dl-x86_64-pc-windows-msvc.exe",
    );
  });

  it("keeps pinned downloader release metadata explicit", () => {
    expect(resolvePinnedDownloaderRelease("yt-dlp")).toMatchObject({
      version: "2026.03.17",
      latestCacheFileName: "ytdlp-latest.json",
    });
    expect(resolvePinnedDownloaderRelease("gallery-dl")).toMatchObject({
      version: "1.32.0-dev:2026.04.01",
      latestCacheFileName: "gallery-dl-latest.json",
    });
    expect(() => resolvePinnedDownloaderRelease("unknown" as never)).toThrow(
      "Unsupported pinned downloader tool: unknown",
    );
  });

  it("selects pinned release assets by platform-specific name", () => {
    const release = {
      tag_name: "2026.03.17",
      assets: [
        { name: "yt-dlp_macos", browser_download_url: "https://example.invalid/mac" },
        { name: "yt-dlp.exe", browser_download_url: "https://example.invalid/windows" },
      ],
    };

    expect(selectPinnedDownloaderReleaseAsset("yt-dlp", release, createOptions())).toMatchObject({
      name: "yt-dlp.exe",
      browser_download_url: "https://example.invalid/windows",
    });
  });

  it("resolves managed deno and ffmpeg artifact specs per target", () => {
    expect(selectDenoRuntimeArtifactSpec(createOptions())).toMatchObject({
      component: "deno",
      target: "x86_64-pc-windows-msvc",
      size: 47277539,
    });
    expect(selectFfmpegRuntimeArtifactSpec(createOptions({
      platform: "darwin",
      arch: "arm64",
    }))).toMatchObject({
      component: "ffmpeg",
      target: "aarch64-apple-darwin",
      size: 69575396,
    });
  });

  it("writes downloader latest cache metadata", async () => {
    const configDir = join(tmpdir(), `ameow-managed-runtime-test-${Date.now()}`);
    await mkdir(configDir, { recursive: true });
    try {
      await writeDownloaderLatestCache("gallery-dl", "1.2.3", createOptions({
        configDir,
        now: () => 123,
      }));

      await expect(
        readFile(join(configDir, "gallery-dl-latest.json"), "utf8"),
      ).resolves.toBe(JSON.stringify({
        version: "1.2.3",
        fetchedAtMs: 123,
      }));
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  });
});
