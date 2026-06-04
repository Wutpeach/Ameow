import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const detectorPath = path.resolve("browser-extension/youtube-detector.js");
const detectorSource = readFileSync(detectorPath, "utf8");

function loadDetector() {
  let messageListener = null;
  const window = {
    location: {
      href: "https://www.youtube.com/watch?v=UBqh6ud5LqY&list=PL123",
      pathname: "/watch",
      search: "?v=UBqh6ud5LqY&list=PL123",
    },
    innerWidth: 1440,
    innerHeight: 900,
    getComputedStyle() {
      return { display: "block", visibility: "visible" };
    },
    addEventListener() {},
    setInterval() {},
  };

  const context = {
    window,
    self: {},
    globalThis: {},
    URL,
    URLSearchParams,
    console,
    Date,
    Math,
    Array,
    Number,
    Map,
    Set,
    Blob,
    navigator: {
      language: "en-US",
      clipboard: {},
    },
    MutationObserver: class MutationObserver {
      observe() {}
      disconnect() {}
    },
    HTMLElement: class HTMLElement {},
    Element: class Element {},
    HTMLVideoElement: class HTMLVideoElement {},
    SVGElement: class SVGElement {},
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            messageListener = listener;
          },
        },
      },
    },
    document: {
      readyState: "loading",
      title: "Ideal Setup for Cline - YouTube",
      addEventListener() {},
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      getElementById() {
        return null;
      },
      body: {},
    },
  };

  vm.runInNewContext(detectorSource, context, { filename: detectorPath });
  return { messageListener };
}

describe("youtube detector", () => {
  it("responds to pasted video resolution with the same current-item payload shape", () => {
    const { messageListener } = loadDetector();
    let response = null;

    expect(typeof messageListener).toBe("function");
    const handled = messageListener(
      { type: "ameow_resolve_pasted_video_selection" },
      {},
      (payload) => {
        response = payload;
      },
    );

    expect(handled).toBe(true);
    expect(response).toEqual({
      success: true,
      payload: {
        type: "video_selection",
        url: "https://www.youtube.com/watch?v=UBqh6ud5LqY",
        pageUrl: "https://www.youtube.com/watch?v=UBqh6ud5LqY&list=PL123",
        title: "Ideal Setup for Cline",
        selectionScope: "current_item",
        extensionData: {
          youtube: {
            source: "injected",
          },
        },
      },
    });
  });
});
