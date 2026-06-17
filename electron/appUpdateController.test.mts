import { describe, expect, it, vi } from "vitest";

import { APP_RELEASES_API, APP_RELEASES_URL, APP_STABLE_UPDATE_ENDPOINT } from "./appUpdate.mjs";
import { buildGitHubHeaders } from "./appUpdateDownload.mjs";
import { createAppUpdateController } from "./appUpdateController.mjs";

const responseJson = (body: unknown, options: { status?: number } = {}): Response =>
  new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: { "content-type": "application/json" },
  });

const createController = (overrides = {}) => {
  const fetchMock = vi.fn(async () => responseJson({
    version: "0.3.1",
    notes: "Update notes",
    pub_date: "2026-05-16T00:00:00Z",
    platforms: {
      "windows-x86_64": {
        url: "https://example.invalid/Ameow_setup.exe",
      },
    },
  }));
  const options = {
    platform: "win32" as NodeJS.Platform,
    isPackaged: true,
    getAppVersion: vi.fn(() => "0.3.0"),
    fetch: fetchMock,
    readConfigObject: vi.fn(async () => ({})),
    compareAppVersions: vi.fn((left: string, right: string) => left.localeCompare(right)),
    normalizeVersionString: vi.fn((value: unknown) => (
      typeof value === "string" && value.trim() ? value.trim() : null
    )),
    openPath: vi.fn(async () => ""),
    getInstallMode: vi.fn(() => "installed"),
    getExecutablePath: vi.fn(() => "C:\\Users\\mabel\\AppData\\Local\\Programs\\Ameow\\Ameow.exe"),
    getPortableRootPath: vi.fn(() => "C:\\Users\\mabel\\AppData\\Local\\Programs\\Ameow"),
    getCurrentProcessId: vi.fn(() => 1234),
    prepareToQuit: vi.fn(),
    ...overrides,
  };
  return {
    controller: createAppUpdateController(options),
    options,
    fetchMock,
  };
};

describe("createAppUpdateController", () => {
  it("skips update checks outside packaged Windows builds", async () => {
    const { controller, fetchMock } = createController({ isPackaged: false });

    await expect(controller.checkForAppUpdate()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the stable update manifest and stores a pending installer", async () => {
    const { controller, fetchMock } = createController();

    await expect(controller.checkForAppUpdate()).resolves.toEqual({
      current: "0.3.0",
      latest: "0.3.1",
      notes: "Update notes",
      publishedAt: "2026-05-16T00:00:00Z",
      installMode: "installer",
      manualUrl: "https://example.invalid/Ameow_setup.exe",
    });
    expect(fetchMock).toHaveBeenCalledWith(APP_STABLE_UPDATE_ENDPOINT);
  });

  it("uses the latest prerelease manifest when prerelease updates are enabled", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === APP_RELEASES_API) {
        return responseJson([
          {
            prerelease: true,
            draft: false,
            assets: [
              { name: "latest.json", browser_download_url: "https://example.invalid/rc/latest.json" },
            ],
          },
        ]);
      }
      return responseJson({ version: "0.3.1", platforms: {} });
    });
    const { controller } = createController({
      fetch: fetchMock,
      readConfigObject: vi.fn(async () => ({ receivePrereleaseUpdates: true })),
    });

    await controller.checkForAppUpdate();

    expect(fetchMock).toHaveBeenCalledWith(APP_RELEASES_API, {
      headers: buildGitHubHeaders(),
    });
    expect(fetchMock).toHaveBeenCalledWith("https://example.invalid/rc/latest.json");
  });

  it("requires a pending update before downloading an installer", async () => {
    const { controller } = createController();

    await expect(controller.downloadAndInstallAppUpdate()).rejects.toThrow(
      "No pending Electron app update is available",
    );
  });

  it("selects portable update metadata for portable builds", async () => {
    const portableUrl = "https://example.invalid/Ameow_0.3.1_windows_x64_portable.zip";
    const { controller, options } = createController({
      getInstallMode: vi.fn(() => "portable"),
      fetch: vi.fn(async () => responseJson({
        version: "0.3.1",
        notes: "Update notes",
        pub_date: "2026-05-16T00:00:00Z",
        platforms: {
          "windows-x86_64": {
            url: "https://example.invalid/Ameow_setup.exe",
          },
        },
        portable: {
          "windows-x86_64": {
            url: portableUrl,
            sha256: "b".repeat(64),
            rootDir: "Ameow_portable",
          },
        },
      })),
    });

    await expect(controller.checkForAppUpdate()).resolves.toEqual({
      current: "0.3.0",
      latest: "0.3.1",
      notes: "Update notes",
      publishedAt: "2026-05-16T00:00:00Z",
      installMode: "portable",
      manualUrl: portableUrl,
    });
    expect(options.getInstallMode).toHaveBeenCalled();
  });

  it("does not quit when portable helper launch fails", async () => {
    const { controller, options } = createController({
      getInstallMode: vi.fn(() => "portable"),
      performPortableAppUpdate: vi.fn(async () => {
        throw new Error("could not start updater helper");
      }),
      fetch: vi.fn(async () => responseJson({
        version: "0.3.1",
        notes: "Update notes",
        pub_date: "2026-05-16T00:00:00Z",
        platforms: {
          "windows-x86_64": {
            url: "https://example.invalid/Ameow_setup.exe",
          },
        },
        portable: {
          "windows-x86_64": {
            url: "https://example.invalid/Ameow_0.3.1_windows_x64_portable.zip",
            sha256: "c".repeat(64),
            rootDir: "Ameow_portable",
          },
        },
      })),
    });

    await controller.checkForAppUpdate();
    await expect(controller.downloadAndInstallAppUpdate()).rejects.toThrow(
      "could not start updater helper",
    );
    expect(options.prepareToQuit).not.toHaveBeenCalled();
  });

  it("keeps portable builds on a manual fallback when portable metadata is missing", async () => {
    const { controller } = createController({
      getInstallMode: vi.fn(() => "portable"),
    });

    await expect(controller.checkForAppUpdate()).resolves.toEqual({
      current: "0.3.0",
      latest: "0.3.1",
      notes: "Update notes",
      publishedAt: "2026-05-16T00:00:00Z",
      installMode: "manual",
      manualUrl: APP_RELEASES_URL,
    });

    await expect(controller.downloadAndInstallAppUpdate()).rejects.toThrow(
      "valid Windows portable update asset",
    );
  });

  it("preserves a pending update across background no-update checks", async () => {
    let nextVersion = "0.3.1";
    const { controller, options } = createController({
      fetch: vi.fn(async (url: string) => {
        if (url === "https://example.invalid/Ameow_setup.exe") {
          return new Response("installer", { status: 200 });
        }
        return responseJson({
        version: nextVersion,
        notes: "Update notes",
        pub_date: "2026-05-16T00:00:00Z",
        platforms: {
          "windows-x86_64": {
            url: "https://example.invalid/Ameow_setup.exe",
          },
        },
        });
      }),
    });

    await expect(controller.checkForAppUpdate()).resolves.toMatchObject({
      latest: "0.3.1",
      installMode: "installer",
    });

    nextVersion = "0.3.0";
    await expect(controller.checkForAppUpdate({
      preservePendingOnNoUpdate: true,
      preservePendingOnError: true,
    })).resolves.toBeNull();

    void controller.downloadAndInstallAppUpdate();

    await vi.waitFor(() => {
      expect(options.openPath).toHaveBeenCalledWith(expect.stringContaining("Ameow_setup.exe"));
    });
    expect(options.prepareToQuit).toHaveBeenCalled();
  });

  it("preserves a pending update across background check failures", async () => {
    let failLookup = false;
    const { controller, options } = createController({
      fetch: vi.fn(async (url: string) => {
        if (url === "https://example.invalid/Ameow_setup.exe") {
          return new Response("installer", { status: 200 });
        }
        if (failLookup) {
          return responseJson({ error: "rate_limited" }, { status: 500 });
        }
        return responseJson({
          version: "0.3.1",
          notes: "Update notes",
          pub_date: "2026-05-16T00:00:00Z",
          platforms: {
            "windows-x86_64": {
              url: "https://example.invalid/Ameow_setup.exe",
            },
          },
        });
      }),
    });

    await expect(controller.checkForAppUpdate()).resolves.toMatchObject({
      latest: "0.3.1",
      installMode: "installer",
    });

    failLookup = true;
    await expect(controller.checkForAppUpdate({
      preservePendingOnNoUpdate: true,
      preservePendingOnError: true,
    })).resolves.toBeNull();

    void controller.downloadAndInstallAppUpdate();

    await vi.waitFor(() => {
      expect(options.openPath).toHaveBeenCalledWith(expect.stringContaining("Ameow_setup.exe"));
    });
    expect(options.prepareToQuit).toHaveBeenCalled();
  });
});
