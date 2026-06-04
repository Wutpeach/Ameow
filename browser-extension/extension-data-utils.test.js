import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const helperPath = path.resolve("browser-extension/extension-data-utils.js");
const helperSource = readFileSync(helperPath, "utf8");

const loadHelper = () => {
  const context = {
    self: {},
    globalThis: {},
  };
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.self.AmeowExtensionDataUtils;
};

describe("extension data utils", () => {
  it("preserves unknown extension data namespaces", () => {
    const helper = loadHelper();

    expect(helper.normalizeExtensionData({
      ameowCapture: {
        version: 1,
        action: "current_content",
        pageUrl: "https://www.douyin.com/jingxuan?modal_id=7637912431158644014",
        contentIds: {
          modal_id: "7637912431158644014",
        },
      },
    })).toEqual({
      ameowCapture: {
        version: 1,
        action: "current_content",
        pageUrl: "https://www.douyin.com/jingxuan?modal_id=7637912431158644014",
        contentIds: {
          modal_id: "7637912431158644014",
        },
      },
    });
  });

  it("keeps supported YouTube source diagnostics while dropping retired mode hints", () => {
    const helper = loadHelper();

    expect(helper.normalizeExtensionData({
      youtube: {
        force_extended: true,
        allow_cookies: false,
        source: "injected",
        ignored: "value",
      },
      ameowCapture: {
        version: 1,
        action: "pick_download",
        pageUrl: "https://www.youtube.com/watch?v=abc123",
      },
    })).toEqual({
      youtube: {
        source: "injected",
      },
      ameowCapture: {
        version: 1,
        action: "pick_download",
        pageUrl: "https://www.youtube.com/watch?v=abc123",
      },
    });
  });

  it("drops empty or invalid known YouTube hints without dropping valid unknown data", () => {
    const helper = loadHelper();

    expect(helper.normalizeExtensionData({
      youtube: {
        source: "unknown",
        ignored: "value",
      },
      ameowCapture: {
        version: 1,
        action: "current_content",
        pageUrl: "https://example.com/watch",
      },
    })).toEqual({
      ameowCapture: {
        version: 1,
        action: "current_content",
        pageUrl: "https://example.com/watch",
      },
    });
  });
});
