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
  class TestAudioElement {}
  class TestVideoElement {}
  const window = {
    location: {
      href: parsedCurrentUrl.toString(),
      pathname: parsedCurrentUrl.pathname,
    },
    innerWidth: 1440,
    innerHeight: 900,
    HTMLAudioElement: TestAudioElement,
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
    HTMLAudioElement: TestAudioElement,
    HTMLVideoElement: TestVideoElement,
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
    TestAudioElement,
    TestVideoElement,
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

  it("adds nearby title and cover metadata to popup video candidates", () => {
    const cover = {
      currentSrc: "https://cdn.example.com/covers/card.jpg",
      src: "https://cdn.example.com/covers/card.jpg",
      naturalWidth: 640,
      naturalHeight: 360,
      getAttribute(name) {
        return name === "alt" ? "Card cover title" : null;
      },
    };
    const heading = {
      getAttribute() {
        return null;
      },
      textContent: "Local video title",
    };
    const card = {
      getAttribute() {
        return null;
      },
      querySelector(selector) {
        if (selector.includes("h1")) {
          return heading;
        }
        if (selector.includes("img")) {
          return cover;
        }
        return null;
      },
    };
    const { hooks, TestVideoElement } = loadDetectorHooks("https://www.example.com/post/2", {
      document: {
        addEventListener() {},
        querySelector() {
          return null;
        },
        querySelectorAll(selector) {
          if (selector === "video") {
            return [video];
          }
          return [];
        },
        title: "Page title",
      },
    });
    const video = Object.assign(new TestVideoElement(), {
      currentSrc: "https://cdn.example.com/videos/post.mp4",
      src: "https://cdn.example.com/videos/post.mp4",
      videoWidth: 1920,
      videoHeight: 1080,
      parentElement: card,
      getAttribute() {
        return null;
      },
      closest() {
        return card;
      },
      querySelectorAll() {
        return [];
      },
      getBoundingClientRect() {
        return { width: 640, height: 360 };
      },
    });

    const result = hooks.collectPageMediaCandidates();

    expect(result.videos).toHaveLength(1);
    expect(result.videos[0]).toMatchObject({
      mediaType: "video",
      url: "https://cdn.example.com/videos/post.mp4",
      title: "Local video title",
      previewUrl: "https://cdn.example.com/covers/card.jpg",
      width: 1920,
      height: 1080,
    });
  });

  it("uses open graph metadata for popup video candidates when element metadata is missing", () => {
    const { hooks, TestVideoElement } = loadDetectorHooks("https://www.example.com/post/3", {
      document: {
        addEventListener() {},
        querySelector(selector) {
          if (selector === 'meta[property="og:title"]') {
            return {
              getAttribute(name) {
                return name === "content" ? "Open graph title" : null;
              },
            };
          }
          if (selector === 'meta[property="og:image"]') {
            return {
              getAttribute(name) {
                return name === "content" ? "https://cdn.example.com/covers/og.jpg" : null;
              },
            };
          }
          return null;
        },
        querySelectorAll(selector) {
          if (selector === "video") {
            return [video];
          }
          return [];
        },
        title: "Page title",
      },
    });
    const video = Object.assign(new TestVideoElement(), {
      currentSrc: "https://cdn.example.com/videos/og.mp4",
      src: "https://cdn.example.com/videos/og.mp4",
      videoWidth: 0,
      videoHeight: 0,
      parentElement: null,
      getAttribute() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      getBoundingClientRect() {
        return { width: 640, height: 360 };
      },
    });

    const result = hooks.collectPageMediaCandidates();

    expect(result.videos[0]).toMatchObject({
      title: "Open graph title",
      previewUrl: "https://cdn.example.com/covers/og.jpg",
    });
  });

  it("adds page title and cover metadata to direct video links", () => {
    const link = {
      getAttribute(name) {
        return name === "href" ? "https://cdn.example.com/videos/direct.mp4" : null;
      },
      textContent: "",
    };
    const { hooks } = loadDetectorHooks("https://www.example.com/post/4", {
      document: {
        addEventListener() {},
        querySelector(selector) {
          if (selector === 'meta[property="og:title"]') {
            return {
              getAttribute(name) {
                return name === "content" ? "Direct video post" : null;
              },
            };
          }
          if (selector === 'meta[property="og:image"]') {
            return {
              getAttribute(name) {
                return name === "content" ? "https://cdn.example.com/covers/direct.jpg" : null;
              },
            };
          }
          return null;
        },
        querySelectorAll(selector) {
          if (selector === "a[href]") {
            return [link];
          }
          return [];
        },
        title: "Page title",
      },
    });

    const result = hooks.collectPageMediaCandidates();

    expect(result.videos[0]).toMatchObject({
      mediaType: "video",
      source: "direct_link",
      title: "Direct video post",
      previewUrl: "https://cdn.example.com/covers/direct.jpg",
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

  it("collects audio candidates and filters short sounds and stream fragments", () => {
    let audio = null;
    let shortAudio = null;
    let link = null;
    let fragment = null;
    const { hooks, TestAudioElement } = loadDetectorHooks("https://www.example.com/audio", {
      document: {
        addEventListener() {},
        querySelector() {
          return null;
        },
        querySelectorAll(selector) {
          if (selector === "audio") {
            return [audio, shortAudio];
          }
          if (selector === "a[href]") {
            return [link, fragment];
          }
          return [];
        },
        title: "Audio page",
      },
    });
    audio = Object.assign(new TestAudioElement(), {
      currentSrc: "https://cdn.example.com/media/song.mp3",
      src: "https://cdn.example.com/media/song.mp3",
      duration: 180,
      getAttribute(name) {
        return name === "title" ? "Theme song" : null;
      },
      querySelectorAll() {
        return [];
      },
    });
    shortAudio = Object.assign(new TestAudioElement(), {
      currentSrc: "https://cdn.example.com/media/click.mp3",
      src: "https://cdn.example.com/media/click.mp3",
      duration: 1,
      getAttribute() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    });
    link = {
      getAttribute(name) {
        return name === "href" ? "https://cdn.example.com/media/podcast.m4a" : null;
      },
      textContent: "Podcast",
    };
    fragment = {
      getAttribute(name) {
        return name === "href" ? "https://cdn.example.com/media/segment.m4s" : null;
      },
      textContent: "Fragment",
    };
    const result = hooks.collectPageMediaCandidates();

    expect(result.audios).toHaveLength(2);
    expect(result.audios.map((candidate) => candidate.url)).toEqual([
      "https://cdn.example.com/media/song.mp3",
      "https://cdn.example.com/media/podcast.m4a",
    ]);
    expect(result.audios[0]).toMatchObject({
      mediaType: "audio",
      source: "audio_element",
      title: "Theme song",
      duration: 180,
    });
  });
});
