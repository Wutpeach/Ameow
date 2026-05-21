import { describe, expect, it, vi } from "vitest";

import { checkYtdlpVersion, getGalleryDlInfo } from "./downloaderVersionInfo.mjs";

const createStatus = (overrides = {}) => ({
  python: {
    state: "ready" as const,
    source: "bundled" as const,
    path: "D:/runtime/python/python.exe",
    error: null,
    ...overrides.python,
  },
  ytDlp: {
    state: "ready" as const,
    source: "managed" as const,
    path: "D:/runtime/yt-dlp/x86_64-pc-windows-msvc/venv/Scripts/yt-dlp.exe",
    error: null,
    ...overrides.ytDlp,
  },
  galleryDl: {
    state: "ready" as const,
    source: "managed" as const,
    path: "D:/runtime/gallery-dl/x86_64-pc-windows-msvc/venv/Scripts/gallery-dl.exe",
    error: null,
    ...overrides.galleryDl,
  },
  douyinDl: {
    state: "ready" as const,
    source: "managed" as const,
    path: "D:/runtime/douyin-dl/x86_64-pc-windows-msvc/venv/Scripts/douyin-dl.exe",
    error: null,
    ...overrides.douyinDl,
  },
  ffmpeg: {
    state: "ready" as const,
    source: "managed" as const,
    path: "D:/runtime/ffmpeg.exe",
    error: null,
    ...overrides.ffmpeg,
  },
  deno: {
    state: "ready" as const,
    source: "managed" as const,
    path: "D:/runtime/deno.exe",
    error: null,
    ...overrides.deno,
  },
});

describe("checkYtdlpVersion", () => {
  it("reports managed non-macOS version metadata", async () => {
    const info = await checkYtdlpVersion({
      platform: "win32",
      getRuntimeDependencyStatus: vi.fn(async () => createStatus()),
      getUserDataDir: vi.fn(() => "/tmp/ameow"),
      currentManagedRuntimeTarget: vi.fn(() => "x86_64-pc-windows-msvc"),
      getLocalDownloaderVersion: vi.fn(async () => "2026.03.17"),
      resolvePinnedManagedPythonPackage: vi.fn(() => ({
        packageVersion: "2026.04.01",
        minPython: [3, 10, 0],
      })),
      compareLooseVersions: vi.fn((left, right) => (left < right ? -1 : 0)),
      readManagedPythonRuntimeMetadata: vi.fn(async () => ({
        pythonVersion: "Python 3.11.15",
        pythonPath: "D:/runtime/python/python.exe",
        bundledPythonVersion: "Python 3.11.15",
      })),
    });

    expect(info).toMatchObject({
      current: "2026.03.17",
      latest: "2026.04.01",
      updateAvailable: true,
      source: "managed",
      path: "D:/runtime/yt-dlp/x86_64-pc-windows-msvc/venv/Scripts/yt-dlp.exe",
      pythonVersion: "Python 3.11.15",
      pythonPath: "D:/runtime/python/python.exe",
      pythonSupportsLatestStable: true,
      updateChannel: "managed_python_package",
    });
  });

  it("reports managed macOS version metadata and python ceiling", async () => {
    const info = await checkYtdlpVersion({
      platform: "darwin",
      getRuntimeDependencyStatus: vi.fn(async () => createStatus({
        ytDlp: {
          path: "D:/runtime/yt-dlp/aarch64-apple-darwin/venv/bin/yt-dlp",
        },
      })),
      getUserDataDir: vi.fn(() => "/tmp/ameow"),
      currentManagedRuntimeTarget: vi.fn(() => "aarch64-apple-darwin"),
      getLocalDownloaderVersion: vi.fn(),
      resolvePinnedManagedPythonPackage: vi.fn(() => ({
        packageVersion: "2026.04.01",
        minPython: [3, 10, 0],
      })),
      compareLooseVersions: vi.fn(() => -1),
      readManagedPythonRuntimeMetadata: vi.fn(async () => ({
        pythonVersion: "Python 3.11.15",
        pythonPath: "D:/runtime/python/python.exe",
      })),
    });

    expect(info).toMatchObject({
      source: "managed",
      updateChannel: "managed_python_package",
      pythonVersion: "Python 3.11.15",
      pythonPath: "D:/runtime/python/python.exe",
      pythonSupportsLatestStable: true,
    });
  });

  it("falls back to runtime dependency python path when managed metadata is unavailable", async () => {
    const info = await checkYtdlpVersion({
      platform: "win32",
      getRuntimeDependencyStatus: vi.fn(async () => createStatus()),
      getUserDataDir: vi.fn(() => "/tmp/ameow"),
      currentManagedRuntimeTarget: vi.fn(() => "x86_64-pc-windows-msvc"),
      getLocalDownloaderVersion: vi.fn(async () => "2026.03.17"),
      resolvePinnedManagedPythonPackage: vi.fn(() => ({
        packageVersion: "2026.04.01",
        minPython: [3, 10, 0],
      })),
      compareLooseVersions: vi.fn((left, right) => (left < right ? -1 : 0)),
      readManagedPythonRuntimeMetadata: vi.fn(async () => null),
    });

    expect(info).toMatchObject({
      source: "managed",
      pythonVersion: null,
      pythonPath: "D:/runtime/python/python.exe",
      pythonSupportsLatestStable: null,
    });
  });

  it("reports incompatible python metadata when below the pinned minimum", async () => {
    const info = await checkYtdlpVersion({
      platform: "win32",
      getRuntimeDependencyStatus: vi.fn(async () => createStatus()),
      getUserDataDir: vi.fn(() => "/tmp/ameow"),
      currentManagedRuntimeTarget: vi.fn(() => "x86_64-pc-windows-msvc"),
      getLocalDownloaderVersion: vi.fn(async () => "2026.03.17"),
      resolvePinnedManagedPythonPackage: vi.fn(() => ({
        packageVersion: "2026.04.01",
        minPython: [3, 10, 0],
      })),
      compareLooseVersions: vi.fn((left, right) => (left < right ? -1 : 0)),
      readManagedPythonRuntimeMetadata: vi.fn(async () => ({
        pythonVersion: "Python 3.9.18",
        pythonPath: "D:/runtime/python/python.exe",
      })),
    });

    expect(info).toMatchObject({
      pythonVersion: "Python 3.9.18",
      pythonSupportsLatestStable: false,
    });
  });
});

describe("getGalleryDlInfo", () => {
  it("reports bundled-missing fallback state", async () => {
    const info = await getGalleryDlInfo({
      platform: "win32",
      getRuntimeDependencyStatus: vi.fn(async () => createStatus({
        galleryDl: { state: "missing", source: null, path: null, error: "Missing runtime" },
      })),
      getLocalDownloaderVersion: vi.fn(),
      resolvePinnedManagedPythonPackage: vi.fn(() => ({ packageVersion: "1.32.1" })),
      compareLooseVersions: vi.fn(),
    });

    expect(info).toMatchObject({
      current: "missing",
      latest: "1.32.1",
      source: "missing",
      updateChannel: "unavailable",
    });
  });
});
