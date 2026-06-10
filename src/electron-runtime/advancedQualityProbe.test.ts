import { describe, expect, it } from "vitest";
import { extractAdvancedQualityOptionsFromYtDlpJson } from "./advancedQualityProbe.js";

describe("advanced quality probe option extraction", () => {
  it("builds AE-friendly selectors before broad height fallbacks", () => {
    const result = extractAdvancedQualityOptionsFromYtDlpJson({
      formats: [
        { height: 1080, vcodec: "hev1.1.6.L120.90", ext: "flv" },
        { height: 720, vcodec: "avc1.640028", ext: "mp4" },
        { height: 1080, vcodec: "avc1.640028", ext: "mp4" },
        { height: 1080, vcodec: "none", ext: "m4a" },
      ],
    });

    expect(result.options.map((option) => option.label)).toEqual(["1080p", "720p"]);
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
});
