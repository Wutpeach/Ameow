import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  MANAGED_PYTHON_PACKAGE_SPECS,
  resolvePinnedManagedPythonPackage as resolvePinnedManagedPythonPackageFromManifest,
} from "./managedPythonPackageManifest.mjs";
import {
  assertPythonVersionSatisfiesManagedPackage,
  currentManagedRuntimeTarget,
  managedDenoPath,
  managedFfmpegPaths,
  managedGalleryDlPath,
  managedPythonVirtualenvArgs,
  managedYtDlpPaths,
  resolvePinnedManagedPythonPackage,
  selectDenoRuntimeArtifactSpec,
  selectFfmpegRuntimeArtifactSpec,
} from "./managedRuntimeBootstrap.mjs";

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
      join("/tmp/ameow-config", "runtimes", "deno", "x86_64-pc-windows-msvc", "real", "deno.exe"),
    );
    expect(managedFfmpegPaths(options)).toEqual({
      ffmpeg: join("/tmp/ameow-config", "runtimes", "ffmpeg", "x86_64-pc-windows-msvc", "real", "ffmpeg.exe"),
      ffprobe: join("/tmp/ameow-config", "runtimes", "ffmpeg", "x86_64-pc-windows-msvc", "real", "ffprobe.exe"),
    });
    expect(managedYtDlpPaths(options).ytDlp).toBe(
      join("/tmp/ameow-config", "runtimes", "yt-dlp", "x86_64-pc-windows-msvc", "venv", "Scripts", "yt-dlp.exe"),
    );
    expect(managedGalleryDlPath(options)).toBe(
      join("/tmp/ameow-config", "runtimes", "gallery-dl", "x86_64-pc-windows-msvc", "venv", "Scripts", "gallery-dl.exe"),
    );
  });

  it("keeps pinned Python downloader package metadata explicit", () => {
    expect(resolvePinnedManagedPythonPackage("yt-dlp")).toMatchObject({
      packageVersion: "2026.07.04",
      installSource: "yt-dlp==2026.07.04",
    });
    expect(resolvePinnedManagedPythonPackage("gallery-dl")).toMatchObject({
      packageVersion: "1.32.1",
      installSource: "gallery-dl==1.32.1",
    });
    expect(() => resolvePinnedManagedPythonPackage("unknown" as never)).toThrow(
      "Unsupported managed Python package tool: unknown",
    );
  });

  it("uses symlink-based Python virtualenv creation on every platform", () => {
    expect(managedPythonVirtualenvArgs("/tmp/ameow-venv")).toEqual([
      "-m",
      "venv",
      "/tmp/ameow-venv",
    ]);
    expect(managedPythonVirtualenvArgs("/tmp/ameow-venv")).not.toContain("--copies");
  });

  it("re-exports the app-owned Python downloader package manifest", () => {
    expect(resolvePinnedManagedPythonPackage).toBe(resolvePinnedManagedPythonPackageFromManifest);
    expect(Object.keys(MANAGED_PYTHON_PACKAGE_SPECS).sort()).toEqual([
      "gallery-dl",
      "yt-dlp",
    ]);
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

  it("rejects bundled Python versions below a managed package minimum", () => {
    expect(() =>
      assertPythonVersionSatisfiesManagedPackage("yt-dlp", "Python 3.11.15", [3, 10, 0]),
    ).not.toThrow();
    expect(() =>
      assertPythonVersionSatisfiesManagedPackage("yt-dlp", "Python 3.9.18", [3, 10, 0]),
    ).toThrow("Bundled Python 3.9.18 is too old for yt-dlp");
    expect(() =>
      assertPythonVersionSatisfiesManagedPackage("gallery-dl", "not-a-version", [3, 8, 0]),
    ).toThrow("Unable to parse bundled Python version for gallery-dl");
  });
});
