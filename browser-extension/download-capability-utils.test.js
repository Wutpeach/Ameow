import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const selectionUtilsPath = path.resolve("browser-extension/generic-video-selection-utils.js");
const capabilityUtilsPath = path.resolve("browser-extension/download-capability-utils.js");
const selectionUtilsSource = readFileSync(selectionUtilsPath, "utf8");
const capabilityUtilsSource = readFileSync(capabilityUtilsPath, "utf8");

const loadHelper = () => {
  const context = {
    self: {},
    globalThis: {},
    URL,
  };
  vm.runInNewContext(selectionUtilsSource, context, { filename: selectionUtilsPath });
  vm.runInNewContext(capabilityUtilsSource, context, { filename: capabilityUtilsPath });
  return context.self.AmeowDownloadCapabilityUtils;
};

describe("download capability utils", () => {
  it("allows direct browser-downloadable image, audio, and video resources", () => {
    const helper = loadHelper();

    expect(helper.resolveDownloadCapability({ url: "https://cdn.example.com/image.svg", mediaType: "image" })).toMatchObject({
      browserDownloadable: true,
      requiresDesktop: false,
    });
    expect(helper.resolveDownloadCapability({ url: "https://cdn.example.com/song.mp3", mediaType: "audio" })).toMatchObject({
      browserDownloadable: true,
      requiresDesktop: false,
    });
    expect(helper.resolveDownloadCapability({ url: "https://cdn.example.com/video.mp4", mediaType: "video" })).toMatchObject({
      browserDownloadable: true,
      requiresDesktop: false,
    });
    expect(helper.resolveDownloadCapability({
      url: "https://i.pinimg.com/originals/34/e4/e6/34e4e656c3025df4c8dd98817a5d0e19.jpg",
      mediaType: "image",
    })).toMatchObject({
      browserDownloadable: true,
      requiresDesktop: false,
    });
    expect(helper.resolveDownloadCapability({
      url: "https://v1.pinimg.com/videos/iht/720p/f1/84/f5/f184f5f60381938333397bb7adbd7703.mp4",
      mediaType: "video",
    })).toMatchObject({
      browserDownloadable: true,
      requiresDesktop: false,
    });
  });

  it("classifies direct URLs with query strings and fragments by pathname extension", () => {
    const helper = loadHelper();

    expect(helper.resolveDownloadCapability({
      url: "https://cdn.example.com/video.webm?token=abc#preview",
      mediaType: "video",
    })).toMatchObject({
      browserDownloadable: true,
      requiresDesktop: false,
    });
  });

  it("allows extensionless browser-renderable media when content type proves direct media", () => {
    const helper = loadHelper();

    expect(helper.resolveDownloadCapability({
      url: "https://cdn.example.com/media/video?id=abc",
      mediaType: "video",
      contentType: "video/mp4; charset=binary",
    })).toMatchObject({
      browserDownloadable: true,
      requiresDesktop: false,
    });
    expect(helper.resolveDownloadCapability({
      url: "https://cdn.example.com/media/audio?id=abc",
      mediaType: "audio",
      mimeType: "audio/mpeg",
    })).toMatchObject({
      browserDownloadable: true,
      requiresDesktop: false,
    });
  });

  it("allows ordinary document and archive direct file resources", () => {
    const helper = loadHelper();

    expect(helper.resolveDownloadCapability({
      url: "https://cdn.example.com/files/manual.pdf?download=1",
      mediaType: "file",
    })).toMatchObject({
      browserDownloadable: true,
      requiresDesktop: false,
    });
    expect(helper.resolveDownloadCapability({
      url: "https://cdn.example.com/files/archive.zip",
      mediaType: "file",
    })).toMatchObject({
      browserDownloadable: true,
      requiresDesktop: false,
    });
  });

  it("requires desktop for invalid, data, blob, no-extension, and segmented resources", () => {
    const helper = loadHelper();

    [
      null,
      "",
      "data:image/png;base64,abc",
      "blob:https://example.com/123",
      "https://cdn.example.com/watch",
      "https://cdn.example.com/master.m3u8",
      "https://cdn.example.com/chunk.m4s",
      "https://cdn.example.com/movie.mov",
    ].forEach((url) => {
      expect(helper.resolveDownloadCapability({ url, mediaType: "video" })).toMatchObject({
        browserDownloadable: false,
        requiresDesktop: true,
      });
    });
  });

  it("keeps manifests, fragments, blob, and data URLs desktop-required even with media metadata", () => {
    const helper = loadHelper();

    [
      { url: "https://cdn.example.com/live", mediaType: "video", contentType: "application/vnd.apple.mpegurl" },
      { url: "https://cdn.example.com/manifest", mediaType: "video", mimeType: "application/dash+xml" },
      { url: "https://cdn.example.com/chunk", mediaType: "video", contentType: "video/mp2t" },
      { url: "blob:https://example.com/123", mediaType: "video", contentType: "video/mp4" },
      { url: "data:video/mp4;base64,abc", mediaType: "video", contentType: "video/mp4" },
    ].forEach((candidate) => {
      expect(helper.resolveDownloadCapability(candidate)).toMatchObject({
        browserDownloadable: false,
        requiresDesktop: true,
      });
    });
  });

  it("rejects Bilibili m4s fragments for browser fallback even when marked", () => {
    const helper = loadHelper();
    const candidate = {
      url: "https://xy123x456x789xy.mcdn.bilivideo.cn/upgcxcode/example/index.m4s",
      pageUrl: "https://www.bilibili.com/video/BV1xfJ36cERC/",
      mediaType: "video",
      contentType: "video/mp4",
      browserFallbackEligible: true,
    };

    expect(helper.resolveDownloadCapability(candidate)).toMatchObject({
      browserDownloadable: false,
      requiresDesktop: true,
      desktopReason: "m4s_resource",
    });
    expect(helper.canUseBrowserFallback(candidate)).toBe(false);
  });

  it("does not allow generic browser fallback for unmarked fragments", () => {
    const helper = loadHelper();

    expect(helper.canUseBrowserFallback({
      url: "https://cdn.example.com/chunk.m4s",
      pageUrl: "https://www.example.com/watch/1",
      mediaType: "video",
      contentType: "video/mp4",
    })).toBe(false);
  });

  it("lets candidate metadata override a direct-looking URL", () => {
    const helper = loadHelper();

    expect(helper.resolveDownloadCapability({
      url: "https://cdn.example.com/video.mp4",
      type: "manifest_m3u8",
      mediaType: "video",
    })).toMatchObject({
      browserDownloadable: false,
      requiresDesktop: true,
      desktopReason: "manifest_m3u8",
    });
  });
});
