import { readFileSync } from "node:fs";
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
  it("uses overlay icon paths for the sync dot state", () => {
    const helper = loadHelper();

    expect(helper.resolveActionIndicatorState(true)).toEqual({
      badgeText: "",
      iconPath: {
        16: "icons/icon16-sync-dot.png",
        48: "icons/icon48-sync-dot.png",
        128: "icons/icon128-sync-dot.png",
      },
    });
  });

  it("restores base icon paths and keeps badge text empty when hidden", () => {
    const helper = loadHelper();

    expect(helper.resolveActionIndicatorState(false)).toEqual({
      badgeText: "",
      iconPath: {
        16: "icons/icon16.png",
        48: "icons/icon48.png",
        128: "icons/icon128.png",
      },
    });
  });
});
