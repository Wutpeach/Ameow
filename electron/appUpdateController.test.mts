import { describe, expect, it, vi } from "vitest";

import { APP_RELEASES_API, APP_STABLE_UPDATE_ENDPOINT } from "./appUpdate.mjs";
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
});
