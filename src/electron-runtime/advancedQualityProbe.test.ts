import { describe, expect, it } from "vitest";
import { extractAdvancedQualityOptionsFromYtDlpJson } from "./advancedQualityProbe.js";

describe("advanced quality probe option extraction", () => {
  it("builds AE-friendly selectors before broad height fallbacks", () => {
    const result = extractAdvancedQualityOptionsFromYtDlpJson({
      title: "A very good video",
      formats: [
        { height: 1080, vcodec: "hev1.1.6.L120.90", ext: "flv" },
        { height: 720, vcodec: "avc1.640028", ext: "mp4" },
        { height: 1080, vcodec: "avc1.640028", ext: "mp4" },
        { vcodec: "none", acodec: "mp4a.40.2", ext: "m4a" },
      ],
    });

    expect(result.videoTitle).toBe("A very good video");
    expect(result.options.map((option) => option.label)).toEqual(["1080p", "720p"]);
    expect(result.options[0]?.postProcessPlan).toBe("none");
    expect(result.options[0]?.selector).toBe([
      "bv*[height=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
      "bv*[height=1080][ext=mp4]+ba[ext=m4a]/",
      "b[height=1080][vcodec^=avc1][ext=mp4]/",
      "b[height=1080][ext=mp4]/",
      "best[height=1080][ext=mp4]/",
      "bv*[height=1080]+ba/",
      "b[height=1080]/",
      "best[height=1080]",
    ].join(""));
  });

  it("marks remux-only when the first matching height branch has one clear remux plan", () => {
    const result = extractAdvancedQualityOptionsFromYtDlpJson({
      formats: [
        { height: 480, vcodec: "avc1.64001f", acodec: "mp4a.40.2", ext: "webm" },
      ],
    });

    expect(result.options).toMatchObject([
      {
        label: "480p",
        postProcessPlan: "remux_only",
      },
    ]);
  });

  it("marks full transcode when the first matching height branch has one clear non-h264 plan", () => {
    const result = extractAdvancedQualityOptionsFromYtDlpJson({
      formats: [
        { height: 720, vcodec: "vp9", acodec: "opus", ext: "webm" },
      ],
    });

    expect(result.options).toMatchObject([
      {
        label: "720p",
        postProcessPlan: "full_transcode",
      },
    ]);
  });

  it("uses unknown when a height has mixed possible fallback outcomes", () => {
    const result = extractAdvancedQualityOptionsFromYtDlpJson({
      formats: [
        { height: 720, vcodec: "vp9", acodec: "opus", ext: "webm" },
        { height: 720, vcodec: "avc1.64001f", acodec: "mp4a.40.2", ext: "webm" },
      ],
    });

    expect(result.options).toMatchObject([
      {
        label: "720p",
        postProcessPlan: "unknown",
      },
    ]);
  });

  it("omits empty video titles", () => {
    const result = extractAdvancedQualityOptionsFromYtDlpJson({
      title: " ",
      formats: [
        { height: 360, vcodec: "avc1.64001e", acodec: "mp4a.40.2", ext: "mp4" },
      ],
    });

    expect(result.videoTitle).toBeUndefined();
  });
});
