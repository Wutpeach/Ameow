import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const helperPath = path.resolve("browser-extension/action-icon-indicator.js");
const helperSource = readFileSync(helperPath, "utf8");

const loadHelper = () => {
  const context = {
    self: {},
    globalThis: {},
  };
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.self.AmeowActionIconIndicator;
};

describe("action icon indicator helper", () => {
  it("uses connected dot icon paths for the connected state", () => {
    const helper = loadHelper();

    expect(helper.resolveActionIndicatorState("connected")).toEqual({
      badgeText: "",
      iconPath: {
        16: "icons/icon16-connected-dot.png",
        48: "icons/icon48-connected-dot.png",
        128: "icons/icon128-connected-dot.png",
      },
    });
  });

  it("uses offline dot icon paths and keeps badge text empty for offline state", () => {
    const helper = loadHelper();

    expect(helper.resolveActionIndicatorState("offline")).toEqual({
      badgeText: "",
      iconPath: {
        16: "icons/icon16-offline-dot.png",
        48: "icons/icon48-offline-dot.png",
        128: "icons/icon128-offline-dot.png",
      },
    });
  });

  it("normalizes unknown states to offline", () => {
    const helper = loadHelper();

    expect(helper.resolveActionIndicatorState("connecting")).toEqual(helper.resolveActionIndicatorState("offline"));
    expect(helper.normalizeConnectionState("connected")).toBe("connected");
    expect(helper.normalizeConnectionState("connecting")).toBe("offline");
  });

  it("references existing connection status icon assets", () => {
    const helper = loadHelper();

    for (const iconPaths of Object.values(helper.CONNECTION_ICON_PATHS)) {
      for (const iconPath of Object.values(iconPaths)) {
        expect(existsSync(path.resolve("browser-extension", iconPath))).toBe(true);
      }
    }
  });
});
