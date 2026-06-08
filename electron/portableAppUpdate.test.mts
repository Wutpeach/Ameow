import { describe, expect, it, vi } from "vitest";
import { join, resolve } from "node:path";

import {
  PORTABLE_MARKER_FILE_NAME,
  assertValidPortableRoot,
  buildPortableUpdatePaths,
  createPortableUpdateHelperScript,
  parsePortableAppUpdateEntry,
  resolveWindowsAppInstallMode,
} from "./portableAppUpdate.mjs";

describe("portable app update helpers", () => {
  it("parses a valid portable manifest entry", () => {
    expect(parsePortableAppUpdateEntry({
      portable: {
        "windows-x86_64": {
          url: "https://example.invalid/Ameow_0.3.1_windows_x64_portable.zip",
          sha256: "A".repeat(64),
          rootDir: "Ameow_portable",
        },
      },
    })).toEqual({
      url: "https://example.invalid/Ameow_0.3.1_windows_x64_portable.zip",
      sha256: "a".repeat(64),
      rootDir: "Ameow_portable",
    });
  });

  it("rejects portable manifest entries without a valid sha256", () => {
    expect(parsePortableAppUpdateEntry({
      portable: {
        "windows-x86_64": {
          url: "https://example.invalid/Ameow.zip",
          sha256: "abc",
        },
      },
    })).toBeNull();
  });

  it("detects portable mode from the explicit marker", () => {
    const executablePath = "D:\\Apps\\Ameow_portable\\Ameow.exe";
    const markerPath = join("D:\\Apps\\Ameow_portable", PORTABLE_MARKER_FILE_NAME);
    expect(resolveWindowsAppInstallMode({
      platform: "win32",
      isPackaged: true,
      executablePath,
      markerExists: (path) => path === markerPath,
    })).toBe("portable");
  });

  it("does not infer portable mode from packaged state alone", () => {
    expect(resolveWindowsAppInstallMode({
      platform: "win32",
      isPackaged: true,
      executablePath: "C:\\Users\\mabel\\AppData\\Local\\Programs\\Ameow\\Ameow.exe",
      markerExists: () => false,
    })).toBe("installed");
  });

  it("validates the portable marker before allowing update operations", () => {
    const root = "D:\\Apps\\Ameow_portable";
    expect(() => assertValidPortableRoot(root, {
      markerExists: (path) => path === join(root, PORTABLE_MARKER_FILE_NAME),
      env: {
        USERPROFILE: "C:\\Users\\mabel",
        ProgramFiles: "C:\\Program Files",
        "ProgramFiles(x86)": "C:\\Program Files (x86)",
      },
    })).not.toThrow();

    expect(() => assertValidPortableRoot(root, {
      markerExists: () => false,
      env: {},
    })).toThrow("Portable update marker is missing");
  });

  it("rejects dangerous portable roots", () => {
    expect(() => assertValidPortableRoot("C:\\", {
      markerExists: () => true,
      env: {},
    })).toThrow("Portable update root is unsafe");

    expect(() => assertValidPortableRoot("C:\\Program Files\\Ameow", {
      markerExists: () => true,
      env: { ProgramFiles: "C:\\Program Files" },
    })).toThrow("Portable update root cannot be inside");
  });

  it("builds staging paths beside the live portable root", () => {
    const paths = buildPortableUpdatePaths("D:\\Tools\\Ameow_portable", "Ameow_portable", "test");
    expect(paths.liveRoot).toBe(resolve("D:\\Tools\\Ameow_portable"));
    expect(paths.stagingParent).toBe(resolve("D:\\Tools\\.ameow-update-staging-test"));
    expect(paths.stagingRoot).toBe(resolve("D:\\Tools\\.ameow-update-staging-test\\Ameow_portable"));
    expect(paths.backupRoot).toBe(resolve("D:\\Tools\\Ameow_portable.ameow-backup-test"));
  });

  it("generates a PowerShell 5.1-compatible helper shape", () => {
    const script = createPortableUpdateHelperScript();
    expect(script).toContain("Set-StrictMode -Version 2.0");
    expect(script).toContain("Wait-ForExpectedProcessExit");
    expect(script).toContain("Invoke-RenameWithRetry");
    expect(script).not.toContain("&&");
    expect(script).not.toContain("||");
  });
});
