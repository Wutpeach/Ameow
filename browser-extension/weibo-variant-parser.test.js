import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const parserPath = path.resolve("browser-extension/weibo-variant-parser.js");
const parserSource = readFileSync(parserPath, "utf8");

function createDocument({ scripts = [], title = "Weibo title", meta = {} } = {}) {
  return {
    title,
    querySelector(selector) {
      const content = meta[selector];
      return content
        ? {
            getAttribute(name) {
              return name === "content" ? content : null;
            },
          }
        : null;
    },
    querySelectorAll(selector) {
      if (selector === "script") {
        return scripts.map((textContent) => ({ textContent }));
      }
      return [];
    },
  };
}

function loadParser(currentUrl = "https://weibo.com/detail/N12345") {
  const window = {
    location: {
      href: currentUrl,
    },
    AmeowGenericVideoSelectionUtils: {
      normalizeHttpUrl(raw, baseUrl = currentUrl) {
        if (typeof raw !== "string") {
          return null;
        }
        try {
          const resolved = new URL(raw.trim(), baseUrl).toString();
          return /^https?:\/\//i.test(resolved) ? resolved : null;
        } catch {
          return null;
        }
      },
    },
  };
  const context = {
    window,
    globalThis: {},
    URL,
    console,
    Map,
    Set,
    Array,
    Number,
    Math,
  };
  vm.runInNewContext(parserSource, context, { filename: parserPath });
  return context.window.AmeowWeiboVariantParserTestHooks;
}

describe("Weibo variant parser", () => {
  it("extracts and ranks playback_list variants from page-local script data", () => {
    const hooks = loadParser();
    const document = createDocument({
      scripts: [
        `window.__WEIBO_DETAIL__ = {
          "status": {
            "id": "N12345",
            "page_info": {
              "media_info": {
                "playback_list": [
                  { "play_info": { "url": "https://f.video.weibocdn.com/video-720.mp4", "quality_index": 720, "label": "720p", "width": 1280, "height": 720 } },
                  { "play_info": { "url": "https://f.video.weibocdn.com/video-1080.mp4", "quality_index": 1080, "label": "1080p", "width": 1920, "height": 1080 } }
                ]
              }
            }
          }
        };`,
      ],
      meta: {
        'meta[property="og:title"]': "Expected Weibo Video_微博",
        'meta[property="og:image"]': "https://wx1.sinaimg.cn/large/cover.jpg",
      },
    });

    const candidates = hooks.buildWeiboCandidates({ document, pageUrl: "https://weibo.com/detail/N12345" });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      source: "site_extractor",
      type: "weibo_variants",
      siteHint: "weibo",
      groupId: "weibo:N12345",
      title: "Expected Weibo Video",
      preferredVariantUrl: "https://f.video.weibocdn.com/video-1080.mp4",
      preferredVariantLabel: "1080p",
    });
    expect(candidates[0].variants.map((variant) => variant.label)).toEqual(["1080p", "720p"]);
  });

  it("returns no candidates when page-local data exposes no variants", () => {
    const hooks = loadParser();
    const document = createDocument({
      scripts: [`window.__WEIBO_DETAIL__ = { "status": { "text": "no video here" } };`],
    });

    expect(hooks.buildWeiboCandidates({ document, pageUrl: "https://weibo.com/detail/N12345" })).toEqual([]);
  });

  it("builds grouped candidates from observed API variants when DOM scripts expose none", () => {
    const hooks = loadParser();
    const document = createDocument({
      scripts: [`window.__WEIBO_DETAIL__ = { "status": { "text": "api variants only" } };`],
      meta: {
        'meta[property="og:title"]': "Observed API Video_微博",
      },
    });

    hooks.upsertObservedVariantRecords([
      {
        statusId: "N12345",
        pageUrl: "https://weibo.com/detail/N12345",
        variants: [
          { url: "https://f.video.weibocdn.com/api-720.mp4", qualityIndex: 720, label: "720p", height: 720 },
          { url: "https://f.video.weibocdn.com/api-1080.mp4", qualityIndex: 1080, label: "1080p", height: 1080 },
        ],
      },
    ]);

    const candidates = hooks.buildWeiboCandidates({ document, pageUrl: "https://weibo.com/detail/N12345" });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      source: "site_extractor",
      type: "weibo_variants",
      siteHint: "weibo",
      title: "Observed API Video",
      preferredVariantUrl: "https://f.video.weibocdn.com/api-1080.mp4",
      preferredVariantLabel: "1080p",
    });
    expect(candidates[0].variants.map((variant) => variant.label)).toEqual(["1080p", "720p"]);
    expect(candidates[0].variants.map((variant) => variant.source)).toEqual([
      "weibo_api_observer",
      "weibo_api_observer",
    ]);
  });

  it("filters observed API variants to the current Weibo status id", () => {
    const hooks = loadParser("https://weibo.com/?layerid=5325359253553495");
    const document = createDocument({
      scripts: [`window.__WEIBO_DETAIL__ = { "status": { "text": "api variants only" } };`],
    });

    hooks.upsertObservedVariantRecords([
      {
        statusId: "5325359253553495",
        pageUrl: "https://weibo.com/detail/5325359253553495",
        variants: [
          { url: "https://f.video.weibocdn.com/current-720.mp4", qualityIndex: 720, label: "720p" },
          { url: "https://f.video.weibocdn.com/current-1080.mp4", qualityIndex: 1080, label: "1080p" },
        ],
      },
      {
        statusId: "9999999999999999",
        pageUrl: "https://weibo.com/detail/9999999999999999",
        variants: [
          { url: "https://f.video.weibocdn.com/recommend-480.mp4", qualityIndex: 480, label: "480p" },
          { url: "https://f.video.weibocdn.com/recommend-720.mp4", qualityIndex: 720, label: "720p" },
        ],
      },
      {
        groupKey: "unscoped-response",
        variants: [
          { url: "https://f.video.weibocdn.com/unscoped-360.mp4", qualityIndex: 360, label: "360p" },
        ],
      },
    ]);

    const candidates = hooks.buildWeiboCandidates({ document, pageUrl: "https://weibo.com/?layerid=5325359253553495" });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].variants.map((variant) => variant.url)).toEqual([
      "https://f.video.weibocdn.com/current-1080.mp4",
      "https://f.video.weibocdn.com/current-720.mp4",
    ]);
  });

  it("filters DOM script variants to the current Weibo status id", () => {
    const hooks = loadParser("https://weibo.com/?layerid=5325359253553495");
    const document = createDocument({
      scripts: [
        `window.__WEIBO_DETAIL__ = {
          "statuses": [
            {
              "id": "5325359253553495",
              "page_info": {
                "media_info": {
                  "playback_list": [
                    { "play_info": { "url": "https://f.video.weibocdn.com/current-720.mp4", "quality_index": 720, "label": "720p" } },
                    { "play_info": { "url": "https://f.video.weibocdn.com/current-1080.mp4", "quality_index": 1080, "label": "1080p" } }
                  ]
                }
              }
            },
            {
              "id": "9999999999999999",
              "page_info": {
                "media_info": {
                  "playback_list": [
                    { "play_info": { "url": "https://f.video.weibocdn.com/recommend-480.mp4", "quality_index": 480, "label": "480p" } },
                    { "play_info": { "url": "https://f.video.weibocdn.com/recommend-720.mp4", "quality_index": 720, "label": "720p" } }
                  ]
                }
              }
            }
          ]
        };`,
      ],
    });

    const candidates = hooks.buildWeiboCandidates({ document, pageUrl: "https://weibo.com/?layerid=5325359253553495" });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].variants.map((variant) => variant.url)).toEqual([
      "https://f.video.weibocdn.com/current-1080.mp4",
      "https://f.video.weibocdn.com/current-720.mp4",
    ]);
  });

  it("does not let nested recommendation DOM variants inherit an outer current status id", () => {
    const hooks = loadParser("https://weibo.com/?layerid=5325359253553495");
    const document = createDocument({
      scripts: [
        `window.__WEIBO_DETAIL__ = {
          "data": {
            "id": "5325359253553495",
            "page_info": {
              "media_info": {
                "playback_list": [
                  { "play_info": { "url": "https://f.video.weibocdn.com/current-720.mp4", "quality_index": 720, "label": "720p" } },
                  { "play_info": { "url": "https://f.video.weibocdn.com/current-1080.mp4", "quality_index": 1080, "label": "1080p" } }
                ]
              }
            },
            "recommend_feed": [
              {
                "page_info": {
                  "media_info": {
                    "playback_list": [
                      { "play_info": { "url": "https://f.video.weibocdn.com/recommend-480.mp4", "quality_index": 480, "label": "480p" } },
                      { "play_info": { "url": "https://f.video.weibocdn.com/recommend-720.mp4", "quality_index": 720, "label": "720p" } }
                    ]
                  }
                }
              }
            ]
          }
        };`,
      ],
    });

    const candidates = hooks.buildWeiboCandidates({ document, pageUrl: "https://weibo.com/?layerid=5325359253553495" });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].variants.map((variant) => variant.url)).toEqual([
      "https://f.video.weibocdn.com/current-1080.mp4",
      "https://f.video.weibocdn.com/current-720.mp4",
    ]);
  });
});
