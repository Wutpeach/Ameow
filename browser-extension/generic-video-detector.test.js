import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const detectorPath = path.resolve("browser-extension/generic-video-detector.js");
const detectorSource = readFileSync(detectorPath, "utf8");

function createSelectionUtils() {
  return {
    normalizeHttpUrl(raw, baseUrl = "https://example.com/") {
      if (typeof raw !== "string") {
        return null;
      }

      const trimmed = raw.trim();
      if (!trimmed || /^(?:blob|data|file|javascript|mailto):/i.test(trimmed)) {
        return null;
      }

      try {
        const resolved = new URL(trimmed, baseUrl).toString();
        return /^https?:\/\//i.test(resolved) ? resolved : null;
      } catch {
        return null;
      }
    },
    classifyVideoCandidateType() {
      return "indirect_media";
    },
    mergeVideoCandidates(...lists) {
      return lists.flat().filter(Boolean);
    },
    selectPreferredVideoUrl(candidates) {
      return Array.isArray(candidates) && candidates.length > 0
        ? candidates[0].url || null
        : null;
    },
  };
}

function loadDetectorHooks(currentUrl, overrides = {}) {
  const parsedCurrentUrl = new URL(currentUrl);
  let messageListener = null;
  const documentOverride = overrides.document || {};
  const window = {
    location: {
      href: parsedCurrentUrl.toString(),
      pathname: parsedCurrentUrl.pathname,
    },
    innerWidth: 1440,
    innerHeight: 900,
    AmeowDomInjectionUtils: {
      isRenderableElement() {
        return false;
      },
      resolveScopedContentUrl() {
        return null;
      },
      resolveCanonicalUrl() {
        return null;
      },
    },
    AmeowGenericVideoSelectionUtils: createSelectionUtils(),
  };

  const context = {
    window,
    self: {},
    globalThis: {},
    URL,
    console,
    Date,
    Map,
    Set,
    WeakMap,
    Math,
    Array,
    Number,
    Element: class Element {},
    HTMLElement: class HTMLElement {},
    HTMLAnchorElement: class HTMLAnchorElement {},
    HTMLVideoElement: class HTMLVideoElement {},
    MouseEvent: class MouseEvent {},
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            messageListener = listener;
          },
        },
      },
    },
    performance: {
      getEntriesByType() {
        return [];
      },
    },
    document: {
      addEventListener() {},
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      ...documentOverride,
    },
  };

  vm.runInNewContext(detectorSource, context, { filename: detectorPath });
  return {
    hooks: context.window.AmeowGenericVideoDetectorTestHooks,
    messageListener,
  };
}

describe("generic video detector", () => {
  it("normalizes xiaohongshu note urls and strips search params", () => {
    const { hooks } = loadDetectorHooks("https://www.xiaohongshu.com/explore/1234567890abcdef?foo=1");

    expect(
      hooks.normalizeXiaohongshuNoteUrl(
        "https://www.xiaohongshu.com/explore/1234567890abcdef?channel_type=web_feed&xsec_token=abc#note",
      ),
    ).toBe("https://www.xiaohongshu.com/explore/1234567890abcdef");
  });

  it("accepts xiaohongshu profile note urls as canonical note pages", () => {
    const { hooks } = loadDetectorHooks(
      "https://www.xiaohongshu.com/user/profile/64e721f3000000000200c2b9/69d4a1b200000000230214b0?xsec_source=pc_user",
    );

    expect(
      hooks.normalizeXiaohongshuNoteUrl(
        "https://www.xiaohongshu.com/user/profile/64e721f3000000000200c2b9/69d4a1b200000000230214b0?xsec_source=pc_user#hash",
      ),
    ).toBe(
      "https://www.xiaohongshu.com/user/profile/64e721f3000000000200c2b9/69d4a1b200000000230214b0",
    );
  });

  it("does not treat xiaohongshu profile pages as safe route fallbacks", () => {
    const { hooks } = loadDetectorHooks(
      "https://www.xiaohongshu.com/user/profile/5bb2348e1602500001ecb898?channel_type=web_explore_feed",
    );

    expect(
      hooks.shouldAvoidCurrentPageFallback(
        "https://www.xiaohongshu.com/user/profile/5bb2348e1602500001ecb898?channel_type=web_explore_feed",
      ),
    ).toBe(true);

    expect(
      hooks.resolveSelectionPageUrl(
        null,
        "https://sns-video-bd.xhscdn.com/stream/example.mp4",
        "https://www.xiaohongshu.com/user/profile/5bb2348e1602500001ecb898?channel_type=web_explore_feed",
      ),
    ).toBe("https://sns-video-bd.xhscdn.com/stream/example.mp4");
  });

  it("keeps current-page fallback on normal content pages", () => {
    const { hooks } = loadDetectorHooks("https://www.instagram.com/reel/C9abc123/");

    expect(
      hooks.resolveSelectionPageUrl(
        null,
        "https://cdninstagram.com/v/t50.2886-16/example.mp4",
        "https://www.instagram.com/reel/C9abc123/",
      ),
    ).toBe("https://www.instagram.com/reel/C9abc123/");
  });

  it("responds to pasted video resolution messages with requested url fallback", () => {
    const { messageListener } = loadDetectorHooks("https://www.instagram.com/reel/C9abc123/");
    let response = null;

    expect(typeof messageListener).toBe("function");
    const handled = messageListener(
      {
        type: "ameow_resolve_pasted_video_selection",
        requestedSrcUrl: "https://cdninstagram.com/v/t50.2886-16/example.mp4",
      },
      {},
      (payload) => {
        response = payload;
      },
    );

    expect(handled).toBe(true);
    expect(response).toEqual({
      success: true,
      payload: {
        url: "https://cdninstagram.com/v/t50.2886-16/example.mp4",
        pageUrl: "https://www.instagram.com/reel/C9abc123/",
        videoUrl: "https://cdninstagram.com/v/t50.2886-16/example.mp4",
        videoCandidates: [
          {
            url: "https://cdninstagram.com/v/t50.2886-16/example.mp4",
            type: "indirect_media",
            confidence: "medium",
            source: "context_menu_src",
            mediaType: "video",
          },
        ],
        title: "",
        selectionScope: "current_item",
        diagnostics: {
          resolver: "generic_video_detector",
          source: "fallback",
          candidateCount: 1,
        },
      },
    });
  });

  it("collects bounded image candidates for popup media scans", () => {
    const image = {
      currentSrc: "https://cdn.example.com/media/photo.jpg",
      src: "https://cdn.example.com/media/photo.jpg",
      naturalWidth: 1280,
      naturalHeight: 720,
      getAttribute(name) {
        return name === "alt" ? "Hero photo" : null;
      },
      getBoundingClientRect() {
        return { width: 320, height: 180 };
      },
    };
    const smallImage = {
      currentSrc: "https://cdn.example.com/icon.png",
      src: "https://cdn.example.com/icon.png",
      naturalWidth: 32,
      naturalHeight: 32,
      getAttribute() {
        return null;
      },
      getBoundingClientRect() {
        return { width: 32, height: 32 };
      },
    };
    const { hooks } = loadDetectorHooks("https://www.example.com/post/1", {
      document: {
        addEventListener() {},
        querySelector() {
          return null;
        },
        querySelectorAll(selector) {
          if (selector === "img[src]") {
            return [image, smallImage];
          }
          return [];
        },
        title: "Example post",
      },
    });

    expect(hooks.collectPageMediaCandidates()).toMatchObject({
      success: true,
      pageUrl: "https://www.example.com/post/1",
      pageTitle: "Example post",
      videos: [],
      images: [
        {
          mediaType: "image",
          url: "https://cdn.example.com/media/photo.jpg",
          previewUrl: "https://cdn.example.com/media/photo.jpg",
          title: "Hero photo",
          source: "img_element",
          width: 1280,
          height: 720,
        },
      ],
    });
  });

  it("caps popup media scan results to a bounded total", () => {
    const images = Array.from({ length: 120 }, (_, index) => ({
      currentSrc: `https://cdn.example.com/media/photo-${index}.jpg`,
      src: `https://cdn.example.com/media/photo-${index}.jpg`,
      naturalWidth: 320,
      naturalHeight: 180,
      getAttribute() {
        return null;
      },
      getBoundingClientRect() {
        return { width: 320, height: 180 };
      },
    }));
    const { hooks } = loadDetectorHooks("https://www.example.com/gallery", {
      document: {
        addEventListener() {},
        querySelector() {
          return null;
        },
        querySelectorAll(selector) {
          if (selector === "img[src]") {
            return images;
          }
          return [];
        },
        title: "Example gallery",
      },
    });

    const result = hooks.collectPageMediaCandidates();
    expect(result.images).toHaveLength(100);
    expect(result.videos).toHaveLength(0);
    expect(result.truncated).toBe(true);
  });
});
