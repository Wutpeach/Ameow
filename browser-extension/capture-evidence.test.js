import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const helperPath = path.resolve("browser-extension/capture-evidence.js");
const helperSource = readFileSync(helperPath, "utf8");

const createElement = (attributes = {}) => ({
  attributes,
  getAttribute(name) {
    return this.attributes[name] ?? null;
  },
  closest(selector) {
    const match = selector.match(/^\[(.+)\]$/);
    if (!match) {
      return null;
    }
    return typeof this.attributes[match[1]] === "string" ? this : null;
  },
});

const loadHelper = (options = {}) => {
  const elements = {
    canonical: createElement({ href: options.canonicalUrl }),
    og: createElement({ content: options.ogUrl }),
  };
  const context = {
    window: null,
    globalThis: {},
    location: { href: options.pageUrl || "https://example.com/watch/123" },
    document: {
      title: options.title || "Example title",
      querySelector(selector) {
        if (selector === 'link[rel="canonical"]') {
          return elements.canonical;
        }
        if (selector === 'meta[property="og:url"], meta[name="og:url"]') {
          return elements.og;
        }
        return null;
      },
    },
    URL,
  };
  context.window = context;
  context.Element = function Element() {};
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.window.AmeowCaptureEvidence;
};

describe("capture evidence helper", () => {
  it("extracts Douyin modal ids from current page urls", () => {
    const helper = loadHelper({
      pageUrl: "https://www.douyin.com/jingxuan?modal_id=7637912431158644014",
    });

    expect(helper.buildCurrentContentPayload()).toMatchObject({
      type: "video_selection",
      url: "https://www.douyin.com/jingxuan?modal_id=7637912431158644014",
      pageUrl: "https://www.douyin.com/jingxuan?modal_id=7637912431158644014",
      selectionScope: "current_item",
      extensionData: {
        ameowCapture: {
          version: 1,
          action: "current_content",
          pageUrl: "https://www.douyin.com/jingxuan?modal_id=7637912431158644014",
          contentIds: {
            modal_id: "7637912431158644014",
          },
        },
      },
    });
  });

  it("captures canonical and Open Graph URLs as raw evidence", () => {
    const helper = loadHelper({
      pageUrl: "https://example.com/modal?id=1",
      canonicalUrl: "https://example.com/video/123456789012345",
      ogUrl: "https://example.com/video/123456789012346",
    });

    expect(helper.buildCurrentContentPayload()?.extensionData.ameowCapture).toMatchObject({
      canonicalUrl: "https://example.com/video/123456789012345",
      ogUrl: "https://example.com/video/123456789012346",
    });
  });

  it("uses direct picked href as the interaction anchor", () => {
    const helper = loadHelper({
      pageUrl: "https://example.com/feed",
    });
    const target = createElement({ href: "https://example.com/post/42" });

    expect(helper.buildPickDownloadPayload(target)).toMatchObject({
      type: "video_selection",
      url: "https://example.com/post/42",
      pageUrl: "https://example.com/feed",
      extensionData: {
        ameowCapture: {
          action: "pick_download",
          targetHref: "https://example.com/post/42",
        },
      },
    });
  });
});
