import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  buildRendererRoute,
  resolveBaseRendererUrl,
  resolveSecondaryWindowAnchorLabel,
  resolveSecondaryWindowGap,
  resolveSecondaryWindowOpenOptions,
  secondaryWindowRoute,
} from "./windowRouting.mjs";

const labels = {
  main: "main",
  settings: "settings",
  contextMenu: "context-menu",
  uiLab: "ui-lab",
};

const createWindow = (bounds = {
  x: 100,
  y: 120,
  width: 200,
  height: 180,
}, destroyed = false) => ({
  isDestroyed: vi.fn(() => destroyed),
  getBounds: vi.fn(() => bounds),
});

describe("renderer routes", () => {
  it("uses dev-server env URLs without trailing slashes", () => {
    expect(resolveBaseRendererUrl({
      AMEOW_FRONTEND_URL: "http://localhost:3000/",
      AMEOW_ELECTRON_DEV_SERVER_URL: "http://localhost:1420/",
    })).toBe("http://localhost:3000");
    expect(resolveBaseRendererUrl({})).toBe("http://127.0.0.1:1420");
  });

  it("builds dev and packaged renderer hash routes", () => {
    expect(buildRendererRoute("settings", {
      isPackaged: false,
      repoRoot: "/repo",
      env: { AMEOW_ELECTRON_DEV_SERVER_URL: "http://localhost:1420/" },
    })).toBe("http://localhost:1420#/settings");

    expect(buildRendererRoute("/settings", {
      isPackaged: true,
      repoRoot: "/repo",
      env: {},
    })).toBe(`${pathToFileURL(join("/repo", "dist", "index.html")).toString()}#/settings`);
  });
});

describe("secondary window routing", () => {
  it("maps supported secondary window labels to renderer routes", () => {
    expect(secondaryWindowRoute("settings", labels)).toBe("/settings");
    expect(secondaryWindowRoute("context-menu", labels)).toBe("/context-menu");
    expect(secondaryWindowRoute("ui-lab", labels)).toBe("/ui-lab");
    expect(() => secondaryWindowRoute("main", labels)).toThrow("Unsupported secondary window label");
  });

  it("resolves anchor labels based on available windows", () => {
    expect(resolveSecondaryWindowAnchorLabel("settings", {
      labels,
      getWindow: vi.fn(),
    })).toBe("main");

    expect(resolveSecondaryWindowAnchorLabel("ui-lab", {
      labels,
      getWindow: vi.fn(() => createWindow()),
    })).toBe("settings");

    expect(resolveSecondaryWindowAnchorLabel("ui-lab", {
      labels,
      getWindow: vi.fn(() => createWindow(undefined, true)),
    })).toBe("main");
  });

  it("uses ui lab gap only for ui lab windows", () => {
    expect(resolveSecondaryWindowGap("ui-lab", {
      labels,
      settingsGap: 16,
      uiLabGap: 20,
    })).toBe(20);
    expect(resolveSecondaryWindowGap("settings", {
      labels,
      settingsGap: 16,
      uiLabGap: 20,
    })).toBe(16);
  });
});

describe("secondary window placement", () => {
  const baseOptions = {
    labels,
    getWindow: vi.fn((label: string) => (label === "main" ? createWindow() : null)),
    getDisplayWorkArea: vi.fn(() => ({
      x: 0,
      y: 0,
      width: 1000,
      height: 800,
    })),
    settingsGap: 16,
    uiLabGap: 20,
    edgePadding: 8,
  };

  it("bypasses anchored placement when explicit position or center is supplied", () => {
    expect(resolveSecondaryWindowOpenOptions("settings", {
      width: 300,
      height: 400,
      x: 10,
    }, baseOptions)).toEqual({
      width: 300,
      height: 400,
      x: 10,
    });

    expect(resolveSecondaryWindowOpenOptions("settings", {
      width: 300,
      height: 400,
      center: true,
    }, baseOptions)).toEqual({
      width: 300,
      height: 400,
      center: true,
    });
  });

  it("places settings to the right of the main window when space allows", () => {
    expect(resolveSecondaryWindowOpenOptions("settings", {
      width: 300,
      height: 400,
      title: "Settings",
    }, baseOptions)).toEqual({
      width: 300,
      height: 400,
      title: "Settings",
      center: false,
      x: 316,
      y: 120,
    });
  });

  it("flips left and clamps to the work area when right side lacks space", () => {
    const options = {
      ...baseOptions,
      getWindow: vi.fn(() => createWindow({
        x: 760,
        y: -20,
        width: 220,
        height: 180,
      })),
      getDisplayWorkArea: vi.fn(() => ({
        x: 0,
        y: 0,
        width: 1000,
        height: 600,
      })),
    };

    expect(resolveSecondaryWindowOpenOptions("settings", {
      width: 300,
      height: 400,
    }, options)).toEqual({
      width: 300,
      height: 400,
      center: false,
      x: 444,
      y: 8,
    });
  });

  it("returns original options when no usable anchor exists", () => {
    expect(resolveSecondaryWindowOpenOptions("context-menu", {
      width: 200,
      height: 100,
    }, baseOptions)).toEqual({
      width: 200,
      height: 100,
    });

    expect(resolveSecondaryWindowOpenOptions("settings", {
      width: 200,
      height: 100,
    }, {
      ...baseOptions,
      getWindow: vi.fn(() => null),
    })).toEqual({
      width: 200,
      height: 100,
    });
  });
});
