import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  createTrayImage,
  createTrayMenuController,
  readNativeLocaleCandidates,
  resolveTrayIconCandidates,
  resolveTrayIconPath,
  resolveTrayLabelsFromDocuments,
} from "./trayMenu.mjs";

const createImage = (overrides = {}) => ({
  isEmpty: vi.fn(() => false),
  resize: vi.fn(function resize() {
    return this;
  }),
  ...overrides,
});

describe("native locale helpers", () => {
  it("filters locale candidates inside app.asar", () => {
    expect(readNativeLocaleCandidates("zh-CN", {
      repoRoot: "/repo",
      resourcesPath: "/Applications/Ameow.app/Contents/Resources/app.asar",
    })).toEqual([
      join("/repo", "locales", "zh-CN", "native.json"),
    ]);
  });

  it("resolves tray labels from selected language, fallback language, then defaults", () => {
    expect(resolveTrayLabelsFromDocuments(
      {
        tray: {
          show: "显示窗口",
        },
      },
      {
        tray: {
          show: "Show Window",
          settings: "Settings",
        },
      },
    )).toEqual({
      show: "显示窗口",
      settings: "Settings",
      quit: "Quit Ameow",
    });
  });
});

describe("tray icon helpers", () => {
  it("prefers Windows ico icons before PNG fallbacks", () => {
    expect(resolveTrayIconCandidates("win32", "/repo")).toEqual([
      join("/repo", "desktop-assets", "icons", "icon.ico"),
      join("/repo", "app-icon.png"),
      join("/repo", "public", "favicon.ico"),
    ]);
  });

  it("prefers app icon before favicon outside Windows", () => {
    expect(resolveTrayIconCandidates("darwin", "/repo")).toEqual([
      join("/repo", "app-icon.png"),
      join("/repo", "public", "favicon.ico"),
    ]);
  });

  it("resolves the first existing tray icon path", () => {
    const exists = vi.fn((path: string) => path.endsWith("app-icon.png"));

    expect(resolveTrayIconPath("win32", "/repo", exists)).toBe(join("/repo", "app-icon.png"));
  });

  it("returns an empty image when no icon path exists", () => {
    const empty = createImage();
    const nativeImage = {
      createEmpty: vi.fn(() => empty),
      createFromPath: vi.fn(),
    };

    expect(createTrayImage({
      platform: "linux",
      repoRoot: "/repo",
      nativeImage,
      macosTrayIconSizePx: 18,
      existsSync: vi.fn(() => false),
    })).toBe(empty);
    expect(nativeImage.createFromPath).not.toHaveBeenCalled();
  });

  it("resizes macOS tray images to the configured template size", () => {
    const image = createImage();
    const nativeImage = {
      createEmpty: vi.fn(),
      createFromPath: vi.fn(() => image),
    };

    expect(createTrayImage({
      platform: "darwin",
      repoRoot: "/repo",
      nativeImage,
      macosTrayIconSizePx: 18,
      existsSync: vi.fn(() => true),
    })).toBe(image);
    expect(image.resize).toHaveBeenCalledWith({ width: 18, height: 18 });
  });
});

describe("createTrayMenuController", () => {
  it("loads locale labels with fallback and wires tray menu callbacks", async () => {
    const readFile = vi.fn(async (path: string) => (
      path.includes("zh-CN")
        ? JSON.stringify({ tray: { show: "显示窗口" } })
        : JSON.stringify({ tray: { show: "Show", settings: "Settings", quit: "Quit" } })
    ));
    const menu = { id: "menu" };
    const Menu = {
      buildFromTemplate: vi.fn(() => menu),
    };
    const tray = {
      on: vi.fn(),
      setContextMenu: vi.fn(),
      setToolTip: vi.fn(),
    };
    const Tray = vi.fn(function TrayMock() {
      return tray;
    });
    const showMainWindow = vi.fn();
    const openSettingsWindow = vi.fn();
    const quitApp = vi.fn();
    const controller = createTrayMenuController({
      repoRoot: "/repo",
      resourcesPath: "/resources",
      platform: "linux",
      fallbackLanguage: "en",
      macosTrayIconSizePx: 18,
      settingsWindow: { width: 360, height: 500 },
      windowLabels: { settings: "settings" },
      readCurrentLanguage: vi.fn(async () => "zh-CN"),
      showMainWindow,
      openSettingsWindow,
      quitApp,
      logLocaleReadError: vi.fn(),
      existsSync: vi.fn(() => true),
      readFile,
      nativeImage: {
        createEmpty: vi.fn(),
        createFromPath: vi.fn(() => createImage()),
      },
      Menu,
      Tray,
    });

    await controller.updateTrayMenu();

    expect(Tray).toHaveBeenCalledTimes(1);
    expect(tray.setToolTip).toHaveBeenCalledWith("Ameow");
    expect(tray.setContextMenu).toHaveBeenCalledWith(menu);
    expect(Menu.buildFromTemplate).toHaveBeenCalledWith([
      expect.objectContaining({ id: "show", label: "显示窗口" }),
      expect.objectContaining({ id: "settings", label: "Settings" }),
      expect.objectContaining({ id: "quit", label: "Quit" }),
    ]);

    const template = Menu.buildFromTemplate.mock.calls[0][0];
    template[0].click();
    template[1].click();
    template[2].click();

    expect(showMainWindow).toHaveBeenCalledTimes(1);
    expect(openSettingsWindow).toHaveBeenCalledWith({
      title: "Settings",
      width: 360,
      height: 500,
      alwaysOnTop: true,
      focus: true,
    });
    expect(quitApp).toHaveBeenCalledTimes(1);
  });

  it("logs invalid locale JSON and continues to hardcoded defaults", async () => {
    const logLocaleReadError = vi.fn();
    const controller = createTrayMenuController({
      repoRoot: "/repo",
      resourcesPath: "/resources",
      platform: "linux",
      fallbackLanguage: "en",
      macosTrayIconSizePx: 18,
      settingsWindow: { width: 360, height: 500 },
      windowLabels: { settings: "settings" },
      readCurrentLanguage: vi.fn(async () => "en"),
      showMainWindow: vi.fn(),
      openSettingsWindow: vi.fn(),
      quitApp: vi.fn(),
      logLocaleReadError,
      existsSync: vi.fn(() => true),
      readFile: vi.fn(async () => "{"),
      nativeImage: {
        createEmpty: vi.fn(() => createImage()),
        createFromPath: vi.fn(),
      },
      Menu: {
        buildFromTemplate: vi.fn(() => ({})),
      },
      Tray: vi.fn(function TrayMock() {
        return {
          on: vi.fn(),
          setContextMenu: vi.fn(),
          setToolTip: vi.fn(),
        };
      }),
    });

    await expect(controller.loadTrayLabels("en")).resolves.toEqual({
      show: "Show Window",
      settings: "Settings",
      quit: "Quit Ameow",
    });
    expect(logLocaleReadError).toHaveBeenCalled();
  });
});
