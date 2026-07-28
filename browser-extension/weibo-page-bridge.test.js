import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const bridgePath = path.resolve("browser-extension/weibo-page-bridge.js");
const bridgeSource = readFileSync(bridgePath, "utf8");

function loadBridge(currentUrl = "https://weibo.com/detail/N12345") {
  const window = {
    location: {
      href: currentUrl,
      hostname: new URL(currentUrl).hostname,
    },
    postMessage() {},
  };
  const context = {
    window,
    globalThis: {},
    URL,
    Date,
    Map,
    Number,
    Math,
  };
  vm.runInNewContext(bridgeSource, context, { filename: bridgePath });
  return context.window.AmeowWeiboPageBridgeTestHooks;
}

describe("Weibo page bridge", () => {
  it("extracts bounded sanitized variant records from Weibo API JSON", () => {
    const hooks = loadBridge();
    const records = hooks.collectVariantRecords({
      ok: 1,
      data: {
        mblogid: "N12345",
        page_info: {
          media_info: {
            playback_list: [
              {
                play_info: {
                  url: "https://f.video.weibocdn.com/api-720.mp4",
                  quality_index: 720,
                  label: "720p",
                  height: 720,
                },
              },
              {
                play_info: {
                  url: "https://f.video.weibocdn.com/api-1080.mp4",
                  quality_index: 1080,
                  label: "1080p",
                  height: 1080,
                },
              },
            ],
          },
        },
      },
    }, "https://weibo.com/ajax/statuses/show?id=N12345");

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      statusId: "N12345",
      pageUrl: "https://weibo.com/detail/N12345",
    });
    expect(records[0].variants.map((variant) => ({
      url: variant.url,
      label: variant.label,
      source: variant.source,
    }))).toEqual([
      {
        url: "https://f.video.weibocdn.com/api-1080.mp4",
        label: "1080p",
        source: "weibo_api_observer",
      },
      {
        url: "https://f.video.weibocdn.com/api-720.mp4",
        label: "720p",
        source: "weibo_api_observer",
      },
    ]);
  });

  it("does not publish whole response bodies in collected records", () => {
    const hooks = loadBridge();
    const records = hooks.collectVariantRecordsFromText(JSON.stringify({
      data: {
        mblogid: "N12345",
        secretText: "this should not cross the page bridge",
        media_info: {
          playback_list: [
            { play_info: { url: "https://f.video.weibocdn.com/api-720.mp4", quality_index: 720 } },
          ],
        },
      },
    }), "https://weibo.com/ajax/statuses/show?id=N12345");

    expect(JSON.stringify(records)).not.toContain("secretText");
    expect(JSON.stringify(records)).not.toContain("this should not cross the page bridge");
    expect(records[0].variants[0].url).toBe("https://f.video.weibocdn.com/api-720.mp4");
  });

  it("does not let nested recommendation variants inherit the current status id", () => {
    const hooks = loadBridge("https://weibo.com/?layerid=5325359253553495");
    const records = hooks.collectVariantRecords({
      ok: 1,
      data: {
        id: "5325359253553495",
        page_info: {
          media_info: {
            playback_list: [
              { play_info: { url: "https://f.video.weibocdn.com/current-720.mp4", quality_index: 720 } },
              { play_info: { url: "https://f.video.weibocdn.com/current-1080.mp4", quality_index: 1080 } },
            ],
          },
        },
        recommend_feed: [
          {
            page_info: {
              media_info: {
                playback_list: [
                  { play_info: { url: "https://f.video.weibocdn.com/recommend-480.mp4", quality_index: 480 } },
                  { play_info: { url: "https://f.video.weibocdn.com/recommend-720.mp4", quality_index: 720 } },
                ],
              },
            },
          },
        ],
      },
    }, "https://weibo.com/ajax/statuses/show?id=5325359253553495");

    const currentRecord = records.find((record) => record.statusId === "5325359253553495");

    expect(currentRecord?.variants.map((variant) => variant.url)).toEqual([
      "https://f.video.weibocdn.com/current-1080.mp4",
      "https://f.video.weibocdn.com/current-720.mp4",
    ]);
    expect(JSON.stringify(records)).not.toContain("recommend-480.mp4");
    expect(JSON.stringify(records)).not.toContain("recommend-720.mp4");
  });
});
