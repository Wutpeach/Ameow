import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const helperPath = path.resolve("browser-extension/launcher-config.js");
const helperSource = readFileSync(helperPath, "utf8");

const loadHelper = () => {
  const context = {
    self: {},
    globalThis: {},
    URL,
  };
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.self.AmeowLauncherConfig;
};

describe("launcher config helper", () => {
  it("normalizes launcher config defaults and bounds", () => {
    const helper = loadHelper();

    expect(helper.normalizeConfig({
      enabled: false,
      side: "top",
      verticalPosition: 99,
      locked: true,
      disabledSitePatterns: ["douyin.com", "", 123, "www.instagram.com"],
    })).toEqual({
      enabled: false,
      side: "right",
      verticalPosition: 0.9,
      locked: true,
      disabledSitePatterns: ["douyin.com", "www.instagram.com"],
    });
  });

  it("matches disabled site patterns by host and subdomain", () => {
    const helper = loadHelper();
    const config = helper.normalizeConfig({
      disabledSitePatterns: ["douyin.com"],
    });

    expect(helper.isSiteDisabled(config, "https://www.douyin.com/jingxuan")).toBe(true);
    expect(helper.isSiteDisabled(config, "https://douyin.com/video/1")).toBe(true);
    expect(helper.isSiteDisabled(config, "https://example.com")).toBe(false);
  });

  it("adds and removes disabled site host patterns", () => {
    const helper = loadHelper();
    const hidden = helper.addDisabledSitePattern(
      helper.normalizeConfig(),
      "https://www.douyin.com/jingxuan",
    );

    expect(hidden.disabledSitePatterns).toContain("www.douyin.com");
    expect(helper.removeDisabledSitePattern(hidden, "https://www.douyin.com/video/1")).toMatchObject({
      disabledSitePatterns: [],
    });
  });

  it("manages hidden sites and position from popup-safe helpers", () => {
    const helper = loadHelper();
    const config = helper.normalizeConfig({
      side: "left",
      verticalPosition: 0.31,
      disabledSitePatterns: ["www.douyin.com", "instagram.com"],
    });

    expect(helper.removeDisabledPatternValue(config, "www.douyin.com")).toMatchObject({
      disabledSitePatterns: ["instagram.com"],
    });
    expect(helper.clearDisabledSitePatterns(config)).toMatchObject({
      disabledSitePatterns: [],
    });
    expect(helper.setSide(config, "right")).toMatchObject({
      side: "right",
      verticalPosition: 0.31,
    });
    expect(helper.resetPosition(config)).toMatchObject({
      side: "right",
      verticalPosition: 0.62,
      disabledSitePatterns: ["www.douyin.com", "instagram.com"],
    });
  });
});
