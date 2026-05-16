import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import {
  APP_RELEASES_API,
  APP_STABLE_UPDATE_ENDPOINT,
  resolveLatestPrereleaseUpdateManifestUrlFromReleases,
  shouldReceivePrereleaseAppUpdates,
} from "./appUpdate.mjs";
import { buildGitHubHeaders, downloadToFile } from "./appUpdateDownload.mjs";

type AppUpdateManifest = {
  version?: unknown;
  notes?: unknown;
  pub_date?: unknown;
  platforms?: {
    "windows-x86_64"?: {
      url?: unknown;
    } | null;
  } | null;
};

export type ElectronAppUpdateInfo = {
  current: string;
  latest: string;
  notes: string | null;
  publishedAt: string | null;
};

type AppUpdateControllerOptions = {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  getAppVersion(): string;
  fetch(input: string, init?: RequestInit): Promise<Response>;
  readConfigObject(): Promise<Record<string, unknown>>;
  compareAppVersions(left: string, right: string): number;
  normalizeVersionString(value: unknown): string | null;
  openPath(path: string): Promise<string>;
  prepareToQuit(): void;
};

export const createAppUpdateController = (options: AppUpdateControllerOptions) => {
  let pendingAppUpdate: AppUpdateManifest | null = null;

  const fetchLatestPrereleaseUpdateManifestUrl = async (): Promise<string | null> => {
    const response = await options.fetch(APP_RELEASES_API, {
      headers: buildGitHubHeaders(),
    });
    if (!response.ok) {
      throw new Error(`GitHub prerelease lookup failed: ${response.status}`);
    }

    const releases = await response.json();
    return resolveLatestPrereleaseUpdateManifestUrlFromReleases(releases);
  };

  const resolveAppUpdateManifestUrl = async (): Promise<string> => {
    const config = await options.readConfigObject();
    if (!shouldReceivePrereleaseAppUpdates(config)) {
      return APP_STABLE_UPDATE_ENDPOINT;
    }

    const prereleaseManifestUrl = await fetchLatestPrereleaseUpdateManifestUrl();
    if (prereleaseManifestUrl) {
      return prereleaseManifestUrl;
    }

    console.warn(">>> [Electron] No prerelease updater manifest found; falling back to stable updates");
    return APP_STABLE_UPDATE_ENDPOINT;
  };

  return {
    async checkForAppUpdate(): Promise<ElectronAppUpdateInfo | null> {
      if (options.platform !== "win32" || !options.isPackaged) {
        pendingAppUpdate = null;
        return null;
      }

      try {
        const manifestUrl = await resolveAppUpdateManifestUrl();
        const response = await options.fetch(manifestUrl);
        if (!response.ok) {
          throw new Error(`Update manifest lookup failed: ${response.status}`);
        }
        const manifest = await response.json() as AppUpdateManifest;
        const nextVersion = options.normalizeVersionString(manifest?.version);
        const currentVersion = options.normalizeVersionString(options.getAppVersion());
        if (
          !nextVersion
          || !currentVersion
          || options.compareAppVersions(nextVersion, currentVersion) <= 0
        ) {
          pendingAppUpdate = null;
          return null;
        }
        pendingAppUpdate = manifest;
        return {
          current: currentVersion,
          latest: nextVersion,
          notes: typeof manifest.notes === "string" ? manifest.notes : null,
          publishedAt: typeof manifest.pub_date === "string" ? manifest.pub_date : null,
        };
      } catch (error) {
        console.error(">>> [Electron] App update check failed:", error);
        pendingAppUpdate = null;
        return null;
      }
    },
    async downloadAndInstallAppUpdate(): Promise<never> {
      if (!pendingAppUpdate) {
        throw new Error("No pending Electron app update is available");
      }

      const platformEntry = pendingAppUpdate?.platforms?.["windows-x86_64"];
      const installerUrl = typeof platformEntry?.url === "string" ? platformEntry.url.trim() : "";
      if (!installerUrl) {
        throw new Error("Update manifest does not include a Windows installer URL");
      }

      const parsedUrl = new URL(installerUrl);
      const installerFileName = basename(parsedUrl.pathname) || "Ameow_update_installer.exe";
      const downloadDir = await mkdtemp(join(tmpdir(), "ameow-app-update-"));
      const installerPath = join(downloadDir, installerFileName);
      await downloadToFile(installerUrl, installerPath, {
        fetch: options.fetch,
        headers: buildGitHubHeaders(),
      });

      const openResult = await options.openPath(installerPath);
      if (openResult) {
        throw new Error(`Failed to open installer: ${openResult}`);
      }

      options.prepareToQuit();
      return new Promise<never>(() => {});
    },
  };
};
