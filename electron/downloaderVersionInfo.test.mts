import { describe, expect, it, vi } from "vitest";

import { checkYtdlpVersion, getGalleryDlInfo } from "./downloaderVersionInfo.mjs";

const createStatus = (overrides = {}) => ({
  ytDlp: {
    state: "ready" as const,
    source: "managed" as const,
    path: "D:/runtime/yt-dlp.exe",
    error: null,
    ...overrides.ytDlp,
  },
  galleryDl: {
    state: "ready" as const,
    source: "managed" as const,
    path: "D:/runtime/gallery-dl.exe",
    error: null,
    ...overrides.galleryDl,
  },
});

describe("checkYtdlpVersion", () => {
  it("reports managed non-macOS version metadata", async () => {
    const info = await checkYtdlpVersion({
      platform: "win32",
      getRuntimeDependencyStatus: vi.fn(async () => createStatus()),
      getUserDataDir: vi.fn(() => "/tmp/ameow"),
      getLocalDownloaderVersion: vi.fn(async () => "2026.03.17"),
      resolvePinnedDownloaderRelease: vi.fn(() => ({ version: "2026.04.01" })),
      compareLooseVersions: vi.fn((left, right) => (left < right ? -1 : 0)),
    });

    expect(info).toMatchObject({
      current: "2026.03.17",
      latest: "2026.04.01",
      updateAvailable: true,
      source: "managed",
      path: "D:/runtime/yt-dlp.exe",
      updateChannel: "managed_release",
    });
  });

  it("reports managed macOS version metadata and python ceiling", async () => {
    const info = await checkYtdlpVersion({
      platform: "darwin",
      getRuntimeDependencyStatus: vi.fn(async () => createStatus()),
      getUserDataDir: vi.fn(() => "/tmp/ameow"),
      currentManagedRuntimeTarget: vi.fn(() => "aarch64-apple-darwin"),
      getManagedYtDlpVersion: vi.fn(async () => ({
        version: "2026.03.17",
        pythonVersion: "3.11.7",
        pythonPath: "/usr/bin/python3",
        pythonSupportsLatestStable: true,
        path: "/tmp/ameow/runtimes/yt-dlp",
      })),
      getLocalDownloaderVersion: vi.fn(),
      resolvePinnedDownloaderRelease: vi.fn(() => ({ version: "2026.04.01" })),
      compareLooseVersions: vi.fn(() => -1),
    });

    expect(info).toMatchObject({
      source: "managed",
      updateChannel: "managed_python_package",
      pythonSupportsLatestStable: expect.any(Boolean),
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
      resolvePinnedDownloaderRelease: vi.fn(() => ({ version: "1.32.0-dev:2026.04.01" })),
      compareLooseVersions: vi.fn(),
    });

    expect(info).toMatchObject({
      current: "missing",
      latest: "1.32.0-dev:2026.04.01",
      source: "missing",
      updateChannel: "unavailable",
    });
  });
});
