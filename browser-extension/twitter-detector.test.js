import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const detectorPath = path.resolve("browser-extension/twitter-detector.js");
const detectorSource = readFileSync(detectorPath, "utf8");

function loadDetector() {
  let messageListener = null;
  const window = {
    location: {
      href: "https://x.com/flowselect/status/1234567890?t=1",
    },
  };

  const context = {
    window,
    self: {},
    globalThis: {},
    URL,
    console,
    MutationObserver: class MutationObserver {
      observe() {}
      disconnect() {}
    },
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
      readyState: "complete",
      title: "FlowSelect on X",
      addEventListener() {},
      querySelectorAll() {
        return [];
      },
      body: {},
    },
  };

  vm.runInNewContext(detectorSource, context, { filename: detectorPath });
  return { messageListener };
}

describe("twitter detector", () => {
  it("responds to pasted video resolution with the canonical status payload", () => {
    const { messageListener } = loadDetector();
    let response = null;

    expect(typeof messageListener).toBe("function");
    const handled = messageListener(
      { type: "flowselect_resolve_pasted_video_selection" },
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
        url: "https://x.com/flowselect/status/1234567890",
        pageUrl: "https://x.com/flowselect/status/1234567890",
        title: "FlowSelect on X",
        selectionScope: "current_item",
      },
    });
  });
});
