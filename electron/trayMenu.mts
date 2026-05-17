import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { normalizeAppLanguage } from "./startupLanguage.mjs";

type TrayLabels = {
  show: string;
  settings: string;
  quit: string;
};

type NativeImageLike = {
  isEmpty(): boolean;
  resize(options: { width: number; height: number }): NativeImageLike;
};

type NativeImageApi = {
  createEmpty(): NativeImageLike;
  createFromPath(path: string): NativeImageLike;
};

type TrayLike = {
  on(eventName: "click", listener: () => void): void;
  setToolTip(value: string): void;
  setContextMenu(menu: unknown): void;
};

type TrayConstructor = new (image: NativeImageLike) => TrayLike;

type MenuApi = {
  buildFromTemplate(template: unknown[]): unknown;
};

type TrayMenuControllerOptions = {
  repoRoot: string;
  resourcesPath: string;
  platform: NodeJS.Platform;
  fallbackLanguage: string;
  macosTrayIconSizePx: number;
  settingsWindow: {
    width: number;
    height: number;
  };
  windowLabels: {
    settings: string;
  };
  readCurrentLanguage(): Promise<string>;
  showMainWindow(): unknown;
  openSettingsWindow(options: {
    title: string;
    width: number;
    height: number;
    alwaysOnTop: boolean;
    focus: boolean;
  }): unknown;
  quitApp(): void;
  logLocaleReadError(error: unknown): void;
  existsSync?: typeof existsSync;
  readFile?: typeof readFile;
  nativeImage: NativeImageApi;
  Menu: MenuApi;
  Tray: TrayConstructor;
};

export const readNativeLocaleCandidates = (
  language: string,
  options: {
    repoRoot: string;
    resourcesPath: string;
  },
): string[] => {
  const candidates = [
    join(options.repoRoot, "locales", language, "native.json"),
    join(options.resourcesPath, "locales", language, "native.json"),
  ];
  return candidates.filter((candidate) => !candidate.includes("app.asar"));
};

const readPathValue = (document: unknown, path: string[]): string | null => {
  let current = document;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : null;
};

export const resolveTrayLabelsFromDocuments = (
  primary: unknown,
  fallback: unknown,
): TrayLabels => ({
  show: readPathValue(primary, ["tray", "show"])
    || readPathValue(fallback, ["tray", "show"])
    || "Show Window",
  settings: readPathValue(primary, ["tray", "settings"])
    || readPathValue(fallback, ["tray", "settings"])
    || "Settings",
  quit: readPathValue(primary, ["tray", "quit"])
    || readPathValue(fallback, ["tray", "quit"])
    || "Quit Ameow",
});

export const resolveTrayIconCandidates = (
  platform: NodeJS.Platform,
  repoRoot: string,
): string[] => (
  platform === "win32"
    ? [
        join(repoRoot, "desktop-assets", "icons", "icon.ico"),
        join(repoRoot, "app-icon.png"),
        join(repoRoot, "public", "favicon.ico"),
      ]
    : [
        join(repoRoot, "app-icon.png"),
        join(repoRoot, "public", "favicon.ico"),
      ]
);

export const resolveTrayIconPath = (
  platform: NodeJS.Platform,
  repoRoot: string,
  exists: typeof existsSync = existsSync,
): string | null => (
  resolveTrayIconCandidates(platform, repoRoot).find((candidate) => exists(candidate)) ?? null
);

export const createTrayImage = (
  options: {
    platform: NodeJS.Platform;
    repoRoot: string;
    nativeImage: NativeImageApi;
    macosTrayIconSizePx: number;
    existsSync?: typeof existsSync;
  },
): NativeImageLike => {
  const iconPath = resolveTrayIconPath(
    options.platform,
    options.repoRoot,
    options.existsSync ?? existsSync,
  );
  if (!iconPath) {
    return options.nativeImage.createEmpty();
  }

  const image = options.nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    return options.nativeImage.createEmpty();
  }

  if (options.platform !== "darwin") {
    return image;
  }

  return image.resize({
    height: options.macosTrayIconSizePx,
    width: options.macosTrayIconSizePx,
  });
};

export const createTrayMenuController = (options: TrayMenuControllerOptions) => {
  const exists = options.existsSync ?? existsSync;
  const readFileApi = options.readFile ?? readFile;
  let tray: TrayLike | null = null;

  const loadNativeLocaleDocument = async (language: string) => {
    for (const candidate of readNativeLocaleCandidates(language, {
      repoRoot: options.repoRoot,
      resourcesPath: options.resourcesPath,
    })) {
      if (!exists(candidate)) {
        continue;
      }
      try {
        const raw = await readFileApi(candidate, "utf8");
        return JSON.parse(raw as string) as unknown;
      } catch (error) {
        options.logLocaleReadError(error);
      }
    }
    return null;
  };

  const loadTrayLabels = async (language: string): Promise<TrayLabels> => {
    const normalizedLanguage = normalizeAppLanguage(language) ?? options.fallbackLanguage;
    const primary = await loadNativeLocaleDocument(normalizedLanguage);
    const fallback = normalizedLanguage === options.fallbackLanguage
      ? null
      : await loadNativeLocaleDocument(options.fallbackLanguage);
    return resolveTrayLabelsFromDocuments(primary, fallback);
  };

  const createCurrentTrayImage = () => createTrayImage({
    platform: options.platform,
    repoRoot: options.repoRoot,
    nativeImage: options.nativeImage,
    macosTrayIconSizePx: options.macosTrayIconSizePx,
    existsSync: exists,
  });

  const updateTrayMenu = async (startupConfigSnapshot: { language?: string } | null = null) => {
    const language = startupConfigSnapshot?.language ?? await options.readCurrentLanguage();
    const labels = await loadTrayLabels(language);
    const menu = options.Menu.buildFromTemplate([
      {
        id: "show",
        label: labels.show,
        click: () => {
          options.showMainWindow();
        },
      },
      {
        id: "settings",
        label: labels.settings,
        click: () => {
          void options.openSettingsWindow({
            title: labels.settings,
            width: options.settingsWindow.width,
            height: options.settingsWindow.height,
            alwaysOnTop: true,
            focus: true,
          });
        },
      },
      {
        id: "quit",
        label: labels.quit,
        click: () => {
          options.quitApp();
        },
      },
    ]);

    if (!tray) {
      tray = new options.Tray(createCurrentTrayImage());
      tray.on("click", () => {
        options.showMainWindow();
      });
    }

    tray.setToolTip("Ameow");
    tray.setContextMenu(menu);
  };

  return {
    createTrayImage: createCurrentTrayImage,
    get tray() {
      return tray;
    },
    loadNativeLocaleDocument,
    loadTrayLabels,
    updateTrayMenu,
  };
};
