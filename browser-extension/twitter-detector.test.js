import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { loadContentWithRouter } from "./test-content-router.js";

const detectorPath = path.resolve("browser-extension/twitter-detector.js");
const detectorSource = readFileSync(detectorPath, "utf8");

function loadDetector() {
  const window = {
    location: {
      href: "https://x.com/ameow/status/1234567890?t=1",
    },
  };

  const buildContext = () => ({
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
          addListener() {},
        },
      },
    },
    document: {
      readyState: "complete",
      title: "Ameow on X",
      addEventListener() {},
      querySelectorAll() {
        return [];
      },
      body: {},
    },
  });

  return loadContentWithRouter(detectorSource, detectorPath, buildContext);
}

describe("twitter detector", () => {
  it("responds to pasted video resolution with the canonical status payload", async () => {
    const { handleMessage } = loadDetector();

    const { handled, response } = await handleMessage({ type: "ameow_resolve_pasted_video_selection" });

    expect(handled).toBe(true);
    expect(response).toEqual({
      success: true,
      payload: {
        type: "video_selection",
        url: "https://x.com/ameow/status/1234567890",
        pageUrl: "https://x.com/ameow/status/1234567890",
        title: "Ameow on X",
        selectionScope: "current_item",
      },
    });
  });
});
