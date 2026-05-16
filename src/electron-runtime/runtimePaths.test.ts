import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  inspectRuntimeDependencyStatus,
  resolveRuntimeBinaryPaths,
} from "./runtimePaths";
import type { ElectronRuntimeEnvironment } from "./contracts";

const tempRoots: string[] = [];

const createEnvironment = (
  overrides: Partial<ElectronRuntimeEnvironment> = {},
): ElectronRuntimeEnvironment => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ameow-electron-runtime-"));
  tempRoots.push(root);
  return {
    repoRoot: root,
    configDir: path.join(root, "config"),
    platform: "win32",
    arch: "x64",
    ...overrides,
  };
};

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("inspectRuntimeDependencyStatus", () => {
  it("marks bundled and managed paths as ready when files exist", () => {
    const environment = createEnvironment();
    const ytDlpRealDir = path.join(
      environment.configDir,
      "runtimes",
      "yt-dlp",
      "x86_64-pc-windows-msvc",
      "real",
    );
    const galleryDlRealDir = path.join(
      environment.configDir,
      "runtimes",
      "gallery-dl",
      "x86_64-pc-windows-msvc",
      "real",
    );
    const ffmpegRealDir = path.join(
      environment.configDir,
      "runtimes",
      "ffmpeg",
      "x86_64-pc-windows-msvc",
      "real",
    );
    const denoRealDir = path.join(
      environment.configDir,
      "runtimes",
      "deno",
      "x86_64-pc-windows-msvc",
      "real",
    );
    mkdirSync(ytDlpRealDir, { recursive: true });
    mkdirSync(galleryDlRealDir, { recursive: true });
    mkdirSync(ffmpegRealDir, { recursive: true });
    mkdirSync(denoRealDir, { recursive: true });

    writeFileSync(path.join(ytDlpRealDir, "yt-dlp-x86_64-pc-windows-msvc.exe"), "binary");
    writeFileSync(path.join(galleryDlRealDir, "gallery-dl-x86_64-pc-windows-msvc.exe"), "binary");
    writeFileSync(path.join(ffmpegRealDir, "ffmpeg.exe"), "binary");
    writeFileSync(path.join(ffmpegRealDir, "ffprobe.exe"), "binary");
    writeFileSync(path.join(denoRealDir, "deno.exe"), "binary");

    const snapshot = inspectRuntimeDependencyStatus(environment);

    expect(snapshot.ytDlp.state).toBe("ready");
    expect(snapshot.ytDlp.source).toBe("managed");
    expect(snapshot.galleryDl.state).toBe("ready");
    expect(snapshot.galleryDl.source).toBe("managed");
    expect(snapshot.ffmpeg.state).toBe("ready");
    expect(snapshot.ffmpeg.source).toBe("managed");
    expect(snapshot.deno.state).toBe("ready");
  });

  it("marks missing runtimes with actionable errors", () => {
    const environment = createEnvironment();
    const snapshot = inspectRuntimeDependencyStatus(environment);

    expect(snapshot.ytDlp.state).toBe("missing");
    expect(snapshot.ytDlp.error).toContain("Missing managed yt-dlp runtime");
    expect(snapshot.galleryDl.state).toBe("missing");
    expect(snapshot.galleryDl.error).toContain("Missing managed gallery-dl runtime");
    expect(snapshot.ffmpeg.state).toBe("missing");
    expect(snapshot.deno.state).toBe("missing");
  });

  it("resolves macOS bundled downloader names without Windows extensions", () => {
    const environment = createEnvironment({
      platform: "darwin",
      arch: "arm64",
    });
    const binariesDir = path.join(environment.repoRoot, "desktop-assets", "binaries");
    const galleryDlDir = path.join(
      environment.configDir,
      "runtimes",
      "gallery-dl",
      "aarch64-apple-darwin",
    );
    const ffmpegDir = path.join(
      environment.configDir,
      "runtimes",
      "ffmpeg",
      "aarch64-apple-darwin",
    );
    const denoDir = path.join(
      environment.configDir,
      "runtimes",
      "deno",
      "aarch64-apple-darwin",
    );
    mkdirSync(binariesDir, { recursive: true });
    mkdirSync(galleryDlDir, { recursive: true });
    mkdirSync(ffmpegDir, { recursive: true });
    mkdirSync(denoDir, { recursive: true });

    writeFileSync(path.join(binariesDir, "yt-dlp-aarch64-apple-darwin"), "binary");
    writeFileSync(path.join(galleryDlDir, "gallery-dl-aarch64-apple-darwin"), "binary");
    writeFileSync(path.join(ffmpegDir, "ffmpeg"), "binary");
    writeFileSync(path.join(ffmpegDir, "ffprobe"), "binary");
    writeFileSync(path.join(denoDir, "deno"), "binary");

    const snapshot = inspectRuntimeDependencyStatus(environment);

    expect(snapshot.ytDlp.state).toBe("missing");
    expect(snapshot.ytDlp.source).toBeNull();
    expect(snapshot.ytDlp.expectedSource).toBe("managed");
    expect(snapshot.ytDlp.fallbackSource).toBe("bundled");
    expect(snapshot.ytDlp.path).toBeNull();
    expect(snapshot.ytDlp.fallbackPath).toContain("yt-dlp-aarch64-apple-darwin");
    expect(snapshot.ytDlp.error).toContain("Missing managed yt-dlp runtime");
    expect(snapshot.galleryDl.state).toBe("ready");
    expect(snapshot.galleryDl.source).toBe("managed");
    expect(snapshot.galleryDl.path).toContain(path.join("gallery-dl", "aarch64-apple-darwin", "gallery-dl-aarch64-apple-darwin"));
    expect(snapshot.ffmpeg.path).toContain(path.join("ffmpeg", "aarch64-apple-darwin", "ffmpeg"));
    expect(snapshot.deno.path).toContain(path.join("deno", "aarch64-apple-darwin", "deno"));
  });

  it("prefers macOS managed yt-dlp when the managed runtime exists", () => {
    const environment = createEnvironment({
      platform: "darwin",
      arch: "arm64",
    });
    const binariesDir = path.join(environment.repoRoot, "desktop-assets", "binaries");
    const managedYtDlpDir = path.join(
      environment.configDir,
      "runtimes",
      "yt-dlp",
      "aarch64-apple-darwin",
      "venv",
      "bin",
    );
    mkdirSync(binariesDir, { recursive: true });
    mkdirSync(managedYtDlpDir, { recursive: true });

    writeFileSync(path.join(binariesDir, "yt-dlp-aarch64-apple-darwin"), "bundled");
    writeFileSync(path.join(managedYtDlpDir, "yt-dlp"), "managed");

    const snapshot = inspectRuntimeDependencyStatus(environment);
    const binaries = resolveRuntimeBinaryPaths(environment);

    expect(snapshot.ytDlp.state).toBe("ready");
    expect(snapshot.ytDlp.source).toBe("managed");
    expect(snapshot.ytDlp.expectedSource).toBe("managed");
    expect(snapshot.ytDlp.fallbackSource).toBe("bundled");
    expect(snapshot.ytDlp.path).toContain(path.join("yt-dlp", "aarch64-apple-darwin", "venv", "bin", "yt-dlp"));
    expect(snapshot.ytDlp.fallbackPath).toContain("yt-dlp-aarch64-apple-darwin");
    expect(snapshot.ytDlp.error).toBeNull();
    expect(binaries.ytDlp).toBe(snapshot.ytDlp.path);
  });

  it("reports macOS managed yt-dlp missing and exposes the bundled fallback path hint", () => {
    const environment = createEnvironment({
      platform: "darwin",
      arch: "arm64",
    });

    const snapshot = inspectRuntimeDependencyStatus(environment);
    const binaries = resolveRuntimeBinaryPaths(environment);

    expect(snapshot.ytDlp.state).toBe("missing");
    expect(snapshot.ytDlp.source).toBeNull();
    expect(snapshot.ytDlp.expectedSource).toBe("managed");
    expect(snapshot.ytDlp.fallbackSource).toBe("bundled");
    expect(snapshot.ytDlp.fallbackPath).toContain("yt-dlp-aarch64-apple-darwin");
    expect(snapshot.ytDlp.error).toContain("Missing managed yt-dlp runtime");
    expect(binaries.ytDlp).toContain(path.join("yt-dlp", "aarch64-apple-darwin", "venv", "bin", "yt-dlp"));
  });

  it("still resolves bundled macOS yt-dlp for execution while reporting managed missing", () => {
    const environment = createEnvironment({
      platform: "darwin",
      arch: "arm64",
    });
    const binariesDir = path.join(environment.repoRoot, "desktop-assets", "binaries");
    mkdirSync(binariesDir, { recursive: true });
    writeFileSync(path.join(binariesDir, "yt-dlp-aarch64-apple-darwin"), "bundled");

    const snapshot = inspectRuntimeDependencyStatus(environment);
    const binaries = resolveRuntimeBinaryPaths(environment);

    expect(snapshot.ytDlp.state).toBe("missing");
    expect(snapshot.ytDlp.fallbackPath).toContain("yt-dlp-aarch64-apple-darwin");
    expect(binaries.ytDlp).toContain("yt-dlp-aarch64-apple-darwin");
  });
});
